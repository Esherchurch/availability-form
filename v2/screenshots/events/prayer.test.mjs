/* Prayer requests and answers to prayer (NEXT-BRIEF §24 item 11; F-166).
   Events window. Invented people only, events emulators only, network
   guard. The phone's speech recognition is a stand-in that "hears" one
   invented sentence: nothing is recorded or sent anywhere.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/prayer.test.mjs"

   What it proves, at 375px in app mode:
     1. SPEAK: the big button fills the box with what was said, ready to read
        and change; a phone that cannot listen gets the keyboard-microphone
        tip instead of a button that does nothing
     2. a request goes to the pastoral team, or the prayer team too if the
        person chooses; "Thank you, it has been passed on"
     3. the pastoral team sees every request, with the name; THE PRAYER TEAM
        ONLY THOSE SHARED WITH IT; anyone else, none
     4. the person marks it answered and shares the answer with the church;
        everyone signed in reads it; the pastoral team can hide one
     5. switched off for the church: not used
     6. F-179: BEFORE SWITCH-OVER (churchSettings/launch.rulesLocked not
        true): no request form and no sharing, and NOTHING IS SAVED; asked
        again at the moment of sending, so a page opened earlier saves
        nothing either */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocs, collection } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators - refusing to write.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-prayer-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 500))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 15000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
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

