/* Chunk 4, R2 — the sums in egbc-events-bookings.js, without a browser.

     node screenshots/events/r2-bookings-unit.test.mjs

   The rules check the same arithmetic (quarter-hours with setup and
   pack-down, ISO weekdays); firestore-rules.test.mjs proves the rules side. */

import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(HERE, '..', '..', 'egbc-events-bookings.js'), 'utf8'), ctx);
const B = ctx.window.EGBCBookings;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + why)); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok('18:00-19:00 is quarter-hours 72 to 75', same(B.slots(1080, 1140, 0, 0), { from: 72, to: 76 }));
ok('with 15 minutes to set up it starts at 71', same(B.slots(1080, 1140, 15, 0), { from: 71, to: 76 }));
ok('10 minutes to clear away rounds out to the next quarter-hour', same(B.slots(1080, 1140, 0, 10), { from: 72, to: 77 }));
ok('a start that is not on a quarter-hour rounds down', same(B.slots(1085, 1140, 0, 0), { from: 72, to: 76 }));
ok('setting up before midnight is refused', B.slots(10, 60, 15, 0) === null);
ok('clearing away past midnight is refused', B.slots(1380, 1435, 0, 15) === null);
ok('a finish before the start is refused', B.slots(1140, 1080, 0, 0) === null);
ok('22 Nov 2026 is a Sunday (7), 16 Nov a Monday (1)', B.dow('2026-11-22') === 7 && B.dow('2026-11-16') === 1);
ok('the clocks going back (25 Oct 2026) does not move the weekday', B.dow('2026-10-25') === 7 && B.addDays('2026-10-24', 1) === '2026-10-25' && B.addDays('2026-10-25', 1) === '2026-10-26');
const w = B.rotaWeek([{ type: 'Worship', roomIds: ['r1'], days: [7], from: '09:30', to: '12:30' }, { type: 'Prayer', roomIds: ['r2'], days: [3], from: '19:00', to: '20:00' }], 'r1');
ok('a service on Sundays takes 09:30-12:30 in its room, every Sunday', w['7'].slice(38, 50).every(x => x === 1) && w['7'][37] === 0 && w['7'][50] === 0);
ok('and nothing on other days, or from another room\'s service', ['1', '2', '3', '4', '5', '6'].every(d => w[d].every(x => x === 0)));
ok('a day never booked counts as the standing pattern', B.base({ rotaWeek: w }, '2026-11-22')[40] === 1 && B.base({ rotaWeek: w }, '2026-11-18')[40] === 0);
ok('a room with no pattern is free all day', B.base({}, '2026-11-22').every(x => x === 0));
const sl = B.zeros(); sl[76] = 1;
ok('free: a time touching a booking is free; overlapping it is not', B.free(sl, { from: 72, to: 76 }) && !B.free(sl, { from: 73, to: 77 }));
ok('a room\'s own setting wins', B.memberMode({ memberBookings: 'approval' }, { memberBookings: 'instant' }) === 'approval' && B.memberMode({ memberBookings: 'instant' }, { memberBookings: 'approval' }) === 'instant');
ok('"as the site says" follows the site', B.memberMode({ memberBookings: 'site' }, { memberBookings: 'approval' }) === 'approval' && B.memberMode({}, {}) === 'instant');
ok('the default is "confirmed straight away"', B.memberMode(null, null) === 'instant');
ok('working days: Friday to Monday is one', B.workingDays('2026-11-20', '2026-11-23') === 1);
const kit = [{ id: 'pa', name: 'PA', quantity: 1 }, { id: 'urn', name: 'Urn', unlimited: true }];
const a = { key: 'a', status: 'confirmed', day: 'd', slotFrom: 72, slotTo: 76, resources: [{ id: 'pa', name: 'PA', qty: 1 }, { id: 'urn', qty: 5 }] };
const b = { key: 'b', status: 'requested', day: 'd', slotFrom: 74, slotTo: 80, resources: [{ id: 'pa', name: 'PA', qty: 1 }, { id: 'urn', qty: 5 }] };
ok('kit: the one PA, wanted twice at once, is flagged', B.kitClash(b, [a, b], kit).length === 1 && /PA: 1 of 1/.test(B.kitClash(b, [a, b], kit)[0]));
ok('an unlimited urn never is', !B.kitClash(b, [a, b], kit).some(x => /Urn/.test(x)));
ok('nor is the PA once the times no longer overlap', B.kitClash({ ...b, slotFrom: 76 }, [a], kit).length === 0);

const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
