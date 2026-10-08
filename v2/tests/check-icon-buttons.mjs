/* Does every control still read as a control, now the emoji have gone?
 *
 *   node tests/check-icon-buttons.mjs              every Group 1 screen
 *   node tests/check-icon-buttons.mjs Planner      one page
 *   node tests/check-icon-buttons.mjs --shots      save a picture of each screen
 *
 * WHAT THIS EXISTS FOR. A3 and A3b replaced about 165 emoji with Lucide icons.
 * On the Sunday Service Planner that went wrong three ways at once, in one
 * line of markup, and nothing caught any of them:
 *
 *   - YouTube's emoji was taken out and NO icon was put back, so the link
 *     became the bare word "YouTube";
 *   - both links were styled as coloured text with an underline on hover, so
 *     with the emoji gone neither looked like anything you could press;
 *   - the Lucide <i> on SongSelect rendered as an svg inside an <a> that was
 *     not inline-flex, inside a wrapping flex row, so the icon broke onto its
 *     own line above the words.
 *
 * Counting emoji proved nothing: the emoji really had gone. Reading the source
 * proved nothing either: an <a> with an <i> in it looks right. Only the drawn
 * page shows it, which is why this measures boxes on screen.
 *
 * THE THREE RULES, for every control on every screen:
 *   1. it has an icon, or a label you could read out loud
 *   2. it is marked out from the words around it - an icon, a border, a
 *      background, an underline, or a colour of its own. An emoji used to do
 *      that job on these controls, and when it went, nothing replaced it.
 *   3. if it has both an icon and a label, they are on the same line
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';
import { giveFullAccess } from './test-account.mjs';
import { PAGES } from './group1-screens.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9625, SERVE = 8893;
const args = process.argv.slice(2);
const wantShots = args.includes('--shots');
const only = args.find(a => !a.startsWith('--'));
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

const ALLOWED_HOSTS = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const LOCAL_SCHEME = /^(data|blob|about|chrome|chrome-extension|filesystem):/i;
const offMachine = u => {
  if (LOCAL_SCHEME.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED_HOSTS.includes(h.split(':')[0]);
};

const NO_SW = `<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>`;
const SIGNIN = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

/* ------------------------------------------------------------- the probe */
const PROBE = `(() => {
  const out = [];
  const seen = new Set();

  const px = v => parseFloat(v) || 0;
  const transparent = c => !c || c === 'transparent' || /rgba\\(\\s*0,\\s*0,\\s*0,\\s*0\\s*\\)/.test(c);

  const controls = [...document.querySelectorAll(
    'button, a[href], [onclick], [role="button"], [role="link"], input[type="button"], input[type="submit"]')];

  for (const el of controls) {
    if (!el.offsetParent) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    /* A field that happens to carry an onclick - usually to stop the click
       reaching the row behind it - is a field, not a button to look at. */
    const t0 = el.tagName.toLowerCase();
    if ((t0 === 'input' && !/^(button|submit|image)$/i.test(el.type || '')) ||
        t0 === 'textarea' || t0 === 'select') continue;
    /* A backdrop that closes what is on top of it is not a control either: it
       is the whole screen, and there is nothing to see. The tour's overlay is
       one, and it was reported eighteen times. */
    if (r.width > innerWidth * 0.9 && r.height > innerHeight * 0.8) continue;
    /* A control inside another control is the same control. */
    if (el.parentElement && el.parentElement.closest('button, a[href], [onclick], [role="button"]')) continue;

    const s = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    const icon = el.querySelector('svg, [data-lucide], img, i[class*="icon"]');
    const label = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    /* Words, as opposed to a single mark. Used for the same-line test, where
       only a label made of words can be beside an icon. */
    const readable = /[a-z0-9]/i.test(label) && label.length >= 2;

    /* 1. something to see. An icon, words, or a mark: a close button reading
          only "x" and a collapse arrow reading only a triangle are controls
          anybody recognises, they are the same on both sites, and failing
          them would bury the one that matters. The failure is a control with
          NOTHING in it. */
    const hasSomething = !!icon || label.length > 0;

    /* 2. marked out from the words around it. A <button> and an <input> are
          drawn as controls by the browser, so they always are. */
    const parent = el.parentElement;
    const ps = parent ? getComputedStyle(parent) : null;
    const bordered = px(s.borderTopWidth) + px(s.borderBottomWidth) + px(s.borderLeftWidth) + px(s.borderRightWidth) > 0;
    const filled = !transparent(s.backgroundColor) && (!ps || s.backgroundColor !== ps.backgroundColor);
    const underlined = /underline/.test(s.textDecorationLine || '');
    const ownColour = ps ? s.color !== ps.color : false;
    const nativeControl = tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea';
    /* Colour on its own does NOT count. That is the whole of the fault Martin
       found: with the emoji gone, "YouTube" was teal 11px text sitting beside
       other teal text, with an underline that only appears once the pointer is
       already on it - and on a phone there is no pointer. The emoji had been
       doing the work of saying "this is a thing you press".
       But only where the control sits AMONG other things, shrink-to-fit in a
       row. A control that fills its row - a card's title, a cell in the rota
       grid, a row of a suggestion list - is marked out by where it is, and it
       is drawn exactly as the original draws it. Flagging those buried the one
       that mattered under 37 that did not. */
    const pr = parent ? parent.getBoundingClientRect() : null;
    const sitsAmongOthers = pr ? r.width < pr.width * 0.6 : false;
    const marked = nativeControl || !!icon || bordered || filled || underlined || !sitsAmongOthers;

    /* 3. icon and label on the same line. Compared as boxes: find the first
          text node's box and see whether the icon's box overlaps it
          vertically. An icon that has broken onto its own line does not. */
    /* Only where the icon was meant to sit BESIDE the words. A card puts its
       icon above its title on purpose - CoreTeamApp's four home tiles and the
       upload drop zone are all like that, and they were reported 57 times
       between them. The shape that broke on the Sunday planner was an inline
       link, or a row, whose icon wrapped. */
    const laidOutInARow = /^(inline|inline-block|inline-flex)$/.test(s.display) ||
      ((s.display === 'flex' || s.display === 'inline-flex') && !/column/.test(s.flexDirection));
    let sameLine = true, lineDetail = '';
    if (icon && readable && laidOutInARow) {
      const ir = icon.getBoundingClientRect();
      let tr = null;
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        if (!n.nodeValue || !n.nodeValue.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = range.getClientRects();
        if (rects.length && rects[0].height > 0) { tr = rects[0]; break; }
      }
      if (tr) {
        const overlap = Math.min(ir.bottom, tr.bottom) - Math.max(ir.top, tr.top);
        sameLine = overlap > Math.min(ir.height, tr.height) * 0.4;
        if (!sameLine) lineDetail = 'icon ' + Math.round(ir.top) + '-' + Math.round(ir.bottom) +
          ', text ' + Math.round(tr.top) + '-' + Math.round(tr.bottom);
      }
    }

    if (hasSomething && marked && sameLine) continue;

    const key = tag + '|' + (el.id || '') + '|' + label.slice(0, 40) + '|' +
      (el.getAttribute('onclick') || el.getAttribute('href') || '').slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      what: tag + (el.id ? '#' + el.id : '') + ' "' + label.slice(0, 36) + '"',
      wired: (el.getAttribute('onclick') || el.getAttribute('href') || '').slice(0, 50),
      noLabel: !hasSomething,
      notMarked: !marked,
      iconOnItsOwnLine: !sameLine,
      detail: lineDetail,
      box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
    });
  }
  return JSON.stringify(out);
})()`;

