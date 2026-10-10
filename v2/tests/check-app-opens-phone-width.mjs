/* Every page the app opens, at 375px. Does it fit?
 *
 *   node tests/check-app-opens-phone-width.mjs           (from v2/, emulators running)
 *   node tests/check-app-opens-phone-width.mjs --shots   (and save the pictures)
 *
 * MARTIN, 10 OCTOBER 2026: "it isnt even phone width. It is the desktop
 * version of the website in places." APP-DESIGN-BRIEF §7d A2.
 *
 * The app's rows mostly say `open:somepage.html`, so a tap leaves the app
 * and lands on a website page. This opens every one of those targets on a
 * 375px screen and measures three things that decide whether it can stay:
 *
 *   1. does it scroll sideways - the plain test of "not phone width"
 *   2. what is the widest thing on it, so the answer names the culprit
 *   3. does it carry the website's top bar and Menu, which app mode (§7d A)
 *      will have to take off
 *
 * IT FAILS THE BUILD on sideways scroll, which is what §7d A2 asks for. A
 * page that cannot fit is not opened from the app: it gets a native screen
 * or a "this one is easier on a computer" row.
 *
 * The list of targets is READ OUT OF app.html, not written here, so a row
 * added tomorrow is measured tomorrow rather than whenever somebody
 * remembers to update a list.
 *
 * Synthetic account throughout.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { giveFullAccess } from './test-account.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'screenshots', 'app-width');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9699, SERVE = 8915;
const wantShots = process.argv.includes('--shots');
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

/* 375px is the brief's number: an iPhone SE and the narrow end of what
   people actually hold. A page that fits 375 fits everything wider. */
const WIDTH = 375, HEIGHT = 812;
/* A couple of pixels of slop, because a 1px border or a rounded shadow can
   push scrollWidth over without anything being wrong on screen. */
const SLOP = 4;

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
  + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : ''))); };

