/* ===================================================================
   EGBC — the emails the public pages used to send themselves (F-168)
   ===================================================================
   Events window. NEXT-BRIEF §26 item 14: on switch-over day sendEmail
   stops taking messages from a browser with nobody signed in, so every
   email a guest's page sent goes from here instead, when what they did
   is saved:

     publicMailSignup        signups created           the sign-up confirmation (signup.html)
     publicMailBookingAsked  bookings created, waiting "your booking is waiting" (book.html, rooms.html)
     publicMailBookingOffice the same                  the office hears of it
     publicMailCancelAsk     bookings updated          a hirer asks to cancel (my-booking.html)
     publicMailFormDone      formRequests -> done      "form received" (form.html)
     publicMailGroupAsk      smallGroupRequests created the person, and the group's leaders (groups.html)
     publicMailNewHere       welcomes created          "someone new said hello" (newhere.html)

   THE WORDS ARE THE PAGES' OWN. public-mail-pages.cjs is the pages'
   files, copied word for word (screenshots/events/public-mail-pages.mjs),
   run here in a sandbox that stands in for a browser in England: so a
   sign-up at 19:30 says 19:30 in October and in June, and its calendar
   file is right in both.

   SENT WITH THE SERVER'S IDENTITY (§26 item 4b), exactly as index.js's
   sendOne does, with one difference: the sign-up confirmation carries its
   calendar file and check-in codes, and sendOne sends no attachments. On
   the emulator nothing is sent; every message lands in emailOutbox.

   EACH ONE HONOURS ITS FEATURE SWITCH (churchSettings/features.<name> is
   false = off): events, roomBookings, forms, smallGroups, newHere.

   A TRIGGER THAT RUNS TWICE SENDS ONCE: publicMailSent/<what>_<doc> is
   made first, and only once.

   index.js needs one line (the main window's file):
     export * from './public-mail.js';
   =================================================================== */

import vm from 'node:vm';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { emailAuthHeader, idTokenClient } from './id-token.js';
import { hubUrl } from './notify.js';

const require = createRequire(import.meta.url);
const PAGES = require('./public-mail-pages.cjs');

const REGION = 'europe-west2';
/* The same address as index.js's SEND_EMAIL_URL; public-mail.test.mjs
   fails if the two ever differ. */
export const SEND_EMAIL_URL = 'https://sendemail-irkwdhx3xq-uc.a.run.app';
const onEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

/* ------------------------------------------------------------ sending */

/* sendOne's twin, with attachments. emailOutbox gets the same row sendOne
   writes, plus where it came from; the attachments by name only, and any
   private link to medical answers (&s=) hidden, because the people who may
   read the outbox are not all people who may read those. */
export function makeSender({ db, url = SEND_EMAIL_URL, auth, emulator = onEmulator, fetchFn } = {}) {
  const client = idTokenClient(url);
  const header = auth || (() => emailAuthHeader(client));
  return async function send(msg, meta) {
    const row = {
      to: msg.to || [], subject: msg.subject || '', replyTo: msg.replyTo || '',
      html: String(msg.html || '').replace(/([?&]s=)[A-Za-z0-9]+/g, '$1(hidden)'),
      attachments: (msg.attachments || []).map(a => ({ filename: a.filename || '', type: a.type || '' })),
      ...meta, at: new Date().toISOString(), stubbed: emulator()
    };
    if (!row.to.length) {
      await db.collection('emailOutbox').add({ ...row, ok: false, error: 'no address' });
      return { ok: false, error: 'no address' };
    }
    if (emulator()) {
      await db.collection('emailOutbox').add({ ...row, ok: true });
      console.info('[public-mail] emulator: not sent -', row.subject, '->', row.to.join(', '));
      return { ok: true, stubbed: true };
    }
    let out;
    try {
      const payload = { to: row.to, subject: row.subject, html: msg.html || '' };
      if (row.replyTo) payload.replyTo = row.replyTo;
      if (msg.attachments && msg.attachments.length) payload.attachments = msg.attachments;
      const a = await header();
      row.auth = a.Authorization ? 'google' : 'none';
      const r = await (fetchFn || fetch)(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...a }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => null);
      out = j && j.ok ? { ok: true } : { ok: false, error: (j && j.error) || ('HTTP ' + r.status) };
    } catch (e) {
      out = { ok: false, error: e.message || String(e) };
    }
    await db.collection('emailOutbox').add({ ...row, ok: out.ok, error: out.error || '' });
    return out;
  };
}

/* ------------------------------------------------- a browser in England */

