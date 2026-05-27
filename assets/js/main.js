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

  const suffix = currency === "EUR" ? "EUR" : "RSD";

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

async function checkSalonAccess(slug) {
  if (!slug) return { data: null, error: "Nedostaje salon slug." };
  if (!window.db) return { data: null, error: "Supabase nije učitan." };

  const { data, error } = await window.db
    .from("salons")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .eq("is_deleted", false)
    .maybeSingle();

  return { data, error };
}

async function checkProfileAccess(publicProfileCode) {
  const code = String(publicProfileCode || "").trim();
  if (!code) return { data: null, error: "Nedostaje javni kod profila." };
  if (!window.db) return { data: null, error: "Supabase nije učitan." };

  const { data, error } = await window.db
    .from("salons")
    .select("*")
    .eq("public_profile_code", code)
    .eq("status", "active")
    .eq("is_deleted", false)
    .maybeSingle();

  return { data, error };
}

function getSalonPublicIdentity(profileOrSlug = "") {
  if (profileOrSlug && typeof profileOrSlug === "object") {
    const code = String(profileOrSlug.public_profile_code || profileOrSlug.profile_code || "").trim();
    if (code) return { key: "profile", value: code };
    const slug = String(profileOrSlug.slug || "").trim();
    if (slug) return { key: "salon", value: slug };
    return { key: "salon", value: "" };
  }

  const value = String(profileOrSlug || "").trim();
  if (value.startsWith("cs_p_")) return { key: "profile", value };
  return { key: "salon", value };
}

function saveCurrentSalon(profileOrSlug) {
  const identity = getSalonPublicIdentity(profileOrSlug);
  if (!identity.value) return;
  saveLocal(window.APP_CONFIG.salonStorageKey, {
    slug: profileOrSlug?.slug || (identity.key === "salon" ? identity.value : ""),
    public_profile_code: profileOrSlug?.public_profile_code || (identity.key === "profile" ? identity.value : ""),
    savedAt: new Date().toISOString()
  });
}

function getSavedSalonSlug() {
  const saved = getLocal(window.APP_CONFIG.salonStorageKey);
  return saved?.slug || null;
}

function getSavedProfileCode() {
  const saved = getLocal(window.APP_CONFIG.salonStorageKey);
  return saved?.public_profile_code || null;
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

function getSalonPublicLink(profileOrSlug) {
  const identity = getSalonPublicIdentity(profileOrSlug);
  if (!identity.value) return getAppBaseUrl();
  return `${getAppBaseUrl()}?${identity.key}=${encodeURIComponent(identity.value)}`;
}

function getSalonSourceLink(profileOrSlug, source = "") {
  const base = getSalonPublicLink(profileOrSlug);
  const cleanSource = String(source || "").trim().toLowerCase();
  if (!cleanSource) return base;
  return `${base}${base.includes("?") ? "&" : "?"}src=${encodeURIComponent(cleanSource)}`;
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
    name: "Opšti biznis", action: "Pošalji zahtev", services: "Usluge / ponuda", formTitle: "Pošaljite zahtev", formIntro: "Izaberite uslugu, datum i slobodan termin. U napomeni možete opisati šta vam treba.", noteLabel: "Napomena / opis zahteva", notePlaceholder: "Napišite dodatne informacije za vlasnika profila.", requestKindLabel: "Vrsta zahteva", requestKindPlaceholder: "npr. upit, usluga, ponuda"
  },
  salon: {
    name: "Salon / termini", action: "Zakaži termin", services: "Usluge i cenovnik", formTitle: "Zakažite termin", formIntro: "Izaberite uslugu, datum i slobodan termin.", noteLabel: "Napomena", notePlaceholder: "Opcionalno", requestKindLabel: "Željena usluga", requestKindPlaceholder: "npr. šišanje, farbanje, tretman"
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
    welcomeDefault: "Dobrodošli. Izaberite uslugu, datum i slobodan termin ili pošaljite zahtev.",
    sendRequest: "Pošalji zahtev",
    servicesOffer: "Usluge / ponuda",
    installThisProfile: "Preuzmi app ovog profila",
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
    chooseServiceDateTime: "Izaberite uslugu, datum i slobodan termin.",
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
let currentInstallContext = {
  type: "platform",
  name: "CityStyle",
  url: "",
  identity: ""
};

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  // Sačuvaj prompt odmah. Ako ga bacimo dok čekamo profil manifest,
  // Chrome često više ne pošalje novi prompt i instalacija stoji/zaglavi.
  deferredPrompt = event;
  window.__CITYSTYLE_DEFERRED_INSTALL_PROMPT__ = event;

  // Prompt čuvamo odmah. Profil stranice imaju rani stabilan manifest,
  // a pravi naziv se dopuni čim Supabase učita profil.
  showInstallButton();
});

