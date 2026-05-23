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
    const urlSlug = window.App?.getUrlParam("salon");
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
  openProductFromUrlIfRequested();
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
    caption: escapeHtml(item.caption || "Galerija biznisa"),
    index
  })).filter(item => item.url);

  const phoneDisplay = safeImages.length ? `
    <div class="cs-phone-gallery-card cs-phone-gallery-card--minimal" data-gallery-count="${Math.min(safeImages.length, 30)}">
      <div class="cs-phone-gallery-slides" aria-label="Galerija slika iz admin panela">
        ${safeImages.slice(0, 30).map((item, i) => `
          <img class="cs-phone-slide ${i === 0 ? "active" : ""}" data-index="${i}" src="${item.url}" alt="Slika ${i + 1} iz admin galerije za početnu">
        `).join("")}
      </div>
      <div class="cs-phone-gallery-dots" aria-label="Automatska galerija slika na početnoj">
        ${safeImages.slice(0, 10).map((_, i) => `<button type="button" class="${i === 0 ? "active" : ""}" data-index="${i}" aria-label="Prikaži sliku ${i + 1}"></button>`).join("")}
      </div>
    </div>
  ` : `
    <div class="cs-phone-fallback-profile cs-phone-fallback-minimal" aria-label="Primer prikaza telefona">
      <div class="cs-phone-fallback-glow"></div>
      <div class="cs-phone-fallback-badge"></div>
    </div>
  `;

  app.innerHTML = `
    <section class="landing-page sales-homepage cs-pro-home">
      <header class="landing-nav sales-nav cs-pro-nav">
        <a class="brand-mark" href="./?home=1" aria-label="CityStyle.app početna">
          <div class="brand-icon">CS</div>
          <strong>CITYSTYLE<span>.APP</span></strong>
        </a>
        <div class="landing-actions nav-actions">
          <a class="btn btn-dark" href="salon/">Ulaz za vlasnika</a>
        </div>
      </header>

      <section class="cs-hero-pro">
        <div class="cs-hero-glow"></div>
        <div class="cs-hero-copy">
          <span class="eyebrow">QR profil za salone, majstore, servise, radnje i lokalne biznise</span>
          <h1>Izgradite digitalni profil koji klijent otvara jednim skeniranjem.</h1>
          <p class="hero-lead">
            CityStyle.app pretvara običan QR kod u moderan ulaz u vaš biznis. Mušterija skenira QR kod, vidi usluge,
            katalog, radno vreme, fotografije i kontakt, a zatim može da zakaže termin, pošalje upit, zatraži uslugu ili pogleda ponudu.
          </p>
          <div class="cs-hero-points">
            <div><b>🔔</b><span>Kada klijent pošalje zahtev, dobijate zvučnu i vizuelnu notifikaciju u panelu.</span></div>
            <div><b>📱</b><span>Klijent može sačuvati prečicu na telefonu — kao malu app ikonu za brzi povratak baš u vaš biznis.</span></div>
          </div>
          <div class="hero-buttons simple-buttons">
            <a class="btn btn-primary" href="salon/">Ulaz za vlasnika biznisa</a>
            <button class="btn btn-dark" type="button" onclick="scrollToHowItWorks()">Kako radi?</button>
            <a class="btn btn-dark" href="mailto:duskomacak@gmail.com?subject=CityStyle.app%20saradnja">Kontakt za saradnju</a>
          </div>
        </div>

        <div class="cs-phone-stage" aria-label="Primer telefona sa slikama iz admin panela">
          <div class="cs-phone-shell">
            <div class="cs-phone-top"></div>
            <div class="cs-phone-screen-showcase">${phoneDisplay}</div>
            <div class="cs-phone-notice">🔔 Novi zahtev je stigao</div>
          </div>
          <div class="cs-phone-install-actions" aria-label="Preuzimanje CityStyle aplikacije">
            <button class="btn btn-primary cs-home-install-btn" type="button" onclick="installApp('Na telefonu otvorite meni browsera i izaberite Dodaj na početni ekran. Ako koristite iPhone: Share → Add to Home Screen.', 'CityStyle app je dodata na telefon.')">📱 Preuzmi app</button>
            <p>Vlasnik može dodati CityStyle kao prečicu/app za brži ulaz.</p>
          </div>
        </div>
      </section>

      <section class="cs-trust-strip">
        <div><strong>QR ulaz</strong><span>jedan link za vaš profil</span></div>
        <div><strong>Prečica</strong><span>klijent čuva vaš biznis na telefonu</span></div>
        <div><strong>Notifikacije</strong><span>zvučno i vizuelno obaveštenje</span></div>
        <div><strong>Panel</strong><span>zahtevi, termini, katalog i statistika</span></div>
      </section>

      <section id="how-it-works" class="sales-section cs-how-premium">
        <span class="eyebrow">Kako korisnik vidi vaš biznis?</span>
        <h2>QR kod vodi klijenta direktno u vaš profil.</h2>
        <p class="muted cs-section-lead">Bez traženja po porukama i bez komplikacije. Skenira kod, vidi vašu ponudu i ima prečicu za sledeći put.</p>
        <div class="steps-grid cs-journey-grid">
          <div class="step-card"><strong>1</strong><h3>Skenira QR</h3><p>QR može biti na vratima, vizit karti, društvenim mrežama, oglasu ili flajeru.</p></div>
          <div class="step-card"><strong>2</strong><h3>Vidi profil</h3><p>Usluge, proizvodi, slike, radno vreme, kontakt i lokacija su složeni pregledno.</p></div>
          <div class="step-card"><strong>3</strong><h3>Šalje zahtev</h3><p>Korisnik zakazuje termin, traži uslugu, šalje upit ili pita za proizvod.</p></div>
          <div class="step-card"><strong>4</strong><h3>Čuva prečicu</h3><p>Na telefonu može sačuvati ikonu koja ga vraća baš na profil vašeg biznisa.</p></div>
        </div>
      </section>

      <section class="sales-section cs-packages-section">
        <span class="eyebrow">Paketi bez prikaza cena</span>
        <h2>Paketi su složeni po tipu biznisa i količini ponude.</h2>
        <div class="cs-package-row"><span>QR START</span><span>REZERVACIJE</span><span>KATALOG</span><span>GARAŽA</span></div>
        <div class="cs-package-grid">
          <article class="cs-package-card"><div class="pkg-icon">🔗</div><h3>QR Start</h3><p>Za biznise kojima treba jasan digitalni profil i brz kontakt.</p><ul><li>QR link profila</li><li>Logo, opis i kontakt</li><li>Radno vreme i lokacija</li><li>Osnovni upit klijenta</li></ul></article>
          <article class="cs-package-card featured"><div class="pkg-icon">📅</div><h3>Rezervacije</h3><p>Za salone, servise i usluge koje rade preko termina.</p><ul><li>Usluge i trajanje</li><li>Zakazivanje termina</li><li>Panel za zahteve</li><li>Zvučna i vizuelna notifikacija</li></ul></article>
          <article class="cs-package-card"><div class="pkg-icon">🛍️</div><h3>Katalog</h3><p>Za radnje, majstore i biznise koji žele prikaz ponude.</p><ul><li>Proizvodi i usluge</li><li>Opis, cena i status</li><li>Upit za proizvod/uslugu</li><li>QR statistika izvora</li></ul></article>
        </div>
      </section>

      <section class="sales-section cs-owner-section">
        <span class="eyebrow">Šta dobija vlasnik?</span>
        <h2>Jedan panel za profil, zahteve, ponudu i QR rezultate.</h2>
        <div class="check-grid cs-benefit-grid">
          <div>✓ naziv, logo i javni profil</div><div>✓ QR kodovi za više izvora</div><div>✓ slike i galerija biznisa</div><div>✓ usluge, proizvodi ili garaža</div><div>✓ termini i zahtevi</div><div>✓ zvučna i vizuelna notifikacija</div><div>✓ statistika poseta</div><div>✓ WhatsApp/kontakt poruke</div>
        </div>
      </section>

      <section class="sales-section cs-business-types">
        <span class="eyebrow">Za koga je?</span>
        <h2>Za male biznise koji žele da ih klijent lakše pronađe i zapamti.</h2>
        <div class="business-types-grid">
          <div>💈 Frizeri i saloni</div><div>💅 Kozmetika</div><div>🛞 Vulkanizeri</div><div>🔧 Auto servisi</div><div>🎨 Moleri i majstori</div><div>🛠️ Servisi i radionice</div><div>🛒 Male radnje</div>
        </div>
      </section>

      <section class="legal-notice-box cs-legal-clean">
        <h2>Važna napomena o odgovornosti</h2>
        <p>CityStyle.app je tehnička platforma koja omogućava biznisima da prikažu svoje usluge, proizvode, cene, radno vreme i da primaju zahteve korisnika.</p>
        <p>Svaki biznis samostalno odgovara za tačnost svojih podataka, kvalitet usluga, proizvode, cene, termine, reklamacije, račune, poreze i svoje zakonsko poslovanje.</p>
      </section>

      <section class="platform-contact-box sales-contact-box cs-contact-pro">
        <h2>Kontakt za saradnju</h2>
        <p>Za informacije, aktivaciju biznis profila ili prijavu problema pišite na:</p>
        <a href="mailto:duskomacak@gmail.com">duskomacak@gmail.com</a>
      </section>

      <footer class="sales-footer">
        <p>© 2026 CityStyle.app — tehnička platforma za QR biznis profile.</p>
        <div>
          <button type="button" class="footer-link-btn" onclick="openLegalModal('terms')">Uslovi korišćenja</button>
          <button type="button" class="footer-link-btn" onclick="openLegalModal('privacy')">Politika privatnosti</button>
          <a href="mailto:duskomacak@gmail.com">Kontakt</a>
          <a class="subtle-admin-link" href="admin/">Admin panel</a>
        </div>
      </footer>
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

  let result = await window.db
    .from("products")
    .select("*, product_images(*)")
    .eq("salon_id", currentSalon.id)
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (result.error) {
    console.warn("Product images relation is not available yet, loading products only:", result.error);
    result = await window.db
      .from("products")
      .select("*")
      .eq("salon_id", currentSalon.id)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
  }

  if (result.error) {
    console.warn("Products table/list is not available yet:", result.error);
    products = [];
    return;
  }

  products = normalizeProductImages(result.data || []);
}

function normalizeProductImages(rows = []) {
  return rows.map(product => {
    const extra = Array.isArray(product.product_images)
      ? [...product.product_images].sort((a, b) => Number(a.sort_order || 100) - Number(b.sort_order || 100))
      : [];
    const urls = [];
    if (product.image_url) urls.push(product.image_url);
    extra.forEach(img => { if (img?.image_url && !urls.includes(img.image_url)) urls.push(img.image_url); });
    return { ...product, product_images: extra, _image_urls: urls };
  });
}

function getProductImages(product = {}) {
  if (Array.isArray(product._image_urls) && product._image_urls.length) return product._image_urls;
  return product.image_url ? [product.image_url] : [];
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
  const businessType = window.App.normalizeBusinessType ? window.App.normalizeBusinessType(currentSalon.business_type) : String(currentSalon.business_type || "general");
  const profileLabels = window.App.getBusinessProfileLabels(currentSalon.business_type);
  const isCatalogProfile = businessType === "catalog";
  const rawWelcomeText = String(settings?.welcome_text || "").trim();
  const genericCatalogTexts = [
    "Dobrodošli. Izaberite uslugu, datum i slobodan termin ili pošaljite zahtev.",
    "Pošaljite zahtev ili zakažite termin brzo i jednostavno.",
    "Dobrodošli",
    ""
  ];
  const introText = isCatalogProfile && genericCatalogTexts.includes(rawWelcomeText)
    ? "Pogledajte proizvode i otvorite svaki oglas u jednom potezu."
    : (rawWelcomeText || C("welcomeDefault", "Dobrodošli. Izaberite uslugu, datum i slobodan termin ili pošaljite zahtev."));
  const primaryActionHtml = isCatalogProfile
    ? `<button class="btn btn-primary" type="button" onclick="openProductFeed()">${products.length ? "Pogledaj proizvode" : "Proizvodi još nisu dodati"}</button>`
    : `<button class="btn btn-primary" type="button" onclick="showBookingForm()">${escapeHtml(profileLabels.action)}</button>`;
  const secondaryActionsHtml = isCatalogProfile
    ? `<button class="btn btn-dark btn-profile-install" type="button" onclick="installCurrentSalonApp()">📱 Preuzmi app profila</button>`
    : `${services.length ? `<button class="btn btn-dark" type="button" onclick="showServices()">${escapeHtml(profileLabels.services)}</button>` : ""}${products.length ? `<button class="btn btn-dark" type="button" onclick="openProductFeed()">${C("productsCatalog", "Proizvodi / cenovnik")}</button>` : ""}<button class="btn btn-dark btn-profile-install" type="button" onclick="installCurrentSalonApp()">📱 Preuzmi app profila</button>`;
  currentSalon._publicName = publicName;
  currentSalon._publicLogo = settings?.logo_url || "";
  currentSalon._publicPhone = settings?.phone || currentSalon.phone || "";
  window.App?.updateManifestForSalon?.(currentSalon.slug, { name: publicName, iconUrl: settings?.logo_url, themeColor: currentSalon.theme_color });

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
          <p class="intro-text">${escapeHtml(introText)}</p>
          ${(settings?.phone || settings?.address) ? `
            <div class="public-profile-contact">
              ${settings?.phone ? `<a href="tel:${escapeHtml(window.App.normalizePhoneForTel ? window.App.normalizePhoneForTel(settings.phone) : settings.phone)}">📞 ${escapeHtml(settings.phone)}</a>` : ""}
              ${settings?.address ? `<span>📍 ${escapeHtml(settings.address)}</span>` : ""}
            </div>
          ` : ""}
        </div>

        <div class="client-actions client-actions-minimal">
          ${primaryActionHtml}
          ${secondaryActionsHtml}
        </div>
      </div>

      <div id="client-extra">
        ${isCatalogProfile ? "" : renderClientServicesPreview()}
        ${isCatalogProfile ? "" : renderClientProductsPreview(false)}
        ${isCatalogProfile ? "" : renderClientGalleryPreview()}
        ${!isCatalogProfile ? renderClientWorkingHours(workingHours || []) : ""}
      </div>
      <div id="booking-box"></div>
    </section>
  `;
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
  return `
    <details class="card client-hours-panel client-gallery-panel" open>
      <summary>
        <span>Galerija radova</span>
        <small>${galleryImages.length}/10</small>
      </summary>
      <div class="public-gallery-grid">
        ${galleryImages.map(image => `
          <button type="button" class="public-gallery-item" onclick="openPublicGalleryImage('${escapeJs(image.image_url)}', '${escapeJs(image.caption || '')}')">
            <img src="${escapeHtml(image.image_url)}" alt="${escapeHtml(image.caption || 'Galerija radova')}">
            ${image.caption ? `<span>${escapeHtml(image.caption)}</span>` : ""}
          </button>
        `).join("")}
      </div>
    </details>
  `;
}

