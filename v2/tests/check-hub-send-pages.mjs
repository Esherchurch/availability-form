/* The pages reach hubSend: a real rota, PDFs and all, and an events-window
 * page through EGBCChurch.send (PLAN-hub-send.md, 21 Oct 2026).
 *
 *   node tests/check-hub-send-pages.mjs      (from v2/, the dev emulators up, functions included)
 *
 * - Planner.html's "Send" for one person builds the real rota PDFs and
 *   sends them through hubSend: the outbox row is Church HQ's, source
 *   hub:rota, with the PDFs attached (by name).
 * - bookings-admin.html sends through EGBCChurch.send -> egbc-email.js ->
 *   hubSend, as the page's own kind (hub:booking); an address the
 *   bookings do not hold is refused in words the page can show.
 * - Signed out, EGBCAuth.sendEmail answers "Please sign in" and sends
 *   nothing.
 * The rules of hubSend itself: tests/check-hub-send.mjs. Synthetic only.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9789, SERVE = 8993, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const ME = { email: 'hsp.master@example.invalid', member: 'ab_hsp_master', name: 'HSP Master Synthetic' };
const MEMBER = { id: 'ab_hsp_member', email: 'hsp.member@example.invalid', name: 'Hsp Member Synthetic' };
const HIRER = 'hsp.hirer@example.invalid';
const RUN = Date.now().toString(36);
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 500) : ''))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : typeof v === 'object' ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const plainOf = (f) => {
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('booleanValue' in f) return f.booleanValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('arrayValue' in f) return (f.arrayValue.values || []).map(plainOf);
  if ('mapValue' in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, plainOf(v)]));
  return null;
};
const outboxTo = async (to) => {
  const r = await req(8181, 'POST', DOCS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'emailOutbox' }],
    where: { fieldFilter: { field: { fieldPath: 'to' }, op: 'ARRAY_CONTAINS', value: { stringValue: to } } } } }, OWNER);
  return JSON.parse(r.body || '[]').filter(x => x.document).map(x => Object.fromEntries(Object.entries(x.document.fields).map(([k, v]) => [k, plainOf(v)])))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
};
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SUNDAY = (() => { const d = new Date(Date.now() + 75 * 86400000); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

(async () => {
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  ME.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: ME.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ['Core Team', 'Worship Team'], adminFor: ['Worship Team'], masterAdmin: true, archived: false, isMinor: false, churchMember: true });
  await put('users/' + ME.uid, { uid: ME.uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin',
    teams: ['Core Team', 'Worship Team'], adminFor: ['Worship Team'], masterAdmin: true, churchMember: true });
  await put('addressBook/' + MEMBER.id, { name: MEMBER.name, email: MEMBER.email, markers: ['Worship Team'], adminFor: [], masterAdmin: false, archived: false, isMinor: false });
  await put('events/ev_hsp', { date: SUNDAY, termLabel: 'Synthetic Term HSP', type: 'Sunday Morning Worship', archived: false, teams: ['Worship Team'],
    roles: ['Keyboard'], startTime: '08:00', endTime: '11:30', assignments: { Keyboard: { id: MEMBER.id, name: MEMBER.name } } });
  await put('bookings/bk_hsp', { requester: { name: 'Hirer Synthetic', email: HIRER }, siteId: 'site_hsp', status: 'confirmed' });

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-hsp-' + process.pid),
    '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  await send('Runtime.enable'); await send('Page.enable');
  const evl = makeEval(send, 'hsp');
  const sign = async (signIn) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
    if (signIn) await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true);
    await sleep(800);
  };
  const json = async (expr) => { try { return JSON.parse(String(await evl(expr, true) || '{}')); } catch { return {}; } };

  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await sign(true);

    console.log('The Rota Planner: one person\u2019s rota, with its PDFs');
    const before = (await outboxTo(MEMBER.email)).length;
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/Planner.html' }); await sleep(14000);
    await evl('(function(){window.confirm=function(){return true};window.alert=function(m){window.__alerted=m};var t=document.getElementById("sendTermSelect");if(t)t.value="";sendSingleRota(' + JSON.stringify(MEMBER.id) + ');return 1})()');
    let rows = [];
    for (let i = 0; i < 90; i++) { await sleep(1000); rows = (await outboxTo(MEMBER.email)).slice(before); if (rows.length) break; }
    const row = rows[rows.length - 1] || {};
    const pdfs = (row.attachments || []).map(a => a.filename).filter(n => /\.pdf$/i.test(n));
    ok('  the rota goes through the hub: Church HQ\u2019s Resend, as a rota', row.via === 'churchhq' && row.source === 'hub:rota' && row.ok === true,
      JSON.stringify({ via: row.via, source: row.source, ok: row.ok, error: row.error, alerted: await evl('window.__alerted||""') }));
    ok('  with its PDFs attached', pdfs.length >= 1, JSON.stringify(row.attachments));
    ok('  to that one person', JSON.stringify(row.to) === JSON.stringify([MEMBER.email]), JSON.stringify(row.to));

    console.log('\nAn events-window page, through EGBCChurch.send');
    const subj = 'Synthetic booking note ' + RUN;
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/bookings-admin.html' }); await sleep(9000);
    const res = await json('EGBCChurch.send({ to: [' + JSON.stringify(HIRER) + '], subject: ' + JSON.stringify(subj) + ', html: "<p>Synthetic</p>" }).then(function(r){return JSON.stringify(r)})');
    rows = (await outboxTo(HIRER)).filter(x => x.subject === subj);
    ok('  bookings-admin sends as a booking email, through the hub', res.ok === true && rows.length === 1 && rows[0].source === 'hub:booking' && rows[0].via === 'churchhq',
      JSON.stringify({ res, rows: rows.map(x => [x.source, x.via]) }));
    const res2 = await json('EGBCChurch.send({ to: ["stranger.hsp@example.invalid"], subject: "x", html: "<p>x</p>" }).then(function(r){return JSON.stringify(r)})');
    ok('  and an address the bookings do not hold is refused, in words the page can show', res2.ok === false && /not someone|not known/i.test(res2.error || ''), JSON.stringify(res2));

    console.log('\nSigned out');
    await sign(false);
    const res3 = await json('EGBCAuth.sendEmail({ source: "compiler", to: [' + JSON.stringify(MEMBER.email) + '], subject: "x", html: "x" }).then(function(r){return JSON.stringify(r)})');
    ok('  nothing is sent, and it says why', res3.ok === false && /sign in/i.test(res3.error || ''), JSON.stringify(res3));
  } finally {
    await del('events/ev_hsp'); await del('bookings/bk_hsp');
    ws.close(); chrome.kill(); server.close();
  }
  const pass = R.filter(Boolean).length;
  console.log('\n' + pass + '/' + R.length + ' passed');
  process.exit(pass === R.length ? 0 : 1);
})();
