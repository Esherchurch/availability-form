/* ===================================================================
   EGBC Present - reading a PowerPoint file (F-242)
   ===================================================================

   A .pptx is a zip of XML files. This reads, with nothing but Node's own
   zlib (no packages):
     - the slides, in the order the deck shows them (ppt/presentation.xml)
     - each slide's SPEAKER NOTES: the text of the notes page's body
       placeholder (never its slide number or slide picture)
     - whether a slide is hidden (it is left out, as PowerPoint does)

     readPptx(buffer) -> { slides: [{ index, file, hidden, notes }], shown: n }

   The pictures of the slides are made by LibreOffice in the converter
   (converter/server.mjs); this file only reads. makeZip() writes a plain
   (stored, uncompressed) zip: the tests build invented decks with it.
   =================================================================== */
import zlib from 'node:zlib';

/* ---- zip: read ---- */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('This is not a PowerPoint file (no zip directory).');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('This PowerPoint file is damaged.');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    files.set(name, { method, csize, local });
    p += 46 + nlen + xlen + clen;
  }
  return {
    names: () => [...files.keys()],
    has: (n) => files.has(n),
    text(n) {
      const f = files.get(n); if (!f) return null;
      const lp = f.local, start = lp + 30 + buf.readUInt16LE(lp + 26) + buf.readUInt16LE(lp + 28);
      const raw = buf.slice(start, start + f.csize);
      return (f.method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
    }
  };
}

/* ---- zip: write (stored), for the tests' invented decks ---- */
function crc32(b) { let c, crc = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) { c = (crc ^ b[i]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
export function makeZip(entries) {
  const locals = [], centrals = []; let off = 0;
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8'), nm = Buffer.from(name, 'utf8'), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, nm, data); centrals.push(ch, nm); off += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}

/* ---- XML, just enough ---- */
const unxml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function rels(zip, path) {
  const dir = path.slice(0, path.lastIndexOf('/')), file = path.slice(path.lastIndexOf('/') + 1);
  const x = zip.text(dir + '/_rels/' + file + '.rels') || '', out = {};
  for (const m of x.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/\bId="([^"]+)"/) || [])[1], t = (m[0].match(/\bTarget="([^"]+)"/) || [])[1], ty = (m[0].match(/\bType="([^"]+)"/) || [])[1] || '';
    if (id && t) out[id] = { target: resolve(dir, t), type: ty };
  }
  return out;
}
function resolve(dir, t) {
  if (t.startsWith('/')) return t.slice(1);
  const parts = dir.split('/');
  for (const seg of t.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
}
/* The notes page's own words: the body placeholder's paragraphs only. */
function notesText(xml) {
  const out = [];
  for (const sp of xml.split(/<p:sp>|<p:sp\s/).slice(1)) {
    const ph = (sp.match(/<p:ph\b[^>]*>/) || [''])[0];
    if (!/type="body"/.test(ph)) continue;
    for (const para of sp.split(/<\/a:p>/)) {
      const t = [...para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => unxml(m[1])).join('');
      if (t.trim()) out.push(t.trim());
    }
  }
  return out.join('\n');
}

export function readPptx(buf) {
  const zip = readZip(buf);
  const pres = zip.text('ppt/presentation.xml');
  if (!pres) throw new Error('This is not a PowerPoint file (.pptx). Save it as PowerPoint first.');
  const presRels = rels(zip, 'ppt/presentation.xml');
  const ids = [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
  const slides = ids.map((rid, i) => {
    const file = (presRels[rid] || {}).target || '';
    const xml = zip.text(file) || '';
    const hidden = /<p:sld\b[^>]*\bshow="0"/.test(xml);
    const nrel = Object.values(rels(zip, file)).find((r) => /notesSlide$/.test(r.type));
    const notes = nrel && zip.has(nrel.target) ? notesText(zip.text(nrel.target)) : '';
    return { index: i + 1, file, hidden, notes };
  });
  return { slides, shown: slides.filter((s) => !s.hidden).length };
}

/* An invented deck for the tests: slides with titles and notes (some with
   none), one hidden. The XML is the shape PowerPoint writes. */
export function inventDeck(list) {
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const e = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const files = [['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['ppt/presentation.xml', '<?xml version="1.0"?><p:presentation ' + NS + '><p:sldIdLst>' + list.map((s, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>').join('') + '</p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + list.map((s, i) => '<Relationship Id="rId' + (i + 2) + '" Type="' + RT + 'slide" Target="slides/slide' + (i + 1) + '.xml"/>').join('') + '</Relationships>']];
  list.forEach((s, i) => {
    const n = i + 1;
    files.push(['ppt/slides/slide' + n + '.xml', '<?xml version="1.0"?><p:sld ' + NS + (s.hidden ? ' show="0"' : '') + '><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>' + e(s.title) + '</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>']);
    files.push(['ppt/slides/_rels/slide' + n + '.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + (s.notes ? '<Relationship Id="rId9" Type="' + RT + 'notesSlide" Target="../notesSlides/notesSlide' + n + '.xml"/>' : '') + '</Relationships>']);
    if (s.notes) files.push(['ppt/notesSlides/notesSlide' + n + '.xml', '<?xml version="1.0"?><p:notes ' + NS + '><p:cSld><p:spTree>' +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp>' +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody>' + s.notes.split('\n').map((l) => '<a:p><a:r><a:t>' + e(l) + '</a:t></a:r></a:p>').join('') + '</p:txBody></p:sp>' +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum" idx="5"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>' + n + '</a:t></a:r></a:p></p:txBody></p:sp>' +
      '</p:spTree></p:cSld></p:notes>']);
  });
  return makeZip(files);
}
