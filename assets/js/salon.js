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

const VISIT_SOURCE_OPTIONS = [
  { key: "facebook", label: "Facebook", hint: "Za FB objavu, grupu ili reklamu" },
  { key: "instagram", label: "Instagram", hint: "Za Instagram bio, story ili objavu" },
  { key: "tiktok", label: "TikTok", hint: "Za TikTok profil ili video opis" },
  { key: "kupujemprodajem", label: "KupujemProdajem", hint: "Za KP oglas ili opis oglasa" },
  { key: "polovniautomobili", label: "PolovniAutomobili", hint: "Za oglas na Polovnim Automobilima" },
  { key: "qr", label: "QR kod / štampa", hint: "Za nalepnicu, flajer, vizit kartu ili izlog" }
];

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


function daysUntilSubscriptionEnd(dateString) {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString + (String(dateString).includes("T") ? "" : "T00:00:00"));
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function renderOwnerSubscriptionNotice() {
  if (adminOwnerPreviewMode || !currentSalon?.paid_until) return "";
  const days = daysUntilSubscriptionEnd(currentSalon.paid_until);
  if (days === null || days > 10) return "";
  const paidUntil = window.App.formatDate(currentSalon.paid_until);
  const adminEmail = window.APP_CONFIG?.platformAdminEmail || "duskomacak@gmail.com";
  const subject = `Produženje CityStyle.app usluge - ${currentSalon.salon_name || "profil"}`;
  const body = `Poštovani,\n\nŽelim informacije za produženje CityStyle.app usluge za profil: ${currentSalon.salon_name || ""}.\n\nDatum isteka: ${paidUntil}\n\nSrdačan pozdrav.`;
  const mailUrl = `mailto:${encodeURIComponent(adminEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const title = days < 0
    ? `Vaša CityStyle.app usluga je istekla ${paidUntil}.`
    : days === 0
      ? `Vaša CityStyle.app usluga ističe danas.`
      : `Vaša CityStyle.app usluga ističe za ${days} dana.`;
  return `
    <div class="owner-subscription-alert">
      <div>
        <strong>⚠️ ${salonEscapeHtml(title)}</strong>
        <p>Molimo kontaktirajte administratora ukoliko želite produženje usluge za naredni period.</p>
      </div>
      <a class="btn btn-primary btn-small" href="${mailUrl}">Kontaktiraj admina</a>
    </div>
  `;
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
      <p class="muted">Unesite email adresu biznisa i kod firme koji vam je dodelio administrator. Posle uspešne prijave ostajete prijavljeni na ovom uređaju dok ne kliknete „Odjavi se”.</p>
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


function getCurrentPackageType() {
  return String(currentSalon?.package_type || "business").trim().toLowerCase();
}

function ownerHasGaragePackage() {
  const pkg = getCurrentPackageType();
  return pkg.startsWith("garage_") || pkg === "custom";
}

function getGarageListingLimit() {
  const pkg = getCurrentPackageType();
  const preset = { garage_start: 30, garage_plus: 75, garage_pro: 150, garage_max: 300, custom: 999999 };
  return Number(currentSalon?.max_garage_listings || preset[pkg] || 0);
}

function getGarageImageLimit() {
  return Number(currentSalon?.max_images_per_listing || 10);
}

function garagePackageLabel() {
  const pkg = getCurrentPackageType();
  return {
    garage_start: "Garaža Start",
    garage_plus: "Garaža Plus",
    garage_pro: "Garaža PRO",
    garage_max: "Garaža MAX",
    custom: "Custom"
  }[pkg] || "Biznis";
}

function renderSalonDashboard() {
  const labels = {
    appointments: S("tabAppointments", "Zahtevi / termini"),
    services: S("tabServices", "Usluge / ponuda"),
    products: S("tabProducts", "Proizvodi / katalog"),
    analytics: "Statistika / QR",
    garage: "Garaža",
    gallery: "Galerija radova",
    hours: S("tabHours", "Radno vreme"),
    settings: S("tabSettings", "Podešavanje profila")
  };
  document.querySelectorAll("#salon-tabs button").forEach(btn => {
    if (labels[btn.dataset.section]) btn.textContent = labels[btn.dataset.section];
    if (btn.dataset.section === "garage") btn.classList.toggle("hidden", !ownerHasGaragePackage());
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
  if (section === "products") return renderProducts();
  if (section === "analytics") return renderAnalytics();
  if (section === "garage") {
    if (!ownerHasGaragePackage()) {
      window.App.showMessage("Garaža je dostupna samo za Garaža pakete koje uključuje admin.", "error");
      return renderAppointments();
    }
    return renderGarage();
  }
  if (section === "gallery") return renderGallery();
  if (section === "hours") return renderWorkingHours();
  if (section === "settings") return renderSalonSettings();
}

async function enableOwnerNotifications() {
  if (stopAdminOwnerPreviewEdit()) return;
  await window.App.registerPushForSalon(currentSalonId);
}

function getOwnerSourceLink(source = "") {
  if (!currentSalon?.slug) return "";
  if (window.App?.getSalonSourceLink) return window.App.getSalonSourceLink(currentSalon.slug, source);
  const base = window.App.getSalonPublicLink(currentSalon.slug);
  return source ? `${base}&src=${encodeURIComponent(source)}` : base;
}

function getSourceLabel(source = "") {
  const key = String(source || "direct").trim().toLowerCase();
  return VISIT_SOURCE_LABELS[key] || key || "Ostalo";
}

function copyTextToClipboard(text, successText = "Kopirano.") {
  if (!text) return;
  navigator.clipboard?.writeText(text).then(() => {
    window.App.showMessage(successText, "success");
  }).catch(() => prompt("Kopiraj:", text));
}

function copyOwnerSourceLink(source = "") {
  copyTextToClipboard(getOwnerSourceLink(source), "Reklamni link je kopiran.");
}

function openOwnerSourceQr(source = "", label = "QR kod") {
  const link = getOwnerSourceLink(source);
  const qrUrl = window.App.getQrImageUrl(link, 480);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal-card source-qr-modal">
      <h2>${salonEscapeHtml(label)}</h2>
      <p class="muted">Ovaj QR vodi na isti javni profil, ali se u statistici broji kao: <strong>${salonEscapeHtml(label)}</strong>.</p>
      <img class="qr-img source-big-qr" src="${qrUrl}" alt="${salonEscapeHtml(label)} QR kod">
      <div class="link-box"><input readonly value="${salonEscapeHtml(link)}"></div>
      <div class="modal-actions">
        <button class="btn btn-primary" type="button" onclick="copyOwnerSourceLink('${salonEscapeJs(source)}')">Kopiraj link</button>
        <a class="btn btn-dark" href="${qrUrl}" target="_blank" rel="noopener" download="citystyle-${salonEscapeHtml(currentSalon?.slug || 'profil')}-${salonEscapeHtml(source || 'glavni')}-qr.png">Otvori / preuzmi QR</a>
        <button class="btn btn-dark" type="button" onclick="this.closest('.modal-backdrop').remove()">Zatvori</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function renderAnalytics() {
  const content = document.getElementById("salon-content");
  content.innerHTML = `<div class="loading-box">Učitavanje statistike...</div>`;

  const now = new Date();
  const start30 = new Date(now.getTime() - 30 * 86400000);
  const start7 = new Date(now.getTime() - 7 * 86400000);
  const todayStart = startOfDay(now);

  let visits = [];
  let error = null;
  try {
    const res = await window.db
      .from("profile_visits")
      .select("source, created_at")
      .eq("salon_id", currentSalonId)
      .gte("created_at", start30.toISOString())
      .order("created_at", { ascending: false });
    visits = res.data || [];
    error = res.error;
  } catch (err) {
    error = err;
  }

  const sourceRows = VISIT_SOURCE_OPTIONS.map(option => {
    const link = getOwnerSourceLink(option.key);
    const qrUrl = window.App.getQrImageUrl(link, 180);
    const count = visits.filter(v => String(v.source || "direct") === option.key).length;
    return { ...option, link, qrUrl, count };
  });

  const grouped = visits.reduce((acc, visit) => {
    const key = String(visit.source || "direct").toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const sourceStats = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const total30 = visits.length;
  const total7 = visits.filter(v => new Date(v.created_at) >= start7).length;
  const totalToday = visits.filter(v => new Date(v.created_at) >= todayStart).length;

  content.innerHTML = `
    <div class="section-head paper-section-head">
      <div>
        <h2>Statistika poseta i reklamni QR kodovi</h2>
        <p class="muted">Bez ličnih podataka posetilaca. Broji se samo otvaranje profila i izvor linka.</p>
      </div>
      <button class="btn btn-dark btn-small" type="button" onclick="renderAnalytics()">Osveži</button>
    </div>

    ${error ? `<div class="card warning-box"><strong>Statistika još nije spremna.</strong><p class="muted">Ako vidiš ovu poruku, proveri da li je SQL za tabelu <code>profile_visits</code> pokrenut u Supabase-u.</p></div>` : ""}

    <div class="owner-dashboard-grid">
      <div class="owner-metric-card"><span>Danas</span><strong>${totalToday}</strong><small>poseta profilu</small></div>
      <div class="owner-metric-card"><span>7 dana</span><strong>${total7}</strong><small>poseta profilu</small></div>
      <div class="owner-metric-card"><span>30 dana</span><strong>${total30}</strong><small>poseta profilu</small></div>
    </div>

    <div class="card analytics-help-card">
      <h3>Kako se koristi?</h3>
      <p class="muted">Svi linkovi i QR kodovi vode na isti javni profil. Razlika je samo u oznaci izvora, da vlasnik vidi odakle dolaze posete.</p>
      <p class="muted">Za Facebook koristi Facebook link/QR, za KupujemProdajem koristi KP link/QR, a za nalepnice i štampu koristi QR kod / štampa.</p>
    </div>

    <div class="card">
      <h3>Posete po izvoru - poslednjih 30 dana</h3>
      ${sourceStats.length ? `
        <div class="source-stats-list">
          ${sourceStats.map(([source, count]) => `
            <div class="source-stat-row"><span>${salonEscapeHtml(getSourceLabel(source))}</span><strong>${count}</strong></div>
          `).join("")}
        </div>` : `<p class="muted">Još nema zabeleženih poseta. Otvori neki reklamni link ili skeniraj QR kod za test.</p>`}
    </div>

    <div class="card">
      <h3>Glavni link profila</h3>
      <p class="muted">Koristi se kada nije važno odakle dolazi poseta.</p>
      <div class="source-link-line">
        <input readonly value="${salonEscapeHtml(getOwnerSourceLink(''))}">
        <button class="btn btn-dark btn-small" type="button" onclick="copyOwnerSourceLink('')">Kopiraj</button>
      </div>
    </div>

    <div class="card">
      <h3>Reklamni linkovi i QR kodovi po izvoru</h3>
      <div class="source-qr-grid">
        ${sourceRows.map(row => `
          <article class="source-qr-card">
            <div>
              <h4>${salonEscapeHtml(row.label)}</h4>
              <p>${salonEscapeHtml(row.hint)}</p>
              <small>Posete 30 dana: <strong>${row.count}</strong></small>
            </div>
            <img src="${row.qrUrl}" alt="${salonEscapeHtml(row.label)} QR kod">
            <div class="source-link-line compact">
              <input readonly value="${salonEscapeHtml(row.link)}">
            </div>
            <div class="source-actions">
              <button class="btn btn-dark btn-small" type="button" onclick="copyOwnerSourceLink('${salonEscapeJs(row.key)}')">Kopiraj link</button>
              <button class="btn btn-primary btn-small" type="button" onclick="openOwnerSourceQr('${salonEscapeJs(row.key)}', '${salonEscapeJs(row.label)}')">Prikaži QR</button>
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
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
  const todayCount = items.filter(item => item.appointment_date === today && ["new", "confirmed"].includes(item.status)).length;
  const activeCount = items.filter(item => ["new", "confirmed"].includes(item.status)).length;
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

    ${renderOwnerSubscriptionNotice()}

    <div class="owner-dashboard-grid">
      <div class="owner-metric-card"><span>Danas</span><strong>${todayCount}</strong><small>aktivnih zahteva</small></div>
      <div class="owner-metric-card"><span>Ukupno aktivno</span><strong>${activeCount}</strong><small>novi i potvrđeni</small></div>
      <div class="owner-metric-card"><span>Notifikacije</span><strong>🔔</strong><small>uključite na telefonu vlasnika</small></div>
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
  const businessName = currentSalon?.salon_name || "biznis profil";
  const clientName = appointment.client_name || "";
  const service = appointment.service_name_snapshot || "usluga";
  const date = window.App.formatDate(appointment.appointment_date);
  const time = String(appointment.appointment_time || "").slice(0, 5);

  if (type === "cancelled") {
    return `Poštovani/a ${clientName},

vaš zahtev/termin kod ${businessName} za ${date} u ${time} je otkazan.

Usluga: ${service}

Molimo zakažite novi termin ili kontaktirajte biznis direktno.
${businessName}`;
  }

  return `Poštovani/a ${clientName},

vaš zahtev/termin kod ${businessName} je potvrđen.

Usluga: ${service}
Datum: ${date}
Vreme: ${time}

Vidimo se.
${businessName}`;
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
      <div class="service-row"><div><strong>${salonEscapeHtml(service.name)}</strong><span>${service.category ? salonEscapeHtml(service.category) + " • " : ""}${Number(service.duration_minutes || 0)} min</span></div><b>${window.App.formatServicePrice(service)}</b></div>
      ${service.description ? `<p class="muted">${salonEscapeHtml(service.description)}</p>` : ""}
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
      <label>Naziv usluge</label><input id="service-name" type="text" value="${service ? salonEscapeHtml(service.name) : ""}" placeholder="Servis klime, šišanje, keramika...">
      <label>Kategorija</label><input id="service-category" type="text" value="${service ? salonEscapeHtml(service.category || "") : ""}" placeholder="Frizer, klima, keramika, auto servis...">
      <label>Opis usluge</label><textarea id="service-description" rows="3" placeholder="Kratak opis koji korisnik vidi na javnom profilu.">${service ? salonEscapeHtml(service.description || "") : ""}</textarea>
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
  const category = document.getElementById("service-category")?.value.trim() || null;
  const description = document.getElementById("service-description")?.value.trim() || null;
  const price = Number(document.getElementById("service-price")?.value || 0);
  const priceToRaw = document.getElementById("service-price-to")?.value;
  const priceTo = priceToRaw === "" || priceToRaw === undefined ? null : Number(priceToRaw);
  const currency = window.App.normalizeCurrency(document.getElementById("service-currency")?.value || "RSD");
  const duration = Number(document.getElementById("service-duration")?.value || 0);
  if (!name || price < 0 || (priceTo !== null && priceTo < 0) || duration <= 0) return window.App.showMessage("Unesite naziv usluge, cenu, valutu i trajanje.", "error");
  if (priceTo !== null && priceTo > 0 && priceTo < price) return window.App.showMessage("Cena do ne može biti manja od cene od.", "error");
  if (id) {
    const { error } = await saveServicePayload("update", { id, name, category, description, price, price_to: priceTo, currency, duration_minutes: duration });
    if (error) return window.App.showMessage("Greška pri izmeni usluge: " + error.message, "error");
  } else {
    const { data: maxOrder } = await window.db.from("services").select("sort_order").eq("salon_id", currentSalonId).order("sort_order", { ascending: false }).limit(1);
    const newOrder = maxOrder?.length ? Number(maxOrder[0].sort_order || 0) + 1 : 1;
    const { error } = await saveServicePayload("insert", { salon_id: currentSalonId, name, category, description, price, price_to: priceTo, currency, duration_minutes: duration, active: true, sort_order: newOrder });
    if (error) return window.App.showMessage("Greška pri dodavanju usluge: " + error.message, "error");
  }
  hideAddServiceForm();
  await loadServices();
}


async function saveServicePayload(mode, payload) {
  const sendPayload = { ...payload };
  const id = sendPayload.id;
  delete sendPayload.id;
  let result;
  if (mode === "update") {
    result = await window.db.from("services").update(sendPayload).eq("id", id).eq("salon_id", currentSalonId);
  } else {
    result = await window.db.from("services").insert(sendPayload);
  }
  if (!result.error) return result;

  const msg = String(result.error.message || "").toLowerCase();
  if (msg.includes("category") || msg.includes("description") || msg.includes("schema cache")) {
    const fallback = { ...sendPayload };
    delete fallback.category;
    delete fallback.description;
    const retry = mode === "update"
      ? await window.db.from("services").update(fallback).eq("id", id).eq("salon_id", currentSalonId)
      : await window.db.from("services").insert(fallback);
    if (!retry.error) {
      window.App.showMessage("Usluga je sačuvana. Pokrenite SQL za category/description da bi se opis i kategorija trajno čuvali.", "info");
    }
    return retry;
  }
  return result;
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

async function renderProducts() {
  const content = document.getElementById("salon-content");
  content.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Proizvodi / katalog</h2>
        <p class="muted">Dodajte proizvode, artikle, cenovnik ili ponudu koju korisnici vide na javnom QR profilu.</p>
      </div>
      ${adminOwnerPreviewMode ? `<span class="status-pill">Samo pregled</span>` : `<button class="btn btn-primary" type="button" onclick="showAddProductForm()">Dodaj proizvod</button>`}
    </div>
    <div class="warning-box soft-warning">
      Proizvodi su javni katalog/cenovnik. Za sada ne šalju notifikaciju. Notifikacija ostaje vezana za zakazivanje termina, da se vlasnik ne zatrpava nepotrebnim signalima.
    </div>
    <div id="product-form-box"></div>
    <div id="products-list" class="cards"><div class="loading-box">Učitavanje proizvoda...</div></div>
  `;
  await loadProducts();
}

function productPriceLabel(product = {}) {
  const price = Number(product.price || 0);
  const currency = window.App.normalizeCurrency(product.currency || "RSD");
  if (!price || price <= 0) return "Cena po dogovoru";
  return `${window.App.formatMoney ? window.App.formatMoney(price) : price.toLocaleString("sr-RS")} ${currency}`;
}

function productStatusLabel(status) {
  return {
    available: "Na stanju",
    preorder: "Po porudžbini",
    out: "Trenutno nema"
  }[status] || "Na upit";
}

async function loadProducts() {
  const list = document.getElementById("products-list");
  if (!list) return;
  const { data: products, error } = await window.db
    .from("products")
    .select("*")
    .eq("salon_id", currentSalonId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    list.innerHTML = `
      <div class="card">
        <h3>Proizvodi nisu spremni u bazi</h3>
        <p class="muted">Treba prvo pokrenuti SQL za tabelu <strong>products</strong> u Supabase-u. Kod za SQL dobijaš uz ZIP.</p>
      </div>
    `;
    return;
  }

  if (!products?.length) {
    list.innerHTML = `<div class="card center"><p class="muted">Još nemate proizvode u katalogu. Dodajte prvi proizvod, artikal ili cenu iz ponude.</p></div>`;
    return;
  }

  list.innerHTML = products.map(product => `
    <div class="card product-card ${product.active ? "" : "muted-card"}">
      <div class="product-card-main">
        ${product.image_url ? `<img class="product-thumb" src="${salonEscapeHtml(product.image_url)}" alt="${salonEscapeHtml(product.name)}">` : `<div class="product-thumb product-thumb-empty">Bez slike</div>`}
        <div class="product-card-text">
          <strong>${salonEscapeHtml(product.name)}</strong>
          ${product.category ? `<span>${salonEscapeHtml(product.category)}</span>` : ""}
          ${product.description ? `<p class="muted">${salonEscapeHtml(product.description)}</p>` : ""}
        </div>
        <div class="product-price-box">
          <b>${productPriceLabel(product)}</b>
          <small>${productStatusLabel(product.stock_status)}</small>
          <small>${product.active ? "Javno prikazan" : "Sakriven"}</small>
        </div>
      </div>
      ${adminOwnerPreviewMode ? `<div class="card-actions"><span class="status-pill">Admin pregled</span></div>` : `<div class="card-actions">
        <button class="btn btn-dark" type="button" onclick="editProduct('${product.id}')">Uredi</button>
        <button class="btn btn-dark" type="button" onclick="toggleProductActive('${product.id}', ${product.active ? "true" : "false"})">${product.active ? "Sakrij" : "Aktiviraj"}</button>
        <button class="btn btn-danger" type="button" onclick="deleteProduct('${product.id}')">Obriši</button>
      </div>`}
    </div>
  `).join("");
}

async function showAddProductForm(productId = null) {
  if (stopAdminOwnerPreviewEdit()) return;
  const box = document.getElementById("product-form-box");
  let product = null;
  if (productId) {
    const { data } = await window.db.from("products").select("*").eq("id", productId).eq("salon_id", currentSalonId).maybeSingle();
    product = data;
  }
  box.innerHTML = `
    <div class="card product-edit-card">
      <h3>${product ? "Uredi proizvod" : "Novi proizvod"}</h3>
      <input id="product-edit-id" type="hidden" value="${product ? salonEscapeHtml(product.id) : ""}">
      <label>Naziv proizvoda / artikla</label>
      <input id="product-name" type="text" value="${product ? salonEscapeHtml(product.name) : ""}" placeholder="Michelin 205/55 R16">
      <label>Kategorija</label>
      <input id="product-category" type="text" value="${product ? salonEscapeHtml(product.category || "") : ""}" placeholder="Gume, kozmetika, auto delovi...">
      <label>Opis</label>
      <textarea id="product-description" rows="3" placeholder="Kratak opis, dimenzija, napomena ili šta korisnik treba da zna.">${product ? salonEscapeHtml(product.description || "") : ""}</textarea>
      <input id="product-current-image" type="hidden" value="${product ? salonEscapeHtml(product.image_url || "") : ""}">
      ${product?.image_url ? `<div class="product-image-preview"><img src="${salonEscapeHtml(product.image_url)}" alt="Slika proizvoda"><small>Trenutna slika proizvoda</small></div>` : ""}
      <label>Slika proizvoda</label>
      <input id="product-image-file" type="file" accept="image/png,image/jpeg,image/webp">
      <p class="muted small-note">Slika se automatski smanjuje pre slanja da ne troši prostor i da se brže otvara na telefonu.</p>
      <div class="price-grid">
        <div>
          <label>Cena</label>
          <input id="product-price" type="number" min="0" step="0.01" value="${product ? Number(product.price || 0) : ""}" placeholder="9500">
        </div>
        <div>
          <label>Valuta</label>
          <select id="product-currency">
            <option value="RSD" ${!product || (product.currency || "RSD") === "RSD" ? "selected" : ""}>Dinari (RSD)</option>
            <option value="EUR" ${product && product.currency === "EUR" ? "selected" : ""}>Evri (EUR)</option>
          </select>
        </div>
      </div>
      <label>Status</label>
      <select id="product-stock-status">
        <option value="available" ${!product || product.stock_status === "available" ? "selected" : ""}>Na stanju</option>
        <option value="preorder" ${product && product.stock_status === "preorder" ? "selected" : ""}>Po porudžbini</option>
        <option value="out" ${product && product.stock_status === "out" ? "selected" : ""}>Trenutno nema</option>
      </select>
      <label>Redosled prikaza</label>
      <input id="product-sort-order" type="number" value="${product ? Number(product.sort_order || 100) : 100}">
      <div class="card-actions">
        <button class="btn btn-primary" type="button" onclick="saveProduct()">Sačuvaj proizvod</button>
        <button class="btn btn-dark" type="button" onclick="hideProductForm()">Otkaži</button>
      </div>
    </div>`;
}

function hideProductForm() { const box = document.getElementById("product-form-box"); if (box) box.innerHTML = ""; }
async function editProduct(id) { await showAddProductForm(id); }

async function saveProduct() {
  if (stopAdminOwnerPreviewEdit()) return;
  const id = document.getElementById("product-edit-id")?.value || "";
  const name = document.getElementById("product-name")?.value.trim();
  const category = document.getElementById("product-category")?.value.trim() || null;
  const description = document.getElementById("product-description")?.value.trim() || null;
  const price = Number(document.getElementById("product-price")?.value || 0);
  const currency = window.App.normalizeCurrency(document.getElementById("product-currency")?.value || "RSD");
  const stock_status = document.getElementById("product-stock-status")?.value || "available";
  const sort_order = Number(document.getElementById("product-sort-order")?.value || 100);
  const existingImageUrl = document.getElementById("product-current-image")?.value || null;
  const imageFile = document.getElementById("product-image-file")?.files?.[0] || null;

  if (!name) return window.App.showMessage("Unesite naziv proizvoda.", "error");
  if (price < 0) return window.App.showMessage("Cena ne može biti negativna.", "error");

  let image_url = existingImageUrl;
  if (imageFile) {
    image_url = await window.StorageHelper.uploadImage(imageFile, currentSalonId, "product");
    if (!image_url) return;
  }

  const payload = { name, category, description, price, currency, stock_status, sort_order, image_url, updated_at: new Date().toISOString() };
  const result = await saveProductPayload(id ? "update" : "insert", id, payload);
  if (result.error) {
    return window.App.showMessage("Greška pri čuvanju proizvoda. Proverite da li je SQL za products tabelu pokrenut.", "error");
  }
  hideProductForm();
  await loadProducts();
  window.App.showMessage("Proizvod je sačuvan u katalogu.", "success");
}

async function saveProductPayload(mode, id, payload) {
  let result;
  if (mode === "update") {
    result = await window.db.from("products").update(payload).eq("id", id).eq("salon_id", currentSalonId);
  } else {
    result = await window.db.from("products").insert({ ...payload, salon_id: currentSalonId, active: true });
  }
  if (!result.error) return result;

  const msg = String(result.error.message || "").toLowerCase();
  if (msg.includes("image_url") || msg.includes("schema cache")) {
    const fallback = { ...payload };
    delete fallback.image_url;
    const retry = mode === "update"
      ? await window.db.from("products").update(fallback).eq("id", id).eq("salon_id", currentSalonId)
      : await window.db.from("products").insert({ ...fallback, salon_id: currentSalonId, active: true });
    if (!retry.error) {
      window.App.showMessage("Proizvod je sačuvan, ali Supabase još nema kolonu image_url. Pokrenite SQL iz poruke da bi slike proizvoda radile.", "info");
    }
    return retry;
  }
  return result;
}

async function toggleProductActive(id, currentActive) {
  if (stopAdminOwnerPreviewEdit()) return;
  const { error } = await window.db.from("products").update({ active: !currentActive, updated_at: new Date().toISOString() }).eq("id", id).eq("salon_id", currentSalonId);
  if (error) return window.App.showMessage("Greška pri promeni statusa proizvoda.", "error");
  await loadProducts();
}

async function deleteProduct(id) {
  if (stopAdminOwnerPreviewEdit()) return;
  if (!confirm("Obrisati proizvod iz kataloga? Ako ga samo trenutno nemate, bolje ga sakrijte.")) return;
  const { error } = await window.db.from("products").delete().eq("id", id).eq("salon_id", currentSalonId);
  if (error) return window.App.showMessage("Greška pri brisanju proizvoda.", "error");
  await loadProducts();
}


function garageStatusLabel(status) {
  return {
    available: "Dostupno",
    reserved: "Rezervisano",
    sold: "Prodato",
    hidden: "Sakriveno"
  }[status] || "Dostupno";
}

function garageTypeLabel(type) {
  return {
    car: "Automobil",
    van: "Kombi",
    truck: "Kamion",
    excavator: "Bager",
    machine: "Mašina",
    tractor: "Traktor",
    equipment: "Oprema",
    other: "Ostalo"
  }[type] || "Oglas";
}

function garagePriceLabel(item = {}) {
  const price = Number(item.price || 0);
  const currency = window.App.normalizeCurrency(item.currency || "EUR");
  if (!price || price <= 0) return "Cena na upit";
  return `${window.App.formatMoney ? window.App.formatMoney(price) : price.toLocaleString("sr-RS")} ${currency}`;
}

async function renderGarage() {
  const content = document.getElementById("salon-content");
  if (!ownerHasGaragePackage()) {
    content.innerHTML = `<div class="card warning-box"><h2>Garaža nije uključena</h2><p class="muted">Ovaj profil nema aktivan Garaža paket. Admin može uključiti Garaža Start, Plus, PRO, MAX ili Custom.</p></div>`;
    return;
  }
  const maxListings = getGarageListingLimit();
  const maxImages = getGarageImageLimit();
  content.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Garaža / oglasi</h2>
        <p class="muted">${garagePackageLabel()} • limit: ${maxListings === 999999 ? "po dogovoru" : maxListings} oglasa • do ${maxImages} slika po oglasu.</p>
      </div>
      ${adminOwnerPreviewMode ? "" : `<button class="btn btn-primary" type="button" onclick="showGarageForm()">Dodaj oglas</button>`}
    </div>
    <div class="card analytics-help-card">
      <h3>Pravila Garaže</h3>
      <p class="muted">Oglasi se mogu izmeniti, sakriti, označiti kao prodati/rezervisani ili trajno obrisati. Trajno brisanje oglasa briše i sve njegove slike iz Storage-a.</p>
    </div>
    <div id="garage-form-box"></div>
    <div id="garage-list" class="cards"><div class="loading-box">Učitavanje oglasa...</div></div>
  `;
  await loadGarageListings();
}

async function loadGarageListings() {
  const list = document.getElementById("garage-list");
  if (!list) return;
  const { data: listings, error } = await window.db
    .from("garage_listings")
    .select("*, garage_listing_images(*)")
    .eq("salon_id", currentSalonId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    list.innerHTML = `
      <div class="card warning-box">
        <h3>Garaža nije spremna u bazi</h3>
        <p class="muted">Treba prvo pokrenuti SQL za tabele <strong>garage_listings</strong> i <strong>garage_listing_images</strong>.</p>
      </div>`;
    return;
  }

  if (!listings?.length) {
    list.innerHTML = `<div class="card center"><p class="muted">Još nema oglasa u Garaži. Dodajte prvi automobil, bager, mašinu ili opremu.</p></div>`;
    return;
  }

  list.innerHTML = listings.map(item => {
    const images = (item.garage_listing_images || []).sort((a,b) => Number(a.sort_order||100) - Number(b.sort_order||100));
    const cover = images[0]?.image_url || "";
    return `
      <div class="card garage-owner-card ${item.status === 'sold' ? 'is-muted' : ''}">
        <div class="garage-owner-layout">
          <div class="garage-cover-box">
            ${cover ? `<img src="${salonEscapeHtml(cover)}" alt="${salonEscapeHtml(item.title)}">` : `<div class="garage-cover-placeholder">Bez slike</div>`}
          </div>
          <div>
            <h3>${salonEscapeHtml(item.title)}</h3>
            <p class="muted">${garageTypeLabel(item.listing_type)} • ${garageStatusLabel(item.status)} • ${images.length}/10 slika</p>
            <p><strong>${garagePriceLabel(item)}</strong></p>
            <p class="muted">${[item.brand, item.model, item.year ? String(item.year) : "", item.hours_km ? String(item.hours_km) : ""].filter(Boolean).map(salonEscapeHtml).join(" • ")}</p>
            ${item.description ? `<p>${salonEscapeHtml(item.description)}</p>` : ""}
            <div class="card-actions wrap-actions">
              ${adminOwnerPreviewMode ? "" : `
                <button class="btn btn-dark btn-small" type="button" onclick="showGarageForm('${salonEscapeJs(item.id)}')">Izmeni</button>
                <button class="btn btn-dark btn-small" type="button" onclick="showGarageImages('${salonEscapeJs(item.id)}')">Slike ${images.length}/${getGarageImageLimit()}</button>
                <button class="btn btn-dark btn-small" type="button" onclick="setGarageStatus('${salonEscapeJs(item.id)}','${item.status === 'hidden' ? 'available' : 'hidden'}')">${item.status === 'hidden' ? 'Prikaži' : 'Sakrij'}</button>
                <button class="btn btn-dark btn-small" type="button" onclick="setGarageStatus('${salonEscapeJs(item.id)}','reserved')">Rezervisano</button>
                <button class="btn btn-dark btn-small" type="button" onclick="setGarageStatus('${salonEscapeJs(item.id)}','sold')">Prodato</button>
                <button class="btn btn-danger btn-small" type="button" onclick="deleteGarageListing('${salonEscapeJs(item.id)}')">Obriši trajno</button>
              `}
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
}

async function showGarageForm(listingId = "") {
  if (stopAdminOwnerPreviewEdit()) return;
  if (!ownerHasGaragePackage()) return window.App.showMessage("Garaža nije uključena za ovaj profil.", "error");
  if (!listingId) {
    const limit = getGarageListingLimit();
    if (limit && limit !== 999999) {
      const { count } = await window.db.from("garage_listings").select("id", { count: "exact", head: true }).eq("salon_id", currentSalonId);
      if (Number(count || 0) >= limit) return window.App.showMessage(`Dostigli ste limit paketa ${garagePackageLabel()}: ${limit} oglasa. Obrišite stari oglas ili pređite na veći paket.`, "error");
    }
  }
  const box = document.getElementById("garage-form-box");
  if (!box) return;
  let item = null;
  if (listingId) {
    const { data, error } = await window.db.from("garage_listings").select("*").eq("id", listingId).eq("salon_id", currentSalonId).maybeSingle();
    if (error || !data) return window.App.showMessage("Oglas nije pronađen.", "error");
    item = data;
  }
  box.innerHTML = `
    <div class="card">
      <h3>${item ? "Izmeni oglas" : "Dodaj oglas u Garažu"}</h3>
      <div class="form-grid two-cols">
        <label>Naslov oglasa *<input id="garage-title" type="text" value="${salonEscapeHtml(item?.title || '')}" placeholder="Audi A4 2016 / CAT 330"></label>
        <label>Tip ponude
          <select id="garage-type">
            ${[
              ['car','Automobil'],['van','Kombi'],['truck','Kamion'],['excavator','Bager'],['machine','Mašina'],['tractor','Traktor'],['equipment','Oprema'],['other','Ostalo']
            ].map(([v,l]) => `<option value="${v}" ${item?.listing_type===v?'selected':''}>${l}</option>`).join("")}
          </select>
        </label>
        <label>Marka<input id="garage-brand" type="text" value="${salonEscapeHtml(item?.brand || '')}" placeholder="Audi / CAT / Mercedes"></label>
        <label>Model<input id="garage-model" type="text" value="${salonEscapeHtml(item?.model || '')}" placeholder="A4 / 330 / Actros"></label>
        <label>Godina<input id="garage-year" type="number" value="${salonEscapeHtml(item?.year || '')}" placeholder="2016"></label>
        <label>Kilometraža / motočasovi<input id="garage-hours-km" type="text" value="${salonEscapeHtml(item?.hours_km || '')}" placeholder="210.000 km / 9.800 mč"></label>
        <label>Cena<input id="garage-price" type="number" step="0.01" value="${salonEscapeHtml(item?.price || '')}" placeholder="8900"></label>
        <label>Valuta
          <select id="garage-currency">
            <option value="EUR" ${window.App.normalizeCurrency(item?.currency || 'EUR')==='EUR'?'selected':''}>EUR</option>
            <option value="RSD" ${window.App.normalizeCurrency(item?.currency || 'EUR')==='RSD'?'selected':''}>RSD</option>
          </select>
        </label>
        <label>Status
          <select id="garage-status">
            ${[
              ['available','Dostupno'],['reserved','Rezervisano'],['sold','Prodato'],['hidden','Sakriveno']
            ].map(([v,l]) => `<option value="${v}" ${item?.status===v?'selected':''}>${l}</option>`).join("")}
          </select>
        </label>
        <label>Redosled<input id="garage-sort" type="number" value="${salonEscapeHtml(item?.sort_order ?? 100)}"></label>
      </div>
      <label>Opis oglasa<textarea id="garage-description" rows="4" placeholder="Opis stanja, opreme, napomena...">${salonEscapeHtml(item?.description || '')}</textarea></label>
      <div class="card mini-card garage-help-box">
        <strong>Slike oglasa</strong>
        <p class="muted">Prvo sačuvajte oglas, zatim na kartici oglasa kliknite <strong>Slike 0/${getGarageImageLimit()}</strong> za dodavanje do ${getGarageImageLimit()} fotografija. Svaka slika se može trajno obrisati.</p>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" type="button" onclick="saveGarageListing('${salonEscapeJs(listingId)}')">Sačuvaj oglas</button>
        <button class="btn btn-dark" type="button" onclick="document.getElementById('garage-form-box').innerHTML=''">Otkaži</button>
      </div>
    </div>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveGarageListing(id = "") {
  if (stopAdminOwnerPreviewEdit()) return;
  const title = document.getElementById("garage-title")?.value.trim();
  if (!title) return window.App.showMessage("Unesite naslov oglasa.", "error");
  const yearRaw = document.getElementById("garage-year")?.value;
  const priceRaw = document.getElementById("garage-price")?.value;
  const payload = {
    title,
    listing_type: document.getElementById("garage-type")?.value || "other",
    brand: document.getElementById("garage-brand")?.value.trim() || null,
    model: document.getElementById("garage-model")?.value.trim() || null,
    year: yearRaw ? Number(yearRaw) : null,
    hours_km: document.getElementById("garage-hours-km")?.value.trim() || null,
    price: priceRaw ? Number(priceRaw) : null,
    currency: document.getElementById("garage-currency")?.value || "EUR",
    status: document.getElementById("garage-status")?.value || "available",
    description: document.getElementById("garage-description")?.value.trim() || null,
    sort_order: Number(document.getElementById("garage-sort")?.value || 100),
    updated_at: new Date().toISOString()
  };
  let result;
  if (id) {
    result = await window.db.from("garage_listings").update(payload).eq("id", id).eq("salon_id", currentSalonId);
  } else {
    result = await window.db.from("garage_listings").insert({ ...payload, salon_id: currentSalonId });
  }
  if (result.error) return window.App.showMessage("Greška pri čuvanju oglasa. Proverite SQL za Garažu.", "error");
  document.getElementById("garage-form-box").innerHTML = "";
  window.App.showMessage("Oglas je sačuvan.", "success");
  await loadGarageListings();
}

async function showGarageImages(listingId) {
  if (stopAdminOwnerPreviewEdit()) return;
  const box = document.getElementById("garage-form-box");
  const { data: listing } = await window.db.from("garage_listings").select("*").eq("id", listingId).eq("salon_id", currentSalonId).maybeSingle();
  const { data: images, error } = await window.db.from("garage_listing_images").select("*").eq("listing_id", listingId).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) return window.App.showMessage("Slike Garaže nisu dostupne. Proverite SQL.", "error");
  const imgRows = images || [];
  box.innerHTML = `
    <div class="card">
      <h3>Slike oglasa: ${salonEscapeHtml(listing?.title || '')}</h3>
      <p class="muted">${imgRows.length}/${getGarageImageLimit()} slika. Svaka slika se može trajno obrisati iz baze i Storage-a.</p>
      ${imgRows.length < getGarageImageLimit() ? `
        <div class="form-grid two-cols">
          <label>Dodaj sliku<input id="garage-image-file" type="file" accept="image/png,image/jpeg,image/webp"></label>
          <label>Redosled<input id="garage-image-sort" type="number" value="${(imgRows.length + 1) * 10}"></label>
        </div>
        <button class="btn btn-primary" type="button" onclick="uploadGarageImage('${salonEscapeJs(listingId)}')">Upload slike</button>
      ` : `<p class="warning-text">Dostignut je limit od ${getGarageImageLimit()} slika za ovaj oglas.</p>`}
      <div class="garage-image-grid owner-gallery-grid">
        ${imgRows.map(img => `
          <div class="owner-gallery-card">
            <img src="${salonEscapeHtml(img.image_url)}" alt="Slika oglasa">
            <p class="muted">Redosled: ${Number(img.sort_order || 100)}</p>
            <button class="btn btn-danger btn-small" type="button" onclick="deleteGarageImage('${salonEscapeJs(img.id)}','${salonEscapeJs(listingId)}','${salonEscapeJs(img.image_url)}')">Obriši sliku trajno</button>
          </div>`).join("")}
      </div>
      <div class="form-actions"><button class="btn btn-dark" type="button" onclick="document.getElementById('garage-form-box').innerHTML=''">Zatvori</button></div>
    </div>`;
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function uploadGarageImage(listingId) {
  if (stopAdminOwnerPreviewEdit()) return;
  const { count } = await window.db.from("garage_listing_images").select("id", { count: "exact", head: true }).eq("listing_id", listingId);
  const imageLimit = getGarageImageLimit();
  if (Number(count || 0) >= imageLimit) return window.App.showMessage(`Jedan oglas može imati najviše ${imageLimit} slika.`, "error");
  const file = document.getElementById("garage-image-file")?.files?.[0];
  if (!file) return window.App.showMessage("Izaberite sliku.", "error");
  const url = await window.StorageHelper.uploadImage(file, currentSalonId, "garage");
  if (!url) return;
  const sortOrder = Number(document.getElementById("garage-image-sort")?.value || 100);
  const { error } = await window.db.from("garage_listing_images").insert({ listing_id: listingId, image_url: url, sort_order: sortOrder });
  if (error) {
    await window.StorageHelper.deleteImage(url);
    return window.App.showMessage("Slika nije sačuvana u bazu. Proverite SQL za Garažu.", "error");
  }
  window.App.showMessage("Slika je dodata.", "success");
  await showGarageImages(listingId);
  await loadGarageListings();
}

async function deleteGarageImage(imageId, listingId, imageUrl) {
  if (stopAdminOwnerPreviewEdit()) return;
  if (!confirm("Trajno obrisati ovu sliku? Biće obrisana iz baze i Storage-a.")) return;
  await window.StorageHelper.deleteImage(imageUrl);
  const { error } = await window.db.from("garage_listing_images").delete().eq("id", imageId);
  if (error) return window.App.showMessage("Greška pri brisanju slike iz baze.", "error");
  window.App.showMessage("Slika je trajno obrisana.", "success");
  await showGarageImages(listingId);
  await loadGarageListings();
}

async function setGarageStatus(id, status) {
  if (stopAdminOwnerPreviewEdit()) return;
  const { error } = await window.db.from("garage_listings").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("salon_id", currentSalonId);
  if (error) return window.App.showMessage("Greška pri promeni statusa oglasa.", "error");
  await loadGarageListings();
}

async function deleteGarageListing(id) {
  if (stopAdminOwnerPreviewEdit()) return;
  if (!confirm("Trajno obrisati oglas i sve njegove slike? Ova radnja ne može da se vrati.")) return;
  const { data: images } = await window.db.from("garage_listing_images").select("image_url").eq("listing_id", id);
  for (const img of (images || [])) {
    await window.StorageHelper.deleteImage(img.image_url);
  }
  await window.db.from("garage_listing_images").delete().eq("listing_id", id);
  const { error } = await window.db.from("garage_listings").delete().eq("id", id).eq("salon_id", currentSalonId);
  if (error) return window.App.showMessage("Greška pri brisanju oglasa.", "error");
  window.App.showMessage("Oglas i slike su trajno obrisani.", "success");
  await loadGarageListings();
}

async function renderGallery() {
  const content = document.getElementById("salon-content");
  content.innerHTML = `
    <div class="section-head">
      <div>
        <h2>Galerija radova</h2>
        <p class="muted">Dodajte do 10 slika radova. Slike se prikazuju na javnom QR profilu.</p>
      </div>
      ${adminOwnerPreviewMode ? "" : `<button class="btn btn-primary" type="button" onclick="showGalleryUploadForm()">Dodaj sliku</button>`}
    </div>
    <div id="gallery-form-box"></div>
    <div id="gallery-list" class="cards"><div class="loading-box">Učitavanje galerije...</div></div>
  `;
  await loadGallery();
}

async function loadGallery() {
  const list = document.getElementById("gallery-list");
  const { data: images, error } = await window.db
    .from("home_images")
    .select("*")
    .eq("salon_id", currentSalonId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `<div class="card"><p class="error-text">Galerija nije dostupna. Proverite da li postoji tabela home_images i Storage bucket salon-assets.</p></div>`;
    return;
  }

  const items = images || [];
  if (!items.length) {
    list.innerHTML = `<div class="card center"><p class="muted">Još nema slika u galeriji. Dodajte slike završenih radova, pre/posle fotografije ili primer usluge.</p></div>`;
    return;
  }

  list.innerHTML = `<div class="owner-gallery-grid">${items.map(image => `
    <div class="card owner-gallery-card ${image.active ? "" : "muted-card"}">
      <img src="${salonEscapeHtml(image.image_url)}" alt="Galerija radova">
      ${image.caption ? `<p>${salonEscapeHtml(image.caption)}</p>` : `<p class="muted">Bez opisa</p>`}
      <small>Redosled: ${Number(image.sort_order || 100)} • ${image.active ? "Javno" : "Sakriveno"}</small>
      ${adminOwnerPreviewMode ? `<div class="card-actions"><span class="status-pill">Admin pregled</span></div>` : `<div class="card-actions">
        <button class="btn btn-dark" type="button" onclick="toggleGalleryImage('${image.id}', ${image.active ? "true" : "false"})">${image.active ? "Sakrij" : "Prikaži"}</button>
        <button class="btn btn-danger" type="button" onclick="deleteGalleryImage('${image.id}', '${salonEscapeJs(image.image_url)}')">Obriši trajno</button>
      </div>`}
    </div>
  `).join("")}</div>`;
}

async function showGalleryUploadForm() {
  if (stopAdminOwnerPreviewEdit()) return;
  const { count, error } = await window.db.from("home_images").select("id", { count: "exact", head: true }).eq("salon_id", currentSalonId);
  if (!error && Number(count || 0) >= 10) {
    return window.App.showMessage("Maksimalno je 10 slika u galeriji. Prvo obrišite neku staru sliku.", "error");
  }
  const box = document.getElementById("gallery-form-box");
  box.innerHTML = `
    <div class="card gallery-upload-card">
      <h3>Dodaj sliku u galeriju</h3>
      <p class="muted">Dozvoljeno: JPG, PNG, WEBP, maksimalno 5 MB.</p>
      <input id="gallery-file" type="file" accept="image/png,image/jpeg,image/webp">
      <label>Opis slike</label>
      <input id="gallery-caption" type="text" placeholder="npr. kupatilo posle renoviranja, servis klime...">
      <label>Redosled</label>
      <input id="gallery-sort-order" type="number" value="100">
      <div class="card-actions">
        <button class="btn btn-primary" type="button" onclick="uploadGalleryImage()">Sačuvaj sliku</button>
        <button class="btn btn-dark" type="button" onclick="document.getElementById('gallery-form-box').innerHTML=''">Otkaži</button>
      </div>
    </div>`;
}

async function uploadGalleryImage() {
  if (stopAdminOwnerPreviewEdit()) return;
  const file = document.getElementById("gallery-file")?.files?.[0];
  if (!file) return window.App.showMessage("Izaberite sliku.", "error");
  const { count } = await window.db.from("home_images").select("id", { count: "exact", head: true }).eq("salon_id", currentSalonId);
  if (Number(count || 0) >= 10) return window.App.showMessage("Maksimalno je 10 slika u galeriji.", "error");
  const url = await window.StorageHelper.uploadImage(file, currentSalonId, "gallery");
  if (!url) return;
  const caption = document.getElementById("gallery-caption")?.value.trim() || null;
  const sort_order = Number(document.getElementById("gallery-sort-order")?.value || 100);
  const { error } = await window.db.from("home_images").insert({ salon_id: currentSalonId, image_url: url, caption, sort_order, active: true });
  if (error) {
    await window.StorageHelper.deleteImage(url);
    return window.App.showMessage("Slika nije sačuvana u bazu. Proverite SQL za home_images.", "error");
  }
  document.getElementById("gallery-form-box").innerHTML = "";
  window.App.showMessage("Slika je dodata u galeriju.", "success");
  await loadGallery();
}

async function toggleGalleryImage(id, currentActive) {
  if (stopAdminOwnerPreviewEdit()) return;
  await window.db.from("home_images").update({ active: !currentActive }).eq("id", id).eq("salon_id", currentSalonId);
  await loadGallery();
}

async function deleteGalleryImage(id, imageUrl) {
  if (stopAdminOwnerPreviewEdit()) return;
  if (!confirm("Obrisati sliku trajno iz galerije i Storage-a?")) return;
  await window.StorageHelper.deleteImage(imageUrl);
  const { error } = await window.db.from("home_images").delete().eq("id", id).eq("salon_id", currentSalonId);
  if (error) return window.App.showMessage("Greška pri brisanju slike iz baze.", "error");
  window.App.showMessage("Slika je trajno obrisana.", "success");
  await loadGallery();
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
