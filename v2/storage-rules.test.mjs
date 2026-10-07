/* Runs the real rules engine against storage.rules.
   Nothing here touches the live project or the live bucket.

   Storage rules can read Firestore, and these do: "is this person an
   admin" is answered from the same users document firestore.rules reads.
   That means BOTH emulators have to be running, which is why this is run
   with --only firestore,storage. With Firestore missing, every rule that
   calls firestore.get() fails closed and the whole file looks broken.

     npx firebase emulators:exec --only firestore,storage --project demo-egbc \
       "node storage-rules.test.mjs"
*/

import fs from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, deleteObject, getBytes } from 'firebase/storage';

/* Ports come from firebase.json. EGBC_FIREBASE_CONFIG=firebase.events.json
   runs this against the events window's emulators instead; unset, nothing
   changes. */
const cfg = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.json', 'utf8'));
const FS_PORT = cfg?.emulators?.firestore?.port ?? 8080;
const ST_PORT = cfg?.emulators?.storage?.port ?? 9199;
const PROJECT = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'demo-egbc';

const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: FS_PORT },
  storage: { rules: fs.readFileSync('storage.rules', 'utf8'), host: '127.0.0.1', port: ST_PORT },
});

/* The same three people as the Firestore tests, and for the same reason:
   one master admin, one admin of a single area, one ordinary member. */
const PEOPLE = {
  martin: { uid: 'u_martin', teams: ['Core Team'], adminFor: [], masterAdmin: true },
  karen:  { uid: 'u_karen',  teams: [], adminFor: ['Kids Church'], masterAdmin: false },
  samy:   { uid: 'u_samy',   teams: ['Worship Team'], adminFor: [], masterAdmin: false },
  pending:{ uid: 'u_pending', teams: [], adminFor: [], masterAdmin: false },
};

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const p of Object.values(PEOPLE)) {
    await setDoc(doc(db, 'users', p.uid), {
      memberId: 'm_' + p.uid, name: p.uid,
      teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin,
      status: (p.teams.length || p.adminFor.length || p.masterAdmin) ? 'active' : 'pending',
    });
  }
  /* Something already in the bucket, so reading can be tested as well as
     writing. */
  const st = ctx.storage();
  await uploadBytes(ref(st, 'events/cev_test/already-there.png'), PIC(), { contentType: 'image/png' });
});

/* A tiny PNG. Invented bytes; not a real photograph of anybody. */
function PIC(bytes) {
  return new Uint8Array(bytes || 64).fill(7);
}

const as = (who) => env.authenticatedContext(PEOPLE[who].uid).storage();
const anon = () => env.unauthenticatedContext().storage();

const results = [];
async function check(name, expect, fn) {
  try {
    await (expect === 'allow' ? assertSucceeds(fn()) : assertFails(fn()));
    results.push({ ok: true, name, expect });
  } catch (e) {
    results.push({ ok: false, name, expect, why: (e.message || '').split('\n')[0].slice(0, 120) });
  }
}

const put = (st, path, opts) =>
  uploadBytes(ref(st, path), PIC((opts && opts.bytes) || 64),
    { contentType: (opts && opts.type) || 'image/png' });

/* ---- event pictures: the F-016 decision ---------------------------- */

await check('a master admin puts a picture on an event', 'allow',
  () => put(as('martin'), 'events/cev_test/hero.png'));
await check('an admin of one area does too', 'allow',
  () => put(as('karen'), 'events/cev_test/hero2.png'));

/* The three that F-016 was about. */
await check('an ordinary member cannot put a picture on an event', 'deny',
  () => put(as('samy'), 'events/cev_test/sneak.png'));
await check('somebody in the book with no teams yet cannot either', 'deny',
  () => put(as('pending'), 'events/cev_test/sneak2.png'));
await check('and nor can somebody with no account at all', 'deny',
  () => put(anon(), 'events/cev_test/sneak3.png'));

await check('an admin cannot upload something that is not a picture', 'deny',
  () => put(as('martin'), 'events/cev_test/not-a-picture.pdf', { type: 'application/pdf' }));
await check('an admin cannot upload a picture far too big for a web page', 'deny',
  () => put(as('martin'), 'events/cev_test/huge.png', { bytes: 9 * 1024 * 1024 }));

/* The picture has to be readable before anyone has signed in: What's On
   and the event page are public, and the picture draws first.
   This runs BEFORE the delete check on purpose. With the rule broken on
   purpose the delete succeeds, which takes the file away and makes this
   fail for a reason that has nothing to do with reading. A test that
   fails for the wrong reason is worse than one that does not run. */
await check('anybody can see an event picture, signed in or not', 'allow',
  () => getBytes(ref(anon(), 'events/cev_test/already-there.png')));

await check('an ordinary member cannot delete an event picture', 'deny',
  () => deleteObject(ref(as('samy'), 'events/cev_test/already-there.png')));

/* Room pictures, written ready for Places to upload rather than link. */
await check('an admin puts a picture on a room', 'allow',
  () => put(as('karen'), 'rooms/room_hall/photo.png'));
await check('a member cannot', 'deny',
  () => put(as('samy'), 'rooms/room_hall/photo.png'));

/* ---- the rota on its way to an email -------------------------------
   The planner writes one PDF per person here, reads it back to attach,
   and deletes it. There was no rule for this path at all, so applying
   these rules would have stopped 'Send all rotas' dead. */
await check('the planner puts a rota PDF where it can read it back', 'allow',
  () => uploadBytes(ref(as('karen'), 'rota-temp/pkg1/Alex_Rota.pdf'), PIC(), { contentType: 'application/pdf' }));
await check('and reads it back to attach to the email', 'allow',
  () => getBytes(ref(as('karen'), 'rota-temp/pkg1/Alex_Rota.pdf')));
await check('and clears it up afterwards', 'allow',
  () => deleteObject(ref(as('karen'), 'rota-temp/pkg1/Alex_Rota.pdf')));
await check('somebody with no account cannot put anything there', 'deny',
  () => uploadBytes(ref(anon(), 'rota-temp/pkg1/sneak.pdf'), PIC(), { contentType: 'application/pdf' }));
await check('and cannot read a rota that is mid-flight', 'deny',
  () => getBytes(ref(anon(), 'rota-temp/pkg1/Alex_Rota.pdf')));
await check('a rota PDF has to be a PDF', 'deny',
  () => uploadBytes(ref(as('karen'), 'rota-temp/pkg1/not.png'), PIC(), { contentType: 'image/png' }));

/* ---- nothing else moved ------------------------------------------- */
/* Banners are uploaded from the hub by anyone signed in, and were before
   this change. If tightening events had caught them too, this fails. */
await check('a signed-in member can still upload a banner', 'allow',
  () => put(as('samy'), 'banners/some-banner.png'));
await check('a signed-in member can still upload to their team shelf', 'allow',
  () => put(as('samy'), 'resources/Worship Team/notes.png'));
await check('somebody with no account still cannot upload a banner', 'deny',
  () => put(anon(), 'banners/nope.png'));
await check('nothing may be written outside the paths that are named', 'deny',
  () => put(as('martin'), 'somewhere-else/file.png'));

await env.cleanup();

const failed = results.filter(r => !r.ok);
for (const r of results) {
  console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + '  (expected ' + r.expect + ')' + (r.why ? '\n          ' + r.why : ''));
}
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
process.exit(failed.length ? 1 : 0);
