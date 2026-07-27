// auth.js — password hashing + signed session tokens, using only Node's built-in crypto.
// No bcrypt, no jsonwebtoken package: scrypt for hashing, HMAC-SHA256 for token signing.

const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const hashBuffer = Buffer.from(hash, 'hex');
  const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  if (candidate.length !== hashBuffer.length) return false;
  return crypto.timingSafeEqual(candidate, hashBuffer);
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

// Minimal, dependency-free HMAC-signed session token (JWT-shaped, not a full JWT implementation).
function signSession(payload, secret, expiresInSeconds = 60 * 60 * 8) {
  const header = { alg: 'HS256', typ: 'SESSION' };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds };
  const headerPart = base64url(JSON.stringify(header));
  const bodyPart = base64url(JSON.stringify(body));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerPart}.${bodyPart}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${headerPart}.${bodyPart}.${signature}`;
}

function verifySession(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, bodyPart, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${headerPart}.${bodyPart}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let body;
  try {
    body = JSON.parse(base64urlDecode(bodyPart));
  } catch {
    return null;
  }
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
  return body;
}

module.exports = { hashPassword, verifyPassword, signSession, verifySession };
