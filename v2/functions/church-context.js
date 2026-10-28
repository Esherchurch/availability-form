/* THE CHURCH A REQUEST IS FOR, CARRIED THROUGH CODE THAT HAS MANY HELPERS.
 *
 * Most function files pass the church's db (churchOf, eachChurch) from the
 * function to each helper. Payments and GoCardless have about twenty
 * helpers between them, shared by callables, webhooks and the five-minute
 * tidy, so instead each entry point says once which church it is working
 * for, and every helper's churchDb() answers with that church's db.
 *
 * Outside any withChurchDb (a test calling a helper directly, say),
 * churchDb() is EGBC's top level, as before.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { churchOf } from './church-scope.js';
import { dbForAddress } from './church-address.js';

const here = new AsyncLocalStorage();

/**
 * Run fn with db as the church for every churchDb() call inside it, however deep.
 * @param {object} db  a scoped db (church-scope.js scopedDb, churchOf, eachChurch)
 * @param {() => Promise<any>} fn
 * @returns {Promise<any>} what fn returns
 */
export function withChurchDb(db, fn) {
  return here.run(db, fn);
}

/**
 * The db of the church being worked for; EGBC's top level outside withChurchDb.
 * @returns {object}
 */
export function churchDb() {
  return here.getStore() || getFirestore();
}

/**
 * A callable that works for the caller's own church, from their sign-in.
 * @param {(req: object) => Promise<any>} fn
 * @returns {(req: object) => Promise<any>}
 */
export const forCaller = (fn) => (req) => withChurchDb(churchOf(req, getFirestore()).db, () => fn(req));

/**
 * A callable for a public page (a payer, signed in or not): it works for the
 * church whose web address the page is on, never one named in the request.
 * @param {(req: object) => Promise<any>} fn
 * @returns {(req: object) => Promise<any>}
 */
export const forAddress = (fn) => async (req) => {
  const D = await dbForAddress(getFirestore(), req.rawRequest);
  if (!D) throw new HttpsError('not-found', 'There is no church at this address.');
  return withChurchDb(D, () => fn(req));
};
