// assets/js/salon.js

let currentSalon = null;
let currentSalonId = null;
let currentSection = "appointments";
let appointmentCache = [];
let adminOwnerPreviewMode = false;
const salonEscapeHtml = (value) => window.App.escapeHtml(value);
const salonEscapeJs = (value) => window.App.escapeJs(value);
const S = (key, fallback = "") => window.App?.t ? window.App.t(key, fallback) : (fallback || key);

const salonDays = [
  { num: 1, name: "Ponedeljak" },
  { num: 2, name: "Utorak" },
  { num: 3, name: "Sreda" },
  { num: 4, name: "Četvrtak" },
  { num: 5, name: "Petak" },
  { num: 6, name: "Subota" },
  { num: 0, name: "Nedelja" }
];

function stopAdminOwnerPreviewEdit() {
  if (!adminOwnerPreviewMode) return false;
  window.App.showMessage("Admin pregled vlasničkog panela je samo za gledanje. Za izmene koristite admin panel ili se ulogujte kao vlasnik.", "info");
  return true;
}

function applyAdminOwnerPreviewHeader() {
  const actions = document.querySelector(".panel-header-actions");
  if (!actions) return;
  actions.querySelector(".admin-back-btn")?.remove();
  if (!adminOwnerPreviewMode) return;
  document.getElementById("salon-install-btn")?.classList.add("hidden");
  document.getElementById("salon-logout-btn")?.classList.add("hidden");
  actions.insertAdjacentHTML("afterbegin", `<a class="btn btn-primary admin-back-btn" href="${window.App.getAppPath("admin/")}">Nazad u admin</a>`);
}

document.addEventListener("DOMContentLoaded", () => initSalonPanel());

