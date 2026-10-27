/* READING A REPORT INTO A RISK ASSESSMENT (H&S steps 4 and 5; F-280
 * sections 3C, 3D and 4). The events window's file.
 *
 *   raReadReport({ kind, ... })
 *     kind 'hs' or 'fire', { siteId, fileName, contentType, data }:
 *         a professional's report on one of the church's buildings;
 *     kind 'venue', { calEventId, and a file, or urls (up to 5), or text }:
 *         an away event's venue - its own fire arrangements, risk
 *         assessment and rules - read from its document, its web pages
 *         (web-reader-core.cjs: https and public addresses only, the same
 *         limits as a host's pages) or pasted words;
 *     kind 'hire', { bookingKey, fileName, contentType, data }:
 *         a hirer's own risk assessment, checked against the building's
 *         significant hazards (each one a heading it should cover).
 *   The file is kept as it came; Claude reads it (ra-report-core.cjs); what
 *   it found is saved in raReads/<id>__<kind>, NOT in any assessment. The
 *   page shows it and a person checks each line before anything is added.
 *   raAiStatus({ siteId | calEventId | bookingKey })   ready / notset / ...
 *   raDraftAssessment({ kind: 'hs'|'fire', siteId | kind: 'event', calEventId, eventKind, flags, people,
 *       description, questions })   (H&S step 7) the AI's first draft, RETURNED to the page and never
 *       saved by itself: the page labels it "First draft by AI: check every line" and the person
 *       saves it. The description is refused if it has a person's details. The hub's own facts go
 *       with it (fire maximums, the checks' colours, counts); the hub does the sums.
 *
 * Who: as for what is being assessed - a building's: master admins, the
 * office (its job) and the building's leads; an event's: its organisers and
 * leaders, the office, master admins; a hire: the office for that building
 * (admins and its bookings admins) and the office job. Caps: Health and
 * safety settings' AI drafts a day (raSettings/church.ai; 20 and 5),
 * separate from safeguarding's (F-280 answer 9): raAiUse, raAiLog,
 * raAiState, raAiStub. For each church, from the sign-in (church-scope.js).
 */
import { createRequire } from 'node:module';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { aiPlumbing, callModel } from './ra-ai.js';
import { CHQ_ANTHROPIC_API_KEY, realDeps } from './sg-ai.js';
import { londonDay } from './sg-warnings.js';
import { readTeamJobs, onJob } from './team-jobs.js';
import { churchOf } from './church-scope.js';

const require = createRequire(import.meta.url);
const R = require('./ra-report-core.cjs');
const Links = require('./web-reader-core.cjs');
const RA = require('./ra-ai-core.cjs');
const DR = require('./ra-draft-core.cjs');
const CE = require('./compliance-engine.cjs');
const CS = require('./compliance-store.cjs');
const REGION = 'europe-west2';
const WORDS = {
  notSet: 'Reading with AI isn’t set up yet for this church. Type the findings in by hand.',
  setup: 'The AI isn’t set up properly yet. Ask the church office.',
  broken: 'Reading with AI is set up but not working yet. Type the findings in by hand for now.',
  capped: 'Today’s limit of AI reads is reached; try tomorrow, or type the findings in by hand.'
};
const { apiOf, logIt, broken, noteWorking, callFailed, takeOne, usedUp } = aiPlumbing({ secret: CHQ_ANTHROPIC_API_KEY, day: () => londonDay(),
  records: { use: 'raAiUse', log: 'raAiLog', state: 'raAiState', stub: 'raAiStub' }, words: WORDS });

/* the caps: Health and safety settings, 20 a day for the church and 5 a person unless it says */
export function capsOf(set) {
  const a = (set && set.ai) || {}, n = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d);
  return { perChurch: n(a.perChurch, 20), perPerson: n(a.perPerson, 5) };
}
const get = (dbi, c, d) => dbi.collection(c).doc(d).get().then((s) => (s.exists ? s.data() : null));
async function person(dbi, uid) {
  const me = await get(dbi, 'users', uid);
  if (!me || me.status !== 'active') return null;
  const tj = await readTeamJobs(dbi);
  me._office = me.masterAdmin === true || onJob(tj.map, (me.teams || []).concat(me.covers || []), 'office', tj.set);
  return me;
}