/* Looked at, and judged not to be a fault. Named one at a time with the
 * reason, so this stays a short list somebody can argue with rather than a
 * quiet way of passing.
 *
 * NOT judged by "is it the same as the original": "Upload Song" was drawn
 * exactly as the original drew it, minus its emoji, and it was a real fault.
 * Sameness is not innocence.
 */
const JUDGED = [
  { page: 'EGBC-PlayThrough.html', label: 'Training',
    why: 'the unselected half of a two-tab pair - "Play Through" beside it is filled in, which is what says which one you are on. Identical to the original, and the original never had an emoji on it.' }
];
const judgedFor = (page, what) =>
  (JUDGED.find(j => j.page === page && String(what).includes('"' + j.label)) || {}).why;

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 260) : '')); };

/* ------------------------------------- one emoji at a time, against source */
/* The rendered pass above asks "does this control read as a control". This
 * pass asks the narrower question Martin asked: FOR EVERY EMOJI A3 TOOK OUT,
 * did the control it was in keep an icon or a label?
 *
 * Done on the markup of both copies, because a control that only appears after
 * you type a song title is on no screen until you do - and those were exactly
 * the three that broke. Source finds them wherever they are; the rendered pass
 * then confirms the ones that are reachable.
 */
const ROOT = path.resolve('..');
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F0FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2190}-\u{21FF}]/u;
const CONTROL = /<(a|button)\b([^>]*)>([\s\S]{0,300}?)<\/\1>/gi;

