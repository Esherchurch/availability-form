/* Share on WhatsApp for events (SHARE-NOTIFY-BRIEF Part 1; NEXT-BRIEF §26
   item 7 is the real-device part, which this cannot prove).
   Events window. Invented people and events only, events emulators only,
   network guard, nothing sent: the phone's share sheet and wa.me are
   stand-ins that only record what they were handed.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/share.test.mjs"

   What it proves:
     1. the event's own page: Share on WhatsApp opens the preview with the
        title, when and where, the words in WhatsApp's own markup, and the
        link; Share hands the phone the words AND the poster as a file
     2. the words are read safely: a bad <img onerror> in an event's words
        runs nowhere, not on the page and not in the share
     3. an event not announced yet has no Share button; a cancelled one
        says CANCELLED
     4. the app's event view: Share on WhatsApp (egbc-share.js fetched the
        first time); the words show as text, never as "<p>"
     5. events-admin on a computer: the list's Share opens wa.me with the
        message ready; an open upload link has Share, a run-out one has not
     6. the calendar file carries the words as text */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-share-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 500))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const iso = (d) => ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';

const env = await initializeTestEnvironment({ projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = {
  ann:   { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann' },
  admin: { email: 'share.admin@example.invalid', name: 'Share Admin', mid: 'm_admin', master: true }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}

/* The words: a heading, bold, italic, a list, a link, and three bad
   pictures that would set window.__pwned if they ever ran. The third has a
   real web address (one that does not exist, so its onerror fires), which
   the cleaner keeps as a picture: only its onerror must go. */
const WORDS = '<h2>What to bring</h2><p>A <b>dish</b> to share, and <i>a friend</i>.</p><ul><li>Plates</li><li>Cups</li></ul>' +
  '<p>The menu: <a href="https://example.invalid/menu">see it here</a></p>' +
  '<img src="x" onerror="window.__pwned=1"><p>Doors open <img src="nope" onerror="window.__pwned=2">at six.</p>' +
  '<p><img src="http://localhost:5601/no-such-picture.png" alt="" onerror="window.__pwned=3"></p>';
const POSTER = URLB + 'icon-192.png';

const soon = new Date(); soon.setDate(soon.getDate() + 3); soon.setHours(18, 0, 0, 0);
const EV = (title, extra) => ({ title, description: WORDS, category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
  featured: false, startLocal: iso(soon), startUtc: soon.getTime(), endLocal: iso(new Date(soon.getTime() + 2 * 3600e3)), endUtc: soon.getTime() + 2 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: false, image: POSTER, createdBy: 'x', updatedAt: 'x', ...(extra || {}) });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.master ? ['Core Team'] : [], adminFor: [], masterAdmin: !!x.master, churchMember: false });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.master ? ['Core Team'] : [], adminFor: [], masterAdmin: !!x.master,
      attender: true, churchMember: false, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'calEvents', 'ev_sup'), EV('Test Harvest Supper'));
  await setDoc(doc(db, 'calEvents', 'ev_off'), EV('Test Quiz Night', { status: 'cancelled', description: '<p>Sorry, not this time.</p>', image: '' }));
  await setDoc(doc(db, 'calEvents', 'ev_pend'), EV('Test Secret Party', { status: 'pending', visibility: 'members', audience: ['members'], image: '' }));
  await setDoc(doc(db, 'uploadLinks', 'up_open_link'), { calEventId: 'ev_sup', eventTitle: 'Test Harvest Supper', createdBy: P.admin.uid, createdAt: '2026-10-01',
    expiresAt: new Date(Date.now() + 10 * 864e5), maxFiles: 50, active: true, count: 0 });
  await setDoc(doc(db, 'uploadLinks', 'up_old_link'), { calEventId: 'ev_sup', eventTitle: 'Test Harvest Supper', createdBy: P.admin.uid, createdAt: '2026-09-01',
    expiresAt: new Date(Date.now() - 864e5), maxFiles: 50, active: true, count: 0 });
});

