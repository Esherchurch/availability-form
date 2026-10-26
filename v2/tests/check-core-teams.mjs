/* Core teams cover chosen teams, independently (FINDINGS-churchhq H-15;
 * Martin, 26 Oct 2026: "We need a kids church and youth core team and a
 * worship core team. They need to be independent").
 *
 *   node tests/check-core-teams.mjs              (from v2/, the dev emulators up)
 *   BREAK=covers node tests/check-core-teams.mjs  core teams cover nothing: must fail
 *   BREAK=wide node tests/check-core-teams.mjs    Core Team covering Kids Church too
 *                                                 (church-wide, as before): must fail
 *
 * In a browser at 375, made-up people who are NOT master admins:
 *   - a plain Worship Core Team member: Worship & AV's pages, the rota
 *     planner and Sunday's service plan; never the Session planner, Present
 *     or Kids Church's rota;
 *   - a plain Kids & Youth Core Team member: the reverse;
 * each checked in the Menu, the hub's Sundays card, the app's spaces, and
 * the covers the server writes on their record for the rules. And a master
 * admin's Home choice: "Home shows: Core Team" lists no Kids Church jobs.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9817, SERVE = 8981, PW = 'test-only-password';
const BREAK = process.env.BREAK || '';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const PEOPLE = {
  wcore: { email: 'ct.wcore@example.invalid', member: 'ab_ct_wcore', name: 'CT Worship Core Synthetic', teams: ['Core Team'], masterAdmin: false },
  kycore: { email: 'ct.kycore@example.invalid', member: 'ab_ct_kycore', name: 'CT Kids Youth Core Synthetic', teams: ['Kids & Youth Core Team'], masterAdmin: false },
  master: { email: 'ct.master@example.invalid', member: 'ab_ct_master', name: 'CT Master Synthetic', teams: [], masterAdmin: true }
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
const listOf = async (p, field) => { const r = await req(8181, 'GET', DOCS + '/' + p, undefined, OWNER); if (r.status !== 200) return null; const f = (JSON.parse(r.body).fields || {})[field]; return f ? ((f.arrayValue || {}).values || []).map((x) => x.stringValue).sort() : null; };
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
  let body = fs.readFileSync(f, 'utf8');
  if (/\.html$/.test(f)) { const h = /<head[^>]*>/i.exec(body); if (h) body = body.slice(0, h.index + h[0].length) + NO_SW + body.slice(h.index + h[0].length); }
  if (url === '/egbc-auth.js' && BREAK) {
    const was = body;
    /* covers: core teams cover nothing. wide: Core Team church-wide again. */
    if (BREAK === 'covers') body = body.replace('  function coversOf(teams) {\n    var out = [];', '  function coversOf(teams) {\n    return [];\n    var out = [];').replace('  function coversOf(teams) {\r\n    var out = [];', '  function coversOf(teams) {\r\n    return [];\r\n    var out = [];');
    if (BREAK === 'wide') body = body.replace("coreFor: ['Worship Team', 'AV Team', 'Choir'] }", "coreFor: ['Worship Team', 'AV Team', 'Choir', 'Kids Church', 'Youth Worship'] }");
    if (body === was) console.log('  FAIL  the break did not apply');
  }
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : /\.json$/.test(f) ? 'application/json' : 'text/html') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-coreteams-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

