/* Starting a video meeting as its host (Martin, 20 Oct 2026: he set a
 * meeting up, joined, and was told to knock - with nobody to let him in).
 *
 *   node tests/check-meeting-host.mjs      (from v2/, the dev emulators up,
 *                                           functions included)
 *
 * 1. Who may host (functions/video.js, no browser): a master admin, an
 *    admin of the room's teams, the meeting's organiser for that meeting
 *    in that room - and nobody else; the token ends 30 minutes after the
 *    meeting, at most four hours away; rooms are made once, per church
 *    (<churchId>-<room>), and the token is for that room.
 * 2. On the emulator, in a browser (Daily's frame stood in for, so what
 *    the page joins with can be read):
 *      - the organiser sees "Start as host" and joins with an owner token;
 *      - a member sees no such thing, and joins with none (they knock);
 *      - the hub refuses that member a token when asked directly.
 * 3. No page or function keeps egbc.daily.co or a room list of its own.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

process.env.FUNCTIONS_EMULATOR = 'true';     /* video.js's stand-in Daily, for part 1 */
const Vd = await import(pathToFileURL(path.join(V2, 'functions', 'video.js')).href);

/* ---- 1. the rules, without a browser ---- */
console.log('1. Who may host');
const fakeDb = (docs) => {
  const store = JSON.parse(JSON.stringify(docs));
  return { store, collection: (c) => ({ doc: (d) => ({
    get: async () => ({ exists: !!(store[c] && store[c][d]), data: () => store[c] && store[c][d] }),
    set: async (v, o) => { store[c] = store[c] || {}; store[c][d] = Object.assign(o && o.merge ? (store[c][d] || {}) : {}, v); }
  }) }) };
};
let made = 0;
const daily = { fake: true,
  room: async (name) => { made++; return { name, url: 'https://churchhq-test.daily.co/' + name }; },
  ownerToken: async (p) => ({ token: 'test-owner.' + p.room_name + '.' + p.user_id + '.' + p.exp, props: p }) };
const users = {
  master: { name: 'M', masterAdmin: true, adminFor: [] },
  leader: { name: 'L', adminFor: ['Worship Team'] },
  kidsLeader: { name: 'K', adminFor: ['Kids Church'] },
  organiser: { name: 'O', adminFor: [], teams: ['Worship Team'] },
  member: { name: 'Mem', adminFor: [], teams: ['Worship Team'] },
  gone: { name: 'G', masterAdmin: true, status: 'archived' }
};
const events = {
  ev1: { type: 'Worship Team Meeting', date: '2026-10-29', startTime: '19:30', endTime: '21:00', organiserUid: 'organiser' },
  ev2: { type: 'Core Team Meeting', date: '2026-10-29', startTime: '19:30', endTime: '21:00', organiserUid: 'organiser' }
};
const db = fakeDb({ users, events });
const ask = (uid, room, event) => Vd.hostToken({ db, daily, uid, data: { room, event }, now: Date.parse('2026-10-29T18:00:00Z') })
  .then(r => r, e => ({ refused: e.code || e.message }));
const r1 = await ask('master', 'Worship-AV');
ok('a master admin gets an owner token for the room', /^test-owner\.egbc-worship-av\.master\./.test(r1.token || ''), JSON.stringify(r1));
ok('  and the rooms were made once, per church (egbc-...)', made === 7 && db.store.churchSettings.video.rooms.every(r => /^https:\/\/churchhq-test\.daily\.co\/egbc-/.test(r.url)), made);
const before = made; await ask('master', 'Worship-AV');
ok('  asking again makes none', made === before, made);
ok('an admin of the room\'s team (Worship) gets one', !!(await ask('leader', 'Worship-AV')).token);
ok('an admin of another team (Kids Church) is refused', (await ask('kidsLeader', 'Worship-AV')).refused === 'permission-denied');
ok('the organiser, for their meeting in its room, gets one', !!(await ask('organiser', 'Worship-AV', 'ev1')).token);
ok('the organiser, for their meeting but another room, is refused', (await ask('organiser', 'Worship-AV', 'ev2')).refused === 'permission-denied');
ok('the organiser with no meeting named is refused', (await ask('organiser', 'Worship-AV')).refused === 'permission-denied');
ok('a member is refused', (await ask('member', 'Worship-AV', 'ev1')).refused === 'permission-denied');
ok('an archived master admin is refused', (await ask('gone', 'Worship-AV')).refused === 'permission-denied');
ok('a room that is not the church\'s is refused', (await ask('master', 'nowhere')).refused === 'not-found');
const exp = Vd.tokenExpiry(events.ev1, Date.parse('2026-10-29T18:00:00Z'));
ok('the token ends 30 minutes after the meeting (21:30 in London)', new Date(exp * 1000).toISOString() === '2026-10-29T21:30:00.000Z', new Date(exp * 1000).toISOString());
ok('  and never more than four hours away', Vd.tokenExpiry({ date: '2026-12-25', endTime: '23:00' }, Date.parse('2026-10-29T18:00:00Z')) * 1000 === Date.parse('2026-10-29T22:00:00Z'));

