/**
 * JIZURA CIN MIX - PWA Service Worker for Cloudflare Pages / Offline Mode
 * Caches core shell & assets for instant startup and offline capability.
 *
 * IMPORTANT: the fetch handler is NETWORK-FIRST for the app shell (HTML + JS).
 * A pure cache-first strategy kept serving stale bundles forever: the cache name
 * only changes when this file changes, so a deployed JS fix never reached clients
 * that had already visited the site. Network-first keeps the app fresh while
 * still falling back to the cache when the user is offline.
 */
const CACHE_NAME = 'jizura-cache-v4.2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './amv_asset_library.js',
  './src/amv_asset_manager.js',
  './amv_asset_manager.js',
  './webm-muxer.min.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// App-shell requests: always try the network first, fall back to the cache offline.
const SHELL_PATHS = ['/', '/index.html', '/amv_asset_library.js', '/amv_asset_manager.js', '/src/amv_asset_manager.js'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('PWA Precache warning (some files might be dynamic):', err);
      });
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Do not cache API calls or external dynamic audio streams
  if (url.protocol.startsWith('chrome-extension') || url.hostname.includes('googleapis') || url.pathname.endsWith('.mp3') || url.pathname.endsWith('.wav')) {
    return;
  }

  const isShell = SHELL_PATHS.includes(url.pathname) || url.pathname.endsWith('.html');

  if (isShell) {
    // NETWORK-FIRST: the user always gets the newest bundle when online.
    e.respondWith(
      fetch(e.request).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkRes;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkRes;
      }).catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
