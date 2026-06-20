// js/search-drawer.js
// Shared right-side search drawer for all pages with a navbar.
// Auth rule: guests can open the drawer, but no user data is fetched or shown.
import { API_BASE } from "./config.js";

const $ = (selector, root = document) => root.querySelector(selector);
const byId = (id) => document.getElementById(id);

function isLoggedIn() {
  return Boolean(localStorage.getItem("jwt"));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPublicUserId(user) {
  return user?.id ?? user?.userId ?? user?.documentId ?? user?.attributes?.id;
}

function publicProfileHref(user) {
  const id = getPublicUserId(user);
  return id ? `public-profile.html?id=${encodeURIComponent(id)}` : "#";
}

function normalizeSearchUser(user) {
  if (!user) return {};
  if (user.attributes) return { id: user.id, ...user.attributes };
  return user;
}

async function searchUsers(query) {
  const q = (query || "").trim();
  if (!q) return [];

  const response = await fetch(`${API_BASE}/api/search-users?q=${encodeURIComponent(q)}`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });

  if (!response.ok) throw new Error("Search request failed");
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function ensureScrollLockHelpers() {
  if (window.wwLockPageScroll && window.wwUnlockPageScroll) return;

  const locks = new Set();
  let savedScrollY = 0;

  window.wwLockPageScroll = (key = "drawer") => {
    if (locks.size === 0) {
      savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.documentElement.classList.add("ww-scroll-locked");
      document.body.classList.add("ww-scroll-locked");
      document.body.dataset.wwScrollY = String(savedScrollY);
      document.body.style.position = "fixed";
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
    }
    locks.add(key);
  };

  window.wwUnlockPageScroll = (key = "drawer") => {
    locks.delete(key);
    if (locks.size > 0) return;

    const restoreY = Number.parseInt(document.body.dataset.wwScrollY || "0", 10) || 0;
    document.documentElement.classList.remove("ww-scroll-locked");
    document.body.classList.remove("ww-scroll-locked");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    delete document.body.dataset.wwScrollY;
    window.scrollTo(0, restoreY);
  };
}

function ensureSearchDrawer() {
  let panel = byId("searchPanel");

  if (!panel) {
    panel = document.createElement("aside");
    panel.id = "searchPanel";
    panel.setAttribute("aria-hidden", "true");
  }

  // Normalize old dropdown markup into the final right-side drawer UI.
  if (!panel.querySelector("#searchCloseBtn") || !panel.querySelector(".ww-drawer-searchbox")) {
    panel.innerHTML = `
      <div class="ww-drawer-head">
        <h3>Search</h3>
        <button type="button" id="searchCloseBtn" class="ww-drawer-close" aria-label="Close search">
          <i class="fa fa-times" aria-hidden="true"></i>
        </button>
      </div>

      <div class="ww-drawer-searchbox">
        <input id="userSearchInput" type="text" placeholder="Search users..." autocomplete="off" />
        <i class="fa fa-search" aria-hidden="true"></i>
      </div>

      <div id="userSearchResults" class="ww-search-results"></div>
      <p class="ww-search-hint">Type a username or email to find public wishlists.</p>
    `;
  }

  panel.classList.add("ww-search-drawer");
  // Keep backward compatibility with old index CSS/classes.
  panel.classList.add("index-search-drawer");

  if (panel.parentElement !== document.body) document.body.appendChild(panel);

  let backdrop = byId("searchBackdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.id = "searchBackdrop";
    backdrop.setAttribute("aria-hidden", "true");
  }
  backdrop.classList.add("ww-drawer-backdrop");
  backdrop.classList.add("index-search-backdrop");
  if (backdrop.parentElement !== document.body) document.body.appendChild(backdrop);

  return { panel, backdrop };
}

function renderLoginRequired(input, resultsEl, hint) {
  if (hint) hint.style.display = "none";
  input.value = "";
  input.disabled = true;
  input.setAttribute("aria-disabled", "true");
  input.placeholder = "Login required to search";
  resultsEl.innerHTML = `
    <div class="search-login-required">
      <i class="fa fa-lock" aria-hidden="true"></i>
      <h4>Login required</h4>
      <p>Please log in first to search users and open public wishlists.</p>
      <a href="login.html" class="search-login-btn">Login</a>
    </div>
  `;
  resultsEl.style.display = "block";
}

function enableSearchIfLoggedIn(input, resultsEl, hint) {
  if (!isLoggedIn()) {
    renderLoginRequired(input, resultsEl, hint);
    return false;
  }

  input.disabled = false;
  input.removeAttribute("aria-disabled");
  input.placeholder = "Search users...";
  if (hint && !input.value.trim()) hint.style.display = "block";
  return true;
}

function renderMessage(resultsEl, message) {
  resultsEl.innerHTML = `<div class="search-empty">${escapeHtml(message)}</div>`;
  resultsEl.style.display = "block";
}

function renderSearchLoading(resultsEl) {
  resultsEl.innerHTML = `
    <div class="search-empty ww-loading-row">
      <span class="ww-mini-spinner" aria-hidden="true"></span>
      <span>Searching...</span>
    </div>
  `;
  resultsEl.style.display = "block";
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = byId("searchBtn");
  if (!btn) return;

  ensureScrollLockHelpers();
  const { panel, backdrop } = ensureSearchDrawer();

  const closeBtn = byId("searchCloseBtn");
  const input = byId("userSearchInput");
  const resultsEl = byId("userSearchResults");
  const hint = $(".ww-search-hint", panel) || $(".index-search-hint", panel);

  if (!input || !resultsEl) return;

  let timer = null;
  let results = [];
  let activeIndex = -1;

  function setActive(nextIndex) {
    if (!results.length) return;
    activeIndex = Math.max(0, Math.min(nextIndex, results.length - 1));
    resultsEl.querySelectorAll(".search-item").forEach((item, index) => {
      item.classList.toggle("active", index === activeIndex);
    });
    resultsEl.querySelector(".search-item.active")?.scrollIntoView({ block: "nearest" });
  }

  function closeDrawer() {
    panel.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    document.body.classList.remove("search-drawer-open");
    panel.setAttribute("aria-hidden", "true");
    btn.setAttribute("aria-expanded", "false");
    window.wwUnlockPageScroll?.("search-drawer");
  }

  function openDrawer() {
    if (typeof window.toggleNav === "function") window.toggleNav(false);
    panel.classList.add("is-open");
    backdrop.classList.add("is-open");
    document.body.classList.add("search-drawer-open");
    panel.setAttribute("aria-hidden", "false");
    btn.setAttribute("aria-expanded", "true");
    window.wwLockPageScroll?.("search-drawer");

    if (enableSearchIfLoggedIn(input, resultsEl, hint)) {
      window.setTimeout(() => input.focus(), 180);
    }
  }

  function renderResults(list) {
    results = list;
    activeIndex = list.length ? 0 : -1;

    if (!list.length) {
      renderMessage(resultsEl, "No users found");
      return;
    }

    resultsEl.innerHTML = list.map((user, index) => {
      const name = escapeHtml(user.username || user.name || user.email || "User");
      const email = user.email ? `<small>${escapeHtml(user.email)}</small>` : "";
      const href = publicProfileHref(user);
      return `
        <a class="search-item ${index === activeIndex ? "active" : ""}" data-index="${index}" href="${href}">
          <i class="fa fa-user-circle" aria-hidden="true"></i>
          <span>${name}${email}</span>
        </a>
      `;
    }).join("");
    resultsEl.style.display = "grid";
  }

  async function runSearch() {
    if (!enableSearchIfLoggedIn(input, resultsEl, hint)) return;

    const query = input.value.trim();
    if (!query) {
      results = [];
      activeIndex = -1;
      resultsEl.innerHTML = "";
      resultsEl.style.display = "none";
      if (hint) hint.style.display = "block";
      return;
    }

    if (query.length < 2) {
      renderMessage(resultsEl, "Type at least 2 characters");
      return;
    }

    if (hint) hint.style.display = "none";
    renderSearchLoading(resultsEl);

    try {
      const list = await searchUsers(query);
      renderResults(list);
    } catch (error) {
      console.error(error);
      renderMessage(resultsEl, "Search failed. Check the backend route/permissions.");
    }
  }

  function goToActive() {
    const user = results[activeIndex];
    if (!user) return;
    const href = publicProfileHref(user);
    if (href && href !== "#") window.location.href = href;
  }

  btn.setAttribute("aria-expanded", "false");
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    panel.classList.contains("is-open") ? closeDrawer() : openDrawer();
  });

  closeBtn?.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);

  input.addEventListener("input", () => {
    if (!isLoggedIn()) {
      renderLoginRequired(input, resultsEl, hint);
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(runSearch, 260);
  });

  input.addEventListener("keydown", async (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (results.length) goToActive();
      else await runSearch();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(activeIndex + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex - 1);
    }
  });

  resultsEl.addEventListener("click", (event) => {
    const item = event.target.closest(".search-item");
    if (!item) return;
    activeIndex = Number(item.dataset.index || 0);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });
});
