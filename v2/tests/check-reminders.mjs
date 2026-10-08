/* Reminder emails: do the right people get one, once, and nobody else?
 *
 *   set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec ^
 *     --config firebase.spare.json --only firestore,auth,functions ^
 *     --project egbc-worship-planner "node tests/check-reminders.mjs"
 *
 * (from v2/. On the SPARE ports, so it runs while the dev emulators are up.)
 *
 * WHAT IT IS FOR. These are the first things in the suite that write to
 * people on their own, with nobody watching. Three questions follow, and
 * they are the three this exists for:
 *
 *   does the right person get one,
 *   does anybody get one who should not, and
 *   can a re-run send it twice?
 *
 * The third is the one that bites: a scheduled function retries, and a timer
 * that sends again every time it is poked is how fifty people get the same
 * email four times.
 *
 * NOTHING IS SENT. On the emulator the functions write every message to
 * `emailOutbox` and make no request. Every invented address ends
 * `.invalid`, which the RFCs reserve so that it can never resolve, and
 * sendableEmail() refuses those anyway - so there are two separate reasons
 * no message here could reach anybody.
 *
 * The spec is the events window's F-074 and its addendum.
 */
import http from 'node:http';
import {
  londonDay, addDays, prettyDay, hhmm, sendableEmail,
  bookingsDueTomorrow, bookingReminder,
  documentsDue, expiryReminder, nextBookingFor
} from '../functions/reminders.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const FN_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5191);
const FS = (process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8171').split(':');
const FS_HOST = FS[0], FS_PORT = Number(FS[1] || 8171);
const DOCS = `/v1/projects/${PROJECT}/databases/(default)/documents`;

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')); };

const rest = (method, path, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: FS_HOST, port: FS_PORT, method, path,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej); req.end(data);
});
const val = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, o) => rest('PATCH', DOCS + '/' + p, { fields: fields(o) });
const del = (p) => rest('DELETE', DOCS + '/' + p);
const list = async (c) => {
  const r = await rest('GET', DOCS + '/' + c + '?pageSize=300');
  const docs = JSON.parse(r.body || '{}').documents || [];
  return docs.map(d => ({ id: d.name.split('/').pop(), ...plain(d.fields || {}) }));
};
const plain = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, value(v)]));
const value = (v) => v.stringValue !== undefined ? v.stringValue
  : v.booleanValue !== undefined ? v.booleanValue
  : v.integerValue !== undefined ? Number(v.integerValue)
  : v.arrayValue ? (v.arrayValue.values || []).map(value)
  : v.mapValue ? plain(v.mapValue.fields || {})
  : v.nullValue !== undefined ? null : undefined;

/* The functions emulator gives a scheduled function an HTTP trigger, which is
   how a timer is run without waiting for nine o'clock tomorrow.

   It names it with a "-0" on the end - one per schedule on the function - so
   `bookingReminders` is served as `bookingReminders-0`. The plain name 404s,
   and the 404 helpfully lists the real ones, which is how this was found.
   Both are tried, so this keeps working if that ever changes. */
const post = (path) => new Promise((res, rej) => {
  const r = http.request({ host: 'localhost', port: FN_PORT, method: 'POST', path,
    headers: { 'Content-Type': 'application/json', 'Content-Length': 2 } },
    s => { let d = ''; s.on('data', c => d += c); s.on('end', () => res({ status: s.statusCode, body: d })); });
  r.on('error', rej); r.end('{}');
});
const runSchedule = async (name) => {
  const base = '/' + PROJECT + '/europe-west2/' + name;
  const a = await post(base + '-0');
  if (a.status !== 404) return a;
  return post(base);
};

/* ---- the words, with no database at all ---------------------------- */

