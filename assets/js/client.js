// assets/js/client.js

let currentSalon = null;
let services = [];
let products = [];
let galleryImages = [];
let garageListings = [];
let selectedService = null;
let selectedDate = null;
let selectedTime = null;
let ownerPreviewMode = false;
let adminPreviewMode = false;
const C = (key, fallback = "") => window.App?.t ? window.App.t(key, fallback) : (fallback || key);
const CITYSTYLE_POWERED = "powered by CityStyle.app";
function renderCityStylePowered(className = "") {
  return `<div class="citystyle-powered ${className}">${CITYSTYLE_POWERED}</div>`;
}


function clientHasGaragePackage() {
  const pkg = String(currentSalon?.package_type || "business").trim().toLowerCase();
  return pkg.startsWith("garage_") || pkg === "custom";
}


const VISIT_SOURCE_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  kupujemprodajem: "KupujemProdajem",
  polovniautomobili: "PolovniAutomobili",
  qr: "QR kod / štampa",
  google: "Google",
  direct: "Direktan link",
  other: "Ostalo"
};

function normalizeVisitSource(raw = "") {
  const value = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["fb", "facebook", "meta"].includes(value)) return "facebook";
  if (["ig", "instagram"].includes(value)) return "instagram";
  if (["tt", "tiktok"].includes(value)) return "tiktok";
  if (["kp", "kupujemprodajem"].includes(value)) return "kupujemprodajem";
  if (["pa", "polovniautomobili", "polovniautomobili"].includes(value)) return "polovniautomobili";
  if (["qr", "stamp", "stampa", "print"].includes(value)) return "qr";
  if (["google"].includes(value)) return "google";
  if (["direct", "direktno"].includes(value)) return "direct";
  return "";
}

function detectVisitSource() {
  const fromParam = normalizeVisitSource(window.App?.getUrlParam("src") || "");
  if (fromParam) return fromParam;
  const ref = String(document.referrer || "").toLowerCase();
  if (!ref) return "direct";
  if (ref.includes("facebook") || ref.includes("fb.")) return "facebook";
  if (ref.includes("instagram")) return "instagram";
  if (ref.includes("tiktok")) return "tiktok";
  if (ref.includes("kupujemprodajem")) return "kupujemprodajem";
  if (ref.includes("polovniautomobili")) return "polovniautomobili";
  if (ref.includes("google")) return "google";
  return "other";
}

async function recordProfileVisitIfNeeded(salon) {
  try {
    if (!salon?.id || !window.db) return;
    if (ownerPreviewMode || adminPreviewMode) return;
    const source = detectVisitSource();
    const key = `citystyle_visit_${salon.id}_${source}`;
    const now = Date.now();
    const last = Number(localStorage.getItem(key) || 0);
    // Ne brojimo svako osvežavanje stranice kao novu posetu.
    if (last && now - last < 30 * 60 * 1000) return;
    localStorage.setItem(key, String(now));
    await window.db.from("profile_visits").insert({
      salon_id: salon.id,
      source
    });
  } catch (err) {
    console.warn("Statistika posete nije upisana:", err);
  }
}


document.addEventListener("DOMContentLoaded", () => {
  loadClientApp();
});

async function loadClientApp() {
  const app = document.getElementById("app");

  try {
    const urlProfileCode = window.App?.getUrlParam("profile");
    const urlSlug = window.App?.getUrlParam("salon") || urlProfileCode;
    const forcePlatform = window.App?.getUrlParam("platform") === "1" || window.App?.getUrlParam("home") === "1";
    const wantsAdminPreview = window.App?.getUrlParam("adminPreview") === "1" || window.App?.getUrlParam("preview") === "admin";
    adminPreviewMode = wantsAdminPreview && await window.Auth?.isPlatformAdmin?.();
    ownerPreviewMode = !adminPreviewMode && (window.App?.getUrlParam("ownerPreview") === "1" || window.App?.getUrlParam("preview") === "owner");

    // QR/link salon page: ?salon=slug
    // If admin/owner opens preview, do NOT save this as client shortcut.
    if (urlSlug) {
      app.innerHTML = `<div class="loading-box">${C("loadingProfile", "Učitavanje profila...")}</div>`;
      await loadSalon(urlSlug, !(ownerPreviewMode || adminPreviewMode));
      return;
    }

    // If an owner is already logged in on this device, open the owner panel directly.
    // This works both in the installed PWA and in a normal browser, so owners do not
    // have to type email + company code every time they open citystyle.app.
    // Public QR/profile links are handled above by ?salon=slug and are not affected.
    const isStandalone = window.App?.isStandaloneMode?.() === true;
    const ownerSession = window.App?.getLocal?.(window.APP_CONFIG?.salonSessionKey || "citystyle_salon_session");
    if (!forcePlatform && ownerSession?.salon_id) {
      window.location.href = window.App.getAppPath("salon/");
      return;
    }

    // Root citystyle.app in normal browser is the platform landing page when there is no saved owner login.
    // If the app was installed from a public profile page, open that saved profile directly.
    const savedSlug = window.App?.getSavedSalonSlug?.();
    if (savedSlug && isStandalone) {
      app.innerHTML = `<div class="loading-box">${C("loadingProfile", "Učitavanje profila...")}</div>`;
      await loadSalon(savedSlug, false);
      return;
    }

    await renderPlatformLanding();
  } catch (err) {
    console.error("CityStyle start error:", err);
    renderPlatformLanding();
  }
}