function openPublicGalleryImage(url, caption = "") {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop gallery-lightbox";
  modal.innerHTML = `
    <div class="modal-card gallery-lightbox-card">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(caption || 'Galerija radova')}">
      ${caption ? `<p>${escapeHtml(caption)}</p>` : ""}
      <button class="btn btn-dark" type="button" onclick="this.closest('.modal-backdrop').remove()">Zatvori</button>
    </div>`;
  document.body.appendChild(modal);
}

function installCurrentSalonApp() {
  if (!currentSalon?.slug) return;
  window.App.installSalonApp(currentSalon.slug, {
    name: currentSalon._publicName || currentSalon.salon_name || "CityStyle profil",
    iconUrl: currentSalon._publicLogo || "",
    themeColor: currentSalon.theme_color
  });
}

function renderClientServicesPreview() {
  const profileLabels = window.App.getBusinessProfileLabels(currentSalon?.business_type);
  if (!services.length) return "";

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


function getPublicContactPhone() {
  return String(currentSalon?._publicPhone || currentSalon?.phone || currentSalon?.whatsapp || "").replace(/\D/g, "");
}

function callPublicProfile() {
  const phone = getPublicContactPhone();
  if (!phone) {
    window.App?.showMessage?.("Telefon nije podešen za ovaj profil.", "error");
    return;
  }
  window.location.href = `tel:+${phone}`;
}

function productPublicCode(product = {}) {
  const code = String(product.public_code || product.product_code || "").trim();
  if (code) return code;
  const id = String(product.id || "").replace(/-/g, "").toUpperCase();
  return id ? `ART-${id.slice(0, 6)}` : "ARTIKAL";
}

function findProductByCodeOrId(value = "") {
  const wanted = String(value || "").trim();
  if (!wanted) return null;
  const wantedLower = wanted.toLowerCase();
  return products.find(row => {
    const id = String(row.id || "");
    const code = String(row.public_code || row.product_code || "");
    return id === wanted || code.toLowerCase() === wantedLower;
  }) || null;
}

function buildProductShareUrl(product = {}) {
  const url = new URL(window.location.origin + window.location.pathname);
  if (currentSalon?.slug) url.searchParams.set("salon", currentSalon.slug);
  const code = product.public_code || product.product_code || product.id;
  if (code) url.searchParams.set("product", String(code));
  return url.toString();
}

function buildProductQuestionMessage(product = {}) {
  const code = productPublicCode(product);
  const link = buildProductShareUrl(product);
  return [
    "Poštovani, interesuje me ovaj proizvod:",
    "",
    `Oglas: ${code}`,
    `Naziv: ${product.name || "Proizvod"}`,
    `Cena: ${renderProductPrice(product)}`,
    "",
    `Link proizvoda: ${link}`,
    "",
    "Da li je dostupno?"
  ].join("\n");
}

function buildProductWhatsApp(product = {}) {
  const phone = getPublicContactPhone();
  if (!phone) return "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildProductQuestionMessage(product))}`;
}

function buildProductWhatsAppAppUrl(product = {}) {
  const phone = getPublicContactPhone();
  if (!phone) return "";
  return `whatsapp://send?phone=${phone}&text=${encodeURIComponent(buildProductQuestionMessage(product))}`;
}

function openProductWhatsApp(product = {}) {
  const appUrl = buildProductWhatsAppAppUrl(product);
  const webUrl = buildProductWhatsApp(product);
  if (!webUrl) {
    window.App?.showMessage?.("Kontakt telefon / WhatsApp nije podešen za ovaj profil.", "error");
    return;
  }

  const isAndroid = /Android/i.test(navigator.userAgent || "");
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

  if (isAndroid && appUrl) {
    window.location.href = appUrl;
    window.setTimeout(() => {
      if (!document.hidden) window.location.href = webUrl;
    }, 950);
    return;
  }

  if (isMobile) {
    window.location.href = webUrl;
    return;
  }

  window.open(webUrl, "_blank", "noopener");
}

async function recordProductInquiry(product = {}) {
  try {
    if (!window.db || !currentSalon?.id || !product?.id) return;
    await window.db.from("product_inquiries").insert({
      salon_id: currentSalon.id,
      product_id: product.id,
      public_code_snapshot: productPublicCode(product),
      product_name_snapshot: product.name || null,
      price_snapshot: renderProductPrice(product),
      product_url: buildProductShareUrl(product),
      source: "whatsapp"
    });
  } catch (err) {
    console.warn("Upit za proizvod nije upisan u bazu, WhatsApp se ipak otvara:", err);
  }
}

function openWhatsAppMessage(message) {
  const phone = getPublicContactPhone();
  if (!phone) {
    window.App?.showMessage?.("Kontakt telefon / WhatsApp nije podešen za ovaj profil.", "error");
    return;
  }
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
}

function askForProductGeneral() {
  openWhatsAppMessage(`Poštovani, interesuje me vaša ponuda proizvoda. Možete li mi poslati više informacija?`);
}

function askAboutProduct(productId) {
  const product = findProductByCodeOrId(productId);
  if (!product) {
    askForProductGeneral();
    return;
  }
  const whatsappUrl = buildProductWhatsApp(product);
  if (!whatsappUrl) {
    window.App?.showMessage?.("Kontakt telefon / WhatsApp nije podešen za ovaj profil.", "error");
    return;
  }
  recordProductInquiry(product).finally(() => {
    openProductWhatsApp(product);
  });
}

function openProductFromUrlIfRequested() {
  const requested = window.App?.getUrlParam?.("product") || window.App?.getUrlParam?.("pid") || "";
  const hash = String(window.location.hash || "");
  const hashProduct = hash.startsWith("#product-") ? hash.replace("#product-", "") : "";
  const productKey = requested || hashProduct;
  if (!productKey || !products.length) return;
  const product = findProductByCodeOrId(productKey);
  if (!product) {
    window.App?.showMessage?.("Ovaj proizvod više nije dostupan ili je sakriven.", "error");
    return;
  }
  window.setTimeout(() => openProductFeed(product.id), 120);
}

async function shareProduct(productId) {
  const product = products.find(row => String(row.id) === String(productId));
  if (!product) return;
  const shareData = {
    title: product.name || "CityStyle proizvod",
    text: `${product.name} • ${renderProductPrice(product)}`,
    url: buildProductShareUrl(product)
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard.writeText(shareData.url);
    window.App.showMessage("Link proizvoda je kopiran.", "success");
  } catch (err) {
    console.warn("Deljenje proizvoda nije uspelo:", err);
  }
}

function getFeedActionIcon(type) {
  if (type === "close") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18"></path><path d="M6 6l12 12"></path></svg>`;
  }
  if (type === "share") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5l5 0 0 5"></path><path d="M10 14L19 5"></path><path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"></path></svg>`;
  }
  if (type === "call") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.7.6 2.5a2 2 0 0 1-.4 2.1L8.1 9.5a16 16 0 0 0 6.4 6.4l1.2-1.2a2 2 0 0 1 2.1-.4c.8.3 1.6.5 2.5.6a2 2 0 0 1 1.7 2z"></path></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10h8"></path><path d="M8 14h5"></path><path d="M12 21l-3.2-3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-1.8L12 21z"></path></svg>`;
}

