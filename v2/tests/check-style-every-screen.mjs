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
import { watchConsole } from './console-watch.mjs';
import { giveFullAccess } from './test-account.mjs';
import { PAGES } from './group1-screens.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9622, SERVE = 8897;
/* A flag is not a page name. Reading argv[2] blindly meant `--all` was taken
   as the page to measure, matched nothing, and reported a total of 0 - a
   measurement that looked like a clean sweep and had measured nothing. */
const only = process.argv.slice(2).find(a => !a.startsWith('--'));
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

const PROBE = `(() => {
  /* Pictographs, dingbats and the arrows block, plus the variation selector
     that turns a plain glyph into an emoji one. The same ranges the
     comparison's AGREED list uses for "emoji replaced with Lucide". */
  /* Pictographs, dingbats and arrows - but NOT U+2669 to U+266F, the musical
     symbols. A flat sign in "B♭" is notation a musician reads, not a picture
     standing in for an icon, and Play-Through's key buttons are full of them. */
  const EMOJI = /[🌀-🫿☀-♨♰-➿⬀-⯿️←-⇿]/u;
  const out = [], seen = {};
  document.querySelectorAll('button,a,input,select,textarea,label,div,span,h1,h2,h3,h4,p,td,th,li').forEach(e => {
    if (!e.offsetParent && e.tagName !== 'BODY') return;
    const s = getComputedStyle(e);
    const w = parseInt(s.fontWeight, 10) || 400;
    const px = parseFloat(s.fontSize) || 0;
    const rad = parseFloat(s.borderTopLeftRadius) || 0;
    const ctrl = /^(BUTTON|INPUT|SELECT|TEXTAREA|LABEL)$/.test(e.tagName);
    /* A round control that is as wide as it is tall is an avatar or an icon
       button, not a capsule - the user's initials in the corner of the hub are
       one. A pill is wide and short. */
    const squarish = e.offsetWidth > 0 && Math.abs(e.offsetWidth - e.offsetHeight) <= e.offsetHeight * 0.25;
    const pill = ctrl && rad >= 20 && e.offsetHeight > 0 && e.offsetHeight < 60 && !squarish;
    const leaf = e.children.length === 0 && (e.textContent || '').trim();
    if (!leaf && !ctrl) return;
    const bad = [];
    if (w >= 700 && !/^H1$/.test(e.tagName)) bad.push('w' + w);
    if (s.textTransform === 'uppercase') bad.push('CAPS');
    if (px && px < 12) bad.push(px + 'px');
    if (pill) bad.push('pill' + Math.round(rad));
    if (/Montserrat/.test(s.fontFamily)) bad.push('Montserrat');
    /* DESIGN.md: no emoji in the interface. Lucide only.

       Only inside the CHROME - a control, a heading, a table header, an
       option. An emoji in a notice somebody wrote, or in a song note, is
       their content and stays; RESTYLE-BRIEF says so in those words. Judging
       that by the element rather than by the character is what keeps the two
       apart without a list of exceptions. */
    if (EMOJI.test(e.textContent || '') &&
        /^(BUTTON|A|LABEL|SELECT|OPTION|SUMMARY|H1|H2|H3|H4|TH)$/.test(e.tagName)) bad.push('emoji');
    if (!bad.length) return;
    const key = e.tagName + '|' + bad.join(',');
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] <= 1) out.push(e.tagName.toLowerCase() + ' "' +
      (e.textContent || e.placeholder || '').trim().slice(0, 18) + '" ' + bad.join(' '));
  });
  return JSON.stringify({ n: Object.keys(seen).reduce((a, k) => a + seen[k], 0), eg: out.slice(0, 6) });
})()`;

/* The screens come from group1-screens.mjs, which the icon check walks too.
   One list, so a screen cannot be covered by one check and missed by the
   other. */

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
  const watch = watchConsole();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    /* A page that throws is not a page that works, however tidy it looks. */
    watch.handle(m);
  };
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
  const uid = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""');
  /* Ask for an account that can open every page, rather than hoping whichever
     check ran last left one. Six pages used to go unwalked behind a quiet
     zero because check-menu.mjs had left this account as a Worship member
     (A-023). */
  if (uid) await giveFullAccess(uid, ACCOUNT.email);
  const who = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).email || "(nobody)"');
  if (who === '(nobody)') {
    console.error('Could not sign in as ' + ACCOUNT.email + ' on the emulator. Signed out, most of\n' +
                  'these screens never open, and the count would be a false zero.');
    server.close(); chrome.kill(); process.exit(2);
  }
  console.log('signed in as ' + who);