/* The stand-ins. A phone: navigator.share records what it was handed. A
   computer: no navigator.share, and window.open records the wa.me link. */
function phone() {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => !!d });
  Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => {
    window.__shared = { text: d.text, files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })) };
    return Promise.resolve();
  } });
}
function computer() {
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  window.open = (u) => { window.__opened = u; return {}; };
}

const errors = [], browsers = [];
async function as(who, kind, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.evaluateOnNewDocument(kind === 'phone' ? phone : computer);
  await p.setViewport({ width: width || 390, height: 844 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => { errors.push(who + ' dialog: ' + d.message()); d.dismiss(); });
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText);
const preview = (p) => until(() => p.$eval('.egbc-share textarea', t => t.value).catch(() => null));

function wellFormed(t, link) {
  const need = ['*Test Harvest Supper*', '*What to bring*', 'A *dish* to share, and _a friend_.', '- Plates\n- Cups', 'https://example.invalid/menu', 'Doors open at six.'];
  const miss = need.filter(s => t.indexOf(s) < 0);
  if (miss.length) return 'missing: ' + miss.join(' | ');
  if (/[<>]|onerror|pwned/.test(t)) return 'carries HTML';
  if (!t.trim().endsWith(link)) return 'does not end with the link';
  return '';
}

try {
  /* 1-3. the event's own page, on a phone */
  const A = await as('ann', 'phone');
  await go(A, 'signup.html?event=ev_sup', '#share');
  ok('1. the event\'s page has Share on WhatsApp', /Share on WhatsApp/.test(await text(A, '#share')));
  ok('2. its words show, cleaned: the heading and the list are there', /What to bring/.test(await text(A, '.desc')) && !!(await A.$('.desc ul li')));
  await sleep(800);   /* time for a missing picture's error to fire */
  const imgs = await A.$$eval('.desc img', a => a.map(i => i.outerHTML));
  ok('   AND NO BAD PICTURE RAN ON THE PAGE: the web one is kept, without its onerror',
    (await A.evaluate(() => window.__pwned)) === undefined && imgs.length === 1 && !/onerror/i.test(imgs[0]), (await A.evaluate(() => window.__pwned)) + ' ' + imgs.join(' '));
  await tap(A, '#share');
  const t1 = await preview(A);
  const link = URLB + 'signup.html?event=ev_sup';
  ok('1. the preview: title, when, the words in WhatsApp\'s markup, the link last', t1 && !wellFormed(t1, link), (wellFormed(t1 || '', link)) + '\n' + t1);
  ok('   it says when and where', t1 && t1.split('\n')[1].indexOf(' · ') > 0 && /Online/i.test(t1.split('\n')[1]), t1 && t1.split('\n')[1]);
  ok('   the poster is offered, ticked', await until(() => A.$eval('#egbc-share-pic', c => c.checked && !c.disabled).catch(() => false)));
  await tap(A, '.egbc-share [data-share]');
  const sh = await until(() => A.evaluate(() => window.__shared));
  ok('1. Share hands the phone exactly the previewed words', sh && sh.text === t1, sh && sh.text);
  ok('   and the poster as a picture file', sh && sh.files.length === 1 && sh.files[0].type === 'image/png' && sh.files[0].size > 100, sh && JSON.stringify(sh.files));
  ok('2. NOTHING IN THE SHARE RAN THE BAD PICTURE', (await A.evaluate(() => window.__pwned)) === undefined);
  ok('   the preview closes', !(await A.$('.egbc-share')));

  await go(A, 'signup.html?event=ev_off', '.banner.warn');
  await A.waitForSelector('#share');
  await tap(A, '#share');
  const t2 = await preview(A);
  ok('3. a cancelled event can still be shared, and says CANCELLED', t2 && /^\*Test Quiz Night\*\nCANCELLED · /.test(t2) && /Sorry, not this time\./.test(t2), t2);
  await tap(A, '.egbc-share [data-close]');

  /* 4. the app */
  await go(A, 'screenshots/events/app-harness.html?space=me&tab=whatson');
  await until(() => A.$('[data-w="events"]'));
  await A.evaluate(() => document.querySelector('[data-wact="event:ev_sup"]').click());
  await until(() => A.$('[data-w="acts"]'));
  const acts = await text(A, '[data-w="acts"]');
  ok('4. the app\'s event view has Share on WhatsApp', /Share on WhatsApp/.test(acts), acts);
  const words = await text(A, '[data-w="words"]');
  ok('   its words show as text, never as "<p>"', /What to bring/.test(words) && /- Plates/.test(words) && !/<|onerror/.test(words), words);
  ok('   egbc-share.js was not loaded before it was needed', (await A.evaluate(() => !!window.EGBCShare)) === false);
  await A.evaluate(() => { window.__shared = null; document.querySelector('[data-wact="share"]').click(); });
  const t3 = await preview(A);
  ok('4. tapping it fetches the shared helper and opens the same preview', t3 && !wellFormed(t3, link) && await A.evaluate(() => !!window.EGBCShare), (wellFormed(t3 || '', link)) + '\n' + t3);
  ok('   the app never ran the bad picture either', (await A.evaluate(() => window.__pwned)) === undefined);

  /* 3 (again). not announced yet: no button, for the admin who can see it */
  const M = await as('admin', 'computer', 1100);
  await go(M, 'signup.html?event=ev_pend', 'h1');
  await sleep(500);
  ok('3. an event not announced yet has no Share button', /Not announced yet/.test(await text(M)) && !(await M.$('#share')));

  /* 5. events-admin on a computer */
  await go(M, 'events-admin.html', '.open[data-id="ev_sup"]');
  ok('5. the admin list: Share beside each announced event, none on the one not announced yet',
    !!(await M.$('.evshare[data-id="ev_sup"]')) && !(await M.$('.evshare[data-id="ev_pend"]')));
  await tap(M, '.evshare[data-id="ev_sup"]');
  const t4 = await preview(M);
  ok('   the same preview', t4 && !wellFormed(t4, link), t4);
  await tap(M, '.egbc-share [data-share]');
  const opened = await until(() => M.evaluate(() => window.__opened));
  ok('5. on a computer, Share opens wa.me with the message ready', opened && opened.indexOf('https://wa.me/?text=') === 0 && decodeURIComponent(opened.slice(20)) === t4, opened);

  await tap(M, '.open[data-id="ev_sup"]');
  await M.waitForSelector('.tab[data-tab="photos"]');
  await tap(M, '.tab[data-tab="photos"]');
  await M.waitForSelector('.lnk[data-id="up_open_link"]');
  ok('5. an open upload link has Share on WhatsApp; a run-out one has not',
    !!(await M.$('.lnk[data-id="up_open_link"] .lshare')) && !(await M.$('.lnk[data-id="up_old_link"] .lshare')));
  await tap(M, '.lnk[data-id="up_open_link"] .lshare');
  const t5 = await preview(M);
  ok('   it asks for photos, says nothing is shown until looked at, and ends with the upload link',
    t5 && /^\*Photos from Test Harvest Supper\*/.test(t5) && /until it has been looked at/.test(t5) && t5.trim().endsWith(URLB + 'upload.html?k=up_open_link'), t5);
  await tap(M, '.egbc-share [data-close]');

  /* 6. the calendar file */
  const ics = await M.evaluate(() => EGBCEvents.icsFor({ id: 'x', title: 'T', description: '<p>One <b>two</b></p><ul><li>three</li></ul>', startLocal: '2026-11-01T10:00', endLocal: '2026-11-01T11:00' }, ''));
  ok('6. the calendar file carries the words as text', /DESCRIPTION:One two\\n\\n- three/.test(ics.replace(/\r?\n /g, '')) && !/<p>/.test(ics), ics);

  ok('no page errors or alerts', errors.length === 0, errors.join('\n'));
} catch (e) {
  ok('the test ran to the end', false, e.stack || e);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  await env.cleanup(); server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
