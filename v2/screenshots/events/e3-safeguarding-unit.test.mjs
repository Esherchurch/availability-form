/* E3 — the safeguarding sums on their own (egbc-events-safeguarding.js).
   Events window. No emulator, no browser:
     node screenshots/events/e3-safeguarding-unit.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(V2, 'egbc-events-safeguarding.js'), 'utf8'), ctx);
const S = ctx.window.EGBCSafeguarding;

const results = [];
const ok = (name, pass, why) => { results.push(pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + why)); };

/* Ratios: 1 to 8 overall, 1 to 4 for under-8s. */
const r1 = S.ratio({ children: 9, under8: 1, leaders: 1, ratioAll: 8, ratioUnder8: 4 });
ok('9 children at 1 to 8 need 2 leaders: 1 is one short', r1.need === 2 && r1.short === 1 && !r1.ok, JSON.stringify(r1));
const r2 = S.ratio({ children: 9, under8: 9, leaders: 2, ratioAll: 8, ratioUnder8: 4 });
ok('9 under-8s at 1 to 4 need 3, even though 1 to 8 needs only 2', r2.needAll === 2 && r2.needUnder8 === 3 && r2.need === 3 && r2.short === 1, JSON.stringify(r2));
const r3 = S.ratio({ children: 8, under8: 4, leaders: 1, ratioAll: 8, ratioUnder8: 4 });
ok('exactly at the ratio is enough', r3.ok && r3.short === 0);
ok('no children, no leaders needed', S.ratio({ children: 0, under8: 0, leaders: 0, ratioAll: 8, ratioUnder8: 4 }).ok);

/* Age on the day of the event. */
ok('seven the day before their eighth birthday', S.ageOn('2018-10-11', '2026-10-10') === 7);
ok('eight on the day', S.ageOn('2018-10-10', '2026-10-10') === 8);
ok('no date of birth, no age', S.ageOn('', '2026-10-10') === null);

/* Leader checks: status and dates, with the event's periods. */
const yrs = { dbsYears: 3, trainingYears: 3 };
ok('seen last year: in date', S.checkStatus({ dbsStatus: 'current', dbsSeen: '2025-10-01', trainingDate: '2025-10-01' }, yrs, '2026-10-10').ok);
ok('training older than the period: out of date', S.checkStatus({ dbsStatus: 'current', dbsSeen: '2025-10-01', trainingDate: '2020-05-01' }, yrs, '2026-10-10').training === 'out of date');
ok('DBS applied for is not yet in date', S.checkStatus({ dbsStatus: 'applied', trainingDate: '2025-10-01' }, yrs, '2026-10-10').dbs === 'applied');
ok('nothing recorded: both missing', JSON.stringify(S.checkStatus(null, yrs, '2026-10-10')) === JSON.stringify({ dbs: 'missing', training: 'missing', ok: false }));
ok('a longer period on the event keeps an older check in date', S.checkStatus({ dbsStatus: 'current', dbsSeen: '2022-01-01', trainingDate: '2025-01-01' }, { dbsYears: 5, trainingYears: 3 }, '2026-10-10').ok);

const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
