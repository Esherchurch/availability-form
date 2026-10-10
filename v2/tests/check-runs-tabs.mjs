/* Who sees Running things, and which tabs (NEXT-BRIEF §25).
 *
 *   node tests/check-runs-tabs.mjs [--shots]   (from v2/, emulators running)
 *
 * MARTIN: "the church Admin might not be core team" and "we do need to be
 * able to set groups though so we dont have to individual tick 130
 * profiles."
 *
 * spacesFor() used to give the whole Running things space to anyone who
 * administered anything, or was on Core Team. That is wrong BOTH ways, and
 * both ways are checked here: the church administrator who is not on Core
 * Team must get it, and the Worship admin who is in no group must not.
 *
 * Access is set on a GROUP - a team with rota:false carrying `runs` - and
 * people are put in the group the way they are put on a team. So the office
 * changes one document and everybody in it changes at once, which is the
 * sixth check below and the reason for the whole design.
 *
 * The §25 list, in order:
 *   a "Bookings" group member sees one tab
 *   a Worship admin in no group sees no Running things
 *   the church admin who is not Core but is in "Church office" sees all four
 *   a change to the group's runs changes every member
 *   an individual extra tick adds to the group's
 *   view-as follows it
 *
 * Synthetic people throughout.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9697, SERVE = 8913;
const PROJECT = 'egbc-worship-planner';
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
  + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : ''))); };

const DOCS = `/v1/projects/${PROJECT}/databases/(default)/documents`;
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
/* Each segment encoded: a team's id is its name, and every name has a
   space in it. */
const put = (p, obj) => req(8181, 'PATCH',
  DOCS + '/' + p.split('/').map(encodeURIComponent).join('/'),
  { fields: fields(obj) }, { Authorization: 'Bearer owner' });

/* The two groups §25 starts with, plus one to prove a group is just a team
   with rota:false and no space of its own. */
const GROUPS = {
  'Church office': { runs: ['today', 'people', 'bookings', 'send'] },
  'Bookings':      { runs: ['bookings'] }
};

const PEOPLE = {
  /* The church administrator Martin describes: not on Core Team at all. */
  churchAdmin: { email: 'runs.office@example.invalid', teams: ['Church office'], adminFor: [],
                 want: ['today', 'people', 'bookings', 'send'], note: 'in Church office, not Core Team' },
  bookings:    { email: 'runs.bookings@example.invalid', teams: ['Bookings'], adminFor: [],
                 want: ['bookings'], note: 'in the Bookings group' },
  /* The one the old rule got wrong in the other direction. */
  worshipAdmin:{ email: 'runs.worship@example.invalid', teams: ['Worship Team'], adminFor: ['Worship Team'],
                 want: [], note: 'a Worship admin in no group' },
  coreTeam:    { email: 'runs.core@example.invalid', teams: ['Core Team'], adminFor: [],
                 want: [], note: 'on Core Team and in no group' },
  /* A group's tabs plus one of their own. */
  plusOne:     { email: 'runs.plusone@example.invalid', teams: ['Bookings'], adminFor: [],
                 runs: ['send'], want: ['bookings', 'send'], note: 'the Bookings group plus one tick' },
  master:      { email: 'runs.master@example.invalid', teams: [], adminFor: [], masterAdmin: true,
                 want: ['today', 'people', 'bookings', 'send'], note: 'a master admin' }
};

