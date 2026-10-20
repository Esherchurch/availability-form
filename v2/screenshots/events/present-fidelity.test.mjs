/* PRESENT: DO THE SLIDES LOOK AS THEY DO IN POWERPOINT? (F-250)
   An invented deck that PowerPoint made (fixtures/present-fidelity.pptx),
   and PowerPoint's own pictures of its slides (fixtures/present-fidelity-
   ppt-s<n>.png, exported by PowerPoint at 1920x1080 - tools/pptx-reference.ps1).
   The deck holds the two traps found on a real deck (20 Oct): a layout whose
   picture placeholder carries a sample picture the slide never uses (the
   lighthouse), and a slide that hides the master's background graphics.

   1. The converter's tidy-up (converter/pptx.mjs prepareForRender) on its
      own - no LibreOffice needed: the sample picture comes off; embedded
      fonts named with their style ("Invented Sans Bold") get the font's
      own name, set bold, and the deck's font list matches; the rewritten
      zip keeps every other part byte for byte.
   2. With the real LibreOffice (SOFFICE, or C:/Program Files/LibreOffice,
      or soffice on the PATH): the converter's way (writeForRender ->
      soffice -> PDF), each page drawn at 1920 px (pdf.js in Chrome stands in
      for pdftoppm), then compared with PowerPoint's picture: shrunk to
      192x108, the share of pixels clearly different. And the same WITHOUT
      the tidy-up, which must fail: the check bites.
   No LibreOffice here: part 2 says SKIPPED, and why.
     node screenshots/events/present-fidelity.test.mjs */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import puppeteer from 'puppeteer-core';
import { readZip, makeZip, prepareForRender, writeZipWith } from '../../converter/pptx.mjs';
import { writeForRender } from '../../converter/convert.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const FIX = path.join(HERE, 'fixtures');
const DECK = path.join(FIX, 'present-fidelity.pptx');
const LIMIT = 6;            /* % of pixels clearly different: above this, a slide does not match */
const results = [];
const ok = (name, pass, detail) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || detail === undefined ? '' : '\n          ' + String(detail).slice(0, 600))); };

