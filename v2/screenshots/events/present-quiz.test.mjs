/* THE QUIZ (F-255): in Present, TV mode and phones mode. Events window.
   Invented people and questions only; events emulators (with the hub's
   functions); the network guard. Players have no account (anonymous
   sign-in stays off): each plays in its own private browser window.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/present-quiz.test.mjs"

   What it proves:
     1. the presenter reaches the quiz and chooses: teams on the TV, or phones
     2. TV MODE: the TV shows the question, A-D (the same mixed order on every
        screen), a countdown and the teams; the leader shows the answer, taps
        who got it right, and the bonus for the first; the scores add up;
        the final scores; only the presenter can change any of it (the rules)
     3. PHONES MODE: not before switch-over; a code, a QR code and the short
        address on the TV; players join with a nickname (a rude one refused,
        a taken one numbered); the leader removes a name and its key stops
        working; the question on the phones in the TV's order; the RIGHT
        ANSWER CANNOT BE READ from a phone before it is shown; one answer
        each, none late; points for right and quick; the leaderboard;
        only the presenter runs it
     4. NOTHING KEPT: "End" deletes the run, the code, the keys and the
        answers; the hourly sweep deletes a run older than 24 hours
     5. screenshots of the real thing */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
import { cleanName, points, runQuizSweep } from '../../functions/quiz.js';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-quiz-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const FN = 'http://127.0.0.1:5102/' + PROJECT + '/europe-west2/';

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 700))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(150); } return last; }
const J = (x) => JSON.stringify(x);
const post = (name, body) => fetch(FN + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J(body) }).then(r => r.json());

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';

/* ---------- the church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  karen: { name: 'Karen Leader (invented)', mid: 'm_karen', teams: ['Kids Church'] },
  lois:  { name: 'Lois Leader (invented)', mid: 'm_lois', teams: ['Kids Church'] },
  tom:   { name: 'Tom Team (invented)', mid: 'm_tom', teams: ['Kids Church'] }
};
for (const k of Object.keys(P)) {
  P[k].email = k + '.quiz@example.invalid';
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
}
await db.collection('teams').doc('Kids Church').set({ name: 'Kids Church', label: 'Kids Church', rota: true, order: 1 });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church' });
await db.collection('churchSettings').doc('launch').set({ rulesLocked: false });
await db.collection('planGroups').doc('pg_kids').set({ name: 'Kids Church', kind: 'children', leaderIds: ['m_karen', 'm_lois'], teamName: 'Kids Church' });
const QS = [
  { q: 'When did Nicodemus come to see Jesus?', answers: ['At night', 'In the morning', 'At noon', 'He never came'], right: 0, seconds: 20 },
  { q: 'Who did Nicodemus come to see?', answers: ['Jesus', 'Peter', 'Paul', 'Pilate'], right: 0, seconds: 8 },
  { q: 'What must we be, Jesus said?', answers: ['Born again', 'Rich', 'Tall', 'Quiet'], right: 0, seconds: 20 }
];
await db.collection('planSessions').doc('ps_q').set({ groupId: 'pg_kids', date: '2026-11-15', title: 'Born again?', updatedBy: P.karen.uid,
  parts: [{ id: 'p1', title: 'Quiz time', show: [{ type: 'text', words: 'Welcome, everyone' }, { type: 'quiz', name: 'Nicodemus at night', questions: QS, title: '3 questions' }] }] });

const errors = [], browsers = [];
async function as(who, w = 375, h = 812) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: w, height: h });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(500);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (pg, sel) => pg.$eval(sel, e => e.click());
const answersOn = (pg, sel) => pg.$$eval(sel, (as) => as.map(a => a.innerText.replace(/^\s*[A-D]\s*/, '').replace(/\s*[\d✓]+\s*$/, '').replace(/\s+/g, ' ').trim()));

