/* The one-off audience backfill writes what the planners would write.
 *
 *   node tests/check-audience-backfill.mjs      (from v2/, emulators up)
 *
 * NEXT-BRIEF §26 item 13. The original site's planners write no
 * `audience` onto a Sunday plan, so once the rules go live a preacher
 * could not open a plan made there. tools/backfill-plan-audience.mjs
 * writes it, once, on switch-over day. This proves four things:
 *
 *   1. IT CANNOT REACH THE REAL DATABASE BY ACCIDENT. Without the
 *      emulator and without --live it refuses before connecting.
 *   2. A DRY RUN WRITES NOTHING, and says who did not resolve.
 *   3. --write writes the right people onto the right documents, and
 *      only from four weeks ago onwards - an old plan, and a plan sent
 *      with no date ("TBC"), are left alone. Run twice, the second run
 *      changes nothing.
 *   4. THE ANSWER IS THE PLANNER'S. The real SundayServicePlanner.html
 *      is opened on the same Sunday and Save is pressed, and what it
 *      writes must equal what the script wrote. Expected values written
 *      out by hand would only prove the script agrees with this file.
 *
 * Synthetic throughout, in 2031 with --today pinned, so no other check's
 * fixtures fall inside the script's range.
 */
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9731, SERVE = 8947;
const PW = 'test-only-password';
const SCRIPT = path.join(V2, 'tools', 'backfill-plan-audience.mjs');

const TODAY = '2031-03-02';
const D1 = '2031-03-09';      /* the full Sunday: morning and evening */
const D2 = '2031-03-16';      /* a speaker only, emailed and never saved */
const DR = '2031-02-16';      /* two weeks ago: recent, so included */
const DOLD = '2031-01-12';    /* seven weeks ago: left alone */
const DNONE = '2031-03-23';   /* a plan with no rota event */
const TWIN = 'Twin Backfill Synthetic';
const GUEST = 'Guest Backfill Synthetic';

const PEOPLE = {
  lead:    { member: 'ab_bf_lead',    name: 'Lena Lead Backfill Synthetic',    account: true },
  bass:    { member: 'ab_bf_bass',    name: 'Bo Bass Backfill Synthetic',      account: false },
  speaker: { member: 'ab_bf_speaker', name: 'Sam Speaker Backfill Synthetic',  account: true },
  twin1:   { member: 'ab_bf_twin1',   name: TWIN,                              account: true },
  twin2:   { member: 'ab_bf_twin2',   name: TWIN,                              account: false },
  arch:    { member: 'ab_bf_arch',    name: 'Archie Archived Backfill Synthetic', account: true },
  dup:     { member: 'ab_bf_dup',     name: 'Dee Duplicate Backfill Synthetic', account: true },
  planner: { member: 'ab_bf_planner', name: 'Pia Planner Backfill Synthetic',  account: true,
             teams: ['Worship Team', 'Core Team'], adminFor: ['Worship Team'] },
};

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : '')));
};

const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const plain = (v) => {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
  return null;
};
const read = async (p) => {
  const r = await req(8181, 'GET', DOCS + '/' + p, undefined, OWNER);
  if (r.status !== 200) return null;
  return plain({ mapValue: { fields: JSON.parse(r.body).fields || {} } });
};
/* Every document in a collection dated in 2031, so a planner's add() with
   a random id is found and cleared as well as the seeded ones. */
const dated2031 = async (coll) => {
  const r = await req(8181, 'POST', DOCS + ':runQuery', { structuredQuery: {
    from: [{ collectionId: coll }],
    where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: '2031-01-01' } } } } }, OWNER);
  let rows = []; try { rows = JSON.parse(r.body || '[]'); } catch { rows = []; }
  return rows.filter(x => x && x.document).map(x => x.document.name.split('/documents/').pop());
};
const sorted = (a) => JSON.stringify([...(a || [])].sort());

