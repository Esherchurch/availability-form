/* Sign up to the whole series (F-184; ChurchSuite's "sign up to the whole
   series"). Events window. Invented people and events only, events
   emulators only, network guard, no email leaves the machine.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/series.test.mjs"

   What it proves:
     1. an admin makes a repeating event with a £3 ticket and "Sign up to:
        the whole series": EVERY DATE GETS THE TICKET, under the same id
        (before F-184 the later dates had no tickets or questions at all)
     2. signed out, the sign-up page says it is for all 4 dates and lists
        them; 2 people x £3 x 4 dates = £24.00 to pay
     3. one press: a place on every date, each with its own key and its own
        place on that date's counter; a FULL DATE PUTS THEM ON ITS WAITING
        LIST, and the thank-you says so; £18.00 for the 3 with places
     4. "my place" lists all 4 dates; "Cancel all" gives every place back */

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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-series-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
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

const env = await initializeTestEnvironment({ projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const P = { martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] } };
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'churchSettings', 'details'), { name: 'Test Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '', logoPath: '' });
});
const all = async (c, field, value) => { let out = []; await env.withSecurityRulesDisabled(async (x) => { out = (await getDocs(query(collection(x.firestore(), c), where(field, '==', value)))).docs.map(d => ({ id: d.id, ...d.data() })); }); return out; };
const sub = async (id, c) => { let out = []; await env.withSecurityRulesDisabled(async (x) => { out = (await getDocs(collection(x.firestore(), 'calEvents', id, c))).docs.map(d => ({ id: d.id, ...d.data() })); }); return out; };
const get = async (c, id) => { let out = null; await env.withSecurityRulesDisabled(async (x) => { const s = await getDoc(doc(x.firestore(), c, id)); out = s.exists() ? s.data() : null; }); return out; };

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1280, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const val = (p, sel, v) => p.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const tap = (p, sel) => p.$eval(sel, e => e.click());
const local = (days, hh) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hh, 0, 0, 0); const z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':00'; };
const TITLE = 'Bible course (invented)';