async function loadSalon(slug, saveThisSalon = true) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="loading-box">${C("loadingProfile", "Učitavanje profila...")}</div>`;

  const { data: salon, error } = await window.App.checkSalonAccess(slug);

  if (error || !salon) {
    app.innerHTML = `
      <div class="card center">
        <h2>${C("onlineUnavailableTitle", "Online zakazivanje trenutno nije dostupno")}</h2>
        <p class="muted">${C("onlineUnavailableText", "Online zahtev trenutno nije dostupan za ovaj profil.")}</p>
        <button class="btn btn-dark" type="button" onclick="renderPlatformLanding()">${C("platformHome", "Početna strana platforme")}</button>
      </div>
    `;
    return;
  }

  currentSalon = salon;
  window.App?.setAppLanguage?.(salon.app_language || "sr");
  window.App?.applySalonTheme?.(salon.theme_color);
  if (saveThisSalon) window.App.saveCurrentSalon(salon.slug);
  recordProfileVisitIfNeeded(salon);

  await loadServices();
  await loadProducts();
  await loadGalleryImages();
  await loadGarageListings();
  await renderSalonHome();
}

async function loadPlatformHomeImagesForLanding() {
  try {
    if (!window.db) return [];
    const { data, error } = await window.db
      .from("platform_home_images")
      .select("image_url, caption, sort_order, active")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) {
      console.warn("Slike za početnu nisu dostupne:", error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn("Slike za početnu nisu učitane:", err);
    return [];
  }
}

async function renderPlatformLanding() {
  window.App?.clearSalonTheme?.();
  window.App?.setAppLanguage?.("sr");
  currentSalon = null;
  services = [];
  products = [];
  galleryImages = [];
  garageListings = [];
  selectedService = null;
  selectedDate = null;
  selectedTime = null;

  const app = document.getElementById("app");
  const phoneImages = await loadPlatformHomeImagesForLanding();
  const safeImages = phoneImages.map((item, index) => ({
    url: escapeHtml(item.image_url || ""),
    caption: escapeHtml(item.caption || "CityStyle.app"),
    index
  })).filter(item => item.url);

  const phoneDisplay = safeImages.length ? `
    <div class="cs-phone-gallery-card cs-phone-gallery-card--minimal" data-gallery-count="${Math.min(safeImages.length, 30)}">
      <div class="cs-phone-gallery-slides" aria-label="Slike koje admin dodaje za početnu stranicu">
        ${safeImages.slice(0, 30).map((item, i) => `
          <img class="cs-phone-slide ${i === 0 ? "active" : ""}" data-index="${i}" src="${item.url}" alt="CityStyle početna slika ${i + 1}">
        `).join("")}
      </div>
      <div class="cs-phone-gallery-dots" aria-label="Slajd slike na početnoj">
        ${safeImages.slice(0, 10).map((_, i) => `<button type="button" class="${i === 0 ? "active" : ""}" data-index="${i}" aria-label="Prikaži sliku ${i + 1}"></button>`).join("")}
      </div>
    </div>
  ` : `
    <div class="cs-phone-fallback-profile cs-phone-fallback-minimal" aria-label="Primer CityStyle aplikacije">
      <div class="cs-phone-fallback-glow"></div>
      <div class="cs-phone-fallback-badge"></div>
      <span class="cs-phone-fallback-text">CityStyle</span>
    </div>
  `;

  app.innerHTML = `
    <section class="cs-minimal-home" aria-label="CityStyle.app početna">
      <h1 class="cs-minimal-title">CityStyle<span>.app</span></h1>

      <div class="cs-minimal-phone-wrap" aria-label="Telefon sa slikama aplikacije">
        <div class="cs-minimal-phone">
          <div class="cs-minimal-phone-notch"></div>
          <div class="cs-minimal-phone-screen">${phoneDisplay}</div>
        </div>
      </div>

      <div class="cs-minimal-owner-entry">
        <a class="btn btn-primary cs-minimal-owner-btn" href="salon/">Ulaz za vlasnike</a>
      </div>

      <div class="cs-minimal-legal-links">
        <button type="button" onclick="openLegalModal('terms')">Uslovi korišćenja</button>
        <button type="button" onclick="openLegalModal('privacy')">Politika privatnosti</button>
      </div>

      <a class="cs-minimal-admin-link" href="admin/">Admin</a>
    </section>
  `;
  initPlatformHomePhoneGallery(safeImages);
}

function initPlatformHomePhoneGallery(images) {
  if (window._platformHomeGalleryTimer) {
    clearInterval(window._platformHomeGalleryTimer);
    window._platformHomeGalleryTimer = null;
  }

  const card = document.querySelector(".cs-phone-gallery-card");
  if (!card || !Array.isArray(images) || !images.length) return;

  const slides = Array.from(card.querySelectorAll(".cs-phone-slide"));
  const dots = Array.from(card.querySelectorAll(".cs-phone-gallery-dots button"));
  const captionEl = card.querySelector(".cs-phone-gallery-caption");
  const counterEl = card.querySelector(".cs-phone-gallery-counter");
  const total = Math.min(slides.length, 30);
  let current = 0;

  function showSlide(nextIndex) {
    current = ((nextIndex % total) + total) % total;
    slides.forEach((slide, i) => slide.classList.toggle("active", i === current));
    dots.forEach((dot, i) => dot.classList.toggle("active", i === current));
    if (captionEl) captionEl.textContent = images[current]?.caption || "Galerija biznisa";
    if (counterEl) counterEl.textContent = `${current + 1} / ${total}`;
  }

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const index = Number(dot.dataset.index || 0);
      showSlide(index);
      if (window._platformHomeGalleryTimer) {
        clearInterval(window._platformHomeGalleryTimer);
      }
      if (total > 1) {
        window._platformHomeGalleryTimer = setInterval(() => showSlide(current + 1), 10000);
      }
    });
  });

  showSlide(0);
  if (total > 1) {
    window._platformHomeGalleryTimer = setInterval(() => showSlide(current + 1), 10000);
  }
}

function scrollToHowItWorks() {
  document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
}

function openLegalModal(type) {
  const existing = document.querySelector(".legal-modal-backdrop");
  if (existing) existing.remove();

  const isPrivacy = type === "privacy";
  const title = isPrivacy ? "Politika privatnosti" : "Uslovi korišćenja";
  const body = isPrivacy ? `
    <p>CityStyle.app poštuje privatnost korisnika i koristi podatke samo za rad aplikacije.</p>
    <h3>1. Koje podatke prikupljamo</h3>
    <p>Kada korisnik pošalje zahtev ili zakaže termin, mogu se čuvati ime, broj telefona ili WhatsApp kontakt, izabrana usluga, izabrani proizvod ili poruka, datum i vreme termina i napomena koju korisnik unese.</p>
    <p>Kada biznis koristi platformu, mogu se čuvati naziv biznisa, email vlasnika, kontakt telefon, adresa, logo, usluge, proizvodi, cene i podešavanja profila.</p>
    <h3>2. Zašto koristimo podatke</h3>
    <p>Podaci se koriste da bi korisnik mogao poslati zahtev biznisu, biznis mogao obraditi termine i upite, aplikacija prikazala javni profil, a vlasnik upravljao ponudom.</p>
    <h3>3. Ko vidi podatke</h3>
    <p>Podatke o zahtevu vidi biznis kome je zahtev poslat. CityStyle.app ne prodaje lične podatke trećim licima.</p>
    <h3>4. Brisanje podataka</h3>
    <p>Korisnik ili biznis može zatražiti brisanje podataka kontaktom na <a href="mailto:duskomacak@gmail.com">duskomacak@gmail.com</a>.</p>
    <h3>5. Bezbednost</h3>
    <p>CityStyle.app koristi tehničke mere za zaštitu podataka, ali nijedan internet sistem ne može garantovati apsolutnu sigurnost.</p>
    <h3>6. Kontakt</h3>
    <p>Za pitanja o privatnosti pišite na <a href="mailto:duskomacak@gmail.com">duskomacak@gmail.com</a>.</p>
  ` : `
    <p>Korišćenjem CityStyle.app platforme prihvatate ove uslove korišćenja.</p>
    <h3>1. Šta je CityStyle.app</h3>
    <p>CityStyle.app je digitalna platforma koja omogućava salonima, radnjama, servisima, majstorima i drugim biznisima da naprave svoj javni profil, prikažu usluge, proizvode, cene, radno vreme i primaju zahteve ili rezervacije od korisnika.</p>
    <p>CityStyle.app je tehnički alat. Platforma nije pružalac usluga koje objavljuju pojedinačni biznisi i ne prodaje proizvode ili usluge u njihovo ime.</p>
    <h3>2. Odgovornost biznisa</h3>
    <p>Svaki biznis samostalno odgovara za tačnost podataka, opis usluga i proizvoda, cene, popuste, kvalitet usluge, stanje proizvoda, zakazivanje, otkazivanje, izdavanje računa, poreze, reklamacije i zakonsko poslovanje.</p>
    <p>CityStyle.app ne proverava i ne garantuje tačnost podataka koje unose biznisi.</p>
    <h3>3. Odgovornost korisnika</h3>
    <p>Korisnik je odgovoran da pre zakazivanja ili kupovine proveri sve važne informacije direktno sa biznisom, uključujući cenu, termin, lokaciju, dostupnost proizvoda i uslove usluge.</p>
    <p>Dogovor između korisnika i biznisa je njihov samostalan odnos. CityStyle.app nije strana u tom dogovoru.</p>
    <h3>4. Termini i zahtevi</h3>
    <p>Slanje zahteva ili rezervacije preko CityStyle.app ne znači da je termin automatski potvrđen, osim ako biznis to jasno potvrdi. Biznis može prihvatiti, odbiti, izmeniti ili otkazati zahtev u skladu sa svojim pravilima.</p>
    <h3>5. Proizvodi i cene</h3>
    <p>Cene i dostupnost proizvoda unosi sam biznis. CityStyle.app ne garantuje da je proizvod dostupan, da je cena konačna ili da su informacije uvek ažurne.</p>
    <h3>6. Zabranjen sadržaj</h3>
    <p>Zabranjeno je unositi sadržaj koji je nezakonit, obmanjujući, uvredljiv, nasilan, diskriminatoran, pornografski, lažan ili štetan. CityStyle.app može ukloniti ili blokirati profil koji krši ova pravila.</p>
    <h3>7. Dostupnost aplikacije</h3>
    <p>CityStyle.app se trudi da aplikacija bude dostupna i stabilna, ali ne garantuje neprekidan rad bez grešaka, prekida, tehničkih problema ili gubitka internet konekcije.</p>
    <h3>8. Plaćanje korišćenja platforme</h3>
    <p>Korišćenje biznis profila može biti naplaćeno prema dogovorenoj mesečnoj ceni. Ako biznis ne plati dogovoreno korišćenje, CityStyle.app može privremeno ograničiti, pauzirati ili ukloniti profil.</p>
    <h3>9. Privatnost podataka</h3>
    <p>CityStyle.app može obrađivati podatke koje korisnik unese prilikom slanja zahteva, kao što su ime, telefon, poruka, izabrana usluga, proizvod ili termin. Detalji su opisani u Politici privatnosti.</p>
    <h3>10. Izmene uslova</h3>
    <p>CityStyle.app može povremeno izmeniti ove uslove. Nastavkom korišćenja platforme nakon izmene, korisnik prihvata ažurirane uslove.</p>
    <h3>11. Kontakt</h3>
    <p>Za pitanja, prijavu problema ili zahtev za uklanjanje podataka pišite na <a href="mailto:duskomacak@gmail.com">duskomacak@gmail.com</a>.</p>
  `;

  const modal = document.createElement("div");
  modal.className = "legal-modal-backdrop";
  modal.innerHTML = `
    <div class="legal-modal-card" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="legal-modal-head">
        <h2>${title}</h2>
        <button type="button" class="btn btn-dark" onclick="this.closest('.legal-modal-backdrop').remove()">Zatvori</button>
      </div>
      <div class="legal-modal-body">
        ${body}
        <p class="muted legal-small-note">Napomena: ovaj tekst je praktičan MVP tekst za platformu i nije zamena za individualni pravni savet.</p>
      </div>
    </div>
  `;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}

async function loadServices() {
  const { data, error } = await window.db
    .from("services")
    .select("*")
    .eq("salon_id", currentSalon.id)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);
    services = [];
    return;
  }
  services = data || [];
}

async function loadProducts() {
  if (!currentSalon?.id) {
    products = [];
    return;
  }
  const { data, error } = await window.db
    .from("products")
    .select("*")
    .eq("salon_id", currentSalon.id)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Products table/list is not available yet:", error);
    products = [];
    return;
  }
  products = data || [];
}


async function loadGalleryImages() {
  if (!currentSalon?.id) {
    galleryImages = [];
    return;
  }
  const { data, error } = await window.db
    .from("home_images")
    .select("*")
    .eq("salon_id", currentSalon.id)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.warn("Gallery images are not available yet:", error);
    galleryImages = [];
    return;
  }
  galleryImages = data || [];
}

async function loadGarageListings() {
  if (!currentSalon?.id || !clientHasGaragePackage()) {
    garageListings = [];
    return;
  }
  const { data, error } = await window.db
    .from("garage_listings")
    .select("*, garage_listing_images(*)")
    .eq("salon_id", currentSalon.id)
    .in("status", ["available", "reserved", "sold"])
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Garage listings are not available yet:", error);
    garageListings = [];
    return;
  }
  garageListings = (data || []).map(item => ({
    ...item,
    garage_listing_images: (item.garage_listing_images || []).sort((a,b) => Number(a.sort_order||100) - Number(b.sort_order||100))
  }));
}


function formatSalonWelcomeText(text = "") {
  const raw = String(text || "").trim();
  const cleanDefault = "Dobrodošli. Izaberite uslugu, datum i zakažite termin.";
  const type = window.App?.normalizeBusinessType ? window.App.normalizeBusinessType(currentSalon?.business_type) : "general";
  if ((type === "salon" || type === "general") && !raw) return cleanDefault;
  if (type !== "salon" && type !== "general") return raw;
  let value = raw;
  value = value.replace(/Dobrodošli\.\s*Izaberite uslugu, datum i slobodan termin i zakažite termin\.?/i, cleanDefault);
  value = value.replace(/Dobrodošli\.\s*Izaberite uslugu, datum i slobodan termin ili pošaljite zahtev\.?/i, cleanDefault);
  value = value.replace(/slobodan termin i zakažite termin/gi, "zakažite termin");
  value = value.replace(/slobodan termin ili pošaljite zahtev/gi, "zakažite termin");
  value = value.replace(/pošaljite zahtev/gi, "zakažite termin");
  return value || cleanDefault;
}

async function renderSalonHome() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="loading-box">${C("loadingProfile", "Učitavanje profila...")}</div>`;

  const { data: settings } = await window.db
    .from("salon_settings")
    .select("*")
    .eq("salon_id", currentSalon.id)
    .maybeSingle();

  const { data: workingHours } = await window.db
    .from("working_hours")
    .select("*")
    .eq("salon_id", currentSalon.id)
    .order("day_of_week", { ascending: true });

  const publicName = settings?.welcome_title || currentSalon.salon_name || "Profil";
  const profileLabels = window.App.getBusinessProfileLabels(currentSalon.business_type);
  const normalizedType = window.App.normalizeBusinessType(currentSalon.business_type);
  const isSalonBookingProfile = normalizedType === "salon" || normalizedType === "general";
  const primaryActionLabel = isSalonBookingProfile ? "Zakaži termin" : profileLabels.action;
  currentSalon._publicName = publicName;
  currentSalon._publicLogo = settings?.logo_url || "";
  currentSalon._publicPhone = settings?.phone || currentSalon.phone || "";
  window.App?.updateManifestForSalon?.(currentSalon.slug, { name: publicName, iconUrl: settings?.logo_url, themeColor: currentSalon.theme_color, profileCode: currentSalon.public_profile_code });

  app.innerHTML = `
    <section class="client-page salon-themed-page">
      ${adminPreviewMode ? `
        <div class="owner-preview-bar admin-preview-bar">
          <div>
            <strong>${C("adminClientPreviewTitle", "Admin pregled: korisnička strana")}</strong>
            <span>${C("adminClientPreviewText", "Ovako korisnik vidi ovaj profil. Ovo dugme vidi samo prijavljeni admin.")}</span>
          </div>
          <a class="btn btn-primary" href="${window.App.getAppPath('admin/')}">${C("backToAdmin", "Nazad u admin")}</a>
        </div>
      ` : ownerPreviewMode ? `
        <div class="owner-preview-bar">
          <div>
            <strong>${C("ownerPreviewTitle", "Pregled javne stranice")}</strong>
            <span>${C("ownerPreviewText", "Ovako korisnik vidi vaš profil.")}</span>
          </div>
          <a class="btn btn-primary" href="${window.App.getAppPath('salon/')}">${C("backToOwnerPanel", "Nazad u panel vlasnika")}</a>
        </div>
      ` : ""}
      <div class="hero-card salon-header">
        ${settings?.logo_url ? `
          <img src="${escapeHtml(settings.logo_url)}" alt="${escapeHtml(publicName)} logo" class="salon-logo">
        ` : `
          <div class="logo-circle">${escapeHtml(publicName?.charAt(0).toUpperCase() || "S")}</div>
        `}

        <h1>${escapeHtml(publicName)}</h1>
        <div class="public-profile-text">
          <p class="intro-text">${escapeHtml(formatSalonWelcomeText(settings?.welcome_text || C("welcomeDefault", "Dobrodošli. Izaberite uslugu, datum i zakažite termin.")))}</p>
          ${(settings?.phone || settings?.address) ? `
            <div class="public-profile-contact">
              ${settings?.phone ? `<a href="tel:${escapeHtml(window.App.normalizePhoneForTel ? window.App.normalizePhoneForTel(settings.phone) : settings.phone)}">📞 ${escapeHtml(settings.phone)}</a>` : ""}
              ${settings?.address ? renderPublicAddressLink(settings.address) : ""}
            </div>
          ` : ""}
        </div>

        <div class="client-actions ${isSalonBookingProfile ? 'client-actions-salon-grid' : ''}">
          ${isSalonBookingProfile && settings?.address ? renderPublicAddressAction(settings.address, 'Pronađi nas') : ''}
          ${isSalonBookingProfile && settings?.phone ? `<a class="btn btn-dark quick-action-btn phone-quick-btn" href="tel:${escapeHtml(csSafePhone(settings.phone))}"><span class="quick-action-icon quick-action-icon-phone">✆</span><span class="quick-action-label">Pozovi salon</span></a>` : ''}
          <button class="btn btn-primary" type="button" onclick="showBookingForm()">${escapeHtml(primaryActionLabel)}</button>
          ${(!isSalonBookingProfile && products.length) ? `<button class="btn btn-dark" type="button" onclick="showProducts()">${C("productsCatalog", "Proizvodi / cenovnik")}</button>` : ""}
          ${garageListings.length ? `<button class="btn btn-dark" type="button" onclick="showGarage()">Garaža / oglasi</button>` : ""}
          ${ownerPreviewMode ? "" : `<button class="btn btn-dark" type="button" onclick="installCurrentSalonApp()">${C("installThisProfile", "Preuzmi app")}</button>`}
        </div>
      </div>

      <div id="client-extra">
        ${renderClientServicesPreview()}
        ${renderClientProductsPreview()}
        ${renderClientGaragePreview()}
        ${renderClientGalleryPreview()}
        ${renderClientWorkingHours(workingHours || [])}
      </div>
      <div id="booking-box"></div>
    </section>
  `;
}




