/* Chunk 6, stage 3 — registers and the morning's date, without a browser.

     node screenshots/events/k3-kids-unit.test.mjs */

import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(HERE, '..', '..', 'egbc-events-kids.js'), 'utf8'), ctx);
const K = ctx.window.EGBCKids;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + why)); }
const J = (x) => JSON.stringify(x);

ok('October is the autumn term, September to December', J(K.termOf('2026-10-11')) === J({ name: 'Autumn 2026', from: '2026-09-01', to: '2026-12-31' }));
ok('February is spring; May is summer', K.termOf('2027-02-14').name === 'Spring 2027' && K.termOf('2027-05-09').name === 'Summer 2027');
ok('the term before autumn is the summer just gone; before spring, last autumn', K.termBefore('2026-10-11').name === 'Summer 2026' && K.termBefore('2027-02-14').name === 'Autumn 2026');
ok('the Sundays from 1 to 30 September 2026', J(K.sessionDates(7, '2026-09-01', '2026-09-30')) === J(['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']));
ok('a Wednesday group\'s dates', J(K.sessionDates(3, '2026-09-01', '2026-09-10')) === J(['2026-09-02', '2026-09-09']));
ok('both ends count', J(K.sessionDates(7, '2026-09-06', '2026-09-13')) === J(['2026-09-06', '2026-09-13']));
ok('the clocks going back (25 October) do not skip a Sunday', J(K.sessionDates(7, '2026-10-18', '2026-11-01')) === J(['2026-10-18', '2026-10-25', '2026-11-01']));

const kids = [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Ben' }];
const cks = [{ signupKey: 'a', name: 'Ada', day: '2026-09-06' }, { signupKey: 'a', name: 'Ada', day: '2026-09-13' }, { signupKey: 'v', name: 'Vic (moved on)', day: '2026-09-06' }];
const reg = K.register(kids, cks, ['2026-09-06', '2026-09-13']);
ok('a register: a row per child, with the weeks they came', J(reg.rows.map(r => [r.name, r.total])) === J([['Ada', 2], ['Ben', 0], ['Vic (moved on)', 1]]), J(reg.rows));
ok('a child no longer in the group still shows on the weeks they came', reg.rows[2].days['2026-09-06'] === true);
ok('and the number of children each week', J(reg.totals) === J([2, 1]));
const TERMS = [{ name: 'Autumn 2026', from: '2026-09-03', to: '2026-12-18' }, { name: 'Spring 2027', from: '2027-01-05', to: '2027-03-26' }, { name: 'Summer 2027', from: '2027-04-12', to: '2027-07-21' }];
ok('with the lead\'s term dates: the term the day is in', J(K.termOf('2027-02-14', TERMS)) === J(TERMS[1]));
ok('in a holiday: the term just gone (Christmas counts with autumn)', K.termOf('2026-12-27', TERMS).name === 'Autumn 2026' && K.termOf('2027-04-01', TERMS).name === 'Spring 2027');
ok('the term before, from the setting', K.termBefore('2027-02-14', TERMS).name === 'Autumn 2026' && K.termBefore('2027-05-01', TERMS).name === 'Spring 2027');
ok('before the first set term, the guess again', K.termBefore('2026-10-11', TERMS).name === 'Summer 2026');
ok('the morning\'s date is the UTC date, as the rules count it', K.morningDay(new Date('2026-10-11T09:30:00Z')) === '2026-10-11');

const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
