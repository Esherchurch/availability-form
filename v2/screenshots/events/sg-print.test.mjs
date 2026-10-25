/* SAFEGUARDING, PRINTED (F-277; Martin, 23 Oct): an event's assessment, a
   site's standing risks and a trustees' snapshot, laid out for A4, checked
   as printed and saved as a real PDF. Events window. Invented people and
   events only, events emulators only, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/sg-print.test.mjs"

   It writes screenshots/events/sg-print-practice-trip.pdf: an invented copy
   of the reviewing window's practice trip, as the lead would print it.

   What it proves, with print styles on:
     1. no buttons, menu or view-as bar; the church's name and logo at the top
     2. not signed: "DRAFT: NOT SIGNED OFF" in large words, and a watermark
     3. "must not go ahead": a red box, its count and its list the same items
     4. the event: when, where, kind, organiser, leaders (names of leaders
        only), children booked and under 8 (counts), the ratio and whether met
     5. the checklist: every question; its answer, "Not applicable: <why>",
        or "Not answered"; the paediatric first aider flagged
     6. "First draft by AI: checked by <name> on <date>"
     7. the risk table: High/Medium/Low in words in every rating; controls a
        list; owner and review; no row split across pages
     8. the host's requirements as an appendix; wet-signature boxes
     9. NO CHILD'S NAME, contact or medical detail; never a concern
    10. signed: "Signed off by <name>, <role>, on <date>", and the reason for a
        high risk left; no watermark. "Not needed": that record instead
    11. a real A4 PDF: portrait pages, the risk table on landscape pages
    12. the standing risks and a snapshot print too; a volunteer can't */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-sgp-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore, Timestamp } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const CK = fnRequire('./sg-checklist.cjs');

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);

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
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const DAY = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10), DAY2 = new Date(Date.now() + 69 * 864e5).toISOString().slice(0, 10);
const P = {
  lena: { email: 'lena.lead@example.invalid', name: 'Lena Lead (invented)', mid: 'm_lena', teams: ['Kids Church'] },
  tom:  { email: 'tom.trustee@example.invalid', name: 'Tom Trustee (invented)', mid: 'm_tom', teams: ['Elders'] },
  vic:  { email: 'vic.leader@example.invalid', name: 'Vic Leader (invented)', mid: 'm_vic', teams: ['Kids Church'] },
  sam:  { email: 'sam.volunteer@example.invalid', name: 'Sam Volunteer (invented)', mid: 'm_sam', teams: ['Kids Church'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const LOGO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="#3d6263"/></svg>');
/* what must never be printed */
const PRIVATE = /Charlie|Casey|Pat Jones|pat\.jones@|07700|epilep|Worried about/i;
const EID = 'cev_practice_invented';
const NOW = Timestamp.fromDate(new Date());
const qs = CK.checklistFor('trip', { abroad: true, under8: true }, [{ id: 'c_ins', q: 'Has our insurer’s activity form been sent? (invented)' }]);
const answers = Object.fromEntries(qs.filter((q) => !['money', 'c_ins', 'weather'].includes(q.id)).map((q) => [q.id, 'Answered in general words for ' + q.id + ' (invented)']));
answers.paedFirstAid = 'No: none of the leaders is trained yet (invented)';
answers.mixedLeaders = 'No: we are still looking (invented)';
answers.insurance = '£500,000: the church’s policy, checked by the office (invented)';
answers.transport = 'N/A: the host’s own coach collects us at the airport (invented)';
const RISKS = [
  { risk: 'Not enough leaders: 3 needed for 12 children (2 under 8); 2 named', who: 'Children', l: 5, i: 5, rl: 5, ri: 5, owner: 'The event’s organiser', review: 'Before bookings open', controls: [{ kind: 'ratio', text: '' }, { kind: 'twoAdults', text: '' }, { kind: 'text', text: 'Name 1 more checked leader before it goes ahead' }], mustNot: true, from: 'hub' },
  { risk: 'Children left alone with prisoners during the visit', who: 'Children', l: 3, i: 5, rl: 3, ri: 5, owner: 'The trip leader', review: 'The day before', controls: [{ kind: 'text', text: 'Leaders with the group at all times' }, { kind: 'text', text: 'Prison staff brief the leaders first' }], mustNot: true, from: 'ai' },
  { risk: 'Sunburn and heat', who: 'Everyone', l: 3, i: 2, rl: 2, ri: 2, owner: 'The trip leader', review: 'Each morning', controls: [{ kind: 'text', text: 'Sun cream and water breaks' }], from: 'ai' }
].concat(Array.from({ length: 14 }, (_, i) => ({ risk: 'A further invented hazard number ' + (i + 4) + ' with words long enough to wrap across a line or two in the printed table', who: 'Young people', l: 2 + (i % 3), i: 3 + (i % 2), rl: 1 + (i % 2), ri: 3, owner: 'A named role', review: 'Weekly', controls: [{ kind: 'text', text: 'A first control for this hazard' }, { kind: 'text', text: 'A second control, written out in full' }, { kind: 'text', text: 'A third' }], from: 'ai' })));
const ASSESS = { siteId: 'site_t', calEventId: EID, title: 'Example: Brazil trip (test, not real)', templateId: 'trip', answers, flags: { abroad: true, under8: true }, risks: RISKS, status: 'waiting', version: 1,
  source: { kind: 'ai', model: 'claude-sonnet-5-5', at: '2026-10-23T10:00:00.000Z', by: P.vic.uid, overall: 'red', mustNot: ['Children must not be left alone in a prison at any time.'], questions: ['What is the plan if a passport is lost?'], summary: 'x', suggest: {},
    checkedBy: P.vic.uid, checkedByName: 'Vic Leader (invented)', checkedAt: '2026-10-23T11:00:00.000Z' },
  host: { name: 'Hilltop Christian Camp (invented)', file: { path: 'sgRequirements/' + EID + '/1-camp list.pdf', name: 'camp list.pdf', type: 'application/pdf', size: 48000 }, items: [{ id: 'h_1', q: 'Has every leader signed the camp’s code of conduct?', line: 'Groups must bring a signed code of conduct.' }],
    confirmed: true, checkedBy: P.vic.uid, checkedByName: 'Vic Leader (invented)', checkedAt: '2026-10-23T11:30:00.000Z' }, hostIds: ['h_1'], updatedAt: 'x', updatedBy: 'x' };
{
  const b = db.batch(), S = (c, id, d) => b.set(db.collection(c).doc(id), d);
  for (const k of Object.keys(P)) {
    const x = P[k];
    S('addressBook', x.mid, { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
    S('users', x.uid, { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
  }
  for (const name of ['Kids Church', 'Elders']) S('teams', name, { name, label: name, rota: true, order: 1 });
  S('churchSettings', 'details', { name: 'Test Green Church', logoUrl: LOGO });
  S('sites', 'site_t', { name: 'Test Green', active: true, order: 1 });
  S('bookingSettings', 'site_t', { bookingsAdmins: [], safeguardingLead: 'm_lena', safeguardingDeputy: '' });
  S('safeguardingSettings', 'defaults', { templates: {}, ratioAll: 5, ratioUnder8: 4, dbsYears: 3, trainingYears: 3, requireChecks: false, leadSiteId: 'site_t', leadName: 'Lena Lead (invented)', leadPhone: '', updatedAt: 'x', updatedBy: 'x',
    register: { checklist: [{ id: 'c_ins', q: 'Has our insurer’s activity form been sent? (invented)' }], checklistIds: ['c_ins'], guidance: { name: 'The Diocese of Testbury’s safeguarding guidance (invented)', url: 'https://example.invalid/safeguarding' } } });
  S('calEvents', EID, { title: 'Example: Brazil trip (test, not real)', status: 'confirmed', visibility: 'unlisted', audience: ['public'], signupOn: true, capacity: 30, sgKind: 'trip', organiserName: 'Olly Organiser (invented)', teamUids: [], teamMemberIds: [],
    startLocal: DAY + 'T07:00', startUtc: Date.parse(DAY + 'T07:00:00Z'), endLocal: DAY2 + 'T18:00', endUtc: Date.parse(DAY2 + 'T18:00:00Z'), location: { kind: 'other', siteId: 'site_t', name: 'São Paulo, Brazil (invented)' } });
  S('eventLeaders', EID, { under18: true, leaders: [{ memberId: 'm_vic', name: 'Vic Leader (invented)', uid: P.vic.uid, role: 'trip leader' }, { memberId: 'm_lena', name: 'Lena Lead (invented)', role: 'deputy' }], leaderIds: ['m_vic', 'm_lena'], leaderUids: [P.vic.uid], siteId: 'site_t', clearedIds: [], lastCleared: [], updatedAt: 'x', updatedBy: 'x' });
  S('signups', 'su_1', { calEventId: EID, personKind: 'contacts', personId: 'c_pat', name: 'Pat Jones (invented)', email: 'pat.jones@example.invalid', phone: '07700 900123', places: 12, status: 'confirmed', attendees: [{ name: 'Charlie Jones (invented)' }, { name: 'Casey Jones (invented)' }].concat(Array.from({ length: 10 }, (_, i) => ({ name: 'Child ' + (i + 3) + ' (invented)' }))), answers: { medical: 'epilepsy (invented)' } });
  S('concerns', 'cn_1', { siteId: 'site_t', calEventId: EID, about: 'Charlie Jones (invented)', concern: 'Worried about Charlie (invented)', reportedBy: 'x', reportedByName: 'x', createdAt: 'x', status: 'new' });
  S('sgAssessments', EID, ASSESS);
  S('sgActivities', 'act_jun', { siteId: 'site_t', kind: 'sunday', name: 'Juniors (invented)', link: {}, active: true, updatedAt: 'x', updatedBy: 'x' });
  S('sgRisks', 'r_1', { siteId: 'site_t', activityId: 'act_jun', risk: 'Fewer than two adults with the group', who: 'Children', l: 3, i: 5, controls: [{ kind: 'twoAdults', text: '' }, { kind: 'text', text: 'Do not start until two are in' }], ownerName: 'The Juniors leader', reviewDue: '2027-01-31', rl: 1, ri: 5, status: 'open', source: 'added', starterId: '', createdAt: 'x', updatedAt: 'x', updatedBy: 'x' });
  S('sgSnapshots', 'sn_1', { siteId: 'site_t', banner: 'Safeguarding risk register: Test Green, 23 October 2026', by: P.tom.uid, byName: 'Tom Trustee (invented)', at: NOW, note: 'For the trustees (invented)',
    risks: [{ activity: 'Juniors (invented)', risk: 'Fewer than two adults with the group', who: 'Children', before: 'red', beforeScore: 15, after: 'amber', afterScore: 5, controls: ['Two adults at all times'], owner: 'The Juniors leader', reviewDue: '2027-01-31', status: 'open' }],
    warnings: { red: 1, amber: 2 }, dials: { checks: { value: 9, of: 10, pct: 90, rag: 'amber' } }, review: { done: 3, of: 8, status: 'underway' } });
  await b.commit();
}

const errors = [], browsers = [];
async function as(who, w = 1280, h = 900) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: w, height: h });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => { errors.push(who + ' was shown: ' + d.message()); d.accept(); });
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(400);
  return p;
}
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const shown = (p, sel) => p.$eval(sel, (e) => getComputedStyle(e).display !== 'none' && e.offsetParent !== null).catch(() => false);
/* a PDF's pages and their sizes, from its own words (Chrome writes /MediaBox [0 0 w h] per page) */
function pdfPages(buf) {
  buf = Buffer.from(buf);
  /* Chrome packs its page objects into compressed streams: unpack each, then read every page's size */
  const s = buf.toString('latin1');
  let out = s;
  for (const m of s.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length, end = s.indexOf('endstream', start);
    if (end < 0) continue;
    try { out += '\n' + zlib.inflateSync(buf.subarray(start, end)).toString('latin1'); } catch (e) { /* not compressed, or not text */ }
  }
  return [...out.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Math.round(+m[1]), Math.round(+m[2])]);
}

try {
  const L = await as('lena');
  await go(L, 'sg-print.html?event=' + EID, '#sheet[data-ready]');
  await L.emulateMediaType('print');
  /* 1 */
  ok('   the footer: "Printed on <date>" and page numbers', await L.evaluate(() => [...document.querySelectorAll('style')].some((s) => /@bottom-left\{content:"Printed on \d{1,2} \w+ \d{4}"/.test(s.textContent)) && [...document.querySelectorAll('style')].some((s) => /counter\(page\) " of " counter\(pages\)/.test(s.textContent))));
  ok('1. PRINTED: no buttons, no menu, no view-as bar', !(await shown(L, '#printIt')) && !(await shown(L, '#egbc-bar')) && !(await L.$$eval('button', (a) => a.filter((b) => b.offsetParent !== null).length)));
  ok('   the church\u2019s name and ITS OWN LOGO from Church details at the top', (await text(L, '#pChurch')) === 'Test Green Church' && (await L.$eval('.head img', (e) => e.getAttribute('src')).catch(() => '')) === LOGO);
  /* THE DIALS (Martin): one row of four under the title, above the DRAFT box; SVG; words as well as colour */
  const dials = await L.$$eval('[data-pdial]', (a) => a.map((d) => ({ k: d.getAttribute('data-pdial'), t: d.innerText.replace(/\s+/g, ' '), svg: !!d.querySelector('svg rect'), img: !!d.querySelector('img'), top: Math.round(d.getBoundingClientRect().top),
    red: d.querySelectorAll('rect[data-b="red"]').length, amber: d.querySelectorAll('rect[data-b="amber"]').length, green: d.querySelectorAll('rect[data-b="green"]').length })));
  ok('   THE DIALS: four, in one row, drawn in SVG (not pictures)', J(dials.map((d) => d.k)) === J(['overall', 'checklist', 'ratio', 'risks']) && new Set(dials.map((d) => d.top)).size === 1 && dials.every((d) => d.svg && !d.img), J(dials));
  ok('   under the title, above the DRAFT box', await L.evaluate(() => { const t = document.getElementById('pTitle'), d = document.getElementById('pDials'), s = document.getElementById('pStatus'); return !!(t.compareDocumentPosition(d) & 4) && !!(d.compareDocumentPosition(s) & 4); }));
  const dv = Object.fromEntries(dials.map((d) => [d.k, d]));
  ok('   IN WORDS AS WELL AS COLOUR: "High", "23 of 27 answered", "Not met", "2 of 3 needed", "4 high · 9 medium · 4 low"', /High overall Overall rating/.test(dv.overall.t) && dv.overall.red === 14
    && /^23 of 27 answered/.test(dv.checklist.t) && /Not met 2 of 3 needed/.test(dv.ratio.t) && dv.ratio.red > 0 && /17 risks Risks by colour \d+ high · \d+ medium · \d+ low/.test(dv.risks.t) && dv.risks.red > 0 && dv.risks.amber > 0, J(dials.map((d) => d.t)));
  ok('   the overall rating in the event table too', /^High /.test(await text(L, '#pOverallRow')));
  /* 2 */
  const st = await L.$eval('#pStatus', (e) => ({ state: e.getAttribute('data-state'), t: e.innerText, size: parseFloat(getComputedStyle(e).fontSize) }));
  ok('2. NOT SIGNED: "DRAFT: NOT SIGNED OFF" in large words', st.state === 'draft' && /^DRAFT: NOT SIGNED OFF/.test(st.t) && st.size >= 18, J(st));
  ok('   and a light watermark', !!(await L.$('#pWatermark')) && (await text(L, '#pWatermark')) === 'DRAFT');
  /* 3 */
  const mustList = await L.$$eval('#pMustList li', (a) => a.length), mustRows = await L.$$eval('[data-pmust]', (a) => a.length);
  ok('3. MUST NOT GO AHEAD: a red box; "These 2 items", 2 listed, 2 marked in the table', /These 2 items have to be changed or taken out first/.test(await text(L, '#pMust')) && mustList === 2 && mustRows === 2, J({ mustList, mustRows }));
  /* 4 */
  const facts = await text(L, '#pFacts');
  ok('4. THE EVENT: when, where, kind (overseas), organiser', /São Paulo, Brazil/.test(facts) && /Trip, overseas/.test(facts) && /Olly Organiser \(invented\)/.test(facts), facts);
  ok('   leaders: the count, names and roles of leaders', /^2: Vic Leader \(invented\) \(trip leader\); Lena Lead \(invented\) \(deputy\)/.test(await text(L, '#pLeaders')), await text(L, '#pLeaders'));
  ok('   children booked: a count, never a name', /^12/.test(await text(L, '#pKids')), await text(L, '#pKids'));
  ok('   the ratio, and that it is NOT met (3 needed, 2 named)', /3 needed, 2 named: NOT met/.test(await text(L, '#pRatio')), await text(L, '#pRatio'));
  /* 5 */
  const ckRows = await L.$$eval('[data-pck]', (a) => a.map((r) => [r.getAttribute('data-pck'), r.innerText.replace(/\s+/g, ' ')]));
  const want = CK.checklistFor('trip', { abroad: true, under8: true }, [{ id: 'c_ins', q: 'x' }, { id: 'h_1', q: 'y' }]).map((q) => q.id);
  ok('5. THE CHECKLIST: every question (the core, overseas, the church\u2019s own, the host\u2019s)', J(ckRows.map((r) => r[0])) === J(want), J(ckRows.map((r) => r[0])));
  ok('   "Not answered" where blank (money, the church\u2019s, weather, the host\u2019s)', ckRows.filter((r) => /Not answered/.test(r[1])).map((r) => r[0]).sort().join() === ['c_ins', 'h_1', 'money', 'weather'].sort().join(), J(ckRows.filter((r) => /Not answered/.test(r[1]))));
  ok('   "Not applicable: <reason>"', /Not applicable: the host’s own coach collects us/.test((ckRows.find((r) => r[0] === 'transport') || [])[1]));
  ok('   THE PAEDIATRIC FIRST AIDER: "No", flagged High (under-8s are going)', !!(await L.$('[data-ppaed="red"]')) && /High: no paediatric first aider, and under-8s are going/.test((ckRows.find((r) => r[0] === 'paedFirstAid') || [])[1]));
  ok('   NO MALE AND FEMALE LEADER for a mixed group: flagged Medium', /Medium: no male and female leader for a mixed group/.test((ckRows.find((r) => r[0] === 'mixedLeaders') || [])[1]) && !!(await L.$('[data-pflag="mixedLeaders"].amber')));
  ok('   COVER UNDER £1 MILLION: flagged Medium', /Medium: public liability cover under £1 million/.test((ckRows.find((r) => r[0] === 'insurance') || [])[1]) && /£500,000: the church’s policy/.test((ckRows.find((r) => r[0] === 'insurance') || [])[1]));
  ok('   THE GUIDANCE FOLLOWED, in the facts', (await text(L, '#pGuide')) === 'The Diocese of Testbury’s safeguarding guidance (invented) https://example.invalid/safeguarding', await text(L, '#pGuide'));
  /* 6 */
  ok('6. "First draft by AI: checked by Vic Leader (invented) on 23 October 2026."', (await text(L, '#pAi')) === 'First draft by AI: checked by Vic Leader (invented) on 23 October 2026.', await text(L, '#pAi'));
  /* 7 */
  const rows = await L.$$eval('[data-prisk]', (a) => a.map((r) => ({ cells: r.children.length, rag: [...r.querySelectorAll('[data-rag]')].map((x) => x.innerText), lis: r.querySelectorAll('td ul li').length, brk: getComputedStyle(r).breakInside })));
  ok('7. THE RISK TABLE: 17 rows; every rating in words (High, Medium or Low), before and after', rows.length === 17 && rows.every((r) => r.rag.length === 2 && r.rag.every((t) => /^(High|Medium|Low) \d+$/.test(t))), J(rows.slice(0, 2)));
  ok('   the controls a list, not a squashed line', rows[1].lis === 2 && rows[3].lis === 3);
  ok('   NO ROW SPLIT ACROSS PAGES (break-inside: avoid)', rows.every((r) => r.brk === 'avoid'), J(rows.map((r) => r.brk)));
  ok('   the headings: hazard, who\u2019s at risk, before, controls, after, owner, review', /^Hazard Who’s at risk Before Controls After Owner Review$/.test((await text(L, '#pRisks thead')).trim()));
  /* 8 */
  ok('8. THE HOST\u2019S REQUIREMENTS: "Requirements taken from camp list.pdf, checked by Vic Leader (invented) on 23 October 2026."', /^Requirements taken from camp list\.pdf, checked by Vic Leader \(invented\) on 23 October 2026\./.test(await text(L, '#pHost')) && /code of conduct/.test(await text(L, '#pHostList')), await text(L, '#pHost'));
  ok('   boxes for wet signatures: the lead or deputy, the trip leader, dates', /Safeguarding lead or deputy Date Trip or event leader Date/.test(await text(L, '#pSign')));
  /* 9 */
  ok('9. NO CHILD\u2019S NAME, contact or medical detail, and no concern, anywhere on it', !PRIVATE.test(await text(L, '#sheet')), ((await text(L, '#sheet')).match(PRIVATE) || [])[0]);
  /* 11: the real PDF */
  const pdf = await L.pdf({ preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(path.join(HERE, 'sg-print-practice-trip.pdf'), pdf);
  const pages = pdfPages(pdf);
  ok('11. A REAL A4 PDF: every page A4 portrait (595 x 842)', Buffer.from(pdf).subarray(0, 5).toString() === '%PDF-' && pages.length >= 3 && pages.every((p) => Math.abs(p[0] - 596) <= 1 && Math.abs(p[1] - 843) <= 1), J(pages));
  const flow = await L.evaluate(() => { const w = document.querySelector('.wide'), h = w.querySelector('h2'), cs = getComputedStyle(w); return { page: cs.page || 'auto', before: cs.breakBefore, hAfter: getComputedStyle(h).breakAfter, thead: getComputedStyle(document.querySelector('#pRisks thead')).display }; });
  ok('   THE RISKS FOLLOW STRAIGHT ON: no forced new page; the heading kept with the table; the header repeats on each page', flow.page === 'auto' && flow.before === 'auto' && flow.hAfter === 'avoid' && flow.thead === 'table-header-group', J(flow));
  ok('   fewer pages than before (8 with the landscape break)', pages.length < 8, pages.length);
  await L.screenshot({ path: path.join(HERE, 'sg-print-draft.png'), fullPage: true });

  /* 10: signed; not needed */
  await db.collection('sgAssessments').doc(EID).update({ status: 'signed', signedBy: P.lena.uid, signedByName: 'Lena Lead (invented)', signedByRole: 'Safeguarding lead', signedAt: Timestamp.fromDate(new Date('2026-10-24T09:00:00Z')), signedVersion: 1, signedNote: 'Two leaders stay with the group in the prison throughout (invented)' });
  await go(L, 'sg-print.html?event=' + EID, '#sheet[data-ready]');
  await L.emulateMediaType('print');
  ok('10. SIGNED: "Signed off by Lena Lead (invented), Safeguarding lead, on 24 October 2026." with the reason for the high risk left', (await L.$eval('#pStatus', (e) => e.getAttribute('data-state'))) === 'signed'
    && /Signed off by Lena Lead \(invented\), Safeguarding lead, on 24 October 2026\. Their reason for the high risks left: “Two leaders stay with the group/.test(await text(L, '#pStatus')), await text(L, '#pStatus'));
  ok('   no DRAFT mark and no watermark', !/DRAFT/.test(await text(L, '#pStatus')) && !(await L.$('#pWatermark')));
  await db.collection('sgAssessments').doc(EID).update({ status: 'draft', waived: true, waivedBy: P.lena.uid, waivedByName: 'Lena Lead (invented)', waivedAt: Timestamp.fromDate(new Date('2026-10-25T09:00:00Z')), waivedWhy: 'Cancelled: the group goes next year instead (invented)' });
  await go(L, 'sg-print.html?event=' + EID, '#sheet[data-ready]');
  ok('   "NOT NEEDED": that record instead', (await L.$eval('#pStatus', (e) => e.getAttribute('data-state'))) === 'waived' && /Marked “not needed” by Lena Lead \(invented\) on 25 October 2026: Cancelled/.test(await text(L, '#pStatus')), await text(L, '#pStatus'));
  await db.collection('sgAssessments').doc(EID).set(ASSESS);

  /* 12: the standing risks; a snapshot; who */
  await go(L, 'sg-print.html?register=site_t', '#sheet[data-ready]');
  await L.emulateMediaType('print');
  ok('12. THE STANDING RISKS print: the site, each activity, its risks in words', /Standing risks: Test Green/.test(await text(L, '#pTitle')) && /Juniors \(invented\)/.test(await text(L, '#sheet')) && /High 15/.test(await text(L, '#pRisks_act_jun')) && /Low 5|Medium 5/.test(await text(L, '#pRisks_act_jun')), await text(L, '#pRisks_act_jun'));
  const T = await as('tom');
  await go(T, 'sg-print.html?snapshot=sn_1', '#sheet[data-ready]');
  ok('   A TRUSTEE prints a snapshot: its banner, the dials, the risks', /^Safeguarding risk register: Test Green, 23 October 2026$/.test(await text(T, '#pTitle')) && /90% \(9 of 10\)/.test(await text(T, '#sheet')) && /High 15/.test(await text(T, '#sheet')));
  await go(T, 'sg-print.html?event=' + EID, '#sheet[data-ready]');
  ok('   and an event\u2019s assessment, without the bookings (not theirs to see): "Not available to you"', /Not available to you/.test(await text(T, '#pKids')) && !PRIVATE.test(await text(T, '#sheet')));
  const S = await as('sam');
  await go(S, 'sg-print.html?event=' + EID, '#pFail');
  ok('   A VOLUNTEER can\u2019t print it', /can’t be printed here/.test(await text(S, '#pFail')));
  /* a team-only event (like the practice trip: shown only to its team) - its site's lead still assesses and prints it */
  const EIDT = EID + '_team';
  await db.collection('calEvents').doc(EIDT).set(Object.assign((await db.collection('calEvents').doc(EID).get()).data(), { audience: [], visibility: 'unlisted', title: 'Example: Brazil trip, team only (test, not real)' }));
  await db.collection('eventLeaders').doc(EIDT).set((await db.collection('eventLeaders').doc(EID).get()).data());
  await db.collection('sgAssessments').doc(EIDT).set(Object.assign({}, ASSESS, { calEventId: EIDT }));
  await go(L, 'sg-print.html?event=' + EIDT, '#sheet[data-ready], #pFail');
  ok('13. A TEAM-ONLY EVENT: its site’s safeguarding lead prints it too', /team only/.test(await text(L, '#pTitle')) && !(await L.$('#pFail')), (await text(L, '#pFail')) || (await text(L, '#pTitle')));
  ok('no page errors', errors.length === 0, errors.join(' | '));
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
