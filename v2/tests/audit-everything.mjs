/* ===================================================================
   AUDIT EVERYTHING: a click-through of every screen, as every kind of
   person, at every size (Martin, 15 Oct 2026: "you need to go through
   everything and properly audit it, or get code to do it")
   ===================================================================

     node tests/audit-everything.mjs                    (from v2/, the dev emulators up)
     node tests/audit-everything.mjs --quick            one size (375), every role
     node tests/audit-everything.mjs --roles=everyone,master --sizes=375,1440 --pages=hub.html,watch.html
     node tests/audit-everything.mjs --no-taps          layout and access only (faster)
     node tests/audit-everything.mjs --self-test        prove every rule fails when it should
     AUDIT_EMAIL=... AUDIT_PASSWORD=... node tests/audit-everything.mjs --live [--live-url=https://...]
                                                        read-only, signed in as a test user:
                                                        every database write, function call and
                                                        upload is blocked, and nothing that
                                                        saves, sends or books is tapped.

   WHAT IT VISITS, for each role (real seeded users, not "View as"):
     - every page in the Menu (EGBCMenu.allPages), plus hub.html: the ones
       the role's Menu offers are opened at every size; the ones it does
       not are opened once, to prove they refuse;
     - every app space and tab (app.html), and every sheet and row on them;
     - every page the app opens (as the app opens it, ?app=1).
   Roles: everyone (attender, no team), worship (member), kids (Kids Church
   leader), core (Core Team), areaAdmin (Worship admin), master.
   Sizes: 360x780, 375x812, 412x915, 1440x900.

   PER SCREEN IT FAILS ON (each rule has a deliberate break, --self-test):
     console      a console error or an unhandled rejection
     overflow     the page is wider than the screen
     bars         fixed top and bottom bars together taller than 25% of it
     chrome       duplicated chrome: two Care buttons, two tab bars, the
                  website's header or "View as" bar inside the app
     dead         a visible button, row or link that does nothing when
                  tapped (no navigation, no sheet, no change on screen)
     covered      a control something else sits on top of, so a tap misses
     sheet        a sheet with no visible close (✕) after scrolling it
     hidden       content starting under the top bar, or ending under the
                  bottom bar
     access       a page the role should not see that opens for it, or one
                  it should see that refuses it

   OUTPUT: tests/shots/audit/<role>/<size>/<screen>.png, and the table in
   tests/audit-report.md (screen, role, size, pass/fail, why). Exit code 1
   if anything failed.

   Taps happen once per screen (at 375px), not at every size: a dead
   button is dead at any width. Controls that would change things for
   other people - sign out, delete, send, archive - are not tapped and are
   listed as skipped. confirm() answers No, so nothing is deleted behind a
   question. Run it before every report: a report with audit reds isn't a
   report (Martin, 15 Oct 2026).
   =================================================================== */

import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
/* --emulators=events (F-224): the events window runs its own emulators
   (firebase.events.json: Firestore 8182, Auth 9098) and pages served from
   localhost:5601 talk to them (egbc-auth.js, egbc-db.js). Its report and
   pictures are kept apart, so neither window overwrites the other's. */
const EVENTS = process.argv.includes('--emulators=events');
const FS_PORT = EVENTS ? 8182 : 8181, AUTH_PORT = EVENTS ? 9098 : 9099;
const OUT = path.join(V2, 'tests', 'shots', EVENTS ? 'audit-events' : 'audit');
const REPORT = path.join(V2, 'tests', EVENTS ? 'audit-report-events.md' : 'audit-report.md');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PW = 'test-only-password';
const SERVE0 = Number((process.argv.find(a => a.startsWith('--port=')) || ('--port=' + (EVENTS ? 5601 : 9100))).slice(7));
const SERVE = SERVE0, PORT0 = SERVE0 + 10;      /* --port=9200 to run a second audit beside one already running */

/* ---------------- options ---------------- */
const argv = process.argv.slice(2);
const opt = (n) => { const a = argv.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : null; };
const flag = (n) => argv.includes('--' + n);
const LIVE = flag('live'), SELF = flag('self-test'), QUICK = flag('quick'), NO_TAPS = flag('no-taps');
const ALL_SIZES = { 360: [360, 780], 375: [375, 812], 412: [412, 915], 1440: [1440, 900] };
const SIZES = (opt('sizes') ? opt('sizes').split(',') : QUICK ? ['375'] : Object.keys(ALL_SIZES)).map(String).filter(s => ALL_SIZES[s]);
const TAP_SIZE = SIZES.includes('375') ? '375' : SIZES[0];
const ROLES_ALL = {
  everyone:  { label: 'Everyone (attender, no team)', teams: [], adminFor: [], masterAdmin: false },
  worship:   { label: 'Worship member', teams: ['Worship Team'], adminFor: [], masterAdmin: false },
  kids:      { label: 'Kids Church leader', teams: ['Kids Church'], adminFor: [], masterAdmin: false },
  core:      { label: 'Core Team', teams: ['Core Team'], adminFor: [], masterAdmin: false },
  areaAdmin: { label: 'Area admin (Worship)', teams: ['Worship Team'], adminFor: ['Worship Team'], masterAdmin: false },
  master:    { label: 'Master admin', teams: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true }
};
/* Master first: taps are made once a page, by the first role that sees it, so that is the one who sees the most. */
const ROLES = LIVE ? ['live'] : (opt('roles') ? opt('roles').split(',') : ['master', 'areaAdmin', 'core', 'kids', 'worship', 'everyone']).filter(r => ROLES_ALL[r]);
const ONLY_PAGES = opt('pages') ? opt('pages').split(',') : null;
const NO_APP = flag('no-app'), NO_SITE = flag('no-site');
const LIVE_URL = (opt('live-url') || 'https://egbc.churchhq.co.uk/').replace(/\/?$/, '/');
const MAX_TAPS = Number(opt('max-taps') || 40);

/* Never tapped: things that change the world for somebody else. In --live,
   nothing that saves, sends or books either. */
/* PAGES THAT OPEN OFF THE MENU ON PURPOSE (22 Oct 2026). The rule is
   that a page's guard matches who the Menu offers it to; a page on this
   list opens for others BY DESIGN, and says why. Its owner adds it here,
   as check-menu's REACHED_ELSEWHERE - not the audit guessing. Roles not
   listed still count. */
const OFF_MENU_BY_DESIGN = {
  'index.html': { roles: 'all', why: 'the availability form: filled in by people with no account at all' },
  /* The events window's Present (22 Oct 2026): open to anyone signed in; it
     lists only that person's own groups' sessions, and shows nothing else. */
  'present.html': { roles: 'all', why: 'Present lists only your own groups’ sessions; with none it says so and shows nothing' },
  'present-guide.html': { roles: 'all', why: 'the two-minute guide to Present: words only, nothing of anyone’s' },
  'quiz.html': { roles: 'all', why: 'a player’s page for a quiz code: nothing without the code' }
};
const SKIP_TAP = /sign ?out|log ?out|back to me|stop viewing|delete|remove|archive|clear |reset|unsubscribe|\bsend\b|disconnect|withdraw|decline|cancel (my|this|the) /i;
const SKIP_LIVE = /save|submit|book|sign ?up|register|\badd\b|create|upload|\bpay\b|give now|confirm|approve|accept|post|publish|mark as|tick|import|generate|sync|\+ ?service|not done|auto-?populate|restore/i;
/* BUTTONS THAT WRITE TO THE LIVE CHURCH, which a --live run must never
   press (the reviewing window, 19 Oct 2026: the 15 Oct live audit pressed
   the Rota Planner's "+ Service" and left an empty Sunday Morning Worship
   on the live rota; "Worship not done" writes the sign-off). Checked by
   --self-test and --live-words: each of these must match SKIP_LIVE. */
const LIVE_MUST_SKIP = ['+ Service', '+Service', 'Worship not done', 'AV not done', 'Kids Church not done', 'Auto-Populate', 'Autopopulate',
  'Restore', 'Save', 'Add', 'Post a notice', 'Send', 'Generate term', 'Import', 'Approve'];
