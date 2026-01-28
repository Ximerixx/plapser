const CACHE_NAME = 'plapser-v1';
const STATIC_CACHE = 'plapser-static-v1';
const API_CACHE = 'plapser-api-v1';

// Файлы для кэширования при установке
const STATIC_FILES = [
  '/gui',
  '/searchStudent',
  '/searchTeacher',
  '/stylesheet.css',
  '/gen.js',
  '/manifest.json'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[Service Worker] Caching static files');
      return cache.addAll(STATIC_FILES.map(url => new Request(url, { credentials: 'same-origin' })));
    })
  );
  self.skipWaiting();
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== API_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API запросы - кэшируем с проверкой сети
  if (url.pathname.startsWith('/gen') || url.pathname.startsWith('/gen_teach') || url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) => {
        return fetch(request)
          .then((response) => {
            // Кэшируем успешные ответы
            if (response.status === 200) {
              const responseClone = response.clone();
              cache.put(request, responseClone);
            }
            return response;
          })
          .catch(() => {
            // Если сеть недоступна, возвращаем из кэша
            return cache.match(request).then((cachedResponse) => {
              if (cachedResponse) {
                // Добавляем заголовок, что данные из кэша
                const modifiedHeaders = new Headers(cachedResponse.headers);
                modifiedHeaders.set('X-Offline-Cache', 'true');
                return new Response(cachedResponse.body, {
                  status: cachedResponse.status,
                  statusText: cachedResponse.statusText,
                  headers: modifiedHeaders
                });
              }
              // Если нет в кэше, возвращаем ошибку
              return new Response(
                JSON.stringify({ error: 'Нет подключения к интернету и данные не найдены в кэше' }),
                {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
          });
      })
    );
    return;
  }

  // Статические файлы - стратегия "Cache First"
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
  }
});

// Сообщение от клиента для очистки кэша
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(API_CACHE).then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
});
