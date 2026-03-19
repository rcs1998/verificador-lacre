// Service Worker - Verificador de Lacres Gerdau
// Versão 3.0 - Auto-atualização garantida

// Mude este número toda vez que fizer deploy de uma nova versão
const CACHE_VERSION = 'lacres-v3';

const STATIC_CACHE = CACHE_VERSION + '-static';

// Recursos estáticos de terceiros (bibliotecas que não mudam)
const LIBS_TO_CACHE = [
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@3.9.1'
];

// ─── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', event => {
  // skipWaiting: o novo SW entra imediatamente, sem esperar fechar todas as abas
  self.skipWaiting();

  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(LIBS_TO_CACHE).catch(err => {
        console.warn('[SW] Alguns recursos de terceiros não cacheados:', err);
      });
    })
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          // Apaga todos os caches que não sejam da versão atual
          if (key !== STATIC_CACHE) {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      )
    ).then(() => {
      // Assume controle de todas as abas abertas imediatamente
      return self.clients.claim();
    })
  );
});

// ─── FETCH ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ── 1. index.html e manifest.json → sempre Network First ──
  // Garante que o usuário sempre veja a versão mais recente do app
  const isAppShell = url.pathname.endsWith('/') ||
                     url.pathname.endsWith('/index.html') ||
                     url.pathname.endsWith('/manifest.json');

  if (isAppShell) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Atualiza o cache com a versão mais recente
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Sem internet: serve do cache (modo offline)
          return caches.match(request).then(cached => {
            return cached || caches.match('./offline.html');
          });
        })
    );
    return;
  }

  // ── 2. Firebase / APIs externas → Network First, sem cache ──
  const isExternalAPI = url.hostname.includes('firebaseio.com') ||
                        url.hostname.includes('firestore.googleapis.com') ||
                        url.hostname.includes('identitytoolkit.googleapis.com') ||
                        url.hostname.includes('generativelanguage.googleapis.com') ||
                        url.hostname.includes('firebase') ||
                        url.hostname.includes('gstatic.com');

  if (isExternalAPI) {
    event.respondWith(fetch(request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // ── 3. Bibliotecas de terceiros (CDN) → Cache First ──────────
  const isCDN = url.hostname.includes('cdnjs.cloudflare.com') ||
                url.hostname.includes('cdn.jsdelivr.net') ||
                url.hostname.includes('fonts.googleapis.com') ||
                url.hostname.includes('fonts.gstatic.com') ||
                url.hostname.includes('unpkg.com');

  if (isCDN) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(c => c.put(request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // ── 4. Demais recursos → Network First ───────────────────────
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(c => c.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then(c => c || caches.match('./offline.html')))
  );
});

// ─── MENSAGENS DO CLIENTE ─────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
