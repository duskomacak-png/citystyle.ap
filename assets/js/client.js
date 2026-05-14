// assets/js/client.js

let currentSalon = null;
let services = [];
let products = [];
let selectedService = null;
let selectedDate = null;
let selectedTime = null;
let ownerPreviewMode = false;
let adminPreviewMode = false;
const C = (key, fallback = "") => window.App?.t ? window.App.t(key, fallback) : (fallback || key);


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

  await loadServices();
  await loadProducts();
  await renderSalonHome();
}

function renderPlatformLanding() {
  window.App?.clearSalonTheme?.();
  window.App?.setAppLanguage?.("sr");
  currentSalon = null;
  services = [];
  products = [];
  selectedService = null;
  selectedDate = null;
  selectedTime = null;

  const app = document.getElementById("app");
  app.innerHTML = `
    <section class="landing-page platform-text-page">
      <header class="landing-nav simple-nav">
        <div class="brand-mark">
          <div class="brand-icon">CS</div>
          <strong>CITYSTYLE<span>.APP</span></strong>
        </div>
        <div class="landing-actions">
          <a class="btn btn-primary subtle-admin-link" href="admin/">Admin panel</a>
        </div>
      </header>

      <section class="platform-text-card">
        <span class="eyebrow">Platforma za prijave termina, kvarova, upita i zahteva preko QR koda</span>
        <h1>Šta je CityStyle.app?</h1>
        <p>
          CityStyle.app je online platforma koja pomaže salonima, majstorima, servisima i manjim firmama da lakše primaju prijave i zahteve svojih korisnika.
        </p>
        <p>
          Svaki biznis dobija svoj digitalni profil, jedinstveni QR kod i link. Korisnik skenira QR kod i direktno otvara stranicu tog biznisa, gde može zakazati termin, poslati upit, prijaviti kvar, reklamaciju ili zatražiti uslugu.
        </p>
        <p>
          Platforma je namenjena biznisima koji žele jednostavan način da prikupe zahteve korisnika bez izgubljenih poruka, nepotrebnog traženja kontakta i stalnog objašnjavanja preko telefona.
        </p>
        <p>
          Vlasnik biznisa preko svog panela uređuje profil, ponudu, radno vreme, logo i prati sve prijave korisnika na jednom mestu.
        </p>
        <div class="hero-buttons simple-buttons">
          <a class="btn btn-primary" href="salon/">Ulaz za vlasnika biznisa</a>
          <button class="btn btn-dark" type="button" onclick="window.App.installApp()">Preuzmi CityStyle app</button>
        </div>
        <p class="muted small-note">
          Za pristup konkretnom biznisu koristite QR kod ili link koji ste dobili od tog biznisa.
        </p>

        <div class="platform-contact-box">
          <h2>Kontakt za informacije</h2>
          <p>
            Za dodatne informacije, saradnju ili aktivaciju biznis profila možete kontaktirati
            menadžera platforme CityStyle.app.
          </p>
          <a href="mailto:duskomacak@gmail.com">duskomacak@gmail.com</a>
        </div>
      </section>
    </section>
  `;
}
function scrollToHowItWorks() {
  document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
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
  currentSalon._publicName = publicName;
  currentSalon._publicLogo = settings?.logo_url || "";
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
          <button class="btn btn-primary" type="button" onclick="showBookingForm()">${C("sendRequest", "Pošalji zahtev")}</button>
          <button class="btn btn-dark" type="button" onclick="showServices()">${C("servicesOffer", "Usluge / ponuda")}</button>
          <button class="btn btn-dark" type="button" onclick="showProducts()">${C("productsCatalog", "Proizvodi / cenovnik")}</button>
          ${ownerPreviewMode ? "" : `<button class="btn btn-dark" type="button" onclick="installCurrentSalonApp()">${C("installThisProfile", "Preuzmi app ovog profila")}</button>`}
        </div>
      </div>

      <div id="client-extra">
        ${renderClientServicesPreview()}
        ${renderClientProductsPreview()}
        ${renderClientWorkingHours(workingHours || [])}
      </div>
      <div id="booking-box"></div>
    </section>
  `;
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
  if (!services.length) {
    return `
      <details class="card client-hours-panel client-services-panel">
        <summary>
          <span>${C("servicesOffer", "Usluge / ponuda")}</span>
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
        <span>${C("servicesOffer", "Usluge / ponuda")}</span>
        <small>${C("showList", "Prikaži listu")}</small>
      </summary>
      <div class="client-services-panel-body">
        <p class="muted">${C("chooseServiceText", "Izaberite uslugu za koju želite da pošaljete zahtev.")}</p>
        <div class="service-list">
          ${services.map(service => `
            <button class="service-select-card" type="button" onclick="selectServiceById('${service.id}')">
              <div><strong>${escapeHtml(service.name)}</strong><span>${Number(service.duration_minutes || 0)} min</span></div>
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
  const box = document.getElementById("client-extra");
  if (!box) return;

  if (!services.length) {
    box.innerHTML = `<div class="card"><h2>${C("servicesOffer", "Usluge / ponuda")}</h2><p class="muted">${C("noServicesText", "Trenutno nema dostupnih usluga za online zahtev.")}</p></div>`;
    return;
  }

  box.innerHTML = `
    <details class="card client-hours-panel client-services-panel" open>
      <summary>
        <span>${C("servicesOffer", "Usluge / ponuda")}</span>
        <small>${C("hideList", "Sakrij listu")}</small>
      </summary>
      <div class="client-services-panel-body">
        <div class="service-list">
          ${services.map(service => `
            <button class="service-select-card" type="button" onclick="selectServiceById('${service.id}')">
              <div><strong>${escapeHtml(service.name)}</strong><span>${Number(service.duration_minutes || 0)} min</span></div>
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
  selectedDate = today;
  selectedTime = null;

  box.innerHTML = `
    <div class="card booking-card booking-paper-card">
      <h2>${C("sendRequestTitle", "Pošaljite zahtev")}</h2>
      <p class="muted">${C("chooseServiceDateTime", "Izaberite uslugu, datum i slobodan termin.")}</p>

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

      <label>${C("note", "Napomena")}</label>
      <textarea id="client-note" rows="3" placeholder="${C("optional", "Opcionalno")}"></textarea>

      <button class="btn btn-primary booking-submit-btn" type="button" onclick="submitAppointment()">${C("sendRequest", "Pošalji zahtev")}</button>
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
    note: note || null,
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
