/* THE RULESET THAT IS DEPLOYED, built from the one everyone edits
 * (FINDINGS-churchhq H-7; the reviewing window, 22 Oct 2026).
 *
 *   node tools/rules-build.mjs          (from v2/) writes firestore.build.rules
 *   node tools/rules-build.mjs --check  writes nothing; exits 1 if the built
 *                                       file is out of date or too big
 *
 * Firebase refuses a ruleset whose source is over 256 KB (and 250 KB once
 * compiled). firestore.rules, with its comments, passed that on 16 Oct
 * 2026. Everyone keeps editing firestore.rules, comments and all; this
 * writes the same rules with the comments and spare whitespace taken out,
 * and firebase.json (and every emulator config) points at the result, so
 * every rules test runs against exactly what will deploy.
 *
 * It reads the rules token by token: text inside quotes is copied exactly
 * (a '//' in a URL pattern is not a comment), comments go, and each run of
 * whitespace outside quotes becomes one space, or a newline.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'firestore.rules';
export const BUILT = 'firestore.build.rules';
/* The working limit: 256 KB is Firebase's, the compiled ruleset may be a
   little bigger or smaller, so we keep a margin (the reviewing window). */
export const LIMIT = 230 * 1024;
const HEADER = '// GENERATED from firestore.rules by tools/rules-build.mjs - do not edit; edit firestore.rules and run the build.\n';

/* The rules with comments out and whitespace squeezed; strings untouched. */
export function strip(src) {
  let out = '', i = 0, space = false, line = false;
  const n = src.length;
  const gap = () => { if (out && (space || line)) out += line ? '\n' : ' '; space = line = false; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; line = true; continue; }
    if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) throw new Error('An unclosed /* comment'); i = e + 2; space = true; continue; }
    if (c === '\n') { line = true; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { space = true; i++; continue; }
    if (c === "'" || c === '"') {
      gap();
      let j = i + 1;
      while (j < n && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') throw new Error('A string runs past the end of a line, at ' + i); j++; }
      if (j >= n) throw new Error('An unclosed string, at ' + i);
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    gap(); out += c; i++;
  }
  return out.trim() + '\n';
}

export function build(src) { return HEADER + strip(src); }

/* ---- THE CHURCH RULESET (multi-church step 4 part 1, H-6/H-7) ----------
   The same rules, for the shared Church HQ project: every collection under
   churches/{cid}, and nobody in unless the church is in their sign-in's
   claims. Generated, never edited, from firestore.rules, so the two can
   never drift. A separate file: no deployed ruleset holds both copies
   (the size limit, H-7). Which project deploys it is Martin's later choice.

   How: the rules' own helpers and matches are copied inside
   match /churches/{cid}, where they shadow nothing outside it, with
     - every document path moved under the church (get() and exists());
       me() therefore reads the church's own users record;
     - signedIn() meaning signed in AND the church in the claims - the gate
       on everything, since every rule starts from it;
     - users/{uid} server-written only (step 2's decision);
   and EGBC's own pilot copy (step 2), the directory and the catch-all
   left out of the copy. */
export const CHURCH_BUILT = 'firestore.churches.rules';
const CHURCH_HEADER = '// GENERATED from firestore.rules by tools/rules-build.mjs - the rules for the shared Church HQ project (every church under churches/{cid}). Do not edit.\n';

/* Top-level items of a block body: 'function x(...) {...}' and
   'match /p/{q} {...}', with quoted text skipped when matching braces. */
function items(body) {
  const out = []; let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length) break;
    const start = i; let depth = 0, seen = false;
    for (; i < body.length; i++) {
      const c = body[i];
      if (c === "'" || c === '"') { let j = i + 1; while (body[j] !== c) { if (body[j] === '\\') j++; j++; } i = j; continue; }
      /* A path wildcard, /{uid} or /{document=**}: part of the name. */
      if (c === '{' && body[i - 1] === '/') { i = body.indexOf('}', i); continue; }
      if (c === '{') { depth++; seen = true; }
      if (c === '}') { depth--; if (seen && depth === 0) { i++; break; } }
      if (!seen && c === ';') { i++; break; }   // a bare statement (none expected)
    }
    out.push(body.slice(start, i).trim());
  }
  return out;
}
/* The head: everything before the block's own brace (not a /{wildcard}). */
const openOf = (t) => {
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '{' && t[i - 1] === '/') { i = t.indexOf('}', i); continue; }
    if (t[i] === '{') return i;
  }
  return -1;
};
const headOf = (item) => item.slice(0, openOf(item)).replace(/\s+/g, ' ').trim();
/* The body of the first block whose head matches. */
function blockBody(text, head) {
  const at = text.indexOf(head); if (at < 0) throw new Error('No block: ' + head);
  const it = items(text.slice(at))[0];
  return it.slice(openOf(it) + 1, it.lastIndexOf('}'));
}

