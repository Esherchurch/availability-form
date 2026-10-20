/* ===================================================================
   Video meeting rooms, and the host's key to them (main window,
   21 Oct 2026; design-mocks/mailings/PLAN.md section 1)
   ===================================================================

   WHAT MARTIN HIT. Our rooms make everyone knock, and a host is whoever
   joins with an owner token - which, until now, was only ever made by hand
   in Daily's dashboard. So the person who set the meeting up knocked, with
   nobody to let them in.

   ONE CHURCH HQ DAILY ACCOUNT FOR EVERY CHURCH (Martin, 20 Oct), like
   Resend. Its key is Church HQ's alone, in Secret Manager as
   DAILY_API_KEY: Martin pastes it himself, once, with
       firebase functions:secrets:set DAILY_API_KEY
   No church sees or touches Daily, and the key is never stored in the
   database, never in a page, never in this repo.

   EACH CHURCH'S ROOMS are made here, in that account, named
   <churchId>-<room> (egbc-worship-av), so no two churches ever share one.
   churchSettings/video holds the church's list - key, label, the teams
   whose admins may host, members-only - and each room's Daily address
   once made. Nothing to press: the first page that needs the rooms asks
   videoRoomsEnsure, which makes any that are missing (rule 13). The room
   addresses are not secret: knowing one only lets you knock.
   EGBC's old egbc.daily.co rooms are left as they were (Martin, 20 Oct:
   move now, one key); every link the hub makes is a hub link now.

     videoRoomsEnsure   signed in -> { rooms }  (makes missing rooms)
     meetingHostToken   { room, event? } -> { token, url } for the
                        meeting's organiser, an admin of the room's teams,
                        or a master admin; refused to anyone else.
                        Daily's owner token (is_owner), in their name,
                        ending 30 minutes after the meeting (at most four
                        hours from now). Returned, never stored or logged.

   ON THE EMULATOR Daily is always pretended (key or not) (rooms at
   https://churchhq-test.daily.co/..., tokens "test-owner...") so the
   checks never reach the real Daily.
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';

const REGION = 'europe-west2';
export const DAILY_API_KEY = defineSecret('DAILY_API_KEY');
const API = 'https://api.daily.co/v1';
const EMULATOR = () => process.env.FUNCTIONS_EMULATOR === 'true';
const keyNow = () => { try { return DAILY_API_KEY.value() || ''; } catch (e) { return ''; } };
export const HUB = 'https://esherchurch.github.io/availability-form/v2';

/* EGBC's rooms as they were (meeting.html, the Rota Planner, the Core Team
   app), with the teams whose admins may host each. A new church starts
   with its own list; these are only EGBC's. */
export const EGBC_ROOMS = [
  { key: 'Worship-AV', label: 'Worship & AV', teams: ['Worship Team', 'AV Team'] },
  { key: 'worship-core-team', label: 'Worship Core Team', teams: ['Core Team'] },
  { key: 'Prayer', label: 'Prayer', teams: ['Core Team'] },
  { key: 'Eldership', label: 'Eldership', teams: ['Elders'] },
  /* hostTeams: anyone ON these teams may host, not just their admins - the
     members' meeting is chaired by the office or the Elders (21 Oct 2026). */
  { key: 'CMM', label: 'CMM', teams: ['Church office'], hostTeams: ['Church office', 'Elders'], members: true },
  { key: 'kids-ministries', label: 'Kids Ministries', teams: ['Kids Church'] },
  { key: 'interviews', label: 'Interviews', teams: ['Church office'] }
];
/* A meeting of this kind goes in this room unless it says otherwise. */
export const EGBC_BY_TYPE = {
  'Core Team Meeting': 'worship-core-team', 'Worship and AV Team Meeting': 'Worship-AV',
  'Worship Team Meeting': 'Worship-AV', 'AV Team Meeting': 'Worship-AV'
};

export const dailyName = (churchId, key) =>
  (String(churchId || 'church') + '-' + String(key || '')).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').slice(0, 60);

