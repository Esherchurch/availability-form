/* An empty pin board opens empty (A-079).
 *
 *   node tests/check-board-empty.mjs      (from v2/, emulators up)
 *
 * Since the v2 import an empty WORSHIP board was filled with four invented
 * notes ("Sarah: Way Maker", "Pastor Mike", ...) and they were SAVED, so a
 * new church's first visit wrote made-up people into its real board - and
 * one of them embedded a YouTube video, which is what check-charter-switch
 * kept tripping over. Martin, 13 Oct 2026: remove them; an empty board
 * opens empty, like the others, and a board that already has notes is not
 * touched.
 *
 * Three things, read off the database as well as the screen:
 *   - the empty board draws no notes,
 *   - writes nothing (the save was the harmful half), and
 *   - reaches nothing off this machine;
 *   - and a board that already has notes keeps exactly those notes.
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
const PORT = 9735, SERVE = 8951;
const PW = 'test-only-password';
const ME = { email: 'board.empty@example.invalid', name: 'Bo Board Synthetic', member: 'ab_board_empty' };
const BOARD = 'worshipBoardState/state';

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
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const get = (p) => req(8181, 'GET', DOCS + '/' + p, undefined, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const reachedOff = [];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

(async () => {
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  const uid = up.localId;
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ['Worship Team'], adminFor: [],
    churchMember: true, archived: false, isMinor: false });
  await put('users/' + uid, { uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active',
    linkedBy: 'admin', teams: ['Worship Team'], adminFor: [], masterAdmin: false, attender: true, churchMember: true });

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
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-board-empty-' + process.pid),
    '--window-size=1280,900', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
      if (offMachine(u)) { reachedOff.push(u.split('/')[2]); return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); }
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  const ev = makeEval(send, 'board-empty');

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
  await sleep(2500);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ')', true);
  await sleep(800);
  ok('signed in as a synthetic Worship member', String(await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid||""')) === uid);

  /* The page's own copy in this browser could stand in for the database,
     so it goes too: the board must be empty everywhere it could come from. */
  const openBoard = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/stickynotes.html' });
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      const st = String(await ev('(function(){ if(!document.body) return "loading";'
        + ' if (document.body.getAttribute("data-egbc-blocked")) return "blocked";'
        + ' return document.getElementById("egbc-guard-style") ? "checking" : "open"; })()'));
      if (st !== 'loading' && st !== 'checking') break;
    }
    /* Past the save's debounce, so a save that was going to happen has. */
    await sleep(4000);
  };
  const drawn = () => ev('document.querySelectorAll(".note-title").length');
  const titles = () => ev('[].slice.call(document.querySelectorAll(".note-title")).map(function(e){return e.textContent}).join("|")');

  /* ---- an empty Worship board -------------------------------------- */
  console.log('\nan empty Worship board');
  await del(BOARD);
  await ev('try{Object.keys(localStorage).forEach(function(k){if(/^worshipBoard/.test(k))localStorage.removeItem(k)})}catch(e){};1');
  watch.reset(); reachedOff.length = 0;
  await openBoard();
  ok('  opens with no notes on it', Number(await drawn()) === 0, String(await titles()));
  ok('  and none of the old invented ones', !/Way Maker|Easter Sunrise|Side Stage|Welcome Banner/.test(String(await titles())));
  const after = await get(BOARD);
  const savedNotes = after.status === 200 ? (((JSON.parse(after.body).fields || {}).notes || {}).arrayValue || {}).values || [] : [];
  ok('  and WRITES NOTHING into the board', savedNotes.length === 0, after.status + ' ' + after.body.slice(0, 200));
  /* The church logo comes from live Storage on every page (A-039), as
     check-charter-switch also allows. YouTube was the invented note. */
  const unexpected = [...new Set(reachedOff)].filter(h => h !== 'firebasestorage.googleapis.com');
  ok('  nothing reached anywhere off this machine that is not accounted for (no YouTube)', unexpected.length === 0, unexpected.join(', '));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* ---- a board that already has notes ------------------------------- */
  console.log('\na board that already has notes');
  const NOTE = { id: 'n_board_empty', pageId: 'main', cat: 'general', author: 'Synthetic', title: 'Synthetic Existing Note',
    body: 'Already here.', ytUrl: '', link: '', linkLabel: '', imgUrl: '', reactions: { love: 1, like: 0, dislike: 0, pray: 0 },
    archived: false, x: 80, y: 80, rot: 0, zIndex: 10, createdAt: 1700000000000 };
  await put(BOARD, { pages: [{ id: 'main', name: 'Main' }], notes: [NOTE] });
  const before = JSON.parse((await get(BOARD)).body).fields;
  watch.reset();
  await openBoard();
  ok('  shows exactly its own note', String(await titles()) === 'Synthetic Existing Note', String(await titles()));
  const kept = JSON.parse((await get(BOARD)).body).fields;
  ok('  and the board is left exactly as it was', JSON.stringify(kept.notes) === JSON.stringify(before.notes),
    JSON.stringify(kept.notes).slice(0, 200));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  await del(BOARD);

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
