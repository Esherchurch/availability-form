/* The pin board on a phone, in the app and on the website (Martin found
 * it broken in the app, 21 Oct 2026).
 *
 *   node tests/check-pinboard-phone.mjs      (from v2/, the dev emulators up)
 *
 * 1. THE BOARD IN THE ADDRESS IS THE BOARD SHOWN. The app linked Core
 *    Team's as ?board=core-team (its document's name); the page knew it
 *    only as "core", matched nothing and fell back to the first board -
 *    Worship. Both names now open it, the switcher starts on it, and every
 *    board the app links to is one the page knows.
 * 2. NO BAND UNDER THE APP BAR. In app mode --egbc-bar is the app's own
 *    chrome; the page added it to --am-top, a ~140px empty band.
 * 3. ONE WAY TO ADD on a phone: "Add an idea", not "Add Note" as well.
 * 4. The page loads Firebase once: a second copy after egbc-auth.js broke
 *    saving the sign-in ("Unsupported field value: a custom Lc object").
 * At 375, in app mode and on the website. Synthetic people only.
 * Pictures: tests/shots/pinboard-phone--{app,site}-375.png
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';
import { watchConsole } from './console-watch.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9787, SERVE = 8995, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  core:  { email: 'pbp.core@example.invalid',  member: 'ab_pbp_core',  name: 'Pin Core Synthetic',  teams: ['Core Team'] },
  both:  { email: 'pbp.both@example.invalid',  member: 'ab_pbp_both',  name: 'Pin Both Synthetic',  teams: ['Core Team', 'Worship Team'] },
  youth: { email: 'pbp.youth@example.invalid', member: 'ab_pbp_youth', name: 'Pin Youth Synthetic', teams: ['Youth Worship'] }
};
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';

/* Every ?board= the app sends must be a board id or document the page knows. */
const page = fs.readFileSync(path.join(V2, 'stickynotes.html'), 'utf8');
const app = fs.readFileSync(path.join(V2, 'app.html'), 'utf8');
const known = new Set();
for (const m of page.matchAll(/\{ id:'([a-z-]+)',\s*doc:'([a-z-]+)'/g)) { known.add(m[1]); known.add(m[2]); }
const appBoards = /var BOARDS = \{([\s\S]*?)\};/.exec(app);
const sent = appBoards ? [...appBoards[1].matchAll(/\[\s*'[a-z-]+'\s*,\s*'([a-z-]+)'\s*\]/g)].map(m => m[1]) : [];
const famSent = [...app.matchAll(/'[A-Za-z ]+':\s*\['([a-z-]+)',\s*'[A-Za-z]+'\]/g)].map(m => m[1]);
/* The page must ALSO match by id, not only by the document: the app's
   Core Team link is "core" now, but a link already in somebody's history
   says core-team. */
console.log('The boards the app links to');
ok('  the app sends one ?board= per space, each the id of a board the page knows', sent.length >= 6
  && sent.concat(famSent).every(b => [...page.matchAll(/\{ id:'([a-z-]+)'/g)].some(m => m[1] === b)),
  JSON.stringify({ sent, famSent, known: [...known] }));
ok('  the page loads Firebase once, before egbc-auth.js', (page.match(/firebase-app-compat\.js/g) || []).length === 1,
  String((page.match(/firebase-app-compat\.js/g) || []).length));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: [], masterAdmin: false, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin',
      teams: p.teams, adminFor: [], masterAdmin: false, churchMember: true });
  }

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript' : e === '.css' ? 'text/css' : e === '.png' ? 'image/png' : 'application/octet-stream') + (e === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-pbp-' + process.pid),
    '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; } watch.handle(m); };
  await send('Runtime.enable'); await send('Page.enable');
  const evl = makeEval(send, 'pbp');
  const as = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('(function(){try{sessionStorage.clear()}catch(e){}return firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})})()', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
  };
  const open = async (q) => { watch.reset(); await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/stickynotes.html' + q }); await sleep(9000); };
  /* Where the page's header starts, against the bottom of whichever bar is above it. */
  const LOOK = `JSON.stringify((function(){
    var h = document.querySelector('header'), am = document.getElementById('egbc-am-top'), site = document.getElementById('egbc-bar');
    function vis(e){ if (!e) return false; var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }
    var above = vis(am) ? am : (vis(site) ? site : null);
    var adds = [].filter.call(document.querySelectorAll('header .header-actions button[onclick="openNoteModal()"], #pbAdd'), vis)
      .map(function(b){ return b.textContent.trim(); });
    var pb = document.getElementById('phoneBoard'), pick = document.getElementById('boardPicker');
    return { title: (document.getElementById('boardTitle') || {}).textContent,
      app: document.documentElement.hasAttribute('data-egbc-app-mode'),
      barBottom: above ? Math.round(above.getBoundingClientRect().bottom) : null,
      headTop: Math.round(h.getBoundingClientRect().top),
      addTop: vis(pb) ? Math.round(document.getElementById('pbAdd').getBoundingClientRect().top) : null,
      stackBottom: Math.round(document.querySelector('.filter-bar').getBoundingClientRect().bottom),
      adds: adds, picked: pick && pick.options.length ? pick.value : '',
      blocked: document.body.getAttribute('data-egbc-blocked') || '', wide: document.documentElement.scrollWidth };
  })())`;
  const look = async () => JSON.parse(String(await evl(LOOK)));
  const gap = (L) => JSON.stringify({ bar: L.barBottom, head: L.headTop, add: L.addTop, bars: L.stackBottom });

  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });

    console.log('\nIn the app (375), as somebody on Core Team');
    await as('core');
    await open('?board=core-team&app=1');
    let L = await look();
    ok('  ?board=core-team opens the Core Team board, not Worship\u2019s', L.title === 'Core Team Board', JSON.stringify(L));
    ok('  the header starts right under the app bar - no band', L.app && L.barBottom !== null && Math.abs(L.headTop - L.barBottom) <= 2, gap(L));
    ok('  and "Add an idea" right under the page\u2019s own bars', L.addTop !== null && L.addTop - L.stackBottom >= 0 && L.addTop - L.stackBottom <= 24, gap(L));
    ok('  one way to add a note, not two', L.adds.length === 1 && /Add an idea/.test(L.adds[0]), JSON.stringify(L.adds));
    ok('  nothing sideways', L.wide <= 375, String(L.wide));
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, 'pinboard-phone--app-375.png'), Buffer.from(shot.data, 'base64'));
    await open('?board=core&app=1');
    ok('  ?board=core opens it too', (await look()).title === 'Core Team Board');

    console.log('\nOn two boards: the switcher starts on the one asked for');
    await as('both');
    await open('?board=core-team&app=1');
    L = await look();
    ok('  Core Team\u2019s board, and the switcher on it', L.title === 'Core Team Board' && L.picked === 'core', JSON.stringify({ t: L.title, p: L.picked }));
    await open('?board=worship&app=1');
    L = await look();
    ok('  and ?board=worship gives Worship\u2019s, the switcher on that', L.title === 'Worship Board' && L.picked === 'worship', JSON.stringify({ t: L.title, p: L.picked }));

    console.log('\nYouth');
    await as('youth');
    await open('?board=youth&app=1');
    L = await look();
    ok('  ?board=youth opens the Youth board', L.title === 'Youth Board', JSON.stringify(L));
    ok('  with no band under the app bar either', L.barBottom !== null && Math.abs(L.headTop - L.barBottom) <= 2, gap(L));

    console.log('\nOn the website (375)');
    await as('core');
    await open('?board=core-team');
    L = await look();
    ok('  the Core Team board', L.title === 'Core Team Board' && !L.app, JSON.stringify(L));
    /* The shell's --egbc-bar keeps its usual 8px under its bar, as on every page. */
    ok('  the header starts right under the website\u2019s bar', L.barBottom !== null && L.headTop - L.barBottom >= 0 && L.headTop - L.barBottom <= 10, gap(L));
    ok('  and "Add an idea" right under the page\u2019s own bars', L.addTop !== null && L.addTop - L.stackBottom >= 0 && L.addTop - L.stackBottom <= 24, gap(L));
    ok('  one way to add a note', L.adds.length === 1 && /Add an idea/.test(L.adds[0]), JSON.stringify(L.adds));
    ok('  nothing sideways', L.wide <= 375, String(L.wide));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, 'pinboard-phone--site-375.png'), Buffer.from(shot.data, 'base64'));

    console.log('\nOn a computer (1440) the header keeps "Add Note"');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await open('?board=core-team');
    L = await look();
    ok('  "Add Note" in the header, the only one', L.adds.length === 1 && /Add Note/.test(L.adds[0]), JSON.stringify(L.adds));
  } finally {
    ws.close(); chrome.kill(); server.close();
  }
  const pass = R.filter(Boolean).length;
  console.log('\n' + pass + '/' + R.length + ' passed');
  process.exit(pass === R.length ? 0 : 1);
})();