try {
  /* ---------- 1. the admin makes the series ---------- */
  const M = await browser('martin');
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await M.waitForSelector('#newEv', { timeout: 20000 });
  await tap(M, '#newEv');
  await M.waitForSelector('#f_title');
  await val(M, '#f_title', TITLE);
  await val(M, '#f_start', local(7, 19)); await val(M, '#f_end', local(7, 21));
  await M.select('#f_vis', 'public');
  await tap(M, '[data-tab="signups"]');
  await M.waitForSelector('#s_on');
  await M.$eval('#s_on', c => { if (!c.checked) c.click(); });
  await val(M, '#s_cap', '10');
  await M.select('#s_scope', 'series');
  await tap(M, '#ttAdd');
  await M.waitForSelector('.tt-name[data-i="0"]');
  await val(M, '.tt-name[data-i="0"]', 'Adult');
  await val(M, '.tt-price[data-i="0"]', '3');
  await tap(M, '[data-tab="details"]');
  await M.waitForSelector('#f_repeat');
  await M.select('#f_repeat', '7'); await val(M, '#f_until', local(7 + 21, 12).slice(0, 10));
  await tap(M, '#save');
  const evs = await until(async () => { const l = await all('calEvents', 'title', TITLE); return l.length === 4 ? l.sort((a, b) => a.startUtc - b.startUtc) : null; }, 30000);
  ok('1. THE SERIES: 4 dates, "sign up to the whole series"', !!evs && evs.every(e => e.signupScope === 'series' && e.seriesId === evs[0].seriesId && e.signupOn), J(evs && evs.map(e => [e.signupScope, e.seriesId])));
  const tts = evs ? await until(async () => { const l = await Promise.all(evs.map(e => sub(e.id, 'ticketTypes'))); return l.every(t => t.length === 1) ? l : null; }) : null;
  ok('   EVERY DATE HAS THE £3 TICKET, UNDER THE SAME ID (it had none before F-184)', !!tts && tts.every(t => t[0].id === tts[0][0].id && t[0].price === 3 && t[0].name === 'Adult'), J(tts));
  /* The last date is already full. */
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'capacity', evs[3].id), { calEventId: evs[3].id, taken: 10, capacity: 10 }); });

  /* ---------- 2. signed out: the sign-up page ---------- */
  const G = await browser('guest', 390);
  await G.goto(URLB + 'signup.html?event=' + evs[0].id, { waitUntil: 'networkidle2' });
  await G.waitForSelector('#seriesNote');
  ok('2. SIGNED OUT: "This signs you up to all 4 dates", with the 4 listed', /all 4 dates/.test(await text(G, '#seriesNote')) && (await G.$$('#seriesDates li')).length === 4);
  await G.type('#nm', 'Pat Series (invented)');
  await G.type('#em', 'pat.series@example.invalid');
  await G.type('#att0', 'Pat Series (invented)');
  await tap(G, '#addAtt'); await G.waitForSelector('#att1');
  await G.type('#att1', 'Sam Series (invented)');
  ok('   2 people x £3 x 4 dates: "To pay on the day: £24.00"', !!(await until(async () => /£24\.00/.test(await G.$eval('#due', e => e.textContent)))), await G.$eval('#due', e => e.textContent));
  ok('   the button says what it does', /Sign up to all 4 dates/.test(await text(G, '#go')));
  await G.screenshot({ path: path.join(HERE, 'series-signup-390.png'), fullPage: true });
  await sleep(2700);
  await tap(G, '#go');
  await G.waitForFunction(() => /You are signed up to all 4 dates/.test(document.body.innerText), { timeout: 20000 });

  /* ---------- 3. one press: every date ---------- */
  const sus = await until(async () => { const l = await all('signups', 'email', 'pat.series@example.invalid'); return l.length === 4 ? l : null; });
  const byEv = {}; (sus || []).forEach(s => { byEv[s.calEventId] = s; });
  ok('3. ONE PRESS: a sign-up for each of the 4 dates, each with its own key', !!sus && evs.every(e => byEv[e.id]) && new Set(sus.map(s => s.id)).size === 4, J(sus && sus.map(s => s.calEventId)));
  ok('   a place on the first three; THE FULL DATE PUTS THEM ON ITS WAITING LIST', !!sus && [0, 1, 2].every(i => byEv[evs[i].id].status === 'confirmed') && byEv[evs[3].id].status === 'waiting');
  const caps = await Promise.all(evs.map(e => get('capacity', e.id)));
  ok('   each date\'s counter took its 2 places; the full one is untouched', caps[0].taken === 2 && caps[1].taken === 2 && caps[2].taken === 2 && caps[3].taken === 10, J(caps));
  const grp = sus ? await get('seriesSignups', sus[0].id) : null;
  ok('   and the booking knows all 4 keys (for one email, and "cancel all")', !!grp && grp.keys.length === 4 && sus.every(s => grp.keys.includes(s.id)), J(grp));
  ok('   the thank-you says one date was full', /1 of the dates was already full/.test(await text(G, '#seriesWaiting')));
  ok('   and £18.00 to pay, for the 3 dates with places', /£18\.00/.test(await text(G, '#dueDone')), await text(G, '#dueDone'));

  /* ---------- 4. my place: all the dates, and cancel all ---------- */
  const first = grp.keys[0];
  await G.goto(URLB + 'my-signup.html?key=' + first, { waitUntil: 'networkidle2' });
  await G.waitForSelector('#series');
  ok('4. MY PLACE: the whole series, all 4 dates, the full one on the waiting list', (await G.$$('#series [data-date]')).length === 4 && /waiting list/.test(await text(G, '#series')));
  await G.screenshot({ path: path.join(HERE, 'series-myplace-390.png'), fullPage: true });
  await tap(G, '#cancelAll');
  await until(() => G.$('#allGone'));
  const after = await all('signups', 'email', 'pat.series@example.invalid');
  const caps2 = await Promise.all(evs.map(e => get('capacity', e.id)));
  ok('   CANCEL ALL: every date cancelled, and every place given back', after.length === 4 && after.every(s => s.status === 'cancelled') && caps2[0].taken === 0 && caps2[1].taken === 0 && caps2[2].taken === 0 && caps2[3].taken === 10, J([after.map(s => s.status), caps2.map(c => c.taken)]));

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
