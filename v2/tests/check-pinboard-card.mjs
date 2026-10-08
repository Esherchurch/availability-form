/* Is the pin board on the page people actually land on?
 *
 *   node tests/check-pinboard-card.mjs [--shots]   (from v2/, emulators running)
 *
 * Martin: "It is actually important but buried." It was one line in the Menu
 * and nothing at all on the hub's own page. NEXT-BRIEF §16 asks for a card on
 * the landing page showing the newest few notes, with "Add an idea" and "Open
 * the pin board".
 *
 * This seeds invented notes, loads the hub at desktop and at phone width, and
 * checks the card is there with the newest notes on it - newest first, and
 * not the archived one. It writes nothing to the pin board.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9628, SERVE = 8869;
const PROJECT = 'egbc-worship-planner';
const wantShots = process.argv.includes('--shots');
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 260) : '')); };

const rest = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: 'localhost', port: 8181, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej); req.end(data);
});

/* Four invented notes. The oldest is archived, so it must not show. */
const DAY = 86400000, now = Date.now();
const NOTES = [
  { title: 'Could we try the new mics on Sunday', author: 'Alex Synthetic', createdAt: now - DAY, archived: false },
  { title: 'The music stand light is broken', author: 'Bea Synthetic', createdAt: now - 2 * DAY, archived: false },
  { title: 'Idea: a short practice before the service', author: 'Cal Synthetic', createdAt: now - 3 * DAY, archived: false },
  { title: 'Spare cables ordered', author: 'Dee Synthetic', createdAt: now - 4 * DAY, archived: false },
  { title: 'THIS ONE IS ARCHIVED and must not show', author: 'Eli Synthetic', createdAt: now - 5 * DAY, archived: true }
];
const noteVal = (n) => ({ mapValue: { fields: {
  id: { stringValue: 'note_' + n.createdAt }, title: { stringValue: n.title },
  author: { stringValue: n.author }, body: { stringValue: '' },
  createdAt: { integerValue: String(n.createdAt) }, archived: { booleanValue: n.archived } } } });

const SIGNIN = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>`;
const NO_SW = `<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>`;
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });
  await rest('PATCH', `/v1/projects/${PROJECT}/databases/(default)/documents/worshipBoardState/state`,
    { fields: { notes: { arrayValue: { values: NOTES.map(noteVal) } },
                pages: { arrayValue: { values: [] } } } });
  console.log('seeded 5 invented notes, one of them archived\n');

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('not found'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const head = /<head[^>]*>/i.exec(t);
      body = Buffer.from(head ? t.slice(0, head.index + head[0].length) + NO_SW + t.slice(head.index + head[0].length) : NO_SW + t, 'utf8');
    }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-pin-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);

  for (const [label, w, h] of [['desktop', 1280, 1100], ['phone', 375, 820]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    watch.reset();
    await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(12000);
    await ev('window.alert=()=>{};window.confirm=()=>false;1');
    await ev("(()=>{const b=document.querySelector('#pickList .pick-t');if(b)b.click();})();1");
    await sleep(2500);

    const card = await ev("(()=>{const el=document.getElementById('pinBoardCard');return el?(el.innerText||'').replace(/\\s+/g,' ').trim():'(no card)'})()");
    console.log('\nat ' + label + ' width (' + w + 'px)');
    ok('  the pin board card is on the page', /Pin board/.test(String(card)), String(card).slice(0, 150));
    ok('  the newest notes are on it, newest first',
      String(card).indexOf('new mics') > -1 &&
      String(card).indexOf('new mics') < String(card).indexOf('music stand light'),
      String(card).slice(0, 200));
    ok('  an archived note is not', !/ARCHIVED/.test(String(card)),
      /ARCHIVED/.test(String(card)) ? 'the archived note is showing' : 'the archived one is left off');
    ok('  "Add an idea" opens the pin board ready to add',
      /stickynotes\.html\?add=1/.test(String(await ev("(document.getElementById('pinBoardCard')||{}).innerHTML||''"))),
      'stickynotes.html?add=1');
    ok('  "Open the pin board" is there', /Open the pin board/.test(String(card)));
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    if (wantShots) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      if (r.data) fs.writeFileSync(path.join(SHOTS, 'pinboard--' + label + '.png'), Buffer.from(r.data, 'base64'));
    }
  }

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
