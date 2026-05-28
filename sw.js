// sw.js
// Minimal cache reset service worker for CityStyle.app
const CACHE_NAME = "citystyle-v152-salon-push-open-appointments";

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


function buildSalonAppointmentsUrl(rawUrl) {
  try {
    const base = self.location.origin;
    const url = rawUrl ? new URL(rawUrl, base) : new URL("/salon/", base);

    // Push for a booked salon appointment must always open the owner panel on
    // the appointments screen, not the generic owner dashboard/default tab.
    if (!url.pathname.startsWith("/salon")) url.pathname = "/salon/";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    url.searchParams.set("open", "appointments");
    url.searchParams.set("fromPush", "1");
    return url.href;
  } catch (err) {
    return `${self.location.origin}/salon/?open=appointments&fromPush=1`;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (err) { data = {}; }

  const title = data.title || "Novi zakazan termin";
  const targetUrl = buildSalonAppointmentsUrl(data.url || data.open_url || data.target_url);
  const options = {
    body: data.body || "Stigao je novi termin. Otvorite panel da vidite ko je zakazao.",
    icon: "/assets/icons/icon-192.png",
    badge: "/assets/icons/icon-192.png",
    data: {
      url: targetUrl,
      badgeCount: data.badgeCount || 1,
      appointmentId: data.appointment_id || data.appointmentId || ""
    },
    tag: data.tag || "citystyle-salon-appointment",
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
  const targetUrl = buildSalonAppointmentsUrl(event.notification?.data?.url);
  event.waitUntil((async () => {
    try {
      if (self.registration.clearAppBadge) await self.registration.clearAppBadge();
    } catch (err) {}

    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const target = new URL(targetUrl);
    for (const client of allClients) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === target.origin && clientUrl.pathname.startsWith("/salon") && "focus" in client) {
          if ("navigate" in client) await client.navigate(targetUrl);
          return client.focus();
        }
      } catch (err) {}
    }
    return clients.openWindow(targetUrl);
  })());
});
