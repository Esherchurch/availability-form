/* "Checking access" must not spin for ever.
 *
 *   node tests/check-guard-does-not-spin.mjs      (from v2/, emulators up)
 *
 * MARTIN, 12 Oct 2026: "Checking access" stuck on his phone, opening the
 * rota from the app right after a laptop restart. It cleared on its own
 * later. The same shape had shown up in a check the day before -
 * schematic.html reporting splash:true, signedIn:yes, profile:no, and
 * the database REACHABLE - which I had written off as a test flake. It
 * was not.
 *
 * WHY IT HAPPENS. EGBCAuth.require() waits on loadProfile(), a Firestore
 * get() with no timeout. The SDK retries a wedged connection by itself,
 * and that get() can stay pending for minutes after a sleep, a network
 * change, or the emulator dropping a client. While it is pending the
 * promise neither resolves nor rejects - so the guard never reveals the
 * page and never refuses it. The splash is the whole of the screen and
 * nothing says anything is wrong.
 *
 * THE STALL HERE IS DELIBERATE AND TOTAL: EGBCAuth.require() is replaced
 * with a promise that never settles, which is exactly the state the real
 * one gets into. Nothing is mocked beyond that - the real guard, the
 * real page, the real splash.
 *
 * WHAT IS PROVED:
 *   - before 8s it is still honestly "Checking access", not a false alarm
 *   - by 9s it says so, in words, with a way out
 *   - the page is STILL HIDDEN: a stall must never reveal a page whose
 *     access was never checked, which is the one thing this file is for
 *   - and a read that comes back late still opens the page
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9725, SERVE = 8941;
const PW = 'test-only-password';
const ACCOUNT = { email: 'guard.spin@example.invalid', name: 'Spin Synthetic', member: 'ab_guard_spin' };
/* A page guarded on a team this person really is on, so the only reason
   it could fail to open is the stall. */
const PAGE = 'Worshipteamcharter.html';

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')));
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
  return { stringValue: String(v) };
};
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p,
  { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) },
  { Authorization: 'Bearer owner' });

/* THE STALL. Injected straight after egbc-auth.js and before
   egbc-guard.js, so the guard calls a require() that never answers -
   which is what a wedged Firestore get() leaves it holding. A query
   string turns it on, so the same page is served normally otherwise. */
const STALL = '<script>(function(){'
  + 'if (location.search.indexOf("__stall=1") === -1) return;'
  + 'var real = EGBCAuth.require;'
  + 'EGBCAuth.require = function () {'
  + '  if (window.__stallReleased) return real.apply(EGBCAuth, arguments);'
  + '  return new Promise(function (resolve, reject) {'
  + '    window.__release = function () {'
  + '      window.__stallReleased = true;'
  + '      real.apply(EGBCAuth, arguments.length ? arguments : [{}]).then(resolve, reject);'
  + '    };'
  + '  });'
  + '};'
  + '})();</script>';

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
  let up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: ACCOUNT.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email: ACCOUNT.email, password: PW, returnSecureToken: true })).body || '{}');
  const uid = up.localId;
  await put('users/' + uid, {
    uid, email: ACCOUNT.email, name: ACCOUNT.name, memberId: ACCOUNT.member,
    status: 'active', linkedBy: 'admin', teams: ['Worship Team'], adminFor: [],
    masterAdmin: false, attender: true, churchMember: true });
  await put('addressBook/' + ACCOUNT.member, {
    name: ACCOUNT.name, email: ACCOUNT.email, markers: ['Worship Team'], adminFor: [],
    churchMember: true, archived: false, isMinor: false });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      let t = body.toString('utf8');
      const h = /<head[^>]*>/i.exec(t);
      if (h) t = t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length);
      /* Between egbc-auth.js and egbc-guard.js, which is the only place
         a replacement for require() can be in time. */
      const g = /<script[^>]*egbc-guard\.js[^>]*><\/script>/i.exec(t);
      if (g) t = t.slice(0, g.index) + STALL + t.slice(g.index);
      body = Buffer.from(t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript'
      : e === '.css' ? 'text/css' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-spin-' + process.pid),
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
  const ev = makeEval(send, 'guard-does-not-spin');

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
  await sleep(3000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
    + JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(PW) + ')', true);
  await sleep(800);

  const state = () => ev('(function(){'
    + 'var sp=document.getElementById("egbc-guard-splash");'
    + 'var hidden=!!document.getElementById("egbc-guard-style");'
    + 'return JSON.stringify({'
    + ' splash: !!sp,'
    + ' words: sp ? sp.textContent.replace(/\\s+/g," ").trim().slice(0,90) : "",'
    + ' retry: !!document.getElementById("egbc-guard-retry"),'
    + ' hidden: hidden })})()');

  console.log('\nthe read never comes back');
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + PAGE + '?__stall=1' });
  await sleep(2500);
  let s1 = JSON.parse(String(await state()));
  ok('  at 2.5s it is still checking, as it should be', s1.splash && !s1.retry,
    JSON.stringify(s1));
  ok('  and the page is hidden while it checks', s1.hidden === true, JSON.stringify(s1));

  await sleep(7000);     /* past the 8s mark */
  let s2 = JSON.parse(String(await state()));
  ok('  by 9s it says what has happened, instead of spinning',
    /Could not check your access/i.test(s2.words), JSON.stringify(s2));
  ok('  and offers a way out', s2.retry === true, JSON.stringify(s2));
  /* THE ONE THAT MATTERS. A stall must never show a page whose access
     was never checked - that is the whole job of this file. */
  ok('  and it STILL has not revealed the page', s2.hidden === true, JSON.stringify(s2));

  /* AND A LATE ANSWER STILL WORKS. The guard stops waiting silently; it
     does not give up on the read. */
  console.log('\nand when the read finally comes back');
  await ev('window.__release && window.__release({ team: "Worship Team" })');
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const s = JSON.parse(String(await state()));
    if (s.hidden === false) break;
  }
  const s3 = JSON.parse(String(await state()));
  ok('  the page opens as it always would', s3.hidden === false && s3.splash === false,
    JSON.stringify(s3));

  /* AND NOTHING CHANGED FOR A PAGE THAT ANSWERS NORMALLY. */
  console.log('\na page whose read answers at once');
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + PAGE });
  for (let i = 0; i < 40; i++) {
    await sleep(400);
    const s = JSON.parse(String(await state()));
    if (s.hidden === false) break;
  }
  const s4 = JSON.parse(String(await state()));
  ok('  opens without ever showing the message',
    s4.hidden === false && !/Could not check/i.test(s4.words), JSON.stringify(s4));

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
