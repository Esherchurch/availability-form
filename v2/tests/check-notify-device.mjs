/* Notifications are for any DEVICE, not only a phone (Martin, 20 Oct 2026:
 * "notifications work on a PC too, so never 'this phone'").
 *
 *   node tests/check-notify-device.mjs      (from v2/, the dev emulators up)
 *
 *   1. No user-facing "this phone" or "Phone notifications" left in
 *      notifications.html, the Menu, the app or Church settings (code
 *      comments may keep their words).
 *   2. Blocked, the help fits the device and shows only that device's
 *      steps: a desktop Chrome gets the browser's (padlock, Site settings),
 *      never Android's or the iPhone's; Edge, Safari on a Mac, Firefox,
 *      Android and iPhone each get their own.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9847, SERVE = 9053, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const ME = { email: 'nd.member@example.invalid', member: 'ab_nd_member', name: 'Notify Device Synthetic' };
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- 1. the words ---- */
console.log('1. No "this phone" where people read it');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
const FILES = ['notifications.html', 'egbc-menu.js', 'app.html', 'church-settings.html'];
const found = [];
for (const f of FILES) {
  const t = strip(fs.readFileSync(path.join(V2, f), 'utf8'));
  for (const m of t.matchAll(/this phone|Phone notifications|No phone set up/gi)) found.push(f + ': "' + t.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ') + '"');
}
ok('none in ' + FILES.join(', '), !found.length, found.slice(0, 6).join(' | '));
const N = strip(fs.readFileSync(path.join(V2, 'notifications.html'), 'utf8'));
ok('notifications.html says "this device" and "Not set up on any device?"', /On for this device/.test(N) && /Turn on notifications on this device/.test(N)
  && /Turn off on this device/.test(N) && /Not set up on any device\?/.test(N) && /This device said no/.test(N) && /Everything on this device is ready/.test(N));

/* ---- 2. the help, for the device ---- */
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const UA = {
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
};

(async () => {
  console.log('\n2. Blocked: the steps for this device, and only those');
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: up.localId, emailVerified: true }, OWNER);
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ['Worship Team'], adminFor: [], masterAdmin: false, archived: false, isMinor: false, churchMember: true });
  await put('users/' + up.localId, { uid: up.localId, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin',
    teams: ['Worship Team'], adminFor: [], masterAdmin: false, churchMember: true });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-nd-' + process.pid), 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  await send('Runtime.enable'); await send('Page.enable');
  const evl = makeEval(send, 'nd');
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setUserAgentOverride', { userAgent: UA.chrome, platform: 'Win32' });
    /* THE ONE THAT MATTERS: a computer, in Chrome, that has blocked them. */
    await send('Browser.setPermission', { permission: { name: 'notifications' }, setting: 'denied', origin: 'http://localhost:' + SERVE });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/notifications.html' }); await sleep(8000);
    const st = JSON.parse(String(await evl('JSON.stringify({h:(document.querySelector("#blocked h2")||{}).textContent||"",steps:(document.getElementById("blocked-steps")||{}).textContent||"",kind:(document.getElementById("blocked-steps")||{getAttribute:function(){return ""}}).getAttribute("data-device"),state:(document.getElementById("state")||{}).innerText||""})')));
    ok('a desktop Chrome, blocked: "Notifications are blocked on this device"', st.h === 'Notifications are blocked on this device', JSON.stringify(st));
    ok('  with Chrome\'s steps on a computer (Site settings, Allow)', st.kind === 'chrome' && /In Chrome on this computer/.test(st.steps) && /Site settings/.test(st.steps), JSON.stringify(st));
    ok('  and not Android\'s or the iPhone\'s', !/Android|installed app|iPhone|Settings, then Apps/.test(st.state), st.state.slice(0, 300));
    /* Every other device, through the page's own choice of steps. */
    const each = JSON.parse(String(await evl('JSON.stringify(' + JSON.stringify(UA) + ')')));
    const got = {};
    for (const [k, ua] of Object.entries(each)) {
      got[k] = String(await evl('(function(){var d=document.createElement("div");d.innerHTML=EGBCNotifyPage.blockedHelp(' + JSON.stringify(ua) + ');var p=d.firstChild;return p.getAttribute("data-device")+"|"+p.textContent})()'));
    }
    ok('Edge gets Edge\'s steps', /^edge\|In Edge on this computer/.test(got.edge), got.edge);
    ok('Safari on a Mac gets Safari\'s', /^safari\|In Safari on this Mac/.test(got.safari), got.safari);
    ok('Firefox gets Firefox\'s', /^firefox\|In Firefox on this computer/.test(got.firefox), got.firefox);
    ok('Android gets the phone\'s', /^android\|On Android in Chrome/.test(got.android), got.android);
    ok('an iPhone gets the iPhone\'s', /^iphone\|On this iPhone: open Settings/.test(got.iphone), got.iphone);
    ok('each one is a single set of steps', Object.values(got).every(t => (t.match(/padlock|Settings, then/g) || []).length <= 2 && !(/Android/.test(t) && /computer/.test(t))), JSON.stringify(got));
  } finally {
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
