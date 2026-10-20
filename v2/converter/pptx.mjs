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
import fs from 'node:fs';
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
    raw(n) {
      const f = files.get(n); if (!f) return null;
      const lp = f.local, start = lp + 30 + buf.readUInt16LE(lp + 26) + buf.readUInt16LE(lp + 28);
      const raw = buf.slice(start, start + f.csize);
      return f.method === 8 ? zlib.inflateRawSync(raw) : raw;
    },
    text(n) { const b = this.raw(n); return b === null ? null : b.toString('utf8'); }
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

/* ---- video and sound on the slides (F-251) ----
   readMedia(buf) -> [{ slide (1-based, in the deck), shown (0-based, as
   presented), k, kind 'video'|'audio', part 'ppt/media/media1.mp4' | null,
   link 'https://...' | null, youtube 'id' | null, rect [x, y, w, h] as
   fractions of the slide, start 'click'|'auto', loop, volume 0..1 }]
   Embedded media: the p14:media relationship (the file in the deck).
   Linked media (Insert > Online video, or a linked file): a:videoFile with
   an external r:link - kept as a link; YouTube ones play in step too. */
export function readMedia(buf) {
  const zip = readZip(buf), pres = zip.text('ppt/presentation.xml') || '', presRels = rels(zip, 'ppt/presentation.xml');
  const sz = pres.match(/<p:sldSz\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/), W = sz ? +sz[1] : 12192000, H = sz ? +sz[2] : 6858000;
  const ids = [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map((m) => m[1]);
  const out = []; let shown = -1;
  ids.forEach((rid, i) => {
    const file = (presRels[rid] || {}).target || '', xml = zip.text(file) || '';
    if (/<p:sld\b[^>]*\bshow="0"/.test(xml)) return;
    shown++;
    const r = rawRels(zip, file), timing = (xml.match(/<p:timing>[\s\S]*<\/p:timing>/) || [''])[0];
    let k = 0;
    for (const m of xml.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>/g)) {
      const b = m[1];
      const vf = b.match(/<a:(videoFile|audioFile|quickTimeFile|wavAudioFile)\b[^>]*r:(?:link|embed)="([^"]+)"/), me = b.match(/<p14:media\b[^>]*r:embed="([^"]+)"/);
      if (!vf && !me) continue;
      const emb = me && r[me[1]], lnk = vf && r[vf[2]];
      const part = emb && emb.mode !== 'External' ? resolve(file.slice(0, file.lastIndexOf('/')), emb.target) : null;
      const link = !part && lnk && lnk.mode === 'External' ? lnk.target : null;
      if (!part && !link) continue;
      const off = b.match(/<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/), ext = b.match(/<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/);
      const spid = (b.match(/<p:cNvPr\b[^>]*\bid="(\d+)"/) || [])[1];
      /* its timing: on click (delay "indefinite") or with the slide; loop; volume */
      const node = spid ? (timing.match(new RegExp('<p:(?:video|audio)>(?:(?!</p:(?:video|audio)>)[\\s\\S])*?<p:spTgt spid="' + spid + '"[\\s\\S]*?</p:(?:video|audio)>')) || [''])[0] : '';
      const cmn = (node.match(/<p:cMediaNode\b[^>]*>/) || [''])[0], ctn = (node.match(/<p:cTn\b[^>]*>/) || [''])[0];
      /* the step that plays it: "clickEffect" waits for a click; "withEffect"/"afterEffect" go by themselves */
      let auto = false;
      for (const pm of timing.matchAll(/cmd="playFrom[^"]*"/g)) {
        const after = timing.slice(pm.index, pm.index + 400);
        if (!new RegExp('<p:spTgt spid="' + spid + '"').test(after)) continue;
        const before = timing.slice(0, pm.index), nt = before.lastIndexOf('nodeType="');
        auto = nt >= 0 && !/^nodeType="clickEffect"/.test(before.slice(nt));
        break;
      }
      const vol = cmn.match(/vol="(\d+)"/);
      const yt = link && (link.match(/(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{6,20})/) || [])[1];
      out.push({ slide: i + 1, shown, k: k++, kind: /audio|wav/i.test((vf && vf[1]) || '') || /\.(mp3|m4a|wav|wma|aac)$/i.test(part || '') ? 'audio' : 'video', part, link, youtube: yt || null,
        rect: off && ext ? [+off[1] / W, +off[2] / H, +ext[1] / W, +ext[2] / H].map((v) => Math.round(v * 10000) / 10000) : [0, 0, 1, 1],
        start: auto ? 'auto' : 'click', loop: /repeatCount="indefinite"/.test(ctn), volume: vol ? Math.min(1, +vol[1] / 100000) : 1 });
    }
  });
  return out;
}
function rawRels(zip, path) {
  const dir = path.slice(0, path.lastIndexOf('/')), f = path.slice(path.lastIndexOf('/') + 1), x = zip.text(dir + '/_rels/' + f + '.rels') || '', o = {};
  for (const m of x.matchAll(/<Relationship\b[^>]*>/g)) {
    const g = (k) => (m[0].match(new RegExp('\\b' + k + '="([^"]*)"')) || [])[1];
    o[g('Id')] = { target: unxml(g('Target') || ''), mode: g('TargetMode') || '' };
  }
  return o;
}
/* What an MP4 is: plays in every browser (H.264/AAC), streams at once (its
   index, moov, before the data), how long, how heavy. */
