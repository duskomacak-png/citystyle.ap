// assets/js/salon.js

let currentSalon = null;
let currentSalonId = null;
let currentSection = "appointments";
let appointmentCache = [];
const salonEscapeHtml = (value) => window.App.escapeHtml(value);
const salonEscapeJs = (value) => window.App.escapeJs(value);

const salonDays = [
  { num: 1, name: "Ponedeljak" },
  { num: 2, name: "Utorak" },
  { num: 3, name: "Sreda" },
  { num: 4, name: "Četvrtak" },
  { num: 5, name: "Petak" },
  { num: 6, name: "Subota" },
  { num: 0, name: "Nedelja" }
];

document.addEventListener("DOMContentLoaded", () => initSalonPanel());

async function initSalonPanel() {
  bindSalonTabs();
  bindSalonLogout();

  const session = window.Auth.getSalonSession();
  if (!session?.salon_id) {
    renderSalonLogin();
    return;
  }

  await loadSalonFromSession(session.salon_id);
}

function bindSalonTabs() {
  document.querySelectorAll("#salon-tabs button").forEach(btn => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });
}

function bindSalonLogout() {
  document.getElementById("salon-logout-btn")?.addEventListener("click", () => {
    window.Auth.salonLogout();
    currentSalon = null;
    currentSalonId = null;
    renderSalonLogin();
  });
}

function renderSalonLogin() {
  document.getElementById("salon-name").textContent = "Biznis panel";
  document.getElementById("salon-status-text").textContent = "Unesite email adresu biznisa i kod firme koji vam je dodelio administrator.";
  document.getElementById("salon-tabs").classList.add("hidden");
  document.getElementById("salon-logout-btn").classList.add("hidden");
  document.getElementById("salon-content").innerHTML = `
    <div class="card login-card">
      <h2>Ulaz za biznis</h2>
      <p class="muted">Unesite email adresu biznisa i kod firme koji vam je dodelio administrator.</p>
      <label>Email biznisa</label>
      <input id="salon-login-email" type="email" placeholder="salon@email.com">
      <label>Kod firme</label>
      <input id="salon-login-code" type="text" placeholder="CS-1001">
      <button class="btn btn-primary" type="button" onclick="handleSalonLogin()">Prijavi se</button>
    </div>
  `;
}

async function handleSalonLogin() {
  const email = document.getElementById("salon-login-email").value.trim().toLowerCase();
  const code = document.getElementById("salon-login-code").value.trim();
  const salon = await window.Auth.salonLogin(email, code);
  if (!salon) return;
  currentSalon = salon;
  currentSalonId = salon.id;
  renderSalonDashboard();
  await showSection("appointments");
}

async function loadSalonFromSession(salonId) {
  const { data, error } = await window.db
    .from("salons")
    .select("*")
    .eq("id", salonId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error || !data) {
    window.Auth.salonLogout();
    renderSalonLogin();
    return;
  }

  if (data.status !== "active") {
    renderBlockedSalon(data);
    return;
  }

  currentSalon = data;
  currentSalonId = data.id;
  renderSalonDashboard();
  await showSection("appointments");
}

function renderBlockedSalon(salon) {
  document.getElementById("salon-name").textContent = salon.salon_name || "Salon";
  document.getElementById("salon-status-text").textContent = "Profil je blokiran.";
  document.getElementById("salon-tabs").classList.add("hidden");
  document.getElementById("salon-logout-btn").classList.remove("hidden");
  document.getElementById("salon-content").innerHTML = `
    <div class="card center"><h2>Vaš profil je trenutno blokiran</h2><p>Kontaktirajte administratora.</p></div>
  `;
}

function renderSalonDashboard() {
  document.getElementById("salon-name").textContent = currentSalon.salon_name || "Biznis panel";
  const expired = isPaymentExpired(currentSalon.paid_until);
  document.getElementById("salon-status-text").innerHTML = expired
    ? `Aktivan profil • <span class="danger-text">Uplata istekla</span>`
    : `Aktivan profil`;
  document.getElementById("salon-tabs").classList.remove("hidden");
  document.getElementById("salon-logout-btn").classList.remove("hidden");
}

