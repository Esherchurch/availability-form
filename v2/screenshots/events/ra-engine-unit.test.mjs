/* THE RISK ASSESSMENT ENGINE (F-280 section 2, H&S step 1). Events window.
   The pieces every register shares, moved out of the safeguarding code
   unchanged: proved here to be one copy (the safeguarding files use them,
   not copies of them), to work for a register that isn't safeguarding,
   and to keep each register's AI caps, log and state in its own records.
     node screenshots/events/ra-engine-unit.test.mjs        (from v2/; no emulator) */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(V2, 'functions', 'index.js'));
const results = [];
const J = (x) => JSON.stringify(x);
function ok(name, pass, detail) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || detail === undefined ? '' : '\n          ' + String(detail).slice(0, 400))); }
const src = (f) => fs.readFileSync(path.join(V2, f), 'utf8');

/* the pages' engine, as a page loads it: the core, then the safeguarding templates and the print, in one window */
const win = { module: undefined, document: { createElement: () => ({}), head: { appendChild() {} } } };
win.window = win;
vm.runInNewContext(src('egbc-ra-core.js') + '\n' + src('egbc-ra-print.js'), win);
const R = win.EGBCRaCore, P = win.EGBCRaPrint;
const tmod = { exports: {} };
vm.runInNewContext(src('egbc-ra-core.js') + '\n' + src('egbc-sg-templates.js'), { module: tmod });
const T = tmod.exports;

