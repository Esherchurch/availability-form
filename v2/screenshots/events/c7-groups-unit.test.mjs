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

const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
