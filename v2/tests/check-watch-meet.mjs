/* Watch live on the front page, "Listen & Watch", the Menu's "Watch", and
 * Meet only on the day (F-164; Martin, 14 Oct 2026).
 *
 *   node tests/check-watch-meet.mjs      (from v2/, the dev emulators up)
 *
 * WATCH (F-164), from the events window's watchLive():
 *   - on the app's Home, a "Watch live" card that opens Me > Listen & Watch;
 *   - on the desktop hub's front page, the same card with the player in it
 *     (the no-cookie address, for this week's video);
 *   - neither once the live window has passed;
 *   - the Me tab is called "Listen & Watch";
 *   - the Menu's "Watch" is there for a master admin and for somebody named
 *     in sermonShow/access, and not for anyone else.
 * MEET ONLY WHEN IT IS NEEDED ("we dont need the meet now at all unless it
 * is in the diary for that day"):
 *   - with a video meeting of mine today: the hub's card with Join, "Meet"
 *     in its tab bar, and a card with Join on the app's Home;
 *   - with one only later in the week: none of the three;
 *   - Menu > Meetings is there either way, so nothing is lost.
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
const PORT = 9761, SERVE = 8977;
const PW = 'test-only-password';

const localDay = (n) => { const d = new Date(Date.now() + (n || 0) * 86400000), p = (x) => (x < 10 ? '0' : '') + x; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const TODAY = localDay(0), LATER = localDay(3);
const VID = 'SynthWatch1';   /* 11 characters, as a YouTube id is */

