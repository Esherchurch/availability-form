/* EGBCAuth.functionUrl(name): the address of one of the hub's functions,
 * the same one EGBCAuth.call() posts to (reviewing window, 22 Oct 2026:
 * egbc-present.js worked it out a second time, for its leave beacon).
 * And EGBCAuth.call(name, data, { timeoutMs }) (reviewing window, 23 Oct
 * 2026: the safeguarding AI draft takes ~45 s, past the 8 s default).
 * BREAK=timeout serves a call() that ignores the option: must fail.
 *
 *   node tests/check-function-url.mjs          (from v2/, the dev emulators up)
 *   BREAK=1 node tests/check-function-url.mjs  serves an egbc-auth.js whose
 *                                              address is always the live one: must fail
 *
 * In a browser, signed in as a made-up person: the address is the
 * emulator's; posting to it, as a beacon would, reaches the function
 * (whoAmI answers); and it agrees with call().
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SERVE = 8991, CDP = 9805, PW = 'test-only-password';
const BREAK = process.env.BREAK || '';
const OWNER = { Authorization: 'Bearer owner' };
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
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
  let body = fs.readFileSync(f, 'utf8');
  /* The break: an address worked out separately, wrongly (another port,
     nothing listening) - never the live one, which a check must not reach. */
  if (BREAK === 'timeout' && url === '/egbc-auth.js') body = body.replace('return callFunction(name, data, t > 0 ? Math.min(t, 540000) : undefined);', 'return callFunction(name, data);');
  if (BREAK && BREAK !== 'timeout' && url === '/egbc-auth.js') body = body.replace("return FUNCTIONS_BASE + '/' + encodeURIComponent(String(name || ''));", "return 'http://localhost:5199/' + FIREBASE_CONFIG.projectId + '/europe-west2/' + name;");
  s.writeHead(200, { 'Content-Type': (url.endsWith('.js') ? 'text/javascript' : 'text/html') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-fnurl-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

const email = 'fu.person@example.invalid';
let uid = '', exitCode = 1;
try {
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email, password: PW, returnSecureToken: true })).body || '{}');
  uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: uid, emailVerified: true }, OWNER);

  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  const evl = makeEval(send, 'fnurl');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);

  const u = String(await evl('EGBCAuth.functionUrl("presentLeave")'));
  ok('functionUrl is the emulator\'s address on the emulator', u === 'http://localhost:5101/egbc-worship-planner/europe-west2/presentLeave', u);
  ok('  a name is put in the address safely', String(await evl('EGBCAuth.functionUrl("a/b")')).endsWith('/a%2Fb'));
  /* As a beacon would: a plain POST to that address, signed in. */
  const viaUrl = String(await evl('firebase.auth(EGBCAuth.app).currentUser.getIdToken().then(function(t){return fetch(EGBCAuth.functionUrl("whoAmI"),{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+t},body:JSON.stringify({data:{}})}).then(function(r){return r.status+" "+(r.ok?"ok":"")})}).catch(function(e){return "failed: "+e.message})', true));
  ok('  posting to it reaches the function (whoAmI answers)', /^200 ok$/.test(viaUrl), viaUrl);
  const viaCall = String(await evl('EGBCAuth.call("whoAmI",{}).then(function(r){return Array.isArray(r.people)?"answered":JSON.stringify(r)},function(e){return "failed: "+e.message})', true));
  ok('  and call() reaches the same function', viaCall === 'answered', viaCall);
  /* THE TIMEOUT. fetch is swapped for a stand-in that answers after a set
     delay and gives up when told to (as a real one does), so no slow
     function is needed. */
  await evl('(function(){window.__slow=0;var real=window.fetch;window.fetch=function(u,o){if(!window.__slow)return real(u,o);var ms=window.__slow;return new Promise(function(res,rej){var t=setTimeout(function(){res(new Response(JSON.stringify({result:{ok:1}}),{headers:{"Content-Type":"application/json"}}));},ms);if(o&&o.signal)o.signal.addEventListener("abort",function(){clearTimeout(t);rej(new DOMException("aborted","AbortError"));});});};return 1})()');
  const timed = async (ms, opts) => {
    const r = String(await evl('(function(){window.__slow=' + ms + ';var t0=Date.now();return EGBCAuth.call("whoAmI",{}' + (opts ? ',' + JSON.stringify(opts) : '') + ').then(function(){return "answered "+(Date.now()-t0)},function(e){return "gave up "+(Date.now()-t0)}).finally(function(){window.__slow=0})})()', true));
    return { r, ms: Number(r.split(' ').pop()) };
  };
  let t = await timed(9000);
  ok('call() with no option still gives up at 8 seconds', /^gave up/.test(t.r) && t.ms >= 7500 && t.ms < 9000, t.r);
  t = await timed(9000, { timeoutMs: 15000 });
  ok('  with timeoutMs 15000 it waits for a 9-second answer', /^answered/.test(t.r), t.r);
  t = await timed(4000, { timeoutMs: 2000 });
  ok('  and with timeoutMs 2000 it gives up on a 4-second one, at 2 seconds', /^gave up/.test(t.r) && t.ms < 3500, t.r);
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
