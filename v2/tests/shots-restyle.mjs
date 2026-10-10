/* Before-and-after pictures of a restyle, at desktop and phone width.
 *
 *   node tests/shots-restyle.mjs <folder-to-serve> <label>
 *
 * e.g.  node tests/shots-restyle.mjs . after
 *       node tests/shots-restyle.mjs /tmp/egbc-preH/v2 before
 *
 * The "before" folder is a git worktree at the commit before the restyle, so
 * the two pictures are of the same page with nothing else different - not a
 * remembered screenshot and not a description.
 *
 * They go in v2/screenshots/restyle/<page>--<label>--<width>.png, which is
 * where RESTYLE-BRIEF asks for them.
 *
 * Synthetic data only: the same invented account every other check uses,
 * given the teams it needs so no page shows a refusal instead of itself.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { giveFullAccess } from './test-account.mjs';
import { PAGES } from './group1-screens.mjs';

const SERVE_DIR = path.resolve(process.argv[2] || '.');
const LABEL = process.argv[3] || 'after';
const OUT = path.resolve('screenshots/restyle');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9637, SERVE = 8878;
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

/* Which group to picture, in the order RESTYLE-BRIEF lists its pages.
   Pass the group as the fourth argument:

     node tests/shots-restyle.mjs . after 3

   Group 3 is three pages, not the brief's four: NEXT-BRIEF §4 takes the
   Worship Hub out of scope and overrides the Group 3 list. */
const GROUP3 = ['youthapp2.html', 'youthserviceplanner.html', 'youth-access.html'];

const GROUP2 = ['Library.html', 'batchupload.html', 'music-uploader.html',
  'EmailBuilder2.html', 'stickynotes.html', 'EGBC-PlayThrough.html',
  'EGBC-HowTo-AV.html', 'EGBC-Troubleshoot-AV.html', 'EGBC-Training-Worship.html',
  'Worshipteamcharter.html', 'Youthcharter.html', 'Coreteamcharter.html',
  'AVteamlandingpage.html', 'hub.html'];

const WIDTHS = [['desktop', 1440, 1000], ['375', 375, 812]];

const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>' +
  '<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(SERVE_DIR, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(SERVE_DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('not found'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const head = /<head[^>]*>/i.exec(t);
      body = Buffer.from(head ? t.slice(0, head.index + head[0].length) + NO_SW + t.slice(head.index + head[0].length) : NO_SW + t, 'utf8');
    }
    s.writeHead(200, { 'Content-Type': (TYPES[e] || 'application/octet-stream') + (e === '.png' || e === '.jpg' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-shots-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
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

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
  const uid = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""');
  if (!uid) { console.error('Could not sign in - seed the account first.'); server.close(); chrome.kill(); process.exit(2); }
  await giveFullAccess(uid, ACCOUNT.email);

  /* The hub is worth two pictures: its home and the admin panel §16 named,
     which is behind a button and is where most of its faults were. */
  const EXTRA = { 'hub.html': ['the admin panel', "(()=>{try{openAdmin();adminTab('people');return 1}catch(e){return String(e)}})()"] };

  const GROUP = (process.argv[4] === '3') ? GROUP3 : GROUP2;
  for (const page of GROUP) {
    if (!fs.existsSync(path.join(SERVE_DIR, page))) { console.log(page.padEnd(28) + 'not in this tree'); continue; }
    const waitFor = (PAGES.find(p => p.page === page) || {}).wait || 9000;
    for (const [wName, w, h] of WIDTHS) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
      await send('Page.navigate', { url: 'about:blank' }); await sleep(250);
      await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + encodeURI(page) });
      await sleep(waitFor);
      await ev('window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;1');
      /* The hub asks which team first; answer it, or every picture is of
         the question. */
      await ev("(()=>{const b=document.querySelector('#pickList .pick-t');if(b)b.click();})();1");
      await sleep(1200);
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      const name = page.replace(/\.html$/, '') + '--' + LABEL + '--' + wName + '.png';
      if (r.data) fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));

      if (EXTRA[page] && wName === 'desktop') {
        await ev(EXTRA[page][1]); await sleep(1800);
        const r2 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        if (r2.data) fs.writeFileSync(path.join(OUT,
          page.replace(/\.html$/, '') + '-admin--' + LABEL + '--' + wName + '.png'), Buffer.from(r2.data, 'base64'));
      }
    }
    console.log(page.padEnd(28) + 'done');
  }

  console.log('\npictures in ' + path.relative(process.cwd(), OUT));
  server.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
