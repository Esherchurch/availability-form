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
/* No run without test stand-ins for every secret: the functions emulator
   would fetch a missing one from the live project (ENGINEERING.md). */
{
  const { missingStandIns } = await import('../tools/secret-stand-ins.mjs');
  const miss = missingStandIns();
  if (miss.length) { console.error('REFUSED: no stand-in in functions/.secret.local for ' + miss.join(', ') + '. Run: node tools/secret-stand-ins.mjs, then start the emulators again.'); process.exit(2); }
}
/* --emulators=events (F-224): the events window runs its own emulators
   (firebase.events.json: Firestore 8182, Auth 9098) and pages served from
   localhost:5601 talk to them (egbc-auth.js, egbc-db.js). Its report and
   pictures are kept apart, so neither window overwrites the other's. */
const EVENTS = process.argv.includes('--emulators=events');
/* --emulators=spare (the going-live test, Stage 2): the spare emulators
   (firebase.spare.json), which load the locked rules. Pages ask for the dev
   ports, so the server swaps the spare ones in, as tests/stage2/harness.mjs
   does. Its report and pictures are kept apart too. */
const SPARE = process.argv.includes('--emulators=spare');
const SPARE_PORTS = { 8181: 8171, 9099: 9089, 9199: 9189, 5101: 5191 };
const FS_PORT = EVENTS ? 8182 : SPARE ? 8171 : 8181, AUTH_PORT = EVENTS ? 9098 : SPARE ? 9089 : 9099;
const OUT = path.join(V2, 'tests', 'shots', EVENTS ? 'audit-events' : SPARE ? 'audit-spare' : 'audit');
const REPORT = path.join(V2, 'tests', EVENTS ? 'audit-report-events.md' : SPARE ? 'audit-report-spare.md' : 'audit-report.md');
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
  master:    { label: 'Master admin', teams: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true },
  /* The Kids Church Sunday's people (the going-live test, Stage 3), only
     when asked for by --roles; --seed gives them their groups, families
     and the safeguarding lead's place. */
  kidsLead:    { label: 'Kids Church lead', teams: ['Kids Church'], adminFor: ['Kids Church'], masterAdmin: false, stage3: true },
  groupLeader: { label: 'Children’s group leader', teams: ['Kids Church'], adminFor: [], masterAdmin: false, stage3: true },
  sgLead:      { label: 'Safeguarding lead (no team)', teams: [], adminFor: [], masterAdmin: false, stage3: true },
  /* PEOPLE WITH A ROLE AND NO TEAM (Martin, 5 Nov 2026: the second time one was shut out, after the F-324
     register). Each is named in their role by the seed - the site's deputy, its health and safety lead and
     fire lead, an event's organiser, a bookings admin - and is on no team, as at many churches. */
  sgDeputy:    { label: 'Safeguarding deputy (no team)', teams: [], adminFor: [], masterAdmin: false, stage3: true },
  hsLead:      { label: 'Health and safety lead (no team)', teams: [], adminFor: [], masterAdmin: false, stage3: true },
  fireLead:    { label: 'Fire safety lead (no team)', teams: [], adminFor: [], masterAdmin: false, stage3: true },
  organiser:   { label: 'Event organiser (no team)', teams: [], adminFor: [], masterAdmin: false, stage3: true },
  bookingsAdmin: { label: 'Bookings admin (no team)', teams: [], adminFor: [], masterAdmin: false, stage3: true },
  parent:      { label: 'Parent (no team)', teams: [], adminFor: [], masterAdmin: false, stage3: true },
  /* A young person's phone: their code's sign-in (claim youth: true) and
     no users record; --seed gives them their youthAccess. */
  youth:       { label: 'Young person (access code)', teams: [], adminFor: [], masterAdmin: false, stage3: true, claims: { youth: true }, noUser: true }
};
/* Master first: taps are made once a page, by the first role that sees it, so that is the one who sees the most. */
const ROLES = LIVE ? ['live'] : (opt('roles') ? opt('roles').split(',') : ['master', 'areaAdmin', 'core', 'kids', 'worship', 'everyone']).filter(r => ROLES_ALL[r]);
let ONLY_PAGES = opt('pages') ? opt('pages').split(',') : null;
/* --also=a.html,b.html: pages in nobody's Menu to visit as well (the
   going-live test's first-stage list), on top of ALSO_AUDIT. */
const ALSO_OPT = opt('also') ? opt('also').split(',') : [];
/* --pages-file=list.txt: the same list from a file, for names a shell
   mangles ("training Sunday planner.html", "EGBCWorship&AV.html"). The
   pages are both the only ones visited and visited even off the Menu. */
if (opt('pages-file')) {
  const list = fs.readFileSync(opt('pages-file'), 'utf8').split(',').map((x) => x.trim()).filter(Boolean);
  ONLY_PAGES = list; ALSO_OPT.push(...list);
}
const NO_APP = flag('no-app'), NO_SITE = flag('no-site');
const LIVE_URL = (opt('live-url') || 'https://egbc.churchhq.co.uk/').replace(/\/?$/, '/');
const MAX_TAPS = Number(opt('max-taps') || 40);
/* --every (the going-live test, Stage 2; the reviewer, 2 Nov 2026: "press
   each control as every kind of person who can see it, not just the first
   one... at phone and desktop size"): taps on every screen, for every role,
   at every size asked for; fields are filled too; and each control used is
   written down by its code keys (tools/control-inventory.mjs) in
   tests/out/controls-reached.json, so the inventory can say N of N. */
const EVERY = flag('every');
/* --press-all (the going-live test, Stage 3; emulators only): delete, send
   and the rest are pressed too - confirm() answers No and nothing leaves
   the machine - so only signing out and View as stay unpressed. */
const PRESS_ALL = flag('press-all') && !process.argv.includes('--live');
const SKIP_ALWAYS = /sign ?out|log ?out|back to me|stop viewing/i;
/* --states=file.mjs (Stage 3): screens deeper than a page's first view. Its
   default export is [{ name, url, roles: [...] | 'all', steps: [js, 'wait:selector', ...] }];
   each is opened, its steps run in the page, then audited like any screen,
   and the steps run again after every press. */
let STATES = [];
async function loadStates() {
  if (!opt('states')) return;
  const { pathToFileURL } = await import('node:url');
  STATES = (await import(pathToFileURL(path.resolve(opt('states'))).href)).default;
}
async function runSteps(B, steps) {
  for (const st of steps || []) {
    if (st === 'scope') { await B.ev(MARK_SCOPE); continue; }
    if (String(st).startsWith('wait:')) {
      const sel = JSON.stringify(String(st).slice(5));
      for (let i = 0; i < 40 && !(await B.ev('!!document.querySelector(' + sel + ')')); i++) await sleep(250);
    } else { await B.ev('(function(){try{' + st + '}catch(e){}return 1})()'); await settle(B, 200, 1500); }
  }
}
/* Until the page holds still: its size read every 250 ms, the same twice running, after at least
   min ms and at most max. Fixed sleeps (700 ms a step, 4.2 s a page) made a Stage 3 screen take
   over a minute, since a state's steps run again after every press (4 Nov 2026); data still
   arriving changes the size, so it is waited for, and a page with a clock waits the full max. */
const STILL = '(document.body?document.body.innerHTML.length+"|"+document.getElementsByTagName("*").length:"")';
async function settle(B, min, max) {
  await sleep(min);
  let last = await B.ev(STILL), same = 0;
  for (let t = min; t < max && same < 2; t += 250) { await sleep(250); const now = await B.ev(STILL); same = now === last ? same + 1 : 0; last = now; }
}
const REACHED = [], SKIPPED_KEYS = [], SHARED_SHEETS = new Set();
/* A FILE PICKER IS GIVEN A MADE-UP FILE (5 Nov 2026: "every control"). The one its accept= asks for -
   a tiny picture, a one-page PDF, or plain words - written once, named as made up. Given straight to a
   picker on the page, or to the one a button opens (the browser's chooser, intercepted). On the
   emulators it is uploaded as a person's would be; live, the upload is blocked like any other write. */
const MADE_UP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-files-'));
const MADE_UP = {
  png: ['made-up picture (synthetic).png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')],
  pdf: ['made-up page (synthetic).pdf', Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')],
  txt: ['made-up notes (synthetic).txt', Buffer.from('Made-up words for a test (synthetic). No real person.\n')]
};
function madeUpFile(accept) {
  const a = String(accept || '').toLowerCase();
  const kind = /image|\.png|\.jpe?g/.test(a) && !/pdf/.test(a) ? 'png' : /pdf/.test(a) ? 'pdf' : /text|\.txt/.test(a) ? 'txt' : a ? 'png' : 'txt';
  const f = path.join(MADE_UP_DIR, MADE_UP[kind][0]);
  if (!fs.existsSync(f)) fs.writeFileSync(f, MADE_UP[kind][1]);
  return f;
}
const REACHED_FILE = path.join(V2, 'tests', 'out', EVENTS ? 'controls-reached-events.json' : 'controls-reached.json');
const { KEYS_JS } = await import('../tools/control-inventory.mjs');
function saveReached() {
  if (SELF) return;   /* never from --self-test (see saveProgress) */
  fs.mkdirSync(path.dirname(REACHED_FILE), { recursive: true });
  fs.writeFileSync(REACHED_FILE, JSON.stringify(REACHED));
  fs.writeFileSync(REACHED_FILE.replace(/\.json$/, '-skipped.json'), JSON.stringify(SKIPPED_KEYS));
}

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
  'quiz.html': { roles: 'all', why: 'a player’s page for a quiz code: nothing without the code' },
  /* F-293 (the events window): anyone may open it to report a concern; they
     see only that, or "no events for you here". */
  'safeguarding.html': { roles: 'all', why: 'report a concern: open to anyone; the lead’s parts only for the lead' },
  /* The main window's, decided 2 Nov 2026 (the reviewer: a page opened by
     someone it isn't for says so; instruction pages open to anyone signed
     in). tests/stage2/off-menu-pages.mjs proves nothing private shows. */
  'song-summary.html': { roles: 'all', why: 'a Sunday plan email\'s song list: signed in reaches it, the rules let only that Sunday\'s people read it, and anyone else is told so' },
  'rotaplannerinstructions.html': { roles: 'all', why: 'words only, for anyone signed in; linked from the Rota planner' },
  'Serviceplannerinstructions.html': { roles: 'all', why: 'words only, for anyone signed in; linked from the service planners' },
  'uploaderinstructions.html': { roles: 'all', why: 'words only, for anyone signed in; linked from the Music Uploader' },
  'emailcompilerinstructions.html': { roles: 'all', why: 'words only, for anyone signed in; linked from Send an email' },
  'worshiphubapp.html': { roles: ['worship', 'areaAdmin', 'core', 'master'], why: 'the installed Worship Hub app, for the worship team and those covering it' },
  'CoreTeamApp.html': { roles: ['core', 'master'], why: 'the core teams\' own installed app' },
  'AVteamlandingpage.html': { roles: ['worship', 'areaAdmin', 'core', 'master'], why: 'the AV team\'s installed app: Worship and AV are one team; and those covering them' },
  'EGBCWorship&AV.html': { roles: ['worship', 'areaAdmin', 'core', 'master'], why: 'the worship team’s installed app, and those covering it' },
  'sundayplannersonglibrary.html': { roles: ['worship', 'areaAdmin', 'core', 'master'], why: 'opened from the Sunday planner, for the worship team' },
  'music-uploader.html': { roles: ['areaAdmin', 'core', 'master'], why: 'opened from the planners\' Upload Song, for worship leaders and the core teams covering them' },
  'trainingportalhub.html': { roles: ['worship', 'areaAdmin', 'core', 'master'], why: 'Worship Training\'s Practice planners, for the worship team' },
  'trainingmusicdatabase.html': { roles: ['worship', 'areaAdmin', 'core', 'master'], why: 'a practice copy, for the worship team' },
  'training Sunday planner.html': { roles: ['areaAdmin', 'core', 'master'], why: 'a practice copy, for worship leaders' },
  'trainingbatchimporter.html': { roles: ['areaAdmin', 'core', 'master'], why: 'a practice copy, for worship leaders' },
  'trainingrotaplanner.html': { roles: ['areaAdmin', 'core', 'master'], why: 'a practice copy, for leaders' },
  'mix-builder.html': { roles: ['master'], why: 'Martin\'s own mix tools: master admins on the hub' },
  'mix-player.html': { roles: ['master'], why: 'Martin\'s own mix tools: master admins on the hub' },
  'mix-analyser.html': { roles: ['master'], why: 'Martin\'s own mix tools: master admins on the hub' },
  /* A young person has no Menu: their code's page (youth-access.html) opens the Hub (5 Nov 2026). */
  'youthapp2.html': { roles: ['youth', 'master'], why: 'a young person opens it from their code\'s page, youth-access; master admins from the hub' }
};
/* OTHER WINDOWS' PAGES IN NOBODY'S MENU, pressed in an --every run by the
   people their own guard lets in (3 Nov 2026). Who may open them is still
   judged as before; this only says who presses them. */
