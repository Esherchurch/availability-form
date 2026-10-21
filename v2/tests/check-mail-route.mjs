/* How the hub's emails go (functions/mail-route.js, through
 * public-mail.js makeSender): Church HQ's Resend, always (Martin, 21 Oct
 * 2026: "v2 doesn't use Calla at all").
 *
 *   node tests/check-mail-route.mjs        (from v2/)
 *
 * Runs the real makeSender against the Firestore emulator in
 * firebase.comms.json (an emulator of your own; this clears it). Nothing
 * leaves the machine: Resend's answers are pretend ones the check writes
 * down, and any other request at all is caught and counted. Synthetic
 * addresses only.
 *
 * Asks: every kind the server sends goes to Church HQ's Resend, from the
 * church's own name, replying to the church, with the key from Google
 * Secret Manager (RESEND_API_KEY); nothing ever goes to Calla's
 * sendEmail, and no server file still names it; without the key nothing
 * is sent and the outbox says why; Resend failing is written down and not
 * sent anywhere else; an unknown address, an under-18 address or the
 * hourly cap is refused; a Safeguarding email keeps no body; on the
 * emulator nothing is sent.
 *
 * DELIBERATE BREAKS: each loads a copy of mail-route.js or public-mail.js
 * with one line changed and must turn a named check red.
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
const { initializeApp, getApps } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();
const FN = path.join(V2, 'functions');
const SECRETS = await import(pathToFileURL(path.join(FN, 'resend-secrets.js')).href);
const KEY = 're_TestOnly_' + 'r'.repeat(24);

/* Any request that is not to the pretend Resend is caught here. */
const strays = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { strays.push(String(url)); return { ok: false, status: 599, json: async () => ({}) }; };

async function loadCopy(file, from, to) {
  if (!from) return import(pathToFileURL(path.join(FN, file)).href);
  const src = fs.readFileSync(path.join(FN, file), 'utf8').replace(/\r\n/g, '\n');
  if (!src.includes(from)) throw new Error('the line to break is not in functions/' + file + ' any more - update the break');
  const tmp = path.join(FN, '.check-' + process.pid + '-' + Math.random().toString(36).slice(2, 7) + '-' + file);
  fs.writeFileSync(tmp, src.replace(from, to));
  try { return await import(pathToFileURL(tmp).href); } finally { fs.unlinkSync(tmp); }
}

/* Every kind the server sends through makeSender (FINDINGS-comms C-28). */
const KINDS = [
  { source: 'public-mail', kind: 'signup' }, { source: 'public-mail', kind: 'booking waiting' }, { source: 'public-mail', kind: 'booking request' },
  { source: 'public-mail', kind: 'cancel ask' }, { source: 'public-mail', kind: 'form received' }, { source: 'public-mail', kind: 'group ask' },
  { source: 'public-mail', kind: 'group ask leaders' }, { source: 'public-mail', kind: 'new here' },
  { source: 'checklist', kind: 'checklist due' }, { source: 'compliance', kind: 'compliance due' }, { source: 'compliance', kind: 'compliance summary' },
  { source: 'events-feed', kind: 'calendar link' }, { source: 'regular-giving', kind: 'regular gift set up' }, { kind: 'session plan' },
  { source: 'team-mail', kind: 'team email' }, { source: 'team-mail', kind: 'team email copy' }, { source: 'emailCompiler' }, { source: 'social', kind: 'social reminder' },
  { kind: 'enews test' }
];
const OK = 'known.route@example.invalid';

async function clear() {
  for (const c of ['emailOutbox', 'mailRouteHours', 'privateSettings', 'addressBook', 'bookings', 'churchSettings']) {
    for (const d of (await db.collection(c).get()).docs) await d.ref.delete();
  }
  SECRETS.forgetSecrets();
}

