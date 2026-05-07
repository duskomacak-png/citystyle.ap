// assets/js/main.js

function getUrlParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getLocal(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error("localStorage read error:", err);
    return null;
  }
}

function removeLocal(key) {
  localStorage.removeItem(key);
}

function setSessionValue(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (err) { console.warn("sessionStorage write error", err); }
}

function getSessionValue(key) {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.warn("sessionStorage read error", err);
    return null;
  }
}

function showMessage(message, type = "info") {
  const oldToast = document.querySelector(".app-toast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.className = `app-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString + (String(dateString).includes("T") ? "" : "T00:00:00"));
  return date.toLocaleDateString("sr-RS", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}


function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("sr-RS");
}

function normalizeCurrency(value) {
  const c = String(value || "RSD").trim().toUpperCase();
  if (c === "EUR" || c === "€" || c === "EVRO" || c === "EVRI") return "EUR";
  return "RSD";
}

function formatServicePrice(item = {}) {
  const currency = normalizeCurrency(item.currency || item.currency_snapshot || "RSD");
  const from = Number(item.price ?? item.price_snapshot ?? 0);
  const toRaw = item.price_to ?? item.price_to_snapshot;
  const to = toRaw === null || toRaw === undefined || toRaw === "" ? null : Number(toRaw);

  if ((!from || from <= 0) && (!to || to <= 0)) {
    return "Cena po dogovoru";
  }

  const suffix = currency === "EUR" ? "EUR" : "RSD";

  if (to && to > from) {
    return `${formatMoney(from)}–${formatMoney(to)} ${suffix}`;
  }

  return `${formatMoney(from)} ${suffix}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

async function checkSalonAccess(slug) {
  if (!slug) return { data: null, error: "Nedostaje salon slug." };
  if (!window.db) return { data: null, error: "Supabase nije učitan." };

  const { data, error } = await window.db
    .from("salons")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .eq("is_deleted", false)
    .maybeSingle();

  return { data, error };
}

function saveCurrentSalon(slug) {
  if (!slug) return;
  saveLocal(window.APP_CONFIG.salonStorageKey, {
    slug,
    savedAt: new Date().toISOString()
  });
}

function getSavedSalonSlug() {
  const saved = getLocal(window.APP_CONFIG.salonStorageKey);
  return saved?.slug || null;
}

function clearSavedSalon() {
  removeLocal(window.APP_CONFIG.salonStorageKey);
}

function isStandaloneMode() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true;
}

function getAppBaseUrl() {
  const origin = window.location.origin;
  const path = window.location.pathname || "/";

  // GitHub Pages project site: https://user.github.io/citystyle.app/
  if (window.location.hostname.endsWith("github.io")) {
    const parts = path.split("/").filter(Boolean);
    if (parts.length > 0) {
      return `${origin}/${parts[0]}/`;
    }
  }

  // Custom domain: https://citystyle.app/
  return `${origin}/`;
}

function getAppPath(path = "") {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return `${getAppBaseUrl()}${cleanPath}`;
}

function getSalonPublicLink(slug) {
  return `${getAppBaseUrl()}?salon=${encodeURIComponent(slug)}`;
}

function getQrImageUrl(link, size = 280) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(link)}`;
}

// PWA install prompt
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  showInstallButton();
});

function showInstallButton() {
  if (document.getElementById("install-app-btn")) return;

  const path = window.location.pathname || "/";
  const hasSalonParam = !!getUrlParam("salon");

  // Do not show install button to salon clients or inside admin/salon panels.
  // Platform install belongs only on the main platform page.
  if (hasSalonParam || path.includes("/admin") || path.includes("/salon")) return;

  const btn = document.createElement("button");
  btn.id = "install-app-btn";
  btn.className = "install-floating-btn";
  btn.type = "button";
  btn.textContent = "📱 Preuzmi CityStyle app";
  btn.addEventListener("click", () => installApp("Na iPhone-u: Share → Add to Home Screen.", "CityStyle je dodat na telefon."));
  document.body.appendChild(btn);
}

async function installSalonApp(slug) {
  if (slug) saveCurrentSalon(slug);
  updateManifestForSalon(slug || getSavedSalonSlug());
  await installApp("Na iPhone-u: Share → Add to Home Screen. Ova prečica pamti otvoreni profil.", "App profila je dodata na telefon.");
}

async function installOwnerApp() {
  clearSavedSalon();
  updateManifestForOwner();
  await installApp("Na iPhone-u: otvorite ovaj panel u Safari browseru, pritisnite Share i izaberite Add to Home Screen. Panel vlasnika ostaje zapamćen.", "Panel vlasnika je dodat na telefon.");
}

