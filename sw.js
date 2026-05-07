// sw.js - cache reset version
const CACHE_NAME = "citystyle-logo-only-platform-install-v1";
self.addEventListener("install", event => { self.skipWaiting(); });
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => { return; });
