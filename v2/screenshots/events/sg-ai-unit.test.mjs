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
const long = A.normalise(Object.assign({}, good, { hazards: Array.from({ length: 250 }, () => H({ hazard: 'x'.repeat(400) })) }), facts);
ok('the rules’ shape: 200 risks at most (what one record holds), 200 characters each', long.ok && long.risks.length === 200 && A.MAX.risks === 200 && long.risks.every((r) => r.risk.length <= 200), long.risks.length);

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

console.log('\n5. THE REQUIRED CHECKLIST (Martin, 23 Oct): the page, the server and the rules agree');
const fsm = await import('node:fs'), vmm = await import('node:vm');
const tmod = { exports: {} };
vmm.runInNewContext(fsm.readFileSync(path.join(V2, 'egbc-ra-core.js'), 'utf8') + '\n' + fsm.readFileSync(path.join(V2, 'egbc-sg-templates.js'), 'utf8'), { module: tmod });  /* the shared engine first (H&S step 1) */
const TP = tmod.exports, CK = require('./sg-checklist.cjs');
ok('the server’s copy has the same questions, word for word, as the page’s', J(Object.keys(TP.CHECKLIST).map((k) => [k, TP.CHECKLIST[k].map((q) => [q.id, q.label])])) === J(Object.keys(CK.CHECKLIST).map((k) => [k, CK.CHECKLIST[k].map((q) => [q.id, q.label])])));
const rulesSrc = fsm.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), fnSrc = (rulesSrc.match(/function sgChecklist\(kind, flags\) \{[\s\S]*?\n    \}/) || [''])[0];
const idsIn = (re) => ((fnSrc.match(re) || [, ''])[1].match(/'([A-Za-z]+)'/g) || []).map((x) => x.replace(/'/g, ''));
ok('THE RULES require the same ids: the core', J(idsIn(/return \[([^\]]*)\]/)) === J(TP.CHECKLIST.core.map((q) => q.id)), J(idsIn(/return \[([^\]]*)\]/)));
ok('   overnight, holiday club, off-site', ['overnight', 'holidayclub', 'offsite'].every((k) => J(idsIn(new RegExp("kind == '" + k + "' \\? \\[([^\\]]*)\\]"))) === J(TP.CHECKLIST[k].map((q) => q.id))));
ok('   overseas, and water, heights or adventurous', ['abroad', 'adventurous'].every((k) => J(idsIn(new RegExp("flags.get\\('" + k + "', false\\) == true \\? \\[([^\\]]*)\\]"))) === J(TP.CHECKLIST[k].map((q) => q.id))));
ok('   A CAMP OR FESTIVAL: its own questions, then the overnight ones (F-280 10.1)', J(idsIn(/kind == 'camp' \? \[([^\]]*)\]/)) === J(TP.CHECKLIST.camp.concat(TP.CHECKLIST.overnight).map((q) => q.id)), J(idsIn(/kind == 'camp' \? \[([^\]]*)\]/)));
ok('   and the rules need its sign-off as for the other kinds', /ev\.get\('sgKind', ''\) in \['trip', 'overnight', 'holidayclub', 'offsite', 'camp'\]/.test(rulesSrc) && J(CK.SG_KINDS) === J(TP.SG_KINDS) && J(TP.SG_KINDS) === J(['trip', 'overnight', 'holidayclub', 'offsite', 'camp']));
ok('a trip asks 18; an overnight 22; a camp 33 (with the overnight 4); overseas adds 7; a church question and a host’s are added', TP.checklistFor('trip', {}).length === 18 && TP.checklistFor('overnight', {}).length === 22 && TP.checklistFor('camp', {}).length === 33 && CK.checklistFor('camp', {}).length === 33 && TP.checklistFor('trip', { abroad: true }).length === 25 && TP.checklistFor('trip', {}, [{ id: 'c_1', q: 'Ours?' }, { id: 'h_1', q: 'Theirs?', group: 'host' }]).length === 20);
ok('the paediatric first aider is asked for every kind, as Yes or No', TP.SG_KINDS.every((k) => TP.checklistFor(k, {}).some((q) => q.id === 'paedFirstAid' && q.yesNo)));
ok('EVERY EVENT: behaviour, accessibility, visitors, and "a male and a female leader" (Yes, No, or not a mixed group)', TP.SG_KINDS.every((k) => ['behaviour', 'accessibility', 'visitors', 'mixedLeaders'].every((id) => TP.checklistFor(k, {}).some((q) => q.id === id)))
  && TP.CHECKLIST.core.find((q) => q.id === 'mixedLeaders').naLabel === 'Not a mixed group');
