/* PRESENT: THE THUMBNAILS' SCROLLBAR (the reviewing window, 21 Oct: on a
   phone the row of slide thumbnails showed a white sideways scrollbar).
   Present's own styles (EGBCPresent.css()) on a 390px page with a full row
   of thumbnails: with a mouse the bar is thin (6px at most) and dark; on a
   touch screen there is no bar, and the row still scrolls.
   No emulator; a local page only.
     node screenshots/events/present-film.test.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import puppeteer, { KnownDevices } from 'puppeteer-core';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 400))); };
const J = (x) => JSON.stringify(x);

const PAGE = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#0b1116">' +
  '<script src="/egbc-present.js"></script><div style="padding:12px"><div class="pz-film" data-film>' +
  Array.from({ length: 12 }, (_, i) => '<button><span>' + (i + 1) + '</span></button>').join('') + '</div></div>' +
  '<script>EGBCPresent.css()</script></body></html>';
const server = http.createServer((req, res) => {
  if (req.url === '/egbc-present.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); fs.createReadStream(path.join(V2, 'egbc-present.js')).pipe(res); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(PAGE);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-film-')), args: ['--no-first-run'] });
const measure = (p) => p.$eval('[data-film]', (f) => ({ bar: f.offsetHeight - f.clientHeight, scrolls: f.scrollWidth > f.clientWidth, color: getComputedStyle(f).scrollbarColor, width: getComputedStyle(f).scrollbarWidth, coarse: matchMedia('(pointer:coarse)').matches }));
try {
  const m = await browser.newPage();
  await m.setViewport({ width: 390, height: 844 });
  await m.goto('http://localhost:5601/', { waitUntil: 'load' });
  const a = await measure(m);
  ok('WITH A MOUSE: the row scrolls sideways', a.scrolls, J(a));
  ok('  its bar is thin (6px at most), not the browser\'s white one', a.bar <= 6 && a.width === 'thin', J(a));
  ok('  and dark', /rgb\(58, 74, 82\)/.test(a.color), J(a));
  const t = await browser.newPage();
  await t.emulate(KnownDevices['iPhone 13']);
  await t.goto('http://localhost:5601/', { waitUntil: 'load' });
  const b = await measure(t);
  ok('ON A PHONE (touch): no bar at all', b.coarse && b.bar === 0 && b.width === 'none', J(b));
  await t.$eval('[data-film]', (f) => { f.scrollLeft = 200; });
  ok('  and the row still scrolls', (await t.$eval('[data-film]', (f) => f.scrollLeft)) > 0);
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
} finally {
  await browser.close().catch(() => {});
  server.close();
}
console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
process.exit(results.every(Boolean) ? 0 : 1);
