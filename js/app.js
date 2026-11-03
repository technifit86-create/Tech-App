/**
 * app.js — Application principale JHT Tech App
 * SPA (Single Page Application) avec 3 vues :
 *   0 - Configuration (premier lancement)
 *   1 - Liste des interventions (groupées par Case No)
 *   2 - Détail / Formulaire d'une intervention
 */

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

/** Formate une date ISO en format lisible (Corrige le bug Invalid Date) */
function formatDate(isoStr) {
  if (!isoStr || isoStr === 'Invalid Date') return '—';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '—';
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

// ─── Vue 1 — Liste des interventions (Regroupées par Case No) ─────────────────

async function initListView() {
  showView('list');
  await renderInterventionList();
}

/** Regroupe les interventions par numéro de dossier (Case No) */
function groupInterventionsByCase(interventions) {
  const grouped = {};

  interventions.forEach(interv => {
    const caseNo = interv.caseNo || 'Sans Dossier';
    if (!grouped[caseNo]) {
      grouped[caseNo] = {
        caseNo: caseNo,
        clientName: interv.clientName || interv.nomClient || 'Client inconnu',
        productName: interv.productName || interv.nomProduit || 'Produit non spécifié',
        interventions: []
      };
    }
    grouped[caseNo].interventions.push(interv);
  });

  return Object.values(grouped);
}

async function renderInterventionList() {
  const listContainer = document.getElementById('intervention-list');
  const emptyState = document.getElementById('list-empty');
  listContainer.innerHTML = '<div class="loading-indicator">Chargement…</div>';

  try {
    const interventions = await JHT_DB.getAllInterventions();

    if (!interventions || interventions.length === 0) {
      listContainer.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    listContainer.innerHTML = '';

    // Regroupement par Case No
    const groupedData = groupInterventionsByCase(interventions);

    groupedData.forEach((group) => {
      const caseCard = createCaseCard(group);
      listContainer.appendChild(caseCard);
    });
  } catch (error) {
    listContainer.innerHTML = '<div class="error-message">Erreur de chargement</div>';
    console.error('[APP] Erreur renderInterventionList :', error);
  }
}

/** Crée une carte parente pour un groupe de dossier (Case No) avec détails d'incident */
function createCaseCard(group) {
  const card = document.createElement('div');
  card.className = 'case-group-card';
  card.style.cssText = `
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 16px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.04);
  `;

  // En-tête du groupe de dossier
  let htmlContent = `
    <div style="border-bottom: 1px solid #f0f0f0; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: bold;">DOSSIER CASE NO</span>
        <h3 style="font-size: 16px; color: #111827; margin: 2px 0 4px 0;">${escapeHtml(group.caseNo)}</h3>
        <span style="font-size: 13px; color: #4b5563;">👤 ${escapeHtml(group.clientName)}</span>
      </div>
      <span style="background: #f3f4f6; color: #374151; padding: 3px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; border: 1px solid #e5e7eb;">
        ${group.interventions.length} intervention(s)
      </span>
    </div>
    <div class="sub-interventions-list" style="display: flex; flex-direction: column; gap: 8px;">
  `;

  // Génération des sous-éléments : Incident, Produit et N° de Série
  group.interventions.forEach((interv) => {
    const syncIcon = interv.synced ? '✅' : '⏳';
    const statusClass = interv.status === 'Complete' ? 'status--complete'
      : interv.status === 'Further Action' ? 'status--further'
      : interv.status === 'Scheduled' ? 'status--scheduled'
      : 'status--inprocess';

    const dateStr = formatDate(interv.dateDebut || interv.createdAt);
    const incident = interv.incidentNo || '—';
    const produit = interv.productName || interv.nomProduit || '—';
    const serie = interv.serialNo || interv.serieConsole || '—';

    htmlContent += `
      <div class="sub-intervention-item" data-id="${interv.id}" role="button" tabindex="0" style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.2s;">
        <div style="flex: 1;">
          <div style="font-size: 13px; font-weight: bold; color: #1f2937; margin-bottom: 3px;">
            📌 Incident : ${escapeHtml(incident)} <span style="font-weight: normal; color: #6b7280; font-size: 12px;">(${dateStr})</span>
          </div>
          <div style="font-size: 12px; color: #4b5563; margin-bottom: 2px;">
            📦 Produit : <strong>${escapeHtml(produit)}</strong>
          </div>
          <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">
            🔢 N° de Série : <code>${escapeHtml(serie)}</code>
          </div>
          <div>
            <span class="status-badge ${statusClass}" style="font-size: 11px; padding: 2px 6px;">${escapeHtml(interv.status || 'In Process')}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-left: 10px;">
          <span title="${interv.synced ? 'Synchronisé' : 'En attente de sync'}" style="font-size: 14px;">${syncIcon}</span>
          <span style="color: #c0392b; font-weight: bold; font-size: 16px;">›</span>
        </div>
      </div>
    `;
  });

  htmlContent += `</div>`;
  card.innerHTML = htmlContent;

  // Écouteurs de clics sur chaque sous-intervention
  card.querySelectorAll('.sub-intervention-item').forEach(item => {
    const intervId = item.getAttribute('data-id');
    item.addEventListener('click', () => openInterventionDetail(intervId));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') openInterventionDetail(intervId);
    });
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

    const allLocal = await JHT_DB.getAllInterventions();
    for (const interv of allLocal) {
      await JHT_DB.deleteIntervention(interv.id);
    }

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

  updateTtrVisibility();

  renderPiecesSection(interv.pieces || []);
  document.getElementById('detail-travaux').value = interv.travauxEffectues || interv.travaux || '';
  setupFileAttachmentHandler(interv);
  updateSyncIndicator(interv.synced);
  
  setupFormValidationAndClock();
}

function updateTtrVisibility() {
  const statusSelect = document.getElementById('detail-status');
  const ttrContainer = document.getElementById('ttr-container');
  const ttrSelect = document.getElementById('detail-ttr');

  if (statusSelect && ttrContainer) {
    if (statusSelect.value === 'Further Action') {
      ttrContainer.style.display = 'block';
    } else {
      ttrContainer.style.display = 'none';
      if (ttrSelect) ttrSelect.value = '';
    }
  }
}

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

function setupFormValidationAndClock() {
  const saveBtn = document.getElementById('btn-save');
  const statusSelect = document.getElementById('detail-status');

  if (statusSelect) {
    statusSelect.onchange = () => {
      updateTtrVisibility();
      validateForm();
    };
  }
  
  function validateForm() {
    if (!saveBtn) return;

    const statusVal = document.getElementById('detail-status')?.value;
    const dateVal = document.getElementById('detail-date-debut')?.value;
    const heureDebutVal = document.getElementById('detail-heure-debut')?.value;
    const heureFinVal = document.getElementById('detail-heure-fin')?.value;
    const ttrVal = document.getElementById('detail-ttr')?.value;
    const travauxVal = document.getElementById('detail-travaux')?.value;

    let ttrValid = true;
    if (statusVal === 'Further Action') {
      ttrValid = Boolean(ttrVal && ttrVal.trim() !== '');
    }

    const allFilled = Boolean(
      statusVal && statusVal.trim() !== '' &&
      dateVal && dateVal.trim() !== '' &&
      heureDebutVal && heureDebutVal.trim() !== '' &&
      heureFinVal && heureFinVal.trim() !== '' &&
      ttrValid &&
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

  const formElements = document.querySelectorAll('#view-detail input, #view-detail select, #view-detail textarea');
  formElements.forEach(el => {
    el.addEventListener('input', validateForm);
    el.addEventListener('change', validateForm);
  });

  const timeInputs = document.querySelectorAll('#detail-heure-debut, #detail-heure-fin');
  timeInputs.forEach(input => {
    const parentContainer = input.parentElement;

    const setNowTime = () => {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      
      input.value = `${hours}:${minutes}`;

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      validateForm();
    };

    if (parentContainer) {
      parentContainer.addEventListener('click', (e) => {
        if (e.target !== input) {
          setNowTime();
        }
      });
    }

    input.addEventListener('dblclick', setNowTime);
  });

  validateForm();
}

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
    
    if (interv.status === 'Further Action') {
      interv.ttrCode = document.getElementById('detail-ttr').value;
    } else {
      interv.ttrCode = '';
    }

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
      if (results && results.sent > 0) {
        showToast(`${results.sent} intervention(s) synchronisée(s)`, 'success');
        renderInterventionList().catch(() => {});
      }
    });
  }
}

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
