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
ok('a template for each kind of event that needs sign-off: trip, overnight, holiday club, off-site', J(EK) === J(['trip', 'overnight', 'holidayclub', 'offsite']) && EK.every(k => ET[k] && ET[k].questions.length && ET[k].risks.length));
const eqs = [].concat(...EK.map(k => ET[k].questions)), ers = [].concat(...EK.map(k => ET[k].risks));
ok('each fits the rules: at most 20 questions and 40 risks, every risk rated 1 to 5 with its controls', EK.every(k => ET[k].questions.length <= 20 && ET[k].risks.length <= 40)
  && ers.every(r => r.risk.length <= 200 && [r.l, r.i, r.rl, r.ri].every(n => Number.isInteger(n) && n >= 1 && n <= 5) && r.controls.length >= 1 && r.controls.every(c => ctl.includes(c.kind))), J(ers.filter(r => !r.controls.length).map(r => r.id)));
ok('  question ids are unique within each template', EK.every(k => new Set(ET[k].questions.map(q => q.id)).size === ET[k].questions.length));
ok('  the trip covers getting lost, travel and ratios; the overnight two adults at night', ['trp-lost', 'trp-travel', 'trp-ratio'].every(id => ET.trip.risks.some(r => r.id === id)) && ET.overnight.risks.some(r => r.controls.some(c => c.kind === 'twoAdults')));
ok('  after the controls nothing is worse than before', ers.every(r => T.score(r.rl, r.ri) <= T.score(r.l, r.i)));
ok('a control reads as words: a watched one by its label, a written one as written', T.controlLabel({ kind: 'ratio' }) === 'Enough leaders for the children (the ratio)' && T.controlLabel({ kind: 'text', text: 'X' }) === 'X');

console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
process.exit(results.every(Boolean) ? 0 : 1);