function setActiveTab(section) {
  currentSection = section;
  document.querySelectorAll("#salon-tabs button").forEach(btn => btn.classList.toggle("active", btn.dataset.section === section));
}

async function showSection(section) {
  if (!currentSalonId) return renderSalonLogin();
  setActiveTab(section);
  if (section === "appointments") return renderAppointments();
  if (section === "services") return renderServices();
  if (section === "hours") return renderWorkingHours();
  if (section === "settings") return renderSalonSettings();
}

async function renderAppointments() {
  const content = document.getElementById("salon-content");
  const today = new Date().toISOString().split("T")[0];
  const statusFilter = window.App?.getSessionValue?.("salonAppointmentsFilter") || "active";
  const dateFilter = window.App?.getSessionValue?.("salonAppointmentsDate") || today;

  content.innerHTML = `<div class="loading-box">Učitavanje termina...</div>`;

  let query = window.db
    .from("appointments")
    .select("*")
    .eq("salon_id", currentSalonId)
    .order("appointment_date", { ascending: true })
    .order("appointment_time", { ascending: true });

  if (statusFilter === "active") {
    query = query.in("status", ["new", "confirmed"]).gte("appointment_date", today);
  } else if (statusFilter === "today") {
    query = query.in("status", ["new", "confirmed"]).eq("appointment_date", today);
  } else if (statusFilter === "date") {
    query = query.in("status", ["new", "confirmed"]).eq("appointment_date", dateFilter || today);
  } else if (statusFilter === "done") {
    query = query.eq("status", "done").order("updated_at", { ascending: false });
  } else if (statusFilter === "cancelled") {
    query = query.in("status", ["cancelled", "no_show"]).order("updated_at", { ascending: false });
  }

  const { data: appointments, error } = await query;

  if (error) {
    console.error(error);
    content.innerHTML = `<div class="card"><p class="error-text">Greška pri učitavanju termina.</p></div>`;
    return;
  }

  const items = appointments || [];
  appointmentCache = items;
  content.innerHTML = `
    <div class="section-head paper-section-head">
      <div>
        <h2>Zahtevi / termini</h2>
        <p class="muted">Pregled zahteva i zakazanih termina po datumu, vremenu, usluzi i korisniku.</p>
      </div>
      <button class="btn btn-dark btn-small" type="button" onclick="renderAppointments()">Osveži</button>
    </div>

    <div class="paper-toolbar card">
      <label>
        Prikaz
        <select id="appointment-filter" onchange="changeAppointmentFilter()">
          <option value="active" ${statusFilter === "active" ? "selected" : ""}>Aktivni termini</option>
          <option value="today" ${statusFilter === "today" ? "selected" : ""}>Današnji termini</option>
          <option value="date" ${statusFilter === "date" ? "selected" : ""}>Zahtevi / termini po datumu</option>
          <option value="done" ${statusFilter === "done" ? "selected" : ""}>Završeni termini</option>
          <option value="cancelled" ${statusFilter === "cancelled" ? "selected" : ""}>Otkazani termini</option>
        </select>
      </label>
      <label class="appointment-date-filter ${statusFilter === "date" ? "" : "hidden"}">
        Datum
        <input id="appointment-date-filter" type="date" value="${dateFilter || today}" onchange="changeAppointmentDateFilter()">
      </label>
    </div>

    ${items.length ? renderAppointmentPaperList(items) : `
      <div class="card center">
        <h3>Nema zahteva za izabrani prikaz</h3>
        <p class="muted">Kada korisnik pošalje zahtev ili zakaže termin, podaci će se prikazati u ovoj listi.</p>
      </div>
    `}
  `;
}

function renderAppointmentPaperList(items) {
  return `
    <div class="paper-list-card card">
      <div class="paper-table-wrap">
        <table class="paper-appointments-table">
          <thead>
            <tr>
              <th>Datum</th>
              <th>Vreme</th>
              <th>Usluga</th>
              <th>Ime i prezime</th>
              <th>Telefon</th>
              <th>Cena</th>
              <th>Status</th>
              <th>Akcije</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(renderAppointmentRow).join("")}
          </tbody>
        </table>
      </div>
      <div class="paper-mobile-list">
        ${items.map(renderAppointmentMobileRow).join("")}
      </div>
    </div>
  `;
}

