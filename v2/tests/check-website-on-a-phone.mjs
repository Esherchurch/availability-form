/* THE WEBSITE, ON A PHONE.
 *
 *   node tests/check-website-on-a-phone.mjs            (from v2/)
 *   node tests/check-website-on-a-phone.mjs --shots
 *
 * Martin, 11 Oct 2026, looking at EGBC-HowTo-AV.html in the phone
 * browser - NOT in the app, which is what check-app-mode.mjs is for:
 *
 *   "The top bar truncates the page title to 'Ho…' and floats over the
 *    page's own heading. On a phone, let the title use the space...
 *    and make sure the page's first heading isn't under the bar."
 *   "The 'View the site as' strip takes two full lines at the bottom of
 *    a phone screen. Make it one compact line on a phone."
 *
 * Both are about the shared chrome, so both are measured on every page
 * that carries it rather than on the one he happened to open.
 *
 * Synthetic people throughout.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots', 'website-phone');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9676, SERVE = 8909;
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';
const WIDTH = 375, HEIGHT = 812;

/* A master admin, because the "view as" strip is master-admin only and
   is half of what this measures. */
const ME = { email: 'phoneweb.tester@example.invalid', name: 'Phoneweb Synthetic', member: 'ab_phoneweb' };

/* The pages Martin opens on a phone, and the ones most likely to have a
   long name in the bar. Read off the app's own list so this stays in
   step with it, then trimmed to the ones with the shell. */
function pages() {
  const seen = new Set();
  for (const f of ['app.html', 'egbc-app.js']) {
    const t = fs.readFileSync(path.join(V2, f), 'utf8');
    for (const m of t.matchAll(/open:([A-Za-z0-9._%&=?-]+)/g)) {
      const p = m[1].split('?')[0];
      if (p.endsWith('.html') && fs.existsSync(path.join(V2, p))
          && /egbc-shell\.js/.test(fs.readFileSync(path.join(V2, p), 'utf8'))) seen.add(p);
    }
  }
  return [...seen].sort();
}

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 320) : '')));
};

