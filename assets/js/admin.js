// assets/js/admin.js


function adminEscapeHtml(value) {
  return window.App?.escapeHtml ? window.App.escapeHtml(value) : String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function adminEscapeJs(value) {
  return window.App?.escapeJs ? window.App.escapeJs(value) : String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

const ADMIN_THEME_OPTIONS = [
  { value: "classic-red", label: "Classic Red", icon: "🔴", hint: "standardna CityStyle crvena" },
  { value: "ocean-blue", label: "Ocean Blue", icon: "🔵", hint: "servisi, firme, tehnika" },
  { value: "luxury-gold", label: "Luxury Gold", icon: "🟡", hint: "premium i luxury izgled" },
  { value: "emerald-green", label: "Emerald Green", icon: "🟢", hint: "zdravlje, priroda, usluge" },
  { value: "royal-purple", label: "Royal Purple", icon: "🟣", hint: "beauty, studio, nokti" },
  { value: "soft-pink", label: "Soft Pink", icon: "🌸", hint: "saloni i kozmetika" },
  { value: "graphite-dark", label: "Graphite Dark", icon: "⚫", hint: "majstori, auto-servisi" },
  { value: "orange-pro", label: "Orange Pro", icon: "🟠", hint: "radovi, servis, dostava" }
];



const ADMIN_BUSINESS_TYPE_OPTIONS = [
  { value: "general", label: "Opšti biznis", icon: "🏢", hint: "zahtevi, termini i ponuda" },
  { value: "salon", label: "Salon / termini", icon: "💇", hint: "frizer, beauty, nokti, masaža" },
  { value: "repair", label: "Majstor / kvarovi", icon: "🛠️", hint: "grejanje, hlađenje, voda, struja" },
  { value: "craft", label: "Zanatlija / radovi", icon: "🧱", hint: "keramičar, moler, stolar, gipsar" },
  { value: "auto", label: "Auto servis", icon: "🚗", hint: "mehaničar, vulkanizer, auto-klima" },
  { value: "catalog", label: "Katalog / proizvodi", icon: "🛒", hint: "prodaja, proizvodi, oprema" }
];

function getAdminBusinessTypeOption(value) {
  const normalized = String(value || "general").trim().toLowerCase();
  return ADMIN_BUSINESS_TYPE_OPTIONS.find(item => item.value === normalized) || ADMIN_BUSINESS_TYPE_OPTIONS[0];
}

function renderBusinessTypeBadge(value) {
  const type = getAdminBusinessTypeOption(value);
  return `<span class="business-type-badge">${type.icon} ${adminEscapeHtml(type.label)}</span>`;
}

function promptBusinessType(currentValue = "general") {
  const current = getAdminBusinessTypeOption(currentValue).value;
  const optionsText = ADMIN_BUSINESS_TYPE_OPTIONS.map(item => `${item.value} = ${item.label}`).join("\n");
  const input = prompt(`Vrsta profila:\n${optionsText}`, current);
  if (input === null) return null;
  return getAdminBusinessTypeOption(input).value;
}

function renderBusinessTypeOptions(selectedValue = "general") {
  const selected = getAdminBusinessTypeOption(selectedValue).value;
  return ADMIN_BUSINESS_TYPE_OPTIONS.map(item => `
    <option value="${adminEscapeHtml(item.value)}" ${item.value === selected ? "selected" : ""}>${item.icon} ${adminEscapeHtml(item.label)} — ${adminEscapeHtml(item.hint)}</option>
  `).join("");
}

function closeAdminBusinessModal() {
  const modal = document.getElementById("admin-business-modal");
  if (modal) modal.remove();
}

function getAdminFormValue(id) {
  return String(document.getElementById(id)?.value || "").trim();
}

async function insertSalonWithBusinessType(payload) {
  const { data, error } = await window.db.from("salons").insert(payload).select().single();
  if (!error) return { data, error: null };
  const msg = String(error.message || "").toLowerCase();
  if (msg.includes("business_type") || msg.includes("schema cache")) {
    const fallback = { ...payload };
    delete fallback.business_type;
    const retry = await window.db.from("salons").insert(fallback).select().single();
    if (!retry.error) {
      window.App.showMessage("Profil je dodat. Pokrenite SQL za business_type da bi se vrsta profila trajno čuvala.", "info");
    }
    return retry;
  }
  return { data: null, error };
}

async function updateSalonWithBusinessType(id, payload) {
  const { data, error } = await window.db.from("salons").update(payload).eq("id", id).select("*").single();
  if (!error) return { data, error: null };
  const msg = String(error.message || "").toLowerCase();
  if (msg.includes("business_type") || msg.includes("schema cache")) {
    const fallback = { ...payload };
    delete fallback.business_type;
    const retry = await window.db.from("salons").update(fallback).eq("id", id).select("*").single();
    if (!retry.error) {
      window.App.showMessage("Profil je izmenjen. Pokrenite SQL za business_type da bi se vrsta profila trajno čuvala.", "info");
    }
    return retry;
  }
  return { data: null, error };
}

const ADMIN_LANGUAGE_OPTIONS = [
  { value: "sr", label: "Srpski", icon: "🇷🇸", hint: "srpski interfejs za vlasnika i klijente" },
  { value: "en", label: "English", icon: "🇬🇧", hint: "English interface for owner and clients" },
  { value: "de", label: "Deutsch", icon: "🇩🇪", hint: "deutsche Oberfläche für Inhaber und Kunden" }
];

function getAdminLanguageOption(value) {
  const normalized = window.App?.normalizeAppLanguage ? window.App.normalizeAppLanguage(value) : String(value || "sr");
  return ADMIN_LANGUAGE_OPTIONS.find(item => item.value === normalized) || ADMIN_LANGUAGE_OPTIONS[0];
}

function renderLanguageBadge(value) {
  const lang = getAdminLanguageOption(value);
  return `<span class="language-badge">${lang.icon} ${adminEscapeHtml(lang.label)}</span>`;
}

function getAdminThemeOption(value) {
  const normalized = window.App?.normalizeSalonTheme ? window.App.normalizeSalonTheme(value) : String(value || "classic-red");
  return ADMIN_THEME_OPTIONS.find(item => item.value === normalized) || ADMIN_THEME_OPTIONS[0];
}

function renderThemeBadge(value) {
  const theme = getAdminThemeOption(value);
  return `<span class="theme-badge theme-preview-${theme.value}"><i></i>${theme.icon} ${adminEscapeHtml(theme.label)}</span>`;
}

function getAdminClientPreviewLink(slug) {
  const base = window.App.getSalonPublicLink(slug);
  return `${base}${base.includes("?") ? "&" : "?"}adminPreview=1&from=admin`;
}

function getAdminOwnerPreviewLink(salonId) {
  return `${window.App.getAppPath("salon/")}?adminPreview=1&salon_id=${encodeURIComponent(salonId)}&from=admin`;
}


let adminSalonsCache = [];
let adminSearchQuery = "";

function getAdminSearchText(salon) {
  return [
    salon.salon_name,
    salon.owner_email,
    salon.owner_phone,
    salon.phone,
    salon.company_code,
    salon.slug,
    salon.city,
    salon.business_type
  ].map(v => String(v || "").toLowerCase()).join(" ");
}

function filterAdminSalons(items) {
  const q = String(adminSearchQuery || "").trim().toLowerCase();
  if (!q) return items;
  return items.filter(salon => getAdminSearchText(salon).includes(q));
}

function handleAdminSearch(value) {
  adminSearchQuery = String(value || "");
  renderAdminSalonsView();
}

function daysUntilDate(dateString) {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString + (String(dateString).includes("T") ? "" : "T00:00:00"));
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function isPaymentExpiringSoon(paidUntil, days = 10) {
  const diff = daysUntilDate(paidUntil);
  return diff !== null && diff >= 0 && diff <= days;
}

function normalizeAdminPhoneForWhatsApp(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return digits;
  if (raw.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 8) return `381${digits.slice(1)}`;
  if (/^(381|387|385|382|389|386|49|43)\d{6,}$/.test(digits)) return digits;
  return digits.length >= 8 ? digits : "";
}

function buildRenewalSubject(salon) {
  return `Obaveštenje o isteku CityStyle.app usluge`;
}

function buildRenewalMessage(salon) {
  const name = salon?.salon_name || "vaš profil";
  const paidUntil = salon?.paid_until ? window.App.formatDate(salon.paid_until) : "uskoro";
  return `Poštovani,

Obaveštavamo vas da se period aktivacije vašeg CityStyle.app profila približava isteku.

Kako bi vaš QR profil, prijem zahteva, zakazivanja i obaveštenja nastavili da rade bez prekida, molimo vas da nam javite da li želite produženje usluge za naredni period.

Naziv profila: ${name}
Datum isteka: ${paidUntil}

Ukoliko želite produženje, dovoljno je da odgovorite na ovu poruku i potvrdite nastavak korišćenja usluge.

Srdačan pozdrav,
CityStyle.app`;
}

function sendRenewalEmail(salonId) {
  const salon = adminSalonsCache.find(item => String(item.id) === String(salonId));
  if (!salon) return window.App.showMessage("Profil nije pronađen.", "error");
  if (!salon.owner_email) return window.App.showMessage("Ovaj profil nema email vlasnika.", "error");
  const url = `mailto:${encodeURIComponent(salon.owner_email)}?subject=${encodeURIComponent(buildRenewalSubject(salon))}&body=${encodeURIComponent(buildRenewalMessage(salon))}`;
  window.location.href = url;
}

function sendRenewalWhatsApp(salonId) {
  const salon = adminSalonsCache.find(item => String(item.id) === String(salonId));
  if (!salon) return window.App.showMessage("Profil nije pronađen.", "error");
  const phone = normalizeAdminPhoneForWhatsApp(salon.owner_phone || salon.phone || "");
  if (!phone) return window.App.showMessage("Ovaj profil nema ispravan telefon vlasnika za WhatsApp.", "error");
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildRenewalMessage(salon))}`;
  window.open(url, "_blank");
}

function buildExtensionSubject(salon) {
  return `Potvrda produženja CityStyle.app usluge`;
}

function buildExtensionMessage(salon, paidUntil) {
  const name = salon?.salon_name || "vaš profil";
  const formattedDate = paidUntil ? window.App.formatDate(paidUntil) : "novog datuma";
  return `Poštovani,

Obaveštavamo vas da je vaš CityStyle.app profil uspešno produžen.

Naziv profila: ${name}
Usluga je aktivna do: ${formattedDate}

Vaš QR profil, prijem zahteva, zakazivanja i obaveštenja nastavljaju da rade bez prekida.

Hvala vam na poverenju.

Srdačan pozdrav,
CityStyle.app`;
}

function openExtensionEmail(salon, paidUntil) {
  if (!salon?.owner_email) return window.App.showMessage("Ovaj profil nema email vlasnika.", "error");
  const url = `mailto:${encodeURIComponent(salon.owner_email)}?subject=${encodeURIComponent(buildExtensionSubject(salon))}&body=${encodeURIComponent(buildExtensionMessage(salon, paidUntil))}`;
  window.location.href = url;
}

function openExtensionWhatsApp(salon, paidUntil) {
  const phone = normalizeAdminPhoneForWhatsApp(salon?.owner_phone || salon?.phone || "");
  if (!phone) return window.App.showMessage("Ovaj profil nema ispravan telefon vlasnika za WhatsApp.", "error");
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildExtensionMessage(salon, paidUntil))}`;
  window.open(url, "_blank");
}