function getGoogleMapsUrl(address = "") {
  const clean = String(address || "").trim();
  if (!clean) return "";
  return `https://maps.google.com/?q=${encodeURIComponent(clean)}`;
}
function openCityStyleMaps(address = "") {
  const url = getGoogleMapsUrl(address);
  if (!url) return;
  window.open(url, "_blank", "noopener");
}
function renderPublicAddressLink(address = "", className = "shoe-meta-link") {
  const clean = String(address || "").trim();
  if (!clean) return "";
  const url = getGoogleMapsUrl(clean);
  const safeAddress = escapeHtml(clean);
  const safeUrl = escapeHtml(url);
  return `<a class="${className} maps-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">📍 ${safeAddress}</a>`;
}

function renderPublicAddressAction(address = "", label = "Pronađi nas") {
  const clean = String(address || "").trim();
  if (!clean) return "";
  const url = getGoogleMapsUrl(clean);
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `<a class="btn btn-dark quick-action-btn map-quick-btn maps-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"><span class="quick-action-icon">📍</span><span class="quick-action-label">${safeLabel}</span></a>`;
}

function renderGaragePrice(item = {}) {
  const price = Number(item.price || 0);
  const currency = window.App.normalizeCurrency(item.currency || "EUR");
  if (!price || price <= 0) return "Cena na upit";
  return `${window.App.formatMoney ? window.App.formatMoney(price) : price.toLocaleString("sr-RS")} ${currency}`;
}

function renderGarageStatus(status) {
  return { available: "Dostupno", reserved: "Rezervisano", sold: "Prodato" }[status] || "Dostupno";
}

function renderGarageMeta(item = {}) {
  return [item.brand, item.model, item.year ? String(item.year) : "", item.hours_km].filter(Boolean).join(" • ");
}

function renderClientGaragePreview() {
  if (!garageListings.length) return "";
  return `
    <details class="card client-hours-panel client-garage-panel" open>
      <summary>
        <span>Garaža / oglasi</span>
        <small>${garageListings.length} ponuda</small>
      </summary>
      <div class="garage-public-grid">
        ${garageListings.slice(0, 6).map(item => renderGaragePublicCard(item)).join("")}
      </div>
    </details>
  `;
}

