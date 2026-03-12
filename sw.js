// sw.js - Service Worker
const CACHE_NAME = 'raspisanie-v1';
const urlsToCache = [
  '/Raspisanie/',
  '/Raspisanie/index.html',
  '/Raspisanie/js/supabase.js',
  '/Raspisanie/js/fullcalendar.js',
  '/Raspisanie/js/fullcalendar-locales.js',
  '/Raspisanie/manifest.json',
  '/Raspisanie/icons/android/icon-72x72.png',
  '/Raspisanie/icons/android/icon-192x192.png'
];

// Установка service worker и кэширование файлов
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Активация и очистка старых кэшей
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Обработка fetch запросов
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Возвращаем из кэша или делаем запрос
        return response || fetch(event.request);
      })
  );
});

// Обработка push-уведомлений
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  console.log('Push received:', data);
  
  const options = {
    body: data.body || 'Напоминание о занятии',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/Raspisanie/',
      lessonId: data.lessonId
    },
    actions: [
      {
        action: 'open',
        title: 'Открыть'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(
      data.title || '📅 Расписание',
      options
    )
  );
});

// Обработка клика по уведомлению
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});