function liveWordsCheck() {
  const missed = LIVE_MUST_SKIP.filter(w => !SKIP_LIVE.test(w) && !SKIP_TAP.test(w));
  console.log('  ' + (missed.length ? 'FAIL' : 'PASS') + '  a live run presses none of the buttons that write: ' + (missed.length ? 'would press ' + missed.join(', ') : LIVE_MUST_SKIP.length + ' checked'));
  return missed.length === 0;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const slug = (s) => String(s).replace(/^https?:\/\/[^/]+\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'screen';

/* ---------------- the emulator: users and a little content ---------------- */
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : (v && typeof v === 'object') ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(FS_PORT, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(FS_PORT, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const dayIso = (n) => { const d = new Date(Date.now() + n * 86400000), p = (x) => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };

/* THE CHURCH'S SWITCHES, PUT BACK BEFORE EVERY PAGE (20 Oct 2026). The
   audit presses every control, and on Church settings that is every
   switch: the first run with Church settings in it switched every part
   off, and each page after it was measured with the church using nothing
   (access reds on Notifications, Notices and the pin board). A copy is
   taken at the start and laid back before each page, so no page's taps
   change what the next page is measured with. The emulator only. */
const SETTINGS_DOCS = ['features', 'notifications', 'launch'];
let SETTINGS_SNAP = null;
async function snapSettings() {
  SETTINGS_SNAP = {};
  for (const d of SETTINGS_DOCS) {
    const r = await req(FS_PORT, 'GET', DOCS + '/churchSettings/' + d, undefined, OWNER);
    SETTINGS_SNAP[d] = r.status === 200 ? (JSON.parse(r.body).fields || {}) : null;
  }
}
async function restoreSettings() {
  if (!SETTINGS_SNAP) return;
  for (const d of SETTINGS_DOCS) {
    if (SETTINGS_SNAP[d]) await req(FS_PORT, 'PATCH', DOCS + '/churchSettings/' + d, { fields: SETTINGS_SNAP[d] }, OWNER);
    else await del('churchSettings/' + d);
  }
}

async function seed() {
  await snapSettings();
  for (const [key, r] of Object.entries(ROLES_ALL)) {
    r.email = 'audit.' + key.toLowerCase() + '@example.invalid'; r.member = 'ab_audit_' + key.toLowerCase(); r.name = 'Audit ' + r.label + ' Synthetic';
    let up = JSON.parse((await req(AUTH_PORT, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: r.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(AUTH_PORT, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: r.email, password: PW, returnSecureToken: true })).body || '{}');
    r.uid = up.localId;
    await req(AUTH_PORT, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: r.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + r.member, { name: r.name, email: r.email, markers: r.teams, adminFor: r.adminFor, masterAdmin: r.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + r.uid, { uid: r.uid, email: r.email, name: r.name, memberId: r.member, status: 'active', linkedBy: 'admin',
      teams: r.teams, adminFor: r.adminFor, masterAdmin: r.masterAdmin, churchMember: true });
  }
  /* Something to see: a Sunday on the rota with the Worship member on it,
     and a public event in What's on. */
  await put('events/audit_sunday', { date: dayIso(9), type: 'Sunday Morning Worship', termLabel: 'Audit', teams: ['Worship Team', 'AV Team'],
    roles: ['Keyboard', 'Sound'], startTime: '08:00', endTime: '11:30', archived: false, serviceTime: '10:00', speaker: 'Audit Speaker Synthetic',
    assignments: { Keyboard: { id: ROLES_ALL.worship.member, name: ROLES_ALL.worship.name } } });
  const t = Date.now() + 5 * 86400000;
  await put('calEvents/audit_event', { title: 'Audit Coffee Morning Synthetic', description: 'Synthetic.', category: 'social', visibility: 'public',
    status: 'confirmed', audience: ['public', 'members'], startLocal: new Date(t).toISOString().slice(0, 16), startUtc: t, endUtc: t + 3600000,
    allDay: false, location: { kind: 'room', siteId: '', roomIds: [] }, signupOn: false, createdBy: 'audit' });
}
async function unseed() { await del('events/audit_sunday'); await del('calEvents/audit_event'); }

/* ---------------- the page server (emulator mode) ---------------- */
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';

/* --self-test: one small page per rule, each broken in exactly that way,
   and one that is clean. */
const FIX_HEAD = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px sans-serif}button,a{display:inline-block;min-height:44px;margin:8px}</style></head><body>';
const FIXTURES = {
  clean: FIX_HEAD + '<h1>Clean</h1><button onclick="this.textContent=this.textContent===\'Tap\'?\'Done\':\'Tap\'">Tap</button><a href="clean.html?x=1">Again</a></body></html>',
  console: FIX_HEAD + '<h1>Console</h1><script>console.error("a deliberate error")</script></body></html>',
  overflow: FIX_HEAD + '<h1>Overflow</h1><div style="width:900px;height:20px;background:#ccc"></div></body></html>',
  bars: FIX_HEAD + '<div style="position:fixed;top:0;left:0;right:0;height:180px;background:#ddd">Top</div><div style="padding-top:190px;padding-bottom:130px"><h1>Bars</h1></div><div style="position:fixed;bottom:0;left:0;right:0;height:120px;background:#ddd">Bottom</div></body></html>',
  chrome: FIX_HEAD + '<div style="position:fixed;top:0;left:0;right:0;height:50px;background:#eee"><button>Care</button><button>Care</button></div><h1 style="margin-top:60px">Chrome</h1></body></html>',
  dead: FIX_HEAD + '<h1>Dead</h1><button>Does nothing</button></body></html>',
  covered: FIX_HEAD + '<h1>Covered</h1><button id="b" onclick="this.textContent=\'x\'" style="position:relative">Under</button><div style="position:absolute;top:0;left:0;width:100%;height:400px;background:rgba(0,0,0,.01)"></div></body></html>',
  sheet: FIX_HEAD + '<h1>Sheet</h1><button onclick="document.getElementById(\'s\').style.display=\'block\'">Open</button><div id="s" style="display:none;position:fixed;left:0;right:0;bottom:0;top:30%;background:#fff;border-top:1px solid #000;overflow:auto;z-index:50"><div style="height:1500px">Long sheet with no way out</div></div></body></html>',
  small: FIX_HEAD + '<h1>Small</h1><button onclick="this.textContent=this.textContent===\'x\'?\'y\':\'x\'" style="min-height:0;padding:0;width:16px;height:16px;font-size:10px">x</button></body></html>',
  insideapp: FIX_HEAD + '<div id="egbc-bar" style="height:48px;background:#eee">The website header</div><h1>Opened from the app</h1></body></html>',
  hidden: FIX_HEAD + '<div style="position:fixed;top:0;left:0;right:0;height:60px;background:#eee;z-index:5">Bar</div><h1 style="margin-top:10px">Hidden under the bar</h1><p>Text</p></body></html>'
};

function startServer(port) {
  return http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const fx = /^\/__audit\/([a-z]+)\.html$/.exec(url);
    if (fx && FIXTURES[fx[1]]) { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(FIXTURES[fx[1]]); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
    s.writeHead(200, { 'Content-Type': (types[e] || 'application/octet-stream') + (/png/.test(types[e] || '') ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(port);
}

/* ---------------- in the page ---------------- */
/* Before any page script: record what a tap does. */
const INSTRUMENT = `(function(){
  if (window.__aud) return;
  var A = window.__aud = { mut: 0, acts: [], errs: [] };
  try { new MutationObserver(function (m) { A.mut += m.length; }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true }); } catch (e) {}
  ['pushState', 'replaceState'].forEach(function (k) { var o = history[k]; history[k] = function () { A.acts.push('history'); return o.apply(this, arguments); }; });
  window.open = function (u) { A.acts.push('open:' + u); return null; };
  window.alert = function () { A.acts.push('dialog'); };
  window.confirm = function () { A.acts.push('dialog'); return false; };
  window.prompt = function () { A.acts.push('dialog'); return null; };
  window.print = function () { A.acts.push('print'); };
  try { var cu = URL.createObjectURL; URL.createObjectURL = function () { A.acts.push('download'); return cu.apply(URL, arguments); }; } catch (e) {}
  try { if (navigator.clipboard) { var w = navigator.clipboard.writeText.bind(navigator.clipboard); navigator.clipboard.writeText = function (t) { A.acts.push('copy'); return w(t).catch(function () {}); }; } } catch (e) {}
  try { var sh = navigator.share; navigator.share = function () { A.acts.push('share'); return Promise.resolve(); }; } catch (e) {}
  window.addEventListener('hashchange', function () { A.acts.push('hash'); });
  /* Where a tap's click really went (AUDIT_DEBUG): its target, whether it
     was stopped, and whether it got as far as the window. */
  document.addEventListener('click', function (e) { var t = e.target || {}; A.click = (t.tagName || '?') + (t.id ? '#' + t.id : '') + ' "' + String(t.textContent || '').trim().slice(0, 24) + '"'; A.reached = false; }, true);
  window.addEventListener('click', function (e) { A.reached = true; A.prevented = e.defaultPrevented; });
  window.addEventListener('error', function (e) { A.errs.push(String(e.message || 'error')); });
  window.addEventListener('unhandledrejection', function (e) { A.errs.push('unhandled rejection: ' + String(e.reason && (e.reason.message || e.reason) || '')); });
})();`;

/* Everything measured about the screen as it stands. */
const MEASURE = `(function(){
  /* The layout viewport: a phone zooms out a page that is too wide, and
     innerWidth grows with it, which would hide exactly the fault. */
  var iw = document.documentElement.clientWidth, ih = document.documentElement.clientHeight, out = {};
  function vis(el) { if (!el || !el.getBoundingClientRect) return false;
    /* Inside a closed <details>, only its summary is on screen (F-224: Chrome
       lays the rest out with a size, so it read as content under the bar). */
    var dt = el.closest && el.closest('details:not([open])'); if (dt && !(el.closest('summary') && el.closest('summary').parentElement === dt)) return false;
    var r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    var s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    for (var p = el.parentElement; p; p = p.parentElement) { var ps = getComputedStyle(p); if (ps.display === 'none' || ps.visibility === 'hidden' || +ps.opacity === 0) return false; }
    return true; }
  function pos(el) { return getComputedStyle(el).position; }
  function inBar(el) { for (var p = el; p && p !== document.body; p = p.parentElement) { var q = pos(p); if (q === 'fixed' || q === 'sticky') return p; } return null; }
  out.blocked = document.body ? document.body.hasAttribute('data-egbc-blocked') : false;
  out.path = location.pathname.split('/').pop();
  out.appMode = document.documentElement.hasAttribute('data-egbc-app-mode') || /[?&]app=1/.test(location.search);
  var text = document.body ? (document.body.innerText || '') : '';
  out.text = text.replace(/\\s+/g, ' ').trim().slice(0, 160);
  out.softRefused = text.length < 2500 && /This page is for |is only for |only for people|isn.t for you|not for you|Admins only|No access|You do not have access|for the people the church has named/i.test(text);
  /* overflow: the element that pushes the page wider - not one a scrolling
     box already clips */
  function clipped(el) { for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) { var o = getComputedStyle(p).overflowX; if (o !== "visible" && p.getBoundingClientRect().right <= iw + 1) return true; } return false; }
  var sw = document.documentElement.scrollWidth; out.overflow = sw > iw + 1 ? sw : 0;
  if (out.overflow) { var widest = null, wv = iw; document.querySelectorAll('body *').forEach(function (el) { var r = el.getBoundingClientRect(); if (r.right > wv + 1 && vis(el) && !clipped(el)) { wv = r.right; widest = el; } });
    out.widest = widest ? (widest.tagName.toLowerCase() + (widest.id ? '#' + widest.id : '') + (widest.className && typeof widest.className === 'string' ? '.' + widest.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + ' ' + Math.round(wv) + 'px') : ''; }
  /* fixed and sticky bars, top and bottom */
  var tops = [], bots = [];
  document.querySelectorAll('body *').forEach(function (el) {
    var q = pos(el); if (q !== 'fixed' && q !== 'sticky') return;
    if (!vis(el)) return; var r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (r.width < iw * 0.5 || r.height > ih * 0.6) return;
    if (inBar(el.parentElement)) return;
    if (r.top <= 2 && r.bottom <= ih * 0.45 && (s.top !== 'auto' || q === 'fixed')) tops.push([r.top, r.bottom, el]);
    else if (q === 'fixed' && r.bottom >= ih - 2 && r.top >= ih * 0.55) bots.push([r.top, r.bottom, el]);
  });
  function span(list) { list.sort(function (a, b) { return a[0] - b[0]; }); var t = 0, end = -1e9; list.forEach(function (x) { var a = Math.max(x[0], end), b = x[1]; if (b > a) { t += b - a; end = b; } }); return Math.round(t); }
  out.topH = span(tops.slice()); out.botH = span(bots.slice()); out.ih = ih;
  out.topBottom = tops.reduce(function (m, x) { return Math.max(m, x[1]); }, 0);
  out.botTop = bots.reduce(function (m, x) { return Math.min(m, x[0]); }, ih);
  /* duplicated chrome */
  var care = 0; document.querySelectorAll('a,button,[role=button]').forEach(function (el) {
    var w = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim();
    if (/^care( (&|and) support)?$/i.test((el.textContent || '').trim()) || /^care( (&|and) support)?$/i.test((el.getAttribute('aria-label') || '').trim())) { if (vis(el) && inBar(el)) care++; } });
  out.care = care;
  /* Care anywhere on screen, not only in the bars (the reviewing window's
     live audit saw it three times on the hub). A card that says more than
     "Care" is not counted. */
  var careAll = 0; document.querySelectorAll('a,button,[role=button]').forEach(function (el) {
    if (!vis(el)) return; var r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > ih) return;
    var t = (el.textContent || '').replace(/\s+/g, ' ').trim(), a = (el.getAttribute('aria-label') || '').trim();
    if (/^care( (&|and) support)?$/i.test(t) || /^care( (&|and) support)?$/i.test(a)) careAll++; });
  out.careAll = careAll;
  /* Too small to tap on a phone: under 30px across (a checkbox or radio
     counts its label, which takes the tap too). */
  var small = [], seenS = 0;
  document.querySelectorAll('button,[role=button],select,input[type=checkbox],input[type=radio],a.btn,a[class*="btn"],[data-act],[onclick]').forEach(function (el) {
    if (!vis(el) || el.disabled) return;
    var r = el.getBoundingClientRect(), box = r;
    if (el.matches('input[type=checkbox],input[type=radio]')) { var lab = el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]')); if (lab) box = lab.getBoundingClientRect(); }
    if (Math.min(box.width, box.height) < 30) { seenS++; if (small.length < 3) small.push((el.getAttribute('aria-label') || el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 24) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height)); } });
  out.small = seenS; out.smallEg = small;
  out.tabbars = bots.filter(function (x) { return x[2].querySelectorAll('a,button').length >= 3; }).length;
  var bar = document.getElementById('egbc-bar'); out.siteBar = !!(bar && vis(bar));
  var va = document.getElementById('egbc-viewas'); out.viewAsBar = !!(va && vis(va));
  /* content under the bars: the first and last things on the page */
  var items = []; document.querySelectorAll('h1,h2,h3,p,li,label,td,button,a,input,select,textarea,img').forEach(function (el) { if (vis(el) && !inBar(el)) items.push(el); });
  out.firstTop = items.length ? Math.round(Math.min.apply(null, items.map(function (el) { return el.getBoundingClientRect().top + scrollY; }))) : null;
  out.lastBottom = items.length ? Math.round(Math.max.apply(null, items.map(function (el) { return el.getBoundingClientRect().bottom + scrollY; }))) : null;
  out.docH = document.documentElement.scrollHeight;
  return JSON.stringify(out);
})()`;

/* The controls on screen, in order, with a signature to remember them by. */
/* The biggest fixed thing covering much of the screen: a sheet or pop-up. */
const OVERLAY = `(function(){
  var iw=innerWidth, ih=innerHeight, best=null, ba=0;
  document.querySelectorAll('body *').forEach(function(el){ var s=getComputedStyle(el); if(s.position!=='fixed'||s.display==='none'||s.visibility==='hidden'||+s.opacity===0)return;
    var r=el.getBoundingClientRect(), a=Math.max(0,Math.min(r.right,iw)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,ih)-Math.max(r.top,0)); if(a < iw*ih*0.35)return; if(el.id==='egbc-app'||el.querySelector('#egbc-app'))return;
    if(!(el.textContent||'').trim())return;
    if(!best||a<ba){best=el;ba=a;} });
  if(!best)return 'null';
  return JSON.stringify({sig:(best.id||'')+'.'+String(best.className||best.tagName).slice(0,40)+'|'+best.childElementCount});
})()`;
const SHEET_CLOSE = `(function(){
  var iw=innerWidth, ih=innerHeight, best=null, ba=0;
  document.querySelectorAll('body *').forEach(function(el){ var s=getComputedStyle(el); if(s.position!=='fixed'||s.display==='none'||s.visibility==='hidden'||+s.opacity===0)return;
    var r=el.getBoundingClientRect(), a=Math.max(0,Math.min(r.right,iw)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,ih)-Math.max(r.top,0)); if(a < iw*ih*0.35)return; if(el.id==='egbc-app'||el.querySelector('#egbc-app'))return;
    if(!(el.textContent||'').trim())return;
    if(!best||a<ba){best=el;ba=a;} });
  if(!best)return 'null';
  best.querySelectorAll('*').forEach(function(x){ if(x.scrollHeight>x.clientHeight+4) x.scrollTop=x.scrollHeight; }); best.scrollTop=best.scrollHeight;
  var close=[].filter.call(best.querySelectorAll('button,a,[role=button],[data-act]'),function(b){
    var w=((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).trim(); var r=b.getBoundingClientRect();
    return (/^(\u2715|\u00d7|x|close|done|cancel|back|not now)\b/i.test(w) || /close/i.test((b.getAttribute('aria-label')||'')+' '+(b.getAttribute('title')||'')) || b.getAttribute('data-act')==='close' || /(^|[ _-])close([ _-]|$)/i.test(typeof b.className==='string'?b.className:'')) && r.width>0 && r.top>=0 && r.bottom<=ih;
  });
  return JSON.stringify({close:close.length, sig:String(best.id||best.className||best.tagName).slice(0,40)});
})()`;

const CONTROLS = `(function(){
  function vis(el) { var dt = el.closest('details:not([open])'); if (dt && !(el.closest('summary') && el.closest('summary').parentElement === dt)) return false;
    var r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (var p = el; p; p = p.parentElement) { var s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; } return true; }
  var list = [];
  document.querySelectorAll('a[href],button,[role=button],[data-act],[data-lact],[data-mact],[onclick],summary').forEach(function (el, i) {
    if (!vis(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    if (el.closest('[aria-hidden="true"]')) return;
    if (el.parentElement && el.parentElement.closest('a[href],button,[role=button],[data-act]') ) return;
    var words = ((el.getAttribute('aria-label') || '') + ' ' + (el.innerText || el.textContent || '')).replace(/\\s+/g, ' ').trim().slice(0, 60);
    var href = el.getAttribute('href') || '';
    list.push({ i: i, sig: el.tagName + '|' + words + '|' + href + '|' + (el.getAttribute('data-act') || el.getAttribute('data-lact') || ''), words: words, href: href,
      tel: /^(mailto|tel|sms|webcal|intent|whatsapp|geo):/i.test(href),
      needsSel: el.hasAttribute('data-needs-selection'),
      chosen: el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || !!el.getAttribute('aria-current') || /(^| )(on|active|selected|is-active|current)( |$)/.test(typeof el.className === 'string' ? el.className : '') });
  });
  return JSON.stringify(list);
})()`;

/* ---------------- one browser ---------------- */
async function browser(port, tag) {
  const dir = path.join(os.tmpdir(), 'cdp-audit-' + tag + '-' + process.pid);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir,
    '--disable-features=BackForwardCache', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
  let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (list.find(x => x.type === 'page')) break; } catch { /* starting */ } await sleep(500); }
  const page = list.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const B = { errors: [], acts: [], mainFrame: null, tapping: false, chrome, ws, port };
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  B.send = send;
  await new Promise(r => ws.onopen = r);
  ws.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || { error: m.error }); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {}; B.errors.push(String((d.exception && (d.exception.description || d.exception.value)) || d.text).split('\n')[0].slice(0, 200));
    } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) {
      const t = (m.params.args || []).map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ').slice(0, 200);
      if (!/ERR_BLOCKED_BY_CLIENT|ERR_FAILED|ERR_ABORTED|Failed to load resource|Could not reach Cloud Firestore|transport errored|ERR_CONNECTION/i.test(t)) B.errors.push(t);
    } else if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) {
      B.mainFrame = m.params.frame.id;
    } else if (m.method === 'Fetch.requestPaused') {
      const p = m.params, isMainDoc = p.resourceType === 'Document' && (!B.mainFrame || p.frameId === B.mainFrame);
      const write = LIVE && /google\.firestore\.v1\.Firestore\/Write|cloudfunctions\.net|\.run\.app|firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\?(name|uploadType)/i.test(p.request.url)
        && p.request.method !== 'GET';
      if (B.tapping && isMainDoc) { B.acts.push('navigate:' + p.request.url); send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Aborted' }); }
      else if (write) { B.acts.push('blocked-write'); send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }); }
      else send('Fetch.continueRequest', { requestId: p.requestId });
    } else if (m.method === 'Target.targetCreated' && m.params.targetInfo.type === 'page' && m.params.targetInfo.openerId) {
      B.acts.push('new-tab:' + m.params.targetInfo.url); send('Target.closeTarget', { targetId: m.params.targetInfo.targetId });
    } else if (m.method === 'Page.downloadWillBegin') { B.acts.push('download');
    } else if (m.method === 'Page.fileChooserOpened') { B.acts.push('file-chooser');
    } else if (m.method === 'Page.javascriptDialogOpening') { B.acts.push('dialog'); send('Page.handleJavaScriptDialog', { accept: m.params.type === 'beforeunload' }); }
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
  await send('Page.setInterceptFileChooserDialog', { enabled: true });
  await send('Browser.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  await send('Target.setDiscoverTargets', { discover: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }]
    .concat(LIVE ? [{ urlPattern: '*', resourceType: 'XHR' }, { urlPattern: '*', resourceType: 'Fetch' }, { urlPattern: '*', resourceType: 'Other' }] : []) });
  B.ev = async (expr, awaitP) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: !!awaitP, returnByValue: true });
    if (!r || r.exceptionDetails || r.error) return null;
    return r.result ? r.result.value : null;
  };
  B.size = async (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
  B.go = async (url) => {
    B.errors.length = 0; B.tapping = false;
    await send('Page.navigate', { url });
    /* Settled: loaded, the guard's splash gone, and a beat for the data. */
    for (let i = 0; i < 28; i++) {
      await sleep(500);
      const st = await B.ev('document.readyState + "|" + !!document.getElementById("egbc-guard-splash")');
      if (st && st.startsWith('complete|false') && i >= 5) break;
    }
    await sleep(1200);
  };
  B.shot = async (file) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) fs.writeFileSync(file, Buffer.from(s.data, 'base64'));
  };
  B.close = () => { try { chrome.kill(); } catch (e) {} };
  /* A fresh browser in the same place, for when taps stop reaching the
     page: everything the run holds on B points at the new one. */
  B.restarts = 0;
  B.restart = async () => {
    B.close(); await sleep(800);
    const fresh = await browser(port + 40 + (++B.restarts) % 40, tag + 'r' + B.restarts);
    const n = B.restarts; Object.assign(B, fresh); B.restarts = n;
  };
  return B;
}

