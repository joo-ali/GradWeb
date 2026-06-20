// js/pages.js
// Lightweight auth visibility helper kept for backward compatibility.
// Main navbar behavior lives in js/nav.js.
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("jwt");
  const loginLink = document.getElementById("loginLink");
  const registerLink = document.getElementById("registerLink");
  const profileLink = document.getElementById("profileLink");
  const logoutLink = document.getElementById("logoutLink");

  if (token) {
    if (loginLink) loginLink.style.display = "none";
    if (registerLink) registerLink.style.display = "none";
    if (profileLink) profileLink.style.display = "block";
    if (logoutLink) logoutLink.style.display = "block";
  } else {
    if (loginLink) loginLink.style.display = "block";
    if (registerLink) registerLink.style.display = "block";
    if (profileLink) profileLink.style.display = "none";
    if (logoutLink) logoutLink.style.display = "none";
  }
});
