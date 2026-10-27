/* ===================================================================
   THE AI FIRST DRAFT of a building's or an event's health and safety
   assessment (H&S step 7; F-280 section 5)
   ===================================================================
   From a plain description and the counts the hub knows (each room's fire
   maximum, the building's checks and their colours, how many evacuation
   plans, whether there is a plan for visitors). Never a person's details:
   the description is refused if it has any (ra-ai-core.cjs personalCheck).
   Never socket covers (F-280 10.7). The AI gives likelihood and severity;
   the hub does the sums. Its answers to the required questions are
   suggestions "to confirm", never answers.

     MODEL, SYSTEM(kind), SCHEMA, userText(kind, description, facts, questions)
     normalise(d, questionIds) -> { ok, hazards, actions, answers, summary, mustNot, leftOut }
   =================================================================== */
const { personalCheck, socketCover, SOCKETS } = require('./ra-ai-core.cjs');

const MODEL = 'claude-sonnet-5-5';
const PRIORITIES = ['immediate', 'high', 'medium', 'low'];
const WHAT = {
  hs: 'a health and safety risk assessment of a UK church building, in the HSE’s five steps (find the hazards; who might be harmed and how; evaluate the risks and decide on precautions; record the findings and act; review)',
  fire: 'a fire risk assessment of a UK church building, laid out like PAS 79-1 (the premises; the people at risk; fire hazards - ignition, fuel, oxygen; fire protection - detection, escape, firefighting, fire doors; management - training, drills, testing; the action plan)',
  event: 'a health and safety risk assessment of one church event in the UK, adding only what the event changes to its building’s own assessments (or, away from the church, what the venue and the trip change)'
};
function SYSTEM(kind) {
  return [
    'You draft ' + WHAT[kind] + ', for the church to check line by line. It is a first draft only.',
    'For each hazard give: the hazard in plain UK English; who could be hurt and how; likelihood and severity from 1 to 5 before the controls and again after them; and the controls, as short plain sentences.',
    'Give actions still needed, each with a priority (immediate, high, medium or low).',
    'For each question you are given by id, suggest an answer in one or two plain sentences where the facts allow; leave out any you can’t answer from the facts. Never invent a fact about the building: where you don’t know, say what to check.',
    'In mustNot, list anything that must not go ahead as described (for example more people than a room’s fire maximum).',
    'Never name a person, and never give a phone number, an email or an address. Roles only ("the fire safety lead").',
    SOCKETS,
    'UK law and guidance only: the Regulatory Reform (Fire Safety) Order 2005, the Management of Health and Safety at Work Regulations 1999, the HSE’s guidance. Not legal advice: the church’s responsible person decides.'
  ].join('\n');
}
const STR = { type: 'string' }, INT = { type: 'integer' };
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['summary', 'hazards', 'actions', 'answers', 'mustNot'],
  properties: {
    summary: STR,
    hazards: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['hazard', 'who', 'likelihood', 'severity', 'likelihoodAfter', 'severityAfter', 'controls'],
      properties: { hazard: STR, who: STR, likelihood: INT, severity: INT, likelihoodAfter: INT, severityAfter: INT, controls: { type: 'array', items: STR } } } },
    actions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['what', 'priority'], properties: { what: STR, priority: { type: 'string', enum: PRIORITIES } } } },
    answers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'text'], properties: { id: STR, text: STR } } },
    mustNot: { type: 'array', items: STR }
  }
};
function userText(kind, description, facts, questions) {
  return 'What it is, in the church’s words:\n' + String(description || '').slice(0, 4000) +
    '\n\nWhat the hub knows (counts and colours only):\n' + JSON.stringify(facts || {}, null, 1).slice(0, 30000) +
    '\n\nThe required questions, by id:\n' + (questions || []).map((q) => q.id + ': ' + q.label).join('\n');
}
const clean = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const n15 = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : 3);
const bad = (t) => !!personalCheck(t, []).refuse;
function normalise(d, questionIds) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.hazards) || !Array.isArray(d.actions)) return { ok: false };
  let leftOut = 0, dropped = 0;
  const hazards = [], actions = [], answers = {}, mustNot = [];
  for (const h of d.hazards.slice(0, 200)) {
    const hazard = clean(h && h.hazard, 300); if (!hazard) continue;
    const controls = (Array.isArray(h.controls) ? h.controls : []).map((c) => clean(c, 300)).filter((c) => c && !socketCover(c) && !bad(c));
    leftOut += (Array.isArray(h.controls) ? h.controls : []).filter((c) => socketCover(String(c || ''))).length;
    if (socketCover(hazard)) { leftOut++; continue; }
    if (bad(hazard) || bad(h.who)) { dropped++; continue; }
    hazards.push({ hazard, who: clean(h.who, 300), l: n15(h.likelihood), s: n15(h.severity), rl: n15(h.likelihoodAfter), rs: n15(h.severityAfter), controls: controls.slice(0, 20) });
  }
  for (const a of d.actions.slice(0, 200)) {
    const what = clean(a && a.what, 300); if (!what) continue;
    if (socketCover(what)) { leftOut++; continue; }
    if (bad(what)) { dropped++; continue; }
    actions.push({ what, priority: PRIORITIES.includes(a.priority) ? a.priority : 'medium' });
  }
  for (const x of (Array.isArray(d.answers) ? d.answers : []).slice(0, 200)) {
    const id = clean(x && x.id, 60), text = clean(x && x.text, 1000);
    if (!id || !text || !(questionIds || []).includes(id)) continue;
    if (socketCover(text)) { leftOut++; continue; }
    if (bad(text)) { dropped++; continue; }
    answers[id] = text;
  }
  for (const m of (Array.isArray(d.mustNot) ? d.mustNot : []).slice(0, 20)) { const t = clean(m, 300); if (t && !bad(t)) mustNot.push(t); }
  return { ok: true, hazards, actions, answers, mustNot, summary: bad(d.summary) ? '' : clean(d.summary, 1000), leftOut, dropped };
}
module.exports = { MODEL, PRIORITIES, SYSTEM, SCHEMA, userText, normalise };