const BOOK = {
  ab_wm_pat: { name: 'Pat Watcher Synthetic', email: 'wm.pat@example.invalid', markers: ['Worship Team'] },
  ab_wm_sam: { name: 'Sam Sermons Synthetic', email: 'wm.sam@example.invalid', markers: [] },
  ab_wm_mo:  { name: 'Mo Master Synthetic', email: 'wm.mo@example.invalid', markers: [], masterAdmin: true },
};
const ACCOUNTS = {
  pat: { member: 'ab_wm_pat', email: 'wm.pat@example.invalid', teams: ['Worship Team'], master: false },
  sam: { member: 'ab_wm_sam', email: 'wm.sam@example.invalid', teams: [], master: false },
  mo:  { member: 'ab_wm_mo',  email: 'wm.mo@example.invalid',  teams: [], master: true },
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
    await put('addressBook/' + id, Object.assign({ adminFor: [], archived: false, isMinor: false, churchMember: true }, m));
  }
  for (const a of Object.values(ACCOUNTS)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: a.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: a.email, password: PW, returnSecureToken: true })).body || '{}');
    a.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update',
      { localId: a.uid, emailVerified: true }, OWNER);
    await put('users/' + a.uid, { uid: a.uid, email: a.email, name: BOOK[a.member].name, memberId: a.member, status: 'active',
      linkedBy: 'admin', teams: a.teams, adminFor: [], masterAdmin: a.master, attender: false, churchMember: true });
  }
  await put('sermonShow/access', { memberIds: ['ab_wm_sam'] });
  const now = Date.now();
  const liveOn = () => put('watchShow/live', { url: 'https://www.youtube.com/watch?v=' + VID, videoId: VID, title: 'Synthetic Sunday Live',
    showFrom: now - 3600000, showUntil: now + 3600000, after: 'none', againUntil: 0 });
  const liveOff = () => put('watchShow/live', { url: 'https://www.youtube.com/watch?v=' + VID, videoId: VID, title: 'Synthetic Sunday Live',
    showFrom: now - 7200000, showUntil: now - 3600000, after: 'none', againUntil: 0 });
  const meet = (id, date) => put('events/' + id, { date, type: 'Worship Team Meeting', teams: ['Worship Team'], roles: [],
    archived: false, draft: false, startTime: '19:30', endTime: '21:00', termLabel: 'Synthetic', assignments: {}, description: 'Synthetic planning' });
  await liveOn();
  await meet('ev_wm_today', TODAY);
  await meet('ev_wm_later', LATER);

  /* ---- the browser ---------------------------------------------------- */
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
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-watchmeet-' + process.pid), '--window-size=375,812', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  const evl = makeEval(send, 'watchmeet');
  const phone = () => send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const desk = () => send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  const signIn = async (a) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(a.email) + ',' + JSON.stringify(PW) + ')', true);
    await sleep(800);
  };
  /* Home, by name: since the start screen (20 Oct 2026) somebody on one team
     opens in their team, and Home is Just me. A full load each time. */
  const openApp = async (a) => {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html#me:home' });
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      const d = String(await evl('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}}).getAttribute("data-drawn")||""'));
      if (d.indexOf(a.uid + ':') === 0) break;
    }
    await sleep(3500);   /* the watch and meeting answers arrive after the first draw */
  };
  const openHub = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' });
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      if ((await evl('!!(document.getElementById("servingCard")||{}).innerHTML')) === true) break;
    }
    await sleep(3500);
  };
  const appText = () => evl('(document.getElementById("egbc-app")||document.body).innerText').then(String);
  const has = (sel) => evl('!!document.querySelector(' + JSON.stringify(sel) + ')');
  const menuHas = (title) => evl('(function(){var f=false;(function w(n){n.forEach(function(x){if(x.title===' + JSON.stringify(title)
    + ')f=true;if(x.children)w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));return f})()');

  /* ---- 1. the app, as Pat, on a service day with a meeting tonight ---- */
  await phone();
  await signIn(ACCOUNTS.pat);
  console.log('\nthe app’s Home, as Pat, live now and a meeting tonight');
  watch.reset();
  await openApp(ACCOUNTS.pat);
  let t = await appText();
  ok('  "Watch live" with the service’s title', /Watch live/.test(t) && /Synthetic Sunday Live/.test(t), t.slice(0, 600));
  ok('  and it opens Me > Listen & Watch', (await evl('(function(){var r=[].slice.call(document.querySelectorAll("#egbc-app .row")).filter(function(b){return /Synthetic Sunday Live/.test(b.textContent)})[0];'
    + 'return r?r.getAttribute("data-act"):""})()')) === 'tab:listen');
  ok('  the Me tab is called "Listen & Watch"', String(await evl('JSON.stringify(EGBCApp.tabsFor("me").filter(function(t){return t[0]==="listen"})[0]||[])')).indexOf('Listen & Watch') !== -1,
    String(await evl('JSON.stringify(EGBCApp.tabsFor("me"))')));
  ok('  "Video meeting today" with Join', /Video meeting today/.test(t) && /Worship Team Meeting/.test(t) && /Join/.test(t), t.slice(0, 900));
  ok('  Join goes to the meeting page for that room and that meeting',
    (await has('[data-act="open:meeting.html?room=Worship-AV&event=ev_wm_today"]')) === true);
  ok('  and not the meeting later in the week', (await has('[data-act*="ev_wm_later"]')) === false);
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* ---- 2. the hub, as Pat ----------------------------------------------- */
  console.log('\nthe hub’s front page, as Pat, at computer width');
  await desk();
  watch.reset();
  await openHub();
  const frame = String(await evl('(function(){var f=document.querySelector("#watchCard iframe");return f?f.getAttribute("src"):""})()'));
  ok('  the Watch card with the player in it', frame.indexOf('https://www.youtube-nocookie.com/embed/' + VID) === 0, frame);
  ok('  headed "Watch live"', /Watch live/.test(String(await evl('(document.getElementById("watchCard")||{}).innerText||""'))));
  ok('  the Video meetings card, with tonight’s Join',
    (await has('#meetingsCard a[href="meeting.html?room=Worship-AV&event=ev_wm_today"]')) === true);
  ok('  but not the one later in the week', (await has('#meetingsCard a[href*="ev_wm_later"]')) === false);
  ok('  the Menu has no "Manage Watch" for Pat (not a sermons helper)', (await menuHas('Manage Watch')) === false);
  ok('  "Meet" in the sidebar', (await has('#sidebar a[href="meeting.html"]')) === true);
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  await phone();
  await openHub();
  ok('  and in the tab bar on a phone', (await has('#egbc-tabbar a[href="meeting.html"]')) === true);

  /* ---- 3. after the service, and no meeting today ---------------------- */
  await liveOff();
  await del('events/ev_wm_today');
  console.log('\nafter the live window, with the only meeting later in the week');
  watch.reset();
  await openHub();
  ok('  the hub has no Watch card', String(await evl('(document.getElementById("watchCard")||{}).innerHTML||""')).trim() === '');
  ok('  no Video meetings card', String(await evl('(document.getElementById("meetingsCard")||{}).innerHTML||""')).trim() === '');
  ok('  and no "Meet" in the tab bar', (await has('#egbc-tabbar a[href="meeting.html"]')) === false);
  ok('  Menu > Meetings is still there, so nothing is lost', (await menuHas('Meetings')) === true);
  await openApp(ACCOUNTS.pat);
  t = await appText();
  ok('  the app’s Home has no Watch card', !/Watch live|Watch again/.test(t), t.slice(0, 600));
  ok('  and no meeting card', !/Video meeting/.test(t), t.slice(0, 600));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* ---- 4. the Menu's "Watch" -------------------------------------------- */
  console.log('\nthe Menu’s "Watch"');
  await signIn(ACCOUNTS.sam);
  await openHub();
  ok('  there for Sam, named in sermonShow/access', (await menuHas('Manage Watch')) === true);
  await signIn(ACCOUNTS.mo);
  await openHub();
  ok('  there for Mo, a master admin', (await menuHas('Manage Watch')) === true);

  for (const p of ['events/ev_wm_later', 'watchShow/live', 'sermonShow/access']) await del(p);
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
