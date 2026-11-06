/* SHARED LOOKUPS IN THE BUILT RULES (the reviewing window, 6 Nov 2026).
 *
 * The church rules were within 2% of the size limit (tools/rules-build.mjs
 * WARN). The ten document lookups the rules repeat most are written once each,
 * as a function, in the BUILT rules only: firestore.rules keeps every lookup
 * written out where it is used, as before, and tools/rules-build.mjs swaps
 * each one for a call to its function as it builds. Nothing else changes.
 *
 * Why this cannot change what a rule allows:
 *   - each function is exactly the lookup it replaces, the same get() or
 *     exists() on the same collection, with the id put in by $( ) just as at
 *     the call site; no document path is ever made from text;
 *   - Firestore reads a document once per request however often it is asked
 *     for, so no rule reads more or less than before;
 *   - tests/check-rules-build.mjs writes every call out again (expand) and
 *     checks that gives the same rules, token for token, as building without
 *     the functions - for the EGBC rules and the church rules, every build.
 *
 * Only a lookup whose whole id is one $( ) segment (or, for the safeguarding
 * defaults, the literal id) is swapped: a lookup with a longer path, such as
 * meetings/$(m)/quickVotes/$(v), is left written out. The other lookups wait
 * for the tidy-up stage.
 */

const DOCS = '/databases/$(database)/documents/';

/* name, get or exists, collection, and the literal id when it has one */
export const LOOKUPS = [
  { name: 'sgDefaults', op: 'get', coll: 'safeguardingSettings', lit: 'defaults' },
  { name: 'sgDefaultsHas', op: 'exists', coll: 'safeguardingSettings', lit: 'defaults' },
  { name: 'calEvDoc', op: 'get', coll: 'calEvents' },
  { name: 'calEvHas', op: 'exists', coll: 'calEvents' },
  { name: 'siteHas', op: 'exists', coll: 'sites' },
  { name: 'bookSetDoc', op: 'get', coll: 'bookingSettings' },
  { name: 'bookSetHas', op: 'exists', coll: 'bookingSettings' },
  { name: 'sgAssessDoc', op: 'get', coll: 'sgAssessments' },
  { name: 'meetingDoc', op: 'get', coll: 'meetings' },
  { name: 'kidsGroupDoc', op: 'get', coll: 'kidsGroups' }
];

/* The lookup itself, written out: base is DOCS, or the church's DOCS + 'churches/$(cid)/'. */
const lookup = (L, id, base) => L.op + '(' + base + L.coll + '/' + (L.lit ? L.lit : '$(' + id + ')') + ')';
/* Each function, as the build writes it (before the church build moves its paths). */
export const defOf = (L, base = DOCS) => 'function ' + L.name + '(' + (L.lit ? '' : 'id') + ') { return ' + lookup(L, 'id', base) + '; }';

const IDENT = /[A-Za-z0-9_]/;
/* The index of the ) that closes the ( at open, skipping quoted text. */
function closeOf(t, open) {
  let depth = 0;
  for (let i = open; i < t.length; i++) {
    const c = t[i];
    if (c === "'" || c === '"') { let j = i + 1; while (j < t.length && t[j] !== c) { if (t[j] === '\\') j++; j++; } i = j; continue; }
    if (c === '(') depth++;
    if (c === ')' && --depth === 0) return i;
  }
  return -1;
}

/* Every lookup in the table swapped for its function. t is the stripped rules. */
function swap(t, base) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const L of LOOKUPS) {
      const head = L.op + '(' + base + L.coll + '/';
      let at = t.indexOf(head);
      while (at >= 0) {
        let to = -1, arg = '';
        if (at === 0 || !IDENT.test(t[at - 1])) {
          const after = at + head.length;
          if (L.lit) {
            if (t.startsWith(L.lit + ')', after)) to = after + L.lit.length + 1;
          } else if (t.startsWith('$(', after)) {
            const shut = closeOf(t, after + 1);
            if (shut > 0 && t[shut + 1] === ')') { arg = t.slice(after + 2, shut); to = shut + 2; }
          }
        }
        if (to > 0) {
          const call = L.name + '(' + arg + ')';
          t = t.slice(0, at) + call + t.slice(to);
          changed = true;
          at = t.indexOf(head, at + 1);
        } else at = t.indexOf(head, at + 1);
      }
    }
  }
  return t;
}

/* The stripped rules with the shared lookups: the calls in place, and the
   functions written once, first thing inside the documents block. */
export function shorten(t) {
  const open = 'match /databases/{database}/documents {';
  const at = t.indexOf(open);
  if (at < 0) throw new Error('rules-lookups: no "' + open + '" in the rules');
  for (const L of LOOKUPS) if (new RegExp('function ' + L.name + '\\(').test(t)) throw new Error('rules-lookups: firestore.rules already has a function ' + L.name);
  const s = swap(t, DOCS);
  const i = s.indexOf(open) + open.length;
  return s.slice(0, i) + '\n' + LOOKUPS.map((L) => defOf(L)).join('\n') + s.slice(i);
}

/* The other way: the functions taken out and every call written out again,
   for the check. base as for lookup(). */
export function expand(t, base = DOCS) {
  for (const L of LOOKUPS) t = t.split(defOf(L, base)).join('');
  let changed = true;
  while (changed) {
    changed = false;
    for (const L of LOOKUPS) {
      const head = L.name + '(';
      let at = t.indexOf(head);
      while (at >= 0) {
        if (at === 0 || !IDENT.test(t[at - 1])) {
          const shut = closeOf(t, at + L.name.length);
          if (shut > 0) {
            const out = lookup(L, t.slice(at + head.length, shut), base);
            t = t.slice(0, at) + out + t.slice(shut + 1);
            changed = true;
          }
        }
        at = t.indexOf(head, at + 1);
      }
    }
  }
  return t;
}
export const CHURCH_DOCS = DOCS + 'churches/$(cid)/';
