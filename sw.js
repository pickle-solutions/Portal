// A new version number to revert to a stable state
const CACHE_NAME = 'portal-spa-cache-v354';

const urlsToCache = [
  '/',
  // The Shell
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',

  // The Vault Module
  'modules/vault/vault.html',
  'modules/vault/vault.css',
  'modules/vault/vault.js',
  'modules/vault/vault-icon.png',

  // The New Tracker Module
  'modules/tracker/tracker.html',
  'modules/tracker/tracker.css',
  'modules/tracker/tracker.js',
  'modules/tracker/chart.js',

  //The New Lister Module
  'modules/lister/lister.html',
  'modules/lister/lister.css',
  'modules/lister/lister.js',
  'modules/lister/lister.image.js',

  //The New Focus Module
  'modules/focus/focus.html',
  'modules/focus/focus.css',
  'modules/focus/focus.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('Service Worker install failed:', err);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        return fetch(event.request).then(
          function (response) {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            var responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(function (cache) {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

// 3. Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName.startsWith('portal-spa-cache-') &&
            cacheName !== CACHE_NAME;
        }).map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    })
  );
});