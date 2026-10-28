/* ===================================================================
   A members' meeting IS a meeting
   ===================================================================

   Planning one on church-meeting.html (churchMeetings/{id}) keeps a
   matching meeting, so it shows in Meetings and the hub's card, has its
   own video room, and its votes happen inside the call (egbc-vote.js):

     events/cm-<id>    what the rota and the room trigger need, with
                       membersMeeting: true and churchMeeting: <id>
     meetings/cm-<id>  its title, organiser (whoever planned it) and
                       membersMeeting: true, which is who is invited:
                       the church's members (a proxy holder is one too)

   The event's videoRoom is "m-cm-<id>", so meetingOwnRoom
   (functions/meeting-rooms.js) makes its Daily room, church members only
   and hosted by the teams doing the office and trustees jobs.

   A members' meeting is never deleted (it is archived, the minutes and
   results stay), so the meeting only goes when it is cancelled or
   archived, or if its record is somehow deleted. Its room closes with it.
   =================================================================== */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { churchFromPath } from './church-scope.js';
import { meetingWordOf } from './church-words.js';

const REGION = 'europe-west2';
/* The id of a members' meeting's matching meeting. */
export const meetingIdOf = (mid) => 'cm-' + mid;

/* "19:45" -> "21:45": an end for the room, which closes a day after. */
export function endOf(time) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(time || ''));
  if (!m) return '';
  const mins = Math.min(23 * 60 + 59, Number(m[1]) * 60 + Number(m[2]) + 120);
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
}
const termOf = (date) => {
  const mo = Number(String(date).slice(5, 7)), y = String(date).slice(0, 4);
  return (mo <= 4 ? 'Spring' : mo <= 8 ? 'Summer' : 'Autumn') + ' ' + y;
};
const gone = (m) => !m || m.archived === true || m.status === 'cancelled' || m.status === 'archived' || !/^\d{4}-\d{2}-\d{2}$/.test(String(m.date || ''));
const same = (a, b) => !!a && !!b && ['title', 'date', 'time', 'status', 'archived', 'createdBy'].every((k) => a[k] === b[k]);

/**
 * Bring a members' meeting's matching meeting into line with it.
 * @param {object} p
 * @param {FirebaseFirestore.Firestore} p.db the church's database (scoped)
 * @param {string} p.mid the members' meeting's id
 * @param {object|null} p.after the members' meeting now, or null if deleted
 * @returns {Promise<'saved'|'removed'|'none'>}
 */
export async function syncMembersMeeting({ db, mid, after }) {
  const id = meetingIdOf(mid);
  const ev = db.collection('events').doc(id), part = db.collection('meetings').doc(id);
  if (gone(after)) {
    if (!(await ev.get()).exists) return 'none';
    await Promise.all([ev.delete(), part.delete()]);
    return 'removed';
  }
  const startTime = /^\d{2}:\d{2}$/.test(String(after.time || '')) ? after.time : '19:30';
  /* Its kind is the church's own word for it (functions/church-words.js). */
  const common = { type: await meetingWordOf(db), date: after.date, startTime, endTime: endOf(startTime), teams: [], videoRoom: 'm-' + id, membersMeeting: true };
  await Promise.all([
    ev.set(Object.assign({ meeting: true, churchMeeting: mid, termLabel: termOf(after.date), roles: [], archived: false }, common), { merge: true }),
    part.set(Object.assign({ description: String(after.title || '').slice(0, 200), organiserUid: String(after.createdBy || ''), invitees: [],
      churchMeeting: mid, updatedAt: new Date().toISOString(), updatedBy: 'members-meeting' }, common), { merge: true }),
  ]);
  return 'saved';
}

const onWrite = async (event) => {
  const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  /* A paper added or an outcome typed changes nothing here. */
  if (same(before, after)) return;
  const ch = churchFromPath(event, getFirestore());
  await syncMembersMeeting({ db: ch.db, mid: event.params.id, after });
};
export const membersMeetingSync = onDocumentWritten({ document: 'churchMeetings/{id}', region: REGION }, onWrite);
export const membersMeetingSyncChurch = onDocumentWritten({ document: 'churches/{cid}/churchMeetings/{id}', region: REGION }, onWrite);
