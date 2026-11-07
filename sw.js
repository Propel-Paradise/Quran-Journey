// Service worker: makes the app installable and lets pages open on a weak connection.
// Always tries the network first so updates show up right away; falls back to the cache.
// Only this site's own files are cached. Supabase, Stripe and CDN requests are never touched.
const CACHE = 'quran-journey-v1.9';
const SHELL = [
  './', 'index.html', 'school.html', 'parent.html', 'join.html', 'register.html',
  'reactivate.html', 'reset-password.html', 'change-password.html', '404.html',
  'style.css', 'config.js', 'index.js', 'school.js', 'parent.js', 'manifest.json',
  'mobile.css', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});