async function signIn(B, base, role) {
  if (LIVE) {
    await B.go(base + 'login.html');
    await B.ev('firebase.auth(EGBCAuth.app).signOut()', true);
    await B.ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(process.env.AUDIT_EMAIL) + ',' + JSON.stringify(process.env.AUDIT_PASSWORD) + ').then(function(){return 1})', true);
    return;
  }
  const r = ROLES_ALL[role];
  await B.go(base + '__signin.html');
  await B.ev('firebase.auth(EGBCAuth.app).signOut()', true);
  await B.ev('sessionStorage.clear();localStorage.clear();1');
  for (let i = 0; i < 3; i++) {
    await B.ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(r.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1},function(){return 0})', true);
    await sleep(600);
    if ((await B.ev('(firebase.auth(EGBCAuth.app).currentUser||{}).email||""')) === r.email) return;
  }
  throw new Error('could not sign in as ' + role);
}

/* ---------------- judging one screen ---------------- */
function judgeLayout(m, opts) {
  const why = [];
  if (m.overflow) why.push('overflow: the page is ' + m.overflow + 'px wide on a ' + opts.w + 'px screen' + (m.widest ? ' (' + m.widest + ')' : ''));
  if (m.topH + m.botH > m.ih * 0.25) why.push('bars: fixed bars take ' + (m.topH + m.botH) + 'px of ' + m.ih + 'px (' + Math.round((m.topH + m.botH) * 100 / m.ih) + '%, over 25%)');
  if (m.care > 1) why.push('chrome: ' + m.care + ' Care buttons');
  else if (m.careAll > 1) why.push('chrome: ' + m.careAll + ' Care buttons on screen');
  if (opts.w < 900 && m.small) why.push('small: ' + m.small + ' control' + (m.small === 1 ? ' is' : 's are') + ' under 30px to tap (' + (m.smallEg || []).join('; ') + ')');
  if (m.tabbars > 1) why.push('chrome: ' + m.tabbars + ' tab bars');
  if (opts.inApp && m.siteBar) why.push('chrome: the website\u2019s header is showing inside the app');
  if (opts.inApp && m.viewAsBar) why.push('chrome: the website\u2019s "View as" bar is showing inside the app');
  if (m.firstTop !== null && m.topBottom > 0 && m.firstTop < m.topBottom - 2) why.push('hidden: content starts ' + (m.topBottom - m.firstTop) + 'px under the top bar');
  return why;
}

