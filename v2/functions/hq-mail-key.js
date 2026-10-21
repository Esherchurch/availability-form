/* ===================================================================
   The key box: the Canva integration's keys, and whether Church HQ's
   Resend secrets are set (comms window, 19 Oct 2026; 21 Oct: Resend's
   moved to Google Secret Manager)
   ===================================================================

     hqMailKeySave    callable, master admins: { canvaId?, canvaSecret? }
                      -> status. Either may be left out to keep what is
                      there; '' removes it. A Resend key or signing secret
                      is refused: those are in Secret Manager now.
     hqMailKeyStatus  callable, master admins: -> { saved, hookSaved,
                      resendIn, resendNames, canvaSaved, savedAt,
                      savedByName, shut }  - NEVER a key

   CHURCH HQ'S RESEND (Martin, 21 Oct 2026): the API key and the webhook
   signing secret are in Google Secret Manager, HQ_RESEND_API_KEY and
   HQ_RESEND_WEBHOOK_SECRET (resend-secrets.js), set by the reviewing window
   with Martin - so v2 sends now, not from switch-over. The box only says
   whether each is there. Any Resend key an older box saved in the
   database is removed at the next save.

   CANVA'S KEYS: Martin pastes them here himself, in Church settings.
   Nobody asks for them in a chat, and no page can ever read them back:
   privateSettings/churchHqMail, which the rules give to no page.
   HELD UNTIL SWITCH-OVER (the payments-gate.js pattern, through
   enews-gate.js): until the locked rules deploy, privateSettings can be
   read by anybody, so a key saved now would be public. So saving refuses
   on the live site until ENEWS_LIVE, and the box says so. On the emulator
   it saves - and a test can shut it with teamMailSettings/config.
   shutForTest, as the API.Bible box does.
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { enewsShut } from './enews-gate.js';
import { resendKey, webhookSecret, SENDING_SECRETS } from './resend-secrets.js';

const REGION = 'europe-west2';
const db = () => getFirestore();
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
export const KEY_DOC = ['privateSettings', 'churchHqMail'];
/* Canva's client IDs and secrets are letters, digits, - and _. */
export const CANVA_ID_SHAPE = /^[A-Za-z0-9_-]{8,80}$/;
export const CANVA_SECRET_SHAPE = /^[A-Za-z0-9_-]{16,200}$/;

export async function keyShut() {
  if (enewsShut()) return true;
  if (!EMULATOR) return false;
  const c = await db().collection('teamMailSettings').doc('config').get();
  return !!(c.exists && c.data().shutForTest === true);
}

async function master(req) {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');
  const u = (await db().collection('users').doc(uid).get()).data() || {};
  if (u.status !== 'active' || u.masterAdmin !== true) throw new HttpsError('permission-denied', 'Only a master admin can set Church HQ’s keys.');
  return { uid, name: String(u.name || '') };
}

async function statusNow() {
  const d = (await db().collection(KEY_DOC[0]).doc(KEY_DOC[1]).get()).data() || {};
  const [k, h] = await Promise.all([resendKey(), webhookSecret()]);
  return { saved: !!k, hookSaved: !!h, resendIn: 'Google Secret Manager', resendNames: ['HQ_RESEND_API_KEY', 'HQ_RESEND_WEBHOOK_SECRET'],
    canvaSaved: !!(d.canvaId && d.canvaSecret), savedAt: d.savedAt || '', savedByName: d.savedByName || '', shut: await keyShut() };
}

export const hqMailKeyStatus = onCall({ region: REGION, secrets: SENDING_SECRETS }, async (req) => {
  await master(req);
  return statusNow();
});

export const hqMailKeySave = onCall({ region: REGION, secrets: SENDING_SECRETS }, async (req) => {
  const me = await master(req);
  const d = req.data || {};
  if ((d.key !== undefined && String(d.key).trim()) || (d.hook !== undefined && String(d.hook).trim()))
    throw new HttpsError('invalid-argument', 'Church HQ’s Resend key and signing secret are kept in Google Secret Manager now (HQ_RESEND_API_KEY, HQ_RESEND_WEBHOOK_SECRET), not pasted here.');
  if (await keyShut()) throw new HttpsError('failed-precondition', 'Canva’s keys can be saved when the hub goes live.', { shut: true });
  const patch = {};
  [['canvaId', CANVA_ID_SHAPE, 'Canva client ID'], ['canvaSecret', CANVA_SECRET_SHAPE, 'Canva client secret']].forEach(function (f) {
    if (d[f[0]] === undefined) return;
    const v = String(d[f[0]] || '').trim();
    if (v && !f[1].test(v)) throw new HttpsError('invalid-argument', 'That does not look like a ' + f[2] + '.');
    patch[f[0]] = v;
  });
  if (!Object.keys(patch).length) throw new HttpsError('invalid-argument', 'Paste the key first.');
  const ref = db().collection(KEY_DOC[0]).doc(KEY_DOC[1]);
  const cur = (await ref.get()).data() || {};
  const next = Object.assign({}, cur, patch, { savedAt: new Date().toISOString(), savedBy: me.uid, savedByName: me.name });
  /* No Resend key is kept in the database any more (an older box's goes). */
  delete next.key; delete next.hook;
  if (!next.canvaId && !next.canvaSecret) await ref.delete(); else await ref.set(next);
  forgetCachedKeys();
  return statusNow();
});

/* For canva.js: read on the server, cached for a minute. */
let cache = null, cachedAt = 0;
export async function storedKeys(dbx = db()) {
  if (cache && Date.now() - cachedAt < 60000) return cache;
  const d = (await dbx.collection(KEY_DOC[0]).doc(KEY_DOC[1]).get()).data() || {};
  const found = { canvaId: d.canvaId || '', canvaSecret: d.canvaSecret || '' };
  /* Only a found key is kept for the minute: "nothing saved yet" is asked
     again next time, so a key just pasted is used straight away. */
  if (found.canvaId) { cache = found; cachedAt = Date.now(); }
  return found;
}
export function forgetCachedKeys() { cache = null; cachedAt = 0; }