function renderAppointmentRow(a) {
  const date = window.App.formatDate(a.appointment_date);
  const time = salonEscapeHtml(String(a.appointment_time || "").slice(0, 5));
  const service = salonEscapeHtml(a.service_name_snapshot || "Usluga");
  const name = salonEscapeHtml(a.client_name || "—");
  const phone = salonEscapeHtml(a.client_phone || "—");
  const price = Number(a.price_snapshot || 0).toLocaleString("sr-RS") + " RSD";
  return `
    <tr>
      <td>${date}</td>
      <td><strong>${time}</strong></td>
      <td>${service}</td>
      <td>${name}</td>
      <td><a href="tel:${phone}" class="phone-link">${phone}</a></td>
      <td>${price}</td>
      <td>${renderAppointmentStatusSelect(a)}</td>
      <td><div class="paper-row-actions compact-actions">${renderAppointmentActionButtons(a)}</div></td>
    </tr>
  `;
}

function renderAppointmentMobileRow(a) {
  const date = window.App.formatDate(a.appointment_date);
  const time = salonEscapeHtml(String(a.appointment_time || "").slice(0, 5));
  const service = salonEscapeHtml(a.service_name_snapshot || "Usluga");
  const name = salonEscapeHtml(a.client_name || "—");
  const phone = salonEscapeHtml(a.client_phone || "—");
  return `
    <div class="paper-mobile-item">
      <div class="paper-mobile-top">
        <div><strong>${time}</strong><span>${date}</span></div>
        ${renderAppointmentStatusSelect(a)}
      </div>
      <div class="paper-mobile-main">
        <b>${service}</b>
        <span>${name}</span>
        <a href="tel:${phone}" class="phone-link">${phone}</a>
      </div>
      <div class="paper-row-actions">${renderAppointmentActionButtons(a)}</div>
    </div>
  `;
}

function renderAppointmentStatusSelect(a) {
  const id = salonEscapeHtml(a.id);
  const status = salonEscapeHtml(a.status || "new");
  return `
    <select class="status-select ${status}" onchange="handleAppointmentStatusChange('${id}', this.value)">
      <option value="new" ${a.status === "new" ? "selected" : ""}>Novo</option>
      <option value="confirmed" ${a.status === "confirmed" ? "selected" : ""}>Potvrđeno</option>
      <option value="done" ${a.status === "done" ? "selected" : ""}>Završeno</option>
      <option value="cancelled" ${a.status === "cancelled" ? "selected" : ""}>Otkazano</option>
    </select>
  `;
}

function renderAppointmentActionButtons(a) {
  const id = salonEscapeHtml(a.id);
  const safePhone = normalizePhoneForTel(a.client_phone || "");
  return `
    <button class="btn btn-success btn-paper" type="button" onclick="openClientMessage('${id}', 'confirmed')">Poruka</button>
    <a class="btn btn-dark btn-paper" href="tel:${safePhone}">Pozovi</a>
    <button class="btn btn-danger btn-paper" type="button" onclick="deleteAppointment('${id}')">Obriši</button>
  `;
}

async function handleAppointmentStatusChange(id, status) {
  // Browseri ne dozvoljavaju da web app sama pošalje poruku.
  // Zato odmah na klik vlasnika otvaramo WhatsApp sa gotovom porukom;
  // vlasnik samo pritisne Send/Pošalji.
  if (status === "confirmed") {
    openClientMessage(id, "confirmed");
  }
  if (status === "cancelled") {
    openClientMessage(id, "cancelled");
  }

  await updateAppointmentStatus(id, status, false);
}

function getAppointmentById(id) {
  return appointmentCache.find(item => String(item.id) === String(id)) || null;
}

