/**
 * app.js — Application principale JHT Tech App
 * SPA (Single Page Application) avec 3 vues :
 *   0 - Configuration (premier lancement)
 *   1 - Liste des interventions
 *   2 - Détail / Formulaire d'une intervention
 */

// Fonction pour afficher/masquer dynamiquement le bloc TTR selon le statut
function toggleTtrVisibility() {
  const statusSelect = document.getElementById('detail-status');
  // Supposons que le conteneur du bloc TTR s'appelle 'ttr-container'
  const ttrContainer = document.getElementById('ttr-container'); 

  if (statusSelect && ttrContainer) {
    if (statusSelect.value === 'Further Action') {
      ttrContainer.style.display = 'block'; // Afficher si "Further Action"
    } else {
      ttrContainer.style.display = 'none';  // Masquer si "Scheduled" ou "Complete"
      // Optionnel : réinitialiser la valeur du TTR si masqué
      const ttrSelect = document.getElementById('detail-ttr');
      if (ttrSelect) ttrSelect.value = '';
    }
  }
}

// À appeler lors du chargement de la vue détail et lors du changement de statut :
document.getElementById('detail-status')?.addEventListener('change', toggleTtrVisibility);
// ─── TTR Deviation Codes ──────────────────────────────────────────────────────
const TTR_CODES = [
  'CU – Incorrect fault description',
  'EQ – Frame failure',
  'PT – Part(s) not stock in warehouse/service centre',
  'PT – Back order from factory',
  'DE – Diagnostic error',
  'PT – Carry wrong parts',
  'CU – Customer required fix again',
  'QA – Qulaity / design problem'
];

// ─── État global ──────────────────────────────────────────────────────────────
const AppState = {
  currentView: null,         // 'config' | 'list' | 'detail'
  currentIntervention: null, // Intervention en cours d'édition
  technicien: null,          // Identifiant technicien courant
  isOnline: navigator.onLine
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retourne la date du jour au format YYYY-MM-DD */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** Convertit une date YYYY-MM-DD en JJ-MM-AAAA */
function formatDateToJJMMYYYY(isoDateStr) {
  if (!isoDateStr) return '';
  if (isoDateStr.includes('-') && isoDateStr.split('-')[0].length === 4) {
    const parts = isoDateStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return isoDateStr;
}

/** Extrait le préfixe avant @ d'un email */
function extractTechnicien(email) {
  return email ? email.split('@')[0] : '';
}

/** Affiche un toast (notification courte) */
function showToast(message, type = 'info', duration = 3000) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/** Formate une date ISO en format lisible */
function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Navigation ───────────────────────────────────────────────────────────────

/** Affiche une vue et cache les autres */
function showView(viewName) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');
  AppState.currentView = viewName;
}

// ─── Vue 0 — Configuration ────────────────────────────────────────────────────

async function initConfigView() {
  showView('config');

  const savedEmail = await JHT_DB.getConfig('email');
  const savedUrl = await JHT_DB.getConfig('appsScriptUrl');

  if (savedEmail) {
    document.getElementById('config-email').value = savedEmail;
  }
  if (savedUrl) {
    document.getElementById('config-url').value = savedUrl;
  }
}

async function saveConfig() {
  const email = document.getElementById('config-email').value.trim();
  const url = document.getElementById('config-url').value.trim();

  if (!email || !email.includes('@')) {
    showToast('Veuillez saisir un email valide', 'error');
    return;
  }

  if (!url) {
    showToast('Veuillez saisir l\'URL Apps Script', 'error');
    return;
  }

  const technicien = extractTechnicien(email);

  await JHT_DB.saveConfig('email', email);
  await JHT_DB.saveConfig('technicien', technicien);
  await JHT_DB.saveConfig('appsScriptUrl', url);

  AppState.technicien = technicien;
  updateHeader();

  showToast(`Configuration sauvegardée — Bonjour ${technicien} !`, 'success');
  await initListView();
}

// ─── Vue 1 — Liste des interventions ─────────────────────────────────────────

async function initListView() {
  showView('list');
  await renderInterventionList();
}

async function renderInterventionList() {
  const listContainer = document.getElementById('intervention-list');
  const emptyState = document.getElementById('list-empty');
  listContainer.innerHTML = '<div class="loading-indicator">Chargement…</div>';

  try {
    const interventions = await JHT_DB.getAllInterventions();

    if (interventions.length === 0) {
      listContainer.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    listContainer.innerHTML = '';

    interventions.forEach((interv) => {
      const card = createInterventionCard(interv);
      listContainer.appendChild(card);
    });
  } catch (error) {
    listContainer.innerHTML = '<div class="error-message">Erreur de chargement</div>';
    console.error('[APP] Erreur renderInterventionList :', error);
  }
}

/** Crée un élément card pour une intervention */
function createInterventionCard(interv) {
  const card = document.createElement('div');
  card.className = 'intervention-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');

  const syncIcon = interv.synced ? '✅' : '⏳';
  const statusClass = interv.status === 'Complete' ? 'status--complete'
    : interv.status === 'Further Action' ? 'status--further'
    : interv.status === 'Scheduled' ? 'status--scheduled'
    : 'status--inprocess';

  const dateStr = interv.dateDebut ? formatDate(interv.dateDebut) : formatDate(interv.createdAt);

  card.innerHTML = `
    <div class="card-header">
      <span class="card-client">${escapeHtml(interv.clientName || interv.nomClient || 'Client inconnu')}</span>
      <span class="sync-indicator" title="${interv.synced ? 'Synchronisé' : 'En attente de sync'}">${syncIcon}</span>
    </div>
    <div class="card-body">
      <div class="card-row">
        <span class="card-label">Numéro d'Incident</span>
        <span class="card-value">${escapeHtml(interv.incidentNo || '—')}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Produit</span>
        <span class="card-value">${escapeHtml(interv.productName || interv.nomProduit || '—')}</span>
      </div>
      <div class="card-row">
        <span class="card-label">Date</span>
        <span class="card-value">${dateStr}</span>
      </div>
    </div>
    <div class="card-footer">
      <span class="status-badge ${statusClass}">${escapeHtml(interv.status || 'In Process')}</span>
      <span class="card-arrow">›</span>
    </div>
  `;

  card.addEventListener('click', () => openInterventionDetail(interv.id));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') openInterventionDetail(interv.id);
  });

  return card;
}

