// assets/js/main.js

function getUrlParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

function saveLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getLocal(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error("localStorage read error:", err);
    return null;
  }
}

function removeLocal(key) {
  localStorage.removeItem(key);
}

function setSessionValue(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (err) { console.warn("sessionStorage write error", err); }
}

function getSessionValue(key) {
  try {
    const value = sessionStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.warn("sessionStorage read error", err);
    return null;
  }
}

function showMessage(message, type = "info") {
  const oldToast = document.querySelector(".app-toast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.className = `app-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}


async function copyText(text, buttonEl = null) {
  const value = String(text || window.location.href || "");
  const originalText = buttonEl ? buttonEl.textContent : "";

  function markDone() {
    if (buttonEl) {
      buttonEl.textContent = "Link je kopiran";
      setTimeout(() => { buttonEl.textContent = originalText || "Kopiraj link profila"; }, 2200);
    }
    showMessage("Link profila je kopiran.", "success");
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      markDone();
      return true;
    }
  } catch (err) {
    console.warn("Clipboard API nije uspeo, koristi se fallback:", err);
  }

  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "readonly");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    area.style.top = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    if (ok) {
      markDone();
      return true;
    }
  } catch (err) {
    console.warn("Fallback copy nije uspeo:", err);
  }

  showMessage("Telefon nije dozvolio automatsko kopiranje. Označite i kopirajte link ručno.", "error");
  window.prompt("Kopirajte link profila:", value);
  return false;
}

window.copyText = copyText;

function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString + (String(dateString).includes("T") ? "" : "T00:00:00"));
  return date.toLocaleDateString("sr-RS", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}


function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("sr-RS");
}

function normalizeCurrency(value) {
  const c = String(value || "RSD").trim().toUpperCase();
  if (c === "EUR" || c === "€" || c === "EVRO" || c === "EVRI") return "EUR";
  if (c === "KM" || c === "BAM" || c === "BIH" || c === "BOSNA" || c === "KONVERTIBILNA MARKA" || c === "KONVERTIBILNE MARKE") return "KM";
  return "RSD";
}

function formatServicePrice(item = {}) {
  const currency = normalizeCurrency(item.currency || item.currency_snapshot || "RSD");
  const from = Number(item.price ?? item.price_snapshot ?? 0);
  const toRaw = item.price_to ?? item.price_to_snapshot;
  const to = toRaw === null || toRaw === undefined || toRaw === "" ? null : Number(toRaw);

  if ((!from || from <= 0) && (!to || to <= 0)) {
    return t("priceByAgreement", "Cena po dogovoru");
  }

  const suffix = currency === "EUR" ? "EUR" : (currency === "KM" ? "KM" : "RSD");

  if (to && to > from) {
    return `${formatMoney(from)}–${formatMoney(to)} ${suffix}`;
  }

  return `${formatMoney(from)} ${suffix}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'");
}

function cleanSupabaseOrValue(value = "") {
  return String(value || "").trim().replace(/[(),]/g, "");
}

async function checkSalonAccess(slugOrCode) {
  const identifier = cleanSupabaseOrValue(slugOrCode);
  if (!identifier) return { data: null, error: "Nedostaje salon slug/profil kod." };
  if (!window.db) return { data: null, error: "Supabase nije učitan." };

  // Supports old public links (?salon=slug) and new stable public profile codes (?profile=cs_p_...).
  // Keep the query surgical: only the selector changed, all existing status/delete checks remain.
  const { data, error } = await window.db
    .from("salons")
    .select("*")
    .or(`slug.eq.${identifier},public_profile_code.eq.${identifier}`)
    .eq("status", "active")
    .eq("is_deleted", false)
    .maybeSingle();

  return { data, error };
}

function saveCurrentSalon(slug) {
  if (!slug) return;
  saveLocal(window.APP_CONFIG.salonStorageKey, {
    slug,
    savedAt: new Date().toISOString()
  });
}

function getSavedSalonSlug() {
  const saved = getLocal(window.APP_CONFIG.salonStorageKey);
  return saved?.slug || null;
}

function clearSavedSalon() {
  removeLocal(window.APP_CONFIG.salonStorageKey);
}

function isStandaloneMode() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    window.navigator.standalone === true;
}

function getAppBaseUrl() {
  const origin = window.location.origin;
  const path = window.location.pathname || "/";

  // GitHub Pages project site: https://user.github.io/citystyle.app/
  if (window.location.hostname.endsWith("github.io")) {
    const parts = path.split("/").filter(Boolean);
    if (parts.length > 0) {
      return `${origin}/${parts[0]}/`;
    }
  }

  // Custom domain: https://citystyle.app/
  return `${origin}/`;
}

function getAppPath(path = "") {
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return `${getAppBaseUrl()}${cleanPath}`;
}

function getSalonPublicLink(slug) {
  return `${getAppBaseUrl()}?salon=${encodeURIComponent(slug)}`;
}

function getSalonProfileCode(salonOrSlug) {
  if (!salonOrSlug) return "";
  if (typeof salonOrSlug === "object") {
    return String(salonOrSlug.public_profile_code || salonOrSlug.slug || "").trim();
  }
  return String(salonOrSlug || "").trim();
}

function getSalonProfileLink(salonOrSlug) {
  const code = getSalonProfileCode(salonOrSlug);
  return `${getAppBaseUrl()}?profile=${encodeURIComponent(code)}`;
}

function getProfileInstallGatewayUrl(salonOrSlug, options = {}) {
  const code = getSalonProfileCode(salonOrSlug);
  const params = new URLSearchParams();
  params.set("profile", code);
  params.set("install", "1");
  if (options.name) params.set("name", String(options.name).slice(0, 80));
  if (options.panel) params.set("panel", "1");
  return `${getAppPath("p/")}?${params.toString()}`;
}

function getSalonSourceLink(slug, source = "") {
  const base = getSalonPublicLink(slug);
  const cleanSource = String(source || "").trim().toLowerCase();
  if (!cleanSource) return base;
  return `${base}&src=${encodeURIComponent(cleanSource)}`;
}

function getQrImageUrl(link, size = 280) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(link)}`;
}


