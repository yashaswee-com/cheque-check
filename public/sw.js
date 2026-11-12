// Service Worker for ChequeCheck
const OFFLINE_CACHE_PREFIX = 'cheque-check-offline-';
const OFFLINE_CACHE = `${OFFLINE_CACHE_PREFIX}v2`;
const OFFLINE_ASSETS = ['/offline.html', '/offline.js'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    await cache.addAll(OFFLINE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(OFFLINE_CACHE_PREFIX) && key !== OFFLINE_CACHE)
      .map((key) => caches.delete(key)));
    await clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/offline.js') {
    event.respondWith((async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      return (await cache.match('/offline.js')) || fetch(request);
    })());
    return;
  }
  // Never intercept API calls, assets, or Next.js RSC/prefetch requests.
  if (request.mode !== 'navigate' || /^\/(?:api|monitoring|_next)(?:\/|$)/.test(url.pathname)) return;
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch (error) {
      if (request.signal.aborted) throw error;
      const cache = await caches.open(OFFLINE_CACHE);
      const fallback = await cache.match('/offline.html');
      if (fallback) return fallback;
      console.error('Offline fallback is unavailable');
      throw error;
    }
  })());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (error) {
    console.error('Invalid push payload', error);
  }
  const language = data && data.language;
  const body = language === 'hi' ? 'आपकी नई सूचना है। ऐप खोलकर देखें।' :
    language === 'hi-en' ? 'Aapki nayi notification hai. App kholkar dekhein.' :
    'You have a new notification. Open the app to view it.';
  const id = data && typeof data.inboxId === 'string' && /^\d{1,19}$/.test(data.inboxId) ? data.inboxId : 'new';
  event.waitUntil(self.registration.showNotification('ChequeCheck', {
    body, icon: '/android-chrome-192x192.png', badge: '/favicon-32x32.png',
    tag: `inbox-${id}`, data: { url: '/notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Never navigate to a URL supplied in a push payload or external origin.
  const target = new URL('/notifications', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target);
        await client.focus();
        return;
      }
    }
    await clients.openWindow(target);
  })());
});
