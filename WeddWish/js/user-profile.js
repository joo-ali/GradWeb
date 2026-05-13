//import { getUserData } from "./getUserData.js";
//
//(async function () {
//  try {
//    const user = await getUserData();
//    console.log("USER:", user);
//
//    const grid = document.getElementById("wishlistGrid");
//    if (!grid) return;
//
//    grid.innerHTML = "";
//
//    (user.wishlist || []).forEach(item => {
//      const donated = item.donated || 0;
//      const percent = Math.min((donated / item.price) * 100, 100);
//
//      grid.innerHTML += `
//        <div class="wishlist-card">
//          <img src="${item.image}">
//          <div class="item-info">
//            <h3>${item.title}</h3>
//            <p class="item-price">${item.price} EGP goal</p>
//
//            <div class="donation-progress">
//              <div class="donation-progress-fill"
//                   style="width:${percent}%"></div>
//            </div>
//
//            <span class="donation-progress-text">
//              ${donated} / ${item.price}
//            </span>
//          </div>
//        </div>
//      `;
//    });
//
//  } catch (e) {
//    console.error(e);
//    if (e.message.includes("not logged in")) {
//      window.location.href = "login.html";
//    }
//  }
//})();
//

import { getUserData } from "./getUserData.js";
import { API_BASE, WEB_BASE, WEB_APP_PATH } from "./config.js";
import { supabase } from "./supabaseClient.js";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = (value ?? "").toString().trim() || "-";
}


function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeWishlist(rawWishlist) {
  if (!rawWishlist) return [];
  if (typeof rawWishlist === "string") {
    try { return JSON.parse(rawWishlist) || []; } catch { return []; }
  }
  if (Array.isArray(rawWishlist)) return rawWishlist;
  return [];
}

const STORAGE_BUCKET = "user-uploads";
const WISHLIST_FOLDER = "whishList";

function safeTitle(title) {
  return (title || "item").trim().replaceAll(" ", "_");
}

function wishlistItemBasePath(userId, itemTitle) {
  return `users/${userId}/${WISHLIST_FOLDER}/${safeTitle(itemTitle)}`;
}

function getStoragePathFromPublicUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const marker = `/object/public/${STORAGE_BUCKET}/`;
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return "";
    return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
  } catch {
    return "";
  }
}

function getWishlistBaseFromImageUrl(imageUrl = "") {
  const storagePath = getStoragePathFromPublicUrl(imageUrl);
  const match = storagePath.match(/^(users\/[^/]+\/whishList\/[^/]+)/);
  return match?.[1] || "";
}

