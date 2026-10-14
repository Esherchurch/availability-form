/* Invitations (F-187; ChurchSuite's event invitations). Events window.
   Invented people and events only, events emulators only, network guard,
   no email leaves the machine (the outbox is read instead).

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/invites.test.mjs"

   What it proves:
     1. INVITE A TEAM: one email EACH (nobody sees who else was asked), with
        their own "Sign up" and "I can't come" links; someone with no email
        is counted, not lost
     2. CHOSEN PEOPLE and A SMALL GROUP; someone already invited is not asked
        twice
     3. "Sign up" from the email: who they are is filled in, and signing up
        marks the invitation "Coming"
     4. "I can't come" from the email: thanked, and marked "Can't come"
     5. the list: invited, coming, can't come, no reply yet; "Remind" goes
        only to those who have not replied
     6. an invitation's key lets its person answer, and nothing else */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, serverTimestamp } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-invites-'));
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
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = { martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] } };
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const start = new Date(); start.setDate(start.getDate() + 6); start.setHours(18, 0, 0, 0);
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  const A = (id, name, email, markers) => setDoc(doc(db, 'addressBook', id), { name, email, markers, adminFor: [], masterAdmin: false });
  await A('m_ann', 'Ann Welcome (invented)', 'ann@example.invalid', ['Welcome']);
  await A('m_bob', 'Bob Welcome (invented)', 'bob@example.invalid', ['Welcome']);
  await A('m_cat', 'Cat Noemail (invented)', '', ['Welcome']);
  await A('m_dee', 'Dee Chosen (invented)', 'dee@example.invalid', []);
  await A('m_eve', 'Eve Grouped (invented)', 'eve@example.invalid', []);
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'smallGroups', 'sg_x'), { name: 'Tuesday group (invented)', active: true, visibility: 'members', audience: ['members'], leaderIds: [], memberCount: 1 });
  await setDoc(doc(db, 'smallGroupMembers', 'sg_x__a_m_eve'), { groupId: 'sg_x', personKind: 'addressBook', personId: 'm_eve', name: 'Eve Grouped (invented)' });
  await setDoc(doc(db, 'calEvents', 'ev_inv'), { title: 'Harvest lunch (invented)', description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
    featured: false, startLocal: iso(start), startUtc: start.getTime(), endLocal: iso(new Date(start.getTime() + 2 * 3600e3)), endUtc: start.getTime() + 2 * 3600e3, allDay: false,
    location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: true, capacity: 20, allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', createdBy: 'x', updatedAt: 'x' });
  await setDoc(doc(db, 'capacity', 'ev_inv'), { calEventId: 'ev_inv', taken: 0, capacity: 20 });
});
const invites = async () => { let out = []; await env.withSecurityRulesDisabled(async (x) => { out = (await getDocs(collection(x.firestore(), 'eventInvites'))).docs.map(d => ({ key: d.id, ...d.data() })); }); return out; };

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
const outbox = (p) => p.evaluate(() => (window.__egbcOutbox || []).map(e => e.payload).filter(Boolean));
const openInvites = async (M) => {
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('.open[data-id="ev_inv"]'));
  await M.$eval('.open[data-id="ev_inv"]', e => e.click());
  await until(() => M.$('[data-tab="invites"]'));
  await M.$eval('[data-tab="invites"]', e => e.click());
  await until(() => M.$('#invSend'));
};
const linkIn = (html, key, no) => { const m = html.match(new RegExp('href="([^"]*invite=' + key + (no ? '&amp;reply=no' : '') + ')"')); return m ? m[1].replace(/&amp;/g, '&') : ''; };

