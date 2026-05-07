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

// PWA install prompt
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  showInstallButton();
});

function showInstallButton() {
  if (document.getElementById("install-app-btn")) return;

  const btn = document.createElement("button");
  btn.id = "install-app-btn";
  btn.className = "install-floating-btn";
  btn.type = "button";
  btn.textContent = "📱 Sačuvaj na telefon";
  btn.addEventListener("click", installApp);
  document.body.appendChild(btn);
}

async function installApp() {
  if (!deferredPrompt) {
    showMessage("Na iPhone-u: Share → Add to Home Screen.", "info");
    return;
  }

  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;

  if (choice.outcome === "accepted") {
    showMessage("Aplikacija je dodata na telefon.", "success");
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
  showMessage,
  formatDate,
  escapeHtml,
  escapeJs,
  checkSalonAccess,
  saveCurrentSalon,
  getSavedSalonSlug,
  clearSavedSalon,
  installApp
};