/** Échapper le HTML pour éviter les XSS */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Purge le stockage local et réactualise proprement depuis Google Sheets */
async function refreshFromSheets() {
  const btn = document.getElementById('btn-refresh');
  btn.disabled = true;
  btn.textContent = '⏳ Nettoyage & Sync…';

  try {
    if (!AppState.technicien) {
      AppState.technicien = await JHT_DB.getConfig('technicien');
    }

    // 1. Purger toutes les interventions stockées localement en IndexedDB
    const allLocal = await JHT_DB.getAllInterventions();
    for (const interv of allLocal) {
      await JHT_DB.deleteIntervention(interv.id);
    }

    // 2. Télécharger uniquement la liste fraîche filtrée depuis Google Sheets
    const result = await JHT_SYNC.fetchInterventions(AppState.technicien);
    if (result.success) {
      showToast('Liste réinitialisée et à jour !', 'success');
      await renderInterventionList();
    } else if (result.offline) {
      showToast('Pas de connexion réseau', 'warning');
    } else {
      showToast(result.message, 'error');
    }
  } catch (err) {
    showToast('Erreur lors de l\'actualisation', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Actualiser';
  }
}

// ─── Vue 2 — Détail / Formulaire ──────────────────────────────────────────────

async function openInterventionDetail(id) {
  const intervention = await JHT_DB.getIntervention(id);
  if (!intervention) {
    showToast('Intervention introuvable', 'error');
    return;
  }
  AppState.currentIntervention = intervention;
  await renderDetailView(intervention);
  showView('detail');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Ouvre un formulaire vide pour créer une nouvelle intervention */
async function openNewIntervention() {
  AppState.currentIntervention = {
    id: null,
    status: 'Scheduled',
    dateDebut: todayISO(),
    heureDebut: '',
    heureFin: '',
    pieces: [],
    attachments: [],
    synced: false
  };
  await renderDetailView(AppState.currentIntervention);
  showView('detail');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function renderDetailView(interv) {
  document.getElementById('detail-client').textContent = interv.clientName || interv.nomClient || '—';
  document.getElementById('detail-case-no').textContent = interv.caseNo || '—';
  document.getElementById('detail-incident-no').textContent = interv.incidentNo || '—';
  document.getElementById('detail-product').textContent = interv.productName || interv.nomProduit || '—';
  document.getElementById('detail-serial').textContent = interv.serialNo || interv.serieConsole || '—';
  document.getElementById('detail-defect').textContent = interv.defectReport || interv.defautRapport || '—';

  const statusSelect = document.getElementById('detail-status');
  statusSelect.value = interv.status ? interv.status : 'Scheduled';

  let dateVal = interv.dateDebut || todayISO();
  if (dateVal.includes('-') && dateVal.split('-')[0].length === 2) {
    const parts = dateVal.split('-');
    dateVal = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  document.getElementById('detail-date-debut').value = dateVal;
  document.getElementById('detail-heure-debut').value = interv.heureDebut || '';
  
  const heureFinEl = document.getElementById('detail-heure-fin');
  if (heureFinEl) {
    heureFinEl.value = interv.heureFin || '';
  }

  const ttrSelect = document.getElementById('detail-ttr');
  ttrSelect.innerHTML = '<option value="">— Sélectionner —</option>';
  TTR_CODES.forEach((code) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = code;
    if (interv.ttrCode === code) opt.selected = true;
    ttrSelect.appendChild(opt);
  });

  renderPiecesSection(interv.pieces || []);
  document.getElementById('detail-travaux').value = interv.travauxEffectues || interv.travaux || '';
  setupFileAttachmentHandler(interv);
  updateSyncIndicator(interv.synced);
  
  // Initialisation dynamique du bouton de sauvegarde et des horloges
  setupFormValidationAndClock();
}

/** Gère la sélection de photos depuis la bibliothèque du téléphone */
function setupFileAttachmentHandler(interv) {
  const fileInput = document.getElementById('file-input');
  const previewContainer = document.getElementById('attachments-preview');
  
  if (!interv.attachments) interv.attachments = [];

  renderPreviews();

  fileInput.onchange = (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        interv.attachments.push({
          name: file.name,
          data: uploadEvent.target.result
        });
        renderPreviews();
      };
      reader.readAsDataURL(file);
    });
  };

  function renderPreviews() {
    previewContainer.innerHTML = '';
    interv.attachments.forEach((att, idx) => {
      const thumb = document.createElement('div');
      thumb.style.cssText = 'position: relative; width: 70px; height: 70px; border: 1px solid #ccc; border-radius: 4px; overflow: hidden;';
      thumb.innerHTML = `
        <img src="${att.data}" style="width: 100%; height: 100%; object-fit: cover;" alt="Photo" />
        <button type="button" data-index="${idx}" style="position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 10px; cursor: pointer;">×</button>
      `;
      thumb.querySelector('button').onclick = () => {
        interv.attachments.splice(idx, 1);
        renderPreviews();
      };
      previewContainer.appendChild(thumb);
    });
  }
}

