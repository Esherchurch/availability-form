/* ===================================================================
   THE SAFEGUARDING RISK REGISTER, step 5: AI-drafted event assessments
   (F-265 part A) - the parts that need no network
   ===================================================================
   personalCheck(text, names)  refuse a child's name the hub holds for the
                               event, an email, a phone number, a postcode,
                               a date of birth or an NHS-style number,
                               BEFORE anything is sent; warn (not refuse) a
                               medical word next to a capitalised name
   hubRisks(facts)             the hub's own rows, worked out from its
                               numbers, never the AI's: too few leaders for
                               the ratio, fewer than two adults
   normalise(draft, facts)     check the AI's answer and re-score it: the
                               ratings and the overall are the hub's sums
                               (likelihood x impact; 15+ red, 5+ amber),
                               never the AI's own
   SCHEMA, SYSTEM, userText    what is sent: the instructions (cached), the
                               counts the hub knows, the leader's words
   No name of a child, a parent or a collector, no email and no stored data
   beyond counts ever goes to the API; the leader's words are not kept.
   =================================================================== */
'use strict';
const Safeguarding = require('./safeguarding-core.cjs');

const MODEL = 'claude-sonnet-5-5';
const LIMIT = 4000;
const WORDS = {
  notSet: 'AI drafting isn’t set up yet for this church. Write the assessment from a template instead.',
  refused: 'The AI couldn’t draft this; write it from the template instead.',
  incomplete: 'The draft came back incomplete; try again.',
  capped: 'Today’s limit is reached; try tomorrow, or use a template.',
  name: 'It looks like this has a child’s name in it. Describe the children in general words and try again.',
  email: 'It looks like this has an email address in it. Take it out and try again.',
  phone: 'It looks like this has a phone number in it. Take it out and try again.',
  postcode: 'It looks like this has a postcode in it. Name the place in general words and try again.',
  dob: 'It looks like this has a date of birth in it. Give ages in general words and try again.',
  nhs: 'It looks like this has an NHS number in it. Take it out and try again.',
  setup: 'The AI isn’t set up properly yet. Ask the church office.',
  broken: 'AI drafting is set up but not working yet. Ask the church office, and write the assessment from a template for now.',
  medical: 'It may name someone next to a medical detail. Describe needs in general words, e.g. "two children need an adult with them at all times".'
};

