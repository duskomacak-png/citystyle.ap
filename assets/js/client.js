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

    // If an owner installed CityStyle and is already logged in, open the owner panel directly.
    const isStandalone = window.App?.isStandaloneMode?.() === true;
    const ownerSession = window.App?.getLocal?.(window.APP_CONFIG?.salonSessionKey || "citystyle_salon_session");
    if (!forcePlatform && isStandalone && ownerSession?.salon_id) {
      window.location.href = window.App.getAppPath("salon/");
      return;
    }

    // Root citystyle.app in normal browser is the platform landing page.
    // If the app was installed from a public profile page, open that saved profile directly.
    const savedSlug = window.App?.getSavedSalonSlug?.();
    if (savedSlug && isStandalone) {
      app.innerHTML = `<div class="loading-box">${C("loadingProfile", "Učitavanje profila...")}</div>`;
      await loadSalon(savedSlug, false);
      return;
    }

    renderPlatformLanding();
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

function renderPlatformLanding() {
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
  app.innerHTML = `
    <section class="landing-page sales-homepage">
      <header class="landing-nav sales-nav">
        <a class="brand-mark" href="./?home=1" aria-label="CityStyle.app početna">
          <div class="brand-icon">CS</div>
          <strong>CITYSTYLE<span>.APP</span></strong>
        </a>
        <div class="landing-actions nav-actions">
          <a class="btn btn-dark" href="salon/">Ulaz za vlasnika</a>
          <a class="btn btn-primary subtle-admin-link" href="admin/">Admin panel</a>
        </div>
      </header>

      <section class="sales-hero">
        <div class="sales-hero-content">
          <span class="eyebrow">QR profil, katalog i prijem zahteva za lokalne biznise</span>
          <h1>Jedan QR kod koji vodi klijenta pravo do vašeg biznisa.</h1>
          <p class="hero-lead">
            CityStyle.app omogućava da klijent skenira QR kod i odmah vidi usluge, cenovnik,
            galeriju radova, proizvode, radno vreme i kontakt. Može da pošalje zahtev, prijavi problem,
            zakaže termin ili pita za proizvod, a vlasnik dobija zvučno i vizuelno obaveštenje.
          </p>
          <div class="hero-buttons simple-buttons">
            <a class="btn btn-primary" href="salon/">Ulaz za vlasnika biznisa</a>
            <a class="btn btn-dark" href="mailto:duskomacak@gmail.com?subject=CityStyle.app%20saradnja">Kontakt za saradnju</a>
            <button class="btn btn-dark" type="button" onclick="scrollToHowItWorks()">Kako radi?</button>
          </div>
          <p class="muted small-note">
            Za pristup konkretnom biznisu koristite QR kod ili link koji ste dobili od tog biznisa.
          </p>
        </div>
        <div class="sales-hero-phone" aria-label="Šta omogućava CityStyle.app">
          <div class="phone-preview-card platform-benefit-card">
            <div class="phone-logo">QR</div>
            <h3>Profil koji radi za više tipova biznisa</h3>
            <p>Salon • Majstor • Katalog • Garaža</p>
            <div class="phone-list-item"><span>Usluge i cenovnik</span><b>✓</b></div>
            <div class="phone-list-item"><span>Galerija radova</span><b>✓</b></div>
            <div class="phone-list-item"><span>Proizvodi / oglasi</span><b>✓</b></div>
            <div class="phone-list-item"><span>Statistika QR poseta</span><b>✓</b></div>
          </div>
        </div>
      </section>

      <section class="sales-grid-three">
        <article class="sales-feature-card">
          <span>01</span>
          <h2>Sopstveni QR profil</h2>
          <p>Svaki biznis dobija svoj link i QR kod. Klijent odmah otvara pravi profil, bez traženja po internetu.</p>
        </article>
        <article class="sales-feature-card">
          <span>02</span>
          <h2>Ponuda na jednom mestu</h2>
          <p>Usluge, cenovnik, proizvodi, galerija radova, radno vreme i kontakt stoje uredno u jednom profilu.</p>
        </article>
        <article class="sales-feature-card">
          <span>03</span>
          <h2>Obaveštenja i statistika</h2>
          <p>Vlasnik dobija obaveštenje za nove zahteve i vidi iz kojih QR/link izvora dolaze posete.</p>
        </article>
      </section>

      <section class="sales-section">
        <span class="eyebrow">Za koga je platforma?</span>
        <h2>Za salone, radnje, servise, majstore i lokalne biznise.</h2>
        <div class="business-types-grid">
          <div>Frizerski i kozmetički saloni</div>
          <div>Majstori za grejanje i hlađenje</div>
          <div>Keramičari, moleri i zanatlije</div>
          <div>Vulkanizeri i auto servisi</div>
          <div>Male radnje i katalozi</div>
          <div>Prodaja opreme i proizvoda</div>
          <div>Auto-placevi i Garaža oglasi</div>
          <div>Servisi i radionice</div>
        </div>
      </section>

      <section class="sales-section value-section">
        <span class="eyebrow">Šta dobija vlasnik?</span>
        <h2>Jednostavan alat koji izgleda kao mala aplikacija vašeg biznisa.</h2>
        <div class="check-grid">
          <div>✓ naziv, logo i opis biznisa</div>
          <div>✓ javni QR profil</div>
          <div>✓ usluge i cenovnik</div>
          <div>✓ proizvodi / katalog</div>
          <div>✓ galerija radova</div>
          <div>✓ Garaža oglasi za vozila i mašine</div>
          <div>✓ zakazivanje, upiti i prijave problema</div>
          <div>✓ zvučne i vizuelne notifikacije</div>
          <div>✓ QR kodovi po izvoru reklame</div>
          <div>✓ statistika poseta po izvorima</div>
          <div>✓ radno vreme i kontakt</div>
          <div>✓ panel za vlasnika</div>
        </div>
      </section>

      <section id="how-it-works" class="sales-section how-section">
        <span class="eyebrow">Kako radi?</span>
        <h2>Tri jednostavna koraka.</h2>
        <div class="steps-grid">
          <div class="step-card"><strong>1</strong><h3>Otvorimo profil</h3><p>Dodaju se naziv, logo, kontakt, QR link i osnovna podešavanja biznisa.</p></div>
          <div class="step-card"><strong>2</strong><h3>Vlasnik unosi ponudu</h3><p>U panelu se dodaju usluge, proizvodi, cene, radno vreme i opis profila.</p></div>
          <div class="step-card"><strong>3</strong><h3>Klijent skenira QR</h3><p>Klijent vidi profil, šalje zahtev ili zakazuje termin. Vlasnik dobija obaveštenje.</p></div>
        </div>
      </section>

      <section class="sales-section pricing-section">
        <div>
          <span class="eyebrow">Paketi prema potrebi biznisa</span>
          <h2>Od jednostavnog QR profila do kataloga i Garaža oglasa.</h2>
          <p class="muted">
            Aktivacija, podešavanje i paket se dogovaraju direktno prema tome šta biznis želi da prikaže:
            usluge, proizvode, galeriju radova, prijave problema ili oglase za vozila i mašine.
          </p>
        </div>
        <a class="btn btn-primary" href="mailto:duskomacak@gmail.com?subject=CityStyle.app%20aktivacija%20profila">Zatraži informacije</a>
      </section>

      <section class="legal-notice-box">
        <h2>Važna napomena o odgovornosti</h2>
        <p>
          CityStyle.app je tehnička platforma koja omogućava biznisima da prikažu svoje usluge,
          proizvode, cene, radno vreme i da primaju zahteve korisnika.
        </p>
        <p>
          Svaki biznis samostalno odgovara za tačnost svojih podataka, kvalitet usluga, proizvode,
          cene, termine, reklamacije, račune, poreze i svoje zakonsko poslovanje.
          CityStyle.app ne prodaje usluge ili proizvode u ime biznisa i nije strana u dogovoru između korisnika i biznisa.
        </p>
      </section>

      <section class="platform-contact-box sales-contact-box">
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
        </div>
      </footer>
    </section>
  `;
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
          <p class="intro-text">${escapeHtml(settings?.welcome_text || C("welcomeDefault", "Dobrodošli. Izaberite uslugu, datum i slobodan termin ili pošaljite zahtev."))}</p>
          ${(settings?.phone || settings?.address) ? `
            <div class="public-profile-contact">
              ${settings?.phone ? `<a href="tel:${escapeHtml(window.App.normalizePhoneForTel ? window.App.normalizePhoneForTel(settings.phone) : settings.phone)}">📞 ${escapeHtml(settings.phone)}</a>` : ""}
              ${settings?.address ? `<span>📍 ${escapeHtml(settings.address)}</span>` : ""}
            </div>
          ` : ""}
        </div>

        <div class="client-actions">
          <button class="btn btn-primary" type="button" onclick="showBookingForm()">${escapeHtml(profileLabels.action)}</button>
          <button class="btn btn-dark" type="button" onclick="showServices()">${escapeHtml(profileLabels.services)}</button>
          <button class="btn btn-dark" type="button" onclick="showProducts()">${C("productsCatalog", "Proizvodi / cenovnik")}</button>
          ${garageListings.length ? `<button class="btn btn-dark" type="button" onclick="showGarage()">Garaža / oglasi</button>` : ""}
          ${ownerPreviewMode ? "" : `<button class="btn btn-dark" type="button" onclick="installCurrentSalonApp()">${C("installThisProfile", "Preuzmi app ovog profila")}</button>`}
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

function renderClientProductsPreview() {
  if (!products.length) return "";
  return `
    <details class="card client-hours-panel client-products-panel">
      <summary>
        <span>${C("productsCatalog", "Proizvodi / cenovnik")}</span>
        <small>${C("showList", "Prikaži listu")}</small>
      </summary>
      <div class="client-services-panel-body">
        <p class="muted">Pregled proizvoda, artikala ili cenovnika koje ovaj biznis nudi.</p>
        <div class="product-public-grid">
          ${products.map(product => `
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
