/* ===================================================================
   EGBC — a session plan for ChurchShow (F-225, agreed 16 Oct)
   ===================================================================

     lessonFor   callable, a PAIRED ChurchShow device only:
                   { date: 'YYYY-MM-DD' }  -> { lessons: [{ id, group, title, date }] }
                   { sessionId }           -> the plan as 'egbc-lesson/1'

   The device is checked the way churchshow.js and the rules' churchShow()
   do: signed in with the token claim device == 'churchshow', and
   devices/<uid>.active true - read on every call, so Disconnect on the hub
   stops it at once. churchshow.js is not changed.

   THE FORMAT (egbc-lesson/1, F-225):
     { format, id, group: { id, name, ages }, date, title, programme,
       lessonCode, lessonLink, passage: { ref, version, source, text,
       copyright }, steps: [ { part, partId, n, type, ... } ] }
   Every part's "show on screen" steps, in order. A Bible Gateway passage
   carries only ref and version (ChurchShow fetches it itself). Leaders'
   notes and "things to bring" are not sent to a screen device.
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

const REGION = 'europe-west2';
const db = () => getFirestore();

async function device(req) {
  const a = req.auth;
  if (!a || !a.token || a.token.device !== 'churchshow') throw new HttpsError('permission-denied', 'Only a paired ChurchShow computer can ask for a lesson.');
  const d = await db().collection('devices').doc(a.uid).get();
  if (!d.exists || d.data().active !== true) throw new HttpsError('permission-denied', 'This ChurchShow computer has been disconnected on the hub.');
  return d.data();
}

const KEEP = {
  verses: ['ref', 'version', 'source', 'text', 'copyright'],
  song: ['songId', 'title', 'ccli'],
  video: ['url', 'name', 'seconds'],
  youtube: ['videoId', 'start'],
  picture: ['url', 'name'],
  pptx: ['officeUrl', 'fileUrl', 'name'],
  text: ['words'],
  memory: ['ref', 'version', 'source', 'text', 'copyright'],
  timer: ['seconds'],
  quiz: ['questions'],
  link: ['url', 'label']
};
export function step(st, part, n) {
  const keep = KEEP[st.type]; if (!keep) return null;
  const out = { part: String(part.title || part.kind || ''), partId: String(part.id || ''), n, type: st.type };
  keep.forEach(k => { if (st[k] !== undefined && st[k] !== null && st[k] !== '') out[k] = st[k]; });
  /* Bible Gateway: the reference only, never text. */
  if ((st.type === 'verses' || st.type === 'memory') && st.source === 'biblegateway') { delete out.text; delete out.copyright; }
  return out;
}
export function lessonOf(id, s, g) {
  let n = 0;
  const steps = [];
  (s.parts || []).forEach(p => (p.show || []).forEach(st => { const x = step(st, p, ++n); if (x) steps.push(x); }));
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
  await device(req);
  const d = req.data || {};
  if (d.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) throw new HttpsError('invalid-argument', 'A date, as YYYY-MM-DD.');
    const snap = await db().collection('planSessions').where('date', '==', d.date).get();
    const groups = {};
    const out = [];
    for (const doc of snap.docs) {
      const s = doc.data();
      if (s.special === 'none') continue;
      if (!groups[s.groupId]) groups[s.groupId] = (await db().collection('planGroups').doc(String(s.groupId)).get()).data() || {};
      out.push({ id: doc.id, group: groups[s.groupId].name || '', title: s.title || '', date: s.date });
    }
    return { lessons: out };
  }
  const id = String(d.sessionId || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new HttpsError('invalid-argument', 'Which lesson?');
  const doc = await db().collection('planSessions').doc(id).get();
  if (!doc.exists) throw new HttpsError('not-found', 'That lesson could not be found.');
  const s = doc.data();
  const g = (await db().collection('planGroups').doc(String(s.groupId)).get()).data() || {};
  return lessonOf(id, s, g);
});
