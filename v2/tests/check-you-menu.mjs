/* The initials open a "you" menu, on the hub and every other page.
 *
 *   node tests/check-you-menu.mjs      (from v2/, emulators up)
 *
 * Martin, 13 Oct 2026: tapping the initials "only offers Sign out - he
 * expected Notifications there, and it's the logical place." So the
 * initials open a small menu: Notifications, My details, Add to my
 * calendar, My availability, View the site as... (master admin only),
 * Sign out last. One renderer (egbc-menu.js) for the hub and the shell.
 *
 * What this holds it to:
 *   - the same items in the same order on the hub and on a website page,
 *     at phone width and computer width;
 *   - a real menu: a button that says it has one and whether it is open,
 *     menuitems, focus into it, arrows between items, Escape and a tap
 *     outside close it and focus goes back to the initials;
 *   - it fits a 375px phone and every item is a full-size target;
 *   - feature 'notifications' off takes Notifications out;
 *   - View the site as... only for a master admin, and it takes you to
 *     the strip;
 *   - Add to my calendar opens the hub's calendar sheet, from the hub and
 *     from anywhere else; My details shows what the church holds.
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
const PORT = 9737, SERVE = 8953;
const PW = 'test-only-password';

const PEOPLE = {
  member: { email: 'you.member@example.invalid', name: 'Yara Member Synthetic', member: 'ab_you_member',
            teams: ['Worship Team'], masterAdmin: false },
  master: { email: 'you.master@example.invalid', name: 'Max Master Synthetic', member: 'ab_you_master',
            teams: ['Worship Team'], masterAdmin: true },
};
const ORDER = 'notifications,details,groups,calendar,availability,give,signout';
const ORDER_MASTER = 'notifications,details,groups,calendar,availability,give,viewas,signout';

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')));
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
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: [],
      masterAdmin: p.masterAdmin, churchMember: true, archived: false, isMinor: false });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active',
      linkedBy: 'admin', teams: p.teams, adminFor: [], masterAdmin: p.masterAdmin, attender: true, churchMember: true });
  }

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t);
      body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css'
      : e === '.json' ? 'application/json' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-you-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  const ev = makeEval(send, 'you-menu');
  const width = (w) => send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 600 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 600 });
  const key = async (k, code) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: code || k, windowsVirtualKeyCode: { Escape: 27, ArrowDown: 40, ArrowUp: 38, Enter: 13 }[k] || 0 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code || k });
    await sleep(250);
  };

  const signInAs = async (k) => {
    const p = PEOPLE[k];
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await sleep(2500);
    await ev('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ')', true);
    await sleep(800);
  };
  const openPage = async (page, btnSel) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page });
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      const st = String(await ev('(function(){ if(!document.body) return "loading";'
        + ' if (document.body.getAttribute("data-egbc-blocked")) return "blocked";'
        + ' if (document.getElementById("egbc-guard-style")) return "checking";'
        + ' return document.querySelector(' + JSON.stringify(btnSel) + ') ? "open" : "nobutton"; })()'));
      if (st === 'open' || st === 'blocked') return st;
    }
    return 'timeout';
  };
  /* What the menu offers, read off the page itself. */
  const state = (btnSel) => ev('(function(){var b=document.querySelector(' + JSON.stringify(btnSel) + ');'
    + 'var m=document.getElementById("egbc-you");'
    + 'var items=m?[].slice.call(m.querySelectorAll("[role=menuitem]")):[];'
    + 'var r=m?m.getBoundingClientRect():null;'
    + 'return JSON.stringify({ open: !!m, expanded: b && b.getAttribute("aria-expanded"), popup: b && b.getAttribute("aria-haspopup"),'
    + ' role: m && m.getAttribute("role"), keys: items.map(function(i){return i.getAttribute("data-you")}).join(","),'
    + ' minH: items.length ? Math.min.apply(null, items.map(function(i){return i.getBoundingClientRect().height})) : 0,'
    + ' left: r ? Math.round(r.left) : 0, right: r ? Math.round(r.right) : 0, vw: window.innerWidth,'
    + ' sideways: document.documentElement.scrollWidth > window.innerWidth,'
    + ' focus: document.activeElement ? (document.activeElement.getAttribute("data-you") || document.activeElement.id || document.activeElement.tagName) : "" });})()');
  const click = (sel) => ev('(function(){var b=document.querySelector(' + JSON.stringify(sel) + ');if(b){b.click();return "clicked"}return "none"})()');
  const waitOpen = async (sel) => { for (let i = 0; i < 20; i++) { const s = JSON.parse(await state(sel)); if (s.open) return s; await sleep(250); } return JSON.parse(await state(sel)); };

  /* ---- a website page, on a phone ------------------------------------ */
  await signInAs('member');
  for (const [label, w] of [['a phone (375px)', 375], ['a computer (1280px)', 1280]]) {
    console.log('\na website page (the rota), on ' + label);
    await width(w);
    watch.reset();
    const BTN = '#egbc-you-btn';
    ok('  the page has its initials, as a button', (await openPage('view-only-rota.html', BTN)) === 'open');
    let s = JSON.parse(await state(BTN));
    ok('  which says it opens a menu, and is closed', s.popup === 'menu' && s.expanded === 'false', JSON.stringify(s));
    ok('  and is visible to tap', (await ev('(function(){var b=document.querySelector("#egbc-you-btn");var r=b.getBoundingClientRect();return r.width>=30&&r.height>=30&&getComputedStyle(b).display!=="none"})()')) === true);
    await click(BTN);
    s = await waitOpen(BTN);
    ok('  tapping it opens the menu, and the button says so', s.open && s.expanded === 'true' && s.role === 'menu', JSON.stringify(s));
    ok('  Notifications, My details, My groups, Add to my calendar, My availability, Give, Sign out - in that order', s.keys === ORDER, s.keys);
    ok('  focus goes into it, on the first item', s.focus === 'notifications', s.focus);
    ok('  it fits the screen', s.left >= 0 && s.right <= s.vw && !s.sideways, JSON.stringify(s));
    ok('  and every item is a full-size target (44px or more)', s.minH >= 44, s.minH);
    await key('ArrowDown', 'ArrowDown');
    ok('  the arrow keys move between items', JSON.parse(await state(BTN)).focus === 'details', JSON.parse(await state(BTN)).focus);
    await key('Escape', 'Escape');
    s = JSON.parse(await state(BTN));
    ok('  Escape closes it, and focus goes back to the initials', !s.open && s.expanded === 'false' && s.focus === 'egbc-you-btn', JSON.stringify(s));
    await click(BTN); await waitOpen(BTN);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: (w < 600 ? 700 : 850), button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: (w < 600 ? 700 : 850), button: 'left', clickCount: 1 });
    await sleep(300);
    ok('  a tap outside closes it', JSON.parse(await state(BTN)).open === false);
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  }

  console.log('\nwhat the items do');
  await width(375);
  await openPage('view-only-rota.html', '#egbc-you-btn');
  await click('#egbc-you-btn'); await waitOpen('#egbc-you-btn');
  ok('  Notifications goes to the Notifications page',
    String(await ev('(document.querySelector("#egbc-you [data-you=notifications]")||{}).getAttribute("href")')) === 'notifications.html');
  ok('  My groups goes to the groups page, as on the app’s Me',
    String(await ev('(document.querySelector("#egbc-you [data-you=groups]")||{}).getAttribute("href")')) === 'groups.html');
  ok('  and Give to the Give page',
    String(await ev('(document.querySelector("#egbc-you [data-you=give]")||{}).getAttribute("href")')) === 'give.html');
  ok('  My availability goes to the form',
    String(await ev('(document.querySelector("#egbc-you [data-you=availability]")||{}).getAttribute("href")')) === 'index.html');
  await click('#egbc-you [data-you=details]'); await sleep(300);
  const det = String(await ev('(document.getElementById("egbc-you")||{}).innerText||""'));
  ok('  My details shows what the church holds, and who to ask', det.indexOf(PEOPLE.member.email) !== -1 && /Worship/.test(det) && /ask the church office/i.test(det), det.slice(0, 200));
  await click('#egbc-you [data-you=back]'); await sleep(300);
  ok('  and Back returns to the menu', JSON.parse(await state('#egbc-you-btn')).keys === ORDER);
  await click('#egbc-you [data-you=calendar]');
  for (let i = 0; i < 30; i++) { await sleep(400); if (/hub\.html/.test(String(await ev('location.href')))) break; }
  await sleep(3500);
  ok('  Add to my calendar, from another page, opens the hub\u2019s calendar sheet',
    (await ev('!!(document.getElementById("calendarModal")&&document.getElementById("calendarModal").classList.contains("on"))')) === true,
    String(await ev('location.href')));

  /* ---- the hub, which has its own header ----------------------------- */
  console.log('\nthe hub, which draws its own header');
  watch.reset();
  ok('  the hub has its initials', (await openPage('hub.html', '#av')) === 'open');
  ok('  and no second, older menu beside them', (await ev('!document.getElementById("whoMenu")')) === true);
  await click('#av');
  let h = await waitOpen('#av');
  ok('  they open THE SAME menu, in the same order', h.open && h.keys === ORDER && h.expanded === 'true', JSON.stringify(h));
  await click('#egbc-you [data-you=calendar]'); await sleep(1500);
  ok('  Add to my calendar opens the sheet right there',
    (await ev('document.getElementById("calendarModal").classList.contains("on")')) === true);
  await ev('document.getElementById("calendarModal").classList.remove("on");1');
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* ---- the church does not use notifications ------------------------- */
  console.log('\na church that does not use notifications');
  await ev('window.EGBCChurch={uses:function(n){return n!=="notifications"}};1');
  await click('#av'); h = await waitOpen('#av');
  ok('  Notifications is not in the menu', h.keys === 'details,groups,calendar,availability,give,signout', h.keys);
  await key('Escape', 'Escape');

  /* ---- a master admin ------------------------------------------------- */
  console.log('\na master admin');
  await signInAs('master');
  await width(375);
  await openPage('view-only-rota.html', '#egbc-you-btn');
  await click('#egbc-you-btn'); const m = await waitOpen('#egbc-you-btn');
  ok('  gets View the site as..., just before Sign out', m.keys === ORDER_MASTER, m.keys);
  await click('#egbc-you [data-you=viewas]'); await sleep(500);
  ok('  which takes them to the strip at the bottom',
    String(await ev('(document.activeElement||{}).id||""')) === 'egbc-va-team', String(await ev('(document.activeElement||{}).id||""')));

  /* ---- sign out, last ------------------------------------------------ */
  console.log('\nsigning out');
  await click('#egbc-you-btn'); await waitOpen('#egbc-you-btn');
  await click('#egbc-you [data-you=signout]');
  for (let i = 0; i < 20; i++) { await sleep(400); if (/login\.html/.test(String(await ev('location.href')))) break; }
  ok('  Sign out signs them out', /login\.html/.test(String(await ev('location.href'))), String(await ev('location.href')));

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