/** Affiche la section des pièces */
function renderPiecesSection(pieces) {
  const container = document.getElementById('pieces-container');

  if (!pieces || pieces.length === 0) {
    container.innerHTML = '<p class="no-pieces">Aucune pièce associée à cette intervention</p>';
    return;
  }

  container.innerHTML = '';
  pieces.forEach((piece, index) => {
    const row = document.createElement('div');
    row.className = 'piece-row';
    row.innerHTML = `
      <div class="piece-info">
        <span class="piece-ref">${escapeHtml(piece.ref || '')}</span>
        <span class="piece-desc">${escapeHtml(piece.description || '')}</span>
        <span class="piece-shipped">Expédiée : ${piece.qtyShipped || 0}</span>
      </div>
      <div class="piece-qty">
        <label for="piece-qty-${index}">Qté utilisée</label>
        <input
          type="number"
          id="piece-qty-${index}"
          class="piece-qty-input"
          min="0"
          max="${piece.qtyShipped || 99}"
          value="${piece.qtyUsed ?? 0}"
          data-piece-index="${index}"
          aria-label="Quantité utilisée pour ${escapeHtml(piece.ref || 'pièce')}"
        />
      </div>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('.piece-qty-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.pieceIndex, 10);
      if (AppState.currentIntervention && AppState.currentIntervention.pieces[idx]) {
        AppState.currentIntervention.pieces[idx].qtyUsed = parseInt(e.target.value, 10) || 0;
      }
    });
  });
}

/** Met à jour l'indicateur de statut sync */
function updateSyncIndicator(isSynced) {
  const indicator = document.getElementById('sync-status');
  if (isSynced) {
    indicator.textContent = '✅ Synchronisé avec Google Sheets';
    indicator.className = 'sync-status sync-status--synced';
  } else {
    indicator.textContent = '⏳ Enregistré localement — en attente de sync';
    indicator.className = 'sync-status sync-status--pending';
  }
}

// ─── Déverrouillage dynamique et horloges instantanées ───────────────────────

function setupFormValidationAndClock() {
  const saveBtn = document.getElementById('btn-save');
  
  // Fonction globale pour valider si tous les champs essentiels sont remplis
  function validateForm() {
    if (!saveBtn) return;

    const statusVal = document.getElementById('detail-status')?.value;
    const dateVal = document.getElementById('detail-date-debut')?.value;
    const heureDebutVal = document.getElementById('detail-heure-debut')?.value;
    const heureFinVal = document.getElementById('detail-heure-fin')?.value;
    const ttrVal = document.getElementById('detail-ttr')?.value;
    const travauxVal = document.getElementById('detail-travaux')?.value;

    // Condition pour considérer le formulaire complet
    const allFilled = Boolean(
      statusVal && statusVal.trim() !== '' &&
      dateVal && dateVal.trim() !== '' &&
      heureDebutVal && heureDebutVal.trim() !== '' &&
      heureFinVal && heureFinVal.trim() !== '' &&
      ttrVal && ttrVal.trim() !== '' &&
      travauxVal && travauxVal.trim() !== ''
    );

    if (allFilled) {
      saveBtn.removeAttribute('disabled');
      saveBtn.style.opacity = '1';
      saveBtn.style.cursor = 'pointer';
    } else {
      saveBtn.setAttribute('disabled', 'true');
      saveBtn.style.opacity = '0.4';
      saveBtn.style.cursor = 'not-allowed';
    }
  }

  // Écouter les modifications sur tous les champs de la vue détail
  const formElements = document.querySelectorAll('#view-detail input, #view-detail select, #view-detail textarea');
  formElements.forEach(el => {
    el.addEventListener('input', validateForm);
    el.addEventListener('change', validateForm);
  });

  // Gestion du remplissage automatique de l'heure actuelle au clic sur les icônes d'horloge ou les champs
  const timeInputs = document.querySelectorAll('#detail-heure-debut, #detail-heure-fin');
  timeInputs.forEach(input => {
    const parentContainer = input.parentElement;

    const setNowTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      
      input.value = `${hours}:${minutes}`;

      // Déclencher les événements pour que l'app prenne en compte la modification
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      validateForm();
    };

    // Si on clique sur le conteneur englobant (visant l'icône d'horloge à droite)
    if (parentContainer) {
      parentContainer.addEventListener('click', (e) => {
        if (e.target !== input) {
          setNowTime();
        }
      });
    }

    // Double-clic direct sur le champ d'heure comme raccourci
    input.addEventListener('dblclick', setNowTime);
  });

  // Vérification initiale dès l'ouverture de la vue détail
  validateForm();
}

// ─── Sauvegarde et sync ────────────────────────────────────────────────────────

async function saveAndSync() {
  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = '⏳ Enregistrement…';

  try {
    const interv = AppState.currentIntervention;
    if (!interv) {
      showToast('Aucune intervention en cours', 'error');
      return;
    }

    interv.status = document.getElementById('detail-status').value;
    
    const rawDate = document.getElementById('detail-date-debut').value;
    interv.dateDebut = formatDateToJJMMYYYY(rawDate);
    
    interv.heureDebut = document.getElementById('detail-heure-debut').value;
    
    const heureFinEl = document.getElementById('detail-heure-fin');
    if (heureFinEl) {
      interv.heureFin = heureFinEl.value;
    }
    
    interv.ttrCode = document.getElementById('detail-ttr').value;
    interv.travauxEffectues = document.getElementById('detail-travaux').value;
    interv.synced = false;

    if (!interv.technicien) {
      interv.technicien = AppState.technicien || await JHT_DB.getConfig('technicien');
    }

    document.querySelectorAll('.piece-qty-input').forEach((input) => {
      const idx = parseInt(input.dataset.pieceIndex, 10);
      if (interv.pieces && interv.pieces[idx]) {
        interv.pieces[idx].qtyUsed = parseInt(input.value, 10) || 0;
      }
    });

    const id = await JHT_DB.saveIntervention(interv);
    AppState.currentIntervention.id = id;

    showToast('Enregistré localement', 'info', 1500);
    updateSyncIndicator(false);

    if (AppState.isOnline) {
      btn.textContent = '📡 Synchronisation…';
      const syncResult = await JHT_SYNC.syncToSheets(AppState.currentIntervention);

      if (syncResult.success) {
        AppState.currentIntervention.synced = true;
        updateSyncIndicator(true);
        showToast('Synchronisé avec Google Sheets !', 'success');

        // Suppression immédiate de la base locale
        await JHT_DB.deleteIntervention(AppState.currentIntervention.id);

        setTimeout(() => {
          initListView();
        }, 1000);

      } else if (syncResult.offline) {
        showToast('Hors ligne — sera synchronisé au retour du réseau', 'warning');
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          const sw = await navigator.serviceWorker.ready;
          await sw.sync.register('jht-sync-interventions').catch(() => {});
        }
      } else {
        showToast(`Sync échouée : ${syncResult.message}`, 'error');
      }
    } else {
      showToast('Hors ligne — sera synchronisé au retour du réseau', 'warning');
    }

    renderInterventionList().catch(() => {});

  } catch (error) {
    console.error('[APP] Erreur saveAndSync :', error);
    showToast('Erreur lors de l\'enregistrement', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Enregistrer & Synchroniser';
  }
}

// ─── Header & réseau ──────────────────────────────────────────────────────────

function updateHeader() {
  const techEl = document.getElementById('header-technicien');
  if (techEl && AppState.technicien) {
    techEl.textContent = AppState.technicien;
  }
}

function updateOnlineStatus() {
  AppState.isOnline = navigator.onLine;
  const banner = document.getElementById('offline-banner');
  if (banner) {
    banner.style.display = AppState.isOnline ? 'none' : 'flex';
  }

  if (AppState.isOnline) {
    JHT_SYNC.pendingSync().then((results) => {
      if (results.sent > 0) {
        showToast(`${results.sent} intervention(s) synchronisée(s)`, 'success');
        renderInterventionList().catch(() => {});
      }
    });
  }
}

// ─── Initialisation ───────────────────────────────────────────────────────────

async function init() {
  console.log('[APP] Initialisation JHT Tech App');

  const email = await JHT_DB.getConfig('email');
  const technicien = await JHT_DB.getConfig('technicien');
  AppState.technicien = technicien;

  updateHeader();
  updateOnlineStatus();

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  window.addEventListener('sync-complete', (e) => {
    if (e.detail && e.detail.sent > 0) {
      showToast(`${e.detail.sent} sync(s) effectuée(s)`, 'success');
      renderInterventionList().catch(() => {});
    }
  });

  document.getElementById('btn-save-config').addEventListener('click', saveConfig);
  document.getElementById('btn-refresh').addEventListener('click', refreshFromSheets);
  document.getElementById('btn-back').addEventListener('click', () => initListView());
  document.getElementById('btn-save').addEventListener('click', saveAndSync);
  document.getElementById('btn-new').addEventListener('click', openNewIntervention);
  document.getElementById('btn-settings').addEventListener('click', initConfigView);

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js');
      console.log('[APP] Service Worker enregistré :', registration.scope);
    } catch (err) {
      console.warn('[APP] Échec enregistrement SW :', err);
    }
  }

  if (!email) {
    await initConfigView();
  } else {
    await initListView();
    if (AppState.isOnline) {
      JHT_SYNC.pendingSync().catch(() => {});
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