function renderGaragePublicCard(item = {}) {
  const images = item.garage_listing_images || [];
  const cover = images[0]?.image_url || "";
  return `
    <article class="garage-public-card">
      <button type="button" class="garage-public-cover" onclick="openGarageListing('${escapeJs(item.id)}')">
        ${cover ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(item.title)}">` : `<span>Bez slike</span>`}
        <small>${images.length}/10 slika</small>
      </button>
      <div class="garage-public-info">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(renderGarageMeta(item))}</span>
        <b>${renderGaragePrice(item)}</b>
        <small>${renderGarageStatus(item.status)}</small>
        <button class="btn btn-primary btn-small" type="button" onclick="openGarageListing('${escapeJs(item.id)}')">Detalji / pitaj</button>
      </div>
    </article>`;
}

function showGarage() {
  const box = document.getElementById("client-extra");
  if (!box) return;
  if (!garageListings.length) {
    box.innerHTML = `<div class="card"><h2>Garaža / oglasi</h2><p class="muted">Ovaj profil trenutno nema javno prikazane oglase.</p></div>`;
    return;
  }
  box.innerHTML = `
    <details class="card client-hours-panel client-garage-panel" open>
      <summary><span>Garaža / oglasi</span><small>Sakrij listu</small></summary>
      <div class="garage-public-grid">${garageListings.map(item => renderGaragePublicCard(item)).join("")}</div>
    </details>`;
  box.scrollIntoView({ behavior: "smooth" });
}

function openGarageListing(listingId) {
  const item = garageListings.find(row => String(row.id) === String(listingId));
  if (!item) return;
  const images = item.garage_listing_images || [];
  const phone = currentSalon?._publicPhone || currentSalon?.phone || "";
  const message = encodeURIComponent(`Poštovani, interesuje me ponuda: ${item.title}. Da li je još dostupna?`);
  const whatsapp = phone ? `https://wa.me/${String(phone).replace(/\D/g, "")}?text=${message}` : "";
  const modal = document.createElement("div");
  modal.className = "modal-backdrop garage-detail-modal";
  modal.innerHTML = `
    <div class="modal-card garage-detail-card">
      <div class="garage-detail-head">
        <div>
          <h2>${escapeHtml(item.title)}</h2>
          <p class="muted">${escapeHtml(renderGarageMeta(item))}</p>
        </div>
        <button class="btn btn-dark" type="button" onclick="this.closest('.modal-backdrop').remove()">Zatvori</button>
      </div>
      <div class="garage-detail-gallery">
        ${images.length ? images.map(img => `<img src="${escapeHtml(img.image_url)}" alt="${escapeHtml(item.title)}">`).join("") : `<div class="garage-cover-placeholder">Bez slika</div>`}
      </div>
      <div class="garage-detail-info">
        <strong>${renderGaragePrice(item)}</strong>
        <span>${renderGarageStatus(item.status)}</span>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
      </div>
      <div class="modal-actions">
        ${whatsapp ? `<a class="btn btn-primary" href="${whatsapp}" target="_blank" rel="noopener">Pitaj preko WhatsApp-a</a>` : ""}
        <button class="btn btn-dark" type="button" onclick="showBookingForm(); this.closest('.modal-backdrop').remove();">Pošalji zahtev</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function renderClientGalleryPreview() {
  if (!galleryImages.length) return "";
  const previewLimit = 5;
  const previewImages = galleryImages.slice(0, previewLimit);
  const remaining = Math.max(0, galleryImages.length - previewImages.length);
  const headerCount = remaining > 0
    ? `${previewImages.length}/${galleryImages.length} • +${remaining}`
    : `${galleryImages.length}/${galleryImages.length}`;
  return `
    <details class="card client-hours-panel client-gallery-panel" open>
      <summary>
        <span>Galerija radova</span>
        <small>${headerCount}</small>
      </summary>
      <div class="public-gallery-grid public-gallery-grid-compact">
        ${previewImages.map((image, index) => `
          <button type="button" class="public-gallery-item" onclick="openPublicGalleryImage('${escapeJs(image.image_url)}', '${escapeJs(image.caption || '')}', ${index})">
            <img src="${escapeHtml(image.image_url)}" alt="${escapeHtml(image.caption || 'Galerija radova')}">
            ${image.caption ? `<span>${escapeHtml(image.caption)}</span>` : ""}
          </button>
        `).join("")}
        ${remaining > 0 ? `
          <button type="button" class="public-gallery-item public-gallery-more" aria-label="Prikaži još radova" onclick="openPublicGalleryOverview()">
            <strong>+${remaining}</strong>
            <span>Još radova</span>
          </button>
        ` : ""}
      </div>
    </details>
  `;
}

function openPublicGalleryOverview() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop gallery-lightbox";
  modal.innerHTML = `
    <div class="modal-card gallery-overview-card">
      <div class="gallery-overview-head">
        <h2>Galerija radova</h2>
        <button class="btn btn-dark btn-small" type="button" onclick="this.closest('.modal-backdrop').remove()">Zatvori</button>
      </div>
      <div class="public-gallery-grid gallery-overview-grid">
        ${galleryImages.map((image, index) => `
          <button type="button" class="public-gallery-item" onclick="this.closest('.modal-backdrop').remove(); openPublicGalleryImage('${escapeJs(image.image_url)}', '${escapeJs(image.caption || '')}', ${index})">
            <img src="${escapeHtml(image.image_url)}" alt="${escapeHtml(image.caption || 'Galerija radova')}">
            ${image.caption ? `<span>${escapeHtml(image.caption)}</span>` : ""}
          </button>
        `).join("")}
      </div>
    </div>`;
  document.body.appendChild(modal);
}


function openPublicGalleryImage(url, caption = "", index = null) {
  const safeIndex = Number.isFinite(Number(index))
    ? Math.max(0, Math.min(Number(index), Math.max(0, galleryImages.length - 1)))
    : Math.max(0, galleryImages.findIndex(img => String(img.image_url) === String(url)));
  const activeIndex = safeIndex >= 0 ? safeIndex : 0;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop gallery-lightbox gallery-zoom-backdrop";
  modal.innerHTML = `
    <div class="gallery-zoom-shell">
      <button class="gallery-zoom-close" type="button" aria-label="Zatvori galeriju" onclick="this.closest('.modal-backdrop').remove()">×</button>
      <div class="gallery-zoom-counter" id="gallery-zoom-counter"></div>
      <button class="gallery-nav-btn gallery-nav-prev" type="button" aria-label="Prethodna slika">‹</button>
      <button class="gallery-nav-btn gallery-nav-next" type="button" aria-label="Sledeća slika">›</button>
      <div class="gallery-zoom-stage">
        <img class="gallery-zoom-image" src="" alt="Galerija radova">
      </div>
      <p class="gallery-zoom-caption"></p>
      <div class="gallery-zoom-help">Prevucite gore/dole za sledeću sliku • raširite prstima za zoom</div>
    </div>`;
  document.body.appendChild(modal);
  setupGalleryZoom(modal, activeIndex);
}

function setupGalleryZoom(modal, startIndex = 0) {
  const img = modal.querySelector(".gallery-zoom-image");
  const stage = modal.querySelector(".gallery-zoom-stage");
  const captionEl = modal.querySelector(".gallery-zoom-caption");
  const counterEl = modal.querySelector("#gallery-zoom-counter");
  const prevBtn = modal.querySelector(".gallery-nav-prev");
  const nextBtn = modal.querySelector(".gallery-nav-next");

  const images = (galleryImages || []).filter(item => item && item.image_url);
  let currentIndex = images.length ? Math.max(0, Math.min(Number(startIndex) || 0, images.length - 1)) : 0;
  let scale = 1, startScale = 1, posX = 0, posY = 0, startX = 0, startY = 0, lastX = 0, lastY = 0;
  let activePointers = new Map();
  let lastTap = 0;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeStartTime = 0;

  function applyTransform() {
    img.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
  }

  function resetZoom() {
    scale = 1;
    posX = 0;
    posY = 0;
    applyTransform();
  }

  function renderImage(nextIndex) {
    if (!images.length) return;
    currentIndex = (nextIndex + images.length) % images.length;
    const item = images[currentIndex] || {};
    img.src = item.image_url || "";
    img.alt = item.caption || "Galerija radova";
    captionEl.textContent = item.caption || "";
    captionEl.style.display = item.caption ? "block" : "none";
    counterEl.textContent = `${currentIndex + 1}/${images.length}`;
    prevBtn.style.display = images.length > 1 ? "grid" : "none";
    nextBtn.style.display = images.length > 1 ? "grid" : "none";
    resetZoom();
  }

  function showPrev() { renderImage(currentIndex - 1); }
  function showNext() { renderImage(currentIndex + 1); }

  function pointerDistance() {
    const points = [...activePointers.values()];
    if (points.length < 2) return 0;
    const [a, b] = points;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  let startDistance = 0;

  stage.addEventListener("pointerdown", (event) => {
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId);
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
    swipeStartTime = Date.now();

    if (activePointers.size === 1) {
      startX = event.clientX - posX;
      startY = event.clientY - posY;
      lastX = event.clientX;
      lastY = event.clientY;
    } else if (activePointers.size === 2) {
      startDistance = pointerDistance();
      startScale = scale;
    }
  });

  stage.addEventListener("pointermove", (event) => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointers.size === 2) {
      const dist = pointerDistance();
      if (startDistance > 0) {
        scale = Math.min(4, Math.max(1, startScale * (dist / startDistance)));
        if (scale === 1) {
          posX = 0; posY = 0;
        }
        applyTransform();
      }
      return;
    }

    if (scale > 1 && activePointers.size === 1) {
      posX = event.clientX - startX;
      posY = event.clientY - startY;
      lastX = event.clientX;
      lastY = event.clientY;
      applyTransform();
    }
  });

  function finishPointer(event) {
    const dx = event.clientX - swipeStartX;
    const dy = event.clientY - swipeStartY;
    const dt = Date.now() - swipeStartTime;
    activePointers.delete(event.pointerId);

    if (scale <= 1.05 && images.length > 1 && dt < 650 && Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      if (dy < 0) showNext();   // swipe up
      else showPrev();          // swipe down
      return;
    }

    if (scale < 1.05) resetZoom();
  }

  stage.addEventListener("pointerup", finishPointer);
  stage.addEventListener("pointercancel", finishPointer);

  stage.addEventListener("dblclick", () => {
    if (scale > 1) resetZoom();
    else {
      scale = 2;
      applyTransform();
    }
  });

  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    scale = Math.min(4, Math.max(1, scale + (event.deltaY < 0 ? 0.2 : -0.2)));
    if (scale === 1) { posX = 0; posY = 0; }
    applyTransform();
  }, { passive: false });

  prevBtn.addEventListener("click", showPrev);
  nextBtn.addEventListener("click", showNext);

  modal.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") showPrev();
    if (event.key === "ArrowDown" || event.key === "ArrowRight") showNext();
    if (event.key === "Escape") modal.remove();
  });

  modal.tabIndex = -1;
  modal.focus();
  renderImage(currentIndex);
}

function installCurrentSalonApp() {
  if (!currentSalon?.slug && !currentSalon?.public_profile_code) return;
  window.App.installSalonApp(currentSalon, {
    name: currentSalon._publicName || currentSalon.salon_name || "CityStyle profil",
    iconUrl: currentSalon._publicLogo || "",
    themeColor: currentSalon.theme_color,
    profileCode: currentSalon.public_profile_code,
    slug: currentSalon.slug
  });
}

function renderClientServicesPreview() {
  const profileLabels = window.App.getBusinessProfileLabels(currentSalon?.business_type);
  if (!services.length) {
    return `
      <details class="card client-hours-panel client-services-panel">
        <summary>
          <span>${escapeHtml(profileLabels.services)}</span>
          <small>${C("noServicesSmall", "Nema dostupnih usluga")}</small>
        </summary>
        <div class="client-services-panel-body">
          <p class="muted">${C("noServicesText", "Trenutno nema dostupnih usluga za online zahtev.")}</p>
        </div>
      </details>
    `;
  }

  return `
    <details class="card client-hours-panel client-services-panel">
      <summary>
        <span>${escapeHtml(profileLabels.services)}</span>
        <small>${C("showList", "Prikaži listu")}</small>
      </summary>
      <div class="client-services-panel-body">
        <p class="muted">${C("chooseServiceText", "Izaberite uslugu za koju želite da pošaljete zahtev.")}</p>
        <div class="service-list">
          ${services.map(service => `
            <button class="service-select-card" type="button" onclick="selectServiceById('${service.id}')">
              <div><strong>${escapeHtml(service.name)}</strong><span>${service.category ? escapeHtml(service.category) + " • " : ""}${Number(service.duration_minutes || 0)} min</span>${service.description ? `<p class="muted service-public-description">${escapeHtml(service.description)}</p>` : ""}</div>
              <b>${window.App.formatServicePrice(service)}</b>
            </button>
          `).join("")}
        </div>
      </div>
    </details>
  `;
}

function renderProductPrice(product = {}) {
  const currency = window.App.normalizeCurrency(product.currency || "RSD");
  const price = Number(product.price || 0);
  if (!price || price <= 0) return C("priceByAgreement", "Cena po dogovoru");
  return `${window.App.formatMoney ? window.App.formatMoney(price) : price.toLocaleString("sr-RS")} ${currency}`;
}

function getProductStatusLabel(status) {
  return {
    available: "Na stanju",
    preorder: "Po porudžbini",
    out: "Trenutno nema",
    hidden: "Sakriveno"
  }[status] || "Na upit";
}

function renderPublicProductCard(product = {}, index = 0) {
  const imgs = typeof csProductImages === "function" ? csProductImages(product) : (product.image_url ? [product.image_url] : []);
  const img = imgs[0] || "";
  const click = typeof openShoeViewer === "function" ? ` onclick="openShoeViewer(${index})"` : "";
  return `
    <button class="product-public-card product-public-card-with-image" type="button"${click}>
      <div class="product-public-image-wrap">
        ${img ? `<img class="product-public-image" src="${escapeHtml(img)}" alt="${escapeHtml(product.name || 'Proizvod')}">` : `<div class="product-public-image product-public-no-image">Bez slike</div>`}
      </div>
      <div class="product-public-copy">
        <strong>${escapeHtml(product.name || "Proizvod")}</strong>
        ${product.category ? `<span>${escapeHtml(product.category)}</span>` : ""}
        ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ""}
      </div>
      <div class="product-public-meta">
        <b>${renderProductPrice(product)}</b>
        <small>${getProductStatusLabel(product.stock_status)}</small>
      </div>
    </button>
  `;
}

function renderClientProductsPreview() {
  if (!products.length) return "";
  return `
    <details class="card client-hours-panel client-products-panel">
      <summary>
        <span>${C("productsCatalog", "Proizvodi / cenovnik")}</span>
        <small>${C("showList", "Prikaži listu")}</small>
      </summary>
      <div class="client-services-panel-body">
        <p class="muted">Pregled proizvoda, artikala ili cenovnika koje ovaj biznis nudi. Dodir na proizvod otvara veću sliku.</p>
        ${renderProductRubricDropdown("client-rubric-filter")}
        <div id="clientProductGrid" class="product-public-grid product-public-grid-images">
          ${csFilteredProducts(products).map(product => renderPublicProductCard(product, csProductGlobalIndex(product))).join("")}
        </div>
      </div>
    </details>
  `;
}

function showProducts() {
  const box = document.getElementById("client-extra");
  if (!box) return;

  if (!products.length) {
    box.innerHTML = `<div class="card"><h2>${C("productsCatalog", "Proizvodi / cenovnik")}</h2><p class="muted">Ovaj profil trenutno nema javno prikazane proizvode.</p></div>`;
    return;
  }

  box.innerHTML = `
    <details class="card client-hours-panel client-products-panel" open>
      <summary>
        <span>${C("productsCatalog", "Proizvodi / cenovnik")}</span>
        <small>${C("hideList", "Sakrij listu")}</small>
      </summary>
      <div class="client-services-panel-body">
        ${renderProductRubricDropdown("client-rubric-filter")}
        <div id="clientProductGrid" class="product-public-grid">
          ${csFilteredProducts(products).map(product => `
            <div class="product-public-card">
              <div>
                <strong>${escapeHtml(product.name)}</strong>
                ${product.category ? `<span>${escapeHtml(product.category)}</span>` : ""}
                ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ""}
              </div>
              <div class="product-public-meta">
                <b>${renderProductPrice(product)}</b>
                <small>${getProductStatusLabel(product.stock_status)}</small>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </details>
  `;
  box.scrollIntoView({ behavior: "smooth" });
}

function renderClientWorkingHours(hours) {
  const dayNames = {
    1: C("monday", "Ponedeljak"),
    2: C("tuesday", "Utorak"),
    3: C("wednesday", "Sreda"),
    4: C("thursday", "Četvrtak"),
    5: C("friday", "Petak"),
    6: C("saturday", "Subota"),
    0: C("sunday", "Nedelja")
  };

  const today = new Date().getDay();
  const todayHours = (hours || []).find(row => Number(row.day_of_week) === today);
  const dayName = dayNames[today] || C("today", "Danas");

  let statusText = C("workingHoursNotSet", "Radno vreme nije podešeno za danas");
  let statusClass = "unknown";

  if (todayHours && !todayHours.is_closed) {
    statusText = `${String(todayHours.open_time || "").slice(0,5)}–${String(todayHours.close_time || "").slice(0,5)}`;
    statusClass = "open";
  } else if (todayHours && todayHours.is_closed) {
    statusText = C("closedToday", "Danas zatvoreno");
    statusClass = "closed";
  }

  return `
    <div class="card today-hours-card ${statusClass}">
      <div>
        <span>Današnje radno vreme</span>
        <strong>${escapeHtml(dayName)}</strong>
      </div>
      <b>${escapeHtml(statusText)}</b>
    </div>
  `;
}

function showServices() {
  const profileLabels = window.App.getBusinessProfileLabels(currentSalon?.business_type);
  const box = document.getElementById("client-extra");
  if (!box) return;

  if (!services.length) {
    box.innerHTML = `<div class="card"><h2>${escapeHtml(profileLabels.services)}</h2><p class="muted">${C("noServicesText", "Trenutno nema dostupnih usluga za online zahtev.")}</p></div>`;
    return;
  }

  box.innerHTML = `
    <details class="card client-hours-panel client-services-panel" open>
      <summary>
        <span>${escapeHtml(profileLabels.services)}</span>
        <small>${C("hideList", "Sakrij listu")}</small>
      </summary>
      <div class="client-services-panel-body">
        <div class="service-list">
          ${services.map(service => `
            <button class="service-select-card" type="button" onclick="selectServiceById('${service.id}')">
              <div><strong>${escapeHtml(service.name)}</strong><span>${service.category ? escapeHtml(service.category) + " • " : ""}${Number(service.duration_minutes || 0)} min</span>${service.description ? `<p class="muted service-public-description">${escapeHtml(service.description)}</p>` : ""}</div>
              <b>${window.App.formatServicePrice(service)}</b>
            </button>
          `).join("")}
        </div>
      </div>
    </details>
  `;
  box.scrollIntoView({ behavior: "smooth" });
}

async function selectServiceById(serviceId) {
  selectedService = services.find(s => String(s.id) === String(serviceId)) || null;
  if (!selectedService) {
    window.App.showMessage(C("serviceNotFound", "Usluga nije pronađena."), "error");
    return;
  }
  showBookingForm();
}

function showBookingForm() {
  const box = document.getElementById("booking-box");
  if (!box) return;

  if (!services.length) {
    box.innerHTML = `<div class="card"><h2>${C("bookingUnavailable", "Zakazivanje nije dostupno")}</h2><p class="muted">${C("noServicesText", "Trenutno nema dostupnih usluga za online zahtev.")}</p></div>`;
    return;
  }

  const today = window.BookingLogic?.getLocalDateString ? window.BookingLogic.getLocalDateString() : new Date().toISOString().split("T")[0];
  const businessType = window.App.normalizeBusinessType(currentSalon?.business_type);
  const isSalonProfile = businessType === "salon" || businessType === "general";
  const profileLabels = window.App.getBusinessProfileLabels(currentSalon?.business_type);
  const bookingActionLabel = isSalonProfile ? "Zakaži termin" : profileLabels.action;
  const bookingFormTitle = isSalonProfile ? "Zakažite termin" : profileLabels.formTitle;
  const bookingFormIntro = isSalonProfile ? "Izaberite uslugu, datum i termin." : profileLabels.formIntro;
  selectedDate = today;
  selectedTime = null;

  box.innerHTML = `
    <div class="card booking-card booking-paper-card">
      <h2>${escapeHtml(bookingFormTitle)}</h2>
      <p class="muted">${escapeHtml(bookingFormIntro)}</p>

      <label>${C("serviceAndPrice", "Usluga i cena")}</label>
      <select id="booking-service" class="booking-service-dropdown">
        <option value="">${C("chooseService", "Izaberite uslugu")}</option>
        ${services.map(service => `
          <option value="${service.id}" ${selectedService?.id === service.id ? "selected" : ""}>
            ${escapeHtml(service.name)} — ${window.App.formatServicePrice(service)} — ${Number(service.duration_minutes || 0)} min
          </option>
        `).join("")}
      </select>
      <div id="selected-service-summary" class="selected-service-summary muted">${C("chooseServiceFirst", "Prvo izaberite uslugu.")}</div>

      <div class="booking-two-cols">
        <div>
          <label>${C("date", "Datum")}</label>
          <input id="booking-date" type="date" min="${today}" value="${today}">
        </div>
        <div>
          <label>${C("selectedTime", "Izabrani termin")}</label>
          <input id="selected-time-view" type="text" value="${C("noTimeSelected", "Još nije izabran")}" disabled>
        </div>
      </div>

      <label>${C("availableTimes", "Slobodni termini")}</label>
      <div id="time-slots" class="time-grid"><p class="muted">${C("chooseServiceAndDate", "Izaberite uslugu i datum.")}</p></div>

      <div class="booking-two-cols">
        <div>
          <label>${C("fullName", "Ime i prezime")}</label>
          <input id="client-name" type="text" placeholder="Ana Petrović">
        </div>
        <div>
          <label>${C("phoneCountry", "Država za WhatsApp broj")}</label>
          <select id="client-phone-country" class="phone-country-select">
            <option value="381" selected>🇷🇸 Srbija +381</option>
            <option value="387">🇧🇦 Bosna i Hercegovina +387</option>
          </select>
        </div>
      </div>

      <label>${C("phoneWhatsapp", "Broj telefona / WhatsApp")}</label>
      <input id="client-phone" type="tel" inputmode="tel" placeholder="64 123 4567">
      <p class="field-help">${C("phoneHelp", "Izaberite državu i unesite lokalni broj. Može sa nulom ili bez nule, npr. Srbija 064... / Bosna 061...")}</p>

      ${false ? `
        <label>${escapeHtml(profileLabels.requestKindLabel)}</label>
        <input id="client-request-kind" type="text" placeholder="${escapeHtml(profileLabels.requestKindPlaceholder)}">
      ` : ""}

      ${false ? `
        <label>Adresa / lokacija</label>
        <input id="client-address" type="text" placeholder="Mesto, ulica ili lokacija problema">
        <label>Hitnost</label>
        <select id="client-urgency">
          <option value="Normalno">Normalno</option>
          <option value="Hitno">Hitno</option>
          <option value="Nije hitno">Nije hitno</option>
        </select>
      ` : ""}

      ${false ? `
        <label>${escapeHtml(profileLabels.noteLabel)}</label>
        <textarea id="client-note" rows="4" placeholder="${escapeHtml(profileLabels.notePlaceholder)}"></textarea>
      ` : ""}

      <button class="btn btn-primary booking-submit-btn" type="button" onclick="submitAppointment()">${escapeHtml(bookingActionLabel)}</button>
    </div>
  `;

  document.getElementById("booking-service").addEventListener("change", handleBookingChange);
  document.getElementById("booking-date").addEventListener("change", handleBookingChange);
  setupPhoneCountryAutoZero();

  if (selectedService) handleBookingChange();
  box.scrollIntoView({ behavior: "smooth" });
}

async function handleBookingChange() {
  const serviceId = document.getElementById("booking-service").value;
  selectedDate = document.getElementById("booking-date").value;
  selectedTime = null;
  selectedService = services.find(s => String(s.id) === String(serviceId)) || null;

  const summary = document.getElementById("selected-service-summary");
  if (!selectedService || !selectedDate) {
    document.getElementById("time-slots").innerHTML = `<p class="muted">${C("chooseServiceAndDate", "Izaberite uslugu i datum.")}</p>`;
    if (summary) summary.textContent = C("chooseServiceFirst", "Prvo izaberite uslugu.");
    return;
  }

  if (summary) {
    summary.innerHTML = `<strong>${escapeHtml(selectedService.name)}</strong> • ${window.App.formatServicePrice(selectedService)} • ${Number(selectedService.duration_minutes || 0)} min`;
  }
  const timeView = document.getElementById("selected-time-view");
  if (timeView) timeView.value = C("noTimeSelected", "Još nije izabran");

  await loadAvailableTimes();
}

async function loadAvailableTimes() {
  const slotsBox = document.getElementById("time-slots");
  slotsBox.innerHTML = `<p class="muted">${C("loadingTimes", "Učitavanje termina...")}</p>`;

  const slots = await window.BookingLogic.getAvailableSlots(
    currentSalon.id,
    Number(selectedService.duration_minutes || 30),
    selectedDate
  );

  if (!slots.length) {
    const today = window.BookingLogic?.getLocalDateString ? window.BookingLogic.getLocalDateString() : new Date().toISOString().split("T")[0];
    const msg = selectedDate === today
      ? C("noTimesToday", "Nema više slobodnih termina za danas. Izaberite naredni datum.")
      : C("noTimesDate", "Nema slobodnih termina za izabrani datum.");
    slotsBox.innerHTML = `<p class="muted">${msg}</p>`;
    return;
  }

  slotsBox.innerHTML = slots.map(time => `
    <button type="button" class="time-slot" onclick="selectTime('${time}', this)">${time}</button>
  `).join("");
}

function selectTime(time, btn) {
  selectedTime = time;
  document.querySelectorAll(".time-slot").forEach(el => el.classList.remove("selected"));
  btn.classList.add("selected");
  const timeView = document.getElementById("selected-time-view");
  if (timeView) timeView.value = time;
}


function setupPhoneCountryAutoZero() {
  const countrySelect = document.getElementById("client-phone-country");
  const phoneInput = document.getElementById("client-phone");

  if (!countrySelect || !phoneInput) return;

  const placeholderMap = {
    "381": "064 123 4567 ili 64 123 4567",
    "387": "061 123 456 ili 61 123 456",
    "385": "091 123 4567 ili 91 123 4567",
    "382": "067 123 456 ili 67 123 456",
    "386": "040 123 456 ili 40 123 456",
    "389": "070 123 456 ili 70 123 456",
    "49": "151 12345678",
    "43": "660 1234567"
  };

  function updatePlaceholder() {
    const countryCode = countrySelect.value || "381";
    phoneInput.placeholder = placeholderMap[countryCode] || "064 123 4567 ili 64 123 4567";
  }

  // Namerno ne brišemo nulu dok korisnik kuca.
  // Korisnik može uneti 064... ili 64..., a submit funkcija čuva ispravan WhatsApp format.
  updatePlaceholder();
  countrySelect.addEventListener("change", updatePlaceholder);
}

function normalizeClientPhoneForStorage(phone, countryCode = "381") {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const country = String(countryCode || "381").replace(/\D/g, "") || "381";
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return `+${digits}`;
  if (raw.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith(country) && digits.length >= country.length + 7) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 8) return `+${country}${digits.slice(1)}`;
  if (/^[1-9]\d{6,}$/.test(digits)) return `+${country}${digits}`;
  return "";
}

