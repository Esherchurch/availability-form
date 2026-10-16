/* THE SESSION PLANNER, PART 1 (F-223, F-225; Martin, 16 Oct). Events window.
   Invented people only, events emulators only (with the hub's functions),
   network guard; emails are recorded by the sender's emulator stub, never sent.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/session-planner.test.mjs"

   What it proves, at 375px:
     1. a master admin sets up a group (Kids Church): leaders, its team, a
        programme with its link, the parts of a session
     2. A LEADER (Samy) plans a week: title, lesson code, the programme's
        link, who's on from the rota and who's away from the availability
        form; a Bible passage from the free Bibles on the hub, with its
        copyright line; a part's steps; DRAGS THE PARTS and the order saved
        is the dropped order
     3. ANOTHER LEADER (Karen) picks it up, sees "Last changed by Samy",
        changes it; Samy then sees "Last changed by Karen"
     4. A TEAM MEMBER reads only: no Save, and the rules refuse a write
     5. SOMEONE ELSE: the page refuses, and the rules refuse a read
     6. BIBLE GATEWAY: a link only - the plan keeps the reference, never text
     7. API.Bible: the key is set in Church settings, the status never shows
        it, and no page can read where it is kept
     8. THE EMAIL: to every leader of the group (on that week or not) and
        that week's team; not to anyone else; built by the server
     9. print: the buttons and chips are not printed; a leader uploads a file */

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
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-plan-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 700))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
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

/* ---------- the test church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  martin: { name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  samy:   { name: 'Samy Leader (invented)', mid: 'm_samy', teams: ['Kids Church'] },
  karen:  { name: 'Karen Leader (invented)', mid: 'm_karen', teams: ['Kids Church'] },
  lois:   { name: 'Lois Leader (invented)', mid: 'm_lois', teams: ['Kids Church'] },
  tom:    { name: 'Tom Team (invented)', mid: 'm_tom', teams: ['Kids Church'] },
  ava:    { name: 'Ava Away (invented)', mid: 'm_ava', teams: ['Kids Church'] },
  mia:    { name: 'Mia Member (invented)', mid: 'm_mia', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.plan@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
for (const name of ['Core Team', 'Kids Church']) await db.collection('teams').doc(name).set({ name, label: name, rota: true, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid' });
/* The coming Sunday, on the rota: Tom on Kids Church, Ava marked away. */
const d0 = new Date(); d0.setDate(d0.getDate() + ((7 - d0.getDay()) % 7 || 7));
const SUN = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
await db.collection('events').doc('svc1').set({ date: SUN, startTime: '10:30', type: 'Morning service', assignments: { 'Leader (Younger)': { id: 'm_tom', name: 'Tom Team (invented)' }, 'Worship Leader': { id: 'm_mia', name: 'Mia Member (invented)' } } });
await db.collection('availability').doc('av1').set({ eventId: 'svc1', memberId: 'm_ava', status: 'unavailable' });
const outbox = async () => (await db.collection('emailOutbox').get()).docs.map(d => d.data());

const errors = [], browsers = [];
async function as(who) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: 375, height: 812 });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(500);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const setVal = (pg, sel, v) => pg.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const plan = async () => { const s = await db.collection('planSessions').get(); return s.docs.map(d => ({ id: d.id, ...d.data() }))[0] || null; };

