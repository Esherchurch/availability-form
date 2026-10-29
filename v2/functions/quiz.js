/* ===================================================================
   THE QUIZ, PHONES MODE (F-255): players join with a code and a nickname,
   no account, no sign-in (anonymous sign-in stays OFF - the reviewer, 21 Oct)
   ===================================================================

   A run lives at quizRuns/{runId} (runId unguessable): the question being
   asked WITHOUT its right answer, nicknames and scores. Anyone with the id
   may read it (quiz.html follows it live); only these functions write it.
   Everything else is server-only (no rule = no page): quizCodes (the 6-digit
   code -> the run), quizPlayers (each player's key, hashed), quizAnswers,
   quizSecret (the questions with their right answers, and each question's
   mixed order).

   The presenter (a leader of the session's group, or a master admin), or
   in ChurchShow's Lesson mode a paired ChurchShow computer in the building
   the session's group meets in, with that group among its lesson groups
   (lessonFor gives it the session and step):
     quizStart  { sessionId, step }   -> { runId, code, join }   held until the hub goes live
     quizOpen   { runId, q }          question q: mixed answers, the clock starts
     quizReveal { runId }             the right answer; points; counts
     quizPhase  { runId, phase }      'board' (the leaderboard) or 'final'
     quizKick   { runId, pid }        a rude nickname: removed; its key stops working
     quizEnd    { runId }             everything deleted, at once
   A player (plain web requests, no sign-in - quiz.html):
     quizJoin   { code, name }        -> { runId, pid, key, name }
     quizAnswer { runId, pid, key, q, choice }   once per question, in time
   quizSweep, hourly: any run older than 24 hours is deleted, whatever.
   Each church's quiz is in its own data: the presenter's church comes from
   their sign-in, a player's from the address they joined at
   (<slug>.churchhq.co.uk/quiz), never from the request. The run keeps
   that address as join, for the screen to show.
   Points: 500 for right, plus up to 500 for speed, timed here.
   =================================================================== */
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'node:crypto';
import { mayPresent } from './present.js';
import { featureOn } from './features.js';
import { usesPart } from './parts.js';
import { churchOf, eachChurch } from './church-scope.js';
import { dbForAddress } from './church-address.js';
import { hubAddressOf } from './hub-address.js';
import { pairedDevice } from './lesson.js';

const REGION = 'europe-west2';
const db = () => getFirestore();
const MAX_QUESTIONS = 500, MAX_PLAYERS = 200, GRACE_MS = 1500, DAY_MS = 24 * 3600 * 1000;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const rid = (n) => crypto.randomBytes(n).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, n);

