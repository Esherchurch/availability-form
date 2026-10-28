/* ===================================================================
   THE SAFEGUARDING RISK REGISTER, step 5: AI-drafted event assessments
   (F-265 part A; Martin's answers 6-8, 22 Oct)
   ===================================================================
     sgDraftAssessment  callable { calEventId, text, under8, confirmed }:
                        a first draft of an under-18s trip, overnight,
                        holiday club or off-site event's assessment, saved
                        as a DRAFT - it counts for nothing until the site's
                        safeguarding lead or deputy signs it off, and the
                        event takes no bookings until then
     sgAiStatus         callable { calEventId }: ready / not set up / today's
                        limit reached, before anyone types
   Who may ask: the event's organiser (its team, or the admin who made it),
   its named leaders, and its site's safeguarding lead and deputy.
   The key is CHQ_ANTHROPIC_API_KEY (Secret Manager; empty or NOT-SET means
   not set up). Model claude-sonnet-5-5, from the server only, the answer's
   shape fixed by structured outputs. No other model is tried on a refusal;
   only "busy" or "overloaded" is retried, on the same model, with backoff.
   Before any call: personal details refused (sg-ai-core.cjs). After: the
   ratings and the overall are the hub's sums, and the hub adds its own row
   when leaders are short. The leader's words are sent to Anthropic's API
   and nowhere else: not kept, not logged. sgAiLog keeps counts and the
   outcome only. Capped per church and per person per day (settings).
   On the emulator only, a local stand-in for the API (sgAiStub/config).
   A KEY OR SET-UP PROBLEM (the API says 400 invalid request, 401 or 403 -
   e.g. a key not scoped to a workspace, or a wrong or EXPIRED key: the
   church's runs out about 23 Nov 2026; the reviewing window, 23 Oct) is
   never retried: the leader is told "The AI isn't set up properly yet. Ask
   the church office.", the log keeps the API's request id and error type,
   and sgAiState/current remembers it, so sgAiStatus says "set up but not
   working" - until the key is changed (it keeps only a short fingerprint of
   the key, never the key) or a call works again.
   =================================================================== */
import { createRequire } from 'node:module';
import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { londonDay, registerOn, maySee } from './sg-warnings.js';
/* the key, the caps, the log, set-up problems and the call itself: the shared engine's (H&S step 1), with this register's own records */
import { churchOf } from './church-scope.js';
import { churchBucket } from './church-files.js';
import { aiPlumbing, callModel as callOnce, setupProblem as setupProblemOf } from './ra-ai.js';

const require = createRequire(import.meta.url);
const Core = require('./sg-ai-core.cjs');
const Checklist = require('./sg-checklist.cjs');
const Req = require('./sg-requirements-core.cjs');
const Safeguarding = require('./safeguarding-core.cjs');
const Links = require('./sg-links-core.cjs');
const REGION = 'europe-west2';
const db = () => getFirestore();
const KINDS = Checklist.SG_KINDS;
export const CHQ_ANTHROPIC_API_KEY = defineSecret('CHQ_ANTHROPIC_API_KEY');
const { apiOf, logIt, broken, noteWorking, callFailed, takeOne, usedUp } = aiPlumbing({ secret: CHQ_ANTHROPIC_API_KEY, day: () => londonDay(),
  records: { use: 'sgAiUse', log: 'sgAiLog', state: 'sgAiState', stub: 'sgAiStub' }, words: { setup: Core.WORDS.setup } });

/* who may ask: as the rules' runsEventId / isEventLeader / sgLeadOf */
async function whoFor(dbi, uid, calEventId) {
  const [u, e, l] = await Promise.all(['users/' + uid, 'calEvents/' + calEventId, 'eventLeaders/' + calEventId].map((p) => dbi.doc(p).get().then((d) => (d.exists ? d.data() : null))));
  if (!u || u.status !== 'active' || !e) return { ok: false };
  const site = (e.location || {}).siteId || '', mid = u.memberId || '';
  const b = site ? (await dbi.collection('bookingSettings').doc(site).get()).data() || {} : {};
  const lead = !!mid && (b.safeguardingLead === mid || b.safeguardingDeputy === mid);
  const organiser = (!!mid && (e.teamMemberIds || []).includes(mid)) || (e.teamUids || []).includes(uid)
    || ((u.masterAdmin === true || (u.adminFor || []).length > 0) && e.createdBy === uid);
  const leader = !!l && (l.leaderUids || []).includes(uid);
  return { ok: lead || organiser || leader, u, e, l: l || {}, site };
}

