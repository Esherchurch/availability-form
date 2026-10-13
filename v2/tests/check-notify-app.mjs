/* Phone notifications, the app side (FINDINGS-notify N-5).
 *
 *   node tests/check-notify-app.mjs      (from v2/, emulators up)
 *
 * The events window built notifications.html, egbc-notify.js and the
 * service worker's part; the sending is N-4. This is the wiring between
 * them, which is the main window's:
 *
 *   1. sw.js loads egbc-notify-sw.js, so there is still ONE service worker
 *      on the v2 scope, and the app and the hub both register it - a phone
 *      that only ever opens the app could not receive otherwise.
 *   2. Me > Notifications, the gentle one-time "Turn on notifications?" on
 *      Home (a row, never a prompt; "Not now" puts it away for good), and
 *      Notifications in the Menu for everybody signed in.
 *   3. All of it is feature 'notifications' (HANDOVER-MAIN rule 12): with
 *      the feature off, none of it is drawn.
 *   4. A PARENT WHO IS NOT IN THE ADDRESS BOOK gets in, narrowly (Martin,
 *      N-6b): a verified address, Home and Me only, Notifications and the
 *      way out - and still nothing anywhere else. An unverified address
 *      gets nothing, and somebody the church does know is not narrowed.
 *
 * Synthetic people throughout, on the dev emulators.
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
const PORT = 9733, SERVE = 8949;
const PW = 'test-only-password';

const PEOPLE = {
  /* Somebody the church knows, on a team. */
  member:   { email: 'na.member@example.invalid', name: 'Nia Member Synthetic', member: 'ab_na_member',
              teams: ['Worship Team'], verified: true, book: true },
  /* In the address book, on no team: an Attender, not a parent-only view. */
  attender: { email: 'na.attender@example.invalid', name: 'Ada Attender Synthetic', member: 'ab_na_attender',
              teams: [], verified: true, book: true },
  /* NOT in the address book, address VERIFIED: the parent's view. */
  parent:   { email: 'na.parent@example.invalid', verified: true, book: false },
  /* NOT in the address book, address NOT verified: nothing. */
  stranger: { email: 'na.stranger@example.invalid', verified: false, book: false },
};

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')));
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
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, { Authorization: 'Bearer owner' });
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, { Authorization: 'Bearer owner' });

/* Service workers are stubbed in every check, so this one RECORDS what
   was registered rather than doing it. */