/* ---- 1. personal details, refused before any call ---- */
const COMMON = new Set(['will', 'grace', 'hope', 'faith', 'joy', 'mark', 'bill', 'rose', 'may', 'june', 'april', 'august', 'art', 'sky', 'summer', 'dawn', 'eve', 'holly', 'ivy', 'iris', 'jack', 'max', 'pat', 'ray', 'rob', 'sandy', 'hunter', 'chase', 'drew', 'trip', 'beach', 'church', 'park', 'leader', 'leaders', 'children', 'child']);
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function personalCheck(text, names) {
  const t = String(text || '');
  if (/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i.test(t)) return { refuse: 'email' };
  if (/(\+44\s?\(?0?\)?\s?|\b0)(7\d{3}|\d{2,4})[\s-]?\d{3,4}[\s-]?\d{3,4}\b/.test(t)) return { refuse: 'phone' };
  if (/\b(born|d\.?o\.?b\.?|date of birth|birthday)\b\W{0,4}(on\s+|is\s+)?\d{1,2}(st|nd|rd|th)?[\s\/.-]/i.test(t)) return { refuse: 'dob' };
  if (/\b\d{3}[\s-]?\d{3}[\s-]?\d{4}\b/.test(t)) return { refuse: 'nhs' };
  if (/\b(GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b/.test(t)) return { refuse: 'postcode' };
  for (const n of names || []) {
    const full = String(n || '').trim().replace(/\s+/g, ' ');
    if (!full) continue;
    if (full.includes(' ') && new RegExp('\\b' + esc(full) + '\\b', 'i').test(t)) return { refuse: 'name' };
    const first = full.split(' ')[0];
    if (first.length >= 3 && !COMMON.has(first.toLowerCase()) && new RegExp('\\b' + esc(first[0].toUpperCase() + first.slice(1).toLowerCase()) + '\\b').test(t)) return { refuse: 'name' };
  }
  /* a capitalised word (not a general one) then "has / needs ..." a medical word */
  const m = t.match(/\b([A-Z][a-z]{2,})('s)?\s+(has|is|with|needs|takes|gets)\s+(\w+\s+){0,3}(epilep|diabet|asthma|allerg|anaphyla|autis|adhd|seizure|insulin|epipen|inhaler)/);
  const warn = !!m && !/^(The|Some|Two|Three|One|Several|Many|Most|All|Each|Every|Children|Leaders|Parents|Everyone|Nobody)$/.test(m[1]);
  return { refuse: null, warn };
}

/* ---- 2. the hub's own rows, from its numbers ---- */
/* facts: { children, under8, leaders, cleared, ratioAll, ratioUnder8, kind, overnight, offsite, days } */
function hubRisks(f) {
  const out = [], r = Safeguarding.ratio({ children: f.children || 0, under8: f.under8 || 0, leaders: f.leaders || 0, ratioAll: f.ratioAll || 5, ratioUnder8: f.ratioUnder8 || 4 });
  const need = Math.max(r.need, f.children ? 2 : 0);
  if (!f.children) {
    out.push({ risk: ((f.leaders || 0) ? 'No children booked yet: the ratio can’t be checked until they are' : 'No children booked and no leaders named yet: the ratio can’t be checked').slice(0, 200),
      who: 'Children', l: 3, i: 4, rl: 3, ri: 4, owner: 'The event’s organiser', review: 'When bookings come in',
      controls: [{ kind: 'ratio', text: '' }, { kind: 'twoAdults', text: '' }, { kind: 'text', text: 'Check the numbers again before sign-off: one leader to ' + (f.ratioAll || 5) + ', and never fewer than two adults' }],
      mustNot: false, from: 'hub' });
    return out;
  }
  if ((f.leaders || 0) < need) {
    out.push({ risk: ('Not enough leaders: ' + need + ' needed for ' + f.children + ' ' + (f.children === 1 ? 'child' : 'children') + (f.under8 ? ' (' + f.under8 + ' under 8)' : '') + '; ' + (f.leaders || 0) + ' named').slice(0, 200),
      who: 'Children', l: 5, i: 5, rl: 5, ri: 5, owner: 'The event’s organiser', review: 'Before bookings open',
      controls: [{ kind: 'ratio', text: '' }, { kind: 'twoAdults', text: '' }, { kind: 'text', text: 'Name ' + (need - (f.leaders || 0)) + ' more checked leader' + (need - (f.leaders || 0) === 1 ? '' : 's') + ' before it goes ahead' }],
      mustNot: true, from: 'hub' });
  }
  return out;
}

/* ---- 3. what is sent ---- */
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'overall', 'hazards', 'mustNotGoAhead', 'questions', 'answers', 'flags'],
  properties: {
    summary: { type: 'string' },
    overall: { type: 'string', enum: ['red', 'amber', 'green'] },
    hazards: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['hazard', 'who', 'likelihood', 'impact', 'controls', 'likelihoodAfter', 'impactAfter', 'owner', 'review', 'mustNotGoAhead'],
      properties: {
        hazard: { type: 'string' }, who: { type: 'string' },
        likelihood: { type: 'integer' }, impact: { type: 'integer' },
        controls: { type: 'array', items: { type: 'string' } },
        likelihoodAfter: { type: 'integer' }, impactAfter: { type: 'integer' },
        owner: { type: 'string' }, review: { type: 'string' }, mustNotGoAhead: { type: 'boolean' }
      } } },
    mustNotGoAhead: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
    answers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'answer'], properties: { id: { type: 'string' }, answer: { type: 'string' } } } },
    flags: { type: 'object', additionalProperties: false, required: ['abroad', 'adventurous'], properties: { abroad: { type: 'boolean' }, adventurous: { type: 'boolean' } } }
  }
};
/* NEVER SOCKET COVERS (Martin, 23 Oct 2026; F-280 10.7): UK sockets have
   shutters, and safety bodies advise against covers. Said in every AI
   instruction, and checked here as well: anything that mentions them is
   left out, and the page says so. */