function showExtensionNotifyModal(salon, paidUntil) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal-card extension-notify-card">
      <h2>✅ Pristup je produžen</h2>
      <p class="muted">${adminEscapeHtml(salon?.salon_name || "Biznis profil")} je produžen do <strong>${paidUntil ? window.App.formatDate(paidUntil) : "—"}</strong>.</p>
      <div class="warning-box soft-warning">Sada možeš vlasniku poslati gotovu potvrdu bez upisivanja cene. Poruka se otvara u email aplikaciji ili WhatsApp-u, a ti samo proveriš tekst i klikneš Send.</div>
      <div class="modal-actions stacked-mobile">
        <button id="extensionEmailBtn" class="btn btn-dark" type="button">📧 Email potvrda</button>
        <button id="extensionWhatsAppBtn" class="btn btn-success" type="button">💬 WhatsApp potvrda</button>
        <button class="btn btn-primary" type="button" onclick="this.closest('.modal-backdrop').remove()">Završi</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector("#extensionEmailBtn")?.addEventListener("click", () => openExtensionEmail(salon, paidUntil));
  modal.querySelector("#extensionWhatsAppBtn")?.addEventListener("click", () => openExtensionWhatsApp(salon, paidUntil));
}


document.addEventListener("DOMContentLoaded", () => loadAdminPanel());

