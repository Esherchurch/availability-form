/* ===================================================================
   THE RISK ASSESSMENT ENGINE, the AI calls' plumbing (F-280 section 2,
   H&S step 1): moved unchanged from sg-ai.js. Each register makes its own
   with its own records, so its caps, log and "not working" state are its
   own (F-280 answer 9: separate from safeguarding's):
     aiPlumbing({ secret, day, records: { use, log, state, stub }, words })
       apiOf(db)            the key, or '' when not set up; on the emulator,
                            the local stand-in when a test has set one
       takeOne(db, uid, cap) today's use, counted in a transaction: false
                            when over a cap ({ perChurch, perPerson })
       logIt(db, x)         ids and counts only, never the words
       callFailed(db, e, key, base, what)
                            a key or set-up problem said plainly and
                            remembered; anything else "could not be reached"
       broken(db, apiKey)   "set up but not working" (the last call failed on
                            set-up, with this same key, in the last 6 hours)
       noteWorking(db, apiKey) a call worked: forget "not working"
       callModel(request)   one call; busy or overloaded retried on the same
                            model with backoff, nothing else is, inside BUDGET
   No other model is ever tried. The key is never kept: only a short
   fingerprint of it, to tell a changed key from the same one.
   =================================================================== */
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';

const BACKOFF = [1000, 3000, 8000];
/* A DRAFT TAKES 30-60 SECONDS (the reviewing window's live run: 46 s). The
   function may run 180 s; the page waits as long; the calls, retries
   included, must finish inside BUDGET so there is time to save. */
const BUDGET = 165000;
/* after this the box comes back, so one real attempt can find out whether it has been put right */
const BROKEN_FOR = 6 * 3600e3;

/* a key or set-up problem: the API refused the request itself, not because it was busy */
export function setupProblem(e) {
  return e instanceof Anthropic.BadRequestError || e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError;
}
export const fingerprint = (k) => createHash('sha256').update(String(k || '')).digest('hex').slice(0, 12);

/* the call: busy or overloaded is retried on the same model; nothing else is */
export async function callModel({ apiKey, baseURL, request }) {
  const client = new Anthropic({ apiKey, baseURL, maxRetries: 0, timeout: 120000 }), t0 = Date.now();
  for (let attempt = 0; ; attempt++) {
    const left = BUDGET - (Date.now() - t0);
    try {
      return await client.messages.create(request, { timeout: Math.max(5000, Math.min(120000, left)) });
    } catch (e) {
      const busy = e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError;
      if (!busy || attempt >= BACKOFF.length || BUDGET - (Date.now() - t0) < BACKOFF[attempt] + 20000) throw e;
      await new Promise((r) => setTimeout(r, BACKOFF[attempt]));
    }
  }
}

export function aiPlumbing({ secret, day, records, words }) {
  const stateRef = (dbi) => dbi.collection(records.state).doc('current');

  async function apiOf(dbi) {
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      const s = (await dbi.collection(records.stub).doc('config').get()).data();
      return s && s.url ? { apiKey: s.key || 'stub', baseURL: s.url } : { apiKey: '' };
    }
    const v = String(secret.value() || '').trim();
    return { apiKey: !v || v === 'NOT-SET' ? '' : v };
  }

  /* one place for the log: ids and counts only, never the words (and, for a failed call, the API's request id and error type) */
  function logIt(dbi, x) {
    return dbi.collection(records.log).add(Object.assign({ siteId: x.siteId, calEventId: x.calEventId, by: x.by, byName: String(x.byName || '').slice(0, 120), at: new Date().toISOString(),
      chars: x.chars || 0, outcome: x.outcome, tokensIn: x.tokensIn || 0, tokensOut: x.tokensOut || 0 }, x.kind ? { kind: x.kind } : {},
      x.requestId || x.errorType ? { requestId: String(x.requestId || '').slice(0, 80), errorType: String(x.errorType || '').slice(0, 60), status: x.status || 0 } : {})).catch(() => {});
  }

  async function broken(dbi, apiKey) {
    const s = (await stateRef(dbi).get()).data();
    return !!s && s.state === 'broken' && s.key === fingerprint(apiKey) && Date.now() - Date.parse(s.at || 0) < BROKEN_FOR;
  }
  async function noteWorking(dbi, apiKey) {
    if ((await stateRef(dbi).get()).exists) await stateRef(dbi).set({ state: 'ok', key: fingerprint(apiKey), at: new Date().toISOString() });
  }

  async function callFailed(dbi, e, key, base, what) {
    const err = { status: e.status || 0, requestId: e.requestID || '', errorType: e.type || e.name || '' };
    console.log(what + ': call failed for ' + base.calEventId + ' (' + err.status + ' ' + err.errorType + ', request ' + err.requestId + ')');
    if (setupProblem(e)) {
      await stateRef(dbi).set({ state: 'broken', key: fingerprint(key.apiKey), at: new Date().toISOString(), status: err.status, errorType: err.errorType, requestId: err.requestId });
      await logIt(dbi, Object.assign({ outcome: 'setup-failed' }, base, err));
      return new HttpsError('failed-precondition', words.setup);
    }
    await logIt(dbi, Object.assign({ outcome: 'failed' }, base, err));
    return new HttpsError('unavailable', 'The AI could not be reached just now; try again later, or use a template.');
  }

  async function takeOne(dbi, uid, cap) {
    const ref = dbi.collection(records.use).doc(day());
    return dbi.runTransaction(async (tx) => {
      const d = (await tx.get(ref)).data() || { total: 0, by: {} };
      if ((d.total || 0) >= cap.perChurch || ((d.by || {})[uid] || 0) >= cap.perPerson) return false;
      tx.set(ref, { total: (d.total || 0) + 1, by: Object.assign({}, d.by || {}, { [uid]: ((d.by || {})[uid] || 0) + 1 }) });
      return true;
    });
  }
  /* today's use, without counting: for "today's limit is reached" before anyone types */
  async function usedUp(dbi, uid, cap) {
    const u = (await dbi.collection(records.use).doc(day()).get()).data() || { total: 0, by: {} };
    return (u.total || 0) >= cap.perChurch || ((u.by || {})[uid] || 0) >= cap.perPerson;
  }

  return { apiOf, logIt, broken, noteWorking, callFailed, takeOne, usedUp, stateRef };
}
