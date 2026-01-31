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
import { WEB_BASE, WEB_APP_PATH } from "./config.js";

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = (value ?? "").toString().trim() || "-";
}

// لو Strapi رجّع attributes (احتياطي)
function normalizeUser(u) {
  if (!u) return null;
  if (u.attributes) return { id: u.id, ...u.attributes };
  return u;
}

let bigAvatarObserver = null;

function lockBigAvatar(imgEl, desiredSrc) {
  if (!imgEl || !desiredSrc) return;

  imgEl.src = desiredSrc;

  const obs = new MutationObserver(() => {
    if (imgEl.src !== desiredSrc) imgEl.src = desiredSrc;
  });

  obs.observe(imgEl, { attributes: true, attributeFilter: ["src"] });

  // ✅ اقفل القفل بعد 1200ms (كفاية لتمرير scripts اللي بتعمل overwrite)
  setTimeout(() => obs.disconnect(), 1200);
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

  setText("profileName", name);
  setText("profileEmail", email);
  setText("profileInstapay", instapay);

    // ✅ Profile Image
  // ✅ صورة البروفايل الكبيرة: من Supabase/Strapi فقط
// ✅ صورة البروفايل الكبيرة: من Strapi فقط (بدون fallback لصورة الإيميل)
// ✅ Profile Image
const profileUrl = u.profileImageURL || u.profileImageUrl || "";

// ⚠️ لازم ID يكون صح (هقولك ازاي تجيبه تحت)
const bigImg = document.getElementById("profileAvatarImgLarge");

const placeholder = "images/profile.jpg"; // موجود عندك 200

if (bigImg) {
  bigImg.src = placeholder;

  if (profileUrl) {
    const img = new Image();
    img.onload = () => { bigImg.src = profileUrl; };
    img.onerror = () => { bigImg.src = placeholder; };
    img.src = profileUrl;
  }
}

// ✅ صورة النافبار
const topImg = document.getElementById("profileAvatarImg");
if (topImg) {
  topImg.src = profileUrl || topImg.src;
}

}




function renderWishlist(user) {
  const u = normalizeUser(user);
  const grid = document.getElementById("wishlistGrid");
  if (!grid || !u) return;

  grid.innerHTML = "";

  (u.wishlist || []).forEach((item) => {
    const donatedRaw = Number(item?.donated || 0);
    const price = Number(item?.price || 0);
    // ✅ ما نعرضش أكتر من الهدف
    const donatedDisplay = price > 0 ? Math.min(donatedRaw, price) : donatedRaw;
    // ✅ النسبة تتحسب على المعروض
    const percent = price > 0 ? Math.min((donatedDisplay / price) * 100, 100) : 0;

    grid.innerHTML += `
      <div class="wishlist-card">
        <img src="${item.image || "images/placeholder.png"}">
        <div class="item-info">
          <h3>${item.title || ""}</h3>
          <p class="item-price">${price} EGP goal</p>

          <div class="donation-progress">
            <div class="donation-progress-fill" style="width:${percent}%"></div>
          </div>

          <span class="donation-progress-text">${donatedDisplay} / ${price}</span>
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
    if (nameEl) nameEl.textContent = "Error loading profile";
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
