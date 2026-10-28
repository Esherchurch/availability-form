/* ADD A CHURCH, AND ITS FIRST MASTER ADMIN (the setup frame; FINDINGS-
 * churchhq "The setup frame"). Church HQ staff only, like hq-set-slug.mjs:
 * it makes a church exist, so no page can do it. Everything after this is
 * done by the church on its own screens (setup.html).
 *
 * From v2/functions (where firebase-admin is installed), with Application
 * Default Credentials:
 *
 *   node ../tools/hq-create-church.mjs <churchId> --name "St Aidan's" --admin-email a@b.org --admin-name "Ann Admin"
 *        DRY RUN: says what it would write, writes nothing
 *   ... --apply     writes it
 *
 * Options: --project <id> (default egbc-worship-planner). On the emulator,
 * set FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST first.
 *
 * Writes (refused if the church already exists):
 *   hqChurches/<id>      { name, slug: <id>, group: 'main', status: 'setup' }
 *   hqSlugs/<id>         { churchId }   (the church id is its first slug)
 *   hqMemberships/<id>_<uid>, and the person's `churches` claim
 *   churches/<id>/addressBook/<memberId>   { name, email }
 *   churches/<id>/users/<uid>   { status: 'active', masterAdmin: true, memberId, email }
 *   churches/<id>/churchSettings/details   { name }
 *   churches/<id>/churchSettings/launch    { rulesLocked: true }, only once
 *     the hub has gone live (EGBC's own launch.rulesLocked is true): a church
 *     counts as live when the rules are (GOING-LIVE.md step 12)
 * The admin's sign-in is found by email, or made (no password: they sign in
 * with an email link or Google, as everyone does).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fnRequire = createRequire(path.join(HERE, '..', 'functions', 'package.json'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { getAuth } = fnRequire('firebase-admin/auth');
const url = (f) => path.join(HERE, '..', 'functions', f).replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:');
const { validChurchId, MEMBERSHIP_ID, syncClaims } = await import(url('hq-directory.js'));
const { slugProblem, addressFor } = await import(url('hub-address.js'));

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : ''; };
const APPLY = args.includes('--apply');
const PROJECT = opt('--project') || process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const cid = args.find((a, i) => !a.startsWith('--') && !String(args[i - 1] || '').startsWith('--'));
const name = String(opt('--name')).trim(), email = String(opt('--admin-email')).trim().toLowerCase(), adminName = String(opt('--admin-name')).trim();

if (!validChurchId(cid)) { console.error('Not a church id: ' + cid + ' (lower case letters, numbers and hyphens).'); process.exit(2); }
const sp = slugProblem(cid);
if (sp) { console.error('"' + cid + '" can\'t be its first address: ' + sp); process.exit(2); }
if (!name) { console.error('Give the church its name: --name "..."'); process.exit(2); }
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('Give the first master admin\'s email: --admin-email ...'); process.exit(2); }
if (!adminName) { console.error('Give the first master admin\'s name: --admin-name "..."'); process.exit(2); }

if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore(), auth = getAuth();
if ((await db.collection('hqChurches').doc(cid).get()).exists) { console.error(cid + ' already exists. Nothing written.'); process.exit(3); }
const held = await db.collection('hqSlugs').doc(cid).get();
if (held.exists) { console.error('"' + cid + '" is held by ' + held.data().churchId + '. Nothing written.'); process.exit(3); }
let user = await auth.getUserByEmail(email).catch(() => null);
const memberId = 'm-' + cid.slice(0, 20) + '-1';
const launch = await db.collection('churchSettings').doc('launch').get().catch(() => null);
const live = !!(launch && launch.exists && launch.data().rulesLocked === true);

console.log((APPLY ? 'ADDING' : 'DRY RUN, nothing written') + ' (' + PROJECT + ')');
console.log('  church:  ' + cid + ' "' + name + '", status setup, address ' + addressFor(cid));
console.log('  admin:   ' + adminName + ' <' + email + '>' + (user ? ' (signs in already: ' + user.uid + ')' : ' (a sign-in is made)'));
console.log('  live:    ' + (live ? 'yes, the hub has gone live: Present and the private forms open' : 'not yet: set on going-live day (tools/hq-lock-churches.mjs)'));
console.log('  then:    they open setup.html?church=' + cid + ' and set the rest up on the screens');
if (!APPLY) { console.log('Add --apply to write it.'); process.exit(0); }

if (!user) user = await auth.createUser({ email, displayName: adminName, emailVerified: false });
const now = new Date().toISOString(), root = db.collection('churches').doc(cid);
const b = db.batch();
b.set(db.collection('hqChurches').doc(cid), { name, slug: cid, group: 'main', status: 'setup', domain: '', createdAt: now });
b.set(db.collection('hqSlugs').doc(cid), { churchId: cid });
b.set(db.collection('hqMemberships').doc(MEMBERSHIP_ID(cid, user.uid)), { churchId: cid, uid: user.uid, at: now });
b.set(root.collection('addressBook').doc(memberId), { name: adminName, email, archived: false, createdAt: now });
b.set(root.collection('users').doc(user.uid), { uid: user.uid, status: 'active', masterAdmin: true, memberId, email, name: adminName,
  teams: [], adminFor: [], covers: [], adminCovers: [], jobs: [], createdAt: now });
b.set(root.collection('churchSettings').doc('details'), { name, updatedAt: now, updatedBy: 'church-hq' });
if (live) b.set(root.collection('churchSettings').doc('launch'), { rulesLocked: true, updatedAt: now, updatedBy: 'church-hq' });
await b.commit();
await syncClaims({ db, auth, uid: user.uid });
console.log('Done. ' + adminName + ' signs in, then opens setup.html?church=' + cid + '.');
process.exit(0);
