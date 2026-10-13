/* Phone notifications (FINDINGS-notify N-5): the events window's part,
   so there is still ONE service worker on the v2 scope. */
importScripts('egbc-notify-sw.js');
const VERSION = '3';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });
self.addEventListener('fetch', e => {
    e.respondWith(fetch(e.request).catch(() => {
        return new Response('Offline - please reconnect', { status: 503 });
    }));
});
