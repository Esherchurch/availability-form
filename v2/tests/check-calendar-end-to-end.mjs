/* The whole thing, the way a person does it.
 *
 *   firebase emulators:exec --only firestore,auth,functions --project egbc-worship-planner ^
 *     "node tests/check-calendar-end-to-end.mjs"
 *
 * (from v2/. Needs the functions emulator, so it brings its own emulators
 * rather than using the dev ones - stop those first, or the ports clash.)
 *
 * check-rota-feed.mjs tests the server on its own. This one signs a synthetic
 * member in to the hub in a real browser, opens the menu, presses "My rota",
 * and checks that what comes back is a link that really serves that person's
 * calendar and nobody else's - then presses "Reset my calendar link" and checks
 * the old address stops working.
 *
 * Synthetic people throughout.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9626, SERVE = 8867;
const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const REGION = 'europe-west2';
const FN_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5101);
const FS = (process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8181').split(':');
const AUTH = (process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099').split(':');

const ME = { email: 'rota.tester@example.invalid', pw: 'test-only-password', member: 'ab_rota_tester' };
const OTHER = 'ab_rota_other';

const rest = (host, port, method, p, body, hdrs) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host, port, method, path: p,
    headers: Object.assign({}, hdrs || {},
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej); req.end(data);
});
const DOCS = `/v1/projects/${PROJECT}/databases/(default)/documents`;
const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, o) => rest(FS[0], Number(FS[1]), 'PATCH', DOCS + '/' + p, { fields: fields(o) },
  { Authorization: 'Bearer owner' });

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 260) : '')); };

const SIGNIN = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>`;
const NO_SW = `<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>`;
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

async function seed() {
  /* Sign the invented account up, or sign in if a previous run already made
     it. This used to only sign up, so the check worked once per emulator and
     then died on "Cannot read properties of undefined" - which says nothing
     about what is wrong. A check that can only be run on a fresh emulator is
     a check nobody runs. */
  const signUp = await rest(AUTH[0], Number(AUTH[1]), 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: ME.email, password: ME.pw, returnSecureToken: true });
  let uid = JSON.parse(signUp.body || '{}').localId;
  if (!uid) {
    const signIn = await rest(AUTH[0], Number(AUTH[1]), 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: ME.email, password: ME.pw, returnSecureToken: true });
    uid = JSON.parse(signIn.body || '{}').localId;
  }
  if (!uid) throw new Error('Could not make or sign in to ' + ME.email +
    ' - is the auth emulator up? ' + String(signUp.body).slice(0, 120));

  await put('addressBook/' + ME.member, { name: 'Rota Tester', email: ME.email, markers: ['Worship Team'] });
  /* In the same invented household, so the household feed has somebody in it
     other than the person asking - which is the whole of what 18 is for.
     Karen and Oliver are the named case; this is the same shape driven
     through the hub rather than through the function. */
  await put('addressBook/' + OTHER, { name: 'Other Synthetic', email: 'other@example.invalid',
    markers: ['Worship Team'], householdId: ME.member });
  await put('users/' + uid, { uid, email: ME.email, name: 'Rota Tester', memberId: ME.member,
    status: 'active', teams: ['Worship Team'], adminFor: [], masterAdmin: false, linkedBy: 'admin' });

  const base = { termLabel: 'Autumn 2026', teams: ['Worship Team'], roles: ['Guitar', 'Keyboard'],
    archived: false, draft: false, serviceLeader: 'Leader Synthetic', speaker: 'Speaker Synthetic' };
  await put('events/ev_mine', { ...base, date: '2026-10-11', startTime: '08:00', endTime: '11:30',
    type: 'Sunday Morning Worship', description: 'Communion',
    assignments: { Guitar: { id: ME.member, name: 'Rota Tester' }, Keyboard: { id: OTHER, name: 'Other Synthetic' } } });
  await put('events/ev_theirs', { ...base, date: '2026-10-18', startTime: '08:00', endTime: '11:30',
    type: 'Sunday Morning Worship', description: '',
    assignments: { Keyboard: { id: OTHER, name: 'Other Synthetic' } } });

  /* Start with no links at all, so "no link has been made until one is asked
     for" is a question and not a coincidence. A previous run leaves links
     behind, and without this the check passed or failed depending on whether
     the emulator had been restarted. */
  const keysDoc = await rest(FS[0], Number(FS[1]), "GET", DOCS + "/calendarKeys/" + uid, null, { Authorization: "Bearer owner" });
  let had = {};
  try { had = (JSON.parse(keysDoc.body || '{}').fields || {}).feeds || {}; } catch (e) {}
  const keyList = Object.values((had.mapValue || {}).fields || {})
    .map(v => (((v.mapValue || {}).fields || {}).key || {}).stringValue).filter(Boolean);
  for (const k of keyList) {
    await rest(FS[0], Number(FS[1]), 'DELETE', DOCS + '/calendarFeeds/' + k, null, { Authorization: 'Bearer owner' });
  }
  await rest(FS[0], Number(FS[1]), 'DELETE', DOCS + '/calendarKeys/' + uid, null, { Authorization: 'Bearer owner' });

  return uid;
}

