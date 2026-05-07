// assets/js/admin.js

const escapeHtml = (value) => window.App.escapeHtml(value);
const escapeJs = (value) => window.App.escapeJs(value);

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
      <h2>Admin login</h2>
      <p class="muted">Pristup ima samo duskomacak@gmail.com.</p>
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
        <h2>Saloni</h2>
        <p class="muted">Dodavanje salona, QR linkovi, statusi i uplate.</p>
      </div>
      <div class="toolbar-actions">
        <button class="btn btn-primary" type="button" onclick="showAddSalonForm()">+ Dodaj salon</button>
        <button class="btn btn-dark" type="button" onclick="handleAdminLogout()">Odjavi se</button>
      </div>
    </div>
    <div id="admin-stats" class="stats-grid"></div>
    <div id="salons-list"><div class="loading-box">Učitavanje salona...</div></div>
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

  const items = salons || [];
  const activeCount = items.filter(s => s.status === "active").length;
  const blockedCount = items.filter(s => s.status === "blocked").length;
  const expiredCount = items.filter(s => isPaymentExpired(s.paid_until)).length;

  stats.innerHTML = `
    <div class="stat-card"><span>Ukupno</span><strong>${items.length}</strong></div>
    <div class="stat-card"><span>Aktivni</span><strong>${activeCount}</strong></div>
    <div class="stat-card"><span>Blokirani</span><strong>${blockedCount}</strong></div>
    <div class="stat-card danger"><span>Uplata istekla</span><strong>${expiredCount}</strong></div>
  `;

  if (!items.length) {
    list.innerHTML = `<div class="card center"><h3>Nema salona</h3><p class="muted">Dodaj prvi salon.</p></div>`;
    return;
  }

  list.innerHTML = `<div class="cards">${items.map(renderSalonCard).join("")}</div>`;
}

function renderSalonCard(salon) {
  const expired = isPaymentExpired(salon.paid_until);
  const salonLink = `${window.location.origin}/?salon=${encodeURIComponent(salon.slug)}`;
  const statusClass = salon.status === "active" ? "active" : "blocked";

  return `
    <div class="card salon-card">
      <div class="salon-card-head">
        <div>
          <h3>${escapeHtml(salon.salon_name)}</h3>
          <p class="muted">${escapeHtml(salon.owner_email)} | ${escapeHtml(salon.company_code)}</p>
        </div>
        <span class="status-pill ${statusClass}">${salon.status === "active" ? "Aktivan" : "Blokiran"}</span>
      </div>
      <div class="info-grid">
        <div><span>Slug</span><strong>${escapeHtml(salon.slug)}</strong></div>
        <div><span>Uplaćeno od</span><strong>${salon.paid_from ? window.App.formatDate(salon.paid_from) : "—"}</strong></div>
        <div><span>Uplaćeno do</span><strong>${salon.paid_until ? window.App.formatDate(salon.paid_until) : "—"}</strong></div>
        <div><span>Cena</span><strong>${Number(salon.monthly_price || 9.99).toFixed(2)} ${escapeHtml(salon.currency || "EUR")}</strong></div>
      </div>
      ${expired ? `<div class="warning-box">Uplata je istekla — salon se ne blokira automatski.</div>` : ""}
      <div class="link-box"><small>Link salona:</small><input readonly value="${salonLink}"></div>
      <div class="card-actions">
        <button class="btn btn-dark" type="button" onclick="copySalonLink('${salon.slug}')">Kopiraj link</button>
        <button class="btn btn-dark" type="button" onclick="showQrForSalon('${salon.slug}', '${escapeJs(salon.salon_name)}')">QR kod</button>
        <button class="btn btn-dark" type="button" onclick="extendPayment('${salon.id}', '${salon.paid_until || ""}')">Produži uplatu</button>
        <button class="btn ${salon.status === "active" ? "btn-warning" : "btn-success"}" type="button" onclick="toggleSalonStatus('${salon.id}', '${salon.status}')">${salon.status === "active" ? "Blokiraj" : "Aktiviraj"}</button>
        <button class="btn btn-danger" type="button" onclick="deleteSalon('${salon.id}')">Obriši</button>
      </div>
    </div>
  `;
}