const PRESS_AS = {
  'birthday.html': ['core', 'master'],                 /* data-core-of="worship" */
  'youthapp2.html': ['master'],                        /* youth groups, their admins, master admins */
  'youth-access.html': 'all',                          /* the young people's own sign-in */
  'sg-print.html': 'all', 'event-ra.html': 'all', 'ra-print.html': 'all', 'assessment.html': 'all'
};
/* PAGES IN NOBODY'S MENU THAT ARE AUDITED ANYWAY: reached from another page
   (check-menu's REACHED_ELSEWHERE), so menuFor() never lists them. */
const ALSO_AUDIT = ['sg-print.html',   /* the reviewing window, F-296 item 3 */
  'assessment.html',                    /* and F-299: it is in the Menu too, listed so it is never missed */
  'event-ra.html',                      /* F-301, for the final test */
  'ra-print.html'];                     /* and F-302 */
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
/* a Date is a timestamp (a youth code's expiry is read with toDate()); a fraction a double */
const val = (v) => v instanceof Date ? { timestampValue: v.toISOString() } : v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
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
    if (r.stage3 && !ROLES.includes(key)) continue;
    r.email = 'audit.' + key.toLowerCase() + '@example.invalid'; r.member = 'ab_audit_' + key.toLowerCase(); r.name = 'Audit ' + r.label + ' Synthetic';
    let up = JSON.parse((await req(AUTH_PORT, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: r.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(AUTH_PORT, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: r.email, password: PW, returnSecureToken: true })).body || '{}');
    r.uid = up.localId;
    await req(AUTH_PORT, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', Object.assign({ localId: r.uid, emailVerified: true }, r.claims ? { customAttributes: JSON.stringify(r.claims) } : {}), OWNER);
    if (r.noUser) continue;
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
/* --seed=file.mjs: what a test's people need besides their sign-in (its
   default export gets { put, del, roles, dayIso }). */
async function seedMore() {
  if (!opt('seed')) return;
  const { pathToFileURL } = await import('node:url');
  await (await import(pathToFileURL(path.resolve(opt('seed'))).href)).default({ put, del, roles: ROLES_ALL, dayIso });
  /* its switches are the ones laid back before each page (4 Nov 2026: the copy was taken before it ran, so the
     hub it set live was put back to not live before every page, and the quiz on phones was always refused) */
  await snapSettings();
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
  hidden: FIX_HEAD + '<div style="position:fixed;top:0;left:0;right:0;height:60px;background:#eee;z-index:5">Bar</div><h1 style="margin-top:10px">Hidden under the bar</h1><p>Text</p></body></html>',
  /* THE THREE JUDGING CHANGES OF 6 NOV 2026, each both ways (Martin: "prove
     the change still catches a real fault"). */
  /* A button clipped away in a shut fold is not on screen: passes. */
  foldok: FIX_HEAD + '<h1>A shut fold</h1><button onclick="this.textContent=this.textContent===\'Tap\'?\'Done\':\'Tap\'">Tap</button><div style="max-height:0;overflow:hidden"><button onclick="this.textContent=\'x\'">In a shut fold</button></div></body></html>',
  /* A button in an OPEN fold with something over it is still covered. */
  foldcovered: FIX_HEAD + '<h1>An open fold</h1><div style="overflow:hidden;position:relative"><button onclick="this.textContent=\'x\'">Under, in an open fold</button><div style="position:absolute;inset:0;background:rgba(0,0,0,.01)"></div></div></body></html>',
  /* A state that is an open window: the page's buttons behind it are not its to press. Passes. */
  windowok: FIX_HEAD + '<h1>The page</h1><button onclick="this.textContent=\'x\'">Behind one</button><button onclick="this.textContent=\'y\'">Behind two</button><div style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:110;overflow:auto;padding:24px"><div style="background:#fff;padding:16px"><h2>The window</h2><button onclick="this.textContent=this.textContent===\'Tap\'?\'Done\':\'Tap\'">Tap</button></div></div></body></html>',
  /* The same window with a button covered INSIDE it: still covered. */
  windowcovered: FIX_HEAD + '<h1>The page</h1><div style="position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:110;overflow:auto;padding:24px"><div style="background:#fff;padding:16px"><h2>The window</h2><div style="position:relative"><button onclick="this.textContent=\'x\'">Under, in the window</button><div style="position:absolute;inset:0;background:rgba(0,0,0,.01)"></div></div></div></div></body></html>',
  /* A window that is absolute, not fixed, over the main area with a dim backdrop (the training portal's): passes. */
  windowabs: FIX_HEAD + '<div style="position:relative;min-height:600px"><h1>The page</h1><button onclick="this.textContent=\'x\'">Behind one</button><div style="position:absolute;inset:0;background:rgba(20,32,31,.5);display:flex;align-items:center;justify-content:center"><div style="background:#fff;padding:16px"><h2>The window</h2><button onclick="this.textContent=this.textContent===\'Tap\'?\'Done\':\'Tap\'">Tap</button></div></div></div></body></html>',
  /* The same place with a near-clear absolute cover, also judged as a state: not a window, still covered. */
  windowclear: FIX_HEAD + '<div style="position:relative;min-height:600px"><h1>The page</h1><button onclick="this.textContent=\'x\'">Under a faint cover</button><div style="position:absolute;inset:0;background:rgba(0,0,0,.01)"></div></div></body></html>',
  /* A bottom bar with an open window over it, the window longer than the screen: its end is not "hidden". Passes. */
  barok: FIX_HEAD + '<h1>A bar under a window</h1><div style="height:1500px">The page</div><div style="position:fixed;left:0;right:0;bottom:0;height:56px;background:#eee;z-index:40">Bottom bar</div><div style="position:fixed;inset:0;z-index:110;background:rgba(0,0,0,.4);overflow:auto;padding:24px"><div style="background:#fff;padding:16px"><h2>The window</h2><p style="height:1400px">A long window</p><button onclick="this.textContent=this.textContent===\'Tap\'?\'Done\':\'Tap\'">Tap</button></div></div></body></html>',
  /* A page that ends under a real bottom bar, nothing over it: still hidden. */
  hiddenbottom: FIX_HEAD + '<h1>Ends under the bar</h1><div style="height:1200px"></div><p>The end of the page</p><div style="position:fixed;left:0;right:0;bottom:0;height:80px;background:#eee">Bottom bar</div></body></html>'
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
    if (SPARE && ['.html', '.js', '.json'].includes(e)) body = Buffer.from(body.toString('utf8').replace(/\b(8181|9099|9199|5101)\b/g, (p) => String(SPARE_PORTS[p])), 'utf8');
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
  /* The page writing to its own status line answers the press, even with the
     same words as before (the mix builder says "Nothing to render yet." for
     two buttons, 3 Nov 2026): a person sees it said again. */
  var SAYS = '[role=status],[aria-live],.status';
  try { new MutationObserver(function (m) { A.mut += m.length;
    for (var i = 0; i < m.length; i++) { var t = m[i].target, e = t.nodeType === 1 ? t : t.parentElement; if (e && e.closest && e.closest(SAYS) && (e.closest(SAYS).textContent || '').trim()) { A.acts.push('said'); break; } }
  }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true }); } catch (e) {}
  ['pushState', 'replaceState'].forEach(function (k) { var o = history[k]; history[k] = function () { A.acts.push('history'); return o.apply(this, arguments); }; });
  window.open = function (u) { A.acts.push('open:' + u); return null; };
  /* EVERY READ THE RULES REFUSE, even one the page catches and carries on without (5 Nov 2026: the
     safeguarding lead's event page caught its refused read of the leaders, showed "No leaders named yet",
     and passed). The Firestore calls are wrapped once the library is there. */
  A.denied = [];
  (function wrapReads(n) {
    var fb = window.firebase, F = fb && fb.firestore;
    if (!(F && F.DocumentReference && F.Query)) { if (n < 200) setTimeout(function () { wrapReads(n + 1); }, 50); return; }
    var where = function (x) { try { if (x.path) return x.path; var q = x._delegate && x._delegate._query; return q && q.path ? q.path.canonicalString() + (q.filters && q.filters.length ? ' (a query)' : '') : '?'; } catch (e) { return '?'; } };
    var note = function (x, how) { return function (e) { if (e && /permission/i.test(e.code || e.message || '')) A.denied.push(how + ' ' + where(x)); }; };
    [F.DocumentReference.prototype, F.Query.prototype].forEach(function (P) {
      var g = P.get; P.get = function () { var r = g.apply(this, arguments); r.catch(note(this, 'get')); return r; };
      var o = P.onSnapshot; P.onSnapshot = function () {
        var a = [].slice.call(arguments), self = this, i = a.length - 1;
        if (a[0] && typeof a[0] === 'object' && !(typeof a[0] === 'function') && (a[0].next || a[0].error)) { var obs = a[0], e0 = obs.error; a[0] = Object.assign({}, obs, { error: function (e) { note(self, 'listen')(e); if (e0) e0(e); } }); }
        else { while (i >= 0 && typeof a[i] !== 'function') i--; var fns = a.filter(function (x) { return typeof x === 'function'; });
          if (fns.length >= 2) { var k = a.lastIndexOf(fns[1]), e1 = a[k]; a[k] = function (e) { note(self, 'listen')(e); return e1(e); }; } else a.push(function (e) { note(self, 'listen')(e); }); }
        return o.apply(this, a);
      };
    });
  })(0);
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
    out.widest = widest ? (widest.tagName.toLowerCase() + (widest.id ? '#' + widest.id : '') + (widest.className && typeof widest.className === 'string' ? '.' + widest.className.trim().split(/\\s+/).slice(0, 4).join('.') : '') + ' "' + (widest.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 30) + '" ' + Math.round(wv) + 'px') : '';   /* four classes and its first words, so the row can be found (6 Nov 2026) */ }
  /* fixed and sticky bars, top and bottom */
  var tops = [], bots = [];
  document.querySelectorAll('body *').forEach(function (el) {
    var q = pos(el); if (q !== 'fixed' && q !== 'sticky') return;
    if (!vis(el)) return; var r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (r.width < iw * 0.5 || r.height > ih * 0.6) return;
    if (inBar(el.parentElement)) return;
    /* A bar something else sits on (an open window over the page) is not a
       bar on screen: the window's own end is not under it (the hub's admin
       window over its bottom bar, 6 Nov 2026). */
    var bh = document.elementFromPoint((Math.max(r.left, 0) + Math.min(r.right, iw)) / 2, (Math.max(r.top, 0) + Math.min(r.bottom, ih)) / 2);
    if (bh && !el.contains(bh) && !bh.contains(el)) return;
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
    var t = (el.textContent || '').replace(/\\s+/g, ' ').trim(), a = (el.getAttribute('aria-label') || '').trim();
    if (/^care( (&|and) support)?$/i.test(t) || /^care( (&|and) support)?$/i.test(a)) careAll++; });
  out.careAll = careAll;
  /* Too small to tap on a phone: under 30px across (a checkbox or radio
     counts its label, which takes the tap too). */
  var small = [], seenS = 0;
  document.querySelectorAll('button,[role=button],select,input[type=checkbox],input[type=radio],a.btn,a[class*="btn"],[data-act],[onclick]').forEach(function (el) {
    if (!vis(el) || el.disabled) return;
    var r = el.getBoundingClientRect(), box = r;
    if (el.matches('input[type=checkbox],input[type=radio]')) { var lab = el.closest('label') || (el.id && document.querySelector('label[for="' + el.id + '"]')); if (lab) box = lab.getBoundingClientRect(); }
    if (Math.min(box.width, box.height) < 30) { seenS++; if (small.length < 3) small.push(((el.getAttribute('aria-label') || el.textContent || el.tagName) + (el.id ? '#' + el.id : el.type ? '[' + el.type + ']' : '')).replace(/\\s+/g, ' ').trim().slice(0, 24) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height)); } });
  out.small = seenS; out.smallEg = small;
  out.tabbars = bots.filter(function (x) { return x[2].querySelectorAll('a,button').length >= 3; }).length;
  var bar = document.getElementById('egbc-bar'); out.siteBar = !!(bar && vis(bar));
  var va = document.getElementById('egbc-viewas'); out.viewAsBar = !!(va && vis(va));
  /* content under the bars: the first and last things on the page */
  var items = []; document.querySelectorAll('h1,h2,h3,p,li,label,td,button,a,input,select,textarea,img').forEach(function (el) { if (vis(el) && !inBar(el)) items.push(el); });
  out.firstTop = items.length ? Math.round(Math.min.apply(null, items.map(function (el) { return el.getBoundingClientRect().top + scrollY; }))) : null;
  /* An item's bottom as it can be seen: clipped to any box it scrolls inside.
     A window that scrolls on its own holds its lower part below its own edge on
     purpose; counting that as the page's end read the portal's editor as
     "hidden under the bottom bar" (6 Nov 2026). */
  function seenBottom(el) { var b = el.getBoundingClientRect().bottom; for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) { var o = getComputedStyle(p).overflowY; if (o !== 'visible') b = Math.min(b, p.getBoundingClientRect().bottom); } return b; }
  out.lastBottom = items.length ? Math.round(Math.max.apply(null, items.map(function (el) { return seenBottom(el) + scrollY; }))) : null;
  out.docH = document.documentElement.scrollHeight;
  return JSON.stringify(out);
})()`;

/* The controls on screen, in order, with a signature to remember them by. */
/* The biggest fixed thing covering much of the screen: a sheet or pop-up.
   Or a tall side panel holding controls (3 Nov 2026): the Menu on a
   computer is 380px wide, under the 35%, and its backdrop is empty, so it
   was never seen as open, never closed, and covered all that came after.
   A page's own full-screen view, placed between the app's bars (data-am-own,
   Performance Notes' start), is the page, not a pop-up of it (3 Nov 2026);
   so is one a page marks data-page-view (CoreTeamApp's #app-content, fixed
   between its own bars). */
const OVERLAY = `(function(){
  var iw=innerWidth, ih=innerHeight, best=null, ba=0, all=[];
  document.querySelectorAll('body *').forEach(function(el){ var s=getComputedStyle(el); if(s.position!=='fixed'||s.display==='none'||s.visibility==='hidden'||+s.opacity===0)return;
    var r=el.getBoundingClientRect(), a=Math.max(0,Math.min(r.right,iw)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,ih)-Math.max(r.top,0)); if(a < iw*ih*0.35 && !(r.left < iw && r.right > 0 && Math.min(r.bottom,ih)-Math.max(r.top,0) >= ih*0.6 && el.querySelectorAll("a[href],button").length >= 3))return; if(el.hasAttribute("data-am-own")||el.hasAttribute("data-page-view"))return; if(el.id==='egbc-app'||el.querySelector('#egbc-app'))return;
    if(!(el.textContent||'').trim())return;
    if(!best||a<ba){best=el;ba=a;} all.push((el.id||'')+'.'+String(el.className||el.tagName).slice(0,40)); });
  if(!best)return 'null';
  /* Every layer open, not only the smallest (3 Nov 2026): the calendar
     opened from inside the Menu is bigger than the Menu, and was missed. */
  return JSON.stringify({sig:(best.id||'')+'.'+String(best.className||best.tagName).slice(0,40)+'|'+best.childElementCount, all:all.sort().join(',')});
})()`;
/* INSIDE A POP-UP (--every, 3 Nov 2026). The reviewer: every button, link,
   form and tab, nothing sampled - and an editor's Save or a sheet's tabs are
   only there once something opens them. Marks the pop-up OVERLAY found (or,
   when that is a bare backdrop, the fixed element holding the most
   controls), so CONTROLS and FIELDS list only what is inside it. */
const MARK_SCOPE = `(function(){
  var iw=innerWidth, ih=innerHeight, best=null, ba=0, most=null, mn=0;
  document.querySelectorAll('[data-aud-scope]').forEach(function(e){e.removeAttribute('data-aud-scope')});
  document.querySelectorAll('body *').forEach(function(el){ var s=getComputedStyle(el); if(s.position!=='fixed'||s.display==='none'||s.visibility==='hidden'||+s.opacity===0)return;
    if(el.id==='egbc-app'||el.querySelector('#egbc-app'))return;
    var n=el.querySelectorAll('a[href],button,input,select,textarea,[data-act],[onclick]').length; if(n>mn&&el!==document.body){most=el;mn=n;}
    var r=el.getBoundingClientRect(), a=Math.max(0,Math.min(r.right,iw)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,ih)-Math.max(r.top,0)); if(a < iw*ih*0.35 && !(r.left < iw && r.right > 0 && Math.min(r.bottom,ih)-Math.max(r.top,0) >= ih*0.6 && el.querySelectorAll("a[href],button").length >= 3))return; if(el.hasAttribute("data-am-own")||el.hasAttribute("data-page-view"))return;
    if(!(el.textContent||'').trim())return;
    if(!best||a<ba){best=el;ba=a;} });
  var el = best && best.querySelector('a[href],button,input,select,textarea,[data-act],[onclick]') ? best : most;
  if(!el)return 'null';
  el.setAttribute('data-aud-scope','1');
  return (el.id||'')+'.'+String(el.className||el.tagName).slice(0,40);
})()`;
/* Written as a template literal, so a regex's backslash is doubled: a single \b here was a backspace
   in the page, and a close said only in words (Done, Cancel, Close) was never found - 54 Stage 3
   screens called "no visible close" (4 Nov 2026). tools: see the template scan in the findings. */
/* The layer that OPENED, not merely the smallest: __SKIP__ is the layers open
   before the press (OVERLAY's all), passed in, and they are passed over while
   a new one is there (6 Nov 2026: the invitation page's fixed settings panel,
   open all along, was taken for the sheet its Email button opens). */
const SHEET_CLOSE = `(function(){
  var iw=innerWidth, ih=innerHeight, best=null, ba=0, any=null, aa=0, skip=__SKIP__;
  document.querySelectorAll('body *').forEach(function(el){ var s=getComputedStyle(el); if(s.position!=='fixed'||s.display==='none'||s.visibility==='hidden'||+s.opacity===0)return;
    var r=el.getBoundingClientRect(), a=Math.max(0,Math.min(r.right,iw)-Math.max(r.left,0))*Math.max(0,Math.min(r.bottom,ih)-Math.max(r.top,0)); if(a < iw*ih*0.35 && !(r.left < iw && r.right > 0 && Math.min(r.bottom,ih)-Math.max(r.top,0) >= ih*0.6 && el.querySelectorAll("a[href],button").length >= 3))return; if(el.hasAttribute("data-am-own")||el.hasAttribute("data-page-view"))return; if(el.id==='egbc-app'||el.querySelector('#egbc-app'))return;
    if(!(el.textContent||'').trim())return;
    if(!any||a<aa){any=el;aa=a;}
    if(skip.indexOf((el.id||'')+'.'+String(el.className||el.tagName).slice(0,40))!==-1)return;
    if(!best||a<ba){best=el;ba=a;} });
  best=best||any;
  if(!best)return 'null';
  best.querySelectorAll('*').forEach(function(x){ if(x.scrollHeight>x.clientHeight+4) x.scrollTop=x.scrollHeight; }); best.scrollTop=best.scrollHeight;
  var close=[].filter.call(best.querySelectorAll('button,a,[role=button],[data-act]'),function(b){
    var w=((b.getAttribute('aria-label')||'')+' '+(b.textContent||'')).trim(); var r=b.getBoundingClientRect();
    return (/^(\u2715|\u00d7|x|close|done|cancel|back|not now)\\b/i.test(w) || /close/i.test((b.getAttribute('aria-label')||'')+' '+(b.getAttribute('title')||'')) || b.getAttribute('data-act')==='close' || /(^|[ _-])close([ _-]|$)/i.test(typeof b.className==='string'?b.className:'')) && r.width>0 && r.top>=0 && r.bottom<=ih;
  });
  return JSON.stringify({close:close.length, sig:String(best.id||best.className||best.tagName).slice(0,40)});
})()`;

/* --probe (building --states): each state's controls and fields listed, nothing pressed */
const PROBE = flag('probe');
/* --state=words: only the states whose name holds the words */
const ONLY_STATE = opt('state') || process.env.AUD_STATE || '';
const CONTROLS = `(function(){
  function vis(el) { var dt = el.closest('details:not([open])'); if (dt && !(el.closest('summary') && el.closest('summary').parentElement === dt)) return false;
    var r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (var p = el; p; p = p.parentElement) { var s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; } return true; }
  var list = [];
  var K = ${KEYS_JS};
  var scope = document.querySelector('[data-aud-scope]');
  document.querySelectorAll('a[href],button,[role=button],[role=tab],[data-act],[data-lact],[data-mact],[data-tab],[onclick],summary').forEach(function (el, i) {
    if (scope && !scope.contains(el)) return;      /* inside an open pop-up, only its own controls (--every) */
    if (!vis(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    if (el.closest('[aria-hidden="true"]')) return;
    if (el.closest('[inert]')) return;      /* behind an open panel: nobody can reach it, by design */
    if (el.parentElement && el.parentElement.closest('a[href],button,[role=button],[data-act]') ) return;
    var words = ((el.getAttribute('aria-label') || '') + ' ' + (el.innerText || el.textContent || '')).replace(/\\s+/g, ' ').trim().slice(0, 60);
    var href = el.getAttribute('href') || '';
    list.push({ i: i, sig: el.tagName + '|' + words + '|' + href + '|' + (el.getAttribute('data-act') || el.getAttribute('data-lact') || ''), words: words, href: href, keys: K(el),
      tel: /^(mailto|tel|sms|webcal|intent|whatsapp|geo):/i.test(href),
      needsSel: el.hasAttribute('data-needs-selection'),
      chrome: !!el.closest('[id^="egbc-"]') || el.hasAttribute('data-tab') || el.getAttribute('role') === 'tab',
      plain: el.tagName === 'A' && !el.hasAttribute('onclick') && !el.hasAttribute('data-act') && !el.hasAttribute('data-lact') && !el.hasAttribute('data-mact') && !el.hasAttribute('download') && !/^(#|javascript:)/i.test(href) && !!href,
      chosen: el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true' || !!el.getAttribute('aria-current') || /(^| )(on|active|selected|is-active|current)( |$)/.test(typeof el.className === 'string' ? el.className : '') });
  });
  return JSON.stringify(list);
})()`;

/* ---------------- one browser ---------------- */
/* MEMORY, WATCHED FROM OUTSIDE THE PRESSES (6 Nov 2026: the press loop's
   check every 10 presses never fired while a state's fields were filled, and
   the machine went under 1 GB). Free memory is read every 5 s. The press loop
   and each state read MEM and start a fresh browser under 1.5 GB; under
   0.9 GB the run closes its browsers and stops - its finished screens are
   saved, so --resume carries on. Never in --self-test. */
const CHROMES = new Set();
let MEM = os.freemem();
setInterval(() => {
  MEM = os.freemem();
  if (MEM < 0.9 * 2 ** 30 && !flag('self-test')) {
    console.log('STOPPED: only ' + (MEM / 2 ** 30).toFixed(2) + ' GB free. Finished screens are saved; carry on with --resume.');
    CHROMES.forEach((c) => { try { c.kill(); } catch (e) {} });
    process.exit(3);
  }
}, 5000).unref();
const memLow = () => MEM < 1.5 * 2 ** 30;

async function browser(port, tag) {
  const dir = path.join(os.tmpdir(), 'cdp-audit-' + tag + '-' + process.pid);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir,
    '--disable-features=BackForwardCache', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  CHROMES.add(chrome); chrome.on('exit', () => CHROMES.delete(chrome));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
  let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (list.find(x => x.type === 'page')) break; } catch { /* starting */ } await sleep(500); }
  const page = list.find(x => x.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const B = { errors: [], acts: [], mainFrame: null, tapping: false, chrome, ws, port };
  /* Never wait for ever (27 Oct 2026: a restarted browser stopped answering
     and the audit sat 90 minutes on one sign-in). A command unanswered in
     45 s comes back as an error, so the screen fails and the run goes on. */
  /* And once one goes unanswered the browser is DEAD: everything after it
     fails at once rather than 45 s each (a page's settle loop asks dozens
     of times), and the next page starts on a fresh browser. */
  const send = (m, p = {}) => new Promise(r => {
    if (B.dead) return r({ error: { message: 'the browser stopped answering' } });
    const i = ++id;
    const t = setTimeout(() => { if (pend.has(i)) { pend.delete(i); B.dead = true; r({ error: { message: 'no answer in 45 s: ' + m } }); } }, 45000);
    pend.set(i, (x) => { clearTimeout(t); r(x); });
    try { ws.send(JSON.stringify({ id: i, method: m, params: p })); } catch (e) { clearTimeout(t); pend.delete(i); r({ error: { message: String(e) } }); }
  });
  B.send = send;
  /* Asked through a function: after a restart B holds the fresh browser's
     functions, and its flag is on the fresh one. */
  B.isDead = () => !!B.dead;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('browser on ' + port + ' did not open')); setTimeout(() => j(new Error('browser on ' + port + ' did not open in 30 s')), 30000); });
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
      /* answered with a made-up file, and the picker counted as reached (see madeUpFile) */
      const node = await send('DOM.resolveNode', { backendNodeId: m.params.backendNodeId });
      const oid = node && node.object && node.object.objectId;
      const info = oid ? await send('Runtime.callFunctionOn', { objectId: oid, returnByValue: true, functionDeclaration: 'function(){ var K = ' + KEYS_JS + '; return JSON.stringify({ accept: this.accept || "", keys: K(this) }); }' }) : null;
      const got = info && info.result && info.result.value ? JSON.parse(info.result.value) : { accept: '', keys: [] };
      const given = await send('DOM.setFileInputFiles', { files: [madeUpFile(got.accept)], backendNodeId: m.params.backendNodeId });
      if (B.ctx && !(given && given.error) && got.keys.length) REACHED.push({ page: B.ctx.page, role: B.ctx.role, size: B.ctx.size, screen: B.ctx.screen, keys: got.keys, how: 'given a made-up file (from the button that opens it)' });
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
    /* The same page with another #part is not a fresh page: Chrome only moves the
       hash, so a pop-up left open (the app's song picker) stayed and covered all
       after it (3 Nov 2026). Reload it. */
    const same = url.includes('#') && (await B.ev('location.href.split("#")[0]')) === url.split('#')[0];
    /* The old page is marked, so "complete" is read from the new one (this was a fixed 3 s floor). */
    await B.ev('window.__audOld=1;1');
    await send('Page.navigate', { url });
    if (same) await send('Page.reload', {});
    /* Settled: the new page loaded, the guard's splash gone, then held still for the data. */
    for (let i = 0; i < 56; i++) {
      await sleep(250);
      const st = await B.ev('(window.__audOld?"old":document.readyState) + "|" + !!document.getElementById("egbc-guard-splash")');
      if (st && st.startsWith('complete|false') && i >= 1) break;
    }
    await settle(B, 500, 3000);
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
  /* A restarted browser can come up not answering (27 Oct 2026: twice, each
     time the audit then sat for an hour). It must answer within 15 s, or
     it is closed and another tried - three times. */
  B.restart = async () => {
    B.close(); await sleep(800);
    for (let tries = 0; tries < 3; tries++) {
      const n = ++B.restarts;
      let fresh = null;
      try { fresh = await browser(port + 600 + n % 40, tag + 'r' + n);   /* 9710-9751 from 9110: clear of every emulator port (port + 40 could reach 9189, the spare Storage) */ } catch (e) { fresh = null; }
      const alive = fresh && await Promise.race([fresh.ev('1+1'), sleep(15000).then(() => null)]) === 2;
      if (alive) { Object.assign(B, fresh); B.restarts = n; B.dead = false; return; }
      if (fresh) fresh.close();
      console.log('          (a fresh browser did not answer; another)');
      await sleep(1500);
    }
    throw new Error('three fresh browsers in a row did not answer');
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
  /* A long run (--every) outlasts a blip: tries over a couple of minutes,
     reloading the sign-in page between, and says why if it still can't. */
  let last = '';
  for (let i = 0; i < 6; i++) {
    await B.go(base + '__signin.html');
    await B.ev('firebase.auth(EGBCAuth.app).signOut()', true);
    await B.ev('sessionStorage.clear();localStorage.clear();1');
    last = String(await B.ev('(window.firebase&&window.EGBCAuth)?firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(r.email) + ',' + JSON.stringify(PW)
      + ').then(function(){return "ok"},function(e){return "refused: "+(e&&(e.code||e.message))}):Promise.resolve("the sign-in page did not load its scripts")', true));
    await sleep(600);
    if ((await B.ev('(window.firebase&&firebase.auth(EGBCAuth.app).currentUser||{}).email||""')) === r.email) return;
    await sleep(5000 * (i + 1));
  }
  throw new Error('could not sign in as ' + role + ' (' + last + ')');
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
/* el.open: a <details> opening counts. Chrome gives a closed one's contents a size, so they were already in the
   hash and "Show the pages" opening read as dead (the Stage 3 audit, 5 Nov 2026). */
const VIEWHASH = `(function(){var h=0,n=0,all=document.querySelectorAll('body *'),ih=innerHeight,iw=innerWidth;
  for(var i=0;i<all.length&&n<5000;i++){var el=all[i],r=el.getBoundingClientRect();
    if(r.width<1||r.height<1||r.bottom<0||r.top>ih||r.right<0||r.left>iw)continue;
    var cs=getComputedStyle(el); if(cs.visibility==='hidden'||+cs.opacity===0)continue;
    var s=el.tagName+'|'+(typeof el.className==='string'?el.className:'')+'|'+(el.childElementCount?'':(el.textContent||'').slice(0,40))+'|'+(el.value||'')+'|'+(el.checked?1:0)+'|'+(el.getAttribute('aria-expanded')||'')+'|'+(el.open?1:0);
    for(var j=0;j<s.length;j++)h=(h*31+s.charCodeAt(j))|0;n++;}
  return h+':'+n;})()`;
/* The whole page, on screen or not, without where things are (4 Nov 2026): "+ Item" adds a row below the
   fold, one DOM change, so it read as dead. Not used on a page that changes by itself (a clock). */
const PAGEHASH = VIEWHASH.replace('if(r.width<1||r.height<1||r.bottom<0||r.top>ih||r.right<0||r.left>iw)continue;', 'if(r.width<1||r.height<1)continue;');
const HERE = '(window.EGBCApp&&EGBCApp.state?JSON.stringify(EGBCApp.state()):location.pathname+location.search)';
async function tapAll(B, url, reopen, ctx) {
  ctx = ctx || {};
  const used = (next, how) => { if (ctx.page && next.keys && next.keys.length) REACHED.push({ page: ctx.page, role: ctx.role, size: ctx.size, screen: ctx.screen, keys: next.keys, how }); };
  const notUsed = (next, why) => { if (ctx.page && next.keys && next.keys.length) SKIPPED_KEYS.push({ page: ctx.page, role: ctx.role, size: ctx.size, screen: ctx.screen, keys: next.keys, words: next.words || next.href, why }); };
  const why = [], skipped = [], tapped = new Set();
  /* How busy is the page by itself? A clock or a carousel changes the DOM
     without anybody tapping, so taps must beat that. */
  const page0 = await B.ev(PAGEHASH);
  await B.ev('window.__aud&&(window.__aud.mut0=window.__aud.mut);1'); await sleep(700);
  const pageNoisy = (await B.ev(PAGEHASH)) !== page0;
  const resting = (await B.ev(OVERLAY)) || 'null';
  const home = await B.ev(HERE);
  const retried = new Set(), moved = new Set();
  const noise = (await B.ev('window.__aud?window.__aud.mut-window.__aud.mut0:0')) || 0;
  let n = 0;
  for (let guard = 0; guard < MAX_TAPS * 2 && n < MAX_TAPS; guard++) {
    /* MEMORY (the events window, 6 Nov 2026: two of this audit's Chromes grew to
       5.0 and 3.9 GB in one long state, the machine down to 0.1 GB). A state
       reloads its page after every press in one long-lived tab, and the tab
       keeps what it leaks. Every 10 presses: under 1.5 GB free, a fresh
       browser, signed in again, the screen opened again; still under 1 GB,
       the run stops, its finished screens saved, for --resume. */
    if (guard && !SELF && ctx.base && ctx.role && memLow()) {   /* before every press (MEM, read every 5 s) */
      console.log('          (only ' + (os.freemem() / 2 ** 30).toFixed(1) + ' GB free: a fresh browser)');
      await B.restart(); await B.size(...ALL_SIZES[ctx.size]); await signIn(B, ctx.base, ctx.role); await reopen();
      if (os.freemem() < 2 ** 30) { console.log('STOPPED: under 1 GB free even with a fresh browser. Finished screens are saved; carry on with --resume.'); process.exit(3); }
    }
    const list = JSON.parse((await B.ev(CONTROLS)) || '[]');
    const next = list.find(c => !tapped.has(c.sig));
    if (!next) break;
    tapped.add(next.sig);
    /* A STATE (--states): the page's first view already pressed the shared
       chrome and the tabs; here only the state's own controls count. */
    if (ctx.state && next.chrome) continue;
    /* mailto:, tel:, webcal: and the like open another app: they work by
       definition, and tapping one in a headless browser (webcal: did it)
       stops every later tap reaching the page. */
    if (next.tel) { notUsed(next, 'opens another app (mail, phone, calendar)'); continue; }
    if (next.chosen) { used(next, 'already chosen'); continue; }      /* the choice already made: tapping it rightly changes nothing */
    if (next.needsSel) { notUsed(next, 'acts on selected text'); continue; }    /* Bold, Italic...: they act on selected text, and there is none */
    /* A PLAIN LINK (--every, 3 Nov 2026): all it does is open its page, and
       that page is audited in its own right. So its target is fetched, not
       pressed - pressing each meant opening the page and its pop-up again,
       and one page, person and size took twelve minutes. */
    if (EVERY && next.plain && !/sign ?out|log ?out/i.test(next.words)) {
      const here = await B.ev('location.href'), to = new URL(next.href, here);
      if (to.origin !== new URL(here).origin) { notUsed(next, 'a link out of the hub (' + to.host + '): not followed, the test browser blocks outside hosts'); continue; }
      const st = await fetch(to.origin + to.pathname).then((r) => r.status, () => 0);
      if (st === 200) used(next, 'link checked: ' + decodeURIComponent(to.pathname.split('/').pop()) + ' opens');
      else why.push('broken link: "' + (next.words || next.href) + '" goes to ' + to.pathname + ' (' + (st || 'no answer') + ')');
      continue;
    }
    if ((PRESS_ALL ? SKIP_ALWAYS : SKIP_TAP).test(next.words) || (LIVE && SKIP_LIVE.test(next.words))) { skipped.push(next.words || next.href); notUsed(next, 'not tapped: changes things for others (sign out, delete, send...)'); continue; }
    n++;
    const sel = '(document.querySelectorAll("a[href],button,[role=button],[role=tab],[data-act],[data-lact],[data-mact],[data-tab],[onclick],summary")[' + next.i + '])';
    /* SCROLL, LET IT SETTLE, THEN MEASURE (26 Oct 2026). Pages that build
       their styles as they go (the Tailwind script on the knowledge-base
       pages) move a moment after a change, and a tap measured before that
       landed on the button next door - which read as "does nothing". */
    const where = '(function(){var el=' + sel + ';if(!el)return "";var r=el.getBoundingClientRect();return [r.left,r.top,r.width,r.height].map(Math.round).join()})()';
    await B.ev('(function(){var el=' + sel + ';if(el)el.scrollIntoView({block:"center",inline:"center"});return 1})()');
    /* Only a button that is still moving is waited for, so the audit keeps its pace. */
    for (let k = 0, was = await B.ev(where); k < 4; k++) { await sleep(k ? 200 : 30); const now = await B.ev(where); if (now === was) break; was = now; }
    /* Still the same control? A list drawn again meanwhile (the Rota planner's,
       when the service just added arrived) moves every index after it, and the
       one measured was a page button behind the sheet (3 Nov 2026). Look again. */
    { const again = JSON.parse((await B.ev(CONTROLS)) || '[]').find((c) => c.sig === next.sig);
      if (!again || again.i !== next.i) { if (!moved.has(next.sig)) { moved.add(next.sig); tapped.delete(next.sig); } else notUsed(next, 'the page kept drawing it again as it was pressed'); n--; continue; } }
    const pt = JSON.parse((await B.ev('(function(){var el=' + sel + ';if(!el)return "null";var r=el.getBoundingClientRect();'
      + 'var x=r.left+Math.min(r.width/2,r.width-2),y=r.top+Math.min(r.height/2,r.height-2),hit=document.elementFromPoint(x,y);'
      /* A backdrop is tapped beside the panel it sits under, not in its
         middle (3 Nov 2026): any part of it that shows will do. */
      + 'if(!(hit&&(hit===el||el.contains(hit)))&&r.width*r.height>innerWidth*innerHeight*0.35){for(var gi=1;gi<8;gi++)for(var gj=1;gj<8;gj++){var gx=Math.max(1,r.left)+(Math.min(r.right,innerWidth)-Math.max(1,r.left))*gi/8,gy=Math.max(1,r.top)+(Math.min(r.bottom,innerHeight)-Math.max(1,r.top))*gj/8,gh=document.elementFromPoint(gx,gy);if(gh===el){x=gx;y=gy;hit=gh;gi=gj=9;}}}'
      /* Clipped away inside a shut fold (an ancestor that hides what overflows
         it, and whose box does not hold the point): not on screen, so not
         "covered" (the training portal's edit mode redraws its menu with every
         fold shut, after a fold's rows were listed open; 6 Nov 2026). */
      + 'var clipped=false;for(var an=el.parentElement;an&&an!==document.body;an=an.parentElement){var cs=getComputedStyle(an);if(cs.overflow!=="visible"||cs.overflowY!=="visible"){var ar=an.getBoundingClientRect();if(x<=ar.left||x>=ar.right||y<=ar.top||y>=ar.bottom){clipped=true;break;}}}'
      /* Behind a window layer that does not hold it: a fixed one, or an absolute
         one over a third of the screen with a visible dim backdrop (the training
         portal's windows cover only its main area, 6 Nov 2026). A near-clear
         cover is not a window, and still reads as covered. */
      + 'var fx=null;for(var hn=hit;hn&&hn!==document.body;hn=hn.parentElement){var hs=getComputedStyle(hn);if(hs.position==="fixed"){fx=hn;break;}'
      + 'if(hs.position==="absolute"){var hr=hn.getBoundingClientRect(),bm=/rgba?\\(([^)]+)\\)/.exec(hs.backgroundColor),bp=bm?bm[1].split(","):[],al=bp.length>3?+bp[3]:(bp.length?1:0);'
      + 'if(hr.width*hr.height>=innerWidth*innerHeight*0.35&&al>=0.1){fx=hn;break;}}}var behind=!!fx&&!fx.contains(el);'
      + 'var vv=window.visualViewport;return JSON.stringify({clipped:clipped,behind:behind,x:x,y:y,vx:vv?vv.offsetLeft:0,vy:vv?vv.offsetTop:0,ok:!!hit&&(hit===el||el.contains(hit)||hit.contains(el)),shell:!!(hit&&hit.closest&&hit.closest("[id^=egbc-you],[id^=egbc-nav]")),by:hit?(hit.tagName+(hit.id?"#"+hit.id:"")+(typeof hit.className==="string"&&hit.className?"."+hit.className.trim().split(/\\s+/)[0]:"")):"nothing"})})()')) || 'null');
    if (!pt) continue;
    /* Clipped away in a shut fold: never pressed, whatever the point test
       says (a point there finds the page that holds it, which reads as
       "reachable" - the self-test's foldok page, 6 Nov 2026). */
    if (pt.clipped) { n--; notUsed(next, 'in a shut fold (clipped, not on screen)'); continue; }
    if (!pt.ok) {
      /* Something left open by the last tap? Start the page again and try
         this one once more before calling it covered. */
      if (pt.by === 'nothing') { n--; notUsed(next, 'off screen (an off-canvas panel)'); continue; }            /* off screen (an off-canvas panel): not something to tap */
      /* The shell's small drop-downs (You) are too small to count as a pop-up, but
         one left open by an earlier tap covers the corner under it (3 Nov 2026). */
      /* A first-visit tour covers the page until it is ended, as a person's first
         tap anywhere ends it (CoreTeamApp, youthapp2): end it and try again. */
      /* Help open beside the page (a person opened it, then went back to the
         page): close it, as they would, and press the page's control (the
         events window, 3 Nov 2026). */
      if (!retried.has(next.sig) && await B.ev('!!document.getElementById("egbc-help")')) { retried.add(next.sig); tapped.delete(next.sig); n--; await B.ev('(window.EGBCHelp&&EGBCHelp.close(),1)'); await sleep(300); continue; }
      if (!retried.has(next.sig) && /tour-dismiss/.test(pt.by)) { retried.add(next.sig); tapped.delete(next.sig); n--; await B.ev('(window.endTour&&endTour(),1)'); await sleep(300); continue; }
      if (!retried.has(next.sig) && (pt.shell || /^[A-Z]+(#egbc-(you|nav)|.ey-)/.test(pt.by) || ((await B.ev(OVERLAY)) || 'null') !== resting)) { retried.add(next.sig); tapped.delete(next.sig); n--; await reopen(); continue; }
      /* A STATE THAT IS AN OPEN WINDOW (a notice, an editor): the page behind it
         is the first view's, pressed there. A control behind the window the
         state opened, with that window still the one open, is not this
         state's to press (the hub's states, 6 Nov 2026). One covered inside
         the window still fails. A state's screen is opened afresh before every
         press, so a window over it is the state's own - including one the
         OVERLAY check cannot see (an absolute one: resting 'null'). */
      if (ctx.state && pt.behind) { notUsed(next, 'behind the window this state opens'); continue; }   /* no match on the recorded window: it can be read before the window has opened (the hub's notice) */
      why.push('covered: "' + (next.words || next.href) + '" is under ' + pt.by); notUsed(next, 'covered by ' + pt.by); continue;
    }
    const overBefore = (await B.ev(OVERLAY)) || 'null';
    const viewBefore = await B.ev(VIEWHASH), pageBefore = pageNoisy ? '' : await B.ev(PAGEHASH);
    const before = JSON.parse(await B.ev('JSON.stringify({mut:window.__aud.mut,acts:window.__aud.acts.length,sx:scrollX,sy:scrollY,f:(document.activeElement&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))?document.activeElement.outerHTML.slice(0,80):"",u:location.href})'));
    B.acts.length = 0; B.tapping = true;
    /* Input events land in the visual viewport: a page a little too wide
       leaves it shifted, and the tap would fall on a neighbour. */
    const tx = pt.x - (pt.vx || 0), ty = pt.y - (pt.vy || 0);
    await B.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tx, y: ty, button: 'left', clickCount: 1 });
    await B.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx, y: ty, button: 'left', clickCount: 1 });
    const t0 = Date.now();
    await sleep(550);
    let after = JSON.parse((await B.ev('JSON.stringify({mut:window.__aud.mut,acts:window.__aud.acts.slice(' + before.acts + '),sx:scrollX,sy:scrollY,f:(document.activeElement&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))?document.activeElement.outerHTML.slice(0,80):"",u:location.href})')) || 'null');
    let viewAfter = await B.ev(VIEWHASH), pageAfter = pageNoisy ? '' : await B.ev(PAGEHASH);
    if (process.env.AUDIT_DEBUG) console.log("    click", JSON.stringify(pt), await B.ev('JSON.stringify({click: window.__aud.click, reached: window.__aud.reached, prevented: window.__aud.prevented, active: (document.activeElement || {}).tagName, vv: window.visualViewport ? [visualViewport.offsetLeft, visualViewport.offsetTop, visualViewport.scale, visualViewport.width].map(function(n){return Math.round(n*100)/100}) : null, sw: document.documentElement.scrollWidth, sx: scrollX})'));
    if (process.env.AUDIT_DEBUG) console.log("    tap", JSON.stringify(next.words), JSON.stringify(before), JSON.stringify(after), JSON.stringify(B.acts), "noise", noise, "pageNoisy", pageNoisy, "view", viewBefore === viewAfter ? "same" : "changed", "details", await B.ev('JSON.stringify([].map.call(document.querySelectorAll("details"),function(d){var r=d.getBoundingClientRect();return (d.id||"?")+":"+(d.open?"open":"shut")+"@"+Math.round(r.top)+"/"+Math.round(r.height)}))'), "ih", await B.ev('innerHeight'));
    if (!after) { B.tapping = false; /* the page went away (a real navigation slipped through): start it again */ await reopen(); continue; }
    /* The page's own changes grow with the time waited, so the bar does too. */
    /* not "moved": that is the Set above of controls redrawn as pressed, which this name hid (a crash,
       "Cannot access 'moved' before initialization", the full run of 6 Nov 2026) */
    const didChange = () => B.acts.length || after.acts.length || viewAfter !== viewBefore || pageAfter !== pageBefore
      || after.mut - before.mut > Math.ceil(noise * 1.2 * Math.max(1, (Date.now() - t0) / 700)) + 2 || after.sx !== before.sx || after.sy !== before.sy
      || after.f !== before.f || after.u !== before.u;
    let did = didChange();
    /* Nothing yet: up to 4 s more before calling it dead (4 Nov 2026). The first call of each function on
       a fresh emulator answers after the 550 ms - the quiz, Pair again, Call on their phone were "dead"
       at 375, which runs first, and fine at 1440. A dead control costs the wait; a live one does not. */
    for (let k = 0; !did && k < 8; k++) {
      await sleep(500);
      const a2 = JSON.parse((await B.ev('JSON.stringify({mut:window.__aud.mut,acts:window.__aud.acts.slice(' + before.acts + '),sx:scrollX,sy:scrollY,f:(document.activeElement&&/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))?document.activeElement.outerHTML.slice(0,80):"",u:location.href})')) || 'null');
      if (!a2) { did = true; break; }
      after = a2; viewAfter = await B.ev(VIEWHASH); pageAfter = pageNoisy ? '' : await B.ev(PAGEHASH); did = didChange();
    }
    B.tapping = false;
    /* A "back to the top" in a fixed bar has nothing to do on a page already
       at the top (the hub's Hub button, 3 Nov 2026): scrolled down, it must
       move the page. */
    let didScrolled = false, noScroll = false;
    if (!did && await B.ev('(function(){for(var p=' + sel + ';p&&p!==document.body;p=p.parentElement){var s=getComputedStyle(p).position;if(s==="fixed"||s==="sticky")return 1}return 0})()')) {
      await B.ev('window.scrollTo(0,document.documentElement.scrollHeight);1'); await sleep(300);
      const y0 = await B.ev('scrollY');
      if (y0 > 0) {
        const q = JSON.parse((await B.ev('(function(){var el=' + sel + ';if(!el)return "null";var r=el.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()')) || 'null');
        if (q) { await B.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: q.x, y: q.y, button: 'left', clickCount: 1 });
          await B.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: q.x, y: q.y, button: 'left', clickCount: 1 });
          await sleep(900); didScrolled = (await B.ev('scrollY')) < y0; }
      } else noScroll = /top/i.test(await B.ev('(function(){var el=' + sel + ';return el?(el.title||"")+" "+(el.getAttribute("aria-label")||"")+" "+(el.getAttribute("onclick")||""):""})()') || '');
    }
    /* Its page does not scroll at this size, so a "to the top" has nothing to
       do: listed as not reached, with that reason, rather than called dead. */
    if (noScroll) { notUsed(next, 'back to the top, on a page that does not scroll at this size'); }
    else if (!did && !didScrolled) why.push('dead: "' + (next.words || next.href || 'a control') + '" does nothing');
    else used(next, didScrolled ? 'pressed, scrolled down' : 'pressed');
    /* A sheet or pop-up came up: it must have a close that can be seen,
       even scrolled to the bottom. Then close it. */
    /* Another page opened after all (the app's Performance Notes, 3 Nov 2026):
       its own full-screen start is not a pop-up of this one. Start again. */
    if ((await B.ev('location.pathname')) !== new URL(before.u).pathname) { await reopen(); continue; }
    const overAfter = (await B.ev(OVERLAY)) || 'null';
    /* A sheet OPENED only when a layer is there that was not before: a press
       that closes one (the invitation's "Close ×") leaves fewer, and the
       panel open all along is not a new sheet (6 Nov 2026). */
    const layersBefore = overBefore === 'null' ? [] : String(JSON.parse(overBefore).all || '').split(',');
    const opened = overAfter !== 'null' && overAfter !== overBefore && String(JSON.parse(overAfter).all || '').split(',').some((l) => l && !layersBefore.includes(l));
    const sheet = opened ? JSON.parse((await B.ev(SHEET_CLOSE.replace('__SKIP__', JSON.stringify(layersBefore)))) || 'null') : null;
    if (sheet) {
      if (!sheet.close) why.push('sheet: "' + (next.words || 'a control') + '" opens a sheet (' + sheet.sig + ') with no visible close after scrolling it');
      /* --every: press and fill what is inside it, each time from the page
         opened afresh and this control pressed again; each pop-up once per
         page, person and size, two levels deep (the admin settings open from
         the avatar's pop-up). */
      const sheets = ctx.sheets || (ctx.sheets = new Set());
      /* The shared pop-ups (the Menu, Care: ids starting egbc-) are the same on
         every page: explored once per person and size, not on each page. */
      const shared = /^egbc-/.test(sheet.sig) ? ctx.role + '@' + ctx.size + ':' + sheet.sig : '';
      if (EVERY && (ctx.depth || 0) < 2 && !sheets.has(sheet.sig) && !(shared && SHARED_SHEETS.has(shared))) {
        sheets.add(sheet.sig); if (shared) SHARED_SHEETS.add(shared);
        const opener = next.sig;
        const reopenSheet = async () => {
          await reopen(); await sleep(300);
          await B.ev('(function(){document.querySelectorAll("[data-aud-scope]").forEach(function(e){e.removeAttribute("data-aud-scope")});var l=' + CONTROLS + ';var c=JSON.parse(l).filter(function(x){return x.sig===' + JSON.stringify(opener) + '})[0];'
            + 'if(!c)return 0;document.querySelectorAll("a[href],button,[role=button],[role=tab],[data-act],[data-lact],[data-mact],[data-tab],[onclick],summary")[c.i].click();return 1})()');
          await sleep(600); await B.ev(MARK_SCOPE);
        };
        if ((await B.ev(MARK_SCOPE)) !== 'null') {
          const inner = await tapAll(B, url, reopenSheet, Object.assign({}, ctx, { depth: (ctx.depth || 0) + 1, sheets }));
          why.push(...inner.why.map((w) => w.replace(/^(\w+): /, '$1 (in "' + (next.words || 'a pop-up').slice(0, 30) + '"): ')));
          await reopenSheet();
          why.push(...(await fillFields(B, reopenSheet, ctx)).map((w) => w + ' (in "' + (next.words || 'a pop-up').slice(0, 30) + '")'));
          await B.ev('(function(){document.querySelectorAll("[data-aud-scope]").forEach(function(e){e.removeAttribute("data-aud-scope")});return 1})()');
          await reopen();
          continue;
        }
      }
      await B.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await B.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(250);
      const still = await B.ev('(function(){var c=[].filter.call(document.querySelectorAll(\'[data-act="close"],[aria-label*="lose"],.sheet-back\'),function(b){var r=b.getBoundingClientRect();return r.width>0&&r.height>0});if(c.length){c[0].click();return 1}return 0})()');
      if (still) await sleep(300);
    }
    /* Whatever happened, the next tap starts from the page as it rests: a
       sheet that would not close is closed by opening the page again. */
    if (process.env.AUDIT_DEBUG) console.log('    overlay now', await B.ev(OVERLAY), 'resting', resting, 'here', await B.ev(HERE), 'home', home);
    if (ctx.state || ((await B.ev(OVERLAY)) || 'null') !== resting || (await B.ev(HERE)) !== home) await reopen();
  }
  /* Every tap dead, on a page with several: taps are not reaching the page
     (seen when the emulator is overloaded). Say so, rather than blame every
     button on it. */
  const deadOnes = why.filter(w => w.startsWith('dead:')).length;
  if (n >= 4 && deadOnes === n) return { why: why.filter(w => !w.startsWith('dead:')).concat(['audit: no tap registered on this page (' + n + ' tried); re-run it alone']), skipped };
  return { why, skipped };
}

/* EVERY FIELD, FILLED (--every): a box typed in, a list changed, a tick-box
   ticked, a date set, then left - as a person does. A file picker is
   written down as not used (it needs a file: the journeys do that). A
   console error while filling one fails the screen. */
const FIELDS = `(function(){
  function vis(el) { var r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    for (var p = el; p; p = p.parentElement) { var s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden') return false; } return true; }
  var K = ${KEYS_JS}, out = [], scope = document.querySelector('[data-aud-scope]');
  document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(function (el, i) {
    if (scope && !scope.contains(el)) return;
    if (el.disabled || el.readOnly || el.closest('[aria-hidden="true"]') || el.closest('[inert]')) return;
    var box = el.parentElement && el.parentElement.hasAttribute('data-uk-date') ? el.parentElement : el;
    if (!vis(box)) return;
    /* The master admin's "View as" bar changes who you are for every page after
       it, like Sign out: written down, not filled. */
    var viewAs = /^egbc-va-/.test(el.id || '') || !!el.closest('#egbc-viewas-bar');
    out.push({ i: i, keys: K(el), type: (el.type || el.tagName).toLowerCase(), words: (el.getAttribute('aria-label') || el.name || el.id || el.placeholder || '').slice(0, 40), viewAs: viewAs });
  });
  return JSON.stringify(out);
})()`;
const FILL = (i) => `(function(){
  var el = document.querySelectorAll('input:not([type=hidden]),select,textarea')[${i}]; if (!el) return 'gone';
  var t = (el.type || el.tagName).toLowerCase();
  if (t === 'file') return 'file';
  try { el.scrollIntoView({ block: 'center' }); el.focus(); } catch (e) {}
  if (t === 'checkbox' || t === 'radio') { el.click(); }
  else if (el.tagName === 'SELECT') { var o = [].filter.call(el.options, function (x) { return x.value && x.value !== el.value && !x.disabled; })[0]; if (!o) return 'one choice'; el.value = o.value; }
  else if (t === 'date') el.value = new Date(Date.now() + 864e5 * 9).toISOString().slice(0, 10);
  else if (t === 'time') el.value = '10:30';
  else if (t === 'number' || t === 'range') el.value = '2';
  else if (t === 'email') el.value = 'synthetic.person@example.invalid';
  else if (t === 'color') el.value = '#3d6263';
  else el.value = 'Synthetic words';
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  try { el.blur(); } catch (e) {}
  return 'filled';
})()`;
async function fillFields(B, reopen, ctx) {
  const why = [];
  const home = await B.ev(HERE), resting = (await B.ev(OVERLAY)) || 'null';
  const done = new Set();
  for (let guard = 0; guard < 400; guard++) {
    const list = JSON.parse((await B.ev(FIELDS)) || '[]');
    const next = list.find((f) => !done.has(f.keys.join('|') + '#' + f.i));
    if (!next) break;
    done.add(next.keys.join('|') + '#' + next.i);
    /* a state (--states): the shared chrome's fields were filled on the page's first view */
    if (ctx.state && next.keys.some((k) => /^(id|field):egbc-/.test(k))) continue;
    if (next.viewAs) { if (next.keys.length) SKIPPED_KEYS.push({ page: ctx.page, role: ctx.role, size: ctx.size, screen: ctx.screen, keys: next.keys, words: next.words, why: 'View as: changes who you are for every page after it (its own checks: check-viewas-*)' }); continue; }
    const before = B.errors.length;
    if (process.env.FIELD_DEBUG) console.log('    fill', ctx.page, next.type, next.words, JSON.stringify(next.keys));
    const r = await B.ev(FILL(next.i));
    if (process.env.FIELD_DEBUG) console.log('      ->', r);
    await sleep(350);
    if (r === 'file') {
      const sel = "document.querySelectorAll('input:not([type=hidden]),select,textarea')[" + next.i + "]";
      const el = await B.send('Runtime.evaluate', { expression: sel });
      const accept = await B.ev('(' + sel + '.accept||"")');
      const given = el && el.result && el.result.objectId ? await B.send('DOM.setFileInputFiles', { files: [madeUpFile(accept)], objectId: el.result.objectId }) : { error: { message: 'not found' } };
      await sleep(600);
      if (given && !given.error) { if (next.keys.length) REACHED.push({ page: ctx.page, role: ctx.role, size: ctx.size, screen: ctx.screen, keys: next.keys, how: 'given a made-up file' }); }
      else if (next.keys.length) SKIPPED_KEYS.push({ page: ctx.page, role: ctx.role, size: ctx.size, screen: ctx.screen, keys: next.keys, words: next.words, why: 'a file picker the browser would not give a file to: ' + ((given && given.error && given.error.message) || '') });
      if (B.errors.length > before) why.push('console: given a file, "' + next.words + '": ' + B.errors[before]);
      await reopen();
      continue;
    }
    if (r === 'filled' || r === 'one choice') { if (next.keys.length) REACHED.push({ page: ctx.page, role: ctx.role, size: ctx.size, screen: ctx.screen, keys: next.keys, how: r === 'filled' ? 'filled' : 'shown (one choice)' }); }
    if (B.errors.length > before) why.push('console: filling "' + next.words + '": ' + B.errors[before]);
    if (ctx.state || ((await B.ev(OVERLAY)) || 'null') !== resting || (await B.ev(HERE)) !== home) await reopen();
  }
  return why;
}

/* ---------------- the run ---------------- */
const RESULTS = [];
/* SAVED AS IT GOES, AND --resume (Martin, 4 Nov 2026: "a pause loses at most
   one screen"). Every screen's result goes into the progress file the moment
   it is recorded, beside the reached controls saveReached() already writes
   after each screen. --resume reads all three back: a screen that passed,
   for that person at that size, is not opened again, and its result and its
   reached controls are kept (loaded, not started empty, so what the first
   part counted still counts); a screen that failed, or never finished, runs
   again, and anything it left half-recorded is dropped. */
const PROGRESS_FILE = REACHED_FILE.replace(/[.]json$/, '-progress.json');
const screenKey = (role, size, screen) => [role, size, screen].join(' | ');
const PASSED = new Map();
if (flag('resume') && fs.existsSync(PROGRESS_FILE)) {
  JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')).filter((r) => r.pass).forEach((r) => PASSED.set(screenKey(r.role, r.size, r.screen), r));
  const keep = (x) => x.screen !== undefined && PASSED.has(screenKey(x.role, x.size, x.screen));
  const read = (f) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
  REACHED.push(...read(REACHED_FILE).filter(keep));
  SKIPPED_KEYS.push(...read(REACHED_FILE.replace(/[.]json$/, '-skipped.json')).filter(keep));
  /* Carried forward whatever pages this run is given, so a later part keeps an earlier part's results. */
  RESULTS.push(...PASSED.values());
  console.log('--resume: ' + PASSED.size + ' screens passed before and are kept, with their ' + REACHED.length + ' reached controls');
}
/** A screen this run need not open again (--resume): its earlier pass, already in RESULTS, stands. */
function passedBefore(role, size, screen) {
  const r = PASSED.get(screenKey(role, size, screen));
  if (!r) return null;
  console.log('  PASS  ' + role + ' ' + size + ' ' + screen + ' (passed before: kept)');
  return r.m || {};
}
/** The results so far, after every screen (see SAVED AS IT GOES). */
function saveProgress() {
  /* Never from --self-test: its made-up pages overwrote a real run's progress
     (6 Nov 2026: 103 screens lost to one self-test record). */
  if (SELF) return;
  fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true });
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(RESULTS));
}
function record(r) { RESULTS.push(r); saveProgress(); const mark = r.pass ? 'PASS' : 'FAIL'; console.log('  ' + mark + '  ' + r.role + ' ' + r.size + ' ' + r.screen + (r.pass ? '' : '\n          ' + r.why.join('\n          '))); }

async function auditScreen(B, { role, size, screen, url, inApp, taps, base, shotName, steps, must, reads, fresh }) {
  const before = passedBefore(role, size, screen); if (before) return before;
  if (!LIVE) await restoreSettings();
  const [w, h] = ALL_SIZES[size];
  await B.size(w, h);
  /* A STATE THAT ADDS ROWS (fresh: true): its steps run again before every
     press, and a page that keeps its rows in the tab's session storage (the
     practice rota planner) gained a term of practices each time - hundreds of
     rows, more to press each time, gigabytes in a minute (6 Nov 2026). The
     session is cleared before each opening, so every press starts the same.
     Sign-in is not kept there. */
  const clearSession = async () => { if (fresh) await B.ev('(function(){try{sessionStorage.clear()}catch(e){}return 1})()'); };
  await clearSession();
  await B.go(url);
  await runSteps(B, steps);
  if (PROBE) {
    const c = JSON.parse((await B.ev(CONTROLS)) || '[]'), f = JSON.parse((await B.ev(FIELDS)) || '[]');
    console.log('  PROBE ' + role + ' ' + size + ' ' + screen + '\n    ' + [...new Set(c.concat(f).map((x) => (x.keys || [])[0]))].join(' '));
    if (flag('probe-why')) console.log('    errors: ' + B.errors.slice(0, 3).join(' | ') + '\n    text: ' + String(await B.ev('[...document.querySelectorAll("[data-qerr],[role=status]")].map(function (e) { return e.textContent; }).filter(Boolean).join(" / ") + " // " + document.body.innerText.replace(/\\s+/g, " ").slice(0, 300)')));
    return {};
  }
  const errs = B.errors.slice();
  const m = JSON.parse((await B.ev(MEASURE)) || '{}');
  const why = [];
  /* WHAT THIS PERSON MUST SEE HERE (a state's must: { role: [[selector, words?, what], ...] }): the audit
     only judges what is drawn, so a thing that should be there and is not (the lead's leaders, Checks,
     Exception, "Sign it off") passed. Missing, it fails. */
  for (const [sel, words, what] of ((must || {})[role] || [])) {
    const ok = await B.ev('(function(){var r=new RegExp(' + JSON.stringify(words || '') + ',"i");return [].some.call(document.querySelectorAll(' + JSON.stringify(sel) + '),function(e){var b=e.getBoundingClientRect();return (b.width>0||b.height>0)&&r.test(e.textContent||e.value||"")})})()');
    /* with what the page said instead, so a lockout and a wrong check can be told apart */
    if (!ok) why.push('missing: ' + (what || sel) + ' (' + role + ' must see it here; the page says: "' + String(await B.ev('document.body.innerText.replace(/\\s+/g, " ").slice(0, 200)')) + '")');
  }
  /* AND EVERY READ THE RULES REFUSED THEM on a screen meant for them (reads: 'all' on the state, or the
     role's name in it), unless the state says that one is meant (reads: { role: [/path/...] }) */
  /* a state is a screen meant for the people it lists; a page's first view may be one that refuses them */
  if (steps) { const denied = JSON.parse((await B.ev('JSON.stringify((window.__aud&&window.__aud.denied)||[])')) || '[]');
    const meant = (reads && reads[role]) || [];
    [...new Set(denied)].filter((d) => !meant.some((r) => r.test(d))).slice(0, 6).forEach((d) => why.push('refused read: ' + d)); }
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
    const ctx = { page: String(screen).replace(/^from the app: /, '').replace(/ \(.*\)$/, '').split('?')[0], role, size, screen, state: !!(steps && steps.length) || / \(state: /.test(String(screen)), base };
    const back = async () => { await clearSession(); await B.go(url); await runSteps(B, steps); };
    B.ctx = ctx;
    /* FIELDS FIRST, then the presses (5 Nov 2026). A press can save - "Start the assessment" made the
       assessment - and the field it replaces (the template to start from) was then never there to fill.
       Filling saves nothing by itself; the page is opened again before the presses. */
    if (EVERY) { why.push(...await fillFields(B, back, ctx)); saveReached(); await back(); }
    const t = await tapAll(B, url, back, ctx);
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
  /* Read until it holds still, with the person's profile in: read once, at
     1.5 s, a slow sign-in left a core team member's Menu with only the
     basics, and every team page then read as "not offered" (core at 375,
     3 Nov 2026). */
  let last = null, now = null;
  for (let i = 0; i < 20; i++) {
    now = await readMenu(B);
    if (now === last && (await B.ev('!!(window.EGBCAuth&&EGBCAuth.profile&&EGBCAuth.profile())'))) break;
    last = now; await sleep(500);
  }
  return JSON.parse(now || '{"all":[],"mine":[]}');
}
async function readMenu(B) {
  return (await B.ev(`JSON.stringify((function(){
    var all=[], mine=[];
    (EGBCMenu.allPages()||[]).forEach(function(p){ if(p.url) all.push(String(p.url)); });
    (function w(n){ n.forEach(function(x){ if(x.url) mine.push(String(x.url)); if(x.children) w(x.children); }); })(EGBCMenu.forPerson(EGBCMenu.who()));
    /* The "you" menu offers some pages too (My availability is index.html). */
    if (EGBCMenu.youLinks) EGBCMenu.youLinks(EGBCAuth.profile && EGBCAuth.profile()).forEach(function(u){ mine.push(String(u)); });
    return {all:all, mine:mine};
  })())`)) || '{"all":[],"mine":[]}';
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
  const before = passedBefore(role, size, 'app: ' + space + ' / ' + tab); if (before) return before;
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
    const back = async () => { await B.go(url); await goApp(B, space, tab); };
    const ctx = { page: 'app.html', role, size, screen: 'app: ' + space + ' / ' + tab };
    const t = await tapAll(B, url, back, ctx);
    why.push(...t.why); skipped = t.skipped;
    if (EVERY) { await back(); why.push(...await fillFields(B, back, ctx)); saveReached(); }
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
  /* --resume: kept, not pressed again (as findability and every screen). */
  if (passedBefore(role, size, 'back to the app from ' + from)) return;
  const has =await B.ev('(function(){var a=document.querySelector("#egbc-am-top a.am-back");if(!a)return 0;a.click();return 1})()');
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
  /* --resume: a pass kept from an earlier part is not opened again (the
     proof, 6 Nov 2026: this screen alone was re-run and recorded twice). */
  if (passedBefore(role, size, 'findability (taps from Home)')) return;
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
  /* --every: taps at every size, for every role, on every screen they see. */
  const tapsHere = !NO_TAPS && (EVERY || String(size) === TAP_SIZE);
  /* --reseed (Stage 3, with --press-all): the records put back before each person at each size, so what one pressed away is there for the next */
  if (!LIVE && flag('reseed')) await seedMore();
  await signIn(B, base, role);
  await B.size(...ALL_SIZES[size]);
  if (!NO_SITE && (String(size) === TAP_SIZE || size === '1440')) await findability(B, role, size, base);
  /* ---- website ---- */
  if (!NO_SITE) {
    const menu = await menuFor(B, base);
    const allPages = [...new Set(['hub.html'].concat(menu.all, ALSO_AUDIT, ALSO_OPT))].filter(u => !ONLY_PAGES || ONLY_PAGES.includes(u.split('?')[0]));
    const mine = new Set(['hub.html'].concat(menu.mine));
    for (const page of allPages) {
      if (B.isDead()) { console.log('          (the browser stopped answering: a fresh one)'); await B.restart(); await B.size(...ALL_SIZES[size]); await signIn(B, base, role); }
      if (!LIVE) await restoreSettings();
      /* "hub.html?notices=1" is Home with its Notices open: offered if the
         page itself is (22 Oct 2026 - it was counted as a page apart). */
      const should = mine.has(page) || mine.has(page.split('?')[0]);
      /* --every: a page in nobody's Menu is pressed, like any other, by the
         people OFF_MENU_BY_DESIGN says it is for (3 Nov 2026), at every size
         (4 Nov: it was only at the tap size, so 1440 was never pressed);
         everyone else has its access checked below, once. */
      const forThem = OFF_MENU_BY_DESIGN[page.split('?')[0]] || (PRESS_AS[page.split('?')[0]] && { roles: PRESS_AS[page.split('?')[0]] });
      const pressIt = !should && EVERY && forThem && (forThem.roles === 'all' || [].concat(forThem.roles).includes(role));
      if (!should && !pressIt && String(size) !== TAP_SIZE) continue;      /* access is checked once */
      if (pressIt) {
        await auditScreen(B, { role, size, screen: page + ' (opened from another page)', url: base + page, inApp: false, taps: tapsHere, base });
        continue;
      }
      if (!should) {
        /* --resume: a refusal already proved is kept, not opened again. */
        if (passedBefore(role, size, page + ' (not in their Menu)')) continue;
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
      const tapNow = tapsHere && (EVERY || !shared.tappedPages.has(key));
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
  /* ---- deeper screens (--states) ---- */
  for (const st of STATES) {
    if (!(st.roles === 'all' || [].concat(st.roles || []).includes(role))) continue;
    if (ONLY_PAGES && !ONLY_PAGES.includes(st.url.split('?')[0])) continue;
    if (ONLY_STATE && !ONLY_STATE.split('|').some((w) => st.name.includes(w))) continue;
    if (B.isDead() || memLow()) { if (memLow()) console.log("          (only " + (MEM / 2 ** 30).toFixed(1) + " GB free: a fresh browser before the next state)"); await B.restart(); await B.size(...ALL_SIZES[size]); await signIn(B, base, role); }
    await auditScreen(B, { role, size, screen: st.url.split('?')[0] + ' (state: ' + st.name + ')', url: base + st.url, inApp: false, taps: tapsHere, base, steps: st.steps, must: st.must, reads: st.reads, fresh: st.fresh });
  }
  /* ---- the app ---- */
  if (!NO_APP) {
    const screens = await appScreens(B, base);
    const opened = new Set();
    for (const [space, tab] of screens) {
      const tapNow = tapsHere && (EVERY || !shared.tappedApp.has(role + space + tab));
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
      const tapNow = tapsHere && (EVERY || !shared.tappedPages.has('app:' + page));
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
  const expect = { clean: null, console: 'console', overflow: 'overflow', bars: 'bars', chrome: 'chrome', dead: 'dead', covered: 'covered', sheet: 'sheet', hidden: 'hidden', insideapp: 'chrome', small: 'small',
    foldok: null, foldcovered: 'covered', windowok: null, windowcovered: 'covered', windowabs: null, windowclear: 'covered', barok: null, hiddenbottom: 'hidden' };
  let bad = 0;
  try {
    for (const [name, rule] of Object.entries(expect)) {
      RESULTS.length = 0;
      /* The window pages are judged as a state (a step that does nothing), as the hub's are. */
      await auditScreen(B, { role: 'self', size: '375', screen: name, url: base + '__audit/' + name + '.html', inApp: name === 'insideapp', taps: true, base, steps: /^window/.test(name) ? ['1'] : undefined });
      const r = RESULTS[0], rules = r.why.map(w => w.split(':')[0]);
      const good = rule ? rules.includes(rule) : r.pass;
      if (!good) bad++;
      console.log('  ' + (good ? 'PASS' : 'FAIL') + '  the ' + name + ' page ' + (rule ? 'is caught by "' + rule + '"' : 'passes') + (good ? '' : '   got: ' + (r.why.join(' | ') || 'a pass')));
      /* A page that did not behave: what the audit pressed and what it set aside, and why. */
      if (!good) {
        REACHED.filter((x) => x.screen === name).forEach((x) => console.log('          pressed: ' + JSON.stringify(x.keys).slice(0, 80) + ' (' + x.how + ')'));
        SKIPPED_KEYS.filter((x) => x.screen === name).forEach((x) => console.log('          set aside: ' + (x.words || JSON.stringify(x.keys).slice(0, 60)) + ' - ' + x.why));
      }
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
  if (!LIVE) { await seed(); await seedMore(); }
  await loadStates();
  const started = new Date();
  const shared = { tappedPages: new Set(), tappedApp: new Set() };
  /* TWO BROWSERS, not one a size: four at once overloaded the emulator and
     every page went "client is offline" halfway through (A-090). One takes
     the size the taps happen at; the other takes the rest, one by one. */
  /* --reseed (Stage 3): one size after the other. The sizes share the records the states press - a plan
     being presented, a quiz running - and side by side one size's presses changed what the other saw (4 Nov 2026). */
  const groups = flag('reseed') ? [SIZES] : [[TAP_SIZE], SIZES.filter(x => x !== TAP_SIZE)].filter(g => g.length);
  const workers = groups.map((sizes, i) => (async () => {
    const B = await browser(PORT0 + i, 'w' + i);
    try {
      for (const size of sizes) for (const role of ROLES) {
        console.log('\n== ' + role + ' at ' + size + ' ==');
        try { await runRole(B, role, size, base, shared); }
        catch (e) {
          record({ screen: '(the run)', role, size, pass: false, why: ['the audit itself failed: ' + (e && e.message)], skipped: [] });
          /* A browser that stopped answering stays stopped: the next role gets a fresh one. */
          try { await B.restart(); } catch (x) { /* the next role says so */ }
        }
      }
    } finally { B.close(); }
  })());
  await Promise.all(workers);
  if (!LIVE) await unseed();
  writeReport(started);
  if (EVERY) saveReached();
  const fails = RESULTS.filter(r => !r.pass).length;
  console.log('\n' + fails + ' failing of ' + RESULTS.length + ' screens. Report: tests/audit-report.md');
  if (server) server.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
