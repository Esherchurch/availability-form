/* ===================================================================
   Canva, as the hub's functions (comms window; FINDINGS-comms C-15)
   ===================================================================

     canvaStatus      callable, the office: connected or not
     canvaStart       callable, the office: the address to sign in to Canva
     canvaCallback    public: where Canva sends the person back (?code=&state=)
     canvaDesigns     callable, the office: {query, continuation} -> designs
     canvaImport      callable, the office: {designId, kind, title} -> the
                      picture library entry (PNG or animated GIF; MP4 too,
                      shown once the library can play videos, C-16)
     canvaDisconnect  callable, the office

   SHUT ON THE LIVE SITE UNTIL SWITCH-OVER (CANVA_LIVE, below), the
   payments-gate.js pattern: until the locked rules deploy, the tokens
   would sit in a database anybody can read. The client ID and secret are
   pasted into Church settings' key box (hq-mail-key.js) by a master
   admin, which refuses to save until switch-over too. Martin sets up the
   integration on his own (free) Canva account - FINDINGS-comms C-21 - and
   signs in himself; nobody else ever handles his password.

   ON THE EMULATOR everything runs, against the addresses in
   functions/.env.local (CANVA_CLIENT_ID, CANVA_CLIENT_SECRET, and
   CANVA_API_BASE for a pretend Canva in a check).
   =================================================================== */

import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import * as C from './canva-core.js';
import { storedKeys } from './hq-mail-key.js';
import { featureOn } from './features.js';

const REGION = 'europe-west2';
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
export const CANVA_LIVE = false;
const canvaShut = () => !EMULATOR && !CANVA_LIVE;
const HUB = 'https://esherchurch.github.io/availability-form/v2';
const CALLBACK_LIVE = 'https://europe-west2-egbc-worship-planner.cloudfunctions.net/canvaCallback';

/* The client ID and secret come from the key box (Church settings), read
   on the server only; on the emulator a test may give them in
   functions/.env.local instead. */
async function deps() {
  const db = getFirestore(), k = await storedKeys(db);
  return {
    db, fetchFn: fetch,
    clientId: k.canvaId || (EMULATOR ? process.env.CANVA_CLIENT_ID || '' : ''), secret: k.canvaSecret || (EMULATOR ? process.env.CANVA_CLIENT_SECRET || '' : ''),
    apiBase: EMULATOR ? (process.env.CANVA_API_BASE || C.API) : C.API,
    redirectUri: EMULATOR ? (process.env.CANVA_REDIRECT || 'http://127.0.0.1:5101/egbc-worship-planner/europe-west2/canvaCallback') : CALLBACK_LIVE,
    save: async (path, bytes, type) => {
      const bucket = getStorage().bucket(), token = randomUUID();
      await bucket.file(path).save(bytes, { contentType: type, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
      const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? 'http://' + process.env.FIREBASE_STORAGE_EMULATOR_HOST : 'https://firebasestorage.googleapis.com';
      return host + '/v0/b/' + bucket.name + '/o/' + encodeURIComponent(path) + '?alt=media&token=' + token;
    }
  };
}

/* The office and master admins, Canva switched on, and not shut. */
async function office(req) {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const db = getFirestore();
  const [me, on] = await Promise.all([db.collection('users').doc(uid).get(), featureOn(db, 'canva')]);
  const p = me.exists ? me.data() : {};
  if (!(p.status === 'active' && (p.masterAdmin === true || (p.teams || []).includes('Church office')))) throw new HttpsError('permission-denied', 'For the church office.');
  if (!on) throw new HttpsError('failed-precondition', 'Canva is switched off for this church.');
  if (canvaShut()) throw new HttpsError('failed-precondition', 'Canva connects when the church goes live.');
  return uid;
}
const wrap = fn => async (req) => {
  const uid = await office(req);
  try { return await fn(req.data || {}, uid); } catch (e) { throw e instanceof HttpsError ? e : new HttpsError('failed-precondition', e.message || String(e)); }
};

export const canvaStatus = onCall({ region: REGION }, wrap(async () => C.status(await deps())));
export const canvaStart = onCall({ region: REGION }, wrap(async (d, uid) => {
  const x = await deps();
  if (!x.clientId || !x.secret) throw new Error('The Canva integration is not set up yet: a master admin pastes its client ID and secret in Church settings.');
  const back = /^https:\/\/esherchurch\.github\.io\/|^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(String(d.returnTo || '')) ? d.returnTo : HUB + '/canva.html';
  return C.start(Object.assign(x, { uid, returnTo: back }));
}));
export const canvaDesigns = onCall({ region: REGION, timeoutSeconds: 60 }, wrap(async d => C.designs(await deps(), d)));
export const canvaImport = onCall({ region: REGION, timeoutSeconds: 180, memory: '512MiB' }, wrap(async (d, uid) => C.importDesign(await deps(), { designId: d.designId, kind: d.kind, title: d.title, uid })));
export const canvaDisconnect = onCall({ region: REGION }, wrap(async () => C.disconnect(await deps())));

export const canvaCallback = onRequest({ region: REGION, invoker: 'public' }, async (req, res) => {
  const page = (msg, back) => res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(
    '<!DOCTYPE html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px/1.5 Arial,sans-serif;padding:24px;color:#111827">' +
    '<p>' + String(msg).replace(/[<>&]/g, '') + '</p><p><a href="' + String(back).replace(/"/g, '') + '">Back to the hub</a></p></body>');
  if (canvaShut()) return page('Canva connects when the church goes live.', HUB + '/canva.html');
  if (req.query.error) return page('Canva was not connected (' + String(req.query.error).slice(0, 60) + ').', HUB + '/canva.html');
  try {
    const r = await C.finish(Object.assign(await deps(), { code: String(req.query.code || ''), state: String(req.query.state || '') }));
    const back = (r.returnTo || HUB + '/canva.html') + (String(r.returnTo).includes('?') ? '&' : '?') + 'connected=1';
    return res.redirect(302, back);
  } catch (e) {
    return page(e.message || 'Canva was not connected.', HUB + '/canva.html');
  }
});
