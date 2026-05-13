// js/donate.js
import { API_BASE } from "./config.js";

/**
 * نفس منطق Flutter addDonation:
 * - GET user
 * - parse wishlist + donors
 * - add donor
 * - recalc donated
 * - PUT user { wishlist }
 *
 * ⚠️ ملاحظة: PUT غالباً محتاج token في Strapi.
 * لو التبرع Public بدون login، الأفضل تعمل endpoint backend public.
 */
export async function addDonation({
  userId,
  token = null,          // optional
  itemTitle,
  donorName,
  amount,
  billUrl = "",
}) {
  // 1) GET user
  const userRes = await fetch(`${API_BASE}/api/users/${userId}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "ngrok-skip-browser-warning": "true",
    },
  });

  const userText = await userRes.text();
  let userData;
  try { userData = JSON.parse(userText); }
  catch { throw new Error("Server returned non-JSON (GET user)"); }

  if (!userRes.ok) throw new Error(userData?.error?.message || `GET user failed: ${userRes.status}`);

  // 2) normalize wishlist
  let wishlist = [];
  const rawWishlist = userData?.wishlist;

  if (rawWishlist != null) {
    if (typeof rawWishlist === "string") {
      try { wishlist = JSON.parse(rawWishlist) || []; } catch { wishlist = []; }
    } else if (Array.isArray(rawWishlist)) {
      wishlist = rawWishlist;
    }
  }

  if (!wishlist.length) throw new Error("Wishlist is empty. Cannot add donation.");

  // 3) find item by title
  const idx = wishlist.findIndex((it) => String(it?.title || "").trim() === String(itemTitle || "").trim());
  if (idx === -1) throw new Error("Item not found in wishlist.");

  const item = { ...wishlist[idx] };

  // 4) normalize donors
  let donors = [];
  const rawDonors = item?.donors;

  if (rawDonors != null) {
    if (typeof rawDonors === "string") {
      try { donors = JSON.parse(rawDonors) || []; } catch { donors = []; }
    } else if (Array.isArray(rawDonors)) {
      donors = rawDonors;
    }
  }

  // 5) add new donor
  donors.push({ name: donorName, amount: Number(amount), bill: billUrl });

  // 6) recalc donated
  const donatedSum = donors.reduce((s, d) => s + Number(d?.amount || 0), 0);

  // 7) update item + wishlist
  item.donors = donors;
  item.donated = donatedSum;
  wishlist[idx] = item;

  // 8) PUT user
  const putRes = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ wishlist }),
  });

  const putText = await putRes.text();
  let putData;
  try { putData = JSON.parse(putText); }
  catch { throw new Error("Server returned non-JSON (PUT user)"); }

  if (!putRes.ok) {
    // هنا هيبان لو محتاج JWT
    throw new Error(putData?.error?.message || `PUT user failed: ${putRes.status}`);
  }

  return putData;
}

/**
 * Donate to whole wishlist:
 * يوزّع المبلغ على items اللي لسه ناقصها فلوس (بالترتيب)
 */
export async function donateToWishlist({
  userId,
  token = null,
  donorName,
  amount,
  billUrl = "",
}) {
  // GET user
  const userRes = await fetch(`${API_BASE}/api/users/${userId}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "ngrok-skip-browser-warning": "true",
    },
  });

  const userText = await userRes.text();
  let userData;
  try { userData = JSON.parse(userText); }
  catch { throw new Error("Server returned non-JSON (GET user)"); }

  if (!userRes.ok) throw new Error(userData?.error?.message || `GET user failed: ${userRes.status}`);

  // normalize wishlist
  let wishlist = [];
  const rawWishlist = userData?.wishlist;
  if (rawWishlist != null) {
    if (typeof rawWishlist === "string") {
      try { wishlist = JSON.parse(rawWishlist) || []; } catch { wishlist = []; }
    } else if (Array.isArray(rawWishlist)) wishlist = rawWishlist;
  }
  if (!wishlist.length) throw new Error("Wishlist is empty.");

  let remaining = Number(amount);
  if (!remaining || remaining < 1) throw new Error("Invalid amount");

  // items with remaining need
  const items = wishlist.map((it, i) => ({ it: { ...it }, i }));
  for (const obj of items) {
    if (remaining <= 0) break;

    const price = Number(obj.it?.price || 0);
    const donated = Number(obj.it?.donated || 0);
    const need = Math.max(price - donated, 0);
    if (need <= 0) continue;

    const part = Math.min(need, remaining);
    remaining -= part;

    // donors
    let donors = [];
    const rawDonors = obj.it?.donors;
    if (rawDonors != null) {
      if (typeof rawDonors === "string") {
        try { donors = JSON.parse(rawDonors) || []; } catch { donors = []; }
      } else if (Array.isArray(rawDonors)) donors = rawDonors;
    }

    donors.push({ name: donorName, amount: part, bill: billUrl, type: "wishlist" });

    const newDonated = donors.reduce((s, d) => s + Number(d?.amount || 0), 0);
    obj.it.donors = donors;
    obj.it.donated = newDonated;

    wishlist[obj.i] = obj.it;
  }

  // PUT
  const putRes = await fetch(`${API_BASE}/api/users/${userId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ wishlist }),
  });

  const putText = await putRes.text();
  let putData;
  try { putData = JSON.parse(putText); }
  catch { throw new Error("Server returned non-JSON (PUT user)"); }

  if (!putRes.ok) throw new Error(putData?.error?.message || `PUT user failed: ${putRes.status}`);

  return { putData, undistributed: remaining };
}
