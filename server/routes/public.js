const { readTable, writeTable } = require('../store');
const { sendJson, readJsonBody } = require('../utils/http');
const { rateLimit, clientIp } = require('../security');
const { fetchGoogleReviews } = require('../googleReviews');
const { DEFAULT_CONTENT, DEFAULT_REVIEWS, DEFAULT_SETTINGS } = require('../seeds');

async function handlePublicRoute(req, res, pathname) {
  // GET /api/content — the full public content blob the landing page renders from
  if (pathname === '/api/content' && req.method === 'GET') {
    const content = readTable('content', DEFAULT_CONTENT);
    return sendJson(res, 200, content);
  }

  // GET /api/reviews — merges cached Google reviews with admin-curated manual reviews
  if (pathname === '/api/reviews' && req.method === 'GET') {
    const settings = readTable('settings', DEFAULT_SETTINGS);
    const manual = readTable('reviews', DEFAULT_REVIEWS).manual || [];

    let google = { reviews: [], rating: null, userRatingCount: null, configured: true };
    const result = await fetchGoogleReviews(settings);
    if (!result.ok) {
      google = { reviews: [], rating: null, userRatingCount: null, configured: result.reason !== 'not_configured' };
    } else {
      google = {
        reviews: result.reviews || [],
        rating: result.rating,
        userRatingCount: result.userRatingCount,
        mapsUri: result.mapsUri || null,
        configured: true,
      };
    }

    const manualFormatted = manual.map((r) => ({
      source: 'manual',
      author: r.author,
      rating: r.rating,
      text: r.text,
      relativeTime: r.date || '',
    }));

    return sendJson(res, 200, {
      googleRating: google.rating,
      googleReviewCount: google.userRatingCount,
      googleConfigured: google.configured,
      mapsUri: google.mapsUri || null,
      reviews: [...google.reviews, ...manualFormatted],
    });
  }

  // POST /api/contact — inbound lead form; rate-limited per IP to stop spam floods
  if (pathname === '/api/contact' && req.method === 'POST') {
    const ip = clientIp(req);
    if (!rateLimit(`contact:${ip}`, { windowMs: 60_000, max: 5 })) {
      return sendJson(res, 429, { error: 'Too many requests. Please try again shortly.' });
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendJson(res, err.statusCode || 400, { error: err.message });
    }
    const name = String(body.name || '').trim().slice(0, 200);
    const email = String(body.email || '').trim().slice(0, 200);
    const phone = String(body.phone || '').trim().slice(0, 50);
    const projectType = String(body.projectType || '').trim().slice(0, 100);
    const message = String(body.message || '').trim().slice(0, 2000);

    if (!name || !message || (!email && !phone)) {
      return sendJson(res, 400, { error: 'Name, message, and at least one contact method are required.' });
    }

    const leads = readTable('leads', { items: [] });
    leads.items.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name,
      email,
      phone,
      projectType,
      message,
      receivedAt: new Date().toISOString(),
      read: false,
    });
    // keep the last 500 leads so this file doesn't grow unbounded
    leads.items = leads.items.slice(0, 500);
    writeTable('leads', leads);

    return sendJson(res, 201, { ok: true });
  }

  return null; // not a public route — let the caller try something else
}

module.exports = { handlePublicRoute };
