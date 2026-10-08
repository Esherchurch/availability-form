/* Chunk 4, R1 — room profiles on their own (egbc-events-rooms.js).
   Events window. No emulator, no browser:  node screenshots/events/r1-rooms-unit.test.mjs */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(V2, 'egbc-events-rooms.js'), 'utf8'), ctx);
const R = ctx.window.EGBCRooms;

const results = [];
const ok = (name, pass, why) => { results.push(pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + why)); };

const hall = { id: 'hall', active: true, kind: 'room', bookableByHirers: true, dims: { length: 12, width: 8 },
  layouts: { theatre: 100, cabaret: 48 }, fireMax: 90, facilities: { projector: true, loop: true, chairs: 80 } };
const lounge = { id: 'lounge', active: true, kind: 'room', bookableByHirers: true, capacity: 25, layouts: { cabaret: 20 }, facilities: { wifi: true } };

ok('floor area: 12 m by 8 m is 96 m²', R.area(hall) === 96);
ok('no length or width, no area', R.area(lounge) === 0);
ok('the fire-safety maximum caps every layout: theatre 100 holds 90', R.holds(hall, 'theatre') === 90);
ok('a layout under the maximum keeps its own number', R.holds(hall, 'cabaret') === 48);
ok('with no layout asked for, the most it holds, still capped', R.holds(hall) === 90);
ok('a room with only a plain capacity holds that', R.holds(lounge) === 25);

const need = { people: 40, layout: 'cabaret', facilities: ['projector'] };
ok('"40 people, cabaret, projector": the hall fits', R.fit(hall, need).ok);
const lf = R.fit(lounge, need);
ok('the lounge does not, and says why', !lf.ok && lf.why.join(', ') === 'holds 20 that way, no projector and screen', lf.why.join(', '));
ok('95 people: the hall is too small, because of the fire-safety maximum', !R.fit(hall, { people: 95 }).ok && R.fit(hall, { people: 95 }).why[0] === 'holds 90');
ok('a layout the room cannot be set out in', R.fit(lounge, { layout: 'theatre' }).why[0] === 'not set out theatre');
ok('a count facility counts as there when it is more than none', R.has(hall, 'chairs') && !R.has(hall, 'tables'));

const all = [hall, lounge, { id: 'office', active: true, kind: 'room', bookableByHirers: false },
  { id: 'online', active: true, kind: 'online', bookableByHirers: true }, { id: 'old', active: false, kind: 'room', bookableByHirers: true }];
ok('for hire: in use, at a site, open to hirers', JSON.stringify(R.hireable(all).map(r => r.id)) === '["hall","lounge"]');

const failed = results.filter(r => !r).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
