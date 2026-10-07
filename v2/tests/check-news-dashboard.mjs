/* The news board on EGBCWorship&AV.html: can an admin still manage it?
 *
 *   node tests/check-news-dashboard.mjs        (from v2/, emulators running)
 *
 * WHAT THIS EXISTS FOR. The side-by-side comparison against the original found
 * that v2's copy of this page had quietly lost most of the news feature:
 *
 *   - the Manage button, and with it any way to edit or remove a news item
 *     that already exists. v2 could only ever add another one.
 *   - "Show until", so an item could no longer be set to disappear by itself
 *     after a day. The field, the stored value and the filter had all gone.
 *   - stripEmailHead(), so a <style> block pasted in from a newsletter went
 *     into the page and restyled the whole dashboard.
 *   - saveDashToDb() returning whether it saved, so a failed save left the
 *     change on screen with nothing but a small status chip to say otherwise.
 *
 * None of that showed up in a comparison of the source, because the page still
 * had a news feature. It showed up in what the page draws.
 *
 * Synthetic news only, written into the emulator. Every request that would
 * leave this machine is refused, apart from the CDN hosts the page needs.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9623, SERVE = 8896, FIRESTORE = 8181;
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

const ALLOWED_HOSTS = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED_HOSTS.includes(h.split(':')[0]);
};

const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const tomorrow  = new Date(Date.now() + 864e5).toISOString().slice(0, 10);

/* Three invented items: one plain, one that expired yesterday, and one
   carrying the <style> block a pasted newsletter brings with it. */
const item = (id, title, date, until, body) => ({ mapValue: { fields: {
  id: { stringValue: id }, title: { stringValue: title }, date: { stringValue: date },
  until: { stringValue: until }, body: { stringValue: body } } } });
const SEED = { fields: { newsItems: { arrayValue: { values: [
  item('900001', 'Synthetic notice one', 'Sunday 1 Feb', tomorrow, '<p>Body one</p>'),
  item('900002', 'Synthetic expired notice', 'Sunday 4 Jan', yesterday, '<p>Body two</p>'),
  item('900003', 'Synthetic pasted email', '', '', '<style>body{background:#ff0000 !important}</style><p>Body three</p>')
] } } } };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const SIGNIN = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>sign-in</title>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>`;

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n +
  (x !== undefined ? '\n          ' + String(x).slice(0, 230) : '')); };

function seed() {
  const body = JSON.stringify(SEED);
  return new Promise((res, rej) => {
    const req = http.request({ host: 'localhost', port: FIRESTORE, method: 'PATCH',
      path: '/v1/projects/egbc-worship-planner/databases/(default)/documents/portal/dashboardContent' +
            '?updateMask.fieldPaths=newsItems',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
                 Authorization: 'Bearer owner' } },
      r => { let d = ''; r.on('data', c => d += c); r.on('end', () => r.statusCode < 300 ? res() : rej(new Error(r.statusCode + ' ' + d.slice(0, 200)))); });
    req.on('error', rej); req.end(body);
  });
}

(async () => {
  await seed();
  console.log('seeded three synthetic news items\n');

  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/__signin.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(SIGNIN);
    }
    const file = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(file).startsWith(V2) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream') +
      '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-news-' + process.pid), '--no-first-run', 'about:blank'],
    { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

  let list;
  for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const refused = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  const watch = watchConsole();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    /* A page that throws is not a page that works. */
    if (watch.handle(m)) return;
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) { refused.push(u.split('?')[0]); return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); }
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
  await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
  const who = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).email || "(nobody)"');
  if (who === '(nobody)') {
    console.error('Could not sign in as ' + ACCOUNT.email + ' on the emulator.');
    server.close(); chrome.kill(); process.exit(2);
  }

  /* role=core is what turns the admin controls on. */
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/EGBCWorship%26AV.html?role=core' });
  await sleep(9000);
  await ev('window.alert=()=>{};window.prompt=()=>null;1');

  const board = await ev("JSON.stringify([...document.querySelectorAll('.news-card-title')].map(e=>e.textContent.trim()))");
  ok('an item past its "show until" day is off the board',
    board.includes('one') && board.includes('pasted') && !board.includes('expired'), board);

  const styles = await ev("document.querySelectorAll('#news-track style').length + '|' + getComputedStyle(document.body).backgroundColor");
  ok('a pasted <style> block is stripped, so it cannot restyle the page',
    String(styles).startsWith('0|') && !/255,\s*0,\s*0/.test(String(styles)), styles);

  await ev('document.body.classList.add("admin-mode");1');
  const manage = await ev("JSON.stringify({there:!!document.getElementById('news-manage-btn'),shown:!!(document.getElementById('news-manage-btn')||{}).offsetParent})");
  ok('Manage is on the news header for an admin', /"shown":true/.test(manage), manage);

  await ev('openDashboardEditor();1'); await sleep(900);
  const rows = await ev("JSON.stringify([...document.querySelectorAll('#news-admin-list .news-admin-row')].map(r=>r.querySelector('.nar-title').textContent.trim()+' | '+r.querySelector('.nar-meta').textContent.trim()))");
  ok('Manage lists the items that exist, and says which has expired',
    (JSON.parse(rows) || []).length === 3 && /Expired/.test(rows), rows);

  await ev("document.querySelector('#news-admin-list .news-admin-row button').click();1");
  await sleep(900);
  const editor = await ev("JSON.stringify({title:document.getElementById('news-modal-title').textContent,headline:document.getElementById('ne-title').value,until:document.getElementById('ne-until').value})");
  ok('Edit opens that item, "show until" and all', /Edit News/.test(editor) && /Synthetic/.test(editor), editor);

  await ev("document.getElementById('ne-until').value=" + JSON.stringify(tomorrow) + ';1');
  await ev('saveNewsItem()', true); await sleep(2500);
  const saved = await ev("JSON.stringify((dashData.newsItems||[]).map(n=>n.title+'='+(n.until||'')))");
  ok('"show until" is written to the record', saved.includes(tomorrow), saved);

  await ev('window.confirm=()=>true;1');
  await ev('openDashboardEditor();1'); await sleep(700);
  const before = JSON.parse(await ev('JSON.stringify((dashData.newsItems||[]).length)'));
  await ev("document.querySelector('#news-admin-list .news-admin-row button.nar-del').click();1");
  await sleep(2500);
  const after = JSON.parse(await ev('JSON.stringify((dashData.newsItems||[]).length)'));
  ok('Delete removes an item from the record', after === before - 1, before + ' -> ' + after);

  console.log('\nnothing left this machine. refused: ' + JSON.stringify([...new Set(refused)]).slice(0, 180));
  ok('the error console is empty', watch.errors.length === 0, watch.summary());
  console.log(R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
