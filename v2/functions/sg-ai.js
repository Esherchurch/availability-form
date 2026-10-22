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
   =================================================================== */
import Anthropic from '@anthropic-ai/sdk';
import { createRequire } from 'node:module';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { londonDay, registerOn } from './sg-warnings.js';

const require = createRequire(import.meta.url);
const Core = require('./sg-ai-core.cjs');
const Safeguarding = require('./safeguarding-core.cjs');
const REGION = 'europe-west2';
const db = () => getFirestore();
const KINDS = ['trip', 'overnight', 'holidayclub', 'offsite'];
export const CHQ_ANTHROPIC_API_KEY = defineSecret('CHQ_ANTHROPIC_API_KEY');
const BACKOFF = [1000, 3000, 8000];

/* the key, or '' when not set up; on the emulator, the local stand-in when a test has set one */
async function apiOf(dbi) {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    const s = (await dbi.collection('sgAiStub').doc('config').get()).data();
    return s && s.url ? { apiKey: 'stub', baseURL: s.url } : { apiKey: '' };
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
    ratioAll: w.l.ratioAll || st.ratioAll || 5, ratioUnder8: w.l.ratioUnder8 || st.ratioUnder8 || 4, kind: w.e.sgKind, days } };
}

/* one place for the log: ids and counts only, never the words */
function logIt(dbi, x) {
  return dbi.collection('sgAiLog').add({ siteId: x.siteId, calEventId: x.calEventId, by: x.by, byName: String(x.byName || '').slice(0, 120), at: new Date().toISOString(),
    chars: x.chars || 0, outcome: x.outcome, tokensIn: x.tokensIn || 0, tokensOut: x.tokensOut || 0 }).catch(() => {});
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
export async function callModel({ apiKey, baseURL, facts, text }) {
  const client = new Anthropic({ apiKey, baseURL, maxRetries: 0, timeout: 120000 });
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.messages.create({
        model: Core.MODEL, max_tokens: 16000,
        system: [{ type: 'text', text: Core.SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: Core.userText(facts, text) }],
        output_config: { format: { type: 'json_schema', schema: Core.SCHEMA } }
      });
    } catch (e) {
      const busy = e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError;
      if (!busy || attempt >= BACKOFF.length) throw e;
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
  if (!KINDS.includes(w.e.sgKind || '') || w.l.under18 !== true) throw new HttpsError('failed-precondition', 'Only an under-18s trip, overnight, holiday club or off-site event needs this.');
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
  try { res = await callModel({ apiKey: key.apiKey, baseURL: key.baseURL, facts, text }); }
  catch (e) { console.log('sgDraftAssessment: call failed for ' + calEventId + ' (' + (e.status || e.name) + ')'); await logIt(dbi, Object.assign({ outcome: 'failed' }, base)); throw new HttpsError('unavailable', 'The AI could not be reached just now; try again later, or use a template.'); }
  const usage = { tokensIn: (res.usage || {}).input_tokens || 0, tokensOut: (res.usage || {}).output_tokens || 0 };
  if (res.stop_reason === 'refusal') { await logIt(dbi, Object.assign({ outcome: 'refused-model' }, base, usage)); throw new HttpsError('failed-precondition', Core.WORDS.refused); }
  let parsed = null;
  try { parsed = res.stop_reason === 'max_tokens' ? null : JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch (e) { parsed = null; }
  const n = Core.normalise(parsed, facts);
  if (!n.ok) { await logIt(dbi, Object.assign({ outcome: 'failed' }, base, usage)); throw new HttpsError('internal', Core.WORDS.incomplete); }
  /* 5. saved as a draft: bookings stay closed */
  const at = new Date().toISOString();
  const doc = { siteId: w.site, calEventId, title: String(w.e.title || '').slice(0, 120), templateId: w.e.sgKind, answers: (cur && cur.answers) || {},
    risks: n.risks, status: 'draft', version: (cur && cur.version) || 1,
    source: { kind: 'ai', model: Core.MODEL, at, by: uid, overall: n.overall, mustNot: n.mustNot, questions: n.questions, summary: n.summary },
    updatedAt: at, updatedBy: uid };
  const b = dbi.batch();
  b.set(dbi.collection('sgAssessments').doc(calEventId), doc);
  b.set(dbi.collection('sgGate').doc(calEventId), { needed: true, open: false, updatedAt: at });
  await b.commit();
  await logIt(dbi, Object.assign({ outcome: 'drafted' }, base, usage));
  console.log('sgDraftAssessment: drafted ' + calEventId + ', ' + n.risks.length + ' risks, ' + usage.tokensIn + '/' + usage.tokensOut + ' tokens');
  return { ok: true, overall: n.overall, risks: n.risks.length, mustNot: n.mustNot.length };
}

export const sgDraftAssessment = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY], timeoutSeconds: 300 }, async (req) => {
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
  if (!(await apiOf(db())).apiKey) return { state: 'notset', message: Core.WORDS.notSet };
  const st = (await db().collection('safeguardingSettings').doc('defaults').get()).data() || {}, cap = Core.caps(st);
  const u = (await db().collection('sgAiUse').doc(londonDay()).get()).data() || { total: 0, by: {} };
  if ((u.total || 0) >= cap.perChurch || ((u.by || {})[req.auth.uid] || 0) >= cap.perPerson) return { state: 'capped', message: Core.WORDS.capped };
  return { state: 'ready' };
});
