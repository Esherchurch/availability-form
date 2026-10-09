/* Who can come (Martin, NEXT-BRIEF §21) — events, small groups and forms
   say who they are for: Everyone, Attenders, Church members only, or a
   team. Members-only things are hidden from those who can't come, never
   shown locked.
   Events window. Invented people only, events emulators only, network
   guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/who-can-come.test.mjs"

   What it proves:
     1. an admin gives an event "Church members only"
     2. What's on: a visitor sees the public event; an Attender sees the
        Attenders one too, but NOT the Church-members-only one, not even
        locked; a Church member sees it, labelled
     3. an Attender opening the members-only event's link learns nothing
        about it
     4. small groups: a groups admin makes a Church-members-only group; an
        Attender never sees it; a Church member does
     5. a Church-members-only form: a visitor is asked to sign in, an
        Attender is told it isn't for them, a Church member fills it in */

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
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-who-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }
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

/* Attenders are in the address book; the office ticks Church members. */
const P = {
  karen: { email: 'karen.admin@example.invalid', name: 'Karen Admin', mid: 'm_karen', admin: true, teams: ['Core Team'] },
  ann:   { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] },
  cath:  { email: 'cath.member@example.invalid', name: 'Cath Member', mid: 'm_cath', teams: [], churchMember: true }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const T = Date.now() + 10 * 864e5;
const EV = (title, visibility, audience) => ({ title, description: '', category: 'social', labels: [], visibility, status: 'confirmed', audience, teams: [], featured: false,
  startLocal: iso(new Date(T)), startUtc: T, endLocal: iso(new Date(T + 2 * 3600e3)), endUtc: T + 2 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: false, image: '', createdBy: 'x', updatedAt: 'x' });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.admin, churchMember: !!x.churchMember });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.admin,
      attender: true, churchMember: !!x.churchMember, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'calEvents', 'ev_pub'), EV('Test Open Picnic', 'public', ['public', 'members']));
  await setDoc(doc(db, 'calEvents', 'ev_att'), EV('Test Attenders Lunch', 'members', ['members']));
  await setDoc(doc(db, 'groupsSettings', 'main'), { teams: ['Core Team'] });
  await setDoc(doc(db, 'smallGroups', 'sg_pub'), { name: 'Test Open Group', type: 'Home group', day: 2, time: '19:30', frequency: 'weekly', locationKind: 'home', area: 'Esher',
    open: true, capacity: 0, memberCount: 0, visibility: 'public', canCome: ['public', 'members'], active: true, leaderIds: ['m_karen'], leaderNames: ['Karen Admin'] });
  await setDoc(doc(db, 'forms', 'form_cm'), { title: 'Test members\u2019 meeting reply', purpose: 'For the members\u2019 meeting (invented).', siteId: '', team: '', who: 'churchMembers',
    canCome: ['churchMembers'], fields: [{ id: 'q1', type: 'text', label: 'Will you come?', required: true }], validity: { mode: 'months', months: 12 }, retentionMonths: 12, version: 1, kind: 'other' });
  for (const k of ['req_who_guest', 'req_who_ann', 'req_who_cath']) {
    await setDoc(doc(db, 'formRequests', k.padEnd(32, '0')), { formId: 'form_cm', formTitle: 'Test members\u2019 meeting reply', calEventId: '', eventTitle: '', eventStart: '', signupKey: '',
      personKind: '', personId: '', name: 'Someone', email: k === 'req_who_cath' ? 'cath.member@example.invalid' : 'x@example.invalid', subjects: [], siteId: '', status: 'sent', reuseOf: '', sentAt: 'x', reminders: [] });
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
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));

