/* NO LINK TO A PAGE THAT IS NOT THERE (7 Nov 2026: the five training copies were taken
 * out, Martin; nothing may end on a missing page).
 *
 *   node tests/check-no-missing-pages.mjs        (from v2/; no emulators)
 *
 * Every page and script v2 serves, and the functions (their emails link to pages):
 * each name of a .html page it refers to - a link, a Menu or app entry, an
 * "open:" action, a navigate() - must be a page in v2, spelled exactly (the
 * hosting is case-sensitive, so "planner.html" for Planner.html is a missing page
 * on the real site even though Windows finds it). Addresses with a folder or a
 * host are not pages of v2 and are left alone. Page names held in lower case
 * on purpose for matching (the parts lists, the icons) are compared ignoring case.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = new Set(fs.readdirSync(V2).filter((f) => f.endsWith('.html')));
const LOWER = new Set([...PAGES].map((p) => p.toLowerCase()));
/* Files that hold page names in lower case for matching, not as addresses. */
const MATCH_ONLY = new Set(['egbc-parts.js', 'functions/parts.js', 'egbc-ui.js', 'hub-app.js', 'hubresources.html']);
/* Names that look like a page and are not a link to one, each with why. */
const NOT_LINKS = {
  'invitation-email.html': 'birthday.html: the name of a file it gives to download',
  'filename.html': 'hub-app.js: the example in the page form\'s empty box',
  'services.html': 'sitemaker.html: a page of the site it builds for a church, not of v2',
  'contact.html': 'sitemaker.html: a page of the site it builds for a church, not of v2',
  'forms.html': 'egbc-app.js PAGE_EXTRA: a switch for a page the app never opens (form.html is the forms page; raised with Martin, 7 Nov 2026)'
};
const files = fs.readdirSync(V2).filter((f) => /\.(html|js)$/.test(f))
  .concat(fs.readdirSync(path.join(V2, 'functions')).filter((f) => /\.(js|cjs)$/.test(f)).map((f) => 'functions/' + f));
/* A page name as an address is written: straight after a quote (or href= / src=), the whole
   string up to ? # or the closing quote. Words with spaces between them are allowed, as one
   page's name has them; prose and code (n.html, res.html) are not addresses and do not match. */
const REF = /(?:["'`]|href=|src=)([A-Za-z0-9_&%-]+(?: [A-Za-z0-9_&%-]+)*(?:\.[A-Za-z0-9_-]+)*\.html)(?=[?#"'`])/g;
const missing = new Map();
let refs = 0;
for (const f of files) {
  const text = fs.readFileSync(path.join(V2, f), 'utf8');
  for (const m of text.matchAll(REF)) {
    let p = m[1].trim(); try { p = decodeURIComponent(p); } catch (e) { /* as written */ }
    if (!p || /^\./.test(p) || NOT_LINKS[p]) continue;
    /* words with spaces that are no page at all, in any case, are a sentence in a comment */
    if (/ /.test(p) && !LOWER.has(p.toLowerCase()) && !/^training /i.test(p)) continue;
    refs++;
    const there = MATCH_ONLY.has(f) ? LOWER.has(p.toLowerCase()) : PAGES.has(p);
    if (!there) { if (!missing.has(p)) missing.set(p, new Set()); missing.get(p).add(f); }
  }
}
/* The "?" help (help/<page>.md) links pages too, as Markdown: [words](page.html). */
const HELP = fs.existsSync(path.join(V2, 'help')) ? fs.readdirSync(path.join(V2, 'help')).filter((f) => f.endsWith('.md')) : [];
for (const f of HELP) {
  for (const m of fs.readFileSync(path.join(V2, 'help', f), 'utf8').matchAll(/\]\(([A-Za-z0-9_&%.-]+\.html)(?:[?#][^)]*)?\)/g)) {
    refs++; let p = m[1]; try { p = decodeURIComponent(p); } catch (e) { /* as written */ }
    if (!PAGES.has(p)) { if (!missing.has(p)) missing.set(p, new Set()); missing.get(p).add('help/' + f); }
  }
}
files.push(...HELP.map((f) => 'help/' + f));
const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || !x ? '' : '\n          ' + x)); };
ok('every page v2 refers to is there, spelled exactly (' + refs + ' references in ' + files.length + ' files, ' + PAGES.size + ' pages)', !missing.size,
  [...missing].map(([p, fs2]) => p + '  <-  ' + [...fs2].join(', ')).join('\n          '));
const TRAIN = ['trainingportalhub.html', 'training Sunday planner.html', 'trainingrotaplanner.html', 'trainingmusicdatabase.html', 'trainingbatchimporter.html'];
const named = files.filter((f) => { const t = fs.readFileSync(path.join(V2, f), 'utf8'); return TRAIN.some((p) => t.includes(p) || t.includes(encodeURI(p)) || t.toLowerCase().includes(p.toLowerCase())); });
ok('no page or script names the five training copies taken out (Martin, 7 Nov 2026)', !named.length, named.join(', '));
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
