const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { readTable, writeTable } = require('../store');
const { sendJson, readJsonBody, readMultipartBody, MAX_UPLOAD_BYTES } = require('../utils/http');
const { hashPassword, verifyPassword, signSession, verifySession } = require('../auth');
const {
  parseCookies,
  setCookie,
  clearCookie,
  generateCsrfToken,
  verifyCsrf,
  rateLimit,
  clientIp,
} = require('../security');
const { invalidateCache } = require('../googleReviews');
const { DEFAULT_CONTENT, DEFAULT_REVIEWS, DEFAULT_SETTINGS } = require('../seeds');

const SESSION_COOKIE = 'muthengi_session';
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  console.warn(
    '[admin] WARNING: SESSION_SECRET is not set in the environment. Set it in .env before deploying — ' +
      'using an insecure fallback for local dev only.'
  );
}
const EFFECTIVE_SECRET = SESSION_SECRET || 'dev-only-insecure-secret-change-me';

// Uploaded images land here — public/assets/img/uploads — so they're served straight
// through the existing public-static-file path with no new serving logic required.
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'img', 'uploads');
const ALLOWED_UPLOAD_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function getSession(req) {
  const cookies = parseCookies(req);
  return verifySession(cookies[SESSION_COOKIE], EFFECTIVE_SECRET);
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session || session.role !== 'admin') {
    sendJson(res, 401, { error: 'Not authenticated.' });
    return null;
  }
  return session;
}

// State-changing requests (anything but GET) must carry a valid CSRF token that matches the
// csrf_token cookie issued at login — the classic double-submit pattern.
function requireCsrf(req, res) {
  if (req.method === 'GET') return true;
  const cookies = parseCookies(req);
  if (!verifyCsrf(req, cookies)) {
    sendJson(res, 403, { error: 'Invalid or missing CSRF token.' });
    return false;
  }
  return true;
}

