// js/login.js
import { loginUser } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorEl = document.getElementById("loginError");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.style.display = "none";
    errorEl.textContent = "";

    const identifier = form.identifier.value.trim();
    const password = form.password.value;

    if (!identifier || !password) {
      errorEl.textContent = "Please fill in all fields.";
      errorEl.style.display = "block";
      return;
    }

    try {
      const user = await loginUser({ identifier, password });
      window.location.href = "user-profile.html";
    } catch (err) {
      errorEl.textContent =
        err.message || "Login failed. Please check your data and try again.";
      errorEl.style.display = "block";
    }
  });

  const googleBtn = document.getElementById("googleLogin");
  const facebookBtn = document.getElementById("facebookLogin");

  if (googleBtn) {
    googleBtn.addEventListener("click", () => {
      alert(
        "Google login is not connected yet. Here you will redirect to Google OAuth."
      );
    });
  }

  if (facebookBtn) {
    facebookBtn.addEventListener("click", () => {
      alert(
        "Facebook login is not connected yet. Here you will redirect to Facebook OAuth."
      );
    });
  }
});
