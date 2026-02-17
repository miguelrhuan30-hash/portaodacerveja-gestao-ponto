
const CACHE_NAME = 'pdc-gestao-v9-style-fix';
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
  const url = event.request.url;

  // CORREÇÃO CRÍTICA: Ignorar requisições para o Firebase (Storage, Firestore, Auth) e Google APIs
  // Isso evita que o Service Worker tente interceptar uploads ou leituras de banco, 
  // o que causava erros de CORS e 'Failed to fetch'.
  if (url.includes('googleapis.com') || url.includes('firebase') || url.includes('firestore')) {
    return; // Sai da função e deixa o navegador tratar a requisição nativamente via rede
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
