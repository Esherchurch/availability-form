/* PRESENT: THE MICROSOFT 365 ROUTE (F-252). Events window.
   The real converter code (converter/convert.mjs makeRender, microsoft.mjs)
   against a stand-in for Microsoft (sign-in, the SharePoint site, upload,
   upload session, ?format=pdf, delete) on this machine; invented decks;
   the events emulators for the deck's records and files.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage \
       --project egbc-worship-planner "node screenshots/events/present-microsoft.test.mjs"

   What it proves:
     1. not set up: LibreOffice makes the slides, as before
     2. set up: Microsoft draws them - the converter signs in as the app
        (client credentials, no person), puts the deck in the church's
        conversion folder, asks for the PDF, and DELETES the copy after
     3. a PDF that kept a hidden slide: Present still leaves it out
     4. a big deck goes up in pieces (an upload session), byte for byte
     5. Microsoft fails, or the secret is wrong: LibreOffice does it instead,
        and the deck says why; the copy is still deleted
     6. the secret is never written anywhere a page can read */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inventDeck, readZip } from '../../converter/pptx.mjs';
import { convertDeck, makeRender } from '../../converter/convert.mjs';
import { msConfig, forgetMicrosoft } from '../../converter/microsoft.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { getStorage } = fnRequire('firebase-admin/storage');
if (!getApps().length) initializeApp({ projectId: PROJECT, storageBucket: 'egbc-worship-planner.firebasestorage.app' });
const db = getFirestore(), bucket = getStorage().bucket();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const J = (x) => JSON.stringify(x);

/* ---------- the stand-in for Microsoft ---------- */
const SECRET = 'invented-secret-' + Math.random().toString(36).slice(2);
const MS = { tokens: [], uploads: {}, sessions: {}, pdfAsked: [], deleted: [], failPdf: false, n: 0, sitesAsked: [] };
const pagesIn = (pptx) => (readZip(pptx).text('ppt/presentation.xml').match(/<p:sldId\b/g) || []).length;
const fakePdf = (n) => Buffer.from('%PDF-1.4\n' + Array.from({ length: n }, (_, i) => '<< /Type /Page /N ' + (i + 1) + ' >>').join('\n') + '\n%%EOF');
const body = (req) => new Promise((r) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => r(Buffer.concat(parts))); });
const ms = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname), b = await body(req);
  const send = (code, obj, h) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, h || {})); res.end(typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : J(obj)); };
  if (req.method === 'POST' && /^\/login\/[^/]+\/oauth2\/v2\.0\/token$/.test(p)) {
    const f = new URLSearchParams(b.toString()); MS.tokens.push(Object.fromEntries(f));
    if (f.get('client_secret') !== SECRET) return send(401, { error: 'invalid_client' });
    return send(200, { access_token: 'invented-token', expires_in: 3600, token_type: 'Bearer' });
  }
  if (p.startsWith('/upload/')) {
    const id = p.slice(8), s = MS.sessions[id], m = (req.headers['content-range'] || '').match(/bytes (\d+)-(\d+)\/(\d+)/);
    if (!s || !m) return send(400, { error: 'bad range' });
    s.parts.push({ from: +m[1], to: +m[2], total: +m[3], len: b.length }); s.bytes = Buffer.concat([s.bytes, b]);
    if (+m[2] + 1 === +m[3]) { MS.uploads[id] = { name: s.name, bytes: s.bytes, session: true, folder: s.folder }; return send(201, { id }); }
    return send(202, { nextExpectedRanges: [(+m[2] + 1) + '-'] });
  }
  if (p.startsWith('/pdf/')) { const it = MS.uploads[p.slice(5)]; return send(200, fakePdf(pagesIn(it.bytes)), { 'Content-Type': 'application/pdf' }); }
  if (!p.startsWith('/graph/')) return send(404, {});
  if (req.headers.authorization !== 'Bearer invented-token') return send(401, { error: 'unauthenticated' });
  const g = p.slice(6);
  let m;
  if (req.method === 'GET' && (m = g.match(/^\/sites\/([^/]+?)(?::(.*))?$/))) { MS.sitesAsked.push(g); return send(200, { id: 'site-invented', webUrl: 'https://' + m[1] + (m[2] || '') }); }
  if (req.method === 'PUT' && (m = g.match(/^\/sites\/site-invented\/drive\/root:\/(.+)\/([^/]+):\/content$/))) { const id = 'item-' + (++MS.n); MS.uploads[id] = { name: m[2], folder: m[1], bytes: b }; return send(201, { id, name: m[2] }); }
  if (req.method === 'POST' && (m = g.match(/^\/sites\/site-invented\/drive\/root:\/(.+)\/([^/]+):\/createUploadSession$/))) { const id = 'item-' + (++MS.n); MS.sessions[id] = { name: m[2], folder: m[1], parts: [], bytes: Buffer.alloc(0) }; return send(200, { uploadUrl: 'http://127.0.0.1:5613/upload/' + id }); }
  if (req.method === 'GET' && (m = g.match(/^\/sites\/site-invented\/drive\/items\/([^/]+)\/content$/)) && u.searchParams.get('format') === 'pdf') {
    MS.pdfAsked.push(m[1]);
    if (MS.failPdf) return send(500, { error: 'invented failure' });
    res.writeHead(302, { Location: 'http://127.0.0.1:5613/pdf/' + m[1] }); return res.end();
  }
  if (req.method === 'DELETE' && (m = g.match(/^\/sites\/site-invented\/drive\/items\/([^/]+)$/))) { MS.deleted.push(m[1]); delete MS.uploads[m[1]]; return send(204, ''); }
  send(404, { error: 'no such thing: ' + req.method + ' ' + g });
});
await new Promise((r) => ms.listen(5613, '127.0.0.1', r));
const CFG = (extra) => msConfig(Object.assign({ MS_TENANT_ID: 'tenant-invented', MS_CLIENT_ID: 'client-invented', MS_CLIENT_SECRET: SECRET, MS_SITE: 'esherchurch.sharepoint.com:/sites/EGBCHub',
  MS_GRAPH: 'http://127.0.0.1:5613/graph', MS_LOGIN: 'http://127.0.0.1:5613/login' }, extra || {}));

