// js/config.js

// ✅ Strapi / ngrok base
export const API_BASE =
  localStorage.getItem("API_BASE")?.trim()?.replace(/\/$/, "") ||
  "https://2b2a-156-216-229-126.ngrok-free.app";

// ✅ Supabase
export const SUPABASE_URL = "https://cprjyoteonirclrakvio.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwcmp5b3Rlb25pcmNscmFrdmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5ODg3NDAsImV4cCI6MjA3OTU2NDc0MH0.rzBN7i6MixQ87oLj4hY03PPKOePYcGXNF0t-4Ja-e94";

// (اختياري) لو عايز تغيّر ngrok من غير تعديل كود
export function setApiBase(url) {
  localStorage.setItem("API_BASE", (url || "").trim().replace(/\/$/, ""));
}

// ✅ Web base (للينكات الشير)
// لو فاتح من localhost/127.0.0.1 → استخدم ngrok web domain
export const NGROK_WEB_BASE =
  localStorage.getItem("WEB_BASE")?.trim()?.replace(/\/$/, "") ||
  "https://lianne-sauciest-cory.ngrok-free.dev";

export const WEB_APP_PATH = "/GradWep";

export const WEB_BASE =
  (location.hostname === "127.0.0.1" || location.hostname === "localhost")
    ? NGROK_WEB_BASE
    : window.location.origin;

// (اختياري) تغيّر ngrok web من غير تعديل كود
export function setWebBase(url) {
  localStorage.setItem("WEB_BASE", (url || "").trim().replace(/\/$/, ""));
}

