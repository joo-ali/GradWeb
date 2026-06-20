// js/nav.js
// Shared navbar behavior: auth visibility, menu toggle, smart auth CTAs.
document.addEventListener("DOMContentLoaded", () => {
  if (!window.wwLockPageScroll) {
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

  const token = localStorage.getItem("jwt");
  const DEFAULT_AVATAR = "images/profile.jpeg";
  const $ = (id) => document.getElementById(id);
  const show = (el, yes) => { if (el) el.style.display = yes ? "inline-flex" : "none"; };
  const showBlock = (el, yes) => { if (el) el.style.display = yes ? "block" : "none"; };

  // Side nav links
  const loginLink = $("loginLink");
  const registerLink = $("registerLink");
  const profileLink = $("profileLink");
  const logoutLink = $("logoutLink");

  // Top nav links
  const topLoginLink = $("topLoginLink");
  const topRegisterLink = $("topRegisterLink");
  const topProfileLink = $("topProfileLink");
  const topLogoutLink = $("topLogoutLink");

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

    show(topProfileLink, true);
    show(topLogoutLink, true);

    // show avatar
    show(avatarLink, true);

    // Always show the local default image first. If the user has no uploaded
    // profile image, or the saved URL fails, the navbar will not show a broken icon.
    if (avatarImg) {
      avatarImg.onerror = () => { avatarImg.onerror = null; avatarImg.src = DEFAULT_AVATAR; };
      avatarImg.src = DEFAULT_AVATAR;
    }

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

    show(topProfileLink, false);
    show(topLogoutLink, false);

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

  const setDrawerInactive = (el, inactive) => {
    if (!el) return;
    if (inactive) {
      el.setAttribute("inert", "");
      el.hidden = true;
      el.removeAttribute("aria-hidden");
    } else {
      el.hidden = false;
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    }
  };

  if (sidenav) {
    // A fixed element inside the fixed navbar can be clipped/limited on some pages.
    // Moving the drawer to body makes its height equal to the full viewport.
    if (sidenav.parentElement !== document.body) {
      document.body.appendChild(sidenav);
    }

    sidenav.removeAttribute("style");
    setDrawerInactive(sidenav, true);
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
    const searchBackdrop = $("searchBackdrop");

    if (shouldOpen && searchPanel?.classList.contains("is-open")) {
      searchPanel.classList.remove("is-open");
      searchBackdrop?.classList.remove("is-open");
      document.body.classList.remove("search-drawer-open");
      searchPanel.setAttribute("inert", "");
      window.setTimeout(() => {
        if (!searchPanel.classList.contains("is-open")) searchPanel.hidden = true;
      }, 280);
      window.wwUnlockPageScroll?.("search-drawer");
      window.wwUnlockPageScroll?.("index-search");
    }

    // Clear any width left by the old inline toggleNav snippets.
    sidenav.style.removeProperty("width");
    sidenav.style.removeProperty("height");

    if (shouldOpen) setDrawerInactive(sidenav, false);
    sidenav.classList.toggle("is-open", shouldOpen);
    document.body.classList.toggle("nav-menu-open", shouldOpen);
    if (!shouldOpen) {
      window.setTimeout(() => {
        if (!sidenav.classList.contains("is-open")) setDrawerInactive(sidenav, true);
      }, 280);
    }
    shouldOpen ? window.wwLockPageScroll?.("nav-menu") : window.wwUnlockPageScroll?.("nav-menu");
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
        a.setAttribute("href", "user-profile.html");
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
