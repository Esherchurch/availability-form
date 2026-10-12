/* A plan that was EMAILED but never SAVED still shows its songs.
 *
 *   node tests/check-emailed-plan.mjs          (from v2/, emulators running)
 *
 * WHAT HAPPENED (Martin, 12 Oct 2026). The Sunday plan for 11 Oct showed
 * the leaders and no songs. Samy had pressed Send, which writes
 * songSummaries/{date}, but never Save Schedule, which writes a document
 * in `services`. ChurchShow falls back to songSummaries so it showed the
 * plan correctly; the planners read only `services`, so they showed an
 * empty order. Nothing had deleted anything - the songs were in the
 * database the whole time, under the other key.
 *
 * TWO FIXES, and this checks both in all three places the planner runs:
 *   1. Sending saves the schedule first, quietly - but a failed save
 *      still speaks, because the whole point is that a plan which has
 *      gone out is never lost.
 *   2. With no `services` document for the date, the emailed order is
 *      loaded from songSummaries instead of showing nothing.
 *
 * THE THREE PLACES. egbc-core-planner.js is one file with two hosts
 * (CoreTeamApp.html and the phone app's Core Team > Plan), and
 * SundayServicePlanner.html is a separate page with its own copy of the
 * same logic. A fix in one is not a fix in the others, which is why all
 * three are walked here rather than one being taken as proof.
 *
 * Synthetic people and synthetic songs throughout. The emailed date is a
 * Sunday a long way out, so it cannot collide with anything another
 * check seeds for "the coming Sunday".
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9713, SERVE = 8929;
const PW = 'test-only-password';

const ME = { email: 'emailed.plan@example.invalid', name: 'Emailed Synthetic',
             member: 'ab_emailed_plan' };
/* The songs that were emailed and never saved. Distinctive, so finding
   them on screen cannot be a coincidence. */
const SONG1 = 'Synthetic Emailed Song';
const SONG2 = 'Synthetic Second Emailed Song';
const ITEM = 'Synthetic Notices Slot';

/* A Sunday 10 weeks out, away from every other check's "coming Sunday". */
const EMAILED = (() => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + 70);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1), day = String(d.getDate());
  return d.getFullYear() + '-' + m.padStart(2, '0') + '-' + day.padStart(2, '0');
})();

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 320) : '')));
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
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, obj) => req(8181, 'PATCH',
  DOCS + '/' + p.split('/').map(encodeURIComponent).join('/'),
  { fields: fields(obj) }, { Authorization: 'Bearer owner' });
const get = (p) => req(8181, 'GET', DOCS + '/' + p, undefined, { Authorization: 'Bearer owner' });
const runQuery = (body) => req(8181, 'POST', DOCS + ':runQuery', body, { Authorization: 'Bearer owner' });

/* Every `services` document for the emailed date, read straight out of
   the emulator rather than from the page - the page is the thing on
   trial. */