// Per-salon theme helpers. Only admin changes theme_color in database; public/owner views only read it.
const SALON_THEME_CLASSES = [
  "theme-classic-red",
  "theme-ocean-blue",
  "theme-luxury-gold",
  "theme-emerald-green",
  "theme-royal-purple",
  "theme-soft-pink",
  "theme-graphite-dark",
  "theme-orange-pro"
];

function normalizeSalonTheme(value) {
  const theme = String(value || "classic-red").trim().toLowerCase();
  return SALON_THEME_CLASSES.includes(`theme-${theme}`) ? theme : "classic-red";
}

function clearSalonTheme() {
  document.body?.classList.remove(...SALON_THEME_CLASSES);
  document.documentElement?.removeAttribute("data-salon-theme");
}

function applySalonTheme(value) {
  const theme = normalizeSalonTheme(value);
  clearSalonTheme();
  document.body?.classList.add(`theme-${theme}`);
  document.documentElement?.setAttribute("data-salon-theme", theme);
  return theme;
}



const BUSINESS_PROFILE_LABELS = {
  general: {
    name: "Opšti biznis", action: "Pošalji zahtev", services: "Usluge / ponuda", formTitle: "Pošaljite zahtev", formIntro: "Izaberite uslugu, datum i termin. U napomeni možete opisati šta vam treba.", noteLabel: "Napomena / opis zahteva", notePlaceholder: "Napišite dodatne informacije za vlasnika profila.", requestKindLabel: "Vrsta zahteva", requestKindPlaceholder: "npr. upit, usluga, ponuda"
  },
  salon: {
    name: "Salon / termini", action: "Zakaži termin", services: "Usluge i cenovnik", formTitle: "Zakažite termin", formIntro: "Izaberite uslugu, datum i termin.", noteLabel: "Napomena", notePlaceholder: "Opcionalno", requestKindLabel: "Željena usluga", requestKindPlaceholder: "npr. šišanje, farbanje, tretman"
  },
  repair: {
    name: "Majstor / kvarovi", action: "Prijavi kvar", services: "Usluge, kvarovi i intervencije", formTitle: "Prijavite kvar ili problem", formIntro: "Izaberite uslugu/intervenciju, željeni termin i opišite kvar. Vlasnik će vas kontaktirati radi potvrde.", noteLabel: "Opis kvara / problema", notePlaceholder: "npr. klima ne hladi, curi voda, grejanje ne radi...", requestKindLabel: "Vrsta kvara", requestKindPlaceholder: "npr. klima, grejanje, voda, struja"
  },
  craft: {
    name: "Zanatlija / radovi", action: "Pošalji upit za radove", services: "Radovi i ponuda", formTitle: "Pošaljite upit za radove", formIntro: "Izaberite tip rada i željeni termin za kontakt/procenu. U opisu navedite lokaciju i obim posla.", noteLabel: "Opis posla", notePlaceholder: "npr. kupatilo 20m², krečenje stana, keramika, gips...", requestKindLabel: "Vrsta rada", requestKindPlaceholder: "npr. keramika, moleraj, stolarija"
  },
  auto: {
    name: "Auto servis", action: "Pošalji zahtev za servis", services: "Servisne usluge", formTitle: "Pošaljite zahtev za servis", formIntro: "Izaberite servisnu uslugu, željeni termin i ukratko opišite vozilo/problem.", noteLabel: "Opis problema / vozilo", notePlaceholder: "npr. Golf 6, neće da upali, mali servis, gume...", requestKindLabel: "Vrsta servisa", requestKindPlaceholder: "npr. mali servis, kvar, vulkanizer"
  },
  catalog: {
    name: "Katalog / proizvodi", action: "Pitaj za proizvod", services: "Ponuda i usluge", formTitle: "Pošaljite upit", formIntro: "Izaberite ponudu ili proizvod i pošaljite upit vlasniku profila.", noteLabel: "Poruka / upit", notePlaceholder: "Napišite šta vas zanima, količinu, dimenziju ili dodatno pitanje.", requestKindLabel: "Predmet upita", requestKindPlaceholder: "npr. proizvod, cena, dostupnost"
  }
};

function normalizeBusinessType(value) {
  const type = String(value || "general").trim().toLowerCase();
  return BUSINESS_PROFILE_LABELS[type] ? type : "general";
}

