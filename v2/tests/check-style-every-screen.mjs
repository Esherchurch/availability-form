/* Does the drawn page obey DESIGN.md - on every screen, not just the first?
 *
 *   node tests/check-style-every-screen.mjs              every page
 *   node tests/check-style-every-screen.mjs Planner      one page
 *
 * (from v2/, with the emulators running)
 *
 * WHY "EVERY SCREEN" IS IN THE NAME. The first version of this measured each
 * page as it loaded and reported zero. That was true of the opening screen and
 * false of the page: CoreTeamApp alone keeps five more screens and a dozen
 * sheets behind buttons, and every one of them was still 11px, 700 weight and
 * capsule-shaped. R-014 carries the rule for the remaining groups.
 *
 * WHAT COUNTS AS WRONG, from DESIGN.md:
 *   - a weight of 700 or more on anything but an h1
 *   - text-transform: uppercase
 *   - a font size under 12px
 *   - a control with a radius of 20px or more - a pill
 *   - Montserrat anywhere
 *
 * Measured on the rendered page, because page CSS and the theming engine in
 * egbc-ui.js both have a say and only the result settles it.
 *
 * Each state opens itself and is measured on its own, and anything with no
 * offsetParent is skipped, so a sheet that is still shut contributes nothing
 * to the screen in front of it. Getting that wrong inflated a count from 290
 * to 579 by measuring every sheet over whatever screen was open.
 *
 * NOTHING THAT SENDS IS EVER PRESSED. The send panel is revealed by setting
 * its display, never by clicking the button that emails the whole team, and
 * confirm/alert/prompt are stubbed so anything that asks before acting is
 * cancelled. A measurement has no business sending email.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9622, SERVE = 8897;
const only = process.argv[2];
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

const PROBE = `(() => {
  const out = [], seen = {};
  document.querySelectorAll('button,a,input,select,textarea,label,div,span,h1,h2,h3,h4,p,td,th,li').forEach(e => {
    if (!e.offsetParent && e.tagName !== 'BODY') return;
    const s = getComputedStyle(e);
    const w = parseInt(s.fontWeight, 10) || 400;
    const px = parseFloat(s.fontSize) || 0;
    const rad = parseFloat(s.borderTopLeftRadius) || 0;
    const ctrl = /^(BUTTON|INPUT|SELECT|TEXTAREA|LABEL)$/.test(e.tagName);
    const pill = ctrl && rad >= 20 && e.offsetHeight > 0 && e.offsetHeight < 60;
    const leaf = e.children.length === 0 && (e.textContent || '').trim();
    if (!leaf && !ctrl) return;
    const bad = [];
    if (w >= 700 && !/^H1$/.test(e.tagName)) bad.push('w' + w);
    if (s.textTransform === 'uppercase') bad.push('CAPS');
    if (px && px < 12) bad.push(px + 'px');
    if (pill) bad.push('pill' + Math.round(rad));
    if (/Montserrat/.test(s.fontFamily)) bad.push('Montserrat');
    if (!bad.length) return;
    const key = e.tagName + '|' + bad.join(',');
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] <= 1) out.push(e.tagName.toLowerCase() + ' "' +
      (e.textContent || e.placeholder || '').trim().slice(0, 18) + '" ' + bad.join(' '));
  });
  return JSON.stringify({ n: Object.keys(seen).reduce((a, k) => a + seen[k], 0), eg: out.slice(0, 6) });
})()`;

const SHUT = "(()=>{document.querySelectorAll('.modal,.sheet,[id^=modal-]').forEach(m=>m.classList.remove('open'));try{openSection('home')}catch(e){}})()";

const PAGES = [
  { page: 'CoreTeamApp.html', wait: 9000,
    first: "(()=>{try{if(typeof endTour==='function')endTour()}catch(e){}" +
           "const o=document.getElementById('tour-overlay');if(o)o.classList.remove('active');})()",
    states: [
      ['home', "openSection('home')"],
      ['service planner', "openSection('service')"],
      ['service detail', "(()=>{const c=document.querySelector('#service-list .service-card,#service-list [onclick]');if(c)c.click();else openSection('service-detail')})()"],
      ['rota', "openSection('rota')"],
      ['meetings', "openSection('meetings')"],
      ['email compiler', "openSection('email')"],
      ['sheet: role', SHUT + ";openModal('modal-role-sheet')"],
      ['sheet: availability', SHUT + ";openModal('modal-avail-sheet')"],
      ['sheet: add role', SHUT + ";openModal('modal-add-role-sheet')"],
      ['sheet: drafts', SHUT + ";openModal('modal-drafts')"],
      ['sheet: mailing list', SHUT + ";openModal('modal-mailing')"],
      ['modal: new event', SHUT + ";openModal('modal-new-event')"],
      ['modal: new service', SHUT + ";openModal('modal-new-service')"],
      ['modal: song', SHUT + ";openModal('modal-song')"],
      ['modal: add item', SHUT + ";openModal('modal-add-item')"],
      ['modal: email team', SHUT + ";openModal('modal-email-team')"],
      ['modal: who are you', SHUT + ";openModal('modal-who')"],
      ['modal: confirm', SHUT + ";openModal('modal-confirm')"]
    ] },
  { page: 'Planner.html', wait: 10000, states: [
      ['main', '1'],
      ['archived terms', "(()=>{const a=[...document.querySelectorAll('button')].find(b=>/Restore/i.test(b.textContent));return a?'shown':'none seeded'})()"],
      /* REVEALED, never pressed: the button that opens this panel emails the
         whole team. */
      ['send panel', "(()=>{let n=0;document.querySelectorAll('[id*=odal],[id*=istribution],[id*=send]').forEach(m=>{if(m.style){m.style.display='block';m.classList.remove('hidden');n++}});return n})()"],
      ['every term expanded', "(()=>{document.querySelectorAll('[onclick^=\"toggleTermCollapse\"]').forEach(h=>h.click());return 1})()"]
    ] },
  { page: 'SundayServicePlanner.html', wait: 9000, states: [
      ['main', '1'],
      ['email modal', "(()=>{const m=document.getElementById('emailModal');if(m){m.classList.remove('hidden');m.style.display='flex'}return 1})()"],
      ['every panel revealed', "(()=>{let n=0;document.querySelectorAll('[id*=odal],details').forEach(m=>{if(m.tagName==='DETAILS'){m.open=true;n++}else if(m.style){m.style.display='block';m.classList.remove('hidden');n++}});return n})()"]
    ] },
  { page: 'addressbook.html', wait: 8000, states: [
      ['main', '1'],
      ['per-team caps open', "(()=>{document.querySelectorAll('details').forEach(d=>d.open=true);return 1})()"],
      ['editing somebody', "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Edit$/i.test(x.textContent.trim()));if(b)b.click();return 1})()"]
    ] },
  { page: 'resources.html', wait: 8000, states: [
      ['main', '1'],
      ['editor: upload', 'openEditor();'],
      ['editor: add a link', "openEditor();setTimeout(()=>{try{editorMode('link')}catch(e){}},300);1"]
    ] },
  { page: 'videos.html', wait: 8000, states: [
      ['main', '1'],
      ['a video open', "(()=>{const c=document.querySelector('.card');if(c)c.click();return 1})()"]
    ] },
  { page: 'view-only-rota.html', wait: 8000, states: [
      ['main', '1'],
      ['a term collapsed', "(()=>{const h=document.querySelector('[onclick^=\"toggleTermCollapse\"]');if(h)h.click();return 1})()"]
    ] },
  { page: 'places-admin.html', wait: 8000, states: [
      ['tab: sites', "(()=>{const b=[...document.querySelectorAll('.tab')][0];if(b)b.click();return 1})()"],
      ['tab: rooms', "(()=>{const b=[...document.querySelectorAll('.tab')][1];if(b)b.click();return 1})()"],
      ['tab: kit', "(()=>{const b=[...document.querySelectorAll('.tab')][2];if(b)b.click();return 1})()"],
      ['tab: outside venues', "(()=>{const b=[...document.querySelectorAll('.tab')][3];if(b)b.click();return 1})()"],
      ['tab: who approves', "(()=>{const b=[...document.querySelectorAll('.tab')][4];if(b)b.click();return 1})()"]
    ] }
];