async function loadAdminPanel() {
  const content = document.getElementById("admin-content");
  content.innerHTML = `<div class="loading-box">Provera admin pristupa...</div>`;

  const isAdmin = await window.Auth.isPlatformAdmin();
  if (!isAdmin) {
    renderAdminLogin();
    return;
  }

  renderAdminDashboard();
  await loadSalonsList();
}

function renderAdminLogin() {
  document.getElementById("admin-content").innerHTML = `
    <div class="card login-card">
      <h2>Prijava administratora</h2>
      <p class="muted">Pristup administratorskom panelu ima samo ovlašćeni nalog.</p>
      <label>Email</label>
      <input id="admin-email" type="email" placeholder="duskomacak@gmail.com">
      <label>Lozinka</label>
      <input id="admin-password" type="password" placeholder="Lozinka">
      <button class="btn btn-primary" type="button" onclick="handleAdminLogin()">Prijavi se</button>
    </div>
  `;
}

async function handleAdminLogin() {
  const email = document.getElementById("admin-email").value.trim().toLowerCase();
  const password = document.getElementById("admin-password").value.trim();
  const user = await window.Auth.adminLogin(email, password);
  if (!user) return;
  renderAdminDashboard();
  await loadSalonsList();
}

async function handleAdminLogout() {
  await window.Auth.adminLogout();
  renderAdminLogin();
}

function renderAdminDashboard() {
  document.getElementById("admin-content").innerHTML = `
    <div class="admin-toolbar">
      <div>
        <h2>Biznis profili</h2>
        <p class="muted">Upravljanje biznis profilima, statusima, uplatama i QR linkovima.</p>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-primary" type="button" onclick="showAddSalonForm()">Dodaj biznis profil</button>
        <button class="btn btn-dark" type="button" onclick="handleAdminLogout()">Odjavi se</button>
      </div>
    </div>
    <div id="admin-stats" class="stats-grid"></div>
    <div class="card admin-search-card">
      <label for="admin-search-input">🔍 Pretraga profila</label>
      <input id="admin-search-input" type="search" placeholder="Traži po emailu, nazivu, telefonu, kodu ili linku..." oninput="handleAdminSearch(this.value)">
      <p class="muted">Korisno kada budeš imao 50, 100 ili više profila.</p>
    </div>
    <div id="admin-expiring-box"></div>
    <div id="salons-list"><div class="loading-box">Učitavanje profila...</div></div>
  `;
}

