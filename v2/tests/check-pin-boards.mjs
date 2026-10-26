/* Who sees which pin board (26 Oct 2026; Martin: "pin board is showing for
 * everyone"; his standing rule: a board is for everyone on that team, never
 * leaders-only, and nobody else).
 *
 *   node tests/check-pin-boards.mjs          (from v2/, the dev emulators up)
 *   BREAK=1 node tests/check-pin-boards.mjs  the hub's old fallback (Worship's board
 *                                            for anyone on no team): must fail
 *
 * In a browser at 375, made-up people: a member on no team; a Kids Church
 * member; a Worship Team member; a Kids & Youth Core Team member; a master
 * admin. For each: their boards (from the teams), the Menu's Pin boards, the
 * hub's Home pin board card, and what stickynotes.html offers.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9825, SERVE = 8989, PW = 'test-only-password';
const BREAK = !!process.env.BREAK;
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const PEOPLE = {
  none: { email: 'pb.none@example.invalid', member: 'ab_pb_none', name: 'PB No Team Synthetic', teams: [], master: false },
  kids: { email: 'pb.kids@example.invalid', member: 'ab_pb_kids', name: 'PB Kids Synthetic', teams: ['Kids Church'], master: false },
  worship: { email: 'pb.worship@example.invalid', member: 'ab_pb_worship', name: 'PB Worship Synthetic', teams: ['Worship Team'], master: false },
  kycore: { email: 'pb.kycore@example.invalid', member: 'ab_pb_kycore', name: 'PB KY Core Synthetic', teams: ['Kids & Youth Core Team'], master: false },
  master: { email: 'pb.master@example.invalid', member: 'ab_pb_master', name: 'PB Master Synthetic', teams: [], master: true }
};
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 300))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }, OWNER);
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';

const server = http.createServer((q, s) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
  const f = path.join(V2, url.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f);
  if (/\.(html|js)$/.test(f)) {
    let t = body.toString('utf8');
    if (/\.html$/.test(f)) { const h = /<head[^>]*>/i.exec(t); if (h) t = t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length); }
    /* The break: the hub's old fallback - Worship's board for anyone on no team. */
    if (BREAK && url === '/hub-app.js') { const was = t; t = t.replace('function myPinBoards() { return (EGBCAuth.myBoards ? EGBCAuth.myBoards() : []); }', "function myPinBoards() { const m = EGBCAuth.myBoards(); return m.length ? m : EGBCAuth.boards().filter(b => b.doc === 'state'); }"); if (t === was) console.log('  FAIL  the break did not apply'); }
    body = Buffer.from(t, 'utf8');
  }
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : /\.png$/.test(f) ? 'image/png' : 'text/html') + (/\.png$/.test(f) ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-pinboards-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

let exitCode = 1;
try {
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: [], masterAdmin: p.master, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: [], masterAdmin: p.master, churchMember: true });
  }
  let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (list.some((x) => x.type === 'page')) break; } catch {} await sleep(500); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); };
  const evl = makeEval(send, 'pinboards');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const signIn = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
  };
  const hub = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' });
    for (let i = 0; i < 60 && String(await evl('!!(window.EGBCMenu && EGBCAuth.profile && EGBCAuth.profile())')) !== 'true'; i++) await sleep(400);
    await sleep(3500);
    return JSON.parse(String(await evl('(function(){var u=[];(function w(n){n.forEach(function(x){if(x.url)u.push(x.url);if(x.children)w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));'
      + 'return JSON.stringify({boards:EGBCAuth.myBoards().map(function(b){return b.doc}).sort(),menu:u.indexOf("stickynotes.html")!==-1,'
      + 'card:(document.getElementById("pinBoardCard")||{textContent:""}).textContent.replace(/\\s+/g," ").trim()})})()')));
  };
  const page = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/stickynotes.html' }); await sleep(5000);
    return JSON.parse(String(await evl('JSON.stringify({title:(document.getElementById("boardTitle")||{}).textContent,picker:[].map.call(document.querySelectorAll("#boardPicker option"),function(o){return o.value}),none:/There isn.t a pin board for your team/.test(document.body.innerText),blocked:document.body.getAttribute("data-egbc-blocked")||""})')));
  };
  const expect = {
    none: { boards: [], menu: false, card: false },
    kids: { boards: ['kids-church'], menu: true, card: 'Kids Church' },
    worship: { boards: ['state'], menu: true, card: 'Worship' },
    kycore: { boards: ['kids-church', 'lazers', 'renu', 'youth'], menu: true, card: true },
    master: { boards: null, menu: true, card: true }
  };
  for (const who of Object.keys(PEOPLE)) {
    console.log('\n' + PEOPLE[who].name);
    await signIn(who);
    const h = await hub(), x = expect[who];
    if (x.boards) ok('their boards: ' + (x.boards.join(', ') || 'none'), JSON.stringify(h.boards) === JSON.stringify(x.boards), JSON.stringify(h.boards));
    else ok('every board (a master admin)', h.boards.length >= 6, JSON.stringify(h.boards));
    ok('  the Menu ' + (x.menu ? 'offers' : 'does not offer') + ' Pin boards', h.menu === x.menu, JSON.stringify(h));
    if (x.card === false) ok('  no pin board card on Home - never Worship\'s by default', !/Pin board/.test(h.card), h.card.slice(0, 120));
    else ok('  the Home card is ' + (x.card === true ? 'there' : 'their own board, ' + x.card), /Pin board/.test(h.card) && (x.card === true || h.card.indexOf(x.card) !== -1) && (who === 'worship' || x.card === true || !/\bWorship\b/.test(h.card)), h.card.slice(0, 160));
    if (who === 'none' || who === 'kids' || who === 'kycore') {
      const p = await page();
      if (who === 'none') ok('  stickynotes.html: refused (the page\'s guard, or "no board for your team"), never Worship\'s', (p.none || !!p.blocked) && !/Worship/.test(p.title || ''), JSON.stringify(p));
      if (who === 'kids') ok('  stickynotes.html: the Kids Church board, and no other', /Kids Church/.test(p.title || '') && p.picker.length <= 1, JSON.stringify(p));
      if (who === 'kycore') ok('  stickynotes.html: a choice of the four covered boards, not Worship\'s', p.picker.length === 4 && !p.picker.includes('worship'), JSON.stringify(p));
    }
  }
  ok('no errors on the pages', errs.length === 0, errs.join(' | '));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  for (const p of Object.values(PEOPLE)) { await req(8181, 'DELETE', DOCS + '/users/' + p.uid, undefined, OWNER).catch(() => {}); await req(8181, 'DELETE', DOCS + '/addressBook/' + p.member, undefined, OWNER).catch(() => {}); }
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