/* the counts the hub knows (never a name), and the names it must refuse */
async function factsFor(dbi, w, under8) {
  const st = (await dbi.collection('safeguardingSettings').doc('defaults').get()).data() || {};
  const sus = (await dbi.collection('signups').where('calEventId', '==', w.e.id || w.calEventId).get()).docs.map((d) => d.data()).filter((s) => s.status === 'confirmed');
  const names = [];
  sus.forEach((s) => { if (s.name) names.push(s.name); (s.attendees || []).forEach((a) => { if (a && a.name) names.push(a.name); }); });
  /* one per attendee, as the event's own pages count them (EGBCCheckin.people) */
  const children = sus.reduce((n, s) => n + ((s.attendees || []).length || 1), 0);
  const mids = (w.l.leaderIds || []).filter(Boolean);
  let cleared = 0;
  for (const m of mids) { const c = (await dbi.collection('leaderChecks').doc(m).get()).data(); if (Safeguarding.checkStatus(c || null, { dbsYears: st.dbsYears || 3, trainingYears: st.trainingYears || 3 }).ok) cleared++; }
  const d0 = String(w.e.startLocal || '').slice(0, 10), d1 = String(w.e.endLocal || '').slice(0, 10);
  const days = d0 && d1 ? Math.max(1, Math.round((Date.parse(d1) - Date.parse(d0)) / 864e5) + 1) : 1;
  return { st, names, facts: { children, under8: Math.max(0, Math.min(children || 999, parseInt(under8, 10) || 0)), leaders: (w.l.leaders || []).length || mids.length, cleared,
    ratioAll: w.l.ratioAll || st.ratioAll || 5, ratioUnder8: w.l.ratioUnder8 || st.ratioUnder8 || 4, kind: w.e.sgKind, days,
    /* the church's own denomination's guidance (a setting, F-280 (e)): its name only */
    guidance: String((((st.register || {}).guidance) || {}).name || '').slice(0, 120),
    /* what the church calls its safeguarding lead (S2b), for the owners the draft names */
    leadTitle: String((st.register || {}).leadTitle || '').slice(0, 60) } };
}

/* a key or set-up problem: the API refused the request itself, not because it was busy */
export const setupProblem = setupProblemOf;
/* the call (the shared engine's: busy or overloaded is retried on the same model; nothing else is); the draft's request by default */
export async function callModel({ apiKey, baseURL, facts, text, checklist, request }) {
  const body = request || {
    model: Core.MODEL, max_tokens: 16000,
    system: [{ type: 'text', text: Core.SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: Core.userText(facts, text, checklist || Checklist.checklistFor(facts && facts.kind, {})) }],
    output_config: { format: { type: 'json_schema', schema: Core.SCHEMA } }
  };
  return callOnce({ apiKey, baseURL, request: body });
}

