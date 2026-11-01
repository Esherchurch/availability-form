/* A FAMILY SEES WHAT THEY SENT ON A FORM, BY THE LINK THEY WERE SENT.
 *
 * Form answers are often about children (registration, medical, consent).
 * Reading one by its record id alone let anybody holding an id fetch it,
 * signed out. Now the rules let only the people who work with the form
 * read an answer (and the signed-in person it is about), and a parent with
 * the link asks here instead: the request key from their link must be the
 * one the answer was given for. The medical half needs, as well, the
 * second secret only the parent's "form received" email carries.
 *
 *   formAnswers  { key, secret? } -> { response, sensitive, reuse }
 *     response   the answers given on this request, when it is done
 *     sensitive  their medical half, when the secret matches it
 *     reuse      the earlier answers this request offers as "still
 *                correct?", while it is open for that
 *
 * No sign-in: the church is the one whose web address the page is on.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { dbForAddress } from './church-address.js';

const REGION = 'europe-west2';
const KEY = /^[A-Za-z0-9_-]{16,80}$/;
const data = async (ref) => { const s = await ref.get(); return s.exists ? s.data() : null; };

/**
 * What a link may see, for one church's data.
 * @param {object} D  the church's db
 * @param {string} key  the request key from the link (?k=)
 * @param {string} secret  the medical half's secret from the email (?s=), or ''
 * @returns {Promise<{response: object|null, sensitive: object|null, reuse: object|null}>}
 */
export async function answersFor(D, key, secret) {
  const out = { response: null, sensitive: null, reuse: null };
  if (!KEY.test(String(key || ''))) return out;
  const req = await data(D.collection('formRequests').doc(key));
  if (!req) return out;
  if (req.status === 'done' && req.responseId) {
    const r = await data(D.collection('formResponses').doc(String(req.responseId)));
    /* "still correct?" points at an earlier answer; a new one names this key */
    if (r && (r.requestKey === key || (req.confirmedStillCorrect === true && req.responseId === req.reuseOf))) out.response = r;
    if (out.response && KEY.test(String(secret || ''))) {
      const s = await data(D.collection('sensitiveResponses').doc(secret));
      if (s && s.responseId === req.responseId) out.sensitive = s;
    }
  } else if (req.status === 'reuse' && req.reuseOf) {
    out.reuse = await data(D.collection('formResponses').doc(String(req.reuseOf)));
  }
  return out;
}

export const formAnswers = onCall({ region: REGION }, async (req) => {
  const D = await dbForAddress(getFirestore(), req.rawRequest);
  if (!D) throw new HttpsError('not-found', 'There is no church at this address.');
  const d = req.data || {};
  return answersFor(D, String(d.key || ''), String(d.secret || ''));
});
