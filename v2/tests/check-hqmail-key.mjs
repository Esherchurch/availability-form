/* The key box (functions/hq-mail-key.js) and Church HQ's Resend secrets
 * (functions/resend-secrets.js; 21 Oct 2026: in Google Secret Manager).
 *
 *   node tests/check-hqmail-key.mjs        (from v2/)
 *
 * Runs the real callables (their .run()) against the Firestore emulator in
 * firebase.comms.json - an emulator of your own. Made-up keys only (they
 * have the right shape and open nothing). Secret Manager is stood in for
 * by the environment (as a function that lists the secret gets it) and by
 * a pretend Secret Manager (as the other senders ask it).
 *
 * Asks: master admins only; a key is NEVER sent back to a page; the box
 * says whether RESEND_API_KEY and RESEND_WEBHOOK_SECRET are set, and
 * refuses a Resend key pasted into it; an old Resend key in the database
 * goes at the next save and is never used; Canva's keys save, keep each
 * other, are refused in the wrong shape and until switch-over; the sender
 * sends with the secret; a sender without the secret listed asks Secret
 * Manager, and keeps the answer.
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
const SECRETS = await import(pathToFileURL(path.join(FN, 'resend-secrets.js')).href);
async function loadCopy(file, from, to) {
  const src = fs.readFileSync(path.join(FN, file), 'utf8').replace(/\r\n/g, '\n');
  if (from && !src.includes(from)) throw new Error('the line to break is not in functions/' + file + ' any more - update the break');
  const tmp = path.join(FN, '.check-' + process.pid + '-' + Math.random().toString(36).slice(2, 7) + '-' + file);
  fs.writeFileSync(tmp, from ? src.replace(from, to) : src);
  try { return await import(pathToFileURL(tmp).href); } finally { fs.unlinkSync(tmp); }
}

const KEY = 're_TestOnly_' + 'x'.repeat(24);
const HOOK = 'whsec_' + Buffer.from('test-only-signing-secret').toString('base64');
const OLD = 're_OldBoxKey_' + 'o'.repeat(24);

async function scenario(K) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  const run = (fn, uid, data) => fn.run({ auth: uid ? { uid } : undefined, data: data || {} }).then(r => ({ ok: r }), e => ({ err: e }));
  try {
    delete process.env.RESEND_API_KEY; delete process.env.RESEND_WEBHOOK_SECRET; SECRETS.forgetSecrets();
    for (const d of (await db.collection('privateSettings').get()).docs) await d.ref.delete();
    await db.collection('teamMailSettings').doc('config').set({ shutForTest: false });
    await db.collection('users').doc('k_master').set({ status: 'active', masterAdmin: true, name: 'Key Master Synthetic', teams: [] });
    await db.collection('users').doc('k_office').set({ status: 'active', masterAdmin: false, name: 'Key Office Synthetic', teams: ['Church office'] });
    K.forgetCachedKeys && K.forgetCachedKeys();

    let r = await run(K.hqMailKeyStatus, 'k_office');
    t('the church office cannot see the box (master admins only)', r.err && /master admin/.test(r.err.message), r);
    r = await run(K.hqMailKeySave, 'k_office', { canvaId: 'OCTestOnly123' });
    t('the church office cannot save a key', r.err && !(await db.collection('privateSettings').doc('churchHqMail').get()).exists);
    r = await run(K.hqMailKeySave, null, { canvaId: 'OCTestOnly123' });
    t('nobody signed out can save a key', !!r.err);
    r = await run(K.hqMailKeyStatus, 'k_master');
    t('Resend’s secrets not set yet: the box says so, and names them', r.ok && r.ok.saved === false && r.ok.hookSaved === false && r.ok.shut === false && /Secret Manager/.test(r.ok.resendIn) && r.ok.resendNames.join() === 'RESEND_API_KEY,RESEND_WEBHOOK_SECRET', r.ok);
    process.env.RESEND_API_KEY = KEY; process.env.RESEND_WEBHOOK_SECRET = HOOK;
    r = await run(K.hqMailKeyStatus, 'k_master');
    t('set in Secret Manager: the box says set', r.ok && r.ok.saved === true && r.ok.hookSaved === true, r.ok);

    r = await run(K.hqMailKeySave, 'k_master', { key: KEY });
    t('a Resend key pasted into the box is refused: it lives in Secret Manager', r.err && /Secret Manager/.test(r.err.message) && !(await db.collection('privateSettings').doc('churchHqMail').get()).exists);
    r = await run(K.hqMailKeySave, 'k_master', { hook: HOOK });
    t('…and so is a signing secret', r.err && /Secret Manager/.test(r.err.message));

    r = await run(K.hqMailKeySave, 'k_master', { canvaId: 'bad id!' });
    t('a Canva key of the wrong shape is refused', r.err && /Canva client ID/.test(r.err.message));
    await db.collection('privateSettings').doc('churchHqMail').set({ key: OLD, hook: 'whsec_old' });
    r = await run(K.hqMailKeySave, 'k_master', { canvaId: 'OCTestOnly123', canvaSecret: 'cnvcaTestOnly' + 'z'.repeat(20) });
    const saved = (await db.collection('privateSettings').doc('churchHqMail').get()).data() || {};
    t('Canva’s keys saved on the server, with who and when', saved.canvaId === 'OCTestOnly123' && saved.savedByName === 'Key Master Synthetic' && r.ok && r.ok.canvaSaved, r.ok);
    t('an old Resend key left in the database goes at the next save', !('key' in saved) && !('hook' in saved), Object.keys(saved));
    const st = await run(K.hqMailKeyStatus, 'k_master');
    const both = JSON.stringify([r.ok, st.ok]);
    t('a key is NEVER sent back to a page (save or status)', !both.includes('re_TestOnly') && !both.includes('whsec_') && !both.includes('cnvca') && !both.includes('OCTestOnly'), both.slice(0, 200));
    r = await run(K.hqMailKeySave, 'k_master', { canvaSecret: 'cnvcaTestOnly' + 'w'.repeat(20) });
    const after = (await db.collection('privateSettings').doc('churchHqMail').get()).data() || {};
    t('pasting one key keeps the other', after.canvaId === 'OCTestOnly123' && /w{20}$/.test(after.canvaSecret));
    r = await run(K.hqMailKeySave, 'k_master', {});
    t('nothing pasted: told so', r.err && /Paste/.test(r.err.message));
    const keys = await K.storedKeys(db);
    t('the server reads Canva’s keys (for canva.js), and no Resend key from the box', keys.canvaId === 'OCTestOnly123' && !('key' in keys), Object.keys(keys));

    await db.collection('teamMailSettings').doc('config').set({ shutForTest: true });
    r = await run(K.hqMailKeySave, 'k_master', { canvaId: 'OCTestOnly999' });
    t('until switch-over: saving Canva’s keys refused, in words', r.err && /switches over/.test(r.err.message) && ((await db.collection('privateSettings').doc('churchHqMail').get()).data() || {}).canvaId === 'OCTestOnly123');
    st.ok = (await run(K.hqMailKeyStatus, 'k_master')).ok;
    t('and the status says shut, but still says whether Resend’s are set', st.ok && st.ok.shut === true && st.ok.saved === true);
    await db.collection('teamMailSettings').doc('config').set({ shutForTest: false });

    r = await run(K.hqMailKeySave, 'k_master', { canvaId: '', canvaSecret: '' });
    t('removing Canva’s keys removes the record', r.ok && r.ok.canvaSaved === false && !(await db.collection('privateSettings').doc('churchHqMail').get()).exists);
  } catch (e) { t('the run finished', false, e.message); }
  delete process.env.RESEND_API_KEY; delete process.env.RESEND_WEBHOOK_SECRET; SECRETS.forgetSecrets();
  return out;
}

const R = [];
const report = rows => rows.forEach(r => { R.push(r.v); console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))); });
try { await db.collection('ping').doc('x').get(); } catch (e) { console.log('  FAIL  no Firestore emulator on ' + process.env.FIRESTORE_EMULATOR_HOST); process.exit(1); }
report(await scenario(await loadCopy('hq-mail-key.js')));

/* The sender uses the secret; a sender without it listed asks Secret Manager. */
{
  await db.collection('privateSettings').doc('churchHqMail').set({ key: OLD });
  process.env.RESEND_API_KEY = KEY; SECRETS.forgetSecrets();
  const H = await import(pathToFileURL(path.join(FN, 'hq-mail.js')).href);
  const seen = [];
  const fakeFetch = async (url, o) => { seen.push({ url, auth: o.headers.Authorization, body: JSON.parse(o.body) }); return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) }; };
  const r = await H.makeHqSender({ db, emulator: () => false, fetchFn: fakeFetch })({ to: 'sub@example.invalid', subject: 'Test', html: '<p>x</p>', fromName: 'Synthetic Green Church', replyTo: 'office@example.invalid', headers: { 'List-Unsubscribe': '<https://x.invalid/u>' } }, { kind: 'test' });
  const s = seen[0] || {};
  report([
    { n: 'the e-news sender sends with RESEND_API_KEY, never the old key in the database', v: r.ok && s.auth === 'Bearer ' + KEY && s.url === 'https://api.resend.com/emails', x: s.auth && s.auth.slice(0, 20) },
    { n: 'from "<Church>" <news@mail.churchhq.co.uk>, replies to the church', v: s.body && s.body.from === '"Synthetic Green Church" <news@mail.churchhq.co.uk>' && s.body.reply_to === 'office@example.invalid', x: s.body && s.body.from },
    { n: 'the unsubscribe header goes with it', v: s.body && s.body.headers && s.body.headers['List-Unsubscribe'] === '<https://x.invalid/u>' }
  ]);
  delete process.env.RESEND_API_KEY; SECRETS.forgetSecrets(); seen.length = 0;
  const r2 = await H.makeHqSender({ db, emulator: () => false, fetchFn: fakeFetch })({ to: 'sub@example.invalid', subject: 'No key', html: 'x' }, { kind: 'test' });
  report([{ n: 'no key: not sent, and it says RESEND_API_KEY', v: r2.ok === false && /RESEND_API_KEY/.test(r2.error) && seen.length === 0, x: r2 }]);
  const asked = [];
  const ask = async (name) => { asked.push(name); return name === 'RESEND_API_KEY' ? KEY : ''; };
  const v1 = await SECRETS.secretValue('RESEND_API_KEY', { ask }), v2 = await SECRETS.secretValue('RESEND_API_KEY', { ask });
  report([{ n: 'a sender without the secret listed asks Secret Manager once, and keeps the answer', v: v1 === KEY && v2 === KEY && asked.length === 1, x: asked }]);
  SECRETS.forgetSecrets();
  const out = (await db.collection('emailOutbox').where('kind', '==', 'test').get()).docs.map(d => d.data());
  report([{ n: 'the outbox row never holds the key', v: out.length > 0 && !JSON.stringify(out).includes('re_TestOnly'), x: out.length }]);
  for (const d of (await db.collection('emailOutbox').where('kind', '==', 'test').get()).docs) await d.ref.delete();
}

