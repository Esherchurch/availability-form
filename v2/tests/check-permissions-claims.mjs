/* Each person's permissions on their sign-in (FINDINGS-churchhq H-14;
 * functions/permissions.js). No emulator: a pretend database and a pretend
 * sign-in service.
 *
 *   node tests/check-permissions-claims.mjs          (from v2/)
 *   BREAK=merge node tests/check-permissions-claims.mjs   the claim written over
 *                                                          the others: must fail
 *
 * The claim is perms.<church> (EGBC's: perms.egbc), never touching the
 * claims a person already carries; an exception's end date takes it away;
 * the master admin who added one hears once, a week before it ends.
 */
import * as Perms from '../functions/permissions.js';
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x))); };
let merged = Perms.mergedPerms;
if (process.env.BREAK === 'merge') merged = (existing, key, list) => ({ perms: { [key]: list } });

/* A pretend Firestore: collection(c).doc(d).get/set, collection(c).get, where('f','==',v).get. */
function fakeDb(docs) {
  const coll = (c) => ({
    doc: (d) => ({ get: async () => ({ exists: (c + '/' + d) in docs, data: () => docs[c + '/' + d], id: d }),
      set: async (v, o) => { docs[c + '/' + d] = o && o.merge ? Object.assign({}, docs[c + '/' + d] || {}, v) : v; } }),
    get: async () => { const ds = Object.keys(docs).filter((k) => k.startsWith(c + '/') && k.split('/').length === 2).map((k) => ({ id: k.split('/')[1], data: () => docs[k] })); return { docs: ds, size: ds.length }; },
    where: (f, op, v) => ({ get: async () => { const ds = Object.keys(docs).filter((k) => k.startsWith(c + '/') && docs[k][f] === v).map((k) => ({ id: k.split('/')[1], data: () => docs[k] })); return { docs: ds, size: ds.length }; } })
  });
  return { collection: coll, _docs: docs };
}
function fakeAuth(claims) {
  return { getUser: async (uid) => { if (!(uid in claims)) { const e = new Error('no user'); e.code = 'auth/user-not-found'; throw e; } return { customClaims: claims[uid] }; },
    setCustomUserClaims: async (uid, c) => { claims[uid] = c; } };
}

console.log('The claim');
const m = merged({ churches: ['mc-a'], device: 'x', perms: { 'mc-b': ['kbUpload'] } }, 'mc-a', ['kbUpload']);
ok('this church\'s perms set, every other claim kept (churches, a computer\'s, another church\'s perms)',
  JSON.stringify(m) === JSON.stringify({ churches: ['mc-a'], device: 'x', perms: { 'mc-b': ['kbUpload'], 'mc-a': ['kbUpload'] } }), m);
ok('  nothing allowed: the key goes, not an empty list', JSON.stringify(Perms.mergedPerms({ perms: { egbc: ['kbUpload'] } }, 'egbc', [])) === '{}');
ok('  EGBC\'s own data is perms.egbc', Perms.CLAIM_KEY(null) === 'egbc' && Perms.CLAIM_KEY('mc-a') === 'mc-a');

console.log('Who gets kbUpload, worked out on the server');
const docs = {
  'users/u_wc': { status: 'active', teams: ['Core Team'], memberId: 'm_wc' },
  'users/u_ky': { status: 'active', teams: ['Kids & Youth Core Team'], memberId: 'm_ky' },
  'users/u_sam': { status: 'active', teams: [], memberId: 'm_sam' },
  'users/u_gone': { status: 'archived', teams: ['Core Team'], memberId: 'm_gone' },
  'permissionExceptions/kbUpload_m_sam': { action: 'kbUpload', memberId: 'm_sam', uid: 'u_sam', by: 'u_master', name: 'Sam Synthetic', until: '2026-11-02' }
};
const db = fakeDb(docs);
const claims = { u_wc: { churches: [] }, u_ky: {}, u_sam: {}, u_gone: { perms: { egbc: ['kbUpload'] } } };
const auth = fakeAuth(claims);
const r1 = await Perms.syncAll({ db, auth, cid: null, today: '2026-10-26' });
ok('the Worship Core Team member gets it', JSON.stringify((claims.u_wc.perms || {}).egbc) === '["kbUpload"]', claims.u_wc);
ok('  the Kids & Youth Core Team member does not', !(claims.u_ky.perms || {}).egbc, claims.u_ky);
ok('  the person given it as an exception does', JSON.stringify((claims.u_sam.perms || {}).egbc) === '["kbUpload"]', claims.u_sam);
ok('  somebody no longer active loses it', !(claims.u_gone.perms || {}).egbc, claims.u_gone);
ok('  and the claims already there are kept', Array.isArray(claims.u_wc.churches), claims.u_wc);
const r2 = await Perms.syncAll({ db, auth, cid: null, today: '2026-10-26' });
ok('run again: nothing written (claims are only set when they change)', r2.written === 0, r2);

console.log('Every morning');
const notes = [];
const d1 = await Perms.runDaily({ db, auth, cid: null, today: '2026-10-26', notify: async (o) => notes.push(o) });
ok('a week before an exception ends, whoever added it is told', notes.length === 1 && notes[0].uids[0] === 'u_master' && notes[0].type === 'permission' && /Sam Synthetic/.test(notes[0].data.name), notes);
await Perms.runDaily({ db, auth, cid: null, today: '2026-10-27', notify: async (o) => notes.push(o) });
ok('  once only', notes.length === 1, notes.length);
await Perms.runDaily({ db, auth, cid: null, today: '2026-11-03', notify: async (o) => notes.push(o) });
ok('the morning after it ends, it is taken away', !(claims.u_sam.perms || {}).egbc, claims.u_sam);

console.log('What a change to a person\'s record needs');
ok('their heartbeat: nothing', !Perms.userChangeMatters({ teams: ['A'], lastSeen: 1 }, { teams: ['A'], lastSeen: 2 }));
ok('  their teams, admin areas, covers or status: worked out again', ['teams', 'adminFor', 'covers', 'status', 'masterAdmin'].every((k) => Perms.userChangeMatters({ [k]: ['x'] }, { [k]: ['y'] })));

console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