/* Date, as a page in England sees it: "2026-06-20T19:30" is 19:30 London
   time, and getHours() says 19. Without this a server in UTC would put
   every summer event an hour out in its calendar file. */
const LONDON_DATE = `(function (g) {
  var D = g.Date;
  var F = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: 'numeric',
    day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  function parts(t) { var o = {}; F.formatToParts(new D(t)).forEach(function (p) { o[p.type] = +p.value; }); return o; }
  function offset(t) { var p = parts(t); return D.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000; }
  function fromWall(y, mo, d, h, mi, s, ms) { var w = D.UTC(y, mo, d, h, mi, s, ms); var t = w - offset(w); return w - offset(t); }
  var LOCAL = /^(\\d{4})-(\\d\\d)-(\\d\\d)T(\\d\\d):(\\d\\d)(?::(\\d\\d)(?:\\.(\\d{1,3})\\d*)?)?$/;
  class L extends D {
    constructor() {
      var a = Array.prototype.slice.call(arguments), m;
      if (a.length === 1 && typeof a[0] === 'string' && (m = LOCAL.exec(a[0]))) {
        super(fromWall(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0), +((m[7] || '0') + '00').slice(0, 3)));
      } else if (a.length >= 2) {
        super(fromWall(a[0], a[1], a.length > 2 ? a[2] : 1, a[3] || 0, a[4] || 0, a[5] || 0, a[6] || 0));
      } else super(...a);
    }
    getFullYear() { return parts(this.getTime()).year; }
    getMonth() { return parts(this.getTime()).month - 1; }
    getDate() { return parts(this.getTime()).day; }
    getDay() { var p = parts(this.getTime()); return new D(D.UTC(p.year, p.month - 1, p.day)).getUTCDay(); }
    getHours() { return parts(this.getTime()).hour; }
    getMinutes() { return parts(this.getTime()).minute; }
    getSeconds() { return parts(this.getTime()).second; }
    getTimezoneOffset() { return -offset(this.getTime()) / 60000; }
  }
  g.Date = L;
})(this);`;

/* A canvas just big enough for the check-in code: white, black squares,
   and a PNG out of the end, as the page's canvas.toDataURL gives. */
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf) >>> 0;
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function grayPng(w, h, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w + 1) + 1, y * w, y * w + w);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function canvas() {
  let px = null;
  const c = { width: 0, height: 0,
    getContext() {
      px = Buffer.alloc(c.width * c.height, 255);
      return { fillStyle: '#000', fillRect(x, y, w, h) {
        const v = /^#f{3}(f{3})?$/i.test(this.fillStyle) ? 255 : 0;
        for (let j = Math.max(0, y); j < Math.min(c.height, y + h); j++) px.fill(v, j * c.width + Math.max(0, x), j * c.width + Math.min(c.width, x + w));
      } };
    },
    toDataURL() { return 'data:image/png;base64,' + grayPng(c.width, c.height, px || Buffer.alloc(c.width * c.height, 255)).toString('base64'); }
  };
  return c;
}
/* A <div>'s text, which is all the calendar file asks of one. */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
export function textOf(html) {
  return String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/(p|div|h\d|li|ul|ol|blockquote)>/gi, '\n\n').replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, k) => ENT[k]).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function div() {
  let t = '';
  return { set innerHTML(h) { t = textOf(h); }, get textContent() { return t; } };
}

/* The pages' files, loaded fresh for each email, with the church's own
   details. EGBCChurch.send keeps what the page would have sent. */
export function pages({ hub, church = {} }) {
  const sent = [];
  const at = new URL(hub + 'signup.html');
  const ctx = {
    console, URL, Intl, TextEncoder,
    btoa: (s) => Buffer.from(String(s), 'latin1').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('latin1'),
    setTimeout, clearTimeout,
    location: { origin: at.origin, pathname: at.pathname, hostname: at.hostname, href: at.href, protocol: at.protocol, search: '', hash: '' },
    navigator: { userAgent: 'egbc-server' },
    document: { currentScript: { src: hub + 'egbc-events.js' }, createElement: (t) => (t === 'canvas' ? canvas() : div()),
      querySelector: () => null, getElementById: () => null, head: { appendChild() {} }, body: { appendChild() {} } }
  };
  ctx.window = ctx; ctx.self = ctx;
  ctx.EGBCChurch = {
    name: () => church.name || '', email: () => church.enquiryEmail || '', logo: () => church.logoUrl || '',
    wrap: (t, b, f) => ctx.EGBCEmail.wrap(t, b, f),
    send: (m) => { sent.push(m); return Promise.resolve({ ok: true }); },
    uses: () => true, load: () => Promise.resolve()
  };
  vm.createContext(ctx);
  vm.runInContext(LONDON_DATE, ctx, { filename: 'london-date.js' });
  for (const f of Object.keys(PAGES)) vm.runInContext(PAGES[f], ctx, { filename: f });
  return { sent, E: ctx.EGBCEvents, B: ctx.EGBCBookings, F: ctx.EGBCForms, G: ctx.EGBCGroups, wrap: ctx.EGBCChurch.wrap, esc: ctx.EGBCEvents.esc };
}

