// sw.js
// CityStyle v228 - native system notification test repair
const CACHE_NAME = "citystyle-v228_native_debug_notification";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (err) {}
    await self.clients.claim();
  })());
});

// Network-first only. Do not cache app code while we are repairing PWA/push behavior.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

function safeText(value, fallback = "") {
  const text = String(value == null ? "" : value).trim();
  return text || fallback;
}

function buildAppointmentUrl(data = {}) {
  const id = data.appointment_id || data.appointmentId || "";
  const supplied = data.url || data.open_url || data.openUrl || "";
  if (supplied) return supplied;
  return `/salon/?section=appointments&from_push=1${id ? `&appointment_id=${encodeURIComponent(id)}` : ""}`;
}

function normalizePushData(event) {
  if (!event || !event.data) return {};
  try {
    const parsed = event.data.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (jsonErr) {
    try {
      const text = event.data.text();
      return text ? { body: text } : {};
    } catch (textErr) {
      return {};
    }
  }
}

async function setOwnerBadge(count = 1) {
  try {
    if (self.registration.setAppBadge) {
      await self.registration.setAppBadge(Math.max(1, Number(count || 1)));
    }
  } catch (err) {}
}

async function showOwnerAppointmentNotification(data = {}) {
  const appointmentId = data.appointment_id || data.appointmentId || Date.now();
  const service = safeText(data.service_name || data.service_name_snapshot || data.service, "Usluga");
  const clientName = safeText(data.client_name || data.clientName, "Klijent");
  const time = String(data.appointment_time || data.time || "").slice(0, 5);
  const title = safeText(data.title, "Novi termin");
  const body = safeText(data.body, `${clientName} • ${service}${time ? " • " + time : ""}`);

  const fullOptions = {
    body,
    icon: data.icon || "/assets/icons/icon-192.png",
    badge: data.badge || "/assets/icons/icon-192.png",
    data: {
      url: buildAppointmentUrl(data),
      badgeCount: data.badgeCount || 1,
      appointment_id: appointmentId
    },
    tag: `citystyle-owner-appointment-${appointmentId}`,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [220, 80, 220, 80, 220],
    timestamp: Date.now(),
    actions: [
      { action: "open", title: "Otvori termine" }
    ]
  };

  try {
    await self.registration.showNotification(title, fullOptions);
    return;
  } catch (err) {
    // Some Android/WebView combinations can reject optional fields. Fall back to the smallest valid notification.
    try {
      await self.registration.showNotification(title, {
        body,
        icon: "/assets/icons/icon-192.png",
        data: fullOptions.data,
        tag: `citystyle-owner-appointment-${appointmentId}-fallback`,
        silent: false
      });
    } catch (fallbackErr) {
      console.error("CityStyle showNotification failed", fallbackErr);
    }
  }
}

self.addEventListener("push", (event) => {
  const data = normalizePushData(event);
  event.waitUntil((async () => {
    await setOwnerBadge(data.badgeCount || 1);
    await showOwnerAppointmentNotification(data);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
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
        if (clientUrl.origin === target.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) return client.navigate(target.href);
          return client;
        }
      } catch (err) {}
    }

    return clients.openWindow(target.href);
  })());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data && data.type === "CITYSTYLE_TEST_NOTIFICATION") {
    event.waitUntil(showOwnerAppointmentNotification({
      title: "CityStyle obaveštenja aktivna",
      body: "Test poruka radi. Novi termini će stići ovde.",
      appointment_id: `test-${Date.now()}`,
      url: "/salon/?section=appointments&from_push=1"
    }));
  }
});
