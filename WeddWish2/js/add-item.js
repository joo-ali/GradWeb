import { API_BASE } from "./config.js";
import { supabase } from "./supabaseClient.js";
// helpers
function safeTitle(title) {
  return (title || "").trim().replaceAll(" ", "_");
}
function safeFileName(originalName = "img.png") {
  const parts = originalName.split(".");
  const ext = parts.length > 1 ? parts.pop() : "png";
  return `img_${Date.now()}.${ext}`;
}
async function fileToUint8Array(file) {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

async function uploadWishlistItemImage({ userId, itemTitle, file }) {
  const bytes = await fileToUint8Array(file);
  const title = safeTitle(itemTitle);
  const filename = safeFileName(file.name);

  // ✅ نفس path بتاع Flutter
  const path = `users/${userId}/whishList/${title}/itemImages/${filename}`;

  const { error } = await supabase.storage
    .from("user-uploads")
    .upload(path, bytes, { upsert: true, contentType: file.type || "image/png" });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabase.storage.from("user-uploads").getPublicUrl(path);
  const publicUrl = data?.publicUrl;

  if (!publicUrl) throw new Error("Failed to get public URL");

  return { publicUrl, path };
}

async function getCurrentUserIdAndToken() {
  const jwt = localStorage.getItem("jwt");
  const userStr = localStorage.getItem("user");
  if (!jwt || !userStr) throw new Error("User not logged in");

  let userId = null;
  try {
    userId = JSON.parse(userStr)?.id;
  } catch {}

  if (!userId) throw new Error("User not logged in");

  return { userId, jwt };
}

async function fetchUser(userId, jwt) {
  const res = await fetch(`${API_BASE}/api/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "ngrok-skip-browser-warning": "true",
    },
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Server returned non-JSON"); }

  if (!res.ok) throw new Error(data?.error?.message || `Failed to fetch user: ${res.status}`);
  return data;
}

function normalizeWishlist(rawWishlist) {
  if (!rawWishlist) return [];
  if (typeof rawWishlist === "string") {
    try { return JSON.parse(rawWishlist) || []; } catch { return []; }
  }
  if (Array.isArray(rawWishlist)) return rawWishlist;
  return [];
}

async function updateWishlist(userId, jwt, newWishlist) {
  const res = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ wishlist: newWishlist }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Server returned non-JSON"); }

  if (!res.ok) throw new Error(data?.error?.message || `Failed to update user: ${res.status}`);
  return data;
}

// UI
const form = document.getElementById("addItemForm");
const msg = document.getElementById("addItemMsg");

function setMsg(text, ok = false) {
  if (!msg) return;
  msg.textContent = text;
  msg.style.color = ok ? "green" : "red";
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("");

  const name = document.getElementById("itemName")?.value?.trim();
  const goal = Number(document.getElementById("itemGoal")?.value);
  const desc = document.getElementById("itemUrl")?.value?.trim() || "";
  const file = document.getElementById("product-image")?.files?.[0];

  if (!name) return setMsg("Item name is required.");
  if (!goal || goal < 1) return setMsg("Target amount must be at least 1.");
  if (!file) return setMsg("Please upload an item image.");

  try {
    setMsg("Uploading image...", true);

    const { userId, jwt } = await getCurrentUserIdAndToken();

    // 1) Upload to Supabase
    const { publicUrl } = await uploadWishlistItemImage({
      userId,
      itemTitle: name,
      file,
    });

    setMsg("Saving item...", true);

    // 2) Get current wishlist
    const user = await fetchUser(userId, jwt);
    const currentWishlist = normalizeWishlist(user?.wishlist);

    // 3) Add new item (زي Dart + fields إضافية)
    const newItem = {
      id: Date.now(),
      title: name,
      price: goal,
      url: "https://example.com",
      image: publicUrl,
      createdAt: new Date().toISOString(),
      donated: 0,
      donors: [],
    };

    currentWishlist.push(newItem);

    // 4) PUT updated wishlist
    await updateWishlist(userId, jwt, currentWishlist);

    setMsg("Item added successfully ✅", true);

    // روح للبروفايل
    window.location.href = "user-profile.html";
  } catch (err) {
    console.error(err);
    setMsg(err?.message || "Something went wrong.");
  }
});
