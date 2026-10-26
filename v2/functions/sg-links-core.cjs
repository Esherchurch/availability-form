/* READING A HOST'S REQUIREMENTS FROM THEIR WEB PAGES (F-280 10.6; S6).
   Newday, for one, has no single document: just help pages. This reads the
   pages a leader gives, safely, for Claude to turn into checklist questions,
   exactly as a file is (functions/sg-ai.js extractFromWeb).

   What it will and won't read:
     - https only, on the standard port, with no name or password in the address;
     - public addresses only: the name is looked up and anything private is
       refused (private, loopback, link-local - the cloud's own 169.254.169.254
       among them - shared, multicast, reserved, IPv6 local), and the
       connection is made to the address that was checked, so the name can't
       be switched to a private one between the check and the connection;
     - redirects are followed one at a time and each checked the same way, at
       most 3, never to plain http;
     - at most 2 MB a page, 20 pages, 45 seconds in all; web pages, plain text
       or PDF only;
     - from each address given, the links on that page to the same site, one
       level down and no further (a help-centre folder lists its articles);
     - scripts, styles, menus, headers and footers stripped: only the words.

   Pure: the lookup and the request are passed in (deps.lookup, deps.request),
   so the tests try every protection with no network at all. */
'use strict';
const net = require('node:net');

const LIMITS = { starts: 5, pages: 20, bytes: 2 * 1024 * 1024, ms: 45000, redirects: 3, textPerPage: 20000, textTotal: 120000 };

/* IPv4 and IPv6 addresses no reader of the public web should ever reach */
function privateIp(ip) {
  ip = String(ip || '').toLowerCase();
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    if (ip === '::' || ip === '::1') return true;
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip); if (m) return privateIp(m[1]);
    return /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip) || /^2001:db8/.test(ip) || /^64:ff9b/.test(ip);
  }
  return true;   /* not an address at all: refused */
}

/* an address we'll even try: https, the standard port, no name or password (testHosts: the emulator's stand-in only) */
function checkUrl(u, testHosts) {
  let x;
  try { x = new URL(String(u || '').trim()); } catch (e) { return { ok: false, why: 'not a web address' }; }
  const test = (testHosts || []).indexOf(x.host) >= 0;
  if (x.protocol !== 'https:' && !(test && x.protocol === 'http:')) return { ok: false, why: 'only https addresses are read' };
  if (x.username || x.password) return { ok: false, why: 'an address with a name or password in it is not read' };
  if (x.port && x.port !== '443' && !test) return { ok: false, why: 'only the standard web port is read' };
  x.hash = '';
  return { ok: true, url: x.toString(), host: x.hostname, test };
}

/* look the name up; every address it gives must be public (no mix: a name with any private address is refused) */
async function publicAddress(host, deps, test) {
  if (test) return { ok: true, address: host, family: 4 };
  if (net.isIP(host)) return privateIp(host) ? { ok: false, why: 'a private address is never read' } : { ok: true, address: host, family: net.isIP(host) };
  let all;
  try { all = await deps.lookup(host); } catch (e) { return { ok: false, why: 'the name could not be found' }; }
  if (!all || !all.length) return { ok: false, why: 'the name could not be found' };
  if (all.some((a) => privateIp(a.address))) return { ok: false, why: 'it points to a private address, which is never read' };
  return { ok: true, address: all[0].address, family: all[0].family };
}

