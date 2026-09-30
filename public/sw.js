/* OpenRide service worker.
   Rules that keep a site update from being hidden by this file:
   - Pages, scripts, styles and config are NETWORK-FIRST. The cache is only an offline fallback.
   - Route lines and images are stale-while-revalidate (they rarely change).
   - VERSION is stamped at every deploy by generate-config.js, so each deploy installs a new worker
     and drops the old caches.
   - Kill switch: if /sw-kill.json says {"kill": true}, the worker unregisters itself and clears its
     caches, then reloads open pages. Check runs on navigations, at most once a minute.
   What this file never does: cache map tiles (OpenStreetMap forbids offline tile use and Mapbox terms
   do not grant it), touch /.netlify/ function calls, or touch paid tour content. Paid content lives
   in its own cache written by offline.js only when the rider taps Save for offline. */
const VERSION = 'dev';
const SHELL = 'openride-shell-' + VERSION;
const ROUTES = 'openride-routes-v1';
const PAID = 'openride-paid-v1';
const KEEP = [SHELL, ROUTES, PAID];
const NETWORK_TIMEOUT_MS = 5000; // weak signal on the road: fall back to the cache instead of hanging

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
      .then(cache => Promise.allSettled(PRECACHE.map(u => cache.add(new Request(u, { cache: 'reload' })))))
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

// ---- kill switch ----
let lastKillCheck = 0;
let dead = false; // once the kill switch fires, stop intercepting so nothing gets re-cached
async function killRequested() {
  const now = Date.now();
  if (now - lastKillCheck < 60000) return false;
  lastKillCheck = now;
  try {
    const r = await fetch('/sw-kill.json', { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    return j && j.kill === true;
  } catch (e) {
    return false; // offline or missing file: keep working
  }
}
async function wipe() {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k !== PAID).map(k => caches.delete(k))); // saved tours belong to the rider
}
async function selfDestruct() {
  dead = true;
  await wipe();
  await self.registration.unregister();
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => { try { c.navigate(c.url); } catch (e) { /* ignore */ } });
  await new Promise(r => setTimeout(r, 800));
  await wipe(); // catch any write that was already in flight
}
self.addEventListener('message', event => {
  if (event.data === 'CHECK_KILL') event.waitUntil(killRequested().then(k => k && selfDestruct()));
});

// ---- strategies ----
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  if (!cached) return network; // nothing to fall back to: wait for the network
  return Promise.race([
    network,
    new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), NETWORK_TIMEOUT_MS))
  ]).catch(() => cached);
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
  if (dead || request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/.netlify/') || url.pathname === '/sw-kill.json' || url.pathname === '/sw.js') return;
    if (request.mode === 'navigate') {
      event.respondWith((async () => {
        // The kill check is throttled to once a minute, so this is almost always instant.
        if (await killRequested()) { await selfDestruct(); return fetch(request); }
        return networkFirst(request, SHELL);
      })());
      return;
    }
    if (url.pathname.startsWith('/routes/') || request.destination === 'image') {
      event.respondWith(staleWhileRevalidate(request, url.pathname.startsWith('/routes/') ? ROUTES : SHELL));
      return;
    }
    event.respondWith(networkFirst(request, SHELL)); // scripts, styles, config, manifest
    return;
  }

  if (CDN.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, SHELL));
  }
  // Anything else (Mapbox tiles, analytics) is left alone.
});
