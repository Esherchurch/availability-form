/* ===================================================================
   READING A PROFESSIONAL'S RISK ASSESSMENT (H&S step 4; F-280 section 4)
   ===================================================================
   A fire risk assessment, a health and safety assessment or an insurer's
   survey - a PDF, a Word document, or a photo or scan - read by Claude with
   the same reader as a host's requirements (doc-reader-core.cjs). What comes
   back is a list for a person to check, never the assessment itself:
     the assessor, the date, the next review date and the overall rating;
     each significant finding, with likelihood and severity where the report
       gives them (the hub's own sums then rate it), or the assessor's own
       words where it doesn't (the person sets the numbers);
     each action, with its priority and deadline;
     which headings a proper assessment of this kind should have, and
       whether the report has each (a missing one is a gap).
   Personal details are left out (ra-ai-core.cjs personalCheck), and never
   socket covers (F-280 10.7).

   Two more kinds (H&S step 5): 'venue', an away event's venue - its own
   fire arrangements and risk assessment, from a file, its web pages or
   pasted words; and 'hire', a hirer's own risk assessment, checked against
   the building's significant hazards (each one a heading it should cover).

     MODEL, SYSTEM(kind), SCHEMA(heads), HEADINGS[kind], headsFor(kind, hazards)
     contentFor(kind, b64, text, type)   the message's content blocks
     contentForPages(kind, pages, pasted) the same, for web pages
     normalise(d, heads)                 -> { ok, report, findings, actions, gaps, dropped, leftOut, personalFound }
   =================================================================== */
const { personalCheck, socketCover, SOCKETS } = require('./ra-ai-core.cjs');
const { fileKind, docxText, MAX_BYTES, DOCX } = require('./doc-reader-core.cjs');

const MODEL = 'claude-sonnet-5-5';

/* the headings each kind should have: [id, words]. PAS 79-1 for fire; the HSE's five steps and the usual topics for H&S. */
const HEADINGS = {
  fire: [['premises', 'the premises and how they are used'], ['responsible', 'the responsible person'], ['peopleAtRisk', 'the people at risk, including anyone who needs help to get out'],
    ['ignition', 'sources of ignition'], ['fuel', 'sources of fuel'], ['detection', 'fire detection and warning'], ['escape', 'means of escape, emergency lighting and signs'],
    ['firefighting', 'firefighting equipment'], ['compartment', 'fire doors and compartments'], ['management', 'management: training, drills and records'],
    ['actionPlan', 'an action plan with priorities'], ['reviewDate', 'a review date']],
  hs: [['hazards', 'the hazards found'], ['whoHarmed', 'who might be harmed and how'], ['evaluation', 'how the risks were evaluated'], ['controls', 'the precautions in place'],
    ['actionPlan', 'an action plan with priorities'], ['reviewDate', 'a review date'], ['firstAid', 'first aid'], ['electrics', 'electrical safety']],
  venue: [['fireArrangements', 'its fire arrangements: the alarm, exits and assembly point'], ['riskAssessment', 'its own risk assessment'], ['firstAid', 'first aid on site'],
    ['emergency', 'who to call there in an emergency, day and night'], ['accessibility', 'access for disabled people'], ['food', 'food, allergens and kitchens']],
  hire: [['numbers', 'how many will come'], ['fire', 'what they do if the fire alarm sounds'], ['firstAid', 'first aid'], ['insurance', 'their own insurance']]
};
/* a hirer's: the fixed headings, then each of the building's significant hazards as one to cover */
function headsFor(kind, hazards) {
  return kind === 'hire' ? HEADINGS.hire.concat((hazards || []).slice(0, 60).map((h, i) => ['b' + i, 'the building’s hazard: ' + String(h).slice(0, 200)])) : HEADINGS[kind];
}
const PRIORITIES = ['immediate', 'high', 'medium', 'low', 'unstated'];

const WHAT = {
  fire: 'a professional fire risk assessment of a UK church building',
  hs: 'a professional health and safety risk assessment, or an insurer’s survey, of a UK church building',
  venue: 'what a venue (a retreat centre, an activity centre, a hall or a site) says about its own fire arrangements, its risk assessment and its rules, for a church group going there',
  hire: 'an outside hirer’s own risk assessment for their event in a UK church building'
};
function SYSTEM(kind) {
  return [
    'You read ' + WHAT[kind] + ', and list what it found, for the church to check.',
    kind === 'venue' ? 'In report.assessor give the venue’s name; date and nextReview the dates of its risk assessment where given. Its findings are the hazards it names for visiting groups; its actions are what it asks the group to do.' : '',
    kind === 'hire' ? 'In report.assessor give the hirer’s organisation. In covers, each heading named after "the building’s hazard" is true only when the hirer’s assessment deals with that hazard.' : '',
    'In report: the assessor (a firm or a professional’s name as the report gives it), the date of the assessment and the next review date (both YYYY-MM-DD, or an empty string), and the overall rating in the report’s own words.',
    'In findings: each significant finding or hazard, in plain UK English. Where the report gives a likelihood and a severity (or impact) on a 1 to 5 scale, give them; otherwise give 0 for both and put the report’s own rating words in assessorRating (for example "moderate", "tolerable", "C"). Give the line it came from, word for word, shortened if long.',
    'In actions: each recommended action, with its priority (immediate, high, medium or low; "unstated" when the report gives none - an action the report says must be done at once, or straight away, is immediate), its deadline as YYYY-MM-DD where a date is given (otherwise an empty string), and the line it came from.',
    'In covers: for each heading, true when the report has a section or clear content on it, false when it does not.',
    'Never put a private person’s name, phone number, email address or home address into a finding, an action or a line. Roles are fine ("the church warden"). If the report has any such details, set personalFound true and leave them out.',
    SOCKETS + ' If the report recommends them, leave that action out.'
  ].filter(Boolean).join('\n');
}

