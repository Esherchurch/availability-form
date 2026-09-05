/* ===================================================================
   Mix Builder — service worker
   ===================================================================

   The suite's existing sw.js is network-only: it passes every request
   through and returns "Offline - please reconnect" when that fails, so
   it provides no offline capability at all. This one actually caches.

   Why it matters here beyond convenience: the whole project lives in
   IndexedDB in this browser, and IndexedDB is blocked on file://. So
   without a service worker there is no way to open your own saved
   project without a network connection — the audio is all local, the
   project is all local, and the only thing you would be waiting on is
   four files that never change.

   Strategy:
     - App shell (this page and its three modules): cache-first, with a
       background refresh so a new version lands on the next visit.
     - Fonts: cache-first, kept forever. They are versioned by URL.
     - Everything else: network, falling back to cache.

   Bump VERSION to force every client onto new code.
   =================================================================== */

const VERSION = 'mix-1';
const SHELL = 'mix-shell-' + VERSION;
const RUNTIME = 'mix-runtime-' + VERSION;

const SHELL_FILES = [
  './mix-builder.html',
  './mix-dsp.js',
  './mix-project.js',
  './mix-render.js',
  './mix-ui.js',
  './manifest-mix.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL)
      // Individually, so one 404 does not abandon the whole install.
      .then(c => Promise.all(SHELL_FILES.map(f => c.add(f).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('mix-') && k !== SHELL && k !== RUNTIME)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isFont = /fonts\.(googleapis|gstatic)\.com/.test(url.hostname);
  const isShell = url.origin === self.location.origin &&
                  SHELL_FILES.some(f => url.pathname.endsWith(f.replace('./', '')));

  if (isShell) {
    // Cache-first so the page opens instantly and offline, but refresh in the
    // background so an update is never more than one visit away.
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => {
          if (res && res.ok) caches.open(SHELL).then(c => c.put(req, res.clone()));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  if (isFont) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        // Opaque cross-origin responses cache fine and are all we need here.
        caches.open(RUNTIME).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => hit))
    );
    return;
  }

  e.respondWith(fetch(req).catch(() => caches.match(req)));
});

/* The page asks for this after an update so it can tell the user without
   guessing at cache state. */
self.addEventListener('message', e => {
  if (e.data === 'version' && e.source) e.source.postMessage({ version: VERSION });
  if (e.data === 'skipWaiting') self.skipWaiting();
});