async function submitAppointment() {
  const name = document.getElementById("client-name")?.value.trim();
  const phoneRaw = document.getElementById("client-phone")?.value.trim();
  const phoneCountry = document.getElementById("client-phone-country")?.value || "381";
  const phone = normalizeClientPhoneForStorage(phoneRaw, phoneCountry);
  // Salon MVP: no extra "vrsta zahteva" or "napomena" fields for clients.
  // Other future business types can still use these optional fields if present.
  const note = document.getElementById("client-note")?.value.trim() || "";
  const requestKind = document.getElementById("client-request-kind")?.value.trim() || "";
  const clientAddress = document.getElementById("client-address")?.value.trim() || "";
  const urgency = document.getElementById("client-urgency")?.value || "";
  const extraNoteParts = [];
  if (requestKind) extraNoteParts.push(`Vrsta: ${requestKind}`);
  if (clientAddress) extraNoteParts.push(`Lokacija: ${clientAddress}`);
  if (urgency) extraNoteParts.push(`Hitnost: ${urgency}`);
  if (note) extraNoteParts.push(note);
  const finalNote = extraNoteParts.join("\n");

  if (!currentSalon || !selectedService || !selectedDate || !selectedTime) {
    window.App.showMessage(C("chooseAllError", "Izaberite uslugu, datum i termin."), "error");
    return;
  }
  if (!name) {
    window.App.showMessage(C("enterNameError", "Unesite ime i prezime."), "error");
    return;
  }

  if (!phone) {
    window.App.showMessage(C("phoneError", "Izaberite državu i unesite ispravan broj telefona."), "error");
    return;
  }

  const currentSlots = await window.BookingLogic.getAvailableSlots(
    currentSalon.id,
    Number(selectedService.duration_minutes || 30),
    selectedDate
  );
  if (!currentSlots.includes(selectedTime)) {
    window.App.showMessage(C("takenError", "Termin je u međuvremenu zauzet. Izaberite drugi."), "error");
    await loadAvailableTimes();
    return;
  }

  const { data: insertedAppointment, error } = await window.db.from("appointments").insert({
    salon_id: currentSalon.id,
    service_id: selectedService.id,
    client_name: name,
    client_phone: phone,
    note: finalNote || null,
    appointment_date: selectedDate,
    appointment_time: selectedTime,
    status: "new",
    service_name_snapshot: selectedService.name,
    price_snapshot: Number(selectedService.price || 0),
    price_to_snapshot: selectedService.price_to ? Number(selectedService.price_to) : null,
    currency_snapshot: window.App.normalizeCurrency(selectedService.currency || "RSD"),
    duration_snapshot: Number(selectedService.duration_minutes || 30)
  }).select("*").single();

  if (error) {
    console.error(error);
    window.App.showMessage(C("sendError", "Greška pri slanju termina."), "error");
    return;
  }

  if (insertedAppointment?.id) {
    window.App.notifyOwnerAboutNewAppointment(insertedAppointment.id, {
      salon_id: currentSalon.id,
      salon_name: currentSalon.salon_name || currentSalon.name || "",
      service_name: selectedService.name,
      client_name: name,
      client_phone: phone,
      appointment_date: selectedDate,
      appointment_time: selectedTime
    });
  }

  document.getElementById("booking-box").innerHTML = `
    <div class="card center">
      <h2>${C("requestSentTitle", "Zahtev je poslat ✅")}</h2>
      <p class="muted">${C("requestSentText", "Vlasnik profila će vas kontaktirati radi potvrde.")}</p>
      <p><strong>${escapeHtml(selectedService.name)}</strong></p>
      <p>${window.App.formatDate(selectedDate)} u ${selectedTime}</p>
    </div>
  `;
  window.App.showMessage(C("requestSentToast", "Zahtev je poslat."), "success");
}


/* v63 FINAL SALON + SHOE SHOP EXTENSION
   Stable add-on: shop public cover, product grid, TikTok-style viewer, direct product actions. */
let csShopProductImages = {};
let csViewerState = null;
let csViewerWheelLock = 0;
let selectedProductRubric = "all";

function csIsShopProfile(salon = currentSalon, productCount = products.length) {
  const raw = `${salon?.business_type || ""} ${salon?.profile_type || ""} ${salon?.type || ""} ${salon?.package_type || ""}`.toLowerCase();
  if (/catalog|katalog|prodav|shop|store|patik|shoe|sneaker/.test(raw)) return true;
  if (/salon|beauty|frizer|barber|nokti|kozmet/.test(raw)) return false;
  return Number(productCount || 0) > 0;
}

function csSafePhone(raw) {
  if (window.App?.normalizePhoneForTel) return window.App.normalizePhoneForTel(raw || "");
  return String(raw || "").replace(/[^0-9+]/g, "");
}
function csWhatsAppPhone(raw) {
  let s = String(raw || "").replace(/[^0-9+]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("00")) s = s.slice(2);
  if (s.startsWith("0")) s = "381" + s.slice(1);
  return s;
}
function csProductCode(product = {}) {
  return product.public_code || String(product.id || "").slice(0, 8).toUpperCase() || "OGLAS";
}
function csProductImages(product = {}) {
  const arr = [];
  if (product.image_url) arr.push(product.image_url);
  (csShopProductImages[product.id] || []).forEach(img => {
    if (img?.image_url && !arr.includes(img.image_url)) arr.push(img.image_url);
  });
  return arr;
}
function csProductPrice(product = {}) { return renderProductPrice(product); }
function csProductStatus(product = {}) { return getProductStatusLabel(product.stock_status); }
function csProductPublicDescription(product = {}) { return String(product.description || "").trim(); }
function csProductRubric(product = {}) { return String(product.category || "").trim(); }
function csProductRubrics(list = products) {
  return Array.from(new Set((list || []).map(item => csProductRubric(item)).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, "sr", { sensitivity: "base" }));
}
function csFilteredProducts(list = products) {
  const value = String(selectedProductRubric || "all").trim();
  if (!value || value === "all") return list || [];
  return (list || []).filter(item => csProductRubric(item).toLowerCase() === value.toLowerCase());
}
function csProductGlobalIndex(product = {}) {
  const idx = (products || []).findIndex(item => String(item.id) === String(product.id));
  return idx >= 0 ? idx : 0;
}
function renderProductRubricDropdown(extraClass = "") {
  const rubrics = csProductRubrics(products);
  if (!rubrics.length) return "";
  const current = String(selectedProductRubric || "all");
  return `<div class="cs-rubric-filter ${escapeHtml(extraClass)}">
    <label>Rubrike</label>
    <select class="cs-rubric-select" onchange="setProductRubricFilter(this.value)">
      <option value="all" ${current === "all" ? "selected" : ""}>Sve rubrike</option>
      ${rubrics.map(item => `<option value="${escapeHtml(item)}" ${current.toLowerCase() === item.toLowerCase() ? "selected" : ""}>${escapeHtml(item)}</option>`).join("")}
    </select>
  </div>`;
}
function setProductRubricFilter(value = "all") {
  const rubrics = csProductRubrics(products);
  const clean = String(value || "all").trim();
  selectedProductRubric = clean === "all" || rubrics.some(item => item.toLowerCase() === clean.toLowerCase()) ? clean : "all";
  document.querySelectorAll(".cs-rubric-select").forEach(select => { select.value = selectedProductRubric; });
  const filtered = csFilteredProducts(products);
  const shopGrid = document.getElementById("shoeProductGrid");
  if (shopGrid) {
    shopGrid.innerHTML = filtered.length
      ? filtered.map(product => renderShoeProductCard(product, csProductGlobalIndex(product))).join("")
      : `<div class="card cs-rubric-empty"><h3>Nema proizvoda u ovoj rubrici.</h3><p class="muted">Izaberite “Sve rubrike” za celu ponudu.</p></div>`;
  }
  const publicGrid = document.getElementById("clientProductGrid");
  if (publicGrid) {
    publicGrid.innerHTML = filtered.length
      ? filtered.map(product => renderPublicProductCard(product, csProductGlobalIndex(product))).join("")
      : `<div class="card cs-rubric-empty"><h3>Nema proizvoda u ovoj rubrici.</h3><p class="muted">Izaberite “Sve rubrike” za celu ponudu.</p></div>`;
  }
}
function csProductViewerMetaPrimary(product = {}) {
  return String(product.category || "").trim();
}
function csProductViewerMetaSecondary(product = {}) {
  const raw = String(product.description || "").trim();
  if (raw) return raw.split(/\n+/)[0].trim();
  return "";
}
function csProductViewerAvailability(product = {}) {
  return csProductStatus(product);
}
function csProductUrl(product = {}) {
  const code = csProductCode(product);
  const slug = currentSalon?.slug || "";
  const base = window.App?.getSalonPublicLink
    ? window.App.getSalonPublicLink(slug)
    : `${window.location.origin}/?salon=${encodeURIComponent(slug)}`;
  return `${base}&product=${encodeURIComponent(code)}`;
}

