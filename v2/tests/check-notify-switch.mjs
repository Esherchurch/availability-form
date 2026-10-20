/* Phone notifications: the on/off switch on Church settings (A-081).
 *
 *   node tests/check-notify-switch.mjs      (from v2/, emulators up)
 *
 * Martin, 13 Oct 2026: "I want an on off switch please as an admin. I dont
 * want to go in to firebase to do something basic." The master switch that
 * stops the senders sending anything until it is on (A-081) is a switch on
 * Church settings: off to start with, on only after a yes, back off in one
 * tap, and only for a master admin - the rules say the same.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9741, SERVE = 8957;
const PW = 'test-only-password';


const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')));
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
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, { Authorization: 'Bearer owner' });

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
  const P = {
    master: { email: 'sw.master@example.invalid', name: 'Sam Switch Synthetic', member: 'ab_sw_master', adminFor: [], masterAdmin: true },
    admin:  { email: 'sw.admin@example.invalid', name: 'Ann Admin Synthetic', member: 'ab_sw_admin', adminFor: ['Kids Church'], masterAdmin: false },
  };
  for (const p of Object.values(P)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: ['Core Team'], adminFor: p.adminFor,
      masterAdmin: p.masterAdmin, churchMember: true, archived: false, isMinor: false });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active',
      linkedBy: 'admin', teams: ['Core Team'], adminFor: p.adminFor, masterAdmin: p.masterAdmin, attender: true, churchMember: true });
  }
  await req(8181, 'DELETE', DOCS + '/churchSettings/notifications', undefined, { Authorization: 'Bearer owner' });
  const live = async () => {
    const r = await req(8181, 'GET', DOCS + '/churchSettings/notifications', undefined, { Authorization: 'Bearer owner' });
    if (r.status !== 200) return 'absent';
    return String((((JSON.parse(r.body).fields || {}).live) || {}).booleanValue);
  };

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t);
      body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css'
      : e === '.json' ? 'application/json' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-switch-' + process.pid), '--window-size=375,812', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  const ev = makeEval(send, 'notify-switch');
  const signInAs = async (k) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await sleep(2500);
    await ev('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(P[k].email) + ',' + JSON.stringify(PW) + ')', true);
    await sleep(800);
  };
  const openSettings = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/church-settings.html' });
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      const st = String(await ev('(function(){ if(!document.body) return "loading"; if (document.body.getAttribute("data-egbc-blocked")) return "blocked";'
        + ' return document.getElementById("egbc-guard-style") ? "checking" : "open"; })()'));
      if (st === 'open' || st === 'blocked') break;
    }
    await sleep(2000);
  };
  const sw = () => ev('(function(){var b=document.getElementById("n-switch");if(!b)return "none";'
    + 'var r=b.getBoundingClientRect();return JSON.stringify({ role:b.getAttribute("role"), checked:b.getAttribute("aria-checked"),'
    + ' h:Math.round(r.height), words:(document.getElementById("n-state")||{}).textContent||"", wide: document.documentElement.scrollWidth > innerWidth })})()');

  console.log('\nChurch settings, as a master admin, on a phone');
  await signInAs('master');
  watch.reset();
  await openSettings();
  let s = JSON.parse(String(await sw()));
  ok('  there is a switch for phone notifications', s.role === 'switch', JSON.stringify(s));
  ok('  it starts OFF, and says nothing is being sent', s.checked === 'false' && /Nothing is sent/.test(s.words), JSON.stringify(s));
  ok('  it is a full-size target and the page fits the phone', s.h >= 44 && !s.wide, JSON.stringify(s));

  await ev('window.confirm=function(){return false};1');
  await ev('document.getElementById("n-switch").click();1'); await sleep(1200);
  ok('  turning it on asks first, and "no" leaves it off', (await live()) !== 'true'
    && JSON.parse(String(await sw())).checked === 'false');
  await ev('window.confirm=function(){return true};1');
  await ev('document.getElementById("n-switch").click();1'); await sleep(1500);
  s = JSON.parse(String(await sw()));
  ok('  "yes" turns it on, and it says so', (await live()) === 'true' && s.checked === 'true' && /being sent/.test(s.words), (await live()) + ' ' + JSON.stringify(s));
  await openSettings();
  ok('  and it is still on when the page is opened again', JSON.parse(String(await sw())).checked === 'true');
  await ev('document.getElementById("n-switch").click();1'); await sleep(1500);
  ok('  turning it off needs no question, and saves off', (await live()) === 'false' && JSON.parse(String(await sw())).checked === 'false');
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  console.log('\nas an admin who is not master admin');
  await signInAs('admin');
  await openSettings();
  /* Church settings is for master admins only since 21 Oct 2026: they are
     refused the page, so there is no switch for them either. */
  ok('  the page refuses them (master admins only)', String(await ev('document.body.getAttribute("data-egbc-blocked")||""')) !== '');
  ok('  and there is no switch for them', String(await sw()) === 'none');

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