async function removeFilesInStorageFolder(path) {
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(path);
  if (error) throw new Error(`Supabase list failed: ${error.message}`);

  const files = (data || []).filter((f) => f?.name && f?.metadata !== null);
  if (!files.length) return 0;

  const { error: removeError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove(files.map((f) => `${path}/${f.name}`));

  if (removeError) throw new Error(`Supabase delete failed: ${removeError.message}`);
  return files.length;
}

async function deleteWishlistItemStorage({ userId, itemTitle, imageUrl }) {
  const bases = new Set([wishlistItemBasePath(userId, itemTitle)]);
  const imageBase = getWishlistBaseFromImageUrl(imageUrl);
  if (imageBase) bases.add(imageBase);

  let removed = 0;
  for (const base of bases) {
    removed += await removeFilesInStorageFolder(`${base}/itemImages`);
    removed += await removeFilesInStorageFolder(`${base}/itemBills`);
  }

  return removed;
}

function getCurrentUserIdAndToken() {
  const jwt = localStorage.getItem("jwt") || localStorage.getItem("token");
  const userStr = localStorage.getItem("user");
  const fallbackUserId = localStorage.getItem("userId");

  let userId = fallbackUserId;
  if (!userId && userStr) {
    try { userId = JSON.parse(userStr)?.id; } catch {}
  }

  if (!jwt || !userId) throw new Error("User not logged in");
  return { userId, jwt };
}

async function updateWishlistForCurrentUser(newWishlist) {
  const { userId, jwt } = getCurrentUserIdAndToken();

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


// لو Strapi رجّع attributes (احتياطي)
function normalizeUser(u) {
  if (!u) return null;
  if (u.attributes) return { id: u.id, ...u.attributes };
  return u;
}



function renderProfileHeader(user) {
  const u = normalizeUser(user);
  if (!u) return;

  const name =
    u.username ||
    u.fullName ||
    u.name ||
    "User";

  const email = u.email || "-";

  // حسب تسجيلك: انت بتبعت instaPayNumber في register.js
  // فده غالباً هو اسم الحقل الصح
  const instapay =
    u.instaPayNumber ||
    u.instapayNumber ||
    u.instapay ||
    u.walletNumber ||
    u.wallet ||
    "-";

  const instaPayProfileLink =
    u.instaPayProfileLink ||
    u.instapayProfileLink ||
    u.instaPayLink ||
    u.instapayLink ||
    "";

  setText("profileName", name);
  setText("profileEmail", email);
  setText("profileInstapay", instapay);

  const linkEl = document.getElementById("profileInstaPayLink");
  if (linkEl) {
    if (instaPayProfileLink) {
      linkEl.textContent = instaPayProfileLink;
      linkEl.href = instaPayProfileLink;
      linkEl.title = instaPayProfileLink;
    } else {
      linkEl.textContent = "-";
      linkEl.removeAttribute("href");
      linkEl.removeAttribute("title");
    }
  }

    // ✅ Profile Image
  // ✅ صورة البروفايل الكبيرة: من Supabase/Strapi فقط
// ✅ صورة البروفايل الكبيرة: من Strapi فقط (بدون fallback لصورة الإيميل)
// ✅ Profile Image
const profileUrl = u.profileImageURL || u.profileImageUrl || "";
const bigImg = document.getElementById("profileAvatarImgLarge");
const placeholder = "images/profile.jpeg";

if (bigImg) {
  // fallback دائم
  bigImg.onerror = () => { bigImg.src = placeholder; };

  // default أولًا
  bigImg.src = placeholder;

  // لو فيه لينك جرّبه
  if (profileUrl) {
    const test = new Image();
    test.onload = () => { bigImg.src = profileUrl; };
    test.onerror = () => { bigImg.src = placeholder; };
    test.src = profileUrl;
  }
}


// ✅ صورة النافبار
const topImg = document.getElementById("profileAvatarImg");
if (topImg) {
  topImg.onerror = () => { topImg.src = placeholder; };
  topImg.src = profileUrl || placeholder;
}

}




function renderWishlist(user) {
  const u = normalizeUser(user);
  const grid = document.getElementById("wishlistGrid");
  if (!grid || !u) return;

  grid.innerHTML = "";

  normalizeWishlist(u.wishlist).forEach((item, index) => {
  const donatedRaw = Number(item?.donated || 0);
  const price = Number(item?.price || 0);

  const isFunded = price > 0 && donatedRaw >= price;

  const donatedDisplay = price > 0 ? Math.min(donatedRaw, price) : donatedRaw;
  const percent = price > 0 ? Math.min((donatedDisplay / price) * 100, 100) : 0;

  const rawUrl = (item?.url || "").toString().trim();
  const cleanedUrl = /example\.com/i.test(rawUrl) ? "" : rawUrl;
  const hasUrl = !!cleanedUrl;
  const encodedUrl = encodeURIComponent(cleanedUrl);
  const safeTitle = escapeHtml(item?.title || "");
  const safeImage = escapeHtml(item?.image || "images/placeholder.png");

  grid.innerHTML += `
  <div class="wishlist-card ${isFunded ? "funded" : ""}">
    
    <!-- ✅ clickable image -->
    <button type="button"
      class="${hasUrl ? "item-open" : "disabled-open"}"
      ${hasUrl ? `data-url="${encodedUrl}"` : ""}>
      <img src="${safeImage}" alt="${safeTitle}">
    </button>


    <div class="item-info">

      <div class="item-head">
        <!-- ✅ clickable title -->
        <button type="button"
          class="item-title-btn ${hasUrl ? "item-open" : "disabled-open"}"
          ${hasUrl ? `data-url="${encodedUrl}"` : ""}>
          ${safeTitle}
          ${hasUrl ? `<i class="fa fa-external-link"></i>` : ``}
        </button>

        <!-- ✅ 3 dots actions -->
        <div class="item-menu-wrap">
          <button class="item-menu-btn" type="button" aria-label="Item menu">⋮</button>
          <div class="item-menu" style="display:none;">
            <button class="item-edit-btn" type="button" data-index="${index}">Edit</button>
            <button class="item-delete-btn item-delete-danger" type="button" data-index="${index}">Delete</button>
          </div>
        </div>
      </div>

      <p class="item-price">${price} EGP goal</p>

      <div class="donation-progress">
        <div class="donation-progress-fill" style="width:${percent}%"></div>
      </div>

      <span class="donation-progress-text">${donatedDisplay} / ${price}</span>

      ${isFunded ? `<div class="funded-badge">Fully Funded 🎉</div>` : ``}
    </div>
  </div>
  `;

  });

}



(async function () {
  const statusEl = document.getElementById("profileName"); // هنستخدمه كـ status بسيط

  try {
    const user = await getUserData();
    console.log("USER:", user);

    const u = normalizeUser(user);

    // خزّن اليوزر
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, ...u }));
    } catch {}

    renderProfileHeader(u);
    renderWishlist(u);
    bindWishlistUx();
    // ✅ مهم: نداء الشير هنا
    setupShareMyProfile(u.id);

  } catch (e) {
    console.error(e);

    // ✅ Case-insensitive redirect
    const msg = (e?.message || "").toLowerCase();

    if (msg.includes("not logged in")) {
      window.location.href = "login.html";
      return;
    }
    

    // بدل Loading للأبد
    const nameEl = document.getElementById("profileName");
    if (nameEl) nameEl.textContent = "Loading Profile Info...";
  }
})();