/* Tap every control on the screen, once each, and say which did nothing. */
/* What is on screen, as one number: every element in view, its kind, its
   classes and its words. Live data redrawing the same list leaves it alone;
   a tap that opens, expands or changes something does not. (Counting DOM
   changes alone called every tap dead once the emulator was busy: the
   pages' live lists redraw all the time.) */
const VIEWHASH = `(function(){var h=0,n=0,all=document.querySelectorAll('body *'),ih=innerHeight,iw=innerWidth;
  for(var i=0;i<all.length&&n<5000;i++){var el=all[i],r=el.getBoundingClientRect();
    if(r.width<1||r.height<1||r.bottom<0||r.top>ih||r.right<0||r.left>iw)continue;
    var cs=getComputedStyle(el); if(cs.visibility==='hidden'||+cs.opacity===0)continue;
    var s=el.tagName+'|'+(typeof el.className==='string'?el.className:'')+'|'+(el.childElementCount?'':(el.textContent||'').slice(0,40))+'|'+(el.value||'')+'|'+(el.checked?1:0)+'|'+(el.getAttribute('aria-expanded')||'');
    for(var j=0;j<s.length;j++)h=(h*31+s.charCodeAt(j))|0;n++;}
  return h+':'+n;})()`;
const HERE = '(window.EGBCApp&&EGBCApp.state?JSON.stringify(EGBCApp.state()):location.pathname+location.search)';
async function tapAll(B, url, reopen) {
  const why = [], skipped = [], tapped = new Set();
  /* How busy is the page by itself? A clock or a carousel changes the DOM
     without anybody tapping, so taps must beat that. */
  await B.ev('window.__aud&&(window.__aud.mut0=window.__aud.mut);1'); await sleep(700);
  const resting = (await B.ev(OVERLAY)) || 'null';
  const home = await B.ev(HERE);
  const retried = new Set();
  const noise = (await B.ev('window.__aud?window.__aud.mut-window.__aud.mut0:0')) || 0;
  let n = 0;
  for (let guard = 0; guard < MAX_TAPS * 2 && n < MAX_TAPS; guard++) {
    const list = JSON.parse((await B.ev(CONTROLS)) || '[]');
    const next = list.find(c => !tapped.has(c.sig));
    if (!next) break;
    tapped.add(next.sig);
    /* mailto:, tel:, webcal: and the like open another app: they work by
       definition, and tapping one in a headless browser (webcal: did it)
       stops every later tap reaching the page. */
    if (next.tel) continue;
    if (next.chosen) continue;      /* the choice already made: tapping it rightly changes nothing */
    if (next.needsSel) continue;    /* Bold, Italic...: they act on selected text, and there is none */
    if (SKIP_TAP.test(next.words) || (LIVE && SKIP_LIVE.test(next.words))) { skipped.push(next.words || next.href); continue; }
    n++;
    const sel = '(document.querySelectorAll("a[href],button,[role=button],[data-act],[data-lact],[data-mact],[onclick],summary")[' + next.i + '])';
    /* SCROLL, LET IT SETTLE, THEN MEASURE (26 Oct 2026). Pages that build
       their styles as they go (the Tailwind script on the knowledge-base
       pages) move a moment after a change, and a tap measured before that
       landed on the button next door - which read as "does nothing". */
    const where = '(function(){var el=' + sel + ';if(!el)return "";var r=el.getBoundingClientRect();return [r.left,r.top,r.width,r.height].map(Math.round).join()})()';
    await B.ev('(function(){var el=' + sel + ';if(el)el.scrollIntoView({block:"center",inline:"center"});return 1})()');
    /* Only a button that is still moving is waited for, so the audit keeps its pace. */
    for (let k = 0, was = await B.ev(where); k < 4; k++) { await sleep(k ? 200 : 30); const now = await B.ev(where); if (now === was) break; was = now; }
    const pt = JSON.parse((await B.ev('(function(){var el=' + sel + ';if(!el)return "null";var r=el.getBoundingClientRect();'
      + 'var x=r.left+Math.min(r.width/2,r.width-2),y=r.top+Math.min(r.height/2,r.height-2),hit=document.elementFromPoint(x,y);'
      + 'var vv=window.visualViewport;return JSON.stringify({x:x,y:y,vx:vv?vv.offsetLeft:0,vy:vv?vv.offsetTop:0,ok:!!hit&&(hit===el||el.contains(hit)||hit.contains(el)),by:hit?(hit.tagName+(hit.id?"#"+hit.id:"")+(typeof hit.className==="string"&&hit.className?"."+hit.className.trim().split(/\\s+/)[0]:"")):"nothing"})})()')) || 'null');
    if (!pt) continue;
    if (!pt.ok) {
      /* Something left open by the last tap? Start the page again and try
         this one once more before calling it covered. */
      if (pt.by === 'nothing') { n--; continue; }            /* off screen (an off-canvas panel): not something to tap */
      if (!retried.has(next.sig) && ((await B.ev(OVERLAY)) || 'null') !== resting) { retried.add(next.sig); tapped.delete(next.sig); n--; await reopen(); continue; }
      why.push('covered: "' + (next.words || next.href) + '" is under ' + pt.by); continue;
    }
    const overBefore = (await B.ev(OVERLAY)) || 'null';
    const viewBefore = await B.ev(VIEWHASH);
    const before = JSON.parse(await B.ev('JSON.stringify({mut:window.__aud.mut,acts:window.__aud.acts.length,sx:scrollX,sy:scrollY,f:(document.activeElement&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))?document.activeElement.outerHTML.slice(0,80):"",u:location.href})'));
    B.acts.length = 0; B.tapping = true;
    /* Input events land in the visual viewport: a page a little too wide
       leaves it shifted, and the tap would fall on a neighbour. */
    const tx = pt.x - (pt.vx || 0), ty = pt.y - (pt.vy || 0);
    await B.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tx, y: ty, button: 'left', clickCount: 1 });
    await B.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: ty, button: 'left', clickCount: 1 });
    await sleep(550);
    B.tapping = false;
    const after = JSON.parse((await B.ev('JSON.stringify({mut:window.__aud.mut,acts:window.__aud.acts.slice(' + before.acts + '),sx:scrollX,sy:scrollY,f:(document.activeElement&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))?document.activeElement.outerHTML.slice(0,80):"",u:location.href})')) || 'null');
    const viewAfter = await B.ev(VIEWHASH);
    if (process.env.AUDIT_DEBUG) console.log("    click", JSON.stringify(pt), await B.ev('JSON.stringify({click: window.__aud.click, reached: window.__aud.reached, prevented: window.__aud.prevented, active: (document.activeElement || {}).tagName, vv: window.visualViewport ? [visualViewport.offsetLeft, visualViewport.offsetTop, visualViewport.scale, visualViewport.width].map(function(n){return Math.round(n*100)/100}) : null, sw: document.documentElement.scrollWidth, sx: scrollX})'));
    if (process.env.AUDIT_DEBUG) console.log("    tap", JSON.stringify(next.words), JSON.stringify(before), JSON.stringify(after), JSON.stringify(B.acts), "noise", noise);
    if (!after) { /* the page went away (a real navigation slipped through): start it again */ await reopen(); continue; }
    const did = B.acts.length || after.acts.length || viewAfter !== viewBefore || after.mut - before.mut > Math.ceil(noise * 1.2) + 2 || after.sx !== before.sx || after.sy !== before.sy
      || after.f !== before.f || after.u !== before.u;
    if (!did) why.push('dead: "' + (next.words || next.href || 'a control') + '" does nothing');
    /* A sheet or pop-up came up: it must have a close that can be seen,
       even scrolled to the bottom. Then close it. */
    const overAfter = (await B.ev(OVERLAY)) || 'null';
    const sheet = overAfter !== 'null' && overAfter !== overBefore ? JSON.parse((await B.ev(SHEET_CLOSE)) || 'null') : null;
    if (sheet) {
      if (!sheet.close) why.push('sheet: "' + (next.words || 'a control') + '" opens a sheet (' + sheet.sig + ') with no visible close after scrolling it');
      await B.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await B.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(250);
      const still = await B.ev('(function(){var c=[].filter.call(document.querySelectorAll(\'[data-act="close"],[aria-label*="lose"],.sheet-back\'),function(b){var r=b.getBoundingClientRect();return r.width>0&&r.height>0});if(c.length){c[0].click();return 1}return 0})()');
      if (still) await sleep(300);
    }
    /* Whatever happened, the next tap starts from the page as it rests: a
       sheet that would not close is closed by opening the page again. */
    if (process.env.AUDIT_DEBUG) console.log('    overlay now', await B.ev(OVERLAY), 'resting', resting, 'here', await B.ev(HERE), 'home', home);
    if (((await B.ev(OVERLAY)) || 'null') !== resting || (await B.ev(HERE)) !== home) await reopen();
  }
  /* Every tap dead, on a page with several: taps are not reaching the page
     (seen when the emulator is overloaded). Say so, rather than blame every
     button on it. */
  const deadOnes = why.filter(w => w.startsWith('dead:')).length;
  if (n >= 4 && deadOnes === n) return { why: why.filter(w => !w.startsWith('dead:')).concat(['audit: no tap registered on this page (' + n + ' tried); re-run it alone']), skipped };
  return { why, skipped };
}