console.log('-- deliberate breaks --');
const BREAKS = [
  ['the status sends a key back', "  return { saved: !!k, hookSaved: !!h,", "  return { key: k, saved: !!k, hookSaved: !!h,", 'NEVER sent back'],
  ['saving allowed before switch-over', "  if (await keyShut()) throw new HttpsError('failed-precondition', 'Canva", "  if (false) throw new HttpsError('failed-precondition', 'Canva", 'saving Canva’s keys refused'],
  ['the church office allowed in', "if (u.status !== 'active' || u.masterAdmin !== true)", "if (u.status !== 'active')", 'church office cannot save'],
  ['a Resend key taken into the box again', "  if ((d.key !== undefined && String(d.key).trim()) || (d.hook !== undefined && String(d.hook).trim()))\n    throw", "  if (false)\n    throw", 'pasted into the box is refused'],
  ['an old Resend key left in the database', '  delete next.key; delete next.hook;', '', 'goes at the next save']
];
for (const [what, from, to, expect] of BREAKS) {
  let red = [];
  try { red = (await scenario(await loadCopy('hq-mail-key.js', from, to))).filter(r => !r.v).map(r => r.n); } catch (e) { console.log('          ' + e.message); }
  const hit = red.some(n => n.includes(expect));
  R.push(hit);
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '' : '  - NOTHING CAUGHT IT ' + JSON.stringify(red)));
}
for (const d of (await db.collection('privateSettings').get()).docs) await d.ref.delete();
const fails = R.filter(v => !v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' passed');
process.exit(fails ? 1 : 0);
