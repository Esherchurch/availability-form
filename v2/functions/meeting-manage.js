/* ===================================================================
   A meeting's room, its invitations and cancelling it (main window,
   28 Oct 2026: Martin tested meetings live; the reviewing window's
   five faults, "fix it properly")
   ===================================================================

     meetingRoom       { event } -> { key, url, label }
                       The meeting's own Daily room, made now if it is not
                       yet (functions/meeting-rooms.js makeOwnRoom), so the
                       page can show the invite link straight away.

     meetingInvite     { event }                        -> { invited }
                       { event, people: [memberId], guests: [{ name, email }] }
                                                        several at once, from
                                                        the New meeting form;
                                                        -> { invited, results }
                       { event, memberId }              invite one person
                                                        from the address book
                       { event, guest: { name, email } } invite somebody who
                                                        is not in it
                       { event, remove: { memberId | email } }
                       Each person invited is emailed at once: an address
                       book person gets the hub's meeting link (they sign in
                       as usual), a guest gets a GUEST LINK.

     meetingGuestJoin  { g } -> the meeting, for meet.html, nobody signed in

     meetingCancel     { event } -> { told }
                       Everyone who was emailed about it gets a short
                       "this meeting is cancelled"; its Daily room is
                       deleted; the meeting, its own part, its guest links
                       and its record of who was emailed are deleted.

   WHO: the meeting's organiser, a master admin, or an admin of one of the
   meeting's teams - the people who may host it (functions/video.js).

   A GUEST LINK (the rule agreed with the reviewing window): one link per
   guest, for one meeting, with no hub sign-in. The link carries a random
   key; only its SHA-256 is stored (meetingGuests/<hash>, which no page may
   read), so the database never holds a working link. It opens that one
   meeting and nothing else: meet.html shows the meeting and its room, and
   the guest knocks like anyone else - the host lets them in. It stops
   working when the meeting is cancelled, when the guest is taken off, and
   two hours after the meeting ends.

   NEVER AN UNDER-18 ON THEIR OWN: an address book record ticked under 18
   cannot be invited individually, and a guest address that belongs to one
   is refused (the hub never emails under-18s).

   meetingSends/<event id> keeps who was emailed (name, address, kind), so
   a cancellation reaches the same people. No page reads it.
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'node:crypto';
import { churchOf } from './church-scope.js';
import { dbForAddress } from './church-address.js';
import { makeDaily, DAILY_API_KEY, londonMs } from './video.js';
import { makeOwnRoom, closeOwnRoom, OWN } from './meeting-rooms.js';
import { makeSender } from './public-mail.js';
import { hubUrl } from './notify.js';
import { isUnder18Record, isUnder18Email } from './under18.js';
import { usesPart } from './parts.js';

/* A church that has switched Meetings off (Church settings) has none. */
async function meetingsUsed(db) {
  if (!(await usesPart(db, 'meetings'))) throw new HttpsError('failed-precondition', 'This church doesn\u2019t use video meetings.');
}

const REGION = 'europe-west2';
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const keyNow = () => { try { return DAILY_API_KEY.value() || ''; } catch (e) { return ''; } };
export const hashOf = (g) => createHash('sha256').update(String(g || '')).digest('hex');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const low = (s) => String(s || '').trim().toLowerCase();

export async function loadMeeting(db, id) {
  id = String(id || '');
  if (!id || id.includes('/') || id.length > 200) throw new HttpsError('invalid-argument', 'Which meeting?');
  const [e, m] = await Promise.all([db.collection('events').doc(id).get(), db.collection('meetings').doc(id).get()]);
  if (!e.exists) throw new HttpsError('not-found', 'That meeting is not there any more.');
  return { id, ev: e.data(), part: m.exists ? m.data() : {} };
}

export async function mayManage(db, uid, ev, part) {
  if (!uid) return null;
  const u = (await db.collection('users').doc(uid).get()).data();
  if (!u || u.status === 'archived') return null;
  const adminFor = Array.isArray(u.adminFor) ? u.adminFor : [];
  if (u.masterAdmin === true || (part.organiserUid && part.organiserUid === uid)
      || (ev.teams || []).some((t) => adminFor.includes(t))) return u;
  return null;
}
async function manager(db, uid, id) {
  const m = await loadMeeting(db, id);
  const u = await mayManage(db, uid, m.ev, m.part);
  if (!u) throw new HttpsError('permission-denied', 'Only the person who set up this meeting, a leader of its team or a master admin can do that.');
  return Object.assign(m, { user: u });
}

