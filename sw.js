const CACHE_NAME = 'my-islamic-app-v4';
const FILES_TO_CACHE = [
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './data/hadiths.json',
  './data/duas.json',
  './data/quran_surahs.json',
  './data/prophet_stories.json',
  './icons/home.svg',
  './icons/quran.svg',
  './icons/hadith.svg',
  './icons/prophets.svg',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  const { request } = evt;
  const url = new URL(request.url);

  // Bypass non-GET
  if (request.method !== 'GET') {
    return;
  }

  // For same-origin navigation requests, use cache-first then network fallback
  if (request.mode === 'navigate') {
    evt.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(request))
    );
    return;
  }

  // For JSON and API requests, use network-first with cache fallback
  if (request.headers.get('accept')?.includes('application/json') || url.pathname.endsWith('.json')) {
    evt.respondWith(
      fetch(request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return resp;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // For static assets, use cache-first with network fallback
  evt.respondWith(
    caches.match(request).then((r) => r || fetch(request))
  );
});
