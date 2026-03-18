// Service Worker para PWA - Suporte Offline e Cache
const CACHE_NAME = 'lacres-gerdau-v1';
const RUNTIME_CACHE = 'lacres-gerdau-runtime-v1';
const OFFLINE_PAGE = '/offline.html';

// URLs que devem ser sempre cacheadas
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/axios@1.7.2/dist/axios.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js'
];

// Instalar Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker instalado');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Cache criado:', CACHE_NAME);
      // Tentar cachear assets estáticos, mas não falhar se algum não estiver disponível
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('Não foi possível cachear:', url, err.message);
        }))
      );
    })
  );
  self.skipWaiting();
});

// Ativar Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker ativado');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptar requisições
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requisições não-GET
  if (request.method !== 'GET') {
    return;
  }

  // Ignorar requisições para Firebase Realtime Database
  if (url.hostname.includes('firebaseio.com')) {
    return;
  }

  // Estratégia: Cache First para assets estáticos
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(response => {
        return response || fetch(request).then(response => {
          // Cachear a resposta para uso futuro
          if (response && response.status === 200) {
            const cache = caches.open(CACHE_NAME);
            cache.then(c => c.put(request, response.clone()));
          }
          return response;
        });
      }).catch(() => {
        // Se falhar, retornar página offline
        return caches.match(OFFLINE_PAGE) || new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // Estratégia: Network First para APIs (Firebase, EmailJS)
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cachear respostas bem-sucedidas
        if (response && response.status === 200) {
          const cache = caches.open(RUNTIME_CACHE);
          cache.then(c => c.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => {
        // Se falhar, tentar cache
        return caches.match(request).then(response => {
          return response || new Response(
            JSON.stringify({ error: 'Offline - dados em cache podem estar desatualizados' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        });
      })
  );
});

// Função auxiliar para verificar se é um asset estático
function isStaticAsset(url) {
  const staticExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf'];
  const path = url.pathname;
  return staticExtensions.some(ext => path.endsWith(ext)) || 
         url.hostname.includes('cdn.jsdelivr.net') ||
         url.hostname.includes('gstatic.com');
}

// Sincronização em Background (quando voltar online)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-processos') {
    event.waitUntil(
      // Sincronizar dados locais com servidor
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_PROCESSOS',
            message: 'Sincronizando dados com servidor...'
          });
        });
      })
    );
  }
});

// Notificações Push
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || 'Nova notificação',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%231B3A6B" width="192" height="192"/><text x="50%" y="50%" font-size="80" font-weight="bold" fill="%23F5A623" text-anchor="middle" dominant-baseline="central">🔐</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect fill="%231B3A6B" width="96" height="96"/><text x="50%" y="50%" font-size="50" fill="%23F5A623" text-anchor="middle" dominant-baseline="central">🔐</text></svg>',
    tag: data.tag || 'lacres-notificacao',
    requireInteraction: data.requireInteraction || false,
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Fechar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Gerdau - Lacres', options)
  );
});

// Clique em notificação
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        // Procurar por uma aba já aberta
        for (let client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Se não encontrar, abrir nova aba
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Mensagens do cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
