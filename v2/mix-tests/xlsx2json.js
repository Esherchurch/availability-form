// Minimal xlsx -> JSON for the disco running order. No deps: an .xlsx is a zip,
// and Node can inflate the raw deflate members itself.
const fs = require('fs'), zlib = require('zlib');

function unzip(buf) {
  const files = {};
  // Walk local file headers (PK\x03\x04). Good enough for Office output.
  for (let i = 0; i + 4 <= buf.length; ) {
    if (buf.readUInt32LE(i) !== 0x04034b50) { i++; continue; }
    const method = buf.readUInt16LE(i + 8);
    let csize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26), extraLen = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nameLen).toString('utf8');
    const start = i + 30 + nameLen + extraLen;
    if (csize === 0) { // streamed entry: find next signature
      let j = start;
      while (j + 4 <= buf.length && buf.readUInt32LE(j) !== 0x08074b50 &&
             buf.readUInt32LE(j) !== 0x04034b50 && buf.readUInt32LE(j) !== 0x02014b50) j++;
      csize = j - start;
    }
    const raw = buf.slice(start, start + csize);
    try { files[name] = method === 0 ? raw : zlib.inflateRawSync(raw); } catch (e) {}
    i = start + csize;
  }
  return files;
}

const dec = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
                  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));

const files = unzip(fs.readFileSync(process.argv[2]));

// Shared strings: one <si> may hold several <t> runs; join them.
const ssXml = (files['xl/sharedStrings.xml'] || Buffer.from('')).toString('utf8');
const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m =>
  dec([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));

const wb = (files['xl/workbook.xml'] || Buffer.from('')).toString('utf8');
const sheetNames = [...wb.matchAll(/<sheet[^>]*name="([^"]*)"/g)].map(m => dec(m[1]))
                     .filter(n => !n.startsWith('_xlnm'));

// Excel serial fraction of a day -> m:ss
const dur = v => {
  const total = Math.round(v * 86400);
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
};

const out = {};
sheetNames.forEach((sheetName, idx) => {
  const xml = (files[`xl/worksheets/sheet${idx + 1}.xml`] || Buffer.from('')).toString('utf8');
  const rows = [];
  for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cm of rm[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col = cm[1], attrs = cm[2];
      const vm = cm[3].match(/<v>([\s\S]*?)<\/v>/);
      if (!vm) continue;
      cells[col] = /t="s"/.test(attrs) ? shared[+vm[1]] : vm[1];
    }
    if (Object.keys(cells).length) rows.push({ r: +rm[1], cells });
  }
  out[sheetName] = rows;
});

// Running Order: header at row 4, data from row 5.
const ro = out['Running Order'] || [];
const hdrRow = ro.find(r => r.cells.A === '#');
const cols = hdrRow ? Object.fromEntries(Object.entries(hdrRow.cells).map(([k, v]) => [k, v])) : {};
const tracks = ro.filter(r => hdrRow && r.r > hdrRow.r && r.cells.B).map(r => {
  const o = {};
  for (const [col, name] of Object.entries(cols)) {
    let v = r.cells[col];
    if (v === undefined) continue;
    if (name === 'Length' || name === 'Runs to') v = dur(parseFloat(v));
    else if (name === '#' || name === 'Year' || name === 'BPM') v = Number(v);
    o[name] = v;
  }
  return o;
});

const result = { source: process.argv[2].split(/[\\/]/).pop(), sheets: sheetNames, tracks,
                 otherSheets: Object.fromEntries(sheetNames.filter(n => n !== 'Running Order')
                   .map(n => [n, (out[n] || []).map(r => Object.values(r.cells))])) };
fs.writeFileSync(process.argv[3], JSON.stringify(result, null, 2));
console.log(`sheets: ${sheetNames.join(', ')}`);
console.log(`tracks: ${tracks.length}`);
console.log('columns:', Object.values(cols).join(' | '));
console.log('\nfirst 3:');
tracks.slice(0, 3).forEach(t => console.log(' ', JSON.stringify(t)));
console.log('\nMix vocabulary:');
const mixes = {};
tracks.forEach(t => { const m = (t.Mix || '').trim(); if (m) mixes[m] = (mixes[m] || 0) + 1; });
Object.entries(mixes).sort((a, b) => b[1] - a[1]).forEach(([m, n]) => console.log(`  ${n}x  ${m}`));
