/* Every script the page asks for must be in the packaged app.

   mix-preview.js was added to the page and not to the installer's file list,
   so the built app served a 404 for it and the play button did nothing, while
   every test passed because they serve the source folder whole. This compares
   what the HTML asks for against what was actually packaged. */
const fs = require('fs'), path = require('path');
const PAGE = path.join(__dirname, '..', 'v2', 'mix-builder.html');
const OUT = path.join(__dirname, 'dist', 'win-unpacked', 'resources', 'app-page');

const html = fs.readFileSync(PAGE, 'utf8');
const wanted = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
  .map(m => m[1])
  .filter(s => !/^https?:/.test(s));

if (!fs.existsSync(OUT)) {
  console.log('  nothing built yet at ' + OUT);
  process.exit(0);
}
const have = fs.readdirSync(OUT);
let missing = 0;
wanted.forEach(w => {
  const ok = have.indexOf(path.basename(w)) >= 0;
  console.log('  ' + (ok ? 'ok   ' : 'MISSING ') + w);
  if (!ok) missing++;
});
console.log(missing
  ? '\n' + missing + ' script(s) the page needs are not in the build'
  : '\nthe build carries every script the page asks for');
process.exit(missing ? 1 : 0);
