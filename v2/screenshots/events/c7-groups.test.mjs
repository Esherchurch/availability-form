/* Chunk 7, stage 1 — small groups: the directory, "Find a group", asking
   to join, membership, and what is private.
   Events window. Invented people only, events emulators only, network
   guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/c7-groups.test.mjs"

   What it proves:
     1. before a master admin names the groups admins, a Core Team admin is
        told "not set up yet"; once named, they add a home group with a
        leader, an address, a limit of two and a picture
     2. a visitor (not signed in) finds it by day and area, sees "in a home
        in Esher" and never the address, and asks to join (as a contact)
     3. a member asks to join; the leader is emailed
     4. the leader accepts both: the group fills; the welcome email carries
        the address; a third person sees "Full" and cannot ask
     5. the member sees "Your groups" and the address; someone not in the
        group sees neither, even round the page
     6. the leader takes someone out, edits the time, and cannot change
        who leads it; a member who leads nothing cannot open the page */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098 || cfg.emulators.storage.port !== 9198) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-c7-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const PIC = path.join(TMP, 'group.png'); fs.copyFileSync(path.join(V2, 'icon-192.png'), PIC);

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
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = {
  karen: { email: 'karen.admin@example.invalid', name: 'Karen Admin', mid: 'm_karen', admin: true, teams: ['Core Team'] },
  gina:  { email: 'gina.core@example.invalid', name: 'Gina Core', mid: 'm_gina', teams: ['Core Team'], adminFor: ['Core Team'] },
  lena:  { email: 'lena.leader@example.invalid', name: 'Lena Leader', mid: 'm_lena', teams: ['Welcome Team'] },
  mo:    { email: 'mo.member@example.invalid', name: 'Mo Member', mid: 'm_mo', teams: ['Welcome Team'] },
  ned:   { email: 'ned.member@example.invalid', name: 'Ned Member', mid: 'm_ned', teams: ['Welcome Team'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.admin });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.admin, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'sites', 'site_t'), { name: 'Test Green', address: 'Invented Street', active: true, order: 1 });
  await setDoc(doc(db, 'rooms', 'room_hall'), { siteId: 'site_t', name: 'Test Hall', kind: 'room', active: true, order: 1 });
  await setDoc(doc(db, 'smallGroups', 'sg_members'), { name: 'Members prayer', type: 'Prayer', description: '', day: 6, time: '08:00', frequency: 'weekly', locationKind: 'room', siteId: 'site_t', roomId: 'room_hall',
    area: '', audience: 'Adults', open: true, capacity: 0, memberCount: 0, visibility: 'members', active: true, leaderIds: ['m_karen'], leaderNames: ['Karen Admin'] });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const get = (c, id) => readDb(db => getDoc(doc(db, c, id)).then(s => s.exists() ? s.data() : null));
const J = (x) => JSON.stringify(x);