console.log('1. one engine: the safeguarding register uses it, not a copy');
ok('THE BANDS: likelihood × impact, 15 and over High, 5 and over Medium, under 5 Low', R.rating(3, 5) === 'red' && R.rating(5, 3) === 'red' && R.rating(4, 4) === 'red' && R.rating(3, 4) === 'amber' && R.rating(1, 5) === 'amber' && R.rating(2, 2) === 'green' && R.rating(1, 4) === 'green' && J(R.WORDS) === J({ red: 'High', amber: 'Medium', green: 'Low' }));
ok('   the safeguarding templates’ ratings, "answered" and "still to do" are the engine’s', T.rating.toString() === R.rating.toString() && T.score.toString() === R.score.toString() && T.answered.toString() === R.answered.toString() && T.todoState.toString() === R.todoState.toString());
ok('   none of them is written out again in the safeguarding files', !/function (rating|score|answered|todoState|dial|split)\(/.test(src('egbc-sg-templates.js') + src('egbc-sg-dash.js') + src('sg-print.html')), 'a copy is still there');
const RA = require('./ra-ai-core.cjs'), SA = require('./sg-ai-core.cjs'), DR = require('./doc-reader-core.cjs'), RQ = require('./sg-requirements-core.cjs');
ok('   the server: personal details, socket covers and the bands are the engine’s, under the old names too', SA.personalCheck === RA.personalCheck && SA.socketCover === RA.socketCover && SA.SOCKETS === RA.SOCKETS && SA.rating === RA.rating);
ok('   the document reader is the engine’s, under the old names too', RQ.fileKind === DR.fileKind && RQ.docxText === DR.docxText && RQ.newOnly === DR.newOnly && RQ.MAX_BYTES === DR.MAX_BYTES);
ok('   the web reader is the engine’s (functions/web-reader-core.cjs); the old name is the same module', require('./sg-links-core.cjs') === require('./web-reader-core.cjs'));
ok('   the bands agree between the pages and the server', [[1, 1], [1, 5], [2, 2], [3, 5], [4, 4], [5, 5], [3, 4]].every(([l, i]) => R.rating(l, i) === RA.rating(l, i)));

console.log('\n2. it works for a register that isn’t safeguarding (an invented fire checklist)');
const FIRE = { CHECKLIST: { core: [{ id: 'insurance', label: 'Buildings and public liability insurance in force?' }], fire: [{ id: 'alarm', label: 'Is the alarm tested weekly?' }], kitchen: [{ id: 'blanket', label: 'A fire blanket by the cooker?' }], heritage: [{ id: 'candles', label: 'Candles: who watches them?' }] },
  ALSO: { fire: ['kitchen'] }, FLAGS: [{ id: 'heritage', label: 'A listed building' }] };
const qs = R.checklistFor(FIRE, 'fire', { heritage: true }, [{ id: 'c1', q: 'Our own: is the tower door locked?' }]);
ok('THE CHECKLIST: the core, its kind’s and the kind it includes, the ticked flag’s, then the church’s own', J(qs.map((x) => x.id + ':' + x.group)) === J(['insurance:core', 'alarm:fire', 'blanket:kitchen', 'candles:heritage', 'c1:church']), J(qs));
ok('   "answered": words, or "N/A: " with a reason; "N/A: " alone is not', R.answered('Weekly, logged') && R.answered('N/A: no kitchen') && !R.answered('N/A: ') && !R.answered(''));
ok('   "still to do": open, overdue, with nobody named, and open on a risk still High', J(R.todoState([{ rl: 3, ri: 5, todo: [{ what: 'Fix the door', who: 'Warden', by: '2026-01-01' }, { what: 'Sign', who: '' }] }, { rl: 1, ri: 1, todo: [{ what: 'x', who: 'y', by: '2099-01-01', done: true }] }], '2026-10-27')) === J({ open: 2, overdue: 1, unready: 1, redOpen: 2 }));
const d = R.dial({ blocks: R.split([['green', 3], ['red', 1]], 4), num: '4', sub: 'of 4' });
ok('THE DIALS: 14 blocks, coloured in proportion, the number and its line as text', (d.match(/<rect /g) || []).length === 14 && (d.match(/data-b="green"/g) || []).length === 11 && (d.match(/data-b="red"/g) || []).length === 3 && /<div class="sgd-n">4<\/div>/.test(d) && /of 4/.test(d), d.slice(0, 200));
const rt = P.riskTable([{ risk: 'Fire in the kitchen', who: 'Everyone', l: 3, i: 5, rl: 1, ri: 5, controls: [{ kind: 'alarm' }, 'A fire blanket'] }], { controlLabel: (c) => (c.kind === 'alarm' ? 'The alarm, tested weekly' : '') });
ok('THE PRINT: the risk table in words (High 15 before, Medium 5 after), each control in the register’s own words', /data-rag="red">High 15/.test(rt) && /data-rag="amber">Medium 5/.test(rt) && /<li>The alarm, tested weekly<\/li><li>A fire blanket<\/li>/.test(rt), rt.slice(0, 300));
ok('   the red box, and signature lines with their dates', /This must not go ahead as described\./.test(P.mustBox([{ risk: '300 booked, fire maximum 250' }])) && P.mustBox([]) === '' && (P.signBoxes(['Fire safety lead', 'For the trustees']).match(/<span>Date<\/span>/g) || []).length === 2);

console.log('\n3. each register’s AI caps, log and state are its own records');
const { aiPlumbing } = await import(pathToFileURL(path.join(V2, 'functions', 'ra-ai.js')).href);
const written = [];
const fakeDb = () => {
  const store = {};
  const ref = (c, id) => ({ c, id, get: async () => ({ exists: !!store[c + '/' + id], data: () => store[c + '/' + id] }), set: async (v) => { store[c + '/' + id] = v; written.push(c); } });
  return { store, collection: (c) => ({ doc: (id) => ref(c, id), add: async (v) => { written.push(c); store[c + '/' + Math.random()] = v; } }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, v) => { store[r.c + '/' + r.id] = v; written.push(r.c); } }) };
};
const db1 = fakeDb();
const H = aiPlumbing({ secret: { value: () => 'NOT-SET' }, day: () => '2026-10-27', records: { use: 'raAiUse', log: 'raAiLog', state: 'raAiState', stub: 'raAiStub' }, words: { setup: 'x' } });
const cap = { perChurch: 2, perPerson: 1 };
const a1 = await H.takeOne(db1, 'u1', cap), a2 = await H.takeOne(db1, 'u1', cap), a3 = await H.takeOne(db1, 'u2', cap), a4 = await H.takeOne(db1, 'u3', cap);
ok('THE CAPS: counted in the register’s own record (2 a day, 1 a person here)', a1 && !a2 && a3 && !a4 && J(db1.store['raAiUse/2026-10-27']) === J({ total: 2, by: { u1: 1, u2: 1 } }) && await H.usedUp(db1, 'u3', cap), J(db1.store));
await H.logIt(db1, { siteId: 's', calEventId: 'e', by: 'u1', outcome: 'drafted', kind: 'fire' });
ok('   the log and the state: the register’s own, never safeguarding’s', written.every((c) => /^raAi/.test(c)) && written.includes('raAiLog') && !Object.keys(db1.store).some((k) => /^sgAi/.test(k)), J(written));
ok('   NOT-SET means not set up (no key)', (await H.apiOf(db1)).apiKey === '');
ok('   the engine names no register’s records itself: each passes its own', !/sgAi|sgAssess|safeguarding/i.test(src('functions/ra-ai.js').replace(/\/\*[\s\S]*?\*\//g, '')), 'a register named in ra-ai.js');

console.log('\n4. for any church: nothing of one church’s in the engine');
const ENGINE = ['egbc-ra-core.js', 'egbc-ra-print.js', 'egbc-ra-print.css', 'functions/ra-ai.js', 'functions/ra-ai-core.cjs', 'functions/doc-reader-core.cjs', 'functions/web-reader-core.cjs'];
const hits = ENGINE.filter((f) => /Esher|Elders|Church office|Kids Church|Newday|Baptist/i.test(src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
ok('no church’s name, team or host in the engine’s code', hits.length === 0, J(hits));

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