const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const reachedOff = [];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });

  for (const [name, g] of Object.entries(GROUPS)) {
    await put('teams/' + name, {
      name, label: name, colour: '#111827', rota: false, runs: g.runs, archived: false });
  }

  for (const [key, p] of Object.entries(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    p.name = 'Runs ' + key;
    p.memberId = 'ab_runs_' + key;
    await put('users/' + p.uid, {
      uid: p.uid, email: p.email, name: p.name, memberId: p.memberId,
      status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor,
      masterAdmin: p.masterAdmin === true, attender: true, churchMember: false,
      runs: p.runs || [] });
    await put('addressBook/' + p.memberId, {
      name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor,
      masterAdmin: p.masterAdmin === true,
      churchMember: false, archived: false, isMinor: false, runs: p.runs || [] });
  }
  console.log('seeded 2 groups and 6 synthetic people\n');

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
      : e === '.css' ? 'text/css' : e === '.json' ? 'application/json' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-runs-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errs.push((m.params.args || []).map(a => String(a.value || a.description || '')).join(' ').slice(0, 160));
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) { reachedOff.push(u.split('/')[2]); return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); }
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  /* https only - pausing http stops Firestore's own stream (A-062). */
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };
  const until = async (what, expr, tries = 40) => {
    let last = '';
    for (let i = 0; i < tries; i++) {
      await sleep(400);
      last = String(await ev(expr, true));
      if (last === 'yes') return true;
    }
    ok(what, false, 'gave up, last: ' + last);
    return false;
  };

  const openAs = async (p) => {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await send('Storage.clearDataForOrigin', { origin: 'http://localhost:' + SERVE,
      storageTypes: 'indexeddb,local_storage,cache_storage,websql,service_workers' });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await until('the harness loaded for ' + p.name,
      '(typeof firebase === "undefined" || typeof EGBCAuth === "undefined") ? "no" : "yes"');
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
      + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').catch(function(){})', true);
    await until('signed in as ' + p.name,
      'firebase.auth(EGBCAuth.app).currentUser && firebase.auth(EGBCAuth.app).currentUser.uid === '
      + JSON.stringify(p.uid) + ' ? "yes" : "no"');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
    /* The same narrow reload as check-app-shell.mjs, for the same reason
       (A-062): the Firestore emulator intermittently leaves a new browser
       client unable to open a stream, and the page then sits on the
       guard's splash for ever because nothing in it retries (A-063).
       Without this, a deliberate break reads as "caught" when what
       actually happened was a dropped connection - which is exactly what
       the first run of break B did. */
    for (let attempt = 0; attempt < 4; attempt++) {
      for (let i = 0; i < 40; i++) {
        await sleep(500);
        const drawn = String(await ev(
          '(document.getElementById("egbc-app")||{getAttribute:function(){return ""}}).getAttribute("data-drawn") || ""'));
        if (drawn.indexOf(p.uid + ':') === 0) return true;
      }
      const stuck = String(await ev(
        '(!!document.getElementById("egbc-guard-splash")'
        + ' && typeof EGBCAuth !== "undefined" && !!EGBCAuth.user() && !EGBCAuth.profile())'
        + ' ? "stuck" : "drawn-wrong"'));
      if (stuck !== 'stuck') break;
      console.log('  note  ' + p.name + ' could not reach the emulator; reloading');
      await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
    }
    ok('the app drew for ' + p.name, false, 'it never did');
    return false;
  };

  /* TWO LAYERS, AND THEY ARE NOT THE SAME QUESTION.

       allowed() - what the person's groups and ticks permit (runsTabs)
       shown()   - what the tab bar offers, which ALSO needs a screen

     §25 says "a visible tab must actually open for that person". Today is
     permitted by the Church office group and has no screen behind it yet,
     so it is allowed and not shown - which is the rule working, not a
     fault. Asserting only the second would hide a group losing a tab;
     asserting only the first would promise a tab that opens nothing. */
  const allowed = () => ev('JSON.stringify(EGBCAuth.runsTabs())');
  const tabs = () => ev("JSON.stringify(EGBCApp.tabsFor('office').map(t => t[0]))");
  /* The Running things tabs that have a screen today. When Today is built,
     this check fails and says so, rather than quietly starting to pass. */
  const BUILT = ['people', 'bookings', 'send'];
  const shownFor = (want) => want.filter(t => BUILT.includes(t));
  const spaces = () => ev("JSON.stringify(EGBCApp.spacesFor(EGBCApp.who()))");
  const onScreen = () => ev("Array.from(document.querySelectorAll('.tab')).map(b => b.dataset.tab).join(',')");

  /* ---- the §25 list, in order ---------------------------------------- */
  console.log('who runs things, and which tabs');

  for (const key of ['bookings', 'worshipAdmin', 'coreTeam', 'churchAdmin', 'plusOne', 'master']) {
    const p = PEOPLE[key];
    await openAs(p);
    const allow = JSON.parse(String(await allowed()));
    const got = JSON.parse(String(await tabs()));
    const sp = JSON.parse(String(await spaces()));
    ok(p.note + ' is allowed ' + (p.want.length ? p.want.join(', ') : 'nothing'),
      allow.join(',') === p.want.join(','), 'allowed: ' + JSON.stringify(allow));
    ok('  and is shown ' + (shownFor(p.want).join(', ') || 'no Running things'),
      got.join(',') === shownFor(p.want).join(','), 'shown: ' + JSON.stringify(got));
    ok('  the space is ' + (p.want.length ? 'offered' : 'not offered at all'),
      sp.includes('office') === (shownFor(p.want).length > 0), JSON.stringify(sp));
  }

  /* Said once, loudly, rather than buried in the expectations above. */
  console.log('\nallowed but not built');
  await openAs(PEOPLE.churchAdmin);
  ok('Today is allowed by the Church office group',
    JSON.parse(String(await allowed())).includes('today'), await allowed());
  ok('  and is NOT shown, because no screen is behind it yet',
    !JSON.parse(String(await tabs())).includes('today'), await tabs());
  ok('  so no tab in Running things opens nothing',
    JSON.parse(String(await tabs())).every(t => BUILT.includes(t)), await tabs());

  /* The one that is the point of groups: change the group, and everybody
     in it changes - nobody is ticked one at a time. */
  console.log('\nchanging the group changes its members');
  await put('teams/Bookings', {
    name: 'Bookings', label: 'Bookings', colour: '#111827', rota: false,
    runs: ['bookings', 'today'], archived: false });
  await openAs(PEOPLE.bookings);
  ok('the Bookings group now carries Today as well, and its member is allowed it',
    JSON.parse(String(await allowed())).join(',') === 'today,bookings',
    String(await allowed()));
  ok('  and nobody was ticked to do it',
    (await ev('JSON.stringify((EGBCAuth.profile()||{}).runs || [])')) === '[]',
    await ev('JSON.stringify((EGBCAuth.profile()||{}).runs || [])'));
  /* ...and put back, so the rest of the run sees the §25 starting state. */
  await put('teams/Bookings', {
    name: 'Bookings', label: 'Bookings', colour: '#111827', rota: false,
    runs: ['bookings'], archived: false });

  /* A VISIBLE TAB MUST ACTUALLY OPEN. §25 says so, and says to stop rather
     than loosen a rule quietly. */
  console.log('\na visible tab opens for the person who sees it');
  await openAs(PEOPLE.bookings);
  const drew = String(await ev(`(() => {
    EGBCApp.go('office', 'bookings');
    const c = document.getElementById('egbc-content');
    return c ? (c.innerText || '').trim().slice(0, 120) : '(nothing)';
  })()`));
  ok('the Bookings tab draws something for a Bookings group member',
    drew && drew !== '(nothing)' && !/THREW/.test(drew), drew);
  ok('  and the tab bar shows exactly the one tab',
    (await onScreen()) === 'bookings', await onScreen());

  /* VIEW-AS. A master admin looking through somebody else's eyes must see
     what they see, or the feature cannot be used to check any of this. */
  console.log('\nview-as follows it');
  await openAs(PEOPLE.master);
  ok('a master admin is allowed all four',
    JSON.parse(String(await allowed())).length === 4, await allowed());
  await ev(`sessionStorage.setItem('egbc_view_as', JSON.stringify({ team: 'Bookings', role: 'member' }))`);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if (String(await ev('(document.getElementById("egbc-app")||{getAttribute:()=>""}).getAttribute("data-drawn")||""'))) break;
  }
  ok('LOOKING AS THE BOOKINGS GROUP, they see its one tab',
    JSON.parse(String(await tabs() || '[]')).join(',') === 'bookings', await tabs());
  ok('  and not their own four', (await tabs()) !== '["today","people","bookings","send"]', await tabs());

  console.log('\nthe console, and where the app went');
  const real = errs.filter(e => !/Could not reach Cloud Firestore|client is offline|profile load failed|Logo fetch failed|storage\/object-not-found/i.test(e));
  ok('nothing on the console', real.length === 0, JSON.stringify(real).slice(0, 300));
  const unexpected = [...new Set(reachedOff)].filter(h => h !== 'firebasestorage.googleapis.com');
  ok('nothing reached anywhere off this machine that is not accounted for',
    unexpected.length === 0, unexpected.join(', '));

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
