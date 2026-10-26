/* AN EVENT HOST'S OWN REQUIREMENTS (F-277; Martin, 23 Oct). Events window.
   Invented people, events and files only, events emulators only (with the
   hub's functions and Storage), network guard. NO REAL API CALL: the
   function talks to a local stand-in for Anthropic's API.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/sg-host.test.mjs"

   What it proves:
     1. the organiser adds the host's list - A SCANNED PAGE (a picture): it
        goes to Claude as an image; a question with a phone number is left
        out, and the leader is told; the file is kept in Storage
     2. not required, and no sign-off, until the leader has checked it
     3. the leader removes one, changes one, adds one, confirms: they are
        required questions, "From <host>'s requirements"
     4. A WORD DOCUMENT: its words go; a new list waits to be checked again
     5. A PDF goes as a document; anything else is refused plainly
     6. the original file comes back to those who can see the assessment,
        not to a volunteer
     7. the log: no file contents; the caps apply
     8. the print lists it: "Requirements taken from <file>, checked by
        <name> on <date>" */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
import { makeZip } from '../../converter/pptx.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-sgh-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { getStorage } = fnRequire('firebase-admin/storage');
const BUCKET = 'egbc-worship-planner.firebasestorage.app';
if (!getApps().length) initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore(), bucket = getStorage().bucket();
const { londonDay } = await import('../../functions/sg-warnings.js');
const RQ = fnRequire('./sg-requirements-core.cjs');

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 30000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);

/* the fixtures */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const DOCX = makeZip([['[Content_Types].xml', '<Types/>'], ['word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Hilltop Camp: conditions for visiting groups (invented)</w:t></w:r></w:p><w:p><w:r><w:t>Every group leader must hold a first aid certificate.</w:t></w:r></w:p><w:p><w:r><w:t>Lights out by 10pm in the dormitories.</w:t></w:r></w:p></w:body></w:document>']]);
const PDF = Buffer.from('%PDF-1.4\n% an invented camp list\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const F = { png: path.join(TMP, 'camp scan.png'), docx: path.join(TMP, 'camp-list.docx'), pdf: path.join(TMP, 'camp-list.pdf'), txt: path.join(TMP, 'notes.txt') };
fs.writeFileSync(F.png, PNG); fs.writeFileSync(F.docx, DOCX); fs.writeFileSync(F.pdf, PDF); fs.writeFileSync(F.txt, 'just some notes');

/* ---- the stand-in for Anthropic's API ---- */
const SENT = [], QUEUE = [];
const answer = (obj) => ({ status: 200, body: { id: 'msg_stub', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: JSON.stringify(obj) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1500, output_tokens: 400 } } });
const LIST1 = { host: 'Hilltop Christian Camp (invented)', personalFound: false, items: [
  { question: 'Is every leader DBS checked? (invented)', line: 'All leaders must have a current DBS check.' },
  { question: 'Has the group sent its own risk assessment to the camp? (invented)', line: 'Send us your risk assessment two weeks before arrival.' },
  { question: 'Have leaders rung the warden on 07700 900123 to book the climbing wall? (invented)', line: 'Ring the warden on 07700 900123' },
  { question: 'Are there enough leaders to cover the night rota? (invented)', line: 'A leader must be awake on each corridor until midnight.' }] };
const LIST2 = { host: 'Hilltop Christian Camp (invented)', personalFound: false, items: [
  { question: 'Does every group leader hold a first aid certificate? (invented)', line: 'Every group leader must hold a first aid certificate.' },
  { question: 'Will lights be out by 10pm in the dormitories? (invented)', line: 'Lights out by 10pm in the dormitories.' }] };
const stub = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
    let body = null; try { body = JSON.parse(b); } catch (e) {}
    SENT.push(body);
    const next = QUEUE.shift() || { status: 500, body: { type: 'error', error: { type: 'api_error', message: 'nothing queued' } } };
    res.writeHead(next.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(next.body));
  });
});
await new Promise(r => stub.listen(5617, '127.0.0.1', r));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });

