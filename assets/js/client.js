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
      app.innerHTML = `<div class="loading-box">Učitavanje salona...</div>`;
      await loadSalon(urlSlug, true);
      return;
    }

    // Root citystyle.app in normal browser is the platform landing page.
    // If the app was installed from a salon page, open that saved salon directly.
    const savedSlug = window.App?.getSavedSalonSlug?.();
    const isStandalone = window.App?.isStandaloneMode?.() === true;
    if (savedSlug && isStandalone) {
      app.innerHTML = `<div class="loading-box">Učitavanje salona...</div>`;
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
  app.innerHTML = `<div class="loading-box">Učitavanje salona...</div>`;

  const { data: salon, error } = await window.App.checkSalonAccess(slug);

  if (error || !salon) {
    app.innerHTML = `
      <div class="card center">
        <h2>Online zakazivanje trenutno nije dostupno</h2>
        <p class="muted">Salon nije pronađen ili je trenutno blokiran.</p>
        <button class="btn btn-dark" type="button" onclick="renderPlatformLanding()">Početna platforme</button>
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
    <section class="landing-page">
      <header class="landing-nav">
        <div class="brand-mark">
          <div class="brand-icon">CS</div>
          <strong>CITYSTYLE<span>.APP</span></strong>
        </div>
        <div class="landing-actions">
          <a class="btn btn-dark" href="salon/">Ulaz za salon</a>
          <a class="btn btn-primary subtle-admin-link" href="admin/">Admin</a>
        </div>
      </header>

      <section class="landing-hero">
        <div class="hero-copy">
          <span class="eyebrow">Platforma za frizerske i beauty salone</span>
          <h1>Online prostor za salone i njihove klijente.</h1>
          <p>
            CityStyle povezuje salone i klijente preko jednostavnog QR koda. 
            Za zakazivanje posetite vaš frizerski ili beauty salon i skenirajte njihov QR kod.
          </p>
          <div class="hero-buttons">
            <a class="btn btn-primary" href="salon/">Ulaz za vlasnike salona</a>
            <button class="btn btn-dark" type="button" onclick="window.App.installApp()">Preuzmi CityStyle app</button>
            <button class="btn btn-dark" type="button" onclick="scrollToHowItWorks()">Kako radi?</button>
          </div>
        </div>

        <div class="phone-preview-card">
          <div class="mock-phone">
            <div class="mock-phone-top"></div>
            <div class="mock-logo">City Style</div>
            <div class="mock-images">
              <span></span><span></span><span></span>
            </div>
            <div class="mock-service-row"><b>Šišanje</b><span>1.500 RSD</span></div>
            <div class="mock-service-row"><b>Feniranje</b><span>1.200 RSD</span></div>
            <div class="mock-service-row"><b>Farbanje</b><span>4.500 RSD</span></div>
            <button class="mock-button">Zakaži termin</button>
          </div>
        </div>
      </section>

      <section id="how-it-works" class="landing-grid">
        <div class="landing-card">
          <div class="landing-icon">1</div>
          <h3>Salon dobija svoj QR kod</h3>
          <p>Svaki salon ima poseban link i QR kod koji vodi direktno na njegovu stranicu.</p>
        </div>
        <div class="landing-card">
          <div class="landing-icon">2</div>
          <h3>Klijent skenira QR</h3>
          <p>Klijent ne bira salon ručno. QR ga vodi baš kod njegovog frizera.</p>
        </div>
        <div class="landing-card">
          <div class="landing-icon">3</div>
          <h3>Termin ide pravom salonu</h3>
          <p>Klijent bira uslugu, datum i slobodan termin. Salon vidi zahtev u svom panelu.</p>
        </div>
      </section>

      <section class="info-section">
        <div class="card">
          <h2>Za klijente</h2>
          <p class="muted">Posetite vaš salon, skenirajte njihov QR kod i zakažite termin bez naloga.</p>
        </div>
        <div class="card">
          <h2>Za vlasnike salona</h2>
          <p class="muted">Salon uređuje usluge, cene, radno vreme, logo i prati termine na jednom mestu.</p>
        </div>
        <div class="card qr-card">
          <h2>Direktan ulaz preko QR koda</h2>
          <div class="fake-qr">▦</div>
          <p class="muted">QR kod vodi u tačan salon, ne u listu svih salona.</p>
        </div>
      </section>

      <footer class="landing-footer">
        <span>CityStyle.app</span>
        <span>Platforma za online zakazivanje termina.</span>
      </footer>
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
  app.innerHTML = `<div class="loading-box">Učitavanje salona...</div>`;

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
        <p class="intro-text">${escapeHtml(settings?.welcome_text || "Zakažite svoj termin brzo i jednostavno.")}</p>

        <div class="client-actions">
          <button class="btn btn-primary" type="button" onclick="showBookingForm()">Zakaži termin</button>
          <button class="btn btn-dark" type="button" onclick="showServices()">Usluge i cene</button>
          <button class="btn btn-dark" type="button" onclick="window.App.installSalonApp(currentSalon.slug)">Preuzmi app ovog salona</button>
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
        <h2>Usluge i cene</h2>
        <p class="muted">Salon još nije dodao usluge.</p>
      </div>
    `;
  }

  return `
    <div class="card">
      <h2>Usluge i cene</h2>
      <p class="muted">Izaberite uslugu ili kliknite „Zakaži termin”.</p>
      <div class="service-list">
        ${services.map(service => `
          <button class="service-select-card" type="button" onclick="selectServiceById('${service.id}')">
            <div><strong>${escapeHtml(service.name)}</strong><span>${Number(service.duration_minutes || 0)} min</span></div>
            <b>${Number(service.price || 0).toLocaleString("sr-RS")} RSD</b>
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
      return `<div class="service-row"><div><strong>${dayNames[day]}</strong><span>Zatvoreno</span></div><b>—</b></div>`;
    }
    return `<div class="service-row"><div><strong>${dayNames[day]}</strong><span>Radno vreme</span></div><b>${String(h.open_time).slice(0,5)}–${String(h.close_time).slice(0,5)}</b></div>`;
  }).join("");

  return `
    <div class="card">
      <h2>Radno vreme</h2>
      <div class="service-list">${rows}</div>
    </div>
  `;
}

