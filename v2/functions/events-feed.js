/* ===================================================================
   EGBC — a calendar people can subscribe to, that works (R7; F-182)
   ===================================================================

   Martin tried ChurchSuite's calendar feed and it did not work. This one
   is written to the letter of the calendar standard, so Google, Apple and
   Outlook all keep it:

     https://…/eventsFeed?church=1[&cat=a,b]   public events only, anyone
     https://…/eventsFeed?k=<key>[&cat=a,b]    what that person may see

   - One VEVENT per date, UID <calEventId>@<hub host>, never changed, so a
     calendar never shows the same date twice.
   - Times in Europe/London with a VTIMEZONE block (Outlook drops a feed
     without one); all-day dates as VALUE=DATE.
   - CRLF line ends, long lines folded at 75 BYTES (not characters, or an
     accented name breaks Outlook), text escaped.
   - A cancelled date stays, marked STATUS:CANCELLED, so calendars cross
     it out; SEQUENCE and LAST-MODIFIED from updatedAt, so changes show.
   - Never a not-listed or not-yet-public event; never another team's.
   - From 30 days ago to 18 months ahead.

     myEventsFeed      callable: the signed-in person's own link (and Reset)
     emailMyFeedLink   callable: email the link to the signed-in person's OWN
                       address, to add on a computer (Android, F-198)

   The events window's file. Exported from index.js the way public-mail.js
   is.
   =================================================================== */

import crypto from 'node:crypto';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { usesPart } from './parts.js';
import { hubUrl } from './notify.js';
import { makeSender } from './public-mail.js';
import { churchOf } from './church-scope.js';
import { codeHash, indexCode, dropCode, dbForCode } from './hq-codes.js';
import { dbForSlug } from './church-address.js';

const db = () => getFirestore();
const REGION = 'europe-west2';
const CRLF = '\r\n';

/* ------------------------------------------------------------ writing */

export function esc(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/* Fold at 75 octets, never splitting a character. */
export function fold(line) {
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join(CRLF + ' ');
}
const two = (n) => String(n).padStart(2, '0');
/* "2026-06-20T19:30" (London wall time, as the event stores it) -> 20260620T193000 */
export function local(isoLocal) {
  const m = String(isoLocal || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? m[1] + m[2] + m[3] + 'T' + m[4] + m[5] + '00' : '';
}
function utcStamp(ms) { const d = new Date(ms); return d.getUTCFullYear() + two(d.getUTCMonth() + 1) + two(d.getUTCDate()) + 'T' + two(d.getUTCHours()) + two(d.getUTCMinutes()) + two(d.getUTCSeconds()) + 'Z'; }
function dateOnly(isoLocal) { return String(isoLocal || '').slice(0, 10).replace(/-/g, ''); }
function dayAfter(isoLocal) { const [y, m, d] = String(isoLocal).slice(0, 10).split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + 1)); return t.getUTCFullYear() + two(t.getUTCMonth() + 1) + two(t.getUTCDate()); }
export function plain(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/London',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0000', 'TZOFFSETTO:+0100', 'TZNAME:BST', 'DTSTART:19700329T010000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0000', 'TZNAME:GMT', 'DTSTART:19701025T020000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'
];

export function whereOf(ev, look) {
  const loc = ev.location || {};
  if (loc.kind === 'online') return 'Online';
  if (loc.kind === 'venue') return look.venues[loc.venueId] || loc.venueName || '';
  const rooms = (loc.roomIds || []).map((r) => look.rooms[r]).filter(Boolean);
  const site = look.sites[loc.siteId] || loc.siteName || '';
  return rooms.length ? rooms.join(', ') + (site ? ', ' + site : '') : site;
}

