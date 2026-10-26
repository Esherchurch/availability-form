/* THE SAFEGUARDING RISK REGISTER, step 3: the live warnings' sums (F-265),
   with no emulator. Invented groups and events only.
     node screenshots/events/sg-warnings-unit.test.mjs */
import path from 'node:path';
import { createRequire } from 'node:module';

const V2 = path.resolve('.');
const require = createRequire(path.join(V2, 'functions', 'index.js'));
const W = require('./sg-warnings-core.cjs');
const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 500))); };
const J = (x) => JSON.stringify(x);

const TODAY = '2026-10-25'; /* a Sunday */
const ST = { ratioAll: 5, ratioUnder8: 4, dbsYears: 3, trainingYears: 3, dueSoonDays: 42 };
const ACTS = [{ id: 'act_jun', link: { type: 'kidsGroup', id: 'kg_jun' } }, { id: 'act_tod', link: { type: 'kidsGroup', id: 'kg_tod' } }];
const GROUPS = [{ id: 'kg_jun', name: 'Juniors (invented)', ratio: 8, leaderIds: ['m_a', 'm_b'] }, { id: 'kg_tod', name: 'Toddlers (invented)', ratio: 4, leaderIds: ['m_c'] }];
const inDate = { dbsStatus: 'seen', dbsSeen: '2025-01-10', trainingDate: '2025-02-01' };
const base = (x) => Object.assign({ today: TODAY, settings: ST, activities: ACTS, groups: GROUPS, childrenIn: {}, leadersIn: {}, events: [], leaderMids: [], checks: {}, consent: [], risks: [] }, x);
const find = (r, id) => r.items.find((i) => i.id === id);

console.log('\n1. Sunday groups this morning (check-ins against leaders in)');
let r = W.warningsFrom(base({ childrenIn: { kg_jun: 9 }, leadersIn: { kg_jun: 1 } }));
ok('9 children in with 1 leader in: red "Two adults are needed"', find(r, 'two_kg_jun') && find(r, 'two_kg_jun').level === 'red' && /9 children in, 1 leader in\. Two adults/.test(find(r, 'two_kg_jun').label), J(r.items));
ok('   and it colours the group’s two-adults control red', r.controls['act_jun|twoAdults'] === 'red', J(r.controls));
r = W.warningsFrom(base({ childrenIn: { kg_tod: 9 }, leadersIn: { kg_tod: 2 } }));
ok('9 toddlers in, 2 leaders, 1 to 4: amber, 3 needed', find(r, 'ratio_kg_tod') && find(r, 'ratio_kg_tod').level === 'amber' && /3 needed \(1 to 4\)/.test(find(r, 'ratio_kg_tod').label), J(r.items));
r = W.warningsFrom(base({ childrenIn: { kg_jun: 9 }, leadersIn: { kg_jun: 2 } }));
ok('9 juniors in, 2 leaders, 1 to 8: nothing', r.items.length === 0, J(r.items));
r = W.warningsFrom(base({ leadersIn: { kg_jun: 0 } }));
ok('no children in yet: nothing (the morning has not started)', r.items.length === 0, J(r.items));

console.log('\n2. under-18s events in the next 14 days');
const ev = (x) => Object.assign({ id: 'ev_x', title: 'Beach trip (invented)', day: '2026-10-27', children: 6, leaders: 1, needsSignoff: false, signedOff: true }, x);
r = W.warningsFrom(base({ events: [ev()] }));
ok('one leader named, two days on: red', find(r, 'two_ev_x') && find(r, 'two_ev_x').level === 'red' && /Tue 27 Oct: 1 leader named/.test(find(r, 'two_ev_x').label), J(r.items));
r = W.warningsFrom(base({ events: [ev({ day: '2026-11-04' })] }));
ok('one leader named, ten days on: amber', find(r, 'two_ev_x') && find(r, 'two_ev_x').level === 'amber', J(r.items));
r = W.warningsFrom(base({ events: [ev({ children: 14, leaders: 2 })] }));
ok('14 booked with 2 leaders at 1 to 5: the ratio, 3 needed', find(r, 'ratio_ev_x') && /3 needed/.test(find(r, 'ratio_ev_x').label) && !find(r, 'two_ev_x'), J(r.items));
r = W.warningsFrom(base({ events: [ev({ leaders: 2, needsSignoff: true, signedOff: false, day: '2026-10-30' })] }));
ok('a trip not signed off, five days on: red, bookings closed', find(r, 'sign_ev_x') && find(r, 'sign_ev_x').level === 'red' && /Bookings stay closed/.test(find(r, 'sign_ev_x').label), J(r.items));
r = W.warningsFrom(base({ events: [ev({ leaders: 2, needsSignoff: true, signedOff: false, day: '2026-11-06' })] }));
ok('   twelve days on: amber', find(r, 'sign_ev_x') && find(r, 'sign_ev_x').level === 'amber', J(r.items));
r = W.warningsFrom(base({ events: [ev({ day: '2026-11-20' }), ev({ id: 'ev_old', day: '2026-10-20' })] }));
ok('outside the 14 days, or past: nothing', r.items.length === 0, J(r.items));