const wiringOf = (attrs) => {
  const m = /(?:href|onclick)\s*=\s*"([^"]*)"/i.exec(attrs) || /(?:href|onclick)\s*=\s*'([^']*)'/i.exec(attrs);
  return m ? m[1].trim() : '';
};
const textOf = (inner) => inner.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ')
  .replace(EMOJI, ' ').replace(/\s+/g, ' ').trim();
const hasIconMarkup = (inner) => /<i\b|<svg\b|<img\b|data-lucide/i.test(inner);

function emojiControlsLost() {
  const lost = [];
  let looked = 0;
  const pages = fs.readdirSync(ROOT).filter(f => f.toLowerCase().endsWith('.html'))
    .filter(f => fs.existsSync(path.join(V2, f))).sort();

  for (const page of pages) {
    if (only && !page.toLowerCase().includes(only.toLowerCase())) continue;
    const o = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const v = fs.readFileSync(path.join(V2, page), 'utf8');

    CONTROL.lastIndex = 0;
    let m;
    while ((m = CONTROL.exec(o))) {
      const [, tag, attrs, inner] = m;
      if (!EMOJI.test(inner)) continue;          /* only controls that had one */
      const wiring = wiringOf(attrs);
      const label = textOf(inner);
      if (!wiring && !label) continue;
      looked++;

      /* The same control in v2, found by what it is wired to - which the
         restyle did not change - or by its words where there is no wiring. */
      const needle = wiring || label;
      if (!needle || !v.includes(needle)) continue;   /* gone or renamed: that is the comparison's job, not this one */
      const at = v.indexOf(needle);
      const open = v.lastIndexOf('<' + tag, at);
      if (open === -1) continue;
      const close = v.indexOf('</' + tag + '>', at);
      const v2markup = close === -1 ? v.slice(open, at + 400) : v.slice(open, close);
      const v2inner = v2markup.replace(/^<[^>]*>/, '');

      const keptEmoji = EMOJI.test(v2inner);
      const icon = hasIconMarkup(v2inner);
      const words = textOf(v2inner);
      if (keptEmoji || icon || words.length >= 2) continue;

      lost.push({ page, label: label || '(no words)', wiring: needle.slice(0, 60),
        had: (inner.match(EMOJI) || [''])[0], now: words || '(nothing)' });
    }
  }
  return { lost, looked };
}

/* Is this the page, or the door? EGBCAuth._blockPage() marks the body it
   replaces. This check walks the same screens the style check does, and it
   would count the refusal card's own "Back to hub" and "Sign out" as the
   page's controls - or find no fault at all on a page it never opened,
   which is how a clean sweep came to mean nothing (A-023). */
const REFUSED_PROBE = "(function(){var b=document.body;if(!b)return '';"
  + "if(b.getAttribute('data-egbc-blocked'))return b.getAttribute('data-egbc-blocked');"
  + "var h=b.querySelector('h1');var t=(h&&h.textContent||'').trim();if(!t)return '';"
  + "var shut=/cannot|not allowed|no access|members only|team only|not signed in/i.test(t);"
  + "return (shut && b.querySelectorAll('*').length < 40) ? t : '';})()";