(async () => {
  const uid = await seed();
  console.log('seeded a synthetic member (' + uid.slice(0, 8) + '…) with one slot of their own\n');

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('not found'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const head = /<head[^>]*>/i.exec(t);
      body = Buffer.from(head ? t.slice(0, head.index + head[0].length) + NO_SW + t.slice(head.index + head[0].length) : NO_SW + t, 'utf8');
    }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-cal-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 950, deviceScaleFactor: 1, mobile: false });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(ME.pw) + ')', true);
  watch.reset();
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(12000);
  await ev('window.alert=()=>{};window.confirm=()=>true;window.prompt=()=>null;1');

  await ev("(()=>{try{openTools()}catch(e){const p=document.getElementById('panel');if(p)p.classList.add('open')}})();1");
  await sleep(1500);
  const row = await ev("(()=>{const el=document.getElementById('panelCalendar');return el?el.textContent.replace(/\\s+/g,' ').trim():'(nothing)'})()");
  ok('"My rota" is in the menu', /My rota/.test(String(row)), row);

  await ev('openMyCalendar();1'); await sleep(4500);

  /* 18: the panel offers the choices rather than one link, and makes none of
     them until asked. A link that exists is a link that can get out. */
  const panel = () => ev("(document.getElementById('calendarBody')||{}).textContent||''");
  /* IS IT ACTUALLY ON THE SCREEN? Everything below reads the DOM, which a
     hidden panel still has. The modal was adding the class "open" while the
     CSS shows it on ".on", so pressing "My rota" put the panel together and
     left it invisible - and every check here passed. Offsets, not markup. */
  const seen = await ev(
    "(function(){var m=document.getElementById('calendarModal');if(!m)return 'no modal';" +
    "var cs=getComputedStyle(m);if(cs.display==='none'||cs.visibility==='hidden')return 'hidden: display '+cs.display;" +
    "var b=document.getElementById('calendarBody');var r=b?b.getBoundingClientRect():null;" +
    "if(!r||r.height<40)return 'drawn but nothing in it';" +
    "var top=document.elementFromPoint(Math.round(r.left+r.width/2),Math.round(r.top+20));" +
    "return (top&&m.contains(top))?'on screen':'covered by '+(top?(top.id||top.className||top.tagName):'nothing')})()");
  ok('the panel is actually on the screen, not just in the page',
    seen === 'on screen', String(seen));

  const choices = String(await panel());
  ok('the three choices are offered in plain words',
    /Just me/.test(choices) && /My household/.test(choices) && /The full rota/.test(choices),
    choices.replace(/\s+/g, ' ').slice(0, 150));
  ok('no link has been made until one is asked for',
    !/rotaFeed\?k=/.test(String(await ev("(document.getElementById('calendarBody')||{}).innerHTML||''"))),
    'nothing in the panel is an address yet');

  const urlFor = async (id) => String(await ev("(document.getElementById('calurl-" + id + "')||{}).value||''"));
  const keyFrom = (u) => (String(u).match(/k=([a-z0-9]+)/) || [])[1] || '';

  await ev("makeCalendarLink('me');1"); await sleep(4000);
  const url1 = await urlFor('me');
  ok('pressing "Just me" gives a link', /rotaFeed\?k=[a-z0-9]{16,}/.test(url1),
    url1.replace(/k=.{8}.*/, 'k=...'));
  ok('the three calendar apps are offered',
    /Google/.test(String(await panel())) && /Apple/.test(String(await panel())) && /Outlook/.test(String(await panel())),
    'Google, Apple / iPhone, Outlook');
  ok('and so are Copy link and Reset this link',
    /Copy link/.test(String(await panel())) && /Reset this link/.test(String(await panel())));

  const key1 = keyFrom(url1);
  const feed1 = await rest('localhost', FN_PORT, 'GET', `/${PROJECT}/${REGION}/rotaFeed?k=${key1}`);
  ok('that link serves their calendar', feed1.status === 200 && /BEGIN:VCALENDAR/.test(feed1.body), feed1.status);
  ok('with their slot in it', /SUMMARY:EGBC: Guitar/.test(feed1.body),
    (feed1.body.match(/SUMMARY:[^\r\n]+/g) || []).join(' | '));
  ok('and nobody else in it at all',
    !/Other Synthetic/.test(feed1.body) && !/Leader Synthetic/.test(feed1.body) && !/Speaker Synthetic/.test(feed1.body),
    'searched for the other three invented names');
  ok('and not the Sunday that is not theirs', !/ev_theirs/.test(feed1.body));

  /* The household one, from the same panel. */
  await ev("makeCalendarLink('household');1"); await sleep(4000);
  const urlH = await urlFor('household');
  const keyH = keyFrom(urlH);
  ok('"My household" gives a link of its own', !!keyH && keyH !== key1,
    'two different addresses');
  const feedH = await rest('localhost', FN_PORT, 'GET', `/${PROJECT}/${REGION}/rotaFeed?k=${keyH}`);
  ok('and it serves a calendar', feedH.status === 200 && /BEGIN:VCALENDAR/.test(feedH.body), feedH.status);
  /* The line Karen reads in her month view, exactly. Asking only "is the
     name in there somewhere" let a real fault through: firstName() had lost
     a backslash and was splitting on the letter s, so "Rota Tester" came out
     as "Rota Te" - and a test looking for "Other Synthetic" passed, because
     that name happens to contain no lower-case s. */
  const hSummaries = (feedH.body.match(/SUMMARY:[^\r\n]+/g) || []);
  ok('  the household line is first names and roles, exactly',
    hSummaries.includes('SUMMARY:EGBC: Other: Keyboard'),
    hSummaries.join(' | ').slice(0, 200));
  ok('  with the OTHER person in the house on it',
    /Other Synthetic/.test(feedH.body) && /Keyboard/.test(feedH.body),
    (feedH.body.match(/SUMMARY:[^\r\n]+/g) || []).join(" | ").slice(0, 160));
  ok('  including the Sunday that is theirs and not mine',
    /ev_theirs/.test(feedH.body) && !/ev_theirs/.test(feed1.body),
    'the household feed has it, "Just me" does not');
  ok('  which a calendar app can tell apart from the other one',
    /X-WR-CALNAME:[^\r\n]*household/i.test(feedH.body) &&
    !/X-WR-CALNAME:[^\r\n]*household/i.test(feed1.body),
    (feedH.body.match(/X-WR-CALNAME:[^\r\n]+/) || ['(none)'])[0]);

  /* Reset, the way a person does it: one row's button. */
  await ev("resetCalendarLink('me');1"); await sleep(4500);
  const url2 = await urlFor('me');
  const key2 = keyFrom(url2);
  ok('resetting gives a different link', !!key2 && key2 !== key1,
    (key1 || '').slice(0, 6) + '... -> ' + (key2 || '').slice(0, 6) + '...');

  const feedOld = await rest('localhost', FN_PORT, 'GET', `/${PROJECT}/${REGION}/rotaFeed?k=${key1}`);
  ok('the old link stops working', feedOld.status === 404, feedOld.status);
  const feedNew = await rest('localhost', FN_PORT, 'GET', `/${PROJECT}/${REGION}/rotaFeed?k=${key2}`);
  ok('the new one works', feedNew.status === 200 && /SUMMARY:EGBC: Guitar/.test(feedNew.body), feedNew.status);
  const feedHStill = await rest('localhost', FN_PORT, 'GET', `/${PROJECT}/${REGION}/rotaFeed?k=${keyH}`);
  ok('and the household link is untouched by it', feedHStill.status === 200,
    'resetting one leaves the others working');

  /* Shut and reopen: the links it already has come back, and no new ones are
     made on the way. */
  await ev("document.getElementById('calendarModal').classList.remove('on');1");
  await sleep(500);
  await ev('openMyCalendar();1'); await sleep(4000);
  ok('reopening shows the links already made, without making more',
    keyFrom(await urlFor('me')) === key2 && keyFrom(await urlFor('household')) === keyH,
    'same two addresses came back');

  if (process.argv.includes('--shots')) {
    fs.mkdirSync(path.join(V2, 'tests', 'shots'), { recursive: true });
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(V2, 'tests', 'shots', 'calendar--three-feeds.png'),
      Buffer.from(r.data, 'base64'));
    console.log("");
    console.log("screenshot in tests/shots/");
  }

  ok('the hub said nothing on its console throughout', watch.errors.length === 0, watch.summary());

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
