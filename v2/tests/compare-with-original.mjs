/* Side by side: every v2 page against the original it replaced.
 *
 *   node tests/compare-with-original.mjs                 every page
 *   node tests/compare-with-original.mjs Planner         pages matching "Planner"
 *   node tests/compare-with-original.mjs Planner --shots also save screenshots
 *
 * Needs the emulators running (firebase emulators:start) and a synthetic
 * member account in them - see ACCOUNT below.
 *
 * WHY IT EXISTS. v2's Sunday Service Planner opened with an empty order of
 * service where the original opens with the church's fixed layout. The parity
 * audit missed it because it compared source: the function was still there,
 * so nothing looked lost. Only the drawn page shows it.
 *
 * HOW THE TWO SIDES ARE LOADED, which is the whole difficulty.
 *
 *   The ORIGINAL pages carry the church's live Firebase config and hook no
 *   emulator, so opening one normally reads real data. EVERY request that
 *   leaves this machine is therefore refused, apart from the few CDN hosts in
 *   ALLOWED_HOSTS. An original is compared on what it draws with no database.
 *
 *   That used to be a list of hosts to REFUSE, and it leaked: the original
 *   pages reached the live Firestore through a host the list did not name, and
 *   real members' names came back in the output. A list of things to refuse
 *   has to be complete to work. This one names what is allowed instead.
 *
 *   The v2 pages run signed in against the emulator, as they always do. They
 *   cannot be cut off the same way: every v2 page waits for sign-in before it
 *   draws anything, so a v2 page with no database is a blank page, and
 *   comparing a blank page against anything is how a check lies to you.
 *
 * SO THE COMPARISON IS ONE-DIRECTIONAL: everything the original shows must
 * also be in v2. Extra rows in v2 are the emulator's synthetic data and are
 * not differences. Anything the original has and v2 has not is a loss.
 *
 * WHAT IS COMPARED, on every page:
 *   - the items each list opens with, and their order
 *   - the values already in the fields, and which option is selected
 *   - every control: that it is there, and what it is wired to
 *   - every heading
 *
 * A difference is one of:
 *   (a) agreed   - a change a step decided on. Named in AGREED below.
 *   (b) restyle  - same structure and order, wording differing only in case.
 *   (c) loss     - anything else. Every (c) is a bug to fix.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';

const V2 = path.resolve('.');
const ROOT = path.resolve('..');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9620, ORIG_PORT = 8893, V2_PORT = 8894;

const args = process.argv.slice(2);
const wantShots = args.includes('--shots');
/* The originals are pointed at the SYNTHETIC emulator - in the served copy
   only, never on disk - so that BOTH SIDES SHOW THE SAME DATA. This is the
   default, and it is the comparison that is worth having: read with no
   database at all, an original draws its empty state and half of what it has
   is simply absent, so a real difference and a missing database look the same.
   --originals-offline goes back to starving them, which is only useful for
   seeing what a page builds with no data of any kind. */
const onEmulator = !args.includes('--originals-offline');
const only = args.find(a => !a.startsWith('--'));

/* A synthetic member in the emulator, with nothing to do with any real
   person. Override with EGBC_EMU_EMAIL / EGBC_EMU_PW. */
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

/* ONLY these hosts may be reached, and everything else off this machine is
   refused. An ALLOWLIST, because the blocklist that was here first did not
   hold: the original pages reached the church's LIVE Firestore through it and
   real members' names came back into the test output. A list of hosts to
   refuse has to be complete to work, and it never is. A list of hosts to
   permit fails the other way - something legitimate gets refused, and the
   check says so loudly instead of quietly reading real data.
   Matched on HOST, never on the whole URL: the Auth emulator answers on
   http://localhost:9099/identitytoolkit.googleapis.com/v1/... , so a
   substring match on a live hostname refuses the emulator's own sign-in. */
const ALLOWED_HOSTS = [
  'www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'
];
/* The emulator, refused only while an ORIGINAL page is loading, so that an
   original can never reach the synthetic database either - it was never
   written for it, and a half-read is worse than no read. */
const EMU_PORTS = ['8181', '9099', '9199', '8182', '9098', '9198'];

/* A url this check cannot even parse is refused, not allowed.
   data:, blob: and about: have no host and never leave the machine, so they
   are local - treating them as unparseable made the leak detector cry wolf on
   half the pages, which is as bad as missing a real one. */
const LOCAL_SCHEME = /^(data|blob|about|chrome|chrome-extension|filesystem):/i;
const hostOf = u => { try { return new URL(u).host; } catch { return null; } };
const isLive = u => {
  if (LOCAL_SCHEME.test(String(u))) return false;
  const h = hostOf(u);
  if (h === null) return true;
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED_HOSTS.includes(h.split(':')[0]);
};
const isEmulator = u => {
  const h = hostOf(u);
  const [host, port] = h.split(':');
  return (host === 'localhost' || host === '127.0.0.1') && EMU_PORTS.includes(port);
};

/* Differences a step decided on, so they are (a) and not a loss. Each entry
   says which step, so this list stays auditable instead of becoming a place
   to hide failures. */
