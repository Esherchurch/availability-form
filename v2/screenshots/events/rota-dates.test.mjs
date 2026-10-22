/* Rotas hide past dates; UK dates in the planners (Martin, 14 Oct 2026;
   FINDINGS-events F-171). Events window. Invented people only, events
   emulators only, network guard; the planner's email goes to the page's
   own outbox (egbc-nosend), never out.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/rota-dates.test.mjs"

   What it proves, on v2:
     A. the UK words: "Sunday 11 October 2026", "Sun 11 Oct 2026", today in
        England; and EVERY copy of the dates helper, here and on the
        original site, is the same
     B. the rotas (Planner, the view-only rota, Core Team ▸ Rota): past
        dates hidden; "Show past dates" brings them back and is remembered
        on this device; the page opens at the next date; a month's serving
        totals still count its past Sundays; nothing else on the row changes
     C. the planners (Sunday, youth, Core Team): "Service date" is the
        coming services in UK words, defaulting to the next one; ◀ ▶; "Pick
        another date"; the value underneath is the same yyyy-mm-dd the page
        used before, and setting it the old way still works; the emailed
        plan and the song summary say "Sunday 11 October 2026"
     D. 375px: nothing scrolls sideways */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const ROOT = path.resolve(V2, '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-rotad-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 500))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);

/* ---------- A. the words, and every copy the same ---------- */
console.log('\nA. the UK words, and every copy of the helper');
const MARK_A = '/* ── egbc-uk-dates', MARK_Z = '/* ── end egbc-uk-dates ── */';
const cut = (s) => { s = s.replace(/\r\n/g, '\n'); const a = s.indexOf(MARK_A), z = s.indexOf(MARK_Z); return a < 0 || z < a ? null : s.slice(a, z + MARK_Z.length); };
const CANON = cut(fs.readFileSync(path.join(HERE, 'uk-dates-snippet.js'), 'utf8'));
const COPIES = ['v2/Planner.html', 'v2/view-only-rota.html', 'v2/egbc-core-rota.js', 'v2/egbc-core-planner.js', 'v2/SundayServicePlanner.html',
  'v2/youthserviceplanner.html', 'v2/song-summary.html', 'Planner.html', 'view-only-rota.html', 'CoreTeamApp.html', 'SundayServicePlanner.html', 'youthserviceplanner.html', 'song-summary.html'];
const differ = COPIES.filter(f => cut(fs.readFileSync(path.join(ROOT, f), 'utf8')) !== CANON);
ok('A1. every page carries the same copy of the dates helper (' + COPIES.length + ' files, v2 and the original site)', !differ.length, 'differs or missing: ' + differ.join(', '));
/* The original site's song summary reads the live database, so it is checked by what it says. */
const ROOTSUM = fs.readFileSync(path.join(ROOT, 'song-summary.html'), 'utf8');
const has = (t) => ROOTSUM.includes(t);
ok('    the original site\'s song summary shows the date in UK words (tab, heading, every message)',
  has('document.title = `Song Summary – ${EGBCUKDates.long(date)}`') &&
  ROOTSUM.split("textContent = EGBCUKDates.long(date);").length === 3 &&
  has('textContent = `${EGBCUKDates.long(date)} · Worship Leader: ${leader}`') &&
  !has("textContent = date;") && !has('textContent = `${date}'));
const uctx = { window: {}, Intl, Date, Promise }; vm.createContext(uctx);
vm.runInContext(CANON, uctx);
const U = uctx.window.EGBCUKDates;
ok('A2. "Sunday 11 October 2026" and "Sun 11 Oct 2026"', U.long('2026-10-11') === 'Sunday 11 October 2026' && U.short('2026-10-11') === 'Sun 11 Oct 2026', U.long('2026-10-11') + ' / ' + U.short('2026-10-11'));
ok('    a leap day, and New Year\'s Eve', U.long('2028-02-29') === 'Tuesday 29 February 2028' && U.long('2026-12-31') === 'Thursday 31 December 2026');
ok('    anything that is not a date is left as it was ("TBC")', U.long('TBC') === 'TBC' && U.long('') === '');
const LONDON = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
ok('    today is England\'s today', U.today() === LONDON, U.today() + ' vs ' + LONDON);

/* ---------- the rota ---------- */
const T = LONDON;
const add = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const termOf = (ymd) => { const m = +ymd.slice(5, 7); return (m <= 4 ? 'Spring' : m <= 8 ? 'Summer' : 'Autumn') + ' ' + ymd.slice(0, 4); };
const GUS = { id: 'm_gus', name: 'Gus Guitar (invented)' };
const EV = {
  ev_old: { date: add(T, -200), type: 'Sunday Morning Worship' },
  ev_p20: { date: add(T, -20), type: 'Sunday Morning Worship' },
  ev_p15: { date: add(T, -15), type: 'Special Service' },
  ev_p12: { date: add(T, -12), type: 'Sunday Morning Worship' },
  ev_p10: { date: add(T, -10), type: 'Midnight Service' },
  ev_p8: { date: add(T, -8), type: 'Sunday Morning Worship' },
  ev_p5: { date: add(T, -5), type: 'Special Service' },
  ev_p3: { date: add(T, -3), type: 'Sunday Morning Worship' },
  ev_p1: { date: add(T, -1), type: 'Evening Carol Service' },
  ev_today: { date: T, type: 'Sunday Morning Worship', assignments: { Guitar: GUS } },
  ev_next: { date: add(T, 3), type: 'Sunday Morning Worship', description: 'Communion (invented)' },
  ev_prac: { date: add(T, 4), type: 'Sunday Team Practice' },
  ev_youth: { date: add(T, 5), type: 'LOUD Worship', description: 'Youth service (invented)' },
  ev_later: { date: add(T, 10), type: 'Sunday Morning Worship' }
};
/* A past Sunday in this same month, if today is not the 1st: the month's
   totals must still count it while it is hidden. */
const FIRST = T.slice(0, 8) + '01';
if (FIRST < T) EV.ev_month = { date: FIRST, type: 'Sunday Morning Worship', assignments: { Guitar: GUS } };
const PAST = Object.keys(EV).filter(k => EV[k].date < T);
const SOON = Object.keys(EV).filter(k => EV[k].date >= T).sort((a, b) => EV[a].date < EV[b].date ? -1 : 1);

/* ---------- the pages ---------- */
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
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.build.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const ME = { email: 'rita.rota@example.invalid', name: 'Rita Rota (invented)', mid: 'm_rita' };
ME.uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ME.email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
const TEAMS = ['Core Team', 'Worship Team', 'Youth Worship'];
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'addressBook', ME.mid), { name: ME.name, email: ME.email, markers: TEAMS, adminFor: TEAMS, masterAdmin: true, churchMember: true });
  await setDoc(doc(db, 'users', ME.uid), { memberId: ME.mid, linkedBy: 'admin', name: ME.name, email: ME.email, teams: TEAMS, adminFor: TEAMS, masterAdmin: true, attender: true, churchMember: true, status: 'active' });
  await setDoc(doc(db, 'addressBook', 'm_gus'), { name: GUS.name, email: 'gus@example.invalid', markers: ['Worship Team'], adminFor: [], primaryInstruments: ['Guitar'] });
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  for (const k of Object.keys(EV)) {
    const e = EV[k];
    await setDoc(doc(db, 'events', k), { date: e.date, type: e.type, termLabel: termOf(e.date), description: e.description || '', teams: ['Worship Team', 'Youth'],
      roles: ['Guitar'], assignments: e.assignments || {}, archived: false, draft: false, startTime: '10:30', endTime: '12:00' });
  }
  await setDoc(doc(db, 'songSummaries', EV.ev_later.date), { date: EV.ev_later.date, worshipLeader: ME.name, items: [] });
});

