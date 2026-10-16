/* Full-screen video turns the phone sideways (egbc-orientation.js).
 *
 *   node tests/check-orientation.mjs      (from v2/, the dev emulators up)
 *
 * Headless Chrome has no screen.orientation.lock, so each page is given a
 * stand-in that records what is asked of it (as Android Chrome would be
 * asked), and full screen is played by setting document.fullscreenElement
 * and firing fullscreenchange - exactly what the browser does.
 *
 * On app.html, hub.html, watch.html and videos.html:
 *   - a YouTube player going full screen asks for landscape;
 *   - leaving full screen lets go, and in the installed app asks for
 *     portrait again;
 *   - something that is not a video going full screen asks for nothing;
 *   - the installed app asks for portrait when it opens; the browser does not;
 *   - a phone with no lock (an iPhone) throws nothing.
 * What this cannot prove: that a real Android phone turns. That is checked
 * by hand on Martin's phone (the report says so).
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9791, SERVE = 9007, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const ME = { email: 'ori.member@example.invalid', member: 'ab_ori_member', name: 'Orientation Member Synthetic' };
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';

/* Before any page script: a recording screen.orientation, and (when asked)
   an installed app's display-mode; or no lock at all (an iPhone). */
const STUB = (mode) => `(function(){
  window.__ori=[];window.__fs=null;
  ${mode === 'iphone' ? `try{Object.defineProperty(screen,'orientation',{configurable:true,get:function(){return {type:'portrait-primary'}}})}catch(e){}` :
  `var o={type:'portrait-primary',lock:function(k){window.__ori.push('lock:'+k);return Promise.resolve()},unlock:function(){window.__ori.push('unlock')}};
  try{Object.defineProperty(screen,'orientation',{configurable:true,get:function(){return o}})}catch(e){}`}
  ${mode === 'installed' ? `var mm=window.matchMedia.bind(window);window.matchMedia=function(q){return /display-mode: standalone/.test(q)?{matches:true,media:q,addListener:function(){},removeListener:function(){},addEventListener:function(){},removeEventListener:function(){}}:mm(q)};` : ''}
  try{Object.defineProperty(document,'fullscreenElement',{configurable:true,get:function(){return window.__fs}})}catch(e){}
})();`;

(async () => {
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  ME.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: ME.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ['Worship Team'], adminFor: [], masterAdmin: false, archived: false, isMinor: false, churchMember: true });
  await put('users/' + ME.uid, { uid: ME.uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin',
    teams: ['Worship Team'], adminFor: [], masterAdmin: false, churchMember: true });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript' : e === '.css' ? 'text/css' : e === '.png' ? 'image/png' : 'application/octet-stream') + (e === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-ori-' + process.pid),
    '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errors = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const evl = makeEval(send, 'ori');
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ')', true); await sleep(800);

  let stubId = null;
  const openAs = async (page, mode) => {
    if (stubId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: stubId });
    stubId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: STUB(mode) })).identifier;
    errors.length = 0;
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page }); await sleep(7000);
  };
  const calls = async () => JSON.parse(String(await evl('JSON.stringify(window.__ori||[])')));
  const fsTo = (what) => evl('(function(){var el=null;'
    + (what === 'video' ? 'el=document.createElement("iframe");el.src="https://www.youtube-nocookie.com/embed/synthetic";document.body.appendChild(el);'
      : what === 'other' ? 'el=document.createElement("div");document.body.appendChild(el);' : '')
    + 'window.__fs=el;document.dispatchEvent(new Event("fullscreenchange"));return 1})()');

  try {
    for (const page of ['app.html', 'hub.html', 'watch.html', 'videos.html']) {
      console.log('\n' + page);
      await openAs(page, 'browser');
      ok('  loads egbc-orientation.js', String(await evl('!!window.EGBCOrientation')) === 'true');
      ok('  in the browser, nothing is asked when it opens', JSON.stringify(await calls()) === '[]', JSON.stringify(await calls()));
      await fsTo('video'); await sleep(200);
      ok('  a YouTube player going full screen asks for landscape', JSON.stringify(await calls()) === '["lock:landscape"]', JSON.stringify(await calls()));
      await fsTo('none'); await sleep(200);
      ok('  leaving full screen lets go', JSON.stringify(await calls()) === '["lock:landscape","unlock"]', JSON.stringify(await calls()));
      await fsTo('other'); await sleep(200);
      ok('  something that is not a video asks for nothing', JSON.stringify(await calls()) === '["lock:landscape","unlock"]', JSON.stringify(await calls()));
    }

    console.log('\nThe installed app (app.html)');
    await openAs('app.html', 'installed');
    ok('  asks for upright when it opens', JSON.stringify(await calls()) === '["lock:portrait"]', JSON.stringify(await calls()));
    await fsTo('video'); await sleep(200); await fsTo('none'); await sleep(200);
    ok('  landscape for the video, then let go and upright again', JSON.stringify(await calls()) === '["lock:portrait","lock:landscape","unlock","lock:portrait"]', JSON.stringify(await calls()));

    console.log('\nAn iPhone (no lock)');
    await openAs('watch.html', 'iphone');
    await fsTo('video'); await sleep(200); await fsTo('none'); await sleep(200);
    ok('  nothing is thrown', errors.length === 0, errors.join(' | '));
  } finally {
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
