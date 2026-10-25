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
import Anthropic from '@anthropic-ai/sdk';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { londonDay, registerOn, maySee } from './sg-warnings.js';

const require = createRequire(import.meta.url);
const Core = require('./sg-ai-core.cjs');
const Checklist = require('./sg-checklist.cjs');
const Req = require('./sg-requirements-core.cjs');
const Safeguarding = require('./safeguarding-core.cjs');
const REGION = 'europe-west2';
const db = () => getFirestore();
const KINDS = Checklist.SG_KINDS;
export const CHQ_ANTHROPIC_API_KEY = defineSecret('CHQ_ANTHROPIC_API_KEY');
const BACKOFF = [1000, 3000, 8000];
/* A DRAFT TAKES 30-60 SECONDS (the reviewing window's live run: 46 s). The
   function may run 180 s; the page waits as long; the calls, retries
   included, must finish inside BUDGET so there is time to save. */
const BUDGET = 165000;

/* the key, or '' when not set up; on the emulator, the local stand-in when a test has set one */
async function apiOf(dbi) {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    const s = (await dbi.collection('sgAiStub').doc('config').get()).data();
    return s && s.url ? { apiKey: s.key || 'stub', baseURL: s.url } : { apiKey: '' };
  }
  const v = String(CHQ_ANTHROPIC_API_KEY.value() || '').trim();
  return { apiKey: !v || v === 'NOT-SET' ? '' : v };
}

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
    guidance: String((((st.register || {}).guidance) || {}).name || '').slice(0, 120) } };
}

/* one place for the log: ids and counts only, never the words (and, for a failed call, the API's request id and error type) */
function logIt(dbi, x) {
  return dbi.collection('sgAiLog').add(Object.assign({ siteId: x.siteId, calEventId: x.calEventId, by: x.by, byName: String(x.byName || '').slice(0, 120), at: new Date().toISOString(),
    chars: x.chars || 0, outcome: x.outcome, tokensIn: x.tokensIn || 0, tokensOut: x.tokensOut || 0 }, x.kind ? { kind: x.kind } : {},
    x.requestId || x.errorType ? { requestId: String(x.requestId || '').slice(0, 80), errorType: String(x.errorType || '').slice(0, 60), status: x.status || 0 } : {})).catch(() => {});
}

/* a key or set-up problem: the API refused the request itself, not because it was busy */
export function setupProblem(e) {
  return e instanceof Anthropic.BadRequestError || e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError;
}
const fingerprint = (k) => createHash('sha256').update(String(k || '')).digest('hex').slice(0, 12);
const stateRef = (dbi) => dbi.collection('sgAiState').doc('current');
/* "set up but not working": the last call failed on set-up, with this same key, in the last 6 hours
   (after that the box comes back, so one real attempt can find out whether it has been put right) */
const BROKEN_FOR = 6 * 3600e3;
async function broken(dbi, apiKey) {
  const s = (await stateRef(dbi).get()).data();
  return !!s && s.state === 'broken' && s.key === fingerprint(apiKey) && Date.now() - Date.parse(s.at || 0) < BROKEN_FOR;
}

/* a call that failed: a key or set-up problem is said plainly and remembered; anything else "could not be reached" */
async function callFailed(dbi, e, key, base, what) {
  const err = { status: e.status || 0, requestId: e.requestID || '', errorType: e.type || e.name || '' };
  console.log(what + ': call failed for ' + base.calEventId + ' (' + err.status + ' ' + err.errorType + ', request ' + err.requestId + ')');
  if (setupProblem(e)) {
    await stateRef(dbi).set({ state: 'broken', key: fingerprint(key.apiKey), at: new Date().toISOString(), status: err.status, errorType: err.errorType, requestId: err.requestId });
    await logIt(dbi, Object.assign({ outcome: 'setup-failed' }, base, err));
    return new HttpsError('failed-precondition', Core.WORDS.setup);
  }
  await logIt(dbi, Object.assign({ outcome: 'failed' }, base, err));
  return new HttpsError('unavailable', 'The AI could not be reached just now; try again later, or use a template.');
}

