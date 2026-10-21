/* Four things the reviewing window found while making the Kids Church guide
 * (22 Oct 2026), each checked here:
 *
 *   node tests/check-guide-fixes.mjs      (from v2/, the dev emulators up)
 *
 * 1. SAFEGUARDING IS THE LEAD AND DEPUTY'S: a team admin's Menu has no
 *    Safeguarding, Safeguarding settings or Due for deletion (a master admin
 *    keeps them), and a team admin cannot read another person's DBS dates.
 * 2. ROTA PLANNER is offered to the leaders Planner.html lets in (a Kids
 *    Church admin), not only Core Team.
 * 3. THE APP'S KIDS TEAM TAB has Session planner and Present for somebody
 *    in a plan group, and not for somebody who is not.
 * 4. NO ONE CHURCH'S WORDS: the availability form shows the church's own
 *    name and "Team member login"; the Email Compiler's heading is the
 *    church's name and the sender's team.
 * At 375. Synthetic people; the church's details are put back afterwards.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9795, SERVE = 8987, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const CHURCH = 'Synthetic Chapel GF';
const PEOPLE = {
  kidsAdmin: { email: 'gf.kidsadmin@example.invalid', member: 'ab_gf_kidsadmin', teams: [], adminFor: ['Kids Church'] },
  master:    { email: 'gf.master@example.invalid', member: 'ab_gf_master', teams: ['Core Team'], adminFor: [], masterAdmin: true },
  planner:   { email: 'gf.planner@example.invalid', member: 'ab_gf_planner', teams: ['Kids Church'], adminFor: [] },
  kidsOnly:  { email: 'gf.kidsonly@example.invalid', member: 'ab_gf_kidsonly', teams: ['Kids Church'], adminFor: [] },
  worshipAdmin: { email: 'gf.worship@example.invalid', member: 'ab_gf_worship', teams: ['Worship Team'], adminFor: ['Worship Team'] },
  office:    { email: 'gf.office@example.invalid', member: 'ab_gf_office', teams: ['Church office'], adminFor: [] }
};
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 500) : ''))); };
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
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';

(async () => {
  for (const [k, p] of Object.entries(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    const name = 'GF ' + k + ' Synthetic';
    await put('addressBook/' + p.member, { name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: !!p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor, masterAdmin: !!p.masterAdmin, churchMember: true });
  }
  /* A plan group whose team the planner is on; the other Kids member is in none
     because this group is theirs only by leaderIds. */
  await put('planGroups/pg_gf', { name: 'GF Synthetic Group', kind: 'children', leaderIds: [PEOPLE.planner.member], teamName: '', siteId: '' });
  await put('leaderChecks/ab_gf_master', { name: 'GF master', dbsStatus: 'current', dbsSeen: '2025-01-01', trainingDate: '2025-01-01', siteId: '' });
  const before = await req(8181, 'GET', DOCS + '/churchSettings/details', undefined, OWNER);
  const had = before.status === 200 ? JSON.parse(before.body).fields || null : null;
  await req(8181, 'PATCH', DOCS + '/churchSettings/details?updateMask.fieldPaths=name', { fields: { name: { stringValue: CHURCH } } }, OWNER);

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-gf-' + process.pid),
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
  const evl = makeEval(send, 'gf');
  const as = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
    if (who) await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true);
    await sleep(800);
  };
  const open = async (page, wait) => { await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page }); await sleep(wait || 9000); };
  const menuNames = () => evl('JSON.stringify((function(){var o=[];(function w(n){n.forEach(function(x){o.push(x.title);if(x.children)w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));return o})())').then(s => JSON.parse(String(s) || '[]'));
  const SG = ['Safeguarding', 'Safeguarding settings', 'Due for deletion'];

  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });

    console.log('1. Safeguarding is the lead and deputy\u2019s');
    await as('kidsAdmin'); await open('hub.html?app=0');
    let names = await menuNames();
    ok('  a Kids Church admin\u2019s Menu has no Safeguarding, settings or Due for deletion', !SG.some(n => names.includes(n)), JSON.stringify(names));
    const read = String(await evl('EGBCAuth.db.collection("leaderChecks").doc("ab_gf_master").get().then(function(){return "READ IT"},function(e){return e.code})', true));
    ok('  and cannot read somebody else\u2019s DBS dates', /permission-denied/.test(read), read);
    console.log('\n2. Rota planner for the leaders the Planner lets in');
    ok('  the Kids Church admin is offered the Rota planner', names.includes('Rota planner'), JSON.stringify(names));
    await as('master'); await open('hub.html?app=0');
    names = await menuNames();
    ok('  a master admin keeps all three safeguarding entries', SG.every(n => names.includes(n)), JSON.stringify(names));

    console.log('\n3. The app\u2019s Kids Team tab (375)');
    const teamTab = async (who) => {
      await as(who); await open('app.html', 10000);
      await evl('(function(){var b=document.createElement("button");b.setAttribute("data-act","go:kids:team");b.style.display="none";document.body.appendChild(b);b.click();b.remove();return 1})()'); await sleep(2500);
      return String(await evl('(document.querySelector("main")||document.body).innerText'));
    };
    let t = await teamTab('planner');
    ok('  somebody in a plan group has Session planner and Present', /Session planner/.test(t) && /Present/.test(t), t.slice(0, 400));
    t = await teamTab('kidsOnly');
    ok('  somebody on Kids Church but in no plan group has neither', !/Session planner/.test(t) && !/\bPresent\b/.test(t), t.slice(0, 400));

    console.log('\n4. No one church\u2019s words');
    await as(null); await open('index.html', 8000);
    const idx = String(await evl('document.body.innerText'));
    ok('  the availability form shows the church\u2019s own name', idx.includes(CHURCH) || idx.includes(CHURCH.toUpperCase()), idx.slice(0, 300));
    ok('  and "Team member login", not "Worship & AV", nor another church\u2019s name', /Team member login/i.test(idx) && !/Worship & AV Member Login/i.test(idx) && !/Esher Green/i.test(idx), idx.slice(0, 300));
    await as('worshipAdmin'); await open('EmailBuilder2.html', 10000);
    let h = String(await evl('document.getElementById("headerTitle").innerText'));
    ok('  the Email Compiler\u2019s heading: the church, and the sender\u2019s team', h.includes(CHURCH) && /Worship/.test(h) && !/EGBC/.test(h), h);
    const foot = String(await evl('(document.getElementById("footWho")||{textContent:""}).textContent'));
    ok('  and its footer the same, with no other church\u2019s address', foot === h && !/esherchurch/i.test(String(await evl('document.body.innerText'))), foot);
    await as('office'); await open('EmailBuilder2.html', 10000);
    h = String(await evl('document.getElementById("headerTitle").innerText'));
    ok('  for the church office, the church alone', h === CHURCH, h);
  } finally {
    if (had && had.name) await req(8181, 'PATCH', DOCS + '/churchSettings/details?updateMask.fieldPaths=name', { fields: { name: had.name } }, OWNER);
    else await req(8181, 'PATCH', DOCS + '/churchSettings/details?updateMask.fieldPaths=name', { fields: {} }, OWNER);
    await del('planGroups/pg_gf'); await del('leaderChecks/ab_gf_master');
    ws.close(); chrome.kill(); server.close();
  }
  const pass = R.filter(Boolean).length;
  console.log('\n' + pass + '/' + R.length + ' passed');
  process.exit(pass === R.length ? 0 : 1);
})();
