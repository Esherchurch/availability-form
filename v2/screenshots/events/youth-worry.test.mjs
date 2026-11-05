/* "I'M WORRIED" FROM THE YOUTH HUB, START TO FINISH (Martin, 5 Nov 2026: a
   going-live stopper for youth, built for any church). Events window.
   Invented people only, events emulators only, locked rules, network guard.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,functions \
       --project egbc-worship-planner "node screenshots/events/youth-worry.test.mjs"

   What it proves, at 375 and at 1440:
     1. the Youth Hub shows "I'm worried" with Childline 0800 1111 and 999
     2. a made-up young person sends one about themselves, then one about
        someone else: each becomes a concern on the lead's building, with
        their first name only, and they are told it was sent
     3. the lead and the deputy are told one has come in - their phones and
        nobody else's: not the office, not the master admin, not the sender
     4. the lead and the deputy read it on the safeguarding page
     5. nobody else sees what was written: the master admin, the office, a
        volunteer and the young person themselves - on the page, and asking
        the database directly
     6. the young person still cannot write a concern themselves (the rules
        are not loosened for youth accounts)
     7. with a deputy but no lead, or a lead but no deputy: it is accepted,
        and that one alone is told and reads it
     8. with neither set: nothing is written, the page says so in words, and
        Childline and 999 still show */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-yw-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const SIZES = [[375, 812], [1440, 900]];

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

