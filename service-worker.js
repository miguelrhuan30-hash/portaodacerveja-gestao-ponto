
const CACHE_NAME = 'pdc-vfinal-bucket-fix'
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  // Força o SW a ativar imediatamente, pulando a espera
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // Toma controle imediato de todas as abertas
      // Limpa caches antigos que não batem com o nome atual
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deletando cache antigo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', event => {
  // NOVA REGRA: Ignorar requisições para o Firebase Storage (Uploads/Downloads de mídia)
  // Isso evita erros de CORS e problemas com uploads grandes interceptados pelo SW
  if (event.request.url.includes('firebasestorage.googleapis.com')) {
    return; // Sai da função e deixa o navegador tratar a requisição nativamente
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