function showInstallButton() {
  if (document.getElementById("install-app-btn")) return;

  const path = window.location.pathname || "/";
  const hasSalonParam = !!getUrlParam("salon");
  const hasProfileParam = !!getUrlParam("profile");

  // Generičko floating dugme je samo za platformu.
  // Profil ima svoje dugme: "Preuzmi app ovog profila".
  if (hasSalonParam || hasProfileParam || path.includes("/admin") || path.includes("/salon")) return;

  const btn = document.createElement("button");
  btn.id = "install-app-btn";
  btn.className = "install-floating-btn";
  btn.type = "button";
  btn.textContent = "📱 Preuzmi CityStyle app";
  btn.addEventListener("click", () => installApp("Na iPhone-u: Share → Add to Home Screen.", "CityStyle je dodat na telefon."));
  document.body.appendChild(btn);
}

async function installSalonApp(profileOrSlug, options = {}) {
  const profileCode = options.publicProfileCode || options.profileCode || profileOrSlug?.public_profile_code || "";
  const slug = typeof profileOrSlug === "object" ? (profileOrSlug.slug || "") : String(profileOrSlug || "");
  if (profileOrSlug) saveCurrentSalon({
    slug,
    public_profile_code: profileCode
  });

  const identity = getSalonPublicIdentity({ slug, public_profile_code: profileCode });
  const encodedIdentity = encodeURIComponent(identity.value || slug || profileCode || "");
  const installPath = identity.value
    ? `${getAppPath("p/")}?${identity.key}=${encodedIdentity}&install=1&v=v136profilepwa`
    : window.location.href;

  currentInstallContext = {
    type: "customer",
    name: String(options.name || options.displayName || profileOrSlug?.salon_name || "CityStyle profil").trim(),
    url: installPath,
    identity: identity.value || slug || profileCode || ""
  };

  // Customer profile installs now go through /p/ so Android Chrome sees a separate
  // profile PWA scope/identity instead of mixing salon/prodavnica with the root app.
  // This avoids the "already installed" modal for normal profile install attempts.
  if (identity.value && !(window.location.pathname || "/").includes("/p/")) {
    window.location.href = installPath;
    return;
  }

  updateManifestForSalon(profileOrSlug || getSavedProfileCode() || getSavedSalonSlug(), options);

  await installApp(
    "Ako se ne pojavi instalacija, otvorite meni browsera i izaberite Dodaj na početni ekran. Prečica će otvoriti baš ovaj profil, sa imenom i slikom profila gde browser to podržava.",
    "Prečica ovog profila je dodata na telefon."
  );
}

async function installOwnerApp(options = {}) {
  clearSavedSalon();
  updateManifestForOwner(options);

  const profileCode = String(options.publicProfileCode || options.profileCode || "").trim();
  const slug = String(options.slug || "").trim();
  const startQuery = profileCode
    ? `owner_profile=${encodeURIComponent(profileCode)}`
    : (slug ? `owner_salon=${encodeURIComponent(slug)}` : "pwa_owner=1");

  currentInstallContext = {
    type: "owner",
    name: String(options.name || options.displayName || "CityStyle profil").trim() + " Panel",
    url: `${getAppPath("salon/")}?${startQuery}&v=v136profilepwa`,
    identity: profileCode || slug || "owner"
  };

  await installApp("Na iPhone-u: otvorite ovaj panel u Safari browseru, pritisnite Share i izaberite Add to Home Screen. Panel vlasnika ostaje zapamćen.", "Panel vlasnika je dodat na telefon.");
}

