const CACHE_NAME = 'pdc-gestao-v13-fix';
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

  // 1. IGNORAR UPLOADS (POST, PUT, DELETE) - Deixa passar para a internet
  if (event.request.method !== 'GET') {
    return;
  }

  // 2. IGNORAR FIREBASE E GOOGLE APIS
  if (requestUrl.hostname.includes('googleapis.com') || 
      requestUrl.hostname.includes('firebase')) {
    return;
  }

  // 3. Cache First para arquivos estáticos locais
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