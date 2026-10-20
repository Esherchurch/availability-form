/* "What are you doing?" - the app's start screen (Martin, 19 Oct 2026,
 * design-mocks/app-start; the reviewing window, 20 Oct: go on with it).
 *
 *   node tests/check-app-start.mjs      (from v2/, the dev emulators up)
 *
 * Somebody on several teams (a master admin here), at 375px:
 *   - opening the app shows the tiles, in order, each saying what is in it
 *     for them; no tab bar; Care and the bell still there;
 *   - a tile makes the app just that: its colour and name across the top,
 *     Switch, only that mode's spaces; "Open the app here every time?";
 *   - "Not now" stops asking; the tiles mark "Last time"; Switch goes back;
 *   - The building: the Menu's building pages, beside Maintenance; with
 *     the buildingCompliance switch off, only Maintenance;
 *   - "Always open here" opens there next time, and the tiles say so and
 *     offer "Show this screen instead";
 *   - coming back from a page (#space:tab) lands in that space's mode;
 *   - NOTHING LOST: every space the person had is in one of their modes.
 * Somebody on one team skips the tiles, into their team; Switch shows two.
 * Somebody on no team: Just me, the app's own header, no Switch.
 * 1440px: the tiles two across, nothing sideways.
 * Pictures: tests/shots/app-start--{tiles,sunday,building,member}-375.png,
 *           app-start--tiles-1440.png
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9843, SERVE = 9049, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  many: { email: 'aps.many@example.invalid', member: 'ab_aps_many', name: 'App Start Many Synthetic',
    teams: ['Worship Team', 'Core Team', 'Kids Church', 'Maintenance', 'Church office'], adminFor: ['Worship Team'], masterAdmin: true },
  one: { email: 'aps.one@example.invalid', member: 'ab_aps_one', name: 'App Start One Synthetic', teams: ['Worship Team'], adminFor: [], masterAdmin: false },
  none: { email: 'aps.none@example.invalid', member: 'ab_aps_none', name: 'App Start None Synthetic', teams: [], adminFor: [], masterAdmin: false }
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
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
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
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin',
      teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, churchMember: true });
  }
  /* The building switch as it was, to put back. */
  const FEAT = DOCS + '/churchSettings/features';
  const featBefore = JSON.parse((await req(8181, 'GET', FEAT, undefined, OWNER)).body || '{}');
  const bcBefore = featBefore.fields && featBefore.fields.buildingCompliance;
  const setBuilding = (v) => v === undefined
    ? req(8181, 'PATCH', FEAT + '?updateMask.fieldPaths=buildingCompliance', { fields: {} }, OWNER)
    : req(8181, 'PATCH', FEAT + '?updateMask.fieldPaths=buildingCompliance', { fields: { buildingCompliance: v } }, OWNER);

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-aps-' + process.pid),
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
  const size = (w) => send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 900 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 900 });
  await size(375);
  const evl = makeEval(send, 'aps');
  const J = async (x) => JSON.parse(String(await evl(x)));
  const signIn = async (p) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await evl('sessionStorage.clear();try{localStorage.clear()}catch(e){};1');
    for (let i = 0; i < 3; i++) {
      await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').catch(function(){})', true); await sleep(800);
      if (String(await evl('(firebase.auth(EGBCAuth.app).currentUser||{}).email||""')) === p.email) return;
    }
  };
  /* Open the app and wait for its first draw for this person. */
  const openApp = async (p, hash) => {
    /* A full load every time, as coming back from a page is: app.html to
       app.html#x is only a hash change. */
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' + (hash || '') });
    for (let i = 0; i < 60; i++) {
      await sleep(300);
      const d = String(await evl('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}}).getAttribute("data-drawn")||""'));
      if (d.indexOf(p.uid + ':') === 0) break;
    }
    await sleep(1200);
  };
  const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(s.data, 'base64')); };
  const LOOK = 'JSON.stringify((function(){var a=document.getElementById("egbc-app"),t=document.querySelector(".top");'
    + 'return{drawn:a.getAttribute("data-drawn"),mode:t&&t.getAttribute("data-mode"),coloured:!!(t&&t.classList.contains("mode-top")),'
    + 'title:(document.querySelector(".top-title")||{}).textContent,'
    + 'tiles:[].map.call(document.querySelectorAll(".tile[data-mode]"),function(b){return b.getAttribute("data-mode")}),'
    + 'words:[].map.call(document.querySelectorAll(".tile small"),function(s){return s.textContent}),'
    + 'last:[].map.call(document.querySelectorAll(".tile .last"),function(s){return s.parentNode.getAttribute("data-mode")}),'
    + 'pills:[].map.call(document.querySelectorAll(".spaces [data-space]"),function(b){return b.getAttribute("data-space")}),'
    + 'tabs:[].map.call(document.querySelectorAll("button.tab[data-tab]"),function(b){return b.getAttribute("data-tab")}),'
    + 'sw:!!document.querySelector(\'[data-act="mode:switch"]\'),offer:!!document.querySelector(".offer"),'
    + 'always:(document.querySelector(".always")||{}).textContent||"",'
    + 'care:!!document.querySelector(\'[data-act="sheet:care"]\'),bell:!!document.querySelector(\'[data-act="sheet:notices"]\'),'
    + 'rows:[].map.call(document.querySelectorAll("#egbc-content [data-act^=\\"open:\\"]"),function(b){return b.getAttribute("data-act")}),'
    + 'sideways:document.documentElement.scrollWidth>innerWidth+1,'
    + 'state:EGBCApp.state(),spaces:EGBCApp.spacesFor(EGBCApp.who()),modes:EGBCApp.modesFor(),'
    + 'allSpaces:Object.keys(EGBCApp.SPACES),inModes:[].concat.apply([],EGBCApp.MODES.map(function(m){return m.spaces}))}})())';
  const tap = (sel) => evl('(function(){var b=document.querySelector(' + JSON.stringify(sel) + ');if(b)b.click();return !!b})()');

  try {
    const M = PEOPLE.many;
    console.log('Somebody on several teams (a master admin), at 375px');
    await signIn(M);
    watch.reset();
    await openApp(M);
    let L = await J(LOOK);
    ok('  opening the app shows the tiles', /:start:tiles:/.test(L.drawn), L.drawn);
    ok('  Sunday worship, Kids and youth, The building, Church office, Just me - in that order',
      JSON.stringify(L.tiles) === JSON.stringify(['sunday', 'kids', 'building', 'office', 'me']), JSON.stringify(L.tiles));
    ok('  each says what is in it for them', L.words[0] === 'Worship & AV \u00b7 Core Team' && L.words[1] === 'Kids Church'
      && L.words[2] === 'Checks \u00b7 repairs \u00b7 rooms' && /What\u2019s on|What's on/.test(L.words[4]), JSON.stringify(L.words));
    ok('  no tab bar on the tiles; Care and the bell are there', L.tabs.length === 0 && L.care && L.bell, JSON.stringify(L));
    ok('  nothing sideways', !L.sideways);
    ok('  NOTHING LOST: every space they have is in one of their modes',
      L.spaces.every(k => EGBC_MODE_OF(k) && L.modes.includes(EGBC_MODE_OF(k))), JSON.stringify(L.spaces) + ' / ' + JSON.stringify(L.modes));
    ok('  and every space the app has belongs to a mode', L.allSpaces.every(k => L.inModes.includes(k)), JSON.stringify(L.allSpaces.filter(k => !L.inModes.includes(k))));
    await shot('app-start--tiles-375.png');

    await tap('.tile[data-mode="sunday"]'); await sleep(1200);
    L = await J(LOOK);
    ok('  Sunday worship: its colour and name across the top, and Switch', L.mode === 'sunday' && L.coloured && L.title === 'Sunday worship' && L.sw, JSON.stringify(L));
    ok('  only its spaces: Worship & AV and Core Team, not Kids, Maintenance or the office',
      JSON.stringify(L.pills) === JSON.stringify(['worship', 'core']), JSON.stringify(L.pills));
    ok('  the tabs are the space\'s own', L.tabs.join() === 'rota,sunday,learn,team', JSON.stringify(L.tabs));
    ok('  "Open the app here every time?"', L.offer);
    await shot('app-start--sunday-375.png');
    await tap('.offer .n'); await sleep(700);
    ok('  "Not now" puts it away', !(await J(LOOK)).offer);
    await tap('[data-act="mode:switch"]'); await sleep(900);
    L = await J(LOOK);
    ok('  Switch goes back to the tiles, Sunday worship marked "Last time"', /:start:tiles:/.test(L.drawn) && L.last.join() === 'sunday', JSON.stringify(L.last));
    await tap('.tile[data-mode="sunday"]'); await sleep(900);
    ok('  and it does not ask again', !(await J(LOOK)).offer);

    await tap('[data-act="mode:switch"]'); await sleep(900);
    await tap('.tile[data-mode="building"]'); await sleep(1200);
    L = await J(LOOK);
    ok('  The building: the building space beside Maintenance', L.mode === 'building' && JSON.stringify(L.pills) === JSON.stringify(['building', 'maint']), JSON.stringify(L.pills));
    ok('  its Checks open the Menu\'s building pages', ['open:compliance.html', 'open:building.html', 'open:risk.html'].every(r => L.rows.includes(r)), JSON.stringify(L.rows));
    await shot('app-start--building-375.png');

    await tap('.offer .y'); await sleep(900);
    await openApp(M);
    L = await J(LOOK);
    ok('  "Always open here": next time the app opens in The building', L.state.mode === 'building' && /:building:checks:/.test(L.drawn), L.drawn);
    await tap('[data-act="mode:switch"]'); await sleep(900);
    L = await J(LOOK);
    ok('  the tiles say so, and offer "Show this screen instead"', /opens in The building each time/.test(L.always)
      && /Show this screen instead/.test(L.always), L.always);
    await tap('.always button'); await sleep(700);
    await openApp(M);
    ok('  after which the app opens on the tiles again', /:start:tiles:/.test((await J(LOOK)).drawn));

    await openApp(M, '#core:plan');
    L = await J(LOOK);
    ok('  coming back from a page (#core:plan): Core Team, in Sunday worship', L.state.mode === 'sunday' && L.state.space === 'core' && L.state.tab === 'plan', JSON.stringify(L.state));

    await setBuilding({ booleanValue: false });
    await openApp(M);
    await tap('.tile[data-mode="building"]'); await sleep(1200);
    L = await J(LOOK);
    ok('  building compliance switched off: The building is Maintenance only', L.mode === 'building' && JSON.stringify(L.pills) === '[]' && L.state.space === 'maint', JSON.stringify(L));
    await setBuilding(bcBefore);
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    /* 360px, the narrowest phone the audit measures: the coloured bar
       (name, bell, Care, Switch) was 12px too wide in every mode. */
    const wide = [];
    for (const w of [360, 412]) for (const m of ['sunday', 'kids', 'building', 'office']) {
      await size(w);
      await openApp(M);
      await tap('.tile[data-mode="' + m + '"]'); await sleep(1000);
      const sw = Number(await evl('document.documentElement.scrollWidth'));
      if (sw > w + 1) wide.push(m + ' at ' + w + ': ' + sw + 'px');
    }
    ok('  360px and 412px: no mode\'s bar goes sideways', !wide.length, wide.join(', '));
    await size(1440);
    await openApp(M);
    L = await J(LOOK);
    const cols = await J('JSON.stringify(getComputedStyle(document.querySelector(".tiles")).gridTemplateColumns.split(" ").length)');
    ok('  1440px: the tiles two across, nothing sideways', cols === 2 && !L.sideways, cols + ' ' + L.sideways);
    await shot('app-start--tiles-1440.png');
    await size(375);

    const O = PEOPLE.one;
    console.log('\nSomebody on one team');
    await signIn(O);
    await openApp(O);
    L = await J(LOOK);
    ok('  skips the tiles, into Sunday worship', L.mode === 'sunday' && /:worship:rota:/.test(L.drawn), L.drawn);
    ok('  and is not asked about opening there', !L.offer);
    await shot('app-start--member-375.png');
    await tap('[data-act="mode:switch"]'); await sleep(900);
    L = await J(LOOK);
    ok('  Switch shows their two: Sunday worship and Just me', JSON.stringify(L.tiles) === JSON.stringify(['sunday', 'me']), JSON.stringify(L.tiles));
    await tap('.tile[data-mode="me"]'); await sleep(1200);
    L = await J(LOOK);
    ok('  Just me is Home, with the app\'s own header', /:me:home:/.test(L.drawn) && !L.coloured && L.title === 'EGBC Hub', JSON.stringify(L));

    const N = PEOPLE.none;
    console.log('\nSomebody on no team');
    await signIn(N);
    await openApp(N);
    L = await J(LOOK);
    ok('  Just me, Home, the app\'s own header and no Switch', /:me:home:/.test(L.drawn) && !L.coloured && !L.sw && L.tiles.length === 0, JSON.stringify(L));
  } finally {
    await setBuilding(bcBefore).catch(() => {});
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

/* Which mode a space belongs in - the check's own copy of the table, so a
   space left out of every mode in egbc-app.js is caught, not agreed with. */
function EGBC_MODE_OF(space) {
  return { worship: 'sunday', core: 'sunday', youth: 'sunday', kids: 'kids', lazers: 'kids', renu: 'kids',
    building: 'building', maint: 'building', office: 'office', me: 'me' }[space] || '';
}