/* ---- 3. no copies left ---- */
console.log('\n3. One list, the church\'s');
const SCAN = ['meeting.html', 'Planner.html', 'hub-app.js', 'egbc-core-meetings.js', 'egbc-core-rota.js', 'worshiphubapp.html', 'CoreTeamApp.html', 'app.html', 'functions/rota-feed.js'];
const left = SCAN.filter(f => /egbc\.daily\.co|VIDEO_BASE\s*=|'kids-ministries'\s*[,:]/.test(fs.readFileSync(path.join(V2, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
ok('no page or function keeps egbc.daily.co or its own room list', !left.length, left.join(', '));

/* ---- 2. in a browser, on the emulator ---- */
console.log('\n2. Start as host, on the emulator');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9849, SERVE = 9055, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
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
const PEOPLE = {
  organiser: { email: 'mh.organiser@example.invalid', member: 'ab_mh_org', name: 'Meeting Organiser Synthetic', teams: ['Worship Team'] },
  member: { email: 'mh.member@example.invalid', member: 'ab_mh_mem', name: 'Meeting Member Synthetic', teams: ['Worship Team'] }
};
for (const p of Object.values(PEOPLE)) {
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
  p.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: [], masterAdmin: false, archived: false, isMinor: false, churchMember: true });
  await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: [], masterAdmin: false, churchMember: true });
}
const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
await put('events/mh_meeting', { date: day, termLabel: 'Autumn', type: 'Worship Team Meeting', description: 'Synthetic', teams: ['Worship Team'],
  startTime: '19:30', endTime: '21:00', roles: [], videoRoom: 'Worship-AV', organiserUid: PEOPLE.organiser.uid, archived: false });

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
/* Daily's frame, stood in for: it records how the page joined. */
const DAILY_STUB = '(function(){var stub={createFrame:function(){return{on:function(){},join:function(o){window.__joined=o;return Promise.resolve()}}}};'
  + 'Object.defineProperty(window,"DailyIframe",{get:function(){return stub},set:function(){},configurable:false});})();';
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
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-mh-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (Array.isArray(list) && list.find(x => x.type === 'page')) break; } catch {} await sleep(400); }
const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise(r => ws.onopen = r);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
await send('Page.addScriptToEvaluateOnNewDocument', { source: DAILY_STUB });
const evl = makeEval(send, 'mh');
const signIn = async (p) => {
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
};
const open = async () => {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/meeting.html?room=Worship-AV&event=mh_meeting' });
  for (let i = 0; i < 50; i++) { await sleep(400); if (String(await evl('!!(window.__joined||document.getElementById("mtHost"))')) === 'true') break; }
  await sleep(500);
};
try {
  await signIn(PEOPLE.organiser);
  await open();
  const offered = String(await evl('!!document.getElementById("mtHost")')) === 'true';
  ok('the organiser is offered "Start as host"', offered);
  await send('Page.captureScreenshot', { format: 'png' }).then(s => { fs.mkdirSync(path.join(V2, 'tests', 'shots'), { recursive: true }); fs.writeFileSync(path.join(V2, 'tests', 'shots', 'meeting-host--offer-375.png'), Buffer.from(s.data, 'base64')); });
  await evl('(function(){var b=document.getElementById("mtHost");if(b)b.click();return 1})()');
  let joined = null;
  for (let i = 0; i < 40; i++) { await sleep(400); joined = JSON.parse(String(await evl('JSON.stringify(window.__joined||null)'))); if (joined) break; }
  ok('  and joins with an owner token for the church\'s room', !!joined && /^test-owner\.egbc-worship-av\./.test(joined.token || '')
    && /^https:\/\/churchhq-test\.daily\.co\/egbc-worship-av$/.test(joined.url || ''), JSON.stringify(joined) + ' ' + String(await evl('(document.querySelector("#stage .msg")||{innerText:""}).innerText')));

  await signIn(PEOPLE.member);
  await open();
  const memberOffered = String(await evl('!!document.getElementById("mtHost")')) === 'true';
  joined = JSON.parse(String(await evl('JSON.stringify(window.__joined||null)')));
  ok('a member is not offered it, and joins with no token (they knock)', !memberOffered && !!joined && !joined.token && /egbc-worship-av$/.test(joined.url || ''), JSON.stringify(joined));
  const refused = String(await evl('EGBCAuth.call("meetingHostToken",{room:"Worship-AV",event:"mh_meeting"}).then(function(){return "GOT A TOKEN"},function(e){return e.code||e.message})', true));
  ok('  and the hub refuses them a token when asked directly', /permission-denied/.test(refused), refused);
} finally {
  await req(8181, 'DELETE', DOCS + '/events/mh_meeting', undefined, OWNER).catch(() => {});
  server.close(); chrome.kill();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some(v => !v) ? 1 : 0);
