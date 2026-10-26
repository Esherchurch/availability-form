/* THE SAFEGUARDING RISK REGISTER (F-265): the starter lists and the rating,
   with no emulator.
     node screenshots/events/sg-register-unit.test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const V2 = path.resolve('.');
const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 500))); };
const J = (x) => JSON.stringify(x);
const module = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(V2, 'egbc-sg-templates.js'), 'utf8'), { module });
const T = module.exports;

console.log('\nthe rating (likelihood x impact; the same bands as risk.html)');
ok('5 x 3 = 15 is high (red)', T.rating(5, 3) === 'red');
ok('3 x 4 = 12 is medium (amber); 1 x 5 = 5 is medium', T.rating(3, 4) === 'amber' && T.rating(1, 5) === 'amber');
ok('2 x 2 = 4 and 1 x 1 are low (green)', T.rating(2, 2) === 'green' && T.rating(1, 1) === 'green');

console.log('\nthe starter lists');
const kinds = T.KINDS.map(k => k.id), ctl = T.CONTROLS.map(c => c.id).concat(['text']);
ok('every kind of activity has a list (possibly empty), and every list a kind', kinds.every(k => Array.isArray(T.STARTERS[k])) && Object.keys(T.STARTERS).every(k => kinds.includes(k)), J(Object.keys(T.STARTERS)));
const all = [].concat(...Object.values(T.STARTERS));
const ids = all.map(s => s.id);
ok('every starter has its own id (40 characters at most)', new Set(ids).size === ids.length && ids.every(i => i && i.length <= 40), J(ids));
const bad = all.filter(s => !(s.risk && s.risk.length <= 200 && (s.who || '').length <= 120 && [s.l, s.i, s.rl, s.ri].every(n => Number.isInteger(n) && n >= 1 && n <= 5)
  && Array.isArray(s.controls) && s.controls.length >= 1 && s.controls.length <= 20 && s.controls.every(c => ctl.includes(c.kind) && (c.text || '').length <= 200 && (c.kind !== 'text' || c.text))));
ok('every starter fits the rules’ shape: words in their lengths, ratings 1 to 5, 1 to 20 controls of known kinds', bad.length === 0, J(bad.map(s => s.id)));
ok('after the controls a risk is never rated worse than before', all.every(s => T.score(s.rl, s.ri) <= T.score(s.l, s.i)), J(all.filter(s => T.score(s.rl, s.ri) > T.score(s.l, s.i)).map(s => s.id)));
ok('the children’s and youth groups’ lists cover ratios, checks and two adults', ['ratio', 'checks', 'twoAdults'].every(k => [].concat(T.STARTERS.sunday, T.STARTERS.youth).some(s => s.controls.some(c => c.kind === k))));
const words = J(T);
ok('FOR ANY CHURCH: no church’s name, team names or any body’s name in the lists', !/EGBC|Esher|Kids Church|Lazers|ReNu|Youth Worship|Elders|Thirtyone|31:8|CCPAS|NSPCC/i.test(words), (words.match(/EGBC|Esher|Kids Church|Lazers|ReNu|Youth Worship|Elders|Thirtyone|31:8|CCPAS|NSPCC/i) || [])[0]);
ok('NO CHILD’S NAME OR MEDICAL DETAIL in any starter (general words only)', !/\b(epilep|diabet|asthma|autis|ADHD|EpiPen)\w*/i.test(words), (words.match(/\b(epilep|diabet|asthma|autis|ADHD|EpiPen)\w*/i) || [])[0]);
console.log('\nthe event templates (step 2)');
const ET = T.EVENT_TEMPLATES, EK = T.EVENT_KINDS.map(k => k.id);
ok('a template for each kind of event that needs sign-off: trip, overnight, holiday club, off-site, camp or festival', J(EK) === J(['trip', 'overnight', 'holidayclub', 'offsite', 'camp']) && J(T.SG_KINDS) === J(EK) && EK.every(k => ET[k] && ET[k].questions.length && ET[k].risks.length));
const evAdmin = fs.readFileSync(path.join(V2, 'events-admin.html'), 'utf8'), evJs = fs.readFileSync(path.join(V2, 'egbc-events.js'), 'utf8');
ok('   every page that lists the kinds has the camp: events-admin (the choice, and when it needs sign-off) and the shared events code', evAdmin.includes("['camp', 'A camp or festival']") && evAdmin.includes("['trip', 'overnight', 'holidayclub', 'offsite', 'camp'].indexOf(CUR.sgKind") && evJs.includes("SG_KINDS = ['trip', 'overnight', 'holidayclub', 'offsite', 'camp']"));
const eqs = [].concat(...EK.map(k => ET[k].questions)), ers = [].concat(...EK.map(k => ET[k].risks));
ok('each fits the rules: at most 80 questions (the answers the rules allow) and 40 risks, every risk rated 1 to 5 with its controls', EK.every(k => ET[k].questions.length <= 80 && ET[k].risks.length <= 40)
  && ers.every(r => r.risk.length <= 200 && [r.l, r.i, r.rl, r.ri].every(n => Number.isInteger(n) && n >= 1 && n <= 5) && r.controls.length >= 1 && r.controls.every(c => ctl.includes(c.kind))), J(ers.filter(r => !r.controls.length).map(r => r.id)));