try {
  /* ---------- 1. the group ---------- */
  const M = await as('martin');
  await M.goto(URLB + 'session-planner.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('[data-gform=""]'));
  const nf = '[data-gform=""] ';
  await setVal(M, nf + '[data-gf="name"]', 'Kids Church');
  await setVal(M, nf + '[data-gf="ageFrom"]', '4'); await setVal(M, nf + '[data-gf="ageTo"]', '10');
  await setVal(M, nf + '[data-gf="teamName"]', 'Kids Church');
  for (const id of ['m_samy', 'm_karen', 'm_lois']) await M.select(nf + '[data-gladd]', id);
  await setVal(M, nf + '[data-gf="programmes"]', 'Urban Saints | https://example.invalid/lesson/{code}');
  await setVal(M, nf + '[data-gf="parts"]', 'Welcome, Game, Story, Craft, Prayer');
  await tap(M, nf + '[data-gsave]');
  const grp = await until(async () => { const s = await db.collection('planGroups').get(); return s.docs[0] ? { id: s.docs[0].id, ...s.docs[0].data() } : null; });
  ok('1. A MASTER ADMIN SETS UP A GROUP: Kids Church, three leaders, its team, Urban Saints and its link, the parts', grp && grp.name === 'Kids Church' && J(grp.leaderIds) === J(['m_samy', 'm_karen', 'm_lois']) && grp.teamName === 'Kids Church'
    && grp.programmes[0].name === 'Urban Saints' && J(grp.parts) === J(['Welcome', 'Game', 'Story', 'Craft', 'Prayer']), J(grp));
  await M.screenshot({ path: path.join(HERE, 'planner-groups-375.png'), fullPage: true });

  /* ---------- 2. Samy plans a week ---------- */
  const SA = await as('samy');
  await SA.goto(URLB + 'session-planner.html', { waitUntil: 'networkidle2' });
  await until(() => SA.$('#addWeek'));
  await tap(SA, '#addWeek');
  await until(() => SA.$('#sTitle'));
  await until(async () => /Tom Team/.test(await text(SA, '#onBox')));
  const onAway = { on: await text(SA, '#onBox'), away: await text(SA, '#awayBox') };
  ok('2. A LEADER ADDS A SUNDAY: who\'s on from the rota (Tom), who\'s away from the availability form (Ava)', /Tom Team/.test(onAway.on) && !/Mia/.test(onAway.on) && /Ava Away/.test(onAway.away), J(onAway));
  ok('   the date is the coming Sunday, and the parts are the group\'s', (await SA.$eval('#sDate', e => e.value)) === SUN && (await SA.$$eval('.part', e => e.length)) === 5);
  await setVal(SA, '#sTitle', 'Born again?');
  await setVal(SA, '#sCode', 'EJ03');
  await SA.select('#sProg', ''); await SA.select('#sProg', 'Urban Saints');
  ok('   choosing Urban Saints fills in the lesson\'s link from the code', (await SA.$eval('#sLink', e => e.value)) === 'https://example.invalid/lesson/EJ03', await SA.$eval('#sLink', e => e.value));
  await tap(SA, '#pickPassage');
  await until(() => SA.$('#bpVer option[value="BSB"]'));
  await setVal(SA, '#bpRef', 'John 3:1-8');
  await tap(SA, '#bpShow');
  await until(() => SA.$('#bpUse'));
  const shown = await text(SA, '#bpOut');
  ok('   THE BIBLE, FREE ON THE HUB: John 3:1-8 in the BSB, with its copyright line', /Nicodemus/.test(shown) && /Berean Standard Bible\. Public domain/.test(shown), shown.slice(0, 300));
  await SA.screenshot({ path: path.join(HERE, 'planner-bible-375.png') });
  await tap(SA, '#bpUse');
  await until(async () => /John 3:1-8/.test(await text(SA, '#passageBox')));
  /* a step to show on screen, in the Story part */
  await SA.evaluate(() => [...document.querySelectorAll('.part .ph')].find(h => /Story/.test(h.innerText)).click());
  await until(() => SA.$('[data-addstep]'));
  await SA.select('[data-addstep]', 'text');
  await until(() => SA.$('#stT'));
  await setVal(SA, '#stT', 'What does "new" mean?');
  await tap(SA, '#stAdd');
  await until(async () => /Text slide: What does/.test(await text(SA, '[data-steps]')));
  await SA.$eval('[data-f="bring"]', e => { e.value = 'Torch, dark cloth'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  /* drag Prayer above Welcome, with the handle, as a person would */
  await SA.evaluate(() => [...document.querySelectorAll('.part .ph')].find(h => /Story/.test(h.innerText)).click());
  await sleep(300);
  await SA.$eval('#parts', e => e.scrollIntoView({ block: 'center' })); await sleep(300);
  const hs = await SA.$$('.part .handle');
  const from = await hs[4].boundingBox(), to = await hs[0].boundingBox();
  await SA.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await SA.mouse.down(); await SA.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 4); await sleep(60);
  for (let i = 1; i <= 12; i++) { await SA.mouse.move(from.x + from.width / 2, from.y + (to.y - from.y - 8) * i / 12 + from.height / 2); await sleep(30); }
  await SA.mouse.up(); await sleep(400);
  const domOrder = await SA.$$eval('.part .t', e => e.map(x => x.innerText.replace(/^\d+\.\s*/, '')));
  await tap(SA, '#save');
  await until(async () => /Saved/.test(await text(SA, '#sMsg')));
  const p1 = await plan();
  ok('   SAVED, IN THE DRAGGED ORDER (Prayer moved to the top)', p1 && p1.parts[0].title === 'Prayer' && J(p1.parts.map(x => x.title)) === J(domOrder), J(p1 && p1.parts.map(x => x.title)) + ' / ' + J(domOrder));
  ok('   with the title, code, link, passage (text and copyright), on and away', p1 && p1.title === 'Born again?' && p1.lessonCode === 'EJ03' && p1.passage.source === 'bundled' && /Nicodemus/.test(p1.passage.text) && /Public domain/.test(p1.passage.copyright)
    && J(p1.onIds) === J(['m_tom']) && J(p1.awayIds) === J(['m_ava']) && p1.updatedBy === P.samy.uid, J(p1 && { t: p1.title, c: p1.lessonCode, on: p1.onIds, away: p1.awayIds }));
  ok('   the part keeps its step and things to bring', p1 && p1.parts.find(x => x.title === 'Story').show[0].type === 'text' && J(p1.parts.find(x => x.title === 'Story').bring) === J(['Torch', 'dark cloth']));
  await SA.screenshot({ path: path.join(HERE, 'planner-session-375.png'), fullPage: true });

  /* ---------- 3. Karen picks it up ---------- */
  const KA = await as('karen');
  await KA.goto(URLB + 'session-planner.html', { waitUntil: 'networkidle2' });
  await until(() => KA.$('.wk[data-s]'));
  const term = await text(KA, '#term');
  ok('3. ANOTHER LEADER (Karen) SEES THE TERM: the week, its code and title, who\'s on and away', /EJ03/.test(term) && /Born again\?/.test(term) && /Tom Team/.test(term) && /Away: Ava/.test(term), term);
  await KA.screenshot({ path: path.join(HERE, 'planner-term-375.png'), fullPage: true });
  await tap(KA, '.wk[data-s]');
  await until(() => KA.$('#lastBy'));
  ok('   "Last changed by Samy"', /Last changed by Samy Leader/.test(await text(KA, '#lastBy')), await text(KA, '#lastBy'));
  await setVal(KA, '#sTitle', 'Born again? (Karen\'s version)');
  await tap(KA, '#save');
  await until(async () => /Saved/.test(await text(KA, '#sMsg')));
  await SA.goto(URLB + 'session-planner.html?s=' + p1.id, { waitUntil: 'networkidle2' });
  await until(() => SA.$('#lastBy'));
  ok('   she changes it, and Samy then sees "Last changed by Karen"', /Last changed by Karen Leader/.test(await text(SA, '#lastBy')) && /Karen's version/.test(await SA.$eval('#sTitle', e => e.value)));

  /* ---------- 4. a team member ---------- */
  const TO = await as('tom');
  await TO.goto(URLB + 'session-planner.html?s=' + p1.id, { waitUntil: 'networkidle2' });
  await until(() => TO.$('#sTitle'));
  ok('4. A TEAM MEMBER READS THE PLAN, and cannot change it (no Save, the boxes shut)', !(await TO.$('#save')) && (await TO.$eval('#sTitle', e => e.disabled)) && /Born again/.test(await TO.$eval('#sTitle', e => e.value)));
  const tw = await TO.evaluate((id) => EGBCAuth.db.collection('planSessions').doc(id).update({ title: 'Tom was here', updatedBy: EGBCAuth.user().uid }).then(() => 'written', e => e.code), p1.id);
  ok('   and the rules refuse his write', /permission/.test(tw), tw);

  /* ---------- 5. someone else ---------- */
  const MI = await as('mia');
  await MI.goto(URLB + 'session-planner.html?s=' + p1.id, { waitUntil: 'networkidle2' });
  await until(async () => /This page is for/.test(await text(MI)));
  ok('5. SOMEONE ELSE: the page says who it is for, and shows no plan', /This page is for the leaders and teams/.test(await text(MI)) && !/Born again/.test(await text(MI)) && (await MI.evaluate(() => document.body.hasAttribute('data-egbc-blocked'))));
  const mr = await MI.evaluate((id) => EGBCAuth.db.collection('planSessions').doc(id).get().then(() => 'read', e => e.code), p1.id);
  ok('   and the rules refuse to read it', /permission/.test(mr), mr);

  /* ---------- 6. Bible Gateway, a link only ---------- */
  await SA.goto(URLB + 'session-planner.html?s=' + p1.id, { waitUntil: 'networkidle2' });
  await until(() => SA.$('#pickPassage'));
  await tap(SA, '#pickPassage');
  await until(() => SA.$('[data-src="biblegateway"]'));
  await tap(SA, '[data-src="biblegateway"]');
  await until(() => SA.$('#bpVer option[value="NIVUK"], #bpVer option'));
  await setVal(SA, '#bpRef', 'John 3:16');
  await tap(SA, '#bpShow');
  await until(() => SA.$('#bpUse'));
  const gwLink = await SA.$eval('#bpOut a', a => a.href);
  await tap(SA, '#bpUse');
  await tap(SA, '#save');
  await until(async () => /Saved/.test(await text(SA, '#sMsg')));
  const p2 = await plan();
  ok('6. BIBLE GATEWAY: the plan keeps the reference and a link, NEVER THE TEXT', p2.passage.source === 'biblegateway' && p2.passage.text === '' && /biblegateway\.com\/passage\/\?search=John%203%3A16&version=NIVUK/.test(p2.passage.link) && /biblegateway/.test(gwLink), J(p2.passage));

  /* ---------- 7. API.Bible's key ---------- */
  /* Before switch-over the key can't be saved (privateSettings is readable until the rules deploy). */
  await db.collection('teamMailSettings').doc('config').set({ shutForTest: true });
  await M.goto(URLB + 'church-settings.html', { waitUntil: 'networkidle2' });
  await until(async () => /switches over/.test(await text(M, '#bible-form')));
  ok('7. BEFORE SWITCH-OVER: Church settings says "The API.Bible key can be saved when the church switches over", with no box to paste into',
    /The API\.Bible key can be saved when the church switches over\./.test(await text(M, '#bible-form')) && !(await M.$('#bk-key')), await text(M, '#bible-form'));
  const shutSave = await M.evaluate(() => EGBCAuth.call('bibleKeySave', { key: 'synthetic-key-0123456789abcdef' }).then(() => 'saved', e => e.code || e.message));
  ok('   and the server refuses to save one, so nothing is kept', /failed-precondition/.test(shutSave) && !(await db.collection('privateSettings').doc('apiBible').get()).exists, shutSave);
  await db.collection('teamMailSettings').doc('config').delete();
  await M.goto(URLB + 'church-settings.html', { waitUntil: 'networkidle2' });
  await until(async () => /No key yet/.test(await text(M, '#bible-form')));
  await setVal(M, '#bk-key', 'synthetic-key-0123456789abcdef');
  await tap(M, '#bk-save');
  await until(async () => /Saved\. It will not be shown again/.test(await text(M, '#bible-form')));
  const kd = (await db.collection('privateSettings').doc('apiBible').get()).data() || {};
  ok('7. API.BIBLE: a master admin pastes the key in Church settings; it is kept by the server', kd.key === 'synthetic-key-0123456789abcdef');
  ok('   the page says "A key is saved", and never shows it', /A key is saved/.test(await text(M, '#bible-form')) && !(await M.content()).includes('synthetic-key-0123'));
  const kr = await M.evaluate(() => EGBCAuth.db.collection('privateSettings').doc('apiBible').get().then(() => 'read', e => e.code));
  ok('   NOT EVEN A MASTER ADMIN\'S PAGE CAN READ WHERE IT IS KEPT', /permission/.test(kr), kr);
  const st = await SA.evaluate(() => EGBCAuth.call('bibleKeyStatus', {}).then(() => 'answered', e => e.code || e.message));
  ok('   and a leader cannot even ask whether there is one', /permission/.test(st), st);

  /* ---------- 8. the email ---------- */
  await SA.goto(URLB + 'session-planner.html?s=' + p1.id, { waitUntil: 'networkidle2' });
  await until(() => SA.$('#email'));
  await tap(SA, '#email');
  await until(async () => /Sent to/.test(await text(SA, '#sMsg')));
  const mails = (await outbox()).filter(m => m.kind === 'session plan');
  const sentTo = mails.map(m => m.to[0]).sort();
  ok('8. THE EMAIL: to every leader (Samy, Karen and Lois, who is not on) and this week\'s team (Tom)', J(sentTo) === J([P.karen.email, P.lois.email, P.samy.email, P.tom.email].sort()), J(sentTo));
  ok('   not to anyone else (not the away Ava, not Mia)', !sentTo.includes(P.ava.email) && !sentTo.includes(P.mia.email));
  ok('   built by the server from the saved plan', mails[0] && /Born again\? \(Karen/.test(mails[0].html) && /Open the plan/.test(mails[0].html) && /session-planner\.html\?s=/.test(mails[0].html), (mails[0] || {}).subject);
  const tm = await TO.evaluate((id) => EGBCAuth.call('planSend', { sessionId: id }).then(() => 'sent', e => e.code || e.message), p1.id);
  ok('   a team member cannot send it', /permission/.test(tm), tm);

  /* ---------- 9. print, and a file ---------- */
  await SA.emulateMediaType('print');
  const hidden = await SA.evaluate(() => ['#save', '#email', '.chips'].every(s => { const e = document.querySelector(s); return !e || e.getClientRects().length === 0; }));
  ok('9. PRINT: no buttons and no chips on the paper', hidden);
  await SA.emulateMediaType('screen');
  await SA.evaluate(() => [...document.querySelectorAll('.part .ph')].find(h => /Craft/.test(h.innerText)).click());
  await until(() => SA.$('[data-upload]'));
  const pdf = path.join(TMP, 'worksheet-EJ03.pdf'); fs.writeFileSync(pdf, '%PDF-1.4\n% invented worksheet\n');
  const inp = await SA.$('[data-upload]'); await inp.uploadFile(pdf);
  await until(async () => /worksheet-EJ03\.pdf/.test(await text(SA, '.part')), 20000);
  await tap(SA, '#save');
  await until(async () => /Saved/.test(await text(SA, '#sMsg')));
  const p3 = await plan();
  ok('   a leader uploads a worksheet to a part, and it is kept with the plan', !!p3.parts.find(x => (x.files || []).some(f => f.name === 'worksheet-EJ03.pdf' && /^planner\//.test(f.path))), J(p3.parts.map(x => x.files)));
  ok('   nothing scrolls sideways at 375px', (await SA.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);

  /* ---------- 10. a paired ChurchShow computer asks for the lesson (egbc-lesson/1) ---------- */
  const { getAuth } = fnRequire('firebase-admin/auth');
  const devUid = 'churchshow-site_a';
  await db.collection('devices').doc(devUid).set({ active: true, siteId: 'site_a' });
  const asDevice = async (uidX, claims) => {
    const ct = await getAuth().createCustomToken(uidX, claims);
    const r = await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: ct, returnSecureToken: true }) })).json();
    return r.idToken;
  };
  const callFn = async (tok, data) => {
    const r = await fetch('http://127.0.0.1:5102/' + PROJECT + '/europe-west2/lessonFor', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ data }) });
    return r.json();
  };
  const dtok = await asDevice(devUid, { device: 'churchshow', siteId: 'site_a' });
  const day = await callFn(dtok, { date: SUN });
  ok('10. CHURCHSHOW: a paired computer lists that day\'s lessons', day.result && day.result.lessons.length === 1 && day.result.lessons[0].group === 'Kids Church', J(day));
  const les = (await callFn(dtok, { sessionId: p1.id })).result || {};
  ok('    and gets one as egbc-lesson/1: group, code, link, the steps in order', les.format === 'egbc-lesson/1' && les.group.name === 'Kids Church' && les.lessonCode === 'EJ03' && les.steps.length >= 1 && les.steps[0].type === 'text' && les.steps[0].n === 1, J(les).slice(0, 400));
  ok('    a Bible Gateway passage is the reference only (ChurchShow fetches it)', les.passage && les.passage.source === 'biblegateway' && les.passage.text === undefined, J(les.passage));
  ok('    LEADERS\' NOTES AND "THINGS TO BRING" ARE NOT SENT TO A SCREEN', !/dark cloth|"notes"|"bring"/.test(J(les)), J(les).slice(0, 300));
  await db.collection('devices').doc(devUid).update({ active: false });
  const off = await callFn(dtok, { sessionId: p1.id });
  ok('    DISCONNECTED on the hub: refused at once', off.error && /PERMISSION_DENIED/.test(off.error.status), J(off));
  const mtok = await asDevice(P.samy.uid, {});
  const notDev = await callFn(mtok, { sessionId: p1.id });
  ok('    a person (even the group\'s leader) is not a ChurchShow computer', notDev.error && /PERMISSION_DENIED/.test(notDev.error.status), J(notDev));

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