export async function draftAssessment({ db: dbi, uid, data, api }) {
  const calEventId = String((data || {}).calEventId || ''), text = String((data || {}).text || '').trim();
  if (!calEventId || calEventId.includes('/')) throw new HttpsError('invalid-argument', 'Which event?');
  const w = await whoFor(dbi, uid, calEventId);
  if (!w.ok) throw new HttpsError('permission-denied', 'This is for the event’s organiser and leaders, and the safeguarding lead and deputy.');
  w.e.id = calEventId;
  if (!KINDS.includes(w.e.sgKind || '') || w.l.under18 !== true) throw new HttpsError('failed-precondition', 'Only an under-18s trip, overnight, holiday club, off-site event or camp needs this.');
  const cur = (await dbi.collection('sgAssessments').doc(calEventId).get()).data();
  if (cur && (cur.status === 'signed' || cur.waived)) throw new HttpsError('failed-precondition', 'This assessment is already signed off (or not needed). Change it by hand instead.');
  if (!text) throw new HttpsError('invalid-argument', 'Describe the event first.');
  if (text.length > Core.LIMIT) throw new HttpsError('invalid-argument', 'Keep it to ' + Core.LIMIT.toLocaleString('en-GB') + ' characters.');
  const base = { siteId: w.site, calEventId, by: uid, byName: w.u.name, chars: text.length };
  const { st, names, facts } = await factsFor(dbi, w, (data || {}).under8);
  /* 1. personal details: refused before anything is sent */
  const pc = Core.personalCheck(text, names);
  if (pc.refuse) { await logIt(dbi, Object.assign({ outcome: 'refused-personal' }, base)); throw new HttpsError('invalid-argument', Core.WORDS[pc.refuse]); }
  if (pc.warn && (data || {}).confirmed !== true) return { needsConfirm: true, message: Core.WORDS.medical };
  /* 2. set up? */
  const key = api || (await apiOf(dbi));
  if (!key.apiKey) throw new HttpsError('failed-precondition', Core.WORDS.notSet);
  /* 3. today's caps */
  if (!(await takeOne(dbi, uid, Core.caps(st)))) { await logIt(dbi, Object.assign({ outcome: 'capped' }, base)); throw new HttpsError('resource-exhausted', Core.WORDS.capped); }
  /* 4. the call */
  let res;
  /* the required checklist, as the page shows it: the kind, the ticks so far, the church's own and the host's (F-277) */
  const flags0 = Object.assign({}, (cur && cur.flags) || {}, facts.under8 ? { under8: true } : {});
  const checklist = Checklist.checklistFor(w.e.sgKind, flags0, (((st.register || {}).checklist) || []).concat(((cur && cur.host && cur.host.confirmed) ? cur.host.items : []) || []));
  facts.checklistIds = checklist.map((q) => q.id);
  try { res = await callModel({ apiKey: key.apiKey, baseURL: key.baseURL, facts, text, checklist }); }
  catch (e) { throw await callFailed(dbi, e, key, base, 'sgDraftAssessment'); }
  /* it worked: set-up is fine again */
  await noteWorking(dbi, key.apiKey);
  const usage = { tokensIn: (res.usage || {}).input_tokens || 0, tokensOut: (res.usage || {}).output_tokens || 0 };
  if (res.stop_reason === 'refusal') { await logIt(dbi, Object.assign({ outcome: 'refused-model' }, base, usage)); throw new HttpsError('failed-precondition', Core.WORDS.refused); }
  let parsed = null;
  try { parsed = res.stop_reason === 'max_tokens' ? null : JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch (e) { parsed = null; }
  const n = Core.normalise(parsed, facts);
  if (!n.ok) { await logIt(dbi, Object.assign({ outcome: 'failed' }, base, usage)); throw new HttpsError('internal', Core.WORDS.incomplete); }
  /* 5. saved as a draft: bookings stay closed */
  const at = new Date().toISOString();
  /* the ticks only ever go on from a draft (they add questions); answers stay the people's - the AI's are suggestions, "to confirm" */
  const flags = Object.assign({}, flags0, n.flags.abroad ? { abroad: true } : {}, n.flags.adventurous ? { adventurous: true } : {});
  const doc = { siteId: w.site, calEventId, title: String(w.e.title || '').slice(0, 120), templateId: w.e.sgKind, answers: (cur && cur.answers) || {}, flags,
    ...(cur && cur.host ? { host: cur.host, hostIds: cur.hostIds || [] } : {}),
    risks: n.risks, status: 'draft', version: (cur && cur.version) || 1,
    source: { kind: 'ai', model: Core.MODEL, at, by: uid, overall: n.overall, mustNot: n.mustNot, questions: n.questions, summary: n.summary, suggest: n.suggest, leftOut: n.leftOut },
    updatedAt: at, updatedBy: uid };
  const b = dbi.batch();
  b.set(dbi.collection('sgAssessments').doc(calEventId), doc);
  b.set(dbi.collection('sgGate').doc(calEventId), { needed: true, open: false, updatedAt: at });
  await b.commit();
  await logIt(dbi, Object.assign({ outcome: 'drafted' }, base, usage));
  console.log('sgDraftAssessment: drafted ' + calEventId + ', ' + n.risks.length + ' risks, ' + usage.tokensIn + '/' + usage.tokensOut + ' tokens');
  return { ok: true, overall: n.overall, risks: n.risks.length, mustNot: n.mustNot.length, leftOut: n.leftOut };
}

/* ---- THE HOST'S OWN REQUIREMENTS (F-277) ----
   { calEventId, host, fileName, contentType, data (base64) }: kept in Storage
   under the event (sgRequirements/<event>/..., server only), read by Claude,
   saved on the assessment for the leader to check. Same people, caps and
   log as the drafts; the file's contents are never logged. */
export async function extractRequirements({ db: dbi, uid, data, api, bucket }) {
  data = data || {};
  const calEventId = String(data.calEventId || '');
  if (!calEventId || calEventId.includes('/')) throw new HttpsError('invalid-argument', 'Which event?');
  const w = await whoFor(dbi, uid, calEventId);
  if (!w.ok) throw new HttpsError('permission-denied', 'This is for the event’s organiser and leaders, and the safeguarding lead and deputy.');
  w.e.id = calEventId;
  if (!KINDS.includes(w.e.sgKind || '') || w.l.under18 !== true) throw new HttpsError('failed-precondition', 'Only an under-18s trip, overnight, holiday club, off-site event or camp needs this.');
  const cur = (await dbi.collection('sgAssessments').doc(calEventId).get()).data();
  if (cur && (cur.status === 'signed' || cur.waived)) throw new HttpsError('failed-precondition', 'This assessment is already signed off (or not needed). Change it by hand instead.');
  const type = String(data.contentType || '').toLowerCase(), fileName = String(data.fileName || 'requirements').replace(/[\\/]/g, '_').slice(0, 120);
  const kind = Req.fileKind(type, fileName);
  if (!kind) throw new HttpsError('invalid-argument', 'Upload a PDF, a Word document (.docx), or a photo or scan of the printed sheet.');
  const buf = Buffer.from(String(data.data || ''), 'base64');
  if (!buf.length) throw new HttpsError('invalid-argument', 'The file is empty.');
  if (buf.length > Req.MAX_BYTES) throw new HttpsError('invalid-argument', 'The file is too big: 7 MB at most. A photo of each page will do.');
  let text = '';
  if (kind === 'docx') {
    try { text = Req.docxText(buf); } catch (e) { throw new HttpsError('invalid-argument', 'This Word document can’t be read. Save it as a PDF and try that.'); }
    if (!text.trim()) throw new HttpsError('invalid-argument', 'There are no words in this Word document.');
  }
  const base = { siteId: w.site, calEventId, by: uid, byName: w.u.name, chars: buf.length, kind: 'requirements' };
  const key = api || (await apiOf(dbi));
  if (!key.apiKey) throw new HttpsError('failed-precondition', Core.WORDS.notSet);
  const { st, names } = await factsFor(dbi, w, 0);
  if (!(await takeOne(dbi, uid, Core.caps(st)))) { await logIt(dbi, Object.assign({ outcome: 'capped' }, base)); throw new HttpsError('resource-exhausted', Core.WORDS.capped); }
  /* the original file, kept with the assessment */
  const path = 'sgRequirements/' + calEventId + '/' + Date.now() + '-' + fileName.replace(/[^A-Za-z0-9._ -]/g, '_');
  await (bucket || getStorage().bucket()).file(path).save(buf, { contentType: type || (kind === 'docx' ? Req.DOCX : 'application/octet-stream'), resumable: false });
  let res;
  try {
    res = await callModel({ apiKey: key.apiKey, baseURL: key.baseURL, request: { model: Core.MODEL, max_tokens: 8000,
      system: [{ type: 'text', text: Req.REQ_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: Req.contentFor(kind, buf.toString('base64'), text, type) }],
      output_config: { format: { type: 'json_schema', schema: Req.REQ_SCHEMA } } } });
  } catch (e) { throw await callFailed(dbi, e, key, base, 'sgExtractRequirements'); }
  await noteWorking(dbi, key.apiKey);
  const usage = { tokensIn: (res.usage || {}).input_tokens || 0, tokensOut: (res.usage || {}).output_tokens || 0 };
  if (res.stop_reason === 'refusal') { await logIt(dbi, Object.assign({ outcome: 'refused-model' }, base, usage)); throw new HttpsError('failed-precondition', 'The AI couldn’t read this; type the host’s requirements in as the church’s own questions instead.'); }
  let parsed = null;
  try { parsed = res.stop_reason === 'max_tokens' ? null : JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch (e) { parsed = null; }
  const n = Req.normaliseReqs(parsed, names);
  if (!n.ok) { await logIt(dbi, Object.assign({ outcome: 'failed' }, base, usage)); throw new HttpsError('internal', 'The list came back incomplete; try again.'); }
  const at = new Date().toISOString(), hostName = String(data.host || '').trim().slice(0, 120) || n.host || 'the host';
  const host = { name: hostName, file: { path, name: fileName, type: type || kind, size: buf.length }, items: n.items.map((x, i) => ({ id: 'h_' + i + '_' + Math.random().toString(36).slice(2, 8), q: x.q, line: x.line })),
    extractedAt: at, by: uid, dropped: n.dropped, leftOut: n.leftOut, personalFound: n.personalFound, confirmed: false };
  const ref = dbi.collection('sgAssessments').doc(calEventId), b = dbi.batch();
  /* not required until the leader has checked the list (hostIds empty, confirmed false: sign-off waits) */
  if (cur) b.update(ref, { host, hostIds: [], updatedAt: at, updatedBy: uid });
  else b.set(ref, { siteId: w.site, calEventId, title: String(w.e.title || '').slice(0, 120), templateId: w.e.sgKind, answers: {}, risks: [], status: 'draft', version: 1, host, hostIds: [], updatedAt: at, updatedBy: uid });
  b.set(dbi.collection('sgGate').doc(calEventId), { needed: true, open: false, updatedAt: at });
  await b.commit();
  await logIt(dbi, Object.assign({ outcome: 'extracted' }, base, usage));
  return { ok: true, count: host.items.length, dropped: n.dropped, leftOut: n.leftOut, personalFound: n.personalFound,
    message: n.personalFound ? 'The file seems to have names, phone numbers or emails in it. They were left out of the questions.' : '' };
}
export const sgExtractRequirements = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY], timeoutSeconds: 180 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, db()), D = ch.db, B = churchBucket(getStorage().bucket(), ch.id);
  if (!(await registerOn(D))) throw new HttpsError('failed-precondition', 'Safeguarding, or its risk register, is turned off for this church.');
  return extractRequirements({ db: D, uid: req.auth.uid, data: req.data, bucket: B });
});
/* ---- THE HOST'S REQUIREMENTS FROM THEIR WEB PAGES, OR PASTED TEXT (S6, F-280 10.6) ----
   Newday has no single document, only help pages. The pages are read by
   functions/sg-links-core.cjs - https only, public addresses only, connected
   to the address that was checked, redirects checked one by one, 2 MB a page,
   40 pages, 45 seconds, one level down on the same site - and their words go
   to Claude exactly as a file's do. Each question says which page it came
   from; what was read is kept in Storage beside the files; the leader checks
   the list before anything counts. Same people, caps and log as a file.
   "READ THE NEXT" (F-293): what wasn't reached is kept (web.next, in the same turn order); { more: true } reads the
   next 40 of it - the same limits, one call against the day's AI limit like any - and adds its questions to the same
   unconfirmed list. Claude is told the questions already there, and any that comes back the same is dropped. */
