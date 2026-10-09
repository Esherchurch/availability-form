/* F-118: the pages must work when the functions are not reachable.
 *
 *   node tests/check-pages-without-functions.mjs     (from v2/, emulators running)
 *
 * WHY. Moving "which address book record is mine" into the whoAmI function
 * (A-036) put an HTTPS call on the critical path of every page load, for
 * everybody whose account was matched automatically - which is almost
 * everybody. fetch has no timeout of its own, so where the function is not
 * listening the page waited for ever.
 *
 * The events window reported it as addressbook.html timing out (F-118).
 * Their emulators (firebase.events.json) have no functions emulator at all,
 * so on their ports every page in the suite was doing that.
 *
 * This check BLOCKS the functions endpoint outright and then opens pages. A
 * signed-in person whose record is already known must still get in, promptly.
 * It is the only check in the suite that proves the pages do not depend on a
 * function being up just to render.
 *
 * Synthetic: one invented admin, already linked.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9679, SERVE = 8899;
const PW = 'test-only-password';
const EMAIL = 'nofunc.admin@example.invalid';

/* Long enough to be sure the page is not merely slow, short enough that a
   hang is still a failure rather than a coffee break. The old code waited
   for ever; eight seconds is the timeout inside callFunction. */
const PATIENCE_MS = 14000;

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };

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
const put = (p, obj) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(obj) }, { Authorization: 'Bearer owner' });

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

(async () => {
  /* linkedBy 'auto', which is the case that did the extra call. */
  let up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: EMAIL, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email: EMAIL, password: PW, returnSecureToken: true })).body || '{}');
  await put('addressBook/ab_nofunc', {
    name: 'No Function Admin', email: EMAIL,
    markers: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true });
  await put('users/' + up.localId, {
    uid: up.localId, email: EMAIL, name: 'No Function Admin', memberId: 'ab_nofunc',
    status: 'active', linkedBy: 'auto', teams: ['Core Team'], adminFor: ['Core Team'],
    masterAdmin: true, attender: true, churchMember: true });

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
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-nofn-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  let blockedCalls = 0;
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      /* THE WHOLE POINT: every call to a hub function is refused, exactly as
         it is on a machine with no functions emulator. Firestore and Auth
         keep working, because the complaint was never about those. */
      if (/:510[12]\//.test(u) || /cloudfunctions\.net/.test(u)) {
        blockedCalls++;
        /* HUNG, NOT REFUSED - which is the events window's actual symptom.
           A refused connection fails in milliseconds and proves very little;
           a port that accepts and never answers is what hangs a page, and it
           is the only thing the timeout inside callFunction can save. Not
           answering this CDP event at all leaves the request paused for ever. */
        return;
      }
      let h; try { h = new URL(u).host.split(':')[0]; } catch { h = ''; }
      if (!/^(localhost|127\.0\.0\.1)$/.test(h) && !ALLOWED.includes(h) && !/^(data|blob|about|chrome)/.test(u))
        return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(3500);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
    + JSON.stringify(EMAIL) + ',' + JSON.stringify(PW) + ')', true);
  ok('signed in, with no function reachable',
    (await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).email || "(nobody)"')) === EMAIL);

  /* Waits for the page to be USABLE, and reports how long it took. A hang
     shows as the full patience, which is the failure the events window had. */
  /* THE GUARD IS PART OF BEING LOADED. egbc-guard.js puts
     body{visibility:hidden} and a "Checking access" splash up until
     EGBCAuth.require() resolves - and a page's own modular reads do not wait
     for that, so the content fills in underneath while the person still sees
     the splash. A readiness test that only counts elements reports that as
     loaded; the first version of this check did, and the deliberate break
     sailed past it. */
  const VISIBLE = '!document.getElementById("egbc-guard-splash")'
    + ' && getComputedStyle(document.body).visibility !== "hidden"';

  async function open(page, ready) {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page });
    const began = Date.now();
    let done = false;
    while (Date.now() - began < PATIENCE_MS) {
      await sleep(500);
      if ((await ev('(' + VISIBLE + ') && (' + ready + ')')) === true) { done = true; break; }
    }
    return { done, ms: Date.now() - began,
             blocked: String(await ev('document.body.getAttribute("data-egbc-blocked") || ""')),
             text: String(await ev('(document.body.innerText||"").replace(/\\s+/g," ").slice(0,200)')) };
  }

  console.log('\nthe page the events window reported');
  const ab = await open('addressbook.html',
    'document.querySelectorAll("#memberListBody tr").length > 0');
  ok('F-118: addressbook.html finishes loading with no function reachable',
    ab.done, 'gave up after ' + ab.ms + 'ms   blocked=' + ab.blocked + '   ' + ab.text);
  ok('and it is not turned away', ab.blocked === '', ab.blocked);
  ok('promptly, rather than after the function timeout',
    ab.done && ab.ms < 9000, ab.ms + 'ms');

  console.log('\nand the rest of the suite, which was doing the same call');
  for (const [page, ready] of [
    /* The hub asks which team first when somebody is on several, so being
       usable means either the picker or the tool list is up. */
    ['hub.html', 'document.querySelectorAll("#toolList > *").length > 0 || /Which team today/i.test(document.body.innerText)'],
    ['view-only-rota.html', '!!document.body && document.body.innerText.length > 100'],
    ['meeting.html', '!!document.getElementById("lobby") && document.body.innerText.length > 80'],
    /* The five the events window says already timed out on their
       emulators, before this change. If my fix covers them, they are
       fixed; if it does not, they were timing out for a reason of their
       own and that is worth knowing rather than guessing. F-118. */
    ['MonitorStageMap.html', 'document.body.innerText.length > 80'],
    ['Planner.html', 'document.body.innerText.length > 150'],
    ['SundayServicePlanner.html', 'document.body.innerText.length > 150'],
    ['youthserviceplanner.html', 'document.body.innerText.length > 150']
  ]) {
    const r = await open(page, ready);
    ok(page + ' loads with no function reachable', r.done && r.blocked === '',
      'gave up after ' + r.ms + 'ms   blocked=' + r.blocked + '   ' + r.text);
  }

  console.log('\nwhat the pages asked for');
  ok('at least one call to a function was left hanging, so this proved something',
    blockedCalls > 0, 'blocked ' + blockedCalls + ' - if zero, the block is not working');
  ok('and it was not one per page: the identity check is once a session',
    blockedCalls <= 2, 'blocked ' + blockedCalls + ' calls across four pages');

  server.close(); chrome.kill(); ws.close();
  const failed = R.filter(v => !v).length;
  console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