function pureChecks() {
  console.log('the rules, on their own (no database, no clock)');

  /* A fixed moment, so the same bytes come out twice. 14:00 UTC on 10 June
     is inside British Summer Time, which is where a UTC "tomorrow" goes
     wrong. */
  const summer = new Date('2026-06-10T23:30:00Z');
  ok('  a London day is the day a person would say it is',
    londonDay(summer) === '2026-06-11',
    '23:30 UTC on 10 June is already the 11th in London: ' + londonDay(summer));
  ok('  and in winter it is the same as UTC',
    londonDay(new Date('2026-01-10T23:30:00Z')) === '2026-01-10');

  const at = new Date('2026-06-10T08:00:00Z');   /* 09:00 London */
  const tomorrow = addDays(londonDay(at), 1);

  const base = { status: 'confirmed', kind: 'member', day: tomorrow,
    startMin: 1140, endMin: 1260, requester: { email: 'somebody@example.invalid' } };
  /* example.invalid is refused by sendableEmail, which is the point of it -
     so the rows below use a shape that passes, with a domain that cannot
     resolve either way. */
  const good = (o) => Object.assign({}, base,
    { requester: { email: 'person@example.test' } }, o);

  const rows = [
    good({ id: 'yes-member' }),
    good({ id: 'yes-hire', kind: 'hire' }),
    good({ id: 'no-waiting', status: 'requested' }),
    good({ id: 'no-declined', status: 'declined' }),
    good({ id: 'no-cancelled', status: 'cancelled' }),
    good({ id: 'no-event', kind: 'event' }),
    good({ id: 'no-office', kind: 'office' }),
    good({ id: 'no-today', day: londonDay(at) }),
    good({ id: 'no-next-week', day: addDays(londonDay(at), 7) }),
    good({ id: 'no-already', reminderSentAt: '2026-06-10T08:00:00Z' }),
    good({ id: 'no-email', requester: { email: '' } }),
    good({ id: 'no-invalid', requester: { email: 'tester@example.invalid' } })
  ];
  const due = bookingsDueTomorrow(rows, at).map(b => b.id);
  ok('  exactly the two that should get one, get one',
    JSON.stringify(due) === JSON.stringify(['yes-member', 'yes-hire']), due.join(', '));

  /* .invalid is refused, which is what keeps test data off the wire. */
  ok('  an address ending .invalid is never sendable',
    !sendableEmail('a@b.invalid') && !!sendableEmail('a@b.org'), 'a@b.invalid');

  const msg = bookingReminder({
    booking: { id: 'bk_synth', kind: 'hire', day: tomorrow, startMin: 1110, endMin: 1275,
      setupMins: 30, packdownMins: 45, title: 'Toddler group', people: 20, layout: 'Circle',
      refreshments: { needed: true, items: ['Tea', 'Squash'] }, av: { needed: false },
      resources: ['Projector'], requester: { email: 'hirer@example.test' } },
    room: { name: 'The Hall', houseRules: 'No blu-tack on the walls.' },
    site: { name: 'Main site', address: '1 Synthetic Road', postcode: 'KT10 0AA',
            bookingsEmail: 'bookings@example.test' },
    church: { enquiryEmail: 'office@example.test' }
  });
  ok('  the subject is the one the spec asks for',
    msg.subject === 'Reminder: The Hall, tomorrow 18:30 to 21:15', msg.subject);
  ok('  it says when the room is theirs, setting up and clearing away',
    /yours from 18:00/.test(msg.body) && /clear by 22:00/.test(msg.body),
    (msg.body.match(/The room is yours[^<]*/) || ['(not said)'])[0]);
  ok('  the room, the site and its address are in it',
    /The Hall/.test(msg.body) && /1 Synthetic Road/.test(msg.body) && /KT10 0AA/.test(msg.body));
  ok('  what it is for, how many, the layout, refreshments and kit',
    /Toddler group/.test(msg.body) && /20 people/.test(msg.body) && /Circle/.test(msg.body) &&
    /Tea, Squash/.test(msg.body) && /Projector/.test(msg.body));
  ok('  a hirer gets the house rules', /No blu-tack/.test(msg.body));
  ok('  and the reference', /bk_synth/.test(msg.body));
  ok('  a hirer is told to reply; a member is told to cancel it themselves',
    /Reply to this email/.test(msg.body) &&
    /Cancel it yourself/.test(bookingReminder({
      booking: { id: 'x', kind: 'member', day: tomorrow, startMin: 600, endMin: 660,
        requester: { email: 'm@example.test' } },
      room: { name: 'Room 2', houseRules: 'Rules here' }, site: {}, church: {}
    }).body));
  ok('  a member does NOT get the house rules read out again',
    !/Rules here/.test(bookingReminder({
      booking: { id: 'x', kind: 'member', day: tomorrow, startMin: 600, endMin: 660,
        requester: { email: 'm@example.test' } },
      room: { name: 'Room 2', houseRules: 'Rules here' }, site: {}, church: {}
    }).body));
  ok('  it replies to the site\'s bookings address',
    msg.replyTo === 'bookings@example.test', msg.replyTo);
  ok('  and to the church\'s enquiry address when the site has none',
    bookingReminder({ booking: { id: 'x', kind: 'hire', day: tomorrow, startMin: 600, endMin: 660,
      requester: { email: 'h@example.test' } }, room: {}, site: {},
      church: { enquiryEmail: 'office@example.test' } }).replyTo === 'office@example.test');
  ok('  no church name is written into any of it',
    !/Esher|EGBC/i.test(msg.subject + msg.body), 'Church details carries the name');

  /* ---- documents ---- */
  const h = (docs, o) => Object.assign({ id: 'hr1', name: 'A Person', org: 'Synthetic Group',
    email: 'hirer@example.test', siteId: 'site1', documents: docs }, o);
  const today = londonDay(at);
  const dd = documentsDue([
    h([{ kind: 'insurance', expires: today }], { id: 'today' }),
    h([{ kind: 'insurance', expires: addDays(today, 30) }], { id: 'thirty' }),
    h([{ kind: 'insurance', expires: addDays(today, 29) }], { id: 'twentynine' }),
    h([{ kind: 'insurance', expires: addDays(today, 31) }], { id: 'thirtyone' }),
    h([{ kind: 'insurance', expires: addDays(today, -1) }], { id: 'gone-already' }),
    h([{ kind: 'insurance', expires: today, remindedAt: { '0': 'x' } }], { id: 'done-today' }),
    h([{ kind: 'insurance', expires: addDays(today, 30), remindedAt: { '30': 'x' } }], { id: 'done-thirty' }),
    h([{ kind: 'insurance', expires: today, remindedAt: { '30': 'x' } }], { id: 'thirty-done-but-today-not' }),
    h([{ kind: 'other', expires: '' }], { id: 'no-date' }),
    h([{ kind: 'insurance', expires: today }], { id: 'not-active', active: false })
  ], at).map(x => x.hirer.id + ':' + x.stage);
  ok('  exactly the documents due today or in thirty days, not already chased',
    JSON.stringify(dd) === JSON.stringify(['today:0', 'thirty:30', 'thirty-done-but-today-not:0']),
    dd.join(', '));

  const ex = expiryReminder({
    hirer: h([], {}), doc: { kind: 'insurance', expires: addDays(today, 30) },
    site: { bookingsEmail: 'bookings@example.test' }, church: {},
    nextBooking: { day: addDays(today, 3), startMin: 1140 }
  });
  ok('  the hirer is told what runs out and when',
    /public liability insurance/.test(ex.theirs.subject) &&
    /Please send us the new one/.test(ex.theirs.body), ex.theirs.subject);
  ok('  the office is told whose it is and when they are next in',
    /Synthetic Group/.test(ex.ours.subject) && /Next booked in on/.test(ex.ours.body),
    (ex.ours.body.match(/Next booked in on[^<]*/) || ['(not said)'])[0]);
  ok('  and told plainly when they have nothing booked',
    /nothing booked after today/.test(expiryReminder({
      hirer: h([], {}), doc: { kind: 'risk', expires: today }, site: {}, church: {}, nextBooking: null
    }).ours.body));
  ok('  the office copy goes to the site\'s bookings address',
    ex.ours.to[0] === 'bookings@example.test', ex.ours.to.join(', '));

  ok('  the next booking is the soonest one of theirs, not somebody else\'s',
    (nextBookingFor(h([], {}), [
      { status: 'confirmed', day: addDays(today, 9), startMin: 600, requester: { email: 'hirer@example.test' } },
      { status: 'confirmed', day: addDays(today, 2), startMin: 600, requester: { email: 'other@example.test' } },
      { status: 'confirmed', day: addDays(today, 4), startMin: 600, requester: { email: 'hirer@example.test' } },
      { status: 'requested', day: addDays(today, 1), startMin: 600, requester: { email: 'hirer@example.test' } }
    ], at) || {}).day === addDays(today, 4), 'theirs, confirmed, soonest');
}