function setDynamicManifest(manifest, iconUrl = "") {
  const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
  const url = URL.createObjectURL(blob);
  let link = document.querySelector('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  link.href = url;

  // Pravi manifest profila/panela je sada postavljen.
  // Ne brišemo deferredPrompt, jer Chrome često ne šalje drugi prompt.
  window.__CITYSTYLE_PROFILE_MANIFEST_READY__ = true;

  if (iconUrl) {
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') || document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    appleIcon.href = iconUrl;
    if (!appleIcon.parentNode) document.head.appendChild(appleIcon);

    const favIcon = document.querySelector('link[rel="icon"]') || document.createElement("link");
    favIcon.rel = "icon";
    favIcon.href = iconUrl;
    if (!favIcon.parentNode) document.head.appendChild(favIcon);
  }

  if (manifest?.start_url || manifest?.name || manifest?.id) {
    currentInstallContext = {
      ...currentInstallContext,
      name: manifest?.name || currentInstallContext.name || "CityStyle",
      url: manifest?.start_url ? new URL(manifest.start_url, getAppBaseUrl()).href : currentInstallContext.url,
      identity: manifest?.id || currentInstallContext.identity || ""
    };
  }

  if (manifest?.name) {
    document.title = manifest.name;
    const appTitle = document.querySelector('meta[name="application-name"]') || document.createElement("meta");
    appTitle.name = "application-name";
    appTitle.content = manifest.name;
    if (!appTitle.parentNode) document.head.appendChild(appTitle);

    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]') || document.createElement("meta");
    appleTitle.name = "apple-mobile-web-app-title";
    appleTitle.content = manifest.name;
    if (!appleTitle.parentNode) document.head.appendChild(appleTitle);
  }

  if (manifest?.theme_color) {
    const themeMeta = document.querySelector('meta[name="theme-color"]') || document.createElement("meta");
    themeMeta.name = "theme-color";
    themeMeta.content = manifest.theme_color;
    if (!themeMeta.parentNode) document.head.appendChild(themeMeta);
  }
}

function getManifestIconType(src = "") {
  const clean = String(src || "").split("?")[0].toLowerCase();
  if (clean.startsWith("data:image/webp") || clean.endsWith(".webp")) return "image/webp";
  if (clean.startsWith("data:image/jpeg") || clean.startsWith("data:image/jpg") || clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.startsWith("data:image/png") || clean.endsWith(".png")) return "image/png";
  return "image/png";
}

function updateManifestForOwner(options = {}) {
  const rawName = String(options.name || options.displayName || options.businessName || "").trim();
  const appName = rawName ? `${rawName} Panel` : "CityStyle - Panel vlasnika";
  const shortName = appName.length > 12 ? appName.slice(0, 12).trim() : appName;
  const theme = normalizeSalonTheme(options.themeColor || "classic-red");
  const initialsIcon = makeInitialsIconDataUrl(appName, theme);
  const profileCode = String(options.publicProfileCode || options.profileCode || "").trim();
  const slug = String(options.slug || "").trim();
  const profileImageIcon = String(options.iconUrl || "").trim();
  const iconUrl = `${getAppBaseUrl()}assets/icons/icon-192.png`;
  const icon512 = `${getAppBaseUrl()}assets/icons/icon-512.png`;
  const appleProfileIcon = profileImageIcon || icon512;
  const identity = profileCode || slug || "owner";
  const encodedIdentity = encodeURIComponent(identity);
  const startQuery = profileCode
    ? `owner_profile=${encodeURIComponent(profileCode)}`
    : (slug ? `owner_salon=${encodeURIComponent(slug)}` : "pwa_owner=1");

  const baseManifest = {
    id: `${getAppBaseUrl()}pwa/owner/${encodedIdentity}`,
    name: appName,
    short_name: shortName || "Panel",
    description: `Direktan ulaz u vlasnički panel: ${rawName || "CityStyle profil"}.`,
    start_url: `${getAppPath("salon/")}?${startQuery}&v=v136profilepwa`,
    scope: getAppPath("salon/"),
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#0b0b0f",
    theme_color: theme,
    orientation: "portrait",
    icons: [
      { src: initialsIcon, sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: iconUrl, sizes: "192x192", type: getManifestIconType(iconUrl), purpose: "any maskable" },
      { src: icon512, sizes: "512x512", type: getManifestIconType(icon512), purpose: "any maskable" }
    ]
  };
  try {
    setDynamicManifest(baseManifest, appleProfileIcon);
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
    return `${getAppBaseUrl()}assets/icons/icon-512.png`;
  }
}

