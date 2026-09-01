const CACHE_NAME = 'paypos-cache-v1.5.0-pwa-fix';
const STATIC_ASSETS = [
  './',
  './index.html',
  './pos.html',
  './manifest.json',
  './manifest.webmanifest',
  './css/style.css',
  './js/db.js',
  './js/audio.js',
  './js/auth.js',
  './js/bluetooth-printer.js',
  './js/cloud-sync.js',
  './js/products.js',
  './js/reports.js',
  './js/settings.js',
  './js/telegram-notify.js',
  './js/app.js',
  './icons/logo.png',
  './icons/favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install Event - Caches Core Static Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Pre-caching static assets');
      // Cache one by one so a single failure doesn't block everything
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('[ServiceWorker] Could not cache:', url, err.message);
        }))
      );
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean Up Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Cache First with Network Fallback
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests (CDN, fonts, APIs)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    // For cross-origin: network only, no cache
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Stale-while-revalidate: serve from cache, update in background
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      // Not in cache: fetch from network
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback for HTML navigation
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
    })
  );
});