const AGREED = [
  { re: /[\u{1F300}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{2800}-\u{28FF}]/u,
    why: 'R-013 / A3: emoji replaced with Lucide icons' },
  { re: /training mode/i, why: 'A3: training banner reworded, same controls' },
  { re: /^(send all rotas)$/i, why: 'A3: sentence case' },
  /* The Kids Church role names were deliberately redone: the original offered
     Session Leader, Group Leader (Younger / Older) and Supporting Adult; v2
     offers Session Leader, Leader and Assistant for Younger, Older and Creche,
     and Helper. Named here one by one rather than by a pattern, so a role that
     really did go missing still shows up. */
  { re: /group leader \((younger|older)\)/i, why: 'agreed: Kids Church roles renamed to Leader (Younger/Older/Creche)' },
  { re: /supporting adult/i, why: 'agreed: Kids Church roles renamed - Assistant and Helper replace it' },
  /* Martin's decision (05c9be63, 6761860b): the worship planners - the Sunday
     Service Planner, and CoreTeamApp's planner, team table and emailed plan -
     show Worship and AV roles only, never Kids Church slots. Kids Church never
     existed on the original site; its slots appear there at all only because
     v2 writes them to the shared database. So a Kids Church row the ORIGINAL
     shows is itself a thing v2 put there, and leaving it out is the agreed
     behaviour, not a loss. */
  { re: /kids church|session leader|leader \((younger|older|creche)\)|assistant \((younger|older|creche)\)/i,
    why: 'agreed (Martin, 05c9be63): worship planners show Worship and AV roles only' },
  /* ONE-APP-BRIEF section 5: "Core Team already has a Meetings screen - keep
     it, and make its Join open meeting.html", so that a call stays inside the
     installed app instead of opening the browser at daily.co. The room is the
     same either way; only the page that opens it changed. */
  { re: /daily\.co|meeting\.html\?room=/i,
    why: 'agreed (ONE-APP section 5): Join opens meeting.html so the call stays in the app' }
];

/* ---------------------------------------------------------------- servers */
const SIGNIN = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>sign-in</title>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>`;

/* The same, for the ORIGINALS' origin. A sign-in is kept per origin, and the
   two sides are served on different ports, so signing in on one does nothing
   for the other - which is why the gated originals still went to login.html.
   This one builds the app itself, pointed at the emulator, so it can never
   reach a real account. The config is the public one already in every page. */
const ORIG_SIGNIN = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>sign-in</title>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
</head><body>sign-in harness (originals)
<script>
var app = firebase.initializeApp({
  apiKey: "AIzaSyCl2enA5LPKrHcxYP1K64c1ZNK744RO9R4",
  authDomain: "egbc-worship-planner.firebaseapp.com",
  projectId: "egbc-worship-planner",
  storageBucket: "egbc-worship-planner.firebasestorage.app",
  appId: "1:199442060489:web:7eaf85a76334c753db6918"
});
firebase.firestore(app).useEmulator('localhost', 8181);
firebase.auth(app).useEmulator('http://localhost:9099', { disableWarnings: true });
</script></body></html>`;

/* Points an ORIGINAL page at the emulator, in the copy that is served and
   never on disk. Some originals are sign-in gated - hub.html and
   resources.html send anyone without an account to login.html - so with no
   database they draw nothing and there is nothing to compare. This is the only
   way to see them, and it is the safe way round: the page talks to the
   synthetic emulator instead of the church's data, and the allowlist still
   refuses everything that would leave the machine.
   Injected straight after the last Firebase compat script, which is where
   `firebase` exists and the page's own code has not run yet. */
const emulatorHook = (account) => `<script>/* injected by tests/compare-with-original.mjs */
(function () {
  if (!window.firebase || !firebase.initializeApp) return;
  var realInit = firebase.initializeApp;
  firebase.initializeApp = function () {
    var app = realInit.apply(this, arguments);
    try { firebase.firestore(app).useEmulator('localhost', 8181); } catch (e) {}
    try { if (firebase.storage) firebase.storage(app).useEmulator('localhost', 9199); } catch (e) {}
    /* And sign in. The original pages mostly do not, because the live site has
       open rules and never needed an account. The emulator has the real rules
       loaded, so an unsigned read is refused and the page draws nothing - the
       original would look as though it had lost everything v2 has. Where the
       page does not load the auth SDK at all, it is added above. */
    try {
      var auth = firebase.auth(app);
      auth.useEmulator('http://localhost:9099', { disableWarnings: true });
      if (${process.env.EGBC_SKIP_SIGNIN === '1'}) { window.__harnessSignIn = Promise.resolve('left signed out'); return app; }
      window.__harnessSignIn = auth.signInWithEmailAndPassword(${JSON.stringify(account.email)}, ${JSON.stringify(account.pw)})
        .then(function () { return 'signed in'; })
        .catch(function (e) { return 'sign-in failed: ' + e.code; });
    } catch (e) { window.__harnessSignIn = Promise.resolve('no auth sdk: ' + e.message); }
    return app;
  };
})();
</script>`;
/* No service workers, on either side.
 *
 * THIS IS THE HOLE THROUGH WHICH LIVE DATA CAME BACK. Several pages register
 * ./sw.js. A service worker is a separate context: its own fetches are NOT
 * intercepted, so nothing here could refuse them - and its scope is the whole
 * origin, so once one page had registered it, every later page on that origin
 * could be served through it. That is why the leak was intermittent and why
 * running a page on its own looked clean.
 *
 * Stubbing the registration is also the right comparison: what is being
 * compared is what the page draws, not what it caches for offline use.
 */
const NO_SW = `<script>/* injected by tests/compare-with-original.mjs */
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


/* The modular half of the same job, and it is the half that matters: 26 of the
 * 51 originals import the SDK as ES modules, including the Rota Planner, the
 * Sunday Service Planner, the address book, the availability form,
 * view-only-rota and the youth planner. There is no `firebase` global on those
 * pages to patch, so the compat hook above did nothing and they stayed pointed
 * at live - refused, drawing nothing, and every difference that followed was
 * really just a page with no database.
 *
 * So the page's import of firebase-app.js is answered with a module of our own
 * that re-exports the real one and wraps initializeApp. getFirestore(app)
 * hands back the same instance every time it is called, and the module itself
 * is loaded once, so connecting it here connects the one the page then uses.
 *
 * Per SDK version, because 10.7.1 and 10.12.2 are different modules with
 * different instances: a 10.7.1 getFirestore cannot connect a 10.12.2 app.
 */
const sdkShim = () => `/* injected by tests/compare-with-original.mjs */
import * as realApp from BASE_APP_URL;
export * from BASE_APP_URL;
import { getFirestore, connectFirestoreEmulator } from BASE_FS_URL;
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from BASE_AUTH_URL;

