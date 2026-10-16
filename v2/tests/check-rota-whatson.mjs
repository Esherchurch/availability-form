/* Enter a Sunday once: which rota services reach What's On, and as what.
 *
 *   node tests/check-rota-whatson.mjs      (from v2/, no emulator)
 *
 * Asks functions/rota-whatson.js's mirrorFor() directly - the one decision
 * the trigger makes - so every case is cheap and none is skipped. The
 * trigger itself, end to end, is check-rota-whatson-live.mjs.
 */
import { mirrorFor, londonToUtc } from '../functions/rota-whatson.js';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : ''))); };

const SUNDAY = { date: '2026-11-15', type: 'Sunday Morning Worship', startTime: '08:00', endTime: '11:30',
  serviceTime: '10:00', whatsOn: true, archived: false, publicTitle: 'Shoebox Sunday',
  publicDescription: 'Bring a filled shoebox.', speaker: 'Synthetic Speaker',
  description: 'PRIVATE: band arrives early', serviceLeader: 'Synthetic Leader',
  assignments: { Keyboard: { id: 'm1', name: 'Synthetic Keys' } } };

console.log('A service ticked "In What\'s On"');
const m = mirrorFor('ev1', SUNDAY, { siteId: 'site_main' });
ok('  is public, a service, confirmed', m && m.visibility === 'public' && m.category === 'service' && m.status === 'confirmed'
  && JSON.stringify(m.audience) === '["public","members"]', JSON.stringify(m));
ok('  with the public title', m.title === 'Shoebox Sunday');
ok('  the public description and the speaker', m.description === 'Bring a filled shoebox.\n\nSpeaker: Synthetic Speaker' && m.speaker === 'Synthetic Speaker', m.description);
ok('  at the SERVICE time, not the team\'s call time', m.startLocal === '2026-11-15T10:00' && m.endLocal === '2026-11-15T11:30', m.startLocal + ' ' + m.endLocal);
ok('  in GMT in November', typeof m.startUtc === 'number' && new Date(m.startUtc).toISOString() === '2026-11-15T10:00:00.000Z', m.startUtc);
ok('  and says where it came from', m.source === 'rota' && m.rotaId === 'ev1' && m.location.siteId === 'site_main');
const text = JSON.stringify(m);
ok('  and nothing private: no notes, no role names, no service leader',
  !/PRIVATE|Synthetic Keys|Synthetic Leader|assignments/.test(text), text);
ok('  in BST in October', mirrorFor('e', Object.assign({}, SUNDAY, { date: '2026-10-18' })).startUtc === Date.parse('2026-10-18T09:00:00.000Z'));
ok('  an evening service ends when it says', (() => {
  const c = mirrorFor('e', Object.assign({}, SUNDAY, { date: '2026-12-20', serviceTime: '18:30', serviceEnd: '20:00' }));
  return c.startLocal === '2026-12-20T18:30' && c.endLocal === '2026-12-20T20:00' && c.startUtc === Date.parse('2026-12-20T18:30:00.000Z');
})());
ok('  no public title: the service type', mirrorFor('e', Object.assign({}, SUNDAY, { publicTitle: '' })).title === 'Sunday Morning Worship');
ok('  no speaker: no speaker line', mirrorFor('e', Object.assign({}, SUNDAY, { speaker: '' })).description === 'Bring a filled shoebox.');
ok('  the clocks going back are right (25 Oct 2026, 01:30 is GMT)', londonToUtc('2026-10-25', '10:00').toISOString() === '2026-10-25T10:00:00.000Z');

console.log('\nNever shown');
for (const [why, patch] of [
  ['not ticked', { whatsOn: false }],
  ['tick missing (every service before this)', { whatsOn: undefined }],
  ['archived', { archived: true }],
  ['no service time', { serviceTime: '' }],
  ['a nonsense time', { serviceTime: '25:00' }],
  ['no date', { date: '' }]
]) ok('  ' + why, mirrorFor('e', Object.assign({}, SUNDAY, patch)) === null);
ok('  deleted', mirrorFor('e', null) === null);
ok('  the church has switched the part off', mirrorFor('e', SUNDAY, { featureOff: true }) === null);

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some((v) => !v) ? 1 : 0);
