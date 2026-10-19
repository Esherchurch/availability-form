/* AUDIT OF THE EVENTS WINDOW'S PAGES (the live audit, 15 Oct: sections 1-4).
   Events window. Invented people only, events emulators only, network
   guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/audit-events.test.mjs"
     (add --shots for a phone screenshot of each page as each person)

   For every page the events window made, at 412px (Martin's phone):
     1. VIEW AS CAN BE TRUSTED: a master admin viewing as "Everyone (no
        team)" sees exactly what a real member on no team sees, and viewing
        as Kids Church exactly what a real Kids Church member sees. The test
        church makes Martin everything a page might let in on by name - an
        event's team and leader, a site's safeguarding lead and bookings
        admin, a small group's leader - so a page that looks at who is
        really signed in shows its admin view and fails.
     2. NO JAVASCRIPT ERROR on any page, for anyone - refused or not.
     3. FITS THE PHONE: nothing scrolls sideways.
     4. BIG ENOUGH TO TAP, as Martin: no control under 30px on a side (a
        tick box counts its label, as a finger does; a link inside a
        sentence is not a control). Under 44px is listed, not failed.
   One line per page and person, so the main window's audit-everything can
   read it: AUDIT <page> <who> <check> PASS|FAIL. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const SHOTS = process.argv.includes('--shots');
const ONLY = (process.argv.find(a => a.startsWith('--page=')) || '').slice(7);
const SHOTDIR = path.join(HERE, 'audit');
if (SHOTS) fs.mkdirSync(SHOTDIR, { recursive: true });
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-audit-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 900))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';

/* ---------- the test church: Martin is everything a page lets in by name ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  mia:    { email: 'mia.member@example.invalid', name: 'Mia Member', mid: 'm_mia', teams: [] },
  kade:   { email: 'kade.kids@example.invalid', name: 'Kade Kids', mid: 'm_kade', teams: ['Kids Church'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
for (const [id, name] of [['t_core', 'Core Team'], ['t_kids', 'Kids Church'], ['t_past', 'Pastoral'], ['t_worship', 'Worship Team']]) {
  await db.collection('teams').doc(id).set({ name, rota: id === 't_worship', order: 1 });
}
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
await db.collection('sites').doc('site_a').set({ name: 'Main building (invented)', active: true, order: 1 });
await db.collection('rooms').doc('room_a').set({ name: 'Big hall (invented)', siteId: 'site_a', active: true, kind: 'room', bookable: true });
await db.collection('bookingSettings').doc('site_a').set({ bookingsAdmins: ['m_martin'], safeguardingLead: 'm_martin', safeguardingDeputy: '' });
await db.collection('safeguardingSettings').doc('defaults').set({ leadSiteId: 'site_a' });
await db.collection('kidsSettings').doc('site_a').set({ teams: ['Kids Church'] });
await db.collection('groupsSettings').doc('main').set({ teams: ['Pastoral'] });
await db.collection('smallGroups').doc('g_martin').set({ name: 'Tuesday group (invented)', leaderIds: ['m_martin'], siteId: 'site_a', active: true, open: true });
const now = new Date(); now.setMinutes(0, 0, 0); now.setHours(now.getHours() + 2);
await db.collection('calEvents').doc('ev_a').set({ title: 'Film Club (invented)', description: '', category: 'social', labels: [], visibility: 'members', status: 'confirmed', audience: ['members'], teams: [], featured: false,
  startLocal: iso(now), startUtc: now.getTime(), endLocal: iso(new Date(now.getTime() + 2 * 3600e3)), endUtc: now.getTime() + 2 * 3600e3, allDay: false,
  location: { kind: 'room', siteId: 'site_a', roomIds: ['room_a'] }, organiserName: 'x', signupOn: true, capacity: 30, createdBy: P.martin.uid, updatedAt: 'x',
  teamMemberIds: ['m_martin'], teamUids: [P.martin.uid], teamNames: ['Martin Master'] });
await db.collection('eventLeaders').doc('ev_a').set({ calEventId: 'ev_a', leaderUids: [P.martin.uid], leaderIds: ['m_martin'], updatedAt: 'x' });
/* Enough on the lists for their rows (and their small buttons) to show:
   sign-ups to check in, pictures in the library. */
