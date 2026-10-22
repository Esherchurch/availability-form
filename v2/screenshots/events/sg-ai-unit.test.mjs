/* THE SAFEGUARDING RISK REGISTER, step 5: AI drafts (F-265 part A) - the
   parts that need no network or emulator. Invented names only.
     node screenshots/events/sg-ai-unit.test.mjs */
import path from 'node:path';
import { createRequire } from 'node:module';

const V2 = path.resolve('.');
const require = createRequire(path.join(V2, 'functions', 'index.js'));
const A = require('./sg-ai-core.cjs');
const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 500))); };
const J = (x) => JSON.stringify(x);
const NAMES = ['Pat Jones (invented)', 'Charlie Jones', 'Robin Smith'];

console.log('\n1. personal details: refused before anything is sent');
const pc = (t) => A.personalCheck(t, NAMES).refuse;
ok('a child’s full name the hub holds for the event', pc('Charlie Jones needs a booster seat.') === 'name');
ok('   or their first name alone', pc('Bring a spare jumper for Charlie.') === 'name');
ok('   but not a common word that happens to be a first name ("Will", "Grace")', A.personalCheck('A leader Will say Grace before lunch.', ['Will Brown', 'Grace Smith']).refuse === null);
ok('   a first name only counts capitalised, as a name', A.personalCheck('we will go', ['Will Brown']).refuse === null);
ok('an email address', pc('Parents can reach me at someone@example.invalid') === 'email');
ok('a mobile number', pc('Call 07700 900123 on the day') === 'phone');
ok('   and a +44 one', pc('Call +44 7700 900123') === 'phone');
ok('a postcode', pc('Meet at the hall, KT10 9AB, at 8am') === 'postcode');
ok('a date of birth', pc('One boy, born 12/03/2016, is very shy') === 'dob');
ok('an NHS-style number', pc('NHS 943 476 5919') === 'nhs');
ok('GENERAL WORDS PASS: ages, counts, needs in general', A.personalCheck('A day trip to the coast for 30 children aged 8 to 11, by coach; 5 adults; two children need an adult with them at all times; some have allergies.', NAMES).refuse === null);
ok('   and event dates and times', A.personalCheck('We leave at 8:30 on 14/07/2027 and come back at 18:00.', NAMES).refuse === null);
ok('a medical word next to a capitalised name: warned, not refused', (() => { const r = A.personalCheck('Sam has epilepsy and needs watching in the water.', NAMES); return r.refuse === null && r.warn === true; })());
ok('   "Some children have allergies" is not warned', A.personalCheck('Some children have allergies.', NAMES).warn === false);

console.log('\n2. the hub’s own row, from its numbers (never the AI’s arithmetic)');
const facts = { children: 30, under8: 6, leaders: 5, cleared: 4, ratioAll: 5, ratioUnder8: 4, kind: 'trip', days: 1 };
let h = A.hubRisks(facts);
ok('30 children (6 under 8), 5 leaders, 1 to 5: 6 needed, a red "must not go ahead" row', h.length === 1 && h[0].mustNot && h[0].from === 'hub' && /6 needed for 30 children \(6 under 8\); 5 named/.test(h[0].risk) && A.rating(h[0].rl, h[0].ri) === 'red', J(h));
ok('   with the ratio and two-adults controls, and how many more to name', h[0].controls.some((c) => c.kind === 'ratio') && h[0].controls.some((c) => /Name 1 more checked leader before/.test(c.text)), J(h[0].controls));
ok('6 leaders for the same: no row', A.hubRisks(Object.assign({}, facts, { leaders: 6 })).length === 0);
ok('3 children, 1 leader: two adults are still needed', /2 needed for 3 children; 1 named/.test((A.hubRisks({ children: 3, leaders: 1, ratioAll: 5, ratioUnder8: 4 })[0] || {}).risk || ''));
ok('the under-8 ratio is the stricter test (20 children all under 8, 1 to 4: 5 needed)', /5 needed/.test((A.hubRisks({ children: 20, under8: 20, leaders: 4, ratioAll: 5, ratioUnder8: 4 })[0] || {}).risk || ''));