/* ----------------------------------------------------------- settings */

async function data(db, col, id) {
  if (!id) return null;
  try { const s = await db.collection(col).doc(String(id)).get(); return s.exists ? (s.data() || {}) : null; }
  catch (e) { return null; }
}
async function featureOn(db, name) {
  const f = await data(db, 'churchSettings', 'features');
  return !(f && f[name] === false);
}
async function once(db, id) {
  try { await db.collection('publicMailSent').doc(id).create({ at: new Date().toISOString() }); return true; }
  catch (e) { if (e.code === 6 || /already exists/i.test(String(e.message))) return false; throw e; }
}
/* hub: only a check gives one, so links lead to its own pages. */
async function setting(db, hub) {
  return { hub: hub || await hubUrl(db), church: (await data(db, 'churchSettings', 'details')) || {} };
}

/* ------------------------------------------------------- the seven */

/* Each takes what was saved and returns what happened, so a check can
   call it directly as well as through the trigger. */
export const handlers = {

  /* 1. signup.html. A sign-up is made in two places: that page, and a
     walk-in at the door (egbc-events-checkin.js), which was never emailed.
     A walk-in's key starts w_, and it saves its check-in in the same write. */
  async signup({ db, send, key, doc, hub }) {
    if (!doc || !doc.calEventId || doc.status === 'cancelled') return { skipped: 'nothing to confirm' };
    if (!(await featureOn(db, 'events'))) return { skipped: 'switched off' };
    if (/^w_/.test(key) || await data(db, 'checkins', doc.calEventId + '__' + key + '__0')) return { skipped: 'a walk-in at the door' };
    const ev = await data(db, 'calEvents', doc.calEventId);
    if (!ev) return { skipped: 'no event' };
    /* F-184: a whole-series booking is ONE email, sent with its first date. */
    const group = await data(db, 'seriesSignups', key);
    if (group && Array.isArray(group.keys) && group.keys[0] !== key) return { skipped: 'part of a whole-series booking' };
    if (!(await once(db, 'signup_' + key))) return { skipped: 'already sent' };
    ev.id = doc.calEventId;
    const loc = ev.location || {}, look = { sites: {}, rooms: {}, venues: {} };
    if (loc.siteId) look.sites[loc.siteId] = ((await data(db, 'sites', loc.siteId)) || {}).name || '';
    for (const r of (loc.roomIds || [])) look.rooms[r] = ((await data(db, 'rooms', r)) || {}).name || '';
    if (loc.venueId) look.venues[loc.venueId] = ((await data(db, 'venues', loc.venueId)) || {}).name || '';
    const P = pages(await setting(db, hub));
    /* F-183: what is owed on the day, from the event's own ticket types. */
    const ticketsOf = async (id) => (await db.collection('calEvents').doc(id).collection('ticketTypes').get()).docs.map(d => ({ id: d.id, ...d.data() }));
    let toPay = P.E.toPay(doc, await ticketsOf(doc.calEventId)), dates = null;
    if (group) {
      dates = []; toPay = 0;
      for (let i = 0; i < group.keys.length; i++) {
        const su = await data(db, 'signups', group.keys[i]), e = await data(db, 'calEvents', group.calEventIds[i]);
        if (!su || !e) continue;
        dates.push({ ev: { ...e, id: group.calEventIds[i] }, status: su.status });
        toPay += P.E.toPay(su, await ticketsOf(group.calEventIds[i]));
      }
      dates.sort((a, b) => (a.ev.startUtc || 0) - (b.ev.startUtc || 0));
    }
    const mail = P.E.confirmationEmail({ ev, where: P.E.locationText(ev, look), email: doc.email, name: doc.name,
      places: doc.places, attendees: doc.attendees || [], manageKey: key, status: doc.status, toPay, dates });
    return { sent: [await send(mail, { source: 'public-mail', kind: 'signup', ref: key })] };
  },

  /* 2 and 3. book.html and rooms.html: a request waiting for the office.
     A repeating one is one email for every date, sent by its first date. */
  async bookingAsked(args) { return booking(args, 'person'); },
  async bookingOffice(args) { return booking(args, 'office'); },

  /* 4. my-booking.html: a hirer asks to cancel. */
  async cancelAsk({ db, send, key, before, after, hub }) {
    const was = before && before.cancelRequest && before.cancelRequest.status;
    const now = after && after.cancelRequest && after.cancelRequest.status;
    if (now !== 'asked' || was === 'asked') return { skipped: 'not a new ask' };
    if (!(await featureOn(db, 'roomBookings'))) return { skipped: 'switched off' };
    const st = await setting(db, hub), site = (await data(db, 'sites', after.siteId)) || {}, room = await data(db, 'rooms', after.roomId);
    const to = site.bookingsEmail || st.church.enquiryEmail || '';
    if (!to) return { skipped: 'no address to tell' };
    if (!(await once(db, 'cancelAsk_' + key + '_' + stampOf(after.cancelRequest.at)))) return { skipped: 'already sent' };
    const P = pages(st), bk = Object.assign({ key }, after), r = bk.requester || {}, esc = P.esc, why = after.cancelRequest.reason || '';
    const mail = { to: [to], subject: 'Asking to cancel: ' + (room ? room.name + ', ' : '') + P.B.when(bk),
      html: P.wrap('A hirer is asking to cancel', '<p>' + esc(r.name || bk.memberName || '') + (r.org ? ' (' + esc(r.org) + ')' : '') + ' asks to cancel <strong>' + esc(bk.title || 'a booking') +
        '</strong>, ' + esc(room ? room.name : '') + ', ' + esc(P.B.when(bk)) + ' (reference ' + esc(P.B.ref(bk)) + ').</p>' + (why ? '<p>' + esc(why) + '</p>' : '') +
        '<p>Open <strong>Room bookings</strong> in the hub to cancel it or keep it.</p>') };
    return { sent: [await send(mail, { source: 'public-mail', kind: 'cancel ask', ref: key })] };
  },

  /* 5. form.html: the form is in, or "still correct". The link to see
     what was sent carries the medical answers' own key, which only this
     email and the person have. */
  async formDone({ db, send, key, before, after, hub }) {
    if (!after || after.status !== 'done' || (before && before.status === 'done')) return { skipped: 'not newly done' };
    if (!(await featureOn(db, 'forms'))) return { skipped: 'switched off' };
    if (!after.email) return { skipped: 'no address' };
    if (!(await once(db, 'formDone_' + key))) return { skipped: 'already sent' };
    const reused = !!after.confirmedStillCorrect;
    let secret = '';
    if (!reused && after.responseId) {
      const q = await db.collection('sensitiveResponses').where('requestKey', '==', key).where('responseId', '==', after.responseId).limit(1).get();
      if (!q.empty) secret = q.docs[0].id;
    }
    const P = pages(await setting(db, hub));
    const mail = P.F.doneEmail(Object.assign({ key }, after), secret, reused);
    return { sent: [await send(mail, { source: 'public-mail', kind: 'form received', ref: key })] };
  },

  /* 6. groups.html: the person, and the group's leaders. The page could
     only tell the leaders when a member asked (a guest cannot read their
     addresses); from here they always hear. */
  async groupAsk({ db, send, id, doc, hub }) {
    if (!doc || !doc.groupId) return { skipped: 'no group' };
    if (!(await featureOn(db, 'smallGroups'))) return { skipped: 'switched off' };
    const g = await data(db, 'smallGroups', doc.groupId);
    if (!g) return { skipped: 'no group' };
    if (!(await once(db, 'groupAsk_' + id))) return { skipped: 'already sent' };
    const P = pages(await setting(db, hub)), esc = P.esc, name = g.name || doc.groupName || '', out = [];
    if (doc.email) out.push(await send({ to: [doc.email], subject: 'Your request to join ' + name,
      html: P.wrap('Your request to join ' + esc(name), '<p>Dear ' + esc(doc.name) + ',</p><p>Thank you for asking to join <b>' + esc(name) + '</b> (' + esc(P.G.when(g)) + '). We have passed it to the group\'s leaders, who will be in touch.</p>') },
      { source: 'public-mail', kind: 'group ask', ref: id }));
    const to = [];
    for (const m of (g.leaderIds || [])) { const p = await data(db, 'addressBook', m); if (p && p.email && to.indexOf(p.email) < 0) to.push(p.email); }
    if (to.length) out.push(await send({ to, subject: doc.name + ' would like to join ' + name,
      html: P.wrap('Someone would like to join ' + esc(name), '<p>' + esc(doc.name) + ' (' + esc(doc.email) + (doc.phone ? ', ' + esc(doc.phone) : '') + ') has asked to join <b>' + esc(name) + '</b>.</p>' +
        (doc.message ? '<p>' + esc(doc.message) + '</p>' : '') + '<p>Accept or decline on Small groups, Requests.</p>') },
      { source: 'public-mail', kind: 'group ask leaders', ref: id }));
    return { sent: out };
  },

  /* 7. newhere.html: a copy to the address the church chose, so nothing
     waits on somebody opening the hub. This is the only copy: the main
     window's alert function does not send one (FINDINGS-events F-170). */
  async newHere({ db, send, id, doc, hub }) {
    if (!doc || !doc.name) return { skipped: 'nothing said' };
    if (!(await featureOn(db, 'newHere'))) return { skipped: 'switched off' };
    const st = await setting(db, hub), pub = (await data(db, 'welcomeSettings', 'public')) || {};
    const to = pub.notifyEmail || st.church.enquiryEmail || '';
    if (!to) return { skipped: 'no address to tell' };
    if (!(await once(db, 'newHere_' + id))) return { skipped: 'already sent' };
    const P = pages(st), esc = P.esc;
    const rows = '<p><b>' + esc(doc.name) + '</b> said hello' + (doc.contactMe ? ' and would like someone to get in touch.' : '.') + '</p>' +
      (doc.email ? '<p>Email: ' + esc(doc.email) + '</p>' : '') + (doc.phone ? '<p>Phone: ' + esc(doc.phone) + '</p>' : '') +
      (doc.message ? '<p>' + esc(doc.message).replace(/\n/g, '<br>') + '</p>' : '');
    return { sent: [await send({ to: [to], subject: 'Someone new said hello: ' + String(doc.name).slice(0, 80), html: P.wrap('Someone new said hello', rows) },
      { source: 'public-mail', kind: 'new here', ref: id })] };
  }
};

