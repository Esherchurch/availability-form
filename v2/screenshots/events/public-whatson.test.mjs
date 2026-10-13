/* The public What's on: public / members only / NOT LISTED, and the two
   embeds for the church website (NEXT-BRIEF §24 item 13; F-165).
   Events window. Invented people and events only, events emulators only,
   network guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/public-whatson.test.mjs"

   What it proves:
     1. a NEW EVENT STARTS AS NOT LISTED, the first choice; saved, it is in
        nobody's list but events-admin's, marked "Not listed"
     2. the website's "coming up" list: ONLY EVENTS MARKED EVERYONE - never
        a members' one, a church members' one, a not-listed one (a church
        meeting, AA) or one not announced yet; each opens its own public page
        in a new tab
     3. THE SAME WHEN THE VISITOR IS SIGNED IN to the hub in that browser,
        even as a master admin
     4. the month calendar: public events on their days, the month before
        and after; at 375px a list of the days instead of seven columns, and
        nothing scrolls sideways
     5. the members' What's on (page and app) never lists a not-listed
        event, not even to a master admin; signed out, its page is not found
     6. events-admin gives the two codes to paste into the website
     7. switched off for the church (uses('publicWhatson') false): nothing */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-pubwo-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 500))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const iso = (d) => ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

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
  martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  ann:    { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
/* This month's events on days that are still to come; one next month. */
const now = new Date();
const day = (n, h) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, h || 19, 0, 0); return d; };
const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const inMonth = Math.min(2, lastOfMonth - now.getDate());   /* still this month, if there is a day left */
const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 10, 18, 0, 0);
const EV = (title, when, visibility, audience, extra) => ({ title, description: '', category: 'social', labels: [], visibility, status: 'confirmed', audience, teams: [],
  featured: false, startLocal: iso(when), startUtc: when.getTime(), endLocal: iso(new Date(when.getTime() + 2 * 3600e3)), endUtc: when.getTime() + 2 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: false, image: '', createdBy: 'x', updatedAt: 'x', ...(extra || {}) });
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  await setDoc(doc(db, 'calEvents', 'ev_pub'), EV('Harvest supper (public, invented)', day(inMonth, 18), 'public', ['public', 'members'], { signupOn: true }));
  await setDoc(doc(db, 'calEvents', 'ev_next'), EV('Carol singing (public, invented)', nextMonth, 'public', ['public', 'members']));
  await setDoc(doc(db, 'calEvents', 'ev_mem'), EV('MEMBERS ONLY: bring and share (invented)', day(inMonth, 12), 'members', ['members']));
  await setDoc(doc(db, 'calEvents', 'ev_cm'), EV('CHURCH MEMBERS ONLY: members\u2019 meeting (invented)', day(inMonth, 20), 'churchMembers', ['churchMembers']));
  await setDoc(doc(db, 'calEvents', 'ev_unl'), EV('NOT LISTED: church meeting (invented)', day(inMonth, 10), 'unlisted', ['unlisted']));
  await setDoc(doc(db, 'calEvents', 'ev_aa'), EV('NOT LISTED: AA (invented)', day(inMonth, 21), 'unlisted', ['unlisted']));
  await setDoc(doc(db, 'calEvents', 'ev_held'), EV('HELD: not announced yet (invented)', day(inMonth, 11), 'public', ['members'], { status: 'pending' }));
});
const get = async (c, id) => { let out = null; await env.withSecurityRulesDisabled(async (x) => { const s = await getDoc(doc(x.firestore(), c, id)); out = s.exists() ? s.data() : null; }); return out; };
const SECRET = /MEMBERS ONLY|CHURCH MEMBERS ONLY|NOT LISTED|HELD/;

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
const listOf = async (p) => { await until(() => p.$('[data-view]')); return text(p, '#box'); };