function updateManifestForSalon(profileOrSlug, options = {}) {
  const identity = getSalonPublicIdentity({
    slug: typeof profileOrSlug === "object" ? profileOrSlug.slug : String(profileOrSlug || ""),
    public_profile_code: options.publicProfileCode || options.profileCode || profileOrSlug?.public_profile_code || ""
  });
  if (!identity.value) return;
  const rawName = String(options.name || options.displayName || "").trim();
  const appName = rawName || "CityStyle profil";
  const shortName = appName.length > 12 ? appName.slice(0, 12).trim() : appName;
  const theme = normalizeSalonTheme(options.themeColor || "classic-red");
  const initialsIcon = makeInitialsIconDataUrl(appName, theme);
  const profileImageIcon = String(options.iconUrl || options.coverIconUrl || "").trim();
  const iconUrl = `${getAppBaseUrl()}assets/icons/icon-192.png`;
  const icon512 = `${getAppBaseUrl()}assets/icons/icon-512.png`;
  const appleProfileIcon = profileImageIcon || icon512;
  const encodedIdentity = encodeURIComponent(identity.value);
  const startUrl = `${getAppPath("p/")}?${identity.key}=${encodedIdentity}&pwa_profile=${encodedIdentity}&v=v136profilepwa`;

  const baseManifest = {
    id: `${getAppPath("p/")}app/${identity.key}/${encodedIdentity}`,
    name: appName,
    short_name: shortName || "Profil",
    description: `Direktan ulaz u CityStyle profil: ${appName}.`,
    start_url: startUrl,
    scope: getAppPath("p/"),
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#0b0b0f",
    theme_color: theme,
    orientation: "portrait",
    categories: ["business", "shopping", "lifestyle"],
    icons: [
      { src: initialsIcon, sizes: "512x512", type: "image/png", purpose: "any maskable" },
      { src: iconUrl, sizes: "192x192", type: getManifestIconType(iconUrl), purpose: "any maskable" },
      { src: icon512, sizes: "512x512", type: getManifestIconType(icon512), purpose: "any maskable" }
    ],
    shortcuts: [
      {
        name: appName,
        short_name: shortName || "Profil",
        url: startUrl,
        icons: [{ src: iconUrl, sizes: "192x192", type: getManifestIconType(iconUrl) }]
      }
    ]
  };
  try {
    setDynamicManifest(baseManifest, appleProfileIcon);
    window.__CITYSTYLE_PROFILE_PWA__ = {
      identity,
      name: appName,
      start_url: startUrl,
      icon: iconUrl
    };
  } catch (err) {
    console.warn("Dynamic manifest nije postavljen:", err);
  }
}

function getCurrentInstallTargetUrl() {
  const contextUrl = String(currentInstallContext?.url || "").trim();
  if (contextUrl) return contextUrl;
  return window.location.href;
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent || "");
}

