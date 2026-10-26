/* Apps and downloads (v2/hubresources.html; 26 Oct 2026, Martin: "where do
 * I install the app? It has all the old ones on here, which it shouldn't").
 *
 *   node tests/check-hubresources.mjs          (from v2/, the dev emulators up)
 *   BREAK=1 node tests/check-hubresources.mjs  the old apps listed again: must fail
 *
 * In a browser at 375, a made-up member, with a made-up old app and a
 * made-up link in the shared hub_resources list:
 *   - the hub app is first, with a QR code of the church's own address
 *     (hubAddress: https://egbc.churchhq.co.uk/app.html for EGBC);
 *   - no old app is listed; the web link still is;
 *   - nothing on the page can change the shared list (no Admin Login);
 *   - the original site's own hubresources.html is untouched (git).
 */
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9821, SERVE = 8985, PW = 'test-only-password';
const BREAK = !!process.env.BREAK;
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const P = { email: 'hr.member@example.invalid', member: 'ab_hr_member', name: 'HR Member Synthetic' };
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 300))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }, OWNER);
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';

const server = http.createServer((q, s) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
  const f = path.join(V2, url.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f);
  if (/\.html$/.test(f)) {
    let t = body.toString('utf8');
    const h = /<head[^>]*>/i.exec(t); if (h) t = t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length);
    /* The break: every entry listed, the old apps included. */
    if (BREAK && url === '/hubresources.html') { const was = t; t = t.replace('.filter(d => !isApp(d)).forEach', '.forEach'); if (t === was) console.log('  FAIL  the break did not apply'); }
    body = Buffer.from(t, 'utf8');
  }
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : /\.png$/.test(f) ? 'image/png' : 'text/html') + (/\.png$/.test(f) ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-hubres-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

let exitCode = 1;
try {
  console.log('The original site\'s own page');
  const rootUntouched = (() => { try { execSync('git diff --quiet HEAD -- ../hubresources.html', { stdio: 'ignore' }); return true; } catch { return false; } })();
  const rootLast = execSync('git log -1 --format=%h -- ../hubresources.html').toString().trim();
  ok('the original hubresources.html (the repo root) is untouched by this work', rootUntouched && rootLast.length > 0, 'last change ' + rootLast);

  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: P.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: P.email, password: PW, returnSecureToken: true })).body || '{}');
  P.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: P.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + P.member, { name: P.name, email: P.email, markers: ['Worship Team'], adminFor: [], masterAdmin: false, archived: false, isMinor: false, churchMember: true });
  await put('users/' + P.uid, { uid: P.uid, email: P.email, name: P.name, memberId: P.member, status: 'active', linkedBy: 'admin', teams: ['Worship Team'], adminFor: [], masterAdmin: false, churchMember: true });
  await put('hub_resources/hr_old_app', { name: 'HR Old Worship App (synthetic)', type: 'pwa', downloadUrl: 'https://example.invalid/old-worship.html', order: 0 });
  await put('hub_resources/hr_link', { name: 'HR Song Library Link (synthetic)', type: 'link', url: 'https://example.invalid/songs', order: 1 });

  let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (list.some((x) => x.type === 'page')) break; } catch {} await sleep(500); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); };
  const evl = makeEval(send, 'hubres');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(P.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hubresources.html' });
  let L = {};
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    L = JSON.parse(String(await evl('JSON.stringify({qr:(document.getElementById("hub-app-qr")||{getAttribute:function(){return ""}}).getAttribute("data-qr"),img:!!document.querySelector("#hub-app-qr img, #hub-app-qr canvas"),'
      + 'first:(document.querySelector(".resource-card .card-name")||{}).textContent,text:document.body.innerText.replace(/\\s+/g," "),admin:!!document.getElementById("admin-toggle-btn")||/Admin Login/.test(document.body.innerText)})')) || '{}');
    if (/churchhq/.test(L.qr || '') && /HR Song Library/.test(L.text || '')) break;
  }
  console.log('\nA member, on the page');
  ok('the hub app comes first', L.first === 'The hub app', L.first);
  ok('  with a QR code of the church\'s own address (https://egbc.churchhq.co.uk/app.html)', L.qr === 'https://egbc.churchhq.co.uk/app.html' && L.img, JSON.stringify({ qr: L.qr, img: L.img }));
  ok('  and how to install it, on Android, iPhone and a computer', /How to install/.test(L.text) && String(await evl('!!document.getElementById("install-tab-computer")')) === 'true');
  ok('no old app is listed', !/HR Old Worship App/.test(L.text), L.text.slice(0, 300));
  ok('  the web link still is', /HR Song Library Link/.test(L.text));
  ok('nothing here can change the shared list (no Admin Login)', !L.admin);
  ok('no errors on the page', errs.length === 0, errs.join(' | '));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  for (const p of ['hub_resources/hr_old_app', 'hub_resources/hr_link', 'users/' + P.uid, 'addressBook/' + P.member]) await req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER).catch(() => {});
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
