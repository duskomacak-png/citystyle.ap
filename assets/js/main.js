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
  btn.addEventListener("click", () => installApp());
  document.body.appendChild(btn);
}

async function installSalonApp(slug) {
  if (slug) saveCurrentSalon(slug);
  updateManifestForSalon(slug || getSavedSalonSlug());
  await installApp();
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

async function installApp() {
  if (!deferredPrompt) {
    showMessage("Na iPhone-u: Share → Add to Home Screen. Salon je već zapamćen u ovoj aplikaciji.", "info");
    return;
  }

  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;

  if (choice.outcome === "accepted") {
    showMessage("App salona je dodata na telefon.", "success");
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

window.App = {
  getUrlParam,
  saveLocal,
  getLocal,
  removeLocal,
  setSessionValue,
  getSessionValue,
  showMessage,
  formatDate,
  escapeHtml,
  escapeJs,
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
  updateManifestForSalon,
  isStandaloneMode
};
