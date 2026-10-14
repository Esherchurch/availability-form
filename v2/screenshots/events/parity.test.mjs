/* The ChurchSuite parity check (F-180): the two things EGBC uses in
   ChurchSuite's Calendar that the hub did not have yet.
   Events window. Invented people and events only, events emulators only,
   network guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/parity.test.mjs"

   What it proves:
     1. THE FEATURED EMBED (ChurchSuite's "Featured" website embed):
        whatson-embed.html?view=featured shows the events marked Featured as
        picture cards; A REPEATING EVENT IS ONE CARD with "and 2 more dates";
        never a members', church members', not-listed or held one - signed
        out or signed in as a master admin; &combine=0 gives every date a
        card, &all=1 every public event; at 375px one column, nothing
        sideways; events-admin gives its code; switched off, nothing
     2. FOR THE NOTICES (ChurchSuite's "event details for a notice sheet"):
        events-admin turns the weeks picked into plain words, a day at a
        time; everyone's and attenders' events by default, church-members'
        and team events only when ticked; NEVER a not-listed, held or
        cancelled one; 2 weeks reaches the week after; a line about each
        event is words, not HTML; Download gives the same words */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-parity-'));
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

/* Next Sunday (never today), the way the notices list counts it. */
const now = new Date();
const sun = new Date(now.getFullYear(), now.getMonth(), now.getDate()); sun.setDate(sun.getDate() + ((7 - sun.getDay()) % 7 || 7));
const at = (base, days, h, m) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, h, m || 0, 0);
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDay = (d) => DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
const EV = (title, when, visibility, audience, extra) => ({ title, description: '', category: 'social', labels: [], visibility, status: 'confirmed', audience, teams: [],
  featured: false, startLocal: iso(when), startUtc: when.getTime(), endLocal: iso(new Date(when.getTime() + 90 * 60e3)), endUtc: when.getTime() + 90 * 60e3, allDay: false,
  location: { kind: 'venue', venueName: 'Village hall (invented)' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: false, image: '', createdBy: 'x', updatedAt: 'x', ...(extra || {}) });
const PIC = URLB + 'icon-512.png';
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
  const put = (id, d) => setDoc(doc(db, 'calEvents', id), d);
  /* The featured strip. A film club three Fridays running: one series. */
  for (let i = 0; i < 3; i++) await put('f_film' + i, EV('Film club (featured series, invented)', at(sun, 5 + 7 * i, 18), 'public', ['public', 'members'], { featured: true, seriesId: 'ser_film', image: PIC, signupOn: true }));
  await put('f_fair', EV('Autumn fair (featured, no picture, invented)', at(sun, 13, 10), 'public', ['public', 'members'], { featured: true }));
  await put('n_walk', EV('Plain walk (public, not featured, invented)', at(sun, 3, 14), 'public', ['public', 'members']));
  await put('f_mem', EV('MEMBERS ONLY featured (invented)', at(sun, 4, 19), 'members', ['members'], { featured: true }));
  await put('f_unl', EV('NOT LISTED featured AA (invented)', at(sun, 4, 20), 'unlisted', ['unlisted'], { featured: true }));
  await put('f_held', EV('HELD featured (invented)', at(sun, 4, 21), 'public', ['members'], { featured: true, status: 'pending' }));
  /* The notices: next Sunday's week, and the week after. */
  await put('w_sun', EV('Morning worship (invented)', at(sun, 0, 10), 'public', ['public', 'members'], { description: '<p>All <b>welcome</b> &amp; coffee after.</p>' }));
  await put('w_mem', EV('Bring and share lunch (attenders, invented)', at(sun, 0, 12, 30), 'members', ['members']));
  await put('w_cm', EV('Church meeting (church members, invented)', at(sun, 2, 19, 30), 'churchMembers', ['churchMembers']));
  await put('w_team', EV('Core team night (team, invented)', at(sun, 3, 19), 'team', ['Core Team'], { teams: ['Core Team'] }));
  await put('w_unl', EV('NOT LISTED room hire (invented)', at(sun, 1, 19), 'unlisted', ['unlisted']));
  await put('w_held', EV('HELD not announced (invented)', at(sun, 1, 20), 'public', ['members'], { status: 'pending' }));
  await put('w_off', EV('CANCELLED quiz (invented)', at(sun, 2, 20), 'public', ['public', 'members'], { status: 'cancelled' }));
  await put('w_next', EV('Harvest supper next week (invented)', at(sun, 8, 18), 'public', ['public', 'members']));
  /* Categories: one in a category the church hasn't made yet, one in Music. */
  await put('c_art', EV('Painting morning (invented)', at(sun, 4, 10), 'public', ['public', 'members'], { category: 'art-club-invented' }));
  await put('c_music', EV('Organ recital (invented)', at(sun, 4, 15), 'public', ['public', 'members'], { category: 'music' }));
});
const SECRET = /MEMBERS ONLY|NOT LISTED|HELD/;

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
const featured = async (p, q) => { await p.goto(URLB + 'whatson-embed.html?view=featured' + (q || ''), { waitUntil: 'networkidle2' }); await until(() => p.$('[data-view="featured"]')); return text(p, '#box'); };
const cards = (p) => p.$$eval('a.fc', as => as.map(a => ({ id: a.getAttribute('data-ev'), more: (a.querySelector('[data-more]') || {}).textContent || '', pic: !!a.querySelector('img.pic'), href: a.getAttribute('href'), target: a.target })));

