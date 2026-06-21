// assets/js/salon.js

let currentSalon = null;
let currentSalonId = null;
let currentSection = "appointments";
let appointmentCache = [];
let adminOwnerPreviewMode = false;
let ownerAppointmentChannel = null;
let ownerAppointmentPollTimer = null;
let ownerNotificationUnlocked = false;
let ownerNotificationSoundEnabled = false;
let ownerAudioCtx = null;
let ownerAudioMaster = null;
let ownerNotificationLastId = "";
let ownerNotificationStartedAt = new Date().toISOString();

let ownerNotificationPendingCount = 0;

function ownerPendingAppointmentKey() {
  return currentSalonId ? `citystyle_owner_pending_appointments_${currentSalonId}` : "citystyle_owner_pending_appointments";
}

function ownerLastAppointmentKey() {
  return currentSalonId ? `citystyle_owner_last_appointment_${currentSalonId}` : "citystyle_owner_last_appointment";
}

function setOwnerPendingAppointments(count = 1, appointmentId = "") {
  ownerNotificationPendingCount = Math.max(1, Number(count || 1));
  try {
    localStorage.setItem(ownerPendingAppointmentKey(), String(ownerNotificationPendingCount));
    if (appointmentId) localStorage.setItem(ownerLastAppointmentKey(), String(appointmentId));
  } catch (err) {}
  markOwnerNotificationUi(ownerNotificationPendingCount);
}

function clearOwnerPendingAppointments() {
  ownerNotificationPendingCount = 0;
  try {
    localStorage.removeItem(ownerPendingAppointmentKey());
    localStorage.removeItem(ownerLastAppointmentKey());
  } catch (err) {}
  markOwnerNotificationUi(0);
  window.App?.clearAppBadgeCount?.();
}

function getStoredOwnerPendingAppointments() {
  try {
    return Number(localStorage.getItem(ownerPendingAppointmentKey()) || "0") || 0;
  } catch (err) {
    return 0;
  }
}

function markOwnerNotificationUi(count = 0) {
  const safeCount = Math.max(0, Number(count || 0));
  document.body.classList.toggle("owner-has-new-appointment", safeCount > 0);
  document.querySelectorAll("#salon-tabs button[data-section='appointments']").forEach(btn => {
    btn.dataset.badge = safeCount > 0 ? String(safeCount) : "";
    btn.setAttribute("aria-label", safeCount > 0 ? `Termini, ${safeCount} novih` : "Termini");
  });
  const baseTitle = currentSalon?.salon_name ? `${currentSalon.salon_name} Panel` : "CityStyle Panel";
  document.title = safeCount > 0 ? `(${safeCount}) Novi termin - ${baseTitle}` : baseTitle;
}

function ownerOpenAppointmentsFromSignal() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("section");
    url.searchParams.delete("open");
    url.searchParams.delete("from_push");
    url.searchParams.delete("appointment_id");
    window.history.replaceState({}, "", url.toString());
  } catch (err) {}
  return showSection("appointments");
}

async function countOwnerNewAppointments() {
  if (!currentSalonId || !window.db || ownerIsShopProfile() || adminOwnerPreviewMode) return 0;
  try {
    const { count, error } = await window.db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("salon_id", currentSalonId)
      .eq("status", "new");
    if (error) return 0;
    return Number(count || 0);
  } catch (err) {
    return 0;
  }
}

function wantsAppointmentsFromUrl() {
  const section = String(window.App?.getUrlParam?.("section") || "").toLowerCase();
  const open = String(window.App?.getUrlParam?.("open") || "").toLowerCase();
  const fromPush = String(window.App?.getUrlParam?.("from_push") || "").toLowerCase();
  return section === "appointments" || open === "appointments" || fromPush === "1" || fromPush === "appointments";
}

async function getInitialOwnerSection() {
  if (ownerIsShopProfile()) return getDefaultOwnerSection();
  if (wantsAppointmentsFromUrl()) return "appointments";
  const stored = getStoredOwnerPendingAppointments();
  if (stored > 0) {
    markOwnerNotificationUi(stored);
    return "appointments";
  }
  const newCount = await countOwnerNewAppointments();
  if (newCount > 0) {
    setOwnerPendingAppointments(newCount);
    return "appointments";
  }
  return getDefaultOwnerSection();
}


function getOwnerSoundKey() {
  return currentSalonId ? `citystyle_owner_sound_enabled_${currentSalonId}` : "citystyle_owner_sound_enabled";
}

function isOwnerSoundStoredEnabled() {
  try { return localStorage.getItem(getOwnerSoundKey()) === "1"; } catch (err) { return false; }
}

function storeOwnerSoundEnabled(value = true) {
  try { localStorage.setItem(getOwnerSoundKey(), value ? "1" : "0"); } catch (err) {}
  document.body.classList.toggle("owner-sound-ready", !!value);
}

async function ensureOwnerAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;

  if (!ownerAudioCtx || ownerAudioCtx.state === "closed") {
    ownerAudioCtx = new AudioCtx();
    ownerAudioMaster = ownerAudioCtx.createGain();
    ownerAudioMaster.gain.setValueAtTime(0.001, ownerAudioCtx.currentTime);
    ownerAudioMaster.connect(ownerAudioCtx.destination);
  }

  if (ownerAudioCtx.state === "suspended") {
    try { await ownerAudioCtx.resume(); } catch (err) {}
  }

  return ownerAudioCtx;
}

async function unlockOwnerNotificationSound() {
  try {
    const ctx = await ensureOwnerAudioContext();
    ownerNotificationUnlocked = !!ctx;
    ownerNotificationSoundEnabled = !!ctx;
    if (ctx) storeOwnerSoundEnabled(true);
    window.removeEventListener("pointerdown", unlockOwnerNotificationSound);
    window.removeEventListener("keydown", unlockOwnerNotificationSound);
    return !!ctx;
  } catch (err) {
    console.warn("Owner sound unlock failed:", err);
    return false;
  }
}

window.addEventListener("pointerdown", unlockOwnerNotificationSound, { once: true });
window.addEventListener("keydown", unlockOwnerNotificationSound, { once: true });

async function playOwnerAppointmentSound(force = false) {
  try {
    const ctx = await ensureOwnerAudioContext();
    if (!ctx) return false;

    // Browser blocks sound if user never enabled it. "force" is used only from the explicit enable button.
    if (!force && !ownerNotificationUnlocked && !ownerNotificationSoundEnabled && !isOwnerSoundStoredEnabled()) return false;

    ownerNotificationUnlocked = true;
    ownerNotificationSoundEnabled = true;

    if (navigator.vibrate) {
      try { navigator.vibrate([240, 90, 240, 90, 420]); } catch (err) {}
    }

    const now = ctx.currentTime + 0.02;
    const master = ownerAudioMaster || ctx.destination;
    const pattern = [
      { f: 880, t: 0.00, d: 0.16, v: 0.22 },
      { f: 1175, t: 0.18, d: 0.16, v: 0.22 },
      { f: 1568, t: 0.36, d: 0.18, v: 0.24 },
      { f: 1175, t: 0.78, d: 0.18, v: 0.20 },
      { f: 1568, t: 0.98, d: 0.22, v: 0.24 }
    ];

    pattern.forEach(({ f, t, d, v }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + t);
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(v, now + t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + t);
      osc.stop(now + t + d + 0.03);
    });

    return true;
  } catch (err) {
    console.warn("Owner notification sound failed:", err);
    return false;
  }
}