try {
  const M = await browser('martin');
  await openInvites(M);
  /* ---------- 1. a team ---------- */
  await M.$eval('input[name="invKind"][value="team"]', r => r.click());
  await until(() => M.$('#invTeam'));
  await M.select('#invTeam', 'Welcome');
  await M.evaluate(() => { window.__egbcOutbox.length = 0; });
  await M.$eval('#invSend', b => b.click());
  await until(async () => (await invites()).length === 2);
  const sent1 = await until(async () => { const o = await outbox(M); return o.length >= 2 ? o : null; });
  const inv1 = await invites();
  ok('1. A TEAM: one invitation each to the two with an email, one email each', inv1.length === 2 && sent1.length === 2 && sent1.every(m => m.to.length === 1) &&
    J(sent1.map(m => m.to[0]).sort()) === '["ann@example.invalid","bob@example.invalid"]', J(sent1.map(m => m.to)));
  ok('   "You are invited", with their own Sign up and I can\'t come links', sent1.every(m => /^You are invited: Harvest lunch/.test(m.subject)) &&
    inv1.every(i => { const m = sent1.find(x => x.to[0] === i.email); return m && linkIn(m.html, i.key) && linkIn(m.html, i.key, true); }), sent1[0] && sent1[0].html.slice(0, 600));
  ok('   someone with no email is counted, not lost', /1 had no email address/.test(await M.evaluate(() => document.getElementById('toast').textContent)));

  /* ---------- 2. chosen people, a small group, nobody twice ---------- */
  await until(() => M.$('input[name="invKind"][value="people"]'));
  await M.$eval('input[name="invKind"][value="people"]', r => r.click());
  await until(() => M.$('#invWho'));
  for (const n of ['Dee Chosen (invented)', 'Ann Welcome (invented)']) {
    await M.$eval('#invWho', (e, n) => { e.value = n; }, n);
    await M.$eval('#invAdd', b => b.click());
    await until(() => M.$('#invWho'));
  }
  await M.evaluate(() => { window.__egbcOutbox.length = 0; });
  await M.$eval('#invSend', b => b.click());
  await until(async () => (await invites()).length === 3);
  await sleep(800);
  const sent2 = await outbox(M);
  ok('2. CHOSEN PEOPLE: Dee invited, and Ann, invited already, is not asked twice', sent2.length === 1 && sent2[0].to[0] === 'dee@example.invalid', J(sent2.map(m => m.to)));
  await until(() => M.$('input[name="invKind"][value="group"]'));
  await M.$eval('input[name="invKind"][value="group"]', r => r.click());
  await until(() => M.$('#invGroup'));
  await M.select('#invGroup', 'sg_x');
  await M.evaluate(() => { window.__egbcOutbox.length = 0; });
  await M.$eval('#invSend', b => b.click());
  await until(async () => (await invites()).length === 4);
  ok('   A SMALL GROUP: its member Eve is invited', (await invites()).some(i => i.email === 'eve@example.invalid' && i.memberId === 'm_eve'));

  /* ---------- 3. "Sign up" from Ann's email ---------- */
  const all = await invites(), ann = all.find(i => i.email === 'ann@example.invalid'), bob = all.find(i => i.email === 'bob@example.invalid');
  const annMail = sent1.find(m => m.to[0] === 'ann@example.invalid'), bobMail = sent1.find(m => m.to[0] === 'bob@example.invalid');
  const G = await browser('guest', 390);
  await G.goto(linkIn(annMail.html, ann.key), { waitUntil: 'networkidle2' });
  await G.waitForSelector('#nm');
  ok('3. SIGN UP FROM THE EMAIL: who they are is filled in', (await G.$eval('#nm', e => e.value)) === 'Ann Welcome (invented)' && (await G.$eval('#em', e => e.value)) === 'ann@example.invalid');
  await sleep(2700);
  await G.$eval('#go', b => b.click());
  await G.waitForFunction(() => /You are signed up/.test(document.body.innerText), { timeout: 15000 });
  const annNow = await until(async () => { const i = (await invites()).find(x => x.key === ann.key); return i && i.response === 'yes' ? i : null; });
  ok('   and signing up marks the invitation Coming, with the sign-up it led to', annNow && /^[A-Za-z0-9]{20,}$/.test(annNow.signupKey), J(annNow));

  /* ---------- 4. "I can't come" from Bob's email ---------- */
  const B = await browser('guest2', 390);
  await B.goto(linkIn(bobMail.html, bob.key, true), { waitUntil: 'networkidle2' });
  await until(() => B.$('#invNo'));
  ok('4. I CAN\'T COME: thanked, and still able to sign up', /letting us know you can.t come/.test(await text(B, '#invNo')) && !!(await B.$('#go')));
  ok('   marked "Can\'t come"', !!(await until(async () => (await invites()).find(x => x.key === bob.key && x.response === 'no'))));
  await B.screenshot({ path: path.join(HERE, 'invite-cant-come-390.png'), fullPage: true });

  /* ---------- 5. the list, and reminding ---------- */
  await openInvites(M);
  await until(async () => /4 invited/.test(await text(M, '#invCounts')));
  ok('5. THE LIST: 4 invited · 1 coming · 1 can\'t come · 2 no reply yet', /4 invited · 1 coming · 1 can't come · 2 no reply yet/.test(await text(M, '#invCounts')), await text(M, '#invCounts'));
  ok('   each with its reply', /Coming/.test(await text(M, 'tr[data-inv="' + ann.key + '"]')) && /Can't come/.test(await text(M, 'tr[data-inv="' + bob.key + '"]')));
  await M.screenshot({ path: path.join(HERE, 'invites-list.png'), fullPage: true });
  await M.evaluate(() => { window.__egbcOutbox.length = 0; });
  await M.$eval('#invRemind', b => b.click());
  const rem = await until(async () => { const o = await outbox(M); return o.length >= 2 ? o : null; });
  await sleep(800);
  ok('   REMIND: only the two who have not replied', (await outbox(M)).length === 2 && J(rem.map(m => m.to[0]).sort()) === '["dee@example.invalid","eve@example.invalid"]' && rem.every(m => /^A reminder: Harvest lunch/.test(m.subject)), J(rem.map(m => [m.to, m.subject])));

  /* ---------- 6. what a key allows ---------- */
  const guestDb = env.unauthenticatedContext().firestore();
  let changed = 'allowed';
  /* A proper answer, AND a new name: only the rule that allows the answer alone stops it. */
  try { await updateDoc(doc(guestDb, 'eventInvites', bob.key), { name: 'Someone else', response: 'no', respondedAt: serverTimestamp(), signupKey: '' }); } catch (e) { changed = 'refused'; }
  let listed = 'allowed';
  try { await getDocs(collection(guestDb, 'eventInvites')); } catch (e) { listed = 'refused'; }
  ok('6. A KEY LETS ITS PERSON ANSWER, NOTHING ELSE: not change the name, nor list the others', changed === 'refused' && listed === 'refused', changed + ' / ' + listed);

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
