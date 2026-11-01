/* MOVING FILE STORAGE TO THE UK (GOING-LIVE item 3; the plan is
 * docs/STORAGE-MOVE.md). Each step is a DRY RUN unless --apply is given, and
 * safe to run again and again. NOTHING IS EVER DELETED from either bucket,
 * and no file's download token is ever added or changed.
 *
 *   copy   --to <new>           every file the new bucket hasn't got (or has a
 *                               different copy of), with its metadata, so its
 *                               download token - every link - works there.
 *   tokens                      BEFORE THE DAY: stored links to the old bucket
 *                               whose token isn't one of the file's current
 *                               tokens are pointed at its current token. The
 *                               bucket is unchanged, so it is safe for the
 *                               original site.
 *   links  --to <new>           every stored download link naming the old
 *                               bucket - top level and churches/<id>/..., any
 *                               field, any depth - moved to the new one, its
 *                               token repaired the same way. 0 left = done.
 *   links  --to <new> --reverse back from the new bucket to the old (see the
 *                               plan: only with the old rules put back).
 *   check  --to <new> [--count N]  READ ONLY: opens a sample of stored links
 *                               from the new bucket and says which fail.
 *   switch --to <new>           (from v2/) the code: storageBucket in
 *                               egbc-auth.js and egbc-db.js, the functions'
 *                               initializeApp, the converter, firebase.json.
 *
 * Run copy, tokens, links and check from v2/functions (firebase-admin is
 * there), with Application Default Credentials. Options: --from <old bucket>
 * (default egbc-worship-planner.firebasestorage.app), --project <id>.
 * Importing this file runs nothing: only running it does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..');
const DEFAULT_FROM = 'egbc-worship-planner.firebasestorage.app';
const BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;
const say = (s) => console.log(s);

/* ---- download links -------------------------------------------------- */
/* A Firebase download link; and the two plain forms, which carry no token. */
const START = 'https://firebasestorage.googleapis.com/v0/b/';
const WHOLE = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([a-z0-9][a-z0-9._-]+[a-z0-9])\/o\/([^?#]+)(\?[^#]*)?$/;
const PLAIN = /(storage\.googleapis\.com\/|gs:\/\/)([a-z0-9][a-z0-9._-]+[a-z0-9])(?=\/)/g;

/**
 * Where the download links are in a stored string. A field that IS a link
 * (nothing but the link) is taken whole: stored links keep apostrophes
 * unencoded ("the-father's-house"). Inside longer text, a link runs to what
 * closes it: the quote that opened an HTML attribute, the bracket of a
 * CSS url(), or else a space or "<" - so an apostrophe in the link is kept,
 * and the quote closing the attribute is not swallowed.
 * @param {string} s @returns {{ start: number, end: number, link: string }[]}
 */
export function findLinks(s) {
  if (s.startsWith(START) && !/\s/.test(s)) return [{ start: 0, end: s.length, link: s }];
  const out = [];
  for (let i = s.indexOf(START); i !== -1; i = s.indexOf(START, i + 1)) {
    const before = s[i - 1];
    const stop = before === '"' ? /"/ : before === "'" ? /'/ : before === '(' ? /\)/ : /[\s<>"]/;
    const rest = s.slice(i), m = stop.exec(rest);
    let end = i + (m ? m.index : rest.length);
    /* Plain text: a full stop or comma after the link is the sentence's. */
    if (!/["'(]/.test(before || '')) while (end > i && /[.,;:!?]/.test(s[end - 1])) end--;
    out.push({ start: i, end, link: s.slice(i, end) });
  }
  return out;
}

/**
 * The parts of a COMPLETE Firebase download link (the whole string must be
 * one), or null - so a link is only ever rebuilt from all of itself.
 * @param {string} link @returns {{ bucket: string, path: string, token: string, query: URLSearchParams, amp: boolean }|null}
 */
export function parseLink(link) {
  const m = WHOLE.exec(link);
  if (!m) return null;
  let p;
  try { p = decodeURIComponent(m[2]); } catch (e) { return null; }
  /* In HTML a link's "&" is written "&amp;"; it is read as "&" and written back as it was. */
  const raw = (m[3] || '').slice(1), amp = raw.includes('&amp;');
  const query = new URLSearchParams(amp ? raw.replace(/&amp;/g, '&') : raw);
  return { bucket: m[1], path: p, token: query.get('token') || '', query, amp };
}

/** A Firebase download link for a bucket, path and query (HTML "&amp;" kept). */
function buildLink(bucket, p, query, amp) {
  const q = query.toString();
  return START + bucket + '/o/' + encodeURIComponent(p) + (q ? '?' + (amp ? q.replace(/&/g, '&amp;') : q) : '');
}

/* A string with each link passed through map (a Map of link -> new link). */
function replaceLinks(s, map) {
  let out = '', at = 0;
  for (const f of findLinks(s)) { out += s.slice(at, f.start) + (map.get(f.link) || f.link); at = f.end; }
  return out + s.slice(at);
}

/* Every string inside a Firestore value. */
function strings(v, out) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object' && v.constructor === Object) Object.values(v).forEach((x) => strings(x, out));
  return out;
}
/* A value with each string passed through fix(). */
function mapStrings(v, fix) {
  if (typeof v === 'string') return fix(v);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, fix));
  if (v && typeof v === 'object' && v.constructor === Object) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, fix)]));
  return v;
}