/* Nicknames: plain, short, and not rude. The leader removes anything this misses. */
const RUDE = ['fuck', 'shit', 'cunt', 'bitch', 'bastard', 'dick', 'cock', 'pussy', 'wank', 'twat', 'bollock', 'slut', 'whore', 'nigg', 'fag', 'retard', 'piss', 'tits', 'arsehole', 'asshole', 'prick', 'spunk', 'rape', 'nazi', 'hitler'];
export function cleanName(raw) {
  const n = String(raw || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (!n) return { error: 'Type a first name or a nickname.' };
  const flat = n.toLowerCase().replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
  if (RUDE.some((w) => flat.includes(w))) return { error: 'Please choose another name.' };
  return { name: n };
}
/* The right answer is written first in the planner; on screen they are mixed. */
function perm(n) { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function points(right, ms, seconds) { return right ? 500 + Math.round(500 * Math.max(0, 1 - ms / (Math.max(1, seconds) * 1000))) : 0; }

/** Whether the church counts as live (its rules are on), so phones may join. */
export async function launched(D) { const l = await D.collection('churchSettings').doc('launch').get().catch(() => null); return !!(l && l.exists && l.data().rulesLocked === true); }
async function presenterOf(req, runId) {
  const D = churchOf(req, db()).db;
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');
  if (!/^[A-Za-z0-9]{16,40}$/.test(String(runId || ''))) throw new HttpsError('invalid-argument', 'Which quiz?');
  const ref = D.collection('quizRuns').doc(String(runId)), run = (await ref.get()).data();
  if (!run) throw new HttpsError('not-found', 'That quiz has ended.');
  if (!(await mayRun(D, req, run.ctx))) throw new HttpsError('permission-denied', 'Only the people who may present here can run the quiz.');
  return { D, ref, run };
}

/* A person who may present the session; or a paired ChurchShow computer
   (Lesson mode) in the building the session's group meets in - the same
   lessons lessonFor gives it, and no others. */
async function mayRun(D, req, ctx) {
  if (req.auth && req.auth.token && req.auth.token.device === 'churchshow') {
    const dev = await pairedDevice(req, D);
    const g = (await D.collection('planGroups').doc(String(ctx.groupId || '-')).get()).data();
    return !!(g && !g.archived && String(g.siteId || '') === dev.siteId && dev.lessonGroups.includes(String(ctx.groupId)));
  }
  return mayPresent(D, req.auth.uid, ctx);
}

export const quizStart = onCall({ region: REGION }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');
  const { sessionId, step } = req.data || {};
  const D = churchOf(req, db()).db;
  const s = (await D.collection('planSessions').doc(String(sessionId || '-')).get()).data();
  if (!s) throw new HttpsError('not-found', 'That session could not be found.');
  const ctx = { type: 'session', groupId: s.groupId, sessionId: String(sessionId) };
  if (!(await mayRun(D, req, ctx))) throw new HttpsError('permission-denied', 'Only the people who may present here can run the quiz.');
  if (!(await usesPart(D, 'kids'))) throw new HttpsError('failed-precondition', 'This church doesn\u2019t use Kids and youth.');
  if (!(await featureOn(D, 'quiz'))) throw new HttpsError('failed-precondition', 'The quiz is switched off for this church (Church settings).');
  if (!(await launched(D))) throw new HttpsError('failed-precondition', 'The quiz on phones can be used when the hub goes live. Play in teams on the TV until then.');
  const m = String(step || '').match(/^p(\d+)s(\d+)$/), st = m && ((s.parts || [])[+m[1]] || {}).show && s.parts[+m[1]].show[+m[2]];
  if (!st || st.type !== 'quiz' || !(st.questions || []).length) throw new HttpsError('not-found', 'That quiz could not be found in the session.');
  const questions = st.questions.slice(0, MAX_QUESTIONS).map((x) => ({ q: String(x.q || '').slice(0, 160), answers: (x.answers || []).slice(0, 4).map((a) => String(a).slice(0, 60)), seconds: Math.max(5, Math.min(120, +x.seconds || 20)) })).filter((x) => x.q && x.answers.length >= 2);
  if (!questions.length) throw new HttpsError('failed-precondition', 'The quiz has no questions yet.');
  const runId = rid(24);
  let code = '';
  for (let i = 0; i < 20 && !code; i++) {
    const c = String(crypto.randomInt(100000, 1000000));
    try { await D.collection('quizCodes').doc(c).create({ runId, at: Date.now() }); code = c; } catch (e) { /* taken: another */ }
  }
  if (!code) throw new HttpsError('resource-exhausted', 'No code free just now; try again.');
  await D.collection('quizSecret').doc(runId).set({ questions, order: {}, step: String(step) });
  /* where players join: the church's own address, as the screen shows it */
  const join = (await hubAddressOf(D)).url.replace(/^https:\/\//, '').replace(/\/$/, '') + '/quiz';
  await D.collection('quizRuns').doc(runId).set({ code, join, ctx, title: String(st.title || 'Quiz').slice(0, 80), total: questions.length, phase: 'join', q: -1,
    question: null, reveal: null, players: {}, scores: {}, last: {}, removed: [], count: 0, answered: 0, createdAt: Date.now(), by: uid });
  return { runId, code, join };
});

export const quizOpen = onCall({ region: REGION }, async (req) => {
  const { D, ref } = await presenterOf(req, (req.data || {}).runId);
  const q = +(req.data || {}).q;
  const sec = (await D.collection('quizSecret').doc(ref.id).get()).data();
  if (!sec || !Number.isInteger(q) || q < 0 || q >= sec.questions.length) throw new HttpsError('invalid-argument', 'Which question?');
  const x = sec.questions[q], order = perm(x.answers.length), now = Date.now();
  await D.collection('quizSecret').doc(ref.id).update({ ['order.' + q]: order });
  await ref.update({ phase: 'question', q, answered: 0, reveal: null, last: {},
    question: { text: x.q, answers: order.map((i) => x.answers[i]), seconds: x.seconds, openedAt: now, openUntil: now + x.seconds * 1000 } });
  return { ok: true, openedAt: now };
});

export const quizReveal = onCall({ region: REGION }, async (req) => {
  const { D, ref, run } = await presenterOf(req, (req.data || {}).runId);
  if (!run.question || run.q < 0) throw new HttpsError('failed-precondition', 'No question is open.');
  const sec = (await D.collection('quizSecret').doc(ref.id).get()).data(), order = sec.order[run.q] || [];
  const right = order.indexOf(0), counts = run.question.answers.map(() => 0), scores = Object.assign({}, run.scores), last = {};
  const ans = await D.collection('quizAnswers').where('runId', '==', ref.id).where('q', '==', run.q).get();
  for (const d of ans.docs) {
    const a = d.data(); if (!(a.pid in run.players)) continue;
    counts[a.choice] = (counts[a.choice] || 0) + 1;
    const pts = points(a.choice === right, a.ms, run.question.seconds);
    scores[a.pid] = (scores[a.pid] || 0) + pts; last[a.pid] = { right: a.choice === right, points: pts, choice: a.choice };
  }
  for (const pid of Object.keys(run.players)) if (!last[pid]) last[pid] = { right: false, points: 0, choice: -1 };
  await ref.update({ phase: 'answer', reveal: { right, counts }, scores, last, 'question.openUntil': Math.min(run.question.openUntil, Date.now()) });
  return { right, counts };
});

export const quizPhase = onCall({ region: REGION }, async (req) => {
  const { ref } = await presenterOf(req, (req.data || {}).runId);
  const phase = String((req.data || {}).phase || '');
  if (!['board', 'final', 'join'].includes(phase)) throw new HttpsError('invalid-argument', 'Which?');
  await ref.update({ phase });
  return { ok: true };
});

export const quizKick = onCall({ region: REGION }, async (req) => {
  const { D, ref, run } = await presenterOf(req, (req.data || {}).runId);
  const pid = String((req.data || {}).pid || '');
  if (!(pid in (run.players || {}))) throw new HttpsError('not-found', 'That name has gone already.');
  await D.collection('quizPlayers').doc(ref.id + '_' + pid).delete().catch(() => {});
  await ref.update({ ['players.' + pid]: FieldValue.delete(), ['scores.' + pid]: FieldValue.delete(), ['last.' + pid]: FieldValue.delete(), removed: FieldValue.arrayUnion(pid), count: FieldValue.increment(-1) });
  return { ok: true };
});

export async function deleteRun(d, runId) {
  const run = (await d.collection('quizRuns').doc(runId).get()).data();
  for (const c of ['quizAnswers', 'quizPlayers']) {
    for (;;) { const s = await d.collection(c).where('runId', '==', runId).limit(300).get(); if (s.empty) break; const b = d.batch(); s.docs.forEach((x) => b.delete(x.ref)); await b.commit(); }
  }
  await d.collection('quizSecret').doc(runId).delete().catch(() => {});
  if (run && run.code) { const c = await d.collection('quizCodes').doc(run.code).get(); if (c.exists && c.data().runId === runId) await c.ref.delete(); }
  await d.collection('quizRuns').doc(runId).delete();
}
export const quizEnd = onCall({ region: REGION }, async (req) => {
  const { D, ref } = await presenterOf(req, (req.data || {}).runId);
  await deleteRun(D, ref.id);
  return { ok: true };
});

/* Players: plain web requests, no account (CORS: the hub's pages anywhere). */
function body(req) { try { return typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}'); } catch (e) { return {}; } }
const send = (res, code, obj) => res.status(code).json(obj);

export const quizJoin = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only.' });
  const b = body(req), code = String(b.code || '').replace(/\D/g, '');
  if (code.length !== 6) return send(res, 400, { ok: false, error: 'The code is 6 numbers, on the screen.' });
  const D = await dbForAddress(db(), req);
  if (!D) return send(res, 404, { ok: false, error: 'There is no church at this address.' });
  const c = (await D.collection('quizCodes').doc(code).get()).data();
  const ref = c && D.collection('quizRuns').doc(c.runId), run = ref && (await ref.get()).data();
  if (!run || run.phase === 'final') return send(res, 404, { ok: false, error: 'No quiz with that code is running. Check the code on the screen.' });
  if ((run.count || 0) >= MAX_PLAYERS) return send(res, 409, { ok: false, error: 'This quiz is full.' });
  const nm = cleanName(b.name); if (nm.error) return send(res, 400, { ok: false, error: nm.error });
  const taken = new Set(Object.values(run.players || {}).map((p) => p.name.toLowerCase()));
  let name = nm.name; for (let i = 2; taken.has(name.toLowerCase()) && i < 100; i++) name = nm.name.slice(0, 17) + ' ' + i;
  const pid = rid(10), key = rid(32);
  await D.collection('quizPlayers').doc(ref.id + '_' + pid).set({ runId: ref.id, pid, keyHash: sha(key), at: Date.now() });
  await ref.update({ ['players.' + pid]: { name }, ['scores.' + pid]: 0, count: FieldValue.increment(1) });
  return send(res, 200, { ok: true, runId: ref.id, pid, key, name, now: Date.now() });
});

export const quizAnswer = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only.' });
  const b = body(req), runId = String(b.runId || ''), pid = String(b.pid || ''), now = Date.now();
  if (!/^[A-Za-z0-9]{16,40}$/.test(runId) || !/^[A-Za-z0-9]{4,20}$/.test(pid)) return send(res, 400, { ok: false, error: 'Join again.' });
  const D = await dbForAddress(db(), req);
  if (!D) return send(res, 404, { ok: false, error: 'There is no church at this address.' });
  const p = (await D.collection('quizPlayers').doc(runId + '_' + pid).get()).data();
  if (!p || p.keyHash !== sha(b.key)) return send(res, 403, { ok: false, error: 'removed', words: 'This name was removed. Join again with another name.' });
  const ref = D.collection('quizRuns').doc(runId), run = (await ref.get()).data();
  if (!run || run.phase !== 'question' || run.q !== +b.q || !run.question) return send(res, 409, { ok: false, error: 'closed', words: 'That question has closed.' });
  if (now > run.question.openUntil + GRACE_MS) return send(res, 409, { ok: false, error: 'late', words: 'Too late for that one.' });
  const choice = +b.choice;
  if (!Number.isInteger(choice) || choice < 0 || choice >= run.question.answers.length) return send(res, 400, { ok: false, error: 'Which answer?' });
  try { await D.collection('quizAnswers').doc(runId + '_' + run.q + '_' + pid).create({ runId, q: run.q, pid, choice, ms: Math.max(0, now - run.question.openedAt) }); }
  catch (e) { return send(res, 409, { ok: false, error: 'already', words: 'You have answered this one.' }); }
  await ref.update({ answered: FieldValue.increment(1) });
  return send(res, 200, { ok: true });
});

export async function runQuizSweep(D, now = Date.now()) {
  const old = await D.collection('quizRuns').where('createdAt', '<', now - DAY_MS).get();
  for (const d of old.docs) await deleteRun(D, d.id);
  /* a code or a key left without its run (a crash part way) goes too */
  for (const c of ['quizCodes', 'quizPlayers']) {
    const s = await D.collection(c).where('at', '<', now - DAY_MS).get();
    for (const x of s.docs) await x.ref.delete();
  }
  return old.docs.map((d) => d.id);
}
export const quizSweep = onSchedule({ region: REGION, schedule: 'every 60 minutes', retryCount: 1 }, async () => { await eachChurch(db(), (ch) => runQuizSweep(ch.db)); });
