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
  if (bytes > LIMIT) { console.log('OVER THE LIMIT'); process.exit(1); }
}