const SOCKETS = 'Never recommend socket covers, socket protectors, socket inserts or plastic safety plugs: UK sockets have built-in shutters, and safety bodies advise against covers. For electrical safety, recommend checks of sockets, leads and equipment instead.';
const SOCKET_RE = /\b(socket|plug|outlet)[\s-]*(covers?|protectors?|inserts?|guards?|caps?|blanks?|blockers?)\b|\bsafety[\s-]*plugs?\b/i;
function socketCover(s) { return SOCKET_RE.test(String(s == null ? '' : s)); }
/* the same for every call, so it is cached */
const SYSTEM = [
  'You draft safeguarding risk assessments for one-off church events with children and young people in the United Kingdom.',
  'A leader describes the event. You return a first draft that the church’s safeguarding lead will check, change and sign off. It counts for nothing until they do.',
  '',
  'For each hazard give: what could happen (one plain sentence); who could be harmed; how likely (1 to 5) and how bad (1 to 5) before the controls; the controls, each a short plain instruction; how likely and how bad after the controls; an owner as a role, never a person’s name (for example "the trip leader"); and when to review it (for example "the day before").',
  'Likelihood: 1 very unlikely, 2 unlikely, 3 possible, 4 likely, 5 almost certain. Impact: 1 negligible, 2 minor, 3 moderate, 4 major, 5 severe.',
  'Cover what applies: supervision and ratios, two adults at all times, leaders’ checks and training, consent and medical needs in general terms, travel, water, food and allergies, getting lost, weather, first aid, emergencies and contacting parents, overnight sleeping arrangements, online and photo consent, and anything particular to this event.',
  '',
  'Say plainly when something must not happen. If any part of the event must not go ahead as described, mark that hazard mustNotGoAhead true and add a plain sentence to mustNotGoAhead, for example "Children must not be left alone in the prison at any time." Do not soften it.',
  'Add questions the leader should answer before sign-off, for example "Who is the trained first aider?".',
  'The hub has given the numbers it holds. Use them, but do not do the ratio arithmetic yourself: the hub adds its own row for leader numbers.',
  'The hub also gives the church’s required checklist, each question with an id. Make sure the hazards cover every topic on it. In answers, suggest an answer for a question only where the description actually says it (id and a short answer); never invent facts. Every question you cannot answer from the description goes into questions instead.',
  'A trained paediatric first aider is essential where young children are present. If the description does not show one going, include a hazard for it, rated at least Medium, and High if children under 8 are going.',
  'In flags, set abroad true only if the event leaves the United Kingdom, and adventurous true if it includes water, heights or other adventurous activities.',
  'Plain UK English, short sentences, no jargon. Never include a person’s name, contact details or medical details, even if the description has them.',
  SOCKETS
].join('\n');
function userText(f, text, checklist) {
  return [
    'What the hub knows about this event (counts only):',
    '- Kind of event: ' + ({ trip: 'a trip', overnight: 'an overnight', holidayclub: 'a holiday club', offsite: 'off-site', camp: 'a camp or festival (tents)' }[f.kind] || 'an event') + (f.days > 1 ? ', over ' + f.days + ' days' : ''),
    '- Children booked or expected: ' + (f.children || 0) + (f.under8 ? ', of whom ' + f.under8 + ' under 8' : ''),
    '- Leaders named: ' + (f.leaders || 0) + ', of whom ' + (f.cleared || 0) + ' have an in-date check and training',
    '- The church’s ratios: one leader to ' + (f.ratioAll || 5) + ' children, and one to ' + (f.ratioUnder8 || 4) + ' for under-8s; never fewer than two adults',
    ...(f.guidance ? ['- The church follows this safeguarding guidance: ' + f.guidance + '. Where it applies, keep to it.'] : []),
    '',
    'The required checklist (id: question):',
    ...(checklist || []).map((q) => '- ' + q.id + ': ' + q.label),
    '',
    'The leader’s description:',
    String(text || '').slice(0, LIMIT)
  ].join('\n');
}

