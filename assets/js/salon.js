// assets/js/salon.js

let currentSalon = null;
let currentSalonId = null;
let currentSection = "appointments";
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
  document.getElementById("salon-name").textContent = "Salon Panel";
  document.getElementById("salon-status-text").textContent = "Prijavite se preko email-a i koda firme.";
  document.getElementById("salon-tabs").classList.add("hidden");
  document.getElementById("salon-logout-btn").classList.add("hidden");
  document.getElementById("salon-content").innerHTML = `
    <div class="card login-card">
      <h2>Ulaz za salon</h2>
      <p class="muted">Unesite email salona i kod firme koji vam je dodelio admin.</p>
      <label>Email salona</label>
      <input id="salon-login-email" type="email" placeholder="salon@email.com">
      <label>Kod firme</label>
      <input id="salon-login-code" type="text" placeholder="CS-1001">
      <button class="btn btn-primary" type="button" onclick="handleSalonLogin()">Uđi u salon</button>
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
  document.getElementById("salon-status-text").textContent = "Salon je blokiran.";
  document.getElementById("salon-tabs").classList.add("hidden");
  document.getElementById("salon-logout-btn").classList.remove("hidden");
  document.getElementById("salon-content").innerHTML = `
    <div class="card center"><h2>Salon je trenutno blokiran</h2><p>Kontaktirajte administratora platforme.</p></div>
  `;
}

function renderSalonDashboard() {
  document.getElementById("salon-name").textContent = currentSalon.salon_name || "Salon Panel";
  const expired = isPaymentExpired(currentSalon.paid_until);
  document.getElementById("salon-status-text").innerHTML = expired
    ? `Aktivan salon • <span class="danger-text">Uplata istekla</span>`
    : `Aktivan salon`;
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
  content.innerHTML = `<div class="loading-box">Učitavanje termina...</div>`;
  const today = new Date().toISOString().split("T")[0];
  const { data: appointments, error } = await window.db
    .from("appointments")
    .select("*")
    .eq("salon_id", currentSalonId)
    .gte("appointment_date", today)
    .order("appointment_date", { ascending: true })
    .order("appointment_time", { ascending: true });

  if (error) {
    console.error(error);
    content.innerHTML = `<div class="card"><p class="error-text">Greška pri učitavanju termina.</p></div>`;
    return;
  }
  const items = appointments || [];
  if (!items.length) {
    content.innerHTML = `<div class="card center"><h2>Termini</h2><p class="muted">Nema budućih termina.</p></div>`;
    return;
  }
  content.innerHTML = `
    <div class="section-head"><div><h2>Termini</h2><p class="muted">Danas i budući termini.</p></div></div>
    <div class="cards">${items.map(renderAppointmentCard).join("")}</div>
  `;
}

function renderAppointmentCard(a) {
  return `
    <div class="card appointment-card">
      <div class="appointment-top">
        <div><strong>${window.App.formatDate(a.appointment_date)} u ${salonEscapeHtml(String(a.appointment_time).slice(0,5))}</strong><p class="muted">${salonEscapeHtml(a.service_name_snapshot || "Usluga")}</p></div>
        <span class="status-pill ${salonEscapeHtml(a.status)}">${getAppointmentStatusLabel(a.status)}</span>
      </div>
      <div class="info-grid">
        <div><span>Klijent</span><strong>${salonEscapeHtml(a.client_name)}</strong></div>
        <div><span>Telefon</span><strong>${salonEscapeHtml(a.client_phone)}</strong></div>
        <div><span>Trajanje</span><strong>${Number(a.duration_snapshot || 0)} min</strong></div>
        <div><span>Cena</span><strong>${Number(a.price_snapshot || 0).toLocaleString("sr-RS")} RSD</strong></div>
      </div>
      ${a.note ? `<p class="note-box">${salonEscapeHtml(a.note)}</p>` : ""}
      <div class="card-actions">
        ${a.status === "new" ? `<button class="btn btn-success" type="button" onclick="updateAppointmentStatus('${a.id}', 'confirmed')">Potvrdi</button>` : ""}
        ${a.status === "confirmed" ? `<button class="btn btn-primary" type="button" onclick="updateAppointmentStatus('${a.id}', 'done')">Završeno</button>` : ""}
        ${a.status !== "cancelled" && a.status !== "done" ? `
          <button class="btn btn-warning" type="button" onclick="updateAppointmentStatus('${a.id}', 'no_show')">Nije došao/la</button>
          <button class="btn btn-danger" type="button" onclick="updateAppointmentStatus('${a.id}', 'cancelled')">Otkaži</button>
        ` : ""}
      </div>
    </div>
  `;
}

async function updateAppointmentStatus(id, status) {
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
  await renderAppointments();
}

function getAppointmentStatusLabel(status) {
  return { new: "Novo", confirmed: "Potvrđeno", cancelled: "Otkazano", done: "Završeno", no_show: "Nije došao/la" }[status] || status;
}

async function renderServices() {
  const content = document.getElementById("salon-content");
  content.innerHTML = `
    <div class="section-head"><div><h2>Usluge</h2><p class="muted">Dodajte usluge koje klijenti mogu da izaberu.</p></div><button class="btn btn-primary" type="button" onclick="showAddServiceForm()">+ Dodaj novu uslugu</button></div>
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
    list.innerHTML = `<div class="card center"><p class="muted">Nemate još usluga. Dodajte prvu.</p></div>`;
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
      <label>Cena RSD</label><input id="service-price" type="number" min="0" value="${service ? Number(service.price || 0) : ""}" placeholder="1200">
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
  if (!name || price < 0 || duration <= 0) return window.App.showMessage("Unesite naziv, cenu i trajanje.", "error");
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
    <div class="section-head"><div><h2>Radno vreme</h2><p class="muted">Podesite kada salon prima online termine.</p></div></div>
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
    if (!isClosed && openTime >= closeTime) return window.App.showMessage(`${day.name}: početak mora biti pre kraja.`, "error");
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
    <div class="section-head"><div><h2>Podešavanja salona</h2><p class="muted">Logo, slike, tekst i jedinstveni QR kod salona.</p></div></div>
    <div class="card center">
      <h3>Jedinstveni QR kod salona</h3>
      <p class="muted">Ovaj QR vodi direktno u ovaj salon. Svaki salon ima svoj poseban link i QR kod.</p>
      <img class="qr-img" src="${qrUrl}" alt="QR kod salona">
      <div class="link-box"><small>Link za klijente:</small><input readonly value="${salonLink}"></div>
      <div class="card-actions" style="justify-content:center">
        <button class="btn btn-primary" type="button" onclick="copyMySalonLink()">Kopiraj link</button>
        <a class="btn btn-dark" href="${salonLink}" target="_blank" rel="noopener">Otvori stranicu salona</a>
      </div>
    </div>
    <div class="card"><h3>Logo salona</h3><input type="file" id="logo-upload" accept="image/png,image/jpeg,image/webp"><button class="btn btn-primary" type="button" onclick="uploadLogo()">Postavi logo</button><div id="current-logo" class="image-preview-box"></div></div>
    <div class="card"><h3>Slike za početnu stranu</h3><p class="muted">Najviše 5 aktivnih slika.</p><input type="file" id="home-images" accept="image/png,image/jpeg,image/webp" multiple><button class="btn btn-primary" type="button" onclick="uploadHomeImages()">Dodaj slike</button><div id="current-images" class="image-grid"></div></div>
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
  await loadCurrentImages();
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
  window.App.showMessage("Podešavanja su sačuvana.", "success");
}