function getBusinessProfileLabels(value) {
  return BUSINESS_PROFILE_LABELS[normalizeBusinessType(value)];
}

// Per-salon language helpers. Only admin changes app_language in database; public/owner views only read it.
const APP_LANGUAGE_OPTIONS = ["sr", "en", "de"];
let currentAppLanguage = "sr";

const APP_TRANSLATIONS = {
  sr: {
    loadingProfile: "Učitavanje profila...",
    onlineUnavailableTitle: "Online zakazivanje trenutno nije dostupno",
    onlineUnavailableText: "Online zahtev trenutno nije dostupan za ovaj profil.",
    platformHome: "Početna strana platforme",
    adminClientPreviewTitle: "Admin pregled: korisnička strana",
    adminClientPreviewText: "Ovako korisnik vidi ovaj profil. Ovo dugme vidi samo prijavljeni admin.",
    backToAdmin: "Nazad u admin",
    ownerPreviewTitle: "Pregled javne stranice",
    ownerPreviewText: "Ovako korisnik vidi vaš profil.",
    backToOwnerPanel: "Nazad u panel vlasnika",
    welcomeDefault: "Dobrodošli. Izaberite uslugu, datum i zakažite termin.",
    sendRequest: "Pošalji zahtev",
    servicesOffer: "Usluge / ponuda",
    installThisProfile: "Preuzmi app",
    noServicesSmall: "Nema dostupnih usluga",
    noServicesText: "Trenutno nema dostupnih usluga za online zahtev.",
    showList: "Prikaži listu",
    hideList: "Sakrij listu",
    chooseServiceText: "Izaberite uslugu za koju želite da pošaljete zahtev.",
    workingHours: "Radno vreme",
    showSchedule: "Prikaži raspored",
    closed: "Zatvoreno",
    monday: "Ponedeljak",
    tuesday: "Utorak",
    wednesday: "Sreda",
    thursday: "Četvrtak",
    friday: "Petak",
    saturday: "Subota",
    sunday: "Nedelja",
    bookingUnavailable: "Zakazivanje nije dostupno",
    sendRequestTitle: "Pošaljite zahtev",
    chooseServiceDateTime: "Izaberite uslugu, datum i termin.",
    serviceAndPrice: "Usluga i cena",
    chooseService: "Izaberite uslugu",
    chooseServiceFirst: "Prvo izaberite uslugu.",
    date: "Datum",
    selectedTime: "Izabrani termin",
    noTimeSelected: "Još nije izabran",
    availableTimes: "Slobodni termini",
    chooseServiceAndDate: "Izaberite uslugu i datum.",
    fullName: "Ime i prezime",
    phoneCountry: "Država za WhatsApp broj",
    phoneWhatsapp: "Broj telefona / WhatsApp",
    phoneHelp: "Izaberite državu i unesite lokalni broj. Možete uneti broj sa nulom ili bez nule. Aplikacija će ga sačuvati u ispravnom WhatsApp formatu prema izabranoj državi. Ako unesete broj sa +, koristi se direktno.",
    note: "Napomena",
    optional: "Opcionalno",
    loadingTimes: "Učitavanje termina...",
    noTimesToday: "Nema više slobodnih termina za danas. Izaberite naredni datum.",
    noTimesDate: "Nema slobodnih termina za izabrani datum.",
    chooseAllError: "Izaberite uslugu, datum i termin.",
    enterNameError: "Unesite ime i prezime.",
    phoneError: "Izaberite državu i unesite ispravan broj telefona.",
    takenError: "Termin je u međuvremenu zauzet. Izaberite drugi.",
    sendError: "Greška pri slanju termina.",
    requestSentTitle: "Zahtev je poslat ✅",
    requestSentText: "Vlasnik profila će vas kontaktirati radi potvrde.",
    requestSentToast: "Zahtev je poslat.",
    priceByAgreement: "Cena po dogovoru",
    ownerPanelTitle: "Biznis panel",
    ownerPanelLoading: "Učitavanje profila...",
    ownerInstallBtn: "Preuzmi panel vlasnika",
    logout: "Odjavi se",
    tabAppointments: "Zahtevi / termini",
    tabServices: "Usluge / ponuda",
    tabHours: "Radno vreme",
    tabSettings: "Podešavanje profila",
    enableNotifications: "Uključi obaveštenja",
    refresh: "Osveži",
    allRequests: "Svi zahtevi",
    todayAppointments: "Današnji termini",
    newRequests: "Novi zahtevi",
    confirmed: "Potvrđeno",
    done: "Završeno",
    noRequestsTitle: "Nema zahteva u ovoj listi",
    noRequestsText: "Kada korisnik pošalje zahtev ili zakaže termin, podaci će se prikazati u ovoj listi.",
    addService: "Dodaj uslugu",
    save: "Sačuvaj",
    cancel: "Otkaži",
    delete: "Obriši",
    saveWorkingHours: "Sačuvaj radno vreme",
    profileSettings: "Podešavanje profila"
  },
  en: {
    loadingProfile: "Loading profile...",
    onlineUnavailableTitle: "Online booking is currently unavailable",
    onlineUnavailableText: "Online requests are currently unavailable for this profile.",
    platformHome: "Platform home",
    adminClientPreviewTitle: "Admin preview: client side",
    adminClientPreviewText: "This is how clients see this profile. This button is visible only to the logged-in admin.",
    backToAdmin: "Back to admin",
    ownerPreviewTitle: "Public page preview",
    ownerPreviewText: "This is how clients see your profile.",
    backToOwnerPanel: "Back to owner panel",
    welcomeDefault: "Welcome. Choose a service, date and available time, or send a request.",
    sendRequest: "Send request",
    servicesOffer: "Services / offer",
    installThisProfile: "Install this profile app",
    noServicesSmall: "No available services",
    noServicesText: "There are currently no available services for online requests.",
    showList: "Show list",
    hideList: "Hide list",
    chooseServiceText: "Choose the service you want to send a request for.",
    workingHours: "Working hours",
    showSchedule: "Show schedule",
    closed: "Closed",
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
    bookingUnavailable: "Booking unavailable",
    sendRequestTitle: "Send request",
    chooseServiceDateTime: "Choose a service, date and available time.",
    serviceAndPrice: "Service and price",
    chooseService: "Choose service",
    chooseServiceFirst: "Choose a service first.",
    date: "Date",
    selectedTime: "Selected time",
    noTimeSelected: "Not selected yet",
    availableTimes: "Available times",
    chooseServiceAndDate: "Choose a service and date.",
    fullName: "Full name",
    phoneCountry: "Country for WhatsApp number",
    phoneWhatsapp: "Phone / WhatsApp number",
    phoneHelp: "Choose a country and enter the local number. You can enter it with or without the leading zero. The app will save it in the correct WhatsApp format. If you enter a number with +, it will be used directly.",
    note: "Note",
    optional: "Optional",
    loadingTimes: "Loading available times...",
    noTimesToday: "No more available times today. Choose another date.",
    noTimesDate: "No available times for the selected date.",
    chooseAllError: "Choose service, date and time.",
    enterNameError: "Enter full name.",
    phoneError: "Choose a country and enter a valid phone number.",
    takenError: "This time has just been taken. Choose another one.",
    sendError: "Error while sending request.",
    requestSentTitle: "Request sent ✅",
    requestSentText: "The profile owner will contact you to confirm.",
    requestSentToast: "Request sent.",
    priceByAgreement: "Price by agreement",
    ownerPanelTitle: "Business panel",
    ownerPanelLoading: "Loading profile...",
    ownerInstallBtn: "Install owner panel",
    logout: "Log out",
    tabAppointments: "Requests / appointments",
    tabServices: "Services / offer",
    tabHours: "Working hours",
    tabSettings: "Profile settings",
    enableNotifications: "Enable notifications",
    refresh: "Refresh",
    allRequests: "All requests",
    todayAppointments: "Today’s appointments",
    newRequests: "New requests",
    confirmed: "Confirmed",
    done: "Done",
    noRequestsTitle: "No requests in this list",
    noRequestsText: "When a client sends a request or books an appointment, it will appear in this list.",
    addService: "Add service",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    saveWorkingHours: "Save working hours",
    profileSettings: "Profile settings"
  },
  de: {
    loadingProfile: "Profil wird geladen...",
    onlineUnavailableTitle: "Online-Buchung ist derzeit nicht verfügbar",
    onlineUnavailableText: "Online-Anfragen sind für dieses Profil derzeit nicht verfügbar.",
    platformHome: "Plattform-Startseite",
    adminClientPreviewTitle: "Admin-Vorschau: Kundenseite",
    adminClientPreviewText: "So sehen Kunden dieses Profil. Diese Schaltfläche sieht nur der angemeldete Admin.",
    backToAdmin: "Zurück zum Admin",
    ownerPreviewTitle: "Vorschau der öffentlichen Seite",
    ownerPreviewText: "So sehen Kunden Ihr Profil.",
    backToOwnerPanel: "Zurück zum Inhaber-Panel",
    welcomeDefault: "Willkommen. Wählen Sie eine Dienstleistung, ein Datum und eine freie Zeit oder senden Sie eine Anfrage.",
    sendRequest: "Anfrage senden",
    servicesOffer: "Leistungen / Angebot",
    installThisProfile: "Profil-App installieren",
    noServicesSmall: "Keine Leistungen verfügbar",
    noServicesText: "Derzeit sind keine Leistungen für Online-Anfragen verfügbar.",
    showList: "Liste anzeigen",
    hideList: "Liste ausblenden",
    chooseServiceText: "Wählen Sie die Leistung, für die Sie eine Anfrage senden möchten.",
    workingHours: "Öffnungszeiten",
    showSchedule: "Plan anzeigen",
    closed: "Geschlossen",
    monday: "Montag",
    tuesday: "Dienstag",
    wednesday: "Mittwoch",
    thursday: "Donnerstag",
    friday: "Freitag",
    saturday: "Samstag",
    sunday: "Sonntag",
    bookingUnavailable: "Buchung nicht verfügbar",
    sendRequestTitle: "Anfrage senden",
    chooseServiceDateTime: "Wählen Sie Leistung, Datum und freie Zeit.",
    serviceAndPrice: "Leistung und Preis",
    chooseService: "Leistung wählen",
    chooseServiceFirst: "Wählen Sie zuerst eine Leistung.",
    date: "Datum",
    selectedTime: "Gewählte Zeit",
    noTimeSelected: "Noch nicht gewählt",
    availableTimes: "Freie Zeiten",
    chooseServiceAndDate: "Wählen Sie Leistung und Datum.",
    fullName: "Vor- und Nachname",
    phoneCountry: "Land für WhatsApp-Nummer",
    phoneWhatsapp: "Telefon / WhatsApp",
    phoneHelp: "Wählen Sie ein Land und geben Sie die lokale Nummer ein. Sie können die Nummer mit oder ohne führende Null eingeben. Die App speichert sie im richtigen WhatsApp-Format. Wenn Sie eine Nummer mit + eingeben, wird sie direkt verwendet.",
    note: "Notiz",
    optional: "Optional",
    loadingTimes: "Freie Zeiten werden geladen...",
    noTimesToday: "Heute gibt es keine freien Zeiten mehr. Wählen Sie ein anderes Datum.",
    noTimesDate: "Für das gewählte Datum gibt es keine freien Zeiten.",
    chooseAllError: "Wählen Sie Leistung, Datum und Zeit.",
    enterNameError: "Geben Sie Vor- und Nachname ein.",
    phoneError: "Wählen Sie ein Land und geben Sie eine gültige Telefonnummer ein.",
    takenError: "Diese Zeit wurde gerade belegt. Wählen Sie eine andere.",
    sendError: "Fehler beim Senden der Anfrage.",
    requestSentTitle: "Anfrage gesendet ✅",
    requestSentText: "Der Profilinhaber wird Sie zur Bestätigung kontaktieren.",
    requestSentToast: "Anfrage gesendet.",
    priceByAgreement: "Preis nach Vereinbarung",
    ownerPanelTitle: "Business-Panel",
    ownerPanelLoading: "Profil wird geladen...",
    ownerInstallBtn: "Inhaber-Panel installieren",
    logout: "Abmelden",
    tabAppointments: "Anfragen / Termine",
    tabServices: "Leistungen / Angebot",
    tabHours: "Öffnungszeiten",
    tabSettings: "Profileinstellungen",
    enableNotifications: "Benachrichtigungen aktivieren",
    refresh: "Aktualisieren",
    allRequests: "Alle Anfragen",
    todayAppointments: "Heutige Termine",
    newRequests: "Neue Anfragen",
    confirmed: "Bestätigt",
    done: "Erledigt",
    noRequestsTitle: "Keine Anfragen in dieser Liste",
    noRequestsText: "Wenn ein Kunde eine Anfrage sendet oder einen Termin bucht, erscheint sie hier.",
    addService: "Leistung hinzufügen",
    save: "Speichern",
    cancel: "Abbrechen",
    delete: "Löschen",
    saveWorkingHours: "Öffnungszeiten speichern",
    profileSettings: "Profileinstellungen"
  }
};

