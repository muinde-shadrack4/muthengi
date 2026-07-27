// security.js — cookie helpers, CSRF (double-submit cookie), a simple in-memory
// sliding-window rate limiter, and the security headers we'd normally get from helmet.

const crypto = require('crypto');

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

// Cookies only get the Secure flag when actually running over HTTPS (set FORCE_HTTPS=true
// in .env once deployed behind TLS). Locally over plain http, Secure cookies would be silently
// dropped by most browsers, breaking login — so default to false unless explicitly enabled.
const COOKIES_SECURE = process.env.FORCE_HTTPS === 'true';

function setCookie(res, name, value, { httpOnly = true, maxAge, sameSite = 'Strict', secure = COOKIES_SECURE, path = '/' } = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) cookie += '; HttpOnly';
  if (secure) cookie += '; Secure';
  if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;
  const existing = res.getHeader('Set-Cookie');
  if (existing) {
    res.setHeader('Set-Cookie', Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]);
  } else {
    res.setHeader('Set-Cookie', cookie);
  }
}

function clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);
}

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function verifyCsrf(req, cookies) {
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = cookies['csrf_token'];
  if (!headerToken || !cookieToken) return false;
  const a = Buffer.from(String(headerToken));
  const b = Buffer.from(String(cookieToken));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Sliding-window-ish rate limiter: tracks request timestamps per key (usually IP + route).
// Fine for a single-process deploy; for multi-instance deploys, move this to Redis.
const buckets = new Map();

function rateLimit(key, { windowMs = 60_000, max = 20 } = {}) {
  const now = Date.now();
  const bucket = buckets.get(key) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(key, recent);
  return recent.length <= max;
}

// Periodically clear old buckets so this Map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of buckets.entries()) {
    const recent = times.filter((t) => now - t < 10 * 60_000);
    if (recent.length === 0) buckets.delete(key);
    else buckets.set(key, recent);
  }
}, 5 * 60_000).unref();

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0'); // modern browsers rely on CSP instead
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
}

module.exports = {
  parseCookies,
  setCookie,
  clearCookie,
  generateCsrfToken,
  verifyCsrf,
  rateLimit,
  clientIp,
  applySecurityHeaders,
};
