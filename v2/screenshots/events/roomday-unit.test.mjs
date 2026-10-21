/* ROOMS ON THE DAY AND AFTER (F-260) - the sums, with no emulator:
     arrival()      who is late, due, arrived
     useReport()    hours open, hours booked (overlaps counted once, closed
                    days left out, services counted apart), and the CSV
     compare()      two or three rooms side by side
     cateringOrderOf / syncCatering   what the kitchen sees (nobody's name)
     runArrivalCheck   the 15-minute check: flags once, emails the office,
                    never a member's own booking twice, never cancels
   Synthetic throughout; the "database" is a stand-in.
     node screenshots/events/roomday-unit.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { cateringOrderOf, syncCatering, runArrivalCheck, londonNow } from '../../functions/rooms-day.js';

const V2 = path.resolve('.');
const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 500))); };
const J = (x) => JSON.stringify(x);
function load(file) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(V2, file), 'utf8'), { module, window: undefined, console });
  return module.exports;
}
const RD = load('egbc-events-roomday.js'), R = load('egbc-events-rooms.js');

console.log('\narrivals');
const hire = { status: 'confirmed', kind: 'hire', day: '2026-11-10', startMin: 600 };
const at = (b, nowMin, grace, today) => RD.arrival(b, { today: today || '2026-11-10', nowMin, grace: grace == null ? 30 : grace });
ok('a hire not here 30 minutes after it starts is late', at(hire, 630) === 'late', at(hire, 630));
ok('  29 minutes after, it is only due', at(hire, 629) === 'due', at(hire, 629));
ok('  marked arrived is arrived, however late', at(Object.assign({ arrived: { by: 'hirer' } }, hire), 900) === 'arrived');
ok('  a member\'s booking is flagged the same way', at(Object.assign({}, hire, { kind: 'member' }), 640) === 'late');
ok('  the office\'s own and an event\'s are never late', at(Object.assign({}, hire, { kind: 'office' }), 900) === 'due' && at(Object.assign({}, hire, { kind: 'event' }), 900) === 'due');
ok('  grace 0 turns the flag off', at(hire, 900, 0) === 'due');
ok('  another day: later or missed, never late', at(hire, 900, 30, '2026-11-09') === 'later' && at(hire, 900, 30, '2026-11-11') === 'missed');
ok('  not confirmed: nothing', at(Object.assign({}, hire, { status: 'requested' }), 900) === 'none');
ok('grace(): 30 unless set, 0 kept as off', RD.grace({}) === 30 && RD.grace({ arrivalGraceMins: 0 }) === 0 && RD.grace({ arrivalGraceMins: 45 }) === 45);
ok('openHours(): 08:00-22:00 unless set; nonsense falls back', J(RD.openHours({})) === '[480,1320]' && J(RD.openHours({ openFrom: 540, openTo: 1080 })) === '[540,1080]' && J(RD.openHours({ openFrom: 900, openTo: 600 })) === '[480,1320]');

console.log('\nroom use, November 2026 (30 days, open 08:00-22:00 = 56 quarter-hours a day)');
const rooms = [{ id: 'ra', name: 'Hall, main' }, { id: 'rb', name: '=Lounge' }];
const bk = (o) => Object.assign({ status: 'confirmed', roomId: 'ra', day: '2026-11-03', kind: 'hire' }, o);
const bookings = [
  bk({ startMin: 600, endMin: 660 }),                                        /* 10:00-11:00 hire */
  bk({ startMin: 630, endMin: 720, kind: 'member' }),                        /* overlaps: only 11:00-12:00 is new */
  bk({ startMin: 480, endMin: 540, setupMins: 30, kind: 'office' }),         /* set-up before opening is not counted */
  bk({ startMin: 600, endMin: 900, status: 'cancelled' }),                   /* cancelled: nothing */
  bk({ day: '2026-11-10', startMin: 600, endMin: 720 }),                     /* on a closed day: nothing */
  bk({ day: '2026-12-01', startMin: 600, endMin: 720 }),                     /* next month: nothing */
  bk({ roomId: 'rb', day: '2026-11-08', startMin: 600, endMin: 660, kind: 'event' }) /* a Sunday, over the service */
];
const closures = [{ status: 'on', roomId: 'ra', days: ['2026-11-10'] }, { status: 'on', roomId: 'big', partIds: ['rb'], days: ['2026-11-20'] }, { status: 'off', roomId: 'ra', days: ['2026-11-11'] }];
const base = (r, day) => { const a = new Array(96).fill(0); if (r.id === 'rb' && new Date(day + 'T12:00Z').getUTCDay() === 0) for (let i = 40; i < 48; i++) a[i] = 1; return a; };
const rep = RD.useReport({ month: '2026-11', rooms, bookings, closures, openFrom: 480, openTo: 1320, base });
const A = rep.rows[0], Bq = rep.rows[1];
ok('a closed day is left out (one closure on, one switched off)', A.closed === 1 && A.open === 29 * 56, J({ closed: A.closed, open: A.open }));
ok('  a room closed as part of a bigger room is closed too', Bq.closed === 1 && Bq.open === 29 * 56, J({ closed: Bq.closed }));
ok('overlapping bookings are counted once: 10:00-12:00 is 8, not 10', A.byKind.hire === 4 && A.byKind.member === 4, J(A.byKind));
ok('  set-up before opening is not counted; 08:00-09:00 is 4', A.byKind.office === 4, J(A.byKind));
ok('  cancelled, next month and closed-day bookings are not counted: 12 in all', A.booked === 12, A.booked);
ok('  booked % of open', A.pct === Math.round(12 / (29 * 56) * 1000) / 10, A.pct);
ok('services (the rota) are counted apart, and never where a booking is', Bq.booked === 4 && Bq.rota === 5 * 8 - 4, J({ booked: Bq.booked, rota: Bq.rota }));
ok('  "in use, with services" adds them', Bq.pctWithRota === Math.round((Bq.booked + Bq.rota) / Bq.open * 1000) / 10);
const weekSum = (id) => rep.weeks.reduce((a, w) => a + (w.rooms[id] || 0), 0);
ok('week by week adds up to the month', weekSum('ra') === A.booked && weekSum('rb') === Bq.booked, J(rep.weeks));
ok('  weeks start on a Monday (26 Oct for 1 Nov)', rep.weeks[0].from === '2026-10-26', rep.weeks[0].from);
ok('the total is the rooms added', rep.total.booked === A.booked + Bq.booked && rep.total.open === A.open + Bq.open);
const csv = RD.csvOf(rep).split('\n');
ok('the CSV: a heading and a row a room, booked in hours', csv.length === 4 && /^"Hall, main",406,3,1,1,1,0,/.test(csv[1]), csv[1]);
ok('  a name that would run as a spreadsheet formula is made plain', csv[2].indexOf("'=Lounge,") === 0, csv[2]);
const rep2 = RD.useReport({ month: '2026-11', rooms: rooms.slice(0, 1), bookings, closures: [], openFrom: 540, openTo: 1020 });
ok('other opening hours (09:00-17:00): 08:00 is outside, and with no closures 10 Nov counts: 16', rep2.rows[0].open === 30 * 32 && rep2.rows[0].booked === 16, J({ open: rep2.rows[0].open, booked: rep2.rows[0].booked }));

