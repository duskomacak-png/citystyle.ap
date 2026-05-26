const CACHE_NAME = 'citystyle-v1-3-3';
const ASSETS = ['./', './index.html', './style.css?v=133', './script.js?v=133', './manifest.json'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => null));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: 'no-store' });
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone()).catch(() => null);
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' }});
    }
  })());
});
