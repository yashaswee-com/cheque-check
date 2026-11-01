// Service Worker for ChequeCheck
// This file is currently minimal to satisfy PWA installability requirements.
// It can be extended later with caching strategies.

const CACHE_NAME = 'cheque-check-v1';

self.addEventListener('install', (event) => {
  // Use skipWaiting to ensure the new service worker takes over immediately
  self.skipWaiting();
  console.log('Service Worker: Installed');
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activated');
  // Clean up old caches if needed in the future
  event.waitUntil(clients.claim());
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

// No fetch handler: without a caching strategy, intercepting requests only
// turns aborted or failed fetches (RSC prefetches, Turnstile, Supabase) into
// FetchEvent network errors. Add one only alongside a real caching strategy.