export function mp4Facts(b) {
  const f = { boxes: [], codecs: [], moovFirst: false, seconds: 0, mbps: 0 };
  try {
    let p = 0;
    while (p + 8 <= b.length && f.boxes.length < 50) { let s = b.readUInt32BE(p); const t = b.toString('latin1', p + 4, p + 8); if (s === 1) s = Number(b.readBigUInt64BE(p + 8)); if (s === 0) s = b.length - p; if (s < 8) break; f.boxes.push(t); p += s; }
    f.moovFirst = f.boxes.indexOf('moov') >= 0 && (f.boxes.indexOf('mdat') < 0 || f.boxes.indexOf('moov') < f.boxes.indexOf('mdat'));
    const mv = b.indexOf(Buffer.from('moov')); if (mv < 0) return f;
    const s = b.slice(mv, Math.min(b.length, mv + 4000000)).toString('latin1');
    f.codecs = [...new Set(s.match(/avc1|avc3|hvc1|hev1|mp4a|av01|vp09|ac-3|ec-3/g) || [])];
    const h = b.indexOf(Buffer.from('mvhd'), mv); if (h > 0) { const v = b[h + 4]; const ts = v ? b.readUInt32BE(h + 24) : b.readUInt32BE(h + 16), du = v ? Number(b.readBigUInt64BE(h + 28)) : b.readUInt32BE(h + 20); if (ts) f.seconds = du / ts; }
    if (f.seconds) f.mbps = Math.round(b.length * 8 / f.seconds / 1e5) / 10;
  } catch (e) {}
  return f;
}
/* Plays in every browser as it is: H.264 video (with AAC sound), or MP3/AAC sound. */
export function browserPlays(part, facts) {
  if (/\.(mp3|m4a|aac)$/i.test(part)) return true;
  if (!/\.(mp4|m4v|mov)$/i.test(part)) return false;
  const video = facts.codecs.filter((c) => /avc|hvc|hev|av01|vp09/.test(c));
  if (facts.codecs.some((c) => /ac-3|ec-3/.test(c))) return false;
  return video.length ? video.every((c) => c === 'avc1' || c === 'avc3') : facts.codecs.includes('mp4a');
}

/* ---- before LibreOffice draws it: where it and PowerPoint differ (20 Oct) ----
   Found on real decks (FINDINGS F-250):
   1. A LAYOUT'S PICTURE PLACEHOLDER with a sample picture (a lighthouse on
      "Title, Photo 1"): PowerPoint never draws a layout's placeholders on a
      slide; LibreOffice drew the sample picture. -> picture fills come off
      every placeholder in the layouts and masters (a slide's own pictures
      are in the slide, untouched).
   2. EMBEDDED FONTS NAMED WITH THEIR STYLE: the slides ask for "Canva Sans
      Bold"; the font inside the file calls itself "Canva Sans", weight
      bold. PowerPoint matches them through the deck's embedded-font list;
      LibreOffice found no "Canva Sans Bold" and fell back to Arial Black,
      and the words overlapped. -> the name becomes the font's own family,
      with bold/italic set on the text.
   3. VIDEO AND SOUND: the slides become pictures, so the media files are
      emptied - a 700 MB deck with a video is then small for LibreOffice.
   prepareForRender(buf) -> { changes: Map(part -> Buffer), report: [...] };
   writeZipWith(buf, changes, fd) writes the deck with those parts changed
   and every other part copied byte for byte. */
