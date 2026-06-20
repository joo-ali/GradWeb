// js/register.js
import { signUpUser } from "./auth.js";

const form = document.getElementById("registerForm");
const msgEl = document.getElementById("msg");
const submitBtn = document.getElementById("submitBtn");
const btnText = submitBtn.querySelector(".btn-text");
const spinner = submitBtn.querySelector(".spinner");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const confirmPasswordMsg = document.getElementById("confirmPasswordMsg");
const confirmPasswordField = document.getElementById("confirmPasswordField");

function showMessage(text, type = "error") {
  msgEl.textContent = text;
  msgEl.className = `msg ${type === "error" ? "msg-error" : "msg-success"}`;
}

function showEmailConfirmationNotice(email) {
  form.classList.add("account-created");
  submitBtn.disabled = true;
  spinner.style.display = "none";
  btnText.textContent = "Check your email";

  msgEl.className = "msg msg-success auth-confirm-notice";
  msgEl.innerHTML = `
    <div class="auth-confirm-card">
      <div class="auth-confirm-icon">✓</div>
      <div>
        <strong>Account created successfully.</strong>
        <p>We sent a confirmation email to <b>${email}</b>. Please confirm your email, then sign in.</p>
        <p class="auth-confirm-muted">Your InstaPay details will be completed automatically after your first login from this browser.</p>
        <a href="login.html">Go to login</a>
      </div>
    </div>
  `;
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle("is-loading", isLoading);
  spinner.style.display = isLoading ? "inline-block" : "none";
  btnText.textContent = isLoading ? "Creating account..." : "Create account";
}

function updatePasswordMatchState() {
  if (!confirmPasswordInput || !confirmPasswordMsg || !confirmPasswordField) return true;

  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  confirmPasswordField.classList.remove("is-match", "is-mismatch");
  confirmPasswordMsg.classList.remove("is-valid", "is-invalid");

  if (!confirmPassword) {
    confirmPasswordMsg.textContent = "Re-enter your password";
    return false;
  }

  if (password && password === confirmPassword) {
    confirmPasswordField.classList.add("is-match");
    confirmPasswordMsg.classList.add("is-valid");
    confirmPasswordMsg.textContent = "Passwords match";
    return true;
  }

  confirmPasswordField.classList.add("is-mismatch");
  confirmPasswordMsg.classList.add("is-invalid");
  confirmPasswordMsg.textContent = "Passwords do not match";
  return false;
}

passwordInput?.addEventListener("input", updatePasswordMatchState);
confirmPasswordInput?.addEventListener("input", updatePasswordMatchState);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgEl.textContent = "";

  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput?.value || "";
  const instaPayNumber = document.getElementById("instapay").value.trim();
  const instaPayProfileLink = document.getElementById("instapayLink").value.trim();

  if (username.length < 3) {
    showMessage("Username must be at least 3 characters.");
    return;
  }
  if (!email) {
    showMessage("Email is required.");
    return;
  }
  if (password.length < 6) {
    showMessage("Password must be at least 6 characters.");
    return;
  }
  if (!confirmPassword) {
    showMessage("Please confirm your password.");
    confirmPasswordInput?.focus();
    updatePasswordMatchState();
    return;
  }
  if (password !== confirmPassword) {
    showMessage("Passwords do not match.");
    confirmPasswordInput?.focus();
    updatePasswordMatchState();
    return;
  }
  if (!instaPayNumber || !instaPayProfileLink) {
    showMessage("Instapay number and InstaPay profile link are required.");
    return;
  }

  try {
    const linkUrl = new URL(instaPayProfileLink);
    if (!linkUrl.protocol) throw new Error();
  } catch {
    showMessage("Please enter a valid InstaPay link with a scheme, like https:// or instapay://");
    return;
  }

  try {
    setLoading(true);
    const result = await signUpUser({
      username,
      email,
      password,
      instaPayNumber,
      instaPayProfileLink,
    });

    if (result?.requiresEmailConfirmation) {
      showEmailConfirmationNotice(email);
      return;
    }

    showMessage("Account created successfully! Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "user-profile.html";
    }, 800);
  } catch (error) {
    showMessage(error.message || "Signup failed. Please try again.");
  } finally {
    if (!form.classList.contains("account-created")) {
      setLoading(false);
    }
  }
});
