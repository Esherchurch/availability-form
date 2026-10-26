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
const { personalCheck, SOCKETS, socketCover } = require('./sg-ai-core.cjs');
/* what a file is, a Word document's words, and "no repeats": the shared engine's (H&S step 1) */
const { MAX_BYTES, IMAGE_TYPES, DOCX, fileKind, docxText, newOnly } = require('./doc-reader-core.cjs');

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
  'Where a page or section only gives a way to reach someone (a team, a phone line, an email, an office), ask whether the group knows how to reach them and when, for example "Does your group know how to reach the night team, and when?" - never with the number, the email or a name itself.',
  'In host, give the name of the host or organiser as the document gives it (an organisation, not a person), or an empty string.',
  SOCKETS + ' If the document asks for them, leave that requirement out.'
].join('\n');
const REQ_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['host', 'items', 'personalFound'],
  properties: {
    host: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question', 'line'], properties: { question: { type: 'string' }, line: { type: 'string' } } } },
    personalFound: { type: 'boolean' }
  }
};
/* FROM WEB PAGES OR PASTED TEXT (S6): each page's words with its address, any PDF as a document, then the pasted text;
   and each question says which page it came from (source: the address, or "pasted text") */
const WEB_LIMIT = 120000;
function contentForWeb(pages, pasted, already) {
  const out = [];
  /* "Read the next" (F-293): the questions already on the list, so none is asked twice */
  const had = (already || []).map((x) => clean(x, 300)).filter(Boolean);
  if (had.length) out.push({ type: 'text', text: 'These questions are already on the church’s list from the host’s other pages. Don’t give any of them again, or one that asks the same thing in other words; give only requirements that are not yet covered:\n\n' + had.map((x) => '- ' + x).join('\n') });
  let left = WEB_LIMIT;
  (pages || []).forEach((p) => {
    if (p.kind === 'pdf' && p.pdf) { out.push({ type: 'text', text: 'A PDF from ' + p.url + ':' }); out.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(p.pdf).toString('base64') } }); return; }
    const t = String(p.text || '').slice(0, Math.max(0, left)); left -= t.length;
    if (t) out.push({ type: 'text', text: 'The page ' + p.url + (p.title ? ' (' + p.title + ')' : '') + ':\n\n' + t });
  });
  const pt = String(pasted || '').slice(0, Math.max(0, Math.min(60000, left)));
  if (pt.trim()) out.push({ type: 'text', text: 'Text the leader pasted in:\n\n' + pt });
  out.push({ type: 'text', text: 'These are the host’s or organiser’s requirements for a visiting church group, from their web pages and anything pasted. Turn each requirement into a checklist question, as instructed. In source, give the page address the requirement came from, or "pasted text".' });
  return out;
}
const REQ_SCHEMA_WEB = {
  type: 'object', additionalProperties: false, required: ['host', 'items', 'personalFound'],
  properties: {
    host: { type: 'string' },
    items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['question', 'line', 'source'], properties: { question: { type: 'string' }, line: { type: 'string' }, source: { type: 'string' } } } },
    personalFound: { type: 'boolean' }
  }
};
const clean = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
/* the hub's own check as well as the model's: a question or line with a name, phone number or email is left out */
function normaliseReqs(d, names) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.items)) return { ok: false };
  let dropped = 0, leftOut = 0;
  const items = [];
  for (const it of d.items.slice(0, 500)) {
    const q = clean(it && it.question, 300), line = clean(it && it.line, 300);
    if (!q) continue;
    if (personalCheck(q, names).refuse || personalCheck(line, names).refuse) { dropped++; continue; }
    /* never socket covers (F-280 10.7), even when the host's own sheet asks for them */
    if (socketCover(q) || socketCover(line)) { leftOut++; continue; }
    items.push(Object.assign({ q, line }, it && typeof it.source === 'string' && it.source.trim() ? { source: clean(it.source, 300) } : {}));
  }
  return { ok: true, items: items.slice(0, 500), dropped, leftOut, personalFound: d.personalFound === true || dropped > 0, host: clean(d.host, 120) };
}

module.exports = { newOnly, MAX_BYTES, IMAGE_TYPES, DOCX, fileKind, docxText, contentFor, contentForWeb, REQ_SYSTEM, REQ_SCHEMA, REQ_SCHEMA_WEB, normaliseReqs };