/* THE TARGETS, READ OFF THE APP. */
function targets() {
  const seen = new Set();
  for (const f of ['app.html', 'egbc-app.js']) {
    const t = fs.readFileSync(path.join(V2, f), 'utf8');
    for (const m of t.matchAll(/open:([A-Za-z0-9._%&=?-]+)/g)) {
      const page = m[1].split('?')[0];
      if (page.endsWith('.html') && fs.existsSync(path.join(V2, page))) seen.add(page);
    }
  }
  return [...seen].sort();
}

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });
  const PAGES = targets();
  console.log('the app opens ' + PAGES.length + ' pages. Measuring each at ' + WIDTH + 'px.\n');

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
      : e === '.png' ? 'image/png' : e === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-width-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
    + JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ').catch(function(){})', true);
  const uid = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""');
  if (!uid) { console.error('Could not sign in as ' + ACCOUNT.email); server.close(); chrome.kill(); process.exit(2); }
  /* Every page must render itself rather than a refusal, or the measurement
     is of the refusal card (A-023). */
  await giveFullAccess(uid, ACCOUNT.email);

  /* A real phone, not a narrow desktop window: mobile:true and a device
     pixel ratio, so media queries and viewport units behave as they do on
     the phone in Martin's hand. */
  await send('Emulation.setDeviceMetricsOverride',
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });

  const MEASURE = `(() => {
    const d = document.documentElement, b = document.body;
    const over = Math.max(d.scrollWidth, b ? b.scrollWidth : 0) - d.clientWidth;
    /* NAME THE CULPRIT. "It scrolls sideways" is not actionable; "the
       table in #rota is 920px" is. */
    let worst = null, worstW = 0;
    if (b) for (const el of b.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (!r.width || r.width <= d.clientWidth + 4) continue;
      if (r.width > worstW) {
        worstW = Math.round(r.width);
        worst = el.tagName.toLowerCase()
          + (el.id ? '#' + el.id : '')
          + (el.className && typeof el.className === 'string' && el.className.trim()
              ? '.' + el.className.trim().split(/\\s+/)[0] : '');
      }
    }
    return JSON.stringify({
      over: Math.round(over),
      client: d.clientWidth,
      worst: worst, worstW: worstW,
      /* What app mode will have to take off. THE IDS ARE READ OFF
         egbc-shell.js, not guessed: the first version of this looked for
         ".egbc-bar" and "#egbcBar", neither of which exists, and reported
         that 0 of 25 pages draw the website bar - when every one of them
         does. A detector that finds nothing looks exactly like a clean
         result. */
      websiteBar: !!document.getElementById('egbc-bar'),
      menu: !!document.querySelector('.egbc-nav-btn, #egbc-nav-list, .egbc-nav-list'),
      /* Desktop-ness that does NOT scroll sideways, which is most of what
         Martin is seeing: a page can fit and still be the desktop layout
         squeezed. The widest table, and the smallest text actually on
         screen, are the two that give it away. */
      widestTable: (() => { let w = 0;
        for (const t of document.querySelectorAll('table')) w = Math.max(w, Math.round(t.getBoundingClientRect().width));
        return w; })(),
      /* CONTENT CLIPPED INSIDE ITS BOX, which no amount of page-level
         scrollWidth will ever show. The address book at 375px reports
         "fits" and shows "adult.leader.secret@exampl" - the email cut off
         mid-word, and the Household menu reading "None / Ne". That is
         precisely the "desktop version in places" Martin saw, and the
         first version of this check could not see it at all. */
      clipped: (() => { const out = [];
        /* NOT THE WEBSITE BAR. Its page title is ellipsised on purpose, so
           the first version of this reported "Play-Through…",
           "Address Book…" and five more as faults - deliberate truncation
           in chrome that app mode removes anyway - while missing the
           actual clipping it was written for, the address book's
           "adult.leader.secret@exampl". A detector whose loudest results
           are all correct behaviour is worse than none. */
        const chrome = document.getElementById('egbc-bar');
        const edge = document.documentElement.clientWidth;
        for (const el of document.querySelectorAll('td,th,div,span,p,a,select,option,li,b,small,input')) {
          if (chrome && chrome.contains(el)) continue;
          if (!el.offsetParent || el.children.length) continue;
          const txt = (el.textContent || el.value || '').trim();
          if (txt.length < 6) continue;
          /* PAST THE EDGE OF THE SCREEN. Comparing an element's own
             scrollWidth with its clientWidth found nothing, twice, because
             the address book's emails are not clipped by their own box -
             they sit inside a 560px table that an ancestor clips, so the
             element is simply positioned off the screen. What a person
             sees is text that runs past the right-hand edge, so that is
             what to measure. */
          const r = el.getBoundingClientRect();
          if (r.width && r.right > edge + 2) out.push(txt.slice(0, 28));
        }
        return out.slice(0, 5); })(),
      tinyText: (() => { let n = 0;
        for (const el of document.querySelectorAll('p,td,th,li,span,div,label,a')) {
          if (!el.offsetParent || el.children.length) continue;
          if (!(el.textContent || '').trim()) continue;
          if ((parseFloat(getComputedStyle(el).fontSize) || 16) < 12) n++;
        }
        return n; })(),
      blocked: b ? (b.getAttribute('data-egbc-blocked') || '') : '(no body)',
      title: (document.title || '').slice(0, 60)
    });
  })()`;

  const rows = [];
  for (const page of PAGES) {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page });
    await sleep(page === 'hub.html' || page === 'meeting.html' ? 11000 : 8000);
    await ev('window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;1');
    let m;
    try { m = JSON.parse(String(await ev(MEASURE))); }
    catch { m = { over: -1, worst: '(could not measure)', blocked: '', title: '' }; }
    rows.push({ page, ...m });
    const verdict = m.blocked ? 'blocked: ' + m.blocked
      : m.over > SLOP ? 'OVER by ' + m.over + 'px  (' + (m.worst || '?') + ' is ' + m.worstW + 'px)'
      : 'fits';
    console.log('  ' + page.padEnd(30) + verdict);
    if (wantShots) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      if (r.data) fs.writeFileSync(path.join(SHOTS, page.replace(/\.html$/, '') + '--375.png'),
        Buffer.from(r.data, 'base64'));
    }
  }

  /* ---- the three lists §7d A2 asks for ------------------------------ */
  const over = rows.filter(r => r.over > SLOP);
  const fits = rows.filter(r => r.over >= 0 && r.over <= SLOP && !r.blocked);
  const odd = rows.filter(r => r.blocked || r.over < 0);

  console.log('\n--- 1. PHONE-READY: keep, in app mode (' + fits.length + ') ---');
  fits.forEach(r => console.log('  ' + r.page));
  console.log('\n--- NOT PHONE WIDTH at 375px (' + over.length + ') ---');
  over.forEach(r => console.log('  ' + r.page.padEnd(30) + '+' + r.over + 'px   widest: '
    + (r.worst || '?') + ' ' + r.worstW + 'px'));
  if (odd.length) {
    console.log('\n--- could not be measured (' + odd.length + ') ---');
    odd.forEach(r => console.log('  ' + r.page.padEnd(30) + (r.blocked || 'no measurement')));
  }

  console.log('\nthe website chrome app mode has to take off');
  const withBar = rows.filter(r => r.websiteBar || r.menu);
  console.log('  ' + withBar.length + ' of ' + rows.length + ' draw the website bar or Menu');
  if (withBar.length && withBar.length < rows.length) {
    console.log('  the ones that do not: '
      + rows.filter(r => !r.websiteBar && !r.menu).map(r => r.page).join(', '));
  }

  /* FITTING IS NOT THE SAME AS LOOKING RIGHT, and this is the gap between
     what a measurement can say and what Martin can see. A page squeezed
     into 375px without scrolling is still the desktop layout. */
  console.log('\nfits, but text runs PAST THE RIGHT EDGE of the screen');
  const clip = rows.filter(r => (r.clipped || []).length);
  if (!clip.length) console.log('  none');
  clip.forEach(r => console.log('  ' + r.page.padEnd(30)
    + (r.clipped || []).map(t => '"' + t + '…"').join('  ')));

  console.log('\nfits, but may still read as the desktop page');
  const squeezed = rows.filter(r => r.over >= 0 && r.over <= SLOP
    && ((r.widestTable || 0) > 330 || (r.tinyText || 0) > 8));
  if (!squeezed.length) console.log('  none by these two signs');
  squeezed.forEach(r => console.log('  ' + r.page.padEnd(30)
    + (r.widestTable > 330 ? 'a ' + r.widestTable + 'px table  ' : '')
    + (r.tinyText > 8 ? r.tinyText + ' bits of text under 12px' : '')));
  console.log('  (signs, not a verdict - part C is Martin looking at the pictures)');

  fs.writeFileSync(path.join(V2, 'tests', 'app-width-last.json'), JSON.stringify(rows, null, 1));

  console.log('');
  ok('every page the app opens fits a 375px screen',
    over.length === 0, over.map(r => r.page + ' +' + r.over + 'px').join(', '));
  ok('every page the app opens could be measured at all',
    odd.length === 0, odd.map(r => r.page + ' ' + (r.blocked || '')).join(', '));

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed'
    + '   (detail: tests/app-width-last.json' + (wantShots ? ', pictures in screenshots/app-width' : '') + ')');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
