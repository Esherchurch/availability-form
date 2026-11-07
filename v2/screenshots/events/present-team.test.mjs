/* A TEAM MEMBER PRESENTS A PLAN THEY CAN READ (Martin, 7 Nov 2026). Events window.
   Invented people, invented slides only, events emulators only (with the hub's
   functions), locked rules, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/present-team.test.mjs"
     (with APPDATA, CLOUDSDK_CONFIG and XDG_CONFIG_HOME on empty folders, so no live secret is read)

   What it proves, for Kim, on the Kids Church team and leading no group:
     1. at 375 (her phone) and at 1440: she opens the plan's slides in Present
        and is offered Present; she presses it, and the TV view (the computer
        at the TV) shows the PowerPoint's first slide; Next moves the TV on to
        the second; she sees the speaker notes; she stops
        and, while she presents, may start its quiz (and not once she stops)
     2. she cannot edit the plan: in the session planner it is read only, and
        the database refuses her a change to the plan, and a rename or removal
        of the PowerPoint; Storage refuses her a new PowerPoint file
     3. someone on no team cannot present it (the rules) */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-pt-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const DATE = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

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

/* the emulators, as the owner (the rules are not asked) */
const FS = `http://127.0.0.1:8182/v1/projects/${PROJECT}/databases/(default)/documents`;
const OWNER = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };
function enc(v) {
  if (v === null) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
  return { stringValue: String(v) };
}
const put = (p, d) => fetch(FS + '/' + p, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(d).map(([k, x]) => [k, enc(x)])) }) }).then(r => { if (!r.ok) throw new Error('seed ' + p + ' ' + r.status); });
const getDoc = (p) => fetch(FS + '/' + p, { headers: OWNER }).then(r => r.ok ? r.json() : null);
async function store(name, type, body) {
  await fetch('http://127.0.0.1:9198/upload/storage/v1/b/egbc-worship-planner.firebasestorage.app/o?uploadType=media&name=' + encodeURIComponent(name),
    { method: 'POST', headers: { 'Content-Type': type, Authorization: 'Bearer owner' }, body });
}

await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  kim: { email: 'kim.kids@example.invalid', name: 'Kim Kids (invented)', mid: 'm_kim', teams: ['Kids Church'] },
  lee: { email: 'lee.lead@example.invalid', name: 'Lee Lead (invented)', mid: 'm_lee', teams: ['Kids Church'] },
  eve: { email: 'eve.none@example.invalid', name: 'Eve Everyone (invented)', mid: 'm_eve', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  await put('addressBook/' + P[k].mid, { name: P[k].name, email: P[k].email, markers: P[k].teams, adminFor: [], masterAdmin: false });
  await put('users/' + P[k].uid, { memberId: P[k].mid, linkedBy: 'admin', name: P[k].name, email: P[k].email, teams: P[k].teams, adminFor: [], masterAdmin: false, status: 'active' });
}
await put('churchSettings/details', { name: "St Aidan's with St Hild, Testbury (synthetic)", enquiryEmail: 'office@example.invalid' });
await put('teams/Kids Church', { name: 'Kids Church', rota: true, order: 1 });
await put('planGroups/pg_t', { name: 'Little ones (synthetic)', kind: 'children', day: 0, time: '10:30', siteId: 'site_t', leaderIds: ['m_lee'], teamName: 'Kids Church', order: 1, archived: false });
const CTX = { type: 'session', groupId: 'pg_t', sessionId: 'ps_t' };
await put('presentDecks/deck_t', { status: 'ready', count: 2, ratio: 16 / 9, name: 'Noah (synthetic).pptx', context: CTX, by: P.lee.uid, at: new Date().toISOString() });
await put('presentNotes/deck_t', { notes: ['Made-up note one', 'Made-up note two'], context: CTX });
await put('planSessions/ps_t', { groupId: 'pg_t', date: DATE, title: 'Noah and the ark (synthetic)', updatedBy: P.lee.uid,
  parts: [{ id: 'p1', title: 'The story (synthetic)', kind: 'Story', show: [{ id: 's1', type: 'pptx', deckId: 'deck_t' }, { id: 's2', type: 'quiz', name: 'Ark quiz (synthetic)', title: '1 question',
    questions: [{ q: 'How many of each animal? (synthetic)', answers: ['Two', 'One', 'Ten', 'None'], seconds: 20 }] }] }] });
/* two made-up slides: a one-pixel picture each, told apart by name */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
for (const f of ['s1.jpg', 's2.jpg', 't1.jpg', 't2.jpg']) await store('present/deck_t/' + f, 'image/jpeg', PNG);

const errors = [], BROWSERS = [];
async function as(who, w, h) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); BROWSERS.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: w, height: h });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(500);
  return p;
}
const now = () => getDoc('presentNow/ps_ps_t').then(d => d && d.fields ? d.fields : null);
const tvSlide = (tv) => tv.evaluate(() => { const i = [...document.querySelectorAll('img')].map(x => x.currentSrc || x.src).filter(s => /deck_t/.test(decodeURIComponent(s))); return i.map(s => (decodeURIComponent(s).match(/\/(s\d+)\.jpg/) || [])[1]).filter(Boolean).join(','); });

