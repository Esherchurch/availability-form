/* ===================================================================
   EGBC — the day's lessons for ChurchShow (F-225, F-228; agreed 16 Oct)
   ===================================================================

     lessonFor   callable, a PAIRED ChurchShow computer only:
                   { date: 'YYYY-MM-DD', groupId? }
                   -> { date, siteId, lessons: [ egbc-lesson/1, ... ] }

   ONLY THE COMPUTER'S OWN BUILDING. A paired computer is one building
   (churchshow-<siteId>); it gets that date's plans of the groups that meet
   in that building (planGroups.siteId), and nothing of any other. Asking
   for another building's group by its id is refused.

   The device is checked the way churchshow.js and the rules' churchShow()
   do: the token claim device == 'churchshow', and devices/<uid>.active true
   - read on every call, so Disconnect on the hub stops it at once. Its
   building is the one on the device record (and the token must agree).
   churchshow.js is not changed.

   FILES AND VIDEO come as SHORT-LIVED download links (signed, three hours:
   long enough for a morning), never the plan's own long-lived links.
   LEADERS' NOTES and "things to bring" are never sent to a screen device.

   A SONG'S WORDS come with its step (ChurchShow, 21 Oct): a computer paired
   for Lessons only may not read the song library (the rules' churchShowServices()),
   so the step carries song: { title, artist, ccli, lyrics } - the words and the
   CCLI number the screen shows under them, nothing else (no chords, no links).
   Only the songs the lesson's own steps name are read, by their ids; a song
   gone from the library has no song (ChurchShow says so on the step).

   egbc-lesson/1 (F-225):
     { format, id, group: { id, name, ages }, date, title, programme,
       lessonCode, lessonLink, passage: { ref, version, source, text,
       copyright }, steps: [ { part, partId, n, type, ... } ] }
   A song step: { songId, title, ccli, song: { title, artist, ccli, lyrics } }.
   A Bible Gateway passage carries only ref and version (ChurchShow
   fetches it itself).
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { churchOf } from './church-scope.js';
import { churchBucket } from './church-files.js';

const REGION = 'europe-west2';
/* EVERY CHURCH (H-6): a church's ChurchShow computer carries its church in
   its sign-in (churchshow.js claimsFor), so its lessons come from that
   church's own data and files (churches/<id>/planner/...). */
const db = () => getFirestore();
const LINK_MS = 3 * 60 * 60 * 1000;
const EMULATOR = !!process.env.FUNCTIONS_EMULATOR;

async function device(req, D) {
  const a = req.auth;
  if (!a || !a.token || a.token.device !== 'churchshow') throw new HttpsError('permission-denied', 'Only a paired ChurchShow computer can ask for lessons.');
  const d = await D.collection('devices').doc(a.uid).get();
  const x = d.exists ? d.data() : null;
  if (!x || x.active !== true) throw new HttpsError('permission-denied', 'This ChurchShow computer has been disconnected on the hub.');
  const siteId = String(x.siteId || '');
  if (!siteId || (a.token.siteId && String(a.token.siteId) !== siteId)) throw new HttpsError('permission-denied', 'This ChurchShow computer is not paired to a building.');
  return { siteId };
}

/* A short-lived link to a file the plan holds (by its Storage path, as the
   page stored it: under the church's folder for a church). */
