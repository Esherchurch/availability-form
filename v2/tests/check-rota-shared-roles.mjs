/* A role can hold several people, and everything that reads the rota says
 * so (the events window's F-204: "a reminder can silently not be sent").
 *
 *   node tests/check-rota-shared-roles.mjs      (from v2/, the dev emulators up, functions included)
 *
 * One service with two people in "Backing vocals":
 *   - the Rota Planner's Excel export names both;
 *   - the Youth app's "My rota" (myYouthHub) finds it for the second one.
 * The day-before reminder (check-notify-send) and "your family this week"
 * (check-family) have their own two-in-one-role checks.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9779, SERVE = 8995, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  master: { email: 'rsr.master@example.invalid', member: 'ab_rsr_master', name: 'Rota Master Synthetic', teams: ['Core Team'], adminFor: ['Core Team'], master: true },
  first: { email: 'rsr.first@example.invalid', member: 'ab_rsr_first', name: 'First Singer Synthetic', teams: ['Worship Team'], adminFor: [], master: false },
  second: { email: 'rsr.second@example.invalid', member: 'ab_rsr_second', name: 'Second Singer Synthetic', teams: ['Youth Worship', 'Worship Team'], adminFor: [], master: false, minor: true }
};
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : (v && typeof v === 'object') ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const day = (n) => { const d = new Date(Date.now() + n * 86400000), p = (x) => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };

(async () => {
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId; p.idToken = up.idToken;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.master, archived: false, isMinor: !!p.minor, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin',
      teams: p.teams, adminFor: p.adminFor, masterAdmin: p.master, churchMember: true });
    const again = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.idToken = again.idToken;
  }
  const by = (k) => ({ id: PEOPLE[k].member, name: PEOPLE[k].name });
  await put('events/ev_rsr_1', { date: day(5), type: 'Sunday Morning Worship', startTime: '10:30', termLabel: 'Synthetic', teams: ['Worship Team'], roles: ['Backing vocals'],
    archived: false, draft: false, assignments: { 'Backing vocals': [by('first'), by('second')] } });

  /* ---- the Youth app's "My rota", for the SECOND of the two ---------- */
  console.log('\nthe Youth app\'s "My rota" (myYouthHub)');
  const r = await req(5101, 'POST', '/egbc-worship-planner/europe-west2/myYouthHub', { data: {} }, { Authorization: 'Bearer ' + PEOPLE.second.idToken });
  const res = (JSON.parse(r.body || '{}').result) || {};
  ok('  the second singer in Backing vocals finds the service', (res.rota || []).some((x) => x.date === day(5) && (x.roles || []).includes('Backing vocals')), r.body.slice(0, 300));

  /* ---- the Rota Planner's Excel export ------------------------------- */
  console.log('\nthe Rota Planner\'s Excel export');
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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-rsr-' + process.pid),
    '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res2, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, rr => { let d = ''; rr.on('data', c => d += c); rr.on('end', () => res2(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(rr => { const i = ++id; pend.set(i, rr); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(rr => ws.onopen = rr);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  await send('Runtime.enable'); await send('Page.enable');
  const evl = makeEval(send, 'rsr');
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE.master.email) + ',' + JSON.stringify(PW) + ')', true); await sleep(800);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/Planner.html' }); await sleep(12000);
  /* Catch the sheet instead of saving a file. */
  const rows = String(await evl('(function(){if(typeof XLSX==="undefined"||!window.exportToExcel)return "no export";var got=null;'
    + 'var j=XLSX.utils.json_to_sheet;XLSX.utils.json_to_sheet=function(d){got=d;return j.apply(this,arguments)};XLSX.writeFile=function(){};'
    + 'exportToExcel();XLSX.utils.json_to_sheet=j;return JSON.stringify((got||[]).filter(function(r){return r.Date===' + JSON.stringify(day(5)) + '}))})()'));
  let row = null; try { row = JSON.parse(rows)[0]; } catch (e) { /* the message is in rows */ }
  ok('  both people in Backing vocals are in the export', !!row && row['Backing vocals'] === 'First Singer Synthetic, Second Singer Synthetic', rows.slice(0, 300));

  await req(8181, 'DELETE', DOCS + '/events/ev_rsr_1', undefined, OWNER);
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