const errors = [], browsers = [];
let B = null;
async function browser() {
  if (B) return B;
  B = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, 'rita-')), args: ['--no-first-run', '--lang=en-US'], env: { ...process.env, LANG: 'en_US.UTF-8' } });
  GUARD.watchBrowser(B); browsers.push(B);
  const p = await page(1280);
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), ME.email);
  await p.close();
  return B;
}
/* A fresh tab for each page (F-073: the emulator's connection limit). */
async function page(width) {
  const p = await B.newPage();
  await GUARD.protect(p, 'rita');
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width, height: 800 });
  p.on('pageerror', e => errors.push(p.url().split('/').pop() + ': ' + e.message));
  p.on('dialog', d => d.accept());
  return p;
}
async function open(file, width = 1280, ready = '[data-date]') {
  await browser();
  const p = await page(width);
  await p.goto(URLB + file, { waitUntil: 'domcontentloaded' });
  if (ready) await p.waitForSelector(ready, { timeout: 20000 });
  return p;
}
const dates = (p, box) => p.$$eval((box ? box + ' ' : '') + '[data-date]', els => els.map(e => e.getAttribute('data-date')));
const setPast = (p, on) => p.evaluate((on) => { try { on ? localStorage.setItem('egbc-rota-show-past', '1') : localStorage.removeItem('egbc-rota-show-past'); } catch (e) {} }, on);
/* The first row dated today or later is in view, and (with past dates on)
   the row before it is above the top: the page opened AT it. */
