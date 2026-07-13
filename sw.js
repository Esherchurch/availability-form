// EGBC Service Worker - minimal for PWA installability
const CACHE_NAME = 'egbc-v1';

self.addEventListener('install', e => {
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
    // Pass through all requests - no caching needed
    e.respondWith(fetch(e.request).catch(() => {
        return new Response('Offline - please reconnect', { status: 503 });
    }));
});
