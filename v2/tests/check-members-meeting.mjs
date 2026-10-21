/* Members' meetings and their votes (21 Oct 2026; design-mocks/members-
 * meeting; Martin: members only, one vote each, secret or open, results when
 * closed, who voted kept, how they voted never shown for a secret vote).
 *
 *   node tests/check-members-meeting.mjs   (from v2/, the dev emulators up,
 *                                           functions included)
 *
 * 1. The hub's vote functions (functions/meetings.js), on the emulator's
 *    database: only whoever runs it opens and closes; a church member votes
 *    once; a non-member cannot; a SECRET ballot stores who but never what,
 *    and the choice lives only in the tally; an open ballot keeps the
 *    choice; closing counts it; nothing is cast after.
 * 2. The page (church-meeting.html), in a browser:
 *    - a member sees the open vote, votes with one tap, is told it is in;
 *    - somebody on no list is refused ("Church members only");
 *    - whoever runs it gets the running panel and opens a vote from it;
 *    - 375px nothing sideways; 1440px the running panel beside it.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8181';
process.env.GCLOUD_PROJECT = 'egbc-worship-planner';
const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp, getApps } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();
const M = await import(pathToFileURL(path.join(V2, 'functions', 'meetings.js')).href);

const PW = 'test-only-password';
const PEOPLE = {
  member: { email: 'mm.member@example.invalid', member: 'ab_mm_member', name: 'Mm Member Synthetic', teams: ['Worship Team'], churchMember: true, masterAdmin: false },
  member2: { email: 'mm.member2@example.invalid', member: 'ab_mm_member2', name: 'Mm Second Synthetic', teams: [], churchMember: true, masterAdmin: false },
  outsider: { email: 'mm.outsider@example.invalid', member: 'ab_mm_out', name: 'Mm Outsider Synthetic', teams: ['Worship Team'], churchMember: false, masterAdmin: false },
  chair: { email: 'mm.chair@example.invalid', member: 'ab_mm_chair', name: 'Mm Chair Synthetic', teams: ['Church office'], churchMember: false, masterAdmin: false }
};
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const OWNER = { Authorization: 'Bearer owner' };
for (const p of Object.values(PEOPLE)) {
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
  p.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
  await db.doc('addressBook/' + p.member).set({ name: p.name, email: p.email, markers: p.teams, adminFor: [], masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: p.churchMember });
  await db.doc('users/' + p.uid).set({ uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: [], masterAdmin: p.masterAdmin, churchMember: p.churchMember });
}
const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const MID = 'mm_check', OLD_MID = 'mm_check_old';
const clear = async () => {
  for (const v of (await db.collection('churchMeetings/' + MID + '/votes').get()).docs) {
    for (const sub of ['ballots', 'tally']) for (const d of (await v.ref.collection(sub).get()).docs) await d.ref.delete();
    await v.ref.delete();
  }
  await db.doc('churchMeetings/' + MID).delete();
  await db.doc('churchMeetings/' + OLD_MID).delete();
};
await clear();
await db.doc('churchMeetings/' + MID).set({ title: 'Synthetic Members\u2019 Meeting', date: day, time: '19:45', place: 'In the church', joinKind: 'room', room: 'CMM', papers: [], status: 'planned' });
/* An older meeting, which the page would not open by itself: the one-off
   emails' link (?meeting=<id>, the comms window) must open it. */
await db.doc('churchMeetings/' + OLD_MID).set({ title: 'Synthetic Old Meeting', date: '2020-01-15', time: '19:30', place: 'In the church', joinKind: 'room', room: 'CMM', papers: [], status: 'planned' });
const vote = (id, secret) => db.doc('churchMeetings/' + MID + '/votes/' + id).set({ question: 'Synthetic question ' + id + '?', choices: ['Yes', 'No', 'Abstain'], secret, status: 'draft', order: 0, createdAt: new Date().toISOString() });
await vote('vS', true); await vote('vO', false);
const run = (fn, who, data) => fn({ db, uid: PEOPLE[who].uid, data: Object.assign({ meeting: MID }, data) }).then(() => 'ok', e => e.code || e.message);

