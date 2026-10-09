/* E2 — the forms logic on its own (egbc-events-forms.js). Events window.
   No emulator, no browser:   node screenshots/events/e2-forms-unit.test.mjs

   The parts that decide where an answer goes and whether a family is asked
   to fill a form in again: the medical split, how long an answer lasts,
   and when an earlier answer may be reused. */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['egbc-events-checkin.js', 'egbc-events-forms.js']) vm.runInContext(fs.readFileSync(path.join(V2, f), 'utf8'), ctx);
const F = ctx.window.EGBCForms;

const results = [];
const ok = (name, pass, why) => { results.push(pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + why)); };

/* ---- the medical split ---- */
const parent = F.fromTemplate('parent');
const answers = {
  children: [
    { name: 'Child One', dob: '2018-03-01', allergies: 'Peanuts', medical: 'None', dietary: 'Vegetarian', photo: 'Yes' },
    { name: 'Child Two', dob: '2020-06-01', allergies: 'None', medication: 'Inhaler', photo: 'No' }
  ],
  parentName: 'Parent Synthetic', collectors: 'Parent Synthetic, Aunt Invented'
};
const s = F.split(parent, answers);
ok('medical answers leave the ordinary half', JSON.stringify(s.plain).indexOf('Peanuts') < 0 && JSON.stringify(s.plain).indexOf('Inhaler') < 0, JSON.stringify(s.plain));
ok('and are in the private half, row by row', s.sensitive.children[0].allergies === 'Peanuts' && s.sensitive.children[1].medication === 'Inhaler');
ok('ordinary answers stay ordinary (names, dietary, collectors)', s.plain.children[0].name === 'Child One' && s.plain.children[0].dietary === 'Vegetarian' && s.plain.collectors);
/* Compared by content: putting the halves back may change the order of keys. */
const sorted = (o) => JSON.stringify(o, (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(x => [x, v[x]])) : v);
ok('put back together, nothing is lost', sorted(F.merge(parent, s.plain, s.sensitive)) === sorted(answers));
ok('a question about asthma is private from its wording alone', F.isSensitive({ id: 'x', label: 'Does your child have asthma?' }));
ok('a question about the bus is not', !F.isSensitive({ id: 'y', label: 'Will they take the bus home?' }));
ok('a question marked medical is private whatever it says', F.isSensitive({ id: 'z', label: 'Anything else?', sensitive: true }));

/* ---- how long an answer lasts ---- */
ok('school year: from October, to next 31 August', F.validUntil({ validity: { mode: 'schoolyear' } }, '', new Date('2026-10-08T10:00')) === '2027-08-31');
ok("12 months from when given (Martin's default for every template)", F.validUntil({ validity: { mode: 'months', months: 12 } }, '', new Date('2026-10-08T10:00')) === '2027-10-08');
ok('every template now lasts 12 months by default', F.TEMPLATES.every(t => t.validity.mode === 'months' && t.validity.months === 12));
ok('and says so', F.validityText({ validity: { mode: 'months', months: 12 } }) === 'Lasts 12 months from when it is given');
ok('school year: in July, to this 31 August', F.validUntil({ validity: { mode: 'schoolyear' } }, '', new Date('2027-07-01T10:00')) === '2027-08-31');
ok('a number of days', F.validUntil({ validity: { mode: 'days', days: 30 } }, '', new Date('2026-10-08T10:00')) === '2026-11-07');
ok('one event: the day of the event', F.validUntil({ validity: { mode: 'event' } }, '2026-12-20T18:00', new Date('2026-10-08T10:00')) === '2026-12-20');
ok('kept for the set months after that, then due for deletion', F.deleteAfter({ retentionMonths: 12 }, '2027-08-31') === '2028-08-31');

/* ---- reuse ---- */
const prior = [
  { id: 'r_old', formId: 'f1', email: 'Parent@Example.invalid', subjects: ['Child One', 'Child Two'], validUntil: '2027-08-31', submittedAt: '2026-09-01' },
  { id: 'r_expired', formId: 'f1', email: 'late@example.invalid', subjects: ['Child Five'], validUntil: '2026-09-30', submittedAt: '2025-09-01' },
  { id: 'r_other_form', formId: 'f2', email: 'parent@example.invalid', subjects: ['Child One'], validUntil: '2027-08-31', submittedAt: '2026-09-02' }
];
const find = (o) => (F.findReusable(prior, Object.assign({ formId: 'f1', onDate: '2026-11-01' }, o)) || {}).id || null;
ok('same email (any case), same children, still valid: reused', find({ email: 'parent@example.invalid', subjects: ['child one', 'Child Two'] }) === 'r_old');
ok('a child not on the earlier form: not reused', find({ email: 'parent@example.invalid', subjects: ['Child One', 'Child Six'] }) === null);
ok('run out before the event: not reused', find({ email: 'late@example.invalid', subjects: ['Child Five'] }) === null);
ok('another person\'s email: not reused', find({ email: 'someone@example.invalid', subjects: ['Child One'] }) === null);
ok('an answer to a different form: not reused', F.findReusable(prior, { formId: 'f2', email: 'parent@example.invalid', subjects: ['Child Two'], onDate: '2026-11-01' }) === null);

/* ---- templates ---- */
const tplOk = F.TEMPLATES.every(t => t.purpose && t.fields.some(f => f.type === 'signature'));
ok('every template says why it asks, and is signed', tplOk);
const leader = JSON.stringify(F.fromTemplate('leader'));
ok('the leader declaration asks for DBS status and date, never the number', /DBS check/.test(leader) && !/certificate number"|"number"/i.test(leader.replace('Do not write the certificate number', '')));

const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