const P = {
  ann:  { email: 'ann.asker@example.invalid', name: 'Ann Asker', mid: 'm_ann', teams: [] },
  paul: { email: 'paul.pastoral@example.invalid', name: 'Paul Pastoral', mid: 'm_paul', teams: ['Pastoral'] },
  pip:  { email: 'pip.prayer@example.invalid', name: 'Pip Prayer', mid: 'm_pip', teams: ['Prayer Team'] },
  oli:  { email: 'oli.other@example.invalid', name: 'Oli Other', mid: 'm_oli', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const k of Object.keys(P)) {
    const x = P[k];
    await setDoc(doc(db, 'addressBook', x.mid), { name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
    await setDoc(doc(db, 'users', x.uid), { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
  }
  await setDoc(doc(db, 'prayerSettings', 'main'), { prayerTeam: 'Prayer Team', updatedAt: 'x', updatedBy: 'x' });
  /* Someone else's, for the pastoral team only. */
  await setDoc(doc(db, 'prayers', 'pr_private'), { by: P.oli.uid, byName: 'Oli Other', text: 'PASTORAL ONLY: a hard week at home (invented).', share: 'pastoral', at: new Date(), answered: false, answer: '', answeredAt: null });
});
const list = async (c) => { let out = []; await env.withSecurityRulesDisabled(async (x) => { out = (await getDocs(collection(x.firestore(), c))).docs.map(d => ({ id: d.id, ...d.data() })); }); return out; };
const SAID = 'please pray for my job interview on Friday';

const errors = [], browsers = [];
async function as(who, o) {
  o = o || {};
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k, said, listen, off) => {
    try { sessionStorage.setItem(k, '1'); } catch (e) {}
    delete window.SpeechRecognition; delete window.webkitSpeechRecognition;
    if (listen) {
      /* The phone's recogniser, standing in: it "hears" one sentence. */
      window.webkitSpeechRecognition = function () {
        const r = this;
        r.start = () => setTimeout(() => {
          const res = (t, fin) => { const a = [{ transcript: t }]; a.isFinal = fin; return a; };
          r.onresult && r.onresult({ resultIndex: 0, results: [res(said.split(' ').slice(0, 3).join(' '), false)] });
          r.onresult && r.onresult({ resultIndex: 0, results: [res(said, true)] });
        }, 50);
        r.stop = () => setTimeout(() => r.onend && r.onend(), 10);
      };
    } else {
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
      Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    }
    if (off) { let c = null; Object.defineProperty(window, 'EGBCChurch', { configurable: true, get() { return c; }, set(v) { if (v) v.uses = (n) => n !== 'prayer'; c = v; } }); }
  }, 'egbc_fresh_' + STAMP, SAID, o.listen !== false, !!o.off);
  await p.setViewport({ width: 375, height: 812 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await p.goto(URLB + 'prayer.html?app=1', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => document.querySelector('[data-tab]') || /not used/.test(document.getElementById('main').textContent), { timeout: 20000 });
  return p;
}
const tap = (p, sel) => p.$eval(sel, e => e.click());
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const tab = async (p, t) => { await tap(p, '[data-tab="' + t + '"]'); await sleep(300); };

try {
  /* ---------- 6. before switch-over ---------- */
  const B = await as('oli');
  const before = await text(B, '#ask');
  ok('6. BEFORE SWITCH-OVER: no request form, the words instead', !(await B.$('#pr-go')) && !(await B.$('#pr-text')) && /call 999/.test(before) && /opens when the new church hub opens/.test(before), before);
  await tab(B, 'answers');
  ok('   and no sharing an answer', !(await B.$('#sh-go')) && /opens when the new church hub opens/.test(await text(B, '#answers')));
  ok('   NOTHING SAVED', (await list('prayers')).length === 1 && (await list('prayerAnswers')).length === 0);
  await tab(B, 'ask');
  await B.screenshot({ path: path.join(HERE, 'prayer-not-yet-375.png'), fullPage: true });
  await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'churchSettings', 'launch'), { rulesLocked: true, opensOn: '' }); });

  /* ---------- 1. Speak ---------- */
  const A = await as('ann');
  const big = await A.$eval('#pr-speak', b => { const r = b.getBoundingClientRect(); return { h: r.height, w: r.width, shown: getComputedStyle(b).display !== 'none', words: b.textContent }; });
  ok('1. SPEAK: a big button, the width of the phone', big.shown && big.h >= 60 && big.w > 300 && /Speak/.test(big.words), J(big));
  await tap(A, '#pr-speak');
  await until(async () => (await A.$eval('#pr-text', t => t.value)) === SAID);
  ok('   what was said goes into the box, to read and change', (await A.$eval('#pr-text', t => t.value)) === SAID, await A.$eval('#pr-text', t => t.value));
  ok('   it says it is listening, and the button becomes Stop', /Listening/.test(await text(A, '#pr-said')) && /Stop/.test(await text(A, '#pr-speak')));
  await tap(A, '#pr-speak');
  await A.screenshot({ path: path.join(HERE, 'prayer-ask-375.png'), fullPage: true });
  ok('   nothing scrolls sideways at 375px', (await A.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);

  /* ---------- 2. the request ---------- */
  ok('2. the choice: pastoral team only (the first), or the prayer team too', /pastoral team only/.test(await text(A, '#ask')) && /the Prayer Team/.test(await text(A, '#ask')));
  await A.$eval('input[name="pr-share"][value="prayerTeam"]', r => r.click());
  await tap(A, '#pr-go');
  await A.waitForSelector('#sent');
  ok('   sent: "Thank you. Your request has been passed on"', /Thank you\. Your request has been passed on/.test(await text(A, '#sent')));
  const mine = (await list('prayers')).find(p => p.by === P.ann.uid);
  ok('   saved with her name, for the pastoral team and the prayer team', mine && mine.text === SAID && mine.share === 'prayerTeam' && mine.byName === 'Ann Asker', J(mine));

  /* ---------- 3. who sees what ---------- */
  const PA = await as('paul');
  await until(() => PA.$('[data-tab="forus"]'));
  await tab(PA, 'forus');
  const pt = await text(PA, '#forus');
  ok('3. THE PASTORAL TEAM: every request, with the name', pt.includes(SAID) && /Ann Asker/.test(pt) && /PASTORAL ONLY/.test(pt), pt);
  const PI = await as('pip');
  await until(() => PI.$('[data-tab="forus"]'));
  await tab(PI, 'forus');
  const it = await text(PI, '#forus');
  ok('   THE PRAYER TEAM: the one shared with it', it.includes(SAID), it);
  ok('   BUT NEVER ONE FOR THE PASTORAL TEAM ONLY', !/PASTORAL ONLY/.test(it), it);
  const O = await as('oli');
  await sleep(800);
  ok('   anyone else: no list of requests at all', !(await O.$('[data-tab="forus"]')) && !(await text(O)).includes(SAID));

  /* ---------- 4. answered ---------- */
  await tab(A, 'mine');
  await A.waitForSelector('[data-answer="' + mine.id + '"]');
  await A.$eval('#an-' + mine.id, (t) => { t.value = 'I got the job! Thank you all (invented).'; });
  await A.$eval('#sh-' + mine.id, c => c.click());
  await tap(A, '[data-answer="' + mine.id + '"]');
  await until(async () => (await list('prayerAnswers')).length === 1);
  const pr = (await list('prayers')).find(p => p.id === mine.id), an = (await list('prayerAnswers'))[0];
  ok('4. she marks it answered, and shares the answer with the church, with her name', pr.answered === true && /got the job/.test(pr.answer) && /got the job/.test(an.text) && an.byName === 'Ann Asker', J({ pr, an }));
  ok('   THE ANSWER CARRIES NOT A WORD OF THE REQUEST', !an.text.includes('interview'));
  await O.reload({ waitUntil: 'networkidle2' }); await O.waitForSelector('[data-tab]');
  await tab(O, 'answers');
  ok('   everyone signed in reads it', /got the job/.test(await text(O, '#answers')));
  await PA.reload({ waitUntil: 'networkidle2' }); await PA.waitForSelector('[data-tab]');
  await tab(PA, 'answers');
  await tap(PA, '[data-hide="' + an.id + '"]');
  await until(async () => (await list('prayerAnswers'))[0].hidden === true);
  await O.reload({ waitUntil: 'networkidle2' }); await O.waitForSelector('[data-tab]');
  await tab(O, 'answers');
  ok('   the pastoral team can hide one, and then it is gone for others', !/got the job/.test(await text(O, '#answers')));
  await A.screenshot({ path: path.join(HERE, 'prayer-mine-375.png'), fullPage: true });

  /* ---------- 1 (again). a phone that cannot listen ---------- */
  const N = await as('oli', { listen: false });
  const no = await N.evaluate(() => ({ btn: getComputedStyle(document.getElementById('pr-speak')).display, said: document.getElementById('pr-said').textContent }));
  ok('1. A PHONE THAT CANNOT LISTEN: no dead button, and where the keyboard microphone is', no.btn === 'none' && /microphone on your phone's keyboard/.test(no.said), J(no));

  /* ---------- 6. asked again at the moment of sending ---------- */
  const L = await as('oli');
  await L.$eval('#pr-text', t => { t.value = 'LATE: sent after the form closed (invented)'; });
  await L.evaluate(() => { EGBCLaunch.check = () => Promise.resolve({ locked: false, opensOn: '1 November 2026' }); });
  await tap(L, '#pr-go');
  await until(() => L.$('#ask #not-yet'));
  await sleep(800);
  ok('6. NOT OPEN AT THE MOMENT OF SENDING: nothing saved, and it says when it opens', !(await list('prayers')).some(p => /LATE/.test(p.text)) && /opens on 1 November 2026/.test(await text(L, '#ask')), await text(L, '#ask'));

  /* ---------- 5. switched off ---------- */
  const F = await as('ann', { off: true });
  ok('5. switched off for the church: not used', /not used by this church/.test(await text(F, '#main')));

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