async function loadSalonsList() {
  const list = document.getElementById("salons-list");
  const stats = document.getElementById("admin-stats");

  const { data: salons, error } = await window.db
    .from("salons")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    list.innerHTML = `<div class="card"><p class="error-text">Greška pri učitavanju salona.</p></div>`;
    return;
  }

  adminSalonsCache = salons || [];
  renderAdminSalonsView();
}

function renderAdminSalonsView() {
  const list = document.getElementById("salons-list");
  const stats = document.getElementById("admin-stats");
  const expiringBox = document.getElementById("admin-expiring-box");
  if (!list || !stats) return;

  const items = adminSalonsCache || [];
  const filteredItems = filterAdminSalons(items);
  const activeCount = items.filter(s => s.status === "active").length;
  const blockedCount = items.filter(s => s.status === "blocked").length;
  const expiredCount = items.filter(s => isPaymentExpired(s.paid_until)).length;
  const expiringSoon = items
    .filter(s => s.status !== "deleted" && !s.is_deleted && isPaymentExpiringSoon(s.paid_until, 10))
    .sort((a, b) => (daysUntilDate(a.paid_until) ?? 99) - (daysUntilDate(b.paid_until) ?? 99));

  stats.innerHTML = `
    <div class="stat-card"><span>Ukupno profila</span><strong>${items.length}</strong></div>
    <div class="stat-card"><span>Aktivni</span><strong>${activeCount}</strong></div>
    <div class="stat-card"><span>Blokirani</span><strong>${blockedCount}</strong></div>
    <div class="stat-card danger"><span>Uplata istekla</span><strong>${expiredCount}</strong></div>
  `;

  if (expiringBox) {
    expiringBox.innerHTML = renderExpiringSoonBox(expiringSoon);
  }

  if (!items.length) {
    list.innerHTML = `<div class="card center"><h3>Nema dodatih profila</h3><p class="muted">Dodajte prvi biznis profil kako biste generisali njegov link i QR kod.</p></div>`;
    return;
  }

  if (!filteredItems.length) {
    list.innerHTML = `<div class="card center"><h3>Nema rezultata</h3><p class="muted">Nijedan profil ne odgovara unetoj pretrazi.</p></div>`;
    return;
  }

  try {
    const searchInfo = adminSearchQuery.trim()
      ? `<p class="muted admin-search-result">Prikazano: ${filteredItems.length} od ${items.length} profila</p>`
      : "";
    list.innerHTML = `${searchInfo}<div class="cards">${filteredItems.map(renderSalonCard).join("")}</div>`;
  } catch (err) {
    console.error("Admin render salon cards error:", err);
    list.innerHTML = `
      <div class="card">
        <h3>Greška pri prikazu salona</h3>
        <p class="error-text">Salon postoji u bazi, ali prikaz kartice je pukao. Uploaduj najnoviju verziju aplikacije.</p>
      </div>
    `;
  }
}

