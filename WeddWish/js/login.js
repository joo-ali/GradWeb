// js/login.js
import { loginUser, forgotPassword } from "./auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const errorEl = document.getElementById("loginError");

  const forgotModal = document.getElementById("forgotPasswordModal");
  const forgotForm = document.getElementById("forgotPasswordForm");
  const forgotEmailInput = document.getElementById("forgotEmailInput");
  const forgotStatus = document.getElementById("forgotPasswordStatus");
  const openForgotBtn = document.getElementById("openForgotPasswordBtn");
  const closeForgotBtn = document.getElementById("closeForgotPasswordBtn");
  const sendResetBtn = document.getElementById("sendResetEmailBtn");

  function setLoginError(message = "") {
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = message ? "block" : "none";
  }

  function setForgotStatus(message = "", type = "") {
    if (!forgotStatus) return;
    forgotStatus.textContent = message;
    forgotStatus.className = type
      ? `forgot-password-status forgot-password-${type}`
      : "forgot-password-status";
  }

  function openForgotModal() {
    if (!forgotModal) return;

    const identifierValue = form?.identifier?.value?.trim() || "";
    if (identifierValue.includes("@") && forgotEmailInput && !forgotEmailInput.value) {
      forgotEmailInput.value = identifierValue;
    }

    setForgotStatus("");
    forgotModal.classList.add("is-open");
    forgotModal.setAttribute("aria-hidden", "false");
    setTimeout(() => forgotEmailInput?.focus(), 50);
  }

  function closeForgotModal() {
    if (!forgotModal) return;
    forgotModal.classList.remove("is-open");
    forgotModal.setAttribute("aria-hidden", "true");
    setForgotStatus("");
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      setLoginError("");

      const identifier = form.identifier.value.trim();
      const password = form.password.value;

      if (!identifier || !password) {
        setLoginError("Please fill in all fields.");
        return;
      }

      try {
        await loginUser({ identifier, password });
        window.location.href = "user-profile.html";
      } catch (err) {
        setLoginError(
          err.message || "Login failed. Please check your data and try again."
        );
      }
    });
  }

  openForgotBtn?.addEventListener("click", openForgotModal);
  closeForgotBtn?.addEventListener("click", closeForgotModal);
  forgotModal?.addEventListener("click", (event) => {
    if (event.target?.dataset?.closeForgot === "true") {
      closeForgotModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && forgotModal?.classList.contains("is-open")) {
      closeForgotModal();
    }
  });

  forgotForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = forgotEmailInput?.value?.trim() || "";
    if (!email) {
      setForgotStatus("Please enter your email.", "error");
      forgotEmailInput?.focus();
      return;
    }

    try {
      if (sendResetBtn) {
        sendResetBtn.disabled = true;
        sendResetBtn.textContent = "Sending...";
      }

      setForgotStatus("Sending reset email...");
      await forgotPassword({ email });
      setForgotStatus("Reset email sent ✅ Check your inbox.", "success");
    } catch (err) {
      setForgotStatus(err.message || "Failed to send reset email.", "error");
    } finally {
      if (sendResetBtn) {
        sendResetBtn.disabled = false;
        sendResetBtn.textContent = "Send reset email";
      }
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
