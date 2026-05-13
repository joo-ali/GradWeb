// js/profileApi.js
// Web version of the profile routes used in GradApp Api_service.dart
// Keeps only the routes/field names; GradApp itself is not modified.

import { API_BASE } from "./config.js";
import { supabase } from "./supabaseClient.js";

export const PROFILE_STORAGE_BUCKET = "user-uploads";
export const PROFILE_IMAGE_FIELD = "profileImageURL";

export function normalizeUser(user) {
  if (!user) return null;
  if (user.attributes) return { id: user.id, ...user.attributes };
  return user;
}

function getUserIdFromStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null")?.id || null;
  } catch {
    return null;
  }
}

export function getProfileAuth() {
  const token = localStorage.getItem("jwt") || localStorage.getItem("token");
  const userId = localStorage.getItem("userId") || getUserIdFromStoredUser();

  if (!token || !userId) {
    throw new Error("User not logged in");
  }

  return { token, userId };
}

function safeProfileFileName(originalName = "profile.png") {
  const cleanName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const parts = cleanName.split(".");
  const ext = parts.length > 1 ? parts.pop() : "png";
  return `profile_${Date.now()}.${ext}`;
}

export async function uploadProfileImage({ userId, file }) {
  if (!file) return null;
  if (!file.type?.startsWith("image/")) {
    throw new Error("Please choose a valid image file.");
  }

  // Same GradApp/Supabase path pattern:
  // users/$userId/profileImages/$fileName
  const fileName = safeProfileFileName(file.name);
  const path = `users/${userId}/profileImages/${fileName}`;

  const { error } = await supabase.storage
    .from(PROFILE_STORAGE_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type || "image/png",
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(PROFILE_STORAGE_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;

  if (!publicUrl) {
    throw new Error("Failed to get uploaded image public URL");
  }

  return publicUrl;
}

export async function updateUserProfile({ userId, token, profile }) {
  // Same GradApp Strapi route:
  // PUT /api/users/:userId
  const res = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify(profile),
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error("Server returned non-JSON response");
  }

  if (!res.ok) {
    throw new Error(data?.error?.message || `Update failed: ${res.status}`);
  }

  return normalizeUser(data?.data || data) || profile;
}

export function updateStoredUser(patch) {
  try {
    const stored = JSON.parse(localStorage.getItem("user") || "{}");
    const merged = { ...stored, ...patch };
    localStorage.setItem("user", JSON.stringify(merged));

    if (merged.id) {
      localStorage.setItem("userId", String(merged.id));
    }
  } catch {
    localStorage.setItem("user", JSON.stringify(patch));
  }
}
