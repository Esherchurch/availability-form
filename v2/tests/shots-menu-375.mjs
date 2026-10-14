/* Pictures of the Menu on a phone (375px), opened from the hub, for two
 * synthetic people: a master admin and a Kids Church leader.
 *
 *   node tests/shots-menu-375.mjs      (from v2/, the dev emulators up)
 *
 * Not a check: it writes tests/shots/menu-375--*.png for Martin to look at
 * (14 Oct 2026, after Safeguarding settings went missing from the Menu).
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9771, SERVE = 8987, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  'master-admin': { email: 'menu.master@example.invalid', member: 'ab_menu375_master', teams: ['Core Team'], adminFor: ['Core Team'], master: true },
  'kids-church-leader': { email: 'menu.kids@example.invalid', member: 'ab_menu375_kids', teams: ['Kids Church'], adminFor: [], master: false }
};
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
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: 'Menu ' + p.teams[0] + ' Synthetic', email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.master, archived: false });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: 'Menu ' + p.teams[0] + ' Synthetic', memberId: p.member, status: 'active',
      linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor, masterAdmin: p.master });
  }
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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-menu375-' + process.pid),
    '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  await send('Runtime.enable'); await send('Page.enable');
  const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); return r.result && r.result.value; };
  for (const [label, p] of Object.entries(PEOPLE)) {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await ev('firebase.auth(EGBCAuth.app).signOut()'); await sleep(300);
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').then(()=>1)'); await sleep(800);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(11000);
    await ev("(function(){var b=document.querySelector('#pickList .pick-t');if(b)b.click();return 1})()"); await sleep(1200);
    await ev("(function(){try{openTools()}catch(e){}return 1})()"); await sleep(1500);
    /* Every heading open, so the whole Menu is in the picture. */
    await ev("(function(){document.querySelectorAll('.egbc-menu .grp').forEach(function(g){g.classList.add('open');var b=g.querySelector('.grp-body');if(b)b.style.display='block'});return 1})()");
    await sleep(600);
    const h = Number(await ev("(function(){var p=document.querySelector('.egbc-menu');return p?Math.ceil(p.scrollHeight+200):1600})()")) || 1600;
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: Math.min(Math.max(h, 812), 6000), deviceScaleFactor: 2, mobile: true });
    await sleep(800);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const out = path.join(SHOTS, 'menu-375--' + label + '.png');
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    console.log('wrote ' + path.relative(V2, out) + '  (' + String(await ev("(function(){return [].map.call(document.querySelectorAll('.egbc-menu .grp > span:not(.arw):not(.dot):not(.cnt), .egbc-menu .tool .nm'),function(n){return n.textContent.trim()}).filter(Boolean).join(' | ')})()")).slice(0, 400) + ')');
  }
  server.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
