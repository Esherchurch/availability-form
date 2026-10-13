/* The family rule: "Your family this week", and Parents' Sunday, on Home.
 *
 *   node tests/check-family.mjs      (from v2/, the dev emulators up, functions included)
 *
 * APP-DESIGN-BRIEF §4 (Martin): "The person logging in should only see the
 * teams relevant to them and their family." Their family's serving and
 * groups appear on their Home with when and where only.
 *
 * THE FUNCTION, myFamily, asked over HTTP as each person:
 *   - Karen's household points at Karen (a head); Sarah's points along a
 *     chain (Ada -> Ben -> Sarah). Both are found: householdIds() follows
 *     every link both ways.
 *   - this week only, the rota's own slots (not drafts), and the groups'
 *     meetings that are confirmed (not held, not cancelled);
 *   - first names only: no email, telephone number or surname anywhere in
 *     the answer (A-043);
 *   - nobody outside the household, and not the person themselves;
 *   - nobody signed in is refused; somebody the church does not hold gets
 *     nothing.
 * THE SCREEN, the app's Home as Sarah, an Attender on no team - the person
 * this is most for, and the reason it is a function at all:
 *   - "Your family this week" with Ben's Lazers;
 *   - Parents' Sunday (F-145): the family QR before arriving, and once a
 *     child is in, the COLLECTION CODE, large.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9739, SERVE = 8955, FN = 5101;
const PW = 'test-only-password';
const SITE = 'site_fam';

const londonDate = (n) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
};
const localToday = () => { const d = new Date(), p = (x) => (x < 10 ? '0' : '') + x; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const D2 = londonDate(2), D3 = londonDate(3), D5 = londonDate(5), D10 = londonDate(10);

/* Book records: the households, written two ways, and somebody outside. */
const BOOK = {
  ab_fam_karen:  { name: 'Karen Familia Synthetic', email: 'fam.karen@example.invalid', markers: ['Kids Church'], phone: '07000 000001' },
  ab_fam_oliver: { name: 'Oliver Familia Synthetic', email: 'fam.oliver@example.invalid', markers: ['Worship Team', 'ReNu'], householdId: 'ab_fam_karen', phone: '07000 000002' },
  ab_fam_matei:  { name: 'Matei Familia Synthetic', markers: [], householdId: 'ab_fam_karen' },
  ab_fam_sarah:  { name: 'Sarah Lineage Synthetic', email: 'fam.sarah@example.invalid', markers: [] },
  ab_fam_ben:    { name: 'Ben Lineage Synthetic', markers: ['Lazers'], householdId: 'ab_fam_sarah', isMinor: true },
  ab_fam_ada:    { name: 'Ada Lineage Synthetic', markers: [], householdId: 'ab_fam_ben', isMinor: true },
  ab_fam_zed:    { name: 'Zed Outsider Synthetic', email: 'fam.zed@example.invalid', markers: ['Worship Team', 'ReNu', 'Lazers'] },
};
const ACCOUNTS = {
  karen: { member: 'ab_fam_karen', email: 'fam.karen@example.invalid', teams: ['Kids Church'], attender: true },
  sarah: { member: 'ab_fam_sarah', email: 'fam.sarah@example.invalid', teams: [], attender: true },
  nobody: { member: null, email: 'fam.nobody@example.invalid' },
};

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : '')));
};
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const call = async (who, data) => {
  const r = await req(FN, 'POST', '/egbc-worship-planner/europe-west2/myFamily', { data: data || {} },
    who && who.idToken ? { Authorization: 'Bearer ' + who.idToken } : {});
  try { const j = JSON.parse(r.body || '{}'); return j.result !== undefined ? j.result : { error: (j.error || {}).status || 'HTTP ' + r.status }; }
  catch { return { error: 'HTTP ' + r.status + ' ' + r.body.slice(0, 100) }; }
};

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