async function link(path, churchId) {
  const pre = churchId ? 'churches/' + churchId + '/' : '';
  path = String(path || '');
  if (pre && path.startsWith(pre)) path = path.slice(pre.length);
  if (!path || !/^planner\//.test(path)) return '';
  const file = churchBucket(getStorage().bucket(), churchId).file(path);
  path = pre + path;
  const expires = Date.now() + LINK_MS;
  if (EMULATOR) {
    /* The Storage emulator cannot sign; it serves the file by its path. The
       test checks the path and the expiry are what a real link would carry. */
    const b = getStorage().bucket().name;
    return 'http://' + (process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9198') + '/v0/b/' + b + '/o/' + encodeURIComponent(path) + '?alt=media&expires=' + expires;
  }
  const [url] = await file.getSignedUrl({ action: 'read', expires });
  return url;
}

const KEEP = {
  verses: ['ref', 'version', 'source', 'text', 'copyright'],
  memory: ['ref', 'version', 'source', 'text', 'copyright'],
  song: ['songId', 'title', 'ccli'],
  video: ['name', 'seconds'],
  picture: ['name'],
  youtube: ['videoId', 'start'],
  pptx: ['officeUrl', 'name'],
  text: ['words'],
  timer: ['seconds'],
  quiz: ['questions'],
  link: ['url', 'label']
};
/* A song's words, read once per call however many steps use it. */
async function songOf(id, seen, D) {
  id = String(id || '');
  if (!id || id.indexOf('/') >= 0) return null;
  if (!(id in seen)) seen[id] = (D || db()).collection('songs').doc(id).get().then(d => {
    if (!d.exists) return null;
    const x = d.data();
    return { title: String(x.title || ''), artist: String(x.artist || ''), ccli: String(x.ccli || ''), lyrics: String(x.lyrics || '') };
  });
  return seen[id];
}
export async function step(st, part, n, seen = {}, D = null) {
  const cid = D && D.churchId ? D.churchId : null;
  const keep = KEEP[st.type]; if (!keep) return null;
  const out = { part: String(part.title || part.kind || ''), partId: String(part.id || ''), n, type: st.type };
  keep.forEach(k => { if (st[k] !== undefined && st[k] !== null && st[k] !== '') out[k] = st[k]; });
  /* Bible Gateway: the reference only, never text. */
  if ((st.type === 'verses' || st.type === 'memory') && st.source === 'biblegateway') { delete out.text; delete out.copyright; }
  /* Files and video: a fresh short-lived link, never the stored one. */
  if (st.type === 'video' || st.type === 'picture') { out.url = await link(st.path, cid); out.expiresInMinutes = LINK_MS / 60000; }
  if (st.type === 'pptx' && st.path) out.fileUrl = await link(st.path, cid);
  if (st.type === 'song') { const w = await songOf(st.songId, seen, D); if (w) out.song = w; }
  return out;
}
export async function lessonOf(id, s, g, D = null) {
  let n = 0;
  const steps = [], seen = {};
  for (const p of (s.parts || [])) for (const st of (p.show || [])) { const x = await step(st, p, ++n, seen, D); if (x) steps.push(x); }
  const pa = s.passage || null;
  return {
    format: 'egbc-lesson/1', id, group: { id: s.groupId, name: g.name || '', ages: [g.ageFrom || 0, g.ageTo || 0] },
    date: s.date, title: s.title || '', programme: s.programme || '', lessonCode: s.lessonCode || '', lessonLink: s.lessonLink || '',
    passage: pa && pa.ref ? (pa.source === 'biblegateway' ? { ref: pa.ref, version: pa.version, source: 'biblegateway' }
      : { ref: pa.ref, version: pa.version, source: pa.source, text: pa.text || '', copyright: pa.copyright || '' }) : null,
    steps
  };
}

export const lessonFor = onCall({ region: REGION }, async (req) => {
  const D = churchOf(req, db()).db;
  const dev = await device(req, D);
  const d = req.data || {};
  const date = String(d.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'A date, as YYYY-MM-DD.');
  /* This building's groups only. */
  const gs = await D.collection('planGroups').where('siteId', '==', dev.siteId).get();
  const groups = {};
  gs.docs.forEach(x => { if (!x.data().archived) groups[x.id] = x.data(); });
  if (d.groupId !== undefined && d.groupId !== '') {
    const gid = String(d.groupId);
    if (!groups[gid]) throw new HttpsError('permission-denied', 'That group does not meet in this computer\'s building.');
    Object.keys(groups).forEach(k => { if (k !== gid) delete groups[k]; });
  }
  const ids = Object.keys(groups);
  const lessons = [];
  for (let i = 0; i < ids.length; i += 10) {
    const snap = await D.collection('planSessions').where('date', '==', date).where('groupId', 'in', ids.slice(i, i + 10)).get();
    for (const doc of snap.docs) {
      const s = doc.data();
      if (s.special === 'none') continue;
      lessons.push(await lessonOf(doc.id, s, groups[s.groupId] || {}, D));
    }
  }
  lessons.sort((a, b) => a.group.name.localeCompare(b.group.name));
  return { date, siteId: dev.siteId, lessons };
});
