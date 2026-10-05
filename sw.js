const CACHE_NAME = 'raspisanie-v13';
const NEVER_CACHE = [
  'script.google.com',
  'cdn.tailwindcss.com',
  'googleapis.com'
];
const urlsToCache = [
  '/Raspisanie/',
  '/Raspisanie/index.html',
  '/Raspisanie/js/tailwind.js',
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

  // GAS и внешние CDN — всегда в сеть, без кеша
  if (NEVER_CACHE.some(domain => url.includes(domain))) {
    return;
  }

  // ⭐ Навигация (открытие страницы) — Network-first с надёжным fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(cached => cached || caches.match('/Raspisanie/index.html'))
            .then(fallback => fallback || new Response(
              '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Офлайн</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;"><h1>📴 Нет соединения</h1><p>Приложение не загружено. Подключитесь к интернету и обновите страницу.</p></body></html>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            ));
        })
    );
    return;
  }

  // ⭐ Остальные запросы — Cache-first с фоновым обновлением
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Обновляем в фоне
        fetch(event.request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response));
          }
        }).catch(() => {});
        return cached;
      }
      // Нет в кеше — пробуем сеть
      return fetch(event.request).catch(() => {
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// ===== PUSH =====
self.addEventListener('push', event => {
  let title = '📅 Расписание';
  let body = 'Напоминание о занятии';
  let url = '/Raspisanie/';

  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title || title;
      body = data.message || data.body || body;
      url = data.click || data.url || url;
    } catch (e) {
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
});