const LAYOUT_PART = /^ppt\/(slideLayouts|slideMasters)\/[^/]+\.xml$/;
const TEXT_PART = /^ppt\/(slides|slideLayouts|slideMasters|theme)\/[^/]+\.xml$/;
const MEDIA_PART = /^ppt\/media\/[^/]+\.(mp4|m4v|mov|avi|wmv|mpg|mpeg|mkv|webm|mp3|m4a|wav|wma|aac)$/i;
/* An EOT (embedded font) header: its family name, weight and italic. */
export function eotFace(b) {
  try {
    const weight = b.readUInt32LE(28), italic = b[27] === 1;
    let o = 80; const str = () => { o += 2; const sz = b.readUInt16LE(o); o += 2; const s = b.slice(o, o + sz).toString('utf16le'); o += sz; return s; };
    return { family: str().replace(/\0/g, '').trim(), weight, italic };
  } catch (e) { return null; }
}
export function placeholderPicturesOff(xml) {
  let n = 0;
  const out = xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (sp) => {
    if (!/<p:ph\b/.test(sp)) return sp;
    return sp.replace(/(<p:spPr\b[^>]*>[\s\S]*?)<a:blipFill\b[\s\S]*?<\/a:blipFill>/, (m, pre) => { n++; return pre + '<a:noFill/>'; });
  });
  return { xml: out, n };
}
export function fontNamesFixed(xml, map) {
  let n = 0;
  /* a run's properties: the name becomes the family, with bold/italic set */
  let out = xml.replace(/<a:(rPr|defRPr|endParaRPr)((?:\s[^>]*)?)(?<!\/)>([\s\S]*?)(<\/a:\1>)/g, (m, tag, attrs, inner, close) => {
    const tf = (inner.match(/<a:latin\b[^>]*typeface="([^"]+)"/) || [])[1], f = tf && map[tf];
    if (!f) return m;
    n++;
    let a = attrs;
    if (f.bold) a = /\bb="/.test(a) ? a.replace(/\bb="[^"]*"/, 'b="1"') : a + ' b="1"';
    if (f.italic) a = /\bi="/.test(a) ? a.replace(/\bi="[^"]*"/, 'i="1"') : a + ' i="1"';
    return '<a:' + tag + a + '>' + inner + close;
  });
  /* every mention (runs, the theme's fonts): the family name */
  out = out.replace(/(<a:(?:latin|ea|cs|sym)\b[^>]*typeface=")([^"]+)(")/g, (m, a, tf, b) => (map[tf] ? a + map[tf].family + b : m));
  return { xml: out, n };
}
/* The deck's own list of embedded fonts, to match: "Canva Sans Bold"'s file
   becomes the bold face of "Canva Sans" (LibreOffice loads an embedded font
   under the name the list gives it, and only when the slides use that name). */
export function embeddedListFixed(pres, map) {
  const entries = [...pres.matchAll(/<p:embeddedFont>([\s\S]*?)<\/p:embeddedFont>/g)].map((m) => ({ whole: m[0], tf: unxml((m[1].match(/<p:font\b[^>]*typeface="([^"]+)"/) || [])[1] || ''), font: (m[1].match(/<p:font\b[^>]*\/>/) || [''])[0], faces: Object.fromEntries([...m[1].matchAll(/<p:(regular|bold|italic|boldItalic) r:id="([^"]+)"\/>/g)].map((x) => [x[1], x[2]])) }));
  const byFamily = {};
  for (const e of entries) {
    const f = map[e.tf];
    const fam = f ? f.family : e.tf;
    const target = byFamily[fam] || (byFamily[fam] = { font: e.font.replace(/typeface="[^"]*"/, 'typeface="' + fam.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"'), faces: {} });
    for (const [style, rid] of Object.entries(e.faces)) {
      /* a "Bold"-named family's regular file is its bold face */
      const as = f && style === 'regular' ? (f.bold && f.italic ? 'boldItalic' : f.bold ? 'bold' : f.italic ? 'italic' : 'regular') : (f && style === 'bold' ? null : style);
      if (as && !target.faces[as]) target.faces[as] = rid;
    }
  }
  const order = ['regular', 'bold', 'italic', 'boldItalic'];
  const list = Object.values(byFamily).map((t) => '<p:embeddedFont>' + t.font + order.filter((s) => t.faces[s]).map((s) => '<p:' + s + ' r:id="' + t.faces[s] + '"/>').join('') + '</p:embeddedFont>').join('');
  return pres.replace(/<p:embeddedFontLst>[\s\S]*?<\/p:embeddedFontLst>/, '<p:embeddedFontLst>' + list + '</p:embeddedFontLst>');
}
export function prepareForRender(buf) {
  const zip = readZip(buf), changes = new Map(), report = [];
  /* 2. the embedded fonts whose PowerPoint name is not the font's own */
  const map = {};
  const pres = zip.text('ppt/presentation.xml') || '', presRels = rels(zip, 'ppt/presentation.xml');
  for (const ef of pres.matchAll(/<p:embeddedFont>([\s\S]*?)<\/p:embeddedFont>/g)) {
    const tf = unxml((ef[1].match(/<p:font\b[^>]*typeface="([^"]+)"/) || [])[1] || '');
    const rid = (ef[1].match(/<p:(?:regular|bold|italic|boldItalic) r:id="([^"]+)"/) || [])[1], part = rid && (presRels[rid] || {}).target;
    const face = part && zip.has(part) ? eotFace(zip.raw(part)) : null;
    if (!tf || !face || !face.family || face.family === tf || !tf.startsWith(face.family + ' ')) continue;
    const rest = tf.slice(face.family.length + 1);
    map[tf] = { family: face.family, bold: face.weight >= 600 || /bold|black|heavy/i.test(rest), italic: face.italic || /italic|oblique/i.test(rest) };
  }
  if (Object.keys(map).length) {
    report.push('fonts renamed: ' + Object.entries(map).map(([k, v]) => k + ' -> ' + v.family + (v.bold ? ' (bold)' : '') + (v.italic ? ' (italic)' : '')).join('; '));
    changes.set('ppt/presentation.xml', Buffer.from(embeddedListFixed(pres, map), 'utf8'));
  }
  let pics = 0, runs = 0, media = 0;
  for (const name of zip.names()) {
    if (MEDIA_PART.test(name)) { changes.set(name, Buffer.alloc(0)); media++; continue; }
    if (!TEXT_PART.test(name)) continue;
    let xml = zip.text(name), changed = false;
    if (LAYOUT_PART.test(name)) { const r = placeholderPicturesOff(xml); if (r.n) { xml = r.xml; pics += r.n; changed = true; } }
    if (Object.keys(map).length) { const r = fontNamesFixed(xml, map); if (r.xml !== xml) { xml = r.xml; runs += r.n; changed = true; } }
    if (changed) changes.set(name, Buffer.from(xml, 'utf8'));
  }
  if (pics) report.push('layout sample pictures taken off: ' + pics);
  if (runs) report.push('text runs given the font\u2019s own name: ' + runs);
  if (media) report.push('video/sound emptied: ' + media);
  return { changes, report };
}
/* The deck again, to a file: the changed parts stored, the rest copied as
   they are (no recompressing a 700 MB video). Throws on a zip it does not
   understand (ZIP64); the converter then renders the original. */
export function writeZipWith(buf, changes, fd) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xFFFF || p === 0xFFFFFFFF) throw new Error('ZIP64');
  let off = 0; const centrals = [];
  const put = (b) => { fs.writeSync(fd, b); off += b.length; };
  for (let n = 0; n < count; n++) {
    const clen0 = 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const central = Buffer.from(buf.slice(p, p + clen0));
    const nlen = central.readUInt16LE(28), name = central.slice(46, 46 + nlen).toString('utf8'), lp = central.readUInt32LE(42);
    if (lp === 0xFFFFFFFF || central.readUInt32LE(20) === 0xFFFFFFFF) throw new Error('ZIP64');
    const start = off;
    if (changes.has(name)) {
      const data = changes.get(name), nm = Buffer.from(name, 'utf8'), crc = crc32(data);
      const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(central.readUInt16LE(8) & 0x0800, 6); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
      put(lh); put(nm); put(data);
      central.writeUInt16LE(central.readUInt16LE(8) & 0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    } else {
      const flags = buf.readUInt16LE(lp + 6), csize = central.readUInt32LE(20);
      let end = lp + 30 + buf.readUInt16LE(lp + 26) + buf.readUInt16LE(lp + 28) + csize;
      if (flags & 8) end += buf.readUInt32LE(end) === 0x08074b50 ? 16 : 12;
      for (let s = lp; s < end; s += 64 * 1048576) put(buf.slice(s, Math.min(end, s + 64 * 1048576)));
    }
    central.writeUInt32LE(start, 42); centrals.push(central);
    p += clen0;
  }
  const cd = Buffer.concat(centrals), tail = Buffer.alloc(22);
  tail.writeUInt32LE(0x06054b50, 0); tail.writeUInt16LE(count, 8); tail.writeUInt16LE(count, 10); tail.writeUInt32LE(cd.length, 12); tail.writeUInt32LE(off, 16);
  put(cd); put(tail);
}

