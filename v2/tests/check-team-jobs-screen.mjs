/* Who does each job, on Teams & groups (FINDINGS-churchhq H-9, 26 Oct 2026).
 *
 *   node tests/check-team-jobs-screen.mjs          (from v2/, the dev emulators up)
 *   BREAK=1 node tests/check-team-jobs-screen.mjs  taking off a job's last team puts
 *                                                  EGBC's back, not "nobody": must fail
 *
 * In a browser at 375, made-up people:
 *   - a master admin sees all 15 jobs with EGBC's teams today (nothing
 *     stored), adds a second team to a job, takes teams off, and with the
 *     last one gone the job says "Nobody does this yet" - stored as [];
 *   - pastoral care with nobody says care requests stay closed;
 *   - an office member (not a master) sees the jobs and cannot change them.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9813, SERVE = 8999, PW = 'test-only-password';
const BREAK = !!process.env.BREAK;
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const PEOPLE = {
  master: { email: 'tj.master@example.invalid', member: 'ab_tj_master', name: 'TJ Master Synthetic', teams: ['Core Team'], adminFor: [], masterAdmin: true },
  office: { email: 'tj.office@example.invalid', member: 'ab_tj_office', name: 'TJ Office Synthetic', teams: ['Church office'], adminFor: ['Church office'], masterAdmin: false }
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
/* churchSettings/teamJobs as { job: [teams] }, or null when not stored. */
const getJobs = async () => {
  const r = await req(8181, 'GET', DOCS + '/churchSettings/teamJobs', undefined, OWNER);
  if (r.status !== 200) return null;
  const f = JSON.parse(r.body).fields || {};
  return Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'updatedAt' && k !== 'updatedBy')
    .map(([k, v]) => [k, ((v.arrayValue || {}).values || []).map((x) => x.stringValue)]));
};
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
  /* The break: the last team off deletes the job, so EGBC's team comes back. */
  if (BREAK && url === '/teams-admin.html') {
    const was = body;
    body = body.replace("saveJob(job, now.filter(t => t !== b.dataset.drop), b.closest('.job'));",
      "{ const left = now.filter(t => t !== b.dataset.drop); saveJob(job, left.length ? left : firebase.firestore.FieldValue.delete(), b.closest('.job')); }");
    if (body === was) console.log('  FAIL  the break did not apply (the page has changed)');
  }
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'text/html') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-tjscreen-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

let exitCode = 1;
try {
  await req(8181, 'DELETE', DOCS + '/churchSettings/teamJobs', undefined, OWNER).catch(() => {});
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, churchMember: true });
  }

  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); };
  const evl = makeEval(send, 'tjscreen');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const as = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/teams-admin.html' });
    for (let i = 0; i < 40 && String(await evl('!!document.querySelector("[data-jobrow=office]")')) !== 'true'; i++) await sleep(400);
  };
  const ROW = (job) => '(function(){var r=document.querySelector("[data-jobrow=' + job + ']");'
    + 'return JSON.stringify(r?{text:r.textContent.replace(/\\s+/g," ").trim(),'
    + 'chips:[].map.call(r.querySelectorAll(".chip"),function(c){return c.firstChild.textContent.trim()}),'
    + 'select:!!r.querySelector("select"),drops:r.querySelectorAll("button[data-drop]").length}:null)})()';
  const row = async (job) => JSON.parse(String(await evl(ROW(job))));
  const pick = async (job, team) => {
    await evl('(function(){var s=document.querySelector("select[data-job=' + job + ']");s.value=' + JSON.stringify(team)
      + ';s.dispatchEvent(new Event("change",{bubbles:true}));return 1})()'); await sleep(1500);
  };
  const drop = async (job, team) => {
    await evl('(function(){var b=[].find.call(document.querySelectorAll("[data-jobrow=' + job + '] button[data-drop]"),function(x){return x.getAttribute("data-drop")===' + JSON.stringify(team) + '});'
      + 'if(b)b.click();return b?1:0})()'); await sleep(1500);
  };

  console.log('\nA master admin, nothing stored (EGBC today)');
  await as('master');
  const n = Number(await evl('document.querySelectorAll("[data-jobrow]").length'));
  ok('all 15 jobs are listed', n === 15, n);
  let r1 = await row('office');
  ok('  the office is the Church office, as today', r1 && r1.chips.join() === 'Church office', r1 && r1.text);
  r1 = await row('trustees');
  ok('  the trustees are the Elders', r1 && r1.chips.join() === 'Elders', r1 && r1.text);
  ok('  and nothing has been written for EGBC', (await getJobs()) === null);
  await pick('trustees', 'Choir');
  let d = await getJobs();
  ok('adds a second team to a job (several teams, H-9)', d && JSON.stringify(d.trustees) === '["Elders","Choir"]', JSON.stringify(d));
  r1 = await row('trustees');
  ok('  and the page shows both', r1 && r1.chips.join() === 'Elders,Choir', r1 && r1.text);
  ok('  the other jobs are left as they were (still not stored)', d && Object.keys(d).join() === 'trustees', JSON.stringify(d));
  await drop('trustees', 'Elders'); await drop('trustees', 'Choir');
  d = await getJobs();
  ok('takes the last team off: stored as nobody ([])', d && Array.isArray(d.trustees) && d.trustees.length === 0, JSON.stringify(d));
  r1 = await row('trustees');
  ok('  and the page says "Nobody does this yet: choose a team."', r1 && /Nobody does this yet: choose a team/.test(r1.text) && !r1.chips.length, r1 && r1.text);
  await drop('pastoral', 'Pastoral');
  r1 = await row('pastoral');
  ok('pastoral care with nobody: care requests stay closed', r1 && /care requests stay closed until a team is named/.test(r1.text), r1 && r1.text);

  console.log('\nAn office member, not a master');
  await as('office');
  r1 = await row('trustees');
  ok('sees who does each job', r1 && /Nobody does this yet/.test(r1.text), r1 && r1.text);
  ok('  and cannot change it', r1 && !r1.select && r1.drops === 0 && /A master admin changes who does each job/.test(String(await evl('document.getElementById("jobs").textContent'))), r1 && JSON.stringify(r1));
  ok('no errors on the page', errs.length === 0, errs.join(' | '));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  await req(8181, 'DELETE', DOCS + '/churchSettings/teamJobs', undefined, OWNER).catch(() => {});
  for (const p of Object.values(PEOPLE)) { await req(8181, 'DELETE', DOCS + '/users/' + p.uid, undefined, OWNER).catch(() => {}); await req(8181, 'DELETE', DOCS + '/addressBook/' + p.member, undefined, OWNER).catch(() => {}); }
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
