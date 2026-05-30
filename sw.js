// sw.js
// CityStyle aggressive owner appointment push service worker
const CACHE_NAME = "citystyle-v211_notifications_button_feedback";

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

function buildAppointmentUrl(data = {}) {
  const id = data.appointment_id || data.appointmentId || "";
  const supplied = data.url || data.open_url || "";
  if (supplied) return supplied;
  return `/salon/?section=appointments&from_push=1${id ? `&appointment_id=${encodeURIComponent(id)}` : ""}`;
}

async function setOwnerBadge(count = 1) {
  try {
    if (self.registration.setAppBadge) await self.registration.setAppBadge(Math.max(1, Number(count || 1)));
  } catch (err) {}
}

async function showOwnerAppointmentNotification(data = {}, suffix = "") {
  const appointmentId = data.appointment_id || data.appointmentId || Date.now();
  const service = data.service_name || data.service_name_snapshot || data.service || "Usluga";
  const clientName = data.client_name || data.clientName || "Klijent";
  const time = String(data.appointment_time || data.time || "").slice(0, 5);
  const title = data.title || "🔔 NOVI TERMIN";
  const body = data.body || `${clientName} • ${service}${time ? " • " + time : ""}`;

  const options = {
    body,
    icon: data.icon || "/assets/icons/icon-192.png",
    badge: data.badge || "/assets/icons/icon-192.png",
    data: {
      url: buildAppointmentUrl(data),
      badgeCount: data.badgeCount || 1,
      appointment_id: appointmentId
    },
    tag: suffix ? `citystyle-owner-appointment-${appointmentId}-${suffix}` : `citystyle-owner-appointment-${appointmentId}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [300, 100, 300, 100, 500, 120, 300],
    timestamp: Date.now(),
    actions: [
      { action: "open-appointments", title: "Otvori termine" },
      { action: "close", title: "Kasnije" }
    ]
  };

  await self.registration.showNotification(title, options);
}

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (err) { data = {}; }

  event.waitUntil((async () => {
    await setOwnerBadge(data.badgeCount || 1);

    // First notification immediately.
    await showOwnerAppointmentNotification(data);

    // Aggressive fallback: repeat signal shortly after if Android allows SW to stay alive.
    // This helps when the first notification is missed. Browser/OS may still throttle it.
    if (data.urgent !== false) {
      await new Promise(resolve => setTimeout(resolve, 4500));
      await setOwnerBadge(data.badgeCount || 1);
      await showOwnerAppointmentNotification(data, "repeat1");
      await new Promise(resolve => setTimeout(resolve, 6500));
      await setOwnerBadge(data.badgeCount || 1);
      await showOwnerAppointmentNotification(data, "repeat2");
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "close") return;

  const targetUrl = event.notification?.data?.url || "/salon/?section=appointments&from_push=1";
  event.waitUntil((async () => {
    try {
      if (self.registration.clearAppBadge) await self.registration.clearAppBadge();
    } catch (err) {}

    const target = new URL(targetUrl, self.location.origin);
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });

    for (const client of allClients) {
      try {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === target.origin && clientUrl.pathname.startsWith("/salon") && "focus" in client) {
          await client.focus();
          if ("navigate" in client) return client.navigate(target.href);
          return client;
        }
      } catch (err) {}
    }

    return clients.openWindow(target.href);
  })());
});

self.addEventListener("notificationclose", (event) => {
  // Keep app badge until owner actually opens Termini.
});
