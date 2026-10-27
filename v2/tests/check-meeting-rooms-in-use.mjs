/* Meeting rooms in use (27 Oct 2026; Martin: "a link for a particular time
 * should somehow say it is in use. If we have a small group link we could
 * have 5 groups at the same time.").
 *
 *   node tests/check-meeting-rooms-in-use.mjs            (from v2/, the dev emulators up, functions too)
 *   BREAK=order node tests/check-meeting-rooms-in-use.mjs   no "set up first keeps it": must fail
 *   BREAK=inuse node tests/check-meeting-rooms-in-use.mjs   the pages never say "in use": must fail
 *
 * 1. The rule (functions/meeting-rooms.js clashWith), no emulator: five
 *    small groups at 19:30 in one room, each deciding for itself in any
 *    order: exactly one keeps the room, four get their own; meetings that
 *    do not overlap, or are in other rooms, keep theirs.
 * 2. The hub (the trigger, on the emulator): five groups set up at once,
 *    on now, in the standing room: each ends in a room of its own but one,
 *    each own room made (a Daily address) and on the church's list as that
 *    meeting's; no two overlapping meetings share a room.
 * 3. The pages, at 375: Meetings shows the standing room "In use now:
 *    <first group>, until <end>" and lists no meeting's own room as a
 *    standing room; somebody on the room's team, not invited to that group,
 *    opening the standing room is told it is in use, not put in the call.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9829, SERVE = 8993, PW = 'test-only-password';
const BREAK = process.env.BREAK || '';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- 1. the rule ---- */
console.log('The rule: five small groups at 19:30');
const SRC = path.join(V2, 'functions', 'meeting-rooms.js');
let M, tmp = null;
if (BREAK === 'order') {
  tmp = path.join(V2, 'functions', '.break-meeting-rooms.js');
  const t = fs.readFileSync(SRC, 'utf8').replace('&& overlaps(me, o) && before(o, me));', '&& overlaps(me, o));');
  fs.writeFileSync(tmp, t);
  try { M = await import('file://' + tmp.replace(/\\/g, '/')); } finally { fs.unlinkSync(tmp); }
} else M = await import('file://' + SRC.replace(/\\/g, '/'));
const G = [1, 2, 3, 4, 5].map((i) => ({ id: 'g' + i, created: 1000 + i, date: '2026-11-04', startTime: '19:30', endTime: '21:00', type: 'Small group', description: 'Group ' + i, videoRoom: 'groups' }));
for (const order of [[0, 1, 2, 3, 4], [4, 3, 2, 1, 0], [2, 0, 4, 1, 3]]) {
  const kept = order.map((i) => G[i]).filter((g) => !M.clashWith(g, G, {})).map((g) => g.id);
  ok('  deciding in the order ' + order.map((i) => i + 1).join(',') + ': only the first set up keeps the room', JSON.stringify(kept) === '["g1"]', JSON.stringify(kept));
}
ok('  the others are told which meeting has it', (M.clashWith(G[3], G, {}) || {}).id === 'g1');
ok('  a meeting after the groups have finished keeps the room', !M.clashWith(Object.assign({}, G[1], { id: 'late', created: 9999, startTime: '21:00', endTime: '22:00' }), G, {}));
ok('  one in another room keeps its own', !M.clashWith(Object.assign({}, G[1], { id: 'other', created: 9999, videoRoom: 'prayer' }), G, {}));
ok('  one on another day keeps the room', !M.clashWith(Object.assign({}, G[1], { id: 'day', created: 9999, date: '2026-11-05' }), G, {}));
ok('  an archived meeting holds nothing', !M.clashWith(Object.assign({}, G[1], { created: 9999, id: 'x' }), G.map((g) => Object.assign({}, g, { archived: true })), {}));
ok('  a room by kind of meeting counts as that room', (M.clashWith({ id: 'k', created: 9999, date: '2026-11-04', startTime: '20:00', type: 'Small group' }, G, { 'Small group': 'groups' }) || {}).id === 'g1');

/* ---- 2 and 3: on the emulator ---- */
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const b = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(b ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(b);
});
const val = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : typeof v === 'object' ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const plain = (v) => v.stringValue ?? v.booleanValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.arrayValue ? (v.arrayValue.values || []).map(plain) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)])) : null);
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const get = async (p) => { const r = await req(8181, 'GET', DOCS + '/' + p, undefined, OWNER); return r.status === 200 ? plain({ mapValue: JSON.parse(r.body) }) : null; };
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';

/* Now, London wall-clock: the groups started ten minutes ago, for an hour. */
const parts = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(new Date()).forEach((x) => { parts[x.type] = x.value; });
const TODAY = parts.year + '-' + parts.month + '-' + parts.day;
const mins = Number(parts.hour) * 60 + Number(parts.minute);
const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const START = hm(Math.max(0, mins - 10)), END = hm(Math.min(23 * 60 + 59, mins + 60));
const ROOM = { key: 'iu-groups', label: 'IU Small groups room', url: 'https://example.invalid/iu-groups', teams: ['Church office'], hostTeams: [] };
const GROUPS = [1, 2, 3, 4, 5].map((i) => 'iu_group' + i);
const PEOPLE = {
  master: { email: 'iu.master@example.invalid', member: 'ab_iu_master', name: 'IU Master Synthetic', teams: [], master: true },
  office: { email: 'iu.office@example.invalid', member: 'ab_iu_office', name: 'IU Office Synthetic', teams: ['Church office'], master: false }
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
    if (BREAK === 'inuse' && url === '/egbc-video.js') { const was = t; t = t.replace('      if (!key) return null;\r\n      var t = londonNow(now);', '      return null;').replace('      if (!key) return null;\n      var t = londonNow(now);', '      return null;'); if (t === was) console.log('  FAIL  the break did not apply'); }
    body = Buffer.from(t, 'utf8');
  }
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : 'text/html') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-inuse-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let x = ''; r.on('data', c => x += c); r.on('end', () => res(JSON.parse(x))); }).on('error', rej));

