/* Phone notifications, without a browser (NEXT-BRIEF §23; F-144): the
   switches, the quiet hours, the words of each message, and who gets a
   phone message, an email instead, or nothing.

     node screenshots/events/notify-unit.test.mjs */

import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { window: {}, Intl, Date }; ctx.self = ctx.window; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(HERE, '..', '..', 'egbc-notify-core.js'), 'utf8'), ctx);
const N = ctx.window.EGBCNotifyCore;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const J = (x) => JSON.stringify(x);

/* The launch messages (§23), each a switch. */
ok('the launch messages are all there, each on by default', ['callParent', 'rota', 'booking', 'maintJob', 'urgent', 'checks'].every(k => N.TYPES[k] && N.prefsOf(null).types[k] === true));
ok('a switch turned off stays off; quiet hours default to 21:30 to 07:30', N.prefsOf({ types: { rota: false } }).types.rota === false && N.prefsOf({}).quietFrom === '21:30' && N.prefsOf({}).quietTo === '07:30');
ok('nonsense quiet hours fall back to the defaults', N.prefsOf({ quietFrom: '25:99' }).quietFrom === '21:30');

/* What each says. */
const cp = N.message('callParent', { group: 'Little ones', code: 'K7P2' });
ok('CALL A PARENT: THE GROUP AND THE CODE ONLY', cp.title === 'Please come to Little ones' && cp.body === 'Collection code K7P2', J(cp));
const cp2 = N.message('callParent', { group: 'Little ones', code: 'K7P2', child: 'Ada Synthetic', name: 'Ada Synthetic', allergies: 'peanuts' });
ok('   and never the child\'s name or anything medical, even if handed them', !/Ada|peanut/i.test(J(cp2)), J(cp2));
ok('rota: what and when to arrive', N.message('rota', { roles: ['Sound', 'Projection'], arrive: '9.30am', place: 'Esher Green' }).body === 'Sound, Projection · arrive 9.30am · Esher Green');
ok('booking: in words', N.message('booking', { status: 'declined', room: 'Hall', when: 'Sat 24 Oct, 2pm to 5pm' }).title === 'Your booking could not go ahead');
ok('a new maintenance job: where and what, no photo', J(N.message('maintJob', { where: 'Hall', what: 'Two lights out', photoPath: 'maintJobs/x/photo' })).indexOf('photo') < 0
  && N.message('maintJob', { where: 'Hall', what: 'Two lights out' }).body === 'Hall: Two lights out');
ok('urgent: marked urgent, and kept short', /^Urgent: /.test(N.message('urgent', { title: 'No service', text: 'x'.repeat(400) }).title) && N.message('urgent', { title: 'No service', text: 'x'.repeat(400) }).body.length <= 180);
ok('checks (§24): running out, and when', N.message('checks', { what: 'training', state: 'soon', ends: '2026-11-01' }).title === 'Your safeguarding training runs out soon');

/* Quiet hours, in UK time. 22:00 BST on 10 Oct 2026 is 21:00 UTC. */
const at = (utc) => new Date(utc);
ok('quiet hours: 22:00 in the UK is quiet', N.quiet(null, at('2026-10-10T21:00:00Z')) === true);
ok('   07:00 is quiet, 08:00 is not (BST)', N.quiet(null, at('2026-10-11T06:00:00Z')) === true && N.quiet(null, at('2026-10-11T07:00:00Z')) === false);
ok('   in winter the clocks go back, and it still means UK time (22:00 GMT)', N.quiet(null, at('2026-12-10T22:00:00Z')) === true && N.quiet(null, at('2026-12-10T12:00:00Z')) === false);
ok('   a person\'s own window counts', N.quiet({ quietFrom: '13:00', quietTo: '14:00' }, at('2026-12-10T13:30:00Z')) === true);

/* Who gets what. */
const night = at('2026-10-10T22:30:00Z');
const base = { prefs: { u_off: { types: { rota: false } } }, tokens: { u_phone: ['tok1', 'tok2'], u_off: ['tok3'] }, emails: { u_mail: 'mail@example.invalid', u_phone: 'p@example.invalid' }, now: night };
const r1 = N.plan({ ...base, uids: ['u_phone', 'u_mail', 'u_off', 'u_none', 'u_phone'], type: 'rota' });
ok('A PHONE IF THEY HAVE ONE (every phone they have), once', r1.push.length === 1 && r1.push[0].uid === 'u_phone' && J(r1.push[0].tokens) === J(['tok1', 'tok2']), J(r1));
ok('EMAIL AS THE FALLBACK for someone with no phone set up', r1.email.length === 1 && r1.email[0].email === 'mail@example.invalid', J(r1));
ok('a switch turned off means nothing at all, not an email', r1.skipped.some(s => s.uid === 'u_off' && s.why === 'turned off') && !r1.email.some(e => e.uid === 'u_off'));
ok('no phone and no email: said so', r1.skipped.some(s => s.uid === 'u_none' && s.why === 'no phone and no email'));
ok('at night a rota reminder arrives silently', r1.push[0].silent === true);
const r2 = N.plan({ ...base, uids: ['u_phone'], type: 'callParent' });
ok('CALLING A PARENT IS NEVER SILENT, even at night', r2.push[0].silent === false);
const r3 = N.plan({ ...base, uids: ['u_mail'], type: 'booking' });
ok('a booking update by email is skipped: the page has emailed them already', r3.email.length === 0 && /emailed by the page/.test(r3.skipped[0].why), J(r3));

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
