/* ===================================================================
   Church HQ's Resend: the key and the webhook signing secret, from
   Google Secret Manager (comms window, 21 Oct 2026; Martin: "v2 doesn't
   use Calla at all", and v2 sends now, not from going live)
   ===================================================================

     HQ_RESEND_API_KEY          the Resend API key (re_..., sending access)
     HQ_RESEND_WEBHOOK_SECRET   the webhook's signing secret (whsec_...)

   WHY "HQ_": RESEND_API_KEY in this Google project is CALLA'S key - the
   original site's sendEmail lists it (reviewing window, 21 Oct 2026).
   Church HQ's must never share or replace it, so the hub never reads,
   sets or deletes RESEND_API_KEY: secretValue refuses that name.

   Set once, by the reviewing window with Martin:
     firebase functions:secrets:set HQ_RESEND_API_KEY
     firebase functions:secrets:set HQ_RESEND_WEBHOOK_SECRET

   HOW EVERY SENDER GETS THE KEY. A secret is put into a function only
   when that function lists it (secrets: [...]), and the hub has dozens of
   functions that send, in several windows' files. So:
     - this window's own senders list both (SENDING_SECRETS), so deploying
       them gives the functions' service account access to the secrets;
     - secretValue(name) reads the listed value when it is there, and
       otherwise asks Secret Manager itself (the same service account), and
       keeps the answer ten minutes;
     - on the emulator: functions/.secret.local, or nothing (the emulator
       never sends anyway).
   No key ever reaches a page, a chat, the database or the repository.
   =================================================================== */

import { defineSecret } from 'firebase-functions/params';
import { GoogleAuth } from 'google-auth-library';

export const HQ_RESEND_API_KEY = defineSecret('HQ_RESEND_API_KEY');
export const HQ_RESEND_WEBHOOK_SECRET = defineSecret('HQ_RESEND_WEBHOOK_SECRET');
export const SENDING_SECRETS = [HQ_RESEND_API_KEY, HQ_RESEND_WEBHOOK_SECRET];

const KEEP_MS = 10 * 60000;
const cache = new Map();
let auth = null;

/* For the checks: forget what was kept, and ask with a pretend fetch. */
export function forgetSecrets() { cache.clear(); }

/* Never Calla's (above). */
const NOT_OURS = ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'];

export async function secretValue(name, { now = Date.now(), ask } = {}) {
  if (NOT_OURS.includes(name)) throw new Error(name + ' is the original site’s (Calla’s) secret: the hub never reads it. Church HQ’s is HQ_' + name + '.');
  const here = process.env[name];
  if (here && here.trim()) return here.trim();
  const kept = cache.get(name);
  if (kept && now - kept.at < KEEP_MS) return kept.v;
  if (process.env.FUNCTIONS_EMULATOR === 'true' && !ask) return '';
  let v = '';
  try {
    if (ask) v = await ask(name);
    else {
      if (!auth) auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      const client = await auth.getClient();
      const project = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || (await auth.getProjectId());
      const r = await client.request({ url: 'https://secretmanager.googleapis.com/v1/projects/' + project + '/secrets/' + name + '/versions/latest:access' });
      v = Buffer.from(String((r.data && r.data.payload && r.data.payload.data) || ''), 'base64').toString('utf8');
    }
  } catch (e) {
    console.warn('[resend-secrets] ' + name + ' could not be read: ' + (e.message || e));
    v = '';
  }
  v = String(v || '').trim();
  if (v) cache.set(name, { v, at: now });
  return v;
}
export const resendKey = (o) => secretValue('HQ_RESEND_API_KEY', o);
export const webhookSecret = (o) => secretValue('HQ_RESEND_WEBHOOK_SECRET', o);
