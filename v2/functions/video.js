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
   THE STANDING ROOMS COME FROM THE CHURCH'S OWN TEAMS (Martin's test, 28
   Oct 2026): one for each team that no room covers yet, made when a team
   is added (videoRoomsForTeams), for drop-in use. Every meeting set up
   gets a room of its own (functions/meeting-rooms.js), never a standing
   one, so two meetings never share a room.
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
import { churchOf } from './church-scope.js';
import { EGBC_HUB } from './hub-address.js';

const REGION = 'europe-west2';
export const DAILY_API_KEY = defineSecret('DAILY_API_KEY');
const API = 'https://api.daily.co/v1';
const EMULATOR = () => process.env.FUNCTIONS_EMULATOR === 'true';
const keyNow = () => { try { return DAILY_API_KEY.value() || ''; } catch (e) { return ''; } };
/* EGBC's hub, without its last "/" (said once, in hub-address.js). */
export const HUB = EGBC_HUB.replace(/\/+$/, '');

/* NO ROOM NAMES IN THE CODE (reviewing window, 28 Oct 2026: build for any
   church). EGBC's rooms have been its own stored list (churchSettings/video)
   since 21 Oct; these stay as names other files import, and are empty. */
export const EGBC_ROOMS = [];
export const EGBC_BY_TYPE = {};

/* A team's standing room: its key and its name. */
export const teamRoomKey = (teamId) => 'team-' + String(teamId || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
/* The church's teams with no room yet -> a standing room each. */
export async function teamRooms(db, rooms) {
  let snap;
  try { snap = await db.collection('teams').limit(500).get(); } catch (e) { return []; }
  const covered = new Set();
  rooms.forEach(r => (r.teams || []).forEach(t => covered.add(t)));
  const keys = new Set(rooms.map(r => r.key));
  const out = [];
  snap.docs.forEach(d => {
    const t = d.data() || {};
    if (t.archived === true || covered.has(d.id)) return;
    const key = teamRoomKey(d.id);
    if (!key || key === 'team-' || keys.has(key)) return;
    keys.add(key);
    out.push({ key, label: String(t.label || t.name || d.id).slice(0, 80), teams: [d.id], hostTeams: [] });
  });
  return out;
}

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
      ownerToken: async (props) => ({ token: 'test-owner.' + props.room_name + '.' + props.user_id + '.' + props.exp }),
      remove: async () => true
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
    /* extra: more of Daily's room properties (a meeting's own room ends: exp).
       fresh: a meeting's own room - never one that is already there, which
       could be another meeting's (null when the name is taken). */
    room: async (name, extra, fresh) => {
      const made = await call('POST', '/rooms', { name, privacy: 'private',
        properties: Object.assign({ enable_knocking: true, enable_screenshare: true, enable_prejoin_ui: true }, extra || {}) });
      if (made.ok) return { name, url: made.j.url };
      if (fresh && made.status === 400) return null;
      const had = await call('GET', '/rooms/' + encodeURIComponent(name));
      if (had.ok) return { name, url: had.j.url };
      throw new Error('Daily would not make the room ' + name + ' (' + made.status + ')');
    },
    ownerToken: async (props) => {
      const t = await call('POST', '/meeting-tokens', { properties: Object.assign({ is_owner: true }, props) });
      if (!t.ok || !t.j.token) throw new Error('Daily gave no token (' + t.status + ')');
      return { token: t.j.token };
    },
    /* A cancelled meeting's room is closed: anyone still holding its link
       finds nothing. Gone already is fine. */
    remove: async (name) => {
      const r = await call('DELETE', '/rooms/' + encodeURIComponent(name));
      return r.ok || r.status === 404;
    }
  };
}

/* The church's rooms, each made in Daily if it is not yet.
   churchFrom: the church from the sign-in (H-5), or none for EGBC. A
   church's rooms are named after IT (dailyName), and a church with no rooms
   yet starts with none - EGBC's seven are EGBC's. EGBC's own path is as
   it was. */
