// assets/js/config.js

const SUPABASE_URL = "https://uxoovyytydnuibiwnpgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FFMUyqNXSuVP0mMsUa5PbQ_ur3iwb0L";

// Supabase CDN must be loaded before this file.
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.db = db;

window.APP_CONFIG = {
  appName: "CityStyle",
  platformAdminEmail: "duskomacak@gmail.com",
  salonStorageKey: "citystyle_saved_salon",
  salonSessionKey: "citystyle_salon_session"
};
