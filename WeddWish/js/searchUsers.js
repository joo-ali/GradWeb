//// searchUsers.js
//import { API_BASE } from "./config.js";
//
//export async function searchUsers(query) {
//  const q = (query || "").trim();
//  if (!q) return [];
//
//  const res = await fetch(
//    `${API_BASE}/api/search-users?q=${encodeURIComponent(q)}`,
//    {
//      headers: { "ngrok-skip-browser-warning": "true" },
//    }
//  );
//
//  if (!res.ok) throw new Error("Search request failed");
//
//  const data = await res.json();
//  return Array.isArray(data) ? data : [];
//}
//document.addEventListener("DOMContentLoaded", () => {
//  const btn = document.getElementById("searchBtn");
//  const panel = document.getElementById("searchPanel");
//
//  if (btn && panel) {
//    btn.addEventListener("click", () => {
//      panel.style.display = (panel.style.display === "block") ? "none" : "block";
//      const inp = document.getElementById("userSearchInput");
//      if (panel.style.display === "block" && inp) inp.focus();
//    });
//  }
//});


// searchUsers.js
import { API_BASE } from "./config.js";

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

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("searchBtn");
  const panel = document.getElementById("searchPanel");
  const input = document.getElementById("userSearchInput");
  const resultsEl = document.getElementById("userSearchResults");

  if (!btn || !panel || !input || !resultsEl) return;

  let results = [];
  let activeIndex = -1;

  function openPanel() {
    panel.style.display = "block";
    input.focus();
  }

  function closePanel() {
    panel.style.display = "none";
    resultsEl.style.display = "none";
    resultsEl.innerHTML = "";
    results = [];
    activeIndex = -1;
  }

  function togglePanel() {
    if (panel.style.display === "block") closePanel();
    else openPanel();
  }

  function renderResults(list) {
    results = list;
    activeIndex = list.length ? 0 : -1;

    if (!list.length) {
      resultsEl.innerHTML = `<div class="search-empty">No users found</div>`;
      resultsEl.style.display = "block";
      return;
    }

    resultsEl.innerHTML = list
      .map((u, idx) => {
        const name = u.username || u.name || u.email || "User";
        const sub = u.email ? `<div style="font-size:12px;opacity:.75">${u.email}</div>` : "";
        return `
          <div class="search-item ${idx === activeIndex ? "active" : ""}" data-index="${idx}">
            <div>${name}</div>
            ${sub}
          </div>
        `;
      })
      .join("");

    resultsEl.style.display = "block";
  }

  function setActive(nextIndex) {
    if (!results.length) return;
    activeIndex = Math.max(0, Math.min(nextIndex, results.length - 1));

    const items = resultsEl.querySelectorAll(".search-item");
    items.forEach((el, i) => el.classList.toggle("active", i === activeIndex));

    // ensure visible when scrolling
    const activeEl = items[activeIndex];
    if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }

  function goToActive() {
    if (activeIndex < 0 || !results[activeIndex]) return;
    const u = results[activeIndex];

    // ✅ افتح بروفايل اليوزر
    // عدّل السطر ده حسب نظام صفحاتك:
    // لو عندك user-profile.html بتجيب userId من query param:
    window.location.href = `public-profile.html?id=${encodeURIComponent(u.id)}`;
  }

  async function doSearch() {
    const q = input.value.trim();
    if (!q) {
      resultsEl.style.display = "none";
      resultsEl.innerHTML = "";
      results = [];
      activeIndex = -1;
      return;
    }

    try {
      const list = await searchUsers(q);
      renderResults(list);
    } catch (err) {
      console.error(err);
      resultsEl.innerHTML = `<div class="search-empty">Search failed</div>`;
      resultsEl.style.display = "block";
      results = [];
      activeIndex = -1;
    }
  }

  // فتح/قفل من الأيقونة
  btn.addEventListener("click", togglePanel);

  // click على نتيجة
  resultsEl.addEventListener("click", (e) => {
    const item = e.target.closest(".search-item");
    if (!item) return;
    activeIndex = Number(item.dataset.index);
    goToActive();
  });

  // Keyboard controls
  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      // لو فيه نتائج ظاهرة → Enter يفتح النتيجة الحالية
      if (resultsEl.style.display === "block" && results.length) {
        e.preventDefault();
        goToActive();
      } else {
        // غير كده → Enter يعمل Search
        e.preventDefault();
        await doSearch();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (resultsEl.style.display !== "block") await doSearch();
      setActive(activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(activeIndex - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
    }
  });

  // optional: لما تكتب (debounce خفيف) يظهر suggestions
  let t = null;
  input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      doSearch();
    }, 250);
  });

  // اقفل لو ضغطت برا
  document.addEventListener("click", (e) => {
    const inside = panel.contains(e.target) || btn.contains(e.target);
    if (!inside && panel.style.display === "block") closePanel();
  });
});
