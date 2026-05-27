// assets/js/pwa-head.js
// CityStyle v1.3.39: early profile manifest bootstrap.
// Purpose: give Android/Chrome a unique PWA identity as early as possible for each salon/shop profile.
(function () {
  "use strict";

  const VERSION = "v139multipwa";
  const FALLBACK_ICON_192 = "/assets/icons/icon-192.png";
  const FALLBACK_ICON_512 = "/assets/icons/icon-512.png";

  function getBaseUrl() {
    return window.location.origin + "/";
  }

  function getParam(name) {
    try { return new URLSearchParams(window.location.search || "").get(name) || ""; }
    catch (_) { return ""; }
  }

  function cleanText(value, fallback) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text || fallback || "CityStyle profil";
  }

  function shortName(name) {
    const text = cleanText(name, "Profil");
    return text.length > 18 ? text.slice(0, 18).trim() : text;
  }

  function initials(name) {
    const parts = cleanText(name, "CS").split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map(p => p[0]).join("") || "CS").toUpperCase();
  }

  function makeInitialsIcon(name, bg) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(bg || "") ? bg : "#b91c1c";
      ctx.fillRect(0, 0, 512, 512);
      const grad = ctx.createRadialGradient(165, 105, 20, 256, 256, 410);
      grad.addColorStop(0, "rgba(255,255,255,.28)");
      grad.addColorStop(1, "rgba(0,0,0,.22)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "rgba(255,255,255,.96)";
      ctx.font = "bold 178px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials(name), 256, 270);
      return canvas.toDataURL("image/png");
    } catch (_) {
      return FALLBACK_ICON_512;
    }
  }

  function timeout(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
  }

  async function makeIconFromImage(url, name, bg) {
    const src = String(url || "").trim();
    if (!src || !/^https?:\/\//i.test(src)) return makeInitialsIcon(name, bg);
    try {
      const dataUrl = await Promise.race([
        new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              canvas.width = 512;
              canvas.height = 512;
              const ctx = canvas.getContext("2d");
              ctx.fillStyle = "#0b0b0f";
              ctx.fillRect(0, 0, 512, 512);
              const scale = Math.max(512 / img.naturalWidth, 512 / img.naturalHeight);
              const w = img.naturalWidth * scale;
              const h = img.naturalHeight * scale;
              const x = (512 - w) / 2;
              const y = (512 - h) / 2;
              ctx.drawImage(img, x, y, w, h);
              // Small dark overlay improves tiny-icon readability if logo/photo is bright.
              const grad = ctx.createLinearGradient(0, 0, 0, 512);
              grad.addColorStop(0, "rgba(0,0,0,.04)");
              grad.addColorStop(1, "rgba(0,0,0,.16)");
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, 512, 512);
              resolve(canvas.toDataURL("image/png"));
            } catch (err) { reject(err); }
          };
          img.onerror = reject;
          img.src = src + (src.includes("?") ? "&" : "?") + "pwa_icon=" + Date.now();
        }),
        timeout(1800)
      ]);
      return dataUrl || makeInitialsIcon(name, bg);
    } catch (err) {
      console.warn("CityStyle PWA: logo nije prihvaćen za ikonicu, koristi se stabilna/initials ikonica.", err);
      return makeInitialsIcon(name, bg);
    }
  }

  function setManifest(manifest) {
    try {
      const json = JSON.stringify(manifest);
      const blob = new Blob([json], { type: "application/manifest+json" });
      const href = URL.createObjectURL(blob);
      let link = document.querySelector('link[rel="manifest"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "manifest";
        document.head.appendChild(link);
      }
      link.id = "citystyle-dynamic-manifest";
      link.href = href;
    } catch (err) {
      console.warn("CityStyle PWA: manifest nije postavljen.", err);
    }
  }

  function setTitleAndIcon(name, icon) {
    try {
      document.title = cleanText(name, "CityStyle");
      let appName = document.querySelector('meta[name="application-name"]');
      if (!appName) {
        appName = document.createElement("meta");
        appName.name = "application-name";
        document.head.appendChild(appName);
      }
      appName.content = cleanText(name, "CityStyle");
      let apple = document.querySelector('link[rel="apple-touch-icon"]');
      if (!apple) {
        apple = document.createElement("link");
        apple.rel = "apple-touch-icon";
        document.head.appendChild(apple);
      }
      apple.href = icon || FALLBACK_ICON_192;
    } catch (_) {}
  }


  function themeToHex(value) {
    const theme = String(value || "").trim().toLowerCase();
    const map = {
      "classic-red": "#b91c1c",
      "ocean-blue": "#2563eb",
      "luxury-gold": "#b7791f",
      "emerald-green": "#059669",
      "royal-purple": "#7c3aed",
      "soft-pink": "#db2777",
      "graphite-dark": "#111827",
      "orange-pro": "#ea580c"
    };
    if (/^#[0-9a-f]{6}$/i.test(theme)) return theme;
    return map[theme] || "#b91c1c";
  }

  function buildManifest({ code, slug, name, icon, theme, owner }) {
    const safeCode = encodeURIComponent(code || slug || "citystyle");
    const safeSlug = encodeURIComponent(slug || code || "citystyle");
    const appName = owner ? `${cleanText(name, "CityStyle")} Panel` : cleanText(name, "CityStyle profil");
    const start = code
      ? `/?profile=${safeCode}&pwa_profile=${safeCode}&v=${VERSION}`
      : `/?salon=${safeSlug}&pwa_profile=${safeSlug}&v=${VERSION}`;
    return {
      id: owner ? `/pwa/owner/${safeCode}` : `/pwa/profile/${safeCode}`,
      name: appName,
      short_name: shortName(appName),
      description: owner ? `Panel vlasnika: ${appName}.` : `CityStyle prečica za profil: ${appName}.`,
      start_url: owner ? `/salon/?pwa_owner=1&v=${VERSION}` : start,
      scope: "/",
      display: "standalone",
      background_color: "#0b0b0f",
      theme_color: themeToHex(theme),
      orientation: "portrait",
      icons: [
        { src: icon || FALLBACK_ICON_192, sizes: "192x192", purpose: "any" },
        { src: icon || FALLBACK_ICON_512, sizes: "512x512", purpose: "any" },
        { src: FALLBACK_ICON_192, sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: FALLBACK_ICON_512, sizes: "512x512", type: "image/png", purpose: "any maskable" }
      ]
    };
  }

  async function fetchSalonByProfileOrSlug(identifier) {
    if (!identifier || !window.db) return null;
    const id = String(identifier).trim();
    const baseSelect = "*";

    async function query(column) {
      try {
        const res = await window.db
          .from("salons")
          .select(baseSelect)
          .eq(column, id)
          .eq("status", "active")
          .eq("is_deleted", false)
          .maybeSingle();
        if (res.error) throw res.error;
        return res.data || null;
      } catch (err) {
        console.warn(`CityStyle PWA: ${column} lookup nije uspeo`, err);
        return null;
      }
    }

    let salon = null;
    if (id.startsWith("cs_p_")) salon = await query("public_profile_code");
    if (!salon) salon = await query("slug");
    if (!salon && !id.startsWith("cs_p_")) salon = await query("public_profile_code");
    return salon;
  }

  async function fetchProfileDetails(salon) {
    const out = { settings: null, firstImage: "" };
    if (!salon?.id || !window.db) return out;
    try {
      const { data } = await window.db.from("salon_settings").select("*").eq("salon_id", salon.id).maybeSingle();
      out.settings = data || null;
    } catch (err) { console.warn("CityStyle PWA: settings nisu učitane", err); }
    try {
      const { data } = await window.db
        .from("home_images")
        .select("image_url")
        .eq("salon_id", salon.id)
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(1);
      out.firstImage = data?.[0]?.image_url || "";
    } catch (_) {}
    return out;
  }

  async function init() {
    const params = new URLSearchParams(window.location.search || "");
    const profileCode = params.get("profile") || "";
    const salonSlug = params.get("salon") || "";
    const isProfilePage = !!profileCode || !!salonSlug;

    if (!isProfilePage) return;

    const fallbackName = profileCode ? "CityStyle profil" : cleanText(salonSlug.replace(/[-_]+/g, " "), "CityStyle profil");
    const fallbackIcon = makeInitialsIcon(fallbackName, "#b91c1c");
    const earlyCode = profileCode || salonSlug;
    setManifest(buildManifest({ code: profileCode || "", slug: salonSlug || "", name: fallbackName, icon: fallbackIcon, theme: "#b91c1c" }));
    setTitleAndIcon(fallbackName, fallbackIcon);

    const boot = { profileCode, salonSlug, salon: null, settings: null, icon: fallbackIcon, ready: false };
    window.__CITYSTYLE_PROFILE_BOOTSTRAP = boot;

    try {
      const salon = await fetchSalonByProfileOrSlug(profileCode || salonSlug);
      if (!salon) return;
      const details = await fetchProfileDetails(salon);
      const settings = details.settings || {};
      const publicName = cleanText(settings.welcome_title || salon.salon_name, fallbackName);
      const logo = settings.logo_url || settings.cover_image_url || settings.home_image_url || details.firstImage || "";
      const theme = salon.theme_color || "#b91c1c";
      const icon = await makeIconFromImage(logo, publicName, themeToHex(theme));
      boot.salon = salon;
      boot.settings = settings;
      boot.icon = icon;
      boot.ready = true;
      const finalCode = salon.public_profile_code || profileCode || salon.slug || salonSlug || earlyCode;
      setManifest(buildManifest({ code: finalCode, slug: salon.slug, name: publicName, icon, theme }));
      setTitleAndIcon(publicName, icon);
    } catch (err) {
      console.warn("CityStyle PWA: profil manifest fallback ostaje aktivan", err);
    }
  }

  window.__cityStyleSetProfileManifest = async function (payload) {
    const name = cleanText(payload?.name, "CityStyle profil");
    const logo = payload?.iconUrl || payload?.logoUrl || "";
    const theme = payload?.themeColor || "#b91c1c";
    const icon = await makeIconFromImage(logo, name, themeToHex(theme));
    setManifest(buildManifest({ code: payload?.profileCode || "", slug: payload?.slug || "", name, icon, theme, owner: !!payload?.owner }));
    setTitleAndIcon(payload?.owner ? `${name} Panel` : name, icon);
    return icon;
  };

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    window.__CITYSTYLE_DEFERRED_PROMPT = event;
    window.dispatchEvent(new CustomEvent("citystyle:install-ready"));
  });

  init();
})();
