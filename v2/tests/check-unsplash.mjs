/* Pictures from Unsplash (functions/unsplash.js), against an emulator of
 * your own and a pretend Unsplash: nothing leaves the machine.
 *
 *   node tests/check-unsplash.mjs        (from v2/)
 *
 * Uses the Firestore emulator in firebase.comms.json (it clears the
 * unsplashCache collection). Asks: the key goes only in the header, never
 * a page; a search's pictures come back hotlinked (images.unsplash.com,
 * ixid kept) with the photographer's name and links carrying
 * utm_source=church_hq&utm_medium=referral; the same search, however
 * typed, costs nothing twice; Demo mode's 50 an hour is never passed (45,
 * five spare), the last saved answer served when the hour is used up;
 * Unsplash's own "remaining" believed; a used picture's download ping goes
 * to its download_location, or waits and goes with the next call; only an
 * Unsplash download address is pinged.
 *
 * DELIBERATE BREAKS: each loads a copy of unsplash.js with one line changed
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
  const src = fs.readFileSync(path.join(V2, 'functions', 'unsplash.js'), 'utf8').replace(/\r\n/g, '\n');
  if (from && !src.includes(from)) throw new Error('the line to break is not in functions/unsplash.js any more - update the break');
  const tmp = path.join(V2, 'functions', '.check-' + process.pid + '-unsplash.js');
  fs.writeFileSync(tmp, from ? src.replace(from, to) : src);
  try { return await import(pathToFileURL(tmp).href + '?' + Date.now() + Math.random()); } finally { fs.unlinkSync(tmp); }
}
const KEY = 'synthetic-access-key';
const T0 = Date.parse('2026-10-22T10:05:00Z');

/* The pretend Unsplash: answers as the real one does, and writes down
   every call. remaining: what its X-Ratelimit-Remaining says. */
function fakeUnsplash() {
  const F = { calls: [], remaining: 50, down: false };
  const photo = (i, q) => ({
    id: 'ph' + i, width: 4000, height: 3000, color: '#a0b0c0', alt_description: q + ' ' + i, description: null,
    urls: { raw: 'https://images.unsplash.com/photo-' + i + '?ixid=SYN' + i, thumb: 'https://images.unsplash.com/photo-' + i + '?ixid=SYN' + i + '&w=200', small: 'https://images.unsplash.com/photo-' + i + '?ixid=SYN' + i + '&w=400', regular: 'https://images.unsplash.com/photo-' + i + '?ixid=SYN' + i + '&w=1080' },
    links: { html: 'https://unsplash.com/photos/ph' + i, download_location: 'https://api.unsplash.com/photos/ph' + i + '/download?ixid=SYN' + i },
    user: { name: 'Sam Synthetic ' + i, username: 'samsyn' + i, links: { html: 'https://unsplash.com/@samsyn' + i } }
  });
  F.fetch = async (url, opts) => {
    F.calls.push({ url, auth: ((opts || {}).headers || {}).Authorization });
    const h = new Map([['x-ratelimit-remaining', String(F.remaining)]]);
    const res = (status, body) => ({ ok: status < 300, status, headers: { get: k => h.get(k.toLowerCase()) }, json: async () => body });
    if (F.down) return res(503, {});
    if (((opts || {}).headers || {}).Authorization !== 'Client-ID ' + KEY) return res(401, { errors: ['OAuth error'] });
    F.remaining = Math.max(0, F.remaining - 1);
    if (url.startsWith('https://api.unsplash.com/search/photos?')) {
      const q = new URL(url).searchParams.get('query');
      return res(200, { total: 3, total_pages: 1, results: [photo(1, q), photo(2, q), Object.assign(photo(3, q), { urls: { regular: 'https://evil.invalid/x.jpg' } })] });
    }
    if (/^https:\/\/api\.unsplash\.com\/photos\/ph\d+\/download/.test(url)) return res(200, { url: 'https://images.unsplash.com/x' });
    return res(404, {});
  };
  return F;
}