function renderExpiringSoonBox(items) {
  if (!items.length) {
    return `
      <div class="card expiring-card ok">
        <div class="section-head compact-section-head">
          <div>
            <h3>✅ Pretplate koje ističu u narednih 10 dana</h3>
            <p class="muted">Trenutno nema profila kojima uskoro ističe aktivacija.</p>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card expiring-card">
      <div class="section-head compact-section-head">
        <div>
          <h3>⚠️ Pretplate koje ističu u narednih 10 dana</h3>
          <p class="muted">Ovo je tvoja lista za kontaktiranje vlasnika bez skrolovanja kroz sve profile.</p>
        </div>
        <span class="status-pill new">${items.length} za proveru</span>
      </div>
      <div class="expiring-list">
        ${items.map(renderExpiringSoonRow).join("")}
      </div>
    </div>
  `;
}

function renderExpiringSoonRow(salon) {
  const days = daysUntilDate(salon.paid_until);
  const dayText = days === 0 ? "ističe danas" : `ističe za ${days} dana`;
  return `
    <div class="expiring-row">
      <div>
        <strong>${adminEscapeHtml(salon.salon_name)}</strong>
        <span>${adminEscapeHtml(salon.owner_email || "Bez emaila")} ${salon.owner_phone ? "• " + adminEscapeHtml(salon.owner_phone) : ""}</span>
        <small>Datum isteka: ${salon.paid_until ? window.App.formatDate(salon.paid_until) : "—"} • ${dayText}</small>
      </div>
      <div class="expiring-actions">
        <button class="btn btn-dark btn-small" type="button" onclick="sendRenewalEmail('${salon.id}')">📧 Email</button>
        <button class="btn btn-success btn-small" type="button" onclick="sendRenewalWhatsApp('${salon.id}')">💬 WhatsApp</button>
        <button class="btn btn-primary btn-small" type="button" onclick="extendPayment('${salon.id}', '${salon.paid_until || ""}')">Produži</button>
      </div>
    </div>
  `;
}

function renderSalonCard(salon) {
  const expired = isPaymentExpired(salon.paid_until);
  const salonLink = window.App.getSalonPublicLink(salon.slug);
  const statusClass = salon.status === "active" ? "active" : "blocked";

  return `
    <div class="card salon-card">
      <div class="salon-card-head">
        <div>
          <h3>${adminEscapeHtml(salon.salon_name)}</h3>
          <p class="muted">${adminEscapeHtml(salon.owner_email)} | ${adminEscapeHtml(salon.company_code)}</p>
        </div>
        <span class="status-pill ${statusClass}">${salon.status === "active" ? "Aktivan" : "Blokiran"}</span>
      </div>
      <div class="info-grid">
        <div><span>Slug</span><strong>${adminEscapeHtml(salon.slug)}</strong></div>
        <div><span>Telefon vlasnika</span><strong>${adminEscapeHtml(salon.owner_phone || "—")}</strong></div>
        <div><span>Uplaćeno od</span><strong>${salon.paid_from ? window.App.formatDate(salon.paid_from) : "—"}</strong></div>
        <div><span>Uplaćeno do</span><strong>${salon.paid_until ? window.App.formatDate(salon.paid_until) : "—"}</strong></div>
        <div><span>Cena</span><strong>${Number(salon.monthly_price || 9.99).toFixed(2)} ${adminEscapeHtml(salon.currency || "EUR")}</strong></div>
        <div><span>Boja profila</span><strong>${renderThemeBadge(salon.theme_color)}</strong></div>
        <div><span>Jezik aplikacije</span><strong>${renderLanguageBadge(salon.app_language)}</strong></div>
        <div><span>Vrsta profila</span><strong>${renderBusinessTypeBadge(salon.business_type)}</strong></div>
      </div>
      ${expired ? `<div class="warning-box">Uplata je istekla. Profil ostaje aktivan dok ga administrator ručno ne blokira.</div>` : ""}
      <div class="link-box"><small>Link profila:</small><input readonly value="${salonLink}"></div>
      <div class="card-actions">
        <button class="btn btn-dark" type="button" onclick="copySalonLink('${salon.slug}')">Kopiraj link</button>
        <a class="btn btn-primary" href="${getAdminClientPreviewLink(salon.slug)}">Vidi kao korisnik</a>
        <a class="btn btn-dark" href="${getAdminOwnerPreviewLink(salon.id)}">Vidi kao vlasnik</a>
        <button class="btn btn-dark" type="button" onclick="showQrForSalon('${salon.slug}', '${adminEscapeJs(salon.salon_name)}')">QR kod</button>
        <button class="btn btn-dark" type="button" onclick="showThemePicker('${salon.id}', '${adminEscapeJs(salon.theme_color || "classic-red")}', '${adminEscapeJs(salon.salon_name)}')">🎨 Boja</button>
        <button class="btn btn-dark" type="button" onclick="showLanguagePicker('${salon.id}', '${adminEscapeJs(salon.app_language || "sr")}', '${adminEscapeJs(salon.salon_name)}')">🌐 Jezik</button>
        <button class="btn btn-dark" type="button" onclick="sendRenewalEmail('${salon.id}')">📧 Email obaveštenje</button>
        <button class="btn btn-success" type="button" onclick="sendRenewalWhatsApp('${salon.id}')">💬 WhatsApp</button>
        <button class="btn btn-dark" type="button" onclick="editSalonProfile('${salon.id}')">Izmeni</button>
        <button class="btn btn-dark" type="button" onclick="extendPayment('${salon.id}', '${salon.paid_until || ""}')">Produži uplatu</button>
        <button class="btn ${salon.status === "active" ? "btn-warning" : "btn-success"}" type="button" onclick="toggleSalonStatus('${salon.id}', '${salon.status}')">${salon.status === "active" ? "Blokiraj" : "Aktiviraj"}</button>
        <button class="btn btn-danger" type="button" onclick="deleteSalon('${salon.id}')">Obriši</button>
      </div>
    </div>
  `;
}

function showAddSalonForm() {
  const modal = document.createElement("div");
  modal.id = "admin-business-modal";
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal-card admin-business-modal-card">
      <div class="section-head compact-section-head">
        <div>
          <h2>Dodaj biznis profil</h2>
          <p class="muted">Izaberi vrstu profila iz liste. Ovo menja tekstove na javnom QR profilu.</p>
        </div>
        <button class="btn btn-dark btn-small" type="button" onclick="closeAdminBusinessModal()">Zatvori</button>
      </div>

      <form id="admin-business-form" onsubmit="handleAddBusinessProfile(event)">
        <div class="admin-form-grid">
          <div>
            <label for="new-business-name">Naziv biznisa *</label>
            <input id="new-business-name" required placeholder="npr. Auto Servis Žika">
          </div>
          <div>
            <label for="new-business-type">Vrsta profila *</label>
            <select id="new-business-type" required>
              ${renderBusinessTypeOptions("general")}
            </select>
          </div>
          <div>
            <label for="new-business-email">Email vlasnika *</label>
            <input id="new-business-email" type="email" required placeholder="vlasnik@gmail.com">
          </div>
          <div>
            <label for="new-business-code">Kod firme / profila *</label>
            <input id="new-business-code" required placeholder="npr. zika123">
          </div>
          <div>
            <label for="new-business-city">Grad / mesto</label>
            <input id="new-business-city" placeholder="npr. Novi Sad">
          </div>
          <div>
            <label for="new-business-phone">Javni telefon biznisa</label>
            <input id="new-business-phone" inputmode="tel" placeholder="+381...">
          </div>
          <div>
            <label for="new-business-owner-phone">Telefon vlasnika za admin/WhatsApp</label>
            <input id="new-business-owner-phone" inputmode="tel" placeholder="+381...">
          </div>
          <div>
            <label for="new-business-language">Jezik aplikacije</label>
            <select id="new-business-language">
              ${ADMIN_LANGUAGE_OPTIONS.map(item => `<option value="${adminEscapeHtml(item.value)}" ${item.value === "sr" ? "selected" : ""}>${item.icon} ${adminEscapeHtml(item.label)}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="business-type-helper" id="business-type-helper">
          <strong>${renderBusinessTypeBadge("general")}</strong>
          <span>Opšti biznis: zahtevi, termini i ponuda.</span>
        </div>

        <div class="card-actions admin-modal-actions">
          <button class="btn btn-primary" type="submit">Sačuvaj biznis profil</button>
          <button class="btn btn-dark" type="button" onclick="closeAdminBusinessModal()">Otkaži</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  const typeSelect = document.getElementById("new-business-type");
  const helper = document.getElementById("business-type-helper");
  if (typeSelect && helper) {
    typeSelect.addEventListener("change", () => {
      const option = getAdminBusinessTypeOption(typeSelect.value);
      helper.innerHTML = `<strong>${renderBusinessTypeBadge(option.value)}</strong><span>${adminEscapeHtml(option.label)}: ${adminEscapeHtml(option.hint)}.</span>`;
    });
  }
}

async function handleAddBusinessProfile(event) {
  event.preventDefault();

  const cleanName = getAdminFormValue("new-business-name");
  const cleanEmail = getAdminFormValue("new-business-email").toLowerCase();
  const cleanCode = getAdminFormValue("new-business-code");
  const city = getAdminFormValue("new-business-city") || null;
  const phone = getAdminFormValue("new-business-phone") || null;
  const ownerPhoneRaw = getAdminFormValue("new-business-owner-phone") || phone || null;
  const appLanguage = getAdminLanguageOption(getAdminFormValue("new-business-language") || "sr").value;
  const businessType = getAdminBusinessTypeOption(getAdminFormValue("new-business-type") || "general").value;

  if (!cleanName || !cleanEmail || !cleanCode) {
    window.App.showMessage("Popuni naziv, email vlasnika i kod firme.", "error");
    return;
  }

  const submitBtn = event.submitter;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Čuvam...";
  }

  const slug = createSlug(cleanName);
  const today = new Date();
  const paidFrom = toDateInput(today);
  const paidUntil = toDateInput(addDays(today, 30));

  const { data: salon, error } = await insertSalonWithBusinessType({
    salon_name: cleanName,
    slug,
    owner_email: cleanEmail,
    company_code: cleanCode,
    phone,
    owner_phone: ownerPhoneRaw ? ownerPhoneRaw.trim() : null,
    city,
    status: "active",
    paid_from: paidFrom,
    paid_until: paidUntil,
    monthly_price: 9.99,
    currency: "EUR",
    theme_color: "classic-red",
    app_language: appLanguage,
    business_type: businessType,
    is_deleted: false
  });

  if (error) {
    console.error(error);
    window.App.showMessage("Greška pri dodavanju profila: " + error.message, "error");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sačuvaj biznis profil";
    }
    return;
  }

  await createDefaultWorkingHours(salon.id);
  await createDefaultSettings(salon.id, cleanName, phone, city);
  closeAdminBusinessModal();
  window.App.showMessage("Biznis profil je uspešno dodat.", "success");
  await loadSalonsList();
}

async function createDefaultWorkingHours(salonId) {
  const rows = [
    { day_of_week: 1, open_time: "09:00", close_time: "17:00", is_closed: false },
    { day_of_week: 2, open_time: "09:00", close_time: "17:00", is_closed: false },
    { day_of_week: 3, open_time: "09:00", close_time: "17:00", is_closed: false },
    { day_of_week: 4, open_time: "09:00", close_time: "17:00", is_closed: false },
    { day_of_week: 5, open_time: "09:00", close_time: "17:00", is_closed: false },
    { day_of_week: 6, open_time: "09:00", close_time: "14:00", is_closed: false },
    { day_of_week: 0, open_time: "09:00", close_time: "17:00", is_closed: true }
  ].map(row => ({ ...row, salon_id: salonId }));

  await window.db.from("working_hours").upsert(rows, { onConflict: "salon_id,day_of_week" });
}

async function createDefaultSettings(salonId, salonName, phone, city) {
  await window.db.from("salon_settings").upsert({
    salon_id: salonId,
    welcome_title: `Dobrodošli u ${salonName}`,
    welcome_text: "Pošaljite zahtev ili zakažite termin brzo i jednostavno.",
    phone,
    address: city || null
  }, { onConflict: "salon_id" });
}

async function editSalonProfile(id) {
  const { data: salon, error } = await window.db
    .from("salons")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !salon) {
    console.error(error);
    window.App.showMessage("Profil nije pronađen.", "error");
    return;
  }

  const name = prompt("Naziv biznisa:", salon.salon_name || "");
  if (name === null) return;

  const email = prompt("Email vlasnika biznisa:", salon.owner_email || "");
  if (email === null) return;

  const code = prompt("Kod firme / profila:", salon.company_code || "");
  if (code === null) return;

  const city = prompt("Grad / mesto:", salon.city || "");
  if (city === null) return;

  const phone = prompt("Javni telefon biznisa koji vide klijenti:", salon.phone || "");
  if (phone === null) return;

  const ownerPhone = prompt("Telefon vlasnika za admin kontakt / WhatsApp:", salon.owner_phone || salon.phone || "");
  if (ownerPhone === null) return;

  const businessType = promptBusinessType(salon.business_type || "general");
  if (businessType === null) return;

  const changeSlug = confirm(
    "Da li želite da izmenite i link/slug profila?\n\n" +
    "Ako promenite slug, stari QR kod i stari link više neće voditi na ovaj profil.\n" +
    "Za ispravku samo imena firme kliknite Cancel / Otkaži."
  );

  let slug = salon.slug;
  if (changeSlug) {
    const enteredSlug = prompt("Slug profila / link:", salon.slug || createSlug(name));
    if (enteredSlug === null) return;
    slug = createSlug(enteredSlug);
    if (!slug) {
      window.App.showMessage("Slug ne može biti prazan.", "error");
      return;
    }
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();
  const cleanCity = city.trim() || null;
  const cleanPhone = phone.trim() || null;
  const cleanOwnerPhone = ownerPhone.trim() || null;

  if (!cleanName || !cleanEmail || !cleanCode) {
    window.App.showMessage("Naziv, email i kod firme su obavezni.", "error");
    return;
  }

  const { error: updateError } = await updateSalonWithBusinessType(id, {
      salon_name: cleanName,
      owner_email: cleanEmail,
      company_code: cleanCode,
      city: cleanCity,
      phone: cleanPhone,
      owner_phone: cleanOwnerPhone,
      business_type: businessType,
      slug
    });

  if (updateError) {
    console.error(updateError);
    window.App.showMessage("Greška pri izmeni profila: " + updateError.message, "error");
    return;
  }

  await window.db
    .from("salon_settings")
    .upsert({
      salon_id: id,
      phone: cleanPhone,
      address: cleanCity
    }, { onConflict: "salon_id" });

  window.App.showMessage("Profil je izmenjen.", "success");
  await loadSalonsList();
}

async function extendPayment(id, currentPaidUntil) {
  const salonBeforeUpdate = adminSalonsCache.find(item => String(item.id) === String(id));
  const baseDate = currentPaidUntil && new Date(currentPaidUntil) > new Date() ? new Date(currentPaidUntil) : new Date();
  const suggestedDate = toDateInput(addDays(baseDate, 30));
  const newDate = prompt("Novi paid_until datum (YYYY-MM-DD):", suggestedDate);
  if (!newDate) return;

  const { data: updatedSalon, error } = await window.db
    .from("salons")
    .update({ paid_until: newDate })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    window.App.showMessage("Greška pri produženju uplate.", "error");
    return;
  }

  const salonForMessage = updatedSalon || { ...(salonBeforeUpdate || {}), paid_until: newDate };
  window.App.showMessage("Uplata je produžena.", "success");
  await loadSalonsList();
  showExtensionNotifyModal(salonForMessage, newDate);
}

async function toggleSalonStatus(id, currentStatus) {
  const newStatus = currentStatus === "active" ? "blocked" : "active";
  if (!confirm(newStatus === "blocked" ? "Da li želite da blokirate ovaj profil?" : "Da li želite da aktivirate ovaj profil?")) return;
  const { error } = await window.db.from("salons").update({ status: newStatus }).eq("id", id);
  if (error) {
    window.App.showMessage("Greška pri promeni statusa profila.", "error");
    return;
  }
  await loadSalonsList();
}

async function deleteSalon(id) {
  if (!confirm("Da li želite da sklonite ovaj profil iz aktivne liste?")) return;
  const { error } = await window.db.from("salons").update({ is_deleted: true, status: "deleted" }).eq("id", id);
  if (error) {
    window.App.showMessage("Greška pri brisanju profila.", "error");
    return;
  }
  await loadSalonsList();
}

function copySalonLink(slug) {
  const link = window.App.getSalonPublicLink(slug);
  navigator.clipboard.writeText(link).then(() => {
    window.App.showMessage("Link profila je kopiran.", "success");
  }).catch(() => prompt("Kopiraj link:", link));
}

function showQrForSalon(slug, salonName) {
  const link = window.App.getSalonPublicLink(slug);
  const qrUrl = window.App.getQrImageUrl(link, 280);
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal-card">
      <h2>QR kod profila</h2>
      <p class="muted">${adminEscapeHtml(salonName)}</p>
      <img class="qr-img" src="${qrUrl}" alt="QR kod za profil">
      <div class="link-box"><input readonly value="${link}"></div>
      <button class="btn btn-primary" type="button" onclick="copySalonLink('${slug}')">Kopiraj link</button>
      <button class="btn btn-dark" type="button" onclick="this.closest('.modal-backdrop').remove()">Zatvori</button>
    </div>`;
  document.body.appendChild(modal);
}


function showThemePicker(salonId, currentTheme, salonName) {
  const activeTheme = getAdminThemeOption(currentTheme).value;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal-card theme-modal-card">
      <h2>Boja profila</h2>
      <p class="muted">${adminEscapeHtml(salonName || "Biznis profil")}</p>
      <p class="theme-modal-note">Boju menja samo administrator. Menja se samo ovaj profil, ostali profili ostaju isti.</p>
      <div class="theme-picker-grid">
        ${ADMIN_THEME_OPTIONS.map(theme => `
          <button class="theme-choice ${theme.value === activeTheme ? "selected" : ""} theme-preview-${theme.value}" type="button" onclick="saveSalonTheme('${salonId}', '${theme.value}')">
            <span class="theme-choice-top"><i></i><strong>${theme.icon} ${adminEscapeHtml(theme.label)}</strong></span>
            <small>${adminEscapeHtml(theme.hint)}</small>
          </button>
        `).join("")}
      </div>
      <button class="btn btn-dark" type="button" onclick="this.closest('.modal-backdrop').remove()">Zatvori</button>
    </div>`;
  document.body.appendChild(modal);
}

async function saveSalonTheme(salonId, themeValue) {
  const cleanTheme = getAdminThemeOption(themeValue).value;
  const { error } = await window.db
    .from("salons")
    .update({ theme_color: cleanTheme })
    .eq("id", salonId);

  if (error) {
    console.error(error);
    window.App.showMessage("Greška pri čuvanju boje: " + error.message, "error");
    return;
  }

  document.querySelector(".modal-backdrop")?.remove();
  window.App.showMessage("Boja profila je sačuvana.", "success");
  await loadSalonsList();
}


function showLanguagePicker(salonId, currentLanguage, salonName) {
  const activeLanguage = getAdminLanguageOption(currentLanguage).value;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal-card theme-modal-card">
      <h2>Jezik aplikacije</h2>
      <p class="muted">${adminEscapeHtml(salonName || "Biznis profil")}</p>
      <p class="theme-modal-note">Jezik menja samo administrator. Menja se samo ovaj profil, ostali profili ostaju isti. Usluge koje vlasnik sam unese se ne prevode automatski.</p>
      <div class="theme-picker-grid language-picker-grid">
        ${ADMIN_LANGUAGE_OPTIONS.map(lang => `
          <button class="theme-choice language-choice ${lang.value === activeLanguage ? "selected" : ""}" type="button" onclick="saveSalonLanguage('${salonId}', '${lang.value}')">
            <span class="theme-choice-top"><strong>${lang.icon} ${adminEscapeHtml(lang.label)}</strong></span>
            <small>${adminEscapeHtml(lang.hint)}</small>
          </button>
        `).join("")}
      </div>
      <button class="btn btn-dark" type="button" onclick="this.closest('.modal-backdrop').remove()">Zatvori</button>
    </div>`;
  document.body.appendChild(modal);
}

async function saveSalonLanguage(salonId, languageValue) {
  const cleanLanguage = getAdminLanguageOption(languageValue).value;
  const { error } = await window.db
    .from("salons")
    .update({ app_language: cleanLanguage })
    .eq("id", salonId);

  if (error) {
    console.error(error);
    window.App.showMessage("Greška pri čuvanju jezika: " + error.message, "error");
    return;
  }

  document.querySelector(".modal-backdrop")?.remove();
  window.App.showMessage("Jezik profila je sačuvan.", "success");
  await loadSalonsList();
}

function isPaymentExpired(paidUntil) {
  if (!paidUntil) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const paidDate = new Date(paidUntil);
  paidDate.setHours(0, 0, 0, 0);
  return paidDate < today;
}

function createSlug(value) {
  return String(value || "")
    .trim().toLowerCase()
    .replaceAll("š", "s").replaceAll("đ", "dj").replaceAll("č", "c").replaceAll("ć", "c").replaceAll("ž", "z")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateInput(date) {
  return date.toISOString().split("T")[0];
}
