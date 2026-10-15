/* "Viewing as" can't be missed (Martin, 14 Oct 2026: he thought
 * permissions were broken, because the preview's only sign was a strip at
 * the bottom).
 *
 *   node tests/check-viewas-top.mjs      (from v2/, the dev emulators up)
 *
 * A master admin viewing the site as a Worship Team member, on the hub and
 * two other pages, at 375px and 1280px:
 *   - a strip at the very top says "Viewing as a Worship Team member";
 *   - "Back to me" ends it, and the strip goes;
 *   - with no preview, there is no strip.
 * Pictures: tests/shots/viewas-top--{hub,groups}-375.png
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9777, SERVE = 8993, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const ME = { email: 'vat.master@example.invalid', member: 'ab_vat_master', name: 'Preview Master Synthetic' };

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
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  ME.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: ME.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true, archived: false, isMinor: false, churchMember: true });
  await put('users/' + ME.uid, { uid: ME.uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin',
    teams: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true, churchMember: true });

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-vat-' + process.pid),
    '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; } watch.handle(m); };
  await send('Runtime.enable'); await send('Page.enable');
  const evl = makeEval(send, 'vat');
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ')', true); await sleep(800);

  const open = async (page, w) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 700 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 700 });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page }); await sleep(page === 'hub.html' ? 10000 : 7000);
    await evl("(function(){var b=document.querySelector('#pickList .pick-t');if(b)b.click();return 1})()"); await sleep(2000);
  };
  const strip = () => evl('(function(){var s=document.getElementById("egbc-viewas-top");if(!s)return "null";var r=s.getBoundingClientRect();'
    + 'return JSON.stringify({first:document.body.firstElementChild===s,top:Math.round(r.top+scrollY),text:s.innerText.replace(/\\s+/g," ").trim(),'
    + 'fits:r.right<=innerWidth+0.5,sideways:document.documentElement.scrollWidth>innerWidth+1})})()').then(s => JSON.parse(String(s)));

  /* View the site as a Worship Team member, as the bottom strip would set it. */
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(3000);
  await evl('sessionStorage.setItem("egbc_view_as", JSON.stringify({ team: "Worship Team", admin: false }));1');

  for (const w of [375, 1280]) {
    for (const page of ['hub.html', 'groups.html', 'view-only-rota.html']) {
      watch.reset();
      await open(page, w);
      const s = await strip();
      ok('  ' + page + ' at ' + w + 'px: "Viewing as a Worship Team member" at the very top', !!s && s.first && s.top <= 1
        && /^Viewing as a Worship Team member Back to me$/.test(s.text) && s.fits && !s.sideways, JSON.stringify(s));
      if (w === 375 && page !== 'view-only-rota.html') {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(SHOTS, 'viewas-top--' + page.replace('.html', '') + '-375.png'), Buffer.from(shot.data, 'base64'));
      }
    }
  }
  console.log('\nBack to me');
  await open('groups.html', 375);
  await evl('document.getElementById("egbc-viewas-back").click();1'); await sleep(7000);
  ok('  ends the preview', String(await evl('sessionStorage.getItem("egbc_view_as")||""')) === '');
  ok('  and the strip has gone', String(await evl('!!document.getElementById("egbc-viewas-top")')) === 'false');
  await open('hub.html', 1280);
  ok('  with no preview, no strip on the hub either', String(await evl('!!document.getElementById("egbc-viewas-top")')) === 'false');
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