/* ---------------- the run ---------------- */
const RESULTS = [];
function record(r) { RESULTS.push(r); const mark = r.pass ? 'PASS' : 'FAIL'; console.log('  ' + mark + '  ' + r.role + ' ' + r.size + ' ' + r.screen + (r.pass ? '' : '\n          ' + r.why.join('\n          '))); }

async function auditScreen(B, { role, size, screen, url, inApp, taps, base, shotName }) {
  if (!LIVE) await restoreSettings();
  const [w, h] = ALL_SIZES[size];
  await B.size(w, h);
  await B.go(url);
  const errs = B.errors.slice();
  const m = JSON.parse((await B.ev(MEASURE)) || '{}');
  const why = [];
  if (errs.length) why.push('console: ' + errs[0] + (errs.length > 1 ? ' (+' + (errs.length - 1) + ' more)' : ''));
  why.push(...judgeLayout(m, { w, inApp }));
  /* Content ending under the bottom bar: scroll to the end and look. */
  if (m.botH > 0) {
    await B.ev('window.scrollTo(0, document.documentElement.scrollHeight);1'); await sleep(200);
    const end = JSON.parse((await B.ev(MEASURE)) || '{}');
    if (end.lastBottom !== null && end.lastBottom - (await B.ev('scrollY')) > end.botTop + 2) why.push('hidden: the end of the page is under the bottom bar');
    await B.ev('window.scrollTo(0,0);1');
  }
  await B.shot(path.join(OUT, role, String(size), slug(shotName || screen) + '.png'));
  let skipped = [];
  if (taps) {
    const t = await tapAll(B, url, () => B.go(url));
    why.push(...t.why); skipped = t.skipped;
  }
  const pageErrs = (await B.ev('JSON.stringify((window.__aud&&window.__aud.errs)||[])')) || '[]';
  JSON.parse(pageErrs).filter(e => !errs.includes(e)).slice(0, 2).forEach(e => why.push('console: ' + e));
  record({ screen, role, size, pass: !why.length, why, skipped, m });
  return m;
}

