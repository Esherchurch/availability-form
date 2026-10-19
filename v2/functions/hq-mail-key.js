/* ===================================================================
   The key box: Church HQ's Resend, and the Canva integration
   (comms window, 19 Oct 2026)
   ===================================================================

     hqMailKeySave    callable, master admins: { key?, hook? } -> status
                      key  = the Resend API key (re_...), '' to remove
                      hook = the webhook signing secret (whsec_...), '' to remove
                      canvaId / canvaSecret = the Canva integration's
                      client ID and secret (FINDINGS-comms C-21)
                      any may be left out to keep what is there
     hqMailKeyStatus  callable, master admins: -> { saved, hookSaved,
                      canvaSaved, savedAt, savedByName, shut }  - NEVER a key

   Martin decided (19 Oct): he makes the key in Resend (sending access
   only) and pastes it here himself, in Church settings. Nobody asks for
   it in a chat, and no page can ever read it back: it lives in
   privateSettings/churchHqMail, which the rules give to no page, and
   hq-mail.js reads it on the server only.

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

const REGION = 'europe-west2';
const db = () => getFirestore();
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
export const KEY_DOC = ['privateSettings', 'churchHqMail'];
/* Resend's keys start re_; webhook signing secrets start whsec_. */
export const KEY_SHAPE = /^re_[A-Za-z0-9_-]{16,120}$/;
export const HOOK_SHAPE = /^whsec_[A-Za-z0-9+/=]{16,200}$/;
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
  if (u.status !== 'active' || u.masterAdmin !== true) throw new HttpsError('permission-denied', 'Only a master admin can set Church HQ’s email key.');
  return { uid, name: String(u.name || '') };
}

async function statusNow() {
  const d = (await db().collection(KEY_DOC[0]).doc(KEY_DOC[1]).get()).data() || {};
  return { saved: !!d.key, hookSaved: !!d.hook, canvaSaved: !!(d.canvaId && d.canvaSecret), savedAt: d.savedAt || '', savedByName: d.savedByName || '', shut: await keyShut() };
}

export const hqMailKeyStatus = onCall({ region: REGION }, async (req) => {
  await master(req);
  return statusNow();
});

export const hqMailKeySave = onCall({ region: REGION }, async (req) => {
  const me = await master(req);
  if (await keyShut()) throw new HttpsError('failed-precondition', 'Church HQ’s email key can be saved when the church switches over to the new hub.', { shut: true });
  const d = req.data || {}, patch = {};
  if (d.key !== undefined) {
    const k = String(d.key || '').trim();
    if (k && !KEY_SHAPE.test(k)) throw new HttpsError('invalid-argument', 'That does not look like a Resend API key (it starts re_).');
    patch.key = k;
  }
  if (d.hook !== undefined) {
    const h = String(d.hook || '').trim();
    if (h && !HOOK_SHAPE.test(h)) throw new HttpsError('invalid-argument', 'That does not look like a Resend signing secret (it starts whsec_).');
    patch.hook = h;
  }
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
  if (!next.key && !next.hook && !next.canvaId && !next.canvaSecret) await ref.delete(); else await ref.set(next);
  forgetCachedKeys();
  return statusNow();
});

/* For hq-mail.js and the webhook: read on the server, cached for a minute
   so a weekly send to hundreds reads it once. */
let cache = null, cachedAt = 0;
export async function storedKeys(dbx = db()) {
  if (cache && Date.now() - cachedAt < 60000) return cache;
  const d = (await dbx.collection(KEY_DOC[0]).doc(KEY_DOC[1]).get()).data() || {};
  const found = { key: d.key || '', hook: d.hook || '', canvaId: d.canvaId || '', canvaSecret: d.canvaSecret || '' };
  /* Only a found key is kept for the minute: "nothing saved yet" is asked
     again next time, so a key just pasted is used straight away. */
  if (found.key || found.hook || found.canvaId) { cache = found; cachedAt = Date.now(); }
  return found;
}
export function forgetCachedKeys() { cache = null; cachedAt = 0; }