function buildClientMessage(appointment, type = "confirmed") {
  const salonName = currentSalon?.salon_name || "salon";
  const clientName = appointment.client_name || "";
  const service = appointment.service_name_snapshot || "usluga";
  const date = window.App.formatDate(appointment.appointment_date);
  const time = String(appointment.appointment_time || "").slice(0, 5);

  if (type === "cancelled") {
    return `Poštovani/a ${clientName},

vaš termin u salonu ${salonName} za ${date} u ${time} je otkazan.

Usluga: ${service}

Molimo zakažite novi termin ili kontaktirajte salon.
${salonName}`;
  }

  return `Poštovani/a ${clientName},

vaš termin u salonu ${salonName} je potvrđen.

Usluga: ${service}
Datum: ${date}
Vreme: ${time}

Vidimo se.
${salonName}`;
}

function openClientMessage(id, type = "confirmed") {
  const appointment = getAppointmentById(id);
  if (!appointment) {
    window.App.showMessage("Termin nije pronađen.", "error");
    return;
  }

  const phone = normalizePhoneForWhatsApp(appointment.client_phone || "");
  if (!phone) {
    window.App.showMessage("Broj telefona nije ispravan.", "error");
    return;
  }

  const text = buildClientMessage(appointment, type);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

function normalizePhoneForTel(phone) {
  const digits = String(phone || "").replace(/[^0-9+]/g, "");
  return digits || "";
}

function normalizePhoneForWhatsApp(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "381" + digits.slice(1);
  if (!digits.startsWith("381") && digits.length <= 9) digits = "381" + digits;
  return digits;
}

function changeAppointmentFilter() {
  const value = document.getElementById("appointment-filter")?.value || "active";
  window.App?.setSessionValue?.("salonAppointmentsFilter", value);
  const dateBox = document.querySelector(".appointment-date-filter");
  if (dateBox) dateBox.classList.toggle("hidden", value !== "date");
  renderAppointments();
}

function changeAppointmentDateFilter() {
  const value = document.getElementById("appointment-date-filter")?.value || new Date().toISOString().split("T")[0];
  window.App?.setSessionValue?.("salonAppointmentsDate", value);
  renderAppointments();
}

async function updateAppointmentStatus(id, status, notifyClient = false) {
  const updateData = { status };
  if (status === "confirmed") updateData.confirmed_at = new Date().toISOString();
  if (status === "cancelled") updateData.cancelled_at = new Date().toISOString();
  if (status === "done") updateData.completed_at = new Date().toISOString();
  if (status === "no_show") updateData.no_show_at = new Date().toISOString();

  const { error } = await window.db.from("appointments").update(updateData).eq("id", id).eq("salon_id", currentSalonId);
  if (error) {
    window.App.showMessage("Greška pri promeni statusa.", "error");
    return;
  }

  if (status === "confirmed") window.App.showMessage("Termin je potvrđen. Otvara se pripremljena WhatsApp poruka za klijenta.", "success");
  if (status === "done") window.App.showMessage("Termin je označen kao završen i više ne zauzima slobodan termin.", "success");
  if (status === "cancelled" || status === "no_show") window.App.showMessage("Termin je sklonjen iz aktivnih termina.", "success");

  if (notifyClient) {
    openClientMessage(id, status === "cancelled" ? "cancelled" : "confirmed");
  }

  await renderAppointments();
}

async function deleteAppointment(id) {
  if (!confirm("Da li sigurno želite da obrišete ovaj termin? Mesto se odmah oslobađa za novo zakazivanje.")) return;
  const { error } = await window.db.from("appointments").delete().eq("id", id).eq("salon_id", currentSalonId);
  if (error) {
    window.App.showMessage("Greška pri brisanju termina.", "error");
    return;
  }
  window.App.showMessage("Termin je obrisan. Mesto je slobodno za novo zakazivanje.", "success");
  await renderAppointments();
}

function getAppointmentStatusLabel(status) {
  return { new: "Novo", confirmed: "Potvrđeno", cancelled: "Otkazano", done: "Završeno", no_show: "Nije došao/la" }[status] || status;
}

async function renderServices() {
  const content = document.getElementById("salon-content");
  content.innerHTML = `
    <div class="section-head"><div><h2>Usluge / ponuda</h2><p class="muted">Dodajte i uredite usluge koje korisnici mogu izabrati prilikom slanja zahteva ili zakazivanja.</p></div><button class="btn btn-primary" type="button" onclick="showAddServiceForm()">Dodaj uslugu</button></div>
    <div id="service-form-box"></div>
    <div id="services-list" class="cards"><div class="loading-box">Učitavanje usluga...</div></div>
  `;
  await loadServices();
}

async function loadServices() {
  const list = document.getElementById("services-list");
  const { data: services, error } = await window.db.from("services").select("*").eq("salon_id", currentSalonId).order("sort_order", { ascending: true });
  if (error) {
    list.innerHTML = `<p class="error-text">Greška pri učitavanju usluga.</p>`;
    return;
  }
  if (!services?.length) {
    list.innerHTML = `<div class="card center"><p class="muted">Još nemate dodatih usluga. Dodajte prvu uslugu kako bi klijenti mogli da zakažu termin.</p></div>`;
    return;
  }
  list.innerHTML = services.map(service => `
    <div class="card service-card">
      <div class="service-row"><div><strong>${salonEscapeHtml(service.name)}</strong><span>${Number(service.duration_minutes || 0)} min</span></div><b>${Number(service.price || 0).toLocaleString("sr-RS")} RSD</b></div>
      <p class="muted">Status: ${service.active ? "Aktivna" : "Sakrivena"}</p>
      <div class="card-actions">
        <button class="btn btn-dark" type="button" onclick="editService('${service.id}')">Uredi</button>
        <button class="btn btn-dark" type="button" onclick="toggleServiceActive('${service.id}', ${service.active ? "true" : "false"})">${service.active ? "Sakrij" : "Aktiviraj"}</button>
        <button class="btn btn-danger" type="button" onclick="deleteService('${service.id}')">Obriši</button>
      </div>
    </div>
  `).join("");
}

async function showAddServiceForm(serviceId = null) {
  const box = document.getElementById("service-form-box");
  let service = null;
  if (serviceId) {
    const { data } = await window.db.from("services").select("*").eq("id", serviceId).eq("salon_id", currentSalonId).maybeSingle();
    service = data;
  }
  box.innerHTML = `
    <div class="card">
      <h3>${service ? "Uredi uslugu" : "Nova usluga"}</h3>
      <input id="service-edit-id" type="hidden" value="${service ? salonEscapeHtml(service.id) : ""}">
      <label>Naziv usluge</label><input id="service-name" type="text" value="${service ? salonEscapeHtml(service.name) : ""}" placeholder="Feniranje">
      <label>Cena</label><input id="service-price" type="number" min="0" value="${service ? Number(service.price || 0) : ""}" placeholder="1200">
      <label>Trajanje u minutima</label><input id="service-duration" type="number" min="5" step="5" value="${service ? Number(service.duration_minutes || 0) : ""}" placeholder="45">
      <div class="card-actions"><button class="btn btn-primary" type="button" onclick="saveService()">Sačuvaj</button><button class="btn btn-dark" type="button" onclick="hideAddServiceForm()">Otkaži</button></div>
    </div>`;
}

function hideAddServiceForm() { const box = document.getElementById("service-form-box"); if (box) box.innerHTML = ""; }
async function editService(id) { await showAddServiceForm(id); }

async function saveService() {
  const id = document.getElementById("service-edit-id")?.value || "";
  const name = document.getElementById("service-name")?.value.trim();
  const price = Number(document.getElementById("service-price")?.value || 0);
  const duration = Number(document.getElementById("service-duration")?.value || 0);
  if (!name || price < 0 || duration <= 0) return window.App.showMessage("Unesite naziv usluge, cenu i trajanje.", "error");
  if (id) {
    const { error } = await window.db.from("services").update({ name, price, duration_minutes: duration }).eq("id", id).eq("salon_id", currentSalonId);
    if (error) return window.App.showMessage("Greška pri izmeni usluge.", "error");
  } else {
    const { data: maxOrder } = await window.db.from("services").select("sort_order").eq("salon_id", currentSalonId).order("sort_order", { ascending: false }).limit(1);
    const newOrder = maxOrder?.length ? Number(maxOrder[0].sort_order || 0) + 1 : 1;
    const { error } = await window.db.from("services").insert({ salon_id: currentSalonId, name, price, duration_minutes: duration, active: true, sort_order: newOrder });
    if (error) return window.App.showMessage("Greška pri dodavanju usluge.", "error");
  }
  hideAddServiceForm();
  await loadServices();
}

async function toggleServiceActive(id, currentActive) {
  await window.db.from("services").update({ active: !currentActive }).eq("id", id).eq("salon_id", currentSalonId);
  await loadServices();
}

async function deleteService(id) {
  if (!confirm("Obrisati uslugu? Ako je korišćena u terminima, bolje je samo sakriti je.")) return;
  const { error } = await window.db.from("services").delete().eq("id", id).eq("salon_id", currentSalonId);
  if (error) return window.App.showMessage("Greška pri brisanju usluge. Ako je korišćena, sakrij je.", "error");
  await loadServices();
}

async function renderWorkingHours() {
  document.getElementById("salon-content").innerHTML = `
    <div class="section-head"><div><h2>Radno vreme</h2><p class="muted">Podesite dane i vreme kada biznis prima online zahteve ili termine.</p></div></div>
    <div class="card"><div id="hours-form"><div class="loading-box">Učitavanje radnog vremena...</div></div><button class="btn btn-primary" type="button" onclick="saveWorkingHours()">Sačuvaj radno vreme</button></div>
  `;
  await loadWorkingHours();
}

async function loadWorkingHours() {
  const box = document.getElementById("hours-form");
  const { data: hours, error } = await window.db.from("working_hours").select("*").eq("salon_id", currentSalonId);
  if (error) { box.innerHTML = `<p class="error-text">Greška pri učitavanju radnog vremena.</p>`; return; }
  const rows = hours || [];
  box.innerHTML = `<div class="hours-grid">${salonDays.map(day => {
    const existing = rows.find(h => Number(h.day_of_week) === day.num) || {};
    const isClosed = existing.is_closed === true;
    const openTime = String(existing.open_time || "09:00").slice(0,5);
    const closeTime = String(existing.close_time || "17:00").slice(0,5);
    return `
      <div class="card hours-row" data-day="${day.num}">
        <div class="hours-row-top"><strong>${day.name}</strong><label class="check-line"><input type="checkbox" id="closed_${day.num}" class="hours-closed" ${isClosed ? "checked" : ""}>Zatvoreno</label></div>
        <div class="hours-times"><input type="time" id="open_${day.num}" class="hours-open" value="${openTime}" ${isClosed ? "disabled" : ""}><span>do</span><input type="time" id="close_${day.num}" class="hours-close" value="${closeTime}" ${isClosed ? "disabled" : ""}></div>
      </div>`;
  }).join("")}</div>`;
  document.querySelectorAll(".hours-closed").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      const row = checkbox.closest(".hours-row");
      row.querySelectorAll(".hours-open, .hours-close").forEach(input => input.disabled = checkbox.checked);
    });
  });
}