const SW_RECORDER = '<script>(function(){try{window.__sw=[];if(navigator.serviceWorker){navigator.serviceWorker.register='
  + 'function(u){window.__sw.push(String(u));return Promise.resolve(undefined);};}}catch(e){}})();</script>';
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
  /* ---- 1. the service worker, read off the file ------------------- */
  console.log('\nthe one service worker carries the notification part');
  const sw = fs.readFileSync('sw.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const firstLine = sw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0] || '';
  ok('  sw.js loads egbc-notify-sw.js, first thing', firstLine === "importScripts('egbc-notify-sw.js');", firstLine);
  ok('  and its VERSION moved on, so phones take the new one', !/const VERSION = '2';/.test(sw));

  /* ---- people --------------------------------------------------------- */
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update',
      { localId: p.uid, emailVerified: !!p.verified }, { Authorization: 'Bearer owner' });
    if (p.book) {
      await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: [],
        churchMember: true, archived: false, isMinor: false });
      await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member,
        status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: [], masterAdmin: false,
        attender: true, churchMember: true });
    } else {
      /* Fresh each run, so the page meets them as a first sign-in would. */
      await del('users/' + p.uid);
    }
  }

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
      body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + SW_RECORDER + t.slice(h.index + h[0].length) : SW_RECORDER + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript'
      : e === '.css' ? 'text/css' : e === '.json' ? 'application/json' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-notify-app-' + process.pid),
    '--window-size=375,812', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  const ev = makeEval(send, 'notify-app');

  const signInAs = async (key) => {
    const p = PEOPLE[key];
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await sleep(2500);
    await ev('firebase.auth(EGBCAuth.app).signOut()', true);
    await sleep(300);
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ')', true);
    await sleep(800);
    const uid = String(await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""'));
    if (uid !== p.uid) { console.error('Could not sign in as ' + p.email); server.close(); chrome.kill(); process.exit(2); }
    await ev('try{localStorage.removeItem("egbc.notify.offer")}catch(e){};1');
  };
  /* "Open" means the guard took its style away, or it refused. */
  const openPage = async (page) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page });
    let st = '';
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      st = String(await ev('(function(){ if(!document.body) return "loading";'
        + ' var b = document.body.getAttribute("data-egbc-blocked"); if (b) return "blocked:" + b;'
        + ' if (document.getElementById("egbc-guard-style")) return "checking"; return "open"; })()'));
      if (st.indexOf('blocked:') === 0 || st === 'open') break;
    }
    return st;
  };
  const openApp = async (uid) => {
    const st = await openPage('app.html');
    if (st !== 'open') return st;
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      const d = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}}).getAttribute("data-drawn")||""'));
      if (d.indexOf(uid + ':') === 0) break;
    }
    await sleep(1500);
    return 'open';
  };
  const go = async (space, tab) => { await ev('EGBCApp.go(' + JSON.stringify(space) + ',' + JSON.stringify(tab) + ');1'); await sleep(900); };
  const has = (sel) => ev('!!document.querySelector(' + JSON.stringify(sel) + ')');
  const ME_ROW = '[data-act="open:notifications.html"]';
  const OFFER = '[data-act="notifynotnow"]';

  /* ---- 2. somebody the church knows, in the app -------------------- */
  console.log('\nin the app, as somebody on a team');
  await signInAs('member');
  watch.reset();
  ok('  the app opens', (await openApp(PEOPLE.member.uid)) === 'open');
  ok('  and registers the one service worker', String(await ev('JSON.stringify(window.__sw||[])')).indexOf('sw.js') !== -1,
    String(await ev('JSON.stringify(window.__sw||[])')));
  ok('  the notifications code is loaded (Kids Today\u2019s "Call on their phone" needs it)',
    (await ev('typeof EGBCNotify === "object" && typeof EGBCNotifyCore === "object"')) === true);
  await go('me', 'home');
  ok('  Home offers "Turn on notifications?"', (await has(OFFER)) === true);
  await go('me', 'me');
  ok('  Me has Notifications', (await has(ME_ROW)) === true);
  await go('me', 'home');
  await ev('document.querySelector(' + JSON.stringify(OFFER) + ').click();1'); await sleep(900);
  ok('  "Not now" puts the offer away', (await has(OFFER)) === false);
  await openApp(PEOPLE.member.uid); await go('me', 'home');
  ok('  for good, not just until the next visit', (await has(OFFER)) === false);
  await go('me', 'me');
  ok('  and Notifications is still on Me', (await has(ME_ROW)) === true);
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* THE FEATURE OFF (HANDOVER-MAIN rule 12). */
  console.log('\nwith the church not using notifications');
  await ev('try{localStorage.removeItem("egbc.notify.offer")}catch(e){};'
    + 'EGBCChurch.uses=function(n){return n!=="notifications"};1');
  await go('me', 'home');
  ok('  no offer on Home', (await has(OFFER)) === false);
  await go('me', 'me');
  ok('  and no Notifications on Me', (await has(ME_ROW)) === false);

  /* ---- 3. the hub and the Menu -------------------------------------- */
  console.log('\nthe hub, and the Menu');
  watch.reset();
  ok('  the hub opens', (await openPage('hub.html')) === 'open');
  ok('  and registers the one service worker too',
    String(await ev('JSON.stringify(window.__sw||[])')).indexOf('sw.js') !== -1, String(await ev('JSON.stringify(window.__sw||[])')));
  const names = (expr) => ev('(function(){' + expr + 'var out=[];(function walk(n){n.forEach(function(x){out.push(x.title);if(x.children)walk(x.children)})})('
    + 'EGBCMenu.forPerson(EGBCMenu.who()));return out.join("|")})()');
  ok('  Notifications is in the Menu for somebody signed in', String(await names('')).split('|').indexOf('Notifications') !== -1);
  ok('  and not when the church does not use them',
    String(await names('window.EGBCChurch={uses:function(n){return n!=="notifications"}};')).split('|').indexOf('Notifications') === -1);
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* ---- 4. a parent who is not in the address book -------------------- */
  console.log('\na parent whose address the church does not hold (verified)');
  await signInAs('parent');
  watch.reset();
  ok('  the app lets them in', (await openApp(PEOPLE.parent.uid)) === 'open', 'blocked');
  /* AND AGAIN (A-078). Every visit after the first rewrote their record
     with a new createdAt, which the rules refuse, and the page said
     'Something went wrong'. The first visit always worked, which is how
     it hid. */
  const again = await openApp(PEOPLE.parent.uid);
  ok('  and lets them in again on their next visit', again === 'open', again);
  ok('  with one space, not a row of them', String(await ev('JSON.stringify(EGBCApp.spacesFor(EGBCApp.who()))')) === '["me"]',
    String(await ev('JSON.stringify(EGBCApp.spacesFor(EGBCApp.who()))')));
  ok('  and two tabs: Home and Me',
    String(await ev('EGBCApp.tabsFor("me").map(function(t){return t[0]}).join(",")')) === 'home,me',
    String(await ev('EGBCApp.tabsFor("me").map(function(t){return t[0]}).join(",")')));
  await go('me', 'me');
  ok('  Me offers Notifications', (await has(ME_ROW)) === true);
  const meActs = String(await ev('[].slice.call(document.querySelectorAll("#egbc-app [data-act]")).map(function(e){return e.getAttribute("data-act")}).join(" ")'));
  ok('  and NOTHING ELSE of the church\u2019s: no availability, groups, calendar or Give',
    !/index\.html|groups\.html|sheet:calendar|sheet:give|hub\.html/.test(meActs), meActs);
  await go('me', 'home');
  const homeActs = String(await ev('[].slice.call(document.querySelectorAll("#egbc-app [data-act]")).map(function(e){return e.getAttribute("data-act")}).join(" ")'));
  ok('  Home has no availability row and no rota', !/index\.html|view-only-rota/.test(homeActs), homeActs);
  ok('  nothing on the console - no refusals from things they may not read', watch.errors.length === 0, watch.summary());
  /* AT THE SAME DOOR as before, by name. Under a break that lets them
     through every page, the rota still ends up blocked - by its own
     reads being refused, as 'Something went wrong' - so 'blocked at
     all' would pass for the wrong reason. It did, once. */
  const elsewhere = await openPage('view-only-rota.html');
  ok('  but anywhere else in the hub still turns them away, at the usual door',
    elsewhere === 'blocked:We do not recognise that address', elsewhere);

  console.log('\nan address the church does not hold, NOT verified');
  await signInAs('stranger');
  ok('  the app turns them away', /^blocked:/.test(await openApp(PEOPLE.stranger.uid)));

  console.log('\nsomebody in the address book on no team (an Attender)');
  await signInAs('attender');
  ok('  the app opens', (await openApp(PEOPLE.attender.uid)) === 'open');
  ok('  as themselves, not narrowed to the parent\u2019s view',
    String(await ev('EGBCApp.tabsFor("me").length')) === '4', String(await ev('EGBCApp.tabsFor("me").map(function(t){return t[0]}).join(",")')));

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
