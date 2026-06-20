// js/searchUsers.js
// Shared search helper kept for backward compatibility. UI drawer lives in js/search-drawer.js.
import { API_BASE } from "./config.js";

function normalizeSearchUser(user) {
  if (!user) return {};
  if (user.attributes) return { id: user.id, ...user.attributes };
  return user;
}

export async function searchUsers(query) {
  const q = (query || "").trim();
  if (!q) return [];

  const res = await fetch(`${API_BASE}/api/search-users?q=${encodeURIComponent(q)}`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });

  if (!res.ok) throw new Error("Search request failed");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
