/* Reminder emails: room bookings, and a hirer's documents running out.
 *
 * Kept apart from index.js so it can be read and tested on its own:
 * everything here is a plain function of its arguments, with no Firestore,
 * no clock of its own and no network. The scheduled functions in index.js
 * fetch, call these, and send.
 *
 * THE SPEC IS NOT INVENTED HERE. It is F-074 and its addendum in
 * FINDINGS-events.md, written by the events window, which owns the booking
 * data. Where this file makes a decision the spec did not, it says so.
 */

/* ---- days, in London ------------------------------------------------
 *
 * A booking's `day` is a plain yyyy-mm-dd in London, written by a person
 * looking at a calendar. The server runs in UTC. From late March to late
 * October those are an hour apart, so "tomorrow" computed in UTC is the wrong
 * day for an hour every evening - and 09:00 London in summer IS 08:00 UTC, so
 * the run itself lands inside that hour. Hence a London day, always.
 */
export function londonDay(at) {
  /* en-CA gives yyyy-mm-dd, which is the shape the booking carries. */
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(at);
}

export function addDays(day, n) {
  const [y, m, d] = String(day).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return [t.getUTCFullYear(),
          String(t.getUTCMonth() + 1).padStart(2, '0'),
          String(t.getUTCDate()).padStart(2, '0')].join('-');
}