console.log('\nrooms side by side');
const r1 = { id: 'r1', name: 'Hall', layouts: { theatre: 120, cabaret: 60 }, fireMax: 100, dims: { length: 10, width: 12 }, access: 'stepfree', level: 'ground', naturalLight: true, facilities: { projector: true, chairs: 120 }, siteId: 's1' };
const r2 = { id: 'r2', name: 'Lounge <b>', layouts: { theatre: 30 }, dims: { area: 40 }, facilities: { chairs: 30 }, siteId: 's1' };
const r3 = { id: 'r3', name: 'Room 3', capacity: 10 }, r4 = { id: 'r4', name: 'Room 4' };
const html = R.compare([r1, r2, r3, r4], { sites: { s1: 'Esher' } });
const cell = (key) => (html.match(new RegExp('data-crow="' + key + '">(.*?)</tr>')) || [])[1] || '';
ok('three rooms at most', (html.match(/data-croom=/g) || []).length === 3 && html.indexOf('Room 4') < 0);
ok('  a name is shown as words, not markup', html.indexOf('Lounge &lt;b&gt;') > 0 && html.indexOf('Lounge <b>') < 0);
ok('  theatre: never past the fire-safety maximum (120 shows as 100), the most marked', /class="best" data-n="100">100</.test(cell('lay-theatre')) && /data-n="30"/.test(cell('lay-theatre')), cell('lay-theatre'));
ok('  a layout no room has is not a row', html.indexOf('data-crow="lay-banquet"') < 0);
ok('  area: given area wins, length x width otherwise', /data-n="120">120 m²/.test(cell('area')) && /data-n="40">40 m²/.test(cell('area')), cell('area'));
ok('  step-free not filled in says "Not checked yet", never "No"', /Step-free<\/td><td>Not checked yet<\/span>|Not checked yet/.test(cell('access')) && !/>No</.test(cell('access')), cell('access'));
ok('  facilities: only those some room has; a count shows the count', /<td>120<\/td><td>30<\/td>/.test(cell('fac-chairs')) && html.indexOf('fac-piano') < 0, cell('fac-chairs'));
ok('  where each is, and a way to more about it', cell('site').indexOf('Esher') > 0 && (html.match(/room\.html\?id=/g) || []).length === 3);
ok('  holds-at-most for a room with only a capacity', /data-n="10">10</.test(cell('holds')), cell('holds'));

