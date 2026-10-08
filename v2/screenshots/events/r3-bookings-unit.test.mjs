/* Chunk 4, R3 — repeating dates and members cancelling, without a browser.

     node screenshots/events/r3-bookings-unit.test.mjs */

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
const j = (x) => JSON.stringify(x);

ok('every week from Wed 4 Nov to 25 Nov 2026: four Wednesdays',
  j(B.repeatDays('2026-11-04', 'week', '2026-11-25')) === j(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']));
ok('every two weeks', j(B.repeatDays('2026-11-04', 'fortnight', '2026-12-02')) === j(['2026-11-04', '2026-11-18', '2026-12-02']));
ok('across the clocks going back (25 Oct 2026), still Sundays', B.repeatDays('2026-10-18', 'week', '2026-11-08').every(d => B.dow(d) === 7) && B.repeatDays('2026-10-18', 'week', '2026-11-08').length === 4);
const second = B.repeatDays('2026-11-10', 'month', '2027-03-31');
ok('every month: the second Tuesday (10 Nov, 8 Dec, 12 Jan, 9 Feb, 9 Mar)', j(second) === j(['2026-11-10', '2026-12-08', '2027-01-12', '2027-02-09', '2027-03-09']), j(second));
const fifth = B.repeatDays('2026-12-29', 'month', '2027-06-30');
ok('the fifth Tuesday: only the months that have one (Mar, Jun 2027)', j(fifth) === j(['2026-12-29', '2027-03-30', '2027-06-29']), j(fifth));
ok('across the new year, monthly keeps the weekday', B.repeatDays('2026-12-14', 'month', '2027-02-28').every(d => B.dow(d) === 1));
ok('never more than 52 dates', B.repeatDays('2026-11-04', 'week', '2030-01-01').length === 52);
ok('"just this once", or an end before the start, is one date', B.repeatDays('2026-11-04', '', '2026-12-01').length === 1 && B.repeatDays('2026-11-04', 'week', '2026-11-01').length === 1);
ok('the words for the email', B.seriesWords('fortnight', 3) === 'Every two weeks, 3 dates');

const sl = Array(96).fill(0); for (let i = 40; i < 44; i++) sl[i] = 1;
ok('a member may cancel a confirmed booking whose time only they hold', B.canSelfCancel({ status: 'confirmed', slotFrom: 40, slotTo: 44 }, sl));
const over = sl.slice(); over[41] = 2;
ok('not one the office booked over (a 2 in its time)', !B.canSelfCancel({ status: 'confirmed', slotFrom: 40, slotTo: 44 }, over));
ok('a waiting one always; a cancelled or declined one never', B.canSelfCancel({ status: 'requested' }, []) && !B.canSelfCancel({ status: 'cancelled', slotFrom: 40, slotTo: 44 }, sl) && !B.canSelfCancel({ status: 'declined' }, sl));

const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