function normalizeAppLanguage(value) {
  const lang = String(value || "sr").trim().toLowerCase();
  return APP_LANGUAGE_OPTIONS.includes(lang) ? lang : "sr";
}

function setAppLanguage(value) {
  currentAppLanguage = normalizeAppLanguage(value);
  document.documentElement.lang = currentAppLanguage;
  document.documentElement.setAttribute("data-app-language", currentAppLanguage);
  return currentAppLanguage;
}

function getAppLanguage() {
  return currentAppLanguage || "sr";
}

function t(key, fallback = "") {
  const lang = getAppLanguage();
  return APP_TRANSLATIONS[lang]?.[key] || APP_TRANSLATIONS.sr?.[key] || fallback || key;
}

// PWA install prompt
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  showInstallButton();
});

function showInstallButton() {
  if (document.getElementById("install-app-btn")) return;

  const path = window.location.pathname || "/";
  const hasSalonParam = !!getUrlParam("salon");

  // Do not show install button to salon clients or inside admin/salon panels.
  // Platform install belongs only on the main platform page.
  if (hasSalonParam || path.includes("/admin") || path.includes("/salon")) return;

  const btn = document.createElement("button");
  btn.id = "install-app-btn";
  btn.className = "install-floating-btn";
  btn.type = "button";
  btn.textContent = "📱 Preuzmi CityStyle app";
  btn.addEventListener("click", () => installApp("Na iPhone-u: Share → Add to Home Screen.", "CityStyle je dodat na telefon."));
  document.body.appendChild(btn);
}

