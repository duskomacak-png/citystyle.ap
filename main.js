// assets/js/auth.js
// CityStyle.app auth helpers — v1.3.5 login-safe

function getSafeDb() {
  if (window.db) return window.db;
  console.error("Supabase client nije dostupan: window.db je null.");
  if (window.App?.showMessage) {
    window.App.showMessage("Veza sa bazom nije učitana. Proverite internet, osvežite stranicu ili očistite cache za citystyle.app.", "error");
  }
  return null;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCompanyCode(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

async function getCurrentAdminUser() {
  const db = getSafeDb();
  if (!db?.auth) return null;
  const { data, error } = await db.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

async function isPlatformAdmin() {
  const user = await getCurrentAdminUser();
  const adminEmail = normalizeEmail(window.APP_CONFIG?.platformAdminEmail || "duskomacak@gmail.com");
  return !!user && normalizeEmail(user.email) === adminEmail;
}

async function adminLogin(email, password) {
  const db = getSafeDb();
  if (!db?.auth) return null;

  const cleanEmail = normalizeEmail(email);
  const adminEmail = normalizeEmail(window.APP_CONFIG?.platformAdminEmail || "duskomacak@gmail.com");

  if (!cleanEmail || !password) {
    window.App.showMessage("Unesite email i lozinku.", "error");
    return null;
  }

  if (cleanEmail !== adminEmail) {
    window.App.showMessage("Samo glavni administrator može da pristupi.", "error");
    return null;
  }

  const { data, error } = await db.auth.signInWithPassword({
    email: cleanEmail,
    password
  });

  if (error) {
    console.error("Admin login error:", error);
    window.App.showMessage("Pogrešan email ili lozinka.", "error");
    return null;
  }

  if (normalizeEmail(data?.user?.email) !== adminEmail) {
    await db.auth.signOut();
    window.App.showMessage("Ovaj nalog nema administratorski pristup.", "error");
    return null;
  }

  return data.user;
}

async function adminLogout() {
  const db = getSafeDb();
  if (db?.auth) await db.auth.signOut();
  window.App.showMessage("Administrator je odjavljen.", "info");
}

async function salonLogin(email, code) {
  const db = getSafeDb();
  if (!db) return null;

  const cleanEmail = normalizeEmail(email);
  const cleanCode = normalizeCompanyCode(code);

  if (!cleanEmail || !cleanCode) {
    window.App.showMessage("Unesite email biznisa i kod firme.", "error");
    return null;
  }

  // Login je namerno tolerantan: email mora biti isti, ali kod može biti unet malim slovima
  // ili sa razmacima. Ovo ne menja bazu i ne dira javne/profile funkcije.
  const { data, error } = await db
    .from("salons")
    .select("*")
    .eq("owner_email", cleanEmail)
    .eq("is_deleted", false);

  if (error) {
    console.error("Salon login query error:", error);
    window.App.showMessage("Greška pri proveri login-a. Proverite internet i pokušajte ponovo.", "error");
    return null;
  }

  const rows = Array.isArray(data) ? data : [];
  const matched = rows.find((row) => normalizeCompanyCode(row.company_code) === cleanCode);

  if (!matched) {
    window.App.showMessage("Pogrešan email ili kod firme.", "error");
    return null;
  }

  if (matched.status !== "active") {
    window.App.showMessage("Vaš profil je trenutno blokiran. Kontaktirajte administratora.", "error");
    return null;
  }

  const session = {
    salon_id: matched.id,
    salon_name: matched.salon_name,
    slug: matched.slug,
    owner_email: matched.owner_email,
    status: matched.status,
    loggedAt: new Date().toISOString()
  };

  window.App.saveLocal(window.APP_CONFIG.salonSessionKey, session);
  window.App.showMessage("Uspešna prijava.", "success");
  return matched;
}

function getSalonSession() {
  return window.App.getLocal(window.APP_CONFIG.salonSessionKey);
}

function salonLogout() {
  window.App.removeLocal(window.APP_CONFIG.salonSessionKey);
  window.App.showMessage("Korisnik je odjavljen.", "info");
}

function clearSalonSession() {
  window.App.removeLocal(window.APP_CONFIG.salonSessionKey);
}

window.Auth = {
  getCurrentAdminUser,
  isPlatformAdmin,
  adminLogin,
  adminLogout,
  salonLogin,
  getSalonSession,
  salonLogout,
  clearSalonSession,
  normalizeCompanyCode
};
