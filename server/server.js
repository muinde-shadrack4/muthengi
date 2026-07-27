// server.js — the entire backend runs on Node's built-in http module. No Express,
// no Koa, no Fastify. Routing below is a plain if/else chain over method + pathname.

const http = require('http');
const path = require('path');
const url = require('url');

// Load .env manually (no dotenv package) — every KEY=VALUE line becomes process.env.KEY
require('./loadEnv')();

const { applySecurityHeaders } = require('./security');
const { serveStatic } = require('./utils/http');
const { handlePublicRoute } = require('./routes/public');
const { handleAdminRoute } = require('./routes/admin');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ADMIN_DIR = path.join(__dirname, '..', 'admin');

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);

  const parsed = url.parse(req.url);
  const pathname = decodeURIComponent(parsed.pathname);

  try {
    // --- API routes ---
    if (pathname.startsWith('/api/admin/')) {
      return await handleAdminRoute(req, res, pathname);
    }
    if (pathname.startsWith('/api/')) {
      const handled = await handlePublicRoute(req, res, pathname);
      if (handled !== null) return;
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found' }));
    }

    // --- Admin dashboard static files (served from /admin) ---
    // Bare /admin and /admin/ land on the login screen. Authenticated users are
    // bounced onward to dashboard.html client-side (see admin-auth.js), and
    // dashboard.html itself re-checks auth on load and bounces back to
    // login.html if the session is missing/expired.
    if (pathname === '/admin' || pathname === '/admin/') {
      return serveStatic(req, res, ADMIN_DIR, '/login.html');
    }
    if (pathname.startsWith('/admin/')) {
      return serveStatic(req, res, ADMIN_DIR, pathname.replace('/admin', ''));
    }

    // --- Public site static files ---
    if (pathname === '/') {
      return serveStatic(req, res, PUBLIC_DIR, '/index.html');
    }
    return serveStatic(req, res, PUBLIC_DIR, pathname);
  } catch (err) {
    console.error('[server] Unhandled error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`Muthengi site running at http://localhost:${PORT}`);
  console.log(`Admin dashboard at http://localhost:${PORT}/admin`);
});