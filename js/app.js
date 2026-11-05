/**
 * app.js — Application principale JHT Tech App
 * SPA (Single Page Application) avec 3 vues :
 *   0 - Configuration (premier lancement)
 *   1 - Liste des interventions (groupées par Nom du Client)
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
  currentClientGroup: null,  // Groupe/Dossier du client actuellement consulté
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

// ─── Vue 1 — Liste des interventions (Groupées par Nom du Client) ────────────

async function initListView() {
  showView('list');
  AppState.currentClientGroup = null; // Réinitialise le dossier client courant
  await renderInterventionList();
}

/** Regroupe les interventions par Nom du Client */
function groupInterventionsByClient(interventions) {
  const grouped = {};

  interventions.forEach(interv => {
    const clientName = interv.clientName || interv.nomClient || 'Client inconnu';
    if (!grouped[clientName]) {
      grouped[clientName] = {
        clientName: clientName,
        interventions: []
      };
    }
    grouped[clientName].interventions.push(interv);
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

    const groupedData = groupInterventionsByClient(interventions);

    groupedData.forEach((group) => {
      const clientCard = createClientCard(group);
      listContainer.appendChild(clientCard);
    });
  } catch (error) {
    listContainer.innerHTML = '<div class="error-message">Erreur de chargement</div>';
    console.error('[APP] Erreur renderInterventionList :', error);
  }
}

/** Crée une carte client compacte. Au clic, ouvre la vue dédiée du client */
function createClientCard(group) {
  const card = document.createElement('div');
  card.className = 'case-group-card';
  card.style.cssText = `
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    padding: 14px;
    margin-bottom: 16px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.04);
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  `;

  let htmlContent = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: bold;">CLIENT</span>
        <h3 style="font-size: 16px; color: #111827; margin: 2px 0 0 0;">👤 ${escapeHtml(group.clientName)}</h3>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="background: #f3f4f6; color: #374151; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; border: 1px solid #e5e7eb;">
          ${group.interventions.length} intervention(s)
        </span>
        <span style="color: #2980b9; font-weight: bold; font-size: 18px;">›</span>
      </div>
    </div>
  `;

  card.innerHTML = htmlContent;

  card.addEventListener('click', () => {
    openClientDetailView(group);
  });

  return card;
}

/** Affiche la page dédiée à un seul client et masque les autres */
function openClientDetailView(group) {
  AppState.currentClientGroup = group; // Mémorise le dossier client actuel
  showView('list');

  const listContainer = document.getElementById('intervention-list');
  listContainer.innerHTML = ''; 

  const header = document.createElement('div');
  header.style.cssText = `
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid #e5e7eb;
  `;
  header.innerHTML = `
    <button id="btn-back-to-clients" style="background: none; border: none; color: #2980b9; font-size: 14px; font-weight: bold; cursor: pointer; padding: 0 0 10px 0; display: block;">
      ← Retour à la liste des clients
    </button>
    <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; font-weight: bold;">DOSSIER CLIENT</span>
    <h2 style="font-size: 20px; color: #111827; margin: 2px 0 0 0;">👤 ${escapeHtml(group.clientName)}</h2>
    <span style="font-size: 13px; color: #6b7280;">Total : ${group.interventions.length} intervention(s)</span>
  `;
  listContainer.appendChild(header);

  header.querySelector('#btn-back-to-clients').addEventListener('click', () => {
    initListView(); // Retourne à la liste globale des clients
  });

  const subList = document.createElement('div');
  subList.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

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

    const item = document.createElement('div');
    item.className = 'sub-intervention-item';
    item.setAttribute('data-id', interv.id);
    item.style.cssText = `
      background: #ffffff;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    `;

    item.innerHTML = `
      <div style="flex: 1;">
        <div style="font-size: 14px; font-weight: bold; color: #1f2937; margin-bottom: 4px;">
          📌 Incident : ${escapeHtml(incident)} <span style="font-weight: normal; color: #6b7280; font-size: 12px;">(${dateStr})</span>
        </div>
        <div style="font-size: 13px; color: #374151; margin-bottom: 3px;">
          📦 Produit : <strong>${escapeHtml(produit)}</strong>
        </div>
        <div style="font-size: 12px; color: #6b7280; margin-bottom: 6px;">
          🔢 N° de Série : <code>${escapeHtml(serie)}</code>
        </div>
        <div>
          <span class="status-badge ${statusClass}" style="font-size: 11px; padding: 2px 6px;">${escapeHtml(interv.status || 'In Process')}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-left: 10px;">
        <span title="${interv.synced ? 'Synchronisé' : 'En attente de sync'}" style="font-size: 14px;">${syncIcon}</span>
        <span style="color: #c0392b; font-weight: bold; font-size: 18px;">›</span>
      </div>
    `;

    item.addEventListener('click', () => {
      openInterventionDetail(interv.id);
    });

    subList.appendChild(item);
  });

  listContainer.appendChild(subList);
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
      await initListView();
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
    const parts = date