console.log('\n3. checking the answer, and the hub’s sums');
const H = (x) => Object.assign({ hazard: 'Getting lost on the beach', who: 'Children', likelihood: 3, impact: 4, controls: ['Headcount every hour'], likelihoodAfter: 2, impactAfter: 4, owner: 'The trip leader', review: 'The day before', mustNotGoAhead: false }, x);
const good = { summary: 'A day at the coast.', overall: 'green', hazards: [H(), H({ hazard: 'Swimming in the sea', likelihood: 4, impact: 5, likelihoodAfter: 3, impactAfter: 5 })], mustNotGoAhead: [], questions: ['Who is the trained first aider?'] };
let n = A.normalise(good, Object.assign({}, facts, { leaders: 6 }));
ok('a good draft is kept: two risks, in the hub’s shape', n.ok && n.risks.length === 2 && J(Object.keys(n.risks[0]).sort()) === J(['controls', 'from', 'i', 'l', 'mustNot', 'owner', 'review', 'ri', 'risk', 'rl', 'who']), J(n));
ok('THE HUB’S SUMS WIN: the AI said "green", but 3 x 5 = 15 after the controls is red', n.overall === 'red', n.overall);
n = A.normalise(Object.assign({}, good, { overall: 'red', hazards: [H({ likelihoodAfter: 1, impactAfter: 4 })] }), Object.assign({}, facts, { leaders: 6 }));
ok('   and the other way: the AI said "red", the hub works out green (1 x 4 = 4 after the controls)', n.overall === 'green', n.overall);
n = A.normalise(good, facts);
ok('THE RATIO SHORTFALL THE AI LEFT OUT: the hub adds its row first; overall red; a "must not" sentence', n.risks[0].from === 'hub' && n.overall === 'red' && /^This must not go ahead as described: not enough leaders/.test(n.mustNot[0]), J(n.mustNot));
n = A.normalise(Object.assign({}, good, { hazards: [H({ hazard: 'Children left alone in the prison', mustNotGoAhead: true, likelihoodAfter: 1, impactAfter: 1 })], mustNotGoAhead: ['Children must not be left alone in the prison at any time.'] }), Object.assign({}, facts, { leaders: 6 }));
ok('a "must not go ahead" item makes it red, whatever its ratings', n.overall === 'red' && n.risks[0].mustNot === true && n.mustNot.length === 1, J(n));
ok('MALFORMED: no hazards is refused', A.normalise({ summary: 'x', hazards: [] }, facts).ok === false);
ok('   a rating of 7 is refused', A.normalise(Object.assign({}, good, { hazards: [H({ impact: 7 })] }), facts).ok === false);
ok('   a hazard with no control is refused', A.normalise(Object.assign({}, good, { hazards: [H({ controls: [] })] }), facts).ok === false);
ok('   a hazard with no owner is refused', A.normalise(Object.assign({}, good, { hazards: [H({ owner: ' ' })] }), facts).ok === false);
ok('   not even an object', A.normalise(null, facts).ok === false && A.normalise('text', facts).ok === false);
const long = A.normalise(Object.assign({}, good, { hazards: Array.from({ length: 50 }, () => H({ hazard: 'x'.repeat(400) })) }), facts);
ok('the rules’ shape: 40 risks at most, 200 characters each', long.ok && long.risks.length === 40 && long.risks.every((r) => r.risk.length <= 200), long.risks.length);

console.log('\n4. what is sent');
const u = A.userText(facts, 'A trip to the coast.');
ok('the counts the hub knows, then the leader’s words', /Children booked or expected: 30, of whom 6 under 8/.test(u) && /Leaders named: 5, of whom 4 have an in-date check/.test(u) && /one leader to 5 children, and one to 4 for under-8s/.test(u) && /A trip to the coast\.$/.test(u), u);
ok('   NO NAME: the facts carry counts only', !/Pat|Charlie|Robin|Jones/.test(u));
ok('   the words are cut to 4,000 characters', A.userText(facts, 'y'.repeat(5000)).split('\n').pop().length === 4000);
ok('the instructions never vary (so they can be cached), and ask for plain "must not" sentences', typeof A.SYSTEM === 'string' && /must not go ahead/i.test(A.SYSTEM) && !/\d{4}-\d{2}-\d{2}/.test(A.SYSTEM));
ok('the model is claude-sonnet-5-5', A.MODEL === 'claude-sonnet-5-5');
ok('the answer’s shape: every object closed (additionalProperties false), every field required', (() => { const objs = []; const walk = (s) => { if (s && s.type === 'object') { objs.push(s); Object.values(s.properties).forEach(walk); } if (s && s.items) walk(s.items); }; walk(A.SCHEMA); return objs.every((o) => o.additionalProperties === false && J(Object.keys(o.properties).sort()) === J([...o.required].sort())); })());
ok('the caps: 20 a day for the church and 5 a person, unless set', J(A.caps({})) === J({ perChurch: 20, perPerson: 5 }) && J(A.caps({ register: { ai: { perChurch: 3, perPerson: 1 } } })) === J({ perChurch: 3, perPerson: 1 }));
ok('the words for a refusal are Martin’s', A.WORDS.refused === 'The AI couldn’t draft this; write it from the template instead.');

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
