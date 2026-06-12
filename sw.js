const CACHE_NAME = 'raspisanie-v12';
const NEVER_CACHE = [
  'script.google.com',
  'cdn.tailwindcss.com',
  'googleapis.com'
];
const urlsToCache = [
  '/Raspisanie/',
  '/Raspisanie/index.html',
  '/Raspisanie/js/fullcalendar.js',
  '/Raspisanie/js/fullcalendar-locales.js',
  '/Raspisanie/manifest.json',
  '/Raspisanie/icons/android/icon-72x72.png',
  '/Raspisanie/icons/android/icon-192x192.png'
];

// ===== INSTALL =====
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// ===== ACTIVATE =====
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
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

// ===== FETCH =====
self.addEventListener('fetch', event => {
  const url = event.request.url;

  if (NEVER_CACHE.some(domain => url.includes(domain))) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (url.endsWith('/Raspisanie/') || url.endsWith('/Raspisanie/index.html')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

// ===== PUSH (стандартный Web Push — работает когда приложение закрыто) =====
// GAS отправляет POST на ntfy.sh → ntfy доставляет через браузерный Push API →
// SW получает этот event даже если страница закрыта.
self.addEventListener('push', event => {
  let title = '📅 Расписание';
  let body = 'Напоминание о занятии';
  let url = '/Raspisanie/';

  if (event.data) {
    try {
      // ntfy.sh отправляет JSON: { title, message, click, ... }
      const data = event.data.json();
      title = data.title || title;
      body = data.message || data.body || body;
      url = data.click || data.url || url;
    } catch (e) {
      // ntfy иногда шлёт plain text
      body = event.data.text() || body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: '/Raspisanie/icons/android/icon-192x192.png',
      badge: '/Raspisanie/icons/android/icon-72x72.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'lesson-reminder',
      renotify: true,
      requireInteraction: false,
      data: { url: url },
      actions: [
        { action: 'open', title: '📅 Открыть' },
        { action: 'close', title: 'Закрыть' }
      ]
    })
  );
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'close') return;
  const urlToOpen = (event.notification.data && event.notification.data.url) || '/Raspisanie/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('/Raspisanie/') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(urlToOpen);
    })
  );
});

self.addEventListener('notificationclose', function() {});

// ===== СООБЩЕНИЯ ОТ СТРАНИЦЫ =====
self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
  // subscribentfy больше не нужен — polling удалён
});