let exitCode = 1;
try {
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: [], masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: [], masterAdmin: p.masterAdmin, churchMember: true });
  }
  /* A Kids Church session group, so the Session planner has somebody's to show. */
  await put('planGroups/pg_ct_kids', { name: 'CT Kids group (synthetic)', teamName: 'Kids Church', leaderIds: [], archived: false });

  let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (list.some((x) => x.type === 'page')) break; } catch {} await sleep(500); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); };
  const evl = makeEval(send, 'coreteams');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const signIn = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
  };
  const openHub = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' });
    for (let i = 0; i < 60 && String(await evl('!!(window.EGBCMenu && window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile() && document.getElementById("sundaysCard"))')) !== 'true'; i++) await sleep(400);
    /* The Sundays card is drawn after the events arrive: wait for it. */
    for (let i = 0; i < 40 && !/Sundays/.test(String(await evl('(document.getElementById("sundaysCard")||{textContent:""}).textContent'))); i++) await sleep(400);
    await sleep(800);
  };
  const look = async () => JSON.parse(String(await evl('(function(){var u=[];(function w(n){n.forEach(function(x){if(x.url)u.push(x.url);if(x.children)w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));'
    + 'return JSON.stringify({menu:u,inWorship:EGBCAuth.inTeam("Worship Team"),inKids:EGBCAuth.inTeam("Kids Church"),inYouth:EGBCAuth.inTeam("Youth Worship"),'
    + 'rota:EGBCAuth.visibleRoleTeams()||[],sundays:(document.getElementById("sundaysCard")||{textContent:""}).textContent.replace(/\\s+/g," ")})})()')));
  const spaces = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
    for (let i = 0; i < 60 && String(await evl('!!(window.EGBCApp && EGBCAuth.profile && EGBCAuth.profile())')) !== 'true'; i++) await sleep(400);
    await sleep(1500);
    return JSON.parse(String(await evl('JSON.stringify(EGBCApp.spacesFor(EGBCApp.who()))')) || '[]');
  };

  console.log('\nA plain Worship Core Team member (not a master admin)');
  await signIn('wcore'); await openHub();
  let L = await look();
  ok('counts as on Worship Team, and not on Kids Church or Youth', L.inWorship && !L.inKids && !L.inYouth, JSON.stringify(L).slice(0, 200));
  ok('  the Menu has the rota planner and Sunday\'s service plan', L.menu.includes('Planner.html') && L.menu.includes('SundayServicePlanner.html'), L.menu.join(' '));
  ok('  and NOT the Session planner or Present (Kids Church\'s)', !L.menu.includes('session-planner.html') && !L.menu.includes('present.html'), L.menu.join(' '));
  ok('  the rota shows Worship, AV and Choir, not Kids Church or Youth', ['Worship Team', 'AV Team', 'Choir'].every((t) => L.rota.includes(t)) && !L.rota.includes('Kids Church') && !L.rota.includes('Youth Worship'), L.rota);
  ok('  the hub\'s Sundays card: the service plan, no Session planner', /Sunday service plan/.test(L.sundays) && !/Session planner/.test(L.sundays), L.sundays.slice(0, 160));
  let S = await spaces();
  ok('  the app: Worship & AV\'s space, not Kids Church\'s', S.includes('worship') && !S.includes('kids'), S);

  console.log('\nA plain Kids & Youth Core Team member (not a master admin)');
  await signIn('kycore'); await openHub();
  L = await look();
  ok('counts as on Kids Church and Youth, and not on Worship Team', L.inKids && L.inYouth && !L.inWorship, JSON.stringify(L).slice(0, 200));
  /* The Session planner and Present need the events window's planGroups
     rule to read teamName in myTeams() (FINDINGS-events, 26 Oct 2026):
     until then a core team cannot read its teams' session groups. */
  ok('  the Menu has the rota planner', L.menu.includes('Planner.html'), L.menu.join(' '));
  ok('  and the Session planner and Present (needs the events window\'s planGroups rule)', ['session-planner.html', 'present.html'].every((u) => L.menu.includes(u)), L.menu.join(' '));
  ok('  and NOT Sunday\'s service plan or Core Team\'s charter', !L.menu.includes('SundayServicePlanner.html') && !L.menu.includes('Coreteamcharter.html'), L.menu.join(' '));
  ok('  the rota shows Kids Church and Youth, not Worship or AV', L.rota.includes('Kids Church') && L.rota.includes('Youth Worship') && !L.rota.includes('Worship Team') && !L.rota.includes('AV Team'), L.rota);
  ok('  the hub\'s Sundays card: the rota planner, no service plan', /Rota planner/.test(L.sundays) && !/Sunday service plan/.test(L.sundays), L.sundays.slice(0, 160));
  ok('  and the Session planner (needs the events window\'s planGroups rule)', /Session planner/.test(L.sundays), L.sundays.slice(0, 160));
  S = await spaces();
  ok('  the app: Kids Church\'s space, not Worship & AV\'s', S.includes('kids') && !S.includes('worship'), S);

  console.log('\nWhat the server keeps for the rules (functions/core-teams.js)');
  let wc = null, ky = null;
  for (let i = 0; i < 40; i++) { wc = await listOf('users/' + PEOPLE.wcore.uid, 'covers'); ky = await listOf('users/' + PEOPLE.kycore.uid, 'covers'); if (wc && ky) break; await sleep(500); }
  ok('the Worship Core Team member\'s record covers Worship, AV and Choir', JSON.stringify(wc) === JSON.stringify(['AV Team', 'Choir', 'Worship Team']), JSON.stringify(wc));
  ok('  the Kids & Youth Core Team member\'s, Kids Church, Lazers, ReNu and Youth', JSON.stringify(ky) === JSON.stringify(['Kids Church', 'Lazers', 'ReNu', 'Youth Worship']), JSON.stringify(ky));

  console.log('\nA master admin\'s Home choice (what Martin saw)');
  await signIn('master'); await openHub();
  const home = async (t) => { await evl('chooseTeam(' + JSON.stringify(t) + ');1'); await sleep(1500); return String(await evl('(document.getElementById("sundaysCard")||{textContent:""}).textContent.replace(/\\s+/g," ")')); };
  let h = await home('Core Team');
  ok('"Home shows: Core Team" lists no Session planner', !/Session planner/.test(h) && /Rota planner/.test(h), h.slice(0, 160));
  h = await home('Kids & Youth Core Team');
  ok('  "Home shows: Kids & Youth Core Team" lists it, and no service plan', /Session planner/.test(h) && !/Sunday service plan/.test(h), h.slice(0, 160));
  L = await look();
  ok('  and the master admin\'s Menu still has everything', ['Planner.html', 'SundayServicePlanner.html', 'session-planner.html', 'present.html'].every((u) => L.menu.includes(u)));
  ok('no errors on the pages', errs.length === 0, errs.join(' | '));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  await req(8181, 'DELETE', DOCS + '/planGroups/pg_ct_kids', undefined, OWNER).catch(() => {});
  for (const p of Object.values(PEOPLE)) { await req(8181, 'DELETE', DOCS + '/users/' + p.uid, undefined, OWNER).catch(() => {}); await req(8181, 'DELETE', DOCS + '/addressBook/' + p.member, undefined, OWNER).catch(() => {}); }
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
