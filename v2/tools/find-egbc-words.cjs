// Where EGBC's own name, town, address or habits appear as words a person could see (not file or code names).
const fs = require('fs'), path = require('path');
process.chdir('C:/Users/marti/Downloads/availability-form-main/availability-form/v2');
const SKIP = /^(tests|screenshots|design-mocks|node_modules|functions\/node_modules|mix-tests|converter|ease-test|bibles|img|brand|design|tools|monitor-bridge)(\/|$)|\.test\.mjs$|\.rules$|\.md$|\.json$/;
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const rel = path.posix.join(d, f).replace(/^\.\//, ''); if (SKIP.test(rel)) continue; if (fs.statSync(rel).isDirectory()) walk(rel); else if (/\.(js|mjs|cjs|html)$/.test(f)) files.push(rel); } })('.');
/* Words, not identifiers: EGBC not followed by a letter/Auth etc., and not inside egbc-file names or EGBC_ constants. */
const PATTERNS = {
  'EGBC (as a word)': /(?<![A-Za-z_\-./])EGBC(?![A-Za-z_\-0-9])/g,
  'Esher': /\bEsher\b/g,
  'esherchurch (address)': /esherchurch\.(org|github\.io)/g,
  'Baptist': /\bBaptist\b/g,
  'members\u2019/members\' meeting': /[Mm]embers[\u2019']? meeting/g
};
const rows = [];
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
    /* comments are not shown to anybody */
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1').replace(/<!--[\s\S]*?-->/g, '');
  const hits = {};
  for (const [k, re] of Object.entries(PATTERNS)) { const n = (s.match(re) || []).length; if (n) hits[k] = n; }
  if (Object.keys(hits).length) rows.push([f, hits]);
}
const tot = {}; rows.forEach(([, h]) => Object.entries(h).forEach(([k, n]) => { tot[k] = tot[k] || { files: 0, n: 0 }; tot[k].files++; tot[k].n += n; }));
console.log('TOTALS', JSON.stringify(tot));
rows.sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0));
rows.forEach(([f, h]) => console.log('  ' + f.padEnd(42) + Object.entries(h).map(([k, n]) => k + ' ' + n).join(', ')));
