/* CHURCH HQ'S OWN ADDRESS: <slug>.churchhq.co.uk (Martin, 26 Oct 2026).
 *
 * A Cloudflare Worker that serves v2 - and only v2 - under Church HQ's
 * address. egbc.churchhq.co.uk/<path> is fetched from
 * https://esherchurch.github.io/availability-form/v2/<path> and passed on
 * as it is: status, headers and body. "/" is v2's own start page, as
 * github.io/.../v2/ is.
 *
 * WHAT IT NEVER DOES: reach the original site. Every path is put under
 * /availability-form/v2/; "..", encoded slashes and the like are refused
 * before anything is fetched. It is not a GitHub Pages custom domain (that
 * would move the whole repo, the original site with it), and github.io
 * keeps working exactly as before.
 *
 * SIGN-IN: /__/auth/* and /__/firebase/* go to the church's Firebase auth
 * domain (egbc-worship-planner.firebaseapp.com), so sign-in runs on this
 * address (egbc-auth.js sets authDomain to it here). That is Firebase's own
 * advice for a site whose address is not firebaseapp.com.
 *
 * ANY CHURCH, LATER: the first part of the hostname is the church's short
 * name (its slug; functions/hub-address.js). Every church is the same v2;
 * the church comes from the person's sign-in. For now only "egbc" is
 * served: SITES below. When more churches go live, a slug is looked up in
 * the SLUGS key-value namespace (bound in wrangler.toml) and served the
 * same way. Anything else gets a plain "no church here".
 *
 * env (all optional; for the local check, tests/check-worker.mjs):
 *   UPSTREAM   the v2 site to fetch from   (default github.io/.../v2)
 *   AUTH       the Firebase auth domain    (default firebaseapp.com)
 *   SLUG       treat every request as this church (a local test has no
 *              churchhq.co.uk hostname)
 *   SLUGS      KV: slug -> church id, for churches after EGBC
 */
const UPSTREAM = 'https://esherchurch.github.io/availability-form/v2';
const AUTH = 'https://egbc-worship-planner.firebaseapp.com';
const DOMAIN = 'churchhq.co.uk';
/* The churches this address serves, by slug. EGBC first; others by SLUGS. */
const SITES = { egbc: { church: 'egbc' } };

export function slugOf(hostname, env) {
  if (env && env.SLUG) return String(env.SLUG);
  const h = String(hostname || '').toLowerCase();
  if (!h.endsWith('.' + DOMAIN)) return '';
  const s = h.slice(0, -(DOMAIN.length + 1));
  return /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,39}$/.test(s) ? s : '';
}

async function siteFor(slug, env) {
  if (SITES[slug]) return SITES[slug];
  if (env && env.SLUGS && typeof env.SLUGS.get === 'function') {
    const church = await env.SLUGS.get(slug);
    if (church) return { church };
  }
  return null;
}

/* The path under v2, or null if it is not one. Decoded once, so "%2e%2e"
   and "%2f" are seen for what they are. */
export function v2Path(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { return null; }
  if (!p.startsWith('/') || p.includes('\\') || p.includes('\0')) return null;
  if (p.split('/').some((seg) => seg === '..' || seg === '.')) return null;
  return pathname; /* still encoded, exactly as asked */
}

const plain = (status, words) => new Response(words, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const slug = slugOf(url.hostname, env);
    const site = slug ? await siteFor(slug, env) : null;
    if (!site) return plain(404, 'There is no church at this address.');

    const up = (env && env.UPSTREAM) || UPSTREAM;
    const auth = (env && env.AUTH) || AUTH;

    /* Sign-in: passed through whole, any method, to the auth domain. */
    if (url.pathname.startsWith('/__/auth/') || url.pathname.startsWith('/__/firebase/')) {
      const target = auth + url.pathname + url.search;
      return fetch(new Request(target, request));
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') return plain(405, 'Pages are read only here.');
    const p = v2Path(url.pathname);
    if (p === null) return plain(400, 'That is not a page of the hub.');

    const res = await fetch(up + p + url.search, { method: request.method, headers: { accept: request.headers.get('accept') || '*/*' }, redirect: 'manual' });
    /* GitHub's own redirects (a folder without its "/") point at github.io:
       keep the person on this address. */
    const headers = new Headers(res.headers);
    const loc = headers.get('location');
    if (loc) {
      const upBase = new URL(up + '/');
      const to = new URL(loc, up + p);
      if (to.origin === upBase.origin && to.pathname.startsWith(upBase.pathname)) {
        headers.set('location', url.origin + '/' + to.pathname.slice(upBase.pathname.length) + to.search);
      }
    }
    /* github.io's own access headers name github.io; this address is its own. */
    headers.delete('access-control-allow-origin');
    headers.set('x-churchhq-church', site.church);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
};