console.log('\n3. checks (counts only)');
r = W.warningsFrom(base({ leaderMids: ['m_a', 'm_b', 'm_c'], checks: { m_a: inDate, m_b: { dbsStatus: 'seen', dbsSeen: '2023-01-01', trainingDate: '2025-01-01' }, m_c: { dbsStatus: 'seen', dbsSeen: '2023-11-20', trainingDate: '2025-06-01' } } }));
ok('one run out: red "1 leader ... has a check or training that is missing or has run out"', find(r, 'checks_out') && find(r, 'checks_out').count === 1 && find(r, 'checks_out').level === 'red', J(r.items));
ok('one due within 6 weeks: amber', find(r, 'checks_soon') && find(r, 'checks_soon').count === 1 && /within 6 weeks/.test(find(r, 'checks_soon').label), J(r.items));
ok('   and each group with such a leader: Juniors red, Toddlers amber', r.controls['act_jun|checks'] === 'red' && r.controls['act_tod|checks'] === 'amber', J(r.controls));
r = W.warningsFrom(base({ leaderMids: ['m_z'], checks: {} }));
ok('no check on record counts as missing', find(r, 'checks_out') && find(r, 'checks_out').count === 1, J(r.items));

console.log('\n4. consent forms, per group');
r = W.warningsFrom(base({ consent: [{ groupId: 'kg_jun', consentUntil: '2026-09-01' }, { groupId: 'kg_jun', consentUntil: '' }, { groupId: 'kg_jun', consentUntil: '2026-11-15' }, { groupId: 'kg_jun', consentUntil: '2027-09-01' }] }));
ok('two out (one never given): red, 2 children', find(r, 'consent_kg_jun') && find(r, 'consent_kg_jun').count === 2 && find(r, 'consent_kg_jun').level === 'red', J(r.items));
ok('one due soon: amber', find(r, 'consentsoon_kg_jun') && find(r, 'consentsoon_kg_jun').count === 1, J(r.items));
ok('   the group’s consent control red', r.controls['act_jun|consent'] === 'red', J(r.controls));

console.log('\n5. the register’s reviews, the order, the words');
r = W.warningsFrom(base({ risks: [{ id: 'r1', reviewDue: '2026-10-01', status: 'open' }, { id: 'r2', reviewDue: '2026-10-01', status: 'closed' }, { id: 'r3', reviewDue: '2027-01-01', status: 'open' }],
  childrenIn: { kg_jun: 9 }, leadersIn: { kg_jun: 1 }, events: [ev({ day: '2026-11-04' })] }));
ok('one open risk past review (a closed one is not counted): amber', find(r, 'review') && find(r, 'review').count === 1, J(r.items));
ok('reds before ambers', r.items.findIndex((i) => i.level === 'amber') > r.items.findIndex((i) => i.level === 'red') && r.items[0].level === 'red', J(r.items.map((i) => i.level)));
ok('every warning says what to do and where', r.items.every((i) => i.todo && i.fix), J(r.items));
r = W.warningsFrom(base({ childrenIn: { kg_jun: 9 }, leadersIn: { kg_jun: 1 }, events: [ev()], leaderMids: ['m_a'], checks: { m_a: { dbsSeen: '2020-01-01', trainingDate: '2020-01-01', name: 'Alice Leader' } },
  consent: [{ groupId: 'kg_jun', consentUntil: '', name: 'Charlie Child' }] }));
ok('COUNTS ONLY: no person’s name in any warning, even when one is in what it was given', !/Alice|Charlie|m_a\b/.test(J(r)), J(r));

