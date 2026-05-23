// sw.js - v46 stable clean reset
const CACHE_NAME = "citystyle-business-v46-stable-clean";
const BUILD = "business46stableclean";
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request)));
});