function stampOf(v) {
  if (v && typeof v.toMillis === 'function') return String(v.toMillis());
  return String(v || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 30) || 'x';
}

async function booking({ db, send, key, doc, hub }, who) {
  if (!doc || doc.status !== 'requested') return { skipped: 'not waiting' };
  if (doc.series && doc.series.id && doc.series.n !== 1) return { skipped: 'sent with the first date' };
  if (!(await featureOn(db, 'roomBookings'))) return { skipped: 'switched off' };
  let list = [Object.assign({ key }, doc)];
  if (doc.series && doc.series.id) {
    const q = await db.collection('bookings').where('series.id', '==', doc.series.id).get();
    list = q.docs.map(d => Object.assign({ key: d.id }, d.data()))
      .filter(b => b.roomId === doc.roomId && b.status === 'requested')
      .sort((a, b) => (a.series.n || 0) - (b.series.n || 0));
  }
  const room = (await data(db, 'rooms', doc.roomId)) || {}, site = (await data(db, 'sites', doc.siteId)) || {};
  if (!(await once(db, (who === 'office' ? 'bookingOffice_' : 'bookingAsked_') + key))) return { skipped: 'already sent' };
  const P = pages(await setting(db, hub));
  const r = who === 'office' ? await P.B.tellOffice(list, room.name || '', site) : await P.B.emailMany(list, room.name || '', 'waiting');
  if (!P.sent.length) return { skipped: (r && r.error) || 'nothing to send' };
  return { sent: [await send(P.sent[0], { source: 'public-mail', kind: who === 'office' ? 'booking request' : 'booking waiting', ref: key })] };
}

/* ----------------------------------------------------------- triggers */

let sender = null;
function deps() {
  const db = getFirestore();
  if (!sender) sender = makeSender({ db });
  return { db, send: sender };
}
const created = (doc, fn, idName) => onDocumentCreated({ document: doc, region: REGION }, (e) =>
  fn({ ...deps(), [idName]: e.params[idName], doc: e.data && e.data.data() }));
const updated = (doc, fn) => onDocumentUpdated({ document: doc, region: REGION }, (e) =>
  fn({ ...deps(), key: e.params.key, before: e.data && e.data.before.data(), after: e.data && e.data.after.data() }));

export const publicMailSignup = created('signups/{key}', handlers.signup, 'key');
export const publicMailBookingAsked = created('bookings/{key}', handlers.bookingAsked, 'key');
export const publicMailBookingOffice = created('bookings/{key}', handlers.bookingOffice, 'key');
export const publicMailCancelAsk = updated('bookings/{key}', handlers.cancelAsk);
export const publicMailFormDone = updated('formRequests/{key}', handlers.formDone);
export const publicMailGroupAsk = created('smallGroupRequests/{id}', handlers.groupAsk, 'id');
export const publicMailNewHere = created('welcomes/{id}', handlers.newHere, 'id');
