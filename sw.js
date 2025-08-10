const CACHE_NAME = 'my-islamic-app-v3';
const FILES_TO_CACHE = [
  './',
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
  './icons/prophets.svg'
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
  evt.respondWith(
    caches.match(evt.request).then((r) => {
      return r || fetch(evt.request).catch(()=>caches.match('./index.html'));
    })
  );
});