const SITE = 's_hild';
const P = {
  yan: { email: 'yan.youth@example.invalid', youth: true },
  lea: { email: 'lea.lead@example.invalid', name: 'Lea Lead (invented)', mid: 'm_lea', teams: [], adminFor: [] },
  dee: { email: 'dee.deputy@example.invalid', name: 'Dee Deputy (invented)', mid: 'm_dee', teams: [], adminFor: [] },
  max: { email: 'max.master@example.invalid', name: 'Max Master (invented)', mid: 'm_max', teams: [], adminFor: [], master: true },
  ola: { email: 'ola.office@example.invalid', name: 'Ola Office (invented)', mid: 'm_ola', teams: ['Office'], adminFor: ['Office'] },
  vic: { email: 'vic.volunteer@example.invalid', name: 'Vic Volunteer (invented)', mid: 'm_vic', teams: ['Youth Worship'], adminFor: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
/* the young person's code, as youth-redeem leaves it: the claim, and their record (first name only) */
await fetch(`http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
  body: JSON.stringify({ localId: P.yan.uid, customAttributes: JSON.stringify({ youth: true }) }) });
const LEADS = { safeguardingLead: 'm_lea', safeguardingDeputy: 'm_dee' };
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P).filter((k) => !P[k].youth)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor, masterAdmin: !!x.master, status: 'active' });
  }
  await setDoc(doc(db, 'youthAccess', P.yan.uid), { active: true, expiresAt: new Date(Date.now() + 30 * 86400000), memberName: 'Yan Youth', firstName: 'Yan', memberId: 'm_yan', groups: ['Youth Worship'] });
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'St Hild, Testbury (a synthetic C of E parish)', enquiryEmail: 'office@example.invalid' });
  await setDoc(doc(db, 'sites', SITE), { name: 'St Hild (synthetic)', active: true });
  await setDoc(doc(db, 'bookingSettings', SITE), Object.assign({ name: 'St Hild (synthetic)' }, LEADS));
  await setDoc(doc(db, 'safeguardingSettings', 'defaults'), { leadSiteId: SITE });
  await setDoc(doc(db, 'teams', 'Youth Worship'), { name: 'Youth Worship', label: 'Youth', rota: true, order: 1, under18: true });
  /* sending switched on, and everybody with a phone: the emulator writes each push to pushOutbox */
  await setDoc(doc(db, 'churchSettings', 'notifications'), { live: true });
  for (const k of Object.keys(P)) await setDoc(doc(db, 'pushTokens', P[k].uid + '_phone'), { uid: P[k].uid, token: 'tok-' + k, platform: 'android', createdAt: new Date(), lastSeen: new Date() });
});
const readDb = async (fn) => { let out; await env.withSecurityRulesDisabled(async (c) => { out = await fn(c.firestore()); }); return out; };
const all = (name) => readDb((db) => getDocs(collection(db, name)).then((q) => q.docs.map((d) => Object.assign({ id: d.id }, d.data()))));
const setLeads = (v) => readDb((db) => updateDoc(doc(db, 'bookingSettings', SITE), v));
const errors = [], BROWSERS = [];
async function as(who, w, h) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); BROWSERS.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); localStorage.setItem('egbc_youth_hub_toured_home', '1'); localStorage.setItem('egbc_youth_hub_toured_worry', '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
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
const hub = async (p) => { await p.goto(URLB + 'youthapp2.html', { waitUntil: 'networkidle2' }); await until(() => p.$('#worry-open')); await sleep(600); };
/* pressed as a person would: the button where it is drawn, on screen */
const press = async (p, sel) => { const e = await p.$(sel); await e.evaluate((x) => x.scrollIntoView({ block: 'center' })); await e.click(); };
const said = (p) => until(() => p.evaluate(() => { const t = document.getElementById('worry-said').textContent; return t && t !== 'Sending…' ? t : ''; }), 20000);
async function send(p, about, text, name) {
  await hub(p);
  await press(p, '#worry-open');
  await until(() => p.evaluate(() => document.getElementById('section-worry').classList.contains('active')));
  if (about === 'someone') { await press(p, 'input[name="worry-who"][value="someone"]'); await until(() => p.$('#worry-name:not([hidden])')); await p.type('#worry-name', name); }
  await p.type('#worry-text', text);
  await press(p, '#worry-send');
  return said(p);
}
const sgText = async (p) => { await p.goto(URLB + 'safeguarding.html', { waitUntil: 'networkidle2' }); await until(() => p.$('#concernBtn, #egbc-blocked-card')); await sleep(1200); return p.evaluate(() => document.body.innerText); };
const readConcerns = (p) => p.evaluate(() => EGBCAuth.db.collection('concerns').where('siteId', '==', 's_hild').get().then((q) => 'read ' + q.size, (e) => e.code));

try {
  for (const [w, h] of SIZES) {
    const at = ' (' + w + ')';
    const before = (await all('concerns')).length, pushedBefore = (await all('pushOutbox')).length;
    const Y = await as('yan', w, h);
    await hub(Y);
    const card = await Y.evaluate(() => { const c = document.getElementById('worry-card'); const r = c.getBoundingClientRect(); return { text: c.innerText, w: r.width, vw: innerWidth, top: r.top }; });
    ok('1. THE YOUTH HUB shows "I\'m worried", with Childline 0800 1111 and 999' + at, /I.m worried/.test(card.text) && /0800 1111/.test(card.text) && /999/.test(card.text) && card.w <= card.vw, JSON.stringify(card));

    const me = 'Synthetic test ' + w + ': I am worried about something at home.';
    const s1 = await send(Y, 'me', me);
    ok('2. A YOUNG PERSON sends one about themselves, and is told it was sent' + at, /^Sent\./.test(s1 || ''), s1);
    const other = 'Synthetic test ' + w + ': my friend said something worrying.';
    const s2 = await send(Y, 'someone', other, 'Sam (synthetic)');
    ok('   and one about someone else' + at, /^Sent\./.test(s2 || ''), s2);
    const got = (await all('concerns')).slice();
    const c1 = got.find((c) => c.concern === me), c2 = got.find((c) => c.concern === other);
    ok('   each is a concern on the lead\'s building, first name only, from the young person' + at,
      got.length === before + 2 && c1 && c2 && c1.siteId === SITE && c1.about === 'Themselves' && c2.about === 'Sam (synthetic)'
      && c1.reportedBy === P.yan.uid && /^Yan \(a young person/.test(c1.reportedByName) && !/Youth\b(?! Hub)/.test(c1.reportedByName) && c1.status === 'new', JSON.stringify(got));

    const pushes = await until(async () => { const x = (await all('pushOutbox')).slice(pushedBefore); return x.length >= 2 ? x : null; }, 20000) || (await all('pushOutbox')).slice(pushedBefore);
    await sleep(1500);
    const toks = (await all('pushOutbox')).slice(pushedBefore).flatMap((x) => x.tokens || []);
    ok('3. THE LEAD AND THE DEPUTY are told on their phones' + at, toks.includes('tok-lea') && toks.includes('tok-dee'), JSON.stringify(toks));
    ok('   and nobody else: not the office, the master admin, the volunteer or the sender' + at, toks.every((t) => t === 'tok-lea' || t === 'tok-dee'), JSON.stringify(toks));
    ok('   told which kind only, never the words' + at, !JSON.stringify(pushes).includes('worried about something') && !JSON.stringify(pushes).includes('Sam'), JSON.stringify(pushes).slice(0, 300));

    for (const k of ['lea', 'dee']) {
      const L = await as(k, w, h);
      const t = await sgText(L);
      ok('4. THE ' + (k === 'lea' ? 'LEAD' : 'DEPUTY') + ' reads both on the safeguarding page' + at, t.includes(me) && t.includes(other) && /Yan \(a young person/.test(t), t.slice(0, 300));
    }
    for (const k of ['max', 'ola', 'vic', 'yan']) {
      const O = await as(k, w, h);
      const t = await sgText(O);
      const r = await readConcerns(O);
      ok('5. ' + { max: 'THE MASTER ADMIN', ola: 'THE OFFICE', vic: 'A VOLUNTEER', yan: 'THE YOUNG PERSON' }[k] + ' sees none of it, and the database refuses them' + at,
        !t.includes(me) && !t.includes(other) && /permission/.test(r), r + ' | ' + t.slice(0, 200));
    }
    const direct = await Y.evaluate((u) => EGBCAuth.db.collection('concerns').doc('con_direct_' + Date.now()).set({ siteId: 's_hild', calEventId: '', about: '', concern: 'x', reportedBy: u, reportedByName: 'Yan', createdAt: new Date().toISOString(), status: 'new' }).then(() => 'written', (e) => e.code), P.yan.uid);
    ok('6. THE YOUNG PERSON still cannot write a concern themselves' + at, /permission/.test(direct), direct);

    /* 7: only one of them set - it is accepted and goes to that one alone */
    for (const [only, k] of [[{ safeguardingLead: '', safeguardingDeputy: 'm_dee' }, 'dee'], [{ safeguardingLead: 'm_lea', safeguardingDeputy: '' }, 'lea']]) {
      const who = k === 'dee' ? 'A DEPUTY BUT NO LEAD' : 'A LEAD BUT NO DEPUTY';
      await setLeads(only);
      /* NEW PHONES FOR THIS PASS. A care push names no concern, and one from
         an earlier step can land late (the events window's runs: 43/44, then
         42/44 even after waiting for a quiet outbox). Pushes sent before now
         went to the old tokens, so only this pass's tokens count. */
      const pass = '-' + k + w;
      await readDb((db) => Promise.all(['lea', 'dee'].map((x) => setDoc(doc(db, 'pushTokens', P[x].uid + '_phone'),
        { uid: P[x].uid, token: 'tok-' + x + pass, platform: 'android', createdAt: new Date(), lastSeen: new Date() }))));
      const tok = 'tok-' + k + pass, other = 'tok-' + (k === 'dee' ? 'lea' : 'dee') + pass;
      const words = 'Synthetic test ' + w + ': only the ' + (k === 'dee' ? 'deputy' : 'lead') + ' is set.';
      const s = await send(Y, 'me', words);
      const c = (await all('concerns')).find((x) => x.concern === words);
      ok('7. WITH ' + who + ' it is accepted, and written on the building' + at, /^Sent\./.test(s || '') && c && c.siteId === SITE, s + ' | ' + JSON.stringify(c || null));
      const toks = async () => (await all('pushOutbox')).flatMap((x) => x.tokens || []);
      await until(async () => (await toks()).includes(tok), 20000);
      await sleep(3000);
      const t7 = (await toks()).filter((t) => t.endsWith(pass));
      ok('   and only ' + (k === 'dee' ? 'the deputy' : 'the lead') + ' is told' + at, t7.includes(tok) && !t7.includes(other), JSON.stringify(t7));
      const R = await as(k, w, h);
      ok('   who reads it on the safeguarding page' + at, (await sgText(R)).includes(words));
    }

    /* 8 */
    await setLeads({ safeguardingLead: '', safeguardingDeputy: '' });
    const n0 = (await all('concerns')).length;
    const s3 = await send(Y, 'me', 'Synthetic test ' + w + ': nobody to send to.');
    const help = await Y.evaluate(() => document.getElementById('section-worry').innerText);
    ok('8. WITH NEITHER A LEAD NOR A DEPUTY nothing is written, the page says so, and Childline and 999 still show' + at,
      (await all('concerns')).length === n0 && /Nobody is set up to receive this/.test(s3 || '') && /0800 1111/.test(help) && /999/.test(help), s3 + ' | ' + help.slice(0, 200));
    await setLeads(LEADS);
    /* step 7's phones back to the ones step 3 checks at the next size */
    await readDb((db) => Promise.all(['lea', 'dee'].map((x) => setDoc(doc(db, 'pushTokens', P[x].uid + '_phone'),
      { uid: P[x].uid, token: 'tok-' + x, platform: 'android', createdAt: new Date(), lastSeen: new Date() }))));
    for (const b of BROWSERS.splice(0)) await b.close().catch(() => {});
  }
} catch (e) {
  ok('the run finished', false, e.stack);
}

ok('nothing came back from outside the allowed sites, and no service worker started', GUARD.leaks().length === 0, GUARD.leaks().join(' | '));
ok('no page threw an error', errors.length === 0, errors.join(' | '));
for (const b of BROWSERS) await b.close().catch(() => {});
await env.cleanup(); server.close();
const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
