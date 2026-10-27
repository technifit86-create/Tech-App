/**
 * Service Worker — JHT Tech App (Version mise à jour)
 * Gère le cache dynamique et force le nettoyage des anciennes versions.
 */

const CACHE_NAME = 'jht-tech-v2'; // 👈 Passage en v2 pour purger l'ancien cache
const SYNC_TAG = 'jht-sync-interventions';

const STATIC_ASSETS = [
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/sync.js',
  './manifest.json'
];

// ─── Installation ────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installation v2 en cours…');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Mise en cache des nouveaux assets statiques');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting(); // Force l'activation immédiate
    })
  );
});

// ─── Activation ──────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation v2 — Suppression des vieux caches…');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Suppression ancien cache obsolète :', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      return self.clients.claim(); // Prend le contrôle direct de toutes les pages ouvertes
    })
  );
});

// ─── Fetch — Stratégie Network-First pour les scripts, Cache-First pour le reste ─
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;
  if (request.url.includes('script.google.com')) return;

  // Pour les fichiers JS/HTML, on essaie d'abord le réseau pour avoir toujours la dernière version
  if (request.url.includes('.js') || request.url.includes('.html') || request.url.includes('style.css')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Si pas de réseau, on bascule sur le cache de secours
          return caches.match(request);
        })
    );
    return;
  }

  // Pour le reste (images, icônes) : Cache-First classique
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone);
        });
        return networkResponse;
      });
    })
  );
});

// ─── Background Sync ─────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingInterventions());
  }
});

async function syncPendingInterventions() {
  const allClients = await self.clients.matchAll({ type: 'window' });
  if (allClients.length > 0) {
    allClients[0].postMessage({ type: 'TRIGGER_SYNC' });
  }
}

// ─── Messages depuis l'app ────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'REQUEST_SYNC') {
    self.registration.sync.register(SYNC_TAG).catch(() => {});
  }
});