console.log('\nthe caterers\' list');
const withFood = { status: 'confirmed', kind: 'hire', siteId: 's1', roomId: 'r1', day: '2026-11-03', startMin: 600, people: 40, title: 'Book club',
  requester: { name: 'Ann Example', email: 'ann@example.invalid', phone: '01234 000000' }, memberName: 'Someone',
  refreshments: { needed: true, servingAt: '10:30', items: [{ id: 'tea', name: 'Tea and coffee', qty: 40, unit: 'cup', price: 1.5 }], dietary: { vegan: 2, glutenFree: 0, nonsense: 9 }, notes: 'Oat milk please' } };
const o = cateringOrderOf(withFood, { name: 'Hall' });
ok('an order has what the kitchen needs', o && o.roomName === 'Hall' && o.servingAt === '10:30' && o.people === 40 && o.items[0].qty === 40 && o.notes === 'Oat milk please', J(o));
ok('  and nothing about who booked, or the price', !/Ann|example\.invalid|01234|Someone|price|1\.5/.test(J(o)), J(o));
ok('  dietary: only the four kinds, only counts above 0', J(o.dietary) === '{"vegan":2}', J(o.dietary));
ok('  no order unless confirmed with refreshments', cateringOrderOf(Object.assign({}, withFood, { status: 'requested' })) === null && cateringOrderOf(Object.assign({}, withFood, { refreshments: { needed: false } })) === null);