for (const i of [1, 2, 3]) {
  await db.collection('signups').doc('su_a_' + i + '_000000000000000000000').set({ calEventId: 'ev_a', personKind: 'contacts', personId: 'c_' + i, name: 'Guest ' + i + ' (invented)', email: 'guest' + i + '@example.invalid', phone: '', attendees: [{ name: 'Guest ' + i + ' (invented)' }], answers: {}, places: 1, ticketTypeId: '', status: 'confirmed', donation: 0, notes: '', memberUid: '', createdAt: 'x' });
  await db.collection('pictureLibrary').doc('pic_' + i).set({ name: 'Picture ' + i + ' (invented)', tags: ['test'], url: URLB + 'screenshots/events/watch-375.png', path: 'library/pic_' + i + '/x.png', width: 375, height: 600, createdAt: 'x', createdBy: P.martin.uid, updatedAt: 'x', updatedBy: P.martin.uid });
}
await db.collection('fireRollCall').doc('main').set({ people: [{ memberId: 'm_martin', name: 'Martin Master', siteId: '' }], memberIds: ['m_martin'], allSites: ['m_martin'], bySite: {}, updatedBy: P.martin.uid, updatedByName: 'x', updatedAt: 'x' });

/* ---------- the pages ---------- */
const PAGES = ['attendance.html?event=ev_a', 'book.html', 'bookings-admin.html', 'building.html', 'checkin.html', 'checkin.html?event=ev_a', 'checkin.html?view=rollcall',
  'church-settings.html', 'comms.html', 'compliance.html', 'events-admin.html', 'forms-admin.html', 'giftaid.html', 'give-regularly.html', 'groups-admin.html', 'groups.html',
  'headcounts.html', 'hire.html', 'kids-admin.html', 'kids-checkin.html', 'maintenance.html', 'my-messages.html', 'newhere.html', 'notifications.html',
  'payments.html', 'picture-library.html', 'places-admin.html', 'prayer.html', 'retention.html', 'room.html?id=room_a', 'rooms.html', 'rota-reports.html',
  'safeguarding-settings.html', 'safeguarding.html', 'sermons-admin.html', 'session-planner.html', 'signup.html?event=ev_a', 'team-mail.html', 'watch-admin.html', 'whatson.html'
].filter(p => !ONLY || p.startsWith(ONLY));
/* Every page is held to it (the audit named events-admin, check-in and the picture library; Martin's floor is for all). */

const errors = [], browsers = [];
async function browser(who, viewAs) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k, va) => {
    try { sessionStorage.setItem(k, '1'); if (va) sessionStorage.setItem('egbc_view_as', va); } catch (e) {}
  }, 'egbc_fresh_' + STAMP, viewAs ? JSON.stringify(viewAs) : '');
  await pg.setViewport({ width: 412, height: 915 });
  pg._errs = [];
  pg.on('pageerror', e => pg._errs.push(e.message));
  pg.on('dialog', d => d.dismiss());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(500);
  return pg;
}

/* What the page says, without whose page it is: the names, the view-as
   strip, the clock. Two people who see the same page get the same words. */
