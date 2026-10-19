/* ===================================================================
   EGBC — sermon plans, the other way: what the Preaching plan shows (F-229)
   ===================================================================

   Martin, 19 Oct: "a Sermons group whose sessions take date, speaker
   (events.speakerId) and passage from the rota / Preaching plan, linked
   both ways". The planner reads the service (eventId); this keeps the
   other direction without the planner ever writing the rota:

     sermonLinks/<eventId> = { eventId, sessionId, groupId, title, series,
                               passage, speakerId, updatedAt }

   kept from every plan of a group of kind 'sermon' that names a service.
   The Preaching plan (the main window's) reads it to show "Sermon plan:
   <title> · <passage>" and link to session-planner.html?s=<sessionId>.
   Read by any volunteer (as the rota is); written only here. The outline
   and the notes are never copied.

     sermonLinkKeep   trigger: planSessions/{id} written
   =================================================================== */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

const REGION = 'europe-west2';

export function linkOf(id, s) {
  return { eventId: String(s.eventId), sessionId: id, groupId: String(s.groupId || ''), title: String(s.title || '').slice(0, 120),
    series: String(s.series || '').slice(0, 80), passage: s.passage && s.passage.ref ? String(s.passage.ref).slice(0, 80) : '',
    speakerId: String(s.speakerId || ''), updatedAt: new Date().toISOString() };
}

export const sermonLinkKeep = onDocumentWritten({ document: 'planSessions/{id}', region: REGION }, async (event) => {
  const db = getFirestore();
  const id = event.params.id;
  const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  let isSermon = false;
  if (after && after.eventId) {
    const g = await db.collection('planGroups').doc(String(after.groupId)).get();
    isSermon = g.exists && g.data().kind === 'sermon';
  }
  /* The old service's link goes when the plan goes, moves, or stops being a sermon plan. */
  if (before && before.eventId && (!after || !isSermon || after.eventId !== before.eventId)) {
    const old = await db.collection('sermonLinks').doc(String(before.eventId)).get();
    if (old.exists && old.data().sessionId === id) await old.ref.delete();
  }
  if (after && isSermon) await db.collection('sermonLinks').doc(String(after.eventId)).set(linkOf(id, after));
});