console.log('\n6. the email two days before');
const WED = '2026-10-28';
let m = W.twoAdultsMails({ day: WED, settings: ST, events: [ev({ day: WED })], groups: [], sent: {} });
ok('an event that day with one leader: one email, "Two adults are needed"', m.length === 1 && m[0].key === 'ev_ev_x_' + WED && m[0].lines.some((l) => /Two adults/.test(l)) && /Wed 28 Oct/.test(m[0].subject), J(m));
m = W.twoAdultsMails({ day: WED, settings: ST, events: [ev({ day: WED, children: 14, leaders: 2 })], groups: [], sent: {} });
ok('two leaders for 14: still emailed, the ratio (3 needed)', m.length === 1 && m[0].lines.some((l) => /3 leaders are needed/.test(l)), J(m));
m = W.twoAdultsMails({ day: WED, settings: ST, events: [ev({ day: WED, children: 8, leaders: 2 })], groups: [], sent: {} });
ok('two leaders for 8: no email', m.length === 0, J(m));
m = W.twoAdultsMails({ day: WED, settings: ST, events: [ev({ day: WED })], groups: [], sent: { ['ev_ev_x_' + WED]: true } });
ok('already sent: not again', m.length === 0, J(m));
const SUN = '2026-11-01';
m = W.twoAdultsMails({ day: SUN, settings: ST, events: [], groups: [{ id: 'kg_tod', name: 'Toddlers (invented)', day: 7, leaderIds: ['m_c'] }, { id: 'kg_jun', name: 'Juniors (invented)', day: 7, leaderIds: ['m_a', 'm_b'] }], sent: {} });
ok('a Sunday group (day 7) with one regular leader, on a Sunday: emailed; one with two: not', m.length === 1 && m[0].key === 'kg_kg_tod_' + SUN, J(m));
m = W.twoAdultsMails({ day: WED, settings: ST, events: [], groups: [{ id: 'kg_tod', name: 'Toddlers (invented)', day: 7, leaderIds: ['m_c'] }, { id: 'kg_mid', name: 'Midweek (invented)', day: 3, leaderIds: [] }], sent: {} });
ok('on a Wednesday: only the Wednesday group (day 3)', m.length === 1 && m[0].key === 'kg_kg_mid_' + WED, J(m));
ok('   and no person’s name in it', !/m_c|m_a/.test(J(m)), J(m));

console.log('\n6b. hirers who work with children (counts only)');
const HR = (x) => Object.assign({ withChildren: true, booked: true, documents: [], name: 'Hilda Hirer', org: 'Toddler Music (invented)' }, x);
r = W.warningsFrom(base({ hirers: [HR()] }));
ok('booked in the next 30 days, no safeguarding policy: amber, 1, to the bookings page', find(r, 'hirers') && find(r, 'hirers').level === 'amber' && find(r, 'hirers').count === 1 && find(r, 'hirers').fix === 'bookings-admin.html'
  && /1 hirer who works with children is booked in the next 30 days with no safeguarding policy in date on file\./.test(find(r, 'hirers').label), J(r.items));
ok('   and it marks the "hirer’s safeguarding policy" control', r.controls['*|hirerDocs'] === 'amber', J(r.controls));
r = W.warningsFrom(base({ hirers: [HR({ documents: [{ kind: 'safeguarding', expires: '2026-09-30' }] }), HR({ documents: [{ kind: 'insurance', expires: '2027-09-30' }] })] }));
ok('a policy that has run out, or only insurance on file: both counted (2)', find(r, 'hirers') && find(r, 'hirers').count === 2, J(r.items));
r = W.warningsFrom(base({ hirers: [HR({ documents: [{ kind: 'safeguarding', expires: '2027-09-30' }] }), HR({ documents: [{ kind: 'safeguarding', expires: '' }] }), HR({ booked: false }), HR({ withChildren: false })] }));
ok('in date, no expiry date, not booked, or not working with children: nothing', !find(r, 'hirers'), J(r.items));
ok('   NO HIRER’S NAME in the warning', !/Hilda|Toddler Music/.test(J(W.warningsFrom(base({ hirers: [HR()] })))));

