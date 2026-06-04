// assets/js/pwa-head.js
// CityStyle v1.3.41 - early manifest identity for platform/profile PWA.
// Runs before the main app so Android Chrome sees a manifest immediately.
(function cityStyleEarlyPwaHead() {
  const VERSION = "v251_buttons_mobile_laptop_fit";
  const FALLBACK_ICON_192 = "/assets/icons/icon-192-maskable.png";
  const FALLBACK_ICON_512 = "/assets/icons/icon-512-maskable.png";

  function getParam(name) {
    try { return new URLSearchParams(window.location.search || "").get(name) || ""; }
    catch (err) { return ""; }
  }

  function safeText(value, fallback) {
    return String(value || fallback || "CityStyle").replace(/[<>]/g, "").trim() || fallback || "CityStyle";
  }

  function titleFromCode(value) {
    const clean = safeText(value, "CityStyle profil");
    if (/^cs_p_/i.test(clean)) return "CityStyle profil";
    return clean.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  function makeManifestBlobUrl(manifest) {
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    return URL.createObjectURL(blob);
  }

  function setManifest(manifest) {
    try {
      let link = document.querySelector('link[rel="manifest"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "manifest";
        document.head.appendChild(link);
      }
      link.href = makeManifestBlobUrl(manifest);
    } catch (err) {
      let link = document.querySelector('link[rel="manifest"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "manifest";
        document.head.appendChild(link);
      }
      link.href = `/manifest.json?v=${VERSION}`;
    }
  }

  function baseManifest() {
    return {
      id: "/?platform=1",
      name: "CityStyle.app - QR mini aplikacija za biznis",
      short_name: "CityStyle",
      description: "CityStyle.app je QR mini aplikacija za lokalne biznise.",
      start_url: `/?platform=1&v=${VERSION}`,
      scope: "/",
      display: "standalone",
      background_color: "#0b0b0f",
      theme_color: "#b91c1c",
      orientation: "portrait",
      icons: [
        { src: FALLBACK_ICON_192, sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: FALLBACK_ICON_512, sizes: "512x512", type: "image/png", purpose: "any maskable" }
      ]
    };
  }

  const profileCode = getParam("profile");
  const salonSlug = getParam("salon");
  const ownerPanel = getParam("panel") === "1" || getParam("owner") === "1";
  const identity = profileCode || salonSlug;

  if (!identity) {
    setManifest(baseManifest());
    return;
  }

  const nameHint = safeText(getParam("name"), titleFromCode(identity));
  const encoded = encodeURIComponent(identity);
  const mode = ownerPanel ? "owner" : "profile";
  const appName = ownerPanel ? `${nameHint} Panel` : nameHint;
  const shortName = appName.length > 18 ? appName.slice(0, 18).trim() : appName;
  const startParam = profileCode ? `profile=${encoded}` : `salon=${encoded}`;

  setManifest({
    id: `/pwa/${mode}/${encoded}`,
    name: appName,
    short_name: shortName || "Profil",
    description: ownerPanel ? `Panel vlasnika za ${nameHint}.` : `Prečica za direktan ulaz u profil: ${nameHint}.`,
    start_url: `/?${startParam}${ownerPanel ? "&panel=1" : ""}&pwa=1&v=${VERSION}`,
    scope: "/",
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: "#b91c1c",
    orientation: "portrait",
    icons: [
      { src: FALLBACK_ICON_192, sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: FALLBACK_ICON_512, sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  });
})();
