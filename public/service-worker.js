const CACHE_NAME = 'plapser-v1';
const STATIC_CACHE = 'plapser-static-v1';
const API_CACHE = 'plapser-api-v1';
const CACHE_TTL = 15 * 60 * 60 * 1000; // 15 часов в миллисекундах
const DB_NAME = 'plapser-cache-metadata';
const DB_VERSION = 1;

// Файлы для кэширования при установке
const STATIC_FILES = [
  '/gui',
  '/searchStudent',
  '/searchTeacher',
  '/stylesheet.css',
  '/gen.js',
  '/manifest.json'
];

// Инициализация IndexedDB
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('cacheMetadata')) {
        db.createObjectStore('cacheMetadata', { keyPath: 'url' });
      }
    };
  });
}

// Сохранение метаданных кэша
async function saveCacheMetadata(url, timestamp) {
  try {
    const db = await openDB();
    const tx = db.transaction('cacheMetadata', 'readwrite');
    const store = tx.objectStore('cacheMetadata');
    await store.put({ url, timestamp, updatedAt: Date.now() });
  } catch (error) {
    console.error('[SW] Error saving cache metadata:', error);
  }
}

// Получение метаданных кэша
async function getCacheMetadata(url) {
  try {
    const db = await openDB();
    const tx = db.transaction('cacheMetadata', 'readonly');
    const store = tx.objectStore('cacheMetadata');
    return new Promise((resolve, reject) => {
      const request = store.get(url);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[SW] Error getting cache metadata:', error);
    return null;
  }
}

// Получение всех метаданных
async function getAllCacheMetadata() {
  try {
    const db = await openDB();
    const tx = db.transaction('cacheMetadata', 'readonly');
    const store = tx.objectStore('cacheMetadata');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[SW] Error getting all cache metadata:', error);
    return [];
  }
}

// Очистка старых записей (FIFO)
async function cleanupOldCache(limitGroups, limitTeachers) {
  try {
    const allMetadata = await getAllCacheMetadata();
    const groups = allMetadata.filter(m => m.url.includes('/gen?group='));
    const teachers = allMetadata.filter(m => m.url.includes('/gen_teach?teacher='));
    
    // Сортируем по времени обновления (старые первыми)
    groups.sort((a, b) => a.updatedAt - b.updatedAt);
    teachers.sort((a, b) => a.updatedAt - b.updatedAt);
    
    // Удаляем лишние
    const groupsToDelete = groups.slice(0, Math.max(0, groups.length - limitGroups));
    const teachersToDelete = teachers.slice(0, Math.max(0, teachers.length - limitTeachers));
    
    const db = await openDB();
    const tx = db.transaction('cacheMetadata', 'readwrite');
    const store = tx.objectStore('cacheMetadata');
    
    for (const item of [...groupsToDelete, ...teachersToDelete]) {
      await store.delete(item.url);
      // Также удаляем из кэша
      const cache = await caches.open(API_CACHE);
      await cache.delete(item.url);
    }
  } catch (error) {
    console.error('[SW] Error cleaning up cache:', error);
  }
}

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
    }).then(() => {
      // Очистка старых записей при активации
      return cleanupOldCache(10, 20);
    })
  );
  return self.clients.claim();
});

