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

  const items = salons || [];
  const activeCount = items.filter(s => s.status === "active").length;
  const blockedCount = items.filter(s => s.status === "blocked").length;
  const expiredCount = items.filter(s => isPaymentExpired(s.paid_until)).length;

  stats.innerHTML = `
    <div class="stat-card"><span>Ukupno profila</span><strong>${items.length}</strong></div>
    <div class="stat-card"><span>Aktivni</span><strong>${activeCount}</strong></div>
    <div class="stat-card"><span>Blokirani</span><strong>${blockedCount}</strong></div>
    <div class="stat-card danger"><span>Uplata istekla</span><strong>${expiredCount}</strong></div>
  `;

  if (!items.length) {
    list.innerHTML = `<div class="card center"><h3>Nema dodatih profila</h3><p class="muted">Dodajte prvi biznis profil kako biste generisali njegov link i QR kod.</p></div>`;
    return;
  }

  try {
    list.innerHTML = `<div class="cards">${items.map(renderSalonCard).join("")}</div>`;
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
        <div><span>Uplaćeno od</span><strong>${salon.paid_from ? window.App.formatDate(salon.paid_from) : "—"}</strong></div>
        <div><span>Uplaćeno do</span><strong>${salon.paid_until ? window.App.formatDate(salon.paid_until) : "—"}</strong></div>
        <div><span>Cena</span><strong>${Number(salon.monthly_price || 9.99).toFixed(2)} ${adminEscapeHtml(salon.currency || "EUR")}</strong></div>
      </div>
      ${expired ? `<div class="warning-box">Uplata je istekla. Profil ostaje aktivan dok ga administrator ručno ne blokira.</div>` : ""}
      <div class="link-box"><small>Link profila:</small><input readonly value="${salonLink}"></div>
      <div class="card-actions">
        <button class="btn btn-dark" type="button" onclick="copySalonLink('${salon.slug}')">Kopiraj link</button>
        <button class="btn btn-dark" type="button" onclick="showQrForSalon('${salon.slug}', '${adminEscapeJs(salon.salon_name)}')">QR kod</button>
        <button class="btn btn-dark" type="button" onclick="editSalonProfile('${salon.id}')">Izmeni</button>
        <button class="btn btn-dark" type="button" onclick="extendPayment('${salon.id}', '${salon.paid_until || ""}')">Produži uplatu</button>
        <button class="btn ${salon.status === "active" ? "btn-warning" : "btn-success"}" type="button" onclick="toggleSalonStatus('${salon.id}', '${salon.status}')">${salon.status === "active" ? "Blokiraj" : "Aktiviraj"}</button>
        <button class="btn btn-danger" type="button" onclick="deleteSalon('${salon.id}')">Obriši</button>
      </div>
    </div>
  `;
}

async function showAddSalonForm() {
  const name = prompt("Naziv biznisa:");
  if (!name) return;
  const email = prompt("Email vlasnika biznisa:");
  if (!email) return;
  const code = prompt("Kod firme / profila (npr. CS-1001):");
  if (!code) return;
  const city = prompt("Grad / mesto:", "") || null;
  const phone = prompt("Telefon biznisa:", "") || null;

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
    window.App.showMessage("Greška pri dodavanju profila: " + error.message, "error");
    return;
  }

  await createDefaultWorkingHours(salon.id);
  await createDefaultSettings(salon.id, cleanName, phone, city);
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

  const phone = prompt("Telefon biznisa:", salon.phone || "");
  if (phone === null) return;

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

  if (!cleanName || !cleanEmail || !cleanCode) {
    window.App.showMessage("Naziv, email i kod firme su obavezni.", "error");
    return;
  }

  const { error: updateError } = await window.db
    .from("salons")
    .update({
      salon_name: cleanName,
      owner_email: cleanEmail,
      company_code: cleanCode,
      city: cleanCity,
      phone: cleanPhone,
      slug
    })
    .eq("id", id);

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
