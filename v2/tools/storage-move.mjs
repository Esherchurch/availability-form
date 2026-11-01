/* MOVING FILE STORAGE TO THE UK (GOING-LIVE item 3; the plan is
 * docs/STORAGE-MOVE.md). Three steps, each a DRY RUN unless --apply is given,
 * each safe to run again and again:
 *
 *   node ../tools/storage-move.mjs copy  --to <new bucket> [--apply]
 *       every file in the old bucket that the new one hasn't got (or has a
 *       different copy of) is copied, with its metadata - so its download
 *       token, and so every download link, keeps working on the new bucket.
 *   node ../tools/storage-move.mjs links --to <new bucket> [--apply]
 *       every stored download link in Firestore naming the old bucket - top
 *       level and churches/<id>/..., in any field however deep - is
 *       rewritten to the new one. The dry run counts them: 0 means done.
 *   node ../tools/storage-move.mjs switch --to <new bucket> [--apply]   (from v2/)
 *       the code: storageBucket in egbc-auth.js and egbc-db.js, the
 *       functions' initializeApp, the converter's default, and firebase.json's
 *       storage rules for both buckets. Lists the tests that name the old one.
 *
 * Run copy and links from v2/functions (where firebase-admin is installed),
 * with Application Default Credentials. Options: --from <old bucket> (default
 * egbc-worship-planner.firebasestorage.app), --project <id> (default
 * egbc-worship-planner). NOTHING IS EVER DELETED from either bucket.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const STEP = args[0];
const APPLY = args.includes('--apply');
const PROJECT = opt('--project') || process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const FROM = opt('--from') || 'egbc-worship-planner.firebasestorage.app';
const TO = opt('--to');
const BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

if (!['copy', 'links', 'switch'].includes(STEP) || !TO || !BUCKET_NAME.test(TO) || TO === FROM) {
  console.error('Usage: node ../tools/storage-move.mjs copy|links|switch --to <new bucket> [--from <old>] [--apply]');
  process.exit(2);
}
const say = (s) => console.log(s);
say((APPLY ? 'APPLYING' : 'DRY RUN (nothing changes; add --apply)') + ': ' + STEP + ', ' + FROM + ' -> ' + TO);

/* ---- links: the strings that name the old bucket ------------------------ */
/* A Firebase download link (/v0/b/<bucket>/o/...), a public storage link
   (storage.googleapis.com/<bucket>/...) or a gs:// address. Nothing else is
   touched, so a word that merely looks like the bucket's name is safe. */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OLD = new RegExp('(/v0/b/|storage\\.googleapis\\.com/|gs://)' + esc(FROM) + '(?=[/?])', 'g');
const ANY_BUCKET = /(?:\/v0\/b\/|storage\.googleapis\.com\/|gs:\/\/)([a-z0-9][a-z0-9._-]+[a-z0-9])(?=[/?])/g;

/**
 * A value with the old bucket's links rewritten, and how many were.
 * @param {*} v any Firestore value @returns {{ value: *, n: number }}
 */
export function rewrite(v) {
  if (typeof v === 'string') {
    let n = 0;
    const out = v.replace(OLD, (m, pre) => { n++; return pre + TO; });
    return { value: out, n };
  }
  if (Array.isArray(v)) {
    let n = 0;
    const out = v.map((x) => { const r = rewrite(x); n += r.n; return r.value; });
    return { value: out, n };
  }
  if (v && typeof v === 'object' && v.constructor === Object) {
    let n = 0;
    const out = {};
    for (const [k, x] of Object.entries(v)) { const r = rewrite(x); n += r.n; out[k] = r.value; }
    return { value: out, n };
  }
  return { value: v, n: 0 };
}

/* Other buckets named in stored links: reported, never changed. */
function otherBuckets(v, seen) {
  if (typeof v === 'string') { for (const m of v.matchAll(ANY_BUCKET)) if (m[1] !== FROM && m[1] !== TO) seen[m[1]] = (seen[m[1]] || 0) + 1; }
  else if (Array.isArray(v)) v.forEach((x) => otherBuckets(x, seen));
  else if (v && typeof v === 'object' && v.constructor === Object) Object.values(v).forEach((x) => otherBuckets(x, seen));
}