async function scenario(U) {
  const out = [];
  const t = (n, v, x) => out.push({ n, v: !!v, x });
  for (const d of (await db.collection('unsplashCache').get()).docs) await d.ref.delete();
  let F = fakeUnsplash();
  const S = (data, now = T0) => U.runSearch({ db, fetch: F.fetch, key: KEY, data, now });
  const used = (data, now = T0) => U.runUsed({ db, fetch: F.fetch, key: KEY, data, now });

  let threw = '';
  try { await U.runSearch({ db, fetch: F.fetch, key: '', data: { q: 'church' } }); } catch (e) { threw = e.message; }
  t('no key set: it says so, and nothing goes to Unsplash', /key/.test(threw) && F.calls.length === 0, threw);

  const r = await S({ q: 'Autumn leaves', shape: 'landscape' });
  const call = F.calls[0] || {};
  t('a search goes to Unsplash with the key in the header, never in the address', call.auth === 'Client-ID ' + KEY && !call.url.includes(KEY) && /query=autumn%20leaves/.test(call.url) && /orientation=landscape/.test(call.url) && /content_filter=high/.test(call.url), call);
  const p = r.photos[0] || {};
  t('pictures come back hotlinked from Unsplash, its ixid kept', p.regular === 'https://images.unsplash.com/photo-1?ixid=SYN1&w=1080' && p.thumb.startsWith('https://images.unsplash.com/'), p);
  t('a picture from anywhere else is dropped', r.photos.length === 2 && !JSON.stringify(r).includes('evil.invalid'), r.photos.map(x => x.regular));
  t('the photographer, with UTM links (utm_source=church_hq&utm_medium=referral)', p.name === 'Sam Synthetic 1' && p.profile === 'https://unsplash.com/@samsyn1?utm_source=church_hq&utm_medium=referral' && p.unsplash === 'https://unsplash.com/?utm_source=church_hq&utm_medium=referral', [p.profile, p.unsplash]);
  t('the credit reads "Photo by <name> on Unsplash"', /^Photo by <a href="https:\/\/unsplash\.com\/@samsyn1\?utm_source=church_hq&amp;utm_medium=referral">Sam Synthetic 1<\/a> on <a href="https:\/\/unsplash\.com\/\?utm_source=church_hq&amp;utm_medium=referral">Unsplash<\/a>$/.test(U.creditHtml(p)), U.creditHtml(p));
  t('nothing of the key reaches the page', !JSON.stringify(r).includes(KEY));

  const n1 = F.calls.length;
  const again = await S({ q: '  autumn   LEAVES! ', shape: 'landscape' }, T0 + 3600000 * 5);
  t('the same search, however typed, the same day: kept, not asked again', F.calls.length === n1 && again.kept === true && again.photos.length === 2);
  await S({ q: 'autumn leaves', shape: 'landscape' }, T0 + 25 * 3600000);
  t('a day later it is asked again', F.calls.length === n1 + 1);

  /* The hour: 45 calls and no more. */
  for (const d of (await db.collection('unsplashCache').get()).docs) await d.ref.delete();
  F = fakeUnsplash();
  for (let i = 0; i < 50; i++) await S({ q: 'word ' + i });
  t('Demo mode: no more than 45 calls in an hour (5 kept spare)', F.calls.length === 45, F.calls.length);
  const busy = await S({ q: 'word 49' });
  t('past that, a new search says when to try again', busy.busy === true && busy.again === '11:00' && busy.photos.length === 0, busy);
  const k3 = U.searchKey('word 3', 1, '').id;
  await db.collection('unsplashCache').doc(k3).update({ at: T0 - 30 * 3600000 });
  const old = await S({ q: 'word 3' });
  t('…and an old search, though out of date, is still answered from what was kept', F.calls.length === 45 && old.stale === true && old.photos.length === 2, [F.calls.length, old.stale]);
  F.calls.length = 0;
  for (const d of (await db.collection('unsplashCache').get()).docs) await d.ref.delete();
  F.remaining = 6;
  await S({ q: 'first' }); await S({ q: 'second' }); await S({ q: 'third' });
  t('Unsplash’s own "remaining" is believed when lower', F.calls.length === 2, F.calls.length);

  /* The download ping. */
  for (const d of (await db.collection('unsplashCache').get()).docs) await d.ref.delete();
  F = fakeUnsplash();
  const u1 = await used({ downloadLocation: p.downloadLocation });
  t('a used picture: its download_location is called, with the key', u1.pinged === true && F.calls.length === 1 && F.calls[0].url === 'https://api.unsplash.com/photos/ph1/download?ixid=SYN1' && F.calls[0].auth === 'Client-ID ' + KEY, F.calls);
  let bad = '';
  try { await used({ downloadLocation: 'https://evil.invalid/photos/x/download' }); } catch (e) { bad = e.message; }
  t('only an Unsplash download address is ever called', /Unsplash/.test(bad) && F.calls.length === 1, bad);
  F.down = true;
  const u2 = await used({ downloadLocation: 'https://api.unsplash.com/photos/ph2/download?ixid=SYN2' });
  t('Unsplash not answering: the ping waits', u2.queued === true && (((await db.collection('unsplashCache').doc('_pings').get()).data() || {}).list || []).length === 1);
  F.down = false; F.calls.length = 0;
  await S({ q: 'harvest' });
  t('…and goes with the next call', F.calls.some(c => /ph2\/download/.test(c.url)) && (((await db.collection('unsplashCache').doc('_pings').get()).data() || {}).list || []).length === 0, F.calls.map(c => c.url));
  return out;
}

const R = [];
(await scenario(await loadCopy())).forEach(r => { R.push(r.v); console.log('  ' + (r.v ? 'PASS  ' : 'FAIL  ') + r.n + (r.v || r.x === undefined ? '' : '\n          ' + JSON.stringify(r.x).slice(0, 300))); });
console.log('-- deliberate breaks --');
const BREAKS = [
  ['no cache', "if (kept && now - (+kept.at || 0) < KEEP_MS) return", 'if (false) return', 'not asked again'],
  ['no hourly limit', 'if (used + n > HOUR_LIMIT) return false;', '', 'no more than 45'],
  ['the UTM tags left off', "return /^https:\\/\\/unsplash\\.com\\//.test(s) ? s + (s.includes('?') ? '&' : '?') + UTM : '';", 'return s;', 'UTM links'],
  ['pictures from anywhere', "const okImage = u => /^https:\\/\\/images\\.unsplash\\.com\\//.test(String(u || '')) ? String(u) : '';", 'const okImage = u => String(u || \'\');', 'from anywhere else'],
  ['a failed ping forgotten', '    if (!r.ok) return queue();', '', 'the ping waits']
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