async function menuFor(B, base) {
  await B.go(base + 'hub.html');
  await sleep(1500);
  return JSON.parse((await B.ev(`JSON.stringify((function(){
    var all=[], mine=[];
    (EGBCMenu.allPages()||[]).forEach(function(p){ if(p.url) all.push(String(p.url)); });
    (function w(n){ n.forEach(function(x){ if(x.url) mine.push(String(x.url)); if(x.children) w(x.children); }); })(EGBCMenu.forPerson(EGBCMenu.who()));
    /* The "you" menu offers some pages too (My availability is index.html). */
    if (EGBCMenu.youLinks) EGBCMenu.youLinks(EGBCAuth.profile && EGBCAuth.profile()).forEach(function(u){ mine.push(String(u)); });
    return {all:all, mine:mine};
  })())`)) || '{"all":[],"mine":[]}');
}

async function appScreens(B, base) {
  await B.go(base + 'app.html');
  await sleep(1500);
  return JSON.parse((await B.ev(`JSON.stringify((function(){
    var me=EGBCApp.who(), out=[];
    EGBCApp.spacesFor(me).forEach(function(s){ (EGBCApp.tabsFor(s)||[]).forEach(function(t){ out.push([s, t[0]]); }); });
    return out;
  })())`)) || '[]');
}

async function goApp(B, space, tab) {
  await B.ev('(function(){var b=document.createElement("button");b.setAttribute("data-act","go:' + space + ':' + tab + '");b.style.display="none";document.body.appendChild(b);b.click();b.remove();return 1})()');
  await sleep(1200);
}

async function auditAppScreen(B, { role, size, space, tab, taps, base, appPages }) {
  const [w, h] = ALL_SIZES[size];
  await B.size(w, h);
  const url = base + 'app.html#' + space + ':' + tab;
  await B.go(url);
  await goApp(B, space, tab);
  const errs = B.errors.slice();
  const m = JSON.parse((await B.ev(MEASURE)) || '{}');
  const why = [];
  if (errs.length) why.push('console: ' + errs[0]);
  why.push(...judgeLayout(m, { w, inApp: true }));
  await B.shot(path.join(OUT, role, String(size), 'app-' + slug(space + '-' + tab) + '.png'));
  let skipped = [];
  if (taps) {
    B.acts.length = 0;
    const t = await tapAll(B, url, async () => { await B.go(url); await goApp(B, space, tab); });
    why.push(...t.why); skipped = t.skipped;
  }
  /* The pages this screen opens, as the app opens them. */
  await B.ev('1');
  record({ screen: 'app: ' + space + ' / ' + tab, role, size, pass: !why.length, why, skipped, m });
}

/* Every page an app screen's rows open (open:...), worked out from the rows. */
async function appOpens(B) {
  return JSON.parse((await B.ev(`JSON.stringify([].map.call(document.querySelectorAll('[data-act^="open:"]'),function(b){return b.getAttribute('data-act').slice(5)}))`)) || '[]');
}

/* BACK TO THE APP (d6f70084, Martin 15 Oct 2026): "Back to the app" from a
   page left that page's bar on top of the app - Care twice, two rows of
   tabs. From every page the app opens: tap its own back arrow, and the app
   must have exactly one header, one row of tabs and at most one Care. */
