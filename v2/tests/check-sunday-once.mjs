/* Enter a Sunday once, in the browser (Martin, 15 Oct 2026).
 *
 *   node tests/check-sunday-once.mjs      (from v2/, the dev emulators up)
 *
 * - The Rota Planner's Sunday row has "In What's On", a public title, the
 *   service time and a line for the public, and each saves to the rota as
 *   it is changed (rule 13: no Save button).
 * - The copy the server keeps (functions/rota-whatson.js mirrorFor, the
 *   same function the trigger uses) shows ONCE in What's On, signed in,
 *   and ONCE on the website's embed, signed out.
 * - A service not ticked shows in neither.
 * The trigger itself is check-rota-whatson-live.mjs; the decision is
 * check-rota-whatson.mjs.
 * Pictures: tests/shots/sunday-once--{planner-1440,whatson-375}.png
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';
import { watchConsole } from './console-watch.mjs';
import { mirrorFor } from '../functions/rota-whatson.js';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9783, SERVE = 8999, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const ME = { email: 'so.master@example.invalid', member: 'ab_so_master', name: 'Sunday Once Master Synthetic' };
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => v instanceof Date ? { timestampValue: v.toISOString() } : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) } : v === null ? { nullValue: null }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : (typeof v === 'object') ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
/* Wait for a saved document to say what we expect (a busy emulator can
   take seconds), up to 10s; returns the last read either way. */
const waitDoc = async (p, test) => { let d = null; for (let i = 0; i < 40; i++) { d = await getDoc(p); if (d && test(d)) return d; await sleep(250); } return d; };
const getDoc = async (p) => { const r = await req(8181, 'GET', DOCS + '/' + p, undefined, OWNER); return r.status === 200 ? JSON.parse(r.body).fields || {} : null; };
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* A Sunday about two months ahead: upcoming everywhere, and clear of the
   other checks' Sundays (the Planner draws one Sunday service a date). */
