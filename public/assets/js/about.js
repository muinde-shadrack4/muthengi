(function () {
  'use strict';

  const { el, setupThemeToggle, setupNavToggle, fetchContent, applyShared, registerServiceWorker } = window.MuthengiCommon;

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  async function load() {
    try {
      const c = await fetchContent();
      applyShared(c);
      document.title = `About \u2014 ${(c.brand && c.brand.name) || 'Muthengi'}`;

      if (c.about) {
        el('about-eyebrow').textContent = c.about.eyebrow || '';
        el('about-heading').textContent = c.about.heading || '';
        el('about-intro').textContent = c.about.intro || '';
        el('about-story-heading').textContent = c.about.storyHeading || 'Our Story';
        el('about-story-text').textContent = c.about.story || '';
        el('about-mission-heading').textContent = c.about.missionHeading || 'How We Work';
        el('about-mission-text').textContent = c.about.mission || '';
        if (c.about.photo) el('about-photo').src = c.about.photo;

        if (Array.isArray(c.about.values)) {
          el('values-grid').innerHTML = c.about.values.map((v) =>
            `<div class="value-card"><h3>${esc(v.title)}</h3><p>${esc(v.description)}</p></div>`
          ).join('');
        }
      }
    } catch (err) {
      console.error('Failed to load about content:', err);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupThemeToggle();
    setupNavToggle();
    load();
  });

  registerServiceWorker();
})();
