/* Logic for dashboard.html only. Requires the visitor to already be authenticated;
   redirects to login.html otherwise. */
(function () {
  'use strict';
  const { el, esc, api, uploadFile, setCsrf } = window.AdminCommon;

  const TAB_TITLES = {
    content: 'Home Page',
    about: 'About Page',
    reviews: 'Reviews',
    leads: 'Leads',
    settings: 'Settings',
  };

  async function boot() {
    try {
      const me = await api('/api/admin/me');
      setCsrf(me.csrfToken);
      initDashboard();
    } catch {
      window.location.href = '/admin/login.html';
    }
  }

  let dashboardInitialized = false;

  function initDashboard() {
    if (dashboardInitialized) return;
    dashboardInitialized = true;

    setupThemeToggle();
    mountStaticUploadFields();
    setupTabs();
    setupLogout();
    loadContentIntoForm();
    setupContentForm();
    setupAboutForm();
    setupRepeatables();
    loadReviewsAdmin();
    setupReviewForm();
    loadLeads();
    loadSettingsIntoForm();
    setupSettingsForm();
    setupPasswordForm();
  }

  const THEME_KEY = 'muthengi-admin-theme';

  function setupThemeToggle() {
    const toggle = el('theme-toggle');
    if (!toggle) return;
    const sun = toggle.querySelector('.icon-sun');
    const moon = toggle.querySelector('.icon-moon');

    function applyTheme(theme) {
      document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : '';
      sun.hidden = theme === 'dark';
      moon.hidden = theme !== 'dark';
      localStorage.setItem(THEME_KEY, theme);
    }

    const stored = localStorage.getItem(THEME_KEY);
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(stored || (systemPrefersDark ? 'dark' : 'light'));

    toggle.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  function setupTabs() {
    const buttons = document.querySelectorAll('#admin-tabs button');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach((panel) => {
          panel.hidden = panel.dataset.tab !== btn.dataset.tab;
        });
        const title = el('topbar-title');
        if (title) title.textContent = TAB_TITLES[btn.dataset.tab] || '';
        if (btn.dataset.tab === 'leads') loadLeads();
        if (btn.dataset.tab === 'reviews') loadReviewsAdmin();
      });
    });
  }

  function setupLogout() {
    el('logout-btn').addEventListener('click', async () => {
      try { await api('/api/admin/logout', { method: 'POST' }); } catch { /* ignore */ }
      window.location.href = '/admin/login.html';
    });
  }

  // ================= UPLOAD WIDGETS =================
  // Builds a small dropzone + preview + hidden input. The hidden input carries
  // either a `name` (for dot-notation fields like brand.logo) or a `data-key`
  // (for items inside a repeatable list, e.g. gallery image / hero bg image),
  // so all the existing get/set/collect logic below works unmodified.
  function createUploadWidget({ name, dataKey, value, label }) {
    const wrap = document.createElement('div');
    wrap.className = 'upload-field';

    if (label) {
      const lbl = document.createElement('label');
      lbl.textContent = label;
      wrap.appendChild(lbl);
    }

    const preview = document.createElement('div');
    preview.className = 'upload-preview';
    const img = document.createElement('img');
    img.alt = '';
    img.hidden = !value;
    if (value) img.src = value;
    const placeholder = document.createElement('span');
    placeholder.className = 'upload-placeholder';
    placeholder.textContent = 'No image yet';
    placeholder.hidden = !!value;
    preview.appendChild(img);
    preview.appendChild(placeholder);

    const controls = document.createElement('div');
    controls.className = 'upload-controls';
    const btnLabel = document.createElement('label');
    btnLabel.className = 'btn-upload';
    btnLabel.textContent = value ? 'Replace Image' : 'Upload Image';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    btnLabel.appendChild(fileInput);
    const status = document.createElement('span');
    status.className = 'upload-status';
    controls.appendChild(btnLabel);
    controls.appendChild(status);

    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    if (name) hidden.name = name;
    if (dataKey) hidden.dataset.key = dataKey;
    hidden.value = value || '';

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      status.textContent = 'Uploading…';
      status.className = 'upload-status';
      const localUrl = URL.createObjectURL(file);
      img.src = localUrl;
      img.hidden = false;
      placeholder.hidden = true;
      try {
        const url = await uploadFile(file);
        hidden.value = url;
        img.src = url;
        btnLabel.textContent = 'Replace Image';
        status.textContent = 'Uploaded';
        status.classList.add('ok');
      } catch (err) {
        status.textContent = err.message;
        status.classList.add('err');
      }
    });

    wrap.appendChild(preview);
    wrap.appendChild(controls);
    wrap.appendChild(hidden);
    return wrap;
  }

  function refreshUploadPreview(wrap) {
    const hidden = wrap.querySelector('input[type="hidden"]');
    const img = wrap.querySelector('img');
    const placeholder = wrap.querySelector('.upload-placeholder');
    const btnLabel = wrap.querySelector('.btn-upload');
    if (!hidden || !img) return;
    if (hidden.value) {
      img.src = hidden.value;
      img.hidden = false;
      if (placeholder) placeholder.hidden = true;
      if (btnLabel) btnLabel.childNodes[0].textContent = 'Replace Image';
    } else {
      img.hidden = true;
      if (placeholder) placeholder.hidden = false;
    }
  }

  // Static (non-repeatable) upload fields are declared in HTML as:
  // <div class="upload-mount" data-name="brand.logo" data-label="Logo"></div>
  function mountStaticUploadFields() {
    document.querySelectorAll('.upload-mount').forEach((mount) => {
      const widget = createUploadWidget({
        name: mount.dataset.name,
        label: mount.dataset.label,
        value: '',
      });
      mount.replaceWith(widget);
    });
  }

  // ================= dot-notation helpers =================
  function getPath(obj, path) {
    return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      cur[keys[i]] = cur[keys[i]] || {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  let currentContent = {};

  async function loadContentIntoForm() {
    try {
      currentContent = await api('/api/admin/content');

      document.querySelectorAll('#content-form [name]').forEach((input) => {
        const value = getPath(currentContent, input.name);
        if (value !== undefined) input.value = value;
      });
      document.querySelectorAll('#content-form .upload-field').forEach(refreshUploadPreview);

      renderRepeatable('stats', currentContent.stats || [], statFields);
      renderRepeatable('services', currentContent.services || [], serviceFields);
      renderRepeatable('gallery', currentContent.gallery || [], galleryFields);
      renderHeroBgList((currentContent.hero && currentContent.hero.backgroundImages) || []);

      document.querySelectorAll('#about-form [name]').forEach((input) => {
        const value = getPath(currentContent, input.name);
        if (value !== undefined) input.value = value;
      });
      document.querySelectorAll('#about-form .upload-field').forEach(refreshUploadPreview);
      renderRepeatable('values', (currentContent.about && currentContent.about.values) || [], valueFields);
    } catch (err) {
      console.error('Failed to load content:', err);
    }
  }

  function setupContentForm() {
    el('content-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = el('content-status');
      status.textContent = '';
      status.className = 'form-status';
      const payload = JSON.parse(JSON.stringify(currentContent)); // clone
      document.querySelectorAll('#content-form [name]').forEach((input) => {
        setPath(payload, input.name, input.value);
      });
      payload.stats = collectRepeatable('stats', statFields);
      payload.services = collectRepeatable('services', serviceFields);
      payload.gallery = collectRepeatable('gallery', galleryFields);
      payload.hero = payload.hero || {};
      payload.hero.backgroundImages = collectHeroBgList();
      try {
        const res = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify(payload) });
        currentContent = res.content;
        status.textContent = 'Saved. Changes are live on the site.';
        status.classList.add('ok');
      } catch (err) {
        status.textContent = err.message;
        status.classList.add('err');
      }
    });
  }

  function setupAboutForm() {
    el('about-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = el('about-status');
      status.textContent = '';
      status.className = 'form-status';
      const payload = JSON.parse(JSON.stringify(currentContent));
      document.querySelectorAll('#about-form [name]').forEach((input) => {
        setPath(payload, input.name, input.value);
      });
      payload.about = payload.about || {};
      payload.about.values = collectRepeatable('values', valueFields);
      try {
        const res = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify(payload) });
        currentContent = res.content;
        status.textContent = 'Saved. Changes are live on the About page.';
        status.classList.add('ok');
      } catch (err) {
        status.textContent = err.message;
        status.classList.add('err');
      }
    });
  }

  // ---- repeatable list field configs ----
  const statFields = [{ key: 'value', label: 'Value (e.g. 12+)', type: 'text' }, { key: 'label', label: 'Label (e.g. Years on Site)', type: 'text' }];
  const serviceFields = [
    { key: 'tag', label: 'Tag (e.g. Residential)', type: 'text' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'description', label: 'Description', type: 'textarea' },
  ];
  const galleryFields = [
    { key: 'image', label: 'Project Photo', type: 'image' },
    { key: 'caption', label: 'Caption', type: 'text' },
  ];
  const valueFields = [{ key: 'title', label: 'Title', type: 'text' }, { key: 'description', label: 'Description', type: 'textarea' }];

  // hero.backgroundImages is a plain array of URL strings (not objects like the
  // other repeatable lists), so it gets its own small render/collect pair.
  function buildUrlItem(url) {
    const row = document.createElement('div');
    row.className = 'repeat-item';
    const wrap = document.createElement('div');
    wrap.className = 'repeat-fields';
    wrap.appendChild(createUploadWidget({ dataKey: 'url', value: url, label: 'Background Photo' }));
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => row.remove());
    row.appendChild(wrap);
    row.appendChild(removeBtn);
    return row;
  }
  function renderHeroBgList(images) {
    const container = el('heroBg-list');
    container.innerHTML = '';
    (images || []).forEach((url) => container.appendChild(buildUrlItem(url)));
  }
  function collectHeroBgList() {
    const container = el('heroBg-list');
    return Array.from(container.children)
      .map((row) => row.querySelector('[data-key="url"]').value.trim())
      .filter(Boolean);
  }

  function renderRepeatable(name, items, fields) {
    const container = el(`${name}-list`);
    container.innerHTML = '';
    items.forEach((item) => container.appendChild(buildRepeatItem(name, item, fields)));
  }

  function buildRepeatItem(name, item, fields) {
    const row = document.createElement('div');
    row.className = 'repeat-item';
    row.dataset.group = name;
    const fieldsWrap = document.createElement('div');
    fieldsWrap.className = fields.length > 1 && !['services', 'values'].includes(name) ? 'repeat-fields row2' : 'repeat-fields';
    fields.forEach((f) => {
      if (f.type === 'image') {
        fieldsWrap.appendChild(createUploadWidget({ dataKey: f.key, value: item[f.key], label: f.label }));
        return;
      }
      const wrap = document.createElement('div');
      const label = document.createElement('label');
      label.textContent = f.label;
      const input = f.type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
      if (f.type !== 'textarea') input.type = 'text';
      input.dataset.key = f.key;
      input.value = item[f.key] || '';
      wrap.appendChild(label);
      wrap.appendChild(input);
      fieldsWrap.appendChild(wrap);
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => row.remove());
    row.appendChild(fieldsWrap);
    row.appendChild(removeBtn);
    return row;
  }

  function collectRepeatable(name, fields) {
    const container = el(`${name}-list`);
    return Array.from(container.children).map((row) => {
      const obj = {};
      fields.forEach((f) => {
        const input = row.querySelector(`[data-key="${f.key}"]`);
        obj[f.key] = input ? input.value : '';
      });
      return obj;
    });
  }

  const FIELD_CONFIGS = { stats: statFields, services: serviceFields, gallery: galleryFields, values: valueFields };

  function setupRepeatables() {
    document.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.add;
        if (name === 'heroBg') {
          el('heroBg-list').appendChild(buildUrlItem(''));
          return;
        }
        el(`${name}-list`).appendChild(buildRepeatItem(name, {}, FIELD_CONFIGS[name]));
      });
    });
  }

  // ================= REVIEWS =================
  async function loadReviewsAdmin() {
    const list = el('reviews-admin-list');
    list.innerHTML = '<p class="admin-list-empty">Loading…</p>';
    try {
      const data = await api('/api/admin/reviews');
      const manual = data.manual || [];
      if (manual.length === 0) {
        list.innerHTML = '<p class="admin-list-empty">No manual reviews yet. Add one above.</p>';
        return;
      }
      list.innerHTML = '';
      manual.forEach((r) => {
        const item = document.createElement('div');
        item.className = 'admin-list-item';
        item.innerHTML = `
          <div class="item-body">
            <div class="item-meta">${esc(r.author)} · ${'★'.repeat(r.rating)} · ${esc(r.date || '')}</div>
            <div class="item-text">${esc(r.text)}</div>
          </div>
        `;
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-remove';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
          if (!confirm('Delete this review?')) return;
          try {
            await api(`/api/admin/reviews/${r.id}`, { method: 'DELETE' });
            loadReviewsAdmin();
          } catch (err) {
            alert(err.message);
          }
        });
        item.appendChild(delBtn);
        list.appendChild(item);
      });
    } catch (err) {
      list.innerHTML = `<p class="admin-list-empty">Failed to load reviews: ${esc(err.message)}</p>`;
    }
  }

  function setupReviewForm() {
    el('review-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const author = el('review-author').value.trim();
      const rating = Number(el('review-rating').value);
      const date = el('review-date').value.trim();
      const text = el('review-text').value.trim();
      if (!author || !text) return;
      try {
        await api('/api/admin/reviews', { method: 'POST', body: JSON.stringify({ author, rating, date, text }) });
        el('review-form').reset();
        loadReviewsAdmin();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // ================= LEADS =================
  async function loadLeads() {
    const list = el('leads-list');
    list.innerHTML = '<p class="admin-list-empty">Loading…</p>';
    try {
      const data = await api('/api/admin/leads');
      const items = data.items || [];
      if (items.length === 0) {
        list.innerHTML = '<p class="admin-list-empty">No submissions yet.</p>';
        return;
      }
      list.innerHTML = '';
      items.forEach((lead) => {
        const item = document.createElement('div');
        item.className = 'admin-list-item' + (lead.read ? '' : ' unread');
        const when = new Date(lead.receivedAt).toLocaleString();
        item.innerHTML = `
          <div class="item-body">
            <div class="item-meta">${esc(lead.name)} · ${esc(lead.projectType || 'General')} · ${when}</div>
            <div class="item-text">${esc(lead.message)}</div>
            <div class="item-meta" style="margin-top:8px">${esc(lead.email || '')} ${lead.email && lead.phone ? '·' : ''} ${esc(lead.phone || '')}</div>
          </div>
        `;
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.flexDirection = 'column';
        actions.style.gap = '6px';
        if (!lead.read) {
          const readBtn = document.createElement('button');
          readBtn.className = 'btn-add';
          readBtn.textContent = 'Mark Read';
          readBtn.addEventListener('click', async () => {
            await api(`/api/admin/leads/${lead.id}`, { method: 'PATCH' });
            loadLeads();
          });
          actions.appendChild(readBtn);
        }
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-remove';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', async () => {
          if (!confirm('Delete this lead?')) return;
          await api(`/api/admin/leads/${lead.id}`, { method: 'DELETE' });
          loadLeads();
        });
        actions.appendChild(delBtn);
        item.appendChild(actions);
        list.appendChild(item);
      });
    } catch (err) {
      list.innerHTML = `<p class="admin-list-empty">Failed to load leads: ${esc(err.message)}</p>`;
    }
  }

  // ================= SETTINGS =================
  async function loadSettingsIntoForm() {
    try {
      const settings = await api('/api/admin/settings');
      el('settings-place-id').value = settings.googlePlaceId || '';
      el('api-key-status').textContent = settings.googleApiKeySet ? '(a key is currently saved)' : '(no key saved yet)';
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  function setupSettingsForm() {
    el('settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = el('settings-status');
      status.textContent = '';
      status.className = 'form-status';
      const body = {
        googlePlaceId: el('settings-place-id').value.trim(),
      };
      const apiKey = el('settings-api-key').value.trim();
      if (apiKey) body.googleApiKey = apiKey;
      try {
        await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) });
        el('settings-api-key').value = '';
        status.textContent = 'Saved. The reviews section will refresh within 24 hours, or on next cache clear.';
        status.classList.add('ok');
        loadSettingsIntoForm();
      } catch (err) {
        status.textContent = err.message;
        status.classList.add('err');
      }
    });
  }

  function setupPasswordForm() {
    el('password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = el('password-status');
      status.textContent = '';
      status.className = 'form-status';
      const currentPassword = el('pw-current').value;
      const newPassword = el('pw-new').value;
      try {
        await api('/api/admin/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
        el('password-form').reset();
        status.textContent = 'Password updated.';
        status.classList.add('ok');
      } catch (err) {
        status.textContent = err.message;
        status.classList.add('err');
      }
    });
  }

  boot();
})();