const LEFT_OUT = [
  /^match \/churches\/\{cid\}$/, /^match \/hqChurches\//, /^match \/hqMemberships\//, /^match \/\{document=\*\*\}$/,
  /^match \/users\/\{uid\}$/,
  /^function (signedIn|inChurch|churchMeAt|churchActive|churchMaster|churchAdmin|churchVolunteer|churchSgLead)\(/
];
const DIRECTORY = [/^match \/hqChurches\//, /^match \/hqMemberships\//];

export function buildChurch(src) {
  const docs = blockBody(strip(src), 'match /databases/{database}/documents');
  const all = items(docs);
  const heads = all.map(headOf);
  for (const need of ['function signedIn()', 'function me()', 'match /users/{uid}', 'match /{document=**}']) {
    if (!heads.includes(need)) throw new Error('firestore.rules no longer has ' + need + ': the church build needs looking at');
  }
  const kept = all.filter((it) => !LEFT_OUT.some((re) => re.test(headOf(it))));
  const moved = kept.map((it) => it.split('/databases/$(database)/documents/').join('/databases/$(database)/documents/churches/$(cid)/'));
  const directory = all.filter((it) => DIRECTORY.some((re) => re.test(headOf(it))));
  return CHURCH_HEADER + [
    "rules_version = '2';",
    'service cloud.firestore {',
    'match /databases/{database}/documents {',
    'function signedIn() { return request.auth != null; }',
    ...directory,
    'match /churches/{cid} {',
    /* The claim read directly, not with .get() and a default: fewer
       expressions, and every rule calls this (the booking batch is within
       one expression of Firestore's 1,000 limit; H-8). No claim is an
       error, which refuses. */
    "function signedIn() { return request.auth != null && cid in request.auth.token.churches; }",
    'allow read: if signedIn();',
    'allow write: if false;',
    ...moved,
    'match /users/{uid} { allow read: if signedIn() && (uid == request.auth.uid || isAdmin()); allow write: if false; }',
    '}',
    'match /{document=**} { allow read, write: if false; }',
    '}',
    '}'
  ].join('\n') + '\n';
}

/* The tokens of a ruleset, comments and spacing aside: source and built
   must have the same ones, in the same order. */
export function tokens(src) {
  return strip(src).replace(/\s+/g, ' ').trim();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = fs.readFileSync(path.join(V2, SOURCE), 'utf8');
  const want = build(src);
  const bytes = Buffer.byteLength(want);
  if (process.argv.includes('--check')) {
    const have = fs.existsSync(path.join(V2, BUILT)) ? fs.readFileSync(path.join(V2, BUILT), 'utf8').replace(/\r\n/g, '\n') : '';
    const fresh = have === want;
    console.log((fresh ? 'up to date' : 'OUT OF DATE: run node tools/rules-build.mjs') + '; ' + bytes + ' bytes of ' + LIMIT);
    process.exit(fresh && bytes <= LIMIT ? 0 : 1);
  }
  fs.writeFileSync(path.join(V2, BUILT), want);
  console.log('wrote ' + BUILT + ': ' + bytes + ' bytes (source ' + Buffer.byteLength(src) + '; limit ' + LIMIT + ')');
  const church = buildChurch(src);
  fs.writeFileSync(path.join(V2, CHURCH_BUILT), church);
  console.log('wrote ' + CHURCH_BUILT + ': ' + Buffer.byteLength(church) + ' bytes');
  if (bytes > LIMIT || Buffer.byteLength(church) > LIMIT) { console.log('OVER THE LIMIT'); process.exit(1); }
}
