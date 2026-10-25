/* The hub's own address on Church settings > Church details (25 Oct 2026;
 * Comms asked): every email links to it.
 *
 *   node tests/check-hub-address.mjs          (from v2/, the dev emulators up)
 *   BREAK=1 node tests/check-hub-address.mjs  serves the page's old Save (the fields
 *                                             it drew, replacing the rest): must fail
 *
 * In a browser at 375, made-up people:
 *   - with no address set, a master admin is told plainly it is not set yet,
 *     sets one, and it is saved, the church's name with it;
 *   - an admin who is not a master sees it, cannot change it, and saving the
 *     church's name keeps it;
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9809, SERVE = 8995, PW = 'test-only-password';
const BREAK = !!process.env.BREAK;
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const PEOPLE = {
  master: { email: 'ha.master@example.invalid', member: 'ab_ha_master', name: 'HA Master Synthetic', teams: ['Core Team'], adminFor: [], masterAdmin: true },
  admin: { email: 'ha.admin@example.invalid', member: 'ab_ha_admin', name: 'HA Admin Synthetic', teams: [], adminFor: ['Kids Church'], masterAdmin: false }
};
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
const getDetails = async () => { const r = await req(8181, 'GET', DOCS + '/churchSettings/details', undefined, OWNER); return r.status === 200 ? Object.fromEntries(Object.entries(JSON.parse(r.body).fields || {}).map(([k, v]) => [k, v.stringValue])) : null; };
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';

const server = http.createServer((q, s) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
  const f = path.join(V2, url.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f, 'utf8');
  if (/\.html$/.test(f)) { const h = /<head[^>]*>/i.exec(body); if (h) body = body.slice(0, h.index + h[0].length) + NO_SW + body.slice(h.index + h[0].length); }
  /* The break: Save as it was - the drawn fields only, replacing the rest. */
  if (BREAK && url === '/church-settings.html') body = body.replace("hubUrl: D.hubUrl || '', updatedAt: new Date().toISOString(), updatedBy: u.uid || ''\n    }, { merge: true })", "updatedAt: new Date().toISOString(), updatedBy: u.uid || ''\n    })").replace("hubUrl: D.hubUrl || '', updatedAt: new Date().toISOString(), updatedBy: u.uid || ''\r\n    }, { merge: true })", "updatedAt: new Date().toISOString(), updatedBy: u.uid || ''\r\n    })");
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'text/html') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-hubaddr-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

let before = null, exitCode = 1;
try {
  before = await getDetails();
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, churchMember: true });
  }
  await put('churchSettings/details', { name: 'Synthetic Church', enquiryEmail: '', logoUrl: '', logoPath: '', updatedAt: 'x', updatedBy: 'x' });

  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); };
  const evl = makeEval(send, 'hubaddr');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const as = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/church-settings.html' });
    for (let i = 0; i < 40 && String(await evl('!!document.getElementById("c-hub")')) !== 'true'; i++) await sleep(400);
  };
  const look = async () => JSON.parse(String(await evl('JSON.stringify({value:(document.getElementById("c-hub")||{}).value,disabled:!!(document.getElementById("c-hub")||{}).disabled,text:(document.getElementById("form")||{textContent:""}).textContent.replace(/\\s+/g," ")})')));

  console.log('\nA master admin, no address set');
  await as('master');
  let L = await look();
  ok('is told plainly it is not set yet', /Not set yet/.test(L.text) && L.value === '', L.text.slice(0, 200));
  ok('  and may type one', L.disabled === false);
  await evl('(function(){document.getElementById("c-hub").value="https://hub.example.invalid/";document.getElementById("c-save").click();return 1})()'); await sleep(2000);
  let d = await getDetails();
  ok('  saving keeps it, with the church\'s name', d && d.hubUrl === 'https://hub.example.invalid/' && d.name === 'Synthetic Church', JSON.stringify(d));

  console.log('\nAn admin who is not a master');
  await as('admin');
  L = await look();
  ok('sees the address, and cannot change it', L.value === 'https://hub.example.invalid/' && L.disabled === true, JSON.stringify(L).slice(0, 200));
  await evl('(function(){document.getElementById("c-name").value="Synthetic Church Renamed";document.getElementById("c-save").click();return 1})()'); await sleep(2000);
  d = await getDetails();
  ok('  saving the name keeps the address', d && d.name === 'Synthetic Church Renamed' && d.hubUrl === 'https://hub.example.invalid/', JSON.stringify(d));
  ok('no errors on the page', errs.length === 0, errs.join(' | '));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  if (before) await req(8181, 'PATCH', DOCS + '/churchSettings/details', { fields: Object.fromEntries(Object.entries(before).map(([k, v]) => [k, { stringValue: v }])) }, OWNER).catch(() => {});
  else await req(8181, 'DELETE', DOCS + '/churchSettings/details', undefined, OWNER).catch(() => {});
  for (const p of Object.values(PEOPLE)) { await req(8181, 'DELETE', DOCS + '/users/' + p.uid, undefined, OWNER).catch(() => {}); await req(8181, 'DELETE', DOCS + '/addressBook/' + p.member, undefined, OWNER).catch(() => {}); }
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
