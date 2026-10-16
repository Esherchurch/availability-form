/* Enter a Sunday once, end to end: the trigger keeps calEvents/rota_<id>.
 *
 *   set FUNCTIONS_EMULATOR_PORT=5191 && firebase emulators:exec --config firebase.spare.json
 *     --only firestore,auth,functions --project egbc-worship-planner "node tests/check-rota-whatson-live.mjs"
 *
 * Writes a synthetic rota service the way the Planner does and watches the
 * copy appear, follow an edit to its title, and go when it is unticked,
 * archived, deleted, or the church switches the part off.
 */
import path from 'node:path';
import { createRequire } from 'node:module';

const V2 = path.resolve('.');
const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Needs the emulator (FIRESTORE_EMULATOR_HOST).'); process.exit(2); }
initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : ''))); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ID = 'rw_synthetic_sunday';
const rota = db.collection('events').doc(ID), copy = db.collection('calEvents').doc('rota_' + ID);
const features = db.collection('churchSettings').doc('features');

/* Wait for the copy to reach a state, up to 20s (a cold trigger is slow). */
async function until(test) {
  for (let i = 0; i < 80; i++) { const s = await copy.get(); if (test(s)) return s; await sleep(250); }
  return copy.get();
}

const SUNDAY = { date: '2026-11-15', type: 'Sunday Morning Worship', startTime: '08:00', endTime: '11:30',
  serviceTime: '10:00', whatsOn: true, archived: false, publicTitle: 'Synthetic Shoebox Sunday',
  speaker: 'Synthetic Speaker', description: 'private notes', roles: ['Keyboard'], teams: ['Worship Team'] };

try {
  await features.delete();
  await rota.set(SUNDAY);
  let s = await until((x) => x.exists);
  ok('a service ticked "In What\'s On" appears as a public event', s.exists && s.get('visibility') === 'public'
    && s.get('title') === 'Synthetic Shoebox Sunday' && s.get('startLocal') === '2026-11-15T10:00'
    && s.get('startUtc') === Date.parse('2026-11-15T10:00:00Z'), JSON.stringify(s.data() || {}));
  ok('  and only once (one copy, keyed by the service)',
    (await db.collection('calEvents').where('rotaId', '==', ID).get()).size === 1);

  await rota.update({ publicTitle: 'Synthetic Shoebox Sunday, renamed', speaker: 'Another Synthetic Speaker' });
  s = await until((x) => x.exists && /renamed/.test(x.get('title') || ''));
  ok('editing the title on the rota changes What\'s On', s.get('title') === 'Synthetic Shoebox Sunday, renamed'
    && /Another Synthetic Speaker/.test(s.get('description') || ''), s.get('title'));

  await rota.update({ whatsOn: false });
  s = await until((x) => !x.exists);
  ok('unticked: gone', !s.exists);

  await rota.update({ whatsOn: true });
  await until((x) => x.exists);
  await rota.update({ archived: true });
  s = await until((x) => !x.exists);
  ok('archived: gone', !s.exists);

  await rota.update({ archived: false });
  await until((x) => x.exists);
  await features.set({ sundaysInWhatsOn: false });
  await rota.update({ speaker: 'Synthetic Speaker' });
  s = await until((x) => !x.exists);
  ok('the church switches the part off: gone at the next change', !s.exists);
  await features.delete();

  await rota.update({ speaker: 'Synthetic Speaker again' });
  await until((x) => x.exists);
  await rota.delete();
  s = await until((x) => !x.exists);
  ok('deleted from the rota: gone', !s.exists);

  await db.collection('events').doc(ID + '_private').set(Object.assign({}, SUNDAY, { whatsOn: false }));
  await sleep(4000);
  ok('a service never ticked never appears', !(await db.collection('calEvents').doc('rota_' + ID + '_private').get()).exists);
} finally {
  await rota.delete().catch(() => {});
  await db.collection('events').doc(ID + '_private').delete().catch(() => {});
  await copy.delete().catch(() => {});
  await features.delete().catch(() => {});
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.some((v) => !v) ? 1 : 0);
