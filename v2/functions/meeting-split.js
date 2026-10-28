/* =====================================================================
   THE MEETINGS SPLIT (Martin, 28 Oct 2026: "fix it properly". Nobody may
   read a meeting they aren't invited to, even by reading the database.)
   ---------------------------------------------------------------------
   A meeting is a rota event, and the rota reads every event. So a
   meeting's event (events/{id}, meeting: true) keeps only what the rota
   needs - date, times, kind, teams, room - and its own words move to
   meetings/{id}, which firestore.rules lets only the invited read:
     description  its title and notes
     organiserUid who set it up (may start it as host)
     invitees     anyone named on it
   meetings/{id} also carries a copy of the event's teams, date, times and
   room, because the rules decide "invited" from the teams.

   WHAT IS A MEETING: an event marked meeting: true (the pages mark the
   ones they make), or any event with a video room whose kind is not a
   service (the church's kinds, churchSettings/services; EGBC's five
   services when nothing is stored). A Sunday with a livestream room is a
   service, not a meeting.

   splitOne() does it for one event: the trigger (meetingSplit and
   meetingSplitChurch) on every write, so nothing private stays on an
   event for longer than the write takes, and tools/split-meetings.mjs for
   the meetings already there (a dry run first).
   ===================================================================== */
const PRIVATE = ['description', 'organiserUid', 'invitees', 'publicTitle'];
const COPY = ['teams', 'date', 'startTime', 'endTime', 'videoRoom'];
const EGBC_SERVICES = ['Sunday Morning Worship', 'Evening Carol Service', 'Midnight Service', 'Special Service', 'LOUD Worship'];

export async function serviceKinds(db) {
  const cfg = (await db.collection('churchSettings').doc('services').get()).data();
  return cfg && Array.isArray(cfg.types) && cfg.types.length ? cfg.types.filter((t) => t && t.service).map((t) => t.name) : EGBC_SERVICES;
}

export function isMeeting(ev, services) {
  if (!ev) return false;
  if (ev.meeting === true) return true;
  return !!ev.videoRoom && !services.includes(ev.type) && ev.whatsOn !== true;
}

/* -> null (nothing to do) or what it did. */
export async function splitOne(db, id, ev, services, apply = true) {
  if (!isMeeting(ev, services)) return null;
  const moving = PRIVATE.filter((k) => ev[k] !== undefined);
  const mref = db.collection('meetings').doc(id), eref = db.collection('events').doc(id);
  const m = (await mref.get()).data() || {};
  const copy = {};
  COPY.forEach((k) => { if (ev[k] !== undefined && JSON.stringify(m[k]) !== JSON.stringify(ev[k])) copy[k] = ev[k]; });
  if (!moving.length && ev.meeting === true && !Object.keys(copy).length) return null;
  const out = { id, moved: moving, copied: Object.keys(copy), flagged: ev.meeting !== true };
  if (!apply) return out;
  const priv = {};
  moving.forEach((k) => { if (k !== 'publicTitle') priv[k] = ev[k]; else if (!m.description && !ev.description) priv.description = ev[k]; });
  const { FieldValue } = await import('firebase-admin/firestore');
  const batch = db.batch();
  batch.set(mref, Object.assign({}, priv, copy, { updatedAt: new Date().toISOString(), updatedBy: 'meeting-split' }), { merge: true });
  if (moving.length || ev.meeting !== true) {
    const strip = { meeting: true };
    moving.forEach((k) => { strip[k] = FieldValue.delete(); });
    batch.update(eref, strip);
  }
  await batch.commit();
  return out;
}

/* An event deleted: its private part goes with it. */
export async function dropOne(db, id) {
  await db.collection('meetings').doc(id).delete().catch(() => {});
}
