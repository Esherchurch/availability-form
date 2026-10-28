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

   EVERY MEETING ITS OWN ROOM (Martin's test, 28 Oct 2026: a "Maintenance"
   meeting went out with the Worship Core Team's link). A meeting set up
   on the Meetings page or the rota (EGBCAuth.saveMeeting) is saved with
   videoRoom "m-<event id>" and gets a Daily room of its own, named from
   the church, the kind of meeting, its date and its id
   (egbc-maintenance-meeting-261030-ab12cd) - never an existing room, so
   never another meeting's. The page asks for it at once (meetingRoom,
   functions/meeting-manage.js) so it can show the link; this trigger
   makes it too, in case the page closed first. roomFrom on the event (a
   standing room it was booked into) lends the room its hosts and its
   members-only. The standing rooms stay, for drop-in use.

     makeOwnRoom({ db, daily, cid, id, ev })  -> the room's entry
     closeOwnRoom({ db, daily, id })          the meeting cancelled or deleted:
                                              its Daily room is deleted and it
                                              comes off the church's list
   =================================================================== */

import { dailyName, londonMs } from './video.js';
import { readTeamJobs, teamsFor } from './team-jobs.js';

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
  const from = (v0.rooms || []).find((r) => r.key === room) || {};
  const entry = { key, label: titleOf(after).slice(0, 80), teams: from.teams || [], hostTeams: from.hostTeams || [],
    members: from.members === true, meeting: id, from: room, until: after.date };
  if (made) { entry.daily = made.name; entry.url = made.url; }
  await register(db, entry);
  await db.collection('events').doc(id).update({ videoRoom: key, ownRoom: { from: room, because: titleOf(keeps).slice(0, 120) } });
  return key;
}

/* Onto the church's list (and roomsByKey, for the rules), once. Own rooms
   two days past their meeting come off the list as it goes: their Daily
   room has ended by then. */
async function register(db, entry) {
  const vref = db.collection('churchSettings').doc('video');
  const old = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10);
  return db.runTransaction(async (t) => {
    const s = await t.get(vref);
    const v = s.exists ? s.data() : {};
    const had = (v.rooms || []).find((r) => r.key === entry.key);
    if (had && had.url) return had;
    const byKey = Object.assign({}, v.roomsByKey || {});
    const rooms = (Array.isArray(v.rooms) ? v.rooms : []).filter((r) => {
      const gone = r.key === entry.key || (r.meeting && r.until && r.until < old);
      if (gone) delete byKey[r.key];
      return !gone;
    });
    rooms.push(entry);
    byKey[entry.key] = { teams: entry.teams, hostTeams: entry.hostTeams, members: entry.members };
    /* update, not a merged set: a merge would keep the keys taken out. */
    const out = { rooms, roomsByKey: byKey, updatedAt: new Date().toISOString() };
    if (s.exists) t.update(vref, out); else t.set(vref, out);
    return entry;
  });
}

/* The Daily name of a meeting's own room: the church, the kind, the day
   and the meeting (n: tried again after a name that was taken). */
export function ownRoomName(churchId, ev, id, n) {
  const kind = String(ev.type || 'meeting').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'meeting';
  const day = String(ev.date || '').replace(/-/g, '').slice(2, 8);
  return dailyName(churchId, kind + '-' + day + '-' + String(id).slice(0, 6) + (n ? '-' + n : ''));
}

export async function makeOwnRoom({ db, daily, cid, id, ev }) {
  const v0 = (await db.collection('churchSettings').doc('video').get()).data() || {};
  const key = OWN(id);
  const had = (v0.rooms || []).find((r) => r.key === key);
  if (had && had.url) return had;
  const churchId = v0.churchId || cid || 'egbc';
  const exp = Math.floor((span(ev)[1] + 864e5) / 1000);
  let made = null;
  for (let n = 0; daily && !made && n < 6; n++) made = await daily.room(ownRoomName(churchId, ev, id, n), { exp }, true);
  if (daily && !made) throw new Error('Daily would not make a room for meeting ' + id);
  const from = (v0.rooms || []).find((r) => r.key === ev.roomFrom && !r.meeting) || {};
  /* A members' meeting (functions/members-meeting.js) needs no standing
     room: church members only, hosted by whoever runs members' meetings. */
  const runners = ev.membersMeeting === true ? await readTeamJobs(db).then((tj) => teamsFor(tj.map, 'office', tj.set).concat(teamsFor(tj.map, 'trustees', tj.set))) : [];
  const entry = { key, label: titleOf(ev).slice(0, 80), teams: Array.from(new Set((ev.teams || []).concat(from.teams || []))),
    hostTeams: Array.from(new Set((from.hostTeams || []).concat(runners))), members: from.members === true || ev.membersMeeting === true,
    meeting: id, until: ev.date || '' };
  if (ev.roomFrom) entry.from = String(ev.roomFrom);
  if (made) { entry.daily = made.name; entry.url = made.url; }
  /* The page and this trigger may both have made one: the other is closed. */
  const kept = await register(db, entry);
  if (made && kept.daily !== made.name) await daily.remove(made.name).catch(() => {});
  return kept;
}

export async function closeOwnRoom({ db, daily, id }) {
  const vref = db.collection('churchSettings').doc('video');
  const key = OWN(id);
  const entry = ((await vref.get()).data() || {}).rooms?.find((r) => r.key === key);
  if (!entry) return false;
  if (daily && entry.daily) await daily.remove(entry.daily);
  await db.runTransaction(async (t) => {
    const v = (await t.get(vref)).data() || {};
    const byKey = Object.assign({}, v.roomsByKey || {});
    delete byKey[key];
    t.update(vref, { rooms: (v.rooms || []).filter((r) => r.key !== key), roomsByKey: byKey, updatedAt: new Date().toISOString() });
  });
  return true;
}

/* On every rota event written: EGBC's top-level path and each church's. */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { churchFromPath } from './church-scope.js';
import { makeDaily, DAILY_API_KEY } from './video.js';

const keyNow = () => { try { return DAILY_API_KEY.value() || ''; } catch (e) { return ''; } };
const onEvent = async (event) => {
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after : null;
  const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const ch = churchFromPath(event, getFirestore());
  const id = event.params.id;
  /* Deleted: a meeting's own room closes with it. */
  if (!after) return before && before.videoRoom === OWN(id) ? closeOwnRoom({ db: ch.db, daily: makeDaily(keyNow()), id }) : null;
  const ev = after.data();
  if (ev.videoRoom === OWN(id) && !ev.archived) return makeOwnRoom({ db: ch.db, daily: makeDaily(keyNow()), cid: ch.id, id, ev });
  return settleRoom({ db: ch.db, daily: makeDaily(keyNow()), cid: ch.id, id: event.params.id, after: after.data(),
    created: after.createTime ? after.createTime.toMillis() : 0 });
};
const OPTS = { region: 'europe-west2', secrets: [DAILY_API_KEY] };
export const meetingOwnRoom = onDocumentWritten(Object.assign({ document: 'events/{id}' }, OPTS), onEvent);
export const meetingOwnRoomChurch = onDocumentWritten(Object.assign({ document: 'churches/{cid}/events/{id}' }, OPTS), onEvent);