async function handleAdminRoute(req, res, pathname) {
  const ip = clientIp(req);

  // POST /api/admin/setup — creates the one and only admin account. Locks itself once used.
  if (pathname === '/api/admin/setup' && req.method === 'POST') {
    const existing = readTable('admin', null);
    if (existing) {
      return sendJson(res, 409, { error: 'Admin account already exists. Use /admin to log in.' });
    }
    if (!rateLimit(`setup:${ip}`, { windowMs: 60_000, max: 5 })) {
      return sendJson(res, 429, { error: 'Too many attempts.' });
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, err.statusCode || 400, { error: err.message });
    }
    const username = String(body.username || '').trim().slice(0, 100);
    const password = String(body.password || '');
    if (!username || password.length < 10) {
      return sendJson(res, 400, { error: 'Username required; password must be at least 10 characters.' });
    }
    writeTable('admin', { username, passwordHash: hashPassword(password), createdAt: new Date().toISOString() });
    return sendJson(res, 201, { ok: true });
  }

  // GET /api/admin/setup-status — lets the admin frontend know whether to show setup or login
  if (pathname === '/api/admin/setup-status' && req.method === 'GET') {
    const existing = readTable('admin', null);
    return sendJson(res, 200, { setupComplete: !!existing });
  }

  // POST /api/admin/login
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    if (!rateLimit(`login:${ip}`, { windowMs: 5 * 60_000, max: 10 })) {
      return sendJson(res, 429, { error: 'Too many login attempts. Try again in a few minutes.' });
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, err.statusCode || 400, { error: err.message });
    }
    const admin = readTable('admin', null);
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!admin || admin.username !== username || !verifyPassword(password, admin.passwordHash)) {
      return sendJson(res, 401, { error: 'Invalid username or password.' });
    }
    const token = signSession({ role: 'admin', username }, EFFECTIVE_SECRET);
    setCookie(res, SESSION_COOKIE, token, { httpOnly: true, maxAge: 60 * 60 * 8 });
    const csrfToken = generateCsrfToken();
    setCookie(res, 'csrf_token', csrfToken, { httpOnly: false, maxAge: 60 * 60 * 8 });
    return sendJson(res, 200, { ok: true, username, csrfToken });
  }

  // POST /api/admin/logout
  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    clearCookie(res, SESSION_COOKIE);
    clearCookie(res, 'csrf_token');
    return sendJson(res, 200, { ok: true });
  }

  // GET /api/admin/me — session check, also (re)issues a csrf token for the dashboard
  if (pathname === '/api/admin/me' && req.method === 'GET') {
    const session = requireAuth(req, res);
    if (!session) return;
    const cookies = parseCookies(req);
    let csrfToken = cookies['csrf_token'];
    if (!csrfToken) {
      csrfToken = generateCsrfToken();
      setCookie(res, 'csrf_token', csrfToken, { httpOnly: false, maxAge: 60 * 60 * 8 });
    }
    return sendJson(res, 200, { username: session.username, csrfToken });
  }

  // Everything below requires an authenticated session
  if (pathname.startsWith('/api/admin/')) {
    const session = requireAuth(req, res);
    if (!session) return;
    if (!requireCsrf(req, res)) return;

    // POST /api/admin/upload — accepts one image file (field name "file"), saves it under
    // public/assets/img/uploads/, returns the URL to store in content.json.
    if (pathname === '/api/admin/upload' && req.method === 'POST') {
      let files;
      try {
        ({ files } = await readMultipartBody(req, { maxBytes: MAX_UPLOAD_BYTES }));
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { error: err.message });
      }
      const file = files.find((f) => f.fieldName === 'file');
      if (!file || !file.data || file.data.length === 0) {
        return sendJson(res, 400, { error: 'No file provided.' });
      }
      const ext = ALLOWED_UPLOAD_TYPES[file.contentType];
      if (!ext) {
        return sendJson(res, 415, { error: 'Only JPEG, PNG, WEBP, or GIF images are allowed.' });
      }
      try {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        const filename = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${ext}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, filename), file.data);
        return sendJson(res, 201, { ok: true, url: `/assets/img/uploads/${filename}` });
      } catch (err) {
        console.error('[admin] Upload failed:', err);
        return sendJson(res, 500, { error: 'Failed to save the uploaded file.' });
      }
    }

    // GET/PUT /api/admin/content
    if (pathname === '/api/admin/content' && req.method === 'GET') {
      return sendJson(res, 200, readTable('content', DEFAULT_CONTENT));
    }
    if (pathname === '/api/admin/content' && req.method === 'PUT') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { error: err.message });
      }
      const current = readTable('content', DEFAULT_CONTENT);
      const merged = { ...current, ...body };
      writeTable('content', merged);
      return sendJson(res, 200, { ok: true, content: merged });
    }

    // GET /api/admin/reviews, POST (add manual), DELETE (?id=)
    if (pathname === '/api/admin/reviews' && req.method === 'GET') {
      return sendJson(res, 200, readTable('reviews', DEFAULT_REVIEWS));
    }
    if (pathname === '/api/admin/reviews' && req.method === 'POST') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { error: err.message });
      }
      const author = String(body.author || '').trim().slice(0, 200);
      const text = String(body.text || '').trim().slice(0, 2000);
      const rating = Math.min(5, Math.max(1, Number(body.rating) || 5));
      const date = String(body.date || '').trim().slice(0, 50);
      if (!author || !text) {
        return sendJson(res, 400, { error: 'Author and review text are required.' });
      }
      const reviews = readTable('reviews', DEFAULT_REVIEWS);
      const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), author, text, rating, date };
      reviews.manual = [entry, ...(reviews.manual || [])];
      writeTable('reviews', reviews);
      return sendJson(res, 201, { ok: true, review: entry });
    }
    if (pathname.startsWith('/api/admin/reviews/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      const reviews = readTable('reviews', DEFAULT_REVIEWS);
      reviews.manual = (reviews.manual || []).filter((r) => r.id !== id);
      writeTable('reviews', reviews);
      return sendJson(res, 200, { ok: true });
    }

    // GET/PUT /api/admin/settings (Google Place ID + API key, kept server-side only)
    if (pathname === '/api/admin/settings' && req.method === 'GET') {
      const settings = readTable('settings', DEFAULT_SETTINGS);
      // never echo the raw API key back in full — show a masked version instead
      return sendJson(res, 200, {
        googlePlaceId: settings.googlePlaceId || '',
        googleApiKeySet: !!settings.googleApiKey,
        siteMessage: settings.siteMessage || '',
      });
    }
    if (pathname === '/api/admin/settings' && req.method === 'PUT') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { error: err.message });
      }
      const settings = readTable('settings', DEFAULT_SETTINGS);
      if (typeof body.googlePlaceId === 'string') settings.googlePlaceId = body.googlePlaceId.trim();
      if (typeof body.googleApiKey === 'string' && body.googleApiKey.trim()) {
        settings.googleApiKey = body.googleApiKey.trim();
      }
      if (typeof body.siteMessage === 'string') settings.siteMessage = body.siteMessage.trim();
      writeTable('settings', settings);
      invalidateCache();
      return sendJson(res, 200, { ok: true });
    }

    // GET /api/admin/leads, PATCH /api/admin/leads/:id (mark read), DELETE
    if (pathname === '/api/admin/leads' && req.method === 'GET') {
      return sendJson(res, 200, readTable('leads', { items: [] }));
    }
    if (pathname.startsWith('/api/admin/leads/') && req.method === 'PATCH') {
      const id = pathname.split('/').pop();
      const leads = readTable('leads', { items: [] });
      const lead = leads.items.find((l) => l.id === id);
      if (lead) lead.read = true;
      writeTable('leads', leads);
      return sendJson(res, 200, { ok: true });
    }
    if (pathname.startsWith('/api/admin/leads/') && req.method === 'DELETE') {
      const id = pathname.split('/').pop();
      const leads = readTable('leads', { items: [] });
      leads.items = leads.items.filter((l) => l.id !== id);
      writeTable('leads', leads);
      return sendJson(res, 200, { ok: true });
    }

    // POST /api/admin/change-password
    if (pathname === '/api/admin/change-password' && req.method === 'POST') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch (err) {
        return sendJson(res, err.statusCode || 400, { error: err.message });
      }
      const admin = readTable('admin', null);
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (!admin || !verifyPassword(currentPassword, admin.passwordHash)) {
        return sendJson(res, 401, { error: 'Current password is incorrect.' });
      }
      if (newPassword.length < 10) {
        return sendJson(res, 400, { error: 'New password must be at least 10 characters.' });
      }
      admin.passwordHash = hashPassword(newPassword);
      writeTable('admin', admin);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: 'Not found.' });
  }

  return null;
}

module.exports = { handleAdminRoute };