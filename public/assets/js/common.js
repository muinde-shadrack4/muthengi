(function (window) {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function setupThemeToggle() {
    const btn = el('theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('muthengi-theme', next);
    });
  }

  function setupNavToggle() {
    const toggle = el('nav-toggle');
    const header = document.querySelector('.site-header');
    if (!toggle || !header) return;
    toggle.addEventListener('click', () => {
      const isOpen = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });
    document.querySelectorAll('.main-nav a').forEach((a) => {
      a.addEventListener('click', () => header.classList.remove('nav-open'));
    });
  }

  async function fetchContent() {
    const res = await fetch('/api/content');
    if (!res.ok) throw new Error('content fetch failed');
    return res.json();
  }

  // Applies the fields every page shares: logo, brand name, nav CTA text, footer blurb/year.
  function applyShared(c) {
    if (c.brand) {
      const brandName = el('brand-name');
      if (brandName) brandName.textContent = c.brand.shortName || c.brand.name || 'Muthengi';
      if (c.brand.logo) {
        document.querySelectorAll('.brand-mark, .footer-mark').forEach((img) => { img.src = c.brand.logo; });
      }
      document.title = document.title.includes('&mdash;') || document.title.includes('\u2014')
        ? document.title
        : (c.brand.name || document.title);
    }
    const navCta = el('nav-cta');
    if (navCta && c.nav && c.nav.ctaText) navCta.textContent = c.nav.ctaText;
    const footerBlurb = el('footer-blurb');
    if (footerBlurb && c.footer) footerBlurb.textContent = c.footer.blurb || '';
    const footerYear = el('footer-year');
    if (footerYear) footerYear.textContent = new Date().getFullYear();
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW registration failed:', err));
    });
  }

  window.MuthengiCommon = { el, setupThemeToggle, setupNavToggle, fetchContent, applyShared, registerServiceWorker };
})(window);
