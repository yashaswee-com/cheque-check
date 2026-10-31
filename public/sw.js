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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Leave cross-origin (Turnstile, Supabase, telemetry), non-GET and
  // navigation requests to the browser so a failed fetch is never turned
  // into a rejected FetchEvent.
  if (
    request.method !== 'GET' ||
    request.mode === 'navigate' ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }
  event.respondWith(fetch(request).catch(() => Response.error()));
});