ok('  question ids are unique within each template', EK.every(k => new Set(ET[k].questions.map(q => q.id)).size === ET[k].questions.length));
ok('  the trip covers getting lost, travel and ratios; the overnight two adults at night', ['trp-lost', 'trp-travel', 'trp-ratio'].every(id => ET.trip.risks.some(r => r.id === id)) && ET.overnight.risks.some(r => r.controls.some(c => c.kind === 'twoAdults')));
ok('  after the controls nothing is worse than before', ers.every(r => T.score(r.rl, r.ri) <= T.score(r.l, r.i)));
ok('a control reads as words: a watched one by its label, a written one as written', T.controlLabel({ kind: 'ratio' }) === 'Enough leaders for the children (the ratio)' && T.controlLabel({ kind: 'text', text: 'X' }) === 'X');

console.log('\nwhat the church calls its safeguarding lead (F-280 S2b)');
const sgm = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(V2, 'egbc-events-safeguarding.js'), 'utf8'), { module: sgm });
const SG = sgm.exports, LINES = ['Bookings open after the safeguarding lead or deputy signs this off.', 'Safeguarding lead', 'Deputy safeguarding lead', 'Ask your safeguarding leader'];
ok('unset, every word stays as it is', SG.leadTitle() === 'safeguarding lead' && LINES.every((s) => SG.lead(s) === s));
SG.setLeadTitle('Parish safeguarding officer');
ok('a parish’s title in its place; capitalised where the sentence starts with it; "leader" untouched', J(LINES.map(SG.lead)) === J(['Bookings open after the Parish safeguarding officer or deputy signs this off.', 'Parish safeguarding officer', 'Deputy Parish safeguarding officer', 'Ask your safeguarding leader']), J(LINES.map(SG.lead)));
SG.setLeadTitle('Designated safeguarding lead');
const once = LINES.map(SG.lead);
ok('a title that itself says "safeguarding lead" is never doubled, however often it runs', once[0] === 'Bookings open after the Designated safeguarding lead or deputy signs this off.' && J(once.map(SG.lead)) === J(once), J(once));
SG.setLeadTitle('   ');
ok('an empty title is the default', SG.leadTitle() === 'safeguarding lead');

console.log('\nS3: a leader’s other checks, and who each leader is');
const X = (c) => SG.checkExtras(c, { referenceYears: 3 }, '2026-10-26');
ok('the barred list: "ok" only for Enhanced with the barred list; another level, or none recorded, is not', X({ dbsLevel: 'enhancedBarred' }).level === 'ok' && X({ dbsLevel: 'enhanced' }).level === 'not barred list' && X({}).level === 'unknown' && X(null).level === 'unknown');
ok('a reference and a declaration last 3 years (the church’s setting), then are out of date; none is missing', X({ referenceDate: '2024-01-01' }).reference === 'ok' && X({ referenceDate: '2023-01-01' }).reference === 'out of date' && X({}).declaration === 'missing'
  && SG.checkExtras({ referenceDate: '2023-01-01' }, { referenceYears: 5 }, '2026-10-26').reference === 'ok');
ok('"cleared" is still DBS and training only (what the rules work out too)', SG.checkStatus({ dbsStatus: 'current', dbsSeen: '2026-01-01', trainingDate: '2026-01-01' }, {}, '2026-10-26').ok === true);
ok('the levels offered: Enhanced with the barred list first', SG.DBS_LEVELS[0][0] === 'enhancedBarred' && SG.DBS_LEVELS.map((x) => x[0]).join() === 'enhancedBarred,enhanced,standard,basic');
const W1 = SG.whoIs({ leaderIds: ['m_a', 'm_b'], leaders: [{ name: 'A', memberId: 'm_a' }, { name: 'B', memberId: 'm_x' }] });
ok('WHO EACH LEADER IS comes from leaderIds (the rules check only that), whatever leaders[i] says', W1.leaders[0].memberId === 'm_a' && W1.leaders[1].memberId === 'm_b' && W1.leaders[1].name === 'B');
const W2 = SG.whoIs({ leaderIds: ['m_a', ''], leaderInfo: { m_a: { name: 'Ann', role: 'leader', uid: 'u_a' } }, leaders: [{ name: 'Someone else', memberId: 'm_a' }, { name: 'A visitor', memberId: '' }] });
ok('F-287: A MEMBER’S NAME COMES FROM leaderInfo, never from leaders[i]; someone not in the address book keeps theirs', W2.leaders[0].name === 'Ann' && W2.leaders[0].uid === 'u_a' && W2.leaders[1].name === 'A visitor' && W2.leaders[1].memberId === '', J(W2.leaders));
ok('   leaderInfoOf: each named one by member id, the first if twice; nobody without one', J(SG.leaderInfoOf([{ memberId: 'm_a', name: 'A' }, { memberId: '', name: 'V' }, { memberId: 'm_a', name: 'A2' }])) === J({ m_a: { name: 'A', role: 'leader', uid: '' } }));
ok('   an older record without leaderInfo gains it from what it holds (shapeOf)', J(SG.shapeOf({ leaders: [{ memberId: 'm_b', name: 'B', role: 'helper', uid: 'u_b' }] })) === J({ leaderIds: ['m_b'], leaderInfo: { m_b: { name: 'B', role: 'helper', uid: 'u_b' } } }));
ok('   an older record whose lists differ in length is left as it is', SG.whoIs({ leaderIds: ['m_a'], leaders: [] }).leaders.length === 0);
const R3 = fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8');
ok('the rules: no leader-by-leader check, and 500, not 20; nobody twice; leaderInfo exactly the named ones (F-287)', R3.includes("ids.size() == d.get('leaders', []).size() && ids.size() <= 500") && R3.includes('named.toSet().size() == named.size()')
  && R3.includes('info is map && info.keys().hasOnly(named) && info.size() == named.size()') && R3.includes('&& leadersShapeOk(request.resource.data)') && !/idAt\(d, 19\)/.test(R3));

