/* READING A PROFESSIONAL'S RISK ASSESSMENT INTO THE BUILDING'S OWN (H&S
 * step 4; F-280 section 4). The events window's file.
 *
 *   raReadReport({ siteId, kind, fileName, contentType, data })
 *       the file (base64) is kept in Storage where the live risk register
 *       keeps reports; Claude reads it (ra-report-core.cjs); what it found
 *       is saved in raReads/<siteId>__<kind>, NOT in the assessment. The
 *       page shows it, a person checks each line, and only then is it added
 *       (Martin's answer 7: each action confirmed before it becomes a job).
 *   raAiStatus({ siteId })   ready / notset / broken / capped / notallowed
 *
 * Who: master admins, the office (its job) and the building's leads
 * (raSiteRoles), as for the assessment itself. Caps: Health and safety
 * settings' AI drafts a day (raSettings/church.ai; 20 and 5), separate from
 * safeguarding's (F-280 answer 9): their own records, raAiUse, raAiLog,
 * raAiState, raAiStub. For each church, from the sign-in (church-scope.js).
 */
import { createRequire } from 'node:module';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { aiPlumbing, callModel } from './ra-ai.js';
import { CHQ_ANTHROPIC_API_KEY } from './sg-ai.js';
import { londonDay } from './sg-warnings.js';
import { readTeamJobs, onJob } from './team-jobs.js';
import { churchOf } from './church-scope.js';

const require = createRequire(import.meta.url);
const R = require('./ra-report-core.cjs');
const REGION = 'europe-west2';
const WORDS = {
  notSet: 'Reading reports with AI isn’t set up yet for this church. Type the findings in by hand.',
  setup: 'The AI isn’t set up properly yet. Ask the church office.',
  broken: 'Reading reports with AI is set up but not working yet. Type the findings in by hand for now.',
  capped: 'Today’s limit of AI reads is reached; try tomorrow, or type the findings in by hand.'
};
const { apiOf, logIt, broken, noteWorking, callFailed, takeOne, usedUp } = aiPlumbing({ secret: CHQ_ANTHROPIC_API_KEY, day: () => londonDay(),
  records: { use: 'raAiUse', log: 'raAiLog', state: 'raAiState', stub: 'raAiStub' }, words: WORDS });

/* the caps: Health and safety settings, 20 a day for the church and 5 a person unless it says */
export function capsOf(set) {
  const a = (set && set.ai) || {}, n = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d);
  return { perChurch: n(a.perChurch, 20), perPerson: n(a.perPerson, 5) };
}

/* may this person read a report into this building's assessment? */
export async function whoFor(dbi, uid, siteId) {
  const [u, roles, site] = await Promise.all([dbi.collection('users').doc(uid).get(), dbi.collection('raSiteRoles').doc(siteId).get(), dbi.collection('sites').doc(siteId).get()]);
  const me = u.exists ? u.data() : null;
  if (!me || me.status !== 'active' || !site.exists) return { ok: false };
  if (me.masterAdmin === true) return { ok: true, me };
  const tj = await readTeamJobs(dbi);
  if (onJob(tj.map, (me.teams || []).concat(me.covers || []), 'office', tj.set)) return { ok: true, me };
  const r = roles.exists ? roles.data() : {}, mid = me.memberId || '';
  return { ok: !!mid && [r.hsLead, r.hsDeputy, r.fireLead].includes(mid), me };
}

