/* ===================================================================
   Meeting rooms in use: two meetings never share a link at the same time
   (main window, 27 Oct 2026)
   ===================================================================

   MARTIN: "a link for a particular time should somehow say it is in use.
   If we have a small group link we could have 5 groups at the same time."

   A meeting goes in its room (the one picked, or its kind's usual room,
   as before). When another meeting already has that room at an
   overlapping time, this one gets ITS OWN ROOM, made here in Church HQ's
   Daily account (functions/video.js) and kept on the church's list as
   "m-<event id>", marked as one meeting's (meeting: <id>) so no page lists
   it as a standing room. Who may host it, and whether it is members-only,
   are the standing room's. The page that booked it says so.

   WHICH ONE KEEPS THE ROOM: the meeting set up first (the document's
   creation time, then its id). Each meeting decides for itself against
   the others, so five set up in the same second still end with exactly
   one in the standing room and four in rooms of their own - whichever
   order the triggers run in.

   An own room is never moved back: its link may already be in invitations.
   Its Daily room ends a day after the meeting.

     clashWith(me, others, byType)  -> the meeting that keeps the room, or null
     settleRoom({ db, daily, cid, id, after, created }) -> the own room's key, or null
   =================================================================== */

import { dailyName, londonMs } from './video.js';

export const roomOf = (ev, byType) => (ev.videoRoom !== undefined ? ev.videoRoom : ((byType || {})[ev.type] || ''));
export const OWN = (id) => 'm-' + id;
export const isOwn = (key) => /^m-/.test(String(key || ''));
/* Only the kind: a room's label (churchSettings/video) and an event's
   ownRoom are read by the whole church, and a meeting's own words are not
   theirs to read (the meetings split, 28 Oct 2026). */
export const titleOf = (ev) => String(ev.type || 'Meeting');

/* A meeting's time, London wall-clock: start to end, an hour if it has no end. */
export function span(ev) {
  const s = londonMs(ev.date, ev.startTime || '00:00');
  const e = ev.endTime && ev.endTime > (ev.startTime || '') ? londonMs(ev.date, ev.endTime) : s + 3600000;
  return [s, e];
}
export const overlaps = (a, b) => { const x = span(a), y = span(b); return x[0] < y[1] && y[0] < x[1]; };
const before = (a, b) => (a.created !== b.created ? a.created < b.created : String(a.id) < String(b.id));

export function clashWith(me, others, byType) {
  const room = roomOf(me, byType);
  if (!room || isOwn(room) || me.archived || !me.date) return null;
  const firsts = (others || []).filter((o) => o.id !== me.id && !o.archived && o.date === me.date
    && roomOf(o, byType) === room && overlaps(me, o) && before(o, me));
  firsts.sort((a, b) => (before(a, b) ? -1 : 1));
  return firsts[0] || null;
}

export async function settleRoom({ db, daily, cid, id, after, created }) {
  if (!after || after.archived || !after.date) return null;
  const vref = db.collection('churchSettings').doc('video');
  const v0 = (await vref.get()).data() || {};
  const room = roomOf(after, v0.byType);
  if (!room || isOwn(room)) return null;
  const snap = await db.collection('events').where('date', '==', after.date).get();
  const others = snap.docs.filter((d) => d.id !== id)
    .map((d) => Object.assign({}, d.data(), { id: d.id, created: d.createTime ? d.createTime.toMillis() : 0 }));
  const keeps = clashWith(Object.assign({}, after, { id, created }), others, v0.byType);
  if (!keeps) return null;

  const key = OWN(id);
  const churchId = v0.churchId || cid || 'egbc';
  const exp = Math.floor((span(after)[1] + 864e5) / 1000);
  const made = daily ? await daily.room(dailyName(churchId, key), { exp }) : null;
  await db.runTransaction(async (t) => {
    const s = await t.get(vref);
    const v = s.exists ? s.data() : {};
    const rooms = Array.isArray(v.rooms) ? v.rooms.slice() : [];
    if (rooms.some((r) => r.key === key)) return;
    const from = rooms.find((r) => r.key === room) || {};
    const byKey = Object.assign({}, v.roomsByKey || {});
    const entry = { key, label: titleOf(after).slice(0, 80), teams: from.teams || [], hostTeams: from.hostTeams || [],
      members: from.members === true, meeting: id, from: room, until: after.date };
    if (made) { entry.daily = made.name; entry.url = made.url; }
    rooms.push(entry);
    byKey[key] = { teams: entry.teams, hostTeams: entry.hostTeams, members: entry.members };
    t.set(vref, { rooms, roomsByKey: byKey, updatedAt: new Date().toISOString() }, { merge: true });
  });
  await db.collection('events').doc(id).update({ videoRoom: key, ownRoom: { from: room, because: titleOf(keeps).slice(0, 120) } });
  return key;
}

/* On every rota event written: EGBC's top-level path and each church's. */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { churchFromPath } from './church-scope.js';
import { makeDaily, DAILY_API_KEY } from './video.js';

const keyNow = () => { try { return DAILY_API_KEY.value() || ''; } catch (e) { return ''; } };
const onEvent = async (event) => {
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after : null;
  if (!after) return null;
  const ch = churchFromPath(event, getFirestore());
  return settleRoom({ db: ch.db, daily: makeDaily(keyNow()), cid: ch.id, id: event.params.id, after: after.data(),
    created: after.createTime ? after.createTime.toMillis() : 0 });
};
const OPTS = { region: 'europe-west2', secrets: [DAILY_API_KEY] };
export const meetingOwnRoom = onDocumentWritten(Object.assign({ document: 'events/{id}' }, OPTS), onEvent);
export const meetingOwnRoomChurch = onDocumentWritten(Object.assign({ document: 'churches/{cid}/events/{id}' }, OPTS), onEvent);