/* The page's own signInWithEmailAndPassword is not used - the original pages
   do not sign in at all, because the live site has open rules. The emulator
   has the real rules loaded, so without a signed-in member most reads are
   refused and the page draws nothing. Signing in here is what makes the two
   sides comparable. */
export function initializeApp() {
  const app = realApp.initializeApp.apply(null, arguments);
  try { connectFirestoreEmulator(getFirestore(app), 'localhost', 8181); } catch (e) {}
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    if (SKIP_SIGNIN) { window.__harnessSignIn = Promise.resolve('left signed out'); return app; }
    window.__harnessSignIn = signInWithEmailAndPassword(auth, EMAIL, PASSWORD)
      .then(() => 'signed in').catch(e => 'sign-in failed: ' + e.code);
  } catch (e) { window.__harnessSignIn = Promise.resolve('no auth: ' + e.message); }
  return app;
}
`;

function shimFor(version, account) {
  const base = 'https://www.gstatic.com/firebasejs/' + version + '/';
  return sdkShim()
    .replace(/BASE_APP_URL/g, JSON.stringify(base + 'firebase-app.js'))
    .replace(/BASE_FS_URL/g, JSON.stringify(base + 'firebase-firestore.js'))
    .replace(/BASE_AUTH_URL/g, JSON.stringify(base + 'firebase-auth.js'))
    .replace(/SKIP_SIGNIN/g, String(process.env.EGBC_SKIP_SIGNIN === '1'))
    .replace(/EMAIL/g, JSON.stringify(account.email))
    .replace(/PASSWORD/g, JSON.stringify(account.pw));
}

/* Only an `import ... from "<the app module>"` is replaced, never a
   <script src>. Firebase 8.10.1 is loaded with a plain script tag whose file
   has the same name, firebase-app.js, and swapping that for an ES module broke
   eight pages outright: "Cannot use import statement outside a module", then
   "Cannot instantiate firebase-firestore.js - be sure to load firebase-app.js
   first", and the page gone. The check reported those as losses in v2, which
   they were not. */
const MODULAR_APP_IMPORT = /(from\s*['"])https:\/\/www\.gstatic\.com\/firebasejs\/([0-9.]+)\/firebase-app\.js(['"])/g;

/* Any SDK loaded as a classic script: 8.10.1's firebase-app.js and 9+'s
   firebase-app-compat.js both put `firebase` on the window, so both are
   patched the same way. Matching only "-compat" left every version 8 page
   with no hook at all, pointed at live and drawing nothing. */
const SDK_SCRIPT_TAG = /<script[^>]+src=["'][^"']*firebasejs\/[^"']*\.js["'][^>]*><\/script>/gi;

function pointAtEmulator(html, account) {
  /* modular: answer the app import with the shim */
  html = html.replace(MODULAR_APP_IMPORT, (_m, pre, version, post) =>
    pre + '/__shim-app-' + version + '.js' + post);
  /* namespaced or compat: patch the global, after the last SDK script tag */
  let last = null, m, version = null;
  SDK_SCRIPT_TAG.lastIndex = 0;
  while ((m = SDK_SCRIPT_TAG.exec(html))) {
    last = m.index + m[0].length;
    const v = /firebasejs\/([0-9.]+)\//.exec(m[0]);
    if (v) version = v[1];
  }
  if (last === null) return html;
  /* Several originals load app and firestore but not auth, because they never
     signed in. Add it, at their own SDK version, so the hook can. */
  const needsAuth = version && !/firebasejs\/[0-9.]+\/firebase-auth(-compat)?\.js/i.test(html);
  const authTag = needsAuth
    ? '<script src="https://www.gstatic.com/firebasejs/' + version + '/firebase-auth' +
      (/-compat\.js/i.test(html) ? '-compat' : '') + '.js"></script>\n'
    : '';
  return html.slice(0, last) + '\n' + authTag + emulatorHook(account) + html.slice(last);
}

function serve(dir, port, extra, hookEmulator) {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/__signin.html' && (extra || hookEmulator)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(extra ? SIGNIN : ORIG_SIGNIN);
    }
    const shim = hookEmulator && /^\/__shim-app-([0-9.]+)\.js$/.exec(url);
    if (shim) {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(shimFor(shim[1], ACCOUNT));
    }
    const name = url.replace(/^\//, '') || 'index.html';
    const file = path.join(dir, name);
    if (!path.resolve(file).startsWith(path.resolve(dir)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('not found');
    }
    const ext = path.extname(file).toLowerCase();
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
      '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
      '.webmanifest': 'application/manifest+json' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    let body = fs.readFileSync(file);
    if (ext === '.html') {
      let text = stripServiceWorker(body.toString('utf8'));
      if (hookEmulator) text = pointAtEmulator(text, ACCOUNT);
      body = Buffer.from(text, 'utf8');
    }
    res.end(body);
  }).listen(port);
}

/* ------------------------------------------- what the page shows, as data */
/* Every state, not just the opening one: A3b established that the opening
   screen is a fraction of a page. Tabs and panels are revealed rather than
   clicked, because clicking a tab on one side and not the other is how a
   comparison drifts, and because some buttons send things. */
const REVEAL = `(() => {
  let opened = 0;
  document.querySelectorAll('[style*="display: none"],[style*="display:none"],.hidden,[hidden]')
    .forEach(el => {
      const t = (el.tagName || '').toLowerCase();
      if (t === 'script' || t === 'style' || t === 'template' || t === 'link') return;
      /* A modal backdrop covering the page would hide everything behind it. */
      if (/backdrop|overlay/i.test(el.className || '')) return;
      el.removeAttribute('hidden');
      el.classList.remove('hidden');
      el.style.setProperty('display', 'block', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('opacity', '1', 'important');
      opened++;
    });
  document.querySelectorAll('details').forEach(d => { d.open = true; opened++; });
  return opened;
})()`;

const SNAPSHOT = `(() => {
  const txt = el => (el.textContent || '').replace(/\\s+/g, ' ').trim();
  /* After REVEAL everything is laid out, so presence in the document is the
     right test; offsetParent would still be null inside a fixed ancestor. */
  const real = el => !el.closest('template');

  const controls = [...document.querySelectorAll('button,a[href],input,select,textarea')]
    .filter(real).map(el => {
      const tag = el.tagName.toLowerCase();
      /* A select is named by its first option - its placeholder - and NOT by
         its text, because a select's textContent is every option run
         together. Where the options come from the database that string
         differs between a loaded page and an empty one, and every select on
         the page then reads as a control v2 had lost. It is the select being
         there and wired up that matters; what is in it is data. */
      const label = tag === 'select'
        ? ((el.options[0] || {}).text || '').trim().slice(0, 44)
        : (txt(el) || el.placeholder || el.value || el.getAttribute('aria-label') || '').slice(0, 44);
      /* The handler's NAME, with its arguments masked. Rows are built with ids
         from Date.now() or a random string - keyChanged('5pwmgqho0'),
         toggleEventExpand('WEQzmoXQqAFPN5Tel1Li') - and a document id is
         different on the two sides and on every load, so every row of every
         list read as a control v2 had lost. What is worth comparing is that
         the control is still wired to the same function. */
      const wired = (el.getAttribute('onclick') || el.getAttribute('onchange') ||
                     el.getAttribute('href') || '')
        .replace(/\\s+/g, '')
        .replace(/'[^']*'/g, "'#'").replace(/"[^"]*"/g, '"#"')
        .slice(0, 44);
      return tag + '|' + (el.id || el.name || '') + '|' + label + '|' + wired;
    });

  const lists = {};
  document.querySelectorAll('[id]').forEach(el => {
    if (!real(el) || el.children.length < 2 || el.children.length > 80) return;
    const rows = [...el.children].map(c => txt(c).slice(0, 36)).filter(Boolean);
    if (rows.length > 1) lists[el.id] = rows;
  });

  const fields = {};
  document.querySelectorAll('input,select,textarea').forEach(el => {
    if (!real(el)) return;
    const key = el.id || el.name || el.placeholder;
    if (!key) return;
    fields[key] = el.tagName === 'SELECT'
      ? ((el.options[el.selectedIndex] || {}).text || '').trim().slice(0, 36)
      : String(el.value || '').slice(0, 36);
  });

  const headings = [...document.querySelectorAll('h1,h2,h3')].filter(real).map(h => txt(h).slice(0, 44));

  return JSON.stringify({ controls, lists, fields, headings });
})()`;

/* Case, punctuation and whitespace are restyling. Today's date is not a
   difference either: both sides open on it. */
const today = new Date();
const DATEISH = new RegExp([
  today.toISOString().slice(0, 10),
  new Date(today.getTime() - 864e5).toISOString().slice(0, 10),
  new Date(today.getTime() + 864e5).toISOString().slice(0, 10)
].join('|'));
/* Rows are built with ids like keyChanged('5pwmgqho0') - a fresh random
   base36 string on every load. They differ between the two sides of every
   comparison and between two loads of the same side, so they are masked. The
   pattern is deliberately narrow (letters AND digits, 7 to 14 characters) so
   that a real name such as keyChanged('worship') is left alone. */
const MASK_ID = /\b(?=[a-z0-9]{7,14}\b)(?=[a-z0-9]*[a-z])(?=[a-z0-9]*[0-9])[a-z0-9]{7,14}\b/g;
/* And ids made from Date.now(), as sitemaker.html's rows are: a run of ten or
   more digits is a timestamp, not content. Narrow enough to leave a year, a
   price or a phone number alone. */
const MASK_STAMP = /\d{10,}/g;
/* An element id that was generated rather than written. Containers named this
   way cannot be matched between the two sides at all. */
const GENERATED_ID = /\d{10,}/;
/* The branding files, at the root of the bucket where the real ones are.
 * Without them the Storage emulator answers "object not found", and every page
 * that shows the logo reports an error that is the harness's empty bucket and
 * not the page at all. A one-pixel PNG; nothing is copied from anywhere.
 */
const BRANDING = ['1774936285076.png', 'copilot_image_1775806874083.jpeg',
  '1774933729776.png', '1774933429062.png', '1774936402880.png', '1777880144841.png'];
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
function seedBranding() {
  const bucket = 'egbc-worship-planner.firebasestorage.app';
  return Promise.all(BRANDING.map(name => new Promise(resolve => {
    const req = http.request({
      host: 'localhost', port: 9199, method: 'POST',
      path: '/v0/b/' + bucket + '/o?name=' + encodeURIComponent(name),
      headers: { 'Content-Type': name.endsWith('.jpeg') ? 'image/jpeg' : 'image/png',
                 'Content-Length': ONE_PIXEL_PNG.length, Authorization: 'Bearer owner' }
    }, r => { r.resume(); r.on('end', resolve); });
    req.on('error', resolve);
    req.end(ONE_PIXEL_PNG);
  })));
}

/* Pages this comparison cannot settle, and what settles them instead. Counted
 * and named rather than quietly skipped.
 *
 * The hub is the one case. Both hubs list the same registry and draw it
 * differently: the original makes each tile an <a href>, v2 draws a row and
 * groups the list - phone apps under "Apps", help pages as a "?" on the tool
 * they explain, charters together, a section per team. Comparing controls then
 * reports twenty tiles "missing from v2" that are all present and reachable,
 * and a real loss would be buried among them. check-hub-tools.mjs compares
 * what each hub OFFERS, by title, which does not care what element a title is
 * drawn in: v2 offers every page the original offers, and fifteen more.
 */
const COVERED_BY = {
  'hub.html': 'tests/check-hub-tools.mjs (compares what each hub offers, by title)',
  /* Signed in, BOTH login pages send you to the hub, which is what a login
     page is for - so there is nothing to compare unless the run is signed out,
     and the run cannot be signed out for this page alone without signing out
     of all the others. One command, and it reports the page properly:
       EGBC_SKIP_SIGNIN=1 node tests/compare-with-original.mjs login.html */
  'login.html': 'EGBC_SKIP_SIGNIN=1 node tests/compare-with-original.mjs login.html'
};

/* ------------------------------------------------- driving the main flow */
/* Most of what these pages do is behind choosing something first, so looking
 * at the state a page opens in says very little. The same steps run on both
 * sides, in the same order, against the same synthetic data.
 *
 * NOTHING HERE WRITES. Both sides now share one synthetic database, so a step
 * that saved would change what the other side then read, and the comparison
 * would be of two different states. Picking a date, picking a service and
 * opening a person are all reads.
 *
 * Written in plain DOM terms rather than against either side's internals, so
 * one list of steps serves both copies of the page.
 */
const SET_DATE = (id, value) => `(() => { const el = document.getElementById('${id}');
  if (!el) return 'no #${id}';
  el.value = '${value}';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value; })()`;

const PICK_OPTION = (id, n) => `(() => { const s = document.getElementById('${id}');
  if (!s) return 'no #${id}';
  if (s.options.length <= ${n}) return 'only ' + s.options.length + ' option(s)';
  s.selectedIndex = ${n};
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return (s.options[s.selectedIndex] || {}).text; })()`;

const CLICK_NTH = (selector, n, what) => `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.offsetParent);
  if (els.length <= ${n}) return 'only ' + els.length + ' ${what}';
  els[${n}].click();
  return 'opened ' + (els[${n}].textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30); })()`;

const CALL = (fn, arg) => `(() => { try {
  if (typeof ${fn} !== 'function') return 'no ${fn}()';
  ${fn}(${arg === undefined ? '' : JSON.stringify(arg)}); return 'called';
} catch (e) { return 'threw: ' + e.message; } })()`;

/* A Sunday the emulator has an event and a service on. */
const SEEDED_SUNDAY = '2026-10-11';
/* A synthetic member, so the availability form has somebody to look up. */
const SEEDED_EMAIL = 'ab_p1@example.invalid';

const FLOWS = {
  'SundayServicePlanner.html': [
    ['pick the date', SET_DATE('serviceDate', SEEDED_SUNDAY)],
    ['pick the service', PICK_OPTION('eventSelect', 1)]
  ],
  'youthserviceplanner.html': [
    ['pick the date', SET_DATE('serviceDate', SEEDED_SUNDAY)],
    ['pick the service', PICK_OPTION('eventSelect', 1)]
  ],
  'youthapp2.html': [
    ['open the planner', CALL('openSection', 'planner')],
    ['pick the date', SET_DATE('serviceDate', SEEDED_SUNDAY)],
    ['pick the service', PICK_OPTION('eventSelect', 1)]
  ],
  'Planner.html': [
    ['pick a term', PICK_OPTION('termSelect', 1)],
    ['expand every term', `(() => { const h = [...document.querySelectorAll('[onclick^="toggleTermCollapse"]')];
       h.forEach(e => e.click()); return h.length + ' term(s)'; })()`],
    ['pick a member for the PDF', PICK_OPTION('memberPdfSelect', 1)]
  ],
  'view-only-rota.html': [
    ['pick a member', PICK_OPTION('memberPdfSelect', 1)],
    ['expand every term', `(() => { const h = [...document.querySelectorAll('[onclick^="toggleTermCollapse"]')];
       h.forEach(e => e.click()); return h.length + ' term(s)'; })()`]
  ],
  'CoreTeamApp.html': [
    ['put the tour away', CALL('endTour')],
    ['the service planner', CALL('openSection', 'service')],
    ['open the first service', CLICK_NTH('#service-list .service-card, #service-list [onclick]', 0, 'service(s)')],
    ['the rota', CALL('openSection', 'rota')],
    ['the meetings', CALL('openSection', 'meetings')]
  ],
  'hub.html': [
    ['open the admin panel', CALL('openAdmin')],
    ['the people tab', CALL('adminTab', 'people')],
    ['the youth codes tab', CALL('adminTab', 'youth')],
    ['the page registry tab', CALL('adminTab', 'pages')]
  ],
  'addressbook.html': [
    ['open the first person', CLICK_NTH('button[onclick^="editMember"], .member-row button', 0, 'people')],
    ['open the second person', CLICK_NTH('button[onclick^="editMember"], .member-row button', 1, 'people')]
  ],
  'index.html': [
    ['type a member\'s address', `(() => { const el = document.getElementById('memberEmail');
       if (!el) return 'no #memberEmail'; el.value = '${SEEDED_EMAIL}';
       el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()`],
    ['press Check My Services', CALL('loginMember')]
  ]
};

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ').trim().replace(MASK_STAMP, '#').replace(MASK_ID, '#');
const agreedWhy = s => (AGREED.find(a => a.re.test(s)) || {}).why || '';

/* Is every row the original shows present in v2, in the same order?
   v2 may have extra rows: those are the emulator's synthetic data. */
function missingFrom(origRows, v2Rows) {
  const want = origRows.map(norm).filter(Boolean);
  const have = v2Rows.map(norm);
  const missing = [];
  let at = 0;
  for (const row of want) {
    const found = have.indexOf(row, at);
    if (found === -1) missing.push(row);
    else at = found + 1;
  }
  return missing;
}

/* ------------------------------------------------------------------- main */
(async () => {
  const pages = fs.readdirSync(ROOT).filter(f => f.toLowerCase().endsWith('.html'))
    .filter(f => fs.existsSync(path.join(V2, f)))
    .filter(f => !only || f.toLowerCase().includes(only.toLowerCase()))
    .sort();
  if (!pages.length) { console.error('no page matched ' + only); process.exit(1); }
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });
  await seedBranding();

  const sOrig = serve(ROOT, ORIG_PORT, false, onEmulator), sV2 = serve(V2, V2_PORT, true, false);
  if (onEmulator) console.log('the originals are pointed at the emulator for this run, in the copy\n' +
    'that is served - nothing on disk is touched, and nothing may still leave this machine\n');
  /* A FRESH browser profile every run, thrown away afterwards. Reusing one
     cost a morning: run page by page and four pages reported no differences,
     run the same four in one go on a kept profile and one of them reported
     nineteen headings that are in neither copy of the page and nowhere in the
     repository. Whatever carried them - the originals all share one origin, so
     they share its storage - a comparison that can inherit state from an
     earlier run is not a comparison. */
  const profile = path.join(os.tmpdir(), 'cdp-compare-' + process.pid + '-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile, '--no-first-run', 'about:blank'],
    { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });

  let list;
  for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  let side = 'orig', nowPage = '(start-up)', refusedLive = 0, refusedEmu = 0;
  const leaked = [], gotData = [];
  const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => {
    const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    /* A page that throws is not a page that works, whichever side it is on. */
    if (watch.handle(m)) return;
    /* A RESPONSE from somewhere that is not this machine means data actually
       came back, whatever the interception thinks it did. This is the detector
       that would have caught the live Firestore reads immediately instead of
       after they had already happened: an attempt is not a leak, a reply is. */
    if (m.method === 'Network.responseReceived') {
      const u = m.params.response && m.params.response.url;
      if (u && isLive(u) && !/firebasestorage|storage\.googleapis|gstatic|fonts\./.test(String(hostOf(u))))
        gotData.push((side === 'orig' ? 'original ' : 'v2 ') + nowPage + ' <- ' + hostOf(u));
      return;
    }
    if (m.method !== 'Fetch.requestPaused') return;
    const u = m.params.request.url || '';
    const fail = () => send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
    if (isLive(u)) {
      refusedLive++;
      /* A v2 page reaching off this machine for DATA is a fault in v2, not in
         the test: it means that page is not hooked to the emulator. Pictures
         served out of the storage bucket are not that - the site has always
         linked its images there - so only the data apis are reported. */
      if (side === 'v2' && !/firebasestorage|storage\.googleapis/.test(String(hostOf(u))))
        leaked.push(nowPage + ' -> ' + String(u).split('?')[0]);
      return fail();
    }
    if (side === 'orig' && !onEmulator && isEmulator(u)) { refusedEmu++; return fail(); }
    send('Fetch.continueRequest', { requestId: m.params.requestId });
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
  const ev = async (x, awaitPromise = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise })) || {};
    if (r.exceptionDetails) return null;
    return r.result && r.result.value;
  };

  /* Sign in once on the v2 origin. Every v2 page shares that session.
     EGBC_SKIP_SIGNIN=1 leaves it signed out, which is the only way to compare
     login.html: signed in, v2's login page sends you straight to the hub, as
     it is meant to. */
  if (process.env.EGBC_SKIP_SIGNIN === '1') {
    console.log('signed out, by EGBC_SKIP_SIGNIN=1\n');
  } else {
  side = 'v2';
  await send('Page.navigate', { url: 'http://localhost:' + V2_PORT + '/__signin.html' });
  await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
  /* firebase's own currentUser, not EGBCAuth.user(): EGBCAuth only fills its
     own copy inside require()/optional(), which a bare harness page never
     calls, so EGBCAuth.user() is null here even on a good sign-in. */
  const who = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).email || "(nobody)"');
  if (who === '(nobody)') {
    console.error('Could not sign in as ' + ACCOUNT.email + ' on the emulator.\n' +
                  'The comparison needs a signed-in session: without one every v2 page is blank\n' +
                  'and every page would report a false loss. Seed the account and run again.');
    sOrig.close(); sV2.close(); chrome.kill(); process.exit(2);
  }
  console.log('signed in to v2 as ' + who + '\n');

  /* And again on the originals' origin, where that run needs it. */
  if (onEmulator) {
    side = 'orig';
    await send('Page.navigate', { url: 'http://localhost:' + ORIG_PORT + '/__signin.html' });
    await sleep(4000);
    await ev('firebase.auth().signInWithEmailAndPassword(' +
      JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
    const whoOrig = await ev('((firebase.auth().currentUser)||{}).email || "(nobody)"');
    console.log('signed in to the originals as ' + whoOrig + '\n');
  }
  }

  const grab = async (which, page, shot) => {
    side = which; nowPage = page;
    watch.reset();
    const port = which === 'orig' ? ORIG_PORT : V2_PORT;
    /* Clear the tab between pages. Without this the previous page is still
       live while the next one is asked for, and a page that navigates itself
       late - several of these redirect when they decide who you are - lands on
       top of the one being measured. That is not a theory: run page by page
       and a page reports no differences at all; run it in sequence and the
       same page reported nineteen headings it had never had. */
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(500);
    /* Wipe what the last page left behind on this origin. All 51 originals
       share one origin, so they share its storage, and the training pages keep
       their whole working copy in sessionStorage - so anything one page got
       hold of was still there for the next twenty. That is how a page reported
       rows it had never loaded.
       Only the originals' origin: v2's sign-in is kept in storage on its own
       origin, and wiping that would sign every v2 page out and make the whole
       run a list of false failures. */
    await send('Storage.clearDataForOrigin', {
      origin: 'http://localhost:' + ORIG_PORT,
      storageTypes: 'local_storage,session_storage,indexeddb,websql,cache_storage,service_workers'
    });
    await send('Page.navigate', { url: 'http://localhost:' + port + '/' + encodeURI(page) });
    await sleep(which === 'orig' ? 6000 : 9000);
    /* And then prove what is actually on screen. A snapshot of the wrong page
       produces a page-long list of losses that are nothing of the kind, and
       there is no way to tell them from real ones afterwards. */
    const at = await ev('location.port + "|" + decodeURIComponent(location.pathname)');
    const wantedPort = String(port);
    const wantedName = page.toLowerCase();
    const gotPort = String(at || '').split('|')[0];
    const gotName = String(at || '').split('|')[1] || '';
    if (gotPort !== wantedPort || !gotName.toLowerCase().endsWith(wantedName)) {
      return { wrongPage: (which === 'orig' ? 'original' : 'v2') + ' ended up at ' + (at || '(nothing)') };
    }
    await ev('window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;1');
    /* The originals do not sign in - the live site has open rules and never
       needed an account - so the hook signs them in. That is asynchronous, and
       the page's first reads beat it: the rules refuse them, the page draws
       nothing, and everything v2 has then reads as a difference.
       So: wait for the sign-in, then load the page again. The second load
       starts with the session already in storage, and its reads carry it. */
    if (which === 'orig' && onEmulator) {
      const signedIn = await ev('window.__harnessSignIn || Promise.resolve("(no hook)")', true);
      if (/failed/.test(String(signedIn))) console.log('      note: the original could not sign in - ' + signedIn);
      watch.reset();
      await send('Page.navigate', { url: 'http://localhost:' + port + '/' + encodeURI(page) });
      await sleep(7000);
      await ev('window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;1');
    }
    if (shot) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      if (r.data) fs.writeFileSync(path.join(SHOTS, page.replace(/\.html$/i, '') + '--' + which + '.png'), Buffer.from(r.data, 'base64'));
    }
    /* Drive the page's main flow before measuring, where there is one: pick a
       date, pick a service, open each person or role. Revealing what is
       already on the page only shows the state it opens in, and most of what
       these pages do is behind choosing something first. The same steps run on
       both sides, in the same order, against the same data. */
    const flow = FLOWS[page];
    const flowSteps = [];
    if (flow) {
      for (const [label, code] of flow) {
        const r = await ev(code);
        await sleep(1400);
        flowSteps.push(label + ' = ' + String(r === undefined || r === null ? '' : r).slice(0, 60));
      }
    }
    await ev(REVEAL);
    await sleep(600);
    let snap = {};
    try { snap = JSON.parse(await ev(SNAPSHOT) || '{}'); } catch { snap = {}; }
    snap.errors = watch.errors.slice();
    snap.ignored = watch.ignored.slice();
    snap.flow = flowSteps;
    return snap;
  };

  const table = [];
  let ungradable = 0;
  for (const page of pages) {
    /* ...unless this run IS the one that covers it. */
    if (COVERED_BY[page] && !(only && pages.length === 1)) {
      console.log(page.padEnd(32) + 'settled by ' + COVERED_BY[page]);
      table.push({ page, a: 0, b: 0, d: 0, c: 0, losses: [], coveredBy: COVERED_BY[page] });
      continue;
    }
    const shot = wantShots;
    const a = await grab('orig', page, shot);
    const b = await grab('v2', page, shot);
    if (a.wrongPage || b.wrongPage) {
      const why = a.wrongPage || b.wrongPage;
      console.log(page.padEnd(32) + 'NOT COMPARED - ' + why);
      table.push({ page, a: 0, b: 0, c: 0, losses: [], notCompared: why });
      continue;
    }
    const diffs = [];

    for (const key of Object.keys(a.lists || {})) {
      /* An id built from Date.now() or a random string is a different id on
         every load, so the same container has a different name on the two
         sides and there is nothing to line up. Those get counted and left
         alone rather than reported as losses - sitemaker.html's rows are all
         like this, and every one of them read as a loss. */
      if (GENERATED_ID.test(key)) { ungradable++; continue; }
      const v2Rows = (b.lists || {})[key] || [];
      const miss = missingFrom(a.lists[key], v2Rows);
      if (!miss.length) continue;
      /* An empty v2 list where the original had rows is the shape of the bug
         that started all this - the Sunday planner opening with no order of
         service. That is a loss.
         Rows on both sides that do not match are a different thing: the
         original is read with no database at all and v2 is read against the
         synthetic one, so one says "No news yet" and the other lists three
         invented notices. That is data, and it is reported separately rather
         than counted as a loss - counting it would bury the real ones. */
      diffs.push({ kind: v2Rows.length ? 'list content (data)' : 'list', what: '#' + key,
        orig: a.lists[key].join(' | '), v2: v2Rows.join(' | ') || '(nothing)',
        dataOnly: v2Rows.length > 0,
        detail: miss.length + ' row(s) missing: ' + miss.slice(0, 4).join(' / ') });
    }
    for (const key of Object.keys(a.fields || {})) {
      if (GENERATED_ID.test(key)) { ungradable++; continue; }
      const A = a.fields[key], B = (b.fields || {})[key];
      if (B === undefined) diffs.push({ kind: 'field missing', what: key, orig: A, v2: '(no such field)' });
      else if (norm(A) !== norm(B) && !(DATEISH.test(A) && DATEISH.test(B)))
        diffs.push({ kind: 'field opens differently', what: key, orig: A || '(empty)', v2: B || '(empty)' });
    }
    const v2Controls = (b.controls || []).map(norm);
    const have = new Set(v2Controls);
    /* Same tag, same id, same handler - only the words on it differ. That is
       the control, reworded; it is not a control that has gone. login.html's
       "Send me a link" became "Email me a sign in link" and nothing else about
       it changed. */
    /* An id or a handler is required: without one, every plain button on the
       page would look like every other, and a control that really had gone
       would be waved through as "reworded". */
    const skeletonOf = c => {
      const p = String(c).split('|');
      return (p[1] || p[3]) ? norm(p[0] + ' | ' + (p[1] || '') + ' | ' + (p[3] || '')) : null;
    };
    const sameButton = new Set((b.controls || []).map(skeletonOf).filter(Boolean));
    for (const c of a.controls || []) {
      if (have.has(norm(c))) continue;
      const p = String(c).split('|');
      const skeleton = skeletonOf(c);
      if (skeleton && sameButton.has(skeleton)) {
        diffs.push({ kind: 'control reworded', what: c, orig: p[2], v2: p[2], dataOnly: false });
        continue;
      }
      /* Say what v2 has in its place. A bare "no match" sends you reading the
         page to find out whether the control is gone or merely renamed, which
         is work the check can do once instead of a person doing it 51 times. */
      const key = norm(c).split(' ').slice(0, 2).join(' ');
      const near = v2Controls.find(x => key && x.startsWith(key));
      diffs.push({ kind: 'control', what: c, orig: c, v2: near ? 'v2 has: ' + near : '(nothing like it in v2)' });
    }
    const heads = new Set((b.headings || []).map(norm));
    for (const h of a.headings || []) if (h && !heads.has(norm(h)))
      diffs.push({ kind: 'heading', what: h, orig: h, v2: '(no match in v2)' });

    const classed = diffs.map(d => {
      const why = agreedWhy(d.what + ' ' + (d.orig || '') + ' ' + (d.v2 || ''));
      const cls = d.dataOnly ? 'd' : why ? 'a' : (norm(d.orig) === norm(d.v2) ? 'b' : 'c');
      return { ...d, cls, why };
    });
    const losses = classed.filter(d => d.cls === 'c');
    const data = classed.filter(d => d.cls === 'd');
    /* An error on EITHER side is a failure. A page that throws is not a page
       that works, and the one time this mattered most the browser had been
       saying so in one line all along with nothing reading it. */
    const errs = [
      ...(a.errors || []).map(e => 'original: ' + e),
      ...(b.errors || []).map(e => 'v2: ' + e)
    ];
    table.push({ page, a: classed.filter(d => d.cls === 'a').length,
      b: classed.filter(d => d.cls === 'b').length, d: data.length, c: losses.length,
      losses, data, errors: errs, flow: { orig: a.flow || [], v2: b.flow || [] } });

    console.log(page.padEnd(32) + 'agreed ' + String(classed.filter(d => d.cls === 'a').length).padStart(3) +
      '   restyle ' + String(classed.filter(d => d.cls === 'b').length).padStart(3) +
      '   data ' + String(data.length).padStart(3) +
      '   LOSS ' + String(losses.length).padStart(3) +
      (errs.length ? '   ERRORS ' + errs.length : ''));
    /* What the flow did, where there was one - so a step that silently did
       nothing ("no #eventSelect", "only 1 option") is visible rather than
       being mistaken for agreement. */
    if ((a.flow || []).length) {
      for (let i = 0; i < a.flow.length; i++) {
        const sameStep = a.flow[i] === (b.flow || [])[i];
        console.log('      flow  ' + (sameStep ? '=  ' : '*  ') + a.flow[i] +
          (sameStep ? '' : '\n              v2: ' + ((b.flow || [])[i] || '(no step)')));
      }
    }
    errs.slice(0, 6).forEach(e => console.log('      ERROR  ' + e));
    losses.slice(0, 8).forEach(d => {
      console.log('      ' + d.kind + '  ' + String(d.what).slice(0, 56));
      if (d.detail) console.log('         ' + d.detail);
      else if (d.v2 !== '(no match in v2)') console.log('         original: ' + String(d.orig).slice(0, 70) +
        '\n         v2      : ' + String(d.v2).slice(0, 70));
    });
    if (losses.length > 8) console.log('      ... and ' + (losses.length - 8) + ' more');
  }

  const total = table.reduce((n, r) => n + r.c, 0);
  const skipped = table.filter(r => r.notCompared);
  if (skipped.length) {
    console.log('\nNOT COMPARED - one side did not end up on the page asked for, so there is');
    console.log('nothing to conclude about these. Run each on its own to see why:');
    for (const r of skipped) console.log('  ' + r.page + '  (' + r.notCompared + ')');
  }
  const withErrors = table.filter(r => (r.errors || []).length);
  if (withErrors.length) {
    console.log('\nPAGES WITH AN ERROR ON THE CONSOLE. A page that throws is not a page that');
    console.log('works, whichever side it is on:');
    for (const r of withErrors) {
      console.log('  ' + r.page);
      for (const e of r.errors.slice(0, 4)) console.log('      ' + e);
      if (r.errors.length > 4) console.log('      ... and ' + (r.errors.length - 4) + ' more');
    }
  }
  console.log('\npages compared: ' + (table.length - skipped.length) + ' of ' + table.length +
    '\nlive requests refused: ' + refusedLive + '   emulator requests refused to originals: ' + refusedEmu +
    '\ncontainers skipped because their id is generated: ' + ungradable +
    '\npages with a console error: ' + withErrors.length +
    '\nlosses to fix: ' + total);
  if (leaked.length) console.log('\nA v2 page tried to reach live: ' + [...new Set(leaked)].join(', '));
  if (gotData.length) {
    console.log('\n*** STOP. Data came back from somewhere off this machine, so this run read');
    console.log('*** something it should not have, and nothing in it can be trusted:');
    for (const g of [...new Set(gotData)]) console.log('      ' + g);
  }
  fs.writeFileSync(path.join(V2, 'tests', 'compare-last.json'), JSON.stringify(table, null, 1));
  console.log('full result: tests/compare-last.json');

  sOrig.close(); sV2.close(); chrome.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a file; it is in the temp directory either way. */ }
  process.exit(total || gotData.length || withErrors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
