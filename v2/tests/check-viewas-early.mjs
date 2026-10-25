/* A master admin's profile, asked for before the page has a body (the
 * audit, 25 Oct 2026: hubresources.html, master admin at 360, "Cannot read
 * properties of null (reading 'appendChild')"). The "view as" strip was put
 * on document.body before there was one; the throw meant the page never
 * got its profile.
 *
 *   node tests/check-viewas-early.mjs          (from v2/, the dev emulators up)
 *   BREAK=1 node tests/check-viewas-early.mjs  serves egbc-auth.js as it was: must fail
 *
 * A made-up master admin. The test page asks EGBCAuth.optional() from its
 * <head>, and this server holds the <body> back for four seconds, so the
 * profile is always back first.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9811, SERVE = 8997, PW = 'test-only-password';
const BREAK = !!process.env.BREAK;
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const P = { email: 've.master@example.invalid', member: 'ab_ve_master', name: 'VE Master Synthetic' };
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 300))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }, OWNER);
const FB = '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">' + FB + '</head><body>harness</body></html>';
/* The page: asks from its head, then the body arrives late. */
const EARLY_HEAD = '<!DOCTYPE html><html><head><meta charset="utf-8">' + FB
  + '<script>window.__got=null;EGBCAuth.optional().then(function(p){window.__got=p?(p.name||"profile"):"none";window.__bodyThen=!!document.body;});</script></head>';
const EARLY_BODY = '<body><div id="page">the page</div></body></html>';

const server = http.createServer((q, s) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
  if (url === '/__early.html') {
    s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    s.write(EARLY_HEAD + ' '.repeat(2048));
    return setTimeout(() => s.end(EARLY_BODY), 4000);
  }
  const f = path.join(V2, url.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f, 'utf8');
  /* The break: the strip without its wait for a body. */
  if (BREAK && url === '/egbc-auth.js') body = body.replace("if (!document.body) { document.addEventListener('DOMContentLoaded', mountViewAsBar, { once: true }); return; }", '');
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : 'text/html') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-viewas-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

let exitCode = 1;
try {
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: P.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: P.email, password: PW, returnSecureToken: true })).body || '{}');
  P.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: P.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + P.member, { name: P.name, email: P.email, markers: ['Core Team'], adminFor: [], masterAdmin: true, archived: false, isMinor: false, churchMember: true });
  await put('users/' + P.uid, { uid: P.uid, email: P.email, name: P.name, memberId: P.member, status: 'active', linkedBy: 'admin', teams: ['Core Team'], adminFor: [], masterAdmin: true, churchMember: true });

  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 200)); };
  const evl = makeEval(send, 'viewas');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(P.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
  errs.length = 0;

  console.log('\nA master admin, the profile back before the body');
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__early.html' });
  await sleep(7000);
  const L = JSON.parse(String(await evl('JSON.stringify({got:window.__got,bodyThen:window.__bodyThen,bar:!!document.getElementById("egbc-viewas"),page:!!document.getElementById("page")})')));
  ok('the page still gets the profile', L.got === P.name, JSON.stringify(L));
  ok('  and it was back before the body (so this case was really tested)', L.bodyThen === false, JSON.stringify(L));
  ok('  the "view as" strip goes on once the body is there', L.bar === true && L.page === true, JSON.stringify(L));
  ok('  nothing on the console', errs.length === 0, errs.join(' | '));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  await req(8181, 'DELETE', DOCS + '/users/' + P.uid, undefined, OWNER).catch(() => {});
  await req(8181, 'DELETE', DOCS + '/addressBook/' + P.member, undefined, OWNER).catch(() => {});
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
