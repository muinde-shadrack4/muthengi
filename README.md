# Muthengi Building & Construction Engineers — Site + Admin

A PWA landing site with an admin-controlled content system and Google Reviews integration.

**Stack, deliberately minimal:**
- Backend: pure Node.js (`http` module only — no Express, no framework of any kind)
- Storage: JSON files under `/data` (atomic writes, zero DB dependency)
- Auth: `crypto.scrypt` password hashing + hand-rolled HMAC-signed session tokens (no bcrypt, no jsonwebtoken package)
- Security: CSRF (double-submit cookie), per-IP rate limiting, manually-set security headers (CSP, X-Frame-Options, etc.) — the same protections `helmet` gives you, just written by hand
- Frontend: vanilla HTML/CSS/JS, no build step, no framework
- `package.json` has **zero runtime dependencies**

## Running it

```bash
cd muthengi
cp .env.example .env
```

Edit `.env` and set `SESSION_SECRET` to a long random string:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Then:

```bash
npm start
```

- Public site: http://localhost:3000
- Admin dashboard: http://localhost:3000/admin

The **first time** you open `/admin`, it will ask you to create the one admin account (username + password, 10+ characters). After that it locks itself — no one can create a second admin through the API, so guard that first login.

## What's on the public site

- **Home** (`/`) — hero, services, stats, portfolio gallery, testimonial, Google + client reviews, contact form.
- **About** (`/about.html`) — story, "how we work," and a site-values grid. Same header/footer/nav as the home page.
- **Dark / light mode** — toggle button in the header (moon/sun icon). Remembers the visitor's choice in their browser and otherwise follows their system preference. The hero/stats/contact/footer bands stay the same brand-dark color in both modes on purpose; it's the lighter body sections that flip.
- **Hero background slideshow** — if you add photos in the admin (Home Page → Hero), they slowly cross-fade behind the hero text (Ken Burns style). With none added, it falls back to a plain blueprint-grid pattern — never a broken image.

## What the admin can control

From `/admin` → **Home Page**: brand name/logo, hero text/buttons + background slideshow photos, the "what we do" stat numbers, services cards, portfolio gallery photos, the testimonial quote, contact details, and footer text.

From **About Page**: the banner, story/approach text, photo, and the site-values cards.

From **Reviews**: add/delete manually-curated client reviews, which are merged with live Google reviews on the public site.

From **Leads**: every contact-form submission lands here, newest first, with a "mark read" flag.

From **Settings**: connect Google Reviews, and change the admin password.

Every save goes live immediately — no rebuild step, no redeploy. To swap the logo, drop the new file into `public/assets/img/`, then point the **Logo URL** field (Home Page tab → Brand) at it.

## Setting up Google Reviews

Google's API has a hard limit worth knowing up front: **it only ever returns up to 5 reviews per business**, chosen by Google as "most relevant" — there's no way to page through the rest via API, only through Google Maps itself. That's why the Reviews tab lets you add manually-curated reviews too; the site merges both.

To connect the live Google reviews:

1. **Get your Place ID.** Search for "Muthengi Building & Construction Engineers" (or your actual registered business name) using Google's [Place ID Finder](https://developers.google.com/maps/documentation/places/web-service/place-id). If your business isn't showing up yet, claim/create it first at [Google Business Profile](https://www.google.com/business/) — this is also what lets clients actually leave you reviews and puts you on Google Maps.
2. **Create an API key.** In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create a project (if you don't have one), enable the **Places API (New)**, then create an API key. Restrict it to your server's IP address (or "API restrictions" → Places API (New) only) so the key can't be abused if it ever leaks.
3. In `/admin` → **Settings**, paste in the Place ID and API key, and save.

The server caches Google's response for 24 hours, so you won't burn through API quota, and the key itself is never sent to the browser — the public page only ever talks to our own `/api/reviews` endpoint.

## Project layout

```
server/           raw Node backend
  server.js       entry point / router
  routes/
    public.js     GET /api/content, GET /api/reviews, POST /api/contact
    admin.js      auth + all /api/admin/* routes
  store.js        JSON-file datastore
  auth.js         password hashing + session tokens
  security.js     CSRF, rate limiting, headers, cookies
  googleReviews.js  Google Places API client + cache
public/           the public site (served at /)
admin/            the admin dashboard (served at /admin)
data/             created at runtime — content.json, reviews.json, settings.json,
                  admin.json, leads.json. Back this folder up; it's your entire database.
```

## Deploying

This needs nothing more than a machine that can run `node server/server.js` and stay up — a small VPS (e.g. DigitalOcean, Hetzner) works well since there's no build pipeline. Put it behind a reverse proxy (Caddy is the easiest — it gets you free HTTPS automatically) and once HTTPS is live, set `FORCE_HTTPS=true` in `.env` so cookies get the `Secure` flag. Use something like `pm2` or a `systemd` service to keep the Node process running and restart it on crash/reboot.

Back up the `/data` folder regularly — it's the only state the whole site has.
# muthengi