function updateManifestForOwner() {
  const baseManifest = {
    name: "CityStyle - Panel vlasnika",
    short_name: "CityStyle",
    description: "Prečica za direktan ulaz u panel vlasnika biznisa.",
    start_url: getAppPath("salon/"),
    scope: getAppBaseUrl(),
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: "#b91c1c",
    orientation: "portrait",
    icons: [
      { src: `${getAppBaseUrl()}assets/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: `${getAppBaseUrl()}assets/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  };
  try {
    const blob = new Blob([JSON.stringify(baseManifest)], { type: "application/manifest+json" });
    const url = URL.createObjectURL(blob);
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = url;
  } catch (err) {
    console.warn("Owner manifest nije postavljen:", err);
  }
}

function updateManifestForSalon(slug) {
  if (!slug) return;
  const baseManifest = {
    name: "CityStyle - Salon",
    short_name: "CityStyle",
    description: "Prečica za direktno zakazivanje termina u izabranom salonu.",
    start_url: `${getAppBaseUrl()}?salon=${encodeURIComponent(slug)}`,
    scope: getAppBaseUrl(),
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: "#b91c1c",
    orientation: "portrait",
    icons: [
      { src: `${getAppBaseUrl()}assets/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: `${getAppBaseUrl()}assets/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  };
  try {
    const blob = new Blob([JSON.stringify(baseManifest)], { type: "application/manifest+json" });
    const url = URL.createObjectURL(blob);
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = url;
  } catch (err) {
    console.warn("Dynamic manifest nije postavljen:", err);
  }
}

async function installApp(noPromptMessage = "Na iPhone-u: Share → Add to Home Screen.", successMessage = "CityStyle je dodat na telefon.") {
  if (!deferredPrompt) {
    showMessage(noPromptMessage, "info");
    return;
  }

  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;

  if (choice.outcome === "accepted") {
    showMessage(successMessage, "success");
    document.getElementById("install-app-btn")?.remove();
  } else {
    showMessage("Instalacija je otkazana.", "info");
  }

  deferredPrompt = null;
}

window.addEventListener("appinstalled", () => {
  document.getElementById("install-app-btn")?.remove();
  showMessage("CityStyle je dodat na početni ekran.", "success");
});


  function normalizePhoneForTel(phone) {
    const raw = String(phone || "").trim();
    if (!raw) return "";
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    if (raw.startsWith("+")) return `+${digits}`;
    if (raw.startsWith("00")) return `+${digits.slice(2)}`;
    if (digits.startsWith("0") && digits.length >= 8) return `+381${digits.slice(1)}`;
    if (/^(381|387|385|382|389|386|49|43)\d{6,}$/.test(digits)) return `+${digits}`;
    return digits;
  }

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function setAppBadgeCount(count = 0) {
  try {
    if ("setAppBadge" in navigator) {
      if (count > 0) await navigator.setAppBadge(count);
      else await navigator.clearAppBadge();
    }
  } catch (err) {
    console.warn("Badge nije podržan na ovom uređaju:", err);
  }
}

async function clearAppBadgeCount() {
  await setAppBadgeCount(0);
}

async function registerPushForSalon(salonId) {
  if (!salonId) {
    showMessage("Profil nije učitan.", "error");
    return false;
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    showMessage("Ovaj browser ne podržava obaveštenja za web aplikacije.", "error");
    return false;
  }

  if (Notification.permission === "denied") {
    showMessage("Obaveštenja su blokirana u podešavanjima browsera.", "error");
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    showMessage("Obaveštenja nisu dozvoljena.", "info");
    return false;
  }

  const vapidPublicKey = window.APP_CONFIG?.pushVapidPublicKey;
  if (!vapidPublicKey) {
    showMessage("Push ključ nije podešen u aplikaciji.", "error");
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });

  const json = subscription.toJSON();
  const { error } = await window.db
    .from("push_subscriptions")
    .upsert({
      salon_id: salonId,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: navigator.userAgent,
      active: true,
      updated_at: new Date().toISOString()
    }, { onConflict: "endpoint" });

  if (error) {
    console.error(error);
    showMessage("Obaveštenja nisu sačuvana u bazi.", "error");
    return false;
  }

  showMessage("Obaveštenja su uključena za ovaj profil.", "success");
  return true;
}

async function notifyOwnerAboutNewAppointment(appointmentId) {
  if (!appointmentId || !window.db?.functions?.invoke) return;
  try {
    await window.db.functions.invoke("send-appointment-push", {
      body: { appointment_id: appointmentId }
    });
  } catch (err) {
    console.warn("Push notifikacija nije poslata:", err);
  }
}

window.App = {
  getUrlParam,
  saveLocal,
  getLocal,
  removeLocal,
  setSessionValue,
  getSessionValue,
  showMessage,
  setAppBadgeCount,
  clearAppBadgeCount,
  registerPushForSalon,
  notifyOwnerAboutNewAppointment,
  formatDate,
  escapeHtml,
  escapeJs,
  formatServicePrice,
    normalizePhoneForTel,
  normalizeCurrency,
  checkSalonAccess,
  saveCurrentSalon,
  getSavedSalonSlug,
  clearSavedSalon,
  getAppBaseUrl,
  getAppPath,
  getSalonPublicLink,
  getQrImageUrl,
  installApp,
  installSalonApp,
  installOwnerApp,
  updateManifestForOwner,
  updateManifestForSalon,
  isStandaloneMode
};
