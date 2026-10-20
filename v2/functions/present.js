/* ===================================================================
   EGBC Present - the hub's side of a PowerPoint deck (F-242)
   ===================================================================

     presentConvert   callable { deckId }      the uploaded PowerPoint into
                      slides and notes, by the converter (Cloud Run)
     presentFromLink  callable { deckId, url } a OneDrive / SharePoint share
                      link: the converter fetches it (up to 1 GB, streamed -
                      a function's memory cannot hold a 700 MB deck) and it is
                      presented like an upload (Martin, 20 Oct; F-251)
     presentSweep     daily: a meeting's deck goes 30 days after the
                      meeting, unless saved to the meeting's documents

   WHO: whoever may present in the deck's context - for a session, the
   group's leaders (and master admins); for a meeting, the host (agreed
   with the main window, F-242 section 6; until then master admins).

   HELD UNTIL GOING LIVE: until churchSettings/launch.rulesLocked is true
   the live Storage is readable signed out, so nothing is converted or
   fetched (the page says so first; this is the second guard).

   The converter's address is CONVERTER_URL. On the emulator only, a test
   may point it at its own stand-in (presentSettings/test.converterUrl).
   =================================================================== */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { GoogleAuth } from 'google-auth-library';

const REGION = 'europe-west2';
const EMULATOR = !!process.env.FUNCTIONS_EMULATOR;
const db = () => getFirestore();

async function me(uid) { const d = await db().collection('users').doc(uid).get(); return d.exists ? d.data() : {}; }

/* May this person present in this context? The rules say the same. */
export async function mayPresent(dbi, uid, ctx) {
  const u = (await dbi.collection('users').doc(uid).get()).data() || {};
  if (u.status !== 'active') return false;
  if (u.masterAdmin === true) return true;
  if (ctx && ctx.type === 'session' && ctx.groupId) {
    const g = (await dbi.collection('planGroups').doc(String(ctx.groupId)).get()).data();
    return !!(g && (g.leaderIds || []).includes(u.memberId || '-'));
  }
  return false;   // meetings: the host, once meetingHost() is agreed (F-242)
}

async function launched(dbi) {
  const l = await dbi.collection('churchSettings').doc('launch').get().catch(() => null);
  return !!(l && l.exists && l.data().rulesLocked === true);
}

async function converterUrl(dbi) {
  if (EMULATOR) {
    const t = await dbi.collection('presentSettings').doc('test').get().catch(() => null);
    if (t && t.exists && t.data().converterUrl) return String(t.data().converterUrl);
  }
  return process.env.CONVERTER_URL || '';
}

async function callConverter(dbi, deckId, link) {
  const url = await converterUrl(dbi);
  if (!url) throw new HttpsError('failed-precondition', 'The slide converter is not set up yet (CONVERTER_URL).');
  const payload = link ? { deckId, link } : { deckId }, body = JSON.stringify(payload);
  let res;
  if (EMULATOR) res = await fetch(url.replace(/\/?$/, '') + '/convert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  else {
    const client = await new GoogleAuth().getIdTokenClient(url);
    const r = await client.request({ url: url.replace(/\/?$/, '') + '/convert', method: 'POST', data: payload, timeout: 900000, validateStatus: () => true });
    res = { ok: r.status === 200, status: r.status, json: async () => r.data };
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpsError('failed-precondition', out.error || 'The slides could not be made.');
  return out;
}

async function deckFor(uid, deckId) {
  if (!/^[A-Za-z0-9_-]{6,60}$/.test(String(deckId || ''))) throw new HttpsError('invalid-argument', 'Which deck?');
  const ref = db().collection('presentDecks').doc(deckId), d = (await ref.get()).data();
  if (!d) throw new HttpsError('not-found', 'That deck could not be found.');
  if (!(await mayPresent(db(), uid, d.context))) throw new HttpsError('permission-denied', 'Only the people who may present here can add slides.');
  if (!(await launched(db()))) throw new HttpsError('failed-precondition', 'Slides can be added when the church switches over to the new hub.');
  return { ref, d };
}

export const presentConvert = onCall({ region: REGION, timeoutSeconds: 900, memory: '256MiB' }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');
  const { ref } = await deckFor(uid, (req.data || {}).deckId);
  await ref.update({ status: 'converting', why: '' });
  return callConverter(db(), ref.id);
});

/* A OneDrive or SharePoint share link -> the file itself. "Anyone with the
   link" shares work; a share only for the church's own accounts cannot be
   fetched here and says so. */
export function directLink(url) {
  const u = String(url || '').trim();
  if (EMULATOR && /^http:\/\/localhost:5601\//.test(u)) return u;   // the tests' own invented file
  if (!/^https:\/\//i.test(u)) return '';
  if (/^https:\/\/([\w-]+\.)*(1drv\.ms|onedrive\.live\.com)\//i.test(u)) {
    return 'https://api.onedrive.com/v1.0/shares/u!' + Buffer.from(u).toString('base64').replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-') + '/root/content';
  }
  if (/^https:\/\/[\w-]+(-my)?\.sharepoint\.com\//i.test(u)) return u + (u.includes('?') ? '&' : '?') + 'download=1';
  return '';
}

export const presentFromLink = onCall({ region: REGION, timeoutSeconds: 900, memory: '256MiB' }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');
  const { ref } = await deckFor(uid, (req.data || {}).deckId);
  const url = String((req.data || {}).url || '').trim();
  if (!directLink(url)) throw new HttpsError('invalid-argument', 'Paste a OneDrive or SharePoint link to the PowerPoint.');
  await ref.update({ status: 'fetching', why: '', source: 'onedrive', link: url.slice(0, 500) });
  return callConverter(db(), ref.id, url);
});

/* A meeting's deck goes 30 days after the meeting, unless kept (Martin, 20 Oct). */
export async function runPresentSweep({ db: dbi, bucket, today }) {
  today = today || new Date().toISOString().slice(0, 10);
  const cut = new Date(Date.parse(today + 'T12:00:00Z') - 30 * 864e5).toISOString().slice(0, 10);
  const q = await dbi.collection('presentDecks').where('context.type', '==', 'meeting').get();
  const gone = [];
  for (const d of q.docs) {
    const x = d.data();
    if (x.keep === true || !x.context || !x.context.day || x.context.day >= cut) continue;
    await bucket.deleteFiles({ prefix: 'present/' + d.id + '/' }).catch(() => {});
    await dbi.collection('presentNotes').doc(d.id).delete().catch(() => {});
    await d.ref.delete();
    gone.push(d.id);
  }
  return gone;
}
export const presentSweep = onSchedule({ region: REGION, schedule: '15 4 * * *', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  await runPresentSweep({ db: db(), bucket: getStorage().bucket() });
});