/* ---- and through the emulator, with the timers actually run -------- */

(async () => {
  pureChecks();

  console.log('');
  console.log('through the emulator, with the timers run');

  /* Clear anything a previous run left. */
  for (const c of ['bookings', 'hirers', 'rooms', 'sites', 'emailOutbox']) {
    for (const d of await list(c)) await del(c + '/' + d.id);
  }

  const now = new Date();
  const today = londonDay(now);
  const tomorrow = addDays(today, 1);

  await put('sites/site1', { name: 'Synthetic Site', address: '1 Synthetic Road',
    postcode: 'KT10 0AA', bookingsEmail: 'bookings@example.test', active: true });
  await put('rooms/room1', { siteId: 'site1', name: 'The Synthetic Hall',
    houseRules: 'No blu-tack on the walls.', kind: 'room' });
  await put('churchSettings/details', { name: 'Synthetic Road Community Church',
    enquiryEmail: 'office@example.test', logoUrl: '' });

  const bk = (id, o) => put('bookings/' + id, Object.assign({
    kind: 'member', status: 'confirmed', siteId: 'site1', roomId: 'room1',
    day: tomorrow, startMin: 1110, endMin: 1275, setupMins: 30, packdownMins: 45,
    title: 'Synthetic meeting', people: 12, layout: 'Rows',
    av: { needed: false, what: '' },
    refreshments: { needed: false, items: [], notes: '' },
    resources: [], notes: '',
    requester: { name: 'A Person', email: 'person@example.test', phone: '', org: '' },
    createdAt: new Date().toISOString()
  }, o));

  await bk('b_member', {});
  await bk('b_hire', { kind: 'hire', requester: { name: 'H', email: 'hirer@example.test', phone: '', org: 'Synthetic Group' } });
  await bk('b_waiting', { status: 'requested' });
  await bk('b_event', { kind: 'event' });
  await bk('b_office', { kind: 'office' });
  await bk('b_today', { day: today });
  await bk('b_invalid', { requester: { name: 'T', email: 'tester@example.invalid', phone: '', org: '' } });

  await put('hirers/hr_due', { siteId: 'site1', name: 'Dee Synthetic', org: 'Synthetic Group',
    email: 'hirer@example.test', active: true,
    documents: [{ kind: 'insurance', name: 'policy.pdf', path: 'x', expires: addDays(today, 30) }] });
  await put('hirers/hr_today', { siteId: 'site1', name: 'Eli Synthetic', org: 'Another Group',
    email: 'other-hirer@example.test', active: true,
    documents: [{ kind: 'safeguarding', name: 'policy.pdf', path: 'x', expires: today }] });
  await put('hirers/hr_later', { siteId: 'site1', name: 'Fay Synthetic', org: 'Third Group',
    email: 'third@example.test', active: true,
    documents: [{ kind: 'insurance', name: 'policy.pdf', path: 'x', expires: addDays(today, 60) }] });

  const r1 = await runSchedule('bookingReminders');
  ok('  the booking timer runs', r1.status >= 200 && r1.status < 300,
    r1.status + ' ' + String(r1.body).slice(0, 90));

  let out = await list('emailOutbox');
  const bookingMail = out.filter(m => m.kind === 'booking-reminder');
  const to = bookingMail.flatMap(m => m.to).sort();
  ok('  two reminders went, to the member and the hirer',
    JSON.stringify(to) === JSON.stringify(['hirer@example.test', 'person@example.test']),
    to.join(', ') + '   (' + bookingMail.length + ' messages)');
  ok('  nothing was actually sent', bookingMail.every(m => m.stubbed === true),
    'every one is marked stubbed, and no request was made');
  ok('  the subject names the room and the times',
    bookingMail.every(m => /Reminder: The Synthetic Hall, tomorrow 18:30 to 21:15/.test(m.subject)),
    bookingMail.map(m => m.subject).join(' | '));
  ok('  it replies to the site, not to a person',
    bookingMail.every(m => m.replyTo === 'bookings@example.test'),
    bookingMail.map(m => m.replyTo).join(', '));
  ok('  the waiting, event, office and today bookings got nothing',
    !to.includes('') && bookingMail.length === 2, bookingMail.length + ' messages in all');
  ok('  and the .invalid address got nothing',
    !JSON.stringify(out).includes('example.invalid'), 'no .invalid anywhere in the outbox');

  const marked = (await list('bookings')).filter(b => b.reminderSentAt).map(b => b.id).sort();
  ok('  only the two that were reminded are marked',
    JSON.stringify(marked) === JSON.stringify(['b_hire', 'b_member']), marked.join(', '));

  /* THE ONE THAT MATTERS: a second run must send nothing. */
  const r2 = await runSchedule('bookingReminders');
  const after = (await list('emailOutbox')).filter(m => m.kind === 'booking-reminder');
  ok('  running it again sends NOTHING', after.length === bookingMail.length,
    'was ' + bookingMail.length + ', now ' + after.length + ' (status ' + r2.status + ')');

  /* ---- documents ---- */
  const e1 = await runSchedule('documentExpiryReminders');
  ok('  the expiry timer runs', e1.status >= 200 && e1.status < 300,
    e1.status + ' ' + String(e1.body).slice(0, 90));

  out = await list('emailOutbox');
  const theirs = out.filter(m => m.kind === 'document-expiry');
  const ours = out.filter(m => m.kind === 'document-expiry-office');
  const chased = theirs.flatMap(m => m.to).sort();
  ok('  the two hirers whose documents are due were written to',
    JSON.stringify(chased) === JSON.stringify(['hirer@example.test', 'other-hirer@example.test']),
    chased.join(', '));
  ok('  the one expiring in sixty days was not', !chased.includes('third@example.test'));
  ok('  the office got a copy of each',
    ours.length === theirs.length && ours.every(m => m.to[0] === 'bookings@example.test'),
    ours.length + ' office copies');
  ok('  one is the thirty-day warning and one is on the day',
    [...new Set(theirs.map(m => m.stage))].sort().join(',') === '0,30',
    theirs.map(m => m.stage + ': ' + m.subject).join(' | '));
  ok('  the office copy says when that hirer is next in',
    ours.some(m => /Next booked in on/.test(m.html)),
    (String(ours.map(m => m.html).join(' ')).match(/Next booked in on[^<]*/) || ['(not said)'])[0]);

  const e2 = await runSchedule('documentExpiryReminders');
  const afterDocs = (await list('emailOutbox')).filter(m => /document-expiry/.test(m.kind));
  ok('  running it again chases nobody twice',
    afterDocs.length === theirs.length + ours.length,
    'was ' + (theirs.length + ours.length) + ', now ' + afterDocs.length + ' (status ' + e2.status + ')');

  const hr = (await list('hirers')).find(h => h.id === 'hr_due');
  ok('  the document carries which stage was chased, not just that it was',
    !!((hr.documents || [])[0] || {}).remindedAt &&
    Object.keys(((hr.documents || [])[0] || {}).remindedAt || {}).join() === '30',
    JSON.stringify(((hr.documents || [])[0] || {}).remindedAt || {}));

  const bad = R.filter(v => !v);
  console.log('\n' + (R.length - bad.length) + '/' + R.length + ' passed');
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