/* "Thursday 30 October, 19:30–21:00" */
export function whenOf(ev) {
  const day = ev.date ? new Date(ev.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '';
  return day + (ev.startTime ? ', ' + ev.startTime + (ev.endTime && ev.endTime !== ev.startTime ? '–' + ev.endTime : '') : '');
}
const titleOf = (ev, part) => String(ev.type || 'Meeting') + (part.description ? ' · ' + part.description : '');

function letter(church, lines, button) {
  return '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:560px">'
    + lines.map((l) => '<p style="margin:0 0 14px">' + l + '</p>').join('')
    + (button ? '<p style="margin:22px 0"><a href="' + esc(button.href) + '" style="background:#3d6263;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">' + esc(button.label) + '</a></p>'
      + '<p style="margin:0 0 14px;font-size:13px;color:#6b7280">Or paste this into your browser: ' + esc(button.href) + '</p>' : '')
    + '<p style="margin:22px 0 0;font-size:13px;color:#6b7280">' + esc(church.name || '') + '</p></div>';
}

async function record(db, id, who) {
  await db.collection('meetingSends').doc(id).set({ to: FieldValue.arrayUnion(who), updatedAt: new Date().toISOString() }, { merge: true });
}

export async function listInvited(db, id, part) {
  const ids = Array.isArray(part.invitees) ? part.invitees : [];
  const people = await Promise.all(ids.slice(0, 500).map((mid) => db.collection('addressBook').doc(String(mid)).get()
    .then((d) => ({ kind: 'member', memberId: String(mid), name: (d.exists && d.data().name) || 'Someone no longer in the address book' }))));
  const g = await db.collection('meetingGuests').where('meetingId', '==', id).get();
  return people.concat(g.docs.map((d) => ({ kind: 'guest', name: d.data().name || '', email: d.data().email || '' })));
}

export async function runInvite({ db, send, uid, data, now = new Date() }) {
  data = data || {};
  if (Array.isArray(data.people) || Array.isArray(data.guests)) return inviteMany({ db, send, uid, data, now });
  const m = await manager(db, uid, data.event);
  const { id, ev } = m;
  const mref = db.collection('meetings').doc(id);
  if (data.remove) {
    const mid = String(data.remove.memberId || ''), email = low(data.remove.email);
    if (mid) await mref.set({ invitees: FieldValue.arrayRemove(mid), updatedAt: now.toISOString(), updatedBy: uid }, { merge: true });
    if (email) {
      const g = await db.collection('meetingGuests').where('meetingId', '==', id).get();
      await Promise.all(g.docs.filter((d) => low(d.data().email) === email).map((d) => d.ref.delete()));
    }
    const part = (await mref.get()).data() || {};
    return { invited: await listInvited(db, id, part) };
  }
  const church = (await db.collection('churchSettings').doc('details').get()).data() || {};
  const hub = (await hubUrl(db)).replace(/\/+$/, '');
  if ((data.memberId || data.guest) && !hub) throw new HttpsError('failed-precondition', 'This church has no hub address yet, so no invitation link can be made.');
  const replyTo = EMAIL.test(low(m.user.email)) ? low(m.user.email) : (church.enquiryEmail || '');
  const host = String(m.user.name || '').trim() || 'The church';
  const title = titleOf(ev, m.part), when = whenOf(ev);
  let emailed = null;

  if (data.memberId) {
    const mid = String(data.memberId);
    const p = await db.collection('addressBook').doc(mid).get();
    if (!p.exists || mid.includes('/')) throw new HttpsError('not-found', 'That person is not in the address book.');
    const person = p.data();
    if (person.archived === true || person.status === 'archived') throw new HttpsError('failed-precondition', 'That person’s record is archived.');
    if (isUnder18Record(person)) throw new HttpsError('failed-precondition', 'An under-18 cannot be invited to a meeting on their own.');
    await mref.set({ invitees: FieldValue.arrayUnion(mid), updatedAt: now.toISOString(), updatedBy: uid }, { merge: true });
    const email = low(person.email);
    if (EMAIL.test(email)) {
      const link = hub + '/meeting.html?room=' + encodeURIComponent(ev.videoRoom || '') + '&event=' + encodeURIComponent(id);
      const r = await send({ to: [email], replyTo, subject: 'Invitation: ' + title + ', ' + when,
        html: letter(church, ['Hello ' + esc(String(person.name || '').split(' ')[0]) + ',',
          esc(host) + ' has invited you to <b>' + esc(title) + '</b> on ' + esc(when) + '.',
          ev.videoRoom ? 'It is a video meeting. Open it from the hub (sign in as usual) and the host will let you in.' : ''].filter(Boolean),
          ev.videoRoom ? { href: link, label: 'Open the meeting' } : null) }, { kind: 'meeting invitation', meetingId: id });
      emailed = !!(r && r.ok);
      if (emailed) await record(db, id, { kind: 'member', memberId: mid, name: String(person.name || ''), email });
    } else emailed = false;
  } else if (data.guest) {
    const name = String(data.guest.name || '').replace(/[\r\n<>]/g, ' ').trim().slice(0, 80);
    const email = low(data.guest.email);
    if (!name) throw new HttpsError('invalid-argument', 'Their name, please.');
    if (!EMAIL.test(email) || email.length > 200) throw new HttpsError('invalid-argument', 'That email address does not look right.');
    if (await isUnder18Email(db, email)) throw new HttpsError('failed-precondition', 'That address belongs to an under-18: the hub never emails under-18s.');
    if (!ev.videoRoom) throw new HttpsError('failed-precondition', 'This meeting has no video call, so a guest link would open nothing.');
    const g = randomBytes(24).toString('base64url');
    /* Only the hash is kept: the link itself is only in the guest's email. */
    await db.collection('meetingGuests').doc(hashOf(g)).set({ meetingId: id, name, email, createdAt: now.toISOString(), createdBy: uid });
    const link = hub + '/meet.html?g=' + g;
    const r = await send({ to: [email], replyTo, subject: 'Invitation: ' + title + ', ' + when,
      html: letter(church, ['Hello ' + esc(name.split(' ')[0]) + ',',
        esc(host) + ' from ' + esc(church.name || 'the church') + ' has invited you to a video meeting, <b>' + esc(title) + '</b>, on ' + esc(when) + '.',
        'Open the link a few minutes before. You do not need an account: type your name and knock, and ' + esc(host.split(' ')[0]) + ' will let you in.',
        'The link is for you alone, and for this meeting only.'],
        { href: link, label: 'Open the meeting' }) }, { kind: 'meeting guest invitation', meetingId: id });
    emailed = !!(r && r.ok);
    if (emailed) await record(db, id, { kind: 'guest', name, email });
  }
  const part = (await mref.get()).data() || {};
  return { invited: await listInvited(db, id, part), emailed };
}

/**
 * Invites several people and guests to one meeting, one at a time, so one
 * refusal does not stop the rest.
 * @returns {Promise<{ invited: object[], results: { name: string, ok: boolean, emailed: boolean, error?: string }[] }>}
 */
async function inviteMany({ db, send, uid, data, now }) {
  const people = (data.people || []).slice(0, 50).map(String), guests = (data.guests || []).slice(0, 50);
  const results = [];
  let invited = [];
  for (const memberId of people) {
    const p = (await db.collection('addressBook').doc(memberId).get().catch(() => null));
    const name = (p && p.exists && p.data().name) || memberId;
    try { const r = await runInvite({ db, send, uid, now, data: { event: data.event, memberId } }); invited = r.invited; results.push({ name, ok: true, emailed: r.emailed === true }); }
    catch (e) { results.push({ name, ok: false, emailed: false, error: e.message }); }
  }
  for (const g of guests) {
    const name = String((g && g.name) || '').slice(0, 80);
    try { const r = await runInvite({ db, send, uid, now, data: { event: data.event, guest: g } }); invited = r.invited; results.push({ name, ok: true, emailed: r.emailed === true }); }
    catch (e) { results.push({ name, ok: false, emailed: false, error: e.message }); }
  }
  if (!results.some((r) => r.ok)) invited = await listInvited(db, String(data.event), (await db.collection('meetings').doc(String(data.event)).get()).data() || {});
  return { invited, results };
}

export async function runGuestJoin({ db, data, now = Date.now() }) {
  const g = String((data && data.g) || '');
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(g)) throw new HttpsError('invalid-argument', 'This invitation link is not complete. Check you copied all of it.');
  const gd = await db.collection('meetingGuests').doc(hashOf(g)).get();
  if (!gd.exists) throw new HttpsError('not-found', 'This invitation link does not work any more. The meeting may have been cancelled: ask whoever invited you.');
  const guest = gd.data();
  const e = await db.collection('events').doc(String(guest.meetingId)).get();
  if (!e.exists || e.data().archived) throw new HttpsError('not-found', 'This meeting has been cancelled.');
  const ev = e.data();
  const end = londonMs(ev.date, ev.endTime || ev.startTime || '23:00');
  if (now > end + 2 * 3600000) throw new HttpsError('failed-precondition', 'This meeting has finished.');
  const part = (await db.collection('meetings').doc(String(guest.meetingId)).get()).data() || {};
  const v = (await db.collection('churchSettings').doc('video').get()).data() || {};
  const room = (v.rooms || []).find((r) => r.key === ev.videoRoom) || {};
  const church = (await db.collection('churchSettings').doc('details').get()).data() || {};
  if (!room.url) throw new HttpsError('unavailable', 'The meeting room is not ready yet. Try again in a minute.');
  return { name: guest.name || '', title: titleOf(ev, part), when: whenOf(ev), date: ev.date || '', startTime: ev.startTime || '',
    endTime: ev.endTime || '', url: room.url, church: church.name || '', logo: church.logoUrl || church.logo || '' };
}

