/* The hub's own Verse of the day (egbc-votd.js; FINDINGS-comms plan H).
 *
 *   node tests/check-votd.mjs        (from v2/; no emulator, no browser)
 *
 * Every one of the 366 references must be understood by the hub's Bible
 * (egbc-bible.js parse) and be in the bundled BSB, verse by verse - a
 * mistyped reference would leave a morning with no verse. Each day of the
 * year has its own; London's date decides the day.
 *
 * DELIBERATE BREAK: --break=typo adds a verse the BSB has not got.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + JSON.stringify(x).slice(0, 300))); };
const load = (file, name, extra) => { const ctx = Object.assign({ Intl, Date, module: { exports: {} } }, extra || {}); ctx.self = ctx; ctx.window = ctx; vm.createContext(ctx); vm.runInContext(fs.readFileSync(file, 'utf8'), ctx); return ctx.module.exports && Object.keys(ctx.module.exports).length ? ctx.module.exports : ctx[name]; };
let src = fs.readFileSync('egbc-votd.js', 'utf8');
if (process.argv.includes('--break=typo')) src = src.replace("'Lamentations 3:22-23',", "'Lamentations 3:22-23', 'Psalm 23:9',");
const ctx = { Intl, Date, module: { exports: {} } }; vm.createContext(ctx); vm.runInContext(src, ctx);
const V = ctx.module.exports;
const B = load('egbc-bible.js', 'EGBCBible', { location: { href: 'http://x/' }, document: { currentScript: null } });
const BSB = JSON.parse(fs.readFileSync('bibles/index.json', 'utf8')).find(x => x.id === 'BSB');

ok('366 references, one for each day of the year (no repeats)', V.LIST.length === 366 && new Set(V.LIST).size === 366, [V.LIST.length, new Set(V.LIST).size]);
const bad = [];
for (const r of V.LIST) {
  const p = B.parse(r); if (!p) { bad.push(r + ': not understood'); continue; }
  const bk = BSB.books.find(b => b.name === p.book); if (!bk) { bad.push(r + ': no such book'); continue; }
  const chs = JSON.parse(fs.readFileSync('bibles/BSB/' + bk.file + '.json', 'utf8'));
  for (let c = p.ch; c <= p.ch2; c++) {
    const vs = chs[c - 1]; if (!vs) { bad.push(r + ': no chapter ' + c); break; }
    const from = (c === p.ch && p.v1) ? p.v1 : 1, to = (c === p.ch2 && p.v2) ? p.v2 : vs.length;
    for (let n = from; n <= to; n++) if (!String(vs[n - 1] || '').trim()) { bad.push(r + ': no verse ' + c + ':' + n); break; }
  }
}
ok('every reference is in the BSB, verse by verse', bad.length === 0, bad);
ok('London’s date decides the day (31 Dec is day 366 in any year)', V.dayOfYear(new Date('2026-12-31T12:00:00Z')) === 366 && V.dayOfYear(new Date('2028-12-31T12:00:00Z')) === 366 && V.dayOfYear(new Date('2026-01-01T00:30:00Z')) === 1);
ok('just after midnight in London (still the evening before in UTC in summer) is London’s new day', V.dayOfYear(new Date('2026-07-01T23:30:00Z')) === V.dayOfYear(new Date('2026-07-02T12:00:00Z')));
ok('each day has its own verse', V.forDate(new Date('2026-10-20T12:00:00Z')) !== V.forDate(new Date('2026-10-21T12:00:00Z')));
const fails = R.filter(v => !v).length;
console.log('\n' + (R.length - fails) + '/' + R.length + ' passed' + (process.argv.some(a => a.startsWith('--break')) ? '   (deliberate break, so this run SHOULD be red)' : ''));
process.exit(fails ? 1 : 0);
