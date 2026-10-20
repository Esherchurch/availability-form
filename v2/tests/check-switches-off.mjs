/* Every part has a switch, and switching one off hides it everywhere
 * (the reviewing window, 20 Oct 2026).
 *
 *   node tests/check-switches-off.mjs      (from v2/, the dev emulators up)
 *
 * With the thirteen new switches stored OFF, for a master admin on every
 * team that matters:
 *   - the Menu has none of their pages;
 *   - the app: no Kids Today or Children tab, no Bookings or Jobs tab, no
 *     bell; no notices, availability, rooms or repairs on any Home; no
 *     pin board rows; What's on without Book a room and Small groups;
 *   - Home (hub.html): no Notices card, no "Post a notice", no link to a
 *     switched-off page;
 *   - a page that names its part (stickynotes.html) says it is switched off.
 * Switched back on, it all comes back - the notice included: nothing was
 * deleted. The switches are put back as they were.
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
const PORT = 9845, SERVE = 9051, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const ME = { email: 'swo.master@example.invalid', member: 'ab_swo_master', name: 'Switch Off Synthetic',
  teams: ['Worship Team', 'Kids Church', 'Maintenance', 'Church office', 'Core Team'], adminFor: ['Worship Team'], masterAdmin: true };
const OFF = ['maintenance', 'events', 'roomBookings', 'kids', 'smallGroups', 'forms', 'payments', 'safeguarding',
  'pinBoards', 'meetings', 'notices', 'churchShow', 'availability'];
const GONE = ['maintenance.html', 'events-admin.html', 'checkin.html', 'attendance.html', 'headcounts.html', 'bookings-admin.html',
  'rooms.html', 'hire.html', 'kids-admin.html', 'kids-checkin.html', 'groups-admin.html', 'forms-admin.html', 'give.html',
  'payments.html', 'safeguarding.html', 'stickynotes.html', 'meeting.html', 'churchshow.html', 'index.html', 'hub.html?notices=1'];
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 500) : ''))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : v instanceof Date ? { timestampValue: v.toISOString() }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  ME.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: ME.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ME.teams, adminFor: ME.adminFor, masterAdmin: true, archived: false, isMinor: false, churchMember: true });
  await put('users/' + ME.uid, { uid: ME.uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin',
    teams: ME.teams, adminFor: ME.adminFor, masterAdmin: true, churchMember: true });
  await put('teams/' + encodeURIComponent('Church office'), { name: 'Church office', label: 'Church office', colour: '#111827', rota: false, runs: ['today', 'people', 'bookings', 'send'], archived: false });
  await put('news/swo_notice', { title: 'Synthetic switched-off notice', body: '<p>Still here.</p>', teams: [], ackedBy: [], createdAt: new Date(), pinned: false });

  /* The switches as they were, to put back. */
  const FEAT = DOCS + '/churchSettings/features';
  const before = (JSON.parse((await req(8181, 'GET', FEAT, undefined, OWNER)).body || '{}').fields) || {};
  const mask = OFF.map(n => 'updateMask.fieldPaths=' + n).join('&');
  const setAll = (on) => req(8181, 'PATCH', FEAT + '?' + mask, { fields: Object.fromEntries(OFF.map(n => [n, { booleanValue: on }])) }, OWNER);
  const restore = () => req(8181, 'PATCH', FEAT + '?' + mask, { fields: Object.fromEntries(OFF.filter(n => before[n]).map(n => [n, before[n]])) }, OWNER);

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-swo-' + process.pid),
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
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const evl = makeEval(send, 'swo');
  const J = async (x) => JSON.parse(String(await evl(x)));
  const open = async (page, wait) => {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page }); await sleep(wait || 7000);
  };
  const appAt = async (hash) => {
    await open('app.html' + hash, 300);
    for (let i = 0; i < 60; i++) { await sleep(300); if (String(await evl('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}}).getAttribute("data-drawn")||""')).indexOf(ME.uid + ':') === 0) break; }
    await sleep(3500);
  };
  const APP = 'JSON.stringify({tabs:[].map.call(document.querySelectorAll("button.tab[data-tab]"),function(b){return b.getAttribute("data-tab")}),'
    + 'acts:[].map.call(document.querySelectorAll("#egbc-content [data-act]"),function(b){return b.getAttribute("data-act")}),'
    + 'bell:!!document.querySelector(\'[data-act="sheet:notices"].icon-btn\'),secs:[].map.call(document.querySelectorAll("#egbc-content .sec-h h3"),function(h){return h.textContent}),'
    + 'text:(document.getElementById("egbc-content")||{}).innerText||"",drawn:document.getElementById("egbc-app").getAttribute("data-drawn")})';
  const MENU = 'JSON.stringify((function(){var u=[];(function w(n){(n||[]).forEach(function(x){if(x.url)u.push(x.url);w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));return u})())';

  try {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('sessionStorage.clear();try{localStorage.clear()}catch(e){};1');
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);

    console.log('Switched ON first (the baseline: each thing is there to hide)');
    await setAll(true);
    await appAt('#me:home');
    let A = await J(APP);
    ok('  Just me\'s Home: the notice, My availability and the bell', /Synthetic switched-off notice/.test(A.text) && A.acts.includes('open:index.html') && A.bell, JSON.stringify(A.secs));
    await appAt('#mode:kids');
    A = await J(APP);
    ok('  Kids Church: Today and Children tabs', A.tabs.includes('today') || A.acts.includes('go:kids:today'), JSON.stringify(A));
    let menu = await J(MENU);
    ok('  the Menu has their pages', GONE.filter(u => !menu.includes(u)).length <= 2, GONE.filter(u => !menu.includes(u)).join(', '));

    console.log('\nThe thirteen new switches OFF');
    await setAll(false);
    await appAt('#me:home');
    A = await J(APP);
    ok('  Just me\'s Home: no notices, no My availability, no bell', !/Synthetic switched-off notice/.test(A.text) && !A.acts.includes('open:index.html') && !A.bell, JSON.stringify(A.secs) + ' ' + A.bell);
    await appAt('#me:whatson');
    A = await J(APP);
    ok('  What\'s on: no Book a room, no Small groups', !A.acts.includes('open:rooms.html') && !A.acts.includes('open:groups.html'), JSON.stringify(A.acts));
    await appAt('#mode:kids');
    A = await J(APP);
    ok('  Kids and youth: no Today or Children tab, and Home offers neither', !A.tabs.includes('today') && !A.tabs.includes('children')
      && !A.acts.includes('go:kids:today') && !A.acts.includes('go:kids:children'), JSON.stringify(A.tabs) + ' ' + JSON.stringify(A.acts));
    await appAt('#mode:building');
    A = await J(APP);
    ok('  The building\'s Home: no Repairs, no Rooms today, no Maintenance jobs', !A.secs.includes('Repairs') && !A.secs.includes('Rooms today')
      && !A.acts.some(a => /maintenance\.html|rooms\.html|go:maint:jobs/.test(a)), JSON.stringify(A.secs));
    await appAt('#mode:office');
    A = await J(APP);
    ok('  Church office: no Bookings tab, no Post a notice', !A.tabs.includes('bookings') && !A.acts.includes('open:hub.html?notice=new'), JSON.stringify(A.tabs) + ' ' + JSON.stringify(A.acts));
    await appAt('#mode:sunday');
    A = await J(APP);
    ok('  Sunday worship\'s Home: no pin board rows', !A.acts.some(a => /sheet:board-/.test(a)), JSON.stringify(A.acts));
    await appAt('#worship:team');
    A = await J(APP);
    ok('  Worship & AV\'s Team tab: no pin board', !A.acts.some(a => /sheet:board-|stickynotes/.test(a)), JSON.stringify(A.acts));
    menu = await J(MENU);
    const still = GONE.filter(u => menu.includes(u));
    ok('  the Menu has none of their pages', !still.length, still.join(', '));

    await open('hub.html?app=0', 9000);
    const hub = await J('JSON.stringify({notices:(function(){var c=document.getElementById("noticesCard");return !!c&&c.offsetParent!==null})(),'
      + 'post:/Post a notice/.test((document.getElementById("quickRow")||{}).innerText||""),'
      + 'links:[].filter.call(document.querySelectorAll("main a[href]"),function(a){return a.offsetParent!==null}).map(function(a){return a.getAttribute("href")})})');
    const offLinks = hub.links.filter(h => GONE.includes(h) || GONE.includes(String(h).split('?')[0]));
    ok('  Home (the website): no Notices card, no "Post a notice", no link to a switched-off page', !hub.notices && !hub.post && !offLinks.length, JSON.stringify(hub).slice(0, 400));

    await open('stickynotes.html', 8000);
    const blocked = String(await evl('(document.body.getAttribute("data-egbc-blocked")||"")+" | "+(document.getElementById("egbc-blocked-card")||{innerText:""}).innerText'));
    ok('  a page that names its part (the pin boards) says it is switched off', /switched off/i.test(blocked) && /Pin boards/.test(blocked), blocked.slice(0, 200));

    console.log('\nSwitched back ON: nothing was deleted');
    await setAll(true);
    await appAt('#me:home');
    A = await J(APP);
    ok('  the notice is back on Home, with My availability and the bell', /Synthetic switched-off notice/.test(A.text) && A.acts.includes('open:index.html') && A.bell, JSON.stringify(A.secs));
    menu = await J(MENU);
    ok('  and the Menu has the pages again', GONE.filter(u => !menu.includes(u)).length <= 2, GONE.filter(u => !menu.includes(u)).join(', '));
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  } finally {
    await restore().catch(() => {});
    await req(8181, 'DELETE', DOCS + '/news/swo_notice', undefined, OWNER).catch(() => {});
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
