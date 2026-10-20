/* The social posts' morning reminder (functions/social.js; FINDINGS-comms
 * plan H, step 1), against an emulator of your own.
 *
 *   node tests/check-social.mjs        (from v2/)
 *
 * Uses the Firestore emulator in firebase.comms.json (it clears it), with a
 * pretend sender that writes down what it was given: nothing leaves the
 * machine. Asks: nothing when the card maker is switched off, when there
 * is nothing to post, or when nobody asked; one email to each person who
 * asked - only if they are the church office, never an under-18 - listing
 * today's posts (not ones already posted) and the verse of the day.
 *
 * DELIBERATE BREAKS: each loads a copy of social.js with one line changed
 * and must turn a named check red.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:' + C1.emulators.firestore.port;
process.env.GCLOUD_PROJECT = 'egbc-worship-planner';
const { initializeApp } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'app', 'index.js')).href);
const { getFirestore } = await import(pathToFileURL(path.join(V2, 'functions', 'node_modules', 'firebase-admin', 'lib', 'firestore', 'index.js')).href);
initializeApp({ projectId: 'egbc-worship-planner' });
const db = getFirestore();

async function loadCopy(from, to) {
  const src = fs.readFileSync(path.join(V2, 'functions', 'social.js'), 'utf8');
  if (from && !src.includes(from)) throw new Error('the line to break is not in functions/social.js any more - update the break');
  const tmp = path.join(V2, 'functions', '.check-' + process.pid + '-social.js');
  fs.writeFileSync(tmp, from ? src.replace(from, to) : src);
  try { return await import(pathToFileURL(tmp).href + '?' + Date.now() + Math.random()); } finally { fs.unlinkSync(tmp); }
}
const NOW = new Date('2026-10-22T06:00:00Z');   /* 7am in London */
const DAY = '2026-10-22';

async function scenario(S) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  for (const c of ['socialPosts', 'socialSettings', 'users', 'addressBook', 'churchSettings']) for (const d of (await db.collection(c).get()).docs) await d.ref.delete();
  await db.collection('churchSettings').doc('details').set({ name: 'Synthetic Green Church', enquiryEmail: 'office@example.invalid' });
  await db.collection('users').doc('u_off').set({ email: 'office.social@example.invalid', name: 'Olive Synthetic', status: 'active', teams: ['Church office'] });
  await db.collection('users').doc('u_mem').set({ email: 'member.social@example.invalid', name: 'Mo Synthetic', status: 'active', teams: ['Welcome team'] });
  await db.collection('users').doc('u_kid').set({ email: 'teen.social@example.invalid', name: 'Teen Synthetic', status: 'active', teams: ['Church office'] });
  await db.collection('addressBook').doc('ab_kid').set({ email: 'teen.social@example.invalid', under18: true });
  const got = [];
  const send = async (m, meta) => { got.push(Object.assign({}, m, { meta })); return { ok: true }; };

  await db.collection('churchSettings').doc('features').set({ cardMaker: false });
  let r = await S.runSocialMorning({ db, send, now: NOW });
  t('switched off: nothing', r.off === true && got.length === 0, r);
  await db.collection('churchSettings').doc('features').set({ cardMaker: true });
  await db.collection('socialSettings').doc('main').set({ remind: ['u_off', 'u_mem', 'u_kid'], vod: { on: false } });
  r = await S.runSocialMorning({ db, send, now: NOW });
  t('nothing to post today: no email', got.length === 0, r);
  await db.collection('socialPosts').doc('a').set({ date: DAY, kind: 'countdown', title: 'Synthetic film club', opening: 'TOMORROW!', status: 'ready', caption: 'x' });
  await db.collection('socialPosts').doc('b').set({ date: DAY, kind: 'countdown', title: 'Synthetic quiz night', opening: '2 days to go!', status: 'posted', caption: 'x' });
  await db.collection('socialPosts').doc('c').set({ date: '2026-10-23', kind: 'countdown', title: 'Synthetic tomorrow thing', status: 'ready', caption: 'x' });
  r = await S.runSocialMorning({ db, send, now: NOW });
  const to = got.map(g => g.to[0]);
  t('a post today: one email to the office person who asked', to.length === 1 && to[0] === 'office.social@example.invalid', to);
  t('never to someone who asked but is not the office', !to.includes('member.social@example.invalid'));
  t('never to an under-18, even on the office team', !to.includes('teen.social@example.invalid'));
  const html = (got[0] || {}).html || '';
  t('it lists today’s post, not one already posted or tomorrow’s', /Synthetic film club/.test(html) && !/quiz night/.test(html) && !/tomorrow thing/.test(html), html.slice(0, 300));
  t('it links to the card maker, says how to stop it, and goes by the hub’s ordinary email path', /cardmaker\.html/.test(html) && /Untick/.test(html) && (got[0] || {}).meta.kind === 'social reminder');
  got.length = 0;
  await db.collection('socialPosts').doc('a').set({ status: 'posted' }, { merge: true });
  await db.collection('socialSettings').doc('main').set({ remind: ['u_off'], vod: { on: true } });
  r = await S.runSocialMorning({ db, send, now: NOW });
  t('the verse of the day, when it is on, counts as a post', got.length === 1 && /Verse of the day/.test(got[0].html), got.map(g => g.subject));
  got.length = 0;
  await db.collection('socialSettings').doc('main').set({ remind: ['u_off'], vod: { on: true }, vodDone: DAY });
  r = await S.runSocialMorning({ db, send, now: NOW });
  t('once posted today, the verse is not sent again', got.length === 0, r);
  await db.collection('socialSettings').doc('main').set({ remind: [], vod: { on: true } });
  r = await S.runSocialMorning({ db, send, now: NOW });
  t('nobody asked: nobody is reminded', got.length === 0, r);
  return out;
}

const R = [];
(await scenario(await loadCopy())).forEach(r => { R.push(r.v); console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))); });
console.log('-- deliberate breaks --');
const BREAKS = [
  ['anyone who asked is reminded', "if (!office || !email || minors.has(email)) continue;", 'if (!email) continue;', 'not the office'],
  ['an email with nothing to post', "if (!items.length || !who.length) return", 'if (!who.length) return', 'nothing to post'],
  ['posted posts counted again', ".filter(p => p.status !== 'posted')", '', 'not one already posted']
];
for (const [what, from, to, expect] of BREAKS) {
  let red = [];
  try { red = (await scenario(await loadCopy(from, to))).filter(r => !r.v).map(r => r.n); } catch (e) { red = ['(threw) ' + e.message]; }
  const hit = red.some(n => n.includes(expect));
  R.push(hit);
  console.log('  ' + (hit ? 'PASS  ' : 'FAIL  ') + 'break caught: ' + what + (hit ? '' : '  - NOTHING CAUGHT IT ' + JSON.stringify(red)));
}
const fails = R.filter(v => !v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' passed');
process.exit(fails ? 1 : 0);