async function testOwnerNotificationSound() {
  ownerNotificationUnlocked = true;
  ownerNotificationSoundEnabled = true;
  storeOwnerSoundEnabled(true);
  const ok = await playOwnerAppointmentSound(true);
  if (!ok) {
    window.App?.showMessage?.("Telefon/browser nije dozvolio zvuk. Dodirnite ekran i pokušajte ponovo.", "error");
  }
  return ok;
}

function renderOwnerAppointmentAlert(appointment = {}) {
  document.querySelector(".owner-live-alert")?.remove();
  const date = appointment.appointment_date ? window.App.formatDate(appointment.appointment_date) : "nov termin";
  const time = String(appointment.appointment_time || "").slice(0, 5);
  const service = appointment.service_name_snapshot || "Usluga";
  const client = appointment.client_name || "Klijent";
  const phone = appointment.client_phone || "";
  const wrap = document.createElement("div");
  wrap.className = "owner-live-alert";
  wrap.innerHTML = `
    <div class="owner-live-alert-card">
      <button class="owner-live-alert-close" type="button" onclick="this.closest('.owner-live-alert').remove()">×</button>
      <div class="owner-live-alert-icon">🔔</div>
      <div class="owner-live-alert-copy">
        <strong>Novi termin je stigao</strong>
        <p>${salonEscapeHtml(client)} • ${salonEscapeHtml(service)}</p>
        <small>${salonEscapeHtml(date)} ${time ? "u " + salonEscapeHtml(time) : ""}${phone ? " • " + salonEscapeHtml(phone) : ""}</small>
      </div>
      <button class="btn btn-primary btn-small" type="button" onclick="document.querySelector('.owner-live-alert')?.remove(); ownerOpenAppointmentsFromSignal()">Otvori termine</button>
    </div>`;
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 18000);
}

async function showOwnerAppointmentBrowserNotification(appointment = {}) {
  // Local duplicate system notification is disabled; background push handles appointments.
  // Real Android notification comes from the Edge Function push.
  return;
}
async function handleOwnerNewAppointment(appointment = {}) {
  if (!appointment?.id || String(appointment.id) === String(ownerNotificationLastId)) return;
  ownerNotificationLastId = String(appointment.id);

  const count = await countOwnerNewAppointments();
  setOwnerPendingAppointments(count || 1, appointment.id);

  await playOwnerAppointmentSound();
  setTimeout(() => playOwnerAppointmentSound(), 1400);
  renderOwnerAppointmentAlert(appointment);
  // Browser/system push notification is sent by Supabase Edge Function.
  // Here we keep only in-panel visual alert + sound, to avoid duplicate Chrome warnings.
  window.App?.showMessage?.("Stigao je novi termin. Otvorite sekciju Termini.", "success");
  window.App?.setAppBadgeCount?.(count || 1);

  if (currentSection === "appointments") await renderAppointments();
}