/* a stand-in Firestore: enough for syncCatering and runArrivalCheck */
function fakeDb(seed) {
  const data = JSON.parse(JSON.stringify(seed));
  const ref = (c, id) => ({ id, get: async () => ({ id, exists: !!(data[c] || {})[id], data: () => (data[c] || {})[id] }),
    set: async (v) => { (data[c] = data[c] || {})[id] = JSON.parse(JSON.stringify(v)); },
    update: async (v) => { Object.assign(data[c][id], JSON.parse(JSON.stringify(v))); },
    delete: async () => { delete (data[c] || {})[id]; } });
  return { data, collection: (c) => ({ doc: (id) => ref(c, id),
    where: (f, op, v) => ({ get: async () => ({ docs: Object.keys(data[c] || {}).filter((id) => data[c][id][f] === v).map((id) => ({ id, ref: ref(c, id), data: () => data[c][id] })) }) }) }) };
}
{
  const db = fakeDb({ rooms: { r1: { name: 'Hall' } }, cateringOrders: { k1: { state: 'prepared', stateBy: 'u1', stateByName: 'Cook', stateAt: 'T' } } });
  await syncCatering(db, 'k1', withFood);
  const c = db.data.cateringOrders.k1;
  ok('a changed booking updates its order, keeping how far the caterers got', c.state === 'prepared' && c.stateByName === 'Cook' && c.people === 40, J(c));
  await syncCatering(db, 'k1', Object.assign({}, withFood, { status: 'cancelled' }));
  ok('  cancelled: the order goes', !db.data.cateringOrders.k1);
  await syncCatering(db, 'k2', withFood);
  ok('  a new order starts as new', db.data.cateringOrders.k2.state === 'new');
}

console.log('\nthe 15-minute arrival check');
ok('London\'s day and minute in summer and winter', J(londonNow(new Date('2026-07-01T23:30:00Z'))) === '{"day":"2026-07-02","min":30}' && J(londonNow(new Date('2026-01-15T23:30:00Z'))) === '{"day":"2026-01-15","min":1410}',
  J([londonNow(new Date('2026-07-01T23:30:00Z')), londonNow(new Date('2026-01-15T23:30:00Z'))]));
{
  const day = '2026-11-03', b = (o) => Object.assign({ status: 'confirmed', kind: 'hire', siteId: 's1', roomId: 'r1', day, startMin: 600, title: 'Book club', requester: { name: 'Ann Example', phone: '01234 000000' } }, o);
  const db = fakeDb({ sites: { s1: { bookingsEmail: 'office@example.invalid' }, s2: { arrivalGraceMins: 0, bookingsEmail: 'x@example.invalid' }, s3: {} }, rooms: { r1: { name: 'Hall' } },
    bookings: { late: b(), member: b({ kind: 'member', memberName: 'Mo Member', requester: null }), here: b({ arrived: { by: 'hirer' } }), office: b({ kind: 'office' }),
      soon: b({ startMin: 620 }), off: b({ siteId: 's2' }), noemail: b({ siteId: 's3' }), asked: b({ status: 'requested' }), other: b({ day: '2026-11-04' }) } });
  const sent = [], send = async (m, meta) => { sent.push([m, meta]); };
  const flagged = await runArrivalCheck({ db, send, at: new Date('2026-11-03T10:45:00Z') });  /* 10:45 in London (GMT) */
  ok('flags a hire and a member\'s booking 45 minutes on, not one 25 minutes on', J(flagged.sort()) === J(['late', 'member', 'noemail']), J(flagged));
  ok('  not arrived ones, the office\'s, requested, other days, or a site with the flag off', ['here', 'office', 'asked', 'other', 'off', 'soon'].every((k) => !db.data.bookings[k].arrivalFlaggedAt));
  ok('  emails the site\'s bookings address, once each (no address, no email)', sent.length === 2 && sent.every(([m]) => m.to[0] === 'office@example.invalid'), J(sent.map(([m]) => m.to)));
  ok('  the email says who and that nothing is cancelled', /Ann Example, 01234 000000/.test(sent[0][0].html) && /Nothing has been cancelled/.test(sent[0][0].html) && /Not arrived yet: Book club, Hall at 10:00/.test(sent[0][0].subject), sent[0][0].subject);
  ok('  nothing is cancelled', Object.values(db.data.bookings).every((x) => x.status !== 'cancelled'));
  const again = await runArrivalCheck({ db, send, at: new Date('2026-11-03T11:00:00Z') });
  ok('the next check flags only what is newly late, and emails nobody twice', J(again) === J(['soon']) && sent.length === 3, J({ again, sent: sent.length }));
}

console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
process.exit(results.every(Boolean) ? 0 : 1);
