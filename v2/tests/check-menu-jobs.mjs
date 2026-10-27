/* The Menu by the jobs, not team names (the events window's F-297, the
 * reviewer, 27 Oct 2026), as the synthetic parish: St Aidan's gives the
 * finance job to "Treasury", the trustees to its "PCC" and the office to
 * its "Parish office" in team jobs (churchSettings/teamJobs).
 *
 *   node tests/check-menu-jobs.mjs                  (from v2/, the dev emulators up)
 *   BREAK=money   node tests/check-menu-jobs.mjs    Payments by the money team's name again: must fail
 *   BREAK=trustee node tests/check-menu-jobs.mjs    the trustees by the setting's team again: must fail
 *   BREAK=office  node tests/check-menu-jobs.mjs    Book a room without the office job: must fail
 *   BREAK=maint   node tests/check-menu-jobs.mjs    the app's Maintenance space by the team name again: must fail
 *
 * Signed in on the hub as each made-up person, it asks the real Menu
 * (EGBCMenu.forPerson(EGBCMenu.who())) and Book a room's page guard
 * (EGBCAuth.guardVerdict, the decision require() makes):
 *   - Treasury is offered Payments; a team called "Finance" is not;
 *   - the PCC is offered Safeguarding risks; the Elders are not;
 *   - the Parish office is offered Book a room, and its guard lets them in;
 *     so is a site's bookings admin; a plain member is neither;
 *   - in the app, the Fabric team (the buildings job) has the Maintenance
 *     space; a team called "Maintenance" does not.
 * Then the parish's team jobs are taken away again.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9831, SERVE = 8995, PW = 'test-only-password';
const BREAK = process.env.BREAK || '';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BREAKS = {
  money: ['/egbc-menu.js', "feature: 'payments', job: 'finance',", "feature: 'payments', money: true,"],
  trustee: ['/egbc-auth.js', "if (PERMS.ready && global.EGBCTeamJobs) return EGBCAuth.myJobs().indexOf('trustees') !== -1;", ''],
  office: ['/egbc-auth.js', "if (EGBCAuth.myJobs().indexOf('office') !== -1) return true;", ''],
  maint: ['/egbc-app.js', "var mine = (s.job && A && A.permsReady && A.permsReady())", 'var mine = (false)']
};
let applied = !BREAK;

const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const b = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(b ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(b);
});
const val = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : typeof v === 'object' ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';

const PARISH = { finance: ['Treasury'], trustees: ['PCC'], office: ['Parish office'], buildings: ['Fabric team'] };
const PEOPLE = {
  treasury: { teams: ['Treasury'] },
  finance: { teams: ['Finance'] },
  pcc: { teams: ['PCC'] },
  elders: { teams: ['Elders'] },
  office: { teams: ['Parish office'] },
  bookings: { teams: [] },
  fabric: { teams: ['Fabric team'], app: true },
  maint: { teams: ['Maintenance'], app: true },
  member: { teams: [] }
};
for (const [k, p] of Object.entries(PEOPLE)) { p.email = 'mj.' + k + '@example.invalid'; p.member = 'ab_mj_' + k; p.name = 'MJ ' + k + ' Synthetic'; }

const server = http.createServer((q, s) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
  const f = path.join(V2, url.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f);
  if (/\.(html|js)$/.test(f)) {
    let t = body.toString('utf8');
    if (/\.html$/.test(f)) { const h = /<head[^>]*>/i.exec(t); if (h) t = t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length); }
    const br = BREAKS[BREAK];
    if (br && url === br[0]) { const n = t.replace(/\r\n/g, '\n'); if (n.includes(br[1])) { t = n.replace(br[1], br[2]); applied = true; } }
    body = Buffer.from(t, 'utf8');
  }
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : 'text/html') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-menujobs-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let x = ''; r.on('data', c => x += c); r.on('end', () => res(JSON.parse(x))); }).on('error', rej));

let hadJobs = null, exitCode = 1;
try {
  console.log('St Aidan\'s team jobs: finance to Treasury, trustees to the PCC, the office to the Parish office');
  const before = await req(8181, 'GET', DOCS + '/churchSettings/teamJobs', undefined, OWNER);
  hadJobs = before.status === 200 ? JSON.parse(before.body) : null;
  await req(8181, 'DELETE', DOCS + '/churchSettings/teamJobs', undefined, OWNER);
  await put('churchSettings/teamJobs', PARISH);
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: [], masterAdmin: false, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: [], masterAdmin: false, churchMember: true });
  }
  await put('bookingSettings/site_mj', { bookingsAdmins: [PEOPLE.bookings.member] });

  let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (list.some((x) => x.type === 'page')) break; } catch {} await sleep(500); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  const evl = makeEval(send, 'menujobs');
  await send('Runtime.enable'); await send('Page.enable');
  const go = (u) => send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + u });
  const seen = {};
  for (const [k, p] of Object.entries(PEOPLE)) {
    await go('__signin.html'); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
    await go('hub.html');
    for (let i = 0; i < 50 && String(await evl('!!(window.EGBCMenu && window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile())')) !== 'true'; i++) await sleep(400);
    await evl('EGBCAuth.loadPerms().then(function(){return 1})', true); await sleep(3000);
    seen[k] = JSON.parse(String(await evl('(function(){var u=[];(function w(n){(n||[]).forEach(function(x){if(x.url)u.push(x.url.split("?")[0]);if(x.children)w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));'
      + 'return JSON.stringify({menu:u,room:EGBCAuth.guardVerdict({leadsOrCore:true}),jobs:EGBCAuth.myJobs()})})()')) || '{"menu":[]}');
    if (p.app) {
      await go('app.html');
      for (let i = 0; i < 40 && String(await evl('!!(window.EGBCApp && EGBCAuth.profile && EGBCAuth.profile())')) !== 'true'; i++) await sleep(400);
      await evl('EGBCAuth.loadPerms().then(function(){return 1})', true); await sleep(1000);
      seen[k].spaces = JSON.parse(String(await evl('JSON.stringify(EGBCApp.spacesFor(EGBCApp.who()))')) || '[]');
    }
  }
  if (BREAK) ok('the break "' + BREAK + '" applied', applied);
  const has = (k, url) => (seen[k].menu || []).includes(url);
  const said = (k) => JSON.stringify(seen[k]);

  console.log('\nPayments: the finance job');
  ok('Treasury is offered Payments', has('treasury', 'payments.html'), said('treasury'));
  ok('  a team called "Finance" is not (the parish gave the job to Treasury)', !has('finance', 'payments.html'), said('finance'));

  console.log('\nSafeguarding risks: the trustees job');
  ok('the PCC is offered Safeguarding risks', has('pcc', 'safeguarding-risk.html'), said('pcc'));
  ok('  the Elders are not (EGBC\'s trustees, not the parish\'s)', !has('elders', 'safeguarding-risk.html'), said('elders'));

  console.log('\nBook a room: leaders, core teams, the office job and the bookings admins');
  ok('the Parish office is offered Book a room', has('office', 'rooms.html'), said('office'));
  ok('  and its page lets them in', seen.office.room === '', said('office'));
  ok('a site\'s bookings admin is offered it, and let in', has('bookings', 'rooms.html') && seen.bookings.room === '', said('bookings'));
  ok('a plain member is neither', !has('member', 'rooms.html') && seen.member.room !== '', said('member'));

  console.log('\nThe app\'s Maintenance space: the buildings job');
  ok('the Fabric team has it', (seen.fabric.spaces || []).includes('maint'), said('fabric'));
  ok('  a team called "Maintenance" does not (the parish gave the job to its Fabric team)', !(seen.maint.spaces || []).includes('maint'), said('maint'));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  for (const p of Object.values(PEOPLE)) { if (p.uid) await del('users/' + p.uid).catch(() => {}); await del('addressBook/' + p.member).catch(() => {}); }
  await del('bookingSettings/site_mj').catch(() => {});
  await del('churchSettings/teamJobs').catch(() => {});
  if (hadJobs) await req(8181, 'PATCH', DOCS + '/churchSettings/teamJobs', { fields: hadJobs.fields || {} }, OWNER).catch(() => {});
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
