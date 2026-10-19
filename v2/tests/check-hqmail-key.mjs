/* The key box (functions/hq-mail-key.js): Church HQ's Resend key, its
 * webhook signing secret and the Canva integration's ID and secret.
 *
 *   node tests/check-hqmail-key.mjs        (from v2/)
 *
 * Runs the real callables (their .run()) against the Firestore emulator in
 * firebase.comms.json - an emulator of your own. Made-up keys only (they
 * have the right shape and open nothing).
 *
 * Asks: master admins only; a key is NEVER sent back to a page; saving is
 * refused until switch-over (and the status says so); wrong-shaped keys
 * are refused; removing works; the sender really uses the saved key; the
 * webhook really uses the saved signing secret.
 *
 * DELIBERATE BREAKS: each loads a copy of hq-mail-key.js with one line
 * changed and must turn a named check red.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + C1.emulators.firestore.port;
process.env.FUNCTIONS_EMULATOR = 'true';
process.env.GCLOUD_PROJECT = 'egbc-worship-planner';
const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();

const FN = path.join(V2, 'functions');
async function loadCopy(file, from, to) {
  const src = fs.readFileSync(path.join(FN, file), 'utf8');
  if (from && !src.includes(from)) throw new Error('the line to break is not in functions/' + file + ' any more - update the break');
  const tmp = path.join(FN, '.check-' + process.pid + '-' + Math.random().toString(36).slice(2, 7) + '-' + file);
  fs.writeFileSync(tmp, from ? src.replace(from, to) : src);
  try { return await import(pathToFileURL(tmp).href); } finally { fs.unlinkSync(tmp); }
}

const KEY = 're_TestOnly_' + 'x'.repeat(24), KEY2 = 're_TestOnly_' + 'y'.repeat(24);
const HOOK = 'whsec_' + Buffer.from('test-only-signing-secret').toString('base64');

async function scenario(K) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  const run = (fn, uid, data) => fn.run({ auth: uid ? { uid } : undefined, data: data || {} }).then(r => ({ ok: r }), e => ({ err: e }));
  try {
    for (const d of (await db.collection('privateSettings').get()).docs) await d.ref.delete();
    await db.collection('teamMailSettings').doc('config').set({ shutForTest: false });
    await db.collection('users').doc('k_master').set({ status: 'active', masterAdmin: true, name: 'Key Master Synthetic', teams: [] });
    await db.collection('users').doc('k_office').set({ status: 'active', masterAdmin: false, name: 'Key Office Synthetic', teams: ['Church office'] });
    K.forgetCachedKeys && K.forgetCachedKeys();

    let r = await run(K.hqMailKeyStatus, 'k_office');
    t('the church office cannot see the box (master admins only)', r.err && /master admin/.test(r.err.message), r);
    r = await run(K.hqMailKeySave, 'k_office', { key: KEY });
    t('the church office cannot save a key', r.err && !(await db.collection('privateSettings').doc('churchHqMail').get()).exists);
    r = await run(K.hqMailKeySave, null, { key: KEY });
    t('nobody signed out can save a key', !!r.err);
    r = await run(K.hqMailKeyStatus, 'k_master');
    t('a master admin sees: nothing saved yet, not shut', r.ok && r.ok.saved === false && r.ok.shut === false, r.ok);

    r = await run(K.hqMailKeySave, 'k_master', { key: 'sk_live_wrongshape000000000000' });
    t('a key of the wrong shape is refused', r.err && /re_/.test(r.err.message));
    r = await run(K.hqMailKeySave, 'k_master', { key: KEY, hook: HOOK, canvaId: 'OCTestOnly123', canvaSecret: 'cnvcaTestOnly' + 'z'.repeat(20) });
    const saved = (await db.collection('privateSettings').doc('churchHqMail').get()).data() || {};
    t('saved on the server, with who and when', saved.key === KEY && saved.hook === HOOK && saved.canvaId === 'OCTestOnly123' && saved.savedByName === 'Key Master Synthetic');
    t('the answer says what is saved', r.ok && r.ok.saved && r.ok.hookSaved && r.ok.canvaSaved, r.ok);
    const st = await run(K.hqMailKeyStatus, 'k_master');
    const both = JSON.stringify([r.ok, st.ok]);
    t('a key is NEVER sent back to a page (save or status)', !both.includes('re_TestOnly') && !both.includes('whsec_') && !both.includes('cnvca') && !both.includes('OCTestOnly'), both.slice(0, 200));
    r = await run(K.hqMailKeySave, 'k_master', { key: KEY2 });
    const after = (await db.collection('privateSettings').doc('churchHqMail').get()).data() || {};
    t('pasting one key keeps the others', after.key === KEY2 && after.hook === HOOK && after.canvaId === 'OCTestOnly123');
    r = await run(K.hqMailKeySave, 'k_master', {});
    t('nothing pasted: told so', r.err && /Paste/.test(r.err.message));
    const keys = await K.storedKeys(db);
    t('the server reads the saved key (for the sender)', keys.key === KEY2 && keys.hook === HOOK, keys.key && keys.key.slice(0, 5));

    await db.collection('teamMailSettings').doc('config').set({ shutForTest: true });
    r = await run(K.hqMailKeySave, 'k_master', { key: KEY });
    t('until switch-over: saving refused, in words', r.err && /switches over/.test(r.err.message) && ((await db.collection('privateSettings').doc('churchHqMail').get()).data() || {}).key === KEY2);
    st.ok = (await run(K.hqMailKeyStatus, 'k_master')).ok;
    t('and the status says shut (so the page shows no box)', st.ok && st.ok.shut === true);
    await db.collection('teamMailSettings').doc('config').set({ shutForTest: false });

    r = await run(K.hqMailKeySave, 'k_master', { key: '', hook: '', canvaId: '', canvaSecret: '' });
    t('removing every key removes the record', r.ok && r.ok.saved === false && !(await db.collection('privateSettings').doc('churchHqMail').get()).exists);
  } catch (e) { t('the run finished', false, e.message); }
  return out;
}

const R = [];
const report = rows => rows.forEach(r => { R.push(r.v); console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))); });
try { await db.collection('ping').doc('x').get(); } catch (e) { console.log('  FAIL  no Firestore emulator on ' + process.env.FIRESTORE_EMULATOR_HOST); process.exit(1); }
report(await scenario(await loadCopy('hq-mail-key.js')));

/* The sender and the webhook use what is in the box. */
{
  const K = await loadCopy('hq-mail-key.js');
  await db.collection('privateSettings').doc('churchHqMail').set({ key: KEY, hook: HOOK });
  K.forgetCachedKeys();
  const H = await import(pathToFileURL(path.join(FN, 'hq-mail.js')).href);
  const seen = [];
  const fakeFetch = async (url, o) => { seen.push({ url, auth: o.headers.Authorization, body: JSON.parse(o.body) }); return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) }; };
  const r = await H.makeHqSender({ db, emulator: () => false, fetchFn: fakeFetch })({ to: 'sub@example.invalid', subject: 'Test', html: '<p>x</p>', fromName: 'Synthetic Green Church', replyTo: 'office@example.invalid', headers: { 'List-Unsubscribe': '<https://x.invalid/u>' } }, { kind: 'test' });
  const s = seen[0] || {};
  report([
    { n: 'the sender sends with the key from the box', v: r.ok && s.auth === 'Bearer ' + KEY && s.url === 'https://api.resend.com/emails' },
    { n: 'from "<Church>" <news@mail.churchhq.co.uk>, replies to the church', v: s.body && s.body.from === '"Synthetic Green Church" <news@mail.churchhq.co.uk>' && s.body.reply_to === 'office@example.invalid', x: s.body && s.body.from },
    { n: 'the unsubscribe header goes with it', v: s.body && s.body.headers && s.body.headers['List-Unsubscribe'] === '<https://x.invalid/u>' }
  ]);
  const out = (await db.collection('emailOutbox').where('kind', '==', 'test').get()).docs.map(d => d.data());
  report([{ n: 'the outbox row never holds the key', v: out.length > 0 && !JSON.stringify(out).includes('re_TestOnly'), x: out.length }]);
  for (const d of (await db.collection('emailOutbox').where('kind', '==', 'test').get()).docs) await d.ref.delete();
}