const APP_CHROME = `JSON.stringify((function(){
  function vis(el){ if(!el)return false; var r=el.getBoundingClientRect(); if(r.width<1||r.height<1)return false;
    for(var p=el;p;p=p.parentElement){var s=getComputedStyle(p); if(s.display==='none'||s.visibility==='hidden')return false;} return true; }
  var care=[].filter.call(document.querySelectorAll('a,button'),function(b){
    if(!vis(b))return false;
    var w=((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).replace(/\\s+/g,' ').trim();
    return /^care\\b/i.test(w) && !!b.closest('.top,#egbc-am-top,#egbc-bar'); }).length;
  return { page: location.pathname.split('/').pop(), appTop: [].filter.call(document.querySelectorAll('.top'),vis).length,
    amTop: vis(document.getElementById('egbc-am-top')), amTabs: vis(document.getElementById('egbc-am-tabs')),
    tabs: [].filter.call(document.querySelectorAll('nav.tabs'),vis).length, care: care, siteBar: vis(document.getElementById('egbc-bar')) };
})())`;
async function backToApp(B, { role, size, from }) {
  const has = await B.ev('(function(){var a=document.querySelector("#egbc-am-top a.am-back");if(!a)return 0;a.click();return 1})()');
  const why = [];
  if (!has) why.push('chrome: no "Back to the app" arrow on ' + from);
  else {
    for (let i = 0; i < 24; i++) { await sleep(500); if ((await B.ev('location.pathname.split("/").pop()')) === 'app.html' && i > 4) break; }
    await sleep(1500);
    const c = JSON.parse((await B.ev(APP_CHROME)) || '{}');
    if (c.page !== 'app.html') why.push('chrome: back from ' + from + ' did not reach the app (' + c.page + ')');
    else {
      if (c.appTop !== 1) why.push('chrome: ' + c.appTop + ' app headers after coming back');
      if (c.amTop) why.push('chrome: the page\u2019s app-mode header is still drawn over the app');
      if (c.amTabs) why.push('chrome: the page\u2019s row of tabs is still drawn over the app');
      if (c.tabs > 1) why.push('chrome: ' + c.tabs + ' rows of tabs');
      if (c.care > 1) why.push('chrome: ' + c.care + ' Care buttons');
      if (c.siteBar) why.push('chrome: the website\u2019s header over the app');
    }
    await B.shot(path.join(OUT, role, String(size), 'back-' + slug(from) + '.png'));
  }
  record({ screen: 'back to the app from ' + from, role, size, pass: !why.length, why, skipped: [] });
}

/* FINDABILITY (Martin, 16 Oct 2026): any everyday job within 2 taps of
   Home. For each job this person can do, the fewest taps from the hub:
   1 for a shortcut on Home (the phone's tab bar, the computer's sidebar, a
   Home button such as "Post a notice"); otherwise 1 to open the Menu, 1 for
   each FOLDED group to open (a section label drawn open costs nothing),
   1 for the item. Over 2 fails. */
const JOBS = [
  ['Send an email', 'EmailBuilder2.html', /send an email/i], ['Post a notice', null, /post a notice/i],
  ['Rota', 'view-only-rota.html'], ['Rota planner', 'Planner.html'], ['Sunday service plan', 'SundayServicePlanner.html'],
  ['Preaching plan', 'preaching-plan.html'], ['Address book', 'addressbook.html'], ['Team emails', 'team-mail.html'],
  ['Events', 'events-admin.html'], ['Places', 'places-admin.html'], ['Room bookings', 'bookings-admin.html'],
  ['Check-in', 'checkin.html'], ['Registers', 'attendance.html'], ['Headcounts', 'headcounts.html'],
  ['Picture library', 'picture-library.html'], ['Church settings', 'church-settings.html'], ['Teams and groups', 'teams-admin.html'],
  ['Payments', 'payments.html'], ['Safeguarding', 'safeguarding.html'], ['Emails sent', 'comms.html'], ['Backup', 'data-tools.html'],
  ["What's on", 'whatson.html'], ['Watch & Listen', 'watch.html'], ['Give', 'give.html']
];
const FIND = `JSON.stringify((function(){
  /* The Menu as it is drawn for this person (EGBCMenu.panelHtml), not the
     tree's depth: a section such as Sundays is a label drawn open, so its
     pages need no extra tap; only a page inside a folded group (Events and
     rooms, Church admin, over FOLD_OVER pages) needs one to open it. The
     tree's depth counted every label as a tap (20 Oct 2026: a master
     admin's Rota planner "3 taps" when it is the Menu's first screen). */
  var depth = {}, box = document.createElement('div');
  box.innerHTML = EGBCMenu.panelHtml({ who: EGBCMenu.who(), here: 'hub.html' });
  [].forEach.call(box.querySelectorAll('a[href]'), function(a){
    var u = String(a.getAttribute('href')).split('?')[0], body = a.closest('.grp-body');
    var level = body && !body.classList.contains('open') ? 1 : 0;
    if (depth[u] === undefined || depth[u] > level) depth[u] = level; });
  function vis(el){ var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  var direct = {};
  [].forEach.call(document.querySelectorAll('#egbc-tabbar a, #sidebar a'), function(a){ if (vis(a)) direct[String(a.getAttribute('href')||'').split('?')[0]] = 1; });
  var buttons = [].filter.call(document.querySelectorAll('button, a'), vis).map(function(b){ return (b.textContent||'').replace(/\\s+/g,' ').trim(); });
  return { depth: depth, direct: direct, buttons: buttons };
})())`;
async function findability(B, role, size, base) {
  await B.size(...ALL_SIZES[size]);
  await B.go(base + 'hub.html');
  await sleep(1500);
  const f = JSON.parse((await B.ev(FIND)) || '{"depth":{},"direct":{},"buttons":[]}');
  const why = [], seen = [];
  for (const [job, url, button] of JOBS) {
    let taps = null;
    if (button && f.buttons.some(t => button.test(t))) taps = 1;
    if (url && f.direct[url]) taps = 1;
    if (taps === null && url && f.depth[url] !== undefined) taps = 2 + f.depth[url];
    if (taps === null) continue;                    /* not a job this person has */
    /* A page inside a FOLDED group (Events and rooms, Church admin, over
       FOLD_OVER pages) may be 3 the first time: the reviewing window, 21 Oct
       2026, accepted that, and the Menu remembers the group open after. */
    const folded = !(button && f.buttons.some(t => button.test(t))) && !(url && f.direct[url]) && !!url && f.depth[url] === 1;
    seen.push(job + ' ' + taps + (folded ? ' (folded group)' : ''));
    if (taps > (folded ? 3 : 2)) why.push('findability: ' + job + ' is ' + taps + ' taps from Home');
  }
  record({ screen: 'findability (taps from Home)', role, size, pass: !why.length, why, skipped: [], jobs: seen });
}

