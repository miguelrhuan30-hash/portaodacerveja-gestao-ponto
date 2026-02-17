const CACHE_NAME = 'pdc-gestao-v10-final-fix'; // Mudei a versão para forçar atualização
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Instalação: Cacheia arquivos estáticos
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Força o novo SW a assumir imediatamente
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Cache aberto');
      return cache.addAll(urlsToCache);
    })
  );
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // Toma controle das abas imediatamente
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Limpando cache antigo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
    ])
  );
});

// Fetch: A Lógica de Interceptação (AQUI ESTAVA O ERRO)
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // 1. REGRA DE OURO: Se não for GET, não cacheia (Uploads são POST)
  if (event.request.method !== 'GET') {
    return; // Deixa o navegador lidar com isso (vai direto pra rede)
  }

  // 2. REGRA DE PRATA: Ignora URLs do Firebase/Google
  if (requestUrl.hostname.includes('googleapis.com') || 
      requestUrl.hostname.includes('firebase') || 
      requestUrl.hostname.includes('firestore')) {
    return; // Não toca nessas requisições
  }

  // 3. Regra para arquivos do próprio site
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - retorna resposta do cache
      if (response) {
        return response;
      }
      // Se não tem no cache, busca na rede
      return fetch(event.request).catch(() => {
        // Se falhar e for navegação (ex: sem internet), mostra a home
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});