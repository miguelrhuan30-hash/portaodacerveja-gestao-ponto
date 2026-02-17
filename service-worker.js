
const CACHE_NAME = 'pdc-gestao-v12-cors-fix';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // REGRA 1: Ignora qualquer requisição que não seja GET (Uploads são POST)
  if (event.request.method !== 'GET') return;

  // REGRA 2: Ignora URLs externas (Firebase, Google, API)
  if (requestUrl.hostname.includes('googleapis.com') || 
      requestUrl.hostname.includes('firebase')) {
    return;
  }

  // REGRA 3: Cache First para arquivos locais
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
