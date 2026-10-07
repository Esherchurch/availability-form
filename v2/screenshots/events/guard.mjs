/* The network guard every events-window browser test uses.
   Events window. Learned from the main window (7 Oct 2026), which found
   real members' data coming back through a harness that only blocked a list
   of known hosts.

   Three rules:
   1. ALLOW, don't block. Only localhost and the public script and font
      sites the pages load from may be reached. Everything else is refused,
      whatever it is - a list of hosts to refuse is only as good as its
      author's memory.
   2. NO SERVICE WORKER. Several pages register sw.js, which passes every
      request straight through. A service worker fetches in its own context,
      out of reach of a page's interception, and covers the whole origin
      once any page has registered it. So register() is stubbed before any
      page script runs.
   3. A REPLY IS A LEAK, AN ATTEMPT IS NOT. Every response is checked too.
      One from anywhere outside the allowlist is recorded, and the test
      that owns the page must fail the run on it (guard.leaks()). */

const ALLOWED = new Set(['localhost', '127.0.0.1',
  'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
  'cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com']);

/* The page header's logo lives in the live storage bucket. Rather than
   reach it, or leave a broken picture in every screenshot, that one
   request is answered with the app icon from this repo. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ICON = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'icon-192.png'));
const LOGO_PATH = '/v0/b/egbc-worship-planner.firebasestorage.app/o/copilot_image_1775806874083.jpeg';

function hostOf(url) {
  try { const u = new URL(url); return /^(https?|wss?):$/.test(u.protocol) ? u.hostname : null; }
  catch (e) { return null; }
}

export function createGuard() {
  const refused = [], leaks = [], stoodIn = new Set();
  async function protect(page, label) {
    await page.evaluateOnNewDocument(() => {
      try {
        if (navigator.serviceWorker) {
          Object.defineProperty(navigator.serviceWorker, 'register', {
            value: () => Promise.reject(new Error('service worker disabled in tests')), configurable: true });
        }
      } catch (e) {}
    });
    await page.setRequestInterception(true);
    page.on('request', r => {
      const h = hostOf(r.url());
      if (h === 'firebasestorage.googleapis.com' && new URL(r.url()).pathname === LOGO_PATH) {
        stoodIn.add(r.url());
        r.respond({ status: 200, contentType: 'image/png', body: ICON }).catch(() => {});
        return;
      }
      if (h && !ALLOWED.has(h)) { refused.push(label + ' -> ' + h); r.abort().catch(() => {}); }
      else r.continue().catch(() => {});
    });
    page.on('response', r => {
      const h = hostOf(r.url());
      if (h && !ALLOWED.has(h) && !stoodIn.has(r.url())) leaks.push(label + ' <- ' + h + ' ' + r.url().slice(0, 90));
    });
  }
  /* A service worker that starts anyway, from any page, fails the run:
     its fetches are out of the page's reach. */
  function watchBrowser(browser) {
    browser.on('targetcreated', t => { if (t.type() === 'service_worker') leaks.push('a service worker started: ' + t.url().slice(0, 80)); });
  }
  return { protect, watchBrowser, refused: () => refused.slice(), leaks: () => leaks.slice(), ALLOWED };
}