const savedServices = async () => {
  const r = await runQuery({ structuredQuery: {
    from: [{ collectionId: 'services' }],
    where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL',
             value: { stringValue: EMAILED } } } } });
  let rows = [];
  try { rows = JSON.parse(r.body || '[]'); } catch { rows = []; }
  return rows.filter(x => x && x.document).map(x => x.document);
};
const clearServices = async () => {
  for (const d of await savedServices()) {
    await req(8181, 'DELETE', '/v1/' + d.name.split('/v1/').pop()
      || d.name, undefined, { Authorization: 'Bearer owner' });
  }
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

async function seed() {
  let up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  const uid = up.localId;

  /* Worship Team LEADER, because SundayServicePlanner.html is guarded on
     data-team="Worship Team" data-role="leader", and Core Team so the
     phone app has the Core Team space. Both mirrors, or the rules put the
     teams back as they found them. */
  await put('users/' + uid, {
    uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active',
    linkedBy: 'admin', teams: ['Worship Team', 'Core Team'], adminFor: ['Worship Team'],
    masterAdmin: false, attender: true, churchMember: true });
  await put('addressBook/' + ME.member, {
    name: ME.name, email: ME.email, markers: ['Worship Team', 'Core Team'],
    adminFor: ['Worship Team'], churchMember: true, archived: false, isMinor: false });

  /* The service on the rota, so both planners can pick it. */
  await put('events/ev_emailed_plan', {
    termLabel: 'Autumn 2026', teams: ['Worship Team'], roles: ['Guitar'],
    archived: false, draft: false, date: EMAILED, startTime: '10:30',
    type: 'Sunday Morning Worship', description: 'Synthetic communion',
    serviceLeader: 'Leader Synthetic', speaker: 'Speaker Synthetic',
    assignments: { 'Worship Leader': { id: ME.member, name: ME.name } } });

  /* THE EMAILED PLAN, and NO `services` document: exactly the state
     11 Oct was in. This is the whole fixture. */
  await put('songSummaries/' + EMAILED, {
    date: EMAILED, worshipLeader: ME.name, updatedAt: new Date().toISOString(),
    items: [
      { type: 'song', idx: 1, title: SONG1, keys: ['G'], notes: 'quietly', ccli: '' },
      { type: 'item', title: ITEM },
      { type: 'song', idx: 2, title: SONG2, keys: ['D'], notes: '', ccli: '' }
    ] });
  return uid;
}

(async () => {
  const uid = await seed();
  await clearServices();
  const before = await savedServices();
  /* THE FIXTURE HAS TO BE THE FAULT. If a `services` document for this
     date survives from an earlier run, every assertion below passes for
     the wrong reason - the planner would be reading a saved schedule,
     which is the case that always worked. */
  ok('the fixture is a plan that was emailed and never saved',
    before.length === 0, before.length + ' services documents for ' + EMAILED
      + ' - the emailed-only case is not being tested');
  console.log('  emailed plan seeded for ' + EMAILED + ', no services document\n');

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
      : e === '.css' ? 'text/css' : e === '.json' ? 'application/json'
      : e === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-emailed-' + process.pid),
    '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); let errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errs.push((m.params.args || []).map(a => String(a.value || a.description || '')).join(' ').slice(0, 200));
    if (m.method === 'Runtime.exceptionThrown') {
      const d = (m.params.exceptionDetails || {});
      errs.push('uncaught: ' + String((d.exception && (d.exception.description || d.exception.value)) || d.text || '').slice(0, 200));
    }
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      /* The send itself goes nowhere: the plan email posts to a Cloud
         Function on the internet, and that is blocked here like every
         other off-machine request. That does not weaken the check - the
         save happens BEFORE the send, and the save is what is on trial. */
      if (offMachine(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  const ev = makeEval(send, 'emailed-plan');

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
  await sleep(3500);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
    + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ')', true);
  await sleep(800);
  const who = String(await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""'));
  if (who !== uid) {
    console.error('Could not sign in as ' + ME.email);
    server.close(); chrome.kill(); process.exit(2);
  }

  const until = async (label, expr, tries = 40) => {
    let last = '';
    for (let i = 0; i < tries; i++) {
      await sleep(500);
      last = String(await ev(expr));
      if (last === 'yes') break;
    }
    ok(label, last === 'yes', last);
    return last === 'yes';
  };

  /* What the order of service says on screen, whichever host drew it. */
  const orderText = (sel) => ev('(function(){var c=document.querySelector(' + JSON.stringify(sel) + ');'
    + 'if(!c)return "(no order container)";'
    + 'var v=[].slice.call(c.querySelectorAll("input,textarea")).map(function(i){return i.value}).filter(Boolean);'
    + 'return (v.join(" | ") + " " + c.textContent).replace(/\\s+/g," ").trim()})()');

  /* ---- 1. the phone app, Core Team > Plan ------------------------- */
  console.log('the phone app, Core Team \u25b8 Plan:');
  errs = [];
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
  let drawn = '';
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    drawn = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
      + '.getAttribute("data-drawn") || ""'));
    if (drawn.indexOf(uid + ':') === 0) break;
  }
  ok('  the app drew for them', drawn.indexOf(uid + ':') === 0, 'data-drawn: ' + (drawn || '(none)'));
  await ev('(function(){EGBCApp.go("core","plan");return "went"})()');
  await sleep(1800);
  await ev('(function(){var d=document.getElementById("spDate");d.value=' + JSON.stringify(EMAILED) + ';'
    + 'd.dispatchEvent(new Event("change",{bubbles:true}));return "set"})()');
  await until('  choosing the date finds the service',
    '(function(){var s=document.getElementById("spEventSelect");'
    + 'return (s && s.options.length > 1) ? "yes" : "no"})()', 40);
  await ev('(function(){var s=document.getElementById("spEventSelect");'
    + 'if(!s||s.options.length<2)return "no";s.value=s.options[1].value;'
    + 's.dispatchEvent(new Event("change",{bubbles:true}));return "chose"})()');
  /* A SONG TITLE IS AN INPUT'S VALUE, AND A VALUE IS NOT IN innerHTML.
     The first version of this waited on c.innerHTML containing the
     title and timed out every time - while the assertion on the next
     line, which reads input.value, found both songs. A wait that can
     only time out is not a wait, and had the next assertion not
     disagreed with it I would have believed the "no". */
  await until('  and the EMAILED songs are on the order of service',
    '(function(){var c=document.getElementById("sp-order");if(!c)return "no";'
    + 'var v=[].slice.call(c.querySelectorAll("input,textarea")).map(function(i){return i.value}).join(" | ");'
    + 'return (v.indexOf(' + JSON.stringify(SONG1) + ') !== -1) ? "yes" : "no"})()', 40);
  let shown = String(await orderText('#sp-order'));
  ok('  both songs and the plain item, in the emailed order',
    shown.indexOf(SONG1) !== -1 && shown.indexOf(SONG2) !== -1 && shown.indexOf(ITEM) !== -1
      && shown.indexOf(SONG1) < shown.indexOf(SONG2), shown.slice(0, 260));
  ok('  nothing on the console', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  /* SEND WRITES A services DOCUMENT. The email cannot leave this
     machine, and does not need to: the save is first. */
  await clearServices();
  errs = [];
  await ev('spEmail()', true);
  await sleep(3000);
  let after = await savedServices();
  ok('  pressing Send saves the schedule too',
    after.length === 1, after.length + ' services documents written');
  const appOrder = JSON.stringify(after[0] ? after[0].fields : {});
  ok('  and what it saved is the emailed order, not an empty one',
    appOrder.indexOf(SONG1) !== -1 && appOrder.indexOf(SONG2) !== -1,
    appOrder.slice(0, 260));

  /* ---- 2. CoreTeamApp.html, the installed one --------------------- */
  console.log('\nCoreTeamApp, the installed one:');
  await clearServices();
  errs = [];
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/CoreTeamApp.html' });
  await until('  the Core Team app loaded',
    '(typeof openSection === "undefined") ? "no" : "yes"', 60);
  await ev('(function(){try{if(typeof endTour==="function")endTour()}catch(e){}'
    + 'var o=document.getElementById("tour-overlay");if(o)o.classList.remove("active");'
    + 'openSection("service");return "opened"})()');
  await sleep(1500);
  await ev('(function(){var d=document.getElementById("spDate");d.value=' + JSON.stringify(EMAILED) + ';'
    + 'd.dispatchEvent(new Event("change",{bubbles:true}));return "set"})()');
  await until('  choosing the date finds the service',
    '(function(){var s=document.getElementById("spEventSelect");'
    + 'return (s && s.options.length > 1) ? "yes" : "no"})()', 40);
  await ev('(function(){var s=document.getElementById("spEventSelect");'
    + 'if(!s||s.options.length<2)return "no";s.value=s.options[1].value;'
    + 's.dispatchEvent(new Event("change",{bubbles:true}));return "chose"})()');
  /* A SONG TITLE IS AN INPUT'S VALUE, AND A VALUE IS NOT IN innerHTML.
     The first version of this waited on c.innerHTML containing the
     title and timed out every time - while the assertion on the next
     line, which reads input.value, found both songs. A wait that can
     only time out is not a wait, and had the next assertion not
     disagreed with it I would have believed the "no". */
  await until('  and the EMAILED songs are on the order of service',
    '(function(){var c=document.getElementById("sp-order");if(!c)return "no";'
    + 'var v=[].slice.call(c.querySelectorAll("input,textarea")).map(function(i){return i.value}).join(" | ");'
    + 'return (v.indexOf(' + JSON.stringify(SONG1) + ') !== -1) ? "yes" : "no"})()', 40);
  shown = String(await orderText('#sp-order'));
  ok('  both songs and the plain item, in the emailed order',
    shown.indexOf(SONG1) !== -1 && shown.indexOf(SONG2) !== -1 && shown.indexOf(ITEM) !== -1
      && shown.indexOf(SONG1) < shown.indexOf(SONG2), shown.slice(0, 260));
  ok('  nothing on the console', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  /* ---- 3. SundayServicePlanner.html, its own copy ----------------- */
  console.log('\nSundayServicePlanner.html, which has its own copy of this:');
  await clearServices();
  errs = [];
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/SundayServicePlanner.html' });
  await until('  the planner loaded and let them in',
    '(function(){ if (document.body && document.body.getAttribute("data-egbc-blocked")) return "blocked";'
    + ' return (typeof loadRota === "undefined") ? "no" : "yes"})()', 60);
  await ev('(function(){var d=document.getElementById("serviceDate");d.value=' + JSON.stringify(EMAILED) + ';'
    + 'd.dispatchEvent(new Event("change",{bubbles:true}));return "set"})()');
  await until('  choosing the date finds the service',
    '(function(){var s=document.getElementById("eventSelect");'
    + 'return (s && s.options.length > 1) ? "yes" : "no"})()', 40);
  await ev('(function(){var s=document.getElementById("eventSelect");'
    + 'if(!s||s.options.length<2)return "no";s.value=s.options[1].value;'
    + 's.dispatchEvent(new Event("change",{bubbles:true}));return "chose"})()');
  /* A SONG TITLE IS AN INPUT'S VALUE, AND A VALUE IS NOT IN innerHTML.
     The first version of this waited on c.innerHTML containing the
     title and timed out every time - while the assertion on the next
     line, which reads input.value, found both songs. A wait that can
     only time out is not a wait, and had the next assertion not
     disagreed with it I would have believed the "no". */
  await until('  and the EMAILED songs are on the order of service',
    '(function(){var c=document.getElementById("service-order");if(!c)return "no";'
    + 'var v=[].slice.call(c.querySelectorAll("input,textarea")).map(function(i){return i.value}).join(" | ");'
    + 'return (v.indexOf(' + JSON.stringify(SONG1) + ') !== -1) ? "yes" : "no"})()', 40);
  shown = String(await orderText('#service-order'));
  ok('  both songs and the plain item, in the emailed order',
    shown.indexOf(SONG1) !== -1 && shown.indexOf(SONG2) !== -1 && shown.indexOf(ITEM) !== -1
      && shown.indexOf(SONG1) < shown.indexOf(SONG2), shown.slice(0, 260));

  await clearServices();
  errs = [];
  await ev('emailSchedule()', true);
  await sleep(3500);
  after = await savedServices();
  ok('  pressing Send saves the schedule too',
    after.length === 1, after.length + ' services documents written');
  const sspOrder = JSON.stringify(after[0] ? after[0].fields : {});
  ok('  and what it saved is the emailed order, not an empty one',
    sspOrder.indexOf(SONG1) !== -1 && sspOrder.indexOf(SONG2) !== -1,
    sspOrder.slice(0, 260));
  ok('  nothing on the console', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  /* ---- and a saved schedule still wins ---------------------------- */
  /* The fallback must not override a real saved plan. If it did, editing
     and saving a plan would appear to do nothing the next time it was
     opened, which would be a worse fault than the one being fixed. */
  console.log('\na saved schedule still wins over the emailed one:');
  await clearServices();
  await put('services/sv_emailed_plan', {
    date: EMAILED, worshipLeader: ME.name, serviceNotes: '', introText: '',
    outroText: '', roleNotes: {},
    order: [{ type: 'song', title: 'Synthetic SAVED Song', keys: ['A'], notes: '' }] });
  errs = [];
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/SundayServicePlanner.html' });
  await until('  the planner loaded',
    '(typeof loadRota === "undefined") ? "no" : "yes"', 60);
  await ev('(function(){var d=document.getElementById("serviceDate");d.value=' + JSON.stringify(EMAILED) + ';'
    + 'd.dispatchEvent(new Event("change",{bubbles:true}));return "set"})()');
  await until('  choosing the date finds the service',
    '(function(){var s=document.getElementById("eventSelect");'
    + 'return (s && s.options.length > 1) ? "yes" : "no"})()', 40);
  await ev('(function(){var s=document.getElementById("eventSelect");'
    + 'if(!s||s.options.length<2)return "no";s.value=s.options[1].value;'
    + 's.dispatchEvent(new Event("change",{bubbles:true}));return "chose"})()');
  await sleep(2500);
  shown = String(await orderText('#service-order'));
  ok('  the SAVED song is shown', shown.indexOf('Synthetic SAVED Song') !== -1, shown.slice(0, 220));
  ok('  and the emailed one is not put over the top of it',
    shown.indexOf(SONG1) === -1, shown.slice(0, 220));
  await req(8181, 'DELETE', DOCS + '/services/sv_emailed_plan', undefined,
    { Authorization: 'Bearer owner' });

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