/* "Friday 14 November" - what a person reading the email would say. */
export function prettyDay(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  if (!y) return String(day || '');
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

const pad = (n) => String(n).padStart(2, '0');
export const hhmm = (mins) => pad(Math.floor((mins || 0) / 60)) + ':' + pad((mins || 0) % 60);

/* ---- who gets a reminder -------------------------------------------- */

/* An address we will not write to. `.invalid` is reserved by the RFCs exactly
   so it can never resolve, and every synthetic person in these checks uses
   it - so this is both the test-data guard and a real one. */
export function sendableEmail(e) {
  const s = String(e || '').trim().toLowerCase();
  if (!s || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return '';
  if (/\.invalid$/.test(s)) return '';
  return s;
}

/* F-074: the person who booked each CONFIRMED room booking, for tomorrow,
   who has not been reminded.

   Not: waiting, declined or cancelled; an event's own booking (the event has
   its own people) or one the office made for itself; no email; a .invalid
   address. Each date of a repeating booking is its own booking and gets its
   own reminder - which falls out of this for free, because each is a row. */
export function bookingsDueTomorrow(bookings, runAt) {
  const tomorrow = addDays(londonDay(runAt), 1);
  return (bookings || []).filter(b =>
    b &&
    b.day === tomorrow &&
    b.status === 'confirmed' &&
    (b.kind === 'member' || b.kind === 'hire') &&
    !b.reminderSentAt &&
    sendableEmail((b.requester || {}).email)
  );
}

/* ---- the booking reminder ------------------------------------------- */

const esc = (s) => String(s === null || s === undefined ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const li = (s) => '<p style="margin:0 0 6px">' + s + '</p>';

/* The whole message. Takes everything it needs rather than reading anything,
   so a check can hand it a made-up booking and compare the words. */
export function bookingReminder({ booking, room, site, church }) {
  const b = booking || {}, r = room || {}, s = site || {}, c = church || {};
  const start = hhmm(b.startMin), end = hhmm(b.endMin);
  const roomName = r.name || 'the room';
  const where = [s.name, s.address, s.postcode].filter(Boolean).join(', ');

  const bits = [];
  bits.push(li('<strong>' + esc(roomName) + '</strong>' + (where ? ' &middot; ' + esc(where) : '')));
  bits.push(li(esc(prettyDay(b.day)) + ', <strong>' + esc(start) + '</strong> to <strong>' + esc(end) + '</strong>'));

  /* Setting up and clearing away: the room is theirs for longer than the
     booking, and that is the bit people ring up about. Only said where they
     actually asked for it. */
  if (b.setupMins || b.packdownMins) {
    const from = hhmm((b.startMin || 0) - (b.setupMins || 0));
    const clear = hhmm((b.endMin || 0) + (b.packdownMins || 0));
    bits.push(li('The room is yours from ' + esc(from) + '. Please be clear by ' + esc(clear) + '.'));
  }

  if (b.title) bits.push(li('For: ' + esc(b.title)));
  if (b.people) bits.push(li(esc(b.people) + ' people' + (b.layout ? ', ' + esc(b.layout) : '')));

  const ref = (b.refreshments || {});
  if (ref.needed) {
    const items = (ref.items || []).join(', ');
    bits.push(li('Refreshments: ' + esc(items || 'yes') + (ref.notes ? ' &mdash; ' + esc(ref.notes) : '')));
  }
  const av = (b.av || {});
  if (av.needed) bits.push(li('AV: ' + esc(av.what || 'yes')));
  if ((b.resources || []).length) bits.push(li('Also: ' + esc((b.resources || []).join(', '))));

  /* House rules are for hirers. A member booking a room they are in every
     week does not need them read out again. */
  if (b.kind === 'hire' && r.houseRules) {
    bits.push('<p style="margin:14px 0 6px"><strong>House rules</strong></p>' +
      '<p style="margin:0 0 6px;white-space:pre-wrap">' + esc(r.houseRules) + '</p>');
  }

  bits.push('<p style="margin:14px 0 6px">Reference: <strong>' + esc(b.id || b.key || '') + '</strong></p>');

  /* How to get out of it, said the way that person can actually act on. */
  bits.push(b.kind === 'member'
    ? li('<strong>Can’t make it?</strong> Cancel it yourself in Book a room.')
    : li('<strong>Can’t make it?</strong> Reply to this email and we will sort it out.'));

  /* F-074: reply to the site's bookings address, or the church's enquiry
     address where the site has none. Never a person. */
  const replyTo = sendableEmail(s.bookingsEmail) || sendableEmail(c.enquiryEmail) || '';

  return {
    to: [sendableEmail((b.requester || {}).email)].filter(Boolean),
    subject: 'Reminder: ' + roomName + ', tomorrow ' + start + ' to ' + end,
    body: bits.join(''),
    replyTo,
    bookingKey: b.id || b.key || ''
  };
}

/* ---- a hirer's documents running out --------------------------------- */

const DOC_LABEL = {
  insurance: 'public liability insurance',
  safeguarding: 'safeguarding policy',
  risk: 'risk assessment',
  other: 'document'
};

/* F-074 addendum: 30 days before a document's expiry date, and on the day.
   Once each, marked on the document itself.

   `remindedAt` is a map rather than a single time, because there are two
   moments and the second must still happen after the first: { "30": iso,
   "0": iso }. The spec says "mark remindedAt" without saying how; one
   timestamp would make the day-of reminder look already sent. */
export function documentsDue(hirers, runAt) {
  const today = londonDay(runAt);
  const out = [];
  for (const h of hirers || []) {
    if (!h || h.active === false) continue;
    const docs = h.documents || [];
    docs.forEach((d, index) => {
      if (!d || !d.expires) return;
      const stage = d.expires === today ? '0'
        : d.expires === addDays(today, 30) ? '30'
        : null;
      if (!stage) return;
      if ((d.remindedAt || {})[stage]) return;
      out.push({ hirer: h, doc: d, index, stage });
    });
  }
  return out;
}

export function expiryReminder({ hirer, doc, site, church, nextBooking }) {
  const h = hirer || {}, d = doc || {}, s = site || {}, c = church || {};
  const what = DOC_LABEL[d.kind] || DOC_LABEL.other;
  const when = prettyDay(d.expires);
  const who = h.org || h.name || 'you';
  const replyTo = sendableEmail(s.bookingsEmail) || sendableEmail(c.enquiryEmail) || '';
  const office = sendableEmail(s.bookingsEmail) || sendableEmail(c.enquiryEmail) || '';

  const theirs = {
    to: [sendableEmail(h.email)].filter(Boolean),
    subject: 'Your ' + what + ' runs out on ' + when,
    body: li('Your ' + esc(what) + ' runs out on <strong>' + esc(when) + '</strong>.') +
          li('Please send us the new one.'),
    replyTo
  };

  /* The office gets the same, with whose it is and when they are next in -
     which is the thing that decides whether it matters today. */
  const ours = {
    to: [office].filter(Boolean),
    subject: esc(who) + ': ' + what + ' runs out on ' + when,
    body: li('<strong>' + esc(who) + '</strong>' + (h.name && h.org ? ' (' + esc(h.name) + ')' : '')) +
          li('Their ' + esc(what) + ' runs out on <strong>' + esc(when) + '</strong>.') +
          li(nextBooking
            ? 'Next booked in on ' + esc(prettyDay(nextBooking.day)) + ', ' +
              esc(hhmm(nextBooking.startMin)) + '.'
            : 'They have nothing booked after today.') +
          li('They have been asked for the new one.'),
    replyTo
  };

  return { theirs, ours };
}

/* The hirer's next booking from today, by email - which is how a hirer's
   bookings are tied to their record (the events window matches on it). */
export function nextBookingFor(hirer, bookings, runAt) {
  const today = londonDay(runAt);
  const mine = sendableEmail((hirer || {}).email);
  if (!mine) return null;
  return (bookings || [])
    .filter(b => b && b.status === 'confirmed' && b.day >= today &&
                 sendableEmail((b.requester || {}).email) === mine)
    .sort((a, b) => String(a.day).localeCompare(String(b.day)) || (a.startMin || 0) - (b.startMin || 0))[0] || null;
}