export async function runCancel({ db, send, daily, uid, data }) {
  const m = await manager(db, uid, (data || {}).event);
  const { id, ev } = m;
  const church = (await db.collection('churchSettings').doc('details').get()).data() || {};
  const sent = ((await db.collection('meetingSends').doc(id).get()).data() || {}).to || [];
  const title = titleOf(ev, m.part), when = whenOf(ev), host = String(m.user.name || '').trim();
  const replyTo = EMAIL.test(low(m.user.email)) ? low(m.user.email) : (church.enquiryEmail || '');
  const seen = new Set();
  let told = 0;
  for (const p of sent) {
    const email = low(p.email);
    if (!EMAIL.test(email) || seen.has(email)) continue;
    seen.add(email);
    const r = await send({ to: [email], replyTo, subject: 'Cancelled: ' + title + ', ' + when,
      html: letter(church, ['Hello ' + esc(String(p.name || '').split(' ')[0]) + ',',
        '<b>' + esc(title) + '</b> on ' + esc(when) + ' has been cancelled' + (host ? ' by ' + esc(host) : '') + '.',
        'The link you were sent will not work any more.']) }, { kind: 'meeting cancelled', meetingId: id });
    if (r && r.ok) told++;
  }
  if (ev.videoRoom === OWN(id)) await closeOwnRoom({ db, daily, id });
  const g = await db.collection('meetingGuests').where('meetingId', '==', id).get();
  const batch = db.batch();
  g.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(db.collection('meetingSends').doc(id));
  batch.delete(db.collection('meetings').doc(id));
  batch.delete(db.collection('events').doc(id));
  await batch.commit();
  return { told, emailed: seen.size };
}

