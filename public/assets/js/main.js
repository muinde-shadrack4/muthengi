(function () {
  'use strict';

  const { el, setupThemeToggle, setupNavToggle, fetchContent, applyShared, registerServiceWorker } = window.MuthengiCommon;

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }
  function stars(rating) {
    const r = Math.round(Number(rating) || 0);
    return '\u2605\u2605\u2605\u2605\u2605\u2606\u2606\u2606\u2606\u2606'.slice(5 - r, 10 - r);
  }

  async function loadContent() {
    try {
      const c = await fetchContent();
      render(c);
    } catch (err) {
      console.error('Failed to load content:', err);
    }
  }

  function render(c) {
    applyShared(c);
    document.title = (c.brand && c.brand.name) || document.title;

    if (c.hero) {
      el('hero-eyebrow').textContent = c.hero.eyebrow || '';
      el('hero-line1').textContent = c.hero.headingLine1 || '';
      el('hero-line2').textContent = c.hero.headingLine2 || '';
      el('hero-sub').textContent = c.hero.subtext || '';
      el('hero-cta-primary').textContent = c.hero.ctaPrimaryText || 'Request a Quote';
      el('hero-cta-secondary').textContent = c.hero.ctaSecondaryText || 'Our Capabilities';
      if (c.hero.heroImage) el('hero-image').src = c.hero.heroImage;
      renderHeroSlideshow(c.hero.backgroundImages || []);
    }

    if (Array.isArray(c.stats)) {
      el('stats-grid').innerHTML = c.stats.map((s) =>
        `<div class="stat"><span class="stat-value">${esc(s.value)}</span><span class="stat-label">${esc(s.label)}</span></div>`
      ).join('');
    }

    if (c.servicesIntro) {
      el('services-eyebrow').textContent = c.servicesIntro.eyebrow || '';
      el('services-heading').textContent = c.servicesIntro.heading || '';
      el('services-sub').textContent = c.servicesIntro.subtext || '';
    }
    if (Array.isArray(c.services)) {
      el('service-grid').innerHTML = c.services.map((s) =>
        `<div class="service-card">
           <span class="service-tag">${esc(s.tag)}</span>
           <h3>${esc(s.title)}</h3>
           <p>${esc(s.description)}</p>
         </div>`
      ).join('');
    }

    if (c.portfolioIntro) {
      el('portfolio-eyebrow').textContent = c.portfolioIntro.eyebrow || '';
      el('portfolio-heading').textContent = c.portfolioIntro.heading || '';
    }
    if (Array.isArray(c.gallery)) {
      el('gallery-grid').innerHTML = c.gallery.map((g) =>
        `<div class="gallery-item">
           <img src="${esc(g.image)}" alt="${esc(g.caption || '')}" loading="lazy" onerror="this.parentElement.style.display='none'">
           <div class="gallery-caption">${esc(g.caption || '')}</div>
         </div>`
      ).join('');
    }

    if (c.testimonial) {
      el('testimonial-quote').textContent = `\u201C${c.testimonial.quote || ''}\u201D`;
      el('testimonial-author').textContent = [c.testimonial.author, c.testimonial.role].filter(Boolean).join(' \u2014 ');
    }

    if (c.contact) {
      el('contact-intro').textContent = c.contact.formIntro || '';
      el('contact-phone').textContent = c.contact.phone || '';
      el('contact-email').textContent = c.contact.email || '';
      el('contact-address').textContent = c.contact.address || '';
    }
  }

  // Renders a Ken-Burns cross-fade slideshow behind the hero from admin-supplied photo
  // URLs. With zero images, the container just stays empty and the CSS blueprint-grid
  // pattern (.hero-grid) shows through instead — no broken-image placeholders.
  function renderHeroSlideshow(images) {
    const container = el('hero-bg-slideshow');
    const overlay = el('hero-bg-overlay');
    const valid = images.filter((src) => typeof src === 'string' && src.trim());
    if (valid.length === 0) {
      container.innerHTML = '';
      overlay.hidden = true;
      return;
    }
    container.className = `hero-bg-slideshow count-${Math.min(valid.length, 4)}`;
    container.innerHTML = valid.slice(0, 4).map((src) =>
      `<div class="hero-bg-slide" style="background-image:url('${src.replace(/'/g, '%27')}')"></div>`
    ).join('');
    overlay.hidden = false;
  }

  async function loadReviews() {
    try {
      const res = await fetch('/api/reviews');
      if (!res.ok) throw new Error('reviews fetch failed');
      const data = await res.json();
      renderReviews(data);
    } catch (err) {
      console.error('Failed to load reviews:', err);
      el('reviews-empty').hidden = false;
    }
  }

  function renderReviews(data) {
    const grid = el('review-grid');
    const reviews = data.reviews || [];

    if (data.googleRating) {
      el('reviews-summary').hidden = false;
      el('reviews-score').textContent = Number(data.googleRating).toFixed(1);
      el('reviews-stars').textContent = stars(data.googleRating);
      if (data.googleReviewCount) {
        el('reviews-count').textContent = `based on ${data.googleReviewCount} Google reviews`;
      }
      if (data.mapsUri) {
        const link = el('reviews-maps-link');
        link.href = data.mapsUri;
        link.hidden = false;
      }
    }

    if (reviews.length === 0) {
      el('reviews-empty').hidden = false;
      return;
    }

    grid.innerHTML = reviews.slice(0, 9).map((r) => `
      <div class="review-card">
        <div class="review-stars">${stars(r.rating)}</div>
        <p class="review-text">${esc(r.text)}</p>
        <div class="review-meta">
          <span>${esc(r.author)}</span>
          <span class="review-source-badge">${r.source === 'google' ? 'Google' : 'Client'}</span>
        </div>
      </div>
    `).join('');
  }

  function setupContactForm() {
    const form = el('contact-form');
    const status = el('cf-status');
    const submitBtn = el('cf-submit');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = '';
      status.className = 'form-status';
      const payload = {
        name: el('cf-name').value.trim(),
        email: el('cf-email').value.trim(),
        phone: el('cf-phone').value.trim(),
        projectType: el('cf-project').value,
        message: el('cf-message').value.trim(),
      };
      if (!payload.name || !payload.message || (!payload.email && !payload.phone)) {
        status.textContent = 'Please add your name, a way to reach you, and a short message.';
        status.classList.add('err');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending\u2026';
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Something went wrong.');
        }
        status.textContent = 'Thanks \u2014 we\u2019ve got your request and will be in touch shortly.';
        status.classList.add('ok');
        form.reset();
      } catch (err) {
        status.textContent = err.message || 'Something went wrong. Please try again.';
        status.classList.add('err');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle();
    setupNavToggle();
    setupContactForm();
    loadContent();
    loadReviews();
  });

  registerServiceWorker();
})();