const openedAtNext = (p, box) => p.evaluate((t, box) => {
  const rows = Array.from(document.querySelectorAll((box ? box + ' ' : '') + '[data-date]'));
  const i = rows.findIndex(r => r.getAttribute('data-date') >= t);
  if (i < 0) return 'no upcoming row';
  /* Measured from the top of whatever the list scrolls in: the page, or
     a scrolling box below a toolbar. */
  let s = rows[i].parentElement;
  while (s && !(/(auto|scroll)/.test(getComputedStyle(s).overflowY) && s.scrollHeight > s.clientHeight)) s = s.parentElement;
  const page = !s; s = s || document.scrollingElement;
  const edge = page ? 0 : s.getBoundingClientRect().top, height = page ? innerHeight : s.clientHeight;
  const top = rows[i].getBoundingClientRect().top - edge;
  if (top < -2 || top > height * 0.5) return 'next row at ' + Math.round(top) + ' of ' + height;
  /* The row before still showing is fine only if the list cannot scroll any further. */
  if (i > 0 && rows[i - 1].getBoundingClientRect().top - edge >= 0 && s.scrollTop + s.clientHeight < s.scrollHeight - 2)
    return 'the row before it is still showing, and the list could scroll on';
  return 'yes';
}, T, box || '');

async function rota(name, file, box, prep) {
  console.log('\nB. ' + name);
  let p = await open(file, 1280, prep ? null : '[data-date]');
  if (prep) { await prep(p); await p.waitForSelector(box + ' [data-date]', { timeout: 20000 }); }
  await setPast(p, false);
  await p.reload({ waitUntil: 'domcontentloaded' });
  if (prep) await prep(p);
  await until(() => dates(p, box).then(d => d.length >= SOON.length));
  let d = await dates(p, box);
  ok('   past dates are hidden; today and every coming date shown', d.every(x => x >= T) && SOON.every(k => d.includes(EV[k].date)), J(d));
  const btn = box + ' [data-past-toggle], [data-past-toggle]';
  ok('   the toggle says "Show past dates"', (await p.$eval(btn, e => e.textContent.trim() + '|' + e.getAttribute('aria-pressed'))) === 'Show past dates|false');
  await p.$eval(btn, e => e.click());
  await until(() => dates(p, box).then(x => x.some(y => y < T)));
  d = await dates(p, box);
  ok('   "Show past dates" brings them all back', PAST.every(k => d.includes(EV[k].date)), J(d));
  ok('   and now says "Hide past dates"', (await p.$eval(btn, e => e.textContent.trim() + '|' + e.getAttribute('aria-pressed'))) === 'Hide past dates|true');
  /* Remembered, and opens at the next date. */
  const q = await open(file, 1280, prep ? null : '[data-date]');
  if (prep) { await prep(q); await q.waitForSelector(box + ' [data-date]', { timeout: 20000 }); }
  await until(() => dates(q, box).then(x => x.some(y => y < T)));
  ok('   REMEMBERED: opened again, past dates are still shown', (await dates(q, box)).some(y => y < T) && (await q.$eval(btn, e => e.textContent.trim())) === 'Hide past dates');
  await sleep(600);
  const at = await until(() => openedAtNext(q, box).then(r => r === 'yes' ? r : null), 6000) || await openedAtNext(q, box);
  ok('   IT OPENS AT THE NEXT DATE, not the top of the list', at === 'yes', at);
  await q.$eval(btn, e => e.click());
  await until(() => dates(q, box).then(x => x.length && x.every(y => y >= T)));
  ok('   hiding them again: gone, and forgotten on this device', (await dates(q, box)).every(y => y >= T) && (await q.evaluate(() => localStorage.getItem('egbc-rota-show-past'))) === null);
  ok('   the term with only past dates is not drawn', !(await q.$eval(box, (e, t) => e.innerText.includes(t), termOf(EV.ev_old.date))) || termOf(EV.ev_old.date) === termOf(T));
  /* Martin, 14 Oct: "On the rota planner it says 10/18/2026". */
  const ukRows = await q.evaluate(() => Array.from(document.querySelectorAll('[data-date] input[type="date"]')).map(i => ({ v: i.value, op: getComputedStyle(i).opacity,
    shown: i.parentNode.getAttribute('data-uk-date') !== null ? (i.parentNode.querySelector('[data-uk-shown]') || {}).textContent : '(no UK words)' })));
  ok('   EVERY ROW\'S DATE IS IN UK WORDS ("' + ((ukRows[0] || {}).shown || '-') + '"), never the browser\'s 10/18/2026 (' + ukRows.length + ' date boxes)',
    ukRows.every(r => r.op === '0' && r.shown === U.short(r.v)), J(ukRows.slice(0, 3)));
  await p.close();
  return q;
}

