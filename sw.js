// CityStyle v40 nuclear cache reset
const CACHE_NAME = "citystyle-business-v42-layout-fix";
const BUILD = "business42layoutfix";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    if (self.registration && self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (e) {}
    }
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) => {
      try { client.postMessage({ type: "CITYSTYLE_CACHE_RESET", build: BUILD }); } catch (e) {}
    });
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith((async () => {
    try {
      const url = new URL(req.url);
      if (url.origin === location.origin) {
        url.searchParams.set("swv", BUILD);
        return await fetch(url.toString(), { cache: "no-store" });
      }
      return await fetch(req, { cache: "no-store" });
    } catch (err) {
      return fetch(req);
    }
  })());
});
