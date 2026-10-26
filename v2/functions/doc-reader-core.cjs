/* ===================================================================
   THE RISK ASSESSMENT ENGINE, the document reader's parts that need no
   network (F-280 section 2, H&S step 1): moved unchanged from
   sg-requirements-core.cjs, which still gives them under the same names.
   Claude reads PDFs and pictures itself; a Word document is turned into
   its words here first.
     fileKind(type, name)   'pdf' | 'image' | 'docx' | ''
     docxText(buffer)       a Word document's words, a paragraph a line
     MAX_BYTES              7 MB a file
     newOnly(items, had)    what isn't already on a list (case, spacing and
                            punctuation aside), and how many repeated
   =================================================================== */
'use strict';
const zlib = require('node:zlib');

const MAX_BYTES = 7 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function fileKind(type, name) {
  type = String(type || '').toLowerCase(); name = String(name || '').toLowerCase();
  if (type === 'application/pdf' || /\.pdf$/.test(name)) return 'pdf';
  if (IMAGE_TYPES.includes(type)) return 'image';
  if (type === DOCX || /\.docx$/.test(name)) return 'docx';
  return '';
}

/* a Word document is a zip; its words are in word/document.xml */
function docxText(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('not a Word document');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16), xml = null;
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('a damaged Word document');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    if (name === 'word/document.xml') {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), raw = buf.slice(start, start + csize);
      xml = (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
    }
    p += 46 + nlen + xlen + clen;
  }
  if (xml === null) throw new Error('not a Word document');
  const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []).map((para) => unxml((para.match(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('')))
    .filter((l) => l.trim()).join('\n');
}

/* a question already on the list, in other spacing, case or punctuation, is a repeat */
const sameQ = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function newOnly(items, already) {
  const had = new Set((already || []).map(sameQ)), out = [];
  let repeats = 0;
  for (const it of items || []) { const k = sameQ(it.q); if (!k || had.has(k)) { repeats++; continue; } had.add(k); out.push(it); }
  return { items: out, repeats };
}

module.exports = { MAX_BYTES, IMAGE_TYPES, DOCX, fileKind, docxText, newOnly };
