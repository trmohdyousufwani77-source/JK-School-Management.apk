// Service Worker for School Master Offline Portal (Dev & Fallback Shell)
// Production builds use VitePWA Workbox (`dist/sw.js`) with navigateFallback: 'index.html'.
const CACHE_NAME = 'school-master-cache-v2';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-cache partial failure:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      );
    })
  );
  self.clients.claim();
});

async function getOfflineAppShell() {
  const cache = await caches.open(CACHE_NAME);
  return (
    (await cache.match('./index.html')) ||
    (await cache.match('/index.html')) ||
    (await cache.match('./')) ||
    (await cache.match('/'))
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Never intercept cross-origin requests, API calls, or APK binary downloads
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || /\.apk$/i.test(url.pathname)) return;

  // Handle document / SPA navigation requests:
  // Always serve index.html on offline error OR server 404, and NEVER cache non-200 responses.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response && response.ok && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put('./index.html', responseClone).catch(() => {});
            });
            return response;
          }
          // If server returns 404/5xx for a deep link or refresh, fall back to cached SPA shell
          const shell = await getOfflineAppShell();
          if (shell) return shell;
          return response;
        })
        .catch(async () => {
          const shell = await getOfflineAppShell();
          return (
            shell ||
            new Response('Offline — please reconnect to load School Master.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        })
    );
    return;
  }

  // Handle static assets (stale-while-revalidate, strictly HTTP 200 only)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone).catch(() => {}));
          }
          return networkResponse;
        })
        .catch(() => null);

      if (cachedResponse) {
        return cachedResponse;
      }

      return networkFetch.then((res) => {
        if (res) return res;
        return new Response('Offline resource unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      });
    })
  );
});