const run = (args, env) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: V2, encoding: 'utf8', env, timeout: 120000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const EMU_ENV = Object.assign({}, process.env, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8181' });

async function seed() {
  for (const coll of ['services', 'songSummaries']) for (const p of await dated2031(coll)) await del(p);
  await del('songSummaries/TBC');

  for (const p of Object.values(PEOPLE)) {
    await put('addressBook/' + p.member, { name: p.name, email: p.member + '@example.invalid',
      markers: p.teams || [], adminFor: p.adminFor || [], churchMember: true, archived: false, isMinor: false });
    if (!p.account) { p.uid = ''; continue; }
    const email = p.member.replace(/_/g, '.') + '@example.invalid';
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId; p.email = email;
    await put('users/' + p.uid, { uid: p.uid, email, name: p.name, memberId: p.member, status: 'active',
      linkedBy: 'admin', teams: p.teams || [], adminFor: p.adminFor || [], masterAdmin: false,
      attender: true, churchMember: true });
  }
  const P = PEOPLE, by = (k) => ({ id: P[k].member, name: P[k].name });
  const ev = (id, o) => put('events/' + id, Object.assign({ termLabel: 'Spring 2031', teams: ['Worship Team'],
    roles: ['Worship Leader'], archived: false, draft: false, startTime: '10:30',
    type: 'Sunday Morning Worship', description: 'Synthetic', serviceLeader: '', speaker: '', assignments: {} }, o));

  /* D1, the morning: two people by record (one with no account), a
     speaker typed by name, and a service leader whose name two records
     share - which must resolve to nobody rather than a guess. */
  await ev('ev_bf_d1_a', { date: D1, serviceLeader: TWIN, speaker: P.speaker.name,
    assignments: { 'Worship Leader': by('lead'), 'Bass': by('bass') } });
  /* The evening: a name typed in that the address book has never heard
     of, and a box left as "None". */
  await ev('ev_bf_d1_b', { date: D1, type: 'Sunday Evening Worship', startTime: '18:30',
    assignments: { 'Keyboard': { name: GUEST }, 'Drums': { name: 'None' } } });
  /* An ARCHIVED service that day, and a second "Sunday Morning Worship"
     after the first. The planner shows neither, so neither is on the email. */
  await ev('ev_bf_d1_c', { date: D1, type: 'Sunday Family Worship', archived: true,
    assignments: { 'Guitar': by('arch') } });
  await ev('ev_bf_d1_d', { date: D1, assignments: { 'Guitar': by('dup') } });
  await ev('ev_bf_d2', { date: D2, speaker: P.speaker.name });
  await ev('ev_bf_dr', { date: DR, assignments: { 'Worship Leader': by('lead') } });
  await ev('ev_bf_dold', { date: DOLD, assignments: { 'Worship Leader': by('lead') } });

  /* The plans, as the OLD site leaves them: no audience. D1's services
     document carries a stale one, which must be replaced, and an order,
     which must not be touched. */
  const order = [{ type: 'song', title: 'Synthetic Backfill Song', keys: ['G'], notes: 'keep me' }];
  await put('services/sv_bf_d1', { date: D1, worshipLeader: 'x', order, audience: ['stale-uid'] });
  await put('songSummaries/' + D1, { date: D1, worshipLeader: 'x', items: [{ type: 'song', idx: 1, title: 'Synthetic Backfill Song' }] });
  await put('songSummaries/' + D2, { date: D2, worshipLeader: 'x', items: [] });
  await put('services/sv_bf_dr', { date: DR, worshipLeader: 'x', order });
  await put('services/sv_bf_dold', { date: DOLD, worshipLeader: 'x', order });
  await put('services/sv_bf_dnone', { date: DNONE, worshipLeader: 'x', order });
  await put('songSummaries/TBC', { date: 'TBC', worshipLeader: 'x', items: [] });
}

(async () => {
  /* ---- 1. the door ----------------------------------------------- */
  console.log('\nit cannot reach the real database by accident');
  const noEmu = Object.assign({}, process.env);
  delete noEmu.FIRESTORE_EMULATOR_HOST;
  /* Belt and braces in case the door were ever broken: no credentials
     to find and nowhere to send them. */
  noEmu.GOOGLE_APPLICATION_CREDENTIALS = path.join(os.tmpdir(), 'no-such-credentials-' + process.pid + '.json');
  const r0 = run(['--write', '--today', TODAY], noEmu);
  ok('  no emulator and no --live: refused before connecting',
    r0.code === 2 && /Refusing/.test(r0.out), r0.code + ' ' + r0.out);
  const r0b = run(['--live', '--today', TODAY], EMU_ENV);
  ok('  --live with the emulator set: refused too', r0b.code === 2 && /Refusing/.test(r0b.out), r0b.code + ' ' + r0b.out);

  await seed();
  const P = PEOPLE;

  /* ---- 2. a dry run ---------------------------------------------- */
  console.log('\na dry run writes nothing, and says who did not resolve');
  const r1 = run(['--today', TODAY], EMU_ENV);
  ok('  it ran', r1.code === 0, r1.out);
  const afterDry = await read('services/sv_bf_d1');
  ok('  nothing was written', sorted(afterDry && afterDry.audience) === sorted(['stale-uid'])
    && !(await read('songSummaries/' + D1)).audience, JSON.stringify(afterDry));
  ok('  it names the typed-in name nobody has', r1.out.indexOf(GUEST) !== -1, r1.out);
  ok('  and the name two records share', r1.out.indexOf(TWIN) !== -1, r1.out);
  ok('  and the member who has never signed in', r1.out.indexOf(P.bass.name) !== -1, r1.out);
  ok('  and says what it would write', /would write/.test(r1.out) && /Nothing has been written/.test(r1.out), r1.out);
  console.log(r1.out.split('\n').map(l => '      | ' + l).join('\n'));

  /* ---- 3. writing ------------------------------------------------ */
  console.log('\n--write writes the right people onto the right plans');
  const r2 = run(['--today', TODAY, '--write'], EMU_ENV);
  ok('  it ran', r2.code === 0, r2.out);
  const s1 = await read('services/sv_bf_d1'), m1 = await read('songSummaries/' + D1);
  const wantD1 = sorted([P.lead.uid, P.speaker.uid]);
  ok('  the full Sunday: the leader and the speaker, on both documents',
    sorted(s1.audience) === wantD1 && sorted(m1.audience) === wantD1,
    JSON.stringify({ services: s1.audience, summary: m1.audience, want: wantD1 }));
  ok('  NOT the twin, the archived service, the duplicate service, or the bass with no account',
    ![P.twin1.uid, P.arch.uid, P.dup.uid].some(u => (s1.audience || []).includes(u)), JSON.stringify(s1.audience));
  ok('  the unresolved names are recorded on it',
    sorted(s1.audienceUnresolved) === sorted([GUEST, TWIN]), JSON.stringify(s1.audienceUnresolved));
  ok('  and nothing else on the plan was touched',
    JSON.stringify(s1.order) === JSON.stringify([{ type: 'song', title: 'Synthetic Backfill Song', keys: ['G'], notes: 'keep me' }])
      && m1.items && m1.items[0].title === 'Synthetic Backfill Song', JSON.stringify({ order: s1.order, items: m1.items }));
  ok('  a Sunday emailed and never saved: its summary gets the speaker',
    sorted((await read('songSummaries/' + D2)).audience) === sorted([P.speaker.uid]));
  ok('  two weeks ago is included', sorted((await read('services/sv_bf_dr')).audience) === sorted([P.lead.uid]));
  ok('  seven weeks ago is left alone', !('audience' in (await read('services/sv_bf_dold'))));
  ok('  a plan with no date (TBC) is left alone', !('audience' in (await read('songSummaries/TBC'))));
  const none = await read('services/sv_bf_dnone');
  ok('  a plan with no rota event gets an empty audience, as the planner gives it',
    Array.isArray(none.audience) && none.audience.length === 0, JSON.stringify(none));

  const r3 = run(['--today', TODAY, '--write'], EMU_ENV);
  ok('  run again, it changes nothing', r3.code === 0 && / 0 written, /.test(r3.out), r3.out.split('\n').slice(-3).join(' / '));

  /* ---- 4. the planner's own answer -------------------------------- */
  console.log('\nthe real Sunday Service Planner writes the same answer');
  const scriptD1 = { audience: sorted(s1.audience), unresolved: sorted(s1.audienceUnresolved) };
  /* Put the stale value back, so a planner that wrote nothing cannot
     pass by leaving the script's answer in place. */
  await put('services/sv_bf_d1', { date: D1, worshipLeader: 'x',
    order: [{ type: 'song', title: 'Synthetic Backfill Song', keys: ['G'], notes: 'keep me' }], audience: ['stale-uid'] });

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
  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const h = /<head[^>]*>/i.exec(t);
      body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript'
      : e === '.css' ? 'text/css' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-backfill-' + process.pid),
    '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  const ev = makeEval(send, 'audience-backfill');
  const until = async (name, expr, tries) => {
    let v = '';
    for (let i = 0; i < tries; i++) { v = String(await ev(expr)); if (v === 'yes' || v === 'blocked') break; await sleep(500); }
    ok(name, v === 'yes', v);
    return v === 'yes';
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
  await sleep(2500);
  await ev('firebase.auth(EGBCAuth.app).signOut()', true);
  await sleep(300);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
    + JSON.stringify(P.planner.email) + ',' + JSON.stringify(PW) + ')', true);
  await sleep(800);
  const me = String(await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""'));
  ok('  signed in as the synthetic planner', me === P.planner.uid, me);

  watch.reset();
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/SundayServicePlanner.html' });
  if (await until('  the planner opened and let them in',
    '(function(){ if (document.body && document.body.getAttribute("data-egbc-blocked")) return "blocked";'
    + ' return (typeof loadRota === "undefined" || document.getElementById("egbc-guard-style")) ? "no" : "yes"})()', 60)) {
    await ev('(function(){var d=document.getElementById("serviceDate");d.value=' + JSON.stringify(D1) + ';'
      + 'd.dispatchEvent(new Event("change",{bubbles:true}));return "set"})()');
    await until('  choosing ' + D1 + ' finds its two services, and not the archived one or the duplicate',
      '(function(){var s=document.getElementById("eventSelect");'
      + 'return (s && s.options.length === 3) ? "yes" : (s ? "options:" + s.options.length : "no")})()', 40);
    await ev('saveSchedule(true)', true);
    let got = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      got = await read('services/sv_bf_d1');
      if (got && sorted(got.audience) !== sorted(['stale-uid'])) break;
    }
    const plannerD1 = { audience: sorted(got && got.audience), unresolved: sorted(got && got.audienceUnresolved) };
    ok('  the planner wrote an audience', plannerD1.audience !== sorted(['stale-uid']), JSON.stringify(got));
    ok('  THE SAME PEOPLE THE SCRIPT WROTE', plannerD1.audience === scriptD1.audience,
      JSON.stringify({ planner: plannerD1.audience, script: scriptD1.audience }));
    ok('  and the same unresolved names', plannerD1.unresolved === scriptD1.unresolved,
      JSON.stringify({ planner: plannerD1.unresolved, script: scriptD1.unresolved }));
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  }

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