/* ---- the tool --------------------------------------------------------- */
async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const STEP = args[0], APPLY = args.includes('--apply'), REVERSE = args.includes('--reverse');
  const PROJECT = opt('--project') || process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
  const FROM = opt('--from') || DEFAULT_FROM, TO = opt('--to');
  const needsTo = STEP !== 'tokens';
  if (!['copy', 'tokens', 'links', 'check', 'switch'].includes(STEP) || (needsTo && (!TO || !BUCKET_NAME.test(TO) || TO === FROM))) {
    console.error('Usage: node ../tools/storage-move.mjs copy|tokens|links|check|switch [--to <new bucket>] [--from <old>] [--reverse] [--apply]');
    process.exit(2);
  }
  /* Which bucket links leave, and which they go to. tokens: they stay. */
  const LEAVE = STEP === 'tokens' ? FROM : REVERSE ? TO : FROM;
  const GOTO = STEP === 'tokens' ? FROM : REVERSE ? FROM : TO;
  say((APPLY ? 'APPLYING' : 'DRY RUN (nothing changes; add --apply)') + ': ' + STEP
    + (STEP === 'tokens' ? ', links to ' + FROM : ', ' + LEAVE + ' -> ' + GOTO));

  if (STEP === 'switch') return switchCode(FROM, TO, APPLY);

  const req = createRequire(path.join(V2, 'functions', 'package.json'));
  const { initializeApp, getApps } = req('firebase-admin/app');
  const { getFirestore } = req('firebase-admin/firestore');
  const { getStorage } = req('firebase-admin/storage');
  if (!getApps().length) initializeApp({ projectId: PROJECT });
  const db = getFirestore(), storage = getStorage();

  if (STEP === 'copy') return copy(storage.bucket(FROM), storage.bucket(TO), APPLY);

  /* A file's current tokens and size, asked once per file. */
  const metaCache = new Map();
  const meta = async (bucket, p) => {
    const k = bucket + '/' + p;
    if (!metaCache.has(k)) {
      metaCache.set(k, storage.bucket(bucket).file(p).getMetadata().then(([m]) => ({
        exists: true, size: Number(m.size || 0),
        tokens: String((m.metadata || {}).firebaseStorageDownloadTokens || '').split(',').map((t) => t.trim()).filter(Boolean)
      }), () => ({ exists: false, size: 0, tokens: [] })));
    }
    return metaCache.get(k);
  };

  if (STEP === 'check') return check(db, meta, FROM, TO, Number(opt('--count') || 100));

  /* tokens / links: what a link becomes, and why. */
  const notes = { repointed: [], missing: [], empty: [] };
  async function fixLink(link) {
    const L = parseLink(link);
    if (!L || L.bucket !== LEAVE) return link;
    const m = await meta(GOTO, L.path);
    if (!m.exists) { notes.missing.push(GOTO + ' / ' + L.path); return link; }
    if (m.size === 0) notes.empty.push(L.path);
    const wrongToken = !!(L.token && m.tokens.length && !m.tokens.includes(L.token));
    /* Nothing to change: the link exactly as stored, never re-encoded. */
    if (!wrongToken && GOTO === LEAVE) return link;
    if (wrongToken) {
      notes.repointed.push(L.path + ' (stored token ' + L.token.slice(0, 8) + '…, file has ' + m.tokens[0].slice(0, 8) + '…)');
      L.query.set('token', m.tokens[0]);
    }
    return buildLink(GOTO, L.path, L.query, L.amp);
  }

  let docs = 0, changedDocs = 0, changed = 0;
  const byCollection = {};
  for await (const d of allDocs(await db.listCollections())) {
    docs++;
    const data = d.data() || {};
    const map = new Map();
    for (const s of strings(data, [])) {
      for (const f of findLinks(s)) if (!map.has(f.link)) map.set(f.link, await fixLink(f.link));
    }
    const plain = (s) => (LEAVE === GOTO ? s : s.replace(PLAIN, (all, pre, b) => (b === LEAVE ? pre + GOTO : all)));
    const fix = (s) => plain(replaceLinks(s, map));
    const patch = {};
    let n = 0;
    for (const [k, v] of Object.entries(data)) {
      const was = JSON.stringify(v), now = mapStrings(v, fix);
      if (JSON.stringify(now) !== was) { patch[k] = now; n++; }
    }
    if (!n) continue;
    changedDocs++; changed += n;
    const top = d.ref.path.split('/').filter((_, i) => i % 2 === 0).join('/');
    byCollection[top] = (byCollection[top] || 0) + 1;
    if (APPLY) await d.ref.update(patch);
  }
  say('  documents read: ' + docs);
  say('  documents with links to change: ' + changedDocs + (APPLY ? ' - CHANGED' : ''));
  Object.entries(byCollection).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => say('    ' + c + ': ' + n));
  if (notes.repointed.length) say('  links pointed at the file\'s current token (' + notes.repointed.length + '):\n    ' + notes.repointed.join('\n    '));
  if (notes.missing.length) say('  links left alone - no such file in ' + GOTO + ' (' + notes.missing.length + '; run copy first?):\n    ' + [...new Set(notes.missing)].join('\n    '));
  if (notes.empty.length) say('  0-byte files (empty in the bucket - upload them again):\n    ' + [...new Set(notes.empty)].join('\n    '));
  if (!APPLY) say(changedDocs ? 'Add --apply to change them.' : 'Nothing left to change: 0 old links.');
}