function renderProductFeedCard(product = {}, index = 0) {
  const images = getProductImages(product);
  const firstImage = images[0] || "";
  const hasManyImages = images.length > 1;
  return `
    <section class="product-feed-slide" data-product-id="${escapeHtml(product.id)}" data-image-index="0">
      <div class="product-feed-media" onclick="toggleProductImageZoom(event)">
        ${firstImage ? `<img class="product-feed-current-image" src="${escapeHtml(firstImage)}" alt="${escapeHtml(product.name)}">` : `<div class="product-feed-empty">Dodajte sliku proizvoda</div>`}
        ${hasManyImages ? `
          <div class="product-gallery-swipe-hint">Prevuci levo/desno za slike</div>
          <div class="product-gallery-counter"><span class="product-gallery-current">1</span>/${images.length}</div>
          <div class="product-gallery-dots">${images.map((_, dotIndex) => `<button type="button" class="product-gallery-dot ${dotIndex === 0 ? "active" : ""}" onclick="setProductImage('${escapeJs(product.id)}', ${dotIndex})" aria-label="Slika ${dotIndex + 1}"></button>`).join("")}</div>
        ` : ""}
      </div>
      <div class="product-feed-topbar" aria-hidden="true"></div>
      <button class="feed-action-btn feed-action-btn--close product-feed-close-action" type="button" onclick="handleProductFeedClose(this)" aria-label="Izađi iz proizvoda">
        <span class="feed-action-icon">${getFeedActionIcon("close")}</span>
      </button>
      <div class="product-feed-side-actions tiktok-actions product-feed-bottom-actions">
        <button class="feed-action-btn feed-action-btn--share" type="button" onclick="shareProduct('${escapeJs(product.id)}')" aria-label="Podeli proizvod">
          <span class="feed-action-icon">${getFeedActionIcon("share")}</span>
        </button>
        <button class="feed-action-btn feed-action-btn--ask" type="button" onclick="askAboutProduct('${escapeJs(product.id)}')" aria-label="Pitaj za proizvod">
          <span class="feed-action-icon">${getFeedActionIcon("ask")}</span>
        </button>
        <button class="feed-action-btn feed-action-btn--call" type="button" onclick="callPublicProfile()" aria-label="Pozovi profil">
          <span class="feed-action-icon">${getFeedActionIcon("call")}</span>
        </button>
      </div>
      <div class="product-feed-info">
        <small>${escapeHtml(productPublicCode(product))}${product.category ? ` • ${escapeHtml(product.category)}` : ""}${images.length > 1 ? ` • ${images.length} slika` : ""}</small>
        <h2>${escapeHtml(product.name)}</h2>
        <div class="product-feed-price-row">
          <strong>${renderProductPrice(product)}</strong>
          <span>${getProductStatusLabel(product.stock_status)}</span>
        </div>
        ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ""}
      </div>
    </section>
  `;
}