const SIGNIN = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>sign-in</title>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>`;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

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
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream') +
      '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-screens'), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

  let list;
  for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  await send('Runtime.enable'); await send('Page.enable');
  /* Never read a cached page: a check that quietly tests the previous version
     of a file is worse than no check. */
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
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
  const who = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).email || "(nobody)"');
  if (who === '(nobody)') {
    console.error('Could not sign in as ' + ACCOUNT.email + ' on the emulator. Signed out, most of\n' +
                  'these screens never open, and the count would be a false zero.');
    server.close(); chrome.kill(); process.exit(2);
  }
  console.log('signed in as ' + who);

  let grand = 0; const rows = [];
  for (const P of PAGES) {
    if (only && !P.page.toLowerCase().includes(only.toLowerCase())) continue;
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + P.page });
    await sleep(P.wait);
    /* A dialog in headless Chrome stops the page until something answers it,
       and nothing here will. confirm says no, so anything that asks before
       acting is cancelled rather than carried out. */
    await ev('window.confirm=()=>false;window.alert=()=>{};window.prompt=()=>null;1');
    if (P.first) { await ev(P.first); await sleep(1200); }
    console.log('\n' + P.page);
    let pageTotal = 0;
    for (const [name, open] of P.states) {
      const r0 = await ev(open);
      await sleep(1100);
      const raw = await ev(PROBE);
      let r;
      try { r = JSON.parse(raw || '{}'); }
      catch { console.log('  ' + name.padEnd(22) + '  probe failed: ' + String(raw).slice(0, 80)); continue; }
      pageTotal += r.n || 0; grand += r.n || 0;
      rows.push({ page: P.page, state: name, n: r.n || 0 });
      console.log('  ' + name.padEnd(22) + String(r.n).padStart(4) +
        (String(r0).startsWith('THREW') ? '   (could not open: ' + String(r0).slice(6, 60) + ')' : ''));
      (r.eg || []).forEach(x => console.log('        ' + x));
    }
    console.log('  ' + '-'.repeat(22) + String(pageTotal).padStart(4) + '  on this page');
  }
  console.log('\nTOTAL across every screen: ' + grand);
  fs.writeFileSync(path.join(V2, 'tests', 'screens-last.json'), JSON.stringify(rows, null, 1));
  server.close(); chrome.kill();
  process.exit(grand ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
