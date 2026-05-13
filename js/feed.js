// js/feed.js
import { API_BASE } from "./config.js";

function renderError(msg) {
  const grid = document.getElementById("feedGrid");
  if (grid) grid.innerHTML = `<p style="color:red;text-align:center;">${msg}</p>`;
}

function renderItems(rows) {
  const grid = document.getElementById("feedGrid");
  if (!grid) return;

  grid.innerHTML = "";

  if (!rows.length) {
    grid.innerHTML = `<p style="text-align:center;opacity:.8;">No items yet.</p>`;
    return;
  }

  rows.forEach(({ ownerUsername, item }) => {
    const donated = item.donated || 0;
    const price = item.price || 1;
    const percent = Math.min((donated / price) * 100, 100);

    grid.innerHTML += `
      <div class="wishlist-card">
        <img src="${item.image || "images/placeholder.png"}">
        <div class="item-info">
          <h3>${item.title || ""}</h3>
          <p class="item-price">${price} EGP goal</p>

          <div class="donation-progress">
            <div class="donation-progress-fill" style="width:${percent}%"></div>
          </div>

          <span class="donation-progress-text">${donated} / ${price}</span>

          <p style="font-size:12px;opacity:.7">Owner: ${ownerUsername}</p>
        </div>
      </div>
    `;
  });
}

(async function loadFeed() {
  try {
    // ✅ لازم JWT
    const token = localStorage.getItem("jwt");
    if (!token) {
      window.location.href = "login.html";
      return;
    }

    const res = await fetch(`${API_BASE}/api/users?populate=*`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true",
      },
    });

    const raw = await res.text();
    console.log("FEED STATUS:", res.status);
    console.log("FEED RAW RESPONSE:", raw);

    let users;
    try {
      users = JSON.parse(raw);
    } catch {
      renderError("Server returned non-JSON (check API_BASE / permissions). Open Console → FEED RAW RESPONSE.");
      return;
    }

    if (!res.ok) {
      renderError(users?.error?.message || `Feed request failed: ${res.status}`);
      return;
    }

    // users expected to be array in Strapi users-permissions
    const all = [];
    users.forEach(u => {
      (u.wishlist || []).forEach(item => {
        all.push({ ownerUsername: u.username, item });
      });
    });

    renderItems(all);

  } catch (e) {
    console.error(e);
    renderError("Feed failed. Check Console.");
  }
})();