try {
  /* ---------- 0. the parts on their own ---------- */
  ok('0. NICKNAMES: plain ones kept; rude ones refused, even dressed up', cleanName('Captain Kev').name === 'Captain Kev' && !!cleanName('Fuck face').error && !!cleanName('Sh1t head').error && !!cleanName('   ').error && cleanName('A'.repeat(30)).name.length === 20);
  ok('   POINTS: 500 for right, up to 500 more for speed, nothing for wrong', points(true, 0, 20) === 1000 && points(true, 10000, 20) === 750 && points(true, 30000, 20) === 500 && points(false, 100, 20) === 0);

  /* ---------- 1. reaching the quiz ---------- */
  const karen = await as('karen', 1440, 900);
  await karen.goto(URLB + 'present.html?s=ps_q', { waitUntil: 'networkidle2' });
  await until(() => karen.$('[data-start]'));
  await tap(karen, '[data-start]');
  await until(() => karen.$('[data-go]'));
  const tv = await as('lois', 1280, 720);
  await tv.goto(URLB + 'present.html?s=ps_q&tv=1', { waitUntil: 'networkidle2' });
  const tom = await as('tom', 375, 812);
  await tom.goto(URLB + 'present.html?s=ps_q', { waitUntil: 'networkidle2' });
  await tap(karen, '[data-go]');
  await until(async () => /Nicodemus at night/.test(await text(tv, '#pzStage')) && /Nicodemus at night/.test(await text(tom, '#pzStage')));
  ok('1. THE QUIZ IS AN ITEM IN PRESENT: its title card on the TV and the phones', /QUIZ.*Nicodemus at night.*3 questions/.test(await text(tv, '#pzStage')), await text(tv, '#pzStage'));
  ok('   the presenter chooses: teams on the TV, or phones', !!(await karen.$('[data-qtv]')) && !!(await karen.$('[data-qphones]')) && !(await tom.$('[data-qtv]')));

  /* ---------- 3a. phones mode before switch-over ---------- */
  await tap(karen, '[data-qphones]');
  await until(async () => /switches over/.test(await text(karen, '[data-qerr]')));
  ok('3. PHONES MODE BEFORE SWITCH-OVER: refused in words; teams on the TV still work', /switches over/.test(await text(karen, '[data-qerr]')) && (await db.collection('quizRuns').get()).size === 0, await text(karen, '[data-qerr]'));

  /* the switch: off, the server refuses too */
  await db.collection('churchSettings').doc('features').set({ quiz: false });
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });
  const off = await karen.evaluate(() => EGBCAuth.call('quizStart', { sessionId: 'ps_q', step: 'p0s1' }).then(() => 'started', e => e.message));
  ok('   THE SWITCH: with quiz off, the server will not start one', /switched off/.test(off), off);
  await db.collection('churchSettings').doc('features').delete();
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: false });
  /* ---------- 2. TV mode ---------- */
  await tap(karen, '[data-qtv]');
  await until(() => karen.$('[data-qgo]'));
  await karen.$eval('[data-qbonus]', e => { e.checked = true; e.dispatchEvent(new Event('change')); });
  await until(async () => (await db.collection('presentNow').doc('ps_ps_q').get()).data().quiz.bonus === true);
  await until(() => karen.$('[data-qgo]'));
  await tap(karen, '[data-qgo]');
  await until(async () => (await tv.$$('#pzStage .qz .ans')).length === 4);
  const tvA = await answersOn(tv, '#pzStage .qz .ans'), tomA = await answersOn(tom, '#pzStage .qz .ans');
  const kA = await karen.$$eval('[data-qpanel] .ans', (as) => as.map(a => a.innerText.replace(/^[A-D] · /, '').replace(/\s*✓ right$/, '').trim()));
  ok('2. TV MODE: the question and A-D on the TV, with a countdown and the teams', /When did Nicodemus/.test(await text(tv, '#pzStage')) && !!(await tv.$('#pzStage [data-qclock]')) && /Lions.*Eagles.*Bears/.test(await text(tv, '#pzStage .teams')), await text(tv, '#pzStage'));
  ok('   THE SAME MIXED ORDER on the TV, a phone and the leader\u2019s screen', J(tvA) === J(tomA) && J(tvA) === J(kA) && tvA.length === 4 && J([...tvA].sort()) === J([...QS[0].answers].sort()), J({ tvA, tomA, kA }));
  ok('   the leader\u2019s screen marks the right answer; the TV does not, yet', /At night/.test(await text(karen, '[data-qpanel] .ans.ok')) && !(await tv.$('#pzStage .ans.ok')));
  await tv.screenshot({ path: path.join(HERE, 'quiz-real-tv-question.png') });
  await tap(karen, '[data-qshow]');
  await until(async () => /At night/.test(await text(tv, '#pzStage .ans.ok')));
  ok('   SHOW THE ANSWER: the TV highlights it', /At night/.test(await text(tv, '#pzStage .ans.ok')));
  for (const sel of ['[data-qgot="0"]', '[data-qgot="2"]', '[data-qfirst="2"]']) {
    await until(() => karen.$(sel)); await tap(karen, sel);
    await until(async () => { const q = (await db.collection('presentNow').doc('ps_ps_q').get()).data().quiz; return sel.includes('first') ? q.first === 2 : (q.got || []).includes(+sel.match(/\d/)[0]); });
  }
  await karen.screenshot({ path: path.join(HERE, 'quiz-real-leader-teams-desk.png') });
  await karen.setViewport({ width: 375, height: 812 }); await sleep(500);
  await karen.screenshot({ path: path.join(HERE, 'quiz-real-leader-teams-375.png'), fullPage: true });
  await karen.setViewport({ width: 1440, height: 900 }); await sleep(300);
  const tomWrite = await tom.evaluate(() => EGBCAuth.db.collection('presentNow').doc('ps_ps_q').update({ quiz: null }).then(() => 'written', e => e.code));
  ok('   ONLY THE PRESENTER changes the quiz (a team member\u2019s write is refused)', tomWrite === 'permission-denied', tomWrite);
  await tap(karen, '[data-qnext]');
  await until(async () => (await db.collection('presentNow').doc('ps_ps_q').get()).data().quiz.q === 1);
  const sc = (await db.collection('presentNow').doc('ps_ps_q').get()).data().quiz.teams.map(t => t.name + ' ' + t.score);
  ok('   THE SCORES: 1 a team for a right answer, and the bonus for the first (Lions 1, Eagles 0, Bears 2)', J(sc) === J(['Lions 1', 'Eagles 0', 'Bears 2']), J(sc));
  await until(() => karen.$('[data-qscores]')); await tap(karen, '[data-qscores]');
  await until(async () => /After question 2/.test(await text(tv, '#pzStage')));
  ok('   SHOW THE SCORES: the TV shows them, highest first', /1 · Bears 2.*2 · Lions 1/.test(await text(tv, '#pzStage')), await text(tv, '#pzStage'));
  await until(() => karen.$('[data-qnext]')); await tap(karen, '[data-qnext]');
  await until(async () => (await db.collection('presentNow').doc('ps_ps_q').get()).data().quiz.q === 2);
  await until(() => karen.$('[data-qnext]')); await tap(karen, '[data-qnext]');
  await until(async () => /Final scores/.test(await text(tv, '#pzStage')));
  ok('   THE END: the final scores on the TV', /Final scores.*Bears/.test(await text(tv, '#pzStage')), await text(tv, '#pzStage'));
  await until(() => karen.$('[data-qclose]')); await tap(karen, '[data-qclose]');
  await until(async () => !(await db.collection('presentNow').doc('ps_ps_q').get()).data().quiz);
  ok('   "Finish the quiz": nothing is left (TV mode stores nothing else)', (await db.collection('quizRuns').get()).size === 0);

  /* ---------- 3. phones mode ---------- */
  await db.collection('churchSettings').doc('launch').set({ rulesLocked: true });
  await until(() => karen.$('[data-qphones]'));
  await tap(karen, '[data-qphones]');
  await until(async () => /\d{3} \d{3}/.test(await text(tv, '#pzStage [data-qcode]')));
  const run0 = (await db.collection('quizRuns').get()).docs[0], runId = run0.id, code = run0.data().code;
  await until(() => tv.$('#pzStage [data-qr] img, #pzStage [data-qr] canvas'), 15000);
  const qrUrl = await tv.$eval('#pzStage [data-qr]', e => e.getAttribute('data-qr')).catch(() => '');
  ok('3. PHONES MODE: a 6-digit code, the short address and a QR code on the TV', /^\d{6}$/.test(code) && /churchhq\.co\.uk\/quiz/.test(await text(tv, '#pzStage [data-qshort]')) && qrUrl === 'https://churchhq.co.uk/quiz?c=' + code && !!(await tv.$('#pzStage [data-qr] img, #pzStage [data-qr] canvas')), J({ code, qrUrl }));
  await tv.screenshot({ path: path.join(HERE, 'quiz-real-tv-join.png') });
  /* the players: no account, each in its own private window */
  const pb = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-first-run'] }); browsers.push(pb); GUARD.watchBrowser(pb);
  async function player(label) { const c = await pb.createBrowserContext(); const pg = await c.newPage(); await GUARD.protect(pg, label); pg.on('pageerror', e => errors.push(label + ': ' + e.message)); await pg.setViewport({ width: 375, height: 812 }); await pg.goto(URLB + 'quiz.html?c=' + code, { waitUntil: 'networkidle2' }); return pg; }
  async function join(pg, name) { await until(() => pg.$('#name')); await pg.$eval('#name', (e, n) => { e.value = n; }, name); await tap(pg, '#join'); }
  const sam = await player('sam'), zoe = await player('zoe'), bad = await player('bad'), sam2 = await player('sam2');
  ok('   a player\u2019s phone opens with the code filled in, and asks only for a nickname', (await sam.$eval('#code', e => e.value)).replace(/\D/g, '') === code && !(await sam.$('input[type=email], input[type=password]')));
  await sam.screenshot({ path: path.join(HERE, 'quiz-real-phone-join-375.png') });
  await join(sam, 'Sam'); await join(zoe, 'Zoe'); await join(bad, 'Fuck face');
  await until(async () => /another name/.test(await text(bad, '#err')));
  ok('   A RUDE NICKNAME is refused, in words', /another name/.test(await text(bad, '#err')), await text(bad, '#err'));
  await join(bad, 'Bum Face'); await join(sam2, 'Sam');
  await until(async () => ((await db.collection('quizRuns').doc(runId).get()).data().count || 0) === 4);
  const names = Object.values((await db.collection('quizRuns').doc(runId).get()).data().players).map(p => p.name).sort();
  ok('   four in; a name already taken is numbered ("Sam 2")', J(names) === J(['Bum Face', 'Sam', 'Sam 2', 'Zoe']), J(names));
  await until(async () => /Here so far · 4/.test(await text(tv, '#pzStage')));
  ok('   the TV shows who\u2019s here', /Sam.*Zoe/.test(await text(tv, '#pzStage')) && /Here so far · 4/.test(await text(tv, '#pzStage')));
  /* removing a name */
  const badKey = await bad.evaluate(() => JSON.parse(sessionStorage.getItem('egbc_quiz_player')));
  await until(async () => (await karen.$$('[data-qkick]')).length === 4);
  const badBtn = await karen.$$eval('[data-qkick]', (bs) => (bs.find(b => /Bum Face/.test(b.innerText)) || {}).outerHTML || '');
  await karen.evaluate(() => [...document.querySelectorAll('[data-qkick]')].find(b => /Bum Face/.test(b.innerText)).click());
  await until(() => karen.$('[data-qkickyes]'));
  await karen.screenshot({ path: path.join(HERE, 'quiz-real-leader-remove-desk.png') });
  await karen.setViewport({ width: 375, height: 812 }); await sleep(500);
  await karen.screenshot({ path: path.join(HERE, 'quiz-real-leader-remove-375.png'), fullPage: true });
  await karen.setViewport({ width: 1440, height: 900 }); await sleep(300);
  await tap(karen, '[data-qkickyes]');
  await until(async () => /removed that name/.test(await text(bad)));
  ok('   THE LEADER REMOVES A NAME: that phone is told to join again with another name', /removed that name/.test(await text(bad)) && !!badBtn, await text(bad));
  /* question 1 */
  await until(() => karen.$('[data-qopen="0"]')); await tap(karen, '[data-qopen="0"]');
  await until(async () => (await sam.$$('[data-a]')).length === 4 && (await tv.$$('#pzStage .qz .ans')).length === 4);
  const tvP = await answersOn(tv, '#pzStage .qz .ans'), samP = await answersOn(sam, '[data-a]');
  ok('   QUESTION 1 on the phones, in the TV\u2019s order', J(tvP) === J(samP) && samP.length === 4, J({ tvP, samP }));
  const kicked = await post('quizAnswer', { runId, pid: badKey.pid, key: badKey.key, q: 0, choice: 0 });
  ok('   the removed name\u2019s key no longer works', kicked.error === 'removed', J(kicked));
  /* the right answer cannot be read before it is shown */
  const peek = await sam.evaluate((id) => Promise.all([
    EGBCAuth.db.collection('quizSecret').doc(id).get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('quizAnswers').get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('quizPlayers').get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('quizCodes').get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('quizRuns').get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('quizRuns').doc(id).get().then(d => JSON.stringify(d.data()), e => e.code)]), runId);
  const runSeen = JSON.parse(peek[5] || '{}');
  ok('   THE RIGHT ANSWER CANNOT BE READ FROM A PHONE before it is shown: the answers, keys, codes and the secret are refused; nobody lists runs', peek.slice(0, 5).every(x => x === 'permission-denied'), J(peek.slice(0, 5)));
  ok('   and the quiz\u2019s own document says nothing about which answer is right', runSeen.reveal === null && !/right|order/i.test(J(runSeen.question)) && runSeen.question && runSeen.question.answers.length === 4, J(runSeen.question));
  await sam.screenshot({ path: path.join(HERE, 'quiz-real-phone-answer-375.png') });
  const rightAt = samP.indexOf('At night'), wrongAt = (rightAt + 1) % 4;
  await tap(sam, '[data-a="' + rightAt + '"]');
  await until(async () => /Answer in/.test(await text(sam)));
  await tap(zoe, '[data-a="' + wrongAt + '"]');
  await until(async () => /Answer in/.test(await text(zoe)));
  const me = await sam.evaluate(() => JSON.parse(sessionStorage.getItem('egbc_quiz_player')));
  const again = await post('quizAnswer', { runId, pid: me.pid, key: me.key, q: 0, choice: wrongAt });
  ok('   ONE ANSWER EACH: a second answer is refused', again.error === 'already', J(again));
  await until(async () => ((await db.collection('quizRuns').doc(runId).get()).data().answered || 0) === 2);
  ok('   the leader sees how many have answered', /2 of 3 answered/.test(await text(karen, '[data-qpanel]')), await text(karen, '[data-qpanel]'));
  await tap(karen, '[data-qreveal]');
  await until(async () => /Right!/.test(await text(sam)) && /Not this time/.test(await text(zoe)));
  const samPts = +((await text(sam)).match(/\+ (\d+)/) || [])[1];
  ok('   SHOWN: Sam\u2019s phone says Right! with points for a quick answer; Zoe\u2019s says not this time', samPts > 500 && samPts <= 1000 && /Not this time/.test(await text(zoe)), J({ samPts, zoe: await text(zoe) }));
  ok('   the TV shows how many chose each answer, and the right one', /At night.*1/.test(await text(tv, '#pzStage .ans.ok')), await text(tv, '#pzStage'));
  await sam.screenshot({ path: path.join(HERE, 'quiz-real-phone-result-375.png') });
  await tap(karen, '[data-qboard]');
  await until(async () => /After question 1/.test(await text(tv, '#pzStage')));
  ok('   THE LEADERBOARD: Sam first, on the TV and on Sam\u2019s phone', /1 · Sam\b/.test(await text(tv, '#pzStage')) && /1 · Sam\b/.test(await text(sam)), await text(tv, '#pzStage'));
  await tv.screenshot({ path: path.join(HERE, 'quiz-real-tv-board.png') });
  /* only the presenter runs it */
  const tomRun = await tom.evaluate((id) => EGBCAuth.call('quizOpen', { runId: id, q: 1 }).then(() => 'opened', e => (e.code || '') + ' ' + e.message), runId);
  ok('   ONLY THE PRESENTER runs it: a team member cannot open a question', /permission/.test(tomRun), tomRun);
  /* question 2: too late */
  await until(() => karen.$('[data-qopen="1"]')); await tap(karen, '[data-qopen="1"]');
  await until(async () => (await db.collection('quizRuns').doc(runId).get()).data().q === 1);
  await sleep(10000);
  const z = await zoe.evaluate(() => JSON.parse(sessionStorage.getItem('egbc_quiz_player')));
  const late = await post('quizAnswer', { runId, pid: z.pid, key: z.key, q: 1, choice: 0 });
  ok('   A LATE ANSWER is refused (the server keeps the time)', late.error === 'late', J(late));
  await tap(karen, '[data-qreveal]');
  await until(() => karen.$('[data-qopen="2"]')); await tap(karen, '[data-qopen="2"]');
  await until(async () => (await db.collection('quizRuns').doc(runId).get()).data().q === 2);
  await tap(karen, '[data-qreveal]');
  await until(() => karen.$('[data-qfinal]')); await tap(karen, '[data-qfinal]');
  await until(async () => /Final scores/.test(await text(tv, '#pzStage')));
  ok('   FINAL SCORES on the TV and the phones', /Final scores/.test(await text(sam)), await text(sam));
  await karen.screenshot({ path: path.join(HERE, 'quiz-real-leader-phones-desk.png') });

  /* ---------- 4. nothing kept ---------- */
  await tap(karen, '[data-qend]');
  await until(async () => !(await db.collection('quizRuns').doc(runId).get()).exists);
  const left = await Promise.all([db.collection('quizCodes').doc(code).get().then(d => d.exists), db.collection('quizSecret').doc(runId).get().then(d => d.exists),
    db.collection('quizPlayers').where('runId', '==', runId).get().then(s => s.size), db.collection('quizAnswers').where('runId', '==', runId).get().then(s => s.size)]);
  ok('4. "END": the run, its code, the secret, every key and every answer are deleted', J(left) === J([false, false, 0, 0]), J(left));
  await until(async () => /Thanks for playing/.test(await text(sam)));
  ok('   the phones say so: everything has been deleted', /everything about it has been deleted/.test(await text(sam)), await text(sam));
  ok('   the presenter\u2019s quiz is cleared', !(await db.collection('presentNow').doc('ps_ps_q').get()).data().quiz);
  /* the sweep */
  const old = Date.now() - 25 * 3600 * 1000;
  await db.collection('quizRuns').doc('oldRun0000000000000000').set({ code: '111111', createdAt: old, phase: 'board', players: {} });
  await db.collection('quizCodes').doc('111111').set({ runId: 'oldRun0000000000000000', at: old });
  await db.collection('quizSecret').doc('oldRun0000000000000000').set({ questions: [] });
  await db.collection('quizPlayers').doc('oldRun0000000000000000_p1').set({ runId: 'oldRun0000000000000000', pid: 'p1', keyHash: 'x', at: old });
  await db.collection('quizAnswers').doc('oldRun0000000000000000_0_p1').set({ runId: 'oldRun0000000000000000', q: 0, pid: 'p1', choice: 1, ms: 5 });
  await db.collection('quizRuns').doc('newRun0000000000000000').set({ code: '222222', createdAt: Date.now(), phase: 'join', players: {} });
  const swept = await runQuizSweep();
  const still = await Promise.all(['quizRuns/oldRun0000000000000000', 'quizCodes/111111', 'quizSecret/oldRun0000000000000000', 'quizPlayers/oldRun0000000000000000_p1', 'quizAnswers/oldRun0000000000000000_0_p1', 'quizRuns/newRun0000000000000000'].map(p => db.doc(p).get().then(d => d.exists)));
  ok('   THE SWEEP: a run older than 24 hours goes, with everything of it; a new one stays', J(still) === J([false, false, false, false, false, true]), J({ swept, still }));
  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack + ' | page errors: ' + errors.join(' | '));
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