function toggleProductImageZoom(event) {
  const target = event && event.target;
  if (target && target.closest && target.closest(".feed-action-btn, .product-gallery-dot, button, a, input, select, textarea")) return;
  const modal = target && target.closest ? target.closest(".product-feed-modal") : null;
  if (!modal) return;
  modal.classList.add("product-image-zoomed");
}

function handleProductFeedClose(button) {
  const modal = button && button.closest ? button.closest(".product-feed-modal") : null;
  if (!modal) return;
  if (modal.classList.contains("product-image-zoomed")) {
    modal.classList.remove("product-image-zoomed");
    return;
  }
  modal.remove();
}

function setProductImage(productId, nextIndex) {
  const product = products.find(row => String(row.id) === String(productId));
  const images = getProductImages(product);
  if (!product || !images.length) return;
  const slide = document.querySelector(`.product-feed-slide[data-product-id="${CSS.escape(String(productId))}"]`);
  if (!slide) return;
  const safeIndex = ((Number(nextIndex) % images.length) + images.length) % images.length;
  slide.dataset.imageIndex = String(safeIndex);
  const img = slide.querySelector(".product-feed-current-image");
  if (img) {
    img.src = images[safeIndex];
    img.alt = product.name || "Proizvod";
  }
  const current = slide.querySelector(".product-gallery-current");
  if (current) current.textContent = String(safeIndex + 1);
  slide.querySelectorAll(".product-gallery-dot").forEach((dot, index) => dot.classList.toggle("active", index === safeIndex));
}