/* Daily, or its stand-in on the emulator. fetchImpl is for the checks. */
export function makeDaily(key, fetchImpl) {
  const f = fetchImpl || fetch;
  /* NEVER THE REAL DAILY FROM THE EMULATOR, key or no key (21 Oct 2026: the
     emulator reads Secret Manager too, and once DAILY_API_KEY was set a
     check made real rooms and real tokens). A check passes fetchImpl to
     reach a pretend API on purpose. */
  if (!key || (EMULATOR() && !fetchImpl)) {
    if (!EMULATOR()) return null;
    return {
      fake: true,
      room: async (name) => ({ name, url: 'https://churchhq-test.daily.co/' + name }),
      ownerToken: async (props) => ({ token: 'test-owner.' + props.room_name + '.' + props.user_id + '.' + props.exp })
    };
  }
  const call = async (method, path, body) => {
    const r = await f(API + path, { method, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, j };
  };
  return {
    fake: false,
    /* Made private, knocking on: everyone waits for the host. */
    room: async (name) => {
      const made = await call('POST', '/rooms', { name, privacy: 'private',
        properties: { enable_knocking: true, enable_screenshare: true, enable_prejoin_ui: true } });
      if (made.ok) return { name, url: made.j.url };
      const had = await call('GET', '/rooms/' + encodeURIComponent(name));
      if (had.ok) return { name, url: had.j.url };
      throw new Error('Daily would not make the room ' + name + ' (' + made.status + ')');
    },
    ownerToken: async (props) => {
      const t = await call('POST', '/meeting-tokens', { properties: Object.assign({ is_owner: true }, props) });
      if (!t.ok || !t.j.token) throw new Error('Daily gave no token (' + t.status + ')');
      return { token: t.j.token };
    }
  };
}

/* The church's rooms, each made in Daily if it is not yet. */
export async function ensureRooms(db, daily) {
  const ref = db.collection('churchSettings').doc('video');
  const snap = await ref.get();
  const cur = snap.exists ? snap.data() : {};
  const churchId = cur.churchId || 'egbc';
  const rooms = (Array.isArray(cur.rooms) && cur.rooms.length ? cur.rooms : EGBC_ROOMS).map(r => Object.assign({}, r));
  let changed = !snap.exists;
  for (const r of rooms) {
    /* Fields added since the room was recorded (hostTeams, 21 Oct 2026). */
    const def = EGBC_ROOMS.find(x => x.key === r.key) || {};
    if (!Array.isArray(r.teams)) { r.teams = def.teams || []; changed = true; }
    if (!Array.isArray(r.hostTeams)) { r.hostTeams = def.hostTeams || []; changed = true; }
    if (r.url) continue;
    if (!daily) continue;
    const made = await daily.room(dailyName(churchId, r.key));
    r.daily = made.name; r.url = made.url; changed = true;
  }
  const out = { churchId, rooms, byType: cur.byType || EGBC_BY_TYPE };
  if (changed) await ref.set(Object.assign({}, out, { updatedAt: new Date().toISOString() }), { merge: true });
  return out;
}

/* London wall-clock "YYYY-MM-DD" + "HH:MM" -> ms. */
export function londonMs(date, time) {
  const [y, m, d] = String(date).split('-').map(Number);
  const [hh, mm] = String(time || '23:59').split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const at = new Date(guess);
  const off = Date.parse(at.toLocaleString('en-US', { timeZone: 'Europe/London' })) - Date.parse(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  return guess - off;
}

/* Who may host: a master admin; an admin of one of the room's teams; the
   meeting's organiser, for that meeting in that room. */
export function mayHost({ user, uid, room, event, byType }) {
  if (!user || user.status === 'archived') return false;
  if (user.masterAdmin === true) return true;
  const adminFor = Array.isArray(user.adminFor) ? user.adminFor : [];
  if ((room.teams || []).some(t => adminFor.includes(t))) return true;
  const hostTeams = room.hostTeams || ((EGBC_ROOMS.find(r => r.key === room.key) || {}).hostTeams) || [];
  const teams = Array.isArray(user.teams) ? user.teams : [];
  if (hostTeams.some(t => teams.includes(t))) return true;
  if (event && event.organiserUid && event.organiserUid === uid) {
    const evRoom = event.videoRoom !== undefined ? event.videoRoom : ((byType || {})[event.type] || '');
    return evRoom === room.key;
  }
  return false;
}

export function tokenExpiry(event, now = Date.now()) {
  const cap = now + 4 * 3600000;
  if (!event || !event.date) return Math.floor((now + 3 * 3600000) / 1000);
  const end = londonMs(event.date, event.endTime || event.startTime || '23:00') + 30 * 60000;
  return Math.floor(Math.max(now + 60 * 60000, Math.min(cap, end)) / 1000);
}

export async function hostToken({ db, daily, uid, data, now }) {
  const roomKey = String((data && data.room) || '').slice(0, 80);
  const eventId = String((data && data.event) || '').slice(0, 200);
  if (!roomKey) throw new HttpsError('invalid-argument', 'Which room?');
  const v = await ensureRooms(db, daily);
  const room = v.rooms.find(r => r.key === roomKey);
  if (!room || !room.url) throw new HttpsError('not-found', 'There is no such meeting room.');
  const u = await db.collection('users').doc(uid).get();
  const user = u.exists ? u.data() : null;
  let event = null;
  if (eventId && !eventId.includes('/')) {
    const e = await db.collection('events').doc(eventId).get();
    event = e.exists ? e.data() : null;
  }
  if (!mayHost({ user, uid, room, event, byType: v.byType })) {
    throw new HttpsError('permission-denied', 'Only the person who set up this meeting, a leader of its team, or a master admin can start it as host.');
  }
  const exp = tokenExpiry(event, now || Date.now());
  const t = await daily.ownerToken({ room_name: room.daily || dailyName(v.churchId, room.key), user_name: String((user && user.name) || 'Host').slice(0, 60), user_id: uid, exp });
  return { token: t.token, url: room.url, expires: exp };
}

export const videoRoomsEnsure = onCall({ region: REGION, secrets: [DAILY_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const daily = makeDaily(keyNow());
  const v = await ensureRooms(getFirestore(), daily);
  return { rooms: v.rooms.map(r => ({ key: r.key, label: r.label, url: r.url || '', teams: r.teams || [], hostTeams: r.hostTeams || ((EGBC_ROOMS.find(x => x.key === r.key) || {}).hostTeams) || [], members: !!r.members })), byType: v.byType };
});

export const meetingHostToken = onCall({ region: REGION, secrets: [DAILY_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const daily = makeDaily(keyNow());
  if (!daily) throw new HttpsError('failed-precondition', 'Video meetings are not set up yet: Church HQ’s Daily key has not been added.');
  return hostToken({ db: getFirestore(), daily, uid: req.auth.uid, data: req.data });
});