async function initSalonPanel() {
  // Owner panel must not behave like a client-installed salon shortcut.
  // This prevents the owner app shortcut from reopening the public client profile.
  window.App?.clearSavedSalon?.();
  bindSalonTabs();
  bindSalonLogout();
  bindSalonInstall();

  const adminPreviewSalonId = window.App?.getUrlParam("salon_id");
  const wantsAdminPreview = window.App?.getUrlParam("adminPreview") === "1" && !!adminPreviewSalonId;
  if (wantsAdminPreview) {
    const isAdmin = await window.Auth.isPlatformAdmin();
    if (!isAdmin) {
      renderSalonLogin();
      window.App.showMessage("Admin pregled je dostupan samo prijavljenom administratoru.", "error");
      return;
    }
    adminOwnerPreviewMode = true;
    await loadSalonForAdminPreview(adminPreviewSalonId);
    return;
  }

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

function bindSalonInstall() {
  document.getElementById("salon-install-btn")?.addEventListener("click", async () => {
    window.App?.clearSavedSalon?.();
    await window.App?.installOwnerApp?.();
  });
}

function bindSalonLogout() {
  document.getElementById("salon-logout-btn")?.addEventListener("click", () => {
    window.Auth.salonLogout();
    window.App?.clearSalonTheme?.();
    currentSalon = null;
    currentSalonId = null;
    document.getElementById("salon-install-btn")?.classList.add("hidden");
    renderSalonLogin();
  });
}

function renderSalonLogin() {
  window.App?.clearSalonTheme?.();
  window.App?.setAppLanguage?.("sr");
  document.getElementById("salon-name").textContent = "Panel vlasnika biznisa";
  document.getElementById("salon-status-text").textContent = "Unesite email adresu biznisa i kod firme koji vam je dodelio administrator.";
  document.getElementById("salon-tabs").classList.add("hidden");
  document.getElementById("salon-logout-btn").classList.add("hidden");
  document.getElementById("salon-install-btn")?.classList.add("hidden");
  document.getElementById("salon-content").innerHTML = `
    <div class="card login-card">
      <h2>Ulaz za vlasnika biznisa</h2>
      <p class="muted">Unesite email adresu biznisa i kod firme koji vam je dodelio administrator.</p>
      <label>Email vlasnika / biznisa</label>
      <input id="salon-login-email" type="email" placeholder="salon@email.com">
      <label>Kod firme</label>
      <input id="salon-login-code" type="text" placeholder="CS-1001">
      <button class="btn btn-primary" type="button" onclick="handleSalonLogin()">Prijavi se</button>
    </div>
  `;
}

async function handleSalonLogin() {
  window.App?.clearSavedSalon?.();
  const email = document.getElementById("salon-login-email").value.trim().toLowerCase();
  const code = document.getElementById("salon-login-code").value.trim();
  const salon = await window.Auth.salonLogin(email, code);
  if (!salon) return;
  currentSalon = salon;
  currentSalonId = salon.id;
  window.App?.setAppLanguage?.(salon.app_language || "sr");
  window.App?.applySalonTheme?.(salon.theme_color);
  renderSalonDashboard();
  await showSection("appointments");
}

async function loadSalonForAdminPreview(salonId) {
  const { data, error } = await window.db
    .from("salons")
    .select("*")
    .eq("id", salonId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error || !data) {
    renderSalonLogin();
    window.App.showMessage("Profil nije pronađen za admin pregled.", "error");
    return;
  }

  currentSalon = data;
  currentSalonId = data.id;
  window.App?.setAppLanguage?.(data.app_language || "sr");
  window.App?.applySalonTheme?.(data.theme_color);
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
  window.App?.setAppLanguage?.(data.app_language || "sr");
  window.App?.applySalonTheme?.(data.theme_color);
  renderSalonDashboard();
  await showSection("appointments");
}

function renderBlockedSalon(salon) {
  window.App?.setAppLanguage?.(salon.app_language || "sr");
  window.App?.applySalonTheme?.(salon.theme_color);
  document.getElementById("salon-name").textContent = salon.salon_name || "Salon";
  document.getElementById("salon-status-text").textContent = "Profil je blokiran.";
  document.getElementById("salon-tabs").classList.add("hidden");
  document.getElementById("salon-logout-btn").classList.remove("hidden");
  document.getElementById("salon-install-btn")?.classList.remove("hidden");
  document.getElementById("salon-content").innerHTML = `
    <div class="card center"><h2>Vaš profil je trenutno blokiran</h2><p>Kontaktirajte administratora.</p></div>
  `;
}

function renderSalonDashboard() {
  const labels = {
    appointments: S("tabAppointments", "Zahtevi / termini"),
    services: S("tabServices", "Usluge / ponuda"),
    hours: S("tabHours", "Radno vreme"),
    settings: S("tabSettings", "Podešavanje profila")
  };
  document.querySelectorAll("#salon-tabs button").forEach(btn => {
    if (labels[btn.dataset.section]) btn.textContent = labels[btn.dataset.section];
  });
  document.getElementById("salon-install-btn").textContent = S("ownerInstallBtn", "Preuzmi panel vlasnika");
  document.getElementById("salon-logout-btn").textContent = S("logout", "Odjavi se");

  document.getElementById("salon-name").textContent = currentSalon.salon_name || "Panel vlasnika biznisa";
  const expired = isPaymentExpired(currentSalon.paid_until);
  document.getElementById("salon-status-text").innerHTML = adminOwnerPreviewMode
    ? `Admin pregled vlasničkog panela • izmene su zaključane`
    : expired
      ? `Aktivan profil • <span class="danger-text">Uplata istekla</span>`
      : `Aktivan profil`;
  document.getElementById("salon-tabs").classList.remove("hidden");
  document.getElementById("salon-logout-btn").classList.toggle("hidden", adminOwnerPreviewMode);
  document.getElementById("salon-install-btn")?.classList.toggle("hidden", adminOwnerPreviewMode);
  applyAdminOwnerPreviewHeader();
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

async function enableOwnerNotifications() {
  if (stopAdminOwnerPreviewEdit()) return;
  await window.App.registerPushForSalon(currentSalonId);
}

async function renderAppointments() {
  const content = document.getElementById("salon-content");
  const today = new Date().toISOString().split("T")[0];
  const statusFilter = window.App?.getSessionValue?.("salonAppointmentsFilter") || "active";
  const dateFilter = window.App?.getSessionValue?.("salonAppointmentsDate") || today;

  content.innerHTML = `<div class="loading-box">${S("loadingProfile", "Učitavanje termina...")}</div>`;

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
    content.innerHTML = `<div class="card"><p class="error-text">${S("sendError", "Greška pri učitavanju termina.")}</p></div>`;
    return;
  }

  const items = appointments || [];
  appointmentCache = items;
  const newCount = items.filter(item => item.status === "new").length;
  window.App.setAppBadgeCount?.(newCount);
  content.innerHTML = `
    <div class="section-head paper-section-head">
      <div>
        <h2>Zahtevi / termini</h2>
        <p class="muted">Pregled zahteva i zakazanih termina po datumu, vremenu, usluzi i korisniku.</p>
      </div>
      <div class="toolbar-actions">
        ${adminOwnerPreviewMode ? `<span class="status-pill">Samo pregled</span>` : `<button class="btn btn-primary btn-small" type="button" onclick="enableOwnerNotifications()">${S("enableNotifications", "Uključi obaveštenja")}</button>`}
        <button class="btn btn-dark btn-small" type="button" onclick="renderAppointments()">${S("refresh", "Osveži")}</button>
      </div>
    </div>

    <div class="paper-toolbar card">
      <label>
        Prikaz
        <select id="appointment-filter" onchange="changeAppointmentFilter()">
          <option value="active" ${statusFilter === "active" ? "selected" : ""}>Aktivni termini</option>
          <option value="today" ${statusFilter === "today" ? "selected" : ""}>${S("todayAppointments", "Današnji termini")}</option>
          <option value="date" ${statusFilter === "date" ? "selected" : ""}>Zahtevi / termini po datumu</option>
          <option value="done" ${statusFilter === "done" ? "selected" : ""}>${S("done", "Završeni termini")}</option>
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
        <p class="muted">${S("noRequestsText", "Kada korisnik pošalje zahtev ili zakaže termin, podaci će se prikazati u ovoj listi.")}</p>
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
              <th>Cena / valuta</th>
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
  const phoneHref = salonEscapeHtml(normalizePhoneForTel(a.client_phone || ""));
  const price = window.App.formatServicePrice(a);
  return `
    <tr>
      <td>${date}</td>
      <td><strong>${time}</strong></td>
      <td>${service}</td>
      <td>${name}</td>
      <td><a href="tel:${phoneHref}" class="phone-link">${phone}</a></td>
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
  const phoneHref = salonEscapeHtml(normalizePhoneForTel(a.client_phone || ""));
  return `
    <div class="paper-mobile-item">
      <div class="paper-mobile-top">
        <div><strong>${time}</strong><span>${date}</span></div>
        ${renderAppointmentStatusSelect(a)}
      </div>
      <div class="paper-mobile-main">
        <b>${service}</b>
        <span>${name}</span>
        <a href="tel:${phoneHref}" class="phone-link">${phone}</a>
      </div>
      <div class="paper-row-actions">${renderAppointmentActionButtons(a)}</div>
    </div>
  `;
}

function renderAppointmentStatusSelect(a) {
  const id = salonEscapeHtml(a.id);
  const status = salonEscapeHtml(a.status || "new");
  return `
    <select class="status-select ${status}" ${adminOwnerPreviewMode ? "disabled" : ""} onchange="handleAppointmentStatusChange('${id}', this.value)">
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
  if (adminOwnerPreviewMode) {
    return `<a class="btn btn-dark btn-paper" href="tel:${safePhone}">Pozovi</a><span class="status-pill">Admin pregled</span>`;
  }
  return `
    <button class="btn btn-success btn-paper" type="button" onclick="openClientMessage('${id}', 'confirmed')">Poruka</button>
    <a class="btn btn-dark btn-paper" href="tel:${safePhone}">Pozovi</a>
    <button class="btn btn-danger btn-paper" type="button" onclick="deleteAppointment('${id}')">${S("delete", "Obriši")}</button>
  `;
}

async function handleAppointmentStatusChange(id, status) {
  if (stopAdminOwnerPreviewEdit()) return;
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
  const raw = String(phone || "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");

  if (raw.startsWith("+")) return `+${digits}`;
  if (raw.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0")) return `+381${digits.slice(1)}`;
  if (/^(381|387|385|382|389|386|49|43)\d{6,}$/.test(digits)) return `+${digits}`;

  return digits || "";
}

function normalizePhoneForWhatsApp(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  // +381, +387, +385...
  if (raw.startsWith("+")) return digits;

  // 00381, 00387, 00385...
  if (raw.startsWith("00")) return digits.slice(2);

  // Lokalni srpski format 06... tretiramo kao +381.
  // Za BiH/Hrvatsku treba uneti +387 / +385 da WhatsApp ode na pravi broj.
  if (digits.startsWith("0") && digits.length >= 8) return `381${digits.slice(1)}`;

  // Ako je broj već unet bez plusa, ali s pozivnim brojem države.
  if (/^(381|387|385|382|389|386|49|43)\d{6,}$/.test(digits)) return digits;

  return "";
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
  if (stopAdminOwnerPreviewEdit()) return;
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
  if (stopAdminOwnerPreviewEdit()) return;
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
  return { new: S("newRequests", "Novo"), confirmed: S("confirmed", "Potvrđeno"), cancelled: "Otkazano", done: S("done", "Završeno"), no_show: "Nije došao/la" }[status] || status;
}

async function renderServices() {
  const content = document.getElementById("salon-content");
  content.innerHTML = `
    <div class="section-head"><div><h2>Usluge / ponuda</h2><p class="muted">Dodajte i uredite usluge koje korisnici mogu izabrati prilikom slanja zahteva ili zakazivanja.</p></div>${adminOwnerPreviewMode ? `<span class="status-pill">Samo pregled</span>` : `<button class="btn btn-primary" type="button" onclick="showAddServiceForm()">Dodaj uslugu</button>`}</div>
    <div id="service-form-box"></div>
    <div id="services-list" class="cards"><div class="loading-box">${S("loadingProfile", "Učitavanje usluga...")}</div></div>
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
    list.innerHTML = `<div class="card center"><p class="muted">${S("noServicesText", "Još nemate dodatih usluga. Dodajte prvu uslugu kako bi klijenti mogli da zakažu termin.")}</p></div>`;
    return;
  }
  list.innerHTML = services.map(service => `
    <div class="card service-card">
      <div class="service-row"><div><strong>${salonEscapeHtml(service.name)}</strong><span>${Number(service.duration_minutes || 0)} min</span></div><b>${window.App.formatServicePrice(service)}</b></div>
      <p class="muted">Status: ${service.active ? "Aktivna" : "Sakrivena"}</p>
      ${adminOwnerPreviewMode ? `<div class="card-actions"><span class="status-pill">Admin pregled</span></div>` : `<div class="card-actions">
        <button class="btn btn-dark" type="button" onclick="editService('${service.id}')">Uredi</button>
        <button class="btn btn-dark" type="button" onclick="toggleServiceActive('${service.id}', ${service.active ? "true" : "false"})">${service.active ? "Sakrij" : "Aktiviraj"}</button>
        <button class="btn btn-danger" type="button" onclick="deleteService('${service.id}')">${S("delete", "Obriši")}</button>
      </div>`}
    </div>
  `).join("");
}