async function loadProducts() {
  if (!currentSalon?.id) { products = []; csShopProductImages = {}; return; }
  const { data, error } = await window.db
    .from("products")
    .select("*")
    .eq("salon_id", currentSalon.id)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) { console.warn("Products not available:", error); products = []; csShopProductImages = {}; return; }
  products = data || [];
  const availableRubrics = csProductRubrics(products);
  if (selectedProductRubric !== "all" && !availableRubrics.some(item => item.toLowerCase() === String(selectedProductRubric).toLowerCase())) selectedProductRubric = "all";
  csShopProductImages = {};
  if (products.length) {
    try {
      const ids = products.map(p => p.id).filter(Boolean);
      const { data: imgs, error: imgError } = await window.db
        .from("product_images")
        .select("*")
        .in("product_id", ids)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (!imgError) (imgs || []).forEach(img => (csShopProductImages[img.product_id] ||= []).push(img));
    } catch (e) { csShopProductImages = {}; }
  }
}

async function renderSalonHome() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="loading-box">${C("loadingProfile", "Učitavanje profila...")}</div>`;

  const { data: settings } = await window.db.from("salon_settings").select("*").eq("salon_id", currentSalon.id).maybeSingle();
  const { data: workingHours } = await window.db.from("working_hours").select("*").eq("salon_id", currentSalon.id).order("day_of_week", { ascending: true });

  const publicName = settings?.welcome_title || currentSalon.salon_name || "Profil";
  currentSalon._publicName = publicName;
  currentSalon._publicLogo = settings?.logo_url || "";
  currentSalon._publicPhone = settings?.phone || currentSalon.phone || "";
  window.App?.updateManifestForSalon?.(currentSalon.slug, { name: publicName, iconUrl: settings?.logo_url, themeColor: currentSalon.theme_color, profileCode: currentSalon.public_profile_code });

  if (csIsShopProfile(currentSalon, products.length)) return renderShoeShopHome(settings || {});

  const profileLabels = window.App.getBusinessProfileLabels(currentSalon.business_type);
  const normalizedType = window.App.normalizeBusinessType(currentSalon.business_type);
  const isSalonBookingProfile = normalizedType === "salon" || normalizedType === "general";
  const primaryActionLabel = isSalonBookingProfile ? "Zakaži termin" : profileLabels.action;
  app.innerHTML = `
    <section class="client-page salon-themed-page">
      ${adminPreviewMode ? `<div class="owner-preview-bar admin-preview-bar"><div><strong>${C("adminClientPreviewTitle", "Admin pregled: korisnička strana")}</strong><span>${C("adminClientPreviewText", "Ovako korisnik vidi ovaj profil. Ovo dugme vidi samo prijavljeni admin.")}</span></div><a class="btn btn-primary" href="${window.App.getAppPath('admin/')}">${C("backToAdmin", "Nazad u admin")}</a></div>` : ownerPreviewMode ? `<div class="owner-preview-bar"><div><strong>${C("ownerPreviewTitle", "Pregled javne stranice")}</strong><span>${C("ownerPreviewText", "Ovako korisnik vidi vaš profil.")}</span></div><a class="btn btn-primary" href="${window.App.getAppPath('salon/')}">${C("backToOwnerPanel", "Nazad u panel vlasnika")}</a></div>` : ""}
      <div class="hero-card salon-header">
        ${settings?.logo_url ? `<img src="${escapeHtml(settings.logo_url)}" alt="${escapeHtml(publicName)} logo" class="salon-logo">` : `<div class="logo-circle">${escapeHtml(publicName?.charAt(0).toUpperCase() || "S")}</div>`}
        <h1>${escapeHtml(publicName)}</h1>
        <div class="public-profile-text">
          <p class="intro-text">${escapeHtml(formatSalonWelcomeText(settings?.welcome_text || C("welcomeDefault", "Dobrodošli. Izaberite uslugu, datum i zakažite termin.")))}</p>

        </div>
        <div class="client-actions ${isSalonBookingProfile ? 'client-actions-salon-grid' : ''}">
          ${isSalonBookingProfile && settings?.address ? renderPublicAddressAction(settings.address, 'Pronađi nas') : ''}
          ${isSalonBookingProfile && settings?.phone ? `<a class="btn btn-dark quick-action-btn phone-quick-btn" href="tel:${escapeHtml(csSafePhone(settings.phone))}"><span class="quick-action-icon quick-action-icon-phone">✆</span><span class="quick-action-label">Pozovi salon</span></a>` : ''}
          <button class="btn btn-primary" type="button" onclick="showBookingForm()">${escapeHtml(primaryActionLabel)}</button>
          ${(!isSalonBookingProfile && products.length) ? `<button class="btn btn-dark" type="button" onclick="showProducts()">${C("productsCatalog", "Proizvodi / cenovnik")}</button>` : ""}
          ${garageListings.length ? `<button class="btn btn-dark" type="button" onclick="showGarage()">Garaža / oglasi</button>` : ""}
          ${ownerPreviewMode ? "" : `<button class="btn btn-dark" type="button" onclick="installCurrentSalonApp()">${C("installThisProfile", "Preuzmi app")}</button>`}
        </div>
      </div>
      <div id="client-extra">${isSalonBookingProfile ? "" : renderClientServicesPreview()}${renderClientProductsPreview()}${renderClientGaragePreview()}${renderClientGalleryPreview()}${renderClientWorkingHours(workingHours || [])}</div>
      <div id="booking-box"></div>
      ${renderCityStylePowered("client-powered")}
    </section>`;
}

function renderShoeShopHome(settings = {}) {
  const app = document.getElementById("app");
  const name = settings?.welcome_title || currentSalon?.salon_name || "Prodavnica patika";
  const logo = settings?.logo_url || "";
  const cover = settings?.cover_image_url || settings?.home_image_url || galleryImages?.[0]?.image_url || logo || "";
  const phone = settings?.phone || currentSalon?.phone || "";
  const address = settings?.address || "";
  const text = settings?.welcome_text || "";
  const filteredProducts = csFilteredProducts(products);
  app.innerHTML = `
    <section class="shoe-shop-page">
      ${adminPreviewMode ? `<div class="owner-preview-bar admin-preview-bar"><div><strong>Admin pregled</strong><span>Ovako kupac vidi prodavnicu.</span></div><a class="btn btn-primary" href="${window.App.getAppPath('admin/')}">Nazad u admin</a></div>` : ownerPreviewMode ? `<div class="owner-preview-bar"><div><strong>Pregled javne stranice</strong><span>Ovako kupac vidi prodavnicu.</span></div><a class="btn btn-primary" href="${window.App.getAppPath('salon/')}">Nazad u panel vlasnika</a></div>` : ""}
      ${cover ? `<div class="shoe-cover"><img src="${escapeHtml(cover)}" alt="${escapeHtml(name)} početna slika"></div>` : `<div class="shoe-cover shoe-cover-empty"><span>${escapeHtml(name)}</span></div>`}
      <div class="shoe-info-row">
        ${logo ? `<img class="shoe-logo" src="${escapeHtml(logo)}" alt="${escapeHtml(name)} logo">` : `<div class="shoe-logo shoe-logo-fallback">${escapeHtml(name.charAt(0).toUpperCase())}</div>`}
        <div class="shoe-info-copy"><h1>${escapeHtml(name)}</h1>${text ? `<p>${escapeHtml(text)}</p>` : ""}<div class="shoe-meta">${phone ? `<a class="shoe-meta-link" href="tel:${escapeHtml(csSafePhone(phone))}">📞 ${escapeHtml(phone)}</a>` : ""}${address ? renderPublicAddressLink(address) : ""}</div></div>
      </div>
      ${ownerPreviewMode ? "" : `<div class="shoe-install-row"><button class="btn btn-dark shoe-install-btn" type="button" onclick="installCurrentSalonApp()">📱 Preuzmi app prodavnice</button><small>Prečica otvara baš ovaj profil${logo ? " i koristi logo firme gde browser dozvoljava" : ""}.</small></div>`}
      <section class="shoe-products-section">
        ${products.length ? `${renderProductRubricDropdown("shoe-rubric-filter")}<div id="shoeProductGrid" class="shoe-grid">${filteredProducts.length ? filteredProducts.map(product => renderShoeProductCard(product, csProductGlobalIndex(product))).join("") : `<div class="card cs-rubric-empty"><h3>Nema proizvoda u ovoj rubrici.</h3><p class="muted">Izaberite “Sve rubrike” za celu ponudu.</p></div>`}</div>` : `<div class="card"><h2>Još nema oglasa</h2><p class="muted">Vlasnik još nije dodao proizvode u katalog.</p></div>`}
      </section>
      ${renderCityStylePowered("shoe-powered")}
    </section>`;
  const requestedProduct = window.App?.getUrlParam?.("product");
  if (requestedProduct && products.length) {
    const idx = products.findIndex(p => String(csProductCode(p)).toLowerCase() === String(requestedProduct).toLowerCase() || String(p.id) === String(requestedProduct));
    if (idx >= 0) setTimeout(() => openShoeViewer(idx), 150);
  }
}

function renderShoeProductCard(product, index) {
  const imgs = csProductImages(product);
  const img = imgs[0] || "";
  const status = csProductStatus(product);
  return `<button class="shoe-card" type="button" onclick="openShoeViewer(${index})">
    <div class="shoe-card-media">${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(product.name || 'Patike')}">` : `<span>Bez slike</span>`}</div>
    <div class="shoe-card-info">
      <small>${escapeHtml(csProductCode(product))}${product.category ? " • " + escapeHtml(product.category) : ""}</small>
      <strong>${escapeHtml(product.name || "Patike")}</strong>
      <div class="shoe-card-bottom"><b>${escapeHtml(csProductPrice(product))}</b><span>${escapeHtml(status)}</span></div>
    </div>
  </button>`;
}

function showProducts() {
  const box = document.getElementById("client-extra");
  if (!box) return;
  if (csIsShopProfile(currentSalon, products.length)) {
    const section = document.querySelector(".shoe-products-section");
    if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (!products.length) {
    box.innerHTML = `<div class="card"><h2>${C("productsCatalog", "Proizvodi / cenovnik")}</h2><p class="muted">Ovaj profil trenutno nema javno prikazane proizvode.</p></div>`;
    return;
  }
  box.innerHTML = `<details class="card client-hours-panel client-products-panel" open><summary><span>${C("productsCatalog", "Proizvodi / cenovnik")}</span><small>${C("hideList", "Sakrij listu")}</small></summary><div class="client-services-panel-body">${renderProductRubricDropdown("client-rubric-filter")}<div id="clientProductGrid" class="product-public-grid product-public-grid-images">${csFilteredProducts(products).map(product => renderPublicProductCard(product, csProductGlobalIndex(product))).join("")}</div></div></details>`;
  box.scrollIntoView({ behavior: "smooth" });
}

function openShoeViewer(index = 0) {
  if (!products.length) return;
  csViewerState = { index: Math.max(0, Math.min(index, products.length - 1)), image: 0, startX: 0, startY: 0, startPanX: 0, startPanY: 0, panX: 0, panY: 0, didPan: false, lastTap: 0, lastTapX: 0, lastTapY: 0, zoomed: false, zoomScale: 1, pinchStartDistance: 0, pinchStartScale: 1, isPinching: false };
  renderShoeViewer();
}
function closeShoeViewer() { document.getElementById("shoeViewer")?.remove(); csViewerState = null; }
function currentShoeProduct() { return products[csViewerState?.index || 0]; }
function csViewerShareIcon(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 16L16.5 7.5"></path><path d="M10 7.5H16.5V14"></path></svg>';
}
function csViewerMessageIcon(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 11.5C20 15.64 16.42 19 12 19c-1.15 0-2.24-.22-3.23-.62L4 19.8l1.38-4.15C4.5 14.48 4 13.03 4 11.5 4 7.36 7.58 4 12 4s8 3.36 8 7.5Z"></path><circle cx="9" cy="11.5" r="1"></circle><circle cx="12" cy="11.5" r="1"></circle><circle cx="15" cy="11.5" r="1"></circle></svg>';
}
function csViewerPhoneIcon(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 16.2v3a1.8 1.8 0 0 1-1.96 1.8C10.74 20.28 3.72 13.26 3 4.96A1.8 1.8 0 0 1 4.8 3h3a1.8 1.8 0 0 1 1.8 1.55c.14 1.02.43 2 .85 2.92a1.8 1.8 0 0 1-.41 2.02l-1.27 1.27a14.4 14.4 0 0 0 4.47 4.47l1.27-1.27a1.8 1.8 0 0 1 2.02-.41c.92.42 1.9.71 2.92.85A1.8 1.8 0 0 1 21 16.2Z"></path></svg>';
}

function csViewerZoomIcon(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M15.5 15.5 21 21"></path><path d="M10.5 7.5v6"></path><path d="M7.5 10.5h6"></path></svg>';
}

function csSmartCropShoeImage(img){
  // v76: display-only smart trim for product photos with large white margins.
  // If browser/CORS blocks canvas, original image stays unchanged.
  try {
    if (!img || img.dataset.smartCropDone === "1") return;
    img.dataset.smartCropDone = "1";
    const nw = img.naturalWidth || 0;
    const nh = img.naturalHeight || 0;
    if (nw < 80 || nh < 80) return;
    const maxSide = 900;
    const scale = Math.min(1, maxSide / Math.max(nw, nh));
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        // Treat pure/near white and transparent background as margin.
        const isBg = a < 16 || (r > 238 && g > 238 && b > 238) || (r > 246 && g > 246 && b > 246);
        if (!isBg) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const cropRatio = (bw * bh) / (w * h);
    // Only crop when there is obvious empty margin.
    if (cropRatio > 0.82) return;
    const pad = Math.round(Math.max(bw, bh) * 0.10);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const out = document.createElement("canvas");
    out.width = cw; out.height = ch;
    const octx = out.getContext("2d");
    if (!octx) return;
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, cw, ch);
    octx.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
    img.src = out.toDataURL("image/jpeg", 0.92);
    img.classList.add("shoe-img-smart-cropped");
  } catch (_) {
    // Keep original image if smart crop is not possible.
  }
}

function csClampZoomPan(value, min, max){
  return Math.max(min, Math.min(max, value));
}
function csApplyShoePanZoom(){
  if (!csViewerState) return;
  const img = document.querySelector("#shoeViewer .shoe-viewer-main-img");
  const viewer = document.getElementById("shoeViewer");
  if (!img) return;
  const scale = Number(csViewerState.zoomScale || 1);
  img.style.opacity = "1";
  img.style.visibility = "visible";
  img.style.transformOrigin = "center center";
  if (!csViewerState.zoomed || scale <= 1.01) {
    csViewerState.zoomed = false;
    csViewerState.zoomScale = 1;
    if (viewer) viewer.classList.remove("shoe-viewer-zoomed");
    img.style.transform = "";
    img.style.willChange = "auto";
    document.documentElement.classList.remove("cs-zoom-active");
    return;
  }
  if (viewer) {
    viewer.classList.add("shoe-viewer-zoomed");
    viewer.style.backgroundColor = "#000";
  }
  document.documentElement.classList.add("cs-zoom-active");
  img.style.willChange = "transform";
  const panX = Number(csViewerState.panX || 0);
  const panY = Number(csViewerState.panY || 0);
  img.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`;
}
function csResetShoePan(){
  if (!csViewerState) return;
  csViewerState.panX = 0;
  csViewerState.panY = 0;
  csViewerState.startPanX = 0;
  csViewerState.startPanY = 0;
  csViewerState.didPan = false;
  csViewerState.isPinching = false;
  csViewerState.pinchStartDistance = 0;
}
function csTouchDistance(touches){
  if (!touches || touches.length < 2) return 0;
  const a = touches[0], b = touches[1];
  return Math.hypot((a.clientX || 0) - (b.clientX || 0), (a.clientY || 0) - (b.clientY || 0));
}
function csSetShoeZoomMode(zoomed, scale = 2.65){
  if (!csViewerState) return;
  csViewerState.zoomed = !!zoomed;
  csViewerState.zoomScale = csViewerState.zoomed ? csClampZoomPan(Number(scale || 2.65), 1.08, 4.25) : 1;
  if (!csViewerState.zoomed) csResetShoePan();
  const viewer = document.getElementById("shoeViewer");
  if (viewer) viewer.classList.toggle("shoe-viewer-zoomed", !!csViewerState.zoomed);
  csApplyShoePanZoom();
}