console.log('\n6c. no trained paediatric first aider (the checklist says "No")');
r = W.warningsFrom(base({ events: [ev({ leaders: 3, day: '2026-11-01', paed: 'amber' }), ev({ id: 'ev_y', leaders: 3, day: '2026-11-02', paed: 'red' })] }));
ok('amber; red when under-8s go; with what to do', find(r, 'paed_ev_x') && find(r, 'paed_ev_x').level === 'amber' && find(r, 'paed_ev_y').level === 'red' && /no trained paediatric first aider with the group, and children under 8 are going\./.test(find(r, 'paed_ev_y').label) && /paediatric first aider/.test(find(r, 'paed_ev_y').todo), J(r.items));
ok('   read from the answer: "No: ..." only', W.paedLevel({ paedFirstAid: 'No: none yet' }, {}) === 'amber' && W.paedLevel({ paedFirstAid: 'No: none yet' }, { under8: true }) === 'red' && W.paedLevel({ paedFirstAid: 'Yes: the deputy' }, { under8: true }) === '' && W.paedLevel({}, {}) === '');

console.log('\n6d. the checklist’s other flags: no male and female leader; the cover (F-280 (b), (d))');
const CKS = require('./sg-checklist.cjs'), fl = CKS.answerFlags({ mixedLeaders: 'No: two men this time', insurance: '£250,000: x' }, {}).filter((f) => f.id !== 'paedFirstAid');
r = W.warningsFrom(base({ events: [ev({ leaders: 3, day: '2026-11-01', flags: fl })] }));
ok('each is a warning, amber, with what to do, and nobody’s sex in it', find(r, 'mixedLeaders_ev_x') && find(r, 'mixedLeaders_ev_x').level === 'amber' && /no male and female leader for a mixed group\./.test(find(r, 'mixedLeaders_ev_x').label) && /a man and a woman/.test(find(r, 'mixedLeaders_ev_x').todo)
  && find(r, 'insurance_ev_x') && /public liability cover under £1 million\./.test(find(r, 'insurance_ev_x').label) && /record the amount/.test(find(r, 'insurance_ev_x').todo) && !/two men/.test(J(r.items)), J(r.items));

