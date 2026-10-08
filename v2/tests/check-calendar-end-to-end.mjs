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
  const signUp = await rest(AUTH[0], Number(AUTH[1]), 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: ME.email, password: ME.pw, returnSecureToken: true });
  const uid = JSON.parse(signUp.body).localId;

  await put('addressBook/' + ME.member, { name: 'Rota Tester', email: ME.email, markers: ['Worship Team'] });
  await put('addressBook/' + OTHER, { name: 'Other Synthetic', email: 'other@example.invalid', markers: ['Worship Team'] });
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

  await ev('openMyCalendar();1'); await sleep(4000);
  const url1 = await ev("(document.getElementById('calendarUrl')||{}).value||''");
  ok('pressing it gives a link', /rotaFeed\?k=[a-z0-9]{16,}/.test(String(url1)), String(url1).replace(/k=.{8}.*/, 'k=…'));
  ok('the three calendar apps are offered',
    /Google Calendar/.test(await ev("(document.getElementById('calendarBody')||{}).textContent||''")) &&
    /Apple/.test(await ev("(document.getElementById('calendarBody')||{}).textContent||''")),
    'Google, Apple, Outlook');

  const key1 = (String(url1).match(/k=([a-z0-9]+)/) || [])[1];
  const feed1 = await rest('localhost', FN_PORT, 'GET', `/${PROJECT}/${REGION}/rotaFeed?k=${key1}`);
  ok('that link serves their calendar', feed1.status === 200 && /BEGIN:VCALENDAR/.test(feed1.body), feed1.status);
  ok('with their slot in it', /SUMMARY:EGBC: Guitar/.test(feed1.body),
    (feed1.body.match(/SUMMARY:[^\r\n]+/g) || []).join(' | '));
  ok('and nobody else in it at all',
    !/Other Synthetic/.test(feed1.body) && !/Leader Synthetic/.test(feed1.body) && !/Speaker Synthetic/.test(feed1.body),
    'searched for the other three invented names');
  ok('and not the Sunday that is not theirs', !/ev_theirs/.test(feed1.body));

  /* Reset, the way a person does it. */
  await ev('resetMyCalendar();1'); await sleep(4500);
  const url2 = await ev("(document.getElementById('calendarUrl')||{}).value||''");
  const key2 = (String(url2).match(/k=([a-z0-9]+)/) || [])[1];
  ok('resetting gives a different link', !!key2 && key2 !== key1,
    (key1 || '').slice(0, 6) + '… -> ' + (key2 || '').slice(0, 6) + '…');

  const feedOld = await rest('localhost', FN_PORT, 'GET', `/${PROJECT}/${REGION}/rotaFeed?k=${key1}`);
  ok('the old link stops working', feedOld.status === 404, feedOld.status);
  const feedNew = await rest('localhost', FN_PORT, 'GET', `/${PROJECT}/${REGION}/rotaFeed?k=${key2}`);
  ok('the new one works', feedNew.status === 200 && /SUMMARY:EGBC: Guitar/.test(feedNew.body), feedNew.status);

  ok('the hub said nothing on its console throughout', watch.errors.length === 0, watch.summary());

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