function changeProductImage(productId, direction) {
  const slide = document.querySelector(`.product-feed-slide[data-product-id="${CSS.escape(String(productId))}"]`);
  const currentIndex = Number(slide?.dataset?.imageIndex || 0);
  setProductImage(productId, currentIndex + Number(direction || 1));
}


function setupProductFeedSwipe(modal) {
  if (!modal) return;
  const shell = modal.querySelector(".product-feed-shell");
  const slides = Array.from(modal.querySelectorAll(".product-feed-slide"));
  if (!shell || !slides.length) return;

  let currentSlideIndex = 0;
  let isMovingSlide = false;
  let wheelLocked = false;

  function setActiveSlide(nextIndex) {
    const safeIndex = Math.max(0, Math.min(slides.length - 1, Number(nextIndex || 0)));
    currentSlideIndex = safeIndex;
    slides.forEach((slide, idx) => slide.classList.toggle("active", idx === safeIndex));
  }

  function goToSlide(nextIndex) {
    const safeIndex = Math.max(0, Math.min(slides.length - 1, Number(nextIndex || 0)));
    setActiveSlide(safeIndex);
    if (Math.abs(shell.scrollTop - (slides[safeIndex]?.offsetTop || 0)) < 4) return;
    isMovingSlide = true;
    shell.scrollTo({ top: slides[safeIndex].offsetTop, behavior: "smooth" });
    window.setTimeout(() => { isMovingSlide = false; setActiveSlide(safeIndex); }, 420);
  }

  setActiveSlide(0);

  shell.addEventListener("scroll", () => {
    if (isMovingSlide) return;
    const approxIndex = Math.round(shell.scrollTop / Math.max(1, shell.clientHeight));
    setActiveSlide(approxIndex);
  }, { passive: true });

  shell.addEventListener("wheel", event => {
    if (wheelLocked) {
      event.preventDefault();
      return;
    }
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    wheelLocked = true;
    goToSlide(currentSlideIndex + (event.deltaY > 0 ? 1 : -1));
    window.setTimeout(() => { wheelLocked = false; }, 520);
  }, { passive: false });


    function isProductActionTarget(target) {
      return !!(target && target.closest && target.closest(".feed-action-btn, .product-gallery-dot, button, a, input, select, textarea"));
    }

  slides.forEach((slide, index) => {
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let lockedAxis = null;
    let gestureHandled = false;

    slide.addEventListener("touchstart", event => {
      if (isProductActionTarget(event.target)) return;
      const touch = event.touches && event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = startX;
      lastY = startY;
      lockedAxis = null;
      gestureHandled = false;
      currentSlideIndex = index;
    }, { passive: true });

    slide.addEventListener("touchmove", event => {
      if (isProductActionTarget(event.target)) return;
      const touch = event.touches && event.touches[0];
      if (!touch) return;
      lastX = touch.clientX;
      lastY = touch.clientY;
      const diffX = lastX - startX;
      const diffY = lastY - startY;
      if (!lockedAxis && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
        lockedAxis = Math.abs(diffX) > Math.abs(diffY) ? "x" : "y";
      }
      if (lockedAxis === "x" || lockedAxis === "y") {
        event.preventDefault();
      }
    }, { passive: false });

    slide.addEventListener("touchend", event => {
      if (isProductActionTarget(event.target)) return;
      if (gestureHandled) return;
      const diffX = lastX - startX;
      const diffY = lastY - startY;
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);

      if (absX > 48 && absX > absY * 1.2) {
        const productId = slide.dataset.productId;
        changeProductImage(productId, diffX < 0 ? 1 : -1);
        gestureHandled = true;
      } else if (absY > 54 && absY > absX * 1.15) {
        goToSlide(index + (diffY < 0 ? 1 : -1));
        gestureHandled = true;
      } else {
        goToSlide(index);
      }

      if (event && event.cancelable) event.preventDefault();
      startX = 0;
      startY = 0;
      lastX = 0;
      lastY = 0;
      lockedAxis = null;
    }, { passive: false });
  });
}

