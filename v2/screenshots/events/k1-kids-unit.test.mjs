/* Chunk 6, stage 1 — the children's register's sums, without a browser.

     node screenshots/events/k1-kids-unit.test.mjs */

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

ok('born May 2019: Year 3 in October 2026', K.yearFor('2019-05-01', '2026-10-08') === 'Year 3', K.yearFor('2019-05-01', '2026-10-08'));
ok('born October 2019 (after 1 September): Year 2 in October 2026', K.yearFor('2019-10-15', '2026-10-08') === 'Year 2');
ok('born 1 September 2021: Reception in October 2026 (the oldest in the year)', K.yearFor('2021-09-01', '2026-10-08') === 'Reception');
ok('born 31 August 2022: Reception too (the youngest in the year)', K.yearFor('2022-08-31', '2026-10-08') === 'Reception');
ok('born 2023: pre-school', K.yearFor('2023-03-01', '2026-10-08') === 'Pre-school');
ok('the year moves up in September: Year 3 in July, Year 4 in September', K.yearFor('2019-05-01', '2027-07-20') === 'Year 3' && K.yearFor('2019-05-01', '2027-09-02') === 'Year 4');
ok('age on a day: 7 the day before their birthday, 8 on it', K.ageOn('2019-05-01', '2027-04-30') === 7 && K.ageOn('2019-05-01', '2027-05-01') === 8);

const G = [{ id: 'little', years: ['Reception', 'Year 1', 'Year 2'], order: 1 }, { id: 'juniors', years: ['Year 3', 'Year 4', 'Year 5', 'Year 6'], order: 2 }, { id: 'old', years: ['Year 3'], order: 3, active: false }];
ok('a child joins the group for their school year', K.groupFor({ year: 'Year 1' }, G) === 'little' && K.groupFor({ year: 'Year 4' }, G) === 'juniors');
ok('a group not running is passed over', K.groupFor({ year: 'Year 3' }, G) === 'juniors');
ok('a child moved by hand stays where they were put', K.groupFor({ year: 'Year 1', groupId: 'juniors', groupFixed: true }, G) === 'juniors');
ok('no group for their year: none', K.groupFor({ year: 'Year 11' }, G) === '');

const code = K.familyCode(new Uint8Array([0, 1, 2, 3, 4, 5]));
ok('a family code: six characters, none to misread (no 0, O, 1, I, L)', code.length === 6 && !/[01OIL]/.test(code), code);

const resp = { email: 'Parent@Example.invalid', name: 'Parent Synthetic', validUntil: '2027-08-31',
  answers: { parentName: 'Parent Synthetic', parentPhone: '07700 900111', emergency: 'Aunt Invented 07700 900222', collectors: 'Grandma Invented and Uncle Invented',
    children: [{ name: 'Ada Synthetic', dob: '2020-06-01', year: 'Year 1', photo: 'Yes' }, { name: 'Ben Synthetic', dob: '2017-11-02', year: '', photo: 'No' }] } };
const sens = { answers: { children: [{ allergies: 'Peanuts: carries an EpiPen', medical: 'none', firstaid: 'Yes' }, { allergies: 'None', medical: 'n/a', needs: '', firstaid: 'No' }] } };
const p = K.fromResponse(resp, sens, G, '2026-10-08');
ok('the parent becomes the family, with their email in lower case', p.family.parentName === 'Parent Synthetic' && p.family.email === 'parent@example.invalid' && p.family.phone === '07700 900111');
ok('the collectors are a list, and the parent is always on it', J(p.family.collectors) === J(['Parent Synthetic', 'Grandma Invented', 'Uncle Invented']), J(p.family.collectors));
ok('two children, each in their group', p.children.length === 2 && p.children[0].groupId === 'little' && p.children[1].groupId === 'juniors');
ok('a blank school year is worked out from the date of birth', p.children[1].year === 'Year 4');
ok('the allergy is a flag; "none" and "n/a" are not', p.children[0].flags.allergies === true && p.children[0].flags.medical === false && p.children[1].flags.allergies === false && p.children[1].flags.medical === false);
ok('photo consent as yes or no', p.children[0].photo === true && p.children[1].photo === false);
ok('first-aid consent, which the form keeps in its private half (F-038)', p.children[0].firstaid === true && p.children[1].firstaid === false);
ok('each child remembers its row in the private half', p.children[1].medicalIndex === 1);
ok('without the private half, the flags are unknown, not "none"', K.fromResponse(resp, null, G, '2026-10-08').children[0].flags === null);
ok('consent in date until its last day', K.consentOk({ consentUntil: '2027-08-31' }, '2027-08-31') && !K.consentOk({ consentUntil: '2027-08-31' }, '2027-09-01') && !K.consentOk({}, '2026-10-08'));

const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
