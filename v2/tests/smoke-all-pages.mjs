/* Does every page still load, render, and keep the control it cannot work
 * without?
 *
 *   node tests/smoke-all-pages.mjs            (from v2/, emulators running)
 *
 * This is the cheap check to run after anything shared changes - the theme,
 * egbc-ui.js, egbc-auth.js, egbc-db.js, a rules deploy. It is what caught the
 * theme engine blanking a page, and the stray `async` keyword in hub-app.js
 * that silently stopped the rest of the file running.
 *
 * Four things per page, each of which has failed at least once for real:
 *   loads and renders  - the page is visible and has text on it. A page that
 *                        throws during start-up still serves 200.
 *   no uncaught errors - an exception during start-up leaves half a page,
 *                        which looks fine until the missing half is needed.
 *   is on Inter        - DESIGN.md. A page that missed the theme shows it here.
 *   keeps its controls - the one selector the page is useless without.
 *
 * Live Firebase is refused throughout, as a backstop: a page served from
 * localhost should be on the emulator, and if one is not, this says so rather
 * than quietly reading the church's real data.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9621, SERVE = 8895;
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

/* page, and the selector it cannot work without */
const PAGES = [
  ['hub.html', '.card, #toolList, .top'],
  ['whatson.html', '.ev, .card, .wrap'],
  ['signup.html?event=cev_quiz', '.card, h1'],
  ['events-admin.html', '.card, #list'],
  ['places-admin.html', 'input, button'],
  ['meeting.html', 'button, .card, input'],
  ['view-only-rota.html', 'table, .sk, #rotaTable, [id*="rota"]'],
  ['Planner.html', 'select, button'],
  ['CoreTeamApp.html', '#screen-home, .home-tile, .tile-service'],
  ['SundayServicePlanner.html', 'input, select, button'],
  ['youthserviceplanner.html', 'input, select, button'],
  ['youthapp2.html', 'button, div'],
  ['addressbook.html', 'input, button'],
  ['resources.html', 'input, button'],
  ['videos.html', 'button, a'],
  ['index.html', 'button, div'],
  ['login.html', 'input, button'],
  ['data-tools.html', 'button'],
  ['stickynotes.html', 'button, div'],
  ['Library.html', 'div'],
  ['music-uploader.html', 'button, input'],
  ['inventory-system-2.html', 'div, button'],
  ['schematic.html', 'div, button'],
  ['MonitorStageMap.html', 'div, button'],
  ['EGBC-HowTo-AV.html', 'div'],
  ['EGBC-PlayThrough.html', 'div'],
  ['EGBC-Troubleshoot-AV.html', 'div'],
  ['EGBC-Training-Worship.html', 'div'],
  ['trainingportalhub.html', 'div, a'],
  ['hubresources.html', 'div, a'],
  ['birthday.html', 'div, button'],
  ['youth-access.html', 'div, input']
];