/* ---------- 1. the tidy-up, on its own ---------- */
const deckBuf = fs.readFileSync(DECK);
const prep = prepareForRender(deckBuf);
const layoutsBefore = readZip(deckBuf).names().filter((n) => /slideLayouts\/[^/]+\.xml$/.test(n)).filter((n) => /<p:ph[^>]*type="pic"[\s\S]*?<a:blipFill/.test(readZip(deckBuf).text(n)));
ok('1. THE DECK HAS THE TRAP: a layout picture placeholder with a sample picture (' + layoutsBefore.length + ')', layoutsBefore.length >= 1);
ok('   the tidy-up takes it off', /layout sample pictures taken off: [1-9]/.test(prep.report.join(' | ')) && [...prep.changes.keys()].some((n) => layoutsBefore.includes(n)) && ![...prep.changes].some(([n, b]) => layoutsBefore.includes(n) && /<p:ph[^>]*type="pic"[\s\S]*?<a:blipFill/.test(b.toString('utf8'))), prep.report.join(' | '));
ok('   and leaves the slides\u2019 own XML alone', ![...prep.changes.keys()].some((n) => /^ppt\/slides\//.test(n)), [...prep.changes.keys()].join(', '));

/* An invented embedded font: an EOT header saying family "Invented Sans",
   weight 700 - as Canva writes "Canva Sans Bold". */
function inventedEot(family, weight) {
  const name = Buffer.from(family, 'utf16le'), h = Buffer.alloc(84 + 4 * 4 + name.length);
  h.writeUInt32LE(h.length, 0); h.writeUInt32LE(0, 4); h.writeUInt32LE(0x00020002, 8); h.writeUInt32LE(0, 12); h.writeUInt32LE(weight, 28); h.writeUInt16LE(0x504C, 34);
  h.writeUInt16LE(name.length, 82); name.copy(h, 84); return h;
}
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const fontDeck = makeZip([
  ['ppt/presentation.xml', '<?xml version="1.0"?><p:presentation ' + NS + '><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:embeddedFontLst>' +
    '<p:embeddedFont><p:font typeface="Invented Sans" charset="0"/><p:regular r:id="rId8"/></p:embeddedFont>' +
    '<p:embeddedFont><p:font typeface="Invented Sans Bold" charset="0"/><p:regular r:id="rId9"/><p:bold r:id="rId10"/></p:embeddedFont></p:embeddedFontLst></p:presentation>'],
  ['ppt/_rels/presentation.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
    '<Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font1.fntdata"/><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font2.fntdata"/><Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font3.fntdata"/></Relationships>'],
  ['ppt/slides/slide1.xml', '<?xml version="1.0"?><p:sld ' + NS + '><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:rPr lang="en-GB" sz="4000" b="0"><a:latin typeface="Invented Sans Bold"/><a:sym typeface="Invented Sans Bold"/></a:rPr><a:t>Heading</a:t></a:r>' +
    '<a:r><a:rPr lang="en-GB" sz="2000"><a:latin typeface="Invented Sans"/></a:rPr><a:t>Body</a:t></a:r><a:r><a:rPr lang="en-GB"/><a:t>plain</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'],
  ['ppt/fonts/font1.fntdata', inventedEot('Invented Sans', 400)], ['ppt/fonts/font2.fntdata', inventedEot('Invented Sans', 700)], ['ppt/fonts/font3.fntdata', inventedEot('9', 700)],
  ['ppt/media/clip.mp4', Buffer.alloc(5000, 7)]
]);
const fp = prepareForRender(fontDeck);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-fid-'));
const outDeck = path.join(tmp, 'tidied.pptx');
const fd = fs.openSync(outDeck, 'w'); writeZipWith(fontDeck, fp.changes, fd); fs.closeSync(fd);
const z2 = readZip(fs.readFileSync(outDeck)), s1 = z2.text('ppt/slides/slide1.xml'), pr = z2.text('ppt/presentation.xml');
ok('2. EMBEDDED FONT NAMED WITH ITS STYLE: "Invented Sans Bold" becomes the font\u2019s own "Invented Sans", bold', /<a:rPr lang="en-GB" sz="4000" b="1"><a:latin typeface="Invented Sans"\/><a:sym typeface="Invented Sans"\/>/.test(s1) && !/Invented Sans Bold/.test(s1), s1);
ok('   text already in "Invented Sans" is left as it was (not made bold)', /<a:rPr lang="en-GB" sz="2000"><a:latin typeface="Invented Sans"\/>/.test(s1) && /<a:rPr lang="en-GB"\/>/.test(s1), s1);
ok('   the deck\u2019s font list matches: one "Invented Sans", its bold face the "Bold" file', /<p:embeddedFontLst><p:embeddedFont><p:font typeface="Invented Sans" charset="0"\/><p:regular r:id="rId8"\/><p:bold r:id="rId9"\/><\/p:embeddedFont><\/p:embeddedFontLst>/.test(pr), pr.slice(pr.indexOf('<p:embeddedFontLst>')));
ok('   the video is emptied (the slides are pictures)', z2.raw('ppt/media/clip.mp4').length === 0 && /video\/sound emptied: 1/.test(fp.report.join(' | ')), fp.report.join(' | '));
ok('   every other part copied byte for byte', ['ppt/_rels/presentation.xml.rels', 'ppt/fonts/font1.fntdata', 'ppt/fonts/font2.fntdata', 'ppt/fonts/font3.fntdata'].every((n) => Buffer.compare(z2.raw(n), readZip(fontDeck).raw(n)) === 0));
const plain = prepareForRender(makeZip([['ppt/presentation.xml', '<?xml version="1.0"?><p:presentation ' + NS + '/>']]));
ok('   a deck with nothing to tidy is left untouched', plain.changes.size === 0 && plain.report.length === 0, plain.report.join(' | '));

/* ---------- 2. with the real LibreOffice ---------- */
const SOFFICE = [process.env.SOFFICE, 'C:/Program Files/LibreOffice/program/soffice.exe', '/usr/bin/soffice', '/usr/lib/libreoffice/program/soffice'].find((p) => p && fs.existsSync(p));
const run = promisify(execFile);
if (!SOFFICE) {
  console.log('\n  SKIPPED  part 2 (LibreOffice against PowerPoint): LibreOffice is not on this computer. Set SOFFICE to its soffice.');
} else {
  /* LibreOffice's own settings folder, short (a long path made it crash on Windows) */
  const profile = path.join(os.tmpdir(), 'lo-egbc-fid').replace(/\\/g, '/');
  const toPdf = async (file) => { await run(SOFFICE, ['--headless', '--norestore', '-env:UserInstallation=file:///' + profile.replace(/^\//, ''), '--convert-to', 'pdf', '--outdir', path.dirname(file), file], { timeout: 300000 }); return file.replace(/\.pptx$/, '.pdf'); };
  const fixed = path.join(tmp, 'fixed.pptx'), raw = path.join(tmp, 'raw.pptx');
  const report = writeForRender(deckBuf, fixed); fs.copyFileSync(DECK, raw);
  const pdfFixed = await toPdf(fixed), pdfRaw = await toPdf(raw);
  const N = fs.readdirSync(FIX).filter((f) => /^present-fidelity-ppt-s\d+\.png$/.test(f)).length;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<html><body></body></html>');
    /* pdf.js (a public library, fetched read-only) draws the PDF; nothing is sent */
    await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' });
    const score = (pdf) => page.evaluate(async (b64, refs) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const doc = await pdfjsLib.getDocument({ data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) }).promise;
      const small = (src) => { const c = document.createElement('canvas'); c.width = 192; c.height = 108; c.getContext('2d').drawImage(src, 0, 0, 192, 108); return c.getContext('2d').getImageData(0, 0, 192, 108).data; };
      const out = { pages: doc.numPages, scores: [] };
      for (let i = 1; i <= doc.numPages; i++) {
        const pg = await doc.getPage(i), v1 = pg.getViewport({ scale: 1 }), v = pg.getViewport({ scale: 1920 / v1.width });
        const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
        await pg.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
        const img = new Image(); await new Promise((ok) => { img.onload = ok; img.src = 'data:image/png;base64,' + refs[i - 1]; });
        const A = small(c), R = small(img); let bad = 0;
        for (let k = 0; k < A.length; k += 4) if (Math.abs(A[k] - R[k]) > 48 || Math.abs(A[k + 1] - R[k + 1]) > 48 || Math.abs(A[k + 2] - R[k + 2]) > 48) bad++;
        out.scores.push(Math.round(bad / (192 * 108) * 1000) / 10);
      }
      return out;
    }, fs.readFileSync(pdf).toString('base64'), Array.from({ length: N }, (_, i) => fs.readFileSync(path.join(FIX, 'present-fidelity-ppt-s' + (i + 1) + '.png')).toString('base64')));
    const f = await score(pdfFixed), r = await score(pdfRaw);
    console.log('\n  LibreOffice ' + SOFFICE + '\n  tidy-up: ' + report.join(' | ') + '\n  % differing from PowerPoint, with the tidy-up: ' + f.scores.join(', ') + '   without: ' + r.scores.join(', '));
    ok('3. LIBREOFFICE, THE CONVERTER\u2019S WAY: every slide as PowerPoint draws it (under ' + LIMIT + '% different)', f.pages === N && f.scores.every((s) => s < LIMIT), J({ pages: f.pages, scores: f.scores }));
    ok('   slide 1: no sample picture where PowerPoint shows none', f.scores[0] < LIMIT, f.scores[0]);
    ok('   slide 2: the background graphics stay hidden', f.scores[1] < LIMIT, f.scores[1]);
    ok('   WITHOUT THE TIDY-UP slide 1 fails (the check bites: the sample picture is back)', r.scores[0] >= LIMIT * 2, r.scores[0]);
  } finally { await browser.close(); }
}
fs.rmSync(tmp, { recursive: true, force: true });
function J(x) { return JSON.stringify(x); }
console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
process.exit(results.every(Boolean) ? 0 : 1);