export async function ensureRooms(db, daily, churchFrom) {
  const ref = db.collection('churchSettings').doc('video');
  const snap = await ref.get();
  const cur = snap.exists ? snap.data() : {};
  const legacy = !churchFrom;
  const churchId = legacy ? (cur.churchId || 'egbc') : churchFrom;
  const defaults = [];
  const rooms = (Array.isArray(cur.rooms) ? cur.rooms : []).map(r => Object.assign({}, r));
  /* EGBC's record is left exactly as it was; a church's says whose it is. */
  let changed = !snap.exists || (!legacy && cur.churchId !== churchId);
  /* A standing room for each of the church's teams that has none. */
  const fresh = await teamRooms(db, rooms.filter(r => !r.meeting));
  if (fresh.length) { rooms.push(...fresh); changed = true; }
  for (const r of rooms) {
    /* Fields added since the room was recorded (hostTeams, 21 Oct 2026). */
    const def = defaults.find(x => x.key === r.key) || {};
    if (!Array.isArray(r.teams)) { r.teams = def.teams || []; changed = true; }
    if (!Array.isArray(r.hostTeams)) { r.hostTeams = def.hostTeams || []; changed = true; }
    if (r.url) continue;
    if (!daily) continue;
    const made = await daily.room(dailyName(churchId, r.key));
    r.daily = made.name; r.url = made.url; changed = true;
  }
  /* THE SAME ROOMS, KEYED, for the rules (F-263, 22 Oct 2026): rules cannot
     search a list for a room, so meetingInvitee() / meetingHost() look a
     room up here by its key. Kept in step with `rooms` on every write. */
  const roomsByKey = {};
  rooms.forEach(r => { roomsByKey[r.key] = { teams: r.teams || [], hostTeams: r.hostTeams || [], members: r.members === true || (defaults.find(x => x.key === r.key) || {}).members === true }; });
  if (JSON.stringify(cur.roomsByKey || null) !== JSON.stringify(roomsByKey)) changed = true;
  const out = { churchId, rooms, roomsByKey, byType: cur.byType || {} };
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
  const hostTeams = room.hostTeams || [];
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

export async function hostToken({ db, daily, uid, data, now, churchId }) {
  const roomKey = String((data && data.room) || '').slice(0, 80);
  const eventId = String((data && data.event) || '').slice(0, 200);
  if (!roomKey) throw new HttpsError('invalid-argument', 'Which room?');
  const v = await ensureRooms(db, daily, churchId);
  const room = v.rooms.find(r => r.key === roomKey);
  if (!room || !room.url) throw new HttpsError('not-found', 'There is no such meeting room.');
  const u = await db.collection('users').doc(uid).get();
  const user = u.exists ? u.data() : null;
  let event = null;
  if (eventId && !eventId.includes('/')) {
    const e = await db.collection('events').doc(eventId).get();
    event = e.exists ? e.data() : null;
    /* The organiser is on the meeting's own part (the meetings split). */
    if (event && event.meeting === true) {
      const m = await db.collection('meetings').doc(eventId).get();
      if (m.exists && m.data().organiserUid) event = Object.assign({}, event, { organiserUid: m.data().organiserUid });
    }
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
  const ch = churchOf(req, getFirestore());
  const v = await ensureRooms(ch.db, daily, ch.id);
  return { rooms: v.rooms.map(r => ({ key: r.key, label: r.label, url: r.url || '', teams: r.teams || [], hostTeams: r.hostTeams || [], members: !!r.members, meeting: r.meeting || '' })), byType: v.byType };
});

/* A team added or renamed: its standing room, straight away. */
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { churchFromPath } from './church-scope.js';
const onTeam = async (event) => {
  if (!event.data || !event.data.after || !event.data.after.exists) return null;
  const ch = churchFromPath(event, getFirestore());
  return ensureRooms(ch.db, makeDaily(keyNow()), ch.id).then(() => null);
};
export const videoRoomsForTeams = onDocumentWritten({ document: 'teams/{id}', region: REGION, secrets: [DAILY_API_KEY] }, onTeam);
export const videoRoomsForTeamsChurch = onDocumentWritten({ document: 'churches/{cid}/teams/{id}', region: REGION, secrets: [DAILY_API_KEY] }, onTeam);

export const meetingHostToken = onCall({ region: REGION, secrets: [DAILY_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const daily = makeDaily(keyNow());
  if (!daily) throw new HttpsError('failed-precondition', 'Video meetings are not set up yet: Church HQ’s Daily key has not been added.');
  const ch = churchOf(req, getFirestore());
  return hostToken({ db: ch.db, daily, uid: req.auth.uid, data: req.data, churchId: ch.id });
});
