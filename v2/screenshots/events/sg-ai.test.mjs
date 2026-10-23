/* THE SAFEGUARDING RISK REGISTER, step 5: AI-drafted event assessments
   (F-265 part A). Events window. Invented people and events only, events
   emulators only (with the hub's functions), network guard. NO REAL API
   CALL: on the emulator the function talks to a local stand-in for
   Anthropic's API (sgAiStub/config), which answers as told and keeps what
   it was sent.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/sg-ai.test.mjs"

   What it proves:
     1. NOT SET UP: the plain message, and no call
     2. PERSONAL DETAILS ARE REFUSED BEFORE ANY CALL: a child's name the hub
        holds for the event, an email, a phone number; a medical word next to
        a name asks first
     3. A DRAFT: saved as a draft, labelled "First draft by AI: check every
        line"; the hub's sums give the overall (the AI said green); the hub's
        own "not enough leaders" row; "must not go ahead" in red; bookings
        stay closed; what was sent had counts and the leader's words only;
        the log has no words
     4. SIGN-OFF: not while a "must not go ahead" item is there; changed, it
        signs (with a reason for the red left); a signed one is not redrafted
     5. A REFUSAL by the model: Martin's words, nothing saved, no other model
     6. MALFORMED: nothing saved; BUSY: tried again on the same model
     7. WHO: the organiser and the named leaders; not a volunteer or a trustee
     8. THE CAPS: the church's and each person's
     9. THE REGISTER'S SWITCH turns it off
    10. 375px and computer, pictures
    11. A KEY OR SET-UP PROBLEM (the reviewing window, 23 Oct): a key not
        scoped to a workspace (400) and an expired key (401) say "The AI
        isn't set up properly yet. Ask the church office.", are never
        retried, log the API's request id and error type, and make
        sgAiStatus say "set up but not working" - until the key changes or
        a call works */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-sgai-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
if (!getApps().length) initializeApp({ projectId: PROJECT });
const db = getFirestore();
const { londonDay } = await import('../../functions/sg-warnings.js');
const AI = fnRequire('./sg-ai-core.cjs');

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 30000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(200); } return last; }
const J = (x) => JSON.stringify(x);

/* ---- the stand-in for Anthropic's API: answers in turn, keeps what it was sent ---- */
const SENT = [], QUEUE = [];
const message = (body, stop) => ({ status: 200, body: { id: 'msg_stub', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: body == null ? [] : [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }],
  stop_reason: stop || 'end_turn', stop_sequence: null, usage: { input_tokens: 900, output_tokens: 1800 } } });
const H = (x) => Object.assign({ hazard: 'Getting separated at the airport', who: 'Young people', likelihood: 3, impact: 4, controls: ['Headcount at every gate'], likelihoodAfter: 2, impactAfter: 4, owner: 'The trip leader', review: 'At each change of place', mustNotGoAhead: false }, x);
/* the AI's own arithmetic is wrong on purpose: it says "green" */
const DRAFT = { summary: 'A mission trip abroad with a prison visit.', overall: 'green', hazards: [
  H({ hazard: 'Swimming at the hotel pool', likelihood: 4, impact: 5, controls: ['A lifeguard on duty', 'Two leaders at the poolside'], likelihoodAfter: 3, impactAfter: 5 }),
  H({ hazard: 'Young people left alone with prisoners', likelihood: 3, impact: 5, controls: ['Leaders with the group at all times'], likelihoodAfter: 3, impactAfter: 5, mustNotGoAhead: true }),
  H() ], mustNotGoAhead: ['Young people must not be left alone in the prison at any time.'], questions: ['Who is the trained first aider?', 'What is the plan if a passport is lost?'] };
