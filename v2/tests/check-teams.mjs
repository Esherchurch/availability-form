/* Teams & groups, and "Everyone" (Martin, 15 Oct 2026).
 *
 *   node tests/check-teams.mjs      (from v2/, the dev emulators up)
 *
 * teams-admin.html, as a master admin, at 1440px and 375px:
 *   - the list shows the built-in rota teams and the collection's, not an
 *     archived one until "Show archived";
 *   - relabel, move, archive and add each save at once (rule 13), and are
 *     read back from the database;
 *   - archiving leaves the marker on the person who has it;
 *   - a new team's id is its name and it runs nothing.
 * As the Church office: it can relabel, and the Runs ticks are not offered.
 * As somebody else: the page is not shown.
 * The hub's Home picker: "Everyone" first, for a member and a master admin;
 * a member on no team gets Everyone with nothing to choose; an archived
 * team is not offered. "View the site as": Everyone (no team) first, and
 * choosing it shows no team's things.
 * Pictures: tests/shots/teams-admin-{375,1440}.png, teams-picker-375.png
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
const PORT = 9781, SERVE = 8997, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  master: { email: 'tg.master@example.invalid', member: 'ab_tg_master', name: 'TG Master Synthetic', teams: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true },
  office: { email: 'tg.office@example.invalid', member: 'ab_tg_office', name: 'TG Office Synthetic', teams: ['Church office'], adminFor: [], masterAdmin: false },
  member: { email: 'tg.member@example.invalid', member: 'ab_tg_member', name: 'TG Member Synthetic', teams: ['Worship Team'], adminFor: [], masterAdmin: false },
  none:   { email: 'tg.none@example.invalid',   member: 'ab_tg_none',   name: 'TG Nobody Synthetic', teams: [], adminFor: [], masterAdmin: false }
};
const A = 'Zz TG Alpha', B = 'Zz TG Beta', GONE = 'Zz TG Gone', NEW = 'Zz TG New';

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
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + enc(p), { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + enc(p), undefined, OWNER);
const plain = (v) => !v ? undefined : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue
  : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? v.doubleValue
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(plain) : 'timestampValue' in v ? v.timestampValue : null;
const get = async (p) => {
  const r = await req(8181, 'GET', DOCS + '/' + enc(p), undefined, OWNER);
  if (r.status !== 200) return null;
  return Object.fromEntries(Object.entries(JSON.parse(r.body).fields || {}).map(([k, v]) => [k, plain(v)]));
};
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tidy() {
  for (const t of [A, B, GONE, NEW]) await del('teams/' + t);
  await del('addressBook/ab_tg_marked');
}

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
  await tidy();
  await put('teams/' + A, { name: A, label: A, colour: '#225588', rota: true, order: 901, archived: false });
  await put('teams/' + B, { name: B, label: B, colour: '#882255', rota: true, order: 902, archived: false });
  await put('teams/' + GONE, { name: GONE, label: GONE, colour: '#555555', rota: true, order: 903, archived: true });
  /* Somebody on Alpha, to prove archiving leaves them on it. */
  await put('addressBook/ab_tg_marked', { name: 'TG Marked Synthetic', email: 'tg.marked@example.invalid', markers: [A], adminFor: [], archived: false, isMinor: false });

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-tg-' + process.pid),
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
  const evl = makeEval(send, 'tg');
  const J = async (x) => JSON.parse(String(await evl(x)));

  const signIn = async (p) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await evl('sessionStorage.clear();localStorage.removeItem("egbc_hub_team");1');
    for (let i = 0; i < 3; i++) {
      await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').catch(function(){})', true); await sleep(800);
      if (String(await evl('(firebase.auth(EGBCAuth.app).currentUser||{}).email||""')) === p.email) return;
    }
  };
  const open = async (page, w, wait) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 700 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 700 });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page }); await sleep(wait || 7000);
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(s.data, 'base64'));
  };
  const ids = () => J('JSON.stringify([].map.call(document.querySelectorAll("#list [data-id]"),function(c){return c.dataset.id}))');
  const card = (t) => 'document.querySelector(\'#list [data-id="' + t + '"]\')';
  const change = (t, sel, how) => evl('(function(){var el=' + card(t) + '.querySelector(\'' + sel + '\');' + how
    + ';el.dispatchEvent(new Event("change",{bubbles:true}));return 1})()');

  try {
    console.log('Teams & groups, as a master admin (1440px)');
    await signIn(PEOPLE.master);
    watch.reset();
    await open('teams-admin.html', 1440);
    let seen = await ids();
    ok('  the built-in rota teams are listed', seen.includes('Worship Team') && seen.includes('Kids Church'), JSON.stringify(seen));
    ok('  and the collection\'s, in their order', seen.indexOf(A) !== -1 && seen.indexOf(A) < seen.indexOf(B), JSON.stringify(seen));
    ok('  not an archived one', !seen.includes(GONE));
    await evl('(function(){var c=document.getElementById("showGone");c.checked=true;c.dispatchEvent(new Event("change"));return 1})()'); await sleep(300);
    ok('  until "Show archived"', (await ids()).includes(GONE));
    await evl('(function(){var c=document.getElementById("showGone");c.checked=false;c.dispatchEvent(new Event("change"));return 1})()'); await sleep(300);
    ok('  the Runs ticks are offered to a master admin',
      String(await evl(card(A) + '.querySelector("[data-run=people]").disabled')) === 'false');

    await change(A, '[data-f=label]', 'el.value="Zz TG Alpha Renamed"'); await sleep(1500);
    let a = await get('teams/' + A);
    ok('  relabelling saves at once, and the id stays', a && a.label === 'Zz TG Alpha Renamed' && a.name === A, JSON.stringify(a));
    await change(A, '[data-f=colour]', 'el.value="#123456"'); await sleep(1500);
    ok('  so does a new colour', ((await get('teams/' + A)) || {}).colour === '#123456');

    await evl(card(B) + '.querySelector(\'[data-move="-1"]\').click();1'); await sleep(2000);
    a = await get('teams/' + A); const b = await get('teams/' + B);
    seen = await ids();
    ok('  moving up saves the new order', a && b && b.order < a.order && seen.indexOf(B) < seen.indexOf(A), JSON.stringify({ a: a && a.order, b: b && b.order }));

    await change(A, '[data-f=archived]', 'el.checked=true'); await sleep(1800);
    a = await get('teams/' + A);
    ok('  archiving saves', a && a.archived === true);
    ok('  and the team leaves the list', !(await ids()).includes(A));
    const marked = await get('addressBook/ab_tg_marked');
    ok('  but the person on it keeps it: no marker lost', marked && (marked.markers || []).includes(A), JSON.stringify(marked));

    await evl('document.getElementById("newName").value=' + JSON.stringify(NEW) + ';document.getElementById("newIsGroup").checked=true;'
      + 'document.getElementById("addForm").dispatchEvent(new Event("submit",{cancelable:true}));1'); await sleep(1800);
    const n = await get('teams/' + NEW);
    ok('  adding saves a group whose id is its name, running nothing',
      n && n.name === NEW && n.label === NEW && n.rota === false && n.archived === false && !('runs' in n), JSON.stringify(n));
    ok('  and it is on the list', (await ids()).includes(NEW));
    await evl('document.getElementById("newName").value="worship team";document.getElementById("addForm").dispatchEvent(new Event("submit",{cancelable:true}));1'); await sleep(600);
    ok('  a name already there is not added twice', /already on the list/.test(String(await evl('document.getElementById("addMsg").textContent'))));
    await shot('teams-admin-1440.png');
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    console.log('\nAt 375px');
    await open('teams-admin.html', 375);
    const fit = await J('JSON.stringify({sideways:document.documentElement.scrollWidth>innerWidth+1,'
      + 'small:[].filter.call(document.querySelectorAll("#list button,#list input[type=color]"),function(x){var r=x.getBoundingClientRect();return r.width>0&&(r.width<44||r.height<44)}).length})');
    ok('  no sideways scrolling, and every button is a 44px target', !fit.sideways && fit.small === 0, JSON.stringify(fit));
    await shot('teams-admin-375.png');

    console.log('\nAs the Church office');
    await signIn(PEOPLE.office);
    watch.reset();
    await open('teams-admin.html', 1440);
    ok('  the page opens for them', (await ids()).includes(B));
    ok('  the Runs ticks are shown but not offered',
      String(await evl(card(B) + '.querySelector("[data-run=people]").disabled')) === 'true');
    await change(B, '[data-f=label]', 'el.value="Zz TG Beta By Office"'); await sleep(1500);
    ok('  and they can relabel', ((await get('teams/' + B)) || {}).label === 'Zz TG Beta By Office');
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    console.log('\nAs somebody on no list');
    await signIn(PEOPLE.member);
    await open('teams-admin.html', 1440);
    ok('  the page is not shown, and nothing loads', (await ids()).length === 0);

    console.log('\nThe Home picker');
    watch.reset();
    await open('hub.html', 1440, 10000);
    const one = await J('JSON.stringify({team:localStorage.getItem("egbc_hub_team"),btn:getComputedStyle(document.getElementById("teamSwitch")).display})');
    await evl('openTeamPicker();1'); await sleep(600);
    let picks = await J('JSON.stringify([].map.call(document.querySelectorAll("#pickList .pick-t"),function(b){return b.dataset.team}))');
    ok('  a member on one team is offered Everyone first, then their team', JSON.stringify(picks) === JSON.stringify(['__everyone', 'Worship Team']), JSON.stringify({ picks, one }));
    await evl('document.querySelector(\'#pickList [data-team="__everyone"]\').click();1'); await sleep(1500);
    ok('  choosing Everyone is kept', String(await evl('localStorage.getItem("egbc_hub_team")')) === '__everyone');
    await open('hub.html', 1440, 10000);
    ok('  and still chosen next time', String(await evl('localStorage.getItem("egbc_hub_team")')) === '__everyone'
      && String(await evl('document.getElementById("teamPicker").classList.contains("on")')) === 'false');
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    await signIn(PEOPLE.none);
    await open('hub.html', 375, 10000);
    const nobody = await J('JSON.stringify({open:document.getElementById("teamPicker").classList.contains("on"),'
      + 'btn:getComputedStyle(document.getElementById("teamSwitch")).display})');
    ok('  a member on no team gets Everyone, with nothing to choose', !nobody.open && nobody.btn === 'none', JSON.stringify(nobody));

    await signIn(PEOPLE.master);
    await open('hub.html', 375, 10000);
    picks = await J('JSON.stringify([].map.call(document.querySelectorAll("#pickList .pick-t"),function(b){return b.dataset.team}))');
    ok('  a master admin is offered Everyone first, and every team', picks[0] === '__everyone' && picks.includes('Worship Team')
      && picks.includes(B) && picks.includes(NEW), JSON.stringify(picks));
    ok('  but no archived one', !picks.includes(A) && !picks.includes(GONE));
    await shot('teams-picker-375.png');

    console.log('\n"View the site as"');
    await open('groups.html', 1440);
    const opts = await J('JSON.stringify([].map.call(document.querySelectorAll("#egbc-va-team option"),function(o){return o.value}))');
    ok('  Everyone (no team) is the first choice, then the one list', opts.filter(Boolean)[0] === '__everyone' && opts.includes(B) && !opts.includes(A), JSON.stringify(opts));
    await evl('(function(){var s=document.getElementById("egbc-va-team");s.value="__everyone";s.dispatchEvent(new Event("change"));return 1})()'); await sleep(7000);
    const as = await J('JSON.stringify({teams:EGBCAuth.effectiveTeams(),top:(document.getElementById("egbc-viewas-top")||{}).innerText||""})');
    ok('  choosing it shows no team\'s things, and says so at the top',
      as.teams.length === 0 && /Viewing as a church member on no team/.test(as.top), JSON.stringify(as));
    await evl('sessionStorage.removeItem("egbc_view_as");1');
  } finally {
    await tidy();
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(async e => { console.error(e); try { await tidy(); } catch {} process.exit(1); });
