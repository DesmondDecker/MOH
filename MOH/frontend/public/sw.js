/**
 * APP-SHELL SERVICE WORKER
 * -----------------------------------------------------------------------
 * Scope: makes the app itself (the HTML/JS/CSS shell) load offline, so a
 * CHW opening the app with no signal gets the working UI, not a blank
 * "no internet" browser page. This is deliberately separate from the
 * actual offline DATA layer (src/lib/offlineQueue.js, IndexedDB) — this
 * file only knows about static assets, never patient/visit data.
 *
 * Cache-first for the app shell, falling back to network for anything
 * not yet cached. API calls (/api/...) are explicitly passed through to
 * the network untouched — this service worker never caches or
 * intercepts patient data requests, only the app's own static files.
 *
 * SANDBOX NOTE FOR REVIEWERS: like offlineQueue.js, the Service Worker
 * API has no Node.js equivalent and this file's actual install/fetch
 * behavior could not be executed in the sandbox this was built in — only
 * verified for correct syntax and standard Service Worker API usage.
 * Test in a real browser (DevTools -> Application -> Service Workers)
 * before relying on it.
 */

const CACHE_NAME = 'moh-app-shell-v1';
const APP_SHELL_URLS = ['/', '/index.html', '/favicon.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          throw new Error('Network unavailable and resource not cached');
        });
    })
  );
});