//function buildPublicProfileLink(userId) {
//  // ✅ يطلع لينك صح حتى لو المشروع داخل فولدر WeddWish2
//  const url = new URL("public-profile.html", window.location.href);
//  url.searchParams.set("id", userId);
//  return url.toString();
//}
function buildPublicProfileLink(userId) {
  return `${WEB_BASE}${WEB_APP_PATH}/public-profile.html?id=${encodeURIComponent(userId)}`;
}


function setupShareMyProfile(userId) {
  const btn = document.getElementById("share-profile-btn");
  if (!btn) return;
  
  if (btn.dataset.bound === "1") return; // جديدة لمنع تكرار listner
  btn.dataset.bound = "1";


  const link = buildPublicProfileLink(userId);

  btn.addEventListener("click", async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "WeddWish Profile",
          text: "Check out my wishlist on WeddWish 💚",
          url: link,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        alert("Profile link copied ✅");
      } else {
        prompt("Copy this link:", link);
      }
    } catch (e) {
      console.error(e);
      alert("Share failed");
    }
  });
}

function normalizeHttpUrl(raw) {
  let u = String(raw ?? "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  // لو كتب www.amazon.com أو amazon.com
  if (/^www\./i.test(u) || (u.includes(".") && !u.includes(" "))) return `https://${u}`;
  return "";
}

function openItemUrl(rawUrl) {
  const url = normalizeHttpUrl(rawUrl);

  // ✅ User Profile: هنا الرسالة اللي انت عايزها
  if (!url) {
    alert("مفيش لينك للمنتج.\nلو تحب ضيف لينك من Add Item (وبعدين لما نعمل Edit).");
    return;
  }

  window.open(url, "_blank", "noopener");
}



async function deleteWishlistItem(index) {
  try {
    const user = await getUserData();
    const u = normalizeUser(user);
    const wishlist = normalizeWishlist(u?.wishlist);
    const item = wishlist[index];

    if (!item) {
      alert("Item not found.");
      return;
    }

    const title = item?.title || "this item";
    const donors = normalizeWishlist(item?.donors);
    const hasDonations = Number(item?.donated || 0) > 0 || donors.length > 0;

    const confirmMsg = hasDonations
      ? `Delete "${title}"?

This item has donations/donors. The item will be removed from Strapi and its Supabase images/bills folder will be deleted too.`
      : `Delete "${title}" from your wishlist and delete its Supabase folder?`;

    if (!confirm(confirmMsg)) return;

    const { userId } = getCurrentUserIdAndToken();

    wishlist.splice(index, 1);
    await updateWishlistForCurrentUser(wishlist);

    let storageWarning = "";
    try {
      await deleteWishlistItemStorage({
        userId,
        itemTitle: title,
        imageUrl: item?.image || "",
      });
    } catch (storageErr) {
      console.error(storageErr);
      storageWarning = `\n\nBut Supabase folder cleanup failed: ${storageErr?.message || storageErr}`;
    }

    const updatedUser = { ...u, wishlist };
    try {
      const stored = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...stored, ...updatedUser }));
    } catch {}

    renderWishlist(updatedUser);
    alert(`Item deleted ✅${storageWarning}`);
  } catch (err) {
    console.error(err);
    alert(err?.message || "Delete failed.");
  }
}

function bindWishlistUx() {
  const grid = document.getElementById("wishlistGrid");
  if (!grid || grid.dataset.uxBound === "1") return;
  grid.dataset.uxBound = "1";

  // close menus if click outside
  document.addEventListener("click", () => {
    document.querySelectorAll("#wishlistGrid .item-menu").forEach(m => (m.style.display = "none"));
  });

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".wishlist-card");
    if (!card) return;

    const editBtn = e.target.closest(".item-edit-btn");
    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      const index = Number(editBtn.dataset.index);
      if (!Number.isInteger(index) || index < 0) {
        alert("Invalid item selected.");
        return;
      }
      window.location.href = `add-item.html?editIndex=${encodeURIComponent(index)}`;
      return;
    }

    const deleteBtn = e.target.closest(".item-delete-btn");
    if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      const index = Number(deleteBtn.dataset.index);
      if (!Number.isInteger(index) || index < 0) {
        alert("Invalid item selected.");
        return;
      }
      deleteWishlistItem(index);
      return;
    }

    // 3 dots toggle
    const menuBtn = e.target.closest(".item-menu-btn");
    if (menuBtn) {
      e.preventDefault();
      e.stopPropagation();

      const menu = menuBtn.parentElement?.querySelector(".item-menu");
      if (!menu) return;

      const isOpen = menu.style.display === "block";
      document.querySelectorAll("#wishlistGrid .item-menu").forEach(m => (m.style.display = "none"));
      menu.style.display = isOpen ? "none" : "block";
      return;
    }

    // prevent closing when clicking inside dropdown
    if (e.target.closest(".item-menu")) {
      e.stopPropagation();
      return;
    }

    // open link on image/title click
    const openBtn = e.target.closest(".item-open, .disabled-open");
    if (openBtn) {
      e.preventDefault();
      e.stopPropagation();
      let raw = "";
      try { raw = decodeURIComponent(openBtn.dataset.url || ""); } catch { raw = openBtn.dataset.url || ""; }
      openItemUrl(raw);
          

    }
  });
}