console.log('-- deliberate breaks --');
const BREAKS = [
  ['the status sends the key back', "  return { saved: !!d.key, hookSaved: !!d.hook,", "  return { key: d.key, saved: !!d.key, hookSaved: !!d.hook,", 'NEVER sent back'],
  ['saving allowed before switch-over', "  if (await keyShut()) throw new HttpsError('failed-precondition', 'Church HQ", "  if (false) throw new HttpsError('failed-precondition', 'Church HQ", 'saving refused'],
  ['the church office allowed in', "if (u.status !== 'active' || u.masterAdmin !== true)", "if (u.status !== 'active')", 'church office cannot save'],
  ['any shape of key accepted', "    if (k && !KEY_SHAPE.test(k)) throw", "    if (false) throw", 'wrong shape']
];
for (const [what, from, to, expect] of BREAKS) {
  let red = [];
  try { red = (await scenario(await loadCopy('hq-mail-key.js', from, to))).filter(r => !r.v).map(r => r.n); } catch (e) { console.log('          ' + e.message); }
  const hit = red.some(n => n.includes(expect));
  R.push(hit);
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '' : '  - NOTHING CAUGHT IT'));
}
for (const d of (await db.collection('privateSettings').get()).docs) await d.ref.delete();
const fails = R.filter(v => !v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' passed');
process.exit(fails ? 1 : 0);
