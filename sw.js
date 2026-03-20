const CACHE_NAME = 'raspisanie-v2';
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
  self.skipWaiting(); // Активировать немедленно
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Активация и очистка старых кэшей
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(), // Захватить всех клиентов сразу
      caches.keys().then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        )
      )
    ])
  );
});

// Обработка fetch запросов
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

// ===== PUSH-УВЕДОМЛЕНИЯ (от сервера) =====
self.addEventListener('push', event => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    const options = {
      body: data.body || 'Напоминание о занятии',
      icon: '/Raspisanie/icons/android/icon-192x192.png',
      badge: '/Raspisanie/icons/android/icon-72x72.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: `lesson-${data.lessonId || Date.now()}`, // tag предотвращает дубли
      renotify: false,
      requireInteraction: false, // не требовать клика (закроется само)
      data: {
        url: data.url || '/Raspisanie/',
        lessonId: data.lessonId
      },
      actions: [
        { action: 'open', title: '📅 Открыть' },
        { action: 'close', title: 'Закрыть' }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || '📅 Расписание', options)
    );
  } catch (error) {
    console.error('Push notification error:', error);
  }
});

// Клик по уведомлению
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'close') return;

  // action === 'open' или просто клик по телу уведомления
  const urlToOpen = event.notification.data?.url || '/Raspisanie/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Если приложение уже открыто — фокусируем вкладку
      for (const client of clientList) {
        if (client.url.includes('/Raspisanie/') && 'focus' in client) {
          return client.focus();
        }
      }
      // Иначе открываем новое окно
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// Закрытие уведомления без клика (необязательный обработчик)
self.addEventListener('notificationclose', _event => {
  // Можно логировать аналитику если нужно
});
