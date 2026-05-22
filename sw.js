// sw.js
// Minimal cache reset service worker for CityStyle.app
const CACHE_NAME = "citystyle-business-v15-cataloginstall";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});


self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (err) { data = {}; }

  const title = data.title || "Novi zahtev / termin";
  const options = {
    body: data.body || "Stigao je novi zahtev korisnika.",
    icon: "/assets/icons/icon-192.png",
    badge: "/assets/icons/icon-192.png",
    data: {
      url: data.url || "salon/",
      badgeCount: data.badgeCount || 1
    },
    tag: data.tag || "citystyle-new-appointment",
    renotify: true
  };

  event.waitUntil((async () => {
    try {
      if (self.registration.setAppBadge) {
        await self.registration.setAppBadge(options.data.badgeCount || 1);
      }
    } catch (err) {}
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/salon/";
  event.waitUntil((async () => {
    try {
      if (self.registration.clearAppBadge) await self.registration.clearAppBadge();
    } catch (err) {}
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
    }
    return clients.openWindow(targetUrl);
  })());
});