let hadVideo = null, exitCode = 1;
try {
  console.log('\nThe hub: five groups set up at once, on now (' + START + '\u2013' + END + '), in one standing room');
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
  await put('churchSettings/video', { churchId: 'egbc', rooms: [ROOM], roomsByKey: { [ROOM.key]: { teams: ROOM.teams, hostTeams: [], members: false } }, byType: {} });
  /* The first group is set up a moment before the rest, which all come at once. */
  const ev = (i) => ({ date: TODAY, termLabel: 'Synthetic', type: 'Small group', description: 'IU Group ' + i, teams: [], roles: [], startTime: START, endTime: END, videoRoom: ROOM.key, archived: false });
  await put('events/' + GROUPS[0], ev(1));
  await sleep(1500);
  await Promise.all(GROUPS.slice(1).map((g, i) => put('events/' + g, ev(i + 2))));
  let evs = [];
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    evs = await Promise.all(GROUPS.map((g) => get('events/' + g)));
    if (evs.filter((e) => e && /^m-/.test(e.videoRoom || '')).length >= 4) break;
  }
  const rooms = evs.map((e) => e && e.videoRoom);
  ok('the first group set up keeps the standing room', rooms[0] === ROOM.key, JSON.stringify(rooms));
  ok('  the other four each have a room of their own', rooms.slice(1).every((r, i) => r === 'm-' + GROUPS[i + 1]), JSON.stringify(rooms));
  ok('  each told why (the meeting that has the room)', evs.slice(1).every((e) => e && e.ownRoom && /IU Group 1/.test(e.ownRoom.because)), JSON.stringify(evs.map((e) => e && e.ownRoom)));
  const v = await get('churchSettings/video');
  const own = ((v && v.rooms) || []).filter((r) => r.meeting);
  ok('  each own room is made (a Daily address) and on the church\'s list as that meeting\'s', GROUPS.slice(1).every((g) => own.some((r) => r.key === 'm-' + g && r.meeting === g && /^https:\/\//.test(r.url || '') && v.roomsByKey['m-' + g])), JSON.stringify(own));
  const pairs = [];
  evs.forEach((a, i) => evs.forEach((b, j) => { if (i < j && a && b && a.videoRoom === b.videoRoom) pairs.push(GROUPS[i] + '+' + GROUPS[j]); }));
  ok('  no two of them share a room: a clash is never possible', pairs.length === 0, pairs.join(', '));

  console.log('\nThe pages, at 375');
  let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (list.some((x) => x.type === 'page')) break; } catch {} await sleep(500); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); };
  const evl = makeEval(send, 'inuse');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const go = (u) => send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + u });
  const signIn = async (who) => {
    await go('__signin.html'); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
  };
  await signIn('master');
  await go('meeting.html'); await sleep(6000);
  const lobby = JSON.parse(String(await evl('(function(){var rows=[].map.call(document.querySelectorAll("#lobby .row"),function(r){return r.innerText.replace(/\\s+/g," ")});return JSON.stringify(rows)})()')));
  /* The room's own row (its name first), not a meeting's row naming it. */
  const row = lobby.find((t) => /^s*IU Small groups room/.test(t)) || '';
  ok('Meetings: the standing room says "In use now: Small group \u00b7 IU Group 1, until ' + END + '"', row.includes('In use now: Small group \u00b7 IU Group 1, until ' + END), row || JSON.stringify(lobby).slice(0, 300));
  ok('  no meeting\'s own room is listed as a standing room', !lobby.some((t) => /IU Group [2-5]/.test(t) && !/Join/.test(t) && /example|daily/.test(t)) && !lobby.some((t) => /m-iu[-_]group/.test(t)), JSON.stringify(lobby).slice(0, 400));
  ok('  the five groups are each listed, each with its own link', GROUPS.every((g) => lobby.some((t) => t.includes('IU Group ' + g.slice(-1)))), JSON.stringify(lobby).slice(0, 400));
  await signIn('office');
  await go('meeting.html?room=' + ROOM.key); await sleep(6000);
  const said = String(await evl('document.body.innerText'));
  ok('somebody on the room\'s team, not in that group, is told it is in use (and by which meeting), not put in the call',
    /In use now/.test(said) && /IU Group 1/.test(said) && new RegExp('until ' + END).test(said) && !document_in_call(said), said.slice(0, 300));
  ok('no errors on the pages', errs.length === 0, errs.join(' | '));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  for (const p of Object.values(PEOPLE)) { if (p.uid) await del('users/' + p.uid).catch(() => {}); await del('addressBook/' + p.member).catch(() => {}); }
  for (const g of GROUPS) await del('events/' + g).catch(() => {});
  if (hadVideo) await req(8181, 'PATCH', DOCS + '/churchSettings/video', { fields: hadVideo.fields || {} }, OWNER).catch(() => {});
  else await del('churchSettings/video').catch(() => {});
  try { chrome.kill(); } catch {}
  server.close();
}
function document_in_call(text) { return /Leave|Getting the meeting ready/.test(text); }
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