const errors = [], PAGES = [];
async function launch(label) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, label + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); return b;
}
async function pageOf(b, label, width) {
  const p = await b.newPage();
  await GUARD.protect(p, label);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(label + ': ' + e.message));
  p.on('dialog', d => d.accept());
  PAGES.push([label, p]);
  return p;
}
async function as(who, width) {
  const b = await launch(who), p = await pageOf(b, who, width);
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  b.page = p; return b;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const check = (p, sel, on) => p.$eval(sel, (e, on) => { if (e.checked !== on) e.click(); }, on);
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const outbox = (p) => p.evaluate(() => (window.__egbcOutbox || []).map(m => m.payload));
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const hideBanner = (p) => p.evaluate(() => { const b = document.querySelector('.firebase-emulator-warning'); if (b) b.style.display = 'none'; });

try {
  /* ---------- 1. the groups admins, and a new group ---------- */
  const gB = await as('gina'); const GI = gB.page;
  await go(GI, 'groups-admin.html', '#noaccess');
  ok('1. before the groups admins are named, a Core Team admin is told it is not set up yet', /Not set up yet/.test(await text(GI, '#noaccess')), await text(GI, '#main'));
  const kB = await as('karen'); const KA = kB.page;
  await go(KA, 'groups-admin.html', '[data-tab="settings"]');
  await tap(KA, '[data-tab="settings"]');
  await KA.waitForSelector('.s-team[value="Core Team"]');
  await check(KA, '.s-team[value="Core Team"]', true);
  await tap(KA, '#s-save');
  await until(async () => J((await get('groupsSettings', 'main') || {}).teams) === J(['Core Team']));
  ok('   a master admin names Core Team\'s admins as the groups admins', true);
  await kB.close();
  await go(GI, 'groups-admin.html', '#g-new');
  await tap(GI, '#g-new');
  await GI.waitForSelector('#f-save');
  await val(GI, '#f-name', 'Tuesday home group'); await val(GI, '#f-desc', 'Bible study and supper (invented).');
  await GI.select('#f-day', '2'); await val(GI, '#f-time', '19:30');
  await GI.$eval('[name="f-loc"][value="home"]', e => { e.checked = true; e.dispatchEvent(new Event('change')); });
  await val(GI, '#f-area', 'Esher'); await val(GI, '#f-address', '1 Invented Road, Esher'); await val(GI, '#f-cap', '2');
  await GI.select('#f-addlead', 'm_lena');
  await (await GI.$('#f-image')).uploadFile(PIC);
  await tap(GI, '#f-save');
  const grp = await until(async () => { const s = await readDb(db => getDocs(query(collection(db, 'smallGroups'), where('name', '==', 'Tuesday home group')))); const d = s.docs[0]; return d && d.data().image ? { id: d.id, ...d.data() } : null; }, 25000);
  ok('   a groups admin adds a home group: Lena leads it, a limit of two, a picture', grp && J(grp.leaderIds) === J(['m_lena']) && J(grp.leaderNames) === J(['Lena Leader']) && grp.capacity === 2 && grp.memberCount === 0
    && grp.visibility === 'public' && /smallGroups/.test(grp.image) && !('address' in grp), J(grp));
  ok('   the address is kept apart, in the private half', (await get('smallGroupPrivate', grp.id)).address === '1 Invented Road, Esher');
  await gB.close();

  /* ---------- 2. a visitor ---------- */
  const vB = await launch('visitor'); const VI = await pageOf(vB, 'visitor', 375);
  await go(VI, 'groups.html', '[data-g]');
  ok('2. a visitor sees the public group, not the members-only one', /Tuesday home group/.test(await text(VI, '#list')) && !/Members prayer/.test(await text(VI, '#list')));
  await VI.select('#f-day', '2'); await VI.select('#f-area', 'Esher');
  ok('   found by day and area: "Tuesdays, 7.30pm, every week · In a home in Esher"', /Tuesdays, 7\.30pm, every week · In a home in Esher/.test(await text(VI, '#list')), await text(VI, '#list'));
  ok('   its picture shows', !!(await VI.$('#list img.thumb')));
  await VI.select('#f-day', '6');
  ok('   (a Saturday filter finds nothing)', /No groups match/.test(await text(VI, '#list')));
  await go(VI, 'groups.html?group=' + grp.id, '#j-go');
  ok('   THE ADDRESS IS NOWHERE ON THE PAGE', !/Invented Road/.test(await VI.content()));
  const vsneak = await VI.evaluate((id) => EGBCAuth.db.collection('smallGroupPrivate').doc(id).get().then(() => 'read', e => e.code), grp.id);
  ok('   nor can a visitor read it round the page', /permission/.test(vsneak), vsneak);
  await VI.evaluate(() => { window.__egbcOutbox.length = 0; });
  await val(VI, '#j-name', 'Gail Guest'); await val(VI, '#j-email', 'gail.guest@example.invalid'); await val(VI, '#j-msg', 'New to the area (invented).');
  await tap(VI, '#j-go');
  await VI.waitForSelector('#j-done');
  const gReq = (await readDb(db => getDocs(query(collection(db, 'smallGroupRequests'), where('email', '==', 'gail.guest@example.invalid'))))).docs.map(d => d.data())[0];
  const gContact = gReq && await get('contacts', gReq.personId);
  ok('   she asks to join: a request, and her a contact (one place for people)', gReq && gReq.status === 'asked' && gReq.personKind === 'contacts' && gContact && gContact.name === 'Gail Guest', J(gReq));
  ok('   and she is emailed a copy (to the outbox only)', (await outbox(VI)).some(m => m.to[0] === 'gail.guest@example.invalid' && /Your request to join Tuesday home group/.test(m.subject)));
  await hideBanner(VI);
  await VI.screenshot({ path: path.join(HERE, 'c7-find-a-group-375.png'), fullPage: true });

  /* ---------- 3. a member asks ---------- */
  const mB = await as('mo', 375); const MO = mB.page;
  await go(MO, 'groups.html', '[data-g]');
  ok('3. a member sees members-only groups too', /Members prayer/.test(await text(MO, '#list')) && !(await MO.$eval('#signedOut', e => e.offsetParent)));
  await tap(MO, '[data-g="' + grp.id + '"]');
  await MO.waitForSelector('#j-go');
  ok('   their name and email are filled in', (await MO.$eval('#j-name', e => e.value)) === 'Mo Member' && (await MO.$eval('#j-email', e => e.value)) === 'mo.member@example.invalid');
  await MO.evaluate(() => { window.__egbcOutbox.length = 0; });
  await tap(MO, '#j-go');
  await MO.waitForSelector('#j-done, #j-err .st');
  if (!(await MO.$('#j-done'))) throw new Error('Mo could not ask: ' + await text(MO, '#j-err'));
  const leaderMail = await until(async () => (await outbox(MO)).find(m => m.to.includes('lena.leader@example.invalid')));
  ok('   the leader is emailed: "Mo Member would like to join Tuesday home group"', leaderMail && /Mo Member would like to join Tuesday home group/.test(leaderMail.subject));

  /* ---------- 4. the leader accepts ---------- */
  const lB = await as('lena'); const LE = lB.page;
  await go(LE, 'groups-admin.html', '[data-tab="requests"]');
  ok('4. the leader sees two requests waiting', /Requests2/.test((await text(LE, '.tabs')).replace(/\s/g, '')));
  await tap(LE, '[data-tab="requests"]');
  await LE.waitForSelector('[data-accept]');
  await LE.evaluate(() => { window.__egbcOutbox.length = 0; });
  const moReq = (await readDb(db => getDocs(query(collection(db, 'smallGroupRequests'), where('personId', '==', 'm_mo'))))).docs[0].id;
  await tap(LE, '[data-accept="' + moReq + '"]');
  await until(async () => (await get('smallGroups', grp.id)).memberCount === 1);
  const moMem = await get('smallGroupMembers', grp.id + '__a_m_mo');
  ok('   accepting Mo: the request, his place and the count, together', moMem && moMem.personKind === 'addressBook' && (await get('smallGroupRequests', moReq)).status === 'accepted');
  const welcome = await until(async () => (await outbox(LE)).find(m => m.to[0] === 'mo.member@example.invalid'));
  ok('   his welcome email has when and the address, now he is a member', welcome && /Welcome to Tuesday home group/.test(welcome.subject) && /1 Invented Road, Esher/.test(welcome.html) && /Tuesdays, 7\.30pm/.test(welcome.html));
  await LE.waitForSelector('[data-accept]');
  await tap(LE, '[data-accept]');
  await until(async () => (await get('smallGroups', grp.id)).memberCount === 2);
  ok('   accepting Gail (a guest) fills the group: 2 of 2', !!(await get('smallGroupMembers', grp.id + '__c_' + gReq.personId)));
  const nB = await as('ned', 375); const NE = nB.page;
  await go(NE, 'groups.html', '[data-g="' + grp.id + '"]');
  ok('   a third person sees "Full"', /Full/.test(await text(NE, '[data-g="' + grp.id + '"]')));
  await tap(NE, '[data-g="' + grp.id + '"]');
  await NE.waitForSelector('#g-join');
  ok('   and there is no way to ask', !(await NE.$('#j-go')));
  const nTry = await NE.evaluate((id) => EGBCAuth.db.collection('smallGroupRequests').add({ groupId: id, groupName: 'x', name: 'Ned', email: 'n@example.invalid', phone: '', message: '',
    personKind: 'addressBook', personId: 'm_ned', status: 'asked', createdAt: firebase.firestore.FieldValue.serverTimestamp() }).then(() => 'asked', e => e.code), grp.id);
  ok('   NOT EVEN ROUND THE PAGE: the rules refuse a request to a full group', /permission/.test(nTry), nTry);

  /* ---------- 5. members, and not ---------- */
  await go(MO, 'groups.html', '#mine [data-g]');
  ok('5. Mo sees "Your groups"', /Your groups Tuesday home group/.test(await text(MO, '#mine')) && /You are in this group/.test(await text(MO, '#mine')));
  await tap(MO, '#mine [data-g="' + grp.id + '"]');
  await MO.waitForSelector('#g-address');
  ok('   and the address', /1 Invented Road, Esher/.test(await text(MO, '#g-address')));
  await hideBanner(MO);
  await MO.screenshot({ path: path.join(HERE, 'c7-your-group-375.png'), fullPage: true });
  const nsneak = await NE.evaluate((id) => Promise.all([EGBCAuth.db.collection('smallGroupPrivate').doc(id).get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('smallGroupMembers').where('groupId', '==', id).get().then(() => 'read', e => e.code)]), grp.id);
  ok('   Ned, not in it, cannot read the address or who is in it', nsneak.every(x => /permission/.test(x)), J(nsneak));

  /* ---------- 6. the leader runs the group ---------- */
  await go(LE, 'groups-admin.html', '[data-tab="members"]'); await tap(LE, '[data-tab="members"]');
  await LE.waitForSelector('[data-remove]');
  ok('6. the leader sees the members', /Gail Guest Guest .*Mo Member/.test(await text(LE, '#m-list')), await text(LE, '#m-list'));
  await tap(LE, '[data-remove="' + grp.id + '__c_' + gReq.personId + '"]');
  await until(async () => (await get('smallGroups', grp.id)).memberCount === 1);
  ok('   and takes Gail out: the count goes down with her', !(await get('smallGroupMembers', grp.id + '__c_' + gReq.personId)));
  await tap(LE, '[data-tab="groups"]'); await LE.waitForSelector('[data-gedit]'); await tap(LE, '[data-gedit="' + grp.id + '"]');
  await LE.waitForSelector('#f-save');
  ok('   the leader edits the group, but not who leads it or whether it is public', !(await LE.$('#f-addlead')) && !(await LE.$('#f-members')));
  await val(LE, '#f-time', '20:00'); await tap(LE, '#f-save');
  await until(async () => (await get('smallGroups', grp.id)).time === '20:00');
  const lTry = await LE.evaluate((id) => EGBCAuth.db.collection('smallGroups').doc(id).update({ leaderIds: ['m_lena', 'm_ned'] }).then(() => 'changed', e => e.code), grp.id);
  ok('   round the page, the rules refuse a leader adding a leader', /permission/.test(lTry), lTry);
  await hideBanner(LE);
  await LE.setViewport({ width: 375, height: 900 });
  await LE.screenshot({ path: path.join(HERE, 'c7-leader-375.png'), fullPage: true });
  await go(NE, 'groups-admin.html', '#noaccess');
  ok('   a member who leads nothing cannot open Small groups', /small groups admins and each group's leaders/.test(await text(NE, '#noaccess')));
  await lB.close(); await mB.close(); await nB.close(); await vB.close();
} catch (e) {
  ok('the run finished', false, e.stack);
  for (const [l, p] of PAGES) { try { console.log('     [' + l + '] ' + p.url() + ' :: ' + (await p.$eval('body', b => b.innerText)).replace(/\s+/g, ' ').slice(0, 600)); } catch (x) {} }
}

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
