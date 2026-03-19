// Service Worker - Verificador de Lacres Gerdau
// Versão 2.0 - Com suporte offline melhorado

const CACHE_NAME = 'lacres-v2';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './offline.html',
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@3.9.1',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker instalado');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache aberto');
      return cache.addAll(URLS_TO_CACHE).catch(err => {
        console.warn('Alguns arquivos não puderam ser cacheados:', err);
        // Continua mesmo se alguns arquivos falharem
      });
    })
  );
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker ativado');
  event.waitUntil(
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
  );
  self.clients.claim();
});

// Estratégia de Fetch: Network First, Fall back to Cache, then Offline Page
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requisições não-GET
  if (request.method !== 'GET') {
    return;
  }

  // Para requisições de API (Firebase), usar Network First
  if (url.hostname.includes('firebaseio.com') || url.hostname.includes('googleapis.com')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cachear respostas bem-sucedidas
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Se falhar, tentar cache
          return caches.match(request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Se nada estiver em cache, retornar página offline
            return caches.match('./offline.html');
          });
        })
    );
    return;
  }

  // Para outros recursos (CSS, JS, imagens), usar Cache First
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(request)
          .then(response => {
            // Não cachear respostas inválidas
            if (!response || response.status !== 200 || response.type === 'error') {
              return response;
            }
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
            return response;
          })
          .catch(() => {
            // Se falhar, retornar página offline
            return caches.match('./offline.html');
          });
      })
  );
});

// Sincronização em background (quando a internet voltar)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // Notificar o cliente para sincronizar dados pendentes
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_DATA',
            message: 'Conexão restaurada. Sincronizando dados...'
          });
        });
      })
    );
  }
});
