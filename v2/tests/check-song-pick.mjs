/* Choosing a song (Martin approved the mock-up, 19 Oct 2026:
 * design-mocks/core-team/song-flow-1540).
 *
 *   node tests/check-song-pick.mjs      (from v2/, the dev emulators up)
 *
 * In the Sunday plan (egbc-core-planner.js, here in CoreTeamApp.html) at
 * 375px, as somebody on Core Team:
 *   "+ Song" opens the song library, with the search ready;
 *   what was sung recently and what is sung most come first, from the saved
 *     plans;
 *   typing a line from a song finds it, and shows that line;
 *   one tap adds it as the next song, open, with its keys - the ones with
 *     chord sheets first - and "Other..." for any key;
 *   a song not in the library can be added by name; Escape closes;
 *   every target is 44px; nothing on the console.
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
const PORT = 9833, SERVE = 9039, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  core: { email: 'sp.core@example.invalid', member: 'ab_sp_core', name: 'Sol Synthetic', teams: ['Core Team', 'Worship Team'], adminFor: [], masterAdmin: false }
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
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : (v && typeof v === 'object') ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';

const day = (n) => { const d = new Date(Date.now() + n * 86400000); return d.toISOString().slice(0, 10); };
const SONGS = {
  'sp-recent-synthetic': { title: 'Sp Recent Synthetic', lyrics: 'A song we sang last week, synthetic words', files: [{ type: 'Chord Sheet', key: 'C', url: 'https://example.invalid/c.pdf' }] },
  'sp-often-synthetic': { title: 'Sp Often Synthetic', lyrics: 'Sung most of all, synthetic', files: [{ type: 'Chord Sheet', key: 'A', url: 'https://example.invalid/a.pdf' }] },
  'sp-line-synthetic': { title: 'Sp Line Synthetic', lyrics: 'In synthetic hope alone, no other foundation stands, synthetic', files: [
    { type: 'Chord Sheet', key: 'D', url: 'https://example.invalid/d.pdf' }, { type: 'Chord Sheet', key: 'E', url: 'https://example.invalid/e.pdf' }] }
};
const SERVICES = {
  sp_s1: { date: day(-6), order: [{ type: 'song', title: 'Sp Recent Synthetic', keys: ['C'] }] },
  sp_s2: { date: day(-40), order: [{ type: 'song', title: 'Sp Often Synthetic', keys: ['A'] }] },
  sp_s3: { date: day(-47), order: [{ type: 'song', title: 'Sp Often Synthetic', keys: ['A'] }] },
  sp_s4: { date: day(-54), order: [{ type: 'song', title: 'Sp Often Synthetic', keys: ['A'] }] }
};

(async () => {
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin',
      teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, churchMember: true });
  }
  for (const [id, s] of Object.entries(SONGS)) await put('songs/' + id, s);
  for (const [id, s] of Object.entries(SERVICES)) await put('services/' + id, s);

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-sp-' + process.pid),
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
  const evl = makeEval(send, 'sp');
  const J = async (x) => JSON.parse(String(await evl(x)));
  const signIn = async (p) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await evl('sessionStorage.clear();localStorage.removeItem("egbc_hub_team");localStorage.setItem("egbc_email_user","Tester");1');
    for (let i = 0; i < 3; i++) {
      await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').catch(function(){})', true); await sleep(800);
      if (String(await evl('(firebase.auth(EGBCAuth.app).currentUser||{}).email||""')) === p.email) return;
    }
  };
  const open = async (page, wait) => { await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page }); await sleep(wait || 9000); };
  const rows = () => J('JSON.stringify([].map.call(document.querySelectorAll("#sp-pick-list .sp-pick-lab, #sp-pick-list .sp-pick-row"),function(e){return e.innerText.replace(/\\s+/g," ").trim()}))');
  const type = (v) => evl('(function(){var q=document.getElementById("sp-pick-q");q.value=' + JSON.stringify(v) + ';q.dispatchEvent(new Event("input",{bubbles:true}));return 1})()');
  const tap = (title) => evl('(function(){var b=[].find.call(document.querySelectorAll("#sp-pick-list .sp-pick-row"),function(r){return r.innerText.indexOf(' + JSON.stringify(title) + ')!==-1});if(!b)return 0;b.click();return 1})()');

  try {
    await signIn(PEOPLE.core); watch.reset();
    await open('CoreTeamApp.html', 11000);
    await evl('(function(){try{if(typeof endTour==="function")endTour()}catch(e){};try{openSection("service")}catch(e){};return 1})()'); await sleep(2500);
    const before = Number(await evl('document.querySelectorAll("#sp-order .song-block").length'));
    await evl('(function(){var b=[].find.call(document.querySelectorAll(".sp-btn"),function(x){return /\\+ Song/.test(x.textContent)});b.click();return 1})()'); await sleep(2500);
    ok('"+ Song" opens the song library', String(await evl('!!document.getElementById("sp-pick")')) === 'true');
    ok('  with the search ready to type in', String(await evl('document.activeElement && document.activeElement.id')) === 'sp-pick-q');
    let r = await rows();
    const iRecent = r.indexOf('Used recently'), iMost = r.indexOf('Most used');
    ok('  sung recently first', iRecent === 0 && /^Sp Recent Synthetic Last sung .* key C/.test(r[1] || ''), JSON.stringify(r.slice(0, 6)));
    ok('  then sung most, with how often', iMost > 0 && r.slice(iMost + 1).some(t => /^Sp Often Synthetic Sung 3 times .*key A/.test(t)), JSON.stringify(r));

    await type('no other'); await sleep(1500);
    r = await rows();
    ok('typing a line from a song finds it', r.some(t => /^Sp Line Synthetic/.test(t)), JSON.stringify(r));
    const marked = String(await evl('(document.querySelector("#sp-pick-list mark")||{}).textContent||""'));
    ok('  and shows that line, the words marked', marked.toLowerCase() === 'no other' && r.some(t => /no other foundation/.test(t)), marked);
    ok('  with the keys it has chord sheets for', r.some(t => /^Sp Line Synthetic.*keys D, E/.test(t)), JSON.stringify(r));
    await tap('Sp Line Synthetic'); await sleep(2500);
    ok('one tap adds it and closes the library', String(await evl('!document.getElementById("sp-pick")')) === 'true');
    const after = Number(await evl('document.querySelectorAll("#sp-order .song-block").length'));
    const last = await J('JSON.stringify((function(){var bs=document.querySelectorAll("#sp-order .song-block"),b=bs[bs.length-1];return {title:b.querySelector(".song-title").value,open:!b.querySelector(".song-content").classList.contains("hidden"),keys:[].map.call(b.querySelectorAll(".sp-keybtns button"),function(x){return x.innerText.replace(/\\s+/g," ").trim()})}})())');
    ok('  as the next song', after === before + 1 && last.title === 'Sp Line Synthetic', JSON.stringify({ before, after, last }));
    ok('  open, with its keys: the chord-sheet ones first, then Other', last.open && JSON.stringify(last.keys) === JSON.stringify(['D chords', 'E chords', 'Other\u2026']), JSON.stringify(last));
    const toast = String(await evl('(document.querySelector(".sp-toast")||{}).textContent||""'));
    ok('  and says so', toast === '\u201cSp Line Synthetic\u201d added as song ' + after, toast);
    await evl('(function(){var bs=document.querySelectorAll("#sp-order .song-block"),b=bs[bs.length-1];b.querySelector(".sp-keybtns [data-key=D]").click();return 1})()'); await sleep(800);
    const k1 = String(await evl('(function(){var bs=document.querySelectorAll("#sp-order .song-block"),b=bs[bs.length-1];return b.querySelector(".song-key").value})()'));
    ok('tapping a key chooses it', k1 === 'D', k1);
    const small = await J('JSON.stringify([].filter.call(document.querySelectorAll(".sp-keybtns button"),function(b){var r=b.getBoundingClientRect();return r.height<44}).length)');
    ok('  the key buttons are 44px', small === 0, String(small));

    await evl('(function(){var b=[].find.call(document.querySelectorAll(".sp-btn"),function(x){return /\\+ Song/.test(x.textContent)});b.click();return 1})()'); await sleep(1500);
    const rowsSmall = await J('JSON.stringify([].filter.call(document.querySelectorAll("#sp-pick .sp-pick-row, #sp-pick .sp-pick-x"),function(b){return b.getBoundingClientRect().height<44}).length)');
    ok('the library\u2019s rows and close are 44px', rowsSmall === 0, String(rowsSmall));
    await type('Zz Brand New Synthetic'); await sleep(1200);
    await tap('as a new song'); await sleep(1500);
    const nt = String(await evl('(function(){var bs=document.querySelectorAll("#sp-order .song-block");return bs[bs.length-1].querySelector(".song-title").value})()'));
    ok('a song not in the library is added by name', nt === 'Zz Brand New Synthetic', nt);
    await evl('(function(){var b=[].find.call(document.querySelectorAll(".sp-btn"),function(x){return /\\+ Song/.test(x.textContent)});b.click();return 1})()'); await sleep(1200);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(600);
    ok('Escape closes it', String(await evl('!document.getElementById("sp-pick")')) === 'true');
    ok('nothing on the console', watch.errors.length === 0, watch.summary());
  } finally {
    for (const id of Object.keys(SONGS)) await del('songs/' + id);
    for (const id of Object.keys(SERVICES)) await del('services/' + id);
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
