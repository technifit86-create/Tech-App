/**
 * sync.js — Module de synchronisation Google Sheets via Apps Script
 * Gère l'envoi des interventions complétées et la récupération des interventions disponibles.
 */

const JHT_SYNC = (() => {

  // ─── Synchronisation vers Google Sheets ────────────────────────────────────

  async function syncToSheets(intervention) {
    const appsScriptUrl = await window.JHT_DB.getConfig('appsScriptUrl');

    if (!appsScriptUrl) {
      return { success: false, message: 'URL Apps Script non configurée' };
    }

    try {
      const payload = {
        action: 'saveIntervention',
        data: {
          id: intervention.id,
          activityId: intervention.activityId || '',
          regardingObjectId: intervention.regardingObjectId || '',
          caseNo: intervention.caseNo || '',
          incidentNo: intervention.incidentNo || '',
          clientName: intervention.clientName || '',
          clinique: intervention.clinique || '',
          productName: intervention.productName || '',
          serialNo: intervention.serialNo || '',
          defectReport: intervention.defectReport || '',
          status: intervention.status || '',
          dateDebut: intervention.dateDebut || '',
          heureDebut: intervention.heureDebut || '',
          dateFin: intervention.dateFin || '',
          heureFin: intervention.heureFin || '',
          ttrCode: intervention.ttrCode || '',
          travauxEffectues: intervention.travauxEffectues || '',
          technicien: intervention.technicien || '',
          pieces: JSON.stringify(intervention.pieces || []),
          createdAt: intervention.createdAt || '',
          updatedAt: intervention.updatedAt || ''
        }
      };

      const response = await fetch(appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.status === 'success' || result.success || result.updated || result.created) {
        await window.JHT_DB.markSynced(intervention.id);
        return { success: true, message: 'Synchronisé avec succès' };
      } else {
        return { success: false, message: result.message || result.error || 'Erreur Apps Script' };
      }

    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        return { success: false, message: 'Pas de connexion réseau', offline: true };
      }
      console.error('[SYNC] Erreur syncToSheets :', error);
      return { success: false, message: error.message };
    }
  }

  // ─── Récupération depuis Google Sheets ─────────────────────────────────────

  async function fetchInterventions() {
    const appsScriptUrl = await window.JHT_DB.getConfig('appsScriptUrl');
    const technicien = await window.JHT_DB.getConfig('technicien');

    if (!appsScriptUrl) {
      return { success: false, count: 0, message: 'URL Apps Script non configurée' };
    }

    try {
      const url = new URL(appsScriptUrl);
      url.searchParams.set('action', 'getInterventions');
      if (technicien) {
        url.searchParams.set('technicien', technicien);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const result = await response.json();
      const list = Array.isArray(result) ? result : (Array.isArray(result.data) ? result.data : []);

      if (list.length > 0 || Array.isArray(result) || result.status === 'success') {
        let savedCount = 0;

        for (const item of list) {
          const itemId = item.activityId || item.id || crypto.randomUUID();
          
          const normalized = {
            id: itemId,
            activityId: item.activityId || '',
            regardingObjectId: item.regardingObjectId || '',
            caseNo: item.caseNo || '',
            incidentNo: item.incidentNo || '',
            clientName: item.nomClient || item.clientName || '',
            clinique: item.clinique || '',
            productName: item.nomProduit || item.productName || '',
            serialNo: item.serieConsole || item.serialNo || '',
            defectReport: item.defautRapport || item.defectReport || '',
            status: item.status || (item.statutPortail === 'In Process' ? 'In Process' : 'Complete'),
            dateDebut: item.dateDebutCal || item.dateDebut || '',
            heureDebut: item.heureDebut || '',
            dateFin: item.dateFinCal || item.dateFin || '',
            heureFin: item.heureFin || '',
            ttrCode: item.ttrCode || '',
            travauxEffectues: item.travaux || item.travauxEffectues || '',
            technicien: item.technicien || '',
            synced: false, // On force à false pour que seuls les tickets actifs restent visibles
            pieces: typeof item.pieces === 'string'
              ? JSON.parse(item.pieces || '[]')
              : (item.pieces || [])
          };

          // Sauvegarde ou mise à jour directe de l'intervention fraîchement récupérée
          await window.JHT_DB.saveIntervention(normalized);
          savedCount++;
        }

        return {
          success: true,
          count: savedCount,
          message: `${savedCount} intervention(s) actualisée(s)`
        };
      } else {
        return { success: false, count: 0, message: result.message || 'Réponse inattendue' };
      }

    } catch (error) {
      if (error instanceof TypeError) {
        return { success: false, count: 0, message: 'Pas de connexion réseau', offline: true };
      }
      console.error('[SYNC] Erreur fetchInterventions :', error);
      return { success: false, count: 0, message: error.message };
    }
  }

  async function pendingSync() {
    const pending = await window.JHT_DB.getPendingInterventions();
    const results = { sent: 0, failed: 0, errors: [] };

    if (pending.length === 0) {
      return results;
    }

    for (const intervention of pending) {
      const result = await syncToSheets(intervention);
      if (result.success) {
        results.sent++;
        // Suppression automatique après sync réussie
        await window.JHT_DB.deleteIntervention(intervention.id);
      } else {
        results.failed++;
        results.errors.push(`${intervention.caseNo}: ${result.message}`);
        if (result.offline) break;
      }
    }

    return results;
  }

  return {
    syncToSheets,
    fetchInterventions,
    pendingSync
  };

})();

navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TRIGGER_SYNC') {
    JHT_SYNC.pendingSync().then((results) => {
      window.dispatchEvent(new CustomEvent('sync-complete', { detail: results }));
    });
  }
});
