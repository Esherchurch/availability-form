/* Chunk 7, stage 1 — small groups' sums, without a browser.

     node screenshots/events/c7-groups-unit.test.mjs */

import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(HERE, '..', '..', 'egbc-events-groups.js'), 'utf8'), ctx);
const G = ctx.window.EGBCGroups;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + why)); }
const J = (x) => JSON.stringify(x);

ok('when: "Tuesdays, 7.30pm, every week"', G.when({ day: 2, time: '19:30', frequency: 'weekly' }) === 'Tuesdays, 7.30pm, every week', G.when({ day: 2, time: '19:30', frequency: 'weekly' }));
ok('on the hour, in the morning, monthly', G.when({ day: 6, time: '10:00', frequency: 'monthly' }) === 'Saturdays, 10am, once a month');
ok('noon is 12pm; a written-in frequency', G.when({ day: 7, time: '12:15', frequency: 'other', frequencyNote: 'First Sunday' }) === 'Sundays, 12.15pm, first sunday');
ok('no day or time yet', G.when({}) === 'Times to be arranged');

const home = { locationKind: 'home', area: 'Esher', address: '1 Invented Road' };
ok('A HOME GROUP SHOWS ITS AREA, NEVER ITS ADDRESS', G.wherePublic(home) === 'In a home in Esher' && !/Invented/.test(G.wherePublic(home)));
ok('a room at church: the room and the site', G.wherePublic({ locationKind: 'room', roomId: 'r1', siteId: 's1' }, { rooms: { r1: 'Hall' }, sites: { s1: 'Esher Green' } }) === 'Hall, Esher Green');
ok('online, and somewhere else', G.wherePublic({ locationKind: 'online' }) === 'Online' && G.wherePublic({ locationKind: 'venue', venueName: 'The Bear' }) === 'The Bear');

ok('full when the members reach the limit; no limit is never full', G.full({ capacity: 2, memberCount: 2 }) && !G.full({ capacity: 0, memberCount: 50 }) && !G.full({ capacity: 3, memberCount: 2 }));
ok('can ask to join: running, open, not full', G.joinable({ capacity: 3, memberCount: 2 }) && !G.joinable({ open: false }) && !G.joinable({ capacity: 1, memberCount: 1 }) && !G.joinable({ active: false }));
ok('its status, in words', G.status({ open: false }) === 'Not taking new members' && G.status({ capacity: 1, memberCount: 1 }) === 'Full' && G.status({}) === 'Open to new members');

const L = [{ id: 'a', name: 'Tuesday home group', day: 2, type: 'Home group', area: 'Esher', locationKind: 'home', capacity: 2, memberCount: 2 },
  { id: 'b', name: 'Prayer breakfast', day: 6, type: 'Prayer', locationKind: 'room', roomId: 'r1', description: 'Toast and prayer', leaderNames: ['Ann'] },
  { id: 'c', name: 'Claygate study', day: 2, type: 'Bible study', area: 'Claygate', locationKind: 'home' }];
const ids = (f) => L.filter(g => G.matches(g, f)).map(g => g.id).join('');
ok('filter by day', ids({ day: '2' }) === 'ac');
ok('by kind', ids({ type: 'Prayer' }) === 'b');
ok('by area', ids({ area: 'claygate' }) === 'c');
ok('by words, in the description or a leader\'s name', ids({ q: 'toast' }) === 'b' && ids({ q: 'ann' }) === 'b');
ok('only those taking new members', ids({ openOnly: true }) === 'bc');
ok('the areas to choose from', J(G.areas(L)) === J(['Claygate', 'Esher']));

ok('a place in a group has one id per person store', G.memberKey('sg_1', 'addressBook', 'm_1') === 'sg_1__a_m_1' && G.memberKey('sg_1', 'contacts', 'c_1') === 'sg_1__c_c_1');
ok('asking to join needs a name and an email that works', J(G.requestProblems({ name: '', email: 'x' })) === J(['your name', 'an email address']) && !G.requestProblems({ name: 'A', email: 'a@example.invalid' }).length);

/* ---- stage 2 ---- */
ok('the next Tuesday from a Friday', G.nextDate({ day: 2 }, '2026-10-09') === '2026-10-13');
ok('today counts, if it is the day', G.nextDate({ day: 5 }, '2026-10-09') === '2026-10-09');
ok('no day set: no next date', G.nextDate({ day: 0 }, '2026-10-09') === '');
ok('three months before', G.monthsBefore('2026-10-09', 3) === '2026-07-09');
const MEM = [{ id: 'k_a', name: 'Ann' }, { id: 'k_b', name: 'Bob' }];
const REGS = [{ date: '2026-09-01', present: ['k_a'], guests: 1, count: 2 }, { date: '2026-09-08', present: ['k_a', 'k_b', 'k_gone'], guests: 0, count: 3 }, { date: '2026-12-01', present: ['k_b'], guests: 0, count: 1 }];
const t = G.attendanceTable(MEM, REGS, '2026-09-01', '2026-09-30');
ok('who came: a column per register in the dates', J(t.dates) === J(['2026-09-01', '2026-09-08']));
ok('a row per member, with how many times', J(t.rows.map(r => [r.name, r.total])) === J([['Ann', 2], ['Bob', 1], ['Someone who has left', 1]]), J(t.rows));
ok('guests and totals per date', J(t.guests) === J([1, 0]) && J(t.totals) === J([2, 3]));
const R = (n, c) => Array.from({ length: n }, (_, i) => ({ groupId: 'g', date: '2026-0' + (1 + Math.floor(i / 4)) + '-' + String(10 + (i % 4) * 5), count: c[i] }));
const ov = G.overview({ id: 'g', name: 'G', memberCount: 9, capacity: 12, leaderNames: ['Ann'] }, R(8, [4, 4, 5, 4, 7, 8, 7, 8]));
ok('oversight: usually comes (last 8 registers) and the trend', ov.average === 5.9 && ov.trend === 'growing' && ov.lastMet === '2026-02-25', J(ov));
ok('a group with no registers yet', G.overview({ id: 'h', name: 'H' }, []).average === null && G.overview({ id: 'h', name: 'H' }, []).lastMet === '');

const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
