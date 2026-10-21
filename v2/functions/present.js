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
import { postJson } from './longpost.js';
import { mayHost, EGBC_ROOMS, EGBC_BY_TYPE } from './video.js';
/* how long a function waits for the converter: its 900 s, and a little over */
const CONVERTER_WAIT_MS = 960 * 1000;

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
  /* A meeting (F-247): its host - the main window's own test for "may start
     this meeting as host" (functions/video.js mayHost), on the church's rooms. */
  if (ctx && ctx.type === 'meeting' && ctx.room) {
    const v = (await dbi.collection('churchSettings').doc('video').get()).data() || {};
    const room = (Array.isArray(v.rooms) && v.rooms.length ? v.rooms : EGBC_ROOMS).find(r => r.key === String(ctx.room));
    if (!room) return false;
    let event = null;
    const eid = String(ctx.eventId || '');
    if (eid && !eid.includes('/')) { const e = await dbi.collection('events').doc(eid).get(); event = e.exists ? e.data() : null; }
    if (mayHost({ user: u, uid, room, event, byType: v.byType || EGBC_BY_TYPE })) return true;
    /* or the one person a host has let present (Martin, 21 Oct), while that
       host is still there: the say-so is renewed each minute and ends 3
       minutes after the last renewal - the rules (presentAllowed) say the same */
    const key = 'mtg_' + String(ctx.room) + '_' + (eid || String(ctx.day || ''));
    if (key.includes('/')) return false;
    const a = (await dbi.collection('presentAllow').doc(key + '_' + uid).get()).data();
    const alive = a && a.aliveAt && (a.aliveAt.toMillis ? a.aliveAt.toMillis() : Date.parse(a.aliveAt));
    return !!(a && a.uid === uid && alive && Date.now() < alive + ALLOW_MS);
  }
  return false;
}
export const ALLOW_MS = 3 * 60 * 1000;

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
  const payload = link ? { deckId, link } : { deckId };
  /* one request that may take the converter's whole 900 s (a long video):
     not fetch, which gives up at 300 s (longpost.js, F-259) */
  const headers = {};
  if (!EMULATOR) {
    const client = await new GoogleAuth().getIdTokenClient(url);
    const h = await client.getRequestHeaders(url);
    headers.Authorization = (h && typeof h.get === 'function') ? h.get('authorization') : (h.Authorization || h.authorization);
  }
  let r;
  try { r = await postJson(url.replace(/\/?$/, '') + '/convert', payload, { headers, timeoutMs: CONVERTER_WAIT_MS }); }
  catch (e) { throw new HttpsError('unavailable', 'The slide converter did not answer: ' + (e.message || e)); }
  if (r.status !== 200) throw new HttpsError('failed-precondition', r.json.error || 'The slides could not be made.');
  return r.json;
}

async function deckFor(uid, deckId) {
  if (!/^[A-Za-z0-9_-]{6,60}$/.test(String(deckId || ''))) throw new HttpsError('invalid-argument', 'Which deck?');
  const ref = db().collection('presentDecks').doc(deckId), d = (await ref.get()).data();
  if (!d) throw new HttpsError('not-found', 'That deck could not be found.');
  if (!(await mayPresent(db(), uid, d.context))) throw new HttpsError('permission-denied', 'Only the people who may present here can add slides.');
  if (!(await launched(db()))) throw new HttpsError('failed-precondition', 'Slides can be added when the hub goes live.');
  return { ref, d };
}

export const presentConvert = onCall({ region: REGION, timeoutSeconds: 1000, memory: '256MiB' }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');
  const { ref, d } = await deckFor(uid, (req.data || {}).deckId);
  if (d.sourceDeletedAt) throw new HttpsError('failed-precondition', 'The PowerPoint file itself was cleared 30 days after the session; the slides and video are still here to show. To make new slides, add the file again.');
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

export const presentFromLink = onCall({ region: REGION, timeoutSeconds: 1000, memory: '256MiB' }, async (req) => {
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
  /* A session's deck keeps its slide pictures and its video (it can be shown
     again); the PowerPoint file itself goes 30 days after the session -
     only needed to make the slides again (Martin, 21 Oct). */
  const s = await dbi.collection('presentDecks').where('context.type', '==', 'session').get();
  const sessionDay = {};
  for (const d of s.docs) {
    const x = d.data();
    if (x.sourceDeletedAt || !x.context || !x.context.sessionId) continue;
    const sid = String(x.context.sessionId);
    if (!(sid in sessionDay)) sessionDay[sid] = ((await dbi.collection('planSessions').doc(sid).get()).data() || {}).date || '';
    if (!sessionDay[sid] || sessionDay[sid] >= cut) continue;
    await bucket.file('present/' + d.id + '/source.pptx').delete().catch(() => {});
    await d.ref.update({ sourceDeletedAt: new Date().toISOString() });
    gone.push(d.id + ':source');
  }
  return gone;
}
export const presentSweep = onSchedule({ region: REGION, schedule: '15 4 * * *', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  await runPresentSweep({ db: db(), bucket: getStorage().bucket() });
});