console.log('\n7. THE DIALS (step 4)');
const DB = (x) => Object.assign({ today: TODAY, settings: ST, groups: GROUPS, leaderMids: [], checks: {}, sessions: [], consent: [], assess: [], review: null, incidents: [] }, x);
const mids = (n, c) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['m' + i, c]));
let dl = W.dialsFrom(DB({ leaderMids: Object.keys(mids(20, inDate)), checks: mids(20, inDate) })).dials;
ok('checks: 20 of 20 in date is 100%, green', dl.checks.pct === 100 && dl.checks.rag === 'green' && dl.checks.value === 20, J(dl.checks));
const ch = Object.assign(mids(20, inDate), { m19: { dbsStatus: 'seen', dbsSeen: '2020-01-01', trainingDate: '2020-01-01' } });
dl = W.dialsFrom(DB({ leaderMids: Object.keys(ch), checks: ch })).dials;
ok('   19 of 20 is 95%: still green (at the threshold)', dl.checks.pct === 95 && dl.checks.rag === 'green' && dl.checks.parts.out === 1, J(dl.checks));
ch.m18 = ch.m19; ch.m17 = ch.m19; ch.m16 = ch.m19;
dl = W.dialsFrom(DB({ leaderMids: Object.keys(ch), checks: ch })).dials;
ok('   16 of 20 is 80%: red (below 85)', dl.checks.pct === 80 && dl.checks.rag === 'red', J(dl.checks));
dl = W.dialsFrom(DB({ settings: Object.assign({}, ST, { dials: { checks: { g: 90, a: 75 } } }), leaderMids: Object.keys(ch), checks: ch })).dials;
ok('   THRESHOLDS FROM SETTINGS: green 90, amber 75 makes 80% amber', dl.checks.rag === 'amber', J(dl.checks));
const soonCk = { dbsStatus: 'seen', dbsSeen: '2023-11-20', trainingDate: '2025-06-01' };
dl = W.dialsFrom(DB({ leaderMids: ['m_a', 'm_c'], checks: { m_a: inDate, m_c: soonCk } })).dials;
ok('   one running out within 6 weeks counts as in date, shown apart', dl.checks.value === 2 && dl.checks.parts.soon === 1 && dl.checks.parts.ok === 1, J(dl.checks));
ok('   amber can’t be set stricter than green', J(W.thresholds({ dials: { consent: { g: 80, a: 90 } } }).consent) === J({ g: 80, a: 80 }));
dl = W.dialsFrom(DB({ sessions: [{ groupId: 'kg_jun', day: '2026-10-18', children: 12, leaders: 2 }, { groupId: 'kg_tod', day: '2026-10-18', children: 9, leaders: 2 }, { groupId: 'kg_jun', day: '2026-10-11', children: 0, leaders: 0 }] })).dials;
ok('sessions: Juniors 12 with 2 (1 to 8) met; Toddlers 9 with 2 (1 to 4) short; an empty one not counted', dl.sessions.value === 1 && dl.sessions.of === 2 && dl.sessions.rag === 'red', J(dl.sessions));
const sl = W.dialsFrom(DB({ sessions: [{ groupId: 'kg_jun', day: '2026-10-18', children: 3, leaders: 1 }] }));
ok('   one adult with three children is short (two adults)', sl.dials.sessions.value === 0 && sl.sessions[0].need === 2 && sl.sessions[0].ok === false, J(sl.sessions));
ok('   the sessions list: group, date and numbers only', J(Object.keys(sl.sessions[0]).sort()) === J(['children', 'day', 'group', 'leaders', 'need', 'ok']), J(sl.sessions[0]));
dl = W.dialsFrom(DB({ consent: [{ groupId: 'kg_jun', consentUntil: '2027-09-01' }, { groupId: 'kg_jun', consentUntil: '' }, { groupId: 'kg_tod', consentUntil: '2026-11-15' }] }));
ok('consent: 2 of 3 in date (one running out), 66%, red', dl.dials.consent.value === 2 && dl.dials.consent.pct === 66 && dl.dials.consent.parts.soon === 1 && dl.dials.consent.rag === 'red', J(dl.dials.consent));
ok('   per group, counts only', J(dl.consentByGroup) === J([{ group: 'Juniors (invented)', ok: 1, soon: 0, out: 1 }, { group: 'Toddlers (invented)', ok: 0, soon: 1, out: 0 }]), J(dl.consentByGroup));
dl = W.dialsFrom(DB({ assess: [{ signed: true }, { signed: true }, { signed: true }, { signed: true }, { signed: false }] })).dials;
ok('assessments: 4 of 5 signed is 80%: amber (100 is green)', dl.assess.pct === 80 && dl.assess.rag === 'amber', J(dl.assess));
dl = W.dialsFrom(DB({ incidents: [{ created: '2026-10-01', followed: false }, { created: '2026-10-20', followed: false }, { created: '2026-09-01', followed: true }, { created: '2025-12-01', followed: false }] })).dials;
ok('incidents: open means no follow-up after 7 days (the 5-day-old one isn’t yet); last year’s not counted', dl.incidents.value === 1 && dl.incidents.of === 3 && dl.incidents.oldestDays === 24 && dl.incidents.rag === 'amber', J(dl.incidents));
dl = W.dialsFrom(DB({ incidents: [1, 2, 3].map(() => ({ created: '2026-09-01', followed: false })) })).dials;
ok('   three open: red (amber is up to 2)', dl.incidents.rag === 'red', J(dl.incidents));
dl = W.dialsFrom(DB({})).dials;
ok('NOTHING ON FILE is an empty dial at 0 ("none"), not red', ['checks', 'sessions', 'consent', 'assess'].every((k) => dl[k].rag === 'none' && dl[k].value === 0 && dl[k].of === 0), J(dl));
dl = W.dialsFrom(DB({ unread: { consent: 'Not a zero: the children’s records could not be read just now.' } })).dials;
ok('COULD NOT BE READ is never a zero: no figure, and why', dl.consent.rag === 'unread' && dl.consent.value === null && /Not a zero/.test(dl.consent.why), J(dl.consent));
const busy = W.dialsFrom(DB({ leaderMids: ['m_a'], checks: { m_a: Object.assign({ name: 'Alice Leader' }, inDate) }, consent: [{ groupId: 'kg_jun', consentUntil: '', name: 'Charlie Child' }],
  incidents: [{ created: '2026-10-01', followed: false, people: 'Charlie Child', what: 'Fell over' }], concerns: [{ concern: 'Worried about Charlie' }] }));
