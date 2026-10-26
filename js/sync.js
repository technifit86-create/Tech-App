/**
 * sync.js — Module de synchronisation Google Sheets via Apps Script
 * Gère l'envoi des interventions complétées et la récupération des interventions disponibles.
 */

const JHT_SYNC = (() => {

  // ─── Synchronisation vers Google Sheets ────────────────────────────────────

  /**
   * Envoie une intervention vers Google Sheets via l'URL Apps Script.
   * @param {Object} intervention - L'intervention à synchroniser
   * @returns {Promise<{success: boolean, message: string}>}
   */
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
        // Apps Script nécessite text/plain pour éviter CORS preflight
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result.status === 'success') {
        await window.JHT_DB.markSynced(intervention.id);
        return { success: true, message: 'Synchronisé avec succès' };
      } else {
        return { success: false, message: result.message || 'Erreur Apps Script' };
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

  /**
   * Récupère les interventions disponibles depuis Google Sheets.
   * Ces interventions sont ensuite sauvegardées localement en IndexedDB.
   * @returns {Promise<{success: boolean, count: number, message: string}>}
   */
  async function fetchInterventions() {
    const appsScriptUrl = await window.JHT_DB.getConfig('appsScriptUrl');
    const technicien = await window.JHT_DB.getConfig('technicien');

    if (!appsScriptUrl) {
      return { success: false, count: 0, message: 'URL Apps Script non configurée' };
    }

    try {
      // Construire l'URL avec paramètres de requête
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

      if (result.status === 'success' && Array.isArray(result.data)) {
        let savedCount = 0;

        for (const item of result.data) {
          // Vérifier si l'intervention existe déjà localement
          const existing = await window.JHT_DB.getIntervention(item.id);

          if (!existing) {
            // Nouvelle intervention : sauvegarder
            await window.JHT_DB.saveIntervention({
              ...item,
              synced: true, // Elle vient de Sheets, donc "synced" dans le sens inverse
              status: item.status || 'In Process',
              pieces: typeof item.pieces === 'string'
                ? JSON.parse(item.pieces || '[]')
                : (item.pieces || [])
            });
            savedCount++;
          } else if (existing.synced && existing.status === 'In Process') {
            // Mise à jour d'une intervention non modifiée localement
            await window.JHT_DB.saveIntervention({
              ...existing,
              ...item,
              synced: true,
              pieces: typeof item.pieces === 'string'
                ? JSON.parse(item.pieces || '[]')
                : (item.pieces || existing.pieces || [])
            });
            savedCount++;
          }
          // Si l'intervention a été modifiée localement (synced: false), on ne l'écrase pas
        }

        return {
          success: true,
          count: savedCount,
          message: `${savedCount} intervention(s) mise(s) à jour`
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

  // ─── Sync automatique des en attente ───────────────────────────────────────

  /**
   * Récupère toutes les interventions non synchronisées et les envoie.
   * Appelée au démarrage et lors du retour du réseau.
   * @returns {Promise<{sent: number, failed: number, errors: string[]}>}
   */
  async function pendingSync() {
    const pending = await window.JHT_DB.getPendingInterventions();
    const results = { sent: 0, failed: 0, errors: [] };

    if (pending.length === 0) {
      console.log('[SYNC] Aucune intervention en attente de sync');
      return results;
    }

    console.log(`[SYNC] ${pending.length} intervention(s) en attente de sync`);

    for (const intervention of pending) {
      const result = await syncToSheets(intervention);
      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push(`${intervention.caseNo}: ${result.message}`);
        if (result.offline) {
          // Pas de réseau, inutile de continuer
          break;
        }
      }
    }

    console.log(`[SYNC] Terminé : ${results.sent} envoyées, ${results.failed} échouées`);
    return results;
  }

  // ─── Export ─────────────────────────────────────────────────────────────────
  return {
    syncToSheets,
    fetchInterventions,
    pendingSync
  };

})();

// Écouter les messages du Service Worker pour déclencher la sync
navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TRIGGER_SYNC') {
    console.log('[SYNC] Sync déclenchée par le Service Worker');
    JHT_SYNC.pendingSync().then((results) => {
      // Notifier l'app du résultat
      window.dispatchEvent(new CustomEvent('sync-complete', { detail: results }));
    });
  }
});