console.log('1. The hub\'s vote functions');
ok('a vote not yet open takes no votes', await run(M.cast, 'member', { vote: 'vS', choice: 'Yes' }) === 'failed-precondition');
ok('a member who does not run the meeting cannot open a vote', await run(M.open, 'member', { vote: 'vS' }) === 'permission-denied');
ok('the chair (Church office) opens it', await run(M.open, 'chair', { vote: 'vS' }) === 'ok' && (await db.doc('churchMeetings/' + MID + '/votes/vS').get()).data().status === 'open');
await run(M.open, 'chair', { vote: 'vO' });
ok('a church member votes', await run(M.cast, 'member', { vote: 'vS', choice: 'Yes' }) === 'ok');
ok('  once only', await run(M.cast, 'member', { vote: 'vS', choice: 'No' }) === 'already-exists');
ok('somebody who is not a church member cannot vote', await run(M.cast, 'outsider', { vote: 'vS', choice: 'No' }) === 'permission-denied');
ok('the chair, not a church member, cannot vote either', await run(M.cast, 'chair', { vote: 'vS', choice: 'No' }) === 'permission-denied');
ok('a choice that is not one of them is refused', await run(M.cast, 'member2', { vote: 'vS', choice: 'Maybe' }) === 'invalid-argument');
await run(M.cast, 'member2', { vote: 'vS', choice: 'No' });
const ballots = (await db.collection('churchMeetings/' + MID + '/votes/vS/ballots').get()).docs.map(d => d.data());
ok('SECRET: each ballot says who and when, never what', ballots.length === 2 && ballots.every(b => b.name && b.at && !('choice' in b)), JSON.stringify(ballots));
const tally = (await db.doc('churchMeetings/' + MID + '/votes/vS/tally/count').get()).data();
ok('  the choices are only in the tally, as counts', tally.Yes === 1 && tally.No === 1, JSON.stringify(tally));
ok('  and the vote itself holds no choices while open', !('results' in (await db.doc('churchMeetings/' + MID + '/votes/vS').get()).data()));
await run(M.cast, 'member', { vote: 'vO', choice: 'Yes' });
const ob = (await db.doc('churchMeetings/' + MID + '/votes/vO/ballots/' + PEOPLE.member.member).get()).data();
ok('OPEN: the ballot keeps the choice', ob && ob.choice === 'Yes', JSON.stringify(ob));
ok('a member cannot close it', await run(M.close, 'member', { vote: 'vS' }) === 'permission-denied');
ok('the chair closes it', await run(M.close, 'chair', { vote: 'vS' }) === 'ok');
const closed = (await db.doc('churchMeetings/' + MID + '/votes/vS').get()).data();
ok('  and the results are the counts, every choice listed', closed.status === 'closed' && JSON.stringify(closed.results) === JSON.stringify({ Yes: 1, No: 1, Abstain: 0 }), JSON.stringify(closed.results));
ok('nothing is cast after it closes', await run(M.cast, 'member2', { vote: 'vO', choice: 'No' }) === 'ok'
  && await run(M.close, 'chair', { vote: 'vO' }) === 'ok' && await run(M.cast, 'member2', { vote: 'vS', choice: 'Yes' }) === 'failed-precondition');

/* ---- 2. the page ---- */
console.log('\n2. The page');
await vote('vPage', true);
await run(M.open, 'chair', { vote: 'vPage' });
await vote('vDraft', false);
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9853, SERVE = 9059;
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
  const e = path.extname(f).toLowerCase();
  let body = fs.readFileSync(f);
  if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
  s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-mm-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (Array.isArray(list) && list.find(x => x.type === 'page')) break; } catch {} await sleep(400); }
const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise(r => ws.onopen = r);
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
await send('Runtime.enable'); await send('Page.enable');
const size = (w) => send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 900 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 900 });
await size(375);
const evl = makeEval(send, 'mm');
const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.mkdirSync(path.join(V2, 'tests', 'shots'), { recursive: true }); fs.writeFileSync(path.join(V2, 'tests', 'shots', name), Buffer.from(s.data, 'base64')); };
const as = async (who, q) => {
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/church-meeting.html' + (q || '') }); await sleep(8000);
};
const LOOK = 'JSON.stringify({blocked:document.body.getAttribute("data-egbc-blocked")||"",card:(document.getElementById("egbc-blocked-card")||{innerText:""}).innerText,'
  + 'voteNow:!!document.querySelector("[data-vote=\\"vPage\\"]"),choices:document.querySelectorAll("[data-vote=\\"vPage\\"] [data-cast]").length,'
  + 'run:!!document.getElementById("run-meeting"),openBtn:!!document.querySelector("[data-open=\\"vDraft\\"]"),'
  + 'cols:getComputedStyle(document.getElementById("mm-cols")).gridTemplateColumns.split(" ").length,'
  + 'sideways:document.documentElement.scrollWidth>innerWidth+1,text:document.body.innerText.slice(0,400)})';