ok('COUNTS ONLY: no name, and nothing of an incident’s words or a concern, even when given', !/Alice|Charlie|Fell over|Worried/.test(J(busy)), J(busy));
ok('CONCERNS ARE NOT COUNTED on any dial', !('concerns' in busy.dials) && J(Object.keys(busy.dials).sort()) === J(['assess', 'checks', 'consent', 'incidents', 'review', 'sessions']));

console.log('\n8. the annual review');
const rec = (id, at, na) => ({ itemId: id, at, na: !!na });
let rv = W.reviewFrom({ records: [], lastYear: [], today: TODAY });
ok('nothing yet, no last year: not started, 0 of 8, amber', rv.status === 'notstarted' && rv.done === 0 && rv.of === 8 && rv.rag === 'amber', J(rv));
rv = W.reviewFrom({ records: [rec('leads', '2026-03-01'), rec('hirers', '2026-03-01', true)], lastYear: [rec('leads', '2025-02-01'), rec('policy', '2025-03-10')], today: TODAY });
ok('a "does not apply" item is not counted: 1 of 7', rv.done === 1 && rv.of === 7 && J(rv.na) === J(['hirers']), J(rv));
ok('   OVERDUE a year after last year’s review (10 Mar 2025): red', rv.status === 'overdue' && rv.rag === 'red' && rv.due === '2026-03-10', J(rv));
rv = W.reviewFrom({ records: W.REVIEW_ITEMS.map((i) => rec(i.id, '2026-04-01')), lastYear: [], today: TODAY });
ok('every item on file: done, green', rv.status === 'done' && rv.rag === 'green' && rv.done === 8, J(rv));
rv = W.reviewFrom({ records: [rec('leads', '2026-03-01', true)], lastYear: [], today: TODAY });
ok('   only the optional items can be marked "does not apply"', rv.na.length === 0 && rv.done === 1, J(rv));
const vmod = { exports: {} };
(await import('node:vm')).runInNewContext((await import('node:fs')).readFileSync(path.join(V2, 'egbc-ra-core.js'), 'utf8') + '\n' + (await import('node:fs')).readFileSync(path.join(V2, 'egbc-sg-templates.js'), 'utf8'), { module: vmod });  /* the shared engine first (H&S step 1) */
ok('the page’s review items match the server’s (ids, who, optional)', J(vmod.exports.REVIEW_ITEMS.map((i) => [i.id, i.who, !!i.optional])) === J(W.REVIEW_ITEMS.map((i) => [i.id, i.who, !!i.optional])), J(vmod.exports.REVIEW_ITEMS.map((i) => i.id)));

console.log('\n8. the other checks (S3): the barred list, a reference, the declaration - counts only');
const full = { dbsStatus: 'current', dbsSeen: '2026-01-10', trainingDate: '2026-01-10', dbsLevel: 'enhancedBarred', referenceDate: '2026-01-01', declarationDate: '2026-01-01' };
r = W.warningsFrom(base({ leaderMids: ['m_a', 'm_b', 'm_c'], checks: { m_a: full, m_b: Object.assign({}, full, { dbsLevel: 'enhanced', referenceDate: '' }), m_c: Object.assign({}, full, { dbsLevel: '', declarationDate: '2020-01-01' }) } }));
ok('2 without the barred list (one Enhanced only, one not recorded), 1 without a reference, 1 with a declaration out of date: amber, with what to do',
  find(r, 'checks_level') && find(r, 'checks_level').count === 2 && find(r, 'checks_level').level === 'amber' && /2 leaders on under-18s groups and events without an Enhanced check with the children’s barred list recorded\./.test(find(r, 'checks_level').label) && /level of each leader/.test(find(r, 'checks_level').todo)
  && find(r, 'checks_reference') && find(r, 'checks_reference').count === 1 && find(r, 'checks_declaration') && find(r, 'checks_declaration').count === 1, J(r.items));
ok('   counts only: no name or member id in any of them', !/m_a|m_b|m_c/.test(J(r.items.filter((i) => /checks_(level|reference|declaration)/.test(i.id)))));
r = W.warningsFrom(base({ leaderMids: ['m_a'], checks: { m_a: full } }));
ok('   all three in order: none of them', !find(r, 'checks_level') && !find(r, 'checks_reference') && !find(r, 'checks_declaration'), J(r.items));

