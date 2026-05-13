// js/api.js
import { API_BASE } from "./config.js";

export async function getUsers() {
  const res = await fetch(`${API_BASE}/api/users?populate=*`);
  if (!res.ok) throw new Error("Failed to fetch users");
  return await res.json();
}

// ✅ ده السطر اللي بيحل المشكلة
export const api = { getUsers };
