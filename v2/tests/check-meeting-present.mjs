/* "Present slides" in a video meeting, wired into meeting.html (the events
 * window's F-263; hosts only for now).
 *
 *   node tests/check-meeting-present.mjs      (from v2/, the dev emulators up)
 *
 * Two people, two browsers, at 375:
 *   the HOST (an admin of the room's team) opens the meeting as host, picks
 *   this meeting's slides from "Present slides" and presents; moves on;
 *   the FOLLOWER (on the room's team, not a host) sees the slides large,
 *   follows to the next slide, has no "Present slides" of their own, and is
 *   back to the faces when the host stops.
 * The room, the deck and its pictures are made-up and put back afterwards.
 * The call itself (Daily) is not what is tested here; the room's address is
 * a stand-in.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SERVE = 8985, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const BUCKET = 'egbc-worship-planner.firebasestorage.app';
const ROOM = 'Eldership', DECK = 'dk_mp_check', DAY_EVENT = 'ev_mp_check';
const PEOPLE = {
  host:   { email: 'mp.host@example.invalid', member: 'ab_mp_host', name: 'MP Host Synthetic', teams: [], adminFor: ['Elders'] },
  follow: { email: 'mp.follow@example.invalid', member: 'ab_mp_follow', name: 'MP Follower Synthetic', teams: ['Elders'], adminFor: [] }
};
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 500) : ''))); };
const req = (port, method, p, body, hdr, raw) => new Promise((res, rej) => {
  const d = raw !== undefined ? raw : (body === undefined ? null : JSON.stringify(body));
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': raw !== undefined ? 'image/jpeg' : 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
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
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
/* A tiny real JPEG (1x1), for the slide pictures. */
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

async function browser(port, tag) {
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-mp-' + tag + '-' + process.pid),
    '--disable-features=BackForwardCache', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  return { chrome, ws, send, evl: makeEval(send, tag) };
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: false, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor, masterAdmin: false, churchMember: true });
  }
  /* The room, keyed for the rules, with a stand-in address; put back after. */
  const before = await req(8181, 'GET', DOCS + '/churchSettings/video', undefined, OWNER);
  const hadVideo = before.status === 200 ? JSON.parse(before.body) : null;
  const room = { key: ROOM, label: 'Eldership', url: 'https://example.invalid/eldership', teams: ['Elders'], hostTeams: [] };
  await put('churchSettings/video', { churchId: 'egbc', rooms: [room], roomsByKey: { [ROOM]: { teams: ['Elders'], hostTeams: [], members: false } }, byType: {} });
  const now = new Date(), day = now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  await put('events/' + DAY_EVENT, { title: 'MP Synthetic Elders meeting', date: day, startTime: '19:00', endTime: '21:00', type: 'Other', videoRoom: ROOM, archived: false });
  await put('presentDecks/' + DECK, { context: { type: 'meeting', room: ROOM, eventId: DAY_EVENT, day }, name: 'MP Synthetic slides', status: 'ready', count: 2, source: 'upload', by: PEOPLE.host.uid, byName: 'x', at: now.toISOString() });
  for (const f of ['s1.jpg', 't1.jpg', 's2.jpg', 't2.jpg']) {
    await req(9199, 'POST', '/v0/b/' + BUCKET + '/o?name=' + encodeURIComponent('present/' + DECK + '/' + f), undefined, OWNER, JPG);
  }
  await del('presentNow/mtg_' + ROOM + '_' + DAY_EVENT);

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript' : e === '.css' ? 'text/css' : e === '.jpg' ? 'image/jpeg' : 'application/octet-stream') + (e === '.html' || e === '.js' || e === '.css' ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);
  const H = await browser(9797, 'host'), F = await browser(9799, 'follow');
  const signIn = async (B, who) => {
    await B.send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await B.evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
  };
  const look = (B) => B.evl('JSON.stringify({presenting:document.body.classList.contains("presenting"),'
    + 'cap:((document.querySelector("#present .pz-cap")||{}).textContent||"").trim(),'
    + 'pill:!!document.querySelector(".pz-mbtn"),stop:!!document.querySelector("#present [data-stop]"),'
    + 'sideways:document.documentElement.scrollWidth>innerWidth+1})').then(s => JSON.parse(String(s) || '{}'));
  const until = async (B, test, ms) => { let L = {}; for (let i = 0; i < (ms || 15000) / 300; i++) { L = await look(B); if (test(L)) return L; await sleep(300); } return L; };

  try {
    await signIn(H, 'host'); await signIn(F, 'follow');
    const q = '?room=' + encodeURIComponent(ROOM) + '&event=' + DAY_EVENT;
    await H.send('Page.navigate', { url: 'http://localhost:' + SERVE + '/meeting.html' + q + '&t=stand-in-host-token' });
    await F.send('Page.navigate', { url: 'http://localhost:' + SERVE + '/meeting.html' + q });
    await sleep(12000);

    console.log('The host');
    let h = await look(H);
    ok('  has "Present slides" over the call', h.pill, JSON.stringify(h));
    await H.evl('document.querySelector(".pz-mbtn").click();1'); await sleep(2500);
    const listed = String(await H.evl('!!document.querySelector(\'[data-mdeck="' + DECK + '"]\')'));
    ok('  which offers this meeting\u2019s slides', listed === 'true');
    await H.evl('document.querySelector(\'[data-mdeck="' + DECK + '"]\').click();1');
    h = await until(H, L => L.presenting && L.stop);
    ok('  presents them: the presenter\u2019s view, with Stop', h.presenting && h.stop, JSON.stringify(h));

    console.log('\nThe follower (on the room\u2019s team, not a host)');
    let f = await until(F, L => L.presenting && /Slide 1 of 2/.test(L.cap));
    ok('  sees the slides, large: slide 1 of 2', f.presenting && /Slide 1 of 2/.test(f.cap), JSON.stringify(f));
    ok('  with no "Present slides" and no Stop of their own', !f.pill && !f.stop, JSON.stringify(f));
    ok('  nothing sideways at 375px', !f.sideways, JSON.stringify(f));
    const shot = await F.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, 'meeting-present--follower-375.png'), Buffer.from(shot.data, 'base64'));
    const t0 = Date.now();
    await H.evl('document.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",bubbles:true}));1');
    f = await until(F, L => /Slide 2 of 2/.test(L.cap));
    ok('  follows the host to slide 2 (' + (Date.now() - t0) + ' ms)', /Slide 2 of 2/.test(f.cap), JSON.stringify(f));
    await H.evl('document.querySelector("#present [data-stop]").click();1');
    f = await until(F, L => !L.presenting);
    ok('  and is back to the faces when the host stops', !f.presenting, JSON.stringify(f));
  } finally {
    for (const B of [H, F]) { try { B.ws.close(); } catch (e) {} B.chrome.kill(); }
    server.close();
    await del('presentNow/mtg_' + ROOM + '_' + DAY_EVENT); await del('presentDecks/' + DECK); await del('events/' + DAY_EVENT);
    if (hadVideo && hadVideo.fields) await req(8181, 'PATCH', DOCS + '/churchSettings/video', { fields: hadVideo.fields }, OWNER);
    else await del('churchSettings/video');
  }
  const pass = R.filter(Boolean).length;
  console.log('\n' + pass + '/' + R.length + ' passed');
  process.exit(pass === R.length ? 0 : 1);
})();
