// assets/js/config.js

const SUPABASE_URL = "https://uxoovyytydnuibiwnpgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_FFMUyqNXSuVP0mMsUa5PbQ_ur3iwb0L";

window.APP_CONFIG = {
  appName: "CityStyle",
  platformAdminEmail: "duskomacak@gmail.com",
  salonStorageKey: "citystyle_saved_salon",
  salonSessionKey: "citystyle_salon_session",
  pushVapidPublicKey: "BNFB3Zs8op_mn7nUQgxcOQWCNco_jb7M7gdvTE__orfWVg8p5dGg6KWvJ4fM2Psg1eauWH0ybr5QnOLgjeMeQHs"
};

// Supabase CDN must be loaded before this file. Do not break the landing page if CDN is slow/blocked.
if (window.supabase && typeof window.supabase.createClient === "function") {
  window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error("Supabase CDN nije učitan. Proveri internet/CDN ili adblock.");
  window.db = null;
}
