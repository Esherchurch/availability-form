/* The Monday e-news draft, on the Firestore emulator: made once, never
 * twice, never for a church that doesn't use the e-news. From v2:
 *
 *   npx firebase emulators:exec --only firestore "node functions/enews-draft.test.mjs"
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { draftWeek, weekOf } from './enews-draft.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error('Run on the emulator.'); process.exit(2); }
initializeApp({ projectId: 'demo-enews-draft' });
const db = getFirestore();
let bad = 0;
const ok = (c, what) => { console.log((c ? 'PASS ' : 'FAIL ') + what); if (!c) bad++; };
const now = new Date('2030-03-04T07:00:00Z');   // a Monday

ok(weekOf(new Date('2030-03-10T20:00:00Z')) === '2030-03-04', 'Sunday evening is still that Monday\u2019s week');
await db.collection('churchSettings').doc('features').set({ enews: false });
ok((await draftWeek({ db, now, hub: 'https://example.invalid/v2' })) === 'off', 'a church with the e-news off gets nothing');

await db.collection('churchSettings').doc('features').set({ enews: true });
await db.collection('churchSettings').doc('details').set({ name: 'Synthetic Parish', shortName: 'SP' });
await db.collection('calEvents').doc('e1').set({ title: 'Synthetic quiz night', audience: ['public'], visibility: 'public', startUtc: now.getTime() + 2 * 86400000 });
await db.collection('enewsIssues').doc('n1').set({ week: 'notice', kind: 'oneoff', createdAt: now.toISOString() });
ok((await draftWeek({ db, now, hub: 'https://example.invalid/v2' })) === 'made', 'a one-off email this week doesn\u2019t stop the weekly draft');
const made = (await db.collection('enewsIssues').where('week', '==', '2030-03-04').get()).docs[0];
ok(made && made.data().status === 'draft' && /^SP e-news/.test(made.data().subject) && made.data().blocks.length > 0, 'a draft with the church\u2019s short name and blocks');
ok((await draftWeek({ db, now, hub: 'https://example.invalid/v2' })) === 'had one', 'never a second draft in the same week');

console.log(bad ? bad + ' FAILED' : 'all passed');
process.exit(bad ? 1 : 0);
