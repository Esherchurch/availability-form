/* ===================================================================
   AN EVENT HOST'S OWN REQUIREMENTS (Martin, 23 Oct; F-277) - the parts
   that need no network
   ===================================================================
   A leader uploads the host's or organiser's list (a PDF, a Word document,
   or a photo or scan of a printed sheet). The server sends it to Claude,
   which reads PDFs and pictures itself; a Word document is turned into its
   words here first. Each requirement comes back as a checklist question
   with the line it came from; any with a name, phone number or email is
   left out, and the leader is told. The leader checks the list, then the
   questions are required, as the church's own are.
     fileKind(type, name)      'pdf' | 'image' | 'docx' | ''
     docxText(buffer)          a Word document's words, a paragraph a line
     contentFor(kind, b64, t)  the message's content blocks
     REQ_SYSTEM, REQ_SCHEMA    what the model is told and must answer in
     normaliseReqs(d, names)   -> { items: [{ q, line }], dropped, personalFound }
   =================================================================== */
'use strict';
const zlib = require('node:zlib');
const { personalCheck } = require('./sg-ai-core.cjs');

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

function contentFor(kind, b64, text, type) {
  const ask = { type: 'text', text: 'These are the host’s or organiser’s requirements for a visiting church group. Turn each requirement into a checklist question, as instructed.' };
  if (kind === 'pdf') return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }, ask];
  if (kind === 'image') return [{ type: 'image', source: { type: 'base64', media_type: type, data: b64 } }, ask];
  return [{ type: 'text', text: 'The document’s words:\n\n' + String(text || '').slice(0, 60000) }, ask];
}

const REQ_SYSTEM = [
  'You read a host’s or organiser’s requirements for a church group visiting with children or young people in the United Kingdom - for example a Christian camp’s conditions for groups - and turn each requirement into a question for the church’s safeguarding checklist.',
  'One question for each separate requirement, in plain UK English, that the group leader can answer, for example "Has every leader sent the camp a signed copy of its code of conduct?". Give the line it came from, word for word, shortened if long.',
  'Leave out anything that is not a requirement of the visiting group (prices, directions, marketing).',
  'Never put a person’s name, phone number, email address or address into a question or a line. If the document has any, set personalFound true and leave those details out.',
  'In host, give the name of the host or organiser as the document gives it (an organisation, not a person), or an empty string.'
].join('\n');
const REQ_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['host', 'items', 'personalFound'],
  properties: {
    host: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question', 'line'], properties: { question: { type: 'string' }, line: { type: 'string' } } } },
    personalFound: { type: 'boolean' }
  }
};
const clean = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
/* the hub's own check as well as the model's: a question or line with a name, phone number or email is left out */
function normaliseReqs(d, names) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.items)) return { ok: false };
  let dropped = 0;
  const items = [];
  for (const it of d.items.slice(0, 60)) {
    const q = clean(it && it.question, 300), line = clean(it && it.line, 300);
    if (!q) continue;
    if (personalCheck(q, names).refuse || personalCheck(line, names).refuse) { dropped++; continue; }
    items.push({ q, line });
  }
  return { ok: true, items: items.slice(0, 40), dropped, personalFound: d.personalFound === true || dropped > 0, host: clean(d.host, 120) };
}

module.exports = { MAX_BYTES, IMAGE_TYPES, DOCX, fileKind, docxText, contentFor, REQ_SYSTEM, REQ_SCHEMA, normaliseReqs };
