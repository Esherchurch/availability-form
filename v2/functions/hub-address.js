/* THE HUB'S ADDRESS IS MADE, NEVER TYPED (Martin, 26 Oct 2026: "Are we not
 * generating that?").
 *
 * At new-church setup the church chooses a short name, its slug: lowercase
 * letters, numbers and hyphens, unique across Church HQ (hqSlugs/{slug}),
 * checked as they type (hqSlugCheck). Its address is then
 *
 *     https://<slug>.churchhq.co.uk/
 *
 * hqChurches/{cid}.slug holds it; a church with none yet uses its id, which
 * has the same shape. Only Church HQ staff change a slug
 * (tools/hq-set-slug.mjs), because it changes every link the church has
 * sent. No page writes any of this (firestore.rules: hqChurches and hqSlugs
 * are the server's).
 *
 * EGBC (the top level, no church id) keeps today's address until the
 * churchhq.co.uk domain is live - Martin's later step (DNS, Cloudflare,
 * authorised domains). EGBC_HUB below is the one place it is said:
 * switching EGBC is changing that line.
 *
 * So hubUrl() always has an address for a church that is set up, and pages
 * ask the server for it (hubAddress) rather than keeping a copy.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { churchOf } from './church-scope.js';

const REGION = 'europe-west2';
export const HUB_DOMAIN = 'churchhq.co.uk';
/* EGBC's address until it moves to churchhq.co.uk. The one place. */
export const EGBC_HUB = 'https://egbc.churchhq.co.uk/';

/* 3 to 40 characters: lowercase letters, numbers and single hyphens, not
   at either end. A slug is a web address's first part, so nothing else. */
const SLUG = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/;
/* Names Church HQ keeps for itself. */
export const RESERVED = ['www', 'app', 'api', 'admin', 'mail', 'email', 'smtp', 'hq', 'churchhq', 'help', 'support', 'status',
  'staff', 'login', 'signin', 'auth', 'billing', 'docs', 'blog', 'static', 'cdn', 'assets', 'test', 'demo'];

/* '' when the slug will do; otherwise what is wrong, in words. */
export function slugProblem(slug) {
  const s = String(slug == null ? '' : slug);
  if (!s) return 'Choose a short name.';
  if (s.length < 3) return 'At least 3 letters or numbers.';
  if (s.length > 40) return 'At most 40 characters.';
  if (/[A-Z]/.test(s)) return 'Lowercase letters only.';
  if (!/^[a-z0-9-]+$/.test(s)) return 'Only letters, numbers and hyphens (no spaces).';
  if (/^-|-$/.test(s)) return 'It can’t start or end with a hyphen.';
  if (/--/.test(s)) return 'One hyphen at a time.';
  if (!SLUG.test(s)) return 'Only letters, numbers and hyphens.';
  if (RESERVED.includes(s)) return 'That name is kept for Church HQ itself.';
  return '';
}

/* A church's name as a first suggestion: "St Aidan's with St Hild,
   Testbury" -> "st-aidans-with-st-hild-testbury". */
export function suggestSlug(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

export const addressFor = (slug) => 'https://' + slug + '.' + HUB_DOMAIN + '/';

/* The address for this db: a church's from its directory entry, EGBC's
   otherwise. hq is the whole database (scopedDb's .hq). */
export async function hubAddressOf(db) {
  const cid = db && db.churchId;
  if (!cid) return { url: EGBC_HUB, slug: '', egbc: true };
  const hq = db.hq || db;
  let slug = cid;
  try {
    const s = await hq.collection('hqChurches').doc(cid).get();
    const d = s.exists ? s.data() || {} : {};
    if (d.slug && !slugProblem(d.slug)) slug = d.slug;
  } catch (e) { /* the id is a complete answer */ }
  return { url: addressFor(slug), slug, egbc: false };
}

/* Is this short name free? For setup, as they type. Anyone signed in may
   ask (a church being set up has no claim yet); it says only yes or no. */
export async function slugCheck(db, slug, mine) {
  const problem = slugProblem(slug);
  if (problem) return { ok: false, problem };
  const s = await db.collection('hqSlugs').doc(slug).get();
  if (s.exists && (s.data() || {}).churchId !== mine) return { ok: false, problem: 'Another church has that name. Try adding the town.' };
  return { ok: true, problem: '', address: addressFor(slug) };
}

export const hubAddress = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, getFirestore());
  const a = await hubAddressOf(ch.db);
  return { url: a.url, slug: a.slug, changedBy: 'Church HQ staff' };
});

export const hqSlugCheck = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const slug = String((req.data && req.data.slug) || '').slice(0, 60);
  return slugCheck(getFirestore(), slug, null);
});