export async function readReport({ db: dbi, uid, data, api, bucket, prefix }) {
  data = data || {};
  const siteId = String(data.siteId || ''), kind = data.kind === 'fire' ? 'fire' : data.kind === 'hs' ? 'hs' : '';
  if (!siteId || siteId.includes('/') || !kind) throw new HttpsError('invalid-argument', 'Which building, and which assessment?');
  const w = await whoFor(dbi, uid, siteId);
  if (!w.ok) throw new HttpsError('permission-denied', 'This is for the office, the building’s health and safety and fire safety leads, and master admins.');
  const type = String(data.contentType || '').toLowerCase(), fileName = String(data.fileName || 'report').replace(/[\\/]/g, '_').slice(0, 120);
  const fk = R.fileKind(type, fileName);
  if (!fk) throw new HttpsError('invalid-argument', 'Upload a PDF, a Word document (.docx), or a photo or scan of the report.');
  const buf = Buffer.from(String(data.data || ''), 'base64');
  if (!buf.length) throw new HttpsError('invalid-argument', 'The file is empty.');
  if (buf.length > R.MAX_BYTES) throw new HttpsError('invalid-argument', 'The file is too big: 7 MB at most. A photo of each page will do.');
  let text = '';
  if (fk === 'docx') {
    try { text = R.docxText(buf); } catch (e) { throw new HttpsError('invalid-argument', 'This Word document can’t be read. Save it as a PDF and try that.'); }
    if (!text.trim()) throw new HttpsError('invalid-argument', 'There are no words in this Word document.');
  }
  const base = { siteId, calEventId: '', by: uid, byName: w.me.name || '', chars: buf.length, kind: 'report-' + kind };
  const key = api || (await apiOf(dbi));
  if (!key.apiKey) throw new HttpsError('failed-precondition', WORDS.notSet);
  if (await broken(dbi, key.apiKey)) throw new HttpsError('failed-precondition', WORDS.broken);
  const set = (await dbi.collection('raSettings').doc('church').get()).data() || {};
  if (!(await takeOne(dbi, uid, capsOf(set)))) { await logIt(dbi, Object.assign({ outcome: 'capped' }, base)); throw new HttpsError('resource-exhausted', WORDS.capped); }
  /* the original, kept as it came, where the live risk register keeps reports */
  const path = (prefix || '') + 'compliance/' + siteId + '/risk-' + kind + '/' + Date.now() + '-' + fileName.replace(/[^A-Za-z0-9._ -]/g, '_');
  await (bucket || getStorage().bucket()).file(path).save(buf, { contentType: type || (fk === 'docx' ? R.DOCX : 'application/octet-stream'), resumable: false });
  let res;
  try {
    res = await callModel({ apiKey: key.apiKey, baseURL: key.baseURL, request: { model: R.MODEL, max_tokens: 16000,
      system: [{ type: 'text', text: R.SYSTEM(kind), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: R.contentFor(kind, fk, buf.toString('base64'), text, type) }],
      output_config: { format: { type: 'json_schema', schema: R.SCHEMA(kind) } } } });
  } catch (e) { throw await callFailed(dbi, e, key, base, 'raReadReport'); }
  await noteWorking(dbi, key.apiKey);
  const usage = { tokensIn: (res.usage || {}).input_tokens || 0, tokensOut: (res.usage || {}).output_tokens || 0 };
  if (res.stop_reason === 'refusal') { await logIt(dbi, Object.assign({ outcome: 'refused-model' }, base, usage)); throw new HttpsError('failed-precondition', 'The AI couldn’t read this report; type its findings in by hand.'); }
  let parsed = null;
  try { parsed = res.stop_reason === 'max_tokens' ? null : JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch (e) { parsed = null; }
  const n = R.normalise(parsed, kind);
  if (!n.ok) { await logIt(dbi, Object.assign({ outcome: 'failed' }, base, usage)); throw new HttpsError('internal', 'The list came back incomplete; try again.'); }
  const at = new Date().toISOString(), id = (p, i) => p + i + '_' + Math.random().toString(36).slice(2, 8);
  const read = { siteId, kind, at, by: uid, byName: String(w.me.name || '').slice(0, 120), file: { path, name: fileName, type: type || fk, size: buf.length },
    report: n.report, findings: n.findings.map((f, i) => Object.assign({ id: id('f', i) }, f)), actions: n.actions.map((a, i) => Object.assign({ id: id('a', i) }, a)),
    gaps: n.gaps, dropped: n.dropped, leftOut: n.leftOut, personalFound: n.personalFound };
  await dbi.collection('raReads').doc(siteId + '__' + kind).set(read);
  await logIt(dbi, Object.assign({ outcome: 'read' }, base, usage));
  return { ok: true, findings: read.findings.length, actions: read.actions.length, gaps: read.gaps.length, leftOut: n.leftOut, personalFound: n.personalFound,
    message: n.personalFound ? 'The report seems to have names, phone numbers or emails in it. They were left out of what was read.' : '' };
}

export const raReadReport = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY], timeoutSeconds: 180, memory: '512MiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, getFirestore());
  return readReport({ db: ch.db, uid: req.auth.uid, data: req.data, prefix: ch.id ? 'churches/' + ch.id + '/' : '' });
});

export const raAiStatus = onCall({ region: REGION, secrets: [CHQ_ANTHROPIC_API_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const ch = churchOf(req, getFirestore()), dbi = ch.db, siteId = String((req.data || {}).siteId || '');
  if (!siteId || siteId.includes('/')) throw new HttpsError('invalid-argument', 'Which building?');
  if (!(await whoFor(dbi, req.auth.uid, siteId)).ok) return { state: 'notallowed' };
  const api = await apiOf(dbi);
  if (!api.apiKey) return { state: 'notset', message: WORDS.notSet };
  if (await broken(dbi, api.apiKey)) return { state: 'broken', message: WORDS.broken };
  if (await usedUp(dbi, req.auth.uid, capsOf((await dbi.collection('raSettings').doc('church').get()).data() || {}))) return { state: 'capped', message: WORDS.capped };
  return { state: 'ready' };
});