async function uploadLogo() {
  const file = document.getElementById("logo-upload")?.files?.[0];
  if (!file) return window.App.showMessage("Izaberite logo sliku.", "error");
  const url = await window.StorageHelper.uploadImage(file, currentSalonId, "logo");
  if (!url) return;
  const { error } = await window.db.from("salon_settings").upsert({ salon_id: currentSalonId, logo_url: url }, { onConflict: "salon_id" });
  if (error) return window.App.showMessage("Logo nije sačuvan.", "error");
  await loadCurrentSettings();
}

async function uploadHomeImages() {
  const files = Array.from(document.getElementById("home-images")?.files || []);
  if (!files.length) return window.App.showMessage("Izaberite slike.", "error");
  const { data: existingImages } = await window.db.from("home_images").select("id").eq("salon_id", currentSalonId).eq("active", true);
  if ((existingImages?.length || 0) + files.length > 5) return window.App.showMessage("Možete imati najviše 5 aktivnih slika.", "error");
  for (const file of files) {
    const url = await window.StorageHelper.uploadImage(file, currentSalonId, "home");
    if (url) await window.db.from("home_images").insert({ salon_id: currentSalonId, image_url: url, active: true, sort_order: 100 });
  }
  await loadCurrentImages();
}

async function loadCurrentImages() {
  const box = document.getElementById("current-images");
  if (!box) return;
  const { data: images, error } = await window.db.from("home_images").select("*").eq("salon_id", currentSalonId).eq("active", true).order("sort_order", { ascending: true });
  if (error) { box.innerHTML = `<p class="error-text">Greška pri učitavanju slika.</p>`; return; }
  if (!images?.length) { box.innerHTML = `<p class="muted">Još nema dodatih slika.</p>`; return; }
  box.innerHTML = images.map(img => `<div class="image-item"><img src="${salonEscapeHtml(img.image_url)}" alt="Slika"><button class="btn btn-danger btn-small" type="button" onclick="deleteHomeImage('${img.id}', '${salonEscapeJs(img.image_url)}')">Obriši</button></div>`).join("");
}

async function deleteHomeImage(id, imageUrl) {
  if (!confirm("Obrisati ovu sliku?")) return;
  await window.StorageHelper.deleteImage(imageUrl);
  await window.db.from("home_images").update({ active: false }).eq("id", id).eq("salon_id", currentSalonId);
  await loadCurrentImages();
}


function copyMySalonLink() {
  if (!currentSalon?.slug) return;
  const link = window.App.getSalonPublicLink(currentSalon.slug);
  navigator.clipboard.writeText(link).then(() => {
    window.App.showMessage("Link salona je kopiran.", "success");
  }).catch(() => prompt("Kopiraj link salona:", link));
}

function isPaymentExpired(paidUntil) {
  if (!paidUntil) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const paidDate = new Date(paidUntil); paidDate.setHours(0,0,0,0);
  return paidDate < today;
}