try {
  /* 1, at both sizes */
  for (const [w, h, label] of [[375, 812, 'AT 375 (HER PHONE)'], [1440, 900, 'AT 1440']]) {
    const K = await as('kim', w, h);
    await K.goto(URLB + 'present.html?s=ps_t', { waitUntil: 'networkidle2' });
    const offered = await until(() => K.$('[data-start]'));
    ok('1. ' + label + ': Kim opens the plan\u2019s slides and is offered Present', !!offered, await K.evaluate(() => document.body.innerText.slice(0, 300)));
    /* the computer at the TV: the same plan's TV view */
    const tvB = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, 'tv-')), args: ['--no-first-run'] });
    GUARD.watchBrowser(tvB); BROWSERS.push(tvB);
    const TV = await tvB.newPage(); await GUARD.protect(TV, 'tv'); TV.on('pageerror', e => errors.push('tv: ' + e.message));
    await TV.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
    await TV.setViewport({ width: 1920, height: 1080 });
    await TV.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
    await TV.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
    await TV.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P.kim.email);
    await sleep(500);
    await TV.goto(URLB + 'present.html?s=ps_t&tv=1', { waitUntil: 'networkidle2' });
    await K.evaluate(() => document.querySelector('[data-start]').click());
    const started = await until(async () => { const n = await now(); return n && n.presenterUid && n.presenterUid.stringValue === P.kim.uid ? n : null; });
    ok('   she presses Present: she is the presenter', !!started, JSON.stringify(await now()));
    ok('   the TV shows the PowerPoint\u2019s first slide', !!(await until(async () => (await tvSlide(TV)).split(',').includes('s1'))), await tvSlide(TV));
    ok('   she sees the speaker notes', !!(await until(() => K.evaluate(() => /Made-up note one/.test(document.body.innerText)))));
    /* the plan's quiz: the server lets her start it while she presents (here it then stops at "when the hub goes live": not a refusal of her) */
    const quizWhile = await K.evaluate(() => EGBCAuth.call('quizHost', { action: 'start', sessionId: 'ps_t', step: 'p0s1' }).then(() => 'started', e => e.code || e.message));
    ok('   while she presents, the server lets her start the plan’s quiz', !/permission/.test(quizWhile), quizWhile);
    await until(() => K.$('[data-go]:not([disabled])'));
    const at = Date.now();
    await K.evaluate(() => document.querySelector('[data-go]').click());
    const moved = await until(async () => { const n = await now(); return n && n.slide && n.slide.integerValue === '1' && (await tvSlide(TV)).split(',').includes('s2'); });
    ok('   Next: the TV moves on to the second slide (' + (Date.now() - at) + ' ms)', !!moved, JSON.stringify({ now: await now(), tv: await tvSlide(TV) }));
    await K.evaluate(() => document.querySelector('[data-stop]').click());
    ok('   she stops presenting', !!(await until(async () => { const n = await now(); return n && n.presenterUid && n.presenterUid.stringValue === ''; })));
    const quizAfter = await K.evaluate(() => EGBCAuth.call('quizHost', { action: 'start', sessionId: 'ps_t', step: 'p0s1' }).then(() => 'started', e => e.code || e.message));
    ok('   and once she has stopped, the quiz is refused her (only the one presenting runs it)', /permission/.test(quizAfter), quizAfter);
    await K.screenshot({ path: path.join(HERE, 'present-team-kim-' + w + '.png') });
    await tvB.close(); await K.browser().close();
  }

  /* 2: no way to edit the plan */
  const K = await as('kim', 375, 812);
  await K.goto(URLB + 'session-planner.html?s=ps_t', { waitUntil: 'networkidle2' });
  await until(() => K.evaluate(() => /Noah and the ark/.test(document.body.innerText)));
  const ro = await K.evaluate(() => { const f = [...document.querySelectorAll('input,textarea,select')].filter(x => x.offsetParent !== null && !x.closest('#egbc-va-team,header,.shell,#egbc-help')); return { editable: f.filter(x => !x.disabled && !x.readOnly).map(x => x.id || x.name || x.className).slice(0, 5), save: !!document.querySelector('#sSave'), addWeek: !!document.querySelector('#addWeek') }; });
  ok('2. KIM CANNOT EDIT THE PLAN: in the session planner it is read only (nothing to type in, no Save, no Add)', !ro.editable.length && !ro.save && !ro.addWeek, JSON.stringify(ro));
  const refused = await K.evaluate(() => Promise.all([
    EGBCAuth.db.collection('planSessions').doc('ps_t').update({ title: 'Changed (synthetic)' }).then(() => 'written', e => e.code),
    EGBCAuth.db.collection('presentDecks').doc('deck_t').update({ name: 'Renamed.pptx' }).then(() => 'written', e => e.code),
    EGBCAuth.db.collection('presentDecks').doc('deck_t').delete().then(() => 'written', e => e.code),
    firebase.storage(firebase.app('egbc')).ref('present/deck_t/source.pptx').put(new Blob(['x'], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })).then(() => 'written', e => e.code)]));
  ok('   and is refused a change to the plan, a rename or removal of the PowerPoint, and a new PowerPoint file', refused.every(x => /permission|unauthorized/.test(x)), JSON.stringify(refused));

  /* 3: someone on no team */
  const E = await as('eve', 375, 812);
  const eveNow = await E.evaluate((ctx) => EGBCAuth.db.collection('presentNow').doc('ps_ps_t').set({ context: ctx, slide: 0, presenterUid: firebase.auth(firebase.app('egbc')).currentUser.uid, presenterName: 'Eve', blank: false, updatedBy: firebase.auth(firebase.app('egbc')).currentUser.uid }).then(() => 'written', e => e.code), CTX);
  ok('3. SOMEONE ON NO TEAM cannot present it', /permission/.test(eveNow), eveNow);
} catch (e) {
  ok('the run finished', false, e.stack);
} finally {
  for (const b of BROWSERS) await b.close().catch(() => {});
  server.close();
}
ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
process.exit(results.every(Boolean) ? 0 : 1);