/* one request, made to the address that was checked (so the name can't be switched in between), its size capped */
function pinnedRequest({ url, address, family, maxBytes, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), plain = u.protocol === 'http:';
    const req = (plain ? http : https).request({ host: address, family, port: u.port || (plain ? 80 : 443), path: u.pathname + u.search, method: 'GET',
      servername: plain ? undefined : u.hostname, timeout: timeoutMs,
      headers: { Host: u.host, Accept: 'text/html,application/xhtml+xml,text/plain,application/pdf', 'User-Agent': 'ChurchHQ hub (reads a host\'s requirements for a church group)' } });
    req.on('response', (res) => {
      const status = res.statusCode, type = res.headers['content-type'] || '', location = res.headers.location || '';
      if (status >= 300 && status < 400) { res.resume(); return resolve({ status, location, type }); }
      if (+res.headers['content-length'] > maxBytes) { req.destroy(new Error('too big')); return; }
      const parts = []; let n = 0;
      res.on('data', (c) => { n += c.length; if (n > maxBytes) { req.destroy(new Error('too big')); return; } parts.push(c); });
      res.on('end', () => resolve({ status, type, body: Buffer.concat(parts) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end();
  });
}
export const realDeps = () => ({ lookup: (h) => dns.promises.lookup(h, { all: true, verbatim: true }), request: pinnedRequest });

export async function extractFromWeb({ db: dbi, uid, data, api, bucket, deps }) {
  data = data || {};
  const calEventId = String(data.calEventId || '');
  if (!calEventId || calEventId.includes('/')) throw new HttpsError('invalid-argument', 'Which event?');
  const more = data.more === true;
  const urls = more ? [] : (Array.isArray(data.urls) ? data.urls : []).map((x) => String(x || '').trim()).filter(Boolean);
  const pasted = more ? '' : String(data.text || '').slice(0, 60000);
  if (!more && !urls.length && !pasted.trim()) throw new HttpsError('invalid-argument', 'Give the host’s web page addresses, or paste their requirements.');
  if (urls.length > Links.LIMITS.starts) throw new HttpsError('invalid-argument', 'Up to ' + Links.LIMITS.starts + ' addresses at a time. The pages they link to on the same site are read too.');
  const w = await whoFor(dbi, uid, calEventId);
  if (!w.ok) throw new HttpsError('permission-denied', 'This is for the event’s organiser and leaders, and the safeguarding lead and deputy.');
  w.e.id = calEventId;
  if (!KINDS.includes(w.e.sgKind || '') || w.l.under18 !== true) throw new HttpsError('failed-precondition', 'Only an under-18s trip, overnight, holiday club, off-site event or camp needs this.');
  const cur = (await dbi.collection('sgAssessments').doc(calEventId).get()).data();
  if (cur && (cur.status === 'signed' || cur.waived)) throw new HttpsError('failed-precondition', 'This assessment is already signed off (or not needed). Change it by hand instead.');
  /* the next pages: only those left from the host's own addresses (the hosts they were on) */
  const was = more ? ((cur || {}).host || {}) : null;
  const starts = more ? ((was.web || {}).starts || []) : urls.slice(0, Links.LIMITS.starts);
  const hostsOf = new Set(starts.map((u) => { try { return new URL(u).host; } catch (e) { return ''; } }).filter(Boolean));
  const next = more ? ((was.web || {}).next || []).filter((u) => { try { return hostsOf.has(new URL(u).host); } catch (e) { return false; } }) : null;
  if (more && !(next || []).length) throw new HttpsError('failed-precondition', 'There are no more of the host’s pages to read.');
  const already = more ? (was.items || []).map((x) => x.q) : [];
  if (more && already.length >= Core.MAX.host) throw new HttpsError('failed-precondition', 'The host’s list already holds ' + Core.MAX.host + ' questions, the most it can. Remove some first.');
  const base = { siteId: w.site, calEventId, by: uid, byName: w.u.name, chars: pasted.length, kind: 'requirements-web' + (more ? '-more' : '') };
  const key = api || (await apiOf(dbi));
  if (!key.apiKey) throw new HttpsError('failed-precondition', Core.WORDS.notSet);
  const { st, names } = await factsFor(dbi, w, 0);
  if (!(await takeOne(dbi, uid, Core.caps(st)))) { await logIt(dbi, Object.assign({ outcome: 'capped' }, base)); throw new HttpsError('resource-exhausted', Core.WORDS.capped); }
  /* the pages, read safely (on the emulator only, a test may name its own stand-in site) */
  let d = deps || realDeps();
  if (!deps && process.env.FUNCTIONS_EMULATOR === 'true') { const t = (await dbi.collection('sgAiStub').doc('config').get()).data(); if (t && Array.isArray(t.webHosts)) d = Object.assign({}, d, { testHosts: t.webHosts }); }
  const read = more ? await Links.readPages(null, d, next) : urls.length ? await Links.readPages(urls, d) : { pages: [], refused: [], next: [] };
  if (!read.pages.length && !pasted.trim()) {
    await logIt(dbi, Object.assign({ outcome: 'unreadable', pages: 0 }, base));
    throw new HttpsError('failed-precondition', 'Nothing could be read from ' + (more ? 'the next pages' : 'those addresses') + ': ' + read.refused.map((r) => r.url + ' (' + r.why + ')').join('; ').slice(0, 600) + '. Paste their requirements instead.');
  }
  /* what was read, kept with the assessment (the words; any PDF as it came) */
  let before = '';
  if (more && was.file && was.file.path) { try { [before] = await (bucket || getStorage().bucket()).file(was.file.path).download(); before = before.toString('utf8') + '\n\n'; } catch (e) { before = ''; } }
  const kept = before + read.pages.map((p) => '== ' + p.url + (p.title ? ' (' + p.title + ')' : '') + ' ==\n' + (p.kind === 'pdf' ? '[a PDF]' : p.text)).join('\n\n') + (pasted.trim() ? '\n\n== Pasted text ==\n' + pasted : '');
  const path = 'sgRequirements/' + calEventId + '/' + Date.now() + '-web.txt';
  await (bucket || getStorage().bucket()).file(path).save(Buffer.from(kept, 'utf8'), { contentType: 'text/plain; charset=utf-8', resumable: false });
  base.pages = read.pages.length; base.chars = kept.length;
  let res;
  try {
    res = await callModel({ apiKey: key.apiKey, baseURL: key.baseURL, request: { model: Core.MODEL, max_tokens: 8000,
      system: [{ type: 'text', text: Req.REQ_SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: Req.contentForWeb(read.pages, pasted, already) }],
      output_config: { format: { type: 'json_schema', schema: Req.REQ_SCHEMA_WEB } } } });
  } catch (e) { throw await callFailed(dbi, e, key, base, 'sgRequirementsFromLinks'); }
  await noteWorking(dbi, key.apiKey);
  const usage = { tokensIn: (res.usage || {}).input_tokens || 0, tokensOut: (res.usage || {}).output_tokens || 0 };
  if (res.stop_reason === 'refusal') { await logIt(dbi, Object.assign({ outcome: 'refused-model' }, base, usage)); throw new HttpsError('failed-precondition', 'The AI couldn’t read this; type the host’s requirements in as the church’s own questions instead.'); }
  let parsed = null;
  try { parsed = res.stop_reason === 'max_tokens' ? null : JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch (e) { parsed = null; }
  const n = Req.normaliseReqs(parsed, names);
  if (!n.ok) { await logIt(dbi, Object.assign({ outcome: 'failed' }, base, usage)); throw new HttpsError('internal', 'The list came back incomplete; try again.'); }
  const at = new Date().toISOString(), hostName = more ? (was.name || 'the host') : String(data.host || '').trim().slice(0, 120) || n.host || 'the host';
  const fresh = more ? Req.newOnly(n.items, already) : { items: n.items, repeats: 0 };
  const room = Core.MAX.host - already.length, adding = fresh.items.slice(0, Math.max(0, room));
  const pagesNow = read.pages.map((p) => ({ url: p.url.slice(0, 500), title: String(p.title || '').slice(0, 200) }));
  const host = { name: hostName, file: { path, name: 'What was read from the web pages.txt', type: 'text/plain', size: Buffer.byteLength(kept) },
    web: { pages: (more ? (was.web.pages || []).concat(pagesNow) : pagesNow).slice(0, 500), refused: read.refused.slice(0, 20).map((r) => ({ url: String(r.url).slice(0, 500), why: r.why })),
      next: read.next.slice(0, 500).map((u) => u.slice(0, 500)), starts: starts.map((u) => u.slice(0, 500)), reads: (more ? (was.web.reads || 1) : 0) + 1, pasted: more ? !!was.web.pasted : !!pasted.trim(), at },
    items: (more ? was.items || [] : []).concat(adding.map((x, i) => Object.assign({ id: 'h_' + (already.length + i) + '_' + Math.random().toString(36).slice(2, 8), q: x.q, line: x.line }, x.source ? { source: x.source } : {}))),
    extractedAt: at, by: uid, dropped: (more ? was.dropped || 0 : 0) + n.dropped, leftOut: (more ? was.leftOut || 0 : 0) + n.leftOut, personalFound: (more && was.personalFound) || n.personalFound, confirmed: false };
  if (more) host.repeats = (was.repeats || 0) + fresh.repeats;
  const ref = dbi.collection('sgAssessments').doc(calEventId), b = dbi.batch();
  if (cur) b.update(ref, { host, hostIds: [], updatedAt: at, updatedBy: uid });
  else b.set(ref, { siteId: w.site, calEventId, title: String(w.e.title || '').slice(0, 120), templateId: w.e.sgKind, answers: {}, risks: [], status: 'draft', version: 1, host, hostIds: [], updatedAt: at, updatedBy: uid });
  b.set(dbi.collection('sgGate').doc(calEventId), { needed: true, open: false, updatedAt: at });
  await b.commit();
  await logIt(dbi, Object.assign({ outcome: 'extracted' }, base, usage));
  return { ok: true, count: host.items.length, added: adding.length, repeats: fresh.repeats, full: fresh.items.length > adding.length, left: host.web.next.length, pages: read.pages.length, refused: host.web.refused, dropped: n.dropped, leftOut: n.leftOut, personalFound: n.personalFound,
    message: n.personalFound ? 'The pages seem to have names, phone numbers or emails on them. They were left out of the questions.' : '' };
}
export const sgRequirementsFromLinks = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY], timeoutSeconds: 180 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, db()), D = ch.db, B = churchBucket(getStorage().bucket(), ch.id);
  if (!(await registerOn(D))) throw new HttpsError('failed-precondition', 'Safeguarding, or its risk register, is turned off for this church.');
  return extractFromWeb({ db: D, uid: req.auth.uid, data: req.data, bucket: B });
});
/* the original file back, for those who can see the assessment */
export const sgRequirementsFile = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, db()), D = ch.db, B = churchBucket(getStorage().bucket(), ch.id);
  const calEventId = String((req.data || {}).calEventId || '');
  if (!calEventId || calEventId.includes('/')) throw new HttpsError('invalid-argument', 'Which event?');
  const a = (await D.collection('sgAssessments').doc(calEventId).get()).data();
  if (!a || !a.host || !a.host.file) throw new HttpsError('not-found', 'No file has been added.');
  const w = await whoFor(D, req.auth.uid, calEventId);
  if (!w.ok && !(await maySee(D, req.auth.uid, a.siteId))) throw new HttpsError('permission-denied', 'This is for those who can see the assessment.');
  const [buf] = await B.file(a.host.file.path).download();
  return { name: a.host.file.name, type: a.host.file.type, data: buf.toString('base64') };
});