async function showAddServiceForm(serviceId = null) {
  if (stopAdminOwnerPreviewEdit()) return;
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
      <div class="price-grid">
        <div>
          <label>Cena od</label>
          <input id="service-price" type="number" min="0" value="${service ? Number(service.price || 0) : ""}" placeholder="500">
        </div>
        <div>
          <label>Cena do</label>
          <input id="service-price-to" type="number" min="0" value="${service && service.price_to ? Number(service.price_to || 0) : ""}" placeholder="800">
        </div>
      </div>
      <label>Valuta</label>
      <select id="service-currency">
        <option value="RSD" ${!service || (service.currency || "RSD") === "RSD" ? "selected" : ""}>Dinari (RSD)</option>
        <option value="EUR" ${service && service.currency === "EUR" ? "selected" : ""}>Evri (EUR)</option>
      </select>
      <p class="muted form-help">Ako usluga ima raspon cene, unesite npr. 500 u “Cena od” i 800 u “Cena do”. Ako je cena po dogovoru, unesite 0.</p>
      <label>Trajanje u minutima</label><input id="service-duration" type="number" min="5" step="5" value="${service ? Number(service.duration_minutes || 0) : ""}" placeholder="45">
      <div class="card-actions"><button class="btn btn-primary" type="button" onclick="saveService()">${S("save", "Sačuvaj")}</button><button class="btn btn-dark" type="button" onclick="hideAddServiceForm()">${S("cancel", "Otkaži")}</button></div>
    </div>`;
}

function hideAddServiceForm() { const box = document.getElementById("service-form-box"); if (box) box.innerHTML = ""; }
async function editService(id) { await showAddServiceForm(id); }

async function saveService() {
  if (stopAdminOwnerPreviewEdit()) return;
  const id = document.getElementById("service-edit-id")?.value || "";
  const name = document.getElementById("service-name")?.value.trim();
  const price = Number(document.getElementById("service-price")?.value || 0);
  const priceToRaw = document.getElementById("service-price-to")?.value;
  const priceTo = priceToRaw === "" || priceToRaw === undefined ? null : Number(priceToRaw);
  const currency = window.App.normalizeCurrency(document.getElementById("service-currency")?.value || "RSD");
  const duration = Number(document.getElementById("service-duration")?.value || 0);
  if (!name || price < 0 || (priceTo !== null && priceTo < 0) || duration <= 0) return window.App.showMessage("Unesite naziv usluge, cenu, valutu i trajanje.", "error");
  if (priceTo !== null && priceTo > 0 && priceTo < price) return window.App.showMessage("Cena do ne može biti manja od cene od.", "error");
  if (id) {
    const { error } = await window.db.from("services").update({ name, price, price_to: priceTo, currency, duration_minutes: duration }).eq("id", id).eq("salon_id", currentSalonId);
    if (error) return window.App.showMessage("Greška pri izmeni usluge.", "error");
  } else {
    const { data: maxOrder } = await window.db.from("services").select("sort_order").eq("salon_id", currentSalonId).order("sort_order", { ascending: false }).limit(1);
    const newOrder = maxOrder?.length ? Number(maxOrder[0].sort_order || 0) + 1 : 1;
    const { error } = await window.db.from("services").insert({ salon_id: currentSalonId, name, price, price_to: priceTo, currency, duration_minutes: duration, active: true, sort_order: newOrder });
    if (error) return window.App.showMessage("Greška pri dodavanju usluge.", "error");
  }
  hideAddServiceForm();
  await loadServices();
}

async function toggleServiceActive(id, currentActive) {
  if (stopAdminOwnerPreviewEdit()) return;
  await window.db.from("services").update({ active: !currentActive }).eq("id", id).eq("salon_id", currentSalonId);
  await loadServices();
}

async function deleteService(id) {
  if (stopAdminOwnerPreviewEdit()) return;
  if (!confirm("Obrisati uslugu? Ako je korišćena u terminima, bolje je samo sakriti je.")) return;
  const { error } = await window.db.from("services").delete().eq("id", id).eq("salon_id", currentSalonId);
  if (error) return window.App.showMessage("Greška pri brisanju usluge. Ako je korišćena, sakrij je.", "error");
  await loadServices();
}

async function renderWorkingHours() {
  document.getElementById("salon-content").innerHTML = `
    <div class="section-head"><div><h2>Radno vreme</h2><p class="muted">Podesite dane i vreme kada biznis prima online zahteve ili termine.</p></div></div>
    <div class="card"><div id="hours-form"><div class="loading-box">${S("loadingProfile", "Učitavanje radnog vremena...")}</div></div>${adminOwnerPreviewMode ? `<div class="warning-box">Admin pregled je samo za gledanje. Radno vreme se ne može menjati iz pregleda.</div>` : `<button class="btn btn-primary" type="button" onclick="saveWorkingHours()">${S("save", "Sačuvaj")} radno vreme</button>`}</div>
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
  if (stopAdminOwnerPreviewEdit()) return;
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
  const previewLink = `${salonLink}${salonLink.includes("?") ? "&" : "?"}ownerPreview=1`;
  const qrUrl = window.App.getQrImageUrl(salonLink, 260);
  document.getElementById("salon-content").innerHTML = `
    <div class="section-head">
      <div>
        <h2>${S("profileSettings", "Podešavanje profila")}</h2>
        <p class="muted">Uredite podatke koje korisnici vide na javnoj stranici profila.</p>
      </div>
      <a class="btn btn-primary" href="${adminOwnerPreviewMode ? `${window.App.getSalonPublicLink(currentSalon.slug)}&adminPreview=1&from=admin` : previewLink}">Pogledaj javnu stranicu</a>
    </div>
    ${adminOwnerPreviewMode ? `<div class="warning-box">Admin pregled vlasničkog panela je samo za proveru izgleda. Dugmad za izmene su zaključana.</div>` : ""}
    <div class="card center">
      <h3>QR kod profila</h3>
      <p class="muted">Ovaj QR kod vodi korisnike direktno na javnu stranicu vašeg profila. Svaki salon ima svoj jedinstveni link i QR kod.</p>
      <img class="qr-img" src="${qrUrl}" alt="QR kod profila">
      <div class="link-box"><small>Link za klijente:</small><input readonly value="${salonLink}"></div>
      <div class="card-actions" style="justify-content:center">
        <button class="btn btn-primary" type="button" onclick="copyMySalonLink()">Kopiraj link</button>
        <a class="btn btn-dark" href="${previewLink}">Pogledaj javnu stranicu</a>
      </div>
    </div>
    <div class="card"><h3>Logo profila</h3><p class="muted">Ovde postavljate logo koji će se prikazati na javnoj stranici ispod QR linka/profila.</p><input type="file" id="logo-upload" accept="image/png,image/jpeg,image/webp"><button class="btn btn-primary" type="button" onclick="uploadLogo()">Postavi / promeni logo</button><div id="current-logo" class="image-preview-box"></div></div>
    <div class="card settings-text-card">
      <h3>Javni tekst profila</h3>
      <p class="muted">Ova polja se prikazuju na javnoj stranici profila, ispod loga. Promena javnog naziva ne menja link i QR kod profila.</p>
      <label>Naziv profila koji korisnici vide</label>
      <input id="welcome-title" type="text" placeholder="${salonEscapeHtml(currentSalon?.salon_name || 'Naziv biznisa')}">
      <p class="field-help">Ovde možete ispraviti grešku u nazivu koji korisnici vide. Link i QR kod ostaju isti.</p>
      <label>Opis / poruka korisnicima</label>
      <textarea id="welcome-text" rows="4" placeholder="Izaberite uslugu, datum i slobodan termin ili pošaljite zahtev."></textarea>
      <label>Telefon koji korisnici vide</label>
      <input id="salon-phone" type="text" placeholder="+381 64 123 4567">
      <p class="field-help">Unesite broj sa pozivnim brojem države ako želite WhatsApp ili direktan poziv.</p>
      <label>Adresa / lokacija</label>
      <input id="salon-address" type="text" placeholder="Adresa ili mesto poslovanja">
      <div class="settings-preview" id="settings-public-preview"></div>
      <div class="card-actions settings-main-actions">
        <button class="btn btn-primary" type="button" onclick="saveSettings()">${S("save", "Sačuvaj")} podešavanja</button>
        <button class="btn btn-dark" type="button" onclick="saveSettingsAndPreview()">${S("save", "Sačuvaj")} i pogledaj javnu stranicu</button>
      </div>
    </div>
  `;
  await loadCurrentSettings();
  bindSettingsPreview();
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
  updateSettingsPreview();
}

