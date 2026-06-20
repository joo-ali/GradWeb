(function () {
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function isSafeLocalLink(anchor) {
    if (!anchor || !anchor.href) return false;
    if (anchor.target === '_blank' || anchor.hasAttribute('download')) return false;
    if (anchor.dataset.noTransition === 'true') return false;

    const hrefAttr = anchor.getAttribute('href') || '';
    if (!hrefAttr || hrefAttr.startsWith('#') || hrefAttr.startsWith('javascript:')) return false;
    if (hrefAttr.startsWith('mailto:') || hrefAttr.startsWith('tel:')) return false;

    try {
      const url = new URL(anchor.href, window.location.href);
      return url.origin === window.location.origin;
    } catch (_) {
      return false;
    }
  }

  function collectRevealTargets(root) {
    const selectors = [
      '.main .main_content',
      '.side .left',
      '.side .right',
      '.product h2',
      '.product .product_container .item',
      '.main_about .main_content_about',
      '.auth-card',
      '.auth-side',
      '.side-card',
      '.profile-header',
      '.profile-actions',
      '.wishlist-title',
      '.wishlist-card',
      '.info-card',
      '.public-top',
      '.public-paybox',
      '.edit-profile-card',
      '.image-upload-box',
      '.contact_container',
      'footer .pages',
      'footer .doc',
      'footer .contact',
      'footer .social',
      '.ww-modal-card',
      '.forgot-password-card',
      '.feed-card',
      '.search-card'
    ];

    return Array.from(root.querySelectorAll(selectors.join(',')));
  }

  function initReveal() {
    const targets = collectRevealTargets(document);
    if (!targets.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    targets.forEach((el, index) => {
      if (el.classList.contains('reveal') || el.classList.contains('is-visible')) return;
      el.classList.add('reveal');
      el.style.setProperty('--motion-delay', `${Math.min(index * 55, 440)}ms`);
      observer.observe(el);
    });

    const mutationObserver = new MutationObserver((mutations) => {
      const newTargets = [];
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches && node.matches('.wishlist-card, .ww-modal-card, .forgot-password-card, .info-card')) {
            newTargets.push(node);
          }
          newTargets.push(...collectRevealTargets(node));
        });
      });

      newTargets.forEach((el, index) => {
        if (el.classList.contains('reveal') || el.classList.contains('is-visible')) return;
        el.classList.add('reveal');
        el.style.setProperty('--motion-delay', `${Math.min(index * 45, 260)}ms`);
        observer.observe(el);
      });
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  function initPageTransitions() {
    if (reduceMotion) return;

    document.addEventListener('click', (event) => {
      const anchor = event.target.closest('a');
      if (!isSafeLocalLink(anchor)) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (nextUrl.href === current.href) return;

      event.preventDefault();
      document.body.classList.add('page-leave');
      window.setTimeout(() => {
        window.location.href = nextUrl.href;
      }, 190);
    });
  }

  function initButtonRipples() {
    if (reduceMotion) return;

    const selectors = [
      '.primary',
      '.primary1',
      '.public-donate-btn',
      '.public-share-btn',
      '.change-photo-btn',
      '.public-copy-btn',
      '.pay-instapay-btn',
      '.top-link',
      '.item-menu-btn'
    ];

    document.addEventListener('pointerdown', (event) => {
      const button = event.target.closest(selectors.join(','));
      if (!button) return;
      button.animate([
        { transform: 'scale(1)' },
        { transform: 'scale(.96)' },
        { transform: 'scale(1)' }
      ], { duration: 260, easing: 'cubic-bezier(.2,.75,.25,1)' });
    });
  }

  function initCardTilt() {
    if (reduceMotion || window.matchMedia('(max-width: 768px)').matches) return;

    const cards = new Set();
    const selector = '.wishlist-card, .public-paybox';

    function attach(card) {
      if (cards.has(card)) return;
      cards.add(card);

      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        card.style.transform = `translateY(-7px) rotateX(${(-y * 2.2).toFixed(2)}deg) rotateY(${(x * 2.2).toFixed(2)}deg)`;
      });

      card.addEventListener('pointerleave', () => {
        card.style.transform = '';
      });
    }

    document.querySelectorAll(selector).forEach(attach);

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches && node.matches(selector)) attach(node);
          node.querySelectorAll && node.querySelectorAll(selector).forEach(attach);
        });
      });
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }

  function initProgressLabels() {
    document.querySelectorAll('.donation-progress').forEach((bar) => {
      if (bar.getAttribute('role')) return;
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      const fill = bar.querySelector('.donation-progress-fill');
      const width = fill ? parseFloat(fill.style.width || fill.getAttribute('data-width') || '0') : 0;
      if (!Number.isNaN(width)) bar.setAttribute('aria-valuenow', String(Math.max(0, Math.min(100, width))));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('motion-ready');
    initReveal();
    initPageTransitions();
    initButtonRipples();
    initCardTilt();
    initProgressLabels();
  });
})();