/* The whole calendar, as text. Pure: the tests call it directly. */
export function buildEventsFeed({ events, look, calName, host, hub, now }) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Church hub//What\'s on//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(calName), 'X-WR-TIMEZONE:Europe/London', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'].concat(VTIMEZONE);
  const stamp = utcStamp(now || Date.now());
  events.slice().sort((a, b) => (a.startUtc || 0) - (b.startUtc || 0)).forEach((ev) => {
    const mod = Date.parse(ev.updatedAt || ev.createdAt || '') || 0;
    const url = hub + 'signup.html?event=' + encodeURIComponent(ev.id);
    const words = plain(ev.description);
    lines.push('BEGIN:VEVENT', 'UID:' + ev.id + '@' + host, 'DTSTAMP:' + stamp);
    if (ev.allDay) {
      lines.push('DTSTART;VALUE=DATE:' + dateOnly(ev.startLocal), 'DTEND;VALUE=DATE:' + dayAfter(ev.endLocal || ev.startLocal));
    } else {
      lines.push('DTSTART;TZID=Europe/London:' + local(ev.startLocal), 'DTEND;TZID=Europe/London:' + local(ev.endLocal || ev.startLocal));
    }
    lines.push(fold('SUMMARY:' + esc(ev.title || 'Event')));
    const where = whereOf(ev, look);
    if (where) lines.push(fold('LOCATION:' + esc(where)));
    lines.push(fold('DESCRIPTION:' + esc((words ? words + '\n\n' : '') + 'More, and signing up: ' + url)));
    lines.push(fold('URL:' + url));
    if (mod) lines.push('LAST-MODIFIED:' + utcStamp(mod), 'SEQUENCE:' + Math.max(0, Math.floor((mod - Date.UTC(2024, 0, 1)) / 60000)));
    lines.push('STATUS:' + (ev.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'), 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join(CRLF) + CRLF;
}

/* Who may see what: the audiences a person's record opens, as the pages
   work them out (E.myAudiences). Public feeds: 'public' alone. */
export function audiencesFor(user) {
  if (!user) return ['public'];
  const out = new Set(['public', 'members']);
  (user.teams || []).forEach((t) => out.add(t));
  (user.adminFor || []).forEach((t) => out.add(t));
  if (user.churchMember === true) out.add('churchMembers');
  return [...out];
}
export function visible(ev, audiences, cats) {
  if (!ev || ev.visibility === 'unlisted' || ev.status === 'pending') return false;
  const aud = Array.isArray(ev.audience) ? ev.audience : [];
  if (aud.includes('unlisted') || !aud.some((a) => audiences.includes(a))) return false;
  if (cats && cats.length && !cats.includes(ev.category || 'other')) return false;
  return true;
}

/* ------------------------------------------------------------ serving */

async function lookups(D) {
  const look = { sites: {}, rooms: {}, venues: {} };
  const [s, r, v] = await Promise.all(['sites', 'rooms', 'venues'].map((c) => D.collection(c).get()));
  s.docs.forEach((d) => { look.sites[d.id] = d.data().name || ''; });
  r.docs.forEach((d) => { look.rooms[d.id] = d.data().name || ''; });
  v.docs.forEach((d) => { look.venues[d.id] = d.data().name || ''; });
  return look;
}

export const eventsFeed = onRequest({ region: REGION, cors: false, invoker: 'public' }, async (req, res) => {
  const no = () => { res.set('Cache-Control', 'no-store'); res.status(404).type('text/plain').send('Not found'); };
  try {
    const key = String(req.query.k || '').trim(), pub = String(req.query.church || '') === '1';
    const cats = String(req.query.cat || '').split(',').map((c) => c.trim()).filter((c) => /^[a-z0-9-]{1,40}$/.test(c)).slice(0, 20);
    let audiences = ['public'], who = '', D;
    /* Which church (H-6 step 4): a person's key is in the codes index
       (a church's) or not (EGBC's); the public feed names the church's web
       address (?site=<slug>, functions/church-address.js), none for EGBC. */
    if (key) {
      if (!/^[A-Za-z0-9]{24,64}$/.test(key)) return no();
      D = await dbForCode(db(), 'feed', codeHash(key));
      const f = await D.collection('eventFeeds').doc(key).get();
      if (!f.exists) return no();
      const u = await D.collection('users').doc(f.data().uid).get();
      if (!u.exists || u.data().status !== 'active') return no();
      audiences = audiencesFor(u.data()); who = ' (mine)';
    } else if (!pub) return no();
    else if (!(D = await dbForSlug(db(), String(req.query.site || '').trim().toLowerCase()))) return no();
    if (!(await usesPart(D, 'events'))) return no();
    const now = Date.now();
    const snap = await D.collection('calEvents').where('startUtc', '>=', now - 30 * 864e5).where('startUtc', '<=', now + 548 * 864e5).get();
    const events = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => visible(e, audiences, cats));
    const church = await D.collection('churchSettings').doc('details').get();
    const name = (church.exists && church.data().name) || 'Church';
    let catNames = '';
    if (cats.length) {
      const cs = await D.collection('eventCategories').get(), names = {};
      cs.docs.forEach((d) => { names[d.id] = d.data().name; });
      catNames = ' - ' + cats.map((c) => names[c] || c).join(', ');
    }
    const hub = await hubUrl(D);
    let host = 'church-hub'; try { host = new URL(hub).host || host; } catch (e) {}
    const body = buildEventsFeed({ events, look: await lookups(D), calName: name + ' \u2013 What\'s on' + catNames + who, host, hub, now });
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'inline; filename="whats-on.ics"');
    res.set('Cache-Control', 'public, max-age=900');
    res.status(200).send(body);
  } catch (e) {
    console.error('eventsFeed', e);
    res.set('Cache-Control', 'no-store'); res.status(500).type('text/plain').send('Could not build the calendar');
  }
});

/* The signed-in person's own link: made once, kept, and Reset makes a new
   one (the old link stops working at once). */
/* The caller's church (its sign-in's), and their record in it. */
async function activeUser(req) {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const D = churchOf(req, db()).db;
  if (!(await usesPart(D, 'events'))) throw new HttpsError('failed-precondition', 'This church doesn\u2019t use Events.');
  const u = await D.collection('users').doc(uid).get();
  if (!u.exists || u.data().status !== 'active') throw new HttpsError('permission-denied', 'Your account is not active.');
  return { uid, user: u.data(), D };
}
/* A church's key also goes in the codes index, so the feed finds its church. */
async function keyFor(D, uid, reset) {
  const mine = await D.collection('eventFeeds').where('uid', '==', uid).get();
  if (mine.size && !reset) return mine.docs[0].id;
  const batch = D.batch();
  mine.docs.forEach((d) => batch.delete(d.ref));
  const key = crypto.randomBytes(24).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
  batch.set(D.collection('eventFeeds').doc(key), { uid, createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  await Promise.all(mine.docs.map((d) => dropCode(D, 'feed', codeHash(d.id))));
  await indexCode(D, 'feed', codeHash(key));
  return key;
}
export const myEventsFeed = onCall({ region: REGION }, async (req) => {
  const { uid, D } = await activeUser(req);
  const reset = !!(req.data && req.data.reset);
  return { key: await keyFor(D, uid, reset), ...(reset ? { reset: true } : {}) };
});

/* The feed's own address, as the pages build it (egbc-events.js feedUrl). */
export function feedLink({ project, emulator, key, cats, site }) {
  const base = emulator ? 'http://localhost:5102/' + project + '/europe-west2/eventsFeed' : 'https://europe-west2-' + project + '.cloudfunctions.net/eventsFeed';
  return base + (key ? '?k=' + encodeURIComponent(key) : '?church=1' + (site ? '&site=' + encodeURIComponent(site) : '')) + (cats.length ? '&cat=' + cats.join(',') : '');
}
const htmlEsc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function feedLinkEmail({ link, church, mine }) {
  const a = '<a href="' + htmlEsc(link) + '">' + htmlEsc(link) + '</a>';
  return {
    subject: (church ? church + ': ' : '') + 'your What\'s on calendar link',
    html: '<p>Here is the link to What\'s on, to add to your calendar. Open this email on a computer.</p>' +
      '<p style="font-size:15px;word-break:break-all">' + a + '</p>' +
      '<p><b>Google Calendar</b></p><ol><li>Go to calendar.google.com</li><li>Next to "Other calendars", click +, then "From URL"</li><li>Paste the link and click "Add calendar"</li></ol>' +
      '<p><b>Outlook</b></p><ol><li>Go to outlook.com and open Calendar</li><li>Click "Add calendar", then "Subscribe from web"</li><li>Paste the link, give it a name, and click "Import"</li></ol>' +
      '<p><b>Then on your phone:</b> Google Calendar &gt; Settings &gt; the new calendar &gt; Sync on.</p>' +
      (mine ? '<p>This is your own link: it shows members\' and team events, so please keep it to yourself.</p>' : '') +
      '<p style="color:#6b7280">You asked for this on the church hub. If you did not, you can ignore it.</p>'
  };
}
/* Only ever to the signed-in person's own address: nothing in the request
   can choose who it goes to. A few an hour at most. */
export const emailMyFeedLink = onCall({ region: REGION }, async (req) => {
  const { uid, user, D } = await activeUser(req);
  const to = String(user.email || (req.auth.token && req.auth.token.email) || '').trim();
  if (!/^[^@\s]+@[^@\s]+$/.test(to)) throw new HttpsError('failed-precondition', 'There is no email address on your account.');
  const ref = D.collection('feedLinkSent').doc(uid), now = Date.now();
  const times = ((await ref.get()).data() || {}).times || [];
  const recent = times.filter((t) => t > now - 3600e3);
  if (recent.length >= 5) throw new HttpsError('resource-exhausted', 'That has been sent a few times already. Look in your email, or try again in an hour.');
  const d = req.data || {};
  const cats = (Array.isArray(d.cats) ? d.cats : []).map(String).filter((c) => /^[a-z0-9-]{1,40}$/.test(c)).slice(0, 20);
  const mine = d.mine === true;
  const link = feedLink({ project: process.env.GCLOUD_PROJECT || JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId, emulator: process.env.FUNCTIONS_EMULATOR === 'true', key: mine ? await keyFor(D, uid, false) : '', cats,
    /* a church's public feed names its address: its first slug is its id (hqSlugs) */
    site: D.churchId || '' });
  const church = await D.collection('churchSettings').doc('details').get();
  const msg = feedLinkEmail({ link, church: church.exists ? church.data().name : '', mine });
  await ref.set({ times: recent.concat([now]) });
  const out = await makeSender({ db: D })({ to: [to], subject: msg.subject, html: msg.html }, { source: 'events-feed', kind: 'calendar link' });
  if (!out.ok) throw new HttpsError('unavailable', 'The email could not be sent. Copy the link instead.');
  return { ok: true };
});