try {
  /* ---------- B. the rotas ---------- */
  const PL = await rota('the Rota Planner (Planner.html)', 'Planner.html', '#eventList');
  if (EV.ev_month) {
    const tot = await PL.evaluate((name) => { const m = document.body.innerText.match(new RegExp(name.replace(/[()]/g, '\\$&') + '\\s*(\\d+)')); return m ? +m[1] : 0; }, GUS.name);
    ok('   this month\'s "Sundays served" still counts the past Sunday it hides (Gus: 2)', tot === 2, 'Gus: ' + tot);
  } else ok('   (today is the 1st: no past Sunday this month to count)', true);
  /* Changing a row's date still saves it (the practice: no planner lists it). */
  const MOVED = add(T, 6);
  await PL.evaluate((from, to) => { const i = document.querySelector('[data-date="' + from + '"] input[type="date"]'); i.value = to; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, EV.ev_prac.date, MOVED);
  const movedDoc = await until(async () => { let d; await env.withSecurityRulesDisabled(async (c) => { d = (await getDoc(doc(c.firestore(), 'events', 'ev_prac'))).data(); }); return d && d.date === MOVED ? d : null; });
  ok('   changing a row\'s date still saves it, and the row says so in UK words', !!movedDoc && (await until(() => PL.evaluate((d) => Array.from(document.querySelectorAll('[data-uk-shown]')).some(s => s.textContent === d) ? 'y' : '', U.short(MOVED)), 8000)) === 'y');
  EV.ev_prac.date = MOVED;   /* where it is now, for the pages below */
  ok('   the toolbar\'s other buttons are all still there', (await PL.$$eval('header button', bs => bs.map(b => b.textContent.trim()))).filter(t => /^(Populate|Auto-Populate|Add Practices|\+ Service|Gather Avail|Hide Assigned)$/.test(t)).length === 6);
  await PL.close();
  const VO = await rota('the view-only rota (view-only-rota.html)', 'view-only-rota.html', '#rotaContent');
  await VO.close();
  const CT = await rota('Core Team ▸ Rota (egbc-core-rota.js, in CoreTeamApp.html)', 'CoreTeamApp.html', '#screen-rota', async (p) => {
    await p.waitForFunction(() => typeof showScreen === 'function', { timeout: 20000 });
    await p.evaluate(() => showScreen('rota'));
  });
  await CT.evaluate(() => (window.openNewEventModal || EGBCCoreRota.newEvent)());
  const newBox = await until(() => CT.evaluate(() => { const i = document.getElementById('new-event-date'); return i && i.parentNode.getAttribute('data-uk-date') !== null ? (i.parentNode.querySelector('[data-uk-shown]') || {}).textContent : ''; }));
  ok('   the new event form\'s date box is in UK words too ("' + newBox + '")', newBox === 'Pick a date' || /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(newBox), newBox);
  await CT.close();

  /* ---------- C. the planners ---------- */
  console.log('\nC. the Sunday planner (SundayServicePlanner.html)');
  const LABEL = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} · .+$/;
  const SP = await open('SundayServicePlanner.html', 1280, '.uk-pick select option[value*="|"]');
  const opts = await SP.$$eval('.uk-pick select option', os => os.map(o => ({ v: o.value, t: o.text })));
  const services = SOON.filter(k => !/Practice/.test(EV[k].type));
  ok('   "Service date" lists the coming services in UK words: "' + (opts[0] || {}).t + '"', opts.length === services.length && opts.every(o => LABEL.test(o.t)) && opts[0].t === U.short(EV.ev_today.date) + ' · Sunday Morning Worship', J(opts.map(o => o.t)));
  ok('   no past date, and no practice', !opts.some(o => o.v.slice(0, 10) < T || /Practice/.test(o.t)));
  const v0 = await until(() => SP.$eval('#serviceDate', e => e.value));
  ok('   it opens on the next one; the date underneath is ' + v0 + ' (yyyy-mm-dd, as before)', v0 === EV.ev_today.date && /^\d{4}-\d{2}-\d{2}$/.test(v0), v0);
  const pickedType = await until(() => SP.$eval('#eventSelect', s => s.value !== '' ? s.options[s.selectedIndex].text : ''));
  ok('   and that service is chosen in "Select Service"', pickedType === 'Sunday Morning Worship', pickedType);
  ok('   the date box is out of the way until asked for', await SP.$eval('#serviceDate', e => { const b = e.parentNode.getAttribute('data-uk-date') !== null ? e.parentNode : e; return getComputedStyle(b).display === 'none'; }));
  await SP.$eval('[data-uk="next"]', b => b.click());
  const v1 = await until(() => SP.$eval('#serviceDate', (e, t) => e.value !== t ? e.value : '', EV.ev_today.date));
  ok('   ▶ goes to the next service: ' + v1, v1 === EV.ev_next.date, J(await SP.evaluate(() => ({ box: document.getElementById('serviceDate').value, sel: document.querySelector('.uk-pick select').value,
    opts: Array.from(document.querySelectorAll('.uk-pick select option')).map(o => o.value), next: document.querySelectorAll('[data-uk="next"]').length }))));
  ok('   the page read the rota for it (its own "Select Service" list)', !!(await until(() => SP.$$eval('#eventSelect option', os => os.some(o => o.text === 'Sunday Morning Worship') ? 'y' : ''))));
  await SP.$eval('[data-uk="prev"]', b => b.click());
  ok('   ◀ goes back', (await until(() => SP.$eval('#serviceDate', (e, t) => e.value === t ? 'y' : '', EV.ev_today.date))) === 'y');
  await SP.$eval('[data-uk="other"]', b => b.click());
  const otherBox = await SP.$eval('#serviceDate', e => { const b = e.parentNode; return b.getAttribute('data-uk-date') !== null && getComputedStyle(b).display !== 'none' && getComputedStyle(e).opacity === '0' ? b.querySelector('[data-uk-shown]').textContent : ''; });
  ok('   "Pick another date" shows the date box, in UK words ("' + otherBox + '"), not the browser\'s', otherBox === U.short(EV.ev_today.date), otherBox);
  /* The old way, as the main window's own checks do it. */
  const OTHER = add(T, 40);
  await SP.evaluate((d) => { const b = document.getElementById('serviceDate'); b.value = d; b.dispatchEvent(new Event('change', { bubbles: true })); }, OTHER);
  const shown = await until(() => SP.$eval('.uk-pick select', s => s.options[s.selectedIndex] && /another date/.test(s.options[s.selectedIndex].text) ? s.options[s.selectedIndex].text : ''));
  ok('   SET THE OLD WAY, the date still works, and the list shows it: "' + shown + '"', shown === U.short(OTHER) + ' (another date)', shown);
  /* The emailed plan. */
  await SP.evaluate((d) => { const b = document.getElementById('serviceDate'); b.value = d; b.dispatchEvent(new Event('change', { bubbles: true })); }, EV.ev_next.date);
  await sleep(1200);
  await SP.evaluate(() => { window.__egbcOutbox = window.__egbcOutbox || []; window.__egbcOutbox.length = 0; });
  await SP.evaluate(() => window.emailSchedule());
  await SP.waitForSelector('#modalTeamBtn', { visible: true, timeout: 15000 });
  await SP.$eval('#modalTeamBtn', b => b.click());
  const mail = await until(() => SP.evaluate(() => (window.__egbcOutbox || []).map(m => m.payload || m).find(m => m && m.subject)));
  const LONG = U.long(EV.ev_next.date);
  ok('   THE EMAILED PLAN says "' + LONG + '", subject and heading', mail && mail.subject === 'Sunday Worship Plan: ' + LONG && mail.html.includes(LONG) && !mail.html.includes('>' + EV.ev_next.date), mail && mail.subject);
  await SP.setViewport({ width: 375, height: 800 });
  await sleep(400);
  ok('D. at 375px the planner does not scroll sideways', (await SP.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await SP.screenshot({ path: path.join(HERE, 'rota-dates-planner-375.png') });
  await SP.close();

  console.log('\nC. the youth planner (youthserviceplanner.html)');
  const YP = await open('youthserviceplanner.html', 1280, '.uk-pick select option[value*="|"]');
  const y0 = await until(() => YP.$eval('#serviceDate', e => e.value));
  ok('   it opens on the next YOUTH service: ' + y0, y0 === EV.ev_youth.date, y0);
  ok('   in UK words', LABEL.test(await YP.$eval('.uk-pick select', s => s.options[s.selectedIndex].text)));
  await YP.close();

  console.log('\nC. Core Team ▸ Plan (egbc-core-planner.js, in CoreTeamApp.html)');
  const CP = await open('CoreTeamApp.html', 1280, null);
  await CP.waitForFunction(() => typeof showScreen === 'function', { timeout: 20000 });
  await CP.evaluate(() => showScreen('service'));
  await CP.waitForSelector('#screen-service .uk-pick select option[value*="|"]', { timeout: 20000 });
  const COMING = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
  ok('   it still opens on the coming Sunday, ' + COMING + ' (the main window\'s check expects it)', (await CP.$eval('#spDate', e => e.value)) === COMING);
  const cpShown = await CP.$eval('#screen-service .uk-pick select', s => s.options[s.selectedIndex].text);
  ok('   and the list shows it in UK words: "' + cpShown + '"', cpShown.indexOf(U.short(COMING)) === 0, cpShown);
  const cpN = await CP.$$eval('#screen-service .uk-pick select option[value*="|"]:not([data-other])', os => os.length);
  ok('   the coming services are listed', cpN === services.length, cpN + ' of ' + services.length);
  await CP.close();

  console.log('\nC. the song summary (song-summary.html)');
  const SS = await open('song-summary.html?date=' + EV.ev_later.date, 1280, null);
  const sub = await until(() => SS.$eval('#subline', e => /Worship Leader/.test(e.textContent) ? e.textContent : ''));
  ok('   it says "' + U.long(EV.ev_later.date) + ' · Worship Leader: …"', sub === U.long(EV.ev_later.date) + ' · Worship Leader: ' + ME.name, sub);
  ok('   and so does the tab', (await SS.title()) === 'Song Summary – ' + U.long(EV.ev_later.date));
  await SS.close();

  ok('no page threw an error', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.log('  FAIL  the run stopped: ' + (e && e.stack || e));
  results.push(false);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close();
  await env.cleanup().catch(() => {});
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
