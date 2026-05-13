(function () {
  const FOOTER_HTML = `
    <div class="ww-footer-inner">
      <div class="ww-footer-brand">
        <a class="ww-footer-logo" href="index.html" aria-label="WeddWish home">
          <img src="images/logo_green.png" alt="WeddWish logo">
        </a>
        <p>WeddWish brings people together by turning wedding wishes into shared, trackable contributions.</p>
        <div class="ww-footer-socials" aria-label="Social links">
          <a href="https://www.facebook.com/" target="_blank" rel="noopener" aria-label="Facebook"><i class="fa fa-facebook" aria-hidden="true"></i></a>
          <a href="https://www.linkedin.com/" target="_blank" rel="noopener" aria-label="LinkedIn"><i class="fa fa-linkedin" aria-hidden="true"></i></a>
          <a href="#" aria-label="Instagram"><i class="fa fa-instagram" aria-hidden="true"></i></a>
          <a href="#" aria-label="Twitter"><i class="fa fa-twitter" aria-hidden="true"></i></a>
        </div>
      </div>

      <div class="ww-footer-col">
        <h3>Pages</h3>
        <a href="index.html">Home</a>
        <a href="feed.html">Feed</a>
        <a href="about.html">About</a>
        <a href="contact.html">Contact</a>
      </div>

      <div class="ww-footer-col ww-footer-contact">
        <h3>Contact Info</h3>
        <a href="https://www.google.com/maps/search/?api=1&query=Giza%2C%20Egypt" target="_blank" rel="noopener">
          <i class="fa fa-map-marker" aria-hidden="true"></i>
          <span>Giza, Egypt</span>
        </a>
        <a href="https://wa.me/201013309940" target="_blank" rel="noopener">
          <i class="fa fa-whatsapp" aria-hidden="true"></i>
          <span>01013309940</span>
        </a>
        <a href="mailto:WeddWish@gmail.com">
          <i class="fa fa-envelope" aria-hidden="true"></i>
          <span>WeddWish@gmail.com</span>
        </a>
      </div>

      <div class="ww-footer-col ww-footer-cta">
        <h3>Start gifting smarter</h3>
        <p>Create a wishlist, share it, and track donations in one place.</p>
        <a class="ww-footer-button" href="login.html" data-auth-guest-href="login.html">Join us today</a>
      </div>
    </div>

    <div class="ww-footer-bottom">
      <span>Copyright &copy; 2025 WeddWish. All rights reserved.</span>
    </div>
  `;

  function mountFooter() {
    let footer = document.querySelector("footer");

    if (!footer) {
      footer = document.createElement("footer");
      document.body.appendChild(footer);
    }

    footer.className = "ww-site-footer";
    footer.innerHTML = FOOTER_HTML;

    const cta = footer.querySelector(".ww-footer-button");
    if (cta && localStorage.getItem("jwt")) {
      cta.href = "user-profile.html";
    }

    document.dispatchEvent(new CustomEvent("ww:footer-mounted"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountFooter);
  } else {
    mountFooter();
  }
})();