function csGetCurrentShoeImageSrc(){
  const p = currentShoeProduct();
  const imgs = csProductImages(p);
  return imgs?.[csViewerState?.image || 0] || imgs?.[0] || document.querySelector("#shoeViewer .shoe-viewer-main-img")?.src || "";
}
function csOpenRealShoeZoom(startScale = 1){
  const product = currentShoeProduct();
  const imgs = (csProductImages(product) || []).filter(Boolean);
  if (!imgs.length) return;
  let imageIndex = Math.max(0, Math.min(Number(csViewerState?.image || 0), imgs.length - 1));
  document.getElementById("csZoomLightbox")?.remove();
  document.documentElement.classList.add("cs-real-zoom-active");
  const box = document.createElement("div");
  box.id = "csZoomLightbox";
  box.className = "cs-zoom-lightbox cs-zoom-product-gallery";
  box.innerHTML = `
    <img class="cs-zoom-lightbox-img" src="${escapeHtml(imgs[imageIndex])}" alt="Zumirana slika proizvoda">
    <button class="cs-zoom-lightbox-close" type="button" aria-label="Zatvori zum">×</button>
    ${imgs.length > 1 ? `<button class="cs-zoom-nav cs-zoom-nav-prev" type="button" aria-label="Prethodna slika">‹</button><button class="cs-zoom-nav cs-zoom-nav-next" type="button" aria-label="Sledeća slika">›</button>` : ``}
    ${imgs.length > 1 ? `<div class="cs-zoom-counter"></div><div class="cs-zoom-dots"></div>` : ``}
    <div class="cs-zoom-help">Listaj slike levo/desno • raširi prste za zum • X zatvara</div>`;
  document.body.appendChild(box);
  const img = box.querySelector(".cs-zoom-lightbox-img");
  const close = box.querySelector(".cs-zoom-lightbox-close");
  const prev = box.querySelector(".cs-zoom-nav-prev");
  const next = box.querySelector(".cs-zoom-nav-next");
  const counter = box.querySelector(".cs-zoom-counter");
  const dots = box.querySelector(".cs-zoom-dots");
  const state = { scale: Math.max(1, Math.min(Number(startScale || 1), 5)), panX: 0, panY: 0, startX: 0, startY: 0, startPanX: 0, startPanY: 0, pinchDistance: 0, pinchScale: 1, dragging: false, moved: false };
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function resetZoom(){ state.scale = 1; state.panX = 0; state.panY = 0; state.dragging = false; state.moved = false; apply(); }
  function apply(){
    const maxX = Math.max(0, window.innerWidth * (state.scale - 1) * .55);
    const maxY = Math.max(0, window.innerHeight * (state.scale - 1) * .55);
    state.panX = clamp(state.panX, -maxX, maxX);
    state.panY = clamp(state.panY, -maxY, maxY);
    img.style.transform = `translate3d(${state.panX}px, ${state.panY}px, 0) scale(${state.scale})`;
    box.classList.toggle("cs-zoom-is-scaled", state.scale > 1.01);
  }
  function syncChrome(){
    if (csViewerState) csViewerState.image = imageIndex;
    img.src = imgs[imageIndex];
    img.alt = `${product?.name || "Proizvod"} - slika ${imageIndex + 1}`;
    if (counter) counter.textContent = `${imageIndex + 1} / ${imgs.length}`;
    if (dots) dots.innerHTML = imgs.map((_, i) => `<button type="button" class="${i === imageIndex ? 'active' : ''}" aria-label="Slika ${i + 1}"></button>`).join("");
  }
  function changeZoomImage(delta){
    if (imgs.length < 2) return;
    imageIndex = (imageIndex + delta + imgs.length) % imgs.length;
    syncChrome();
    resetZoom();
  }
  function closeZoom(){
    box.remove();
    document.documentElement.classList.remove("cs-real-zoom-active");
    csSetShoeZoomMode(false, 1);
    if (document.getElementById("shoeViewer") && csViewerState) renderShoeViewer();
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("keydown", onKeyDown, true);
  }
  close.addEventListener("click", e => { e.stopPropagation(); closeZoom(); });
  prev?.addEventListener("click", e => { e.stopPropagation(); changeZoomImage(-1); });
  next?.addEventListener("click", e => { e.stopPropagation(); changeZoomImage(1); });
  dots?.addEventListener("click", e => {
    const btn = e.target?.closest?.("button");
    if (!btn) return;
    const index = Array.from(dots.querySelectorAll("button")).indexOf(btn);
    if (index >= 0) { e.stopPropagation(); imageIndex = index; syncChrome(); resetZoom(); }
  });
  box.addEventListener("click", e => { if(e.target === box) closeZoom(); });
  box.addEventListener("wheel", e => {
    e.preventDefault();
    const old = state.scale;
    state.scale = clamp(state.scale + (e.deltaY < 0 ? .22 : -.22), 1, 5);
    if (state.scale <= 1.01) { state.scale = 1; state.panX = 0; state.panY = 0; }
    else if (old <= 1.01) { state.panX = 0; state.panY = 0; }
    apply();
  }, { passive:false });
  box.addEventListener("mousedown", e => { state.dragging = true; state.moved = false; state.startX = e.clientX; state.startY = e.clientY; state.startPanX = state.panX; state.startPanY = state.panY; e.preventDefault(); });
  function onMouseMove(e){
    if(!state.dragging || !document.getElementById("csZoomLightbox")) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) state.moved = true;
    if (state.scale <= 1.01) return;
    state.panX = state.startPanX + dx;
    state.panY = state.startPanY + dy;
    apply();
  }
  function onMouseUp(e){
    if(!state.dragging) return;
    const dx = e.clientX - state.startX;
    state.dragging = false;
    if (state.scale <= 1.01 && Math.abs(dx) > 70) changeZoomImage(dx < 0 ? 1 : -1);
  }
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  box.addEventListener("touchstart", e => {
    state.moved = false;
    if(e.touches.length >= 2){ state.pinchDistance = csTouchDistance(e.touches); state.pinchScale = state.scale; e.preventDefault(); return; }
    const t=e.touches[0]; state.startX=t.clientX; state.startY=t.clientY; state.startPanX=state.panX; state.startPanY=state.panY;
  }, { passive:false });
  box.addEventListener("touchmove", e => {
    if(e.touches.length >= 2){
      const d = csTouchDistance(e.touches);
      if(d && state.pinchDistance){ state.scale = clamp(state.pinchScale * (d / state.pinchDistance), 1, 5); if(state.scale <= 1.01){ state.panX=0; state.panY=0; } apply(); }
      e.preventDefault(); return;
    }
    const t=e.touches[0];
    const dx=t.clientX-state.startX;
    const dy=t.clientY-state.startY;
    if(Math.abs(dx)>8 || Math.abs(dy)>8) state.moved = true;
    if(state.scale <= 1.01) return;
    state.panX=state.startPanX+dx; state.panY=state.startPanY+dy; apply(); e.preventDefault();
  }, { passive:false });
  box.addEventListener("touchend", e => {
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - state.startX;
    const dy = t.clientY - state.startY;
    if (state.scale <= 1.01 && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 46) {
      e.preventDefault();
      changeZoomImage(dx < 0 ? 1 : -1);
    }
  }, { passive:false });
  box.addEventListener("dblclick", e => { e.preventDefault(); state.scale = state.scale > 1.2 ? 1 : 2.8; state.panX=0; state.panY=0; apply(); });
  function onKeyDown(e){
    if (!document.getElementById("csZoomLightbox")) return;
    if (e.key === "Escape") { e.preventDefault(); closeZoom(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); changeZoomImage(-1); }
    if (e.key === "ArrowRight") { e.preventDefault(); changeZoomImage(1); }
  }
  window.addEventListener("keydown", onKeyDown, true);
  syncChrome();
  resetZoom();
}
function csToggleShoeZoom(){
  if (!csViewerState) return;
  csOpenRealShoeZoom(1);
}
function csCloseShoeZoom(){
  document.getElementById("csZoomLightbox")?.remove();
  document.documentElement.classList.remove("cs-real-zoom-active");
  csSetShoeZoomMode(false, 1);
}


