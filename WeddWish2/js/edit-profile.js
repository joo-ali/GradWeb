// js/edit-profile.js
import { API_BASE } from "./config.js";
import { supabase } from "./supabaseClient.js";
import { getUserData } from "./getUserData.js";

function normalizeUser(u) {
  if (!u) return null;
  if (u.attributes) return { id: u.id, ...u.attributes };
  return u;
}

function safeFileName(originalName = "img.png") {
  const parts = originalName.split(".");
  const ext = parts.length > 1 ? parts.pop() : "png";
  return `profile_${Date.now()}.${ext}`;
}

async function fileToUint8Array(file) {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

function getAuth() {
  // نفس منطق getUserData.js تقريبًا:contentReference[oaicite:12]{index=12}
  const jwt = localStorage.getItem("jwt");
  const userStr = localStorage.getItem("user");

  const tokenFallback = localStorage.getItem("token");
  const userIdFallback = localStorage.getItem("userId");

  let token = jwt || tokenFallback;
  let userId = userIdFallback;

  if (!userId && userStr) {
    try { userId = JSON.parse(userStr)?.id; } catch {}
  }

  if (!token || !userId) throw new Error("User not logged in");
  return { token, userId };
}

async function uploadProfileImage({ userId, file }) {
  // نفس pattern بتاع add-item.js (upload + getPublicUrl):contentReference[oaicite:13]{index=13}
  const bytes = await fileToUint8Array(file);
  const filename = safeFileName(file.name);
  const path = `users/${userId}/profileImages/${filename}`;

  const { error } = await supabase.storage
    .from("user-uploads")
    .upload(path, bytes, { upsert: true, contentType: file.type || "image/png" });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabase.storage.from("user-uploads").getPublicUrl(path);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) throw new Error("Failed to get public URL");

  return publicUrl;
}

async function updateStrapiProfileImage({ userId, token, publicUrl }) {
  const res = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ profileImageURL: publicUrl }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Server returned non-JSON"); }
  if (!res.ok) throw new Error(data?.error?.message || `Update failed: ${res.status}`);

  return data;
}

document.addEventListener("DOMContentLoaded", async () => {
  const preview = document.getElementById("editAvatarPreview");
  const fileInput = document.getElementById("editAvatarFile");
  const saveBtn = document.getElementById("saveAvatarBtn");
  const cancelBtn = document.getElementById("cancelEditBtn");
  const statusEl = document.getElementById("editStatus");

  const usernameEl = document.getElementById("editUsername");
  const emailEl = document.getElementById("editEmail");

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }

  // Load current user
  try {
    const userRaw = await getUserData(); // بيجيب user من Strapi:contentReference[oaicite:14]{index=14}
    const u = normalizeUser(userRaw);

    const name = u?.username || u?.name || "User";
    const email = u?.email || "-";
    if (usernameEl) usernameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;

    const profileUrl = u?.profileImageURL || u?.profileImageUrl || "";
    if (preview) preview.src = profileUrl || "images/default-avatar.png";
  } catch (e) {
    console.error(e);
    window.location.href = "login.html";
    return;
  }

  // Live preview
  let tempUrl = null;
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file || !preview) return;

    if (tempUrl) URL.revokeObjectURL(tempUrl);
    tempUrl = URL.createObjectURL(file);
    preview.src = tempUrl;
    setStatus("");
  });

  cancelBtn?.addEventListener("click", () => {
    window.location.href = "user-profile.html";
  });

  saveBtn?.addEventListener("click", async () => {
    try {
      const file = fileInput?.files?.[0];
      if (!file) {
        alert("اختار صورة الأول");
        return;
      }

      setStatus("Uploading image...");
      saveBtn.disabled = true;

      const { token, userId } = getAuth();

      const publicUrl = await uploadProfileImage({ userId, file });

      setStatus("Updating profile...");
      await updateStrapiProfileImage({ userId, token, publicUrl });

      // Update localStorage user object (علشان النافبار/البروفايل يجيب الجديد بعد refresh)
      try {
        const stored = JSON.parse(localStorage.getItem("user") || "{}");
        localStorage.setItem("user", JSON.stringify({ ...stored, profileImageURL: publicUrl }));
      } catch {}

      setStatus("Done ✅");
      window.location.href = "user-profile.html";
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to update profile image");
      setStatus("");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  });
});
