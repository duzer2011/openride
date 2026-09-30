/* OpenRide service worker.
   - Caches the tour page shell (HTML, CSS, JS, icons) so the page opens without signal.
   - Route lines (/routes/) are cached as they are used. No map tiles are ever cached:
     OpenStreetMap forbids offline tile use, and Mapbox terms do not grant it.
   - Paid tour content is NOT handled here. The page saves it to its own cache
     (offline.js) only when the rider taps Save for offline, and clears it on sign-out.
   - Function calls (/.netlify/) always go to the network. */
const VERSION = 'v2';
const SHELL = 'openride-shell-' + VERSION;
const ROUTES = 'openride-routes-v1';
const PAID = 'openride-paid-v1';
const KEEP = [SHELL, ROUTES, PAID];

const PRECACHE = [
  '/tours/natchez-lower/',
  '/tours/natchez-lower/tour.css',
  '/tours/natchez-lower/render.js',
  '/tours/natchez-lower/tour.js',
  '/offline.js',
  '/config.js',
  '/account/',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Third-party files the page needs to boot. Cached on first use.
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => Promise.allSettled(PRECACHE.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await network) || Response.error();
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/.netlify/')) return;            // functions: network only
    if (url.pathname.startsWith('/routes/')) {                     // route lines
      event.respondWith(staleWhileRevalidate(request, ROUTES));
      return;
    }
    if (request.mode === 'navigate') {                             // pages: fresh when online
      event.respondWith(networkFirst(request, SHELL));
      return;
    }
    event.respondWith(staleWhileRevalidate(request, SHELL));       // css, js, images
    return;
  }

  if (CDN.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, SHELL));
  }
  // Anything else (Mapbox tiles, analytics) is left alone.
});
