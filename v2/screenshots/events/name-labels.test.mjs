/* Name labels for an event's people, adults too (F-185; ChurchSuite's event
   label printing). Events window. Invented people and events only, events
   emulators only, network guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/name-labels.test.mjs"

   What it proves:
     1. at the door, the event's leader (not an admin) has "Name labels":
        everyone booked (3) or only those here now (1), and it says which
        label size it prints on - the church's one, as the children's
     2. printing: one label per person, in name order, with the event's
        name and date; PRINTED, each is exactly 62 x 29 mm and nothing else
        on the page prints
     3. only those here now, without the event's name: one label
     4. an A4 sheet of 21: labels 63.5 x 38.1 mm, three across
     5. the label size: an admin chooses it; anyone else cannot */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-nlabels-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

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

const P = {
  martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  lee:    { email: 'lee.leader@example.invalid', name: 'Lee Leader', mid: 'm_lee', teams: ['Welcome'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const start = new Date(); start.setHours(start.getHours() + 1, 0, 0, 0);
const K1 = 'key_one_' + 'a'.repeat(24), K2 = 'key_two_' + 'b'.repeat(24);
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'labelSettings', 'main'), { format: 'brother62x29', updatedAt: 'x', updatedBy: 'x' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_hall'), { siteId: 'site_t', name: 'Test Hall', kind: 'room', active: true, order: 1 });
  await setDoc(doc(db, 'calEvents', 'ev_men'), { title: 'Men\u2019s breakfast (invented)', description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
    featured: false, startLocal: iso(start), startUtc: start.getTime(), endLocal: iso(new Date(start.getTime() + 2 * 3600e3)), endUtc: start.getTime() + 2 * 3600e3, allDay: false,
    location: { kind: 'room', siteId: 'site_t', roomIds: ['room_hall'] }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: true, capacity: 20,
    allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', createdBy: 'x', updatedAt: 'x' });
  await setDoc(doc(db, 'capacity', 'ev_men'), { calEventId: 'ev_men', taken: 3, capacity: 20 });
  await setDoc(doc(db, 'eventLeaders', 'ev_men'), { leaders: [], leaderUids: [P.lee.uid], siteId: 'site_t', ratioAll: 8, ratioUnder8: 4, requireChecks: false, dbsYears: 3, trainingYears: 3 });
  const SU = (name, attendees) => ({ calEventId: 'ev_men', personKind: 'contacts', personId: 'c_' + name.slice(0, 3), name, email: name.slice(0, 3).toLowerCase() + '@example.invalid', phone: '',
    attendees: attendees.map(n => ({ name: n })), answers: {}, places: attendees.length, ticketTypeId: '', status: 'confirmed', donation: 0, notes: '', memberUid: '', createdAt: '2026-10-01T10:00:00Z' });
  await setDoc(doc(db, 'signups', K1), SU('Zac Zebra (invented)', ['Zac Zebra (invented)', 'Al Aardvark (invented)']));
  await setDoc(doc(db, 'signups', K2), SU('Mo Mole (invented)', ['Mo Mole (invented)']));
  /* Mo is here already. */
  await setDoc(doc(db, 'checkins', 'ev_men__' + K2 + '__0'), { calEventId: 'ev_men', signupKey: K2, attendeeIndex: 0, name: 'Mo Mole (invented)', kind: 'person', state: 'in', inAt: new Date().toISOString(), inByName: 'Lee Leader', siteId: 'site_t', roomId: 'room_hall', day: iso(start).slice(0, 10) });
});

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
/* Printing is caught, not done: what was on the page at that moment. */
const catchPrint = (p) => p.evaluate(() => { window.__printed = []; window.print = () => { window.__printed.push({ cls: document.body.className, labels: [...document.querySelectorAll('#nlabels .lbl')].map(l => l.innerText.replace(/\s+/g, ' ')) }); }; });
const printedSizes = async (p) => {
  await p.evaluate(() => document.body.classList.add('print-labels'));
  await p.emulateMediaType('print');
  const out = await p.evaluate(() => ({
    wrap: getComputedStyle(document.getElementById('wrap')).display,
    labels: [...document.querySelectorAll('#nlabels .lbl')].map(l => { const r = l.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; })
  }));
  await p.emulateMediaType(null);
  await p.evaluate(() => document.body.classList.remove('print-labels'));
  return out;
};

try {
  /* ---------- 1. the door: the event's leader ---------- */
  const L = await browser('lee');
  await L.goto(URLB + 'checkin.html?event=ev_men', { waitUntil: 'networkidle2' });
  await until(() => L.$('#nameLabels'));
  await until(async () => /Mo Mole/.test(await text(L, '#people')));
  await L.$eval('#nameLabels', b => b.click());
  await L.waitForSelector('#lGo');
  const m = await text(L, '#modal');
  ok('1. AT THE DOOR, the leader (not an admin): "Name labels", everyone booked (3) or here now (1)', /Everyone booked \(3\)/.test(m) && /Only those here now \(1\)/.test(m), m);
  ok('   it says it prints on the church\'s label size, as the children\'s', /Prints on: Brother small roll, 62 × 29 mm/.test(m), m);
  await L.screenshot({ path: path.join(HERE, 'name-labels-choose.png') });

  /* ---------- 2. printing everyone ---------- */
  await catchPrint(L);
  await L.$eval('#lGo', b => b.click());
  const pr = await until(() => L.evaluate(() => window.__printed[0]));
  ok('2. PRINTED: one label per person, in name order', pr && pr.labels.length === 3 && /^Al Aardvark/.test(pr.labels[0]) && /^Mo Mole/.test(pr.labels[1]) && /^Zac Zebra/.test(pr.labels[2]), J(pr));
  ok('   each with the event\'s name and date', pr && pr.labels.every(l => /Men’s breakfast \(invented\) · \w{3} \d+ \w{3}/.test(l)), J(pr && pr.labels));
  ok('   and only the labels are sent to the printer', pr && /print-labels/.test(pr.cls));
  const s1 = await printedSizes(L);
  ok('   ON PAPER: each label exactly 62 x 29 mm, and nothing else on the page prints', s1.wrap === 'none' && s1.labels.length === 3 && s1.labels.every(l => Math.abs(l.w - 234) <= 2 && Math.abs(l.h - 110) <= 2), J(s1));
  const css = await L.$eval('#egbc-label-print', s => s.textContent);
  ok('   one label to a page of the roll', /@page\{size:62mm 29mm;margin:0\}/.test(css) && /page-break-after:always/.test(css), css.slice(0, 200));

  /* ---------- 3. only those here, no event name ---------- */
  await catchPrint(L);
  await L.$eval('#nameLabels', b => b.click());
  await L.waitForSelector('#lGo');
  await L.$eval('input[name="lwho"][value="here"]', r => r.click());
  await L.$eval('#lEvent', c => c.click());
  await L.$eval('#lGo', b => b.click());
  const pr2 = await until(() => L.evaluate(() => window.__printed[0]));
  ok('3. ONLY THOSE HERE NOW, without the event\'s name: one label, the name alone', pr2 && pr2.labels.length === 1 && pr2.labels[0] === 'Mo Mole (invented)', J(pr2));

  /* ---------- 4. an A4 sheet of 21 ---------- */
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'labelSettings', 'main'), { format: 'a4x21', updatedAt: 'x', updatedBy: 'x' }); });
  await L.goto(URLB + 'checkin.html?event=ev_men', { waitUntil: 'networkidle2' });
  await until(async () => /Mo Mole/.test(await text(L, '#people')));
  await catchPrint(L);
  await L.$eval('#nameLabels', b => b.click());
  await L.waitForSelector('#lGo');
  ok('4. AN A4 SHEET: it says so', /A4 sheet of 21/.test(await text(L, '#modal')));
  await L.$eval('#lGo', b => b.click());
  await until(() => L.evaluate(() => window.__printed[0]));
  const s2 = await printedSizes(L);
  ok('   each 63.5 x 38.1 mm, three across the sheet', s2.labels.length === 3 && s2.labels.every(l => Math.abs(l.w - 240) <= 2 && Math.abs(l.h - 144) <= 2) &&
    s2.labels[0].y === s2.labels[1].y && s2.labels[1].y === s2.labels[2].y && s2.labels[0].x < s2.labels[1].x && s2.labels[1].x < s2.labels[2].x, J(s2));

  /* ---------- 5. who chooses the size ---------- */
  const M = await browser('martin');
  await M.goto(URLB + 'checkin.html?event=ev_men', { waitUntil: 'networkidle2' });
  await until(() => M.$('#nameLabels'));
  const mSaved = await M.evaluate(() => EGBCLabels.save('dymo89x36').then(() => 'saved', e => 'refused: ' + e.message));
  let now = null; await env.withSecurityRulesDisabled(async (c) => { now = (await getDoc(doc(c.firestore(), 'labelSettings', 'main'))).data(); });
  ok('5. AN ADMIN chooses the label size', mSaved === 'saved' && now.format === 'dymo89x36' && now.updatedBy === P.martin.uid, mSaved + ' ' + J(now));
  const lSaved = await L.evaluate(() => EGBCLabels.save('a4x8').then(() => 'saved', e => 'refused'));
  ok('   the event\'s leader cannot', lSaved === 'refused');

  ok('no page errors', errors.length === 0, errors.join(' | '));
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