/* the LibreOffice and pdftoppm steps stood in for (this PC has no pdftoppm) */
const LO = { calls: 0 };
const loPdf = async (buf) => { LO.calls++; return { pdf: fakePdf((readZip(buf).text('ppt/presentation.xml').match(/<p:sldId\b/g) || []).length - 1), prepared: ['LibreOffice stand-in'] }; };
const toPictures = async (pdf) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).map((x, i) => ({ full: Buffer.from('full ' + i), thumb: Buffer.from('thumb ' + i), w: 1920, h: 1080 }));

const DECK = inventDeck([{ title: 'One', notes: 'first' }, { title: 'Two' }, { title: 'Hidden', hidden: true }, { title: 'Three' }, { title: 'Four' }]);
async function deck(id, buf) {
  await db.collection('presentDecks').doc(id).set({ context: { type: 'session', groupId: 'pg_x', sessionId: 'ps_x' }, name: 'Invented', status: 'uploaded', source: 'upload', by: 'u_x', byName: 'x', at: 'x' });
  await bucket.file('present/' + id + '/source.pptx').save(buf, { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
const read = async (id) => (await db.collection('presentDecks').doc(id).get()).data() || {};

try {
  /* 1. not set up */
  ok('0. NOT SET UP: with no MS_ settings there is no Microsoft route', msConfig({}) === null);
  await deck('dk_ms_none', DECK);
  await convertDeck({ db, bucket, deckId: 'dk_ms_none', render: makeRender({ ms: null, loPdf, toPictures }) });
  const d1 = await read('dk_ms_none');
  ok('1. NOT SET UP: LibreOffice makes the slides, as before (4, the hidden one left out)', d1.status === 'ready' && d1.count === 4 && d1.renderer === 'libreoffice' && LO.calls === 1, J(d1));

  /* 2. set up */
  forgetMicrosoft();
  await deck('dk_ms_yes', DECK);
  await convertDeck({ db, bucket, deckId: 'dk_ms_yes', render: makeRender({ ms: CFG(), loPdf, toPictures }) });
  const d2 = await read('dk_ms_yes'), tk = MS.tokens[MS.tokens.length - 1] || {};
  ok('2. SET UP: MICROSOFT DRAWS THE SLIDES (renderer "microsoft"), LibreOffice not used', d2.status === 'ready' && d2.renderer === 'microsoft' && LO.calls === 1, J(d2));
  ok('   it signs in as the app itself: client credentials, Graph’s .default scope, no person', tk.grant_type === 'client_credentials' && tk.scope === 'https://graph.microsoft.com/.default' && tk.client_id === 'client-invented' && !tk.username && !tk.password, J(Object.assign({}, tk, { client_secret: '...' })));
  ok('   on the church’s own site', MS.sitesAsked.some((s) => s === '/sites/esherchurch.sharepoint.com:/sites/EGBCHub'), J(MS.sitesAsked));
  ok('   the deck went into the conversion folder, and the PDF was asked for', MS.n >= 1 && MS.pdfAsked.includes('item-1') && Object.values(MS.uploads).length === 0, J({ n: MS.n, asked: MS.pdfAsked }));
  ok('   AND THE COPY IS DELETED AFTER: nothing is left in SharePoint', MS.deleted.includes('item-1') && Object.keys(MS.uploads).length === 0, J(MS.deleted));
  ok('3. MICROSOFT’S PDF KEPT THE HIDDEN SLIDE (5 pages): Present still shows 4', d2.count === 4, J({ count: d2.count }));
  const s1 = await bucket.file('present/dk_ms_yes/s1.jpg').exists();
  ok('   the pictures are stored as on the other route', s1[0]);

  /* 4. a big deck goes up in pieces */
  forgetMicrosoft();
  const bigVideo = Buffer.alloc(2 * 1048576 + 12345, 7);
  const BIG = inventDeck([{ title: 'With a big video', video: bigVideo, start: 'click' }, { title: 'After' }]);
  await deck('dk_ms_big', BIG);
  const before = MS.n;
  /* keep the upload: the stand-in forgets a deleted copy, so look before it is deleted */
  let captured = null; const del = MS.deleted.length;
  const realDelete = MS.deleted.push.bind(MS.deleted);
  MS.deleted.push = (id) => { if (MS.uploads[id]) captured = MS.uploads[id]; return realDelete(id); };
  await convertDeck({ db, bucket, deckId: 'dk_ms_big', render: makeRender({ ms: CFG({ MS_SIMPLE_MAX: String(1048576), MS_CHUNK: String(655360) }), loPdf, toPictures }) });
  MS.deleted.push = realDelete;
  const d4 = await read('dk_ms_big'), sess = MS.sessions['item-' + (before + 1)];
  ok('4. A BIG DECK goes up in pieces (an upload session), each piece in order', sess && sess.parts.length >= 4 && sess.parts.every((x, i, a) => x.from === (i ? a[i - 1].to + 1 : 0) && x.len <= 655360), J(sess && sess.parts.map((x) => x.from + '-' + x.to)));
  ok('   and arrives byte for byte; Microsoft draws it; the copy is deleted', captured && Buffer.compare(captured.bytes, BIG) === 0 && d4.renderer === 'microsoft' && d4.count === 2 && MS.deleted.length > del, J({ size: captured && captured.bytes.length, want: BIG.length, renderer: d4.renderer }));

  /* 5. Microsoft fails / the secret is wrong */
  forgetMicrosoft(); MS.failPdf = true;
  await deck('dk_ms_fail', DECK);
  const delB = MS.deleted.length;
  await convertDeck({ db, bucket, deckId: 'dk_ms_fail', render: makeRender({ ms: CFG(), loPdf, toPictures }) });
  const d5 = await read('dk_ms_fail');
  ok('5. MICROSOFT FAILS: LibreOffice makes the slides instead, and the deck says why', d5.status === 'ready' && d5.renderer === 'libreoffice' && /Microsoft 365 could not draw the slides \(500\)/.test(d5.fallbackWhy || ''), J(d5));
  ok('   the copy in SharePoint is deleted all the same', MS.deleted.length > delB && Object.keys(MS.uploads).length === 0, J(MS.deleted));
  MS.failPdf = false; forgetMicrosoft();
  await deck('dk_ms_badsecret', DECK);
  await convertDeck({ db, bucket, deckId: 'dk_ms_badsecret', render: makeRender({ ms: CFG({ MS_CLIENT_SECRET: 'wrong' }), loPdf, toPictures }) });
  const d6 = await read('dk_ms_badsecret');
  ok('   A WRONG SECRET: LibreOffice again, and the deck says to check the settings', d6.status === 'ready' && d6.renderer === 'libreoffice' && /would not sign the converter in.*MS_CLIENT_SECRET/.test(d6.fallbackWhy || ''), J(d6));

  /* 6. the secret is never written where a page can read */
  const all = [];
  for (const id of ['dk_ms_none', 'dk_ms_yes', 'dk_ms_big', 'dk_ms_fail', 'dk_ms_badsecret']) all.push(J(await read(id)), J((await db.collection('presentNotes').doc(id).get()).data() || {}));
  ok('6. THE SECRET AND THE TOKEN ARE NEVER STORED with a deck', !all.some((x) => x.includes(SECRET) || x.includes('invented-token')));
} catch (e) {
  ok('the run finished', false, e.stack);
} finally { ms.close(); }
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
