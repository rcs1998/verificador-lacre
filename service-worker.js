// Service Worker - Verificador de Lacres Gerdau
// Versão 3.1 - Atualização garantida inclusive no PWA instalado

// ─── IMPORTANTE ───────────────────────────────────────────────
// Este número muda a cada deploy — o browser detecta a mudança
// no arquivo e instala a nova versão automaticamente.
const CACHE_VERSION = 'lacres-v3.1';
const STATIC_CACHE = CACHE_VERSION + '-static';

// Bibliotecas de terceiros que raramente mudam (CDN)
const LIBS_TO_CACHE = [
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@3.9.1'
];

// ─── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando versão:', CACHE_VERSION);
  self.skipWaiting();

  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      cache.addAll(LIBS_TO_CACHE).catch(err =>
        console.warn('[SW] Libs não cacheadas:', err)
      )
    )
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Ativando versão:', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.map(key => {
          if (key !== STATIC_CACHE) {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. index.html / raiz → sempre Network First (cache: no-store)
  const isAppShell =
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/manifest.json') ||
    url.pathname.endsWith('/service-worker.js');

  if (isAppShell) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(cached =>
            cached || caches.match('./offline.html')
          )
        )
    );
    return;
  }

  // 2. Firebase / APIs externas → Network Only
  const isAPI =
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('generativelanguage.googleapis.com') ||
    url.hostname.includes('cloudfunctions.net') ||
    url.hostname.includes('gstatic.com');

  if (isAPI) {
    event.respondWith(
      fetch(request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // 3. CDN → Cache First
  const isCDN =
    url.hostname.includes('cdnjs.cloudflare.com') ||
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
            caches.open(STATIC_CACHE).then(c => c.put(request, response.clone()));
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // 4. Demais → Network First
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          caches.open(STATIC_CACHE).then(c => c.put(request, response.clone()));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(cached =>
          cached || caches.match('./offline.html')
        )
      )
  );
});

// ─── MENSAGENS ────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    console.log('[SW] SKIP_WAITING recebido — ativando agora');
    self.skipWaiting();
  }
});