const tlabel = TP.CHECKLIST.core.find((q) => q.id === 'transport').label;
ok('   transport asks roadworthiness, drivers’ hours and a minibus licence (D1 or a permit)', /MOT/.test(tlabel) && /drivers’ hours and rest breaks/.test(tlabel) && /D1, or a permit/.test(tlabel), tlabel);
const FX = { paedFirstAid: 'No: none yet', mixedLeaders: 'No: two men', insurance: '£500,000: the church’s policy' };
ok('THE FLAGS: no male and female leader, amber; cover under £1 million, amber; the page and the server agree', J(TP.answerFlags(FX, { under8: true })) === J(CK.answerFlags(FX, { under8: true }))
  && J(TP.answerFlags(FX, { under8: true }).map((f) => f.id + ':' + f.level)) === J(['paedFirstAid:red', 'mixedLeaders:amber', 'insurance:amber']) && (TP.answerFlags(FX, {})[2] || {}).words === 'Public liability cover under £1 million', J(TP.answerFlags(FX, { under8: true })));
ok('   none for "Yes", "not a mixed group", £5 million; the cover not given is amber; the church’s own minimum counts', TP.answerFlags({ paedFirstAid: 'Yes: x', mixedLeaders: 'N/A: Not a mixed group', insurance: '£5,000,000: x' }, {}).length === 0
  && (TP.answerFlags({ insurance: 'Covered, the office checked' }, {})[0] || {}).words === 'The public liability cover isn’t given' && (TP.answerFlags({ insurance: '£5,000,000: x' }, {}, 10000000)[0] || {}).words === 'Public liability cover under £10 million');
ok('   a cover amount alone is not an answer; "N/A: Not a mixed group" is', !TP.answered('£5,000,000: ') && TP.answered('£5,000,000: Ecclesiastical') && TP.answered('N/A: Not a mixed group'));
ok('THE CHURCH’S OWN GUIDANCE goes to the AI by name (and nothing when it isn’t set); a camp is called one', /- The church follows this safeguarding guidance: The Diocese of Testbury’s guidance \(invented\)\. Where it applies, keep to it\./.test(A.userText({ guidance: 'The Diocese of Testbury’s guidance (invented)', kind: 'camp' }, 'x', []))
  && !/follows this safeguarding guidance/.test(A.userText({ kind: 'trip' }, 'x', [])) && /Kind of event: a camp or festival \(tents\)/.test(A.userText({ kind: 'camp' }, 'x', [])));
ok('THE CHURCH’S TITLE for its safeguarding lead goes to the AI (S2b), and nothing when it isn’t set', A.userText({ leadTitle: 'Parish safeguarding officer', kind: 'trip' }, 'x', []).includes('- The church calls its safeguarding lead "Parish safeguarding officer": use that title wherever you would say safeguarding lead.')
  && !/calls its safeguarding lead/.test(A.userText({ kind: 'trip' }, 'x', [])));
const gen = fsm.readFileSync(path.join(V2, 'functions', 'sg-checklist.cjs'), 'utf8');
ok('the server’s copy is generated from the page’s (sg-checklist-gen.mjs has been run)', /GENERATED by screenshots\/events\/sg-checklist-gen\.mjs/.test(gen) && J(CK.CHECKLIST) === J(TP.CHECKLIST) && J(CK.ALSO) === J(TP.ALSO));
ok('   "No" is amber, red when under-8s go; the server and the page agree', TP.paedFlag({ paedFirstAid: 'No: not yet' }, {}) === 'amber' && TP.paedFlag({ paedFirstAid: 'No: not yet' }, { under8: true }) === 'red' && TP.paedFlag({ paedFirstAid: 'Yes: the deputy' }, { under8: true }) === ''
  && require('./sg-warnings-core.cjs').paedLevel({ paedFirstAid: 'No: x' }, { under8: true }) === 'red');
ok('an answer counts: words, "N/A: <reason>", "Yes: <who>"; not "N/A: ", "No: " or nothing', TP.answered('x') && TP.answered('N/A: we walk') && TP.answered('Yes: Sam') && !TP.answered('N/A: ') && !TP.answered('No: ') && !TP.answered(''));

