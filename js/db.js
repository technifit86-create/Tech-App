/**
 * db.js — Module IndexedDB pour JHT Tech App
 * Gère le stockage local des interventions et de la configuration.
 */

const DB_NAME = 'jht-tech-db';
const DB_VERSION = 1;

// Noms des object stores
const STORE_INTERVENTIONS = 'interventions';
const STORE_CONFIG = 'config';

let _db = null;

// ─── Initialisation ──────────────────────────────────────────────────────────

/**
 * Ouvre (ou crée) la base de données IndexedDB.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) {
      resolve(_db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Object store des interventions
      if (!db.objectStoreNames.contains(STORE_INTERVENTIONS)) {
        const interventionStore = db.createObjectStore(STORE_INTERVENTIONS, {
          keyPath: 'id'
        });
        // Index pour filtrer par statut de synchro
        interventionStore.createIndex('synced', 'synced', { unique: false });
        // Index pour trier par date de création
        interventionStore.createIndex('createdAt', 'createdAt', { unique: false });
        // Index sur le numéro de cas
        interventionStore.createIndex('caseNo', 'caseNo', { unique: false });
        console.log('[DB] Object store "interventions" créé');
      }

      // Object store de configuration (clé-valeur)
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG, { keyPath: 'key' });
        console.log('[DB] Object store "config" créé');
      }
    };

    request.onsuccess = (event) => {
      _db = event.target.result;
      console.log('[DB] Base de données ouverte avec succès');
      resolve(_db);
    };

    request.onerror = (event) => {
      console.error('[DB] Erreur ouverture DB :', event.target.error);
      reject(event.target.error);
    };
  });
}

// ─── Helpers internes ─────────────────────────────────────────────────────────

/**
 * Exécute une transaction en lecture/écriture sur un store.
 * @param {string} storeName
 * @param {'readonly'|'readwrite'} mode
 * @param {Function} callback - reçoit l'object store, doit retourner une promesse
 */
async function withStore(storeName, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store);

    tx.oncomplete = () => resolve(result);
    tx.onerror = (e) => reject(e.target.error);
    tx.onabort = (e) => reject(e.target.error);
  });
}

/**
 * Exécute une requête IDB et retourne une promesse.
 * @param {IDBRequest} request
 */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── API Interventions ────────────────────────────────────────────────────────

/**
 * Structure d'une intervention (référence).
 * @typedef {Object} Intervention
 * @property {string} id               - Identifiant unique (UUID)
 * @property {string} activityId       - ID activité CRM (optionnel)
 * @property {string} regardingObjectId - ID objet CRM lié
 * @property {string} caseNo           - Numéro d'incident
 * @property {string} clientName       - Nom du client
 * @property {string} clinique         - Nom de la clinique / site
 * @property {string} productName      - Nom du produit
 * @property {string} serialNo         - Numéro de série
 * @property {string} defectReport     - Défaut signalé
 * @property {Array}  pieces           - Pièces : [{ref, description, qtyShipped, qtyUsed}]
 * @property {string} status           - "Complete" | "Further Action" | "In Process"
 * @property {string} dateDebut        - Date de début (YYYY-MM-DD)
 * @property {string} heureDebut       - Heure de début (HH:MM)
 * @property {string} dateFin          - Date de fin (YYYY-MM-DD)
 * @property {string} heureFin         - Heure de fin (HH:MM)
 * @property {string} ttrCode          - Code TTR Deviation
 * @property {string} travauxEffectues - Description des travaux effectués
 * @property {string} technicien       - Identifiant technicien (ex: "abraham.randria")
 * @property {boolean} synced          - true si synchronisé avec Google Sheets
 * @property {string} createdAt        - ISO timestamp de création locale
 * @property {string} updatedAt        - ISO timestamp de dernière modification
 */

/**
 * Sauvegarde (crée ou met à jour) une intervention.
 * @param {Intervention} intervention
 * @returns {Promise<string>} L'id de l'intervention sauvegardée
 */
async function saveIntervention(intervention) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_INTERVENTIONS, 'readwrite');
    const store = tx.objectStore(STORE_INTERVENTIONS);

    // Assurer un id et un timestamp
    if (!intervention.id) {
      intervention.id = crypto.randomUUID();
    }
    if (!intervention.createdAt) {
      intervention.createdAt = new Date().toISOString();
    }
    intervention.updatedAt = new Date().toISOString();

    const request = store.put(intervention);
    request.onsuccess = () => resolve(intervention.id);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Récupère toutes les interventions, triées par date de création décroissante.
 * @returns {Promise<Intervention[]>}
 */
async function getAllInterventions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_INTERVENTIONS, 'readonly');
    const store = tx.objectStore(STORE_INTERVENTIONS);
    const request = store.getAll();
    request.onsuccess = () => {
      const items = request.result || [];
      // Trier par createdAt décroissant
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Récupère une intervention par son id.
 * @param {string} id
 * @returns {Promise<Intervention|undefined>}
 */
async function getIntervention(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_INTERVENTIONS, 'readonly');
    const store = tx.objectStore(STORE_INTERVENTIONS);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Marque une intervention comme synchronisée.
 * @param {string} id
 * @returns {Promise<void>}
 */
async function markSynced(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_INTERVENTIONS, 'readwrite');
    const store = tx.objectStore(STORE_INTERVENTIONS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result;
      if (item) {
        item.synced = true;
        item.syncedAt = new Date().toISOString();
        store.put(item);
        resolve();
      } else {
        reject(new Error(`Intervention ${id} introuvable`));
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Récupère les interventions non encore synchronisées.
 * @returns {Promise<Intervention[]>}
 */
async function getPendingInterventions() {
  const all = await getAllInterventions();
  return all.filter((i) => !i.synced && i.status !== 'In Process');
}

/**
 * Supprime une intervention.
 * @param {string} id
 */
async function deleteIntervention(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_INTERVENTIONS, 'readwrite');
    const store = tx.objectStore(STORE_INTERVENTIONS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── API Configuration ────────────────────────────────────────────────────────

/**
 * Enregistre une valeur de configuration.
 * @param {string} key
 * @param {*} value
 */
async function saveConfig(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIG, 'readwrite');
    const store = tx.objectStore(STORE_CONFIG);
    const req = store.put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Lit une valeur de configuration.
 * @param {string} key
 * @returns {Promise<*>} La valeur ou undefined
 */
async function getConfig(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIG, 'readonly');
    const store = tx.objectStore(STORE_CONFIG);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
    req.onerror = () => reject(req.error);
  });
}

// ─── Export (module global) ───────────────────────────────────────────────────
window.JHT_DB = {
  openDB,
  saveIntervention,
  getAllInterventions,
  getIntervention,
  markSynced,
  getPendingInterventions,
  deleteIntervention,
  saveConfig,
  getConfig
};
