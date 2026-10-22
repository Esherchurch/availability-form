/* THE SAFEGUARDING RISK REGISTER, step 2: event assessments, signed off
   before bookings open (F-265). Events window. Invented people and events
   only, events emulators only, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/sg-assess.test.mjs"

   What it proves:
     1. the organiser marks an under-18s event as a trip (events-admin); it
        waits for safeguarding sign-off
     2. the public sign-up page says "Bookings open after safeguarding
        sign-off", and THE DATABASE REFUSES a sign-up
     3. a named leader writes the assessment from the trip template
     4. the site's lead signs it off - a high risk left needs a reason -
        and bookings open; a guest signs up
     5. a change after signing takes it back to waiting, and bookings close
     6. the lead says another event doesn't need one, with a reason, recorded
     7. a trustee reads them on the register, read-only; nobody else is
        offered "Sign it off"
     8. 375px, no sideways scrolling, pictures */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-sga-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const fwd = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const DAY = fwd(20);

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

const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = {
  olly: { email: 'olly.organiser@example.invalid', name: 'Olly Organiser (invented)', mid: 'm_olly', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  vic:  { email: 'vic.leader@example.invalid', name: 'Vic Leader (invented)', mid: 'm_vic', teams: ['Kids Church'] },
  lena: { email: 'lena.lead@example.invalid', name: 'Lena Lead (invented)', mid: 'm_lena', teams: ['Welcome'] },
  tom:  { email: 'tom.trustee@example.invalid', name: 'Tom Trustee (invented)', mid: 'm_tom', teams: ['Elders'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const EV = (title, extra) => ({ title, description: '', category: 'children', labels: [], visibility: 'public', status: 'confirmed', audience: ['public'], teams: [], featured: false,
  startLocal: DAY + 'T10:00', startUtc: Date.parse(DAY + 'T10:00:00Z'), endLocal: DAY + 'T16:00', endUtc: Date.parse(DAY + 'T16:00:00Z'), allDay: false,
  location: { kind: 'room', siteId: 'site_t', roomIds: [] }, organiserName: 'Olly Organiser (invented)', overseers: [], overseerUids: [],
  teamMemberIds: [], teamUids: [], teamNames: [], signupOn: true, capacity: 30, allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', imageLibId: '', seriesId: '', sgKind: '', updatedAt: 'x', ...(extra || {}) });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: false });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: false, attender: true, status: 'active' });
  }
  for (const name of ['Kids Church', 'Elders', 'Welcome']) await setDoc(doc(db, 'teams', name), { name, label: name, rota: true, order: 1 });
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', active: true, order: 1 });
  await setDoc(doc(db, 'bookingSettings', 'site_t'), { bookingsAdmins: [], safeguardingLead: 'm_lena', safeguardingDeputy: '' });
  await setDoc(doc(db, 'safeguardingSettings', 'defaults'), { templates: {}, ratioAll: 5, ratioUnder8: 4, dbsYears: 3, trainingYears: 3, requireChecks: false, leadSiteId: 'site_t', leadName: 'Lena Lead (invented)', leadPhone: '', updatedAt: 'x', updatedBy: 'x' });
  await setDoc(doc(db, 'calEvents', 'ev_trip'), EV('Beach trip (invented)', { createdBy: P.olly.uid }));
  await setDoc(doc(db, 'calEvents', 'ev_park'), EV('Walk to the park (invented)', { createdBy: P.olly.uid, sgKind: 'offsite' }));
  for (const id of ['ev_trip', 'ev_park']) {
    await setDoc(doc(db, 'capacity', id), { calEventId: id, taken: 0, capacity: 30 });
    await setDoc(doc(db, 'eventLeaders', id), { under18: id === 'ev_park', leaders: [{ memberId: 'm_vic', name: 'Vic Leader (invented)', uid: P.vic.uid }], leaderIds: ['m_vic'], leaderUids: [P.vic.uid], siteId: 'site_t', clearedIds: [], lastCleared: [], updatedAt: 'x', updatedBy: 'x' });
  }
  await setDoc(doc(db, 'sgGate', 'ev_park'), { needed: true, open: false, updatedAt: 'x' });
  await setDoc(doc(db, 'contacts', 'c_guest'), { name: 'Guest (invented)', email: 'g@example.invalid', source: 'signup' });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (col, id) => readDb(async (db) => { const s = await getDoc(doc(db, col, id)); return s.exists() ? s.data() : null; });

const errors = [], browsers = [], PAGES = [];
async function launch(label, w = 1280, h = 900) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, label);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: w, height: h });
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  PAGES.push([label, p]);
  p.on('dialog', d => { errors.push(label + ' was shown: ' + d.message()); d.accept(); });
  return p;
}
async function as(who, w, h) {
  const p = await launch(who, w, h);
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(400);
  return p;
}
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (p, sel) => p.$eval(sel, e => e.click());
/* a guest's sign-up, straight to the database as the page would make it */
const guestSignUp = (p, key) => p.evaluate((k) => { const db = EGBCAuth.db, b = db.batch();
  b.set(db.collection('signups').doc(k), { calEventId: 'ev_trip', personKind: 'contacts', personId: 'c_guest', name: 'Guest (invented)', email: 'g@example.invalid', places: 1, status: 'confirmed', attendees: [], answers: {} });
  b.update(db.collection('capacity').doc('ev_trip'), { taken: firebase.firestore.FieldValue.increment(1) }); return b.commit().then(() => 'booked', e => e.code); }, key);

try {
  /* 1. the organiser marks it a trip, for under-18s */
  const O = await as('olly');
  await go(O, 'events-admin.html?open=ev_trip', '#f_sgkind');
  ok('1. THE ORGANISER is asked what kind of event it is, for safeguarding', /needs a safeguarding assessment, signed off by the safeguarding lead or deputy before bookings open/.test(await text(O, '#sgKindHint')));
  await O.$eval('#f_u18', e => { e.checked = true; });
  await O.select('#f_sgkind', 'trip');
  await tap(O, '#save');
  const gate = await until(async () => get('sgGate', 'ev_trip'));
  const ev = await get('calEvents', 'ev_trip'), el = await get('eventLeaders', 'ev_trip');
  ok('   saved: a trip, for under-18s, and waiting for sign-off', ev.sgKind === 'trip' && el.under18 === true && gate && gate.needed === true && gate.open === false, J({ kind: ev.sgKind, u18: el.under18, gate }));

  /* 2. the public page and the database */
  const G = await launch('guest');
  await go(G, 'signup.html?event=ev_trip', '#sgWait');
  ok('2. THE SIGN-UP PAGE: "Bookings open after safeguarding sign-off", and no form', /Bookings open after safeguarding sign-off/.test(await text(G, '#sgWait')) && !(await G.$('form, #suForm, [data-places]')), await text(G, '#sgWait'));
  const r0 = await guestSignUp(G, 'key_sga_guest1_00000000000000000');
  ok('   and THE DATABASE REFUSES a sign-up made anyway', /permission/.test(r0), r0);
  /* WHILE THE RULES ARE NOT LIVE THE PAGES MUST HOLD IT (the reviewing window, 22 Oct) */
  await go(O, 'whatson.html', '.ev');
  const woCard = await O.$$eval('.ev', (b) => b.map(x => x.innerText.replace(/\s+/g, ' ')).find(t => /Beach trip/.test(t)) || '');
  ok('   WHAT\u2019S ON: the card says "Bookings open after safeguarding sign-off", no places to book', /Bookings open after safeguarding sign-off/.test(woCard) && !/places? left|waiting list/i.test(woCard), woCard);
  await go(G, 'whatson-embed.html?all=1', '[data-ev]');
  const emb = await G.$eval('[data-ev="ev_trip"]', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
  ok('   THE WEBSITE\u2019S EMBED: the same words, not "Sign up"', /Bookings open after safeguarding sign-off/.test(emb) && !/Sign up/.test(emb), emb);
  await go(O, 'screenshots/events/app-harness.html?space=me&tab=whatson', '.hello');
  await until(() => O.$('[data-w="events"]'));
  const appList = await O.$eval('[data-wact="event:ev_trip"]', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
  ok('   THE APP: "Not open yet", not "Sign up"', /Not open yet/.test(appList) && !/Sign up/.test(appList), appList);
  await tap(O, '[data-wact="event:ev_trip"]');
  await until(async () => /Not open for booking yet/.test(await text(O, '#egbc-content')));
  ok('   and its event view: "Bookings open after safeguarding sign-off", no Sign up', /Bookings open after safeguarding sign-off/.test(await text(O, '#egbc-content')) && !/Sign up/.test(await text(O, '#egbc-content')), await text(O, '#egbc-content'));

  /* 3. the named leader writes it */
  const Vv = await as('vic');
  await go(Vv, 'safeguarding.html?event=ev_trip', '#sgAssessCard #sgaStart');
  ok('3. A NAMED LEADER sees "Not started" and bookings waiting', /Not started/.test(await text(Vv, '#sgAssessCard')) && /Bookings open after the safeguarding lead or deputy signs this off/.test(await text(Vv, '#sgaGateWords')));
  await Vv.select('#sgaTpl', 'trip');
  await tap(Vv, '#sgaStart');
  await Vv.waitForSelector('[data-q="where"]', { timeout: 15000 });
  const a1 = await get('sgAssessments', 'ev_trip');
  ok('   starts from the trip template: its questions and starter risks', a1 && a1.templateId === 'trip' && a1.risks.length >= 5 && a1.status === 'draft' && a1.version === 1, J(a1 && { t: a1.templateId, n: a1.risks.length }));
  ok('   says: general words only, never a child, a family or a medical detail', /General words only: never name a child, a family or a medical detail/.test(await text(Vv, '#sgAssessCard')));
  await Vv.$eval('[data-q="where"]', e => { e.value = 'The beach, a coach ride away (invented)'; });
  await Vv.$eval('[data-sgarisk="0"] [data-rf="rl"]', e => { e.value = '4'; });   /* leave one high after controls: 4 x 5 */
  await tap(Vv, '#sgaReady');
  await until(async () => (await get('sgAssessments', 'ev_trip')).status === 'waiting');
  const a2 = await get('sgAssessments', 'ev_trip');
  ok('   "Ready for sign-off": saved and waiting', a2.status === 'waiting' && a2.answers.where === 'The beach, a coach ride away (invented)', J({ s: a2.status }));
  ok('   A LEADER IS NOT OFFERED "Sign it off"', !(await Vv.$('#sgaSign')));

  /* 4. the lead signs it off */
  const L = await as('lena');
  await go(L, 'safeguarding.html?event=ev_trip', '#sgaSign');
  ok('4. THE LEAD sees how many risks are still high, and must say why', /1 risk is still high after the controls: say why it can go ahead/.test(await text(L, '#sgAssessCard')));
  await tap(L, '#sgaSign');
  await until(async () => /Say why it can go ahead/.test(await text(L, '#sgaMsg')));
  ok('   signing with no reason is refused, with the words why', (await get('sgAssessments', 'ev_trip')).status === 'waiting');
  await L.$eval('#sgaNote', e => { e.value = 'The trip leader stays with the group at the water at all times (invented)'; });
  await tap(L, '#sgaSign');
  await until(async () => (await get('sgAssessments', 'ev_trip')).status === 'signed');
  const a3 = await get('sgAssessments', 'ev_trip'), g3 = await get('sgGate', 'ev_trip');
  ok('   SIGNED OFF by the lead, with the time, the version and the reason; the gate opens', a3.signedBy === P.lena.uid && a3.signedAt && a3.signedAt.toMillis && a3.signedVersion === a3.version && /stays with the group/.test(a3.signedNote) && g3.open === true, J({ by: a3.signedBy === P.lena.uid, gate: g3 }));
  await go(G, 'signup.html?event=ev_trip', 'h1');
  ok('   the sign-up page no longer says waiting', !(await G.$('#sgWait')));
  const r1 = await guestSignUp(G, 'key_sga_guest2_00000000000000000');
  ok('   and A GUEST SIGNS UP', r1 === 'booked', r1);
  await go(G, 'whatson-embed.html?all=1', '[data-ev="ev_trip"]');
  ok('   and What\u2019s On\u2019s embed says "Sign up" again', /Sign up/.test(await G.$eval('[data-ev="ev_trip"]', e => e.innerText)) && !(await G.$('[data-ev="ev_trip"] [data-sgwait]')));

  /* 5. a change after signing */
  await go(Vv, 'safeguarding.html?event=ev_trip', '#sgaSave');
  await Vv.$eval('[data-q="meet"]', e => { e.value = 'The church car park, 9am (invented)'; });
  await tap(Vv, '#sgaSave');
  await until(async () => (await get('sgAssessments', 'ev_trip')).status === 'waiting');
  const a4 = await get('sgAssessments', 'ev_trip'), g4 = await get('sgGate', 'ev_trip');
  ok('5. A CHANGE AFTER SIGNING takes it back to waiting (version 2), and the gate closes', a4.status === 'waiting' && a4.version === 2 && g4.open === false, J({ s: a4.status, v: a4.version, gate: g4 }));
  const r2 = await guestSignUp(G, 'key_sga_guest3_00000000000000000');
  ok('   and bookings close again', /permission/.test(r2), r2);

  /* 6. "not needed", recorded */
  await go(L, 'safeguarding.html?event=ev_park', '#sgaWhy');
  await L.$eval('details', e => { e.open = true; });
  await L.$eval('#sgaWhy', e => { e.value = 'A walk to the park next door with parents, an hour (invented)'; });
  await tap(L, '#sgaWaive');
  await until(async () => (await get('sgAssessments', 'ev_park') || {}).waived === true);
  const w = await get('sgAssessments', 'ev_park');
  ok('6. THE LEAD SAYS IT ISN\u2019T NEEDED: recorded who, when, why; the gate opens', w.waivedBy === P.lena.uid && w.waivedAt && w.waivedAt.toMillis && /walk to the park/.test(w.waivedWhy) && (await get('sgGate', 'ev_park')).open === true, J({ by: w.waivedBy === P.lena.uid, why: w.waivedWhy }));
  await L.setViewport({ width: 375, height: 812 }); await go(L, 'safeguarding.html?event=ev_trip', '#sgAssessCard [data-sgstatus]');
  ok('8. AT 375px nothing scrolls sideways (the assessment card)', (await L.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await L.screenshot({ path: path.join(HERE, 'sg-assess-lead-375.png'), fullPage: true });

  /* 7. the trustee reads the register's event list */
  const Tt = await as('tom');
  await go(Tt, 'safeguarding-risk.html', '[data-tab="events"]');
  await tap(Tt, '[data-tab="events"]');
  await Tt.waitForSelector('[data-sgev]', { timeout: 15000 });
  const list = await text(Tt, '#evList');
  ok('7. A TRUSTEE sees the events and where each has got: waiting, and not needed', /Beach trip \(invented\)/.test(list) && /Waiting for sign-off/.test(list) && /Not needed \(Lena Lead/.test(list), list);
  ok('   with no way to open it for editing', !(await Tt.$('a[href^="safeguarding.html?event="]')));
  await tap(Tt, '[data-viewsga="ev_trip"]');
  await Tt.waitForSelector('#sgaView [data-sgarisk]', { timeout: 15000 });
  ok('   "Read it": read-only, no Sign, no Save, no inputs', !(await Tt.$('#sgaView #sgaSign')) && !(await Tt.$('#sgaView #sgaSave')) && !(await Tt.$('#sgaView textarea')) && /The beach, a coach ride away/.test(await text(Tt, '#sgaView')));
  await Tt.screenshot({ path: path.join(HERE, 'sg-assess-trustee-desk.png') });

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
  for (const [lb, pg] of PAGES) console.log('   PAGE ' + lb + ': ' + (await pg.evaluate(() => location.pathname + location.search + ' :: ' + document.body.innerText.replace(/s+/g, ' ').slice(0, 300)).catch(() => '?')));
  console.log('   ERRORS ' + errors.join(' | '));
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  await env.cleanup(); server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