/* Every document, every collection, every depth (churches/<id>/... too). */
async function* allDocs(colls) {
  for (const c of colls) {
    let last = null;
    for (;;) {
      let q = c.orderBy('__name__').limit(300);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      for (const d of snap.docs) {
        yield d;
        yield* allDocs(await d.ref.listCollections());
      }
      if (snap.size < 300) break;
      last = snap.docs[snap.size - 1];
    }
    /* Documents that exist only as parents of subcollections. */
    for (const ref of await c.listDocuments()) {
      const s = await ref.get();
      if (!s.exists) yield* allDocs(await ref.listCollections());
    }
  }
}

async function copy(from, to, APPLY) {
  const [exists] = await to.exists();
  if (!exists) { console.error('There is no bucket ' + to.name + ' yet: make it first (docs/STORAGE-MOVE.md, step 1).'); process.exit(1); }
  let files = 0, bytes = 0, todo = 0, todoBytes = 0, copied = 0, failed = 0;
  const empty = [];
  let pageToken;
  do {
    const [list, next] = await from.getFiles({ autoPaginate: false, maxResults: 500, pageToken });
    pageToken = next && next.pageToken;
    for (const f of list) {
      files++; bytes += Number(f.metadata.size || 0);
      if (Number(f.metadata.size || 0) === 0 && !f.name.endsWith('/')) empty.push(f.name);
      const [there] = await to.file(f.name).exists();
      if (there) {
        const [m] = await to.file(f.name).getMetadata();
        if (m.md5Hash === f.metadata.md5Hash && m.size === f.metadata.size) continue;
      }
      todo++; todoBytes += Number(f.metadata.size || 0);
      if (!APPLY) continue;
      /* A copy keeps the file's metadata, its download token among it. */
      try { await f.copy(to.file(f.name)); copied++; }
      catch (e) { failed++; say('  NOT COPIED ' + f.name + ': ' + (e.message || e)); }
    }
  } while (pageToken);
  /* The new bucket answers web pages as the old one does (CORS). Set on the
     NEW bucket only, and only while it has none; the old is only read. */
  const [oldMeta] = await from.getMetadata(), [newMeta] = await to.getMetadata();
  const cors = oldMeta.cors || [];
  if ((newMeta.cors || []).length) say('  web access (CORS) on the new bucket: already set, left alone');
  else if (!cors.length) say('  web access (CORS): the old bucket has none, so none to copy');
  else if (APPLY) { await to.setCorsConfiguration(cors); say('  web access (CORS): copied from the old bucket to the new one'); }
  else say('  web access (CORS): would copy the old bucket\'s ' + cors.length + ' rule(s) to the new one');
  const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
  say('  files in the old bucket: ' + files + ' (' + mb(bytes) + ')');
  say('  still to copy: ' + todo + ' (' + mb(todoBytes) + ')' + (APPLY ? ', copied: ' + copied + ', failed: ' + failed : ''));
  if (empty.length) say('  0-byte files (empty - upload them again):\n    ' + empty.join('\n    '));
  if (!APPLY) say(todo ? 'Add --apply to copy them.' : 'Nothing left to copy.');
}

