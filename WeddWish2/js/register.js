// js/register.js
import { signUpUser } from "./auth.js";

const form = document.getElementById("registerForm");
const msgEl = document.getElementById("msg");
const submitBtn = document.getElementById("submitBtn");
const btnText = submitBtn.querySelector(".btn-text");
const spinner = submitBtn.querySelector(".spinner");
const togglePassBtn = document.getElementById("togglePass");
const passwordInput = document.getElementById("password");

// Toggle password visibility
togglePassBtn.addEventListener("click", () => {
  const isHidden = passwordInput.type === "password";
  passwordInput.type = isHidden ? "text" : "password";
  togglePassBtn.textContent = isHidden ? "Hide" : "Show";
});

function showMessage(text, type = "error") {
  msgEl.textContent = text;
  msgEl.style.color = type === "error" ? "red" : "green";
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  spinner.style.display = isLoading ? "inline-block" : "none";
  btnText.textContent = isLoading ? "Creating account..." : "Create account";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgEl.textContent = "";

  const username = document.getElementById("username").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = passwordInput.value;
  const instaPayNumber = document.getElementById("instapay").value.trim();
  const address = document.getElementById("address").value.trim();

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
  if (!instaPayNumber || !address) {
    showMessage("Instapay number and address are required.");
    return;
  }

  try {
    setLoading(true);
    await signUpUser({
      username,
      email,
      password,
      instaPayNumber,
      address,
    });

    showMessage("Account created successfully! Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "user-profile.html";
    }, 800);
  } catch (error) {
    showMessage(error.message || "Signup failed. Please try again.");
  } finally {
    setLoading(false);
  }
});