async function saveWorkingHours() {
  const inserts = [];
  for (const day of salonDays) {
    const isClosed = document.getElementById(`closed_${day.num}`).checked;
    const openTime = document.getElementById(`open_${day.num}`).value || "09:00";
    const closeTime = document.getElementById(`close_${day.num}`).value || "17:00";
    if (!isClosed && openTime >= closeTime) return window.App.showMessage(`${day.name}: početak radnog vremena mora biti pre kraja radnog vremena.`, "error");
    inserts.push({ salon_id: currentSalonId, day_of_week: day.num, open_time: openTime, close_time: closeTime, is_closed: isClosed });
  }
  const { error } = await window.db.from("working_hours").upsert(inserts, { onConflict: "salon_id,day_of_week" });
  if (error) return window.App.showMessage("Greška pri čuvanju radnog vremena.", "error");
  window.App.showMessage("Radno vreme je sačuvano.", "success");
  await loadWorkingHours();
}

async function renderSalonSettings() {
  const salonLink = window.App.getSalonPublicLink(currentSalon.slug);
  const qrUrl = window.App.getQrImageUrl(salonLink, 260);
  document.getElementById("salon-content").innerHTML = `
    <div class="section-head"><div><h2>Podešavanja salona</h2><p class="muted">Uredite osnovne podatke koje korisnici vide na javnoj stranici profila.</p></div></div>
    <div class="card center">
      <h3>QR kod profila</h3>
      <p class="muted">Ovaj QR kod vodi korisnike direktno na javnu stranicu vašeg profila. Svaki salon ima svoj jedinstveni link i QR kod.</p>
      <img class="qr-img" src="${qrUrl}" alt="QR kod profila">
      <div class="link-box"><small>Link za klijente:</small><input readonly value="${salonLink}"></div>
      <div class="card-actions" style="justify-content:center">
        <button class="btn btn-primary" type="button" onclick="copyMySalonLink()">Kopiraj link</button>
        <a class="btn btn-dark" href="${salonLink}" target="_blank" rel="noopener">Otvori stranicu salona</a>
      </div>
    </div>
    <div class="card"><h3>Logo profila</h3><p class="muted">Salon može postaviti samo svoj logo. Dodatne slike/galerija su isključene zbog jednostavnosti.</p><input type="file" id="logo-upload" accept="image/png,image/jpeg,image/webp"><button class="btn btn-primary" type="button" onclick="uploadLogo()">Postavi logo</button><div id="current-logo" class="image-preview-box"></div></div>
    <div class="card"><h3>Tekst dobrodošlice</h3><label>Naslov</label><input id="welcome-title" type="text" placeholder="Dobrodošli u naš salon"><label>Tekst</label><textarea id="welcome-text" rows="4" placeholder="Zakažite svoj termin brzo i jednostavno."></textarea><label>Telefon</label><input id="salon-phone" type="text" placeholder="060/123-456"><label>Adresa</label><input id="salon-address" type="text" placeholder="Adresa salona"><button class="btn btn-primary" type="button" onclick="saveSettings()">Sačuvaj podešavanja</button></div>
  `;
  await loadCurrentSettings();
}