console.log('\n9. S4: still to do past its date; signed off but not noted by the trustees');
const C4 = require('./sg-checklist.cjs');
const fl4 = [];
const td4 = C4.todoState([{ rl: 2, ri: 2, todo: [{ what: 'x', who: 'Ann', by: '2026-10-01' }, { what: 'y', who: 'Ann', by: '2026-10-02' }] }], '2026-10-26');
if (td4.overdue) fl4.push({ id: 'todoOverdue', level: 'amber', words: td4.overdue + ' still-to-do ' + (td4.overdue === 1 ? 'action is' : 'actions are') + ' past their date' });
fl4.push({ id: 'noted', level: 'amber', words: 'Signed off, but the trustees have not noted it yet' });
r = W.warningsFrom(base({ events: [ev({ leaders: 3, day: '2026-11-01', flags: fl4 })] }));
ok('both amber, with what to do: "2 still-to-do actions are past their date"; "Signed off, but the trustees have not noted it yet"', find(r, 'todoOverdue_ev_x') && /2 still-to-do actions are past their date\./.test(find(r, 'todoOverdue_ev_x').label) && /new date/.test(find(r, 'todoOverdue_ev_x').todo)
  && find(r, 'noted_ev_x') && find(r, 'noted_ev_x').level === 'amber' && /trustees have not noted it yet\./.test(find(r, 'noted_ev_x').label) && /noted/.test(find(r, 'noted_ev_x').todo), J(r.items));

console.log('\n10. S5: look at a standing risk again - an incident on its activity since its last review; the group’s size changed a lot');
const RR = (x) => W.reReview(Object.assign({ settings: {} }, x));
const RK = (id, extra) => Object.assign({ id, activityId: 'act_j', status: 'open', reviewedAt: '2026-10-01T10:00:00Z', sizeAtReview: 12 }, extra || {});
ok('an incident on the activity after the last review: prompted, with its date', J(RR({ risks: [RK('r1')], incidents: [{ activityId: 'act_j', created: '2026-10-05T09:00:00Z' }] })) === J({ r1: { incident: '2026-10-05', size: null } }));
ok('   one before the last review, or on another activity, or not linked: none', J(RR({ risks: [RK('r1')], incidents: [{ activityId: 'act_j', created: '2026-09-30T09:00:00Z' }, { activityId: 'act_x', created: '2026-10-05T00:00:00Z' }, { activityId: '', created: '2026-10-05T00:00:00Z' }] })) === J({}));
ok('   the same day, but after the review: prompted (the time counts, not just the day)', !!RR({ risks: [RK('r1')], incidents: [{ activityId: 'act_j', created: '2026-10-01T11:00:00Z' }] }).r1);
ok('the group from 12 to 16 (a third): prompted; 12 to 14: not (the setting, a quarter)', J(RR({ risks: [RK('r1')], sizes: { act_j: 16 } })) === J({ r1: { incident: '', size: [12, 16] } }) && J(RR({ risks: [RK('r1')], sizes: { act_j: 14 } })) === J({}));
ok('   a church’s own setting (10%): 12 to 14 is prompted', !!RR({ settings: { resizePct: 10 }, risks: [RK('r1')], sizes: { act_j: 14 } }).r1);
ok('   no size kept at review, or a closed risk: none', J(RR({ risks: [RK('r1', { sizeAtReview: undefined }), RK('r2', { status: 'closed' })], sizes: { act_j: 40 }, incidents: [{ activityId: 'act_j', created: '2026-10-05T00:00:00Z' }] })) === J({ r1: { incident: '2026-10-05', size: null } }));
r = W.warningsFrom(base({ risks: [RK('r1'), RK('r2', { activityId: 'act_k' })], incidents: [{ activityId: 'act_j', created: '2026-10-05T00:00:00Z' }], sizes: { act_k: 30 } }));
ok('THE WARNINGS: one each, amber, counts only - "1 risk to look at again: an incident on that activity …", "… the group has changed size by 25% or more …"', find(r, 'reviewIncident') && find(r, 'reviewIncident').level === 'amber' && /^1 risk to look at again: an incident on that activity since it was last reviewed\.$/.test(find(r, 'reviewIncident').label)
  && find(r, 'reviewSize') && /the group has changed size by 25% or more since it was last reviewed\./.test(find(r, 'reviewSize').label) && J(r.prompts) === J({ r1: { incident: '2026-10-05', size: null }, r2: { incident: '', size: [12, 30] } }), J(r.items));

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
