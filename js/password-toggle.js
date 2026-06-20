// Password visibility toggle for GradWeb.
// Uses one custom SVG icon, keeps native browser reveal icons hidden, and avoids jumpy motion.
document.addEventListener("DOMContentLoaded", () => {
  const canMaskWithCss =
    window.CSS &&
    (CSS.supports("-webkit-text-security", "disc") || CSS.supports("text-security", "disc"));

  const eyeIcon = `
    <svg class="ww-eye-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path class="ww-eye-outline" d="M2.25 12s3.65-6.15 9.75-6.15S21.75 12 21.75 12 18.1 18.15 12 18.15 2.25 12 2.25 12Z"></path>
      <circle class="ww-eye-pupil" cx="12" cy="12" r="3.05"></circle>
      <path class="ww-eye-slash" d="M4.35 4.35 19.65 19.65"></path>
    </svg>`;

  const maskPassword = (input, button, wrapper) => {
    // Keep type="text" when possible to prevent the browser native black reveal icon.
    if (canMaskWithCss) {
      input.type = "text";
      input.classList.add("ww-password-masked");
    } else {
      input.type = "password";
      input.classList.remove("ww-password-masked");
    }

    wrapper.classList.remove("is-visible");
    button.setAttribute("aria-label", "Show password");
    button.setAttribute("title", "Show password");
  };

  const revealPassword = (input, button, wrapper) => {
    input.type = "text";
    input.classList.remove("ww-password-masked");
    wrapper.classList.add("is-visible");
    button.setAttribute("aria-label", "Hide password");
    button.setAttribute("title", "Hide password");
  };

  document.querySelectorAll(".toggle-password").forEach((button) => {
    const wrapper = button.closest(".password-field, .profile-password-field");
    const input = wrapper?.querySelector("input");
    if (!wrapper || !input) return;

    button.type = "button";
    button.innerHTML = eyeIcon;
    input.classList.add("ww-password-input");
    maskPassword(input, button, wrapper);

    button.addEventListener("click", () => {
      button.classList.remove("is-flipping");
      void button.offsetWidth;
      button.classList.add("is-flipping");

      if (wrapper.classList.contains("is-visible")) {
        maskPassword(input, button, wrapper);
      } else {
        revealPassword(input, button, wrapper);
      }
    });

    button.addEventListener("animationend", () => {
      button.classList.remove("is-flipping");
    });
  });
});