const NAMES = [P.martin.name, P.mia.name, P.kade.name, 'Martin', 'Mia', 'Kade', 'MM', 'MI', 'KK'];
async function seen(pg) {
  return pg.evaluate((names) => {
    ['egbc-viewas', 'egbc-viewas-top'].forEach(id => { const va = document.getElementById(id); if (va) va.remove(); });
    document.querySelectorAll('header, nav, .egbc-shell-bar, #egbc-shell, #egbc-bar, .topbar, [data-egbc-bar]').forEach(e => e.remove());
    let t = (document.body.innerText || '').replace(/\s+/g, ' ');
    names.forEach(n => { t = t.split(n).join('<name>'); });
    return t.replace(/\b\d{1,2}:\d{2}\b/g, '<time>').replace(/[\w.+-]+@example\.invalid/g, '<email>').trim();
  }, NAMES);
}
async function settle(pg) {
  let last = '', same = 0;
  /* Settled: the same for three looks, and not still saying it's busy
     ("Checking access", "Loading…") - comparing two half-loaded pages
     proves nothing. */
  for (let i = 0; i < 60 && same < 3; i++) {
    await sleep(250);
    const t = await pg.evaluate(() => /Checking access|Loading…|Loading\.\.\./.test(document.body.innerText) ? 'busy' + Math.random() : document.body.innerText.length + ':' + document.querySelectorAll('*').length).catch(() => '');
    same = t === last ? same + 1 : 0; last = t;
  }
}
async function open(pg, page) {
  pg._errs.length = 0;
  await pg.goto(URLB + page, { waitUntil: 'networkidle2' }).catch(() => {});
  await settle(pg);
}
async function sideways(pg) { return pg.evaluate(() => document.scrollingElement.scrollWidth - innerWidth); }
async function taps(pg) {
  return pg.evaluate(() => {
    const out = [];
    const vis = (r, s) => r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0;
    document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [tabindex="0"]').forEach(el => {
      if (el.closest('#egbc-viewas, #egbc-viewas-top, header, nav, .egbc-shell-bar')) return;
      if (el.type === 'hidden' || el.disabled) return;
      /* the robots' trap: hidden from people and from screen readers */
      if (el.closest('[aria-hidden="true"]') || el.getAttribute('tabindex') === '-1') return;
      const s = getComputedStyle(el); let r = el.getBoundingClientRect();
      if (!vis(r, s) || s.opacity === '0') return;
      /* a link inside a sentence is not a control */
      if (el.tagName === 'A' && s.display === 'inline' && el.parentElement && (el.parentElement.innerText || '').trim().length > (el.innerText || '').trim().length + 8) return;
      /* a tick box or a choice: its label is what a finger presses */
      if (el.type === 'checkbox' || el.type === 'radio') {
        const lab = el.closest('label') || (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'));
        if (lab) { const lr = lab.getBoundingClientRect(); if (lr.width > 0) r = lr; }
      }
      const m = Math.min(r.width, r.height);
      if (m < 44) out.push({ m: Math.round(m), what: (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : '') + ' ' + (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 24)).trim() });
    });
    return out;
  });
}
const shotName = (page, who) => page.replace(/[?=&.]+/g, '-').replace(/-html/, '') + '-' + who + '-412.png';

try {
  const M = await browser('martin');
  const MI = await browser('mia');
  const K = await browser('kade');
  const VE = await browser('martin', { team: '__everyone', admin: false });
  const VK = await browser('martin', { team: 'Kids Church', admin: false });
  const WHO = [['martin', M], ['mia', MI], ['kade', K], ['viewas-everyone', VE], ['viewas-kids', VK]];
  const smallList = [];
  for (const page of PAGES) {
    const T = {};
    for (const [who, pg] of WHO) {
      await open(pg, page);
      /* A page that moves itself on while it is read (a redirect, a
         reload) is opened once more, not counted as a crash. */
      try { T[who] = await seen(pg); }
      catch (e) { if (!/detached|context was destroyed/i.test(String(e && e.message))) throw e; await sleep(1500); await open(pg, page); T[who] = await seen(pg); }
      const errs = pg._errs.slice();
      ok('AUDIT ' + page + ' ' + who + ' no-js-error', errs.length === 0, errs.join(' | '));
      const sw = await sideways(pg);
      ok('AUDIT ' + page + ' ' + who + ' fits-412', sw <= 0, 'scrolls sideways by ' + sw + 'px');
      if (SHOTS) await pg.screenshot({ path: path.join(SHOTDIR, shotName(page, who)), fullPage: true });
      if (who === 'martin') {
        const t = await taps(pg);
        const tiny = t.filter(x => x.m < 30);
        if (t.length) smallList.push(page + ': ' + t.length + ' under 44px (' + tiny.length + ' under 30)');
        ok('AUDIT ' + page + ' martin taps-30', tiny.length === 0, J(tiny.slice(0, 14)));
      }
    }
    const diff = (a, b) => { if (a === b) return ''; let i = 0; while (i < a.length && a[i] === b[i]) i++; return '...' + a.slice(Math.max(0, i - 60), i + 140) + '\n          vs ...' + b.slice(Math.max(0, i - 60), i + 140); };
    ok('AUDIT ' + page + ' viewas-everyone same-as-member', T['viewas-everyone'] === T.mia, diff(T['viewas-everyone'], T.mia));
    ok('AUDIT ' + page + ' viewas-kids same-as-kids-member', T['viewas-kids'] === T.kade, diff(T['viewas-kids'], T.kade));
  }
  console.log('\nUnder 44px, as Martin (listed):\n  ' + (smallList.join('\n  ') || 'none'));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