async function installSalonApp(salonOrSlug, options = {}) {
  const code = getSalonProfileCode(salonOrSlug);
  const slugToSave = typeof salonOrSlug === "object" ? (salonOrSlug.slug || code) : (options.slug || code);
  if (slugToSave) saveCurrentSalon(slugToSave);

  // Multiple profiles on one device need unique manifest IDs.
  // /p/ is only an install launcher; the saved shortcut opens the real public profile.
  const url = getProfileInstallGatewayUrl(salonOrSlug, options);

  if (isStandaloneMode() && /Android/i.test(navigator.userAgent || "")) {
    const noScheme = url.replace(/^https?:\/\//, "");
    window.location.href = `intent://${noScheme}#Intent;scheme=https;package=com.android.chrome;end`;
    setTimeout(() => { window.location.href = url; }, 900);
    return;
  }

  window.location.href = url;
}

async function installOwnerApp(options = {}) {
  clearSavedSalon();
  updateManifestForOwner(options);

  try {
    const ownerKey = String(options.profileCode || options.publicProfileCode || options.slug || options.salonId || "").trim();
    if (ownerKey) localStorage.setItem("citystyle_owner_shortcut_profile", ownerKey);
  } catch (err) {}

  const ownerName = String(options.name || options.displayName || "Panel vlasnika").trim();
  await installApp("Ako se sistemska instalacija ne otvori automatski: Chrome meni ⋮ → Add to Home screen / Dodaj na početni ekran. Nemoj instalirati /p/ stranicu.", `${ownerName} panel je dodat na telefon.`);
}

function updateManifestForOwner(options = {}) {
  const rawName = String(options.name || options.displayName || "").trim();
  const businessName = rawName || "CityStyle";
  const appName = String(options.panelName || `${businessName} Panel`).trim();
  const shortName = appName.length > 18 ? appName.slice(0, 18).trim() : appName;
  const theme = normalizeSalonTheme(options.themeColor || "classic-red");
  const profileKey = String(options.profileCode || options.publicProfileCode || options.slug || options.salonId || "owner").trim();
  const encodedKey = encodeURIComponent(profileKey || "owner");
  const cleanIcon = String(options.iconUrl || options.logoUrl || "").trim();
  const iconUrl = cleanIcon || makeInitialsIconDataUrl(businessName, "#b91c1c");
  const icon512 = String(options.icon512Url || "").trim() || iconUrl || makeInitialsIconDataUrl(businessName, "#b91c1c");
  const start = `${getAppPath("salon/")}?pwa_owner=1&owner=${encodedKey}&v=v202_manifest_id_maskable`;
  const baseManifest = {
    id: `/pwa/owner/${encodedKey}`,
    name: appName,
    short_name: shortName || "Panel",
    description: `Panel vlasnika za ${businessName}.`,
    start_url: start,
    scope: getAppBaseUrl(),
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: "#0b0b0f",
    orientation: "portrait",
    icons: [
      { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" }
    ]
  };
  try {
    const blob = new Blob([JSON.stringify(baseManifest)], { type: "application/manifest+json" });
    const url = URL.createObjectURL(blob);
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = url;
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') || document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    appleIcon.href = iconUrl;
    if (!appleIcon.parentNode) document.head.appendChild(appleIcon);
    document.title = appName;
    const themeMeta = document.querySelector('meta[name="theme-color"]') || document.createElement("meta");
    themeMeta.name = "theme-color";
    themeMeta.content = theme;
    if (!themeMeta.parentNode) document.head.appendChild(themeMeta);
    const appTitle = document.querySelector('meta[name="application-name"]') || document.createElement("meta");
    appTitle.name = "application-name";
    appTitle.content = appName;
    if (!appTitle.parentNode) document.head.appendChild(appTitle);
  } catch (err) {
    console.warn("Owner manifest nije postavljen:", err);
  }
}


function getInitialsFromName(name = "") {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "CS";
  const initials = words.slice(0, 2).map(w => w.charAt(0).toUpperCase()).join("");
  return initials || "CS";
}

function makeInitialsIconDataUrl(name = "CityStyle", bg = "#b91c1c") {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const initials = getInitialsFromName(name);
    ctx.fillStyle = bg && String(bg).startsWith("#") ? bg : "#b91c1c";
    ctx.fillRect(0, 0, 512, 512);
    const gradient = ctx.createRadialGradient(180, 120, 40, 256, 256, 420);
    gradient.addColorStop(0, "rgba(255,255,255,0.28)");
    gradient.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "bold 190px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, 256, 268);
    return canvas.toDataURL("image/png");
  } catch (err) {
    console.warn("Initials icon nije napravljen:", err);
    return `${getAppBaseUrl()}assets/icons/icon-192.png`;
  }
}

function updateManifestForSalon(slug, options = {}) {
  if (!slug) return;
  const rawName = String(options.name || options.displayName || "").trim();
  const appName = rawName || "CityStyle profil";
  const shortName = appName.length > 12 ? appName.slice(0, 12).trim() : appName;
  const theme = normalizeSalonTheme(options.themeColor || "classic-red");
  const cleanIcon = String(options.iconUrl || "").trim();
  const iconUrl = cleanIcon || makeInitialsIconDataUrl(appName, "#b91c1c");
  const icon512 = String(options.icon512Url || "").trim() || iconUrl || makeInitialsIconDataUrl(appName, "#b91c1c");
  const profileCode = String(options.profileCode || options.publicProfileCode || slug || "").trim();
  const encodedSlug = encodeURIComponent(slug);
  const encodedProfile = encodeURIComponent(profileCode || slug);
  const manifestId = `/pwa/profile/${encodedProfile}`;
  const startParam = profileCode ? `profile=${encodedProfile}` : `salon=${encodedSlug}`;
  const baseManifest = {
    id: manifestId,
    name: appName,
    short_name: shortName || "Profil",
    description: `Prečica za direktan ulaz u profil: ${appName}.`,
    start_url: `${getAppBaseUrl()}?${startParam}&pwa_profile=${encodedProfile}&v=v202_manifest_id_maskable`,
    scope: getAppBaseUrl(),
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: "#0b0b0f",
    orientation: "portrait",
    icons: [
      { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: iconUrl, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" }
    ]
  };
  try {
    const blob = new Blob([JSON.stringify(baseManifest)], { type: "application/manifest+json" });
    const url = URL.createObjectURL(blob);
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = url;
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') || document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    appleIcon.href = iconUrl;
    if (!appleIcon.parentNode) document.head.appendChild(appleIcon);
    document.title = appName;
    const themeMeta = document.querySelector('meta[name="theme-color"]') || document.createElement("meta");
    themeMeta.name = "theme-color";
    themeMeta.content = theme;
    if (!themeMeta.parentNode) document.head.appendChild(themeMeta);
    const appTitle = document.querySelector('meta[name="application-name"]') || document.createElement("meta");
    appTitle.name = "application-name";
    appTitle.content = appName;
    if (!appTitle.parentNode) document.head.appendChild(appTitle);
  } catch (err) {
    console.warn("Dynamic manifest nije postavljen:", err);
  }
}

function showInstallHelp(noPromptMessage = "Na iPhone-u: Share → Add to Home Screen.") {
  document.querySelector(".install-help-modal")?.remove();
  const currentUrl = window.location.href;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop install-help-modal";
  modal.innerHTML = `
    <div class="modal-card install-help-card">
      <h3>Preuzimanje profila kao app</h3>
      <p>${escapeHtml(noPromptMessage)}</p>
      <p class="muted">Ako browser ne ponudi instalaciju, otvorite meni browsera i izaberite Dodaj na početni ekran. Na Androidu/Chrome-u prečica najčešće koristi logo firme; iOS ponekad koristi ikonicu stranice.</p>
      <div class="card-actions center">
        <button class="btn btn-primary" type="button" onclick="copyText('${escapeJs(currentUrl)}', this)">Kopiraj link profila</button>
        <button class="btn btn-dark" type="button" onclick="this.closest('.modal-backdrop').remove()">Zatvori</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function installApp(noPromptMessage = "Na iPhone-u: Share → Add to Home Screen.", successMessage = "CityStyle je dodat na telefon.") {
  if (!deferredPrompt) {
    showInstallHelp(noPromptMessage);
    return;
  }

  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;

  if (choice.outcome === "accepted") {
    showMessage(successMessage, "success");
    document.getElementById("install-app-btn")?.remove();
  } else {
    showMessage("Instalacija je otkazana.", "info");
  }

  deferredPrompt = null;
}

window.addEventListener("appinstalled", () => {
  document.getElementById("install-app-btn")?.remove();
  showMessage("CityStyle je dodat na početni ekran.", "success");
});


  function normalizePhoneForTel(phone) {
    const raw = String(phone || "").trim();
    if (!raw) return "";
    let digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    if (raw.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("381") && digits.length >= 10) return `+${digits}`;
    if (digits.startsWith("0") && digits.length >= 8) return `+381${digits.slice(1)}`;
    if (/^[1-9]\d{6,}$/.test(digits)) return `+381${digits}`;
    return "";
  }

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function setAppBadgeCount(count = 0) {
  try {
    if ("setAppBadge" in navigator) {
      if (count > 0) await navigator.setAppBadge(count);
      else await navigator.clearAppBadge();
    }
  } catch (err) {
    console.warn("Badge nije podržan na ovom uređaju:", err);
  }
}

async function clearAppBadgeCount() {
  await setAppBadgeCount(0);
}

async function savePushSubscriptionToDb(payload) {
  const table = window.db.from("push_subscriptions");

  // First try the clean path: one active row per endpoint.
  let result = await table.upsert(payload, { onConflict: "endpoint" });
  if (!result.error) return result;

  console.warn("Push upsert failed, trying fallback insert/update:", result.error);

  // Fallback for projects where endpoint does not have a unique index yet.
  result = await window.db.from("push_subscriptions").insert(payload);
  if (!result.error) return result;

  // Fallback for duplicate endpoint rows.
  if (/duplicate|unique/i.test(result.error.message || "")) {
    result = await window.db
      .from("push_subscriptions")
      .update({
        salon_id: payload.salon_id,
        p256dh: payload.p256dh,
        auth: payload.auth,
        expiration_time: payload.expiration_time,
        user_agent: payload.user_agent,
        is_active: true,
        updated_at: payload.updated_at
      })
      .eq("endpoint", payload.endpoint);
  }

  return result;
}

async function registerPushForSalon(salonId) {
  try {
    if (!salonId) {
      showMessage("Profil nije učitan.", "error");
      return false;
    }

    if (!window.db) {
      showMessage("Baza nije učitana. Osvežite stranicu.", "error");
      return false;
    }

    if (!("serviceWorker" in navigator)) {
      showMessage("Service Worker nije podržan u ovom browseru.", "error");
      return false;
    }

    if (!("PushManager" in window) || !("Notification" in window)) {
      showMessage("Ovaj browser ne podržava web push obaveštenja.", "error");
      return false;
    }

    if (Notification.permission === "denied") {
      showMessage("Obaveštenja su blokirana. U browser podešavanjima dozvolite notifications za citystyle.app.", "error");
      return false;
    }

    const vapidPublicKey = String(window.APP_CONFIG?.pushVapidPublicKey || "").trim();
    if (!vapidPublicKey) {
      showMessage("Push ključ nije podešen u aplikaciji.", "error");
      return false;
    }

    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

    if (permission !== "granted") {
      showMessage("Obaveštenja nisu dozvoljena.", "info");
      return false;
    }

    // Register and wait for the ACTIVE service worker. Using the returned registration
    // while it is still installing can break push subscribe on some phones.
    await navigator.serviceWorker.register("/sw.js?v=v202_manifest_id_maskable", { scope: "/" });
    const registration = await navigator.serviceWorker.ready;

    if (!registration?.pushManager) {
      showMessage("Push servis nije spreman. Zatvorite i ponovo otvorite app pa pokušajte opet.", "error");
      return false;
    }

    // Fresh subscription is safer after many test versions / VAPID changes.
    // Old subscriptions can silently point to a previous key and then push fails.
    let existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      try {
        await existingSubscription.unsubscribe();
      } catch (err) {
        console.warn("Old push unsubscribe failed, continuing:", err);
      }
    }

    let subscription;
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
    } catch (err) {
      console.error("Push subscribe failed:", err);
      const msg = String(err?.message || err || "");
      if (/permission|denied/i.test(msg)) {
        showMessage("Browser nije dozvolio obaveštenja. Proverite dozvole za citystyle.app.", "error");
      } else if (/applicationServerKey|vapid|key/i.test(msg)) {
        showMessage("Push ključ ne odgovara. Proveri VAPID public/private key par.", "error");
      } else if (/service worker|registration|active/i.test(msg)) {
        showMessage("Push servis nije aktivan. Osvežite stranicu ili ponovo instalirajte PWA.", "error");
      } else {
        showMessage(`Push servis ne može da se aktivira: ${msg || "nepoznata greška"}`, "error");
      }
      return false;
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      showMessage("Browser nije vratio kompletne push podatke.", "error");
      return false;
    }

    const payload = {
      salon_id: salonId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      expiration_time: json.expirationTime || null,
      user_agent: navigator.userAgent,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    const { error } = await savePushSubscriptionToDb(payload);

    if (error) {
      console.error("Push subscription save error:", error);
      if (/row-level security|rls/i.test(error.message || "")) {
        showMessage("Push nije sačuvan: Supabase RLS blokira push_subscriptions.", "error");
      } else if (/relation|does not exist|schema/i.test(error.message || "")) {
        showMessage("Push tabela ne postoji: pokreni SQL za push_subscriptions.", "error");
      } else {
        showMessage(`Obaveštenja nisu sačuvana u bazi: ${error.message || "greška"}`, "error");
      }
      return false;
    }

    showMessage("Obaveštenja su uključena za ovaj profil.", "success");

    // Local visible proof that browser notification permission and SW work.
    try {
      await registration.showNotification("CityStyle obaveštenja uključena", {
        body: "Ako vidite ovo, telefon/laptop prima obaveštenja za ovaj profil.",
        icon: "/assets/icons/icon-192.png",
        badge: "/assets/icons/icon-192.png",
        tag: "citystyle-push-test"
      });
    } catch (err) {
      console.warn("Test notification failed:", err);
    }

    return true;
  } catch (err) {
    console.error("registerPushForSalon error:", err);
    showMessage(`Greška pri uključivanju obaveštenja: ${err.message || "nepoznata greška"}`, "error");
    return false;
  }
}

async function notifyOwnerAboutNewAppointment(appointmentId) {
  if (!appointmentId || !window.db?.functions?.invoke) return;
  try {
    await window.db.functions.invoke("send-appointment-push", {
      body: { appointment_id: appointmentId }
    });
  } catch (err) {
    console.warn("Push notifikacija nije poslata:", err);
  }
}

window.App = {
  getUrlParam,
  saveLocal,
  getLocal,
  removeLocal,
  setSessionValue,
  getSessionValue,
  showMessage,
  setAppBadgeCount,
  clearAppBadgeCount,
  normalizeSalonTheme,
  normalizeAppLanguage,
  setAppLanguage,
  getAppLanguage,
  t,
  applySalonTheme,
  clearSalonTheme,
  registerPushForSalon,
  notifyOwnerAboutNewAppointment,
  formatDate,
  formatMoney,
  escapeHtml,
  escapeJs,
  formatServicePrice,
  normalizeBusinessType,
  getBusinessProfileLabels,
    normalizePhoneForTel,
  normalizeCurrency,
  checkSalonAccess,
  saveCurrentSalon,
  getSavedSalonSlug,
  clearSavedSalon,
  getAppBaseUrl,
  getAppPath,
  getSalonPublicLink,
  getSalonProfileCode,
  getSalonProfileLink,
  getProfileInstallGatewayUrl,
  getSalonSourceLink,
  getQrImageUrl,
  installApp,
  installSalonApp,
  installOwnerApp,
  updateManifestForOwner,
  updateManifestForSalon,
  getInitialsFromName,
  isStandaloneMode
};