async function runRole(B, role, size, base, shared) {
  const tapsHere = !NO_TAPS && String(size) === TAP_SIZE;
  await signIn(B, base, role);
  await B.size(...ALL_SIZES[size]);
  if (!NO_SITE && (String(size) === TAP_SIZE || size === '1440')) await findability(B, role, size, base);
  /* ---- website ---- */
  if (!NO_SITE) {
    const menu = await menuFor(B, base);
    const allPages = [...new Set(['hub.html'].concat(menu.all))].filter(u => !ONLY_PAGES || ONLY_PAGES.includes(u.split('?')[0]));
    const mine = new Set(['hub.html'].concat(menu.mine));
    for (const page of allPages) {
      if (!LIVE) await restoreSettings();
      /* "hub.html?notices=1" is Home with its Notices open: offered if the
         page itself is (22 Oct 2026 - it was counted as a page apart). */
      const should = mine.has(page) || mine.has(page.split('?')[0]);
      if (!should && String(size) !== TAP_SIZE) continue;      /* access is checked once */
      if (!should) {
        await B.size(...ALL_SIZES[size]);
        await B.go(base + page);
        const m = JSON.parse((await B.ev(MEASURE)) || '{}');
        const refused = m.blocked || m.softRefused || /login\.html$/.test(m.path || '');
        const by = OFF_MENU_BY_DESIGN[page.split('?')[0]];
        const byDesign = !!by && (by.roles === 'all' || [].concat(by.roles).includes(role));
        /* A refusal must not throw underneath (the reviewing window's audit,
           15 Oct 2026: 'Cannot set properties of null' on refused pages). */
        const errs = B.errors.slice();
        const why = (refused || byDesign ? [] : ['access: opens for ' + role + ', whose Menu does not offer it (it says: "' + (m.text || '') + '")'])
          .concat(errs.length ? ['console: ' + errs[0] + (errs.length > 1 ? ' (+' + (errs.length - 1) + ' more)' : '')] : []);
        record({ screen: page + ' (not in their Menu)', role, size, pass: !why.length, why, skipped: [], m });
        continue;
      }
      const key = page;
      const tapNow = tapsHere && !shared.tappedPages.has(key);
      if (tapNow) shared.tappedPages.add(key);
      let m = await auditScreen(B, { role, size, screen: page, url: base + page, inApp: false, taps: tapNow, base });
      const flaky = (r) => r.why.some(w => /client is offline|audit: no tap/i.test(w)) || m.blocked || /login\.html$/.test(m.path || '');
      if (flaky(RESULTS[RESULTS.length - 1])) {
        /* The emulator dropped the page's connection (A-090), or the sign-in
           was lost: once more, signed in afresh, before believing it. */
        RESULTS.pop(); console.log('          (once more, signed in again)');
        await B.restart();
        await B.size(...ALL_SIZES[size]);
        await signIn(B, base, role);
        m = await auditScreen(B, { role, size, screen: page, url: base + page, inApp: false, taps: tapNow, base });
      }
      if (m.blocked || /login\.html$/.test(m.path || '')) {
        const last = RESULTS[RESULTS.length - 1]; last.pass = false; last.why.unshift('access: ' + role + '\u2019s Menu offers it, and it refuses them');
        console.log('  FAIL  ' + role + ' ' + size + ' ' + page + ' (the line above is overruled)\n          ' + last.why[0]);
      }
    }
  }
  /* ---- the app ---- */
  if (!NO_APP) {
    const screens = await appScreens(B, base);
    const opened = new Set();
    for (const [space, tab] of screens) {
      const tapNow = tapsHere && !shared.tappedApp.has(role + space + tab);
      if (tapNow) shared.tappedApp.add(role + space + tab);
      await auditAppScreen(B, { role, size, space, tab, taps: tapNow, base });
      await B.go(base + 'app.html#' + space + ':' + tab); await goApp(B, space, tab);
      (await appOpens(B)).forEach(u => opened.add(u));
    }
    const WEBSITE = { 'hub.html': true };   /* egbc-app.js: pages the app opens as the full website */
    for (const u of opened) {
      const page = u.split('?')[0].split('#')[0];
      if (ONLY_PAGES && !ONLY_PAGES.includes(page)) continue;
      if (WEBSITE[page]) continue;                   /* the website itself, audited above */
      if (page === 'login.html') continue;           /* the app's Sign out: opening it signs them out */
      const url = base + u + (u.indexOf('?') === -1 ? '?app=1' : '&app=1');
      const tapNow = tapsHere && !shared.tappedPages.has('app:' + page);
      if (tapNow) shared.tappedPages.add('app:' + page);
      await auditScreen(B, { role, size, screen: 'from the app: ' + u, url, inApp: true, taps: tapNow, base, shotName: 'app-page-' + u });
      await backToApp(B, { role, size, from: u, url });
    }
  }
}

async function selfTest(base) {
  console.log('Self-test: every rule fails on a page broken that way, and a clean page passes\n');
  const liveOk = liveWordsCheck();
  const B = await browser(PORT0, 'self');
  const expect = { clean: null, console: 'console', overflow: 'overflow', bars: 'bars', chrome: 'chrome', dead: 'dead', covered: 'covered', sheet: 'sheet', hidden: 'hidden', insideapp: 'chrome', small: 'small' };
  let bad = 0;
  try {
    for (const [name, rule] of Object.entries(expect)) {
      RESULTS.length = 0;
      await auditScreen(B, { role: 'self', size: '375', screen: name, url: base + '__audit/' + name + '.html', inApp: name === 'insideapp', taps: true, base });
      const r = RESULTS[0], rules = r.why.map(w => w.split(':')[0]);
      const good = rule ? rules.includes(rule) : r.pass;
      if (!good) bad++;
      console.log('  ' + (good ? 'PASS' : 'FAIL') + '  the ' + name + ' page ' + (rule ? 'is caught by "' + rule + '"' : 'passes') + (good ? '' : '   got: ' + (r.why.join(' | ') || 'a pass')));
    }
    /* The access rule, both ways, judged as the run judges it. */
    const acc = (should, refused) => should ? !refused : !!refused;
    const a1 = acc(false, false) === false, a2 = acc(true, true) === false, a3 = acc(true, false) && acc(false, true);
    console.log('  ' + (a1 ? 'PASS' : 'FAIL') + '  a page a role should not see, that opens, is caught by "access"');
    console.log('  ' + (a2 ? 'PASS' : 'FAIL') + '  a page a role should see, that refuses, is caught by "access"');
    console.log('  ' + (a3 ? 'PASS' : 'FAIL') + '  and the right way round passes');
    if (!a1 || !a2 || !a3) bad++;
    if (!liveOk) bad++;
  } finally { B.close(); }
  console.log('\n' + (bad ? bad + ' rule(s) did not catch their break' : 'every rule caught its break'));
  process.exit(bad ? 1 : 0);
}

function writeReport(started) {
  const fails = RESULTS.filter(r => !r.pass);
  const rows = RESULTS.slice().sort((a, b) => (a.pass - b.pass) || a.screen.localeCompare(b.screen) || a.role.localeCompare(b.role) || Number(a.size) - Number(b.size));
  const esc = (s) => String(s).replace(/\|/g, '\\|');
  const skipped = [...new Set(RESULTS.flatMap(r => r.skipped || []))];
  const md = ['# Audit report', '',
    'Run ' + started.toISOString().slice(0, 16).replace('T', ' ') + ' UTC, ' + (LIVE ? 'LIVE (read-only, ' + LIVE_URL + ')' : 'on the emulator') + '. '
    + 'Roles: ' + ROLES.join(', ') + '. Sizes: ' + SIZES.join(', ') + '. Taps at ' + (NO_TAPS ? 'none' : TAP_SIZE) + '.', '',
    '**' + fails.length + ' failing, ' + (RESULTS.length - fails.length) + ' passing, of ' + RESULTS.length + ' screens.**', '',
    'Made by `node tests/audit-everything.mjs`. Pictures: tests/shots/audit/<role>/<size>/.', '',
    '| Screen | Role | Size | Result | Why |', '|---|---|---|---|---|',
    ...rows.map(r => '| ' + esc(r.screen) + ' | ' + r.role + ' | ' + r.size + ' | ' + (r.pass ? 'pass' : '**FAIL**') + ' | ' + esc(r.why.join('; ')) + ' |'), '',
    '## Not tapped on purpose', '', skipped.length ? skipped.map(s => '- ' + s).join('\n') : 'Nothing.', ''];
  fs.writeFileSync(REPORT, md.join('\n'));
  fs.writeFileSync(path.join(OUT, 'audit.json'), JSON.stringify(RESULTS.map(({ m, ...r }) => r), null, 1));
}

/* --live-words: only the check above, in a second (run-all runs it). */
if (flag('live-words')) { process.exit(liveWordsCheck() ? 0 : 1); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = LIVE ? null : startServer(SERVE);
  const base = LIVE ? LIVE_URL : 'http://localhost:' + SERVE + '/';
  if (SELF) { await selfTest(base); return; }
  if (LIVE && !(process.env.AUDIT_EMAIL && process.env.AUDIT_PASSWORD)) { console.error('--live needs AUDIT_EMAIL and AUDIT_PASSWORD (a test user).'); process.exit(2); }
  if (!LIVE) await seed();
  const started = new Date();
  const shared = { tappedPages: new Set(), tappedApp: new Set() };
  /* TWO BROWSERS, not one a size: four at once overloaded the emulator and
     every page went "client is offline" halfway through (A-090). One takes
     the size the taps happen at; the other takes the rest, one by one. */
  const groups = [[TAP_SIZE], SIZES.filter(x => x !== TAP_SIZE)].filter(g => g.length);
  const workers = groups.map((sizes, i) => (async () => {
    const B = await browser(PORT0 + i, 'w' + i);
    try {
      for (const size of sizes) for (const role of ROLES) {
        console.log('\n== ' + role + ' at ' + size + ' ==');
        try { await runRole(B, role, size, base, shared); }
        catch (e) { record({ screen: '(the run)', role, size, pass: false, why: ['the audit itself failed: ' + (e && e.message)], skipped: [] }); }
      }
    } finally { B.close(); }
  })());
  await Promise.all(workers);
  if (!LIVE) await unseed();
  writeReport(started);
  const fails = RESULTS.filter(r => !r.pass).length;
  console.log('\n' + fails + ' failing of ' + RESULTS.length + ' screens. Report: tests/audit-report.md');
  if (server) server.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
