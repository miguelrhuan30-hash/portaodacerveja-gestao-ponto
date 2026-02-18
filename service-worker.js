
const CACHE_NAME = 'pdc-v14-fix-upload';
const urlsToCache = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. REGRA DE OURO: Se for para o Firebase Storage, NUNCA toque na requisição.
  // Deixe o navegador lidar com a rede diretamente.
  if (url.hostname.includes('firebasestorage.googleapis.com')) {
    return;
  }

  // 2. Se for POST, PUT ou DELETE, deixe passar direto (não cacheia envio de dados)
  if (event.request.method !== 'GET') {
    return;
  }

  // 3. Apenas requisições GET locais vão para o cache
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => {
        // Se falhar (offline) e for navegação, mostra a home
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