const KINDS = /^(text\/html|application\/xhtml\+xml|text\/plain|application\/pdf)\b/i;
/* one page, following redirects one at a time, each checked */
async function safeGet(url, deps, left) {
  let u = url;
  for (let hop = 0; hop <= LIMITS.redirects; hop++) {
    const c = checkUrl(u, deps.testHosts);
    if (!c.ok) return { ok: false, url: u, why: c.why };
    const a = await publicAddress(c.host, deps, c.test);
    if (!a.ok) return { ok: false, url: u, why: a.why };
    if (left() <= 0) return { ok: false, url: u, why: 'out of time (45 seconds in all)' };
    let r;
    try { r = await deps.request({ url: c.url, address: a.address, family: a.family, maxBytes: LIMITS.bytes, timeoutMs: Math.min(left(), 20000) }); }
    catch (e) { return { ok: false, url: u, why: /too big/i.test(String(e && e.message)) ? 'bigger than 2 MB' : 'it could not be read' }; }
    if (r.status >= 300 && r.status < 400 && r.location) { u = new URL(r.location, c.url).toString(); continue; }
    if (r.status !== 200) return { ok: false, url: u, why: 'the site answered ' + r.status };
    if (!KINDS.test(String(r.type || ''))) return { ok: false, url: u, why: 'not a web page, plain text or a PDF' };
    if (r.body && r.body.length > LIMITS.bytes) return { ok: false, url: u, why: 'bigger than 2 MB' };
    return { ok: true, url: c.url, type: String(r.type).toLowerCase(), body: r.body };
  }
  return { ok: false, url, why: 'too many redirects (3 at most)' };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', pound: '£' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? (() => { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' '; })() : (ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m));
}
/* the words of a page: no scripts, styles, menus, headers, footers or forms */
function htmlToText(html) {
  let s = String(html || '');
  const title = decode(((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(s) || [])[1] || '').replace(/\s+/g, ' ').trim()).slice(0, 200);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe|template)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n').replace(/<\s*li\b[^>]*>/gi, '\n- ').replace(/<[^>]+>/g, ' ');
  s = decode(s).replace(/[ \t\f\v\r]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { title, text: s.slice(0, LIMITS.textPerPage) };
}
/* the links on a page to the same site (https), without fragments; not pictures, styles or scripts */
function linksOf(html, base) {
  const b = new URL(base), out = [];
  String(html || '').replace(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (m, q, d1, d2, d3) => {
    try { const x = new URL(decode(d1 || d2 || d3 || ''), b); x.hash = ''; if (x.host === b.host && x.protocol === b.protocol && !/\.(png|jpe?g|gif|svg|css|js|ico|zip|mp4|mp3|webp)$/i.test(x.pathname)) out.push(x.toString()); } catch (e) {}
    return m;
  });
  return out.filter((u, i, a) => a.indexOf(u) === i && u !== b.toString());
}

/* the pages: each address given, then the links on it to the same site, one level down; within the limits */
async function readPages(starts, deps) {
  const t0 = deps.now ? deps.now() : Date.now(), left = () => LIMITS.ms - ((deps.now ? deps.now() : Date.now()) - t0);
  const pages = [], refused = [], seen = new Set();
  const given = (starts || []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, LIMITS.starts);
  const queue = given.map((u) => ({ url: u, depth: 0 }));
  let total = 0;
  while (queue.length && pages.length < LIMITS.pages) {
    const { url, depth } = queue.shift();
    if (seen.has(url)) continue; seen.add(url);
    if (left() <= 0) { refused.push({ url, why: 'out of time (45 seconds in all)' }); continue; }
    const g = await safeGet(url, deps, left);
    if (!g.ok) { refused.push({ url: g.url || url, why: g.why }); continue; }
    if (/pdf/.test(g.type)) { pages.push({ url: g.url, title: '', kind: 'pdf', pdf: g.body }); continue; }
    const html = g.body.toString('utf8');
    const t = /html/.test(g.type) ? htmlToText(html) : { title: '', text: html.replace(/\s+\n/g, '\n').slice(0, LIMITS.textPerPage) };
    const text = t.text.slice(0, Math.max(0, LIMITS.textTotal - total)); total += text.length;
    pages.push({ url: g.url, title: t.title, kind: 'text', text });
    if (depth === 0 && /html/.test(g.type)) linksOf(html, g.url).forEach((l) => queue.push({ url: l, depth: 1 }));
  }
  queue.filter((x) => !seen.has(x.url)).slice(0, 5).forEach((x) => refused.push({ url: x.url, why: 'beyond the 20 pages read' }));
  return { pages, refused };
}

module.exports = { LIMITS, privateIp, checkUrl, publicAddress, safeGet, htmlToText, linksOf, readPages };
