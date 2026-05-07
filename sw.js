// sw.js
const CACHE_NAME = "citystyle-v1.1.1";
const APP_SHELL = [
  "./", "index.html", "admin/index.html", "salon/index.html",
  "assets/css/style.css",
  "assets/js/config.js", "assets/js/main.js", "assets/js/auth.js",
  "assets/js/booking-logic.js", "assets/js/client.js", "assets/js/salon.js",
  "assets/js/admin.js", "assets/js/storage.js",
  "manifest.json", "assets/icons/icon-192.png", "assets/icons/icon-512.png"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    for (const file of APP_SHELL) {
      try { await cache.add(file); } catch (err) { console.warn("Cache skip:", file, err); }
    }
  }));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname.includes("supabase.co") || url.pathname.includes("/storage/v1/")) {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).catch(() => request.mode === "navigate" ? caches.match("index.html") : null)));
});