const SIGNIN = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>sign-in</title>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>`;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

/* ONLY these hosts may be reached. An ALLOWLIST: the blocklist that was here
   first did not hold, and real church data came back through a host it did not
   name. A list of hosts to refuse has to be complete to work and never is.
   Matched on HOST, never on the whole url: the Auth emulator answers on
   localhost:9099/identitytoolkit.googleapis.com/... , so a substring match on
   a live hostname refuses the emulator's own sign-in. */
const ALLOWED_HOSTS = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const LOCAL_SCHEME = /^(data|blob|about|chrome|chrome-extension|filesystem):/i;
const isLive = u => {
  if (LOCAL_SCHEME.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED_HOSTS.includes(h.split(':')[0]);
};
/* Reading or writing the church's records, as opposed to fetching a picture
   or an embedded video. This is what makes a page's connection a fault. */
const DATA_HOST = /\/\/(firestore\.googleapis\.com|[^/]*\.firebaseio\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|[^/]*\.firebasedatabase\.app|[^/]*\.cloudfunctions\.net|[^/]*\.run\.app|api\.resend\.com)\//i;

/* No service workers. A service worker is a separate context: its own fetches
   are not intercepted, so the refusal above cannot see them, and its scope is
   the whole origin - so one page registering ./sw.js can serve every other
   page on that origin. That is how live data got past the refusal in the
   side-by-side comparison. Nothing here is about offline caching, so the
   registration is stubbed. */
const NO_SW = `<script>/* injected by tests/smoke-all-pages.mjs */
(function () {
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register = function () { return Promise.resolve(undefined); };
      navigator.serviceWorker.getRegistrations().then(function (rs) {
        rs.forEach(function (r) { r.unregister(); });
      }).catch(function () {});
    }
  } catch (e) {}
})();
</script>`;
function stripServiceWorker(html) {
  const head = /<head[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + NO_SW + html.slice(head.index + head[0].length);
  return NO_SW + html;
}

const R = [];
const ok = (n, v, x) => { R.push(v); console.log((v ? '  PASS  ' : '  FAIL  ') + n + (x ? '  [' + x + ']' : '')); };

(async () => {
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
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': (TYPES[ext] || 'application/octet-stream') +
      '; charset=utf-8', 'Cache-Control': 'no-store' });
    let body = fs.readFileSync(file);
    if (ext === '.html') body = Buffer.from(stripServiceWorker(body.toString('utf8')), 'utf8');
    res.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-smoke'), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

  let list;
  for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); let logs = []; const reachedLive = [];
  let nowPage = '(start-up)';
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push(String((d.exception && d.exception.description) || d.text || '').split('\n')[0].slice(0, 100));
    }
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (isLive(u)) {
        /* Only a DATA api counts. The pages have always linked their pictures
           out of the storage bucket and embedded the odd video, and reporting
           those as "reading the church's real data" made the warning useless:
           it named twenty-nine pages, nearly all of them for a logo. */
        if (DATA_HOST.test(String(u))) reachedLive.push(nowPage + ' -> ' + u.split('/')[2]);
        return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      }
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable');
  /* Never read a cached page: a check that quietly tests the previous version
     of a file is worse than no check. */
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    return r.result && r.result.value;
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
  await sleep(4500);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
  const who = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).email || "(nobody)"');
  if (who === '(nobody)') {
    console.error('Could not sign in as ' + ACCOUNT.email + ' on the emulator. Every page would\n' +
                  'bounce to login and the run would prove nothing. Seed the account and try again.');
    server.close(); chrome.kill(); process.exit(2);
  }
  console.log('signed in as ' + who + '\n');

  for (const [page, sel] of PAGES) {
    logs = []; nowPage = page;
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page });
    await sleep(7000);
    /* CoreTeamApp opens on a chooser; the home screen is behind it. */
    await ev("(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>/^Core Team$/.test((e.textContent||'').trim()));if(b)b.click();})()");
    await sleep(1500);
    const info = JSON.parse(await ev('JSON.stringify({' +
      'path:location.pathname,' +
      'vis:getComputedStyle(document.body).visibility,' +
      "chars:(document.body.innerText||'').trim().length," +
      'font:getComputedStyle(document.body).fontFamily,' +
      'ctrl:document.querySelectorAll(' + JSON.stringify(sel) + ').length' +
      '})') || '{}');
    const name = page.padEnd(28);
    /* login.html sends somebody already signed in to the hub, which is the
       whole point of it. Landing there is a pass, not a failure. */
    const landedRight = info.path.toLowerCase().includes(page.toLowerCase().split('?')[0].slice(0, 8)) ||
      (page === 'login.html' && /hub\.html/.test(info.path));
    ok(name + ' loads and renders', info.vis === 'visible' && info.chars > 60 && landedRight,
      info.chars + ' chars' + (landedRight && page === 'login.html' ? ', redirected to the hub as it should' : ''));
    ok(name + ' no uncaught errors', logs.length === 0, logs.slice(0, 1).join('') || 'clean');
    ok(name + ' is on Inter', /Inter/.test(info.font || ''), (info.font || '').slice(0, 42));
    ok(name + ' keeps its controls', info.ctrl > 0, info.ctrl + ' matched');
  }

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  if (reachedLive.length) {
    console.log('\nThese pages tried to reach LIVE Firebase from localhost, so they are not on');
    console.log('the emulator and development on them reads the church\'s real data:');
    for (const p of [...new Set(reachedLive)]) console.log('  ' + p);
  }
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