/* EGBCAuth draws this when somebody may not see a page: it replaces the
   whole body with a card holding a heading, a line of explanation and two
   pills. A short body whose only heading says no is the shape of a door. */
/* Is this the page, or the door?

   EGBCAuth._blockPage() marks the body it replaces (data-egbc-blocked), so
   this is an answer and not a guess. The text test behind it is for a page
   that turns somebody away in its own words rather than through EGBCAuth.

   It matters in the direction nobody looks: a door that happens to obey
   DESIGN.md scores 0, and a run of all-zeroes reads as a clean sweep. This
   check reported exactly that once, with five pages unopened. */
const REFUSED_PROBE = "(function(){var b=document.body;if(!b)return '';"
  + "if(b.getAttribute('data-egbc-blocked'))return b.getAttribute('data-egbc-blocked');"
  + "var h=b.querySelector('h1');var t=(h&&h.textContent||'').trim();if(!t)return '';"
  + "var shut=/cannot|not allowed|no access|members only|team only|not signed in/i.test(t);"
  + "return (shut && b.querySelectorAll('*').length < 40) ? t : '';})()";

  let grand = 0; const rows = []; const pagesWithErrors = []; const turnedAway = [];
  for (const P of PAGES) {
    if (only && !P.page.toLowerCase().includes(only.toLowerCase())) continue;
    /* Pages the restyle has not reached are walked by the icon check, not
       measured here. Asserting DESIGN.md on work that is not scheduled turns a
       gate into noise - what this finds on them is written up for R-014
       instead. Run with --all to see them anyway. */
    if (P.restyled === false && !process.argv.includes('--all')) {
      console.log('\n' + P.page + '   not restyled yet (R-014); run with --all to measure it');
      continue;
    }
    watch.reset();
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + P.page });
    await sleep(P.wait);
    /* A dialog in headless Chrome stops the page until something answers it,
       and nothing here will. confirm says no, so anything that asks before
       acting is cancelled rather than carried out. */
    await ev('window.confirm=()=>false;window.alert=()=>{};window.prompt=()=>null;1');
    if (P.first) { await ev(P.first); await sleep(1200); }
    console.log('\n' + P.page);

    /* IS THIS THE PAGE, OR THE DOOR?
       EGBCAuth's refusal screen replaces the whole body with "You cannot
       see this page", and that screen breaks three DESIGN.md rules of its
       own: an 11px line and two 10px uppercase pills. Measured as though it
       were the page, it put 57 faults on CoreTeamApp and 15 on the Sunday
       Service Planner that had nothing to do with either - and it would
       just as happily report 0 on a page it had never opened, which is the
       way round that matters: this check once said every screen was clean
       while five of them had not been seen at all.

       So: if the door is what is on screen, say so, and do not count it. */
    const refused = await ev(REFUSED_PROBE);
    if (refused) {
      console.log('  TURNED AWAY - not measured: ' + JSON.stringify(String(refused).slice(0, 70)));
      console.log('  The account this ran as cannot open this page, so nothing measured');
      console.log('  here would be about the page. Give the test account the teams it');
      console.log('  needs, and run it again.');
      turnedAway.push({ page: P.page, said: String(refused).slice(0, 100) });
      continue;
    }

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
    console.log('  ' + 'error console'.padEnd(22) + '  ' + watch.summary());
    if (watch.errors.length) pagesWithErrors.push({ page: P.page, errors: watch.errors.slice() });
  }
  console.log('\nTOTAL across every screen: ' + grand);
  if (turnedAway.length) {
    console.log(''); console.log('PAGES THIS RUN NEVER SAW. The number above is not about them:');
    turnedAway.forEach(x => console.log('  ' + x.page + '  - ' + x.said));
  }
  if (pagesWithErrors.length) {
    console.log('\nPAGES WITH AN ERROR ON THE CONSOLE. A page that throws is not a page that works:');
    for (const p of pagesWithErrors) {
      console.log('  ' + p.page);
      p.errors.slice(0, 4).forEach(e => console.log('      ' + e));
    }
  }
  fs.writeFileSync(path.join(V2, 'tests', 'screens-last.json'),
    JSON.stringify({ rows, pagesWithErrors, turnedAway }, null, 1));
  server.close(); chrome.kill();
  /* A page that was never opened fails the run. Carrying on with a quiet zero
     is the whole of what went wrong before: six pages went unmeasured for days
     behind a total of 0. */
  process.exit(grand || pagesWithErrors.length || turnedAway.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
