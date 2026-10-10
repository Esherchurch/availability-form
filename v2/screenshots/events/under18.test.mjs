/* "Works with under-18s" on events and clubs (NEXT-BRIEF §24; F-142).
   Events window. Invented people and events only, events emulators only,
   network guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/under18.test.mjs"

   What it proves:
     1. the tick on the event form (events-admin) marks Kids Film Club
     2. a leader whose checks are in date is added
     3. A KIDS FILM CLUB HELPER WITH EXPIRED TRAINING CANNOT BE ADDED: the
        page says so, and the rules refuse it whatever the page does
     4. the F-109 exception route: a master admin records a reason, and then
        the helper is added, marked "exception recorded"
     5. ticking an event that already names FIVE people is accepted (F-146):
        they are cleared in turn, the one who cannot be is named with the way
        forward, and the way forward (an exception) works - no dead end
     6. reminders: "running out" for admins, and "your checks" for the person */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-u18-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const iso = (d) => ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
const ago = (years, days) => { const d = new Date(); d.setFullYear(d.getFullYear() - years); d.setDate(d.getDate() + (days || 0)); return ymd(d); };

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
  ada:  { email: 'ada.admin@example.invalid', name: 'Ada Admin', mid: 'm_ada', teams: ['Core Team'], adminFor: ['Kids Church'] },
  max:  { email: 'max.master@example.invalid', name: 'Max Master', mid: 'm_max', teams: ['Core Team'], master: true },
  lena: { email: 'lena.leader@example.invalid', name: 'Lena Leader', mid: 'm_lena', teams: ['Kids Church'] },
  tia:  { email: 'tia.helper@example.invalid', name: 'Tia Helper', mid: 'm_tia', teams: ['Kids Church'] },
  ned:  { email: 'ned.new@example.invalid', name: 'Ned New', mid: 'm_ned', teams: ['Kids Church'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const T = new Date(); T.setDate(T.getDate() + 9); T.setHours(18, 0, 0, 0);
const EV = (title) => ({ title, description: 'Invented.', category: 'kids', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [], featured: false,
  startLocal: iso(T), startUtc: T.getTime(), endLocal: iso(new Date(T.getTime() + 2 * 3600e3)), endUtc: T.getTime() + 2 * 3600e3, allDay: false,
  location: { kind: 'room', siteId: 'site_k', roomIds: [] }, organiserName: 'Ada', overseers: [], overseerUids: [], signupOn: false, image: '', createdBy: 'x', updatedAt: 'x' });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_k'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'bookingSettings', 'site_k'), { bookingsAdmins: [], safeguardingLead: '', safeguardingDeputy: '' });
  await setDoc(doc(db, 'calEvents', 'ev_film'), EV('Kids Film Club (invented)'));
  await setDoc(doc(db, 'calEvents', 'ev_puppet'), EV('Puppet practice (invented)'));
  /* Puppet practice already names FIVE: four whose checks are in date, and Ned, who has none (F-146). */
  const FIVE = [['m_c1', 'Cara One'], ['m_c2', 'Cal Two'], ['m_ned', 'Ned New'], ['m_c3', 'Cy Three'], ['m_c4', 'Col Four']];
  await setDoc(doc(db, 'eventLeaders', 'ev_puppet'), { leaders: FIVE.map(([m, n]) => ({ uid: '', memberId: m, name: n, role: 'helper' })), leaderUids: [],
    leaderIds: FIVE.map(x => x[0]), siteId: 'site_k' });
  for (const [m, n] of FIVE.filter(x => x[0] !== 'm_ned')) await setDoc(doc(db, 'leaderChecks', m), { name: n, dbsStatus: 'current', dbsSeen: ago(1), trainingDate: ago(1), siteId: 'site_k' });
  /* Lena: in date. Tia: DBS in date, training four years ago (out). Ned: nothing. Lena's training runs out in three weeks. */
  await setDoc(doc(db, 'leaderChecks', 'm_lena'), { name: 'Lena Leader', dbsStatus: 'current', dbsSeen: ago(1), trainingDate: ago(3, 21), siteId: 'site_k' });
  await setDoc(doc(db, 'leaderChecks', 'm_tia'), { name: 'Tia Helper', dbsStatus: 'current', dbsSeen: ago(1), trainingDate: ago(4), siteId: 'site_k' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (col, id) => readDb(async (db) => { const s = await getDoc(doc(db, col, id)); return s.exists() ? s.data() : null; });

const errors = [], browsers = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 1100, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const toastSays = (p, re) => until(async () => re.test(await p.$eval('#toast', e => e.textContent).catch(() => '')));
async function pick(p, name, role) {
  await tap(p, '#addLeader');
  await p.waitForSelector('#lq');
  await val(p, '#lq', name);
  await until(() => p.$('.pick[data-role="' + role + '"]'));
  await tap(p, '.pick[data-role="' + role + '"]');
}

try {
  /* 1. the tick on the event form (a master admin edits events here, as in the other event tests) */
  const M = await as('max');
  await go(M, 'events-admin.html', '.open[data-id="ev_film"]');
  await tap(M, '.open[data-id="ev_film"]');
  await M.waitForSelector('#f_u18');
  ok('1. the event form has a "Works with under-18s" tick', /Works with under-18s/.test(await text(M, '#tabBody')) && !(await M.$eval('#f_u18', e => e.checked)));
  await M.$eval('#f_u18', e => { e.checked = true; });
  await tap(M, '#save');
  const A = await as('ada');
  const t1 = await until(async () => { const d = await get('eventLeaders', 'ev_film'); return d && d.under18 ? d : null; });
  ok('   ticked and saved: Kids Film Club now works with under-18s', t1 && t1.under18 === true && J(t1.leaderIds) === '[]', J(t1));

  /* 2 and 3. adding people on the safeguarding page */
  await go(A, 'safeguarding.html?event=ev_film', '#addLeader');
  ok('   the safeguarding page says what the tick means', /Works with under-18s: every leader and helper must have an in-date DBS check and training/.test(await text(A, '#u18Msg')));
  await pick(A, 'Lena', 'leader');
  const t2 = await until(async () => { const d = await get('eventLeaders', 'ev_film'); return d && d.leaders.length === 1 ? d : null; });
  ok('2. Lena, whose checks are in date, is added as a leader', t2 && t2.leaders[0].memberId === 'm_lena' && t2.leaders[0].role === 'leader' && J(t2.leaderIds) === J(['m_lena']), J(t2));
  await pick(A, 'Tia', 'helper');
  await until(() => A.$('#u18Refused'));
  const refused = await text(A, '#u18Refused');
  ok('3. A KIDS FILM CLUB HELPER WITH EXPIRED TRAINING CANNOT BE ADDED: the page says so', /Tia Helper was not added\. This event works with under-18s/.test(refused), refused);
  ok('   and she is not on it', (await get('eventLeaders', 'ev_film')).leaders.length === 1);
  ok('   an admin who is not the safeguarding lead is not offered an exception', !(await A.$('#exSave')) && /safeguarding lead can record/.test(await text(A, '.modal, #modal')));
  const sneak = await A.evaluate(() => EGBCAuth.db.collection('eventLeaders').doc('ev_film').get().then((s) => {
    const d = s.data(); d.leaders = d.leaders.concat([{ uid: '', memberId: 'm_tia', name: 'Tia Helper', role: 'helper' }]); d.leaderIds = d.leaders.map(l => l.memberId); d.clearedIds = (d.clearedIds || []).concat(['m_tia']); d.lastCleared = ['m_tia'];
    return EGBCAuth.db.collection('eventLeaders').doc('ev_film').set(d).then(() => 'written', e => e.code);
  }));
  ok('   AND THE RULES REFUSE IT, whatever the page does', sneak === 'permission-denied', sneak);
  await A.screenshot({ path: path.join(HERE, 'under18-refused.png'), fullPage: true });

  /* 4. the exception route */
  await go(M, 'safeguarding.html?event=ev_film', '#addLeader');
  await pick(M, 'Tia', 'helper');
  await until(() => M.$('#exSave'));
  await val(M, '#exWhy', 'Training booked for next week; always alongside Lena (invented)');
  await tap(M, '#exSave');
  const t4 = await until(async () => { const d = await get('eventLeaders', 'ev_film'); return d && d.leaders.length === 2 ? d : null; });
  const ex = await get('eventExceptions', 'ev_film__m_tia');
  ok('4. A MASTER ADMIN RECORDS AN EXCEPTION WITH A REASON, and Tia is added as a helper', t4 && t4.leaders[1].memberId === 'm_tia' && t4.leaders[1].role === 'helper'
    && ex && ex.by === P.max.uid && /Training booked/.test(ex.reason), J([t4 && t4.leaderIds, ex && ex.reason]));
  await until(async () => /exception recorded/.test(await text(M, '#wrap')));
  ok('   she is shown as a helper, with the exception recorded', /Tia Helper · helper exception recorded/.test(await text(M, '#wrap')), await text(M, '#wrap'));
  await M.screenshot({ path: path.join(HERE, 'under18-exception.png'), fullPage: true });

  /* 5. ticking an event that already names FIVE people, one not cleared (F-146): no dead end */
  await go(M, 'events-admin.html', '.open[data-id="ev_puppet"]');
  await tap(M, '.open[data-id="ev_puppet"]');
  await M.waitForSelector('#f_u18');
  await M.$eval('#f_u18', e => { e.checked = true; });
  await tap(M, '#save');
  ok('5. FIVE NAMED: TICKING IS ACCEPTED, and the page says who is cleared and who is not, and what to do',
    !!(await toastSays(M, /Marked as working with under-18s\. 4 of 5 are cleared\. Not yet: Ned New \(no in-date DBS check or training\)\. The safeguarding lead can record an exception/)),
    await M.$eval('#toast', e => e.textContent).catch(() => '?'));
  const p5 = await get('eventLeaders', 'ev_puppet');
  ok('   ticked, the four cleared in turn (two at a time), nobody removed', p5.under18 === true && J([...p5.clearedIds].sort()) === J(['m_c1', 'm_c2', 'm_c3', 'm_c4']) && p5.leaders.length === 5, J(p5.clearedIds));
  await go(M, 'safeguarding.html?event=ev_puppet', '#u18Pending');
  ok('   the safeguarding page names Ned as not cleared yet, with the way forward', /Not cleared yet: Ned New\. Bring their checks up to date, record an exception .* or take them off this event/.test(await text(M, '#u18Pending'))
    && (await M.$$('.notCleared')).length === 1);
  await M.$eval('.exFor', e => e.click());
  await until(() => M.$('#exSave'));
  await val(M, '#exWhy', 'Puppet practice only; always alongside Cara (invented)');
  await tap(M, '#exSave');
  const p5b = await until(async () => { const d = await get('eventLeaders', 'ev_puppet'); return d && d.clearedIds.includes('m_ned') ? d : null; });
  ok('   THE WAY FORWARD WORKS: an exception for Ned, and now all five are cleared', p5b && p5b.clearedIds.length === 5 && !!(await get('eventExceptions', 'ev_puppet__m_ned')), J(p5b && p5b.clearedIds));
  await until(async () => !(await M.$('#u18Pending')));
  ok('   and the warning goes', !(await M.$('#u18Pending')) && !(await M.$('.notCleared')));

  /* 6. reminders */
  await go(A, 'safeguarding.html', '#due');
  const due = await text(A, '#due');
  ok('6. REMINDERS: the admin sees Tia\'s training run out, and Lena\'s running out in three weeks', /Tia Helper: safeguarding training Ran out on .* Run out/.test(due)
    && /Lena Leader: safeguarding training Runs out on .*\(21 days\) Soon/.test(due), due);
  const L = await as('lena');
  await go(L, 'safeguarding.html', '#myDue');
  ok('   and Lena sees her own', /Your safeguarding training Runs out on .*\(21 days\)/.test(await text(L, '#myDue')));
  ok('   but not anyone else\'s', !(await L.$('#due')));

  ok('errors on the pages', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  await env.cleanup(); server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
