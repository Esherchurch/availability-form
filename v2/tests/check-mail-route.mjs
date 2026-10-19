/* Which way the hub's emails go (functions/mail-route.js, through
 * public-mail.js makeSender): Calla's sendEmail, or Church HQ's Resend.
 *
 *   node tests/check-mail-route.mjs        (from v2/)
 *
 * Runs the real makeSender against the Firestore emulator in
 * firebase.comms.json (an emulator of your own; this clears it). Nothing
 * leaves the machine: Calla's and Resend's answers are pretend ones the
 * check writes down. Synthetic addresses only.
 *
 * Asks: with Martin's list empty every kind goes to Calla's exactly as
 * today; a listed kind goes to Church HQ's (stubbed) from the church's
 * own name, replying to the church; not without the key, not while shut;
 * Resend failing falls back to Calla's with both written down; an unknown
 * address, an under-18 address or the hourly cap is refused and NOT
 * passed to Calla's; a Safeguarding email keeps no body; the known list
 * is Calla's.
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
const KEYS = await import(pathToFileURL(path.join(FN, 'hq-mail-key.js')).href);

async function loadCopy(file, from, to) {
  if (!from) return import(pathToFileURL(path.join(FN, file)).href);
  const src = fs.readFileSync(path.join(FN, file), 'utf8').replace(/\r\n/g, '\n');
  if (!src.includes(from)) throw new Error('the line to break is not in functions/' + file + ' any more - update the break');
  const tmp = path.join(FN, '.check-' + process.pid + '-' + Math.random().toString(36).slice(2, 7) + '-' + file);
  fs.writeFileSync(tmp, src.replace(from, to));
  try { return await import(pathToFileURL(tmp).href); } finally { fs.unlinkSync(tmp); }
}

/* Every kind the server sends through makeSender today (FINDINGS-comms C-28). */
const KINDS = [
  { source: 'public-mail', kind: 'signup' }, { source: 'public-mail', kind: 'booking waiting' }, { source: 'public-mail', kind: 'booking request' },
  { source: 'public-mail', kind: 'cancel ask' }, { source: 'public-mail', kind: 'form received' }, { source: 'public-mail', kind: 'group ask' },
  { source: 'public-mail', kind: 'group ask leaders' }, { source: 'public-mail', kind: 'new here' },
  { source: 'checklist', kind: 'checklist due' }, { source: 'compliance', kind: 'compliance due' }, { source: 'compliance', kind: 'compliance summary' },
  { source: 'events-feed', kind: 'calendar link' }, { source: 'regular-giving', kind: 'regular gift set up' }, { kind: 'session plan' },
  { source: 'team-mail', kind: 'team email' }, { source: 'team-mail', kind: 'team email copy' }, { source: 'emailCompiler' }
];
const OK = 'known.route@example.invalid';

async function clear() {
  for (const c of ['emailOutbox', 'mailRouteHours', 'privateSettings', 'addressBook', 'bookings', 'churchSettings']) {
    for (const d of (await db.collection(c).get()).docs) await d.ref.delete();
  }
  KEYS.forgetCachedKeys();
}

