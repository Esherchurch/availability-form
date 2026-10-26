/* ===================================================================
   THE RISK ASSESSMENT ENGINE, the server's checks every AI call shares
   (F-280 section 2, H&S step 1): moved unchanged from sg-ai-core.cjs,
   which still gives them under the same names.
   ===================================================================
   personalCheck(text, names)  refuse a name the hub holds, an email, a
                               phone number, a postcode, a date of birth or
                               an NHS-style number BEFORE anything is sent;
                               warn (not refuse) a medical word next to a
                               capitalised name
   SOCKETS, socketCover(s)     never socket covers: the line every
                               instruction carries, and the check of every
                               reply
   rating(l, i)                the bands, as the pages' (egbc-ra-core.js)
   =================================================================== */
'use strict';

/* ---- personal details, refused before any call ---- */
const COMMON = new Set(['will', 'grace', 'hope', 'faith', 'joy', 'mark', 'bill', 'rose', 'may', 'june', 'april', 'august', 'art', 'sky', 'summer', 'dawn', 'eve', 'holly', 'ivy', 'iris', 'jack', 'max', 'pat', 'ray', 'rob', 'sandy', 'hunter', 'chase', 'drew', 'trip', 'beach', 'church', 'park', 'leader', 'leaders', 'children', 'child']);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function personalCheck(text, names) {
  const t = String(text || '');
  if (/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i.test(t)) return { refuse: 'email' };
  if (/(\+44\s?\(?0?\)?\s?|\b0)(7\d{3}|\d{2,4})[\s-]?\d{3,4}[\s-]?\d{3,4}\b/.test(t)) return { refuse: 'phone' };
  if (/\b(born|d\.?o\.?b\.?|date of birth|birthday)\b\W{0,4}(on\s+|is\s+)?\d{1,2}(st|nd|rd|th)?[\s\/.-]/i.test(t)) return { refuse: 'dob' };
  if (/\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/.test(t)) return { refuse: 'nhs' };
  if (/\b(GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b/.test(t)) return { refuse: 'postcode' };
  for (const n of names || []) {
    const full = String(n || '').trim().replace(/\s+/g, ' ');
    if (!full) continue;
    if (full.includes(' ') && new RegExp('\\b' + esc(full) + '\\b', 'i').test(t)) return { refuse: 'name' };
    const first = full.split(' ')[0];
    if (first.length >= 3 && !COMMON.has(first.toLowerCase()) && new RegExp('\\b' + esc(first[0].toUpperCase() + first.slice(1).toLowerCase()) + '\\b').test(t)) return { refuse: 'name' };
  }
  /* a capitalised word (not a general one) then "has / needs ..." a medical word */
  const m = t.match(/\b([A-Z][a-z]{2,})('s)?\s+(has|is|with|needs|takes|gets)\s+(\w+\s+){0,3}(epilep|diabet|asthma|allerg|anaphyla|autis|adhd|seizure|insulin|epipen|inhaler)/);
  const warn = !!m && !/^(The|Some|Two|Three|One|Several|Many|Most|All|Each|Every|Children|Leaders|Parents|Everyone|Nobody)$/.test(m[1]);
  return { refuse: null, warn };
}

/* NEVER SOCKET COVERS (Martin, 23 Oct 2026; F-280 10.7): UK sockets have
   shutters, and safety bodies advise against covers. Said in every AI
   instruction, and checked here as well: anything that mentions them is
   left out, and the page says so. */
const SOCKETS = 'Never recommend socket covers, socket protectors, socket inserts or plastic safety plugs: UK sockets have built-in shutters, and safety bodies advise against covers. For electrical safety, recommend checks of sockets, leads and equipment instead.';
const SOCKET_RE = /\b(socket|plug|outlet)[\s-]*(covers?|protectors?|inserts?|guards?|caps?|blanks?|blockers?)\b|\bsafety[\s-]*plugs?\b/i;
function socketCover(s) { return SOCKET_RE.test(String(s == null ? '' : s)); }
function rating(l, i) { const s = l * i; return s >= 15 ? 'red' : s >= 5 ? 'amber' : 'green'; }

module.exports = { personalCheck, SOCKETS, socketCover, rating };
