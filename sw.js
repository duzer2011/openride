const CACHE_NAME = 'openride-v1';
const ROUTE_CACHE = 'openride-routes-v1';
const AUDIO_CACHE = 'openride-audio-v1';
const APP_SHELL = ['/ride.html', '/manifest.json', '/config.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k !== ROUTE_CACHE && k !== AUDIO_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith('/routes/')) {
    event.respondWith(caches.open(ROUTE_CACHE).then(cache => cache.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => { cache.put(event.request, response.clone()); return response; });
    })));
    return;
  }

  if (url.pathname.startsWith('/audio/')) {
    event.respondWith(caches.open(AUDIO_CACHE).then(cache => cache.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => { cache.put(event.request, response.clone()); return response; }).catch(() => new Response('Audio not available offline', { status: 503 }));
    })));
    return;
  }

  if (url.hostname.includes('mapbox')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => {
    if (cached) return cached;
    return fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => { if (event.request.mode === 'navigate') return caches.match('/ride.html'); });
  }));
});

self.addEventListener('message', event => {
  if (event.data.type === 'CACHE_ROUTE') {
    caches.open(ROUTE_CACHE).then(cache => cache.addAll(event.data.files).then(() => event.source.postMessage({ type: 'ROUTE_CACHED', routeId: event.data.routeId })));
  }
});