const REFUSAL = { status: 200, body: Object.assign(message(null, 'refusal').body, { stop_details: { category: null, explanation: 'Declined (stand-in)' } }) };
const BUSY = { status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded (stand-in)' } } };
const stub = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
    let body = null; try { body = JSON.parse(b); } catch (e) {}
    SENT.push({ path: req.url, key: req.headers['x-api-key'], body });
    const next = QUEUE.shift() || { status: 500, body: { type: 'error', error: { type: 'api_error', message: 'nothing queued' } } };
    res.writeHead(next.status, Object.assign({ 'Content-Type': 'application/json' }, next.headers || {})); res.end(JSON.stringify(next.body));
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

const TODAY = londonDay(new Date()), DAY = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10), DAY2 = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
const P = {
  olly: { email: 'olly.organiser@example.invalid', name: 'Olly Organiser (invented)', mid: 'm_olly', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  lena: { email: 'lena.lead@example.invalid', name: 'Lena Lead (invented)', mid: 'm_lena', teams: ['Kids Church'] },
  vic:  { email: 'vic.leader@example.invalid', name: 'Vic Leader (invented)', mid: 'm_vic', teams: ['Kids Church'] },
  sam:  { email: 'sam.volunteer@example.invalid', name: 'Sam Volunteer (invented)', mid: 'm_sam', teams: ['Kids Church'] },
  tom:  { email: 'tom.trustee@example.invalid', name: 'Tom Trustee (invented)', mid: 'm_tom', teams: ['Elders'] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
}
const EV = (id, title, day) => ({ title, description: '', category: 'children', labels: [], visibility: 'public', status: 'confirmed', audience: ['public'], teams: [], featured: false,
  startLocal: day + 'T10:00', startUtc: Date.parse(day + 'T10:00:00Z'), endLocal: day + 'T16:00', endUtc: Date.parse(day + 'T16:00:00Z'), allDay: false,
  location: { kind: 'room', siteId: 'site_t', roomIds: [] }, organiserName: 'Olly Organiser (invented)', overseers: [], overseerUids: [], createdBy: P.olly.uid,
  teamMemberIds: [], teamUids: [], teamNames: [], signupOn: true, capacity: 30, allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', imageLibId: '', seriesId: '', sgKind: 'trip', updatedAt: 'x' });
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
  S('leaderChecks', 'm_vic', { dbsStatus: 'seen', dbsSeen: '2026-01-10', trainingDate: '2026-02-01' });
  for (const [id, t, d] of [['ev_trip', 'Mission trip (invented)', DAY], ['ev_trip2', 'Second trip (invented)', DAY2]]) {
    S('calEvents', id, EV(id, t, d));
    S('eventLeaders', id, { under18: true, leaders: [{ memberId: 'm_vic', name: 'Vic Leader (invented)', uid: P.vic.uid }], leaderIds: ['m_vic'], leaderUids: [P.vic.uid], siteId: 'site_t', clearedIds: [], lastCleared: [], updatedAt: 'x', updatedBy: 'x' });
    S('sgGate', id, { needed: true, open: false, updatedAt: 'x' });
    /* twelve booked by an invented parent, whose child is named: neither name may leave the hub */
    S('signups', 'su_' + id, { calEventId: id, personKind: 'contacts', personId: 'c_pat', name: 'Pat Jones (invented)', email: 'pat.jones@example.invalid', places: 12, status: 'confirmed', attendees: [{ name: 'Charlie Jones (invented)' }].concat(Array.from({ length: 11 }, (_, i) => ({ name: 'Child ' + (i + 2) + ' (invented)' }))), answers: {} });
  }
  await b.commit();
}
const STUB = () => db.collection('sgAiStub').doc('config').set({ url: 'http://127.0.0.1:5617' });
const logs = async () => (await db.collection('sgAiLog').get()).docs.map((d) => d.data());
const assess = async (id) => (await db.collection('sgAssessments').doc(id).get()).data();
const PRIVATE = /Charlie|Pat Jones|pat\.jones@|Vic Leader|Olly|07700|example\.invalid/;
const BRAZIL = 'A mission trip to a city in Brazil for 12 young people aged 13 to 17, flying overnight. One leader so far. The group will sing at a prison and stay in a hotel with a pool. Some have allergies.';

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
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
const tap = (p, sel) => p.$eval(sel, e => e.click());
const wide = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const call = (p, name, data) => p.evaluate((n, d) => EGBCAuth.call(n, d).then((r) => ({ ok: true, r: (r && r.data) || r }), (e) => ({ ok: false, code: e.code || '', message: e.message || String(e) })), name, data);
const shot = (p, name) => p.screenshot({ path: path.join(HERE, name), fullPage: true });

try {
  /* 1. not set up */
  const O = await as('olly');
  await go(O, 'safeguarding.html?event=ev_trip', '#sgaAiState');
  ok('1. NOT SET UP: the plain message, and no box to type in', (await O.$eval('#sgaAiState', e => e.getAttribute('data-state'))) === 'notset' && /AI drafting isn’t set up yet for this church\. Write the assessment from a template instead\./.test(await text(O, '#sgaAiState')) && !(await O.$('#sgaAiText')), await text(O, '#sgaAi'));
  const ns = await call(O, 'sgDraftAssessment', { calEventId: 'ev_trip', text: 'A trip.' });
  ok('   asked anyway, the server says the same', !ns.ok && /isn’t set up yet/.test(ns.message), J(ns));
  ok('   and nothing was sent', SENT.length === 0, SENT.length);

  /* 2. personal details */
  await STUB();
  await go(O, 'safeguarding.html?event=ev_trip', '#sgaAiText');
  ok('2. SET UP: the box, the warning above it, and where the words go', /Don’t put in any child’s name, anyone’s contact details or anyone’s medical details/.test(await text(O, '#sgaAiNo')) && /Sent to Anthropic’s Claude to draft; not kept by the hub\./.test(await text(O, '#sgaAiWhere')));
  await O.$eval('#sgaAiText', (e) => { e.value = 'A day out at the zoo; Charlie will need help with the steps.'; });
  await tap(O, '#sgaAiGo');
  const m1 = await until(async () => { const t = await text(O, '#sgaAiMsg'); return /child’s name/.test(t) ? t : null; });
  ok('   A CHILD\u2019S NAME the hub holds for the event (from its sign-ups): refused, without repeating it', !!m1 && !/Charlie/.test(m1), m1);
  const em = await call(O, 'sgDraftAssessment', { calEventId: 'ev_trip', text: 'Questions to pat.jones@example.invalid please.' });
  ok('   an email address: refused', !em.ok && /email address/.test(em.message), J(em));
  const ph = await call(O, 'sgDraftAssessment', { calEventId: 'ev_trip', text: 'On the day ring 07700 900123.' });
  ok('   a phone number: refused', !ph.ok && /phone number/.test(ph.message), J(ph));
  const md = await call(O, 'sgDraftAssessment', { calEventId: 'ev_trip', text: 'A beach day. Sam has epilepsy and needs watching in the water.' });
  ok('   a medical word next to a name: asks first', md.ok && md.r.needsConfirm === true && /general words/.test(md.r.message), J(md));
  ok('   NOTHING WAS SENT for any of them', SENT.length === 0, SENT.length);
  ok('   each refusal logged, without the words', (await logs()).filter((l) => l.outcome === 'refused-personal').length === 3 && !/Charlie|pat\.jones|07700|zoo|steps|epilepsy/.test(J(await logs())), J(await logs()));

  /* 3. a draft */
  QUEUE.push(message(DRAFT));
  await O.$eval('#sgaAiText', (e, t) => { e.value = t; }, BRAZIL);
  await tap(O, '#sgaAiGo');
  await O.waitForSelector('#sgaAiLabel', { timeout: 30000 });
  ok('3. A DRAFT: "First draft by AI: check every line"', /First draft by AI: check every line\. It counts for nothing until the safeguarding lead or deputy signs it off\./.test(await text(O, '#sgaAiLabel')));
  ok('   THE HUB\u2019S SUMS: overall High (the AI said green)', (await O.$eval('[data-overall]', e => e.getAttribute('data-overall'))) === 'red');
  const a1 = await assess('ev_trip') || {};
  ok('   saved as a draft, from the AI, by the model asked for', a1.status === 'draft' && a1.source && a1.source.kind === 'ai' && a1.source.model === 'claude-sonnet-5-5' && a1.source.overall === 'red' && a1.source.by === P.olly.uid, J(a1.source));
  ok('   THE HUB\u2019S OWN ROW first: "Not enough leaders: 3 needed for 12 children; 1 named", must not go ahead', a1.risks[0].from === 'hub' && a1.risks[0].mustNot === true && /Not enough leaders: 3 needed for 12 children; 1 named/.test(a1.risks[0].risk), J(a1.risks[0]));
  ok('   THE SAME COUNT AS THE PAGE: its own "Children booked" says 12 too', /\b12 Children booked/.test(await text(O)), (await text(O)).match(/\d+ Children booked/));
  ok('   the AI\u2019s rows after it, each with an owner as a role', a1.risks.length === 4 && a1.risks.slice(1).every((r) => r.from === 'ai' && r.owner === 'The trip leader'), J(a1.risks.map((r) => r.from + ':' + r.owner)));
  ok('   "This must not go ahead as described", in red, with the plain sentences', /This must not go ahead as described\./.test(await text(O, '#sgaMustNot')) && /Young people must not be left alone in the prison at any time\./.test(await text(O, '#sgaMustNot')) && (await O.$$('[data-mustnot]')).length === 2, await text(O, '#sgaMustNot'));
  ok('   the questions to answer before sign-off', /Who is the trained first aider\?/.test(await text(O, '#sgaQuestions')));
  ok('   THE LEADER\u2019S WORDS ARE NOT KEPT', !/mission trip to a city|sing at a prison/.test(J(a1)), J(a1).slice(0, 200));
  ok('   BOOKINGS STAY CLOSED: the gate says waiting', (await db.collection('sgGate').doc('ev_trip').get()).data().open === false);
  const s1 = SENT[0] || {}, sb = s1.body || {}, sent = J(sb);
  ok('   WHAT WAS SENT: once, to the messages address, the model, the fixed shape, the instructions cached', SENT.length === 1 && /\/v1\/messages/.test(s1.path) && sb.model === 'claude-sonnet-5-5' && sb.max_tokens === 16000 && sb.output_config.format.type === 'json_schema' && sb.system[0].cache_control.type === 'ephemeral', J({ path: s1.path, model: sb.model, oc: sb.output_config && sb.output_config.format && sb.output_config.format.type }));
  ok('   the counts and the leader\u2019s words: "Children booked or expected: 12", "Leaders named: 1, of whom 1"', /Children booked or expected: 12/.test(sent) && /Leaders named: 1, of whom 1 have an in-date check/.test(sent) && /mission trip to a city in Brazil/.test(sent));
  ok('   NO CHILD\u2019S OR PARENT\u2019S NAME, NO EMAIL, NO LEADER\u2019S NAME LEFT THE HUB', !PRIVATE.test(sent), (sent.match(PRIVATE) || [])[0]);
  const lg = (await logs()).filter((l) => l.outcome === 'drafted');
  ok('   THE LOG: counts and the outcome only, never the words', lg.length === 1 && J(Object.keys(lg[0]).sort()) === J(['at', 'by', 'byName', 'calEventId', 'chars', 'outcome', 'siteId', 'tokensIn', 'tokensOut']) && lg[0].chars === BRAZIL.length && lg[0].tokensIn === 900, J(lg));
  await shot(O, 'sg-ai-draft-desk.png');
  await O.setViewport({ width: 375, height: 800 }); await sleep(300);
  ok('   375px: no sideways scrolling', (await wide(O)) <= 0, await wide(O));
  await shot(O, 'sg-ai-draft-375.png');
  await O.setViewport({ width: 1280, height: 900 });

  /* 4. sign-off */
  const L = await as('lena');
  await go(L, 'safeguarding.html?event=ev_trip', '#sgaSign');
  await tap(L, '#sgaSign');
  const m4 = await until(async () => { const t = await text(L, '#sgaMsg'); return /must not go ahead/.test(t) ? t : null; });
  ok('4. THE LEAD CAN\u2019T SIGN while a "must not go ahead" item is there', !!m4 && (await assess('ev_trip')).status === 'draft', m4);
  /* the lead takes the hub's row and the prison visit out */
  await L.$$eval('[data-sgarisk]', (rows) => rows.forEach((r) => { if (r.querySelector('[data-mustnot]')) r.querySelector('[data-rf="risk"]').value = ''; }));
  await tap(L, '#sgaSave');
  await until(async () => !(await L.$('#sgaMustNot')));
  ok('   taken out, the red box goes', !(await L.$('#sgaMustNot')) && (await assess('ev_trip')).risks.length === 2);
  await tap(L, '#sgaSign');
  await until(async () => /say why/i.test(await text(L, '#sgaMsg')));
  await L.$eval('#sgaNote', (e) => { e.value = 'A lifeguard and two leaders at the pool (invented).'; });
  await tap(L, '#sgaSign');
  const signed = await until(async () => { const a = await assess('ev_trip'); return a && a.status === 'signed' ? a : null; });
  ok('   then the lead signs it, with a reason for the red left; bookings open', !!signed && signed.signedBy === P.lena.uid && (await db.collection('sgGate').doc('ev_trip').get()).data().open === true);
  const n4 = SENT.length, again = await call(O, 'sgDraftAssessment', { calEventId: 'ev_trip', text: 'A trip.' });
  ok('   A SIGNED ONE IS NOT REDRAFTED', !again.ok && /already signed off/.test(again.message) && SENT.length === n4, J(again));

  /* 5. a refusal */
  QUEUE.push(REFUSAL);
  const rf = await call(O, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  ok('5. A REFUSAL: "The AI couldn\u2019t draft this; write it from the template instead."', !rf.ok && rf.message === 'The AI couldn’t draft this; write it from the template instead.', J(rf));
  ok('   NO OTHER MODEL: one call, the same model, nothing saved', SENT.length === n4 + 1 && SENT[SENT.length - 1].body.model === 'claude-sonnet-5-5' && !(await assess('ev_trip2')) && !('fallbacks' in SENT[SENT.length - 1].body), SENT.length);
  ok('   logged as refused by the model', (await logs()).some((l) => l.outcome === 'refused-model' && l.calEventId === 'ev_trip2'));

  /* 6. malformed; busy */
  QUEUE.push(message('This is not the shape asked for.'));
  const mf = await call(O, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  ok('6. MALFORMED: "The draft came back incomplete; try again", nothing saved', !mf.ok && /came back incomplete/.test(mf.message) && !(await assess('ev_trip2')), J(mf));
  const n6 = SENT.length;
  QUEUE.push(BUSY, message(DRAFT));
  const bz = await call(O, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  ok('   BUSY: tried again on the same model, and drafted', bz.ok && bz.r.ok === true && SENT.length === n6 + 2 && SENT.slice(-2).every((s) => s.body.model === 'claude-sonnet-5-5') && (await assess('ev_trip2')).status === 'draft', J(bz));

  /* 7. who */
  const Sm = await as('sam');
  const n7 = SENT.length;
  const sm = await call(Sm, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  ok('7. A VOLUNTEER NOT ON THE EVENT is refused (and nothing sent)', !sm.ok && /permission/i.test(sm.code + sm.message) && SENT.length === n7, J(sm));
  const T = await as('tom');
  const tm = await call(T, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  ok('   A TRUSTEE too: they read assessments, they don\u2019t draft them', !tm.ok && /permission/i.test(tm.code + tm.message), J(tm));
  const Vv = await as('vic');
  QUEUE.push(message(DRAFT));
  const vc = await call(Vv, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  ok('   THE EVENT\u2019S NAMED LEADER may ask', vc.ok && vc.r.ok === true, J(vc));

  /* 8. the caps */
  const use = db.collection('sgAiUse').doc(TODAY);
  await use.set({ total: 20, by: {} });
  const n8 = SENT.length, c1 = await call(O, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL }), st1 = await call(O, 'sgAiStatus', { calEventId: 'ev_trip2' });
  ok('8. THE CHURCH\u2019S 20 A DAY: the 21st is refused, before anything is sent', !c1.ok && c1.message === 'Today’s limit is reached; try tomorrow, or use a template.' && SENT.length === n8 && st1.r.state === 'capped', J([c1, st1]));
  await use.set({ total: 7, by: { [P.olly.uid]: 5 } });
  const c2 = await call(O, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  ok('   EACH PERSON\u2019S 5 A DAY', !c2.ok && /limit is reached/.test(c2.message) && SENT.length === n8, J(c2));
  QUEUE.push(message(DRAFT));
  const c3 = await call(Vv, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  ok('   while someone else may still ask', c3.ok, J(c3));
  const u8 = (await use.get()).data() || { by: {} };
  ok('   counted: the church 8, Olly still 5, Vic 1', u8.total === 8 && u8.by[P.olly.uid] === 5 && u8.by[P.vic.uid] === 1, J(u8));
  ok('   the capped ones logged', (await logs()).filter((l) => l.outcome === 'capped').length === 2);

  /* 9. the register's switch */
  await db.collection('churchSettings').doc('features').set({ safeguardingRegister: false }, { merge: true });
  const off = await call(Vv, 'sgAiStatus', { calEventId: 'ev_trip2' }), off2 = await call(Vv, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  ok('9. THE REGISTER SWITCHED OFF: AI drafting says so, and refuses', off.r.state === 'off' && !off2.ok && /turned off/.test(off2.message), J([off, off2]));
  await go(L, 'safeguarding-risk.html', '#regOff');
  ok('   and the register page says it is turned off', /The safeguarding risk register is turned off for this church/.test(await text(L, '#regOff')));
  await db.collection('churchSettings').doc('features').set({ safeguardingRegister: true }, { merge: true });

  /* 11. a key or set-up problem */
  const NOWS = { status: 400, headers: { 'request-id': 'req_stub_400' }, body: { type: 'error', error: { type: 'invalid_request_error', message: 'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header (stand-in)' } } };
  const EXPIRED = { status: 401, headers: { 'request-id': 'req_stub_401' }, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key: the key has expired (stand-in)' } } };
  const n11 = SENT.length;
  QUEUE.push(NOWS);
  const k1 = await call(Vv, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  ok('11. A KEY NOT SCOPED TO A WORKSPACE (400): "The AI isn\u2019t set up properly yet. Ask the church office."', !k1.ok && k1.message === 'The AI isn’t set up properly yet. Ask the church office.', J(k1));
  ok('   NEVER RETRIED: one call', SENT.length === n11 + 1, SENT.length - n11);
  const kl = (await logs()).filter((l) => l.outcome === 'setup-failed');
  ok('   logged with the API\u2019s request id and error type, and still no words', kl.length === 1 && kl[0].requestId === 'req_stub_400' && kl[0].errorType === 'invalid_request_error' && kl[0].status === 400 && !/Brazil|prison/.test(J(kl)), J(kl));
  const ks = await call(Vv, 'sgAiStatus', { calEventId: 'ev_trip2' });
  ok('   sgAiStatus: "set up but not working"', ks.ok && ks.r.state === 'broken' && /set up but not working yet\. Ask the church office/.test(ks.r.message), J(ks));
  await go(Vv, 'safeguarding.html?event=ev_trip2', '#sgaAiState');
  ok('   and the page says so, with no box to type in', (await Vv.$eval('#sgaAiState', (e) => e.getAttribute('data-state'))) === 'broken' && !(await Vv.$('#sgaAiText')), await text(Vv, '#sgaAi'));
  ok('   the state keeps a fingerprint of the key, never the key', /^[0-9a-f]{12}$/.test(((await db.collection('sgAiState').doc('current').get()).data() || {}).key || ''));
  await db.collection('sgAiStub').doc('config').set({ url: 'http://127.0.0.1:5617', key: 'stub-new-key' });
  const kn = await call(Vv, 'sgAiStatus', { calEventId: 'ev_trip2' });
  ok('   A NEW KEY: ready again', kn.ok && kn.r.state === 'ready', J(kn));
  QUEUE.push(EXPIRED);
  const k2 = await call(Vv, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  const k2s = await call(Vv, 'sgAiStatus', { calEventId: 'ev_trip2' });
  ok('   AN EXPIRED KEY (401): the same plain message, and "set up but not working"', !k2.ok && k2.message === 'The AI isn’t set up properly yet. Ask the church office.' && k2s.r.state === 'broken', J([k2, k2s]));
  QUEUE.push(message(DRAFT));
  const k3 = await call(Vv, 'sgDraftAssessment', { calEventId: 'ev_trip2', text: BRAZIL });
  const k3s = await call(Vv, 'sgAiStatus', { calEventId: 'ev_trip2' });
  ok('   once a call works, it is ready again', k3.ok && k3.r.ok === true && k3s.r.state === 'ready', J([k3, k3s]));

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
