// sw.js
// Minimal cache reset service worker for CityStyle.app
const CACHE_NAME = "citystyle-v138-manifestworker";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  );
  self.clients.claim();
});


const SUPABASE_URL = "https://uxoovyytydnuibiwnpgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FFMUyqNXSuVP0mMsUa5PbQ_ur3iwb0L";
const FALLBACK_ICON_192 = "/assets/icons/icon-192.png";
const FALLBACK_ICON_512 = "/assets/icons/icon-512.png";

function cleanText(value, fallback) {
  return String(value || fallback || "CityStyle profil").replace(/[<>]/g, "").trim().slice(0, 80) || fallback || "CityStyle profil";
}

function shortName(value) {
  const clean = cleanText(value, "CityStyle");
  return clean.length > 18 ? clean.slice(0, 18).trim() : clean;
}

async function supabaseJson(url) {
  const response = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

async function buildProfileManifest(requestUrl) {
  const params = requestUrl.searchParams;
  const profileCode = String(params.get("profile") || "").trim();
  const salonSlug = String(params.get("salon") || "").trim();
  const isOwner = params.has("panel") || params.has("owner") || params.has("owner_profile") || params.has("owner_salon");
  const identityKey = profileCode ? "profile" : (salonSlug ? "salon" : "profile");
  const identityValue = profileCode || salonSlug || "default";
  const encodedIdentity = encodeURIComponent(identityValue);
  let name = isOwner ? "CityStyle Panel" : "CityStyle profil";
  let theme = "#b91c1c";
  let logo = "";

  try {
    const salonQuery = profileCode ? "public_profile_code=eq." + encodeURIComponent(profileCode) : "slug=eq." + encodeURIComponent(salonSlug);
    const salonUrl = SUPABASE_URL + "/rest/v1/salons?select=*&" + salonQuery + "&status=eq.active&is_deleted=eq.false&limit=1";
    const salons = await supabaseJson(salonUrl);
    const salon = salons && salons[0];
    if (salon && salon.id) {
      theme = salon.theme_color || theme;
      name = salon.salon_name || name;
      try {
        const settingsUrl = SUPABASE_URL + "/rest/v1/salon_settings?select=*&salon_id=eq." + encodeURIComponent(salon.id) + "&limit=1";
        const settingsList = await supabaseJson(settingsUrl);
        const settings = settingsList && settingsList[0] || {};
        name = settings.welcome_title || salon.salon_name || name;
        logo = settings.logo_url || settings.cover_image_url || settings.home_image_url || "";
      } catch (err) {}
      if (!logo) {
        try {
          const imagesUrl = SUPABASE_URL + "/rest/v1/home_images?select=image_url&salon_id=eq." + encodeURIComponent(salon.id) + "&active=eq.true&order=sort_order.asc,created_at.asc&limit=1";
          const images = await supabaseJson(imagesUrl);
          logo = images && images[0] && images[0].image_url || "";
        } catch (err) {}
      }
    }
  } catch (err) {}

  const finalName = cleanText(isOwner ? name + " Panel" : name, isOwner ? "CityStyle Panel" : "CityStyle profil");
  const startUrl = "/p/?" + identityKey + "=" + encodedIdentity + (isOwner ? "&panel=1" : "") + "&pwa_profile=" + encodedIdentity + "&v=v138manifestworker";
  const icons = [];
  if (/^https:\/\//i.test(logo)) {
    icons.push({ src: logo, sizes: "512x512", type: "image/png", purpose: "any" });
  }
  icons.push({ src: FALLBACK_ICON_192, sizes: "192x192", type: "image/png", purpose: "any maskable" });
  icons.push({ src: FALLBACK_ICON_512, sizes: "512x512", type: "image/png", purpose: "any maskable" });
  return {
    id: "/p/app/" + identityKey + "/" + encodedIdentity + (isOwner ? "/panel" : ""),
    name: finalName,
    short_name: shortName(finalName),
    description: "Direktan ulaz u CityStyle profil: " + finalName,
    start_url: startUrl,
    scope: "/p/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#0b0b0f",
    theme_color: theme,
    orientation: "portrait",
    icons
  };
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin === self.location.origin && requestUrl.pathname === "/p/manifest.webmanifest") {
    event.respondWith((async () => {
      const manifest = await buildProfileManifest(requestUrl);
      return new Response(JSON.stringify(manifest), {
        headers: {
          "Content-Type": "application/manifest+json; charset=utf-8",
          "Cache-Control": "no-store, max-age=0"
        }
      });
    })());
    return;
  }
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
    tag: data.tag || "citystyle-v138-manifestworker",
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