/* What is being read for, and may this person? -> { ok, me, siteId, docId, path, heads, calEventId?, bookingKey? } */
export async function targetFor(dbi, uid, data) {
  const kind = String(data.kind || '');
  const me = await person(dbi, uid);
  if (!me) return { ok: false };
  const stamp = Date.now() + '-';
  if (kind === 'hs' || kind === 'fire') {
    const siteId = String(data.siteId || '');
    if (!siteId || siteId.includes('/') || !(await get(dbi, 'sites', siteId))) throw new HttpsError('invalid-argument', 'Which building?');
    const r = (await get(dbi, 'raSiteRoles', siteId)) || {}, mid = me.memberId || '';
    const ok = me._office || (!!mid && [r.hsLead, r.hsDeputy, r.fireLead].includes(mid));
    return { ok, me, kind, siteId, docId: siteId + '__' + kind, path: 'compliance/' + siteId + '/risk-' + kind + '/' + stamp, heads: R.headsFor(kind) };
  }
  if (kind === 'event') {
    const calEventId = String(data.calEventId || '');
    const ev = calEventId && !calEventId.includes('/') ? await get(dbi, 'calEvents', calEventId) : null;
    if (!ev) throw new HttpsError('invalid-argument', 'Which event?');
    const l = (await get(dbi, 'eventLeaders', calEventId)) || {}, mid = me.memberId || '';
    let ok = me._office || (!!mid && (ev.teamMemberIds || []).includes(mid)) || (ev.teamUids || []).includes(uid) || (l.leaderUids || []).includes(uid)
      || ((me.adminFor || []).length > 0 && ev.createdBy === uid);
    if (!ok && mid) { const roles = await dbi.collection('raSiteRoles').get(); ok = roles.docs.some((d) => [d.data().hsLead, d.data().hsDeputy].includes(mid)); }
    return { ok, me, kind, calEventId, ev, siteId: (ev.location || {}).kind === 'room' ? (ev.location.siteId || '') : '', heads: [] };
  }
  if (kind === 'venue') {
    const calEventId = String(data.calEventId || '');
    const ev = calEventId && !calEventId.includes('/') ? await get(dbi, 'calEvents', calEventId) : null;
    if (!ev) throw new HttpsError('invalid-argument', 'Which event?');
    const l = (await get(dbi, 'eventLeaders', calEventId)) || {}, mid = me.memberId || '';
    const ok = me._office || (!!mid && (ev.teamMemberIds || []).includes(mid)) || (ev.teamUids || []).includes(uid) || (ev.overseerUids || []).includes(uid)
      || (me.adminFor || []).length > 0 && ev.createdBy === uid || (l.leaderUids || []).includes(uid);
    return { ok, me, kind, calEventId, siteId: (ev.location || {}).siteId || '', docId: calEventId + '__venue', path: 'raVenues/' + calEventId + '/' + stamp, heads: R.headsFor('venue') };
  }
  if (kind === 'hire') {
    const bookingKey = String(data.bookingKey || '');
    const b = bookingKey && !bookingKey.includes('/') ? await get(dbi, 'bookings', bookingKey) : null;
    if (!b || b.kind !== 'hire') throw new HttpsError('invalid-argument', 'Which booking?');
    const bs = (await get(dbi, 'bookingSettings', b.siteId)) || {};
    const ok = me._office || (me.adminFor || []).length > 0 || (!!me.memberId && (bs.bookingsAdmins || []).includes(me.memberId));
    /* the building's significant hazards (Medium or High after the controls), from its own assessments */
    const hazards = [];
    for (const k of ['hs', 'fire']) {
      const a = await get(dbi, 'raAssessments', b.siteId + '__' + k);
      ((a && a.hazards) || []).forEach((h) => { if (RA.rating(h.rl, h.rs) !== 'green' && h.hazard) hazards.push(h.hazard); });
    }
    return { ok, me, kind, bookingKey, siteId: b.siteId, docId: bookingKey + '__hire', path: 'compliance/' + b.siteId + '/hire/' + bookingKey + '/' + stamp, heads: R.headsFor('hire', hazards), hazards };
  }
  throw new HttpsError('invalid-argument', 'What is being read?');
}