try {
  /* ---------- 1. the featured embed, signed out ---------- */
  const G = await browser('guest');
  const g = await featured(G);
  const gc = await cards(G);
  ok('1. FEATURED, SIGNED OUT: the featured public events, as cards', gc.length === 2 && /Film club/.test(g) && /Autumn fair/.test(g), J(gc));
  ok('   A REPEATING EVENT IS ONE CARD: "and 2 more dates"', gc.filter(c => /^f_film/.test(c.id)).length === 1 && /and 2 more dates/.test(gc.find(c => /^f_film/.test(c.id)).more), J(gc));
  ok('   its picture is on its card; one without a picture shows its date instead', gc.find(c => c.id === 'f_film0').pic && !gc.find(c => c.id === 'f_fair').pic && /\d+ [A-Z][a-z]{2}/.test(await G.$eval('a.fc[data-ev="f_fair"] .nopic', e => e.textContent)));
  ok('   NEVER a members\', not-listed or held one, and not one that is not featured', !SECRET.test(g) && !/Plain walk/.test(g), g);
  ok('   each opens its own public page, in a new tab', gc.every(c => /signup\.html\?event=/.test(c.href) && c.target === '_blank'), J(gc));
  await featured(G, '&combine=0');
  ok('   &combine=0: every date of the series has its own card', (await cards(G)).filter(c => /^f_film/.test(c.id)).length === 3);
  const all = await featured(G, '&all=1');
  ok('   &all=1: every public event, still never a secret one', /Plain walk/.test(all) && !SECRET.test(all), all);

  /* ---------- 1. signed in as a master admin, in the same browser ---------- */
  const M = await browser('martin');
  const m = await featured(M);
  ok('1. SIGNED IN AS A MASTER ADMIN: STILL ONLY THE FEATURED PUBLIC ONES', /Film club/.test(m) && !SECRET.test(m), m);

  /* ---------- 1. at 375px ---------- */
  const S = await browser('guest375', 375);
  await featured(S);
  const lay = await S.evaluate(() => ({ cols: getComputedStyle(document.querySelector('.cards')).gridTemplateColumns.split(' ').length, side: document.scrollingElement.scrollWidth - innerWidth }));
  ok('   at 375px: one column, nothing sideways', lay.cols === 1 && lay.side <= 0, J(lay));
  await S.screenshot({ path: path.join(HERE, 'parity-featured-375.png'), fullPage: true });
  await G.setViewport({ width: 1100, height: 900 });
  await featured(G);
  await G.screenshot({ path: path.join(HERE, 'parity-featured-desktop.png'), fullPage: true });

  /* ---------- 1. switched off ---------- */
  const O = await browser('guestoff');
  await O.evaluateOnNewDocument(() => {
    let c = null;
    Object.defineProperty(window, 'EGBCChurch', { configurable: true, get() { return c; }, set(v) { if (v) v.uses = (n) => n !== 'publicWhatson'; c = v; } });
  });
  await O.goto(URLB + 'whatson-embed.html?view=featured', { waitUntil: 'networkidle2' });
  await sleep(800);
  ok('   switched off for the church: nothing at all', /Not available/.test(await text(O, '#box')) && !/Film/.test(await text(O, '#box')));

  /* ---------- 1b. sharing a public event, on a computer too (F-188) ---------- */
  await G.goto(URLB + 'signup.html?event=f_fair', { waitUntil: 'networkidle2' });
  await until(() => G.$('#shareFb'));
  const sh = await G.evaluate(() => ({ fb: document.getElementById('shareFb').href, x: document.getElementById('shareX').href, mail: document.getElementById('shareMail').href }));
  ok('1b. SHARING A PUBLIC EVENT: Facebook, X and Email, each with the event\'s own page',
    sh.fb === 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(URLB + 'signup.html?event=f_fair') &&
    sh.x.startsWith('https://x.com/intent/post?text=Autumn') && sh.x.includes(encodeURIComponent(URLB + 'signup.html?event=f_fair')) && sh.mail.startsWith('mailto:?subject=Autumn'), J(sh));
  await M.goto(URLB + 'signup.html?event=f_mem', { waitUntil: 'networkidle2' });
  await until(() => M.$('#share'));
  ok('   NOT for a members\' event: its link means nothing to the public', !(await M.$('#shareFb')) && !(await M.$('#shareX')));

  /* ---------- 2. events-admin: the code, and the notices ---------- */
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector('#newEv');
  await until(() => M.$('.open[data-id="w_sun"]'));
  ok('1. events-admin gives the featured code to paste into the website', await M.$eval('#emb-featured', e => /<iframe src="http:\/\/localhost:5601\/whatson-embed\.html\?view=featured"/.test(e.value)));
  const from = await M.$eval('#nt-from', s => s.options[s.selectedIndex].text);
  ok('2. FOR THE NOTICES: starts next Sunday, for 1 week', from === longDay(sun) && await M.$eval('#nt-weeks', s => s.value) === '1', from);
  const n1 = await until(() => M.$eval('#nt-text', t => /Morning worship/.test(t.value) && t.value));
  const lines = (n1 || '').split('\n');
  ok('   a day at a time: the day, then each event with its time and place', lines[0] === longDay(sun) && lines.includes('• 10:00–11:30  Morning worship (invented) (Village hall (invented))'), n1);
  ok('   everyone\'s and attenders\' events', /Bring and share lunch/.test(n1), n1);
  ok('   NOT church-members\' or team events unless ticked', !/Church meeting/.test(n1) && !/Core team night/.test(n1), n1);
  ok('   NEVER a not-listed, held or cancelled one', !/NOT LISTED|HELD|CANCELLED/.test(n1), n1);
  ok('   not the week after', !/Harvest supper/.test(n1), n1);
  await M.$eval('#nt-more', c => { c.checked = true; c.dispatchEvent(new Event('change')); });
  const n2 = await M.$eval('#nt-text', t => t.value);
  ok('2. TICKED: church-members\' and team events too', /Church meeting/.test(n2) && /Core team night/.test(n2), n2);
  ok('   still NEVER a not-listed, held or cancelled one', !/NOT LISTED|HELD|CANCELLED/.test(n2), n2);
  await M.$eval('#nt-weeks', s => { s.value = '2'; s.dispatchEvent(new Event('change')); });
  const n3 = await M.$eval('#nt-text', t => t.value);
  ok('   2 weeks reaches the week after', /Harvest supper next week/.test(n3) && n3.includes(longDay(at(sun, 8, 0))), n3);
  await M.$eval('#nt-desc', c => { c.checked = true; c.dispatchEvent(new Event('change')); });
  const n4 = await M.$eval('#nt-text', t => t.value);
  ok('   a line about each event: words, not HTML', n4.includes('\n  All welcome & coffee after.') && !/<[a-z]/i.test(n4), n4.slice(0, 300));
  await M.evaluate(() => {
    window.__dl = null;
    const make = URL.createObjectURL;
    URL.createObjectURL = (b) => { window.__blob = b; return make(b); };
    HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; };
  });
  await M.$eval('#nt-save', b => b.click());
  const dl = await M.evaluate(async () => ({ name: window.__dl, words: window.__blob ? await window.__blob.text() : '', shown: document.getElementById('nt-text').value }));
  ok('   Download gives the same words, named for the Sunday', dl.name === 'Notices from ' + longDay(sun) + '.txt' && dl.words === dl.shown, J({ name: dl.name, same: dl.words === dl.shown }));
  await M.$eval('#notices', d => { d.open = true; });
  await M.$eval('#notices', d => d.scrollIntoView());
  await M.screenshot({ path: path.join(HERE, 'parity-notices-desktop.png') });

  /* ---------- 3. deleted events: what, when and who ---------- */
  const filmLeft = async () => { let n = 0; await env.withSecurityRulesDisabled(async (c) => {
    const { getDocs, collection, query, where } = await import('firebase/firestore');
    n = (await getDocs(query(collection(c.firestore(), 'calEvents'), where('seriesId', '==', 'ser_film')))).size; }); return n; };
  const logs = async () => { let out = []; await env.withSecurityRulesDisabled(async (c) => {
    const { getDocs, collection } = await import('firebase/firestore');
    out = (await getDocs(collection(c.firestore(), 'calEventsDeleted'))).docs.map(d => d.data()); }); return out; };
  const openFilm = async () => {
    await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
    await until(() => M.$('.open[data-id="f_film0"]'));
    await M.$eval('.open[data-id="f_film0"]', e => e.click());
    await until(() => M.$('#delSeries'));
  };
  await openFilm();
  /* The record cannot be written (a stand-in for the database refusing it). */
  await M.evaluate(() => {
    const C = firebase.firestore.CollectionReference.prototype, add = C.add;
    C.add = function (d) { return this.id === 'calEventsDeleted' ? Promise.reject(new Error('refused (test)')) : add.call(this, d); };
  });
  await M.$eval('#delSeries', b => b.click());
  await sleep(2500);
  ok('3. DELETED EVENTS: IF WHO-DELETED-IT CANNOT BE WRITTEN, NOTHING IS DELETED', (await filmLeft()) === 3 && (await logs()).length === 0, J({ left: await filmLeft() }));
  await openFilm();
  await M.$eval('#delSeries', b => b.click());
  await until(async () => (await filmLeft()) === 0);
  const lg = await logs();
  ok('   deleting a series writes what, when and who', lg.length === 1 && lg[0].title === 'Film club (featured series, invented)' && lg[0].count === 3 && lg[0].byUid === P.martin.uid && lg[0].byName === 'Martin Master' && lg[0].at && (await filmLeft()) === 0, J(lg));
  await M.$eval('#deleted', d => { d.open = true; });
  const dl2 = await until(async () => { const t = await text(M, '#del-list'); return /Film club/.test(t) && t; });
  ok('   the "Deleted events" card lists it: the event, its dates, who and when', /Film club \(featured series, invented\).*and 2 more dates.*Martin Master/.test(dl2 || ''), dl2);

  /* ---------- 4. the church's own event categories ---------- */
  const tagOf = (p, id) => p.$eval('button.ev[onclick*="' + id + '"]', b => b.innerText.replace(/\s+/g, ' '));
  await G.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await until(() => G.$('button.ev[onclick*="c_art"]'));
  ok('4. CATEGORIES: before the church has its own, an unknown one reads as "Other"', /Other/.test(await tagOf(G, 'c_art')), await tagOf(G, 'c_art'));
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('.open[data-id="w_sun"]'));
  await M.$eval('#catsCard', d => { d.open = true; d.dispatchEvent(new Event('toggle')); });
  await until(() => M.$('#cat-list [data-cat="music"]'));
  ok('   the card starts with the eight built-in categories', (await M.$$eval('#cat-list [data-cat]', r => r.length)) === 8);
  const setVal = (sel, v) => M.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await setVal('#cat-list [data-cat="social"] input[data-k="name"]', 'Social and food');
  await M.$eval('#cat-list [data-cat="music"] [data-retire]', b => b.click());
  await M.$eval('#cat-add', b => b.click());
  await setVal('#cat-list [data-cat="new"] input[data-k="name"]', 'Art club (invented)');
  await setVal('#cat-list [data-cat="new"] input[data-k="colour"]', '#aa3366');
  await M.$eval('#cat-save', b => b.click());
  const cats = await until(async () => { let out = null; await env.withSecurityRulesDisabled(async (c) => {
    const { getDocs, collection } = await import('firebase/firestore');
    const s = await getDocs(collection(c.firestore(), 'eventCategories')); if (s.size) { out = {}; s.docs.forEach(d => { out[d.id] = d.data(); }); } }); return out; });
  ok('   SAVED: the church\'s own list - renamed, retired and a new one, in order', cats && Object.keys(cats).length === 9 && cats.social.name === 'Social and food' && cats.music.retired === true &&
    cats['art-club-invented'] && cats['art-club-invented'].colour === '#aa3366' && cats['art-club-invented'].order === 8, J(cats));
  await M.$eval('#newEv', e => e.click());
  await M.waitForSelector('#f_cat');
  const opts = await M.$$eval('#f_cat option', os => os.map(o => o.value + '=' + o.textContent));
  ok('   a new event is offered the new category, and not the retired one', opts.includes('art-club-invented=Art club (invented)') && opts.includes('social=Social and food') && !opts.some(o => /^music=/.test(o)), J(opts));
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('.open[data-id="c_music"]'));
  await M.$eval('.open[data-id="c_music"]', e => e.click());
  await M.waitForSelector('#f_cat');
  ok('   an event already in the retired category keeps it', await M.$eval('#f_cat', s => s.value === 'music' && s.options[s.selectedIndex].textContent === 'Music'));
  await G.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await until(() => G.$('button.ev[onclick*="c_art"]'));
  const artTag = await tagOf(G, 'c_art'), wsTag = await tagOf(G, 'w_sun');
  ok('   SIGNED OUT, What\'s on shows the church\'s names: the new one, the renamed one, the retired one', /Art club \(invented\)/.test(artTag) && /Social and food/.test(wsTag) && /Music/.test(await tagOf(G, 'c_music')), J([artTag, wsTag]));
  ok('   with the new one\'s colour, and a filter for it', await G.$eval('button.ev[onclick*="c_art"] .tag .dot', d => getComputedStyle(d).backgroundColor) === 'rgb(170, 51, 102)' &&
    /Art club \(invented\)/.test(await text(G, '#cats')));
  await G.goto(URLB + 'signup.html?event=c_art', { waitUntil: 'networkidle2' });
  ok('   and its own sign-up page', !!(await until(async () => /Art club \(invented\)/.test(await text(G)))));
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('.open[data-id="w_sun"]'));
  await M.$eval('#catsCard', d => { d.open = true; d.dispatchEvent(new Event('toggle')); d.scrollIntoView(); });
  await until(() => M.$('#cat-list [data-cat="art-club-invented"]'));
  await M.screenshot({ path: path.join(HERE, 'parity-categories-desktop.png') });

  const MP = await browser('martin', 375);
  await MP.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => MP.$('.open[data-id="w_sun"]'));
  await MP.$eval('#notices', d => { d.open = true; });
  await until(() => MP.$eval('#nt-text', t => /Morning worship/.test(t.value)));
  ok('   at 375px: the notices fit, nothing sideways', (await MP.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
  await MP.$eval('#notices', d => d.scrollIntoView());
  await MP.screenshot({ path: path.join(HERE, 'parity-notices-375.png') });

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