console.log('\n6. the AI and the checklist');
const ckList = CK.checklistFor('trip', {});
ok('the checklist goes with the counts, each question with its id', /The required checklist \(id: question\):/.test(A.userText(facts, 'x', ckList)) && /- insurance: Insurance:/.test(A.userText(facts, 'x', ckList)) && /- paedFirstAid: Is there a trained paediatric first aider/.test(A.userText(facts, 'x', ckList)));
ok('the instructions: cover every topic, suggest only what the description says, a paediatric first aider at least Medium', /cover every topic/.test(A.SYSTEM) && /never invent facts/.test(A.SYSTEM) && /paediatric first aider is essential/.test(A.SYSTEM));
const withAns = A.normalise(Object.assign({}, good, { answers: [{ id: 'insurance', answer: 'Covered, the office checked' }, { id: 'nonsense', answer: 'x' }, { id: 'contacts', answer: 'Ring 07700 900123' }], flags: { abroad: true, adventurous: false } }), Object.assign({}, facts, { leaders: 6, checklistIds: ckList.map((q) => q.id) }));
ok('SUGGESTIONS only for the checklist’s questions, never with a phone number', J(withAns.suggest) === J({ insurance: 'Covered, the office checked' }), J(withAns.suggest));
ok('   and the ticks it sees (overseas)', withAns.flags.abroad === true && withAns.flags.adventurous === false);
const none = A.hubRisks({ children: 0, leaders: 0, ratioAll: 5, ratioUnder8: 4 });
ok('NOTHING BOOKED AND NOBODY NAMED: the hub says the ratio can’t be checked (never silent), amber, not "must not"', none.length === 1 && /No children booked and no leaders named yet: the ratio can’t be checked/.test(none[0].risk) && !none[0].mustNot && A.rating(none[0].rl, none[0].ri) === 'amber', J(none));
ok('   leaders named but nobody booked: says that', /No children booked yet/.test((A.hubRisks({ children: 0, leaders: 3, ratioAll: 5 })[0] || {}).risk || ''));

console.log('\n7. the host’s requirements');
const RQ = require('./sg-requirements-core.cjs');
ok('what it reads: PDF, Word, pictures; nothing else', RQ.fileKind('application/pdf', 'a.pdf') === 'pdf' && RQ.fileKind('', 'Camp list.docx') === 'docx' && RQ.fileKind('image/png', 'scan.png') === 'image' && RQ.fileKind('application/zip', 'x.zip') === '' && RQ.fileKind('text/html', 'x.html') === '');
const { makeZip } = await import('../../converter/pptx.mjs');
const docx = makeZip([['[Content_Types].xml', '<Types/>'], ['word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Groups must bring a signed code of conduct.</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Lights out at 10pm &amp; no </w:t></w:r><w:r><w:t>phones after.</w:t></w:r></w:p></w:body></w:document>']]);
ok('A WORD DOCUMENT’s words, a paragraph a line', RQ.docxText(docx) === 'Groups must bring a signed code of conduct.\nLights out at 10pm & no phones after.', J(RQ.docxText(docx)));
ok('   not a Word document: refused', (() => { try { RQ.docxText(Buffer.from('not a zip at all, just words')); return false; } catch (e) { return true; } })());
ok('a PDF goes as a document, a scan as an image, Word as its words', RQ.contentFor('pdf', 'QUJD', '', 'application/pdf')[0].type === 'document' && RQ.contentFor('image', 'QUJD', '', 'image/png')[0].source.media_type === 'image/png' && /code of conduct/.test(RQ.contentFor('docx', '', RQ.docxText(docx), RQ.DOCX)[0].text));
const nr = RQ.normaliseReqs({ host: 'Hilltop Camp', personalFound: false, items: [{ question: 'Has every leader signed the camp’s code of conduct?', line: 'Groups must bring a signed code of conduct.' }, { question: 'Has the group leader rung Jo on 07700 900123?', line: 'Ring Jo on 07700 900123' }, { question: 'Will Charlie Jones have her inhaler?', line: '' }, { question: ' ', line: 'x' }] }, ['Charlie Jones']);
ok('NAMES, PHONE NUMBERS: those questions are left out, counted, and it says so', nr.ok && nr.items.length === 1 && nr.dropped === 2 && nr.personalFound === true && nr.host === 'Hilltop Camp', J(nr));
ok('the instructions: one question each, the line it came from, never a name, phone or email', /One question for each separate requirement/.test(RQ.REQ_SYSTEM) && /Never put a person’s name, phone number, email address/.test(RQ.REQ_SYSTEM));

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