async function loadCurrentSettings() {
  const { data: settings } = await window.db.from("salon_settings").select("*").eq("salon_id", currentSalonId).maybeSingle();
  if (settings) {
    document.getElementById("welcome-title").value = settings.welcome_title || "";
    document.getElementById("welcome-text").value = settings.welcome_text || "";
    document.getElementById("salon-phone").value = settings.phone || "";
    document.getElementById("salon-address").value = settings.address || "";
    if (settings.logo_url) document.getElementById("current-logo").innerHTML = `<img src="${salonEscapeHtml(settings.logo_url)}" alt="Logo" class="preview-logo">`;
  }
}

async function saveSettings() {
  const payload = {
    salon_id: currentSalonId,
    welcome_title: document.getElementById("welcome-title")?.value.trim() || "",
    welcome_text: document.getElementById("welcome-text")?.value.trim() || "",
    phone: document.getElementById("salon-phone")?.value.trim() || "",
    address: document.getElementById("salon-address")?.value.trim() || ""
  };
  const { error } = await window.db.from("salon_settings").upsert(payload, { onConflict: "salon_id" });
  if (error) return window.App.showMessage("Greška pri čuvanju podešavanja.", "error");
  window.App.showMessage("Podešavanja profila su sačuvana.", "success");
}

async function uploadLogo() {
  const file = document.getElementById("logo-upload")?.files?.[0];
  if (!file) return window.App.showMessage("Izaberite logo sliku.", "error");
  const url = await window.StorageHelper.uploadImage(file, currentSalonId, "logo");
  if (!url) return;
  const { error } = await window.db.from("salon_settings").upsert({ salon_id: currentSalonId, logo_url: url }, { onConflict: "salon_id" });
  if (error) return window.App.showMessage("Logo nije sačuvan.", "error");
  await loadCurrentSettings();
  window.App.showMessage("Logo je uspešno postavljen.", "success");
}


function copyMySalonLink() {
  if (!currentSalon?.slug) return;
  const link = window.App.getSalonPublicLink(currentSalon.slug);
  navigator.clipboard.writeText(link).then(() => {
    window.App.showMessage("Link profila je kopiran.", "success");
  }).catch(() => prompt("Kopiraj link profila:", link));
}

function isPaymentExpired(paidUntil) {
  if (!paidUntil) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const paidDate = new Date(paidUntil); paidDate.setHours(0,0,0,0);
  return paidDate < today;
}