try {
  /* ---------- 1. an admin: Church members only ---------- */
  const kB = await as('karen'); const KA = kB.page;
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'calEvents', 'ev_cm'), { ...EV('Test Church Members Meeting', 'members', ['members']), createdBy: P.karen.uid });
  });
  await go(KA, 'events-admin.html', 'button.open[data-id="ev_cm"]');
  await tap(KA, 'button.open[data-id="ev_cm"]'); await KA.waitForSelector('#f_vis');
  ok('1. "Who can come": Everyone, Attenders, Church members only, a team', J(await KA.$$eval('#f_vis option', o => o.map(x => x.textContent))) === J(['Everyone', 'Attenders (signed in)', 'Church members only', 'One or more teams']));
  await KA.select('#f_vis', 'churchMembers');
  const saveSel = (await KA.$('#save')) ? '#save' : '#f_save';
  await tap(KA, saveSel);
  const cm = await until(async () => { const e = await get('calEvents', 'ev_cm'); return e && e.visibility === 'churchMembers' ? e : null; });
  ok('   saved as Church members only, and only they are its audience', cm && J(cm.audience) === J(['churchMembers']), J(cm && cm.audience));

  /* ---------- 2. What's on ---------- */
  const vB = await launch('visitor'); const VI = await pageOf(vB, 'visitor', 375);
  await go(VI, 'whatson.html', '.ev');
  const vt = await text(VI, '#list');
  ok('2. a visitor sees the public event only', /Test Open Picnic/.test(vt) && !/Attenders Lunch|Church Members Meeting/.test(vt), vt);
  const aB = await as('ann', 375); const AN = aB.page;
  await go(AN, 'whatson.html', '.ev');
  await sleep(500);
  const at = await text(AN, 'body');
  ok('   AN ATTENDER SEES THE ATTENDERS EVENT BUT NOT THE CHURCH-MEMBERS-ONLY ONE, not even locked', /Test Attenders Lunch/.test(at) && !/Church Members Meeting|members only|locked/i.test(at), at.slice(0, 400));
  const cB = await as('cath', 375); const CA = cB.page;
  await go(CA, 'whatson.html', '.ev');
  await until(async () => /Church Members Meeting/.test(await text(CA, '#list')));
  ok('   a Church member sees it, labelled', /Test Church Members Meeting .*Church members/.test(await text(CA, '#list')), await text(CA, '#list'));

  /* ---------- 3. the link ---------- */
  await go(AN, 'signup.html?event=ev_cm', '#wrap .card');
  const lt = await text(AN, '#wrap');
  ok('3. an Attender with the members-only event\'s link learns nothing about it', /could not be found, or it is not open to you/.test(lt) && !/Church Members Meeting/.test(lt), lt);
  const sneak = await AN.evaluate(() => EGBCAuth.db.collection('calEvents').doc('ev_cm').get().then(() => 'read', e => e.code));
  ok('   and the rules refuse it round the page', /permission/.test(sneak), sneak);

  /* ---------- 4. small groups ---------- */
  await go(KA, 'groups-admin.html', '#g-new'); await tap(KA, '#g-new'); await KA.waitForSelector('#f-who');
  await val(KA, '#f-name', 'Test Members Prayer'); await KA.select('#f-who', 'churchMembers'); await tap(KA, '#f-save');
  const grp = await until(async () => (await readDb(db => getDocs(query(collection(db, 'smallGroups'), where('name', '==', 'Test Members Prayer'))))).docs.map(d => ({ id: d.id, ...d.data() }))[0]);
  ok('4. a groups admin makes a Church-members-only group', grp && grp.visibility === 'churchMembers' && J(grp.canCome) === J(['churchMembers']), J(grp));
  await go(AN, 'groups.html', '[data-g]');
  ok('   an Attender never sees it on Find a group', /Test Open Group/.test(await text(AN, '#list')) && !/Members Prayer/.test(await text(AN, 'body')));
  await go(CA, 'groups.html', '[data-g]');
  await until(async () => /Members Prayer/.test(await text(CA, '#list')));
  ok('   a Church member does, labelled', /Test Members Prayer .*Church members only/.test(await text(CA, '#list')), await text(CA, '#list'));

  /* ---------- 5. a Church-members-only form ---------- */
  await go(VI, 'form.html?k=' + 'req_who_guest'.padEnd(32, '0'), '#notForYou');
  ok('5. a visitor with the form\'s link is asked to sign in, and sees no questions', /This form is for Church members only/.test(await text(VI, '#notForYou')) && !!(await VI.$('#signInFirst')) && !/Will you come/.test(await text(VI, 'body')));
  await go(AN, 'form.html?k=' + 'req_who_ann'.padEnd(32, '0'), '#notForYou');
  ok('   an Attender is told it isn\'t for them', /signed in as someone it is not for/.test(await text(AN, '#notForYou')));
  await go(CA, 'form.html?k=' + 'req_who_cath'.padEnd(32, '0'), 'body');
  await until(async () => /Will you come/.test(await text(CA, 'body')));
  ok('   a Church member gets the form', !(await CA.$('#notForYou')) && /Will you come/.test(await text(CA, 'body')));
  await kB.close(); await vB.close(); await aB.close(); await cB.close();
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