/* ---- 4. checking the answer, and the hub's sums ---- */
const int5 = (n) => Number.isInteger(n) && n >= 1 && n <= 5;
const clean = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
function rating(l, i) { const s = l * i; return s >= 15 ? 'red' : s >= 5 ? 'amber' : 'green'; }
const WORSE = { red: 3, amber: 2, green: 1 };
function normalise(d, facts) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.hazards) || !d.hazards.length) return { ok: false };
  const risks = [];
  let leftOut = 0;
  const keep = (x) => { if (socketCover(x)) { leftOut++; return false; } return true; };
  for (const h of d.hazards.slice(0, 40)) {
    if (!h || !clean(h.hazard, 200) || !int5(h.likelihood) || !int5(h.impact) || !int5(h.likelihoodAfter) || !int5(h.impactAfter)) return { ok: false };
    const said = (Array.isArray(h.controls) ? h.controls : []).map((c) => clean(c, 200)).filter(Boolean);
    if (!said.length || !clean(h.owner, 80)) return { ok: false };
    /* a hazard about socket covers goes; so does one left with no control once they're taken out */
    if (!keep(h.hazard)) continue;
    const controls = said.filter(keep).slice(0, 20);
    if (!controls.length) { leftOut++; continue; }
    risks.push({ risk: clean(h.hazard, 200), who: clean(h.who, 120), l: h.likelihood, i: h.impact, rl: h.likelihoodAfter, ri: h.impactAfter,
      controls: controls.map((text) => ({ kind: 'text', text })), owner: clean(h.owner, 80), review: clean(h.review, 120), mustNot: h.mustNotGoAhead === true, from: 'ai' });
  }
  if (!risks.length) return { ok: false };
  const all = hubRisks(facts || {}).concat(risks).slice(0, 40);
  const mustNot = (Array.isArray(d.mustNotGoAhead) ? d.mustNotGoAhead : []).map((x) => clean(x, 300)).filter(Boolean).filter(keep).slice(0, 10);
  all.filter((r) => r.from === 'hub').forEach((r) => mustNot.unshift('This must not go ahead as described: ' + r.risk.charAt(0).toLowerCase() + r.risk.slice(1) + '.'));
  /* THE HUB'S SUMS: the overall is the worst after the controls, and red while anything must not go ahead */
  let overall = 'green';
  all.forEach((r) => { const g = rating(r.rl, r.ri); if (WORSE[g] > WORSE[overall]) overall = g; });
  if (mustNot.length || all.some((r) => r.mustNot)) overall = 'red';
  const known = new Set(((facts || {}).checklistIds) || []), suggest = {};
  (Array.isArray(d.answers) ? d.answers : []).forEach((a) => {
    const id = clean(a && a.id, 40), v = clean(a && a.answer, 500);
    if (id && v && known.has(id) && !personalCheck(v, []).refuse && keep(v)) suggest[id] = v;
  });
  const flags = { abroad: !!(d.flags && d.flags.abroad === true), adventurous: !!(d.flags && d.flags.adventurous === true) };
  const questions = (Array.isArray(d.questions) ? d.questions : []).map((x) => clean(x, 300)).filter(Boolean).filter(keep).slice(0, 10);
  const summary = keep(clean(d.summary, 600)) ? clean(d.summary, 600) : '';
  return { ok: true, risks: all, overall, mustNot, questions, summary, suggest, flags, leftOut };
}

/* the caps: settings, with Martin's defaults */
function caps(st) { const a = (((st || {}).register || {}).ai) || {}; const n = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d); return { perChurch: n(a.perChurch, 20), perPerson: n(a.perPerson, 5) }; }

module.exports = { MODEL, LIMIT, WORDS, SCHEMA, SYSTEM, SOCKETS, socketCover, personalCheck, hubRisks, userText, normalise, rating, caps };
