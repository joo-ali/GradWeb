// js/nav.js
// Shared navbar behavior: auth visibility, menu toggle, smart auth CTAs.
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("jwt");
  const $ = (id) => document.getElementById(id);
  const show = (el, yes) => { if (el) el.style.display = yes ? "inline-flex" : "none"; };
  const showBlock = (el, yes) => { if (el) el.style.display = yes ? "block" : "none"; };

  // Side nav links
  const loginLink = $("loginLink");
  const registerLink = $("registerLink");
  const profileLink = $("profileLink");
  const logoutLink = $("logoutLink");
  const feedLink = $("feedLink");

  // Top nav links
  const topLoginLink = $("topLoginLink");
  const topRegisterLink = $("topRegisterLink");
  const topProfileLink = $("topProfileLink");
  const topLogoutLink = $("topLogoutLink");
  const topFeedLink = $("topFeedLink");

  // Avatar
  const avatarLink = $("profileAvatarLink");
  const avatarImg = $("profileAvatarImg");

  const loggedIn = Boolean(token);

  if (loggedIn) {
    // hide auth (login/register)
    showBlock(loginLink, false);
    showBlock(registerLink, false);
    show(topLoginLink, false);
    show(topRegisterLink, false);

    // show app links
    showBlock(profileLink, true);
    showBlock(logoutLink, true);
    showBlock(feedLink, true);

    show(topProfileLink, true);
    show(topLogoutLink, true);
    show(topFeedLink, true);

    // show avatar
    show(avatarLink, true);

    // optional avatar url from stored user object
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      const imgUrl = u?.profileImageURL || u?.profileImageUrl || u?.avatar || u?.image || u?.photo;
      if (imgUrl && avatarImg) avatarImg.src = imgUrl;
    } catch {}
  } else {
    // show auth (login/register)
    showBlock(loginLink, true);
    showBlock(registerLink, true);
    show(topLoginLink, true);
    show(topRegisterLink, true);

    // hide app links
    showBlock(profileLink, false);
    showBlock(logoutLink, false);
    showBlock(feedLink, false);

    show(topProfileLink, false);
    show(topLogoutLink, false);
    show(topFeedLink, false);

    // hide avatar
    show(avatarLink, false);
  }

  // Logout (top + side)
  const doLogout = (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = "index.html";
  };

  if (logoutLink) logoutLink.addEventListener("click", doLogout);
  if (topLogoutLink) topLogoutLink.addEventListener("click", doLogout);

  // Drawer menu: move it to <body>, ignore old inline scripts, and control it from here only.
  const sidenav = $("mySidenav");
  const menuBtn = $("menuBtn");

  if (sidenav) {
    // A fixed element inside the fixed navbar can be clipped/limited on some pages.
    // Moving the drawer to body makes its height equal to the full viewport.
    if (sidenav.parentElement !== document.body) {
      document.body.appendChild(sidenav);
    }

    sidenav.removeAttribute("style");
    sidenav.setAttribute("aria-hidden", "true");
  }

  let sideCloseBtn = sidenav?.querySelector(".sidenav-close");
  if (sidenav && !sideCloseBtn) {
    sideCloseBtn = document.createElement("button");
    sideCloseBtn.type = "button";
    sideCloseBtn.className = "sidenav-close";
    sideCloseBtn.setAttribute("aria-label", "Close menu");
    sideCloseBtn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
    sidenav.prepend(sideCloseBtn);
  }

  const setMenuIcon = (open) => {
    if (!menuBtn) return;
    menuBtn.innerHTML = '<i class="fa fa-bars" aria-hidden="true"></i>';
    menuBtn.setAttribute("aria-label", open ? "Menu opened" : "Open menu");
    menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  };

  window.toggleNav = function toggleNav(forceOpen) {
    if (!sidenav) return;
    const isOpen = sidenav.classList.contains("is-open");
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !isOpen;
    const searchPanel = $("searchPanel");

    if (searchPanel) searchPanel.style.display = "none";

    // Clear any width left by the old inline toggleNav snippets.
    sidenav.style.removeProperty("width");
    sidenav.style.removeProperty("height");

    sidenav.classList.toggle("is-open", shouldOpen);
    document.body.classList.toggle("nav-menu-open", shouldOpen);
    sidenav.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
    setMenuIcon(shouldOpen);
  };

  setMenuIcon(false);

  if (menuBtn) {
    // Remove the old inline onclick to avoid double toggles: open then immediate close.
    menuBtn.onclick = null;
    menuBtn.removeAttribute("onclick");
    menuBtn.removeAttribute("style");
    menuBtn.setAttribute("role", "button");
    menuBtn.setAttribute("tabindex", "0");

    menuBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.toggleNav();
    });

    menuBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.toggleNav();
      }
      if (e.key === "Escape") window.toggleNav(false);
    });
  }

  if (sideCloseBtn) {
    sideCloseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.toggleNav(false);
    });
  }

  // Close when clicking outside the drawer.
  document.addEventListener("click", (e) => {
    if (!sidenav?.classList.contains("is-open")) return;
    if (e.target.closest("#mySidenav") || e.target.closest("#menuBtn")) return;
    window.toggleNav(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") window.toggleNav(false);
  });

  // Smart links: if user is already logged in, do not send them back to login.
  const applySmartAuthLinks = () => {
    const hasToken = Boolean(localStorage.getItem("jwt"));

    document.querySelectorAll("a").forEach((a) => {
      const text = (a.textContent || "").trim().toLowerCase();
      const href = (a.getAttribute("href") || "").trim().toLowerCase();

      if (!hasToken) {
        if (a.dataset.authGuestHref) a.setAttribute("href", a.dataset.authGuestHref);
        return;
      }

      if (text === "help them") {
        a.dataset.authGuestHref = a.dataset.authGuestHref || a.getAttribute("href") || "login.html";
        a.setAttribute("href", "feed.html");
      }

      if (text === "join us today" || text === "join us") {
        a.dataset.authGuestHref = a.dataset.authGuestHref || a.getAttribute("href") || "login.html";
        a.setAttribute("href", "user-profile.html");
      }

      // Optional quality-of-life: old login CTAs should open the app area when already logged in.
      if ((text === "get started" || text === "start gifting smarter") && href.includes("login.html")) {
        a.dataset.authGuestHref = a.dataset.authGuestHref || a.getAttribute("href") || "login.html";
        a.setAttribute("href", "user-profile.html");
      }
    });
  };

  applySmartAuthLinks();
  setTimeout(applySmartAuthLinks, 0);
  document.addEventListener("ww:footer-mounted", applySmartAuthLinks);
});