function bindSettingsPreview() {
  ["welcome-title", "welcome-text", "salon-phone", "salon-address"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", updateSettingsPreview);
  });
}

function updateSettingsPreview() {
  const box = document.getElementById("settings-public-preview");
  if (!box) return;
  const title = document.getElementById("welcome-title")?.value.trim() || currentSalon?.salon_name || "Naziv profila";
  const text = document.getElementById("welcome-text")?.value.trim() || "Opis koji korisnik vidi na javnoj stranici profila.";
  const phone = document.getElementById("salon-phone")?.value.trim();
  const address = document.getElementById("salon-address")?.value.trim();
  box.innerHTML = `
    <div class="preview-label">Pregled javnog prikaza</div>
    <div class="public-preview-box">
      <strong>${salonEscapeHtml(title)}</strong>
      <p>${salonEscapeHtml(text)}</p>
      ${phone ? `<span>📞 ${salonEscapeHtml(phone)}</span>` : ""}
      ${address ? `<span>📍 ${salonEscapeHtml(address)}</span>` : ""}
    </div>
  `;
}

async function saveSettings() {
  if (stopAdminOwnerPreviewEdit()) return;
  const payload = {
    salon_id: currentSalonId,
    welcome_title: document.getElementById("welcome-title")?.value.trim() || "",
    welcome_text: document.getElementById("welcome-text")?.value.trim() || "",
    phone: document.getElementById("salon-phone")?.value.trim() || "",
    address: document.getElementById("salon-address")?.value.trim() || ""
  };
  const { error } = await window.db.from("salon_settings").upsert(payload, { onConflict: "salon_id" });
  if (error) return window.App.showMessage("Greška pri čuvanju podešavanja.", "error");
  await loadCurrentSettings();
  window.App.showMessage("Podešavanja su sačuvana. Javni naziv, tekst, telefon i adresa sada se prikazuju na javnoj stranici profila.", "success");
}

async function saveSettingsAndPreview() {
  if (stopAdminOwnerPreviewEdit()) return;
  await saveSettings();
  if (!currentSalon?.slug) return;
  const salonLink = window.App.getSalonPublicLink(currentSalon.slug);
  const previewLink = `${salonLink}${salonLink.includes("?") ? "&" : "?"}ownerPreview=1`;
  window.location.href = previewLink;
}

async function uploadLogo() {
  if (stopAdminOwnerPreviewEdit()) return;
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
