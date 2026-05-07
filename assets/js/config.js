// assets/js/config.js

const SUPABASE_URL = "https://YOUR_SUPABASE_URL.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

// Supabase CDN must be loaded before this file.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.db = db;

window.APP_CONFIG = {
  appName: "CityStyle",
  platformAdminEmail: "duskomacak@gmail.com",
  salonStorageKey: "citystyle_saved_salon",
  salonSessionKey: "citystyle_salon_session"
};