const turnedAway = [];

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });

  const { lost, looked } = emojiControlsLost();
  console.log('controls that had an emoji in the original: ' + looked +
              '   left with nothing in v2: ' + lost.length);
  for (const l of lost) console.log('    ' + l.page + '  "' + l.label + '"  had ' + l.had +
    ', now ' + l.now + '   [' + l.wiring + ']');
  console.log('');
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
    res.writeHead(200, { 'Content-Type': (TYPES[ext] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    let body = fs.readFileSync(file);
    if (ext === '.html') {
      const t = body.toString('utf8');
      const head = /<head[^>]*>/i.exec(t);
      body = Buffer.from(head ? t.slice(0, head.index + head[0].length) + NO_SW + t.slice(head.index + head[0].length) : NO_SW + t, 'utf8');
    }
    res.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-icons-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list;
  for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 950, deviceScaleFactor: 1, mobile: false });
  const ev = async x => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
  await sleep(4500);
  await send('Runtime.evaluate', { awaitPromise: true, expression:
    'firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')' });
  const uid = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""');
  /* Ask for an account that can open every page, rather than hoping whichever
     check ran last left one. Six pages used to go unwalked behind a quiet
     zero because check-menu.mjs had left this account as a Worship member
     (A-023). */
  if (uid) await giveFullAccess(uid, ACCOUNT.email);
  const who = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).email || "(nobody)"');
  if (who === '(nobody)') {
    console.error('Could not sign in as ' + ACCOUNT.email + '. Signed out, most of these screens\n' +
                  'never open and every one would report no controls at all.');
    server.close(); chrome.kill(); process.exit(2);
  }
  console.log('signed in as ' + who);

  const faults = [];
  let controlsSeen = 0;
  for (const P of PAGES) {
    if (only && !P.page.toLowerCase().includes(only.toLowerCase())) continue;
    watch.reset();
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + encodeURI(P.page) });
    await sleep(P.wait);
    await ev('window.confirm=()=>false;window.alert=()=>{};window.prompt=()=>null;1');
    if (P.first) { await ev(P.first); await sleep(1200); }
    console.log('\n' + P.page);
    const refused = await ev(REFUSED_PROBE);
    if (refused) {
      console.log('  TURNED AWAY - not walked: ' + JSON.stringify(String(refused).slice(0, 70)));
      turnedAway.push({ page: P.page, said: String(refused).slice(0, 100) });
      continue;
    }

    for (const [name, open] of P.states) {
      await ev(open);
      await sleep(1100);
      const n = await ev("document.querySelectorAll('button, a[href], [onclick], [role=\"button\"]').length");
      controlsSeen += Number(n) || 0;
      const raw = await ev(PROBE);
      let bad;
      try { bad = JSON.parse(raw || '[]'); }
      catch { console.log('  ' + name.padEnd(24) + '  probe failed: ' + String(raw).slice(0, 90)); continue; }
      console.log('  ' + name.padEnd(24) + String(bad.length).padStart(4) + (bad.length ? '  <-' : ''));
      for (const b of bad) {
        const why = [b.noLabel ? 'nothing to read' : '', b.notMarked ? 'reads as plain text' : '',
          b.iconOnItsOwnLine ? 'icon on its own line' : ''].filter(Boolean).join(', ');
        const judged = judgedFor(P.page, b.what);
        console.log('        ' + b.what + '  - ' + why + (b.detail ? ' (' + b.detail + ')' : '') +
          (judged ? '\n            looked at and left: ' + judged : ''));
        faults.push({ page: P.page, state: name, ...b, why, judged: judged || null });
      }
      if (wantShots) {
        const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
        if (r.data) fs.writeFileSync(path.join(SHOTS,
          (P.page + '--' + name).replace(/[^a-z0-9]+/gi, '-') + '.png'), Buffer.from(r.data, 'base64'));
      }
    }
    if (watch.errors.length) console.log('  console: ' + watch.summary());
  }

  const open = faults.filter(f => !f.judged);
  console.log('\ncontrols looked at: ' + controlsSeen + '   not reading as controls: ' + open.length +
    (faults.length - open.length ? '   (plus ' + (faults.length - open.length) + ' looked at and left, see above)' : ''));
  ok('every control has an icon or a label', !open.some(f => f.noLabel),
    open.filter(f => f.noLabel).map(f => f.page + ' ' + f.what).slice(0, 6).join(' | ') || 'all of them do');
  ok('every control is marked out from the words around it', !open.some(f => f.notMarked),
    open.filter(f => f.notMarked).map(f => f.page + ' ' + f.what).slice(0, 6).join(' | ') || 'all of them are');
  ok('no icon has broken onto its own line', !open.some(f => f.iconOnItsOwnLine),
    open.filter(f => f.iconOnItsOwnLine).map(f => f.page + ' ' + f.what).slice(0, 6).join(' | ') || 'none has');
  ok('every control that had an emoji still has an icon or words',
    lost.length === 0,
    lost.map(l => l.page + ' "' + l.label + '"').slice(0, 6).join(' | ') || looked + ' controls checked');

  fs.writeFileSync(path.join(V2, 'tests', 'icons-last.json'), JSON.stringify(faults, null, 1));
  console.log(R.filter(Boolean).length + '/' + R.length + ' passed   (detail: tests/icons-last.json)');
  server.close(); chrome.kill();
  if (turnedAway.length) {
    console.log('');
    console.log('PAGES THIS RUN NEVER WALKED. Nothing above is about them:');
    turnedAway.forEach(x => console.log('  ' + x.page + '  - ' + x.said));
  }
  process.exit(open.length || lost.length || turnedAway.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
