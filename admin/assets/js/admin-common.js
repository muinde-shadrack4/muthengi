/* Shared helpers used by both login.html and dashboard.html */
window.AdminCommon = (function () {
  'use strict';

  let csrfToken = null;

  function el(id) { return document.getElementById(id); }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  function setCsrf(token) { csrfToken = token; }
  function getCsrf() { return csrfToken; }

  async function api(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (options.method && options.method !== 'GET' && csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(path, { ...options, headers });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    return data;
  }

  /**
   * Uploads a single file as multipart/form-data.
   * Expects the backend to expose: POST /api/admin/upload
   *   - field name: "file"
   *   - auth: same session/cookie as everything else, plus X-CSRF-Token header
   *   - response: { "url": "/assets/img/whatever-the-server-named-it.jpg" }
   * Returns the resulting URL string.
   */
  async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    const headers = {};
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const res = await fetch('/api/admin/upload', { method: 'POST', body: formData, headers });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      throw new Error((data && data.error) || `Upload failed (${res.status})`);
    }
    return data.url;
  }

  return { el, esc, api, uploadFile, setCsrf, getCsrf };
})();