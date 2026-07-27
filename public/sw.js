const CACHE_NAME = 'muthengi-shell-v2';
const SHELL_FILES = [
  '/',
  '/about.html',
  '/assets/css/style.css',
  '/assets/js/theme-init.js',
  '/assets/js/common.js',
  '/assets/js/main.js',
  '/assets/js/about.js',
  '/assets/img/logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for API calls (content should stay fresh), cache-first for the app shell.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return; // let these hit the network directly
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