const DAY = new Date(Date.now() + 50 * 864e5).toISOString().slice(0, 10);
const P = {
  olly: { email: 'olly.organiser@example.invalid', name: 'Olly Organiser (invented)', mid: 'm_olly', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  lena: { email: 'lena.lead@example.invalid', name: 'Lena Lead (invented)', mid: 'm_lena', teams: ['Kids Church'] },
  tom:  { email: 'tom.trustee@example.invalid', name: 'Tom Trustee (invented)', mid: 'm_tom', teams: ['Elders'] },
  sam:  { email: 'sam.volunteer@example.invalid', name: 'Sam Volunteer (invented)', mid: 'm_sam', teams: ['Kids Church'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const EID = 'ev_camp';
{
  const b = db.batch(), S = (c, id, d) => b.set(db.collection(c).doc(id), d);
  for (const k of Object.keys(P)) {
    const x = P[k];
    S('addressBook', x.mid, { name: x.name, email: x.email, markers: x.teams, adminFor: x.adminFor || [], masterAdmin: false });
    S('users', x.uid, { memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: x.adminFor || [], masterAdmin: false, attender: true, status: 'active' });
  }
  for (const name of ['Kids Church', 'Elders']) S('teams', name, { name, label: name, rota: true, order: 1 });
  S('churchSettings', 'details', { name: 'Test Green Church' });
  S('sites', 'site_t', { name: 'Test Green', active: true, order: 1 });
  S('bookingSettings', 'site_t', { bookingsAdmins: [], safeguardingLead: 'm_lena', safeguardingDeputy: '' });
  S('safeguardingSettings', 'defaults', { templates: {}, ratioAll: 5, ratioUnder8: 4, dbsYears: 3, trainingYears: 3, requireChecks: false, leadSiteId: 'site_t', leadName: 'Lena Lead (invented)', leadPhone: '', updatedAt: 'x', updatedBy: 'x' });
  S('calEvents', EID, { title: 'Youth camp weekend (invented)', status: 'confirmed', visibility: 'public', audience: ['public'], signupOn: true, capacity: 30, sgKind: 'overnight', organiserName: 'Olly Organiser (invented)', createdBy: P.olly.uid, teamUids: [], teamMemberIds: [],
    startLocal: DAY + 'T17:00', startUtc: Date.parse(DAY + 'T17:00:00Z'), endLocal: DAY + 'T20:00', endUtc: Date.parse(DAY + 'T20:00:00Z'), location: { kind: 'other', siteId: 'site_t', name: 'Hilltop Camp (invented)' } });
  S('eventLeaders', EID, { under18: true, leaders: [{ memberId: 'm_lena', name: 'Lena Lead (invented)', role: 'leader' }], leaderIds: ['m_lena'], leaderUids: [], siteId: 'site_t', clearedIds: [], lastCleared: [], updatedAt: 'x', updatedBy: 'x' });
  S('sgGate', EID, { needed: true, open: false, updatedAt: 'x' });
  S('sgAssessments', EID, { siteId: 'site_t', calEventId: EID, title: 'Youth camp weekend (invented)', templateId: 'overnight', answers: {}, risks: [], status: 'draft', version: 1, updatedAt: 'x', updatedBy: 'x' });
  S('sgAiStub', 'config', { url: 'http://127.0.0.1:5617' });
  await b.commit();
}
const assess = async () => (await db.collection('sgAssessments').doc(EID).get()).data();
const logs = async () => (await db.collection('sgAiLog').get()).docs.map((d) => d.data());

const errors = [], browsers = [];
async function as(who, w = 1280, h = 900) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: w, height: h });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => { errors.push(who + ' was shown: ' + d.message()); d.accept(); });
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  await sleep(400);
  return p;
}
const go = async (p, url, sel) => { await p.goto(URLB + url, { waitUntil: 'networkidle2' }); if (sel) await p.waitForSelector(sel, { timeout: 20000 }); };
/* the callable's whole result (the file's own field is called data) */
const callRaw = (p, name, data) => p.evaluate((n, d) => EGBCAuth.call(n, d).then((r) => ({ ok: true, r }), (e) => ({ ok: false, code: e.code || '', message: e.message || String(e) })), name, data);
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (p, sel) => p.$eval(sel, e => e.click());
const call = (p, name, data) => p.evaluate((n, d) => EGBCAuth.call(n, d).then((r) => ({ ok: true, r: (r && r.data) || r }), (e) => ({ ok: false, code: e.code || '', message: e.message || String(e) })), name, data);
async function upload(p, file, host) {
  await p.waitForSelector('#sgaHostFile');
  if (host !== undefined) await p.$eval('#sgaHostName', (e, v) => { e.value = v; }, host);
  await (await p.$('#sgaHostFile')).uploadFile(file);
  await tap(p, '#sgaHostGo');
}