// Перехват запросов
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const requestUrl = request.url;

  // API запросы - кэшируем с проверкой сети
  if (url.pathname.startsWith('/gen') || url.pathname.startsWith('/gen_teach') || url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) => {
        return fetch(request)
          .then(async (response) => {
            // Кэшируем успешные ответы
            if (response.status === 200) {
              const responseClone = response.clone();
              await cache.put(request, responseClone);
              // Сохраняем метаданные
              await saveCacheMetadata(requestUrl, Date.now());
              // Очистка старых записей
              const isGroup = requestUrl.includes('/gen?group=');
              await cleanupOldCache(isGroup ? 10 : 0, isGroup ? 0 : 20);
            }
            return response;
          })
          .catch(async () => {
            // Если сеть недоступна, возвращаем из кэша
            const cachedResponse = await cache.match(request);
            if (cachedResponse) {
              // Получаем метаданные
              const metadata = await getCacheMetadata(requestUrl);
              const modifiedHeaders = new Headers(cachedResponse.headers);
              modifiedHeaders.set('X-Offline-Cache', 'true');
              if (metadata && metadata.timestamp) {
                modifiedHeaders.set('X-Cache-Timestamp', metadata.timestamp.toString());
              } else {
                // Если метаданных нет, используем текущее время как fallback
                modifiedHeaders.set('X-Cache-Timestamp', Date.now().toString());
              }
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

// Фоновое обновление кэша
async function backgroundUpdate() {
  if (!self.navigator || !self.navigator.onLine) {
    console.log('[SW] Background update skipped - offline');
    return;
  }

  try {
    // Получаем недавние из cookies (через сообщение клиенту)
    const clients = await self.clients.matchAll();
    if (clients.length === 0) {
      // Если нет клиентов, получаем из IndexedDB все что есть
      const allMetadata = await getAllCacheMetadata();
      const groups = allMetadata.filter(m => m.url.includes('/gen?group=')).slice(0, 12);
      const teachers = allMetadata.filter(m => m.url.includes('/gen_teach?teacher=')).slice(0, 12);
      
      const groupNames = groups.map(g => {
        const url = new URL(g.url, self.location.origin);
        return url.searchParams.get('group');
      }).filter(Boolean);
      
      const teacherNames = teachers.map(t => {
        const url = new URL(t.url, self.location.origin);
        return url.searchParams.get('teacher');
      }).filter(Boolean);
      
      await updateRecentItems(groupNames, teacherNames);
      return;
    }

    // Отправляем запрос на получение недавних
    clients[0].postMessage({ type: 'GET_RECENT_ITEMS' });
  } catch (error) {
    console.error('[SW] Error in background update:', error);
  }
}

// Обработка сообщений от клиента
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    await caches.delete(API_CACHE);
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ success: true });
    }
  }
  
  if (event.data && event.data.type === 'GET_RECENT_ITEMS_RESPONSE') {
    const { recentGroups, recentTeachers } = event.data;
    await updateRecentItems(recentGroups || [], recentTeachers || []);
  }
  
  if (event.data && event.data.type === 'START_BACKGROUND_UPDATE') {
    await updateRecentItems(event.data.recentGroups || [], event.data.recentTeachers || []);
  }
});

// Обновление недавних элементов
async function updateRecentItems(recentGroups, recentTeachers) {
  const cache = await caches.open(API_CACHE);
  const today = new Date().toISOString().split('T')[0];
  
  // Уведомляем клиента о начале обновления
  const clients = await self.clients.matchAll();
  const totalItems = recentGroups.length + recentTeachers.length;
  
  // Обновляем недавние группы (до 12)
  for (const group of recentGroups.slice(0, 12)) {
    try {
      const url = `/gen?group=${encodeURIComponent(group)}&type=json&date=${today}`;
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response.clone());
        await saveCacheMetadata(url, Date.now());
        // Уведомляем клиента
        clients.forEach(client => {
          client.postMessage({ 
            type: 'CACHE_UPDATED', 
            item: group, 
            itemType: 'group',
            total: totalItems
          });
        });
      }
    } catch (error) {
      console.error(`[SW] Error updating group ${group}:`, error);
    }
  }
  
  // Обновляем недавние преподавателей (до 12)
  for (const teacher of recentTeachers.slice(0, 12)) {
    try {
      const url = `/gen_teach?teacher=${encodeURIComponent(teacher)}&type=json&date=${today}`;
      const response = await fetch(url);
      if (response.ok) {
        await cache.put(url, response.clone());
        await saveCacheMetadata(url, Date.now());
        // Уведомляем клиента
        clients.forEach(client => {
          client.postMessage({ 
            type: 'CACHE_UPDATED', 
            item: teacher, 
            itemType: 'teacher',
            total: totalItems
          });
        });
      }
    } catch (error) {
      console.error(`[SW] Error updating teacher ${teacher}:`, error);
    }
  }
  
  // Уведомляем о завершении
  clients.forEach(client => {
    client.postMessage({ 
      type: 'CACHE_UPDATE_COMPLETE'
    });
  });
  
  // Очистка старых записей
  await cleanupOldCache(10, 20);
}

// Периодическое обновление при активации
self.addEventListener('activate', (event) => {
  // Запускаем обновление сразу при активации
  event.waitUntil(backgroundUpdate());
});

// Обновление каждый час через таймер (работает пока Service Worker активен)
let updateTimer = null;

function startPeriodicUpdate() {
  if (updateTimer) clearInterval(updateTimer);
  
  // Обновление каждый час
  updateTimer = setInterval(() => {
    backgroundUpdate();
  }, 60 * 60 * 1000);
  
  // Также обновляем при активации
  backgroundUpdate();
}

// Запускаем периодическое обновление
startPeriodicUpdate();