/* today's use, counted in a transaction: false when over a cap */
async function takeOne(dbi, uid, cap) {
  const ref = dbi.collection('sgAiUse').doc(londonDay());
  return dbi.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() || { total: 0, by: {} };
    if ((d.total || 0) >= cap.perChurch || ((d.by || {})[uid] || 0) >= cap.perPerson) return false;
    tx.set(ref, { total: (d.total || 0) + 1, by: Object.assign({}, d.by || {}, { [uid]: ((d.by || {})[uid] || 0) + 1 }) });
    return true;
  });
}

/* the call: busy or overloaded is retried on the same model; nothing else is */
export async function callModel({ apiKey, baseURL, facts, text, checklist, request }) {
  const client = new Anthropic({ apiKey, baseURL, maxRetries: 0, timeout: 120000 }), t0 = Date.now();
  const body = request || {
    model: Core.MODEL, max_tokens: 16000,
    system: [{ type: 'text', text: Core.SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: Core.userText(facts, text, checklist || Checklist.checklistFor(facts && facts.kind, {})) }],
    output_config: { format: { type: 'json_schema', schema: Core.SCHEMA } }
  };
  for (let attempt = 0; ; attempt++) {
    const left = BUDGET - (Date.now() - t0);
    try {
      return await client.messages.create(body, { timeout: Math.max(5000, Math.min(120000, left)) });
    } catch (e) {
      const busy = e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError;
      if (!busy || attempt >= BACKOFF.length || BUDGET - (Date.now() - t0) < BACKOFF[attempt] + 20000) throw e;
      await new Promise((r) => setTimeout(r, BACKOFF[attempt]));
    }
  }
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
  if ((await stateRef(dbi).get()).exists) await stateRef(dbi).set({ state: 'ok', key: fingerprint(key.apiKey), at: new Date().toISOString() });
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
  if ((await stateRef(dbi).get()).exists) await stateRef(dbi).set({ state: 'ok', key: fingerprint(key.apiKey), at: new Date().toISOString() });
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
  if (!(await registerOn(db()))) throw new HttpsError('failed-precondition', 'Safeguarding, or its risk register, is turned off for this church.');
  return extractRequirements({ db: db(), uid: req.auth.uid, data: req.data });
});
/* the original file back, for those who can see the assessment */
export const sgRequirementsFile = onCall({ region: REGION }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const calEventId = String((req.data || {}).calEventId || '');
  if (!calEventId || calEventId.includes('/')) throw new HttpsError('invalid-argument', 'Which event?');
  const a = (await db().collection('sgAssessments').doc(calEventId).get()).data();
  if (!a || !a.host || !a.host.file) throw new HttpsError('not-found', 'No file has been added.');
  const w = await whoFor(db(), req.auth.uid, calEventId);
  if (!w.ok && !(await maySee(db(), req.auth.uid, a.siteId))) throw new HttpsError('permission-denied', 'This is for those who can see the assessment.');
  const [buf] = await getStorage().bucket().file(a.host.file.path).download();
  return { name: a.host.file.name, type: a.host.file.type, data: buf.toString('base64') };
});

export const sgDraftAssessment = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY], timeoutSeconds: 180 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  if (!(await registerOn(db()))) throw new HttpsError('failed-precondition', 'Safeguarding, or its risk register, is turned off for this church.');
  return draftAssessment({ db: db(), uid: req.auth.uid, data: req.data });
});

export const sgAiStatus = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const calEventId = String((req.data || {}).calEventId || '');
  if (!calEventId || calEventId.includes('/')) throw new HttpsError('invalid-argument', 'Which event?');
  const w = await whoFor(db(), req.auth.uid, calEventId);
  if (!w.ok) return { state: 'notallowed' };
  if (!(await registerOn(db()))) return { state: 'off', message: 'AI drafting is part of the safeguarding risk register, which is turned off for this church. Write the assessment from a template instead.' };
  const api = await apiOf(db());
  if (!api.apiKey) return { state: 'notset', message: Core.WORDS.notSet };
  if (await broken(db(), api.apiKey)) return { state: 'broken', message: Core.WORDS.broken };
  const st = (await db().collection('safeguardingSettings').doc('defaults').get()).data() || {}, cap = Core.caps(st);
  const u = (await db().collection('sgAiUse').doc(londonDay()).get()).data() || { total: 0, by: {} };
  if ((u.total || 0) >= cap.perChurch || ((u.by || {})[req.auth.uid] || 0) >= cap.perPerson) return { state: 'capped', message: Core.WORDS.capped };
  return { state: 'ready' };
});