(async () => {
  /* ---- seed --------------------------------------------------------- */
  for (const [id, m] of Object.entries(BOOK)) {
    await put('addressBook/' + id, Object.assign({ adminFor: [], archived: false, isMinor: false, churchMember: false }, m));
  }
  for (const a of Object.values(ACCOUNTS)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: a.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: a.email, password: PW, returnSecureToken: true })).body || '{}');
    a.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update',
      { localId: a.uid, emailVerified: true }, OWNER);
    const again = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: a.email, password: PW, returnSecureToken: true })).body || '{}');
    a.idToken = again.idToken;
    if (a.member) {
      await put('users/' + a.uid, { uid: a.uid, email: a.email, name: BOOK[a.member].name, memberId: a.member, status: 'active',
        linkedBy: 'admin', teams: a.teams, adminFor: [], masterAdmin: false, attender: true, churchMember: false });
    } else {
      await put('users/' + a.uid, { uid: a.uid, email: a.email, name: '', memberId: null, status: 'pending', teams: [],
        attender: false, churchMember: false });
    }
  }
  const ev = (id, o) => put('events/' + id, Object.assign({ termLabel: 'Synthetic', teams: ['Worship Team'], roles: [],
    archived: false, draft: false, startTime: '10:30', type: 'Sunday Morning Worship', assignments: {} }, o));
  const by = (id) => ({ id, name: BOOK[id].name });
  await ev('ev_fam_d3', { date: D3, assignments: { Drums: by('ab_fam_oliver'), Guitar: by('ab_fam_zed'), 'Session Leader': by('ab_fam_karen') } });
  await ev('ev_fam_d2_draft', { date: D2, draft: true, type: 'Prayer', assignments: { Keyboard: by('ab_fam_oliver') } });
  await ev('ev_fam_d10', { date: D10, assignments: { Drums: by('ab_fam_oliver') } });
  await put('rooms/room_fam_upper', { name: 'Upper room', siteId: SITE });
  await put('rooms/room_fam_hall', { name: 'Synthetic Hall', siteId: SITE });
  const cal = (id, o) => put('calEvents/' + id, Object.assign({ status: 'confirmed', allDay: false, audience: ['members'] }, o));
  await cal('cal_fam_renu', { title: 'ReNu', teams: ['ReNu'], startLocal: D2 + 'T19:00', endLocal: D2 + 'T21:00',
    location: { kind: 'rooms', siteId: SITE, roomIds: ['room_fam_upper'] } });
  await cal('cal_fam_lazers', { title: 'Lazers', teams: ['Lazers'], startLocal: D5 + 'T18:30', endLocal: D5 + 'T20:00',
    location: { kind: 'rooms', siteId: SITE, roomIds: ['room_fam_hall'] } });
  await cal('cal_fam_held', { title: 'Lazers trip', status: 'pending', teams: ['Lazers'], startLocal: D3 + 'T10:00',
    location: { kind: 'venue', venueName: 'Somewhere Synthetic' } });
  await cal('cal_fam_cancelled', { title: 'ReNu social', status: 'cancelled', teams: ['ReNu'], startLocal: D3 + 'T19:00',
    location: { kind: 'online' } });

  /* ---- 1. the function ------------------------------------------------ */
  console.log('\nmyFamily, as Karen (her household points at her)');
  const k = await call(ACCOUNTS.karen);
  const kMembers = (k.members || []).map((m) => m.firstName).sort().join(',');
  ok('  her household: Matei and Oliver, and not herself', kMembers === 'Matei,Oliver', JSON.stringify(k));
  const kw = k.week || [];
  ok('  Oliver on drums this week', kw.some((w) => w.kind === 'serving' && w.firstName === 'Oliver' && w.date === D3 && (w.roles || []).includes('Drums')), JSON.stringify(kw));
  ok('  and his ReNu, with where', kw.some((w) => w.kind === 'group' && w.group === 'ReNu' && w.date === D2 && w.time === '19:00' && w.where === 'Upper room'), JSON.stringify(kw));
  ok('  NOT next week\u2019s slot, a draft, a held event or a cancelled one',
    !kw.some((w) => w.date === D10 || (w.roles || []).includes('Keyboard') || /trip|social/.test(w.title || '')), JSON.stringify(kw));
  ok('  NOT somebody outside the household on the same Sunday', !JSON.stringify(k).includes('Zed'), JSON.stringify(k));
  ok('  NOT Karen\u2019s own slot - that is "You are serving", not her family', !kw.some((w) => (w.roles || []).includes('Session Leader')), JSON.stringify(kw));
  ok('  first names only: no email, telephone number or surname anywhere',
    !/@|07000|Familia|Synthetic|phone|email/i.test(JSON.stringify(k)), JSON.stringify(k));

  console.log('\nmyFamily, as Sarah (an Attender; her household is a chain)');
  const s = await call(ACCOUNTS.sarah);
  ok('  Ada and Ben, found along the chain', (s.members || []).map((m) => m.firstName).sort().join(',') === 'Ada,Ben', JSON.stringify(s));
  ok('  and Ben\u2019s Lazers this week', (s.week || []).some((w) => w.kind === 'group' && w.group === 'Lazers' && w.firstName === 'Ben' && w.where === 'Synthetic Hall'), JSON.stringify(s.week));
  /* The held trip is a LAZERS event - Ben's group, in Sarah's household -
     so this is the only answer it could ever appear in. Asked of Karen's
     alone, "not a held event" could not fail, and a break proved it. */
  ok('  NOT the Lazers trip still held for approval', !(s.week || []).some((w) => /trip/i.test(w.title || '')), JSON.stringify(s.week));

  console.log('\nand nobody else');
  ok('  nobody signed in is refused', /UNAUTHENTICATED/.test((await call(null)).error || ''));
  const n = await call(ACCOUNTS.nobody);
  ok('  somebody the church does not hold gets nothing', !n.error && (n.members || []).length === 0 && (n.week || []).length === 0, JSON.stringify(n));

  /* ---- 2. the screen, as Sarah ---------------------------------------- */
  const server = http.createServer((q, sres) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { sres.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return sres.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { sres.writeHead(404); return sres.end('no'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t);
      body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css'
      : e === '.json' ? 'application/json' : 'application/octet-stream';
    sres.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    sres.end(body);
  }).listen(SERVE);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-family-' + process.pid), '--window-size=375,812', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (watch.handle(m)) return;
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  const evl = makeEval(send, 'family');

  /* Parents' Sunday, the events window's data, for Sarah's family. */
  const TODAY = localToday();
  await put('kidsSettings/' + SITE, { teams: ['Kids Church'] });
  await put('kidsGroups/g_fam', { name: 'Little Ones', siteId: SITE, leaderIds: [], ratio: 5 });
  await put('kidsFamilies/fam_fam_sarah', { email: ACCOUNTS.sarah.email, siteId: SITE, parentName: 'Sarah', familyCode: 'FAMQR1' });
  await put('kidsChildren/kc_fam_ada', { familyId: 'fam_fam_sarah', name: 'Ada Lineage Synthetic', groupId: 'g_fam', siteId: SITE, status: 'active' });
  await del('checkins/ck_fam_ada');

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
  await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ACCOUNTS.sarah.email) + ',' + JSON.stringify(PW) + ')', true);
  await sleep(800);
  const openHome = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      const d = String(await evl('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}}).getAttribute("data-drawn")||""'));
      if (d.indexOf(ACCOUNTS.sarah.uid + ':') === 0) break;
    }
    await sleep(4000);   /* the function and the family arrive after the first draw */
  };
  const home = () => evl('(document.getElementById("egbc-app")||document.body).innerText');

  console.log('\nHome, as Sarah, before the children arrive');
  watch.reset();
  await openHome();
  let t = String(await home());
  ok('  "Your family this week" is there', /Your family this week/i.test(t), t.slice(0, 600));
  ok('  with Ben\u2019s Lazers, when and where', /Lazers · Ben/.test(t) && /Synthetic Hall/.test(t), t.slice(0, 600));
  ok('  Parents\u2019 Sunday names the child, by first name', /Ada is booked into Kids Church/.test(t), t.slice(0, 600));
  ok('  and shows the family QR for the desk', (await evl('!!document.querySelector(".parents .pqr svg")')) === true);
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  console.log('\nand once Ada is in');
  await put('checkins/ck_fam_ada', { kind: 'child', state: 'in', name: 'Ada Lineage Synthetic', childId: 'kc_fam_ada',
    familyId: 'fam_fam_sarah', groupId: 'g_fam', siteId: SITE, day: TODAY, pickupCode: 'K7P2', inAt: new Date().toISOString() });
  watch.reset();
  await openHome();
  const code = JSON.parse(String(await evl('(function(){var c=document.querySelector(".parents .pcode");'
    + 'return JSON.stringify(c?{ text:c.textContent, size: parseFloat(getComputedStyle(c).fontSize), label: c.getAttribute("aria-label") }:null)})()')));
  ok('  the collection code is on Home', !!code && code.text === 'K7P2', JSON.stringify(code));
  ok('  LARGE - read off a phone across a room (32px or more)', !!code && code.size >= 32, JSON.stringify(code));
  ok('  and a screen reader reads it letter by letter', !!code && code.label === 'Collection code K 7 P 2', JSON.stringify(code));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  for (const p of ['checkins/ck_fam_ada', 'kidsChildren/kc_fam_ada', 'kidsFamilies/fam_fam_sarah']) await del(p);
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