function showServices() {
  const box = document.getElementById("client-extra");
  if (!box) return;

  if (!services.length) {
    box.innerHTML = `<div class="card"><h2>Usluge i cene</h2><p class="muted">Salon još nije dodao usluge.</p></div>`;
    return;
  }

  box.innerHTML = `
    <div class="card">
      <h2>Usluge i cene</h2>
      <div class="service-list">
        ${services.map(service => `
          <button class="service-select-card" type="button" onclick="selectServiceById('${service.id}')">
            <div><strong>${escapeHtml(service.name)}</strong><span>${Number(service.duration_minutes || 0)} min</span></div>
            <b>${Number(service.price || 0).toLocaleString("sr-RS")} RSD</b>
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
    box.innerHTML = `<div class="card"><h2>Zakazivanje nije dostupno</h2><p class="muted">Salon još nije dodao usluge.</p></div>`;
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  selectedDate = today;
  selectedTime = null;

  box.innerHTML = `
    <div class="card booking-card">
      <h2>Zakaži termin</h2>
      <label>Usluga</label>
      <select id="booking-service">
        <option value="">Izaberi uslugu</option>
        ${services.map(service => `
          <option value="${service.id}" ${selectedService?.id === service.id ? "selected" : ""}>
            ${escapeHtml(service.name)} — ${Number(service.price || 0).toLocaleString("sr-RS")} RSD — ${Number(service.duration_minutes || 0)} min
          </option>
        `).join("")}
      </select>

      <label>Datum</label>
      <input id="booking-date" type="date" min="${today}" value="${today}">

      <label>Slobodni termini</label>
      <div id="time-slots" class="time-grid"><p class="muted">Izaberite uslugu i datum.</p></div>

      <label>Ime i prezime</label>
      <input id="client-name" type="text" placeholder="Ana Petrović">

      <label>Telefon</label>
      <input id="client-phone" type="tel" placeholder="060/123-456">

      <label>Napomena</label>
      <textarea id="client-note" rows="3" placeholder="Opcionalno"></textarea>

      <button class="btn btn-primary" type="button" onclick="submitAppointment()">Pošalji zahtev</button>
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

  if (!selectedService || !selectedDate) {
    document.getElementById("time-slots").innerHTML = `<p class="muted">Izaberite uslugu i datum.</p>`;
    return;
  }

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
    slotsBox.innerHTML = `<p class="muted">Nema slobodnih termina za izabrani datum.</p>`;
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
      <p class="muted">Salon će potvrditi vaš termin.</p>
      <p><strong>${escapeHtml(selectedService.name)}</strong></p>
      <p>${window.App.formatDate(selectedDate)} u ${selectedTime}</p>
    </div>
  `;
  window.App.showMessage("Zahtev za termin je poslat.", "success");
}
