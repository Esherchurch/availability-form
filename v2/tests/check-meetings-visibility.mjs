/* Who sees which meetings (27 Oct 2026; Martin: "The only meetings a
 * non-admin should see is the ones they are invited to. They can be given
 * permission (e.g. a small group leader) but not by default.").
 *
 *   node tests/check-meetings-visibility.mjs          (from v2/, the dev emulators up)
 *   BREAK=all node tests/check-meetings-visibility.mjs     everybody sees every meeting: must fail
 *   BREAK=perm node tests/check-meetings-visibility.mjs    the permission does nothing: must fail
 *   BREAK=covers node tests/check-meetings-visibility.mjs  a core team's covered teams left out: must fail
 *
 * Invited: named on it (a role on the rota), or it is for one of my teams
 * or a team my core team covers. More is the Permissions screen's
 * "meetingsAll" (an exception for one person here), never on by default; a
 * master admin sees all. One rule, EGBCAuth.invitedTo / roomForMe, and each
 * surface is looked at: Meetings (meeting.html), the hub's meetings,
 * Core Team > Meetings and the app's (egbc-core-meetings.js), and a pasted
 * address for somebody else's meeting.
 *
 * At 375, made-up people and meetings, all put back afterwards: a member on
 * no team; a Kids Church member; a Worship Team member (named on one more
 * meeting); a Kids & Youth Core Team member; a small group leader on no
 * team, without and then with the permission; a master admin.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9827, SERVE = 8991, PW = 'test-only-password';
const BREAK = process.env.BREAK || '';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const PEOPLE = {
  none: { email: 'mv.none@example.invalid', member: 'ab_mv_none', name: 'MV No Team Synthetic', teams: [], master: false },
  kids: { email: 'mv.kids@example.invalid', member: 'ab_mv_kids', name: 'MV Kids Synthetic', teams: ['Kids Church'], master: false },
  worship: { email: 'mv.worship@example.invalid', member: 'ab_mv_worship', name: 'MV Worship Synthetic', teams: ['Worship Team'], master: false },
  kycore: { email: 'mv.kycore@example.invalid', member: 'ab_mv_kycore', name: 'MV KY Core Synthetic', teams: ['Kids & Youth Core Team'], master: false },
  sglead: { email: 'mv.sglead@example.invalid', member: 'ab_mv_sglead', name: 'MV Small Group Leader Synthetic', teams: [], master: false },
  master: { email: 'mv.master@example.invalid', member: 'ab_mv_master', name: 'MV Master Synthetic', teams: [], master: true }
};
const ROOMS = [
  { key: 'mv-kids', label: 'MV Kids room', url: 'https://example.invalid/mv-kids', teams: ['Kids Church'], hostTeams: [] },
  { key: 'mv-worship', label: 'MV Worship room', url: 'https://example.invalid/mv-worship', teams: ['Worship Team', 'AV Team'], hostTeams: [] },
  { key: 'mv-elders', label: 'MV Elders room', url: 'https://example.invalid/mv-elders', teams: ['Elders'], hostTeams: [] },
  { key: 'mv-office', label: 'MV Office room', url: 'https://example.invalid/mv-office', teams: ['Church office'], hostTeams: [] }
];
const d = new Date(Date.now() + 864e5);
const DAY = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const EVENTS = {
  mv_kids: { type: 'Kids Church Meeting', teams: ['Kids Church'], videoRoom: 'mv-kids' },
  mv_worship: { type: 'Worship Team Meeting', teams: ['Worship Team'], videoRoom: 'mv-worship' },
  mv_elders: { type: 'Elders Meeting', teams: ['Elders'], videoRoom: 'mv-elders' },
  mv_named: { type: 'Planning Meeting', teams: [], videoRoom: 'mv-office', roles: ['Host'], assignments: { Host: { id: 'ab_mv_worship', name: 'MV Worship Synthetic' } } }
};
const ALL_EV = Object.keys(EVENTS).sort(), ALL_ROOMS = ROOMS.map(r => r.key).sort();
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
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

/* The breaks, applied to egbc-auth.js as it is served. */
const BREAKS = {
  all: ["seesAllMeetings: function () { return EGBCAuth.isMaster() || EGBCAuth.may('meetingsAll'); },", 'seesAllMeetings: function () { return true; },'],
  perm: ["seesAllMeetings: function () { return EGBCAuth.isMaster() || EGBCAuth.may('meetingsAll'); },", 'seesAllMeetings: function () { return EGBCAuth.isMaster(); },'],
  covers: ['      mine = mine.concat(coversOf(mine));\n      if ((ev.teams', '      if ((ev.teams']
};
const server = http.createServer((q, s) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
  const f = path.join(V2, url.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f);
  if (/\.(html|js)$/.test(f)) {
    let t = body.toString('utf8');
    if (/\.html$/.test(f)) { const h = /<head[^>]*>/i.exec(t); if (h) t = t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length); }
    if (BREAK && url === '/egbc-auth.js') {
      const was = t; t = t.replace(/\r\n/g, '\n').replace(BREAKS[BREAK][0], BREAKS[BREAK][1]);
      if (t === was.replace(/\r\n/g, '\n')) console.log('  FAIL  the break did not apply');
    }
    body = Buffer.from(t, 'utf8');
  }
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : /\.png$/.test(f) ? 'image/png' : 'text/html') + (/\.png$/.test(f) ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-meetvis-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let x = ''; r.on('data', c => x += c); r.on('end', () => res(JSON.parse(x))); }).on('error', rej));