export const meetingRoom = onCall({ region: REGION, secrets: [DAILY_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, getFirestore());
  await meetingsUsed(ch.db);
  const m = await loadMeeting(ch.db, (req.data || {}).event);
  /* Its organiser, or anyone who may manage it: the page that saved it. */
  if (!(await mayManage(ch.db, req.auth.uid, m.ev, m.part))) throw new HttpsError('permission-denied', 'Not your meeting.');
  if (m.ev.videoRoom !== OWN(m.id)) throw new HttpsError('failed-precondition', 'This meeting has no room of its own.');
  const daily = makeDaily(keyNow());
  if (!daily) throw new HttpsError('failed-precondition', 'Video meetings are not set up yet: Church HQ’s Daily key has not been added.');
  const r = await makeOwnRoom({ db: ch.db, daily, cid: ch.id, id: m.id, ev: m.ev });
  return { key: r.key, url: r.url || '', label: r.label || '' };
});

export const meetingInvite = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, getFirestore());
  await meetingsUsed(ch.db);
  return runInvite({ db: ch.db, send: makeSender({ db: ch.db }), uid: req.auth.uid, data: req.data });
});

/* Nobody signed in: the church is the one whose address the page is on. */
export const meetingGuestJoin = onCall({ region: REGION }, async (req) => {
  const db = await dbForAddress(getFirestore(), req.rawRequest);
  if (!db) throw new HttpsError('not-found', 'This church’s address isn’t on Church HQ.');
  await meetingsUsed(db);
  return runGuestJoin({ db, data: req.data });
});

export const meetingCancel = onCall({ region: REGION, secrets: [DAILY_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, getFirestore());
  await meetingsUsed(ch.db);
  return runCancel({ db: ch.db, send: makeSender({ db: ch.db }), daily: makeDaily(keyNow()), uid: req.auth.uid, data: req.data });
});
