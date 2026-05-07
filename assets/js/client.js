// assets/js/client.js

let currentSalon = null;
let services = [];
let selectedService = null;
let selectedDate = null;
let selectedTime = null;


document.addEventListener("DOMContentLoaded", () => {
  loadClientApp();
});

async function loadClientApp() {
  const app = document.getElementById("app");

  try {
    const urlSlug = window.App?.getUrlParam("salon");
    const forcePlatform = window.App?.getUrlParam("platform") === "1" || window.App?.getUrlParam("home") === "1";

    // QR/link salon page: ?salon=slug
    if (urlSlug) {
      app.innerHTML = `<div class="loading-box">Učitavanje profila...</div>`;
      await loadSalon(urlSlug, true);
      return;
    }

    // Root citystyle.app in normal browser is the platform landing page.
    // If the app was installed from a salon page, open that saved salon directly.
    const savedSlug = window.App?.getSavedSalonSlug?.();
    const isStandalone = window.App?.isStandaloneMode?.() === true;
    if (savedSlug && isStandalone) {
      app.innerHTML = `<div class="loading-box">Učitavanje profila...</div>`;
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
  app.innerHTML = `<div class="loading-box">Učitavanje profila...</div>`;

  const { data: salon, error } = await window.App.checkSalonAccess(slug);

  if (error || !salon) {
    app.innerHTML = `
      <div class="card center">
        <h2>Online zakazivanje trenutno nije dostupno</h2>
        <p class="muted">Online zahtev trenutno nije dostupan za ovaj profil.</p>
        <button class="btn btn-dark" type="button" onclick="renderPlatformLanding()">Početna strana platforme</button>
      </div>
    `;
    return;
  }

  currentSalon = salon;
  if (saveThisSalon) window.App.saveCurrentSalon(salon.slug);

  await loadServices();
  await renderSalonHome();
}

function renderPlatformLanding() {
  currentSalon = null;
  services = [];
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

async function renderSalonHome() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="loading-box">Učitavanje profila...</div>`;

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

  app.innerHTML = `
    <section class="client-page">
      <div class="hero-card salon-header">
        ${settings?.logo_url ? `
          <img src="${escapeHtml(settings.logo_url)}" alt="${escapeHtml(currentSalon.salon_name)} logo" class="salon-logo">
        ` : `
          <div class="logo-circle">${escapeHtml(currentSalon.salon_name?.charAt(0).toUpperCase() || "S")}</div>
        `}

        <h1>${escapeHtml(currentSalon.salon_name)}</h1>
        ${settings?.welcome_title ? `<h2 class="welcome-title">${escapeHtml(settings.welcome_title)}</h2>` : ""}
        <p class="intro-text">${escapeHtml(settings?.welcome_text || "Dobrodošli. Izaberite uslugu, datum i slobodan termin ili pošaljite zahtev.")}</p>

        <div class="client-actions">
          <button class="btn btn-primary" type="button" onclick="showBookingForm()">Pošalji zahtev</button>
          <button class="btn btn-dark" type="button" onclick="showServices()">Usluge / ponuda</button>
          <button class="btn btn-dark" type="button" onclick="window.App.installSalonApp(currentSalon.slug)">Preuzmi app ovog profila</button>
        </div>
      </div>

      <div id="client-extra">
        ${renderClientServicesPreview()}
        ${renderClientWorkingHours(workingHours || [])}
      </div>
      <div id="booking-box"></div>
    </section>
  `;
}


function renderClientServicesPreview() {
  if (!services.length) {
    return `
      <div class="card center">
        <h2>Usluge / ponuda</h2>
        <p class="muted">Trenutno nema dostupnih usluga za online zahtev.</p>
      </div>
    `;
  }

  return `
    <div class="card">
      <h2>Usluge / ponuda</h2>
      <p class="muted">Izaberite uslugu za koju želite da pošaljete zahtev.</p>
      <div class="service-list">
        ${services.map(service => `
          <button class="service-select-card" type="button" onclick="selectServiceById('${service.id}')">
            <div><strong>${escapeHtml(service.name)}</strong><span>${Number(service.duration_minutes || 0)} min</span></div>
            <b>${window.App.formatServicePrice(service)}</b>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderClientWorkingHours(hours) {
  const dayNames = {
    1: "Ponedeljak",
    2: "Utorak",
    3: "Sreda",
    4: "Četvrtak",
    5: "Petak",
    6: "Subota",
    0: "Nedelja"
  };

  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = order.map(day => {
    const h = (hours || []).find(row => Number(row.day_of_week) === day);
    if (!h || h.is_closed) {
      return `<div class="service-row hours-list-row"><div><strong>${dayNames[day]}</strong><span>Zatvoreno</span></div><b>—</b></div>`;
    }
    return `<div class="service-row hours-list-row"><div><strong>${dayNames[day]}</strong><span>Radno vreme</span></div><b>${String(h.open_time).slice(0,5)}–${String(h.close_time).slice(0,5)}</b></div>`;
  }).join("");

  return `
    <details class="card client-hours-panel">
      <summary>
        <span>Radno vreme</span>
        <small>Prikaži raspored</small>
      </summary>
      <div class="service-list hours-list">${rows}</div>
    </details>
  `;
}

function showServices() {
  const box = document.getElementById("client-extra");
  if (!box) return;

  if (!services.length) {
    box.innerHTML = `<div class="card"><h2>Usluge / ponuda</h2><p class="muted">Trenutno nema dostupnih usluga za online zahtev.</p></div>`;
    return;
  }

  box.innerHTML = `
    <div class="card">
      <h2>Usluge / ponuda</h2>
      <div class="service-list">
        ${services.map(service => `
          <button class="service-select-card" type="button" onclick="selectServiceById('${service.id}')">
            <div><strong>${escapeHtml(service.name)}</strong><span>${Number(service.duration_minutes || 0)} min</span></div>
            <b>${window.App.formatServicePrice(service)}</b>
          </button>
        `).join("")}
      </div>
    </div>
  `;
  box.scrollIntoView({ behavior: "smooth" });
}

async function selectServiceById(serviceId) {
  selectedService = services.find(s => String(s.id) === String(serviceId)) || null;
  if (!selectedService) {
    window.App.showMessage("Usluga nije pronađena.", "error");
    return;
  }
  showBookingForm();
}

function showBookingForm() {
  const box = document.getElementById("booking-box");
  if (!box) return;

  if (!services.length) {
    box.innerHTML = `<div class="card"><h2>Zakazivanje nije dostupno</h2><p class="muted">Trenutno nema dostupnih usluga za online zahtev.</p></div>`;
    return;
  }

  const today = window.BookingLogic?.getLocalDateString ? window.BookingLogic.getLocalDateString() : new Date().toISOString().split("T")[0];
  selectedDate = today;
  selectedTime = null;

  box.innerHTML = `
    <div class="card booking-card booking-paper-card">
      <h2>Pošaljite zahtev</h2>
      <p class="muted">Izaberite uslugu, datum i slobodan termin.</p>

      <label>Usluga i cena</label>
      <select id="booking-service" class="booking-service-dropdown">
        <option value="">Izaberite uslugu</option>
        ${services.map(service => `
          <option value="${service.id}" ${selectedService?.id === service.id ? "selected" : ""}>
            ${escapeHtml(service.name)} — ${window.App.formatServicePrice(service)} — ${Number(service.duration_minutes || 0)} min
          </option>
        `).join("")}
      </select>
      <div id="selected-service-summary" class="selected-service-summary muted">Prvo izaberite uslugu.</div>

      <div class="booking-two-cols">
        <div>
          <label>Datum</label>
          <input id="booking-date" type="date" min="${today}" value="${today}">
        </div>
        <div>
          <label>Izabrani termin</label>
          <input id="selected-time-view" type="text" value="Još nije izabran" disabled>
        </div>
      </div>

      <label>Slobodni termini</label>
      <div id="time-slots" class="time-grid"><p class="muted">Izaberite uslugu i datum.</p></div>

      <div class="booking-two-cols">
        <div>
          <label>Ime i prezime</label>
          <input id="client-name" type="text" placeholder="Ana Petrović">
        </div>
        <div>
          <label>Broj telefona</label>
          <input id="client-phone" type="tel" placeholder="060/123-456">
        </div>
      </div>

      <label>Napomena</label>
      <textarea id="client-note" rows="3" placeholder="Opcionalno"></textarea>

      <button class="btn btn-primary booking-submit-btn" type="button" onclick="submitAppointment()">Pošalji zahtev</button>
    </div>
  `;

  document.getElementById("booking-service").addEventListener("change", handleBookingChange);
  document.getElementById("booking-date").addEventListener("change", handleBookingChange);

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
    document.getElementById("time-slots").innerHTML = `<p class="muted">Izaberite uslugu i datum.</p>`;
    if (summary) summary.textContent = "Prvo izaberite uslugu.";
    return;
  }

  if (summary) {
    summary.innerHTML = `<strong>${escapeHtml(selectedService.name)}</strong> • ${window.App.formatServicePrice(selectedService)} • ${Number(selectedService.duration_minutes || 0)} min`;
  }
  const timeView = document.getElementById("selected-time-view");
  if (timeView) timeView.value = "Još nije izabran";

  await loadAvailableTimes();
}

async function loadAvailableTimes() {
  const slotsBox = document.getElementById("time-slots");
  slotsBox.innerHTML = `<p class="muted">Učitavanje termina...</p>`;

  const slots = await window.BookingLogic.getAvailableSlots(
    currentSalon.id,
    Number(selectedService.duration_minutes || 30),
    selectedDate
  );

  if (!slots.length) {
    const today = window.BookingLogic?.getLocalDateString ? window.BookingLogic.getLocalDateString() : new Date().toISOString().split("T")[0];
    const msg = selectedDate === today
      ? "Nema više slobodnih termina za danas. Izaberite naredni datum."
      : "Nema slobodnih termina za izabrani datum.";
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

async function submitAppointment() {
  const name = document.getElementById("client-name")?.value.trim();
  const phone = document.getElementById("client-phone")?.value.trim();
  const note = document.getElementById("client-note")?.value.trim();

  if (!currentSalon || !selectedService || !selectedDate || !selectedTime) {
    window.App.showMessage("Izaberite uslugu, datum i termin.", "error");
    return;
  }
  if (!name || !phone) {
    window.App.showMessage("Unesite ime i telefon.", "error");
    return;
  }

  const currentSlots = await window.BookingLogic.getAvailableSlots(
    currentSalon.id,
    Number(selectedService.duration_minutes || 30),
    selectedDate
  );
  if (!currentSlots.includes(selectedTime)) {
    window.App.showMessage("Termin je u međuvremenu zauzet. Izaberite drugi.", "error");
    await loadAvailableTimes();
    return;
  }

  const { error } = await window.db.from("appointments").insert({
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
  });

  if (error) {
    console.error(error);
    window.App.showMessage("Greška pri slanju termina.", "error");
    return;
  }

  document.getElementById("booking-box").innerHTML = `
    <div class="card center">
      <h2>Zahtev je poslat ✅</h2>
      <p class="muted">Vlasnik profila će vas kontaktirati radi potvrde.</p>
      <p><strong>${escapeHtml(selectedService.name)}</strong></p>
      <p>${window.App.formatDate(selectedDate)} u ${selectedTime}</p>
    </div>
  `;
  window.App.showMessage("Zahtev je poslat.", "success");
}
