// js/profile-menu.js
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("profileMenuBtn");
  const menu = document.getElementById("profileMenu");
  const editBtn = document.getElementById("editProfileBtn");
  const deleteBtn = document.getElementById("deleteProfileBtn");

  if (!btn || !menu) return;

  function openMenu() { menu.style.display = "block"; }
  function closeMenu() { menu.style.display = "none"; }
  function toggleMenu() {
    menu.style.display = (menu.style.display === "block") ? "none" : "block";
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  document.addEventListener("click", (e) => {
    // قفل لو ضغطت برا
    if (!menu.contains(e.target) && e.target !== btn) closeMenu();
  });

  editBtn?.addEventListener("click", () => {
    closeMenu();
    window.location.href = "edit-profile.html";
  });

  deleteBtn?.addEventListener("click", () => {
    closeMenu();
    alert("Delete profile: هنفعّلها بعدين ✅");
  });
});