export const sgDraftAssessment = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY], timeoutSeconds: 180 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, db()), D = ch.db, B = churchBucket(getStorage().bucket(), ch.id);
  if (!(await registerOn(D))) throw new HttpsError('failed-precondition', 'Safeguarding, or its risk register, is turned off for this church.');
  return draftAssessment({ db: D, uid: req.auth.uid, data: req.data });
});

export const sgAiStatus = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, db()), D = ch.db, B = churchBucket(getStorage().bucket(), ch.id);
  const calEventId = String((req.data || {}).calEventId || '');
  if (!calEventId || calEventId.includes('/')) throw new HttpsError('invalid-argument', 'Which event?');
  const w = await whoFor(D, req.auth.uid, calEventId);
  if (!w.ok) return { state: 'notallowed' };
  if (!(await registerOn(D))) return { state: 'off', message: 'AI drafting is part of the safeguarding risk register, which is turned off for this church. Write the assessment from a template instead.' };
  const api = await apiOf(D);
  if (!api.apiKey) return { state: 'notset', message: Core.WORDS.notSet };
  if (await broken(D, api.apiKey)) return { state: 'broken', message: Core.WORDS.broken };
  const st = (await D.collection('safeguardingSettings').doc('defaults').get()).data() || {}, cap = Core.caps(st);
  if (await usedUp(D, req.auth.uid, cap)) return { state: 'capped', message: Core.WORDS.capped };
  return { state: 'ready' };
});
