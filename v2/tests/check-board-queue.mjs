/* A young person's suggestion, and a leader putting it up.
 *
 *   node tests/check-board-queue.mjs            (from v2/, emulators running)
 *   node tests/check-board-queue.mjs --shots
 *
 * WHY. Martin's third youth follow-up: on ReNu and Lazers a young person may
 * post, and each post waits for a leader before anybody else sees it.
 *
 * firestore-rules.test.mjs proves who may post and who may read the queue -
 * 30-odd cases, four deliberate breaks. It cannot prove that a leader can
 * actually get a suggestion onto the board, which is two writes that have to
 * both happen: the note onto the board document, the suggestion deleted. A
 * queue nobody has ever worked is exactly the thing that breaks the first
 * time somebody uses it.
 *
 * Synthetic throughout: one invented ReNu leader, one invented child.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9685, SERVE = 8903;
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';
const LEAD = 'renu.lead@example.invalid';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };

const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const fsReq = (m, p, b) => req(8181, m, p, b, { Authorization: 'Bearer owner' });
const val = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, obj) => fsReq('PATCH', DOCS + '/' + p, { fields: fields(obj) });
const getOne = async (p) => { const r = await fsReq('GET', DOCS + '/' + p); return r.status === 200 ? JSON.parse(r.body) : null; };

const SUGGESTION = 'renu__walk1';
const CHILD_TEXT = 'Could we do the bake sale again please';
const CHILD_FIRST = 'Ada';

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const EXPECTED_OFF = ['firebasestorage.googleapis.com'];
const reachedOff = [];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });

  /* A clean ReNu board, and one suggestion waiting on it. */
  await put('worshipBoardState/renu', { notes: [], pages: [{ id: 'main', title: 'General Board' }] });
  await fsReq('DELETE', DOCS + '/boardSuggestions/' + SUGGESTION);
  await put('boardSuggestions/' + SUGGESTION, {
    boardId: 'renu', text: CHILD_TEXT, firstName: CHILD_FIRST,
    byUid: 'youth-walkchild', createdAt: new Date() });
  /* And one on the Lazers board, which must never show on ReNu's queue. */
  await put('boardSuggestions/lazers__walk1', {
    boardId: 'lazers', text: 'A Lazers idea nobody on ReNu should see',
    firstName: 'Cat', byUid: 'youth-walklazers', createdAt: new Date() });

  let up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: LEAD, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email: LEAD, password: PW, returnSecureToken: true })).body || '{}');
  /* linkedBy admin, so refreshFromBook does not overwrite what is set here. */
  await put('users/' + up.localId, {
    uid: up.localId, email: LEAD, name: 'ReNu Lead', memberId: 'ab_renu_lead',
    status: 'active', linkedBy: 'admin', teams: ['ReNu'], adminFor: ['ReNu'],
    masterAdmin: false, attender: true, churchMember: false });
  await put('addressBook/ab_renu_lead', {
    name: 'ReNu Lead', email: LEAD, markers: ['ReNu'], adminFor: ['ReNu'] });

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
      body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript'
      : e === '.css' ? 'text/css' : e === '.json' ? 'application/json'
      : e === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-queue-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errs.push((m.params.args || []).map(a => String(a.value || a.description || '')).join(' ').slice(0, 200));
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) { reachedOff.push(u.split('/')[2]); return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); }
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    if (!wantShots) return;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'queue--' + name + '.png'), Buffer.from(r.data, 'base64'));
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(3500);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
    + JSON.stringify(LEAD) + ',' + JSON.stringify(PW) + ')', true);
  ok('signed in as the ReNu leader',
    (await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).email || "(nobody)"')) === LEAD);

  console.log('\nthe queue');
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/stickynotes.html?board=renu' });
  await sleep(8000);
  await ev('window.__said = []; window.confirm = () => true; window.alert = m => window.__said.push(String(m));');
  ok('the ReNu board opens for its leader',
    /ReNu Board/i.test(String(await ev('document.getElementById("boardTitle").textContent'))),
    String(await ev('document.getElementById("boardTitle").textContent')));
  const q = String(await ev('document.getElementById("queue").innerText'));
  ok('the suggestion is waiting, under the child\u2019s first name',
    q.includes(CHILD_FIRST) && q.includes(CHILD_TEXT), q.slice(0, 200));
  ok('and the Lazers one is NOT on this queue',
    !/Lazers idea/.test(q), q.slice(0, 200));
  ok('with a way to put it up and a way to remove it',
    (await ev('!!document.querySelector("[data-up]") && !!document.querySelector("[data-bin]")')) === true);
  await shot('1-waiting');

  console.log('\nputting it up');
  await ev('document.querySelector("[data-up]").click()');
  await sleep(5000);
  const board = await getOne('worshipBoardState/renu');
  const boardText = board ? JSON.stringify(board.fields) : '';
  ok('THE NOTE IS ON THE BOARD, in the database', boardText.includes(CHILD_TEXT), boardText.slice(0, 250));
  ok('under the child\u2019s first name and no more of it', boardText.includes(CHILD_FIRST), boardText.slice(0, 250));
  ok('and the suggestion is gone, so it cannot go up twice',
    (await getOne('boardSuggestions/' + SUGGESTION)) === null);
  const after = String(await ev('document.getElementById("queue").innerText'));
  ok('the queue says there is nothing left', /Nothing is waiting/i.test(after), after.slice(0, 160));
  await shot('2-up');

  console.log('\nremoving one instead');
  await put('boardSuggestions/renu__walk2', {
    boardId: 'renu', text: 'Something a leader would rather not put up',
    firstName: 'Ben', byUid: 'youth-walkchild2', createdAt: new Date() });
  await ev('loadSuggestions()', true);
  await sleep(2500);
  ok('it appears', /Ben/.test(String(await ev('document.getElementById("queue").innerText'))),
    String(await ev('document.getElementById("queue").innerText')).slice(0, 160));
  await ev('document.querySelector("[data-bin]").click()');
  await sleep(4000);
  ok('A LEADER REMOVES IT, and it is gone from the database',
    (await getOne('boardSuggestions/renu__walk2')) === null);
  const board2 = await getOne('worshipBoardState/renu');
  ok('and it never reached the board',
    !JSON.stringify(board2 ? board2.fields : {}).includes('rather not put up'));
  await shot('3-removed');

  console.log('\nthe console, and where the page went');
  const real = errs.filter(e => !/Logo fetch failed|storage\/object-not-found|cdn\.tailwindcss/i.test(e));
  ok('no errors on the console', real.length === 0, JSON.stringify(real).slice(0, 300));
  const unexpected = [...new Set(reachedOff)].filter(h => !EXPECTED_OFF.includes(h));
  ok('nothing reached anywhere off this machine that is not accounted for',
    unexpected.length === 0, unexpected.join(', '));

  server.close(); chrome.kill(); ws.close();
  const failed = R.filter(v => !v).length;
  console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
