/* Chunk 7, stage 2 — small groups: meetings and notes, the register,
   messaging the group, members leaving, leaders' pictures, under-18s
   groups and leader checks, oversight.
   Events window. Invented people only, events emulators only, network
   guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/c7-stage2.test.mjs"

   What it proves:
     1. the leader writes the next meeting's study plan and takes the
        register on a phone (members ticked, guests counted)
     2. the leader messages the group: one email to each member, and the
        message kept for the group
     3. a member sees what is coming up and the messages, not the register;
        and leaves the group themselves
     4. the leader puts up the group's picture
     5. an under-18s group shows its leader's checks: not cleared, then
        cleared once a master admin records them
     6. oversight for the groups admins: every group, how many usually come,
        and the people in no group
     7. who came, downloaded (and logged) */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-c7b-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const PIC = path.join(TMP, 'group.png'); fs.copyFileSync(path.join(V2, 'icon-192.png'), PIC);

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }
const pad = (n) => (n < 10 ? '0' : '') + n;
const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); })();

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
  pat:   { email: 'pat.member@example.invalid', name: 'Pat Member', mid: 'm_pat', teams: ['Welcome Team'] },
  ned:   { email: 'ned.member@example.invalid', name: 'Ned Member', mid: 'm_ned', teams: ['Welcome Team'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const MEM = (pid, name, email) => ({ groupId: 'sg_youth', personKind: 'addressBook', personId: pid, name, email, phone: '', joinedAt: 'x', addedBy: 'x' });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.admin });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: !!x.admin, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'groupsSettings', 'main'), { teams: ['Core Team'] });
  await setDoc(doc(db, 'smallGroups', 'sg_youth'), { name: 'Tuesday youth group', type: 'Youth', description: 'Games and a talk (invented).', day: 2, time: '19:00', frequency: 'weekly',
    locationKind: 'home', area: 'Esher', audience: 'Years 7 to 9', open: true, capacity: 0, memberCount: 2, visibility: 'public', active: true, under18: true,
    leaderIds: ['m_lena'], leaderNames: ['Lena Leader'], image: '' });
  await setDoc(doc(db, 'smallGroupPrivate', 'sg_youth'), { address: '2 Invented Close, Esher', meetingLink: '', notes: '' });
  await setDoc(doc(db, 'smallGroupMembers', 'sg_youth__a_m_mo'), MEM('m_mo', 'Mo Member', 'mo.member@example.invalid'));
  await setDoc(doc(db, 'smallGroupMembers', 'sg_youth__a_m_pat'), MEM('m_pat', 'Pat Member', 'pat.member@example.invalid'));
  /* Three earlier registers, for oversight. */
  for (const [d, n] of [['2026-09-01', 2], ['2026-09-08', 1], ['2026-09-15', 2]]) {
    await setDoc(doc(db, 'smallGroupAttendance', 'sg_youth__' + d), { groupId: 'sg_youth', date: d, present: n === 2 ? ['sg_youth__a_m_mo', 'sg_youth__a_m_pat'] : ['sg_youth__a_m_mo'], guests: 0, count: n, updatedAt: 'x', updatedBy: 'x' });
  }
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
  /* ---------- 1. meetings and the register ---------- */
  const lB = await as('lena', 375); const LE = lB.page;
  await go(LE, 'groups-admin.html', '[data-tab="meetings"]'); await tap(LE, '[data-tab="meetings"]');
  await LE.waitForSelector('[data-meet] .pill.wait');
  const next = await LE.$eval('[data-meet] .pill.wait', e => e.closest('[data-meet]').dataset.meet);
  ok('1. the leader sees the next meeting on the group\'s day', new Date(next + 'T12:00').getDay() === 2 && next >= TODAY, next);
  await tap(LE, '[data-notes="' + next + '"]'); await LE.waitForSelector('#nt-save');
  await val(LE, '#nt-notes', 'Study: Mark 4, the sower (invented). Bring a snack.'); await tap(LE, '#nt-save');
  const meet = await until(() => get('smallGroupMeetings', 'sg_youth__' + next));
  ok('   writes its study plan', meet && /Mark 4/.test(meet.notes) && meet.cancelled === false);
  await LE.waitForSelector('[data-reg="' + next + '"]'); await tap(LE, '[data-reg="' + next + '"]'); await LE.waitForSelector('#rg-save');
  ok('   the register lists the members, one tick each', J(await LE.$$eval('.rg-tick', x => x.map(e => e.value))) === J(['sg_youth__a_m_mo', 'sg_youth__a_m_pat']));
  await check(LE, '.rg-tick[value="sg_youth__a_m_mo"]', true); await val(LE, '#rg-guests', '1');
  await hideBanner(LE);
  await LE.screenshot({ path: path.join(HERE, 'c7-register-375.png'), fullPage: true });
  await tap(LE, '#rg-save');
  const reg = await until(() => get('smallGroupAttendance', 'sg_youth__' + next));
  ok('   takes the register: Mo and a guest, 2 came', reg && J(reg.present) === J(['sg_youth__a_m_mo']) && reg.guests === 1 && reg.count === 2, J(reg));

  /* ---------- 2. message the group ---------- */
  await tap(LE, '[data-tab="message"]'); await LE.waitForSelector('#ms-send');
  await LE.evaluate(() => { window.__egbcOutbox.length = 0; });
  await val(LE, '#ms-subject', 'Tuesday: bring a snack'); await val(LE, '#ms-body', 'See you at 7 (invented).');
  await tap(LE, '#ms-send');
  const msg = await until(async () => (await readDb(db => getDocs(query(collection(db, 'smallGroupMessages'), where('groupId', '==', 'sg_youth'))))).docs.map(d => d.data())[0]);
  const mails = await outbox(LE);
  ok('2. one email to each member, each to them alone', mails.length === 2 && mails.every(m => m.to.length === 1) && J(mails.map(m => m.to[0]).sort()) === J(['mo.member@example.invalid', 'pat.member@example.invalid'])
    && mails[0].replyTo === 'lena.leader@example.invalid', J(mails.map(m => [m.to, m.replyTo])));
  ok('   and the message is kept for the group', msg && msg.subject === 'Tuesday: bring a snack' && msg.recipients === 2 && msg.sentBy === P.lena.uid);

  /* ---------- 3. a member ---------- */
  const mB = await as('mo', 375); const MO = mB.page;
  await go(MO, 'groups.html?group=sg_youth', '[data-up]');
  ok('3. Mo sees what is coming up, with the study plan', (await text(MO, '[data-up="' + next + '"]')).includes('Mark 4'));
  ok('   and the message', /Tuesday: bring a snack .*See you at 7/.test(await text(MO, '#g-join')));
  const moSneak = await MO.evaluate(() => EGBCAuth.db.collection('smallGroupAttendance').where('groupId', '==', 'sg_youth').get().then(() => 'read', e => e.code));
  ok('   but not the register, even round the page', /permission/.test(moSneak), moSneak);
  await hideBanner(MO);
  await MO.screenshot({ path: path.join(HERE, 'c7-member-view-375.png'), fullPage: true });
  await tap(MO, '#g-leave');
  await MO.waitForSelector('#g-left');
  await until(async () => (await get('smallGroups', 'sg_youth')).memberCount === 1);
  ok('   MO LEAVES THE GROUP HIMSELF: his place goes, and the count with it', !(await get('smallGroupMembers', 'sg_youth__a_m_mo')));
  ok('   and it is no longer one of his groups', !/Tuesday youth group/.test(await text(MO, '#mine')));
  const moAfter = await MO.evaluate(() => EGBCAuth.db.collection('smallGroupPrivate').doc('sg_youth').get().then(() => 'read', e => e.code));
  ok('   nor can he read the address any more', /permission/.test(moAfter), moAfter);

  /* ---------- 4. the leader's picture ---------- */
  await tap(LE, '[data-tab="groups"]'); await LE.waitForSelector('[data-gedit="sg_youth"]'); await tap(LE, '[data-gedit="sg_youth"]');
  await LE.waitForSelector('#f-image');
  await (await LE.$('#f-image')).uploadFile(PIC);
  await tap(LE, '#f-save');
  ok('4. the leader puts up the group\'s picture', !!(await until(async () => /smallGroups/.test((await get('smallGroups', 'sg_youth')).image || ''), 25000)));

  /* ---------- 5. under-18s: the leaders' checks ---------- */
  const gB = await as('gina'); const GI = gB.page;
  await go(GI, 'groups-admin.html', '[data-check="m_lena"]');
  ok('5. an under-18s group shows its leader\'s checks: DBS and training missing', /Lena Leader: DBS missing, training missing/.test(await text(GI, '[data-checks="sg_youth"]')) && !!(await GI.$('[data-checks-short="1"]')),
    await text(GI, '[data-checks="sg_youth"]'));
  ok('   and points to the leader declaration on Forms', !!(await GI.$('[data-checks="sg_youth"] a[href="forms-admin.html"]')));
  const kB = await as('karen'); const KA = kB.page;
  await go(KA, 'groups-admin.html', '[data-record="m_lena"]'); await tap(KA, '[data-record="m_lena"]'); await KA.waitForSelector('#rc-save');
  await KA.select('#rc-dbs', 'current'); await val(KA, '#rc-seen', TODAY); await val(KA, '#rc-train', TODAY); await tap(KA, '#rc-save');
  await until(async () => (await get('leaderChecks', 'm_lena') || {}).dbsStatus === 'current');
  await go(GI, 'groups-admin.html', '[data-check="m_lena"]');
  ok('   a master admin records her checks: she is cleared', /Lena Leader: DBS ok, training ok/.test(await text(GI, '[data-checks="sg_youth"]')) && !(await GI.$('[data-checks-short]')), await text(GI, '[data-checks="sg_youth"]'));
  await kB.close();

  /* ---------- 6. oversight ---------- */
  await tap(GI, '[data-tab="oversight"]'); await GI.waitForSelector('[data-ov="sg_youth"]');
  const row = await text(GI, '[data-ov="sg_youth"]');
  ok('6. oversight: every group, its members, when it last met, how many usually come', /Tuesday youth group Under-18s 1 Lena Leader/.test(row) && row.includes('1.8'), row);
  await GI.waitForSelector('#ov-none-n');
  const none = await GI.$$eval('[data-none]', x => x.map(e => e.dataset.none));
  ok('   and the people in no group (Mo, now he has left; not Pat or Lena)', none.includes('m_mo') && none.includes('m_ned') && !none.includes('m_pat') && !none.includes('m_lena'), J(none));
  await hideBanner(GI);
  await GI.setViewport({ width: 375, height: 900 });
  await GI.screenshot({ path: path.join(HERE, 'c7-oversight-375.png'), fullPage: true });
  const nB = await as('ned'); const NE = nB.page;
  const nedSneak = await NE.evaluate(() => EGBCAuth.db.collection('smallGroupAttendance').get().then(() => 'read', e => e.code));
  ok('   someone who leads nothing cannot see the registers', /permission/.test(nedSneak), nedSneak);

  /* ---------- 7. who came, downloaded ---------- */
  await go(LE, 'groups-admin.html', '[data-tab="meetings"]'); await tap(LE, '[data-tab="meetings"]'); await LE.waitForSelector('#dl-csv');
  await val(LE, '#dl-from', '2026-01-01'); await val(LE, '#dl-to', '2099-01-01');
  await tap(LE, '#dl-csv');
  const logged = await until(async () => (await readDb(db => getDocs(query(collection(db, 'downloadsLog'), where('by', '==', P.lena.uid))))).docs.map(d => d.data())[0]);
  ok('7. who came downloads, and the download is logged in the leader\'s name', logged && /Who came: Tuesday youth group/.test(logged.what) && logged.calEventId === 'group_sg_youth', J(logged));
  await lB.close(); await mB.close(); await gB.close(); await nB.close();
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
