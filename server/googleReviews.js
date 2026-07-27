// googleReviews.js — pulls reviews from the Google Places API (New) "Place Details" endpoint.
//
// IMPORTANT / a real limitation, not a bug: Google's API only ever returns up to 5 reviews
// per place, chosen by Google as "most relevant" — there is no way to page through all of them
// via API. That's why every section below falls back to admin-entered reviews: the admin can
// always add manually-curated reviews (e.g. copy-pasted from Google) to fill out the section,
// and the two sources are merged for display.
//
// The API key and Place ID are stored server-side only (in data/settings.json) and are never
// sent to the browser — the frontend only ever calls our own /api/reviews endpoint.

const { readTable, writeTable } = require('./store');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // refresh at most once a day
let cache = { fetchedAt: 0, reviews: null, rating: null, userRatingCount: null };

async function fetchGoogleReviews(settings) {
  const { googlePlaceId, googleApiKey } = settings;
  if (!googlePlaceId || !googleApiKey) {
    return { ok: false, reason: 'not_configured' };
  }

  const now = Date.now();
  if (cache.reviews && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { ok: true, cached: true, reviews: cache.reviews, rating: cache.rating, userRatingCount: cache.userRatingCount };
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}?fields=reviews,rating,userRatingCount,displayName,googleMapsUri`;

  try {
    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': googleApiKey,
        'X-Goog-FieldMask': 'reviews,rating,userRatingCount,displayName,googleMapsUri',
      },
    });
    if (!response.ok) {
      const errBody = await response.text();
      console.error('[googleReviews] Google API error:', response.status, errBody);
      return { ok: false, reason: 'api_error', status: response.status };
    }
    const data = await response.json();
    const reviews = (data.reviews || []).map((r) => ({
      source: 'google',
      author: r.authorAttribution?.displayName || 'Google user',
      profilePhoto: r.authorAttribution?.photoUri || null,
      rating: r.rating || null,
      text: r.text?.text || r.originalText?.text || '',
      relativeTime: r.relativePublishTimeDescription || '',
      publishTime: r.publishTime || null,
    }));
    cache = {
      fetchedAt: now,
      reviews,
      rating: data.rating || null,
      userRatingCount: data.userRatingCount || null,
      mapsUri: data.googleMapsUri || null,
    };
    return { ok: true, cached: false, ...cache };
  } catch (err) {
    console.error('[googleReviews] fetch failed:', err.message);
    return { ok: false, reason: 'network_error' };
  }
}

function invalidateCache() {
  cache = { fetchedAt: 0, reviews: null, rating: null, userRatingCount: null };
}

module.exports = { fetchGoogleReviews, invalidateCache };