async function scenario(PM, R) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  try {
    await clear();
    await db.collection('churchSettings').doc('details').set({ name: 'Synthetic Green Church', enquiryEmail: 'office.route@example.invalid' });
    await db.collection('addressBook').doc('ab_ok').set({ name: 'Known Synthetic', email: 'Known.Route@Example.invalid' });
    await db.collection('addressBook').doc('ab_kid').set({ name: 'Young Synthetic', email: 'kid.route@example.invalid', isMinor: true });
    await db.collection('bookings').doc('bk1').set({ requester: { email: 'hirer.route@example.invalid' } });
    await db.collection('privateSettings').doc('churchHqMail').set({ key: 're_TestOnly_' + 'r'.repeat(24) });
    KEYS.forgetCachedKeys();

    const calla = [], resend = [];
    const callaFetch = async (url, o) => { calla.push({ url, body: JSON.parse(o.body) }); return { status: 200, json: async () => ({ ok: true }) }; };
    let resendFails = false;
    const resendFetch = async (url, o) => { resend.push({ url, auth: o.headers.Authorization, body: JSON.parse(o.body) }); return resendFails ? { ok: false, status: 500, json: async () => ({ message: 'pretend outage' }) } : { ok: true, status: 200, json: async () => ({ id: 'em_test' }) }; };
    /* Not the emulator, so the real Calla payload is built - sent to the pretend Calla. */
    const send = PM.makeSender({ db, emulator: () => false, fetchFn: callaFetch, auth: async () => ({}), route: R, resendFetch });
    const rows = async () => (await db.collection('emailOutbox').get()).docs.map(d => d.data());
    const msg = { to: [OK], subject: 'Route test', html: '<p>Hello</p>', replyTo: '' };

    /* 1. Martin's list empty: every kind to Calla's, exactly as today. */
    for (const k of KINDS) await send(msg, k);
    const r1 = await rows();
    t('list empty: every kind goes to Calla\u2019s (' + KINDS.length + ' kinds)', calla.length === KINDS.length && resend.length === 0 && r1.every(r => r.via === 'calla' && r.ok), { calla: calla.length, resend: resend.length });
    t('Calla\u2019s gets the same request as before (to, subject, html)', JSON.stringify(Object.keys(calla[0].body).sort()) === '["html","subject","to"]' && calla[0].body.to[0] === OK);

    /* 2. Listed. */
    await db.collection('churchSettings').doc('mailRoute').set({ kinds: ['signup', 'emailCompiler'] });
    calla.length = 0; resend.length = 0;
    let r = await send(msg, { source: 'public-mail', kind: 'signup' });
    t('a listed kind goes to Church HQ\u2019s Resend', r.ok && r.via === 'churchhq' && resend.length === 1 && calla.length === 0, { r, resend: resend.length, calla: calla.length });
    const b = (resend[0] || {}).body || {};
    t('from "<church name>" <hub@mail.churchhq.co.uk>, replying to the church', b.from === '"Synthetic Green Church" <hub@mail.churchhq.co.uk>' && b.reply_to === 'office.route@example.invalid', b.from + ' / ' + b.reply_to);
    t('with the key from the key box', (resend[0] || {}).auth === 'Bearer re_TestOnly_' + 'r'.repeat(24));
    r = await send(msg, { source: 'emailCompiler' });
    t('a source on the list counts too (the Email Compiler has no kind)', r.via === 'churchhq');
    r = await send(msg, { source: 'public-mail', kind: 'new here' });
    t('a kind not on the list still goes to Calla\u2019s', r.via === 'calla' && calla.length === 1);
    const viaRows = (await rows()).filter(x => x.kind === 'signup');
    t('the outbox row says which way it went', viaRows.some(x => x.via === 'churchhq' && x.ok === true) && viaRows.some(x => x.via === 'calla'), viaRows.map(x => x.via));

    /* 3. Not without the key; not while shut. */
    await db.collection('privateSettings').doc('churchHqMail').delete(); KEYS.forgetCachedKeys();
    r = await send(msg, { source: 'public-mail', kind: 'signup' });
    t('no key in the box: Calla\u2019s', r.via === 'calla');
    await db.collection('privateSettings').doc('churchHqMail').set({ key: 're_TestOnly_' + 'r'.repeat(24) }); KEYS.forgetCachedKeys();
    t('shut (before switch-over): Calla\u2019s, whatever the list says', (await R.routeFor(db, { kind: 'signup' }, { shut: () => true })).route === 'calla');

    /* 4. Resend fails: back to Calla's, both written down. */
    calla.length = 0; resendFails = true;
    r = await send(Object.assign({}, msg, { subject: 'Fallback test' }), { source: 'public-mail', kind: 'signup' });
    resendFails = false;
    const fb = (await rows()).filter(x => x.subject === 'Fallback test');
    t('Resend failing: the email goes to Calla\u2019s instead', r.ok && r.via === 'calla' && calla.length === 1, r);
    t('and both attempts are in the outbox', fb.length === 2 && fb.some(x => x.via === 'churchhq' && x.ok === false && /pretend outage/.test(x.error)) && fb.some(x => x.via === 'calla' && x.ok && x.fallbackFrom === 'churchhq'), fb.map(x => x.via + ':' + x.ok));

    /* 5. Calla's protections, on this side. A refusal is not passed on. */
    calla.length = 0; resend.length = 0;
    r = await send({ to: ['stranger.route@example.invalid'], subject: 'Unknown', html: 'x' }, { kind: 'signup' });
    t('an unknown address is refused on the Resend path', r.ok === false && /not known/.test(r.error) && resend.length === 0, r);
    t('and NOT passed to Calla\u2019s', calla.length === 0);
    r = await send({ to: ['HIRER.route@example.invalid'], subject: 'Nested', html: 'x' }, { kind: 'signup' });
    t('a known address in a nested field (a hirer), any capitals, is fine', r.ok && r.via === 'churchhq', r);
    r = await send({ to: ['kid.route@example.invalid'], subject: 'Minor', html: 'x' }, { kind: 'signup' });
    t('an under-18 address is refused (never emailed), not passed to Calla\u2019s', r.ok === false && /under-18/.test(r.error) && calla.length === 0, r);
    const hour = new Date().toISOString().slice(0, 13);
    await db.collection('mailRouteHours').doc(hour).set({ recipients: 1999, hour });
    r = await send({ to: [OK, 'hirer.route@example.invalid'], subject: 'Cap', html: 'x' }, { kind: 'signup' });
    t('the hourly cap (2,000 recipients) refuses the one that would pass it', r.ok === false && /Hourly/.test(r.error) && calla.length === 0, r);
    await db.collection('mailRouteHours').doc(hour).delete();

    /* 6. Safeguarding: no body kept, either way. */
    await db.collection('churchSettings').doc('mailRoute').set({ kinds: ['team email'] });
    r = await send({ to: [OK], subject: 'Safeguarding', html: '<p>Private words</p>' }, { source: 'team-mail', kind: 'team email', outlineOnly: true });
    const sg = (await rows()).filter(x => x.subject === 'Safeguarding');
    t('a Safeguarding team email on the Resend path keeps no body', r.via === 'churchhq' && sg.length === 1 && sg[0].html === '' && !JSON.stringify(sg).includes('Private words'));
    t('but the email itself still had it', (resend[resend.length - 1] || {}).body && resend[resend.length - 1].body.html === '<p>Private words</p>');

    /* 7. On the emulator itself nothing is sent either way: listed is a
       Church HQ stub, unlisted a Calla stub. */
    const emu = PM.makeSender({ db, route: R });
    const a = await emu({ to: [OK], subject: 'Emu listed', html: 'x' }, { source: 'team-mail', kind: 'team email' });
    const z = await emu({ to: [OK], subject: 'Emu unlisted', html: 'x' }, { source: 'public-mail', kind: 'signup' });
    t('on the emulator: listed = Church HQ (stubbed), unlisted = Calla’s (stubbed)', a.via === 'churchhq' && a.stubbed && z.via === 'calla' && z.stubbed, { a, z });

    /* 8. The known list is Calla's. */
    const calla_ = 'C:/Users/marti/egbc-email/functions/index.js';
    if (fs.existsSync(calla_)) {
      const src = fs.readFileSync(calla_, 'utf8');
      const m = /const KNOWN_SOURCES = \[([\s\S]*?)\];/.exec(src);
      const theirs = m ? [...m[1].matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)].map(x => x[1] + '.' + x[2]).sort() : [];
      const ours = R.KNOWN_SOURCES.map(x => x[0] + '.' + x[1]).sort();
      t('the known-recipient list is the same as Calla\u2019s sendEmail\u2019s', JSON.stringify(theirs) === JSON.stringify(ours), { onlyCalla: theirs.filter(x => !ours.includes(x)), onlyHub: ours.filter(x => !theirs.includes(x)) });
    } else console.log('          (Calla\u2019s sendEmail is not on this machine: the list comparison is skipped)');
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
  ['mail-route.js', 'every kind counted as listed', "return list.some(x => x && (x === m.kind || x === m.source));", 'return true;', 'list empty: every kind goes to Calla'],
  ['mail-route.js', 'under-18 addresses let through', "if (want.some(a => minors.has(a))) return", "if (false) return", 'under-18 address is refused'],
  ['public-mail.js', 'Calla\u2019s protections switched off on the Resend path', "const refused = check.refused || (!(await route.reserve(db, row.to.length)) ? 'Hourly limit reached' : '');", "const refused = '';", 'unknown address is refused'],
  ['public-mail.js', 'no fallback when Resend fails', "      if (r.ok) return { ok: true, via: 'churchhq', stubbed: !!r.stubbed };", "      return { ok: r.ok, via: 'churchhq', stubbed: !!r.stubbed };", 'Resend failing'],
  ['public-mail.js', 'Safeguarding body kept on the Resend path', "await db.collection('emailOutbox').add({ ...row, via: 'churchhq', ok: r.ok,", "await db.collection('emailOutbox').add({ ...row, html: String(msg.html || ''), via: 'churchhq', ok: r.ok,", 'keeps no body']
];
for (const [file, what, from, to, expect] of BREAKS) {
  let red = [];
  try {
    const PM = file === 'public-mail.js' ? await loadCopy(file, from, to) : PM0;
    const RR = file === 'mail-route.js' ? await loadCopy(file, from, to) : R0;
    red = (await scenario(PM, RR)).filter(r => !r.v).map(r => r.n);
  } catch (e) { console.log('          ' + e.message); }
  const hit = red.some(n => n.includes(expect));
  R.push(hit);
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '' : '  - NOTHING CAUGHT IT'));
}
await clear();
const fails = R.filter(v => !v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' passed');
process.exit(fails ? 1 : 0);