function openInstallTargetInNormalBrowser(url) {
  const target = String(url || window.location.href);
  try {
    if (isAndroidDevice()) {
      const parsed = new URL(target, window.location.href);
      const fallback = encodeURIComponent(parsed.href);
      const intentUrl = `intent://${parsed.host}${parsed.pathname}${parsed.search}#Intent;scheme=${parsed.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
      window.location.href = intentUrl;
      return true;
    }
    window.open(target, "_blank", "noopener");
    return true;
  } catch (err) {
    try { window.open(target, "_blank", "noopener"); return true; } catch (e) { return false; }
  }
}

function showInstallHelp(noPromptMessage = "Na iPhone-u: Share → Add to Home Screen.") {
  const currentUrl = getCurrentInstallTargetUrl();
  const contextName = String(currentInstallContext?.name || document.title || "CityStyle").trim();
  const isStandalone = isStandaloneMode();

  if (isStandalone && isAndroidDevice()) {
    openInstallTargetInNormalBrowser(currentUrl);
    showMessage("Otvaram ovaj profil u Chrome browseru za zasebnu instalaciju.", "info");
    return;
  }

  const title = isStandalone ? "Instaliraj kao novu prečicu" : "Instalacija profila";
  const mainText = isStandalone
    ? "Za zasebnu prečicu mora se otvoriti tačan profil u običnom browseru. Ova aplikacija će pokušati da otvori browser; zatim izaberite Dodaj na početni ekran."
    : noPromptMessage;

  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <div class="modal-card">
      <h2>${escapeHtml(title)}</h2>
      <p class="muted">${escapeHtml(contextName)}</p>
      <p>${escapeHtml(mainText)}</p>
      <div class="link-box"><input readonly value="${escapeHtml(currentUrl)}"></div>
      <div class="card-actions center">
        <button class="btn btn-primary" type="button" onclick="window.App.openInstallTargetInNormalBrowser('${escapeJs(currentUrl)}')">Otvori u browseru</button>
        <button class="btn btn-dark" type="button" onclick="copyText('${escapeJs(currentUrl)}', this)">Kopiraj link profila</button>
        <button class="btn btn-dark" type="button" onclick="this.closest('.modal-backdrop').remove()">Zatvori</button>
      </div>
      <p class="muted small">Za svaki salon/prodavnicu koristi se poseban PWA identitet. Ako telefon ne prihvati logo kao ikonicu, koristi se stabilna CityStyle ikonica da instalacija ne stane.</p>
    </div>
  `;
  document.body.appendChild(modal);
}

async function installApp(noPromptMessage = "Na iPhone-u: Share → Add to Home Screen.", successMessage = "CityStyle je dodat na telefon.") {
  // If the user is already inside one installed PWA shortcut, many browsers will not
  // show a second install prompt for another profile from inside that PWA window.
  // The safe flow is to open the exact profile link in the normal browser.
  if (isStandaloneMode()) {
    showInstallHelp(noPromptMessage);
    return;
  }

  if (!deferredPrompt && window.__CITYSTYLE_DEFERRED_INSTALL_PROMPT__) {
    deferredPrompt = window.__CITYSTYLE_DEFERRED_INSTALL_PROMPT__;
  }

  if (!deferredPrompt) {
    // Dajemo browseru kratak trenutak posle promene manifest-a.
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  if (!deferredPrompt && window.__CITYSTYLE_DEFERRED_INSTALL_PROMPT__) {
    deferredPrompt = window.__CITYSTYLE_DEFERRED_INSTALL_PROMPT__;
  }

  if (!deferredPrompt) {
    showInstallHelp(noPromptMessage);
    return;
  }

  try {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === "accepted") {
      showMessage(successMessage, "success");
      document.getElementById("install-app-btn")?.remove();
    } else {
      showMessage("Instalacija je otkazana.", "info");
    }
  } catch (err) {
    console.warn("Install prompt failed:", err);
    showInstallHelp(noPromptMessage);
  } finally {
    deferredPrompt = null;
    window.__CITYSTYLE_DEFERRED_INSTALL_PROMPT__ = null;
  }
}

window.addEventListener("appinstalled", () => {
  document.getElementById("install-app-btn")?.remove();
  const name = String(currentInstallContext?.name || "CityStyle").trim();
  showMessage(`${name} je dodat na početni ekran.`, "success");
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
    await navigator.serviceWorker.register("/sw.js?v=v136profilepwa", { scope: "/" });
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
  checkProfileAccess,
  getSalonPublicIdentity,
  saveCurrentSalon,
  getSavedSalonSlug,
  getSavedProfileCode,
  clearSavedSalon,
  getAppBaseUrl,
  getAppPath,
  getSalonPublicLink,
  getSalonSourceLink,
  getQrImageUrl,
  installApp,
  installSalonApp,
  installOwnerApp,
  openInstallTargetInNormalBrowser,
  updateManifestForOwner,
  updateManifestForSalon,
  getInitialsFromName,
  isStandaloneMode
};
