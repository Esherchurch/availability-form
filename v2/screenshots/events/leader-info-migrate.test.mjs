/* The leaderInfo migration (F-287), on the emulator with invented records:
   what it lists, that it changes nothing without --write, what --write
   changes, and that a person is asked about the same member named twice.

     EGBC_FIREBASE_CONFIG=firebase.events.json npx firebase emulators:exec --config firebase.events.json \
       --only firestore --project demo-egbc "node screenshots/events/leader-info-migrate.test.mjs" */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const V2 = path.resolve('.');
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('only on the emulator');
if (!getApps().length) initializeApp({ projectId: 'demo-egbc' });
const db = getFirestore();
const sgm = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(V2, 'egbc-events-safeguarding.js'), 'utf8'), { module: sgm });
const SG = sgm.exports;

const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 500))); };
/* the same whatever order the fields come back in */
const S = (x) => Array.isArray(x) ? x.map(S) : x && typeof x === 'object' ? Object.keys(x).sort().reduce((o, k) => { if (x[k] !== undefined) o[k] = S(x[k]); return o; }, {}) : x;
const J = (x) => JSON.stringify(S(x));
const run = (...a) => execFileSync(process.execPath, [path.join(V2, 'screenshots', 'events', 'migrate-leader-info.mjs'), '--project', 'demo-egbc', ...a], { encoding: 'utf8', env: process.env });
const L = (mid, name, extra) => Object.assign({ uid: mid ? 'u_' + mid : '', memberId: mid, name, role: 'leader' }, extra || {});
const get = async (id) => (await db.collection('eventLeaders').doc(id).get()).data();

const RECS = {
  ev_old: { leaders: [L('m_ann', 'Ann (invented)'), L('', 'A visiting speaker (invented)'), L('m_bob', 'Bob (invented)')], leaderIds: ['m_ann', '', 'm_bob'], leaderUids: ['u_m_ann', 'u_m_bob'], siteId: 's1' },
  ev_noids: { leaders: [L('m_cat', 'Cat (invented)')], leaderUids: ['u_m_cat'], siteId: 's1' },
  ev_twice: { leaders: [L('m_dan', 'Dan (invented)'), L('m_dan', 'Dan again (invented)')], leaderIds: ['m_dan', 'm_dan'], leaderUids: [], siteId: 's1' },
  ev_done: { leaders: [L('m_eve', 'Eve (invented)')], leaderIds: ['m_eve'], leaderInfo: { m_eve: { name: 'Eve (invented)', role: 'leader', uid: 'u_m_eve' } }, leaderUids: ['u_m_eve'], siteId: 's1' },
  ev_empty: { leaders: [], leaderIds: [], leaderUids: [], siteId: 's1' }
};
for (const id of Object.keys(RECS)) await db.collection('eventLeaders').doc(id).set(RECS[id]);

const dry = run();
ok('THE LIST: 5 records - 3 to change (one with no leaderIds, one with nobody), 1 already right, 1 for a person', /5 event leaders records: 3 to change, 1 already right, 1 for a person/.test(dry), dry);
ok('   each to change, with its counts', /ev_old: 3 leaders, 2 with a member id -> leaderInfo for 2/.test(dry) && /ev_noids: 1 leader, 1 with a member id -> leaderInfo for 1; leaderIds added/.test(dry) && /ev_empty: 0 leaders, 0 with a member id -> leaderInfo for 0/.test(dry), dry);
ok('   "FOR A PERSON ev_twice: the same member is named twice: m_dan"', /FOR A PERSON ev_twice: the same member is named twice: m_dan/.test(dry), dry);
ok('   WITHOUT --write NOTHING CHANGES', J(await get('ev_old')) === J(RECS.ev_old) && !(await get('ev_noids')).leaderIds, J(await get('ev_old')));

const wet = run('--write');
ok('--write: "done: 3 changed"', /done: 3 changed/.test(wet), wet);
const o = await get('ev_old');
ok('   leaderInfo for the two with member ids, by member id; the visiting speaker stays in leaders only', J(o.leaderInfo) === J({ m_ann: { name: 'Ann (invented)', role: 'leader', uid: 'u_m_ann' }, m_bob: { name: 'Bob (invented)', role: 'leader', uid: 'u_m_bob' } }) && o.leaders.length === 3, J(o.leaderInfo));
ok('   nothing else about the record changes', J(Object.assign({}, o, { leaderInfo: undefined })) === J(Object.assign({}, RECS.ev_old, { leaderInfo: undefined })));
const n = await get('ev_noids');
ok('   an older record gains leaderIds too', J(n.leaderIds) === J(['m_cat']) && n.leaderInfo.m_cat.name === 'Cat (invented)', J(n));
ok('   the one for a person is left alone', J(await get('ev_twice')) === J(RECS.ev_twice));
ok('   AND RUN AGAIN, nothing more to do', /0 to change, 4 already right, 1 for a person/.test(run()), run());

/* what the pages then show: a member's name from leaderInfo, whatever leaders[i] says */
const spoof = SG.whoIs(Object.assign({}, o, { leaders: [L('m_ann', 'Someone else (invented)'), o.leaders[1], o.leaders[2]] }));
ok('THE PAGES: a member’s name comes from leaderInfo, never from leaders[i] (the spoofed name is not shown)', spoof.leaders[0].name === 'Ann (invented)' && spoof.leaders[0].memberId === 'm_ann' && spoof.leaders[1].name === 'A visiting speaker (invented)' && spoof.leaders[1].memberId === '', J(spoof.leaders));

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
