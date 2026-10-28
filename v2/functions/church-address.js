/* WHICH CHURCH A PUBLIC REQUEST IS FOR: its web address (H-6 step 4; the
 * events window).
 *
 * Each church is at <slug>.churchhq.co.uk. A public page there (What's on,
 * hiring a room, a booking's own page) is that church's, with nobody signed
 * in, so a public function those pages call takes its church from the
 * address the request came from - the Origin, or the Referer when there is
 * no Origin - looked up in Church HQ's directory (hqSlugs/<slug>.churchId).
 * Never from a church id in the request: that would let anybody's page ask
 * for any church's data.
 *
 * A calendar app fetching a feed sends neither, so a feed names the slug in
 * its own link (?site=<slug>): the same public fact the hostname is, and
 * checked the same way.
 *
 * EGBC's own address, github.io, a local test, or no address at all: EGBC's
 * top-level data, exactly as before. A church address nobody has: null, and
 * the function refuses. (enews.js's dbForSite is the same rule, for Origin
 * only; Comms may move onto this.)
 */
import { scopedDb } from './church-scope.js';
import { validChurchId } from './hq-directory.js';

const NOT_CHURCH = ['egbc', 'www', 'account', 'hub', 'hq', 'app'];
const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;

/* 'st-aidans' from https://st-aidans.churchhq.co.uk/..., or '' */
export function slugOfAddress(address) {
  let host = '';
  try { host = new URL(String(address || '')).hostname.toLowerCase(); } catch (e) { return ''; }
  const m = /^([a-z0-9][a-z0-9-]{0,40})\.churchhq\.co\.uk$/.exec(host);
  return m && !NOT_CHURCH.includes(m[1]) ? m[1] : '';
}

/* The church id a slug names, '' for none asked, null for one nobody has. */
export async function churchForSlug(root, slug) {
  if (!slug) return '';
  if (!SLUG.test(String(slug)) || NOT_CHURCH.includes(slug)) return null;
  const s = await root.collection('hqSlugs').doc(String(slug)).get();
  const id = s.exists ? String((s.data() || {}).churchId || '') : '';
  return id && validChurchId(id) ? id : null;
}

/* The db for a slug: EGBC's when none, the church's, or null. */
export async function dbForSlug(root, slug) {
  const id = await churchForSlug(root, slug);
  return id === null ? null : scopedDb(root, id || null);
}

/* The db for a public request, from where it came from. */
export async function dbForAddress(root, req) {
  const get = (h) => String((req && req.get ? req.get(h) : (req && req.headers && req.headers[h.toLowerCase()])) || '');
  return dbForSlug(root, slugOfAddress(get('origin') || get('referer')));
}