function csViewerPriceHtml(product = {}) {
  const currency = escapeHtml(window.App?.normalizeCurrency?.(product.currency || "RSD") || product.currency || "RSD");
  const priceNumber = Number(product.price || 0);
  const priceText = String(product.price_text || "").trim();
  if (priceNumber > 0) {
    const formatted = escapeHtml(priceNumber.toLocaleString("de-DE"));
    return `<span class="shoe-viewer-price-number">${formatted}</span><span class="shoe-viewer-price-currency">${currency}</span>`;
  }
  if (priceText) return `<span class="shoe-viewer-price-number shoe-viewer-price-text-only">${escapeHtml(priceText)}</span>`;
  return `<span class="shoe-viewer-price-number shoe-viewer-price-text-only">Cena na upit</span>`;
}

function renderShoeViewer() {
  const product = currentShoeProduct();
  if (!product) return;
  const imgs = csProductImages(product);
  const img = imgs[csViewerState.image] || imgs[0] || "";
  let viewer = document.getElementById("shoeViewer");
  if (!viewer) {
    viewer = document.createElement("div");
    viewer.id = "shoeViewer";
    document.body.appendChild(viewer);
  }
  viewer.className = "shoe-viewer shoe-viewer-locked shoe-viewer-clean-card-v250";
  viewer.classList.toggle("shoe-viewer-zoomed", !!csViewerState.zoomed);
  viewer.setAttribute("data-price", csProductPrice(product));
  const viewerMetaPrimary = csProductViewerMetaPrimary(product);
  const viewerMetaSecondary = csProductViewerMetaSecondary(product);
  const viewerAvailability = csProductViewerAvailability(product);
  const shopLogo = currentSalon?._publicLogo || "";
  const shopName = currentSalon?._publicName || "Prodavnica";
  viewer.innerHTML = `
    <div class="shoe-viewer-shell">
      <button class="shoe-zoom-close" type="button" onclick="event.stopPropagation(); csCloseShoeZoom()" aria-label="Zatvori zum">×</button>

      <div class="shoe-viewer-top-card">
        <div class="shoe-viewer-top-copy">
          <h2>${escapeHtml(product.name || "Patike")}</h2>
          ${viewerMetaPrimary ? `<p class="shoe-viewer-subtitle">${escapeHtml(viewerMetaPrimary)}</p>` : ``}
          ${viewerMetaSecondary ? `<p class="shoe-viewer-subcopy">${escapeHtml(viewerMetaSecondary)}</p>` : ``}
        </div>
        ${viewerAvailability ? `<div class="shoe-viewer-status"><span class="shoe-viewer-status-dot"></span>${escapeHtml(viewerAvailability)}</div>` : ``}
      </div>

      <div class="shoe-viewer-inline-actions shoe-viewer-inline-actions-top" aria-label="Gornje akcije proizvoda">
        <button class="shoe-action inline" type="button" onclick="shareShoeProduct(event)" aria-label="Podeli oglas" title="Podeli oglas">${csViewerShareIcon()}<span>Podeli</span></button>
        <button class="shoe-action inline" type="button" onclick="event.stopPropagation(); csToggleShoeZoom()" aria-label="Zumiraj sliku" title="Zumiraj sliku">${csViewerZoomIcon()}<span>Zumiraj</span></button>
      </div>

      <div class="shoe-viewer-media-card">
        <button class="shoe-viewer-close" type="button" onclick="closeShoeViewer()" aria-label="Zatvori oglas">×</button>
        <div class="shoe-viewer-media">${img ? `<img class="shoe-viewer-main-img" src="${escapeHtml(img)}" alt="${escapeHtml(product.name || 'Proizvod')}">` : `<span>Bez slike</span>`}</div>
      </div>

      <div class="shoe-viewer-bottom-row">
        <div class="shoe-viewer-inline-actions shoe-viewer-inline-actions-bottom" aria-label="Donje akcije proizvoda">
          <button class="shoe-action inline" type="button" onclick="askShoeProduct(event)" aria-label="Pošalji poruku" title="Pošalji poruku">${csViewerMessageIcon()}<span>Pitaj</span></button>
          <button class="shoe-action inline" type="button" onclick="callShoeShop(event)" aria-label="Pozovi prodavnicu" title="Pozovi prodavnicu">${csViewerPhoneIcon()}<span>Pozovi</span></button>
        </div>
        ${imgs.length > 1 ? `<div class="shoe-dots">${imgs.map((_,i)=>`<button class="${i===csViewerState.image?'active':''}" onclick="event.stopPropagation(); shoeSetImage(${i})" aria-label="Slika ${i + 1}"></button>`).join("")}</div>` : `<div class="shoe-dots shoe-dots-placeholder"><button class="active" aria-hidden="true"></button></div>`}
      </div>

      <div class="shoe-viewer-bottom-card">
        <div class="shoe-viewer-bottom-main">
          <div class="shoe-viewer-price">${csViewerPriceHtml(product)}</div>
          <p class="shoe-viewer-note"><span class="shoe-viewer-note-shield">✓</span> Kupujte sa stilom.</p>
        </div>
        <div class="shoe-viewer-bottom-logo">
          ${shopLogo ? `<img src="${escapeHtml(shopLogo)}" alt="${escapeHtml(shopName)} logo">` : `<div class="shoe-viewer-bottom-logo-fallback">${escapeHtml((shopName || 'S').charAt(0).toUpperCase())}</div>`}
        </div>
      </div>

      <div class="shoe-viewer-powered">powered by <span>CityStyle.app</span></div>
    </div>`;
  csApplyShoePanZoom();
  viewer.ontouchstart = e => {
    if (!csViewerState) return;
    if (e.touches && e.touches.length >= 2) {
      csOpenRealShoeZoom(1);
      e.preventDefault?.();
      return;
    }
    const t = e.changedTouches[0];
    csViewerState.startX = t.clientX;
    csViewerState.startY = t.clientY;
    csViewerState.startPanX = csViewerState.panX || 0;
    csViewerState.startPanY = csViewerState.panY || 0;
    csViewerState.didPan = false;
  };
  viewer.ontouchmove = e => {
    if (!csViewerState) return;
    if (e.touches && e.touches.length >= 2) {
      const dist = csTouchDistance(e.touches);
      if (dist && csViewerState.pinchStartDistance) {
        e.preventDefault?.();
        const nextScale = csClampZoomPan((csViewerState.pinchStartScale || 1) * (dist / csViewerState.pinchStartDistance), 1, 4.25);
        csViewerState.zoomed = nextScale > 1.05;
        csViewerState.zoomScale = nextScale;
        csApplyShoePanZoom();
      }
      return;
    }
    if (!csViewerState.zoomed) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - csViewerState.startX;
    const dy = t.clientY - csViewerState.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) csViewerState.didPan = true;
    e.preventDefault?.();
    const scale = Number(csViewerState.zoomScale || 2.65);
    const maxX = Math.max(120, Math.round(window.innerWidth * (scale - 1) * 0.42));
    const maxY = Math.max(160, Math.round(window.innerHeight * (scale - 1) * 0.38));
    csViewerState.panX = csClampZoomPan((csViewerState.startPanX || 0) + dx, -maxX, maxX);
    csViewerState.panY = csClampZoomPan((csViewerState.startPanY || 0) + dy, -maxY, maxY);
    csApplyShoePanZoom();
  };
  viewer.ontouchend = e => {
    if (!csViewerState) return;
    if (csViewerState.isPinching) {
      if (!e.touches || e.touches.length < 2) {
        csViewerState.isPinching = false;
        if (Number(csViewerState.zoomScale || 1) <= 1.08) csSetShoeZoomMode(false, 1);
      }
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - csViewerState.startX;
    const dy = t.clientY - csViewerState.startY;
    const moved = Math.abs(dx) > 14 || Math.abs(dy) > 14 || !!csViewerState.didPan;
    const tappedImage = !!e.target?.closest?.(".shoe-viewer-main-img");
    if (!moved && tappedImage) {
      const now = Date.now();
      const dist = Math.hypot((t.clientX || 0) - (csViewerState.lastTapX || 0), (t.clientY || 0) - (csViewerState.lastTapY || 0));
      if (now - (csViewerState.lastTap || 0) < 330 && dist < 42) {
        e.preventDefault?.();
        csViewerState.lastTap = 0;
        csToggleShoeZoom();
        return;
      }
      csViewerState.lastTap = now;
      csViewerState.lastTapX = t.clientX;
      csViewerState.lastTapY = t.clientY;
      return;
    }
    if (csViewerState.zoomed) return;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 42) shoeChangeProduct(dy < 0 ? 1 : -1);
    else if (Math.abs(dx) > 42) shoeChangeImage(dx < 0 ? 1 : -1);
  };
  viewer.onwheel = e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || csViewerState?.zoomed) {
      const current = Number(csViewerState.zoomScale || 1);
      const next = csClampZoomPan(current + (e.deltaY < 0 ? 0.22 : -0.22), 1, 4.25);
      csViewerState.zoomed = next > 1.05;
      csViewerState.zoomScale = next;
      csApplyShoePanZoom();
      return;
    }
    const now=Date.now(); if(now-csViewerWheelLock<450) return; csViewerWheelLock=now; shoeChangeProduct(e.deltaY > 0 ? 1 : -1);
  };
  document.onkeydown = e => {
    if (!document.getElementById("shoeViewer")) return;
    if (e.key === "Escape") closeShoeViewer();
    if (e.key === "ArrowLeft") shoeChangeImage(-1);
    if (e.key === "ArrowRight") shoeChangeImage(1);
    if (e.key === "ArrowUp") shoeChangeProduct(-1);
    if (e.key === "ArrowDown") shoeChangeProduct(1);
    if (String(e.key || "").toLowerCase() === "z") csToggleShoeZoom();
  };
}
function shoeChangeProduct(delta) {
  if (!csViewerState) return;
  const next = csViewerState.index + delta;
  if (next < 0 || next >= products.length) return;
  csViewerState.index = next;
  csViewerState.image = 0;
  csViewerState.zoomed = false;
  csResetShoePan();
  renderShoeViewer();
}
function shoeChangeImage(delta) {
  const imgs = csProductImages(currentShoeProduct());
  if (!imgs.length) return;
  csViewerState.image = (csViewerState.image + delta + imgs.length) % imgs.length;
  csViewerState.zoomed = false;
  csViewerState.zoomScale = 1;
  csResetShoePan();
  renderShoeViewer();
}
function shoeSetImage(i) { csViewerState.image = i; csViewerState.zoomed = false; csViewerState.zoomScale = 1; csResetShoePan(); renderShoeViewer(); }
async function shareShoeProduct(e) { e?.stopPropagation?.(); const p=currentShoeProduct(); const url=csProductUrl(p); const text=`${p.name || 'Patike'} - ${csProductPrice(p)}`; if(navigator.share){try{await navigator.share({title:p.name||'Oglas',text,url});return;}catch(_){}} navigator.clipboard?.writeText(url); window.App.showMessage("Link oglasa je kopiran.", "success"); }
function askShoeProduct(e) {
  e?.stopPropagation?.();
  const p = currentShoeProduct();
  const phone = csWhatsAppPhone(currentSalon._publicPhone || "");
  if (!phone) return window.App.showMessage("Vlasnik nije upisao WhatsApp/telefon.", "error");
  const lines = [
    "Zdravo, zanima me ovaj oglas:",
    "",
    `Oglas: ${csProductCode(p)}`,
    `Naziv: ${p.name || 'Patike'}`,
    p.category ? `Brend / kategorija: ${p.category}` : "",
    `Cena: ${csProductPrice(p)}`,
    `Status: ${csProductStatus(p)}`,
    csProductPublicDescription(p) ? `Opis: ${csProductPublicDescription(p)}` : "",
    `Link: ${csProductUrl(p)}`
  ].filter(Boolean);
  const msg = encodeURIComponent(lines.join("\n"));
  window.location.href = `https://wa.me/${phone}?text=${msg}`;
}
function callShoeShop(e) { e?.stopPropagation?.(); const phone=csSafePhone(currentSalon._publicPhone || ""); if(!phone) return window.App.showMessage("Telefon nije upisan.", "error"); window.location.href=`tel:${phone}`; }

Object.assign(window, { openCityStyleMaps, openShoeViewer, closeShoeViewer, shoeChangeProduct, shoeChangeImage, shoeSetImage, shareShoeProduct, askShoeProduct, callShoeShop, csSmartCropShoeImage, csToggleShoeZoom, csApplyShoePanZoom, csOpenRealShoeZoom, csViewerZoomIcon });
