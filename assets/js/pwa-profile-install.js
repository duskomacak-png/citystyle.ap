// assets/js/pwa-profile-install.js
// Profile install gateway for CityStyle public_profile_code links.

let deferredProfileInstallPrompt = null;
let loadedProfile = null;
let profilePublicUrl = "/";

const qs = new URLSearchParams(window.location.search || "");
const profileCode = String(qs.get("profile") || qs.get("salon") || "").trim();
const fallbackSlug = String(qs.get("slug") || "").trim();

function $(id) { return document.getElementById(id); }
function setStatus(text) { const el = $("install-status"); if (el) el.textContent = text; }
function safeText(value, fallback = "") { return String(value || fallback || "").trim(); }
function appBaseUrl() { return `${window.location.origin}/`; }
function isStandaloneMode() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches === true || window.navigator.standalone === true;
}
function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredProfileInstallPrompt = event;
  setStatus("Spremno: klikni dugme za sistemsku instalaciju ove posebne prečice.");
});

window.addEventListener("appinstalled", () => {
  setStatus("Prečica je dodata na početni ekran.");
});

function initialsFromName(name) {
  const parts = String(name || "CityStyle").trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map(p => p.charAt(0).toUpperCase()).join("") || "CS");
}

function makeInitialsIcon(name, bg = "#b91c1c") {
  try {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(bg) ? bg : "#b91c1c";
    ctx.fillRect(0,0,512,512);
    const grad = ctx.createRadialGradient(160,120,10,256,256,420);
    grad.addColorStop(0,"rgba(255,255,255,.25)");
    grad.addColorStop(1,"rgba(0,0,0,.22)");
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,512,512);
    ctx.fillStyle = "#fff";
    ctx.font = "800 180px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsFromName(name), 256, 270);
    return c.toDataURL("image/png");
  } catch (err) {
    return "/assets/icons/icon-512.png";
  }
}

async function imageCanLoad(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(false), 2500);
    img.onload = () => { clearTimeout(timer); resolve(true); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.src = url;
  });
}

