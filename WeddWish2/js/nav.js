// js/nav.js
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

  if (token) {
    // hide auth (login/register)
    showBlock(loginLink, false);
    showBlock(registerLink, false);
    showBlock(topLoginLink, false);
    showBlock(topRegisterLink, false);

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
    showBlock(topLoginLink, true);
    showBlock(topRegisterLink, true);

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

  // Logout (يشغل سواء من top أو side)
  const doLogout = (e) => {
    e.preventDefault();
    localStorage.clear();
    window.location.href = "index.html";
  };

  if (logoutLink) logoutLink.addEventListener("click", doLogout);
  if (topLogoutLink) topLogoutLink.addEventListener("click", doLogout);
});
