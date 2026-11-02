/* Pages turn away the people they aren't for, with one plain card and a way
   back, and nothing private shows behind it. Made-up people and children
   only, events emulators only, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/not-for-you.check.mjs"

   Who each page is for (the Menu's access table):
     kids-admin, kids-checkin  the children's team leads, the safeguarding lead
                               and deputy, each group's leaders (check-in: and
                               the morning's session leader), master admins
     event-ra                  the event's organisers and leaders, the office,
                               the trustees, the health and safety leads,
                               master admins
     sg-print                  the safeguarding lead and deputy, the trustees,
                               master admins; an event's assessment, also the
                               event's organisers and leaders
     youthapp2                 the youth group (access code) and the youth
                               team, their admins, master admins
   Each refusal is checked at phone (375) and desktop (1280) width. */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-nfy-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }

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

/* What must never show to someone a page isn't for. */
const SECRET = ['Ada Synthetic', 'peanut-synthetic', 'Synthetic river crossing', 'Synthetic ladder hazard', 'kay.lead@example.invalid'];
const P = {
  eve:   { email: 'eve.everyone@example.invalid', name: 'Eve Everyone', mid: 'm_eve', teams: [], adminFor: [] },
  will:  { email: 'will.worship@example.invalid', name: 'Will Worship', mid: 'm_will', teams: ['Worship Team'], adminFor: [] },
  cora:  { email: 'cora.core@example.invalid', name: 'Cora Core', mid: 'm_cora', teams: ['Core Team'], adminFor: ['Worship Team'] },
  kay:   { email: 'kay.lead@example.invalid', name: 'Kay Lead', mid: 'm_kay', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  sage:  { email: 'sage.sg@example.invalid', name: 'Sage Safeguarding', mid: 'm_sage', teams: [], adminFor: [] },
  max:   { email: 'max.master@example.invalid', name: 'Max Master', mid: 'm_max', teams: [], adminFor: [], master: true }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const x of Object.values(P)) {
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: "St Aidan's with St Hild, Testbury (synthetic)", enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'St Hild (synthetic)', address: 'Invented Street', active: true, order: 1 });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: 'm_sage', safeguardingDeputy: '' });
  await setDoc(doc(db, 'careRouting', 'status'), { leadIds: ['m_sage'] });
  await setDoc(doc(db, 'kidsSettings', 'site_t'), { teams: ['Kids Church'] });
  await setDoc(doc(db, 'kidsGroups', 'g1'), { siteId: 'site_t', name: 'Little ones', leaderIds: [], years: ['Year 1'], day: 7 });
  await setDoc(doc(db, 'kidsChildren', 'c1'), { siteId: 'site_t', groupId: 'g1', familyId: 'f1', name: 'Ada Synthetic', allergyFlag: true });
  await setDoc(doc(db, 'kidsMedical', 'c1'), { siteId: 'site_t', groupId: 'g1', allergies: 'peanut-synthetic' });
  await setDoc(doc(db, 'calEvents', 'ev1'), { title: 'Youth camp (synthetic)', startLocal: '2026-12-05T10:00', endLocal: '2026-12-05T16:00', location: { siteId: 'site_t' }, teamMemberIds: [], teamUids: [], createdBy: '' });
  await setDoc(doc(db, 'sgAssessments', 'ev1'), { siteId: 'site_t', status: 'draft', version: 1, risks: [{ id: 'r1', text: 'Synthetic river crossing', rl: 3, ri: 3 }] });
  await setDoc(doc(db, 'raEvents', 'ev1'), { status: 'draft', version: 1, risks: [{ id: 'r1', text: 'Synthetic ladder hazard', rl: 3, ri: 3 }] });
});

const errors = [], BROWSERS = [], SAID = {};
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); BROWSERS.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') (SAID[who] = SAID[who] || []).push(m.text()); });
  p.on('dialog', d => d.accept());
  if (who !== 'out') {
    await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
    await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
    const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
    if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
    await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
    await sleep(500);
  }
  return p;
}
/* Open a page and wait until it has settled one way or the other. */
async function visit(p, url, width) {
  await p.setViewport({ width, height: width < 600 ? 812 : 900 });
  await p.goto(URLB + url, { waitUntil: 'networkidle2' });
  return until(() => p.evaluate(() => {
    const card = document.getElementById('egbc-blocked-card');
    if (card) return { refused: true, back: !!card.querySelector('a[href]'), words: card.innerText, text: document.body.innerText };
    const t = document.body.innerText;
    if (!t.trim() || (/Loading/i.test(t) && t.length < 400)) return null;
    return { refused: false, text: t };
  }), 20000) || { refused: false, text: '(never settled)' };
}

const REFUSE = [
  ['kids-admin.html', ['eve', 'will', 'cora']],
  ['kids-checkin.html', ['eve', 'will', 'cora']],
  ['event-ra.html?event=ev1', ['eve', 'will', 'cora', 'kay']],
  ['event-ra.html', ['eve', 'will']],
  ['sg-print.html?event=ev1', ['eve', 'will', 'cora', 'kay']],
  ['sg-print.html?register=site_t', ['eve', 'will', 'cora', 'kay']],
  ['youthapp2.html', ['out', 'eve', 'will', 'kay']]
];
const OPEN = [
  ['kids-admin.html', ['kay', 'sage', 'max']],
  ['kids-checkin.html', ['kay', 'max']],
  ['event-ra.html?event=ev1', ['max']],
  ['event-ra.html', ['cora', 'max']],
  ['sg-print.html?event=ev1', ['sage', 'max']],
  ['sg-print.html?register=site_t', ['sage', 'max']],
  ['youthapp2.html', ['max']]
];

try {
  const pages = {};
  const pageOf = async (who) => (pages[who] = pages[who] || await as(who));
  let n = 0;
  for (const [url, whos] of REFUSE) for (const who of whos) for (const w of [375, 1280]) {
    const r = await visit(await pageOf(who), url, w);
    const leak = SECRET.filter(s => r.text.includes(s) && !(s === P.kay.email && who === 'kay'));
    ok(url + ' as ' + who + ' at ' + w + ': "this page isn\u2019t for you", a way back, nothing private',
      r.refused && r.back && /isn.t for you/.test(r.words) && !leak.length, r.refused ? 'shows: ' + leak.join(', ') : r.text.slice(0, 300));
    n++;
  }
  for (const [url, whos] of OPEN) for (const who of whos) {
    SAID[who] = [];
    const r = await visit(await pageOf(who), url, 1280);
    ok(url + ' opens for ' + who, !r.refused, (r.words || r.text.slice(0, 200)) + ' | ' + SAID[who].join(' | '));
  }
  console.log('  (' + n + ' refusals checked)');
} catch (e) {
  ok('the run finished', false, e.stack);
}

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
for (const b of BROWSERS) await b.close().catch(() => {});
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
if (errors.length) console.log('  page errors (not counted): ' + errors.slice(0, 5).join(' | '));
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