function setManifest(profile) {
  const code = encodeURIComponent(profile.code || profileCode || profile.slug || "citystyle");
  const name = safeText(profile.name, "CityStyle profil");
  const shortName = name.length > 18 ? name.slice(0, 18).trim() : name;
  const icon = profile.safeIcon || "/assets/icons/icon-192.png";
  const icon512 = profile.safeIcon512 || icon || "/assets/icons/icon-512.png";
  const manifest = {
    id: `/pwa/profile/${code}`,
    name,
    short_name: shortName,
    description: `CityStyle prečica za ${name}.`,
    start_url: `/p/?profile=${code}&pwa=1&v=v140multipwa`,
    scope: "/p/",
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: profile.themeColor || "#b91c1c",
    orientation: "portrait",
    icons: [
      { src: icon, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  };

  const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
  const url = URL.createObjectURL(blob);
  const link = $("pwa-manifest") || document.querySelector('link[rel="manifest"]') || document.createElement("link");
  link.rel = "manifest";
  link.href = url;
  if (!link.parentNode) document.head.appendChild(link);

  const appleIcon = $("pwa-apple-icon") || document.querySelector('link[rel="apple-touch-icon"]') || document.createElement("link");
  appleIcon.rel = "apple-touch-icon";
  appleIcon.href = icon;
  if (!appleIcon.parentNode) document.head.appendChild(appleIcon);
  document.title = `Instaliraj: ${name}`;
  const metaName = document.querySelector('meta[name="application-name"]') || document.createElement("meta");
  metaName.name = "application-name";
  metaName.content = name;
  if (!metaName.parentNode) document.head.appendChild(metaName);
}

async function fetchProfile() {
  if (!window.db) return null;
  let salon = null;

  if (profileCode) {
    try {
      const { data, error } = await window.db.from("salons")
        .select("*")
        .eq("public_profile_code", profileCode)
        .eq("status", "active")
        .eq("is_deleted", false)
        .maybeSingle();
      if (!error && data) salon = data;
    } catch (err) {
      console.warn("Profile code lookup failed:", err);
    }
  }

  if (!salon && (fallbackSlug || profileCode)) {
    const slug = fallbackSlug || profileCode;
    try {
      const { data } = await window.db.from("salons")
        .select("*")
        .eq("slug", slug)
        .eq("status", "active")
        .eq("is_deleted", false)
        .maybeSingle();
      if (data) salon = data;
    } catch (err) {}
  }

  if (!salon?.id) return null;

  let settings = null;
  let firstImage = null;
  try {
    const { data } = await window.db.from("salon_settings").select("*").eq("salon_id", salon.id).maybeSingle();
    settings = data || null;
  } catch (err) {}
  try {
    const { data } = await window.db.from("home_images").select("image_url").eq("salon_id", salon.id).eq("active", true).order("sort_order", { ascending: true }).limit(1);
    firstImage = data?.[0]?.image_url || null;
  } catch (err) {}

  const name = settings?.welcome_title || salon.salon_name || "CityStyle profil";
  const logo = settings?.logo_url || settings?.cover_image_url || settings?.home_image_url || firstImage || "";
  const theme = salon.theme_color && String(salon.theme_color).startsWith("#") ? salon.theme_color : "#b91c1c";
  let safeIcon = makeInitialsIcon(name, theme);
  let safeIcon512 = safeIcon;

  // Browser may accept a public PNG/JPG/WEBP logo as icon. If it cannot load quickly, fallback stays active.
  if (logo && await imageCanLoad(logo)) {
    safeIcon = logo;
    safeIcon512 = logo;
  }

  return {
    code: salon.public_profile_code || profileCode || salon.slug,
    slug: salon.slug,
    name,
    logo,
    safeIcon,
    safeIcon512,
    themeColor: theme
  };
}

async function init() {
  $("profile-code-label").textContent = profileCode || fallbackSlug || "nema-koda";
  setManifest({ code: profileCode || fallbackSlug || "citystyle", name: "CityStyle profil", safeIcon: "/assets/icons/icon-192.png", safeIcon512: "/assets/icons/icon-512.png" });

  try {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.register("/sw.js?v=v140multipwa", { scope: "/" });
    }
  } catch (err) {
    console.warn("Service worker nije registrovan:", err);
  }

  const profile = await fetchProfile();
  loadedProfile = profile;
  if (profile) {
    profilePublicUrl = `${appBaseUrl()}?profile=${encodeURIComponent(profile.code || profileCode)}`;
    $("profile-name").textContent = profile.name;
    $("profile-subtitle").textContent = "Posebna prečica za ovaj profil.";
    $("profile-icon").src = profile.logo || profile.safeIcon || "/assets/icons/icon-192.png";
    $("open-profile-link").href = profilePublicUrl;
    setManifest(profile);
    setStatus(deferredProfileInstallPrompt ? "Spremno za instalaciju." : "Ako se sistemska instalacija ne pojavi za par sekundi, otvori meni browsera → Dodaj na početni ekran.");
  } else {
    profilePublicUrl = `${appBaseUrl()}?profile=${encodeURIComponent(profileCode || fallbackSlug || "")}`;
    $("profile-name").textContent = "CityStyle profil";
    $("profile-subtitle").textContent = "Nisam uspeo da učitam profil, koristi se siguran CityStyle fallback.";
    $("open-profile-link").href = profilePublicUrl;
    setStatus("Profil nije učitan iz baze. Instalacija može koristiti fallback ime i ikonu.");
  }
}

async function handleInstallClick() {
  if (deferredProfileInstallPrompt) {
    try {
      deferredProfileInstallPrompt.prompt();
      const choice = await deferredProfileInstallPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        setStatus("Instalacija je prihvaćena. Proveri početni ekran telefona.");
      } else {
        setStatus("Instalacija je otkazana. Možeš probati opet ili koristiti meni browsera → Dodaj na početni ekran.");
      }
    } catch (err) {
      setStatus("Chrome nije dozvolio automatsku instalaciju. Koristi meni browsera → Dodaj na početni ekran.");
    } finally {
      deferredProfileInstallPrompt = null;
    }
    return;
  }

  const isAndroid = /Android/i.test(navigator.userAgent || "");
  if (isStandaloneMode() && isAndroid) {
    setStatus("Otvaram ovaj profil u Chrome browseru. Tamo klikni ponovo instalaciju ili meni → Dodaj na početni ekran.");
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("chrome", "1");
      url.searchParams.set("t", Date.now().toString());
      const intentUrl = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
      window.location.href = intentUrl;
      return;
    } catch (err) {}
  }

  setStatus("Chrome nije poslao install signal za ovaj profil. Otvori meni browsera sa tri tačke i izaberi Dodaj na početni ekran. Ovo je ograničenje browsera kad već postoji druga CityStyle prečica.");
}

async function copyProfileLink() {
  const link = profilePublicUrl || window.location.href;
  try {
    await navigator.clipboard.writeText(link);
    setStatus("Link profila je kopiran.");
  } catch (err) {
    window.prompt("Kopiraj link profila:", link);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  init();
  $("install-btn")?.addEventListener("click", handleInstallClick);
  $("copy-link-btn")?.addEventListener("click", copyProfileLink);
});