async function scenario(PM, R) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  try {
    await clear();
    process.env.RESEND_API_KEY = KEY;
    await db.collection('churchSettings').doc('details').set({ name: 'Synthetic Green Church', enquiryEmail: 'office.route@example.invalid' });
    await db.collection('addressBook').doc('ab_ok').set({ name: 'Known Synthetic', email: 'Known.Route@Example.invalid' });
    await db.collection('addressBook').doc('ab_kid').set({ name: 'Young Synthetic', email: 'kid.route@example.invalid', isMinor: true });
    await db.collection('addressBook').doc('ab_sev').set({ name: 'Sev Synthetic', email: 'sev.route@example.invalid', under18: true, isMinor: false });
    await db.collection('bookings').doc('bk1').set({ requester: { email: 'hirer.route@example.invalid' } });
    /* A key an older box saved in the database must never be used. */
    await db.collection('privateSettings').doc('churchHqMail').set({ key: 're_OldBoxKey_' + 'x'.repeat(24) });
    strays.length = 0;

    const resend = [];
    let resendFails = false;
    const resendFetch = async (url, o) => { resend.push({ url, auth: o.headers.Authorization, body: JSON.parse(o.body) }); return resendFails ? { ok: false, status: 500, json: async () => ({ message: 'pretend outage' }) } : { ok: true, status: 200, json: async () => ({ id: 'em_test' }) }; };
    /* Not the emulator, so the real request is built - sent to the pretend Resend. */
    const send = PM.makeSender({ db, emulator: () => false, route: R, resendFetch });
    const rows = async () => (await db.collection('emailOutbox').get()).docs.map(d => d.data());
    const msg = { to: [OK], subject: 'Route test', html: '<p>Hello</p>', replyTo: '' };

    /* 1. Every kind: Church HQ's Resend. */
    for (const k of KINDS) await send(msg, k);
    const r1 = await rows();
    t('every kind goes to Church HQ’s Resend (' + KINDS.length + ' kinds)', resend.length === KINDS.length && r1.length === KINDS.length && r1.every(r => r.via === 'churchhq' && r.ok), { resend: resend.length, rows: r1.map(r => r.via + ':' + r.ok + ':' + (r.error || '')) });
    t('nothing goes to Calla’s sendEmail, or anywhere else', strays.length === 0 && resend.every(x => x.url === 'https://api.resend.com/emails'), strays);
    const b = (resend[0] || {}).body || {};
    t('from "<church name>" <hub@mail.churchhq.co.uk>, replying to the church', b.from === '"Synthetic Green Church" <hub@mail.churchhq.co.uk>' && b.reply_to === 'office.route@example.invalid', b.from + ' / ' + b.reply_to);
    t('with the key from Google Secret Manager (RESEND_API_KEY), never one in the database', (resend[0] || {}).auth === 'Bearer ' + KEY);
    /* public-mail-pages.cjs is the pages' own files, copied word for word and
       run in a sandbox with no fetch at all (public-mail.js pages): what a page
       would send is only collected there, and sent by makeSender. */
    const src = fs.readdirSync(FN).filter(f => /\.(js|cjs)$/.test(f) && f !== 'index.js' && f !== 'public-mail-pages.cjs' && !f.startsWith('.check-')).filter(f => /sendemail-irkwdhx3xq|SEND_EMAIL_URL/.test(fs.readFileSync(path.join(FN, f), 'utf8')));
    t('no server file but the main window’s index.js still names Calla’s sendEmail', src.length === 0, src);

    /* 2. No key: nothing sent, and the outbox says why. */
    delete process.env.RESEND_API_KEY; SECRETS.forgetSecrets(); resend.length = 0;
    let r = await send(Object.assign({}, msg, { subject: 'No key' }), { kind: 'signup' });
    const nk = (await rows()).filter(x => x.subject === 'No key');
    t('no key yet: not sent anywhere, and the outbox says why', r.ok === false && resend.length === 0 && strays.length === 0 && nk.length === 1 && /RESEND_API_KEY/.test(nk[0].error), { r, nk });
    process.env.RESEND_API_KEY = KEY;

    /* 3. Resend fails: written down, not sent anywhere else. */
    resendFails = true;
    r = await send(Object.assign({}, msg, { subject: 'Outage test' }), { source: 'public-mail', kind: 'signup' });
    resendFails = false;
    const fb = (await rows()).filter(x => x.subject === 'Outage test');
    t('Resend failing: the email is not sent, and the outbox says why', r.ok === false && /pretend outage/.test(r.error) && fb.length === 1 && fb[0].via === 'churchhq' && fb[0].ok === false, { r, fb: fb.map(x => x.via + ':' + x.ok) });
    t('…and no fallback to Calla’s (nothing else is asked)', strays.length === 0, strays);

    /* 4. The protections. A refusal is final. */
    resend.length = 0;
    r = await send({ to: ['stranger.route@example.invalid'], subject: 'Unknown', html: 'x' }, { kind: 'signup' });
    t('an unknown address is refused, and nothing is sent', r.ok === false && /not known/.test(r.error) && resend.length === 0 && strays.length === 0, r);
    r = await send({ to: ['HIRER.route@example.invalid'], subject: 'Nested', html: 'x' }, { kind: 'signup' });
    t('a known address in a nested field (a hirer), any capitals, is fine', r.ok && r.via === 'churchhq', r);
    resend.length = 0;
    r = await send({ to: ['kid.route@example.invalid'], subject: 'Minor', html: 'x' }, { kind: 'signup' });
    t('an under-18 address is refused (never emailed)', r.ok === false && /under-18/.test(r.error) && resend.length === 0, r);
    r = await send({ to: ['sev.route@example.invalid'], subject: 'Seventeen', html: 'x' }, { kind: 'signup' });
    t('a 17-year-old (ticked Under 18, not Under 16) is refused too', r.ok === false && /under-18/.test(r.error) && resend.length === 0, r);
    const hour = new Date().toISOString().slice(0, 13);
    await db.collection('mailRouteHours').doc(hour).set({ recipients: 1999, hour });
    r = await send({ to: [OK, 'hirer.route@example.invalid'], subject: 'Cap', html: 'x' }, { kind: 'signup' });
    t('the hourly cap (2,000 recipients) refuses the one that would pass it', r.ok === false && /Hourly/.test(r.error) && resend.length === 0, r);
    await db.collection('mailRouteHours').doc(hour).delete();

    /* 5. Safeguarding: no body kept. */
    r = await send({ to: [OK], subject: 'Safeguarding', html: '<p>Private words</p>' }, { source: 'team-mail', kind: 'team email', outlineOnly: true });
    const sg = (await rows()).filter(x => x.subject === 'Safeguarding');
    t('a Safeguarding team email keeps no body in the outbox', r.ok && sg.length === 1 && sg[0].html === '' && !JSON.stringify(sg).includes('Private words'));
    t('but the email itself still had it', (resend[resend.length - 1] || {}).body && resend[resend.length - 1].body.html === '<p>Private words</p>');

    /* 6. On the emulator itself nothing is sent. */
    resend.length = 0;
    const emu = PM.makeSender({ db, route: R });
    const a = await emu({ to: [OK], subject: 'Emu', html: 'x' }, { source: 'public-mail', kind: 'signup' });
    t('on the emulator: Church HQ’s, stubbed, nothing sent', a.ok && a.via === 'churchhq' && a.stubbed && resend.length === 0 && strays.length === 0, a);
    const emuNo = await emu({ to: ['stranger.route@example.invalid'], subject: 'Emu unknown', html: 'x' }, { kind: 'signup' });
    t('…and its protections still refuse', emuNo.ok === false && /not known/.test(emuNo.error));
  } catch (e) { t('the run finished', false, e.stack || e.message); }
  return out;
}

