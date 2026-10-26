/* Does any page send somebody back to the old site?
 *
 *   node tests/check-links-stay-in-v2.mjs        (from v2/)
 *
 * WHY. 44 links in 20 v2 files were full addresses to the original site -
 * `https://esherchurch.github.io/availability-form/<page>.html`, with no
 * `/v2/`. Pressing one inside v2 left v2 and opened the old page: the Sunday
 * planner's song library and Play-Through, the Rota Planner's instructions,
 * the Email Compiler's instructions, the youth planner's uploader. Nothing
 * looked wrong; you simply ended up somewhere else, on a site that is about to
 * stop being the one in use.
 *
 * Inside a page a link must be RELATIVE, so it stays wherever the page is.
 *
 * THE ONE EXCEPTION is a link inside an EMAIL. An email has no page for a
 * relative address to be relative to, so those need a full one - and it must
 * be the v2 address. The six are named below, one at a time, with what each
 * one is: a list this short can be read and argued with, which a pattern
 * cannot.
 */
import fs from 'node:fs';
import path from 'node:path';

const V2 = path.resolve('.');
const OLD = 'https://esherchurch.github.io/availability-form/';
const V2_ADDRESS = OLD + 'v2/';

/* Allowed to be a full address, because it is read in an email client. */
const IN_AN_EMAIL = [
  { file: 'Planner.html', what: 'the Fill In My Availability button on the rota email' },
  { file: 'trainingrotaplanner.html', what: 'the same button in the training copy of that email' },
  /* THE AVAILABILITY EMAIL MOVED. It was built in CoreTeamApp.html until
     the Core Team rota was lifted into egbc-core-rota.js so both hosts
     run one copy (febf6797, 11 Oct 2026). The link is the same link and
     still goes in an email - an email has no page to be relative to - but
     this list still named the old home, so the check reported the same
     move twice: a full address "leaving v2" from the new file, and an
     email "missing its full address" from the old one.

     Both halves were mine, and this check has been red since that day.
     Correcting where the email lives is not loosening it: a full address
     anywhere other than these files still fails. */
  { file: 'egbc-core-rota.js', what: 'the availability email sent from Core Team' },
  { file: 'hub-app.js', what: 'the access code email to a parent' },
  { file: 'EmailBuilder2.html', what: 'the address offered when an admin puts a link in an email' },
  /* hubresources.html left the list on 26 Oct 2026: its example is words
     now ("a link to one of the hub's pages"), not an address. */
  { file: 'egbc-mailblocks.js', what: 'the pictures in the e-news emails (Comms)' }
];
/* A FULL ADDRESS MADE AT THE TIME (26 Oct 2026): since egbc.churchhq.co.uk,
   an email built on a page takes the address that page is open at -
   github.io or Church HQ's - which is a full address in the email, as an
   email needs. The source shows how it is made, not the address. */
const MADE_FULL = /location\.origin \+ location\.pathname\.replace\(\/\[\^\/\]\*\$\/, ''\)|new URL\('\.\/', location\.href\)/;
const allowed = new Set(IN_AN_EMAIL.map(x => x.file));

const files = fs.readdirSync(V2).filter(f => /\.(html|js)$/i.test(f));
const leaving = [];
const emails = [];

for (const file of files) {
  const src = fs.readFileSync(path.join(V2, file), 'utf8');
  if (!src.includes(OLD)) continue;
  src.split('\n').forEach((line, i) => {
    let at = -1;
    while ((at = line.indexOf(OLD, at + 1)) !== -1) {
      /* ".../v2/" or ".../v2" at the end of an address (egbc-mailblocks.js). */
      const isV2 = line.startsWith(V2_ADDRESS, at) || (line.startsWith(OLD + 'v2', at) && !/[A-Za-z0-9_.-]/.test(line.charAt(at + OLD.length + 2)));
      const where = file + ':' + (i + 1);
      if (!isV2) leaving.push({ where, line: line.trim().slice(0, 110) });
      else if (!allowed.has(file)) leaving.push({ where, line: line.trim().slice(0, 110), note: 'full address, but not in an email' });
      else emails.push({ where, line: line.trim().slice(0, 90) });
    }
  });
}

console.log('files looked at: ' + files.length);
console.log('links that would leave v2: ' + leaving.length);
console.log('full addresses inside an email, pointing at v2: ' + emails.length + ' of ' + IN_AN_EMAIL.length + ' expected');
for (const e of emails) console.log('    ok   ' + e.where + '  ' + e.line);

if (leaving.length) {
  console.log('\nTHESE SEND SOMEBODY BACK TO THE OLD SITE. Inside a page, make the link');
  console.log('relative - "sundayplannersonglibrary.html", not the full address:');
  for (const l of leaving) console.log('    ' + l.where + (l.note ? '  (' + l.note + ')' : '') + '\n        ' + l.line);
}

/* A missing one matters too: if a file in the list stops having its full
   address, an email has quietly been given a relative link, which will not
   work in anybody's inbox. */
const missing = IN_AN_EMAIL.filter(x => !emails.some(e => e.where.startsWith(x.file + ':'))
  && !MADE_FULL.test(fs.readFileSync(path.join(V2, x.file), 'utf8')));
if (missing.length) {
  console.log('\nTHESE SHOULD HAVE A FULL v2 ADDRESS AND DO NOT. A relative link in an');
  console.log('email goes nowhere, because an email has no page to be relative to:');
  for (const m of missing) console.log('    ' + m.file + '  - ' + m.what);
}

const bad = leaving.length + missing.length;
console.log('\n' + (bad ? bad + ' to fix' : 'every link inside a page stays in v2, and every email link is a full v2 address'));
process.exit(bad ? 1 : 0);