/**
 * Why a link didn't open from the new bucket, in words: always a reason.
 * @param {{ path: string, token: string }} L @param {{ exists: boolean, size: number, tokens: string[] }} m
 * @param {number|string} status the HTTP answer
 */
export function whyNot(L, m, status) {
  if (!m.exists) return 'not in the new bucket: run copy';
  if (m.size === 0) return 'the file is empty (0 bytes): upload it again';
  if (!m.tokens.length) return 'the file has no download key, so it opens only where the rules let anyone read it - and the new bucket has no rules until the switch';
  if (!L.token) return 'the link carries no download key, so it opens only where the rules let anyone read it - and the new bucket has no rules until the switch';
  if (!m.tokens.includes(L.token)) return "the link's download key is not the file's current one: run tokens";
  return 'refused (' + status + ') though the key matches: look at this file in the console';
}

/* READ ONLY: a sample of stored links, opened from the new bucket. */
async function check(db, meta, FROM, TO, count) {
  const seen = new Set();
  for await (const d of allDocs(await db.listCollections())) {
    for (const s of strings(d.data() || {}, [])) for (const f of findLinks(s)) {
      const L = parseLink(f.link);
      if (L && L.bucket === FROM) seen.add(f.link);
    }
    if (seen.size >= count) break;
  }
  const res = { open: 0, failed: [] };
  for (const link of [...seen].slice(0, count)) {
    const L = parseLink(link), url = buildLink(TO, L.path, L.query, false);
    const r = await fetch(url, { headers: { Range: 'bytes=0-0' } }).catch((e) => ({ status: 'error ' + e.message }));
    if (r.status === 200 || r.status === 206) { res.open++; continue; }
    res.failed.push(r.status + '  ' + L.path + '  - ' + whyNot(L, await meta(TO, L.path), r.status));
  }
  say('  sampled ' + Math.min(seen.size, count) + ' stored links from London: ' + res.open + ' open');
  if (res.failed.length) say('  did NOT open (' + res.failed.length + '):\n    ' + res.failed.join('\n    '));
}

/* ---- switch: the code, in one commit ---------------------------------- */
function switchCode(FROM, TO, APPLY) {
  const EDITS = [
    ['egbc-auth.js', `storageBucket: "${FROM}"`, `storageBucket: "${TO}"`],
    ['egbc-db.js', `storageBucket: '${FROM}'`, `storageBucket: '${TO}'`],
    ['functions/index.js', 'initializeApp();', `initializeApp({ storageBucket: '${TO}' });`],
    ['converter/server.mjs', `process.env.BUCKET || '${FROM}'`, `process.env.BUCKET || '${TO}'`],
    ['firebase.json', '"storage": {\n    "rules": "storage.rules"\n  },',
      `"storage": [\n    { "bucket": "${TO}", "rules": "storage.rules" },\n    { "bucket": "${FROM}", "rules": "storage.rules" }\n  ],`]
  ];
  let ok = true;
  for (const [file, was, now] of EDITS) {
    const p = path.join(V2, file);
    const raw = fs.readFileSync(p, 'utf8'), crlf = raw.includes('\r\n'), s = raw.replace(/\r\n/g, '\n');
    const n = s.split(was).length - 1;
    if (s.includes(now)) { say('  ' + file + ': already switched'); continue; }
    if (n !== 1) { ok = false; say('  ' + file + ': NOT FOUND as expected (' + n + ' matches) - look at it by hand'); continue; }
    say('  ' + file + ': ' + (APPLY ? 'switched' : 'would switch'));
    if (APPLY) { const out = s.replace(was, now); fs.writeFileSync(p, crlf ? out.replace(/\n/g, '\r\n') : out); }
  }
  /* Tests that write to the emulator's bucket by name: their owners move them. */
  const named = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (/node_modules|\.git$/.test(p)) continue;
      if (fs.statSync(p).isDirectory()) { if (/tests|screenshots/.test(p)) walk(p); continue; }
      if (/[\\/](tests|screenshots)[\\/]/.test(p) && /\.(mjs|js)$/.test(f) && fs.readFileSync(p, 'utf8').includes(FROM)) named.push(path.relative(V2, p));
    }
  })(V2);
  say('  tests naming the old bucket (to move with the switch; others build it as "<project>.firebasestorage.app", so look for that too): ' + (named.length ? '\n    ' + named.join('\n    ') : 'none'));
  if (APPLY) say('Now bump egbc-auth.js\'s stamp on every page, then commit and push. Deploy the functions and the converter, and today\'s storage rules to both buckets.');
  if (!ok) process.exit(1);
}

/* Only when run, never when imported. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