const SUNDAY = (() => { const d = new Date(Date.now() + 61 * 86400000); while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  const p = (x) => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
const PUB = 'so_sunday_public', PRIV = 'so_sunday_private';
const TITLE = 'Synthetic Sunday Once Service', PRIVATE_TITLE = 'Synthetic Never Public Service';

async function mirror(id, rota) {
  const m = mirrorFor(id, rota);
  if (m) await put('calEvents/rota_' + id, m); else await del('calEvents/rota_' + id);
}
async function tidy() {
  for (const id of [PUB, PRIV]) { await del('events/' + id); await del('calEvents/rota_' + id); }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  ME.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: ME.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ['Core Team', 'Worship Team'], adminFor: ['Core Team'], masterAdmin: true, archived: false, isMinor: false, churchMember: true });
  await put('users/' + ME.uid, { uid: ME.uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin',
    teams: ['Core Team', 'Worship Team'], adminFor: ['Core Team'], masterAdmin: true, churchMember: true });
  await tidy();
  const base = { date: SUNDAY, termLabel: 'Synthetic', type: 'Sunday Morning Worship', description: 'private notes', teams: ['Worship Team', 'AV Team'],
    startTime: '08:00', endTime: '11:30', roles: ['Keyboard'], archived: false };
  await put('events/' + PUB, Object.assign({}, base, { whatsOn: true, serviceTime: '10:00', publicTitle: 'Synthetic placeholder', speaker: 'Synthetic Speaker' }));
  await put('events/' + PRIV, Object.assign({}, base, { type: 'Sunday Team Practice', whatsOn: false, serviceTime: '19:30', publicTitle: PRIVATE_TITLE }));

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-so-' + process.pid),
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
  const evl = makeEval(send, 'so');
  const open = async (page, w, wait) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 700 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 700 });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page }); await sleep(wait || 8000);
  };
  const count = (t) => evl('(function(){var n=0;document.querySelectorAll(".t").forEach(function(x){if(x.textContent.trim()===' + JSON.stringify(t) + ')n++});return n})()').then(Number);

  try {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ')', true); await sleep(800);

    console.log('The Rota Planner (1440px)');
    watch.reset();
    await open('Planner.html', 1440, 12000);
    const box = '[data-whatson="' + PUB + '"]';
    const has = String(await evl('!!document.querySelector(\'' + box + '\')'));
    ok('  the Sunday row has the What\'s On fields', has === 'true',
      await evl('JSON.stringify({rows:document.querySelectorAll(\'[data-date="' + SUNDAY + '"]\').length,boxes:document.querySelectorAll("[data-whatson]").length,'
        + 'mine:[].map.call(document.querySelectorAll(\'[data-date="' + SUNDAY + '"]\'),function(r){var b=r.querySelector("[data-whatson]");return b?b.getAttribute("data-whatson"):"none"})})'));
    await evl('(function(){var i=document.querySelector(\'' + box + ' [data-f=publicTitle]\');i.value=' + JSON.stringify(TITLE) + ';i.dispatchEvent(new Event("blur"));'
      + 'var s=document.querySelector(\'' + box + ' [data-f=serviceTime]\');s.value="10:30";s.dispatchEvent(new Event("change"));'
      + 'var d=document.querySelector(\'' + box + ' [data-f=publicDescription]\');d.value="All welcome, synthetic.";d.dispatchEvent(new Event("blur"));return 1})()');
    let f = await waitDoc('events/' + PUB, (d) => d.publicTitle?.stringValue === TITLE && d.serviceTime?.stringValue === '10:30'
      && d.publicDescription?.stringValue === 'All welcome, synthetic.');
    ok('  the title, time and line save as they are changed', f && f.publicTitle?.stringValue === TITLE && f.serviceTime?.stringValue === '10:30'
      && f.publicDescription?.stringValue === 'All welcome, synthetic.', JSON.stringify(f && { t: f.publicTitle, s: f.serviceTime, d: f.publicDescription }));
    await evl('(function(){var c=document.querySelector(\'' + box + ' [data-f=whatsOn]\');c.checked=false;c.dispatchEvent(new Event("change"));return 1})()');
    ok('  unticking saves', (await waitDoc('events/' + PUB, (d) => d.whatsOn?.booleanValue === false))?.whatsOn?.booleanValue === false);
    await evl('(function(){var c=document.querySelector(\'' + box + ' [data-f=whatsOn]\');if(!c.checked){c.checked=true;c.dispatchEvent(new Event("change"))}return 1})()');
    ok('  and ticking again', (await waitDoc('events/' + PUB, (d) => d.whatsOn?.booleanValue === true))?.whatsOn?.booleanValue === true);
    await evl('(function(){var r=document.querySelector(\'' + box + '\');if(r)r.scrollIntoView({block:"center"});return 1})()'); await sleep(400);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, 'sunday-once--planner-1440.png'), Buffer.from(shot.data, 'base64'));
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    /* What the trigger writes, from the rota as the Planner left it. */
    f = await getDoc('events/' + PUB);
    const rotaNow = Object.assign({}, base, { whatsOn: f.whatsOn.booleanValue, serviceTime: f.serviceTime.stringValue,
      publicTitle: f.publicTitle.stringValue, publicDescription: f.publicDescription.stringValue, speaker: 'Synthetic Speaker' });
    await mirror(PUB, rotaNow);
    await mirror(PRIV, Object.assign({}, base, { whatsOn: false, serviceTime: '19:30', publicTitle: PRIVATE_TITLE }));

    console.log('\nWhat\'s On, signed in (375px)');
    watch.reset();
    await open('whatson.html', 375, 9000);
    ok('  the service is there once', await count(TITLE) === 1, String(await count(TITLE)));
    ok('  the service that is not public is not', await count(PRIVATE_TITLE) === 0);
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, 'sunday-once--whatson-375.png'), Buffer.from(shot2.data, 'base64'));
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    console.log('\nThe website\'s embed, signed out');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2000);
    await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(500);
    await open('whatson-embed.html', 1000, 8000);
    ok('  the service is there once', await count(TITLE) === 1, String(await count(TITLE)));
    ok('  the service that is not public is not', await count(PRIVATE_TITLE) === 0);

    /* "Editing its title in the rota updates What's On": a second title,
       through the same path. */
    await mirror(PUB, Object.assign({}, rotaNow, { publicTitle: TITLE + ' renamed' }));
    await open('whatson-embed.html', 1000, 8000);
    ok('  a new title on the rota replaces the old one there', await count(TITLE + ' renamed') === 1 && await count(TITLE) === 0);
  } finally {
    await tidy();
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(async e => { console.error(e); try { await tidy(); } catch {} process.exit(1); });