function setupOwnerAppointmentRealtime() {
  startOwnerAppointmentPolling();
  if (!window.db?.channel || !currentSalonId || adminOwnerPreviewMode) return;
  try {
    if (ownerAppointmentChannel) window.db.removeChannel(ownerAppointmentChannel);
    ownerAppointmentChannel = window.db
      .channel(`owner-appointments-${currentSalonId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "appointments", filter: `salon_id=eq.${currentSalonId}` }, payload => {
        handleOwnerNewAppointment(payload.new || {});
      })
      .subscribe(status => {
        if (status === "SUBSCRIBED") console.log("CityStyle owner appointment realtime active");
      });
  } catch (err) {
    console.warn("Realtime notifikacije nisu pokrenute:", err);
  }
}

function cleanupOwnerAppointmentRealtime() {
  try {
    if (ownerAppointmentChannel && window.db?.removeChannel) window.db.removeChannel(ownerAppointmentChannel);
  } catch (err) {}
  ownerAppointmentChannel = null;
}

function stopOwnerAppointmentPolling() {
  if (ownerAppointmentPollTimer) clearInterval(ownerAppointmentPollTimer);
  ownerAppointmentPollTimer = null;
}

async function checkOwnerNewAppointmentsByPolling() {
  if (!currentSalonId || !window.db || adminOwnerPreviewMode) return;
  try {
    const { data, error } = await window.db
      .from("appointments")
      .select("*")
      .eq("salon_id", currentSalonId)
      .gte("created_at", ownerNotificationStartedAt)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !data?.length) return;
    const latest = data[0];
    if (!latest?.id || String(latest.id) === String(ownerNotificationLastId)) return;

    const created = latest.created_at ? new Date(latest.created_at).getTime() : Date.now();
    if (created + 5000 < new Date(ownerNotificationStartedAt).getTime()) return;
    await handleOwnerNewAppointment(latest);
  } catch (err) {
    console.warn("Polling notifikacije nisu uspele:", err);
  }
}

function startOwnerAppointmentPolling() {
  stopOwnerAppointmentPolling();
  if (!currentSalonId || adminOwnerPreviewMode) return;
  ownerAppointmentPollTimer = setInterval(checkOwnerNewAppointmentsByPolling, 7000);
  setTimeout(checkOwnerNewAppointmentsByPolling, 1200);
}
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
  if (!window.db) {
    renderSalonLogin();
    window.App?.showMessage?.("Veza sa bazom nije učitana. Osvežite stranicu ili očistite cache za citystyle.app.", "error");
    return;
  }
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
    const manifestData = await getOwnerPanelManifestData();

    // /p/ is only an install launcher; the saved shortcut opens the real owner panel.
    if (window.App?.getProfileInstallGatewayUrl) {
      const url = window.App.getProfileInstallGatewayUrl({
        public_profile_code: manifestData.profileCode,
        slug: manifestData.slug
      }, { name: manifestData.name, panel: true });
      window.location.href = url;
      return;
    }

    await window.App?.installOwnerApp?.(manifestData);
  });
}

async function getOwnerPanelManifestData() {
  const businessName = currentSalon?.salon_name || "CityStyle";
  const profileKey = currentSalon?.public_profile_code || currentSalon?.slug || currentSalonId || "owner";
  const data = {
    name: businessName,
    panelName: `${businessName} Panel`,
    slug: currentSalon?.slug || "",
    profileCode: profileKey,
    salonId: currentSalonId || "",
    themeColor: currentSalon?.theme_color || "classic-red",
    iconUrl: ""
  };

  try {
    if (!currentSalonId || !window.db) return data;
    const { data: settings } = await window.db
      .from("salon_settings")
      .select("logo_url,cover_image_url,home_image_url")
      .eq("salon_id", currentSalonId)
      .maybeSingle();

    // Owner panel shortcut must use only the business identity image.
    // Do NOT fall back to random gallery/home_images photos, because that can put
    // a product/treatment photo on the owner's app shortcut instead of the salon/shop logo.
    const icon = settings?.logo_url || settings?.cover_image_url || settings?.home_image_url || "";

    data.iconUrl = String(icon || "").trim();
  } catch (err) {
    console.warn("Owner panel ikonica nije učitana, koristi se fallback:", err);
  }

  return data;
}

async function prepareOwnerPanelManifest() {
  try {
    const manifestData = await getOwnerPanelManifestData();
    window.App?.updateManifestForOwner?.(manifestData);
  } catch (err) {
    console.warn("Owner panel manifest nije pripremljen:", err);
  }
}

function bindSalonLogout() {
  document.getElementById("salon-logout-btn")?.addEventListener("click", () => {
    window.Auth.salonLogout();
    window.App?.clearSalonTheme?.();
    cleanupOwnerAppointmentRealtime();
    currentSalon = null;
    currentSalonId = null;
    document.getElementById("salon-install-btn")?.classList.add("hidden");
    renderSalonLogin();
  });
}

function renderSalonLogin() {
  window.App?.clearSalonTheme?.();
  window.App?.setAppLanguage?.("sr");
  document.getElementById("salon-name").textContent = "CityStyle Panel";
  document.getElementById("salon-status-text").textContent = "Prijavite se za upravljanje terminima, uslugama, galerijom i podešavanjima profila.";
  setOwnerPanelLoggedInUI(false);
  document.getElementById("salon-tabs").classList.add("hidden");
  document.getElementById("salon-logout-btn").classList.add("hidden");
  document.getElementById("salon-install-btn")?.classList.add("hidden");
  document.getElementById("salon-content").innerHTML = `
    <div class="card login-card">
      <h2>Prijava vlasnika</h2>
      <p class="muted">Unesite email i kod firme. Posle prijave ostajete prijavljeni na ovom uređaju dok ne kliknete „Odjavi se”.</p>
      <label>Email vlasnika / biznisa</label>
      <input id="salon-login-email" type="email" placeholder="salon@email.com">
      <label>Kod firme</label>
      <input id="salon-login-code" type="text" placeholder="CS-1001">
      <button class="btn btn-primary" type="button" onclick="handleSalonLogin()">Prijavi se</button>
    </div>
  `;
}

function getDefaultOwnerSection() {
  return ownerIsShopProfile() ? "products" : "services";
}

async function handleSalonLogin() {
  if (!window.db) {
    window.App?.showMessage?.("Veza sa bazom nije učitana. Osvežite stranicu i pokušajte ponovo.", "error");
    return;
  }
  window.App?.clearSavedSalon?.();
  const email = document.getElementById("salon-login-email").value.trim().toLowerCase();
  const code = document.getElementById("salon-login-code").value.trim();
  const salon = await window.Auth.salonLogin(email, code);
  if (!salon) return;
  currentSalon = salon;
  currentSalonId = salon.id;
  ownerNotificationStartedAt = new Date().toISOString();
  window.App?.setAppLanguage?.(salon.app_language || "sr");
  window.App?.applySalonTheme?.(salon.theme_color);
  renderSalonDashboard();
  await prepareOwnerPanelManifest();
  setupOwnerAppointmentRealtime();
  autoRefreshOwnerPushRegistration();
  markOwnerNotificationUi(getStoredOwnerPendingAppointments());
  await showSection(await getInitialOwnerSection());
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
  ownerNotificationStartedAt = new Date().toISOString();
  window.App?.setAppLanguage?.(data.app_language || "sr");
  window.App?.applySalonTheme?.(data.theme_color);
  renderSalonDashboard();
  await prepareOwnerPanelManifest();
  await showSection(await getInitialOwnerSection());
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
  ownerNotificationSoundEnabled = isOwnerSoundStoredEnabled();
  ownerNotificationUnlocked = ownerNotificationSoundEnabled;
  document.body.classList.toggle("owner-sound-ready", ownerNotificationSoundEnabled);
  window.App?.setAppLanguage?.(data.app_language || "sr");
  window.App?.applySalonTheme?.(data.theme_color);
  renderSalonDashboard();
  await prepareOwnerPanelManifest();
  setupOwnerAppointmentRealtime();
  autoRefreshOwnerPushRegistration();
  await showSection(await getInitialOwnerSection());
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


function getOwnerNotificationsEnabled() {
  try {
    if (!currentSalonId) return false;
    const saved = localStorage.getItem(`citystyle_owner_notifications_enabled_${currentSalonId}`) === "1";
    const confirmed = localStorage.getItem(`citystyle_owner_push_confirmed_${currentSalonId}`) === "1";
    const permissionOk = (typeof Notification === "undefined") || Notification.permission === "granted";
    return (saved || confirmed) && permissionOk;
  } catch (err) {
    return false;
  }
}

async function ownerHasBrowserPushSubscription() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if ("Notification" in window && Notification.permission !== "granted") return false;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch (err) {
    console.warn("Owner push subscription check failed:", err);
    return false;
  }
}

function markOwnerNotificationsEnabled() {
  if (!currentSalonId) return;
  try {
    localStorage.setItem(`citystyle_owner_notifications_enabled_${currentSalonId}`, "1");
    localStorage.setItem(`citystyle_owner_push_confirmed_${currentSalonId}`, "1");
  } catch (err) {}
}

function refreshOwnerNotificationsButtonState() {
  const btn = document.getElementById("salon-notifications-btn");
  if (!btn) return;

  if (getOwnerNotificationsEnabled()) {
    btn.textContent = "✅ Obaveštenja uključena";
    btn.classList.add("is-enabled");
    btn.setAttribute("aria-pressed", "true");
    btn.title = "Obaveštenja su uključena za nove termine.";
  } else {
    btn.textContent = "2. Uključi obaveštenja";
    btn.classList.remove("is-enabled");
    btn.setAttribute("aria-pressed", "false");
    btn.title = "Uključi obaveštenja za nove termine.";
  }
}


function setActiveTab(section) {
  currentSection = section;
  document.querySelectorAll("#salon-tabs button").forEach(btn => btn.classList.toggle("active", btn.dataset.section === section));
}


async function enableOwnerNotifications() {
  if (stopAdminOwnerPreviewEdit()) return;

  const btn = document.getElementById("salon-notifications-btn");
  const oldText = btn?.textContent || "2. Uključi obaveštenja";

  try {
    if (btn) {
      btn.disabled = true;
      btn.classList.add("is-working");
      btn.textContent = "Uključujem...";
    }

    window.App?.showMessage?.("Uključujem obaveštenja za nove termine...", "info");

    // This must happen immediately after the button click, before long awaits,
    // otherwise Android/Chrome can block audio.
    ownerNotificationUnlocked = true;
    ownerNotificationSoundEnabled = true;
    storeOwnerSoundEnabled(true);
    await ensureOwnerAudioContext();
    await testOwnerNotificationSound();

    markOwnerNotificationsEnabled()
    ownerNotificationStartedAt = new Date().toISOString();
    setupOwnerAppointmentRealtime();
    startOwnerAppointmentPolling();

    let permissionOk = true;
    if ("Notification" in window) {
      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        permissionOk = permission === "granted";
      } else if (Notification.permission === "denied") {
        permissionOk = false;
      }
    }

    if (!permissionOk) {
      try { localStorage.removeItem(`citystyle_owner_notifications_enabled_${currentSalonId}`); } catch (err) {}
      if (btn) btn.textContent = "Dozvola blokirana";
      window.App.showMessage("Browser blokira notifikacije. Otvori Chrome podešavanja za citystyle.app i dozvoli Notifications.", "error");
      return;
    }

    const pushReady = await window.App.registerPushForSalon(currentSalonId, { forceNew: true, allowReset: true, showTestNotification: true });

    const hasBrowserPush = await ownerHasBrowserPushSubscription();

    const permissionGranted = (typeof Notification === "undefined") || Notification.permission === "granted";

    if (pushReady || hasBrowserPush || permissionGranted) {
      // If Android/Chrome granted notification permission, keep owner-facing status positive.
      markOwnerNotificationsEnabled();
      if (btn) btn.textContent = "✅ Obaveštenja uključena";
      refreshOwnerNotificationsButtonState();
      window.App.showMessage("Obaveštenja su uključena za nove termine.", "success");
    } else {
      if (btn) btn.textContent = "2. Uključi obaveštenja";
      window.App.showMessage("Chrome nije dozvolio obaveštenja. Klikni dugme ponovo i izaberi Dozvoli.", "info");
    }
  } catch (err) {
    console.error("enableOwnerNotifications failed:", err);
    if (btn) btn.textContent = "2. Uključi obaveštenja";
    window.App?.showMessage?.("Obaveštenja nisu uključena. Proveri Chrome dozvolu za citystyle.app i pokušaj ponovo.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("is-working");
      // Do not return to "Uključi" after success. Keep the real saved state visible.
      setTimeout(() => {
        if (!btn.classList.contains("is-working")) refreshOwnerNotificationsButtonState();
      }, 6000);
    }
  }
}

async function ensureOwnerPushIsActive(reason = "panel-open") {
  if (!currentSalonId || adminOwnerPreviewMode || ownerIsShopProfile()) return false;

  try {
    const enabled = localStorage.getItem(`citystyle_owner_notifications_enabled_${currentSalonId}`) === "1";
    if (!enabled) {
      refreshOwnerNotificationsButtonState();
      return false;
    }

    if (!("Notification" in window) || Notification.permission !== "granted") {
      refreshOwnerNotificationsButtonState();
      return false;
    }

    if ("serviceWorker" in navigator) {
      try {
        await navigator.serviceWorker.register("/sw.js?v=v231_white_shop", { scope: "/", updateViaCache: "none" });
        const registration = await navigator.serviceWorker.ready;
        if (registration?.update) {
          registration.update().catch(() => {});
        }
        console.log("Owner push service worker ready", { reason, scope: registration?.scope || null });
      } catch (swErr) {
        console.warn("Owner push service worker refresh failed", swErr);
      }
    }

    const ok = await window.App?.registerPushForSalon?.(currentSalonId, { forceNew: false, reason });
    const hasBrowserPush = await ownerHasBrowserPushSubscription();
    if (ok || hasBrowserPush) markOwnerNotificationsEnabled();
    refreshOwnerNotificationsButtonState();
    return !!(ok || hasBrowserPush);
  } catch (err) {
    console.warn("Owner push ensure failed:", err);
    refreshOwnerNotificationsButtonState();
    return false;
  }
}

async function autoRefreshOwnerPushRegistration() {
  return ensureOwnerPushIsActive("auto-refresh");
}

window.addEventListener("focus", () => {
  try { refreshOwnerNotificationsButtonState(); } catch (err) {}
});


document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    try { refreshOwnerNotificationsButtonState(); } catch (err) {}
  }
});

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

    ${error ? `<div class="card warning-box"><strong>Statistika još nije spremna.</strong><p class="muted">Statistika trenutno nije dostupna. Pokušajte ponovo kasnije.</p></div>` : ""}

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
  clearOwnerPendingAppointments();
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
        <h2>Termini</h2>
        <p class="muted">Pregled zahteva i zakazanih termina po datumu, vremenu, usluzi i korisniku.</p>
      </div>
      <div class="toolbar-actions">
        ${adminOwnerPreviewMode ? `<span class="status-pill">Samo pregled</span>` : ""}
        <button class="btn btn-dark btn-small" type="button" onclick="renderAppointments()">${S("refresh", "Osveži")}</button>
      </div>
    </div>

    ${renderOwnerSubscriptionNotice()}

    <div class="owner-dashboard-grid owner-dashboard-grid-two">
      <div class="owner-metric-card"><span>Danas</span><strong>${todayCount}</strong><small>aktivnih zahteva</small></div>
      <div class="owner-metric-card"><span>Ukupno aktivno</span><strong>${activeCount}</strong><small>novi i potvrđeni</small></div>
    </div>

    <div class="paper-toolbar card">
      <label>
        Prikaz
        <select id="appointment-filter" onchange="changeAppointmentFilter()">
          <option value="active" ${statusFilter === "active" ? "selected" : ""}>Aktivni termini</option>
          <option value="today" ${statusFilter === "today" ? "selected" : ""}>${S("todayAppointments", "Današnji termini")}</option>
          <option value="date" ${statusFilter === "date" ? "selected" : ""}>Termini po datumu</option>
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
  setTimeout(() => {
    const targetId = String(window.App?.getUrlParam?.("appointment_id") || "");
    if (targetId) {
      document.getElementById(`appointment-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById(`appointment-mobile-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 250);
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
    <tr id="appointment-${salonEscapeHtml(a.id)}" class="${String(window.App?.getUrlParam?.("appointment_id") || "") === String(a.id) ? "owner-highlight-appointment" : ""}">
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
    <div id="appointment-mobile-${salonEscapeHtml(a.id)}" class="paper-mobile-item ${String(window.App?.getUrlParam?.("appointment_id") || "") === String(a.id) ? "owner-highlight-appointment" : ""}">
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
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("381") && digits.length >= 10) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 8) return `+381${digits.slice(1)}`;
  // Srbija-only: broj bez nule tretiramo kao mobilni/lokalni srpski broj.
  if (/^[1-9]\d{6,}$/.test(digits)) return `+381${digits}`;
  return "";
}

function normalizePhoneForWhatsApp(phone) {
  const tel = normalizePhoneForTel(phone);
  return tel ? tel.replace(/\D/g, "") : "";
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
    <div class="owner-section-title">
      <div>
        <span class="owner-eyebrow">Upravljanje ponudom</span>
        <h2>Usluge</h2>
        <p class="muted">Uredite usluge koje mušterije biraju pri zakazivanju termina.</p>
      </div>
      ${adminOwnerPreviewMode ? `<span class="status-pill">Samo pregled</span>` : `<button class="btn btn-primary owner-add-btn" type="button" onclick="showAddServiceForm()">+ Dodaj uslugu</button>`}
    </div>
    <div id="service-form-box"></div>
    <div id="services-list" class="owner-service-list"><div class="loading-box">${S("loadingProfile", "Učitavanje usluga...")}</div></div>
  `;
  await loadServices();
}

async function loadServices() {
  const list = document.getElementById("services-list");
  const { data: services, error } = await window.db.from("services").select("*").eq("salon_id", currentSalonId).order("sort_order", { ascending: true });
  if (error) {
    list.innerHTML = `<div class="card"><p class="error-text">Greška pri učitavanju usluga.</p></div>`;
    return;
  }
  if (!services?.length) {
    list.innerHTML = `<div class="card center owner-empty-card"><h3>Još nema usluga</h3><p class="muted">${S("noServicesText", "Dodajte prvu uslugu kako bi klijenti mogli da zakažu termin.")}</p>${adminOwnerPreviewMode ? "" : `<button class="btn btn-primary" onclick="showAddServiceForm()">Dodaj prvu uslugu</button>`}</div>`;
    return;
  }
  list.innerHTML = `
    <div class="owner-services-table card">
      <div class="owner-services-head">
        <span>Usluga</span>
        <span>Trajanje</span>
        <span>Cena</span>
        <span>Status</span>
        <span>Akcije</span>
      </div>
      ${services.map(service => `
        <div class="owner-service-row ${service.active ? "" : "is-hidden"}">
          <div class="owner-service-main">
            <strong>${salonEscapeHtml(service.name)}</strong>
            ${service.category ? `<small>${salonEscapeHtml(service.category)}</small>` : ""}
            ${service.description ? `<p>${salonEscapeHtml(service.description)}</p>` : ""}
          </div>
          <div class="owner-service-duration">${Number(service.duration_minutes || 0)} min</div>
          <div class="owner-service-price">${window.App.formatServicePrice(service)}</div>
          <div><span class="owner-status-pill ${service.active ? "active" : "hidden-status"}">${service.active ? "Aktivna" : "Sakrivena"}</span></div>
          ${adminOwnerPreviewMode ? `<div class="owner-service-actions"><span class="status-pill">Pregled</span></div>` : `<div class="owner-service-actions">
            <button class="btn btn-dark btn-small" type="button" onclick="editService('${service.id}')">Uredi</button>
            <button class="btn btn-dark btn-small" type="button" onclick="toggleServiceActive('${service.id}', ${service.active ? "true" : "false"})">${service.active ? "Sakrij" : "Aktiviraj"}</button>
            <button class="btn btn-danger btn-small" type="button" onclick="deleteService('${service.id}')">${S("delete", "Obriši")}</button>
          </div>`}
        </div>
      `).join("")}
    </div>
  `;
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
        <option value="RSD" ${window.App.normalizeCurrency(service?.currency || "RSD") === "RSD" ? "selected" : ""}>Dinari (RSD)</option>
        <option value="EUR" ${window.App.normalizeCurrency(service?.currency || "RSD") === "EUR" ? "selected" : ""}>Evro (EUR)</option>
        <option value="KM" ${window.App.normalizeCurrency(service?.currency || "RSD") === "KM" ? "selected" : ""}>Konvertibilna marka (KM)</option>
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
      window.App.showMessage("Usluga je sačuvana.", "info");
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

function productPriceLabel(product = {}) {
  const price = Number(product.price || 0);
  const currency = window.App.normalizeCurrency(product.currency || "RSD");
  if (!price || price <= 0) return "Cena po dogovoru";
  return `${window.App.formatMoney ? window.App.formatMoney(price) : price.toLocaleString("sr-RS")} ${currency}`;
}


function ensureSalonCurrencyOptions(selectId, selectedValue = "RSD") {
  const select = document.getElementById(selectId);
  if (!select) return;
  const selected = window.App && window.App.normalizeCurrency ? window.App.normalizeCurrency(selectedValue || select.value || "RSD") : String(selectedValue || select.value || "RSD").toUpperCase();
  const options = [
    ["RSD", "RSD"],
    ["EUR", "EUR"],
    ["KM", "KM"]
  ];
  select.innerHTML = options.map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
}

function ensureAllSalonCurrencyOptions() {
  ensureSalonCurrencyOptions("service-currency", document.getElementById("service-currency")?.value || "RSD");
  ensureSalonCurrencyOptions("product-currency", document.getElementById("product-currency")?.value || "RSD");
  ensureSalonCurrencyOptions("garage-currency", document.getElementById("garage-currency")?.value || "EUR");
}

function productStatusLabel(status) {
  return {
    available: "Na stanju",
    preorder: "Po porudžbini",
    out: "Trenutno nema"
  }[status] || "Na upit";
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
        <p class="muted">Oglasi trenutno nisu dostupni. Pokušajte ponovo kasnije.</p>
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
            <option value="RSD" ${window.App.normalizeCurrency(item?.currency || 'EUR')==='RSD'?'selected':''}>RSD</option>
            <option value="EUR" ${window.App.normalizeCurrency(item?.currency || 'EUR')==='EUR'?'selected':''}>EUR</option>
            <option value="KM" ${window.App.normalizeCurrency(item?.currency || 'EUR')==='KM'?'selected':''}>KM</option>
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
  if (result.error) return window.App.showMessage("Oglas nije sačuvan. Proverite podatke i pokušajte ponovo.", "error");
  document.getElementById("garage-form-box").innerHTML = "";
  window.App.showMessage("Oglas je sačuvan.", "success");
  await loadGarageListings();
}

async function showGarageImages(listingId) {
  if (stopAdminOwnerPreviewEdit()) return;
  const box = document.getElementById("garage-form-box");
  const { data: listing } = await window.db.from("garage_listings").select("*").eq("id", listingId).eq("salon_id", currentSalonId).maybeSingle();
  const { data: images, error } = await window.db.from("garage_listing_images").select("*").eq("listing_id", listingId).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) return window.App.showMessage("Slike trenutno nisu dostupne. Pokušajte ponovo kasnije.", "error");
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
    return window.App.showMessage("Slika nije sačuvana. Pokušajte ponovo.", "error");
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
        <h2>Galerija</h2>
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
      <img src="${salonEscapeHtml(image.image_url)}" alt="Galerija">
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
    return window.App.showMessage("Slika nije sačuvana. Pokušajte ponovo.", "error");
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
  await prepareOwnerPanelManifest();
  await loadCurrentSettings();
  window.App.showMessage("Logo/slika profila je uspešno postavljena. Panel prečica će pokušati da koristi baš ovu sliku kao glavnu ikonicu.", "success");
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


function ownerIsShopProfile() {
  const raw = `${currentSalon?.business_type || ""} ${currentSalon?.profile_type || ""} ${currentSalon?.type || ""} ${currentSalon?.package_type || ""}`.toLowerCase();
  return /catalog|katalog|prodav|shop|store|patik|shoe|sneaker/.test(raw);
}


function setOwnerPanelLoggedInUI(isLoggedIn) {
  const tabs = document.getElementById("salon-tabs");
  const logoutBtn = document.getElementById("salon-logout-btn");
  const installBtn = document.getElementById("salon-install-btn");
  const notificationsBtn = document.getElementById("salon-notifications-btn");
  const nativeTestBtn = document.getElementById("salon-native-test-btn");
  const headerActions = document.getElementById("salon-header-actions");
  if (tabs) tabs.classList.toggle("hidden", !isLoggedIn);
  if (logoutBtn) logoutBtn.classList.toggle("hidden", !isLoggedIn || adminOwnerPreviewMode);
  if (installBtn) installBtn.classList.toggle("hidden", !isLoggedIn || adminOwnerPreviewMode);
  if (notificationsBtn) notificationsBtn.classList.toggle("hidden", !isLoggedIn || adminOwnerPreviewMode || ownerIsShopProfile());
  if (nativeTestBtn) nativeTestBtn.classList.toggle("hidden", !isLoggedIn || adminOwnerPreviewMode || ownerIsShopProfile());
  if (headerActions) headerActions.classList.toggle("hidden", !isLoggedIn);
  document.body.classList.toggle("owner-authenticated", !!isLoggedIn);
  document.body.classList.toggle("owner-logged-out", !isLoggedIn);
}
function removeOwnerLoginCards() {
  document.querySelectorAll(".login-card").forEach(card => {
    const content = (card.textContent || "").toLowerCase();
    if (content.includes("ulaz za vlasnika") || content.includes("panel vlasnika") || content.includes("email vlasnika") || content.includes("kod firme")) {
      card.remove();
    }
  });
}

function renderSalonDashboard() {
  removeOwnerLoginCards();
  setOwnerPanelLoggedInUI(true);
  const shop = ownerIsShopProfile();
  document.body.classList.toggle("owner-shop-profile", !!shop);
  document.body.classList.toggle("owner-salon-profile", !shop);
  const labels = shop ? {
    products: "Proizvodi",
    analytics: "Statistika",
    settings: "Podešavanja"
  } : {
    appointments: "Termini",
    services: "Usluge",
    products: "Proizvodi",
    analytics: "Statistika",
    garage: "Garaža",
    gallery: "Galerija",
    hours: "Radno vreme",
    settings: "Podešavanja"
  };
  document.querySelectorAll("#salon-tabs button").forEach(btn => {
    const allowed = !!labels[btn.dataset.section] && (!shop || ["products","analytics","settings"].includes(btn.dataset.section));
    btn.classList.toggle("hidden", !allowed || (btn.dataset.section === "garage" && !ownerHasGaragePackage()));
    if (labels[btn.dataset.section]) btn.textContent = labels[btn.dataset.section];
  });
  const ownerPanelName = "1. Skini app";
  document.getElementById("salon-install-btn").textContent = ownerPanelName;
  refreshOwnerNotificationsButtonState();
  document.getElementById("salon-logout-btn").textContent = "Odjava";
  document.getElementById("salon-name").textContent = currentSalon.salon_name || "Panel vlasnika biznisa";
  const expired = isPaymentExpired(currentSalon.paid_until);
  document.getElementById("salon-status-text").innerHTML = adminOwnerPreviewMode ? `Admin pregled vlasničkog panela • izmene su zaključane` : expired ? `Aktivan profil • <span class="danger-text">Uplata istekla</span>` : (shop ? `Aktivna prodavnica patika` : `Aktivan salon`);
  document.getElementById("salon-tabs").classList.remove("hidden");
  document.getElementById("salon-logout-btn").classList.toggle("hidden", adminOwnerPreviewMode);
  document.getElementById("salon-install-btn")?.classList.toggle("hidden", adminOwnerPreviewMode);
  applyAdminOwnerPreviewHeader();
  // Keep existing push registration alive when owner opens the installed panel.
  setTimeout(() => { ensureOwnerPushIsActive("render-dashboard"); }, 900);
}

async function showSection(section) {
  if (!currentSalonId) return renderSalonLogin();
  if (ownerIsShopProfile() && !["products","analytics","settings"].includes(section)) section = "products";
  setActiveTab(section);
  if (section === "appointments") return renderAppointments();
  if (section === "services") return renderServices();
  if (section === "products") return renderProducts();
  if (section === "analytics") return renderAnalytics();
  if (section === "garage") { if (!ownerHasGaragePackage()) { window.App.showMessage("Garaža je dostupna samo za Garaža pakete koje uključuje admin.", "error"); return renderAppointments(); } return renderGarage(); }
  if (section === "gallery") return renderGallery();
  if (section === "hours") return renderWorkingHours();
  if (section === "settings") return renderSalonSettings();
}

function normalizeOwnerPrice(value) {
  let raw = String(value || "").trim().replace(/rsd|din|eur|€/gi, "").replace(/\s+/g, "");
  if (!raw) return 0;
  let digits = raw.replace(/[^0-9]/g, "");
  const dotParts = raw.split(".");
  if (dotParts.length === 2 && dotParts[0].length <= 3 && dotParts[1].length > 0 && dotParts[1].length < 3) digits = dotParts[0].replace(/\D/g, "") + dotParts[1].replace(/\D/g, "").padEnd(3, "0");
  return Number(digits || 0);
}

async function renderProducts() {
  const title = ownerIsShopProfile() ? "Proizvodi / oglasi prodavnice patika" : "Proizvodi";
  document.getElementById("salon-content").innerHTML = `
    <div class="section-head">
      <div><h2>${title}</h2><p class="muted">Dodajte, izmenite i uredite proizvode koje korisnik vidi na javnoj stranici.</p></div>
      <button class="btn btn-primary" type="button" onclick="showAddProductForm()">Dodaj proizvod</button>
    </div>
    <div id="product-form-box"></div>
    <div id="products-list" class="cards"><div class="loading-box">Učitavanje proizvoda...</div></div>`;
  await loadProducts();
}

async function loadProducts() {
  const list = document.getElementById("products-list");
  const { data: products, error } = await window.db.from("products").select("*").eq("salon_id", currentSalonId).order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  if (error) { list.innerHTML = `<div class="card"><p class="error-text">Proizvodi trenutno nisu dostupni. Pokušajte ponovo kasnije.</p></div>`; return; }
  if (!products?.length) { list.innerHTML = `<div class="card center"><p class="muted">Još nema proizvoda.</p><button class="btn btn-primary" onclick="showAddProductForm()">Dodaj prvi proizvod</button></div>`; return; }
  list.innerHTML = products.map(product => `
    <div class="card product-card ${product.active ? "" : "muted-card"}">
      <div class="product-card-main">
        ${product.image_url ? `<img class="owner-product-thumb" src="${salonEscapeHtml(product.image_url)}" alt="${salonEscapeHtml(product.name)}">` : `<div class="owner-product-thumb owner-product-empty">Bez slike</div>`}
        <div><strong>${salonEscapeHtml(product.name)}</strong>${product.category ? `<span>${salonEscapeHtml(product.category)}</span>` : ""}${product.description ? `<p class="muted">${salonEscapeHtml(product.description)}</p>` : ""}<p class="muted">${salonEscapeHtml(product.public_code || String(product.id).slice(0,8).toUpperCase())}</p></div>
        <div class="product-price-box"><b>${productPriceLabel(product)}</b><small>${productStatusLabel(product.stock_status)}</small><small>${product.active ? "Javno prikazan" : "Sakriven"}</small></div>
      </div>
      <div class="card-actions">
        <button class="btn btn-dark" type="button" onclick="editProduct('${product.id}')">Uredi</button>
        <button class="btn btn-dark" type="button" onclick="showProductImages('${product.id}')">Slike</button>
        <button class="btn btn-dark" type="button" onclick="copyProductLink('${product.id}')">Kopiraj link</button>
        <button class="btn btn-dark" type="button" onclick="previewProductAsClient('${product.id}')">Pogledaj kao klijent</button>
        <button class="btn btn-dark" type="button" onclick="toggleProductActive('${product.id}', ${product.active ? "true" : "false"})">${product.active ? "Sakrij" : "Aktiviraj"}</button>
        <button class="btn btn-danger" type="button" onclick="deleteProduct('${product.id}')">Obriši</button>
      </div>
    </div>`).join("");
}

async function showAddProductForm(productId = null) {
  if (stopAdminOwnerPreviewEdit()) return;
  const box = document.getElementById("product-form-box");
  let product = null;
  if (productId) { const { data } = await window.db.from("products").select("*").eq("id", productId).eq("salon_id", currentSalonId).maybeSingle(); product = data; }
  box.innerHTML = `<div class="card product-edit-card"><h3>${product ? "Uredi oglas / proizvod" : "Novi oglas / proizvod"}</h3>
    <input id="product-edit-id" type="hidden" value="${product ? salonEscapeHtml(product.id) : ""}">
    <label>Naziv proizvoda</label><input id="product-name" type="text" value="${product ? salonEscapeHtml(product.name) : ""}" placeholder="Primer: Nike Air Max"><p class="field-help">Upišite glavni naziv koji kupac prvo vidi.</p>
    <label>Brend / kategorija</label><input id="product-category" type="text" value="${product ? salonEscapeHtml(product.category || "") : ""}" placeholder="Primer: Nike / patike"><p class="field-help">Ovde ide brend ili kategorija proizvoda.</p>
    <label>Opis / brojevi</label><textarea id="product-description" rows="3" placeholder="Primer: Brojevi od 40 do 46">${product ? salonEscapeHtml(product.description || "") : ""}</textarea><p class="field-help">Ovde napišite kratki opis, brojeve, veličine ili kratku napomenu za kupca.</p>
    <div class="grid two"><div><label>Cena</label><input id="product-price" type="text" inputmode="numeric" value="${product ? salonEscapeHtml(product.price || "") : ""}" placeholder="Primer: 4700"></div><div><label>Valuta</label><select id="product-currency"><option value="RSD" ${window.App.normalizeCurrency(product?.currency || "RSD") === "RSD" ? "selected" : ""}>RSD</option><option value="EUR" ${window.App.normalizeCurrency(product?.currency || "RSD") === "EUR" ? "selected" : ""}>EUR</option><option value="KM" ${window.App.normalizeCurrency(product?.currency || "RSD") === "KM" ? "selected" : ""}>KM</option></select></div></div>
    <label>Status dostupnosti</label><select id="product-stock-status"><option value="available" ${!product || product.stock_status === "available" ? "selected" : ""}>Na stanju</option><option value="preorder" ${product && product.stock_status === "preorder" ? "selected" : ""}>Po porudžbini</option><option value="out" ${product && product.stock_status === "out" ? "selected" : ""}>Trenutno nema</option></select><p class="field-help">Kupac u otvorenom oglasu vidi i ovaj status.</p>
    <label>Redosled</label><input id="product-sort-order" type="number" value="${product ? Number(product.sort_order || 100) : 100}">
    <label>Glavna slika proizvoda</label>${product?.image_url ? `<img class="owner-product-preview" src="${salonEscapeHtml(product.image_url)}" alt="Slika proizvoda"><p class="field-help">Ako ne izaberete novu sliku, ostaje postojeća.</p>` : ""}<input id="product-main-image" type="file" accept="image/png,image/jpeg,image/webp">
    <p class="field-help product-upload-tip"><strong>Preporuka za najbolji prikaz:</strong> koristite uspravne slike približno <strong>2:3 ili 3:4</strong>. Proizvod neka bude u donjem/srednjem delu slike, sa čistom pozadinom i malo praznog prostora iznad za naziv, cenu i dugmad.</p>
    <div class="card-actions"><button class="btn btn-primary" type="button" onclick="saveProduct()">${product ? "Sačuvaj izmene" : "Dodaj proizvod"}</button><button class="btn btn-dark" type="button" onclick="hideProductForm()">Otkaži</button></div></div>`;
  ensureSalonCurrencyOptions("product-currency", product?.currency || "RSD");
  box.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveProduct() {
  if (stopAdminOwnerPreviewEdit()) return;
  const id = document.getElementById("product-edit-id")?.value || "";
  const name = document.getElementById("product-name")?.value.trim();
  const category = document.getElementById("product-category")?.value.trim() || null;
  const description = document.getElementById("product-description")?.value.trim() || null;
  const price = normalizeOwnerPrice(document.getElementById("product-price")?.value || 0);
  const currency = window.App.normalizeCurrency(document.getElementById("product-currency")?.value || "RSD");
  const stock_status = document.getElementById("product-stock-status")?.value || "available";
  const sort_order = Number(document.getElementById("product-sort-order")?.value || 100);
  let existing = null;
  if (id) { const { data } = await window.db.from("products").select("image_url").eq("id", id).eq("salon_id", currentSalonId).maybeSingle(); existing = data; }
  let image_url = existing?.image_url || null;
  const file = document.getElementById("product-main-image")?.files?.[0];
  if (file) image_url = await window.StorageHelper.uploadImage(file, currentSalonId, "product");
  if (!name) return window.App.showMessage("Unesite naziv proizvoda.", "error");
  const payload = { name, category, description, price, currency, stock_status, sort_order, image_url, updated_at: new Date().toISOString() };
  if (id) { const { error } = await window.db.from("products").update(payload).eq("id", id).eq("salon_id", currentSalonId); if (error) return window.App.showMessage("Proizvod nije sačuvan. Proverite da li su podaci dobro uneti i pokušajte ponovo.", "error"); }
  else { const public_code = `${String(currentSalon?.slug || 'CS').replace(/[^a-z0-9]/gi,'').slice(0,3).toUpperCase() || 'CS'}-${Date.now().toString().slice(-5)}`; const { error } = await window.db.from("products").insert({ ...payload, public_code, salon_id: currentSalonId, active: true }); if (error) return window.App.showMessage("Proizvod nije dodat. Proverite podatke i pokušajte ponovo.", "error"); }
  hideProductForm(); await loadProducts(); window.App.showMessage("Proizvod je sačuvan.", "success");
}

async function showProductImages(productId) {
  const { data: product } = await window.db.from("products").select("*").eq("id", productId).eq("salon_id", currentSalonId).maybeSingle();
  let imgs = [];
  try { const { data } = await window.db.from("product_images").select("*").eq("product_id", productId).order("sort_order", { ascending:true }).order("created_at", { ascending:true }); imgs = data || []; } catch(e) {}
  const modal = document.createElement("div"); modal.className = "legal-modal-backdrop"; modal.innerHTML = `<div class="legal-modal-card"><div class="legal-modal-head"><h2>Slike: ${salonEscapeHtml(product?.name || 'Proizvod')}</h2><button class="btn btn-dark" onclick="this.closest('.legal-modal-backdrop').remove()">Zatvori</button></div><div class="legal-modal-body"><div class="card"><label>Dodaj dodatne slike<input id="product-extra-images" type="file" accept="image/png,image/jpeg,image/webp" multiple></label><p class="field-help product-upload-tip"><strong>Preporuka:</strong> najbolje rade uspravne slike približno <strong>2:3 ili 3:4</strong>, sa proizvodom jasno dole/sredina i čistim prostorom iznad.</p><button class="btn btn-primary" onclick="uploadProductExtraImages('${productId}')">Upload slika</button></div><div class="owner-gallery-grid">${imgs.map(img => `<div class="card owner-gallery-card"><img src="${salonEscapeHtml(img.image_url)}" alt="Slika"><button class="btn btn-danger btn-small" onclick="deleteProductExtraImage('${img.id}','${productId}','${salonEscapeJs(img.image_url)}')">Obriši</button></div>`).join("") || '<p class="muted">Nema dodatnih slika.</p>'}</div></div></div>`; document.body.appendChild(modal);
}
async function uploadProductExtraImages(productId) { const files = Array.from(document.getElementById("product-extra-images")?.files || []).slice(0,10); for (const file of files) { const url = await window.StorageHelper.uploadImage(file, currentSalonId, "product_extra"); if (url) await window.db.from("product_images").insert({ product_id: productId, image_url: url, sort_order: 100 }); } document.querySelector('.legal-modal-backdrop')?.remove(); await showProductImages(productId); }
async function deleteProductExtraImage(imageId, productId, imageUrl) { await window.StorageHelper.deleteImage(imageUrl); await window.db.from("product_images").delete().eq("id", imageId); document.querySelector('.legal-modal-backdrop')?.remove(); await showProductImages(productId); }
function copyProductLink(productId) { const code = productId; const link = `${window.App.getSalonPublicLink(currentSalon.slug)}&product=${encodeURIComponent(code)}`; navigator.clipboard.writeText(link).then(()=>window.App.showMessage("Link oglasa je kopiran.", "success")).catch(()=>prompt("Kopiraj link oglasa:", link)); }
function previewProductAsClient(productId) { window.location.href = `${window.App.getSalonPublicLink(currentSalon.slug)}&product=${encodeURIComponent(productId)}&ownerPreview=1`; }

async function renderSalonSettings() {
  const salonLink = window.App.getSalonPublicLink(currentSalon.slug);
  const previewLink = `${salonLink}${salonLink.includes("?") ? "&" : "?"}ownerPreview=1`;
  const qrUrl = window.App.getQrImageUrl(salonLink, 260);
  const shop = ownerIsShopProfile();
  document.getElementById("salon-content").innerHTML = `
    <div class="section-head"><div><h2>${shop ? "Profil prodavnice" : S("profileSettings", "Podešavanje profila")}</h2><p class="muted">Uredite podatke koje korisnici vide na javnoj stranici profila.</p></div><a class="btn btn-primary" href="${adminOwnerPreviewMode ? `${window.App.getSalonPublicLink(currentSalon.slug)}&adminPreview=1&from=admin` : previewLink}">Pogledaj javnu stranicu</a></div>
    ${adminOwnerPreviewMode ? `<div class="warning-box">Admin pregled vlasničkog panela je samo za proveru izgleda. Dugmad za izmene su zaključana.</div>` : ""}
    <div class="card center"><h3>QR kod profila</h3><p class="muted">Ovaj QR kod vodi korisnike direktno na javnu stranicu profila.</p><img class="qr-img" src="${qrUrl}" alt="QR kod profila"><div class="link-box"><small>Link za klijente:</small><input readonly value="${salonLink}"></div><div class="card-actions" style="justify-content:center"><button class="btn btn-primary" type="button" onclick="copyMySalonLink()">Kopiraj link</button><a class="btn btn-dark" href="${previewLink}">Pogledaj javnu stranicu</a></div></div>
    <div class="card"><h3>${shop ? "Logo / slika profila prodavnice" : "Logo / slika profila salona"}</h3><p class="muted">Ova slika se koristi kao glavna slika profila i kao prva opcija za prečicu vlasničkog panela. Najbolje je kvadratna PNG/JPG slika sa jasnim logom.</p><input type="file" id="logo-upload" accept="image/png,image/jpeg,image/webp"><button class="btn btn-primary" type="button" onclick="uploadLogo()">Postavi / promeni logo</button><div id="current-logo" class="image-preview-box"></div></div>
    ${shop ? `<div class="card"><h3>Početna slika prodavnice</h3><p class="muted">Ova velika slika se prikazuje iznad oglasa. Koristi se za prečicu samo ako nema loga/slike profila.</p><input type="file" id="cover-upload" accept="image/png,image/jpeg,image/webp"><button class="btn btn-primary" type="button" onclick="uploadCoverImage()">Postavi / promeni početnu sliku</button><div id="current-cover" class="image-preview-box"></div></div>` : ""}
    <div class="card settings-text-card"><h3>Podaci profila</h3><label>Naziv profila koji korisnici vide</label><input id="welcome-title" type="text" placeholder="${salonEscapeHtml(currentSalon?.salon_name || 'Naziv biznisa')}"><label>${shop ? "Kratak opis ispod loga" : "Opis / poruka korisnicima"}</label><textarea id="welcome-text" rows="4" placeholder="${shop ? "Nova kolekcija patika, dostupni brojevi i porudžbine preko WhatsApp-a." : "Izaberite uslugu, datum i zakažite termin."}"></textarea><label>Telefon / WhatsApp</label><input id="salon-phone" type="text" placeholder="064 123 4567"><label>Adresa / lokacija</label><input id="salon-address" type="text" placeholder="Adresa ili mesto poslovanja"><div class="settings-preview" id="settings-public-preview"></div><div class="card-actions settings-main-actions"><button class="btn btn-primary" type="button" onclick="saveSettings()">${S("save", "Sačuvaj")} podešavanja</button><button class="btn btn-dark" type="button" onclick="saveSettingsAndPreview()">${S("save", "Sačuvaj")} i pogledaj javnu stranicu</button></div></div>`;
  await loadCurrentSettings(); bindSettingsPreview();
}

async function loadCurrentSettings() {
  const { data: settings } = await window.db.from("salon_settings").select("*").eq("salon_id", currentSalonId).maybeSingle();
  if (settings) {
    document.getElementById("welcome-title").value = settings.welcome_title || "";
    document.getElementById("welcome-text").value = settings.welcome_text || "";
    document.getElementById("salon-phone").value = settings.phone || "";
    document.getElementById("salon-address").value = settings.address || "";
    if (settings.logo_url) document.getElementById("current-logo").innerHTML = `<img src="${salonEscapeHtml(settings.logo_url)}" alt="Logo" class="preview-logo">`;
    if (settings.cover_image_url && document.getElementById("current-cover")) document.getElementById("current-cover").innerHTML = `<img src="${salonEscapeHtml(settings.cover_image_url)}" alt="Početna slika" class="preview-cover">`;
  }
  updateSettingsPreview();
}

async function saveSettings() {
  if (stopAdminOwnerPreviewEdit()) return;
  const payload = { salon_id: currentSalonId, welcome_title: document.getElementById("welcome-title")?.value.trim() || "", welcome_text: document.getElementById("welcome-text")?.value.trim() || "", phone: document.getElementById("salon-phone")?.value.trim() || "", address: document.getElementById("salon-address")?.value.trim() || "" };
  const { error } = await window.db.from("salon_settings").upsert(payload, { onConflict: "salon_id" });
  if (error) return window.App.showMessage("Greška pri čuvanju podešavanja.", "error");
  await loadCurrentSettings(); window.App.showMessage("Podešavanja su sačuvana.", "success");
}

async function uploadCoverImage() {
  if (stopAdminOwnerPreviewEdit()) return;
  const file = document.getElementById("cover-upload")?.files?.[0];
  if (!file) return window.App.showMessage("Izaberite početnu sliku.", "error");
  const url = await window.StorageHelper.uploadImage(file, currentSalonId, "cover");
  if (!url) return;
  const { error } = await window.db.from("salon_settings").upsert({ salon_id: currentSalonId, cover_image_url: url }, { onConflict: "salon_id" });
  if (error) return window.App.showMessage("Početna slika nije sačuvana. Pokušajte ponovo.", "error");
  await prepareOwnerPanelManifest();
  await loadCurrentSettings(); window.App.showMessage("Početna slika je postavljena. Panel prečica će je koristiti samo ako nema logo/sliku profila. Galerijske slike se ne koriste za prečicu.", "success");
}

Object.assign(window, { showProductImages, uploadProductExtraImages, deleteProductExtraImage, copyProductLink, previewProductAsClient, uploadCoverImage, ensureOwnerPushIsActive });


// Safety patch: if an older browser/service-worker leaves a select with only RSD, repopulate currencies.
setTimeout(() => { try { ensureAllSalonCurrencyOptions(); } catch (e) {} }, 300);
