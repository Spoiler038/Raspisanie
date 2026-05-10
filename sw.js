const CACHE_NAME = 'raspisanie-v8';
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

let ntfyTopic = null

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(cacheNames =>
        Promise.all(
          cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
        )
      )
    ])
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Никогда не кешируем внешние сервисы
  if (NEVER_CACHE.some(domain => url.includes(domain))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // index.html — всегда свежий с сервера, кеш только как запасной
  if (url.endsWith('/Raspisanie/') || url.endsWith('/Raspisanie/index.html')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Остальное — сначала кеш, потом сеть
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'Напоминание о занятии',
      icon: '/Raspisanie/icons/android/icon-192x192.png',
      badge: '/Raspisanie/icons/android/icon-72x72.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'lesson-' + (data.lessonId || Date.now()),
      renotify: false,
      requireInteraction: false,
      data: { url: data.url || '/Raspisanie/', lessonId: data.lessonId },
      actions: [
        { action: 'open', title: '📅 Открыть' },
        { action: 'close', title: 'Закрыть' }
      ]
    };
    event.waitUntil(
      self.registration.showNotification(data.title || '📅 Расписание', options)
    );
  } catch (error) { console.error('Push error:', error); }
});

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

self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') self.skipWaiting()
  if (event.data && event.data.action === 'subscribentfy') {
    ntfyTopic = event.data.topic
    pollNtfy()
  }
})

async function pollNtfy() {
  if (!ntfyTopic) return
  try {
    const response = await fetch('https://ntfy.sh/' + ntfyTopic + '/json', {
      headers: { 'Accept': 'text/event-stream' }
    })
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      const lines = text.trim().split('\n')
      for (const line of lines) {
        try {
          const msg = JSON.parse(line)
          if (msg.event === 'message') {
            self.registration.showNotification(msg.title || '📅 Расписание', {
              body: msg.message,
              icon: '/Raspisanie/icons/android/icon-192x192.png',
              badge: '/Raspisanie/icons/android/icon-72x72.png',
              vibrate: [200, 100, 200]
            })
          }
        } catch(e) {}
      }
    }
  } catch(e) {
    // Переподключаемся через 30 секунд
    setTimeout(pollNtfy, 30000)
  }
}