async function showAddSalonForm() {
  const name = prompt("Naziv salona:");
  if (!name) return;
  const email = prompt("Email vlasnika salona:");
  if (!email) return;
  const code = prompt("Kod firme / salona (npr. CS-1001):");
  if (!code) return;
  const city = prompt("Grad / mesto:", "") || null;
  const phone = prompt("Telefon salona:", "") || null;

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();
  const slug = createSlug(cleanName);
  const today = new Date();
  const paidFrom = toDateInput(today);
  const paidUntil = toDateInput(addDays(today, 30));

  const { data: salon, error } = await window.db
    .from("salons")
    .insert({
      salon_name: cleanName,
      slug,
      owner_email: cleanEmail,
      company_code: cleanCode,
      phone,
      city,
      status: "active",
      paid_from: paidFrom,
      paid_until: paidUntil,
      monthly_price: 9.99,
      currency: "EUR",
      is_deleted: false
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    window.App.showMessage("Greška pri dodavanju salona: " + error.message, "error");
    return;
  }

  await createDefaultWorkingHours(salon.id);
  await createDefaultSettings(salon.id, cleanName, phone, city);
  window.App.showMessage("Salon je uspešno dodat.", "success");
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
    welcome_text: "Zakažite svoj termin brzo i jednostavno.",
    phone,
    address: city || null
  }, { onConflict: "salon_id" });
}

async function extendPayment(id, currentPaidUntil) {
  const baseDate = currentPaidUntil && new Date(currentPaidUntil) > new Date() ? new Date(currentPaidUntil) : new Date();
  const suggestedDate = toDateInput(addDays(baseDate, 30));
  const newDate = prompt("Novi paid_until datum (YYYY-MM-DD):", suggestedDate);
  if (!newDate) return;

  const { error } = await window.db.from("salons").update({ paid_until: newDate }).eq("id", id);
  if (error) {
    window.App.showMessage("Greška pri produženju uplate.", "error");
    return;
  }
  window.App.showMessage("Uplata je produžena.", "success");
  await loadSalonsList();
}

async function toggleSalonStatus(id, currentStatus) {
  const newStatus = currentStatus === "active" ? "blocked" : "active";
  if (!confirm(newStatus === "blocked" ? "Blokirati salon?" : "Aktivirati salon?")) return;
  const { error } = await window.db.from("salons").update({ status: newStatus }).eq("id", id);
  if (error) {
    window.App.showMessage("Greška pri promeni statusa.", "error");
    return;
  }
  await loadSalonsList();
}

async function deleteSalon(id) {
  if (!confirm("Skloniti salon? Ovo je soft-delete.")) return;
  const { error } = await window.db.from("salons").update({ is_deleted: true, status: "deleted" }).eq("id", id);
  if (error) {
    window.App.showMessage("Greška pri brisanju salona.", "error");
    return;
  }
  await loadSalonsList();
}

function copySalonLink(slug) {
  const link = `${window.location.origin}/?salon=${encodeURIComponent(slug)}`;
  navigator.clipboard.writeText(link).then(() => {
    window.App.showMessage("Link salona je kopiran.", "success");
  }).catch(() => prompt("Kopiraj link:", link));
}

function showQrForSalon(slug, salonName) {
  const link = `${window.location.origin}/?salon=${encodeURIComponent(slug)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(link)}`;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal-card">
      <h2>QR kod</h2>
      <p class="muted">${escapeHtml(salonName)}</p>
      <img class="qr-img" src="${qrUrl}" alt="QR kod za salon">
      <div class="link-box"><input readonly value="${link}"></div>
      <button class="btn btn-primary" type="button" onclick="copySalonLink('${slug}')">Kopiraj link</button>
      <button class="btn btn-dark" type="button" onclick="this.closest('.modal-backdrop').remove()">Zatvori</button>
    </div>`;
  document.body.appendChild(modal);
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