export async function readReport({ db: dbi, uid, data, api, bucket, prefix, deps }) {
  data = data || {};
  const t = await targetFor(dbi, uid, data);
  if (!t.ok) throw new HttpsError('permission-denied', t.kind === 'hire' ? 'This is for the office.' : t.kind === 'venue' ? 'This is for the event’s organisers and leaders, and the office.' : 'This is for the office, the building’s health and safety and fire safety leads, and master admins.');
  const urls = t.kind === 'venue' ? (Array.isArray(data.urls) ? data.urls : []).map((x) => String(x || '').trim()).filter(Boolean) : [];
  const pasted = t.kind === 'venue' ? String(data.text || '').slice(0, 60000) : '';
  if (urls.length > Links.LIMITS.starts) throw new HttpsError('invalid-argument', 'Up to ' + Links.LIMITS.starts + ' addresses at a time.');
  const fromFile = !!data.data;
  let fk = '', buf = null, text = '';
  const type = String(data.contentType || '').toLowerCase(), fileName = String(data.fileName || 'document').replace(/[\\/]/g, '_').slice(0, 120);
  if (fromFile) {
    fk = R.fileKind(type, fileName);
    if (!fk) throw new HttpsError('invalid-argument', 'Upload a PDF, a Word document (.docx), or a photo or scan.');
    buf = Buffer.from(String(data.data || ''), 'base64');
    if (!buf.length) throw new HttpsError('invalid-argument', 'The file is empty.');
    if (buf.length > R.MAX_BYTES) throw new HttpsError('invalid-argument', 'The file is too big: 7 MB at most. A photo of each page will do.');
    if (fk === 'docx') {
      try { text = R.docxText(buf); } catch (e) { throw new HttpsError('invalid-argument', 'This Word document can’t be read. Save it as a PDF and try that.'); }
      if (!text.trim()) throw new HttpsError('invalid-argument', 'There are no words in this Word document.');
    }
  } else if (!urls.length && !pasted.trim()) throw new HttpsError('invalid-argument', t.kind === 'venue' ? 'Give the venue’s document, its web page addresses, or paste what it says.' : 'Give the file.');
  const base = { siteId: t.siteId, calEventId: t.calEventId || '', by: uid, byName: t.me.name || '', chars: buf ? buf.length : pasted.length, kind: 'report-' + t.kind };
  const key = api || (await apiOf(dbi));
  if (!key.apiKey) throw new HttpsError('failed-precondition', WORDS.notSet);
  if (await broken(dbi, key.apiKey)) throw new HttpsError('failed-precondition', WORDS.broken);
  const set = (await get(dbi, 'raSettings', 'church')) || {};
  if (!(await takeOne(dbi, uid, capsOf(set)))) { await logIt(dbi, Object.assign({ outcome: 'capped' }, base)); throw new HttpsError('resource-exhausted', WORDS.capped); }
  const store = bucket || getStorage().bucket();
  let content, file;
  if (fromFile) {
    /* the original, kept as it came */
    const path = (prefix || '') + t.path + fileName.replace(/[^A-Za-z0-9._ -]/g, '_');
    await store.file(path).save(buf, { contentType: type || (fk === 'docx' ? R.DOCX : 'application/octet-stream'), resumable: false });
    file = { path, name: fileName, type: type || fk, size: buf.length };
    content = R.contentFor(t.kind, fk, buf.toString('base64'), text, type);
  } else {
    /* the venue's pages, read safely (on the emulator only, a test may name its own stand-in site) */
    let d = deps || realDeps();
    if (!deps && process.env.FUNCTIONS_EMULATOR === 'true') { const s = await get(dbi, 'raAiStub', 'config'); if (s && Array.isArray(s.webHosts)) d = Object.assign({}, d, { testHosts: s.webHosts }); }
    const read = urls.length ? await Links.readPages(urls, d) : { pages: [], refused: [] };
    if (!read.pages.length && !pasted.trim()) {
      await logIt(dbi, Object.assign({ outcome: 'unreadable' }, base));
      throw new HttpsError('failed-precondition', 'Nothing could be read from those addresses: ' + read.refused.map((r) => r.url + ' (' + r.why + ')').join('; ').slice(0, 600) + '. Paste what the venue says instead.');
    }
    const words = read.pages.filter((p) => p.kind !== 'pdf').map((p) => (p.title || p.url) + '\n' + p.url + '\n\n' + p.text).join('\n\n----\n\n') + (pasted.trim() ? '\n\n----\nPasted:\n\n' + pasted : '');
    const path = (prefix || '') + t.path + 'what-was-read.txt';
    await store.file(path).save(Buffer.from(words, 'utf8'), { contentType: 'text/plain; charset=utf-8', resumable: false });
    file = { path, name: 'What was read.txt', type: 'text/plain', size: words.length, pages: read.pages.map((p) => ({ url: p.url, title: p.title || '' })).slice(0, 60) };
    content = R.contentForPages(t.kind, read.pages, pasted);
  }
  let res;
  try {
    res = await callModel({ apiKey: key.apiKey, baseURL: key.baseURL, request: { model: R.MODEL, max_tokens: 16000,
      system: [{ type: 'text', text: R.SYSTEM(t.kind), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      output_config: { format: { type: 'json_schema', schema: R.SCHEMA(t.heads) } } } });
  } catch (e) { throw await callFailed(dbi, e, key, base, 'raReadReport'); }
  await noteWorking(dbi, key.apiKey);
  const usage = { tokensIn: (res.usage || {}).input_tokens || 0, tokensOut: (res.usage || {}).output_tokens || 0 };
  if (res.stop_reason === 'refusal') { await logIt(dbi, Object.assign({ outcome: 'refused-model' }, base, usage)); throw new HttpsError('failed-precondition', 'The AI couldn’t read this; type what it says in by hand.'); }
  let parsed = null;
  try { parsed = res.stop_reason === 'max_tokens' ? null : JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch (e) { parsed = null; }
  const n = R.normalise(parsed, t.heads);
  if (!n.ok) { await logIt(dbi, Object.assign({ outcome: 'failed' }, base, usage)); throw new HttpsError('internal', 'The list came back incomplete; try again.'); }
  const at = new Date().toISOString(), id = (p, i) => p + i + '_' + Math.random().toString(36).slice(2, 8);
  const out = { siteId: t.siteId, kind: t.kind, at, by: uid, byName: String(t.me.name || '').slice(0, 120), file,
    report: n.report, findings: n.findings.map((f, i) => Object.assign({ id: id('f', i) }, f)), actions: n.actions.map((a, i) => Object.assign({ id: id('a', i) }, a)),
    gaps: n.gaps, dropped: n.dropped, leftOut: n.leftOut, personalFound: n.personalFound };
  if (t.calEventId) out.calEventId = t.calEventId;
  if (t.bookingKey) { out.bookingKey = t.bookingKey; out.buildingHazards = t.hazards.length; }
  await dbi.collection('raReads').doc(t.docId).set(out);
  await logIt(dbi, Object.assign({ outcome: 'read' }, base, usage));
  return { ok: true, findings: out.findings.length, actions: out.actions.length, gaps: out.gaps.length, leftOut: n.leftOut, personalFound: n.personalFound,
    message: n.personalFound ? 'It seems to have names, phone numbers or emails in it. They were left out of what was read.' : '' };
}

/* THE AI FIRST DRAFT (H&S step 7) */
const DRAFT_WORDS = { email: 'It looks like this has an email address in it. Take it out and try again.', phone: 'It looks like this has a phone number in it. Take it out and try again.',
  postcode: 'It looks like this has a postcode in it. Name the place in general words and try again.', dob: 'It looks like this has a date of birth in it. Give ages in general words and try again.',
  nhs: 'It looks like this has an NHS number in it. Take it out and try again.', name: 'It looks like this has a person’s name in it. Use their role instead and try again.' };
async function factsFor(dbi, t, data, today) {
  const all = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
  const rooms = t.siteId ? all(await dbi.collection('rooms').where('siteId', '==', t.siteId).get()).filter((r) => r.active !== false && r.kind !== 'online') : [];
  const peeps = await get(dbi, 'raCounts', 'peeps'), geep = t.siteId ? await get(dbi, 'geeps', t.siteId) : null;
  const facts = {};
  if (t.siteId) {
    const site = (await get(dbi, 'sites', t.siteId)) || {};
    facts.building = site.name || '';
    const b = await CS.load(dbi, t.siteId), templates = all(await dbi.collection('complianceTemplates').get());
    facts.answeredYes = Object.keys(b.answers || {}).filter((k) => b.answers[k] === true);
    const sched = CE.schedule({ profile: b.profile, templates, checks: b.checks, records: b.records, jobs: b.jobs, triggers: b.triggers, today });
    facts.checks = sched.items.filter((i) => i.state === 'on').map((i) => ({ check: i.title, colour: i.rag === 'red' ? 'overdue' : i.rag === 'amber' ? 'due soon' : i.rag === 'green' ? 'in date' : 'not yet done' })).slice(0, 150);
    facts.openSafetyJobs = (sched.safetyJobs || []).length;
  }
  if (t.kind === 'event') {
    const roomIds = ((t.ev.location || {}).roomIds || []);
    facts.event = { title: String(t.ev.title || '').slice(0, 200), kind: String(data.eventKind || ''), people: Number.isInteger(data.people) ? data.people : 0,
      flags: Object.keys(data.flags || {}).filter((k) => data.flags[k] === true).slice(0, 10), away: (t.ev.location || {}).kind === 'venue' };
    facts.rooms = rooms.filter((r) => roomIds.includes(r.id)).map((r) => ({ room: r.name, fireMaximum: r.fireMax || 'not set' }));
  } else facts.rooms = rooms.map((r) => ({ room: r.name, fireMaximum: r.fireMax || 'not set' }));
  facts.personalEvacuationPlansAgreed = peeps ? peeps.agreed || 0 : 'not known';
  facts.planForVisitorsWhoNeedHelp = !!geep;
  return facts;
}
export async function draftAssessment({ db: dbi, uid, data, api, today }) {
  data = data || {};
  today = today || londonDay();
  const kind = data.kind === 'fire' ? 'fire' : data.kind === 'hs' ? 'hs' : data.kind === 'event' ? 'event' : '';
  if (!kind) throw new HttpsError('invalid-argument', 'Which assessment?');
  const t = await targetFor(dbi, uid, Object.assign({}, data, { kind }));
  if (!t.ok) throw new HttpsError('permission-denied', kind === 'event' ? 'This is for the event’s organisers and leaders, the office and the health and safety leads.' : 'This is for the office, the building’s health and safety and fire safety leads, and master admins.');
  const description = String(data.description || '').trim().slice(0, 4000);
  if (description.length < 10) throw new HttpsError('invalid-argument', 'Say a little about it first.');
  const p = RA.personalCheck(description, []);
  if (p.refuse) throw new HttpsError('invalid-argument', DRAFT_WORDS[p.refuse] || DRAFT_WORDS.name);
  const questions = (Array.isArray(data.questions) ? data.questions : []).slice(0, 200).map((q) => ({ id: String((q && q.id) || '').slice(0, 60), label: String((q && q.label) || '').slice(0, 200) })).filter((q) => q.id);
  const base = { siteId: t.siteId || '', calEventId: t.calEventId || '', by: uid, byName: t.me.name || '', chars: description.length, kind: 'draft-' + kind };
  const key = api || (await apiOf(dbi));
  if (!key.apiKey) throw new HttpsError('failed-precondition', WORDS.notSet);
  if (await broken(dbi, key.apiKey)) throw new HttpsError('failed-precondition', WORDS.broken);
  if (!(await takeOne(dbi, uid, capsOf((await get(dbi, 'raSettings', 'church')) || {})))) { await logIt(dbi, Object.assign({ outcome: 'capped' }, base)); throw new HttpsError('resource-exhausted', WORDS.capped); }
  const facts = await factsFor(dbi, t, data, today);
  let res;
  try {
    res = await callModel({ apiKey: key.apiKey, baseURL: key.baseURL, request: { model: DR.MODEL, max_tokens: 16000,
      system: [{ type: 'text', text: DR.SYSTEM(kind), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: DR.userText(kind, description, facts, questions) }],
      output_config: { format: { type: 'json_schema', schema: DR.SCHEMA } } } });
  } catch (e) { throw await callFailed(dbi, e, key, base, 'raDraftAssessment'); }
  await noteWorking(dbi, key.apiKey);
  const usage = { tokensIn: (res.usage || {}).input_tokens || 0, tokensOut: (res.usage || {}).output_tokens || 0 };
  if (res.stop_reason === 'refusal') { await logIt(dbi, Object.assign({ outcome: 'refused-model' }, base, usage)); throw new HttpsError('failed-precondition', 'The AI couldn’t draft this; write it by hand instead.'); }
  let parsed = null;
  try { parsed = res.stop_reason === 'max_tokens' ? null : JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch (e) { parsed = null; }
  const n = DR.normalise(parsed, questions.map((q) => q.id));
  if (!n.ok) { await logIt(dbi, Object.assign({ outcome: 'failed' }, base, usage)); throw new HttpsError('internal', 'The draft came back incomplete; try again.'); }
  await logIt(dbi, Object.assign({ outcome: 'drafted' }, base, usage));
  /* the hub's own rows (F-280 section 5): an overdue check is an action, whatever the AI said */
  const hubActions = (facts.checks || []).filter((c) => c.colour === 'overdue').map((c) => ({ what: 'Overdue check: ' + c.check, priority: 'high', from: 'hub' }));
  return { ok: true, at: new Date().toISOString(), summary: n.summary, hazards: n.hazards, actions: hubActions.concat(n.actions), answers: n.answers, mustNot: n.mustNot, leftOut: n.leftOut,
    message: n.leftOut ? n.leftOut + ' suggestion' + (n.leftOut === 1 ? ' was' : 's were') + ' left out: socket covers aren’t advised for UK sockets, which have shutters built in.' : '' };
}
export const raDraftAssessment = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY], timeoutSeconds: 180, memory: '512MiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, getFirestore());
  return draftAssessment({ db: ch.db, uid: req.auth.uid, data: req.data });
});

export const raReadReport = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY], timeoutSeconds: 180, memory: '512MiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, getFirestore());
  return readReport({ db: ch.db, uid: req.auth.uid, data: req.data, prefix: ch.id ? 'churches/' + ch.id + '/' : '' });
});

export const raAiStatus = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, getFirestore()), dbi = ch.db, d = req.data || {};
  const kind = d.kind || (d.calEventId ? 'venue' : d.bookingKey ? 'hire' : 'hs');
  let t;
  try { t = await targetFor(dbi, req.auth.uid, Object.assign({}, d, { kind })); } catch (e) { return { state: 'notallowed' }; }
  if (!t.ok) return { state: 'notallowed' };
  const api = await apiOf(dbi);
  if (!api.apiKey) return { state: 'notset', message: WORDS.notSet };
  if (await broken(dbi, api.apiKey)) return { state: 'broken', message: WORDS.broken };
  if (await usedUp(dbi, req.auth.uid, capsOf((await get(dbi, 'raSettings', 'church')) || {}))) return { state: 'capped', message: WORDS.capped };
  return { state: 'ready' };
});
