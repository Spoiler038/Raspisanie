const CACHE_NAME = 'raspisanie-v11';
const NTFY_CACHE = 'ntfy-config';
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

// ===== ПЕРСИСТЕНТНОЕ ХРАНЕНИЕ NTFY TOPIC =====
// Используем Cache API вместо переменной в памяти —
// переменная в памяти SW сбрасывается при засыпании.

async function getNtfyTopic() {
  try {
    const cache = await caches.open(NTFY_CACHE);
    const res = await cache.match('/ntfy-topic');
    if (!res) return null;
    return await res.text();
  } catch (e) {
    return null;
  }
}

async function setNtfyTopic(topic) {
  try {
    const cache = await caches.open(NTFY_CACHE);
    await cache.put('/ntfy-topic', new Response(topic));
  } catch (e) {
    console.error('Ошибка сохранения ntfy topic:', e);
  }
}

// ===== INSTALL =====
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// ===== ACTIVATE =====
// При активации SW восстанавливаем ntfy polling —
// это срабатывает после обновления SW и при первом запуске.
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Удаляем старые кеши (кроме ntfy-config)
      caches.keys().then(cacheNames =>
        Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME && name !== NTFY_CACHE)
            .map(name => caches.delete(name))
        )
      ),
      // Восстанавливаем polling после перезапуска SW
      getNtfyTopic().then(topic => {
        if (topic) {
          console.log('SW активирован, восстанавливаем ntfy polling для:', topic);
          startPollNtfy(topic);
        }
      })
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

// ===== PUSH (стандартный Web Push) =====
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
  } catch (error) {
    console.error('Push error:', error);
  }
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

  if (event.data.action === 'subscribentfy') {
    const topic = event.data.topic;
    setNtfyTopic(topic).then(() => {
      startPollNtfy(topic);
    });
  }
});

// ===== NTFY POLLING =====
// startPollNtfy — точка входа, вызывается при активации SW и из message-обработчика.
// pollNtfy — рекурсивная функция с переподключением.

let _ntfyPolling = false; // защита от двойного запуска

function startPollNtfy(topic) {
  if (_ntfyPolling) return; // уже запущен
  _ntfyPolling = true;
  pollNtfy(topic);
}

async function pollNtfy(topic) {
  if (!topic) {
    topic = await getNtfyTopic();
    if (!topic) {
      _ntfyPolling = false;
      return;
    }
  }

  try {
    const response = await fetch('https://ntfy.sh/' + topic + '/json', {
      headers: { 'Accept': 'text/event-stream' }
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.event === 'message') {
            self.registration.showNotification(msg.title || '📅 Расписание', {
              body: msg.message,
              icon: '/Raspisanie/icons/android/icon-192x192.png',
              badge: '/Raspisanie/icons/android/icon-72x72.png',
              vibrate: [200, 100, 200],
              data: { url: '/Raspisanie/' }
            });
          }
        } catch (e) {
          // Игнорируем битые строки
        }
      }
    }

    // Поток закрылся — переподключаемся
    _ntfyPolling = false;
    setTimeout(() => startPollNtfy(topic), 5000);

  } catch (e) {
    console.error('ntfy polling ошибка:', e.message);
    _ntfyPolling = false;
    // Переподключаемся через 30 секунд при ошибке сети
    setTimeout(() => startPollNtfy(topic), 30000);
  }
}