const STR = { type: 'string' };
function SCHEMA(heads) {
  const covers = {};
  heads.forEach(([id]) => { covers[id] = { type: 'boolean' }; });
  return {
    type: 'object', additionalProperties: false, required: ['report', 'findings', 'actions', 'covers', 'personalFound'],
    properties: {
      report: { type: 'object', additionalProperties: false, required: ['assessor', 'date', 'nextReview', 'overall'], properties: { assessor: STR, date: STR, nextReview: STR, overall: STR } },
      findings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['hazard', 'who', 'likelihood', 'severity', 'assessorRating', 'line'],
        properties: { hazard: STR, who: STR, likelihood: { type: 'integer' }, severity: { type: 'integer' }, assessorRating: STR, line: STR } } },
      actions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['what', 'priority', 'deadline', 'line'],
        properties: { what: STR, priority: { type: 'string', enum: PRIORITIES }, deadline: STR, line: STR } } },
      covers: { type: 'object', additionalProperties: false, required: heads.map(([id]) => id), properties: covers },
      personalFound: { type: 'boolean' }
    }
  };
}

const ASK = { fire: 'This is the building’s professional fire risk assessment.', hs: 'This is the building’s professional health and safety risk assessment.',
  venue: 'This is what the venue says about its arrangements.', hire: 'This is the hirer’s own risk assessment.' };
function contentForPages(kind, pages, pasted) {
  const out = [];
  (pages || []).forEach((p) => {
    if (p.kind === 'pdf') out.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(p.pdf).toString('base64') } });
    else out.push({ type: 'text', text: 'From ' + (p.title || p.url) + ':\n\n' + String(p.text || '').slice(0, 20000) });
  });
  if (String(pasted || '').trim()) out.push({ type: 'text', text: 'Pasted:\n\n' + String(pasted).slice(0, 60000) });
  out.push({ type: 'text', text: ASK[kind] + ' List what it found, as instructed.' });
  return out;
}
function contentFor(kind, fileKindIs, b64, text, type) {
  const ask = { type: 'text', text: ASK[kind] + ' List what it found, as instructed.' };
  if (fileKindIs === 'pdf') return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }, ask];
  if (fileKindIs === 'image') return [{ type: 'image', source: { type: 'base64', media_type: type, data: b64 } }, ask];
  return [{ type: 'text', text: 'The document’s words:\n\n' + String(text || '').slice(0, 120000) }, ask];
}

const clean = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const dayOr = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const n15 = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : 0);
const bad = (...t) => t.some((x) => personalCheck(x, []).refuse);

function normalise(d, heads) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.findings) || !Array.isArray(d.actions) || !d.report || !d.covers) return { ok: false };
  let dropped = 0, leftOut = 0;
  const findings = [], actions = [];
  for (const f of d.findings.slice(0, 500)) {
    const hazard = clean(f && f.hazard, 300), who = clean(f && f.who, 300), line = clean(f && f.line, 300), words = clean(f && f.assessorRating, 60);
    if (!hazard) continue;
    if (bad(hazard, who, line)) { dropped++; continue; }
    if (socketCover(hazard) || socketCover(line)) { leftOut++; continue; }
    const l = n15(f.likelihood), s = n15(f.severity);
    findings.push({ hazard, who, l: l && s ? l : 0, s: l && s ? s : 0, assessorRating: words, line });
  }
  for (const a of d.actions.slice(0, 500)) {
    const what = clean(a && a.what, 300), line = clean(a && a.line, 300);
    if (!what) continue;
    if (bad(what, line)) { dropped++; continue; }
    if (socketCover(what) || socketCover(line)) { leftOut++; continue; }
    actions.push({ what, priority: PRIORITIES.includes(a.priority) ? a.priority : 'unstated', deadline: dayOr(a.deadline), line });
  }
  const r = d.report;
  const assessor = clean(r.assessor, 120);
  const report = { assessor: personalCheck(assessor, []).refuse ? '' : assessor, date: dayOr(r.date), nextReview: dayOr(r.nextReview), overall: clean(r.overall, 120) };
  const gaps = heads.filter(([id]) => d.covers[id] !== true).map(([id, words]) => ({ id, words }));
  return { ok: true, report, findings, actions, gaps, dropped, leftOut, personalFound: d.personalFound === true || dropped > 0 };
}

module.exports = { MODEL, HEADINGS, PRIORITIES, SYSTEM, SCHEMA, headsFor, contentFor, contentForPages, normalise, fileKind, docxText, MAX_BYTES, DOCX };
