// assets/js/auth.js

async function getCurrentAdminUser() {
  const { data, error } = await window.db.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

async function isPlatformAdmin() {
  const user = await getCurrentAdminUser();
  return !!user && user.email === window.APP_CONFIG.platformAdminEmail;
}

async function adminLogin(email, password) {
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!cleanEmail || !password) {
    window.App.showMessage("Unesite email i lozinku.", "error");
    return null;
  }

  if (cleanEmail !== window.APP_CONFIG.platformAdminEmail) {
    window.App.showMessage("Samo glavni administrator može da pristupi.", "error");
    return null;
  }

  const { data, error } = await window.db.auth.signInWithPassword({
    email: cleanEmail,
    password
  });

  if (error) {
    window.App.showMessage("Pogrešan email ili lozinka.", "error");
    return null;
  }

  if (data?.user?.email !== window.APP_CONFIG.platformAdminEmail) {
    await window.db.auth.signOut();
    window.App.showMessage("Ovaj nalog nema administratorski pristup.", "error");
    return null;
  }

  return data.user;
}

async function adminLogout() {
  await window.db.auth.signOut();
  window.App.showMessage("Administrator je odjavljen.", "info");
}

async function salonLogin(email, code) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanCode = String(code || "").trim();

  if (!cleanEmail || !cleanCode) {
    window.App.showMessage("Unesite email salona i kod firme.", "error");
    return null;
  }

  const { data, error } = await window.db
    .from("salons")
    .select("*")
    .eq("owner_email", cleanEmail)
    .eq("company_code", cleanCode)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error || !data) {
    window.App.showMessage("Pogrešan email ili kod firme.", "error");
    return null;
  }

  if (data.status !== "active") {
    window.App.showMessage("Vaš salon je blokiran. Kontaktirajte administratora.", "error");
    return null;
  }

  const session = {
    salon_id: data.id,
    salon_name: data.salon_name,
    slug: data.slug,
    owner_email: data.owner_email,
    status: data.status,
    loggedAt: new Date().toISOString()
  };

  window.App.saveLocal(window.APP_CONFIG.salonSessionKey, session);
  return data;
}

function getSalonSession() {
  return window.App.getLocal(window.APP_CONFIG.salonSessionKey);
}

function salonLogout() {
  window.App.removeLocal(window.APP_CONFIG.salonSessionKey);
  window.App.showMessage("Salon je odjavljen.", "info");
}

window.Auth = {
  getCurrentAdminUser,
  isPlatformAdmin,
  adminLogin,
  adminLogout,
  salonLogin,
  getSalonSession,
  salonLogout
};
