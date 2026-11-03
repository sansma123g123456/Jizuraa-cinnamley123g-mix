/**
 * JIZURA CIN MIX - PWA Service Worker for Cloudflare Pages / Offline Mode
 * Caches core shell & assets for instant startup and offline capability.
 */
const CACHE_NAME = 'jizura-cache-v4.1';
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