console.log('\nS4: still to do, and trustees noted');
const TD = [{ rl: 5, ri: 5, todo: [{ what: 'Book the lifeguard', who: 'Trip leader', by: '2026-11-01' }] }, { rl: 1, ri: 2, todo: [{ what: 'Ring the venue', who: '', by: '' }, { what: 'Old', who: 'Ann', by: '2026-01-01' }, { what: 'Done one', who: 'Ann', by: '2026-01-01', done: true }, { what: '', who: 'x', by: 'x' }] }];
ok('todoState: 3 open (done and blank ones not counted), 1 without a person or date, 1 overdue, 1 open on a risk still High', J(T.todoState(TD, '2026-10-26')) === J({ open: 3, overdue: 1, unready: 1, redOpen: 1 }), J(T.todoState(TD, '2026-10-26')));
ok('needsNoted, by default: camps, overnights, anything overseas or adventurous; not an ordinary trip', T.needsNoted('camp', {}) && T.needsNoted('overnight', {}) && T.needsNoted('trip', { abroad: true }) && T.needsNoted('offsite', { adventurous: true }) && !T.needsNoted('trip', {}) && !T.needsNoted('holidayclub', {}));
ok('   the church’s own setting decides: trips only, nothing overseas', T.needsNoted('trip', {}, { kinds: ['trip'], abroad: false }) && !T.needsNoted('camp', { abroad: true }, { kinds: ['trip'], abroad: false, adventurous: false }));
const CKS = fs.readFileSync(path.join(V2, 'functions', 'sg-checklist.cjs'), 'utf8');
ok('the server’s copy has the same two (the warnings use them)', CKS.includes('function todoState(') && CKS.includes('function needsNoted(') && CKS.includes('const MAX_TODO = 50;'));

const RULES4 = fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), ASSESS4 = fs.readFileSync(path.join(V2, 'egbc-sg-assess.js'), 'utf8');
ok('STILL TO DO HOLDS 50 A RISK (Martin: no limit but what a record holds; it was 5): the page, the server’s copy and the rules agree, and the page says so when full',
  T.MAX_TODO === 50 && CKS.includes('const MAX_TODO = 50;') && RULES4.includes("request.resource.data.get('todo', []).size() <= 50") && ASSESS4.includes('A risk holds at most ') && ASSESS4.includes('data-todofull'));

console.log('\nwhat one assessment holds (H-9: no limits beyond what a record holds)');
const assessSrc = fs.readFileSync(path.join(V2, 'egbc-sg-assess.js'), 'utf8'), rulesSrc = fs.readFileSync(path.join(V2, 'firestore.rules'), 'utf8'), aiSrc = fs.readFileSync(path.join(V2, 'functions', 'sg-ai-core.cjs'), 'utf8');
ok('the page, the server and the rules agree: 200 risks, 50 controls each, 500 host questions, 1,100 answers', assessSrc.includes('var MAX = { risks: 200, controls: 50, host: 500 };') && aiSrc.includes('const MAX = { risks: 200, controls: 50, host: 500 };')
  && rulesSrc.includes("get('risks', []).size() <= 200") && rulesSrc.includes("get('hostIds', []).size() <= 500") && rulesSrc.includes("get('answers', {}).size() <= 1100") && rulesSrc.includes('controls.size() <= 50'));
ok('   and the page says so when a list is full, never cutting it silently', assessSrc.includes('An assessment holds at most') && assessSrc.includes('The host’s list holds at most') && assessSrc.includes('A risk holds at most'));

console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
process.exit(results.every(Boolean) ? 0 : 1);