let hadVideo = null, exitCode = 1;
try {
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: [], masterAdmin: p.master, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: [], masterAdmin: p.master, churchMember: true });
  }
  const before = await req(8181, 'GET', DOCS + '/churchSettings/video', undefined, OWNER);
  hadVideo = before.status === 200 ? JSON.parse(before.body) : null;
  await put('churchSettings/video', { churchId: 'egbc', rooms: ROOMS, roomsByKey: Object.fromEntries(ROOMS.map(r => [r.key, { teams: r.teams, hostTeams: [], members: false }])), byType: {} });
  for (const [id, ev] of Object.entries(EVENTS)) await put('events/' + id, Object.assign({ date: DAY, termLabel: 'Synthetic', description: 'Synthetic', startTime: '19:30', endTime: '20:30', archived: false }, ev));

  let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (list.some((x) => x.type === 'page')) break; } catch {} await sleep(500); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); };
  const evl = makeEval(send, 'meetvis');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const go = async (u) => { await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + u }); };
  const signIn = async (who) => {
    await go('__signin.html'); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
  };
  const ids = (s) => JSON.parse(String(s || '[]'));
  /* The links a list offers: meetings by their event, rooms by themselves. */
  const LINKS = '(function(root){var ev=[],rm=[];[].forEach.call((root||document).querySelectorAll("a[href*=\\"meeting.html?room=\\"]"),function(a){var u=new URL(a.getAttribute("href"),location.href);var e=u.searchParams.get("event");if(e){if(/^mv_/.test(e)&&ev.indexOf(e)===-1)ev.push(e)}else{var r=u.searchParams.get("room");if(/^mv-/.test(r)&&rm.indexOf(r)===-1)rm.push(r)}});return JSON.stringify({ev:ev.sort(),rooms:rm.sort()})})';
  const surfaces = async () => {
    await go('hub.html');
    for (let i = 0; i < 60 && String(await evl('!!(window.EGBCMenu && EGBCAuth.profile && EGBCAuth.profile())')) !== 'true'; i++) await sleep(400);
    await sleep(5000);
    const hub = ids(await evl('JSON.stringify(typeof MEETINGS==="undefined"?["(none)"]:MEETINGS.map(function(e){return e.id}).filter(function(i){return /^mv_/.test(i)}).sort())'));
    /* Core Team > Meetings and the app's Meetings: egbc-core-meetings.js. */
    await evl('new Promise(function(ok){var s=document.createElement("script");s.src="egbc-core-meetings.js?v=x";s.onload=function(){var d=document.createElement("div");d.id="__mv";document.body.appendChild(d);EGBCCoreMeetings.mount({into:d});setTimeout(function(){ok(1)},4000)};document.head.appendChild(s)})', true);
    const core = JSON.parse(String(await evl(LINKS + '(document.getElementById("__mv"))')));
    await go('meeting.html'); await sleep(6000);
    const lobby = JSON.parse(String(await evl(LINKS + '(document.getElementById("lobby"))')));
    return { hub, core, lobby };
  };
  const refused = async (u) => {
    await go(u); await sleep(5000);
    return /Not one of your meetings/.test(String(await evl('document.body.innerText')));
  };
  const expect = {
    none: { ev: [], rooms: [] },
    kids: { ev: ['mv_kids'], rooms: ['mv-kids'] },
    worship: { ev: ['mv_named', 'mv_worship'], rooms: ['mv-worship'] },
    kycore: { ev: ['mv_kids'], rooms: ['mv-kids'] },
    sglead: { ev: [], rooms: [] },
    sgleadPerm: { ev: ALL_EV, rooms: ALL_ROOMS },
    master: { ev: ALL_EV, rooms: ALL_ROOMS }
  };
  const show = (a) => a.length ? a.join(', ') : 'none';
  const run = async (key, who) => {
    const x = expect[key];
    const s = await surfaces();
    ok('Meetings (meeting.html) lists ' + show(x.ev), JSON.stringify(s.lobby.ev) === JSON.stringify(x.ev), JSON.stringify(s.lobby));
    ok('  and the rooms ' + show(x.rooms), JSON.stringify(s.lobby.rooms) === JSON.stringify(x.rooms), JSON.stringify(s.lobby));
    ok('  the hub\'s meetings: ' + show(x.ev), JSON.stringify(s.hub) === JSON.stringify(x.ev), JSON.stringify(s.hub));
    ok('  Core Team > Meetings and the app\'s: ' + show(x.ev) + '; rooms ' + show(x.rooms), JSON.stringify(s.core) === JSON.stringify({ ev: x.ev, rooms: x.rooms }), JSON.stringify(s.core));
  };
  for (const who of ['none', 'kids', 'worship', 'kycore', 'sglead', 'master']) {
    console.log('\n' + PEOPLE[who].name);
    await signIn(who);
    await run(who, who);
    if (who === 'kids') {
      ok('  a pasted address for the Elders\' room is refused', await refused('meeting.html?room=mv-elders'));
      ok('  and for a meeting they are not named on', await refused('meeting.html?room=mv-office&event=mv_named'));
    }
    if (who === 'worship') ok('  the meeting they are named on opens (no refusal)', !(await refused('meeting.html?room=mv-office&event=mv_named')));
  }
  /* The small group leader, given the permission: an exception for one
     person (H-14), which the server puts on their sign-in. */
  const sg = PEOPLE.sglead;
  console.log('\n' + sg.name + ', with "See and join every video meeting"');
  await put('permissionExceptions/meetingsAll_' + sg.member, { action: 'meetingsAll', memberId: sg.member, uid: sg.uid, name: sg.name, by: PEOPLE.master.uid, byName: 'MV Master Synthetic', at: new Date().toISOString(), until: '', why: 'Runs the small groups\u2019 calls (check)' });
  let claim = false;
  for (let i = 0; i < 30 && !claim; i++) {
    await sleep(1000);
    const u = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:lookup', { localId: [sg.uid] }, OWNER)).body || '{}');
    const ca = u.users && u.users[0] && u.users[0].customAttributes ? JSON.parse(u.users[0].customAttributes) : {};
    claim = ((ca.perms || {}).egbc || []).includes('meetingsAll');
  }
  ok('the server put the permission on their sign-in', claim);
  await signIn('sglead');
  await run('sgleadPerm', 'sglead');
  ok('no errors on the pages', errs.length === 0, errs.join(' | '));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  for (const p of Object.values(PEOPLE)) { await del('users/' + p.uid).catch(() => {}); await del('addressBook/' + p.member).catch(() => {}); }
  await del('permissionExceptions/meetingsAll_' + PEOPLE.sglead.member).catch(() => {});
  for (const id of Object.keys(EVENTS)) await del('events/' + id).catch(() => {});
  if (hadVideo) await req(8181, 'PATCH', DOCS + '/churchSettings/video', { fields: hadVideo.fields || {} }, OWNER).catch(() => {});
  else await del('churchSettings/video').catch(() => {});
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