const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, obj) => req(8181, 'PATCH',
  DOCS + '/' + p.split('/').map(encodeURIComponent).join('/'),
  { fields: fields(obj) }, { Authorization: 'Bearer owner' });

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });
  const PAGES = pages();
  console.log(PAGES.length + ' pages with the website bar, at ' + WIDTH + 'px.\n');

  let up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  const uid = up.localId;
  const teams = ['Core Team', 'Worship Team', 'AV Team', 'Kids Church', 'Youth Worship', 'Maintenance'];
  /* masterAdmin ON THE BOOK as well as the mirror. The rules check the
     mirror against the book field by field, so seeding it on one side
     only leaves the profile corrected back to false - and then the "view
     as" strip, which is master-admin only, never appears and this check
     reported it missing from all 22 pages. */
  await put('addressBook/' + ME.member, {
    name: ME.name, email: ME.email, markers: teams, adminFor: teams,
    masterAdmin: true, churchMember: true, archived: false, isMinor: false });
  await put('users/' + uid, {
    uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active',
    linkedBy: 'admin', teams, adminFor: teams, masterAdmin: true,
    attender: true, churchMember: true });
  /* Building compliance stored ON, as it is live: building.html reads the
     stored field itself until F-239, and could not be read when an earlier
     check had left it unstored (20 Oct 2026). */
  await req(8181, 'PATCH', DOCS + '/churchSettings/features?updateMask.fieldPaths=buildingCompliance',
    { fields: { buildingCompliance: { booleanValue: true } } }, { Authorization: 'Bearer owner' });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const h = /<head[^>]*>/i.exec(t);
      body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript'
      : e === '.css' ? 'text/css' : e === '.json' ? 'application/json'
      : e === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-phoneweb-' + process.pid),
    '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  await send('Emulation.setDeviceMetricsOverride',
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: 3, mobile: true });

  const ev = makeEval(send, "website-on-a-phone");
  const until = async (what, expr, tries = 50) => {
    let last = '';
    for (let i = 0; i < tries; i++) {
      await sleep(400);
      last = String(await ev(expr, true));
      if (last === 'yes') return true;
    }
    ok(what, false, 'gave up, last: ' + last);
    return false;
  };

  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Storage.clearDataForOrigin', { origin: 'http://localhost:' + SERVE,
    storageTypes: 'indexeddb,local_storage,cache_storage,websql,service_workers' });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
  await until('the sign-in harness loaded',
    '(typeof firebase === "undefined" || typeof EGBCAuth === "undefined") ? "no" : "yes"');
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
    + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ')'
    + '.then(function(){return "ok"}).catch(function(e){return "failed " + e.code})', true);
  await until('a master admin is signed in',
    'firebase.auth(EGBCAuth.app).currentUser'
    + ' && firebase.auth(EGBCAuth.app).currentUser.uid === ' + JSON.stringify(uid) + ' ? "yes" : "no"');
  await until('the session carries a working token',
    'firebase.auth(EGBCAuth.app).currentUser.getIdToken().then(function(t){return t?"yes":"no"})'
    + '.catch(function(){return "no"})', 20);
  /* App mode off, hard: this is the website. */
  await ev('sessionStorage.removeItem("egbc_app_mode");1');

  const LOOK = `(() => {
    const bar = document.getElementById('egbc-bar');
    const n = bar && bar.querySelector('.eb-n');
    const strip = document.getElementById('egbc-viewas');
    /* The page's own first heading, ignoring anything inside the bar. */
    let h = null;
    for (const el of document.querySelectorAll('h1,h2')) {
      if (bar && bar.contains(el)) continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (r.height < 4) continue;
      h = { text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30),
            /* Where it sits with the page at the top: a page may scroll itself
               on purpose (the rota opens at the next Sunday), which is not
               the bar covering its heading. */
            top: Math.round(r.top + window.scrollY), bottom: Math.round(r.bottom + window.scrollY) };
      break;
    }
    const nr = n ? n.getBoundingClientRect() : null;
    return JSON.stringify({
      bar: !!bar,
      barBottom: bar ? Math.round(bar.getBoundingClientRect().bottom) : 0,
      /* Cut off: the text is wider than the box it is in. */
      titleCut: n ? (n.scrollWidth > n.clientWidth + 1) : false,
      title: n ? (n.textContent || '').trim() : '',
      titleW: nr ? Math.round(nr.width) : 0,
      heading: h,
      /* The page's first heading must not be under the bar at rest. */
      headingHidden: !!(h && bar && h.top < Math.round(bar.getBoundingClientRect().bottom) - 1),
      master: (typeof EGBCAuth==='undefined') ? '?' : String(!!(EGBCAuth.isReallyMaster && EGBCAuth.isReallyMaster())),
      appmode: document.documentElement.hasAttribute('data-egbc-app-mode'),
      barPos: bar ? getComputedStyle(bar).position : null,
      scrollY: Math.round(window.scrollY),
      strip: !!strip,
      stripH: strip ? strip.offsetHeight : 0,
      stripLines: strip ? Math.round(strip.offsetHeight / 44) : 0,
      blocked: document.body ? (document.body.getAttribute('data-egbc-blocked') || '') : '(no body)'
    });
  })()`;

  const settle = async () => {
    for (let i = 0; i < 70; i++) {
      await sleep(400);
      const st = String(await ev(
        '(function(){ if(!document.body) return "loading";'
        + ' var b = document.body.getAttribute("data-egbc-blocked");'
        + ' if (b) return "blocked:" + b;'
        /* The STYLE element, not the splash: egbc-guard.js adds the style
         synchronously and the splash later, so asking about the splash
         reads a hidden page as open in the gap between them. reveal()
         removes the style and nothing else does. */
        + ' if (document.getElementById("egbc-guard-style")) return "checking";'
        + ' if (getComputedStyle(document.body).visibility === "hidden") return "hidden";'
        + ' return document.getElementById("egbc-bar") ? "open" : "nobar"; })()'));
      if (st === 'open' || st.indexOf('blocked:') === 0) return st;
    }
    return 'never settled';
  };

  const cut = [], hidden = [], tall = [], noStrip = [];
  let dropped = 0;
  for (const page of PAGES) {
    let r = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
      await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page });
      const st = await settle();
      if (st === 'open') { await sleep(900); try { r = JSON.parse(String(await ev(LOOK))); } catch { r = null; } break; }
      if (attempt === 2) break;
      dropped++;
    }
    if (!r) { cut.push(page + ' -> could not be read'); continue; }
    if (r.titleCut) cut.push(page + ' -> "' + r.title + '" in ' + r.titleW + 'px');
    if (r.headingHidden) hidden.push(page + ' -> "' + (r.heading || {}).text + '" at '
      + (r.heading || {}).top + ', bar ends ' + r.barBottom);
    /* ONE LINE. 44px is a comfortable control plus its padding; two
       lines of this strip measured 80px+ before. */
    if (r.strip && r.stripH > 56) tall.push(page + ' -> ' + r.stripH + 'px');
    if (!r.strip) noStrip.push(page + ' [master=' + r.master + ' appmode=' + r.appmode + ']');
    console.log('  ' + page.padEnd(30)
      + (r.titleCut ? 'TITLE CUT ' : 'title ')
      + (r.headingHidden ? 'HEADING UNDER THE BAR(bar ' + r.barPos + ' ends ' + r.barBottom + ', y=' + r.scrollY + ') ' : '')
      + (r.strip ? 'strip ' + r.stripH + 'px' : 'NO STRIP'));
    if (wantShots) {
      const s2 = await send('Page.captureScreenshot', { format: 'png' });
      if (s2.data) fs.writeFileSync(path.join(SHOTS, page.replace(/\.html$/, '') + '--phone.png'),
        Buffer.from(s2.data, 'base64'));
    }
  }

  console.log('');
  ok('the page\u2019s name is not cut off in the bar', cut.length === 0, cut.join('\n          '));
  ok('and the page\u2019s own first heading is not under it',
    hidden.length === 0, hidden.join('\n          '));
  ok('the "view as" strip is one line on a phone', tall.length === 0, tall.join('\n          '));
  ok('and a master admin gets it on every page', noStrip.length === 0, noStrip.join(', '));
  if (dropped) console.log('\nnote  the emulator dropped the browser client ' + dropped
    + 'x (A-062); those pages were opened again');
  if (wantShots) console.log('\nscreenshots in tests/shots/website-phone/');
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