/* An invented deck for the tests: slides with titles and notes (some with
   none), one hidden, and (F-251) a slide's own video - { video: Buffer,
   start: 'click'|'auto', rect: [x, y, w, h] as fractions } or a linked one
   { videoLink: 'https://...' }. The XML is the shape PowerPoint writes. */
export function inventDeck(list) {
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const e = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const files = [['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['ppt/presentation.xml', '<?xml version="1.0"?><p:presentation ' + NS + '><p:sldIdLst>' + list.map((s, i) => '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 2) + '"/>').join('') + '</p:sldIdLst></p:presentation>'],
    ['ppt/_rels/presentation.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + list.map((s, i) => '<Relationship Id="rId' + (i + 2) + '" Type="' + RT + 'slide" Target="slides/slide' + (i + 1) + '.xml"/>').join('') + '</Relationships>']];
  list.forEach((s, i) => {
    const n = i + 1;
    const W = 12192000, H = 6858000, vid = s.video || s.videoLink, rc = s.rect || [0.25, 0.3, 0.5, 0.5];
    const pic = vid ? '<p:pic><p:nvPicPr><p:cNvPr id="4" name="Video ' + n + '"/><p:cNvPicPr/><p:nvPr><a:videoFile r:link="rId5"/>' + (s.video ? '<p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rId6"/></p:ext></p:extLst>' : '') + '</p:nvPr></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="rId7"/></p:blipFill><p:spPr><a:xfrm><a:off x="' + Math.round(rc[0] * W) + '" y="' + Math.round(rc[1] * H) + '"/><a:ext cx="' + Math.round(rc[2] * W) + '" cy="' + Math.round(rc[3] * H) + '"/></a:xfrm></p:spPr></p:pic>' : '';
    const timing = vid ? '<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst><p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="' + (s.start === 'auto' ? '0' : 'indefinite') + '"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="4" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="5" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="' + (s.start === 'auto' ? 'afterEffect' : 'clickEffect') + '"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst><p:cmd type="call" cmd="playFrom(0.0)"><p:cBhvr><p:cTn id="6" dur="6000" fill="hold"/><p:tgtEl><p:spTgt spid="4"/></p:tgtEl></p:cBhvr></p:cmd></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:seq>' +
      '<p:video><p:cMediaNode vol="80000"><p:cTn id="7" fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="4"/></p:tgtEl></p:cMediaNode></p:video></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>' : '';
    files.push(['ppt/slides/slide' + n + '.xml', '<?xml version="1.0"?><p:sld ' + NS + (s.hidden ? ' show="0"' : '') + '><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>' + e(s.title) + '</a:t></a:r></a:p></p:txBody></p:sp>' + pic + '</p:spTree></p:cSld>' + timing + '</p:sld>']);
    files.push(['ppt/slides/_rels/slide' + n + '.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + (s.notes ? '<Relationship Id="rId9" Type="' + RT + 'notesSlide" Target="../notesSlides/notesSlide' + n + '.xml"/>' : '') +
      (s.video ? '<Relationship Id="rId5" Type="' + RT + 'video" Target="../media/media' + n + '.mp4"/><Relationship Id="rId6" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="../media/media' + n + '.mp4"/>' : '') +
      (s.videoLink ? '<Relationship Id="rId5" Type="' + RT + 'video" Target="' + e(s.videoLink) + '" TargetMode="External"/>' : '') + '</Relationships>']);
    if (s.video) files.push(['ppt/media/media' + n + '.mp4', s.video]);
    if (s.notes) files.push(['ppt/notesSlides/notesSlide' + n + '.xml', '<?xml version="1.0"?><p:notes ' + NS + '><p:cSld><p:spTree>' +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr></p:sp>' +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody>' + s.notes.split('\n').map((l) => '<a:p><a:r><a:t>' + e(l) + '</a:t></a:r></a:p>').join('') + '</p:txBody></p:sp>' +
      '<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum" idx="5"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>' + n + '</a:t></a:r></a:p></p:txBody></p:sp>' +
      '</p:spTree></p:cSld></p:notes>']);
  });
  return makeZip(files);
}