try {
  /* 1. a scanned page */
  const O = await as('olly');
  await go(O, 'safeguarding.html?event=' + EID, '#sgaHostFile');
  ok('1. THE HOST\u2019S LIST: the box, and the warning first', /Don’t add a file with any child’s name, contact details or medical details in it\./.test(await text(O, '#sgaHostWarn')));
  QUEUE.push(answer(LIST1));
  await upload(O, F.png, 'Hilltop Christian Camp (invented)');
  ok('   while it reads: "Reading… this takes about a minute."', /Reading… this takes about a minute\./.test(await text(O, '#sgaHostMsg')));
  await O.waitForSelector('[data-hostitem]', { timeout: 40000 });
  const s1 = SENT[0] || {};
  ok('   A SCANNED PAGE goes to Claude as a picture (the model reads it itself)', s1.model === 'claude-sonnet-5-5' && s1.messages[0].content[0].type === 'image' && s1.messages[0].content[0].source.media_type === 'image/png' && s1.messages[0].content[0].source.data === PNG.toString('base64') && s1.output_config.format.type === 'json_schema', J(s1.messages && s1.messages[0].content[0].type));
  ok('   with the instructions: one question each, never a name, phone or email', /One question for each separate requirement/.test(J(s1.system)) && /Never put a person’s name, phone number, email address/.test(J(s1.system)));
  const a1 = await assess();
  ok('   THE QUESTION WITH A PHONE NUMBER IS LEFT OUT (3 of 4), and the leader is told', a1.host.items.length === 3 && !/07700/.test(J(a1.host)) && a1.host.dropped === 1 && /names, phone numbers or emails in it/.test(await text(O, '#sgaHostPersonal')), J(a1.host.items.map((x) => x.q)));
  const [kept] = await bucket.file(a1.host.file.path).download();
  ok('   THE FILE IS KEPT, under the event in Storage', a1.host.file.path.indexOf('sgRequirements/' + EID + '/') === 0 && kept.equals(PNG) && a1.host.file.name === 'camp scan.png', a1.host.file.path);
  /* 2. not until checked */
  ok('2. NOT REQUIRED UNTIL CHECKED: not confirmed, no required ids', a1.host.confirmed === false && J(a1.hostIds) === '[]');
  const L = await as('lena');
  await go(L, 'safeguarding.html?event=' + EID, '#sgaSign');
  await tap(L, '#sgaSign');
  ok('   and the lead can\u2019t sign: "Check the host’s requirements and confirm them first."', !!(await until(async () => /Check the host’s requirements and confirm them first\./.test(await text(L, '#sgaMsg')))));
  /* 3. the leader checks the list */
  await O.$$eval('[data-hostitem]', (rows) => { rows[0].querySelector('[data-hostdel]').click(); });
  await O.$eval('[data-hostitem] [data-hostq]', (e) => { e.value = 'Has the camp had our risk assessment two weeks before? (invented)'; });
  await tap(O, '#sgaHostAdd');
  await O.$$eval('[data-hostitem] [data-hostq]', (a) => { a[a.length - 1].value = 'Has the camp got copies of our leaders’ first aid certificates? (invented)'; });
  await tap(O, '#sgaHostOk');
  const a3 = await until(async () => { const a = await assess(); return a.host.confirmed ? a : null; });
  ok('3. CHECKED: one removed, one changed, one added; confirmed by the organiser', a3 && a3.host.items.length === 3 && /two weeks before/.test(a3.host.items[0].q) && /first aid certificates/.test(a3.host.items[2].q) && a3.host.checkedBy === P.olly.uid && J(a3.hostIds) === J(a3.host.items.map((x) => x.id)), J(a3 && a3.host.items));
  await O.waitForSelector('#sgaHostDone');
  ok('   "Requirements taken from camp scan.png, checked by Olly Organiser (invented) on <date>"', /^Requirements taken from camp scan\.png, checked by Olly Organiser \(invented\) on \d{4}-\d{2}-\d{2}\. 3 questions added to the checklist\./.test(await text(O, '#sgaHostDone')), await text(O, '#sgaHostDone'));
  const hostQs = await O.$$eval('[data-ck^="h_"]', (a) => a.map((c) => c.innerText.replace(/\s+/g, ' ')));
  ok('   THEY ARE REQUIRED QUESTIONS, "From Hilltop Christian Camp (invented)’s requirements"', hostQs.length === 3 && hostQs.every((t) => /From Hilltop Christian Camp \(invented\)’s requirements/.test(t)), J(hostQs));
  const direct = await L.evaluate((eid) => EGBCAuth.db.collection('sgAssessments').doc(eid).get().then((d) => {
    const a = d.data(); const ans = {}; ['insurance', 'incharge', 'leaders', 'consent', 'medical', 'emergency', 'contacts', 'headcount', 'transport', 'venue', 'photos', 'weather', 'incidents', 'sleeping', 'nightRota', 'fire', 'privacy'].forEach((k) => { ans[k] = 'x'; }); ans.paedFirstAid = 'Yes: x';
    return EGBCAuth.db.collection('sgAssessments').doc(eid).set(Object.assign({}, a, { answers: ans, status: 'signed', signedBy: EGBCAuth.user().uid, signedByName: 'x', signedAt: firebase.firestore.FieldValue.serverTimestamp(), signedVersion: a.version, signedNote: 'x', updatedAt: 'x', updatedBy: EGBCAuth.user().uid })); }).then(() => 'signed', (e) => e.code), EID);
  ok('   THE DATABASE REFUSES sign-off with the host\u2019s questions blank', /permission/.test(direct), direct);
  /* 4. a Word document */
  QUEUE.push(answer(LIST2));
  await go(O, 'safeguarding.html?event=' + EID, '#sgaHostAgain');
  await tap(O, '#sgaHostAgain');
  await upload(O, F.docx);
  await until(async () => (await assess()).host.file.name === 'camp-list.docx');
  const s4 = SENT[1] || {}, c4 = (s4.messages || [{}])[0].content || [];
  ok('4. A WORD DOCUMENT: its words go (Claude doesn\u2019t read .docx itself)', c4[0] && c4[0].type === 'text' && /Every group leader must hold a first aid certificate\./.test(c4[0].text) && /Lights out by 10pm/.test(c4[0].text), J(c4[0]));
  const a4 = await assess();
  ok('   a new list waits to be checked again: 2 questions, not required yet', a4.host.items.length === 2 && a4.host.confirmed === false && J(a4.hostIds) === '[]');
  /* 5. a PDF; anything else */
  QUEUE.push(answer(LIST2));
  const pdfRes = await O.evaluate((b64) => EGBCAuth.call('sgExtractRequirements', { calEventId: 'ev_camp', host: 'Hilltop', fileName: 'camp-list.pdf', contentType: 'application/pdf', data: b64 }).then(() => 'ok', (e) => e.message), PDF.toString('base64'));
  const c5 = ((SENT[2] || {}).messages || [{}])[0].content || [];
  ok('5. A PDF goes as a document', pdfRes === 'ok' && c5[0] && c5[0].type === 'document' && c5[0].source.media_type === 'application/pdf', J(c5[0] && c5[0].type));
  const n5 = SENT.length;
  await go(O, 'safeguarding.html?event=' + EID, '#sgaHostAgain');
  await tap(O, '#sgaHostAgain');
  await upload(O, F.txt);
  ok('   ANYTHING ELSE is refused plainly, and nothing is sent', !!(await until(async () => /Upload a PDF, a Word document \(\.docx\), or a photo or scan/.test(await text(O, '#sgaHostMsg')))) && SENT.length === n5, await text(O, '#sgaHostMsg'));
  /* 6. the original file */
  const back = await callRaw(L, 'sgRequirementsFile', { calEventId: EID });
  ok('6. THE ORIGINAL FILE comes back to the lead', back.ok && back.r.name === 'camp-list.pdf' && back.r.data === PDF.toString('base64'), J({ ok: back.ok, name: back.r && back.r.name }));
  const T = await as('tom');
  const backT = await callRaw(T, 'sgRequirementsFile', { calEventId: EID });
  ok('   and to a trustee (they read the assessment)', backT.ok && backT.r.name === 'camp-list.pdf');
  const S = await as('sam');
  const backS = await call(S, 'sgRequirementsFile', { calEventId: EID });
  ok('   NOT TO A VOLUNTEER', !backS.ok && /permission/i.test(backS.code + backS.message), J(backS));
  const sx = await call(S, 'sgExtractRequirements', { calEventId: EID, fileName: 'x.png', contentType: 'image/png', data: PNG.toString('base64') });
  ok('   and a volunteer can\u2019t add one', !sx.ok && /permission/i.test(sx.code + sx.message), J(sx));
  /* 7. the log; the caps */
  const lg = (await logs()).filter((l) => l.kind === 'requirements');
  ok('7. THE LOG: "requirements", the size, the outcome; never the file\u2019s contents', lg.filter((l) => l.outcome === 'extracted').length === 3 && lg.some((l) => l.chars === PNG.length) && !/first aid certificate|Lights out|DBS|07700|iVBOR/.test(J(lg)), J(lg));
  await db.collection('sgAiUse').doc(londonDay()).set({ total: 20, by: {} });
  const n7 = SENT.length;
  const cap = await O.evaluate((b64) => EGBCAuth.call('sgExtractRequirements', { calEventId: 'ev_camp', fileName: 'camp-list.pdf', contentType: 'application/pdf', data: b64 }).then(() => 'ok', (e) => e.message), PDF.toString('base64'));
  ok('   THE SAME CAPS AS THE DRAFTS: today\u2019s limit reached, nothing sent', cap === 'Today’s limit is reached; try tomorrow, or use a template.' && SENT.length === n7, cap);
  await db.collection('sgAiUse').doc(londonDay()).set({ total: 0, by: {} });
  /* 8. the print */
  await go(O, 'safeguarding.html?event=' + EID, '#sgaHostOk');
  await tap(O, '#sgaHostOk');
  await until(async () => (await assess()).host.confirmed);
  await go(L, 'sg-print.html?event=' + EID, '#sheet[data-ready]');
  ok('8. THE PRINT: "Requirements taken from camp-list.pdf, checked by Olly Organiser (invented) on <date>", and the list', /^Requirements taken from camp-list\.pdf, checked by Olly Organiser \(invented\) on \d{1,2} \w+ \d{4}\./.test(await text(L, '#pHost')) && /first aid certificate/.test(await text(L, '#pHostList')), await text(L, '#pHost'));
  ok('   and its questions in the checklist, "Not answered" until they are', (await L.$$('[data-pck^="h_"] [data-pckmissing]')).length === 2);
  /* 9. never socket covers, even when the host's sheet asks (F-280 10.7) */
  const LIST3 = { host: 'Hilltop Christian Camp (invented)', personalFound: false, items: [
    { question: 'Has the group fitted socket covers in its dormitory? (invented)', line: 'Groups must fit socket covers in dormitories.' },
    { question: 'Will lights be out by 10pm in the dormitories? (invented)', line: 'Lights out by 10pm in the dormitories.' }] };
  QUEUE.push(answer(LIST3));
  const n9 = SENT.length;
  await go(O, 'safeguarding.html?event=' + EID, '#sgaHostAgain');
  await tap(O, '#sgaHostAgain');
  await upload(O, F.docx);
  await O.waitForSelector('#sgaHostSockets', { timeout: 40000 }).catch(() => null);
  ok('9. NEVER SOCKET COVERS: the instruction is in what was sent', /Never recommend socket covers.*If the document asks for them, leave that requirement out\./.test(J((SENT[n9] || {}).system)), J((SENT[n9] || {}).system).slice(-250));
  const a9 = await assess();
  ok('   THE HOST’S OWN "socket covers" requirement is left out (1 of 2), and counted', a9.host.items.length === 1 && /Lights out|lights be out/.test(a9.host.items[0].q) && a9.host.leftOut === 1 && !/socket/i.test(J(a9.host.items)), J(a9.host));
  ok('   THE LEADER IS TOLD: "One requirement was left out: socket covers aren’t advised for UK sockets … talk to the host."', /^One requirement was left out: socket covers aren’t advised for UK sockets, which have shutters built in\. If the host insists on them, talk to the host\.$/.test(await text(O, '#sgaHostSockets')), await text(O, '#sgaHostSockets'));
  /* 10. has each leader read the host's safeguarding policy (S3): its own record, a tick and a date each */
  await go(O, 'safeguarding.html?event=' + EID, '#sgaPolicy');
  ok('10. WITH A HOST: "Has each leader read Hilltop Christian Camp (invented)’s safeguarding policy?" 0 of 1, amber', (await text(O, '#sgaPolicy')).includes('Has each leader read Hilltop Christian Camp (invented)’s safeguarding policy?') && (await text(O, '[data-policycount]')) === '0 of 1' && (await O.$eval('[data-policycount]', (e) => e.className)).includes('amber'), await text(O, '#sgaPolicy'));
  await O.$eval('[data-policyread="m_lena"]', (e) => { e.checked = true; e.dispatchEvent(new Event('change')); });
  const pr = await until(async () => { const d = (await db.collection('sgPolicyReads').doc(EID).get()).data(); return d && d.reads && d.reads.m_lena ? d : null; });
  ok('   ticked: kept in its own record (sgPolicyReads), with the date; 1 of 1, green', pr && /^\d{4}-\d{2}-\d{2}$/.test(pr.reads.m_lena) && !('reads' in (await assess())) && !!(await until(async () => (await text(O, '[data-policycount]')) === '1 of 1')), J(pr));
  await go(L, 'sg-print.html?event=' + EID, '#sheet[data-ready]');
  ok('   THE PRINT: "Read Hilltop Christian Camp (invented)’s safeguarding policy: 1 of 1 leaders." (a count, never a name)', (await text(L, '#pPolicy')) === 'Read Hilltop Christian Camp (invented)’s safeguarding policy: 1 of 1 leaders.', await text(L, '#pPolicy'));
  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close(); stub.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
