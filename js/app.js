/**
 * app.js — Application principale JHT Tech App
 * Navigation en 2 niveaux de dossiers + Recherche
 */

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

const AppState = {
  currentView: null,         // 'config' | 'list' | 'case-detail' | 'detail'
  currentIntervention: null, // Intervention en cours d'édition
  currentCaseGroup: null,    // Dossier en cours de consultation
  allInterventions: [],      // Stockage local brute
  technicien: null,
  isOnline: navigator.onLine
};

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function formatDateToJJMMYYYY(isoDateStr) {
  if (!isoDateStr) return '';
  if (isoDateStr.includes('-') && isoDateStr.split('-')[0].length === 4) {
    const parts = isoDateStr.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return isoDateStr;
}

function extractTechnicien(email) {
  return email ? email.split('@')[0] : '';
}

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

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

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
  if (savedEmail) document.getElementById('config-email').value = savedEmail;
  if (savedUrl) document.getElementById('config-url').value = savedUrl;
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

// ─── Vue 1 — Liste des dossiers (Master) ──────────────────────────────────────

async function initListView() {
  showView('list');
  await renderInterventionList();
}

function groupInterventionsByCase(interventions) {
  const grouped = {};

  interventions.forEach(interv => {
    const caseNo = interv.caseNo || 'Sans Dossier';
    if (!grouped[caseNo]) {
      grouped[caseNo] = {
        caseNo: caseNo,
        clientName: interv.clientName || interv.nomClient || 'Client inconnu',
        productName: interv.productName || interv.nomProduit || 'Produit non spécifié',
        hasFurtherAction: false,
        interventions: []
      };
    }
    if (interv.status === 'Further Action') {
      grouped[caseNo].hasFurtherAction = true;
    }
    grouped[caseNo].interventions.push(interv);
  });

  return Object.values(grouped);
}

async function renderInterventionList() {
  const listContainer = document.getElementById('intervention-list');
  const emptyState = document.getElementById('list-empty');
  const searchVal = document.getElementById('search-input')?.value.toLowerCase().trim() || '';

  listContainer.innerHTML = '<div class="loading-indicator">Chargement…</div>';

  try {
    AppState.allInterventions = await JHT_DB.getAllInterventions();

    // Filtre de recherche
    let filtered = AppState.allInterventions;
    if (searchVal) {
      filtered = filtered.filter(i => 
        (i.caseNo && i.caseNo.toLowerCase().includes(searchVal)) ||
        (i.clientName && i.clientName.toLowerCase().includes(searchVal)) ||
        (i.nomClient && i.nomClient.toLowerCase().includes(searchVal)) ||
        (i.incidentNo && i.incidentNo.toLowerCase().includes(searchVal))
      );
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    listContainer.innerHTML = '';

    const groupedData = groupInterventionsByCase(filtered);

    groupedData.forEach((group) => {
      const card = createCaseSummaryCard(group);
      listContainer.appendChild(card);
    });
  } catch (error) {
    listContainer.innerHTML = '<div class="error-message">Erreur de chargement</div>';
    console.error('[APP] Erreur renderInterventionList :', error);
  }
}

/** Crée une carte de dossier épurée (SANS la liste des rapports intégrée) */
function createCaseSummaryCard(group) {
  const card = document.createElement('div');
  card.className = 'case-summary-card';
  card.style.cssText = `
    background: #ffffff;
    border: 1px solid ${group.hasFurtherAction ? '#f59e0b' : '#e5e7eb'};
    border-left: 5px solid ${group.hasFurtherAction ? '#f59e0b' : '#2980b9'};
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 12px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.04);
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  `;

  const totalInterv = group.interventions.length;
  const furtherBadge = group.hasFurtherAction 
    ? `<span style="background: #fef3c7; color: #b45309; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; border: 1px solid #fde68a;">⚠️ Action requise</span>`
    : '';

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
      <div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 style="font-size: 16px; color: #111827; margin: 0; font-weight: bold;">📁 Dossier ${escapeHtml(group.caseNo)}</h3>
          ${furtherBadge}
        </div>
        <div style="font-size: 13px; color: #4b5563; margin-top: 4px;">👤 Client : <strong>${escapeHtml(group.clientName)}</strong></div>
        <div style="font-size: 13px; color: #6b7280; margin-top: 2px;">📦 Produit : ${escapeHtml(group.productName)}</div>
      </div>
      <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
        <span style="background: #eef2ff; color: #4338ca; padding: 4px 10px; border-radius: 16px; font-size: 12px; font-weight: bold;">
          ${totalInterv} rapport(s)
        </span>
        <span style="color: #9ca3af; font-size: 18px; font-weight: bold;">›</span>
      </div>
    </div>
  `;

  card.addEventListener('click', () => openCaseDetailView(group));
  return card;
}

// ─── Vue 1.5 — Vue Détail Dossier (Sous-liste d'interventions) ───────────────

function openCaseDetailView(group) {
  AppState.currentCaseGroup = group;

  const headerContainer = document.getElementById('case-info-header');
  const itemsContainer = document.getElementById('case-interventions-container');
  document.getElementById('case-detail-title').textContent = `Dossier ${group.caseNo}`;

  headerContainer.innerHTML = `
    <h2 style="font-size: 17px; margin: 0 0 6px 0; color: #111827;">📁 Case No : ${escapeHtml(group.caseNo)}</h2>
    <div style="font-size: 14px; color: #374151;"><strong>Client :</strong> ${escapeHtml(group.clientName)}</div>
    <div style="font-size: 14px; color: #374151; margin-top: 2px;"><strong>Produit :</strong> ${escapeHtml(group.productName)}</div>
  `;

  itemsContainer.innerHTML = '';

  group.interventions.forEach(interv => {
    const card = document.createElement('div');
    card.style.cssText = `
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    `;

    const syncIcon = interv.synced ? '✅' : '⏳';
    const statusClass = interv.status === 'Complete' ? 'status--complete'
      : interv.status === 'Further Action' ? 'status--further'
      : interv.status === 'Scheduled' ? 'status--scheduled'
      : 'status--inprocess';

    const dateStr = interv.dateDebut ? formatDate(interv.dateDebut) : formatDate(interv.createdAt);

    card.innerHTML = `
      <div>
        <div style="font-size: 14px; font-weight: bold; color: #1f2937;">Incident : ${escapeHtml(interv.incidentNo || '—')}</div>
        <div style="font-size: 12px; color: #6b7280; margin: 3px 0 6px 0;">Date : ${dateStr}</div>
        <span class="status-badge ${statusClass}">${escapeHtml(interv.status || 'In Process')}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span title="${interv.synced ? 'Synchronisé' : 'En attente'}" style="font-size: 16px;">${syncIcon}</span>
        <span style="color: #c0392b; font-weight: bold; font-size: 18px;">›</span>
      </div>
    `;

    card.addEventListener('click', () => openInterventionDetail(interv.id));
    itemsContainer.appendChild(card);
  });

  showView('case-detail');
}

// ─── Vue 2 — Formulaire / Édition ─────────────────────────────────────────────

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
        if (e.target !== input) setNowTime();
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
    if (heureFinEl) interv.heureFin = heureFinEl.value;
    
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
  if (banner) banner.style.display = AppState.isOnline ? 'none' : 'flex';

  if (AppState.isOnline) {
    JHT_SYNC.pendingSync().then((results) => {
      if (results.sent > 0) {
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

  document.getElementById('btn-save-config').addEventListener('click', saveConfig);
  document.getElementById('btn-refresh').addEventListener('click', refreshFromSheets);
  
  // Navigation de retour intelligente
  document.getElementById('btn-back-to-cases').addEventListener('click', () => showView('list'));
  document.getElementById('btn-back').addEventListener('click', () => {
    if (AppState.currentCaseGroup) {
      showView('case-detail');
    } else {
      showView('list');
    }
  });

  document.getElementById('btn-save').addEventListener('click', saveAndSync);
  document.getElementById('btn-new').addEventListener('click', openNewIntervention);
  document.getElementById('btn-settings').addEventListener('click', initConfigView);

  // Recherche en temps réel
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderInterventionList());
  }

  if (!email) {
    await initConfigView();
  } else {
    await initListView();
  }
}

document.addEventListener('DOMContentLoaded', init);