try {
  await as('member2');
  let L = JSON.parse(String(await evl(LOOK)));
  ok('a member sees the open vote, three choices', L.voteNow && L.choices === 3, JSON.stringify(L));
  ok('  and no running panel', !L.run);
  ok('  nothing sideways at 375px', !L.sideways);
  await shot('members-meeting--vote-375.png');
  await evl('document.querySelector("[data-vote=\\"vPage\\"] [data-cast=\\"Abstain\\"]").click();1');
  let done = false;
  for (let i = 0; i < 30; i++) { await sleep(400); if (/You have voted/.test(String(await evl('document.body.innerText')))) { done = true; break; } }
  ok('  one tap, and "You have voted"', done);
  const b = (await db.doc('churchMeetings/' + MID + '/votes/vPage/ballots/' + PEOPLE.member2.member).get()).data();
  ok('  their ballot is in, with no choice on it (secret)', !!b && !('choice' in b), JSON.stringify(b));
  const rulesRefuse = String(await evl('EGBCAuth.db.collection("churchMeetings").doc("' + MID + '").collection("votes").doc("vPage").collection("tally").doc("count").get().then(function(){return "READ IT"},function(e){return e.code})', true));
  ok('  and the tally cannot be read from a page', /permission-denied/.test(rulesRefuse), rulesRefuse);
  await shot('members-meeting--voted-375.png');

  /* FROM AN EMAIL: ?meeting=<id> opens that meeting straight away. */
  await as('member2', '?meeting=' + OLD_MID);
  let T = String(await evl('document.getElementById("mm-title").textContent'));
  ok('a link with ?meeting= opens that meeting straight away, not the next one', T === 'Synthetic Old Meeting', T);
  await as('member2', '?meeting=mm_not_there');
  T = JSON.parse(String(await evl('JSON.stringify({t:document.getElementById("mm-title").textContent,gone:!!document.getElementById("mm-gone")})')));
  ok('  one that is not there says so, and shows the next meeting', T.gone && T.t === 'Synthetic Members’ Meeting', JSON.stringify(T));
  await as('outsider', '?meeting=' + OLD_MID);
  L = JSON.parse(String(await evl(LOOK)));
  ok('  and the link does not let in somebody who is not a church member', !!L.blocked && /Church members only/.test(L.card) && !/Synthetic Old Meeting/.test(L.text), JSON.stringify(L).slice(0, 200));

  await as('outsider');
  L = JSON.parse(String(await evl(LOOK)));
  ok('somebody who is not a church member is refused', !!L.blocked && /Church members only/.test(L.card), JSON.stringify(L).slice(0, 200));

  await as('chair');
  L = JSON.parse(String(await evl(LOOK)));
  ok('the chair gets the running panel, with the draft vote to open', L.run && L.openBtn, JSON.stringify(L).slice(0, 300));
  ok('  nothing sideways at 375px', !L.sideways);
  await shot('members-meeting--run-375.png');
  await evl('document.querySelector("[data-open=\\"vDraft\\"]").click();1');
  let opened = false;
  for (let i = 0; i < 30; i++) { await sleep(400); if ((await db.doc('churchMeetings/' + MID + '/votes/vDraft').get()).data().status === 'open') { opened = true; break; } }
  ok('  "Open the vote" opens it', opened);
  await size(1440);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/church-meeting.html' }); await sleep(7000);
  L = JSON.parse(String(await evl(LOOK)));
  ok('1440px: the running panel beside the meeting, nothing sideways', L.cols === 2 && !L.sideways, L.cols + ' ' + L.sideways);
  await shot('members-meeting--run-1440.png');
} finally {
  server.close(); chrome.kill();
  await clear().catch(() => {});
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some(v => !v) ? 1 : 0);