function openProductFeed(startProductId = null) {
  if (!products.length) {
    showProducts();
    return;
  }
  const orderedProducts = [...products];
  if (startProductId) {
    const index = orderedProducts.findIndex(row => String(row.id) === String(startProductId));
    if (index > 0) {
      const [selected] = orderedProducts.splice(index, 1);
      orderedProducts.unshift(selected);
    }
  }
  const modal = document.createElement("div");
  modal.className = "product-feed-modal";
  modal.innerHTML = `
    <div class="product-feed-shell">
      ${orderedProducts.map((product, index) => renderProductFeedCard(product, index)).join("")}
    </div>
  `;
  document.body.appendChild(modal);
  setupProductFeedSwipe(modal);
}

function renderClientProductsPreview(forceOpen = false) {
  if (!products.length) return "";
  return `
    <section class="card client-products-simple ${forceOpen ? "client-products-featured" : ""}">
      <div class="client-products-simple-head">
        <div>
          <h2>${C("productsCatalog", "Proizvodi / cenovnik")}</h2>
          <p class="muted">Otvorite proizvode u punom prikazu: slika, cena, opis, podeli i pitaj.</p>
        </div>
        <button class="btn btn-primary" type="button" onclick="openProductFeed()">Pogledaj proizvode</button>
      </div>
      <div class="product-public-strip">
        ${products.slice(0, 6).map(product => `
          <button type="button" class="product-public-mini" onclick="openProductFeed('${escapeJs(product.id)}')">
            ${getProductImages(product)[0] ? `<img src="${escapeHtml(getProductImages(product)[0])}" alt="${escapeHtml(product.name)}">` : `<span>Proizvod</span>`}
            <b>${escapeHtml(product.name)}</b>
            <small>${renderProductPrice(product)}</small>
          </button>
        `).join("")}
      </div>
    </section>
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
        <div class="product-public-grid">
          ${products.map(product => `
            <button type="button" class="product-public-card product-public-clickable" onclick="openProductFeed('${escapeJs(product.id)}')">
              ${getProductImages(product)[0] ? `<img class="product-public-img" src="${escapeHtml(getProductImages(product)[0])}" alt="${escapeHtml(product.name)}">` : ""}
              <div class="product-public-body">
                <strong>${escapeHtml(product.name)}</strong>
                ${product.category ? `<span>${escapeHtml(product.category)}</span>` : ""}
                ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ""}
              </div>
              <div class="product-public-meta">
                <b>${renderProductPrice(product)}</b>
                <small>${getProductStatusLabel(product.stock_status)}</small>
              </div>
            </button>
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

  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = order.map(day => {
    const h = (hours || []).find(row => Number(row.day_of_week) === day);
    if (!h || h.is_closed) {
      return `<div class="service-row hours-list-row"><div><strong>${dayNames[day]}</strong><span>${C("closed", "Zatvoreno")}</span></div><b>—</b></div>`;
    }
    return `<div class="service-row hours-list-row"><div><strong>${dayNames[day]}</strong><span>${C("workingHours", "Radno vreme")}</span></div><b>${String(h.open_time).slice(0,5)}–${String(h.close_time).slice(0,5)}</b></div>`;
  }).join("");

  return `
    <details class="card client-hours-panel">
      <summary>
        <span>${C("workingHours", "Radno vreme")}</span>
        <small>${C("showSchedule", "Prikaži raspored")}</small>
      </summary>
      <div class="service-list hours-list">${rows}</div>
    </details>
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

  const businessType = window.App.normalizeBusinessType ? window.App.normalizeBusinessType(currentSalon?.business_type) : String(currentSalon?.business_type || "general");
  if (businessType === "catalog") {
    askForProductGeneral();
    return;
  }

  if (!services.length) {
    box.innerHTML = `<div class="card"><h2>${C("bookingUnavailable", "Zakazivanje nije dostupno")}</h2><p class="muted">${C("noServicesText", "Trenutno nema dostupnih usluga za online zahtev.")}</p></div>`;
    return;
  }

  const today = window.BookingLogic?.getLocalDateString ? window.BookingLogic.getLocalDateString() : new Date().toISOString().split("T")[0];
  const profileLabels = window.App.getBusinessProfileLabels(currentSalon?.business_type);
  selectedDate = today;
  selectedTime = null;

  box.innerHTML = `
    <div class="card booking-card booking-paper-card">
      <h2>${escapeHtml(profileLabels.formTitle)}</h2>
      <p class="muted">${escapeHtml(profileLabels.formIntro)}</p>

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
            <option value="385">🇭🇷 Hrvatska +385</option>
            <option value="382">🇲🇪 Crna Gora +382</option>
            <option value="386">🇸🇮 Slovenija +386</option>
            <option value="389">🇲🇰 Severna Makedonija +389</option>
            <option value="49">🇩🇪 Nemačka +49</option>
            <option value="43">🇦🇹 Austrija +43</option>
          </select>
        </div>
      </div>

      <label>${C("phoneWhatsapp", "Broj telefona / WhatsApp")}</label>
      <input id="client-phone" type="tel" inputmode="tel" placeholder="64 123 4567">
      <p class="field-help">${C("phoneHelp", "Izaberite državu i unesite lokalni broj. Možete uneti broj sa nulom ili bez nule. Aplikacija će ga sačuvati u ispravnom WhatsApp formatu prema izabranoj državi. Ako unesete broj sa +, koristi se direktno.")}</p>

      <label>${escapeHtml(profileLabels.requestKindLabel)}</label>
      <input id="client-request-kind" type="text" placeholder="${escapeHtml(profileLabels.requestKindPlaceholder)}">

      ${(window.App.normalizeBusinessType(currentSalon?.business_type) === "repair" || window.App.normalizeBusinessType(currentSalon?.business_type) === "craft") ? `
        <label>Adresa / lokacija</label>
        <input id="client-address" type="text" placeholder="Mesto, ulica ili lokacija problema">
        <label>Hitnost</label>
        <select id="client-urgency">
          <option value="Normalno">Normalno</option>
          <option value="Hitno">Hitno</option>
          <option value="Nije hitno">Nije hitno</option>
        </select>
      ` : ""}

      <label>${escapeHtml(profileLabels.noteLabel)}</label>
      <textarea id="client-note" rows="4" placeholder="${escapeHtml(profileLabels.notePlaceholder)}"></textarea>

      <button class="btn btn-primary booking-submit-btn" type="button" onclick="submitAppointment()">${escapeHtml(profileLabels.action)}</button>
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

  // Ako korisnik već unese međunarodni format, koristi ga direktno.
  if (raw.startsWith("+")) {
    const international = raw.replace(/\D/g, "");
    return international.length >= 8 ? `+${international}` : "";
  }

  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    return digits.length >= 8 ? `+${digits}` : "";
  }

  const cc = String(countryCode || "381").replace(/\D/g, "") || "381";
  if (digits.startsWith("0")) digits = digits.slice(1);

  const full = `${cc}${digits}`;
  return full.length >= 8 ? `+${full}` : "";
}

async function submitAppointment() {
  const name = document.getElementById("client-name")?.value.trim();
  const phoneRaw = document.getElementById("client-phone")?.value.trim();
  const phoneCountry = document.getElementById("client-phone-country")?.value || "381";
  const phone = normalizeClientPhoneForStorage(phoneRaw, phoneCountry);
  const note = document.getElementById("client-note")?.value.trim();
  const requestKind = document.getElementById("client-request-kind")?.value.trim();
  const clientAddress = document.getElementById("client-address")?.value.trim();
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
    window.App.notifyOwnerAboutNewAppointment(insertedAppointment.id);
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
