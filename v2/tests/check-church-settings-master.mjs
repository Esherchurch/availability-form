/* Church settings is for master admins only (the reviewing window, 21 Oct
 * 2026: any area admin could open it by its address).
 *
 *   node tests/check-church-settings-master.mjs   (from v2/, emulators up)
 *
 * An area admin and a Church office member are refused ("Master admins
 * only") and their Menus do not offer it; a master admin opens it and the
 * Menu offers it.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9851, SERVE = 9057, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
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
const PEOPLE = {
  areaAdmin: { email: 'csm.area@example.invalid', member: 'ab_csm_area', name: 'Settings Area Synthetic', teams: ['Kids Church'], adminFor: ['Kids Church'], masterAdmin: false },
  office: { email: 'csm.office@example.invalid', member: 'ab_csm_office', name: 'Settings Office Synthetic', teams: ['Church office'], adminFor: [], masterAdmin: false },
  /* On Core Team and leading a team: the old Menu entry offered it to them. */
  coreAdmin: { email: 'csm.core@example.invalid', member: 'ab_csm_core', name: 'Settings Core Synthetic', teams: ['Core Team', 'Worship Team'], adminFor: ['Worship Team'], masterAdmin: false },
  master: { email: 'csm.master@example.invalid', member: 'ab_csm_master', name: 'Settings Master Synthetic', teams: ['Worship Team'], adminFor: [], masterAdmin: true }
};
for (const p of Object.values(PEOPLE)) {
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
  p.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: true });
  await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, churchMember: true });
}
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
  const e = path.extname(f).toLowerCase();
  let body = fs.readFileSync(f);
  if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
  s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-csm-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (Array.isArray(list) && list.find(x => x.type === 'page')) break; } catch {} await sleep(400); }
const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise(r => ws.onopen = r);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
const evl = makeEval(send, 'csm');
const look = async (p) => {
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/church-settings.html' }); await sleep(7000);
  const page = JSON.parse(String(await evl('JSON.stringify({blocked:document.body.getAttribute("data-egbc-blocked")||"",card:(document.getElementById("egbc-blocked-card")||{innerText:""}).innerText})')));
  /* Their Menu, as the hub draws it. */
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html?app=0' }); await sleep(6000);
  page.menu = String(await evl('(function(){var u=[];(function w(n){(n||[]).forEach(function(x){if(x.url)u.push(x.url);w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));return u.indexOf("church-settings.html")>-1})()')) === 'true';
  return page;
};
try {
  let L = await look(PEOPLE.areaAdmin);
  ok('an area admin (Kids Church) is refused: "Master admins only"', !!L.blocked && /Master admins only/.test(L.card), JSON.stringify(L));
  ok('  and their Menu does not offer it', L.menu === false);
  L = await look(PEOPLE.office);
  ok('a Church office member is refused too', !!L.blocked && /Master admins only/.test(L.card), JSON.stringify(L));
  ok('  and their Menu does not offer it', L.menu === false);
  L = await look(PEOPLE.coreAdmin);
  ok('a Core Team member who leads Worship is refused', !!L.blocked && /Master admins only/.test(L.card), JSON.stringify(L));
  ok('  and their Menu does not offer it', L.menu === false);
  L = await look(PEOPLE.master);
  ok('a master admin opens it', !L.blocked, JSON.stringify(L));
  ok('  and the Menu offers it', L.menu === true);
} finally { server.close(); chrome.kill(); }
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some(v => !v) ? 1 : 0);
