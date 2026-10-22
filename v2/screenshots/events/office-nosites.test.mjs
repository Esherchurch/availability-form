/* F-152: Running things ▸ Bookings when there is no site to look after.
   Drawn through the real shell (screenshots/events/app-harness.html).
   Events window. Invented people only, events emulators only, network
   guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/office-nosites.test.mjs"

   What it proves:
     1. NO SITES YET (the live state Martin met): a master admin is told
        "No sites or rooms set up yet - add them in Places on a computer",
        never "You are not on one"; so is someone in the Church office group
     2. WITH A SITE: the master admin sees that site's requests; the Church
        office person, who is not yet a bookings admin of any site, is told
        how to become one
     3. someone who really is not on a site's office still gets "You are
        not on one", with sites or without */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-nosites-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const pad = (n) => (n < 10 ? '0' : '') + n;
const fwd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

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
  martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', teams: ['Core Team'], master: true },
  val:    { email: 'val.office@example.invalid', name: 'Val Office', mid: 'm_val', teams: ['Church office'] },
  ann:    { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
/* No sites, no rooms: the live state today. */
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'teams', 'Church office'), { name: 'Church office', label: 'Church office', rota: false, runs: ['today', 'people', 'bookings', 'send'] });
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
});

const errors = [], browsers = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: 375, height: 812 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const APP = 'screenshots/events/app-harness.html?space=office&tab=bookings';
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
async function bookings(p) {
  await p.goto(URLB + APP, { waitUntil: 'networkidle2' });
  return until(async () => { for (const o of ['nosites', 'notyet', 'none', 'requests']) if (await p.$('[data-o="' + o + '"]')) return o; return null; }, 20000);
}
const PLACES = /No sites or rooms set up yet \u2014 add them in Places on a computer\./;
const NOT_ON = /You are not on one\./;

try {
  /* 1. no sites yet */
  const M = await as('martin');
  const m1 = await bookings(M);
  const mt = await text(M, '#egbc-content');
  ok('1. NO SITES YET: Martin (master admin) is told to add them in Places', m1 === 'nosites' && PLACES.test(mt), m1 + ' :: ' + mt.slice(0, 300));
  ok('   NEVER "You are not on one"', !NOT_ON.test(mt));
  await M.screenshot({ path: path.join(HERE, 'office-nosites-375.png') });

  const V = await as('val');
  const v1 = await bookings(V);
  ok('1. the Church office group, no sites yet: the same Places sentence', v1 === 'nosites' && PLACES.test(await text(V, '#egbc-content')), v1 + ' :: ' + (await text(V, '#egbc-content')).slice(0, 300));

  /* 3. someone who is not the office (the shell gives them no Bookings
     tab, so the decision is asked directly, as the screen would) */
  const A = await as('ann');
  await A.goto(URLB + APP, { waitUntil: 'networkidle2' });
  await until(() => A.evaluate(() => !!(window.EGBCAppOffice && EGBCAuth.profile && EGBCAuth.profile())));
  const aw = await A.evaluate(() => [EGBCAppOffice.noSiteWords({ sites: [], allSites: 0 }), EGBCAppOffice.noSiteWords({ sites: [], allSites: 1 })]);
  ok('3. someone not on any office: "You are not on one", with no sites or with one', aw.every(w => w.o === 'none' && NOT_ON.test(w.words)), JSON.stringify(aw));
  ok('   never the Places sentence', aw.every(w => !PLACES.test(w.words)));

  /* 2. a site, with one booking asking */
  const day = fwd(5);
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
    await setDoc(doc(db, 'rooms', 'room_hall'), { siteId: 'site_t', name: 'Test Hall', kind: 'room', active: true, order: 1, capacity: 0, colour: '#3d6263', accessible: true,
      bookableByMembers: true, bookableByHirers: false, description: '', photoUrl: '' });
    await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: '', safeguardingDeputy: '' });
    await setDoc(doc(db, 'bookings', 'bk_ask_00000000000000000000000000'), { kind: 'member', status: 'requested', siteId: 'site_t', roomId: 'room_hall', groupId: '', day,
      startMin: 1140, endMin: 1200, startLocal: day + 'T19:00', endLocal: day + 'T20:00', setupMins: 0, packdownMins: 0, slotFrom: 76, slotTo: 80, title: 'Choir practice (invented)',
      people: 8, layout: '', av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], notes: '',
      requester: { name: 'Samy Member', email: 'samy.member@example.invalid', phone: '', org: '' }, memberUid: 'u_samy_x', memberName: 'Samy Member', createdAt: 'x' });
  });
  const m2 = await bookings(M);
  ok('2. WITH A SITE: Martin sees its requests', m2 === 'requests' && /Choir practice \(invented\)/.test(await text(M, '#egbc-content')), m2 + ' :: ' + (await text(M, '#egbc-content')).slice(0, 300));
  const v2 = await bookings(V);
  const vt = await text(V, '#egbc-content');
  ok('2. the Church office person, not yet a bookings admin: told how to become one', v2 === 'notyet' && /A master admin adds you in Places, under \u201cWho approves\u201d/.test(vt), v2 + ' :: ' + vt.slice(0, 300));
  ok('   not the Places sentence (there is a site now), nor "not on one"', !PLACES.test(vt) && !NOT_ON.test(vt));

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
