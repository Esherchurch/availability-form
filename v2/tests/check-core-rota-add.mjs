/* The Core Team rota: "+ Service" asks first, and a refused listener comes
 * back (the audit's two reds on CoreTeamApp's rota, 20 Oct 2026).
 *
 *   node tests/check-core-rota-add.mjs      (from v2/, the dev emulators up)
 *
 * - "+ Service" used to save a Sunday dated TODAY on one tap, and on a
 *   phone the new line landed out of sight, so the audit saw "no change".
 *   Now it asks the date and kind, as the Planner's does; nothing is saved
 *   until Add; the new line is then on screen and lit.
 * - The rota's listeners had no error callback: one refusal stopped the
 *   rota updating for good, with "Uncaught Error in snapshot listener" on
 *   the console. Here the person loses their access, the token is renewed
 *   (Firestore asks the rules again), and the page must say so quietly and
 *   come back by itself once the access is back.
 * Synthetic throughout. Picture: tests/shots/core-rota-add--375.png
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';
import { watchConsole } from './console-watch.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9785, SERVE = 8997, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const ME = { email: 'cra.core@example.invalid', member: 'ab_cra_core', name: 'Rota Add Core Synthetic' };
const ADD_DATE = '2031-06-01';
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const eventsOn = async (date) => {
  const r = await req(8181, 'POST', DOCS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'events' }],
    where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: date } } } } }, OWNER);
  return JSON.parse(r.body || '[]').filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), f: x.document.fields }));
};
const todayIso = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };
const USER = () => ({ uid: ME.uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin',
  teams: ['Core Team', 'Worship Team'], adminFor: [], masterAdmin: false, churchMember: true });

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  ME.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: ME.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ['Core Team', 'Worship Team'], adminFor: [], masterAdmin: false, archived: false, isMinor: false, churchMember: true });
  await put('users/' + ME.uid, USER());
  for (const e of await eventsOn(ADD_DATE)) await del('events/' + e.id);

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-cra-' + process.pid),
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
  const evl = makeEval(send, 'cra');

  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ')', true); await sleep(800);
    watch.reset();
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/CoreTeamApp.html' }); await sleep(9000);
    await evl('(function(){openSection("rota");return 1})()'); await sleep(5000);

    console.log('"+ Service" on the Core Team rota (375)');
    const ADD = 'button[onclick="addSingleLine()"]';
    ok('  the rota is drawn, with its "+ Service"', String(await evl('!!document.querySelector(\'' + ADD + '\') && document.querySelectorAll("#eventList [data-ev]").length>=0')) === 'true');
    const beforeToday = (await eventsOn(todayIso())).length;
    await evl('(function(){document.querySelector(\'' + ADD + '\').click();return 1})()'); await sleep(1500);
    ok('  a tap opens a sheet asking the date and the kind',
      String(await evl('!!document.getElementById("crAddService") && !!document.getElementById("crAddDate") && !!document.getElementById("crAddType")')) === 'true');
    ok('  and saves nothing', (await eventsOn(todayIso())).length === beforeToday);
    const small = Number(await evl('[].filter.call(document.querySelectorAll("#crAddService button, #crAddService input, #crAddService select"),function(x){return x.getBoundingClientRect().height<44}).length'));
    ok('  everything in it is 44px', small === 0, String(small));
    const wide = Number(await evl('document.documentElement.scrollWidth'));
    ok('  and it fits 375px', wide <= 375, String(wide));
    await evl('(function(){document.querySelector("#crAddService [data-close]").click();return 1})()'); await sleep(800);
    ok('  Cancel closes it, still having saved nothing', String(await evl('!document.getElementById("crAddService")')) === 'true' && (await eventsOn(todayIso())).length === beforeToday);

    await evl('(function(){document.querySelector(\'' + ADD + '\').click();return 1})()'); await sleep(1200);
    await evl('(function(){document.getElementById("crAddDate").value=' + JSON.stringify(ADD_DATE) + ';document.getElementById("crAddGo").click();return 1})()');
    let added = []; for (let i = 0; i < 20 && !added.length; i++) { await sleep(300); added = await eventsOn(ADD_DATE); }
    ok('  Add saves one Sunday service, on the date chosen, in What\u2019s On like the Planner\u2019s',
      added.length === 1 && added[0].f.type.stringValue === 'Sunday Morning Worship' && added[0].f.whatsOn && added[0].f.whatsOn.booleanValue === true,
      JSON.stringify(added.map(a => ({ id: a.id, type: a.f.type, whatsOn: a.f.whatsOn }))));
    await sleep(1500);
    const seen = added[0] ? JSON.parse(await evl('(function(){var r=document.querySelector(\'[data-ev="' + added[0].id + '"]\');if(!r)return JSON.stringify({row:false});'
      + 'var b=r.getBoundingClientRect();return JSON.stringify({row:true,top:Math.round(b.top),bottom:Math.round(b.bottom),h:innerHeight,lit:r.style.boxShadow})})()')) : {};
    ok('  and the new line is on screen, lit', seen.row && seen.top < seen.h && seen.bottom > 0 && /245, 158, 11|f59e0b/.test(seen.lit || ''), JSON.stringify(seen));
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, 'core-rota-add--375.png'), Buffer.from(shot.data, 'base64'));

    console.log('\nA refused listener comes back');
    const rowsBefore = Number(await evl('document.querySelectorAll("#eventList [data-ev]").length'));
    await put('users/' + ME.uid, Object.assign(USER(), { teams: [] }));
    await evl('firebase.auth(EGBCAuth.app).currentUser.getIdToken(true).then(function(){return 1})', true);
    let note = ''; for (let i = 0; i < 30 && !note; i++) { await sleep(300); note = String(await evl('(document.getElementById("rotaListenNote")||{}).textContent||""')); }
    ok('  losing access mid-way says so, quietly', /Reconnecting/.test(note), note || '(no note)');
    ok('  and keeps what it last drew', Number(await evl('document.querySelectorAll("#eventList [data-ev]").length')) === rowsBefore);
    await put('users/' + ME.uid, USER());
    let gone = false; for (let i = 0; i < 40 && !gone; i++) { await sleep(500); gone = String(await evl('!document.getElementById("rotaListenNote")')) === 'true'; }
    ok('  with the access back, it reconnects by itself and the note goes', gone);
    for (const e of await eventsOn(ADD_DATE)) await del('events/' + e.id);
    let left = true; for (let i = 0; i < 20 && left; i++) { await sleep(300); left = String(await evl('!!document.querySelector(\'[data-ev="' + (added[0] || {}).id + '"]\')')) === 'true'; }
    ok('  and it is live again: a line deleted elsewhere leaves the page', !left);
    const uncaught = watch.errors.filter(e => /Uncaught Error in snapshot listener/.test(e));
    ok('  no uncaught listener error on the console', uncaught.length === 0, uncaught.join(' | '));
  } finally {
    for (const e of await eventsOn(ADD_DATE)) await del('events/' + e.id);
    await put('users/' + ME.uid, USER());
    ws.close(); chrome.kill(); server.close();
  }
  const pass = R.filter(Boolean).length;
  console.log('\n' + pass + '/' + R.length + ' passed');
  process.exit(pass === R.length ? 0 : 1);
})();