async function admin() {
  const req = createRequire(path.join(V2, 'functions', 'package.json'));
  const { initializeApp, getApps } = req('firebase-admin/app');
  const { getFirestore } = req('firebase-admin/firestore');
  const { getStorage } = req('firebase-admin/storage');
  if (!getApps().length) initializeApp({ projectId: PROJECT });
  return { db: getFirestore(), storage: getStorage() };
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

async function links() {
  const { db } = await admin();
  let docs = 0, changedDocs = 0, links = 0;
  const others = {}, byCollection = {};
  for await (const d of allDocs(await db.listCollections())) {
    docs++;
    const data = d.data() || {};
    otherBuckets(data, others);
    const patch = {};
    let n = 0;
    for (const [k, v] of Object.entries(data)) { const r = rewrite(v); if (r.n) { patch[k] = r.value; n += r.n; } }
    if (!n) continue;
    changedDocs++; links += n;
    const top = d.ref.path.split('/').filter((_, i) => i % 2 === 0).join('/');
    byCollection[top] = (byCollection[top] || 0) + n;
    if (APPLY) await d.ref.update(patch);
  }
  say('  documents read: ' + docs);
  say('  links naming the old bucket: ' + links + ' in ' + changedDocs + ' documents' + (APPLY ? ' - REWRITTEN' : ''));
  Object.entries(byCollection).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => say('    ' + c + ': ' + n));
  if (Object.keys(others).length) say('  links naming OTHER buckets (left alone): ' + JSON.stringify(others));
  if (!APPLY) say(links ? 'Add --apply to rewrite them.' : 'Nothing left to rewrite: 0 old links.');
}

async function copy() {
  const { storage } = await admin();
  const from = storage.bucket(FROM), to = storage.bucket(TO);
  const [exists] = await to.exists();
  if (!exists) { console.error('There is no bucket ' + TO + ' yet: make it first (docs/STORAGE-MOVE.md, step 1).'); process.exit(1); }
  let files = 0, bytes = 0, todo = 0, todoBytes = 0, copied = 0, failed = 0;
  let pageToken;
  do {
    const [list, next] = await from.getFiles({ autoPaginate: false, maxResults: 500, pageToken });
    pageToken = next && next.pageToken;
    for (const f of list) {
      files++; bytes += Number(f.metadata.size || 0);
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
  /* The new bucket answers web pages as the old one does (which sites may
     fetch its files). Set on the NEW bucket only, and only while it has
     none - the old bucket's settings are read, never changed. */
  const [oldMeta] = await from.getMetadata(), [newMeta] = await to.getMetadata();
  const cors = oldMeta.cors || [];
  if ((newMeta.cors || []).length) say('  web access (CORS) on the new bucket: already set, left alone');
  else if (!cors.length) say('  web access (CORS): the old bucket has none, so none to copy');
  else if (APPLY) { await to.setCorsConfiguration(cors); say('  web access (CORS): copied from the old bucket to the new one'); }
  else say('  web access (CORS): would copy the old bucket\'s ' + cors.length + ' rule(s) to the new one');
  const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
  say('  files in the old bucket: ' + files + ' (' + mb(bytes) + ')');
  say('  still to copy: ' + todo + ' (' + mb(todoBytes) + ')' + (APPLY ? ', copied: ' + copied + ', failed: ' + failed : ''));
  if (!APPLY) say(todo ? 'Add --apply to copy them.' : 'Nothing left to copy.');
}

/* ---- switch: the code, in one commit ------------------------------------ */
const EDITS = [
  ['egbc-auth.js', `storageBucket: "${FROM}"`, `storageBucket: "${TO}"`],
  ['egbc-db.js', `storageBucket: '${FROM}'`, `storageBucket: '${TO}'`],
  ['functions/index.js', 'initializeApp();', `initializeApp({ storageBucket: '${TO}' });`],
  ['converter/server.mjs', `process.env.BUCKET || '${FROM}'`, `process.env.BUCKET || '${TO}'`],
  ['firebase.json', '"storage": {\n    "rules": "storage.rules"\n  },',
    `"storage": [\n    { "bucket": "${TO}", "rules": "storage.rules" },\n    { "bucket": "${FROM}", "rules": "storage.rules" }\n  ],`]
];

function switchCode() {
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
  say('  tests naming the old bucket (to move with the switch; others build it as "<project>.firebasestorage.app", so look for that too): ' +(named.length ? '\n    ' + named.join('\n    ') : 'none'));
  if (APPLY) say('Now bump egbc-auth.js\'s stamp on every page, then commit and push. Deploy the functions and the converter; the storage rules deploy to both buckets with the hub\'s rules.');
  if (!ok) process.exit(1);
}

if (STEP === 'switch') switchCode();
else await (STEP === 'copy' ? copy() : links());
