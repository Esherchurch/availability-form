/* The "Ask" box in every page's help panel (egbc-help.js; ENGINEERING.md 8a).
 *
 *   helpAsk  callable { page, question } -> { answer, known }
 *
 * It answers from that page's help text and nothing else: help-texts.json,
 * built from help/<page>.md by tools/help-build.mjs. The AI is never given
 * church data - only the help text, the question, and the kinds of job this
 * person does (so it can say "you'd need to be in the office for that"),
 * never a name. When the help doesn't cover it, it says it doesn't know and
 * who to ask.
 *
 * The key is the hub's own CHQ_ANTHROPIC_API_KEY, with the same caps, log
 * and set-up checks as the safeguarding and risk assessment AI (ra-ai.js).
 * The question is sent to Anthropic's API and nowhere else: helpAiLog
 * keeps the page, the length and the outcome, never the words.
 */
import { createRequire } from 'node:module';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { CHQ_ANTHROPIC_API_KEY } from './sg-ai.js';
import { aiPlumbing, callModel } from './ra-ai.js';
import { churchOf } from './church-scope.js';
import { readTeamJobs, onJob, JOBS } from './team-jobs.js';

const require = createRequire(import.meta.url);
const HELP = require('./help-texts.json').pages;
const REGION = 'europe-west2';
const MODEL = 'claude-haiku-5-5';
const LIMIT = 500;
const CAP = { perChurch: 400, perPerson: 40 };
const day = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const NOT_SET_UP = 'The help AI isn\'t set up yet. Ask the church office.';

const { apiOf, logIt, broken, noteWorking, callFailed, takeOne } = aiPlumbing({ secret: CHQ_ANTHROPIC_API_KEY, day,
  records: { use: 'helpAiUse', log: 'helpAiLog', state: 'helpAiState', stub: 'helpAiStub' }, words: { setup: NOT_SET_UP } });

const SYSTEM = [
  'You answer questions about one page of Church HQ, a church\'s web app, for someone using that page.',
  'Answer ONLY from the help text below. Do not use anything else you know about Church HQ, churches or the person.',
  'If the help text does not answer the question, start your reply with "I don\'t know" and then say who to ask, taking it from the help\'s "Who to ask" part, or "the church office" if it has none.',
  'You are told what kinds of job the person does. If the help says something needs a job they don\'t have, say so kindly and say who could do it for them.',
  'Write in plain, friendly British English. Keep it short: a few sentences, or a short numbered list for steps. No headings. Never make up buttons, pages or settings.'
].join('\n');

/** What this person can do, in words, for the AI: kinds of job only, never names or teams. @returns {Promise<string>} */
export async function accessOf(db, u) {
  if (!u || u.status !== 'active') return 'Signed in, but not yet an active member of the hub.';
  const parts = [];
  if (u.masterAdmin === true) parts.push('a master admin (can do everything)');
  if ((u.adminFor || []).length) parts.push('a team leader');
  const tj = await readTeamJobs(db);
  const mine = (u.teams || []).concat(u.covers || []);
  const jobs = JOBS.filter((j) => onJob(tj.map, mine, j.id, tj.set)).map((j) => j.means);
  if (jobs.length) parts.push('on teams that do: ' + jobs.join('; '));
  return parts.length ? 'This person is ' + parts.join(', and ') + '.' : 'This person is an ordinary member, with no admin or office jobs.';
}

/** The request sent to the model: the help text is cached, the question and access are not. */
export function requestFor(help, access, question) {
  return {
    model: MODEL, max_tokens: 700,
    system: [{ type: 'text', text: SYSTEM }, { type: 'text', text: 'THE HELP TEXT:\n\n' + help, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: access + '\n\nTheir question: ' + question }]
  };
}

/** The work, apart from the callable wrapper, so a test can hand it a stand-in model. */
export async function askHelp({ db, uid, data, call = callModel }) {
  const page = String((data || {}).page || '').toLowerCase();
  const question = String((data || {}).question || '').trim();
  if (!/^[a-z0-9-]{1,60}$/.test(page)) throw new HttpsError('invalid-argument', 'Which page?');
  if (!question) throw new HttpsError('invalid-argument', 'Type a question first.');
  if (question.length > LIMIT) throw new HttpsError('invalid-argument', 'Keep it to ' + LIMIT + ' characters.');
  const help = HELP[page];
  if (!help) return { known: false, answer: 'There\'s no help written for this page yet, so I don\'t know. Ask the church office.' };
  const u = (await db.collection('users').doc(uid).get()).data();
  if (!u || u.status !== 'active') throw new HttpsError('permission-denied', 'Ask is for the church\'s signed-in members.');
  const key = await apiOf(db);
  if (!key.apiKey || (await broken(db, key.apiKey))) throw new HttpsError('failed-precondition', NOT_SET_UP);
  const base = { siteId: '', calEventId: '', by: uid, byName: '', chars: question.length, kind: 'help:' + page };
  if (!(await takeOne(db, uid, CAP))) throw new HttpsError('resource-exhausted', 'That\'s as many questions as the help can answer today. Ask the church office.');
  let res;
  try {
    res = await call({ apiKey: key.apiKey, baseURL: key.baseURL, request: requestFor(help, await accessOf(db, u), question) });
  } catch (e) {
    const err = await callFailed(db, e, key, base, 'helpAsk');
    throw err.code === 'failed-precondition' ? err : new HttpsError('unavailable', 'The help AI could not be reached just now. Try again in a minute.');
  }
  await noteWorking(db, key.apiKey);
  const answer = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const usage = res.usage || {};
  await logIt(db, Object.assign({ outcome: 'answered', tokensIn: usage.input_tokens || 0, tokensOut: usage.output_tokens || 0 }, base));
  return { known: !/^I don.t know/i.test(answer), answer: answer || 'I don\'t know. Ask the church office.' };
}

export const helpAsk = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY], timeoutSeconds: 60 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const ch = churchOf(req, getFirestore());
  return askHelp({ db: ch.db, uid: req.auth.uid, data: req.data });
});