try {
  /* ---------- 1. events-admin ---------- */
  const M = await browser('martin');
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector('#newEv');
  await until(() => M.$('.open[data-id="ev_unl"]'));
  const listed = await text(M, '#list');
  ok('1. events-admin lists the not-listed events, marked "Not listed"', /NOT LISTED: church meeting.*Not listed/.test(listed) && /NOT LISTED: AA/.test(listed), listed.slice(0, 300));
  await M.$eval('#newEv', e => e.click());
  await M.waitForSelector('#f_vis');
  const vis = await M.$eval('#f_vis', s => ({ value: s.value, first: s.options[0].value, label: s.options[0].text, public: [...s.options].find(o => o.value === 'public').text }));
  ok('   A NEW EVENT STARTS AS "NOT LISTED", the first choice', vis.value === 'unlisted' && vis.first === 'unlisted' && /Not listed/.test(vis.label), J(vis));
  ok('   "Everyone" says it is public, on the church website too', /public, on the church website too/.test(vis.public), vis.public);
  ok('6. the two codes for the church website, list and month', await M.$eval('#emb-list', e => /<iframe src="http:\/\/localhost:5601\/whatson-embed\.html"/.test(e.value)) && await M.$eval('#emb-month', e => /whatson-embed\.html\?view=month/.test(e.value)));

  /* ---------- 2. the website's list, signed out ---------- */
  const G = await browser('guest');
  await G.goto(URLB + 'whatson-embed.html', { waitUntil: 'networkidle2' });
  const gl = await listOf(G);
  ok('2. THE WEBSITE\'S LIST, SIGNED OUT: the public events', /Harvest supper/.test(gl) && /Carol singing/.test(gl), gl.slice(0, 300));
  ok('   NEVER a members\' one, a church members\' one, a not-listed one or one not announced yet', !SECRET.test(gl), gl);
  const links = await G.$$eval('a.ev', as => as.map(a => ({ href: a.getAttribute('href'), target: a.target, rel: a.rel })));
  ok('   each opens its own public page, in a new tab', links.length === 2 && links.every(l => /signup\.html\?event=ev_(pub|next)$/.test(l.href) && l.target === '_blank' && /noopener/.test(l.rel)), J(links));
  ok('   no hub bar, no Menu, no sign-in', !(await G.$('#egbc-bar')) && !(await G.$('#egbc-nav-btn')) && !/sign in/i.test(gl));

  /* ---------- 3. signed in as a master admin, in the same browser ---------- */
  await M.goto(URLB + 'whatson-embed.html', { waitUntil: 'networkidle2' });
  const ml = await listOf(M);
  ok('3. SIGNED IN AS A MASTER ADMIN: STILL ONLY THE PUBLIC ONES', /Harvest supper/.test(ml) && !SECRET.test(ml), ml);
  ok('   and no hub bar inside the website', !(await M.$('#egbc-bar')));

  /* ---------- 4. the month calendar ---------- */
  await M.goto(URLB + 'whatson-embed.html?view=month', { waitUntil: 'networkidle2' });
  await until(() => M.$('.grid .c a'));
  const grid = await text(M, '.grid');
  const pubDay = day(inMonth, 18).getDate();
  const onDay = await M.$$eval('.grid .c', (cs, d) => { const c = cs.find(x => !x.classList.contains('out') && x.querySelector('.n') && x.querySelector('.n').textContent === String(d)); return c ? c.innerText : ''; }, pubDay);
  ok('4. THE MONTH: the public event on its day', /Harvest supper/.test(onDay), onDay);
  ok('   and nothing else, signed in as a master admin', !SECRET.test(grid), grid.slice(0, 300));
  await M.$eval('#next', b => b.click());
  await until(async () => /Carol singing/.test(await text(M, '#box')));
  ok('   the month after: its own events', /Carol singing/.test(await text(M, '.grid')));
  await M.screenshot({ path: path.join(HERE, 'public-whatson-month-desktop.png'), fullPage: true });
  const S = await browser('guest375', 375);
  await S.goto(URLB + 'whatson-embed.html?view=month', { waitUntil: 'networkidle2' });
  await until(() => S.$('[data-view="agenda"]'));
  const shown = await S.evaluate(() => ({ grid: getComputedStyle(document.querySelector('.grid')).display, agenda: getComputedStyle(document.querySelector('.agenda')).display, side: document.scrollingElement.scrollWidth - innerWidth }));
  ok('   at 375px: a list of the days, not seven columns, nothing sideways', shown.grid === 'none' && shown.agenda === 'block' && shown.side <= 0, J(shown));
  ok('   with the public event in it', /Harvest supper/.test(await text(S, '.agenda')) && !SECRET.test(await text(S, '#box')));
  await S.screenshot({ path: path.join(HERE, 'public-whatson-month-375.png'), fullPage: true });
  await S.goto(URLB + 'whatson-embed.html', { waitUntil: 'networkidle2' });
  await listOf(S);
  ok('   the list at 375px: nothing sideways', (await S.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await S.screenshot({ path: path.join(HERE, 'public-whatson-list-375.png'), fullPage: true });

  /* ---------- 5. the members' What's on ---------- */
  const A = await browser('ann', 390);
  await A.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await until(async () => /Harvest supper/.test(await text(A)));
  ok('5. the members\' What\'s on (an attender): the members\' event, never a not-listed one', /MEMBERS ONLY: bring and share/.test(await text(A)) && !/NOT LISTED/.test(await text(A)));
  await A.goto(URLB + 'screenshots/events/app-harness.html?space=me&tab=whatson', { waitUntil: 'networkidle2' });
  await until(() => A.$('[data-w="events"]'));
  ok('   nor in the app', !/NOT LISTED/.test(await text(A, '#egbc-content')));
  await M.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await until(async () => /Harvest supper/.test(await text(M)));
  ok('   NOT EVEN FOR A MASTER ADMIN: What\'s on is not where not-listed events live', !/NOT LISTED/.test(await text(M)));
  await G.goto(URLB + 'signup.html?event=ev_unl', { waitUntil: 'networkidle2' });
  await sleep(1500);
  ok('   signed out, a not-listed event\'s page shows nothing of it', !/church meeting/i.test(await text(G)));

  /* ---------- 1 (again). saving a new event leaves it not listed ---------- */
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector('#newEv');
  await M.$eval('#newEv', e => e.click());
  await M.waitForSelector('#f_title');
  await M.$eval('#f_title', (e) => { e.value = 'Refugee group (invented)'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await M.$eval('#save', e => e.click());
  const made = await until(async () => { let out = null; await env.withSecurityRulesDisabled(async (c) => {
    const { getDocs, collection, query, where } = await import('firebase/firestore');
    const s = await getDocs(query(collection(c.firestore(), 'calEvents'), where('title', '==', 'Refugee group (invented)'))); out = s.docs[0] ? s.docs[0].data() : null; }); return out; });
  ok('1. SAVED WITHOUT CHOOSING: not listed, in nobody\'s list', made && made.visibility === 'unlisted' && J(made.audience) === '["unlisted"]', J(made && { visibility: made.visibility, audience: made.audience }));

  /* ---------- 7. switched off ---------- */
  const O = await browser('guestoff');
  await O.evaluateOnNewDocument(() => {
    let c = null;
    Object.defineProperty(window, 'EGBCChurch', { configurable: true, get() { return c; }, set(v) { if (v) v.uses = (n) => n !== 'publicWhatson'; c = v; } });
  });
  await O.goto(URLB + 'whatson-embed.html', { waitUntil: 'networkidle2' });
  await sleep(800);
  const off = await text(O, '#box');
  ok('7. SWITCHED OFF for the church: nothing at all', /Not available/.test(off) && !/Harvest/.test(off), off);

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
