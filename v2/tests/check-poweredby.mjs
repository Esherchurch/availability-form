/* "Powered by Church HQ" - is it in the three places, and nowhere else?
 *
 *   node tests/check-poweredby.mjs            (from v2/, emulators running)
 *   node tests/check-poweredby.mjs --shots    and save pictures at phone width
 *
 * WHY. NEXT-BRIEF §19. The product is Church HQ; EGBC is its first church.
 * Members still see "EGBC Hub" - the church's own name and logo are the brand
 * on every screen - and Church HQ gets one small, quiet credit in three
 * places: under the sign-in box, at the bottom of the Menu, and in the footer
 * of the public hire pages (the events window's three).
 *
 * The risk this guards is not that the credit goes missing. It is that it
 * spreads: onto a header beside the church's own logo, onto an email, onto
 * every page. So this checks both halves - it is where it should be, and it
 * is not where it should not.
 *
 * The link is one switch (LINK in egbc-poweredby.js). churchhq.co.uk is not
 * live yet, so today the credit is plain text and this checks that too: a
 * link to a site that does not answer is worse than no link.
 *
 * Synthetic throughout.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';
import { giveFullAccess } from './test-account.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9634, SERVE = 8875;
const wantShots = process.argv.includes('--shots');
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

const WORDS = 'Powered by Church HQ';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')); };

const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>' +
  '<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

const makeAccount = () => new Promise((res, rej) => {
  const data = JSON.stringify({ email: ACCOUNT.email, password: ACCOUNT.pw, returnSecureToken: true });
  const req = http.request({ host: 'localhost', port: 9099, method: 'POST',
    path: '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  req.on('error', rej); req.end(data);
});

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('not found'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const head = /<head[^>]*>/i.exec(t);
      body = Buffer.from(head ? t.slice(0, head.index + head[0].length) + NO_SW + t.slice(head.index + head[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript'
      : e === '.css' ? 'text/css' : e === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-pb-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (watch.handle(m)) return;
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  /* What the credit looks like on screen: is it there, is it centred, is the
     mark beside the words rather than a broken image, and is it a link. */
  const CREDIT = `(() => {
    const el = document.querySelector('.egbc-poweredby');
    if (!el) return JSON.stringify({ none: true });
    const r = el.getBoundingClientRect();
    const img = el.querySelector('img');
    const a = el.querySelector('a');
    const cs = getComputedStyle(el);
    const parent = el.parentElement ? el.parentElement.getBoundingClientRect() : r;
    const mid = Math.abs((r.left + r.width / 2) - (parent.left + parent.width / 2));
    return JSON.stringify({
      text: (el.innerText || '').replace(/\\s+/g, ' ').trim(),
      visible: !!el.offsetParent && r.height > 0,
      centred: mid < 12,
      size: cs.fontSize, colour: cs.color,
      markShown: !!(img && img.offsetParent && img.getBoundingClientRect().height > 0),
      markHeight: img ? Math.round(img.getBoundingClientRect().height) : 0,
      link: a ? a.getAttribute('href') : ''
    });
  })()`;

  await makeAccount();
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
  const uid = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""');
  if (uid) await giveFullAccess(uid, ACCOUNT.email);

  const shot = async (name) => {
    if (!wantShots) return;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'poweredby--' + name + '.png'), Buffer.from(r.data, 'base64'));
  };

  const read = async () => {
    const raw = await ev(CREDIT);
    try { return JSON.parse(String(raw) || '{}'); } catch { return { bad: String(raw).slice(0, 90) }; }
  };

  const check = (where, c) => {
    ok(where + ': the credit is on the page', !c.none && c.visible, c.none ? 'not there at all' : c.text);
    ok(where + ': it says "' + WORDS + '"', String(c.text || '').includes(WORDS), c.text);
    ok(where + ': the mark is beside the words, about 16px',
      c.markShown && c.markHeight >= 12 && c.markHeight <= 20, c.markHeight + 'px');
    ok(where + ': centred, 12px, muted',
      c.centred && c.size === '12px' && c.colour === 'rgb(107, 114, 128)',
      [c.centred ? 'centred' : 'NOT centred', c.size, c.colour].join(', '));
    ok(where + ': no link while churchhq.co.uk is not live', !c.link, c.link || 'plain text');
  };

  /* ---- 1. the sign-in page ------------------------------------------- */
  /* SIGNED OUT, or there is no sign-in page to look at: login.html sends a
     signed-in person straight to the hub, so the first version of this
     check photographed the hub and reported the credit missing from a page
     it had never opened. */
  await ev('firebase.auth(EGBCAuth.app).signOut()', true);
  await sleep(1200);
  console.log('\nunder the sign-in box');
  watch.reset();
  await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/login.html' }); await sleep(6000);
  const c1 = await read();
  check('  login', c1);
  ok('  login: it is under the box, not in the header beside the church logo',
    (await ev(`(() => {
      const el = document.querySelector('.egbc-poweredby');
      const logo = document.querySelector('img[src*="firebasestorage"], header img');
      if (!el || !logo) return !!el;
      return el.getBoundingClientRect().top > logo.getBoundingClientRect().bottom;
    })()`)) === true, 'below the church\'s own logo');
  ok('  login: nothing on the console', watch.errors.length === 0, watch.summary());
  await shot('login-375');

  /* ---- 2. the Menu, on a page that is not the hub -------------------- */
  /* Signed in again - the Menu is a signed-in thing. */
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(3500);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
  await sleep(900);
  console.log('\nat the bottom of the Menu (the shell, so every page)');
  watch.reset();
  await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/whatson.html' }); await sleep(8000);
  await ev('window.alert=()=>{};window.confirm=()=>false;1');
  await ev("(()=>{try{EGBCShell.openMenu();return 1}catch(e){return String(e)}})()");
  await sleep(3000);
  const c2 = await read();
  check('  shell', c2);
  ok('  shell: it is the LAST thing in the Menu, under the items',
    (await ev(`(() => {
      const el = document.querySelector('.egbc-menu .egbc-poweredby, .egbc-poweredby');
      const list = document.querySelector('.egbc-menu');
      if (!el || !list) return false;
      return list.lastElementChild === el;
    })()`)) === true, 'the last child of the Menu');
  ok('  shell: nothing on the console', watch.errors.length === 0, watch.summary());
  await shot('menu-shell-375');

  /* ---- 3. the hub's own Menu ----------------------------------------- */
  console.log("\nat the bottom of the hub's Menu");
  watch.reset();
  await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(12000);
  await ev('window.alert=()=>{};window.confirm=()=>false;1');
  await ev("(()=>{const b=document.querySelector('#pickList .pick-t');if(b)b.click();})();1");
  await sleep(1500);
  await ev("(()=>{try{openTools()}catch(e){const el=document.getElementById('panel');if(el)el.classList.add('open')}})();1");
  await sleep(2500);
  const c3 = await read();
  check('  hub', c3);
  ok('  hub: nothing on the console', watch.errors.length === 0, watch.summary());
  await shot('menu-hub-375');

  /* ---- the three are the same line ----------------------------------- */
  console.log('\nthe three are one snippet, not three');
  ok('  all three read exactly the same',
    c1.text === c2.text && c2.text === c3.text && String(c1.text || '').length > 0,
    JSON.stringify([c1.text, c2.text, c3.text]));
  ok('  all three are the same size and colour',
    c1.size === c2.size && c2.size === c3.size && c1.colour === c2.colour && c2.colour === c3.colour,
    [c1.size, c2.size, c3.size, c1.colour].join(' / '));

  /* ---- and nowhere else ---------------------------------------------- */
  console.log('\nand nowhere it should not be');
  const pages = fs.readdirSync(V2).filter(f => /\.html$/i.test(f));
  const ALLOWED_PAGES = ['login.html', 'hire.html', 'room.html', 'book.html', 'my-booking.html'];
  const written = pages.filter(p => {
    if (ALLOWED_PAGES.includes(p)) return false;
    return /Powered by Church HQ/i.test(fs.readFileSync(path.join(V2, p), 'utf8'));
  });
  ok('  no page writes the words in for itself', written.length === 0,
    written.join(', ') || 'only the shared snippet says it');
  const inEmail = ['egbc-email.js', 'egbc-events.js', 'egbc-ics.js', 'egbc-rota-pdf.js']
    .filter(f => fs.existsSync(path.join(V2, f)) &&
                 /Church HQ/i.test(fs.readFileSync(path.join(V2, f), 'utf8')));
  ok('  not on emails, calendar files or PDFs', inEmail.length === 0,
    inEmail.join(', ') || 'none of them mention it');

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  if (wantShots) console.log('screenshots in tests/shots/');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