const R = [];
const report = rows => rows.forEach(r => { R.push(r.v); console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))); });
try { await db.collection('ping').doc('x').get(); } catch (e) { console.log('  FAIL  no Firestore emulator on ' + process.env.FIRESTORE_EMULATOR_HOST); process.exit(1); }
const PM0 = await loadCopy('public-mail.js'), R0 = await loadCopy('mail-route.js');
report(await scenario(PM0, R0));

console.log('-- deliberate breaks --');
const BREAKS = [
  ['mail-route.js', 'under-18 addresses let through', "if (want.some(a => minors.has(a))) return", "if (false) return", 'under-18 address is refused'],
  ['public-mail.js', 'the protections switched off', "const refused = check.refused || (!(await route.reserve(db, row.to.length)) ? 'Hourly limit reached' : '');", "const refused = '';", 'unknown address is refused'],
  ['public-mail.js', 'Calla’s brought back as a fallback', "    await db.collection('emailOutbox').add({ ...row, ok: r.ok, error: r.error || '', resendId: r.id || '' });",
    "    await db.collection('emailOutbox').add({ ...row, ok: r.ok, error: r.error || '', resendId: r.id || '' }); if (!r.ok) { await fetch('https://sendemail-irkwdhx3xq-uc.a.run.app', { method: 'POST', body: '{}' }); return { ok: true, via: 'calla' }; }", 'no fallback to Calla'],
  ['public-mail.js', 'Safeguarding body kept', "    await db.collection('emailOutbox').add({ ...row, ok: r.ok, error: r.error || '', resendId: r.id || '' });", "    await db.collection('emailOutbox').add({ ...row, html: String(msg.html || ''), ok: r.ok, error: r.error || '', resendId: r.id || '' });", 'keeps no body'],
  ['mail-route.js', 'a key from the database', "export { resendKey } from './resend-secrets.js';", "import { getFirestore as gf } from 'firebase-admin/firestore';\nexport async function resendKey() { return ((await gf().collection('privateSettings').doc('churchHqMail').get()).data() || {}).key || ''; }", 'never one in the database']
];
for (const [file, what, from, to, expect] of BREAKS) {
  let red = [];
  try {
    const PM = file === 'public-mail.js' ? await loadCopy(file, from, to) : PM0;
    const RR = file === 'mail-route.js' ? await loadCopy(file, from, to) : R0;
    red = (await scenario(PM, file === 'mail-route.js' ? RR : R0)).filter(r => !r.v).map(r => r.n);
  } catch (e) { console.log('          ' + e.message); }
  const hit = red.some(n => n.includes(expect));
  R.push(hit);
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '' : '  - NOTHING CAUGHT IT ' + JSON.stringify(red)));
}
await clear();
globalThis.fetch = realFetch;
const fails = R.filter(v => !v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' passed');
process.exit(fails ? 1 : 0);
