/* Logic for login.html only (setup + login views). */
(function () {
  'use strict';
  const { el, api, setCsrf } = window.AdminCommon;

  function show(node) { node.hidden = false; }
  function hide(node) { node.hidden = true; }

  async function boot() {
    // Already logged in? Skip straight to the dashboard.
    try {
      const me = await api('/api/admin/me');
      setCsrf(me.csrfToken);
      window.location.href = '/admin/dashboard.html';
      return;
    } catch { /* not logged in, continue */ }

    try {
      const status = await api('/api/admin/setup-status');
      if (!status.setupComplete) {
        show(el('view-setup'));
        return;
      }
    } catch { /* fall through to login */ }

    show(el('view-login'));
  }

  el('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = el('setup-status');
    status.textContent = '';
    status.className = 'auth-status';
    const username = el('setup-username').value.trim();
    const password = el('setup-password').value;
    try {
      await api('/api/admin/setup', { method: 'POST', body: JSON.stringify({ username, password }) });
      status.classList.add('ok');
      status.textContent = 'Account created — logging you in...';
      const loginRes = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      setCsrf(loginRes.csrfToken);
      window.location.href = 'dashboard.html';
    } catch (err) {
      status.classList.add('err');
      status.textContent = err.message;
    }
  });

  el('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = el('login-status');
    status.textContent = '';
    status.className = 'auth-status';
    const username = el('login-username').value.trim();
    const password = el('login-password').value;
    try {
      const data = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      setCsrf(data.csrfToken);
      window.location.href = '/admin/dashboard.html';
    } catch (err) {
      status.classList.add('err');
      status.textContent = err.message;
    }
  });

  boot();
})();