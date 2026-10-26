/* HEADROOM IN WRITING A SAFEGUARDING ASSESSMENT (main's church-ruleset run,
   20a9aa4f, 26 Oct). Firestore evaluates at most 1,000 expressions for one
   request. A named leader writing an event's assessment went over that in
   the church ruleset (every path under churches/{cid}, the church gate in
   signedIn()), while EGBC's own passed. This runs every way an assessment is
   written - a named leader's draft, the organiser's, the lead's sign-off and
   "not needed", and three that must be refused - against BOTH built rulesets,
   with N spare expressions added to signedIn(), and says how much room there
   is. Target: at least 10 in each (as H-8). Events window. Invented data only.

     EGBC_FIREBASE_CONFIG=firebase.events.json npx firebase emulators:exec --config firebase.events.json \
       --only firestore --project demo-egbc "node screenshots/events/sg-headroom.test.mjs" */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const V2 = path.resolve('.');
const require = createRequire(path.join(V2, 'functions', 'index.js'));
const CK = require('./sg-checklist.cjs');
const cfg = JSON.parse(fs.readFileSync(path.join(V2, process.env.EGBC_FIREBASE_CONFIG || 'firebase.events.json'), 'utf8'));
const PORT = (cfg.emulators && cfg.emulators.firestore && cfg.emulators.firestore.port) || 8182;
const CID = 'mc-test';
/* line endings as git leaves them (CRLF) or as built (LF): either */
const read = (f) => fs.readFileSync(path.join(V2, f), 'utf8').replace(/\r\n/g, '\n');
const SETS = {
  egbc: { src: read(cfg.firestore.rules), signedIn: 'function signedIn() {\nreturn request.auth != null;', pad: (n) => 'function signedIn() {\nreturn request.auth != null' + ' && true'.repeat(n) + ';', at: (p) => p },
  church: { src: read('firestore.churches.rules'), signedIn: 'function signedIn() { return request.auth != null && cid in request.auth.token.churches; }', pad: (n) => 'function signedIn() { return request.auth != null && cid in request.auth.token.churches' + ' && true'.repeat(n) + '; }', at: (p) => 'churches/' + CID + '/' + p }
};
for (const k of Object.keys(SETS)) if (SETS[k].src.split(SETS[k].signedIn).length < 2) throw new Error('signedIn() not found in the ' + k + ' rules');
const padded = (k, n) => SETS[k].src.split(SETS[k].signedIn).join(SETS[k].pad(n));

const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 400))); };

const EID = 'cev_sgh';
const ANS = Object.fromEntries(CK.checklistFor('trip', {}).map((q) => [q.id, q.yesNo ? 'Yes: invented' : 'Answered (invented)']));
const AS = (uid, extra) => ({ siteId: 'site_sgh', calEventId: EID, title: 'Trip (invented)', templateId: 'trip', answers: ANS, flags: {},
  risks: [{ risk: 'A child is lost', who: 'Children', l: 3, i: 5, rl: 1, ri: 5, controls: [{ kind: 'text', text: 'Head counts' }] }],
  status: 'draft', version: 1, updatedAt: 'x', updatedBy: uid, ...(extra || {}) });

async function cases(k, n) {
  const S = SETS[k];
  const env = await initializeTestEnvironment({ projectId: 'demo-egbc', firestore: { rules: padded(k, n), host: '127.0.0.1', port: PORT } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore(), put = (p, d) => setDoc(doc(db, S.at(p)), d);
    const user = (uid, mid) => put('users/' + uid, { memberId: mid, name: uid, teams: [], adminFor: [], masterAdmin: false, status: 'active' });
    await user('u_lead', 'm_lead'); await user('u_vic', 'm_vic'); await user('u_olly', 'm_olly'); await user('u_sam', 'm_sam');
    await put('sites/site_sgh', { name: 'Test site', active: true, order: 1 });
    await put('bookingSettings/site_sgh', { bookingsAdmins: [], safeguardingLead: 'm_lead', safeguardingDeputy: '' });
    await put('safeguardingSettings/defaults', { templates: {}, ratioAll: 5, ratioUnder8: 4, dbsYears: 3, trainingYears: 3, requireChecks: false, leadSiteId: 'site_sgh', leadName: '', leadPhone: '', updatedAt: 'x', updatedBy: 'x', register: { checklistIds: [] } });
    await put('calEvents/' + EID, { title: 'Trip (invented)', status: 'confirmed', sgKind: 'trip', teamUids: ['u_olly'], teamMemberIds: ['m_olly'], location: { kind: 'site', siteId: 'site_sgh' } });
    await put('eventLeaders/' + EID, { under18: true, leaderIds: ['m_vic'], leaderUids: ['u_vic'], leaders: [], siteId: 'site_sgh' });
  });
  const as = (uid) => env.authenticatedContext(uid, k === 'church' ? { churches: [CID] } : {}).firestore();
  const write = (uid, d) => { const f = as(uid); return setDoc(doc(f, S.at('sgAssessments/' + EID)), d); };
  const out = {};
  const run = async (key, f) => { try { await f(); out[key] = 'allow'; } catch (e) { out[key] = /maximum of 1000 expressions/.test(e.message) ? 'LIMIT' : 'deny'; } };
  await run('leaderDraft', () => write('u_vic', AS('u_vic')));
  await run('organiserDraft', () => write('u_olly', AS('u_olly', { version: 1 })));
  await run('leaderSigns', () => write('u_vic', AS('u_vic', { status: 'signed', signedBy: 'u_vic', signedByName: 'Vic', signedAt: serverTimestamp(), signedVersion: 1, signedNote: '' })));
  await run('strangerDraft', () => write('u_sam', AS('u_sam')));
  await run('leadSigns', () => write('u_lead', AS('u_lead', { status: 'signed', signedBy: 'u_lead', signedByName: 'Lead', signedAt: serverTimestamp(), signedVersion: 1, signedNote: '', signedByRole: 'Safeguarding lead' })));
  await run('leadSignsBlank', () => write('u_lead', AS('u_lead', { answers: {}, status: 'signed', signedBy: 'u_lead', signedByName: 'Lead', signedAt: serverTimestamp(), signedVersion: 1, signedNote: '' })));
  await run('leadWaives', () => write('u_lead', AS('u_lead', { waived: true, waivedBy: 'u_lead', waivedByName: 'Lead', waivedAt: serverTimestamp(), waivedWhy: 'A walk next door with parents (invented)' })));
  await env.cleanup();
  return out;
}
const WANT = { leaderDraft: 'allow', organiserDraft: 'allow', leaderSigns: 'deny', strangerDraft: 'deny', leadSigns: 'allow', leadSignsBlank: 'deny', leadWaives: 'allow' };
/* a refusal that hits the limit is still a refusal; a write that should go through must */
const fine = (o) => Object.keys(WANT).every((k) => o[k] === WANT[k] || (WANT[k] === 'deny' && o[k] === 'LIMIT'));

for (const k of ['egbc', 'church']) {
  const name = k === 'egbc' ? 'EGBC’s ruleset' : 'THE CHURCH RULESET (every church after EGBC)';
  const r0 = await cases(k, 0);
  ok(name + ': a named leader and the organiser write the draft; the lead signs it and can say "not needed"; a leader can’t sign, nor a stranger write, nor the lead sign it blank', fine(r0), JSON.stringify(r0));
  const r10 = await cases(k, 10);
  ok('   WITH 10 SPARE EXPRESSIONS in signedIn(): all the same - nothing that should go through hits the limit', fine(r10), JSON.stringify(r10));
  let best = fine(r10) ? 10 : 0;
  /* (a very long padding stops the emulator loading the rules at all: that ends the search, not the test) */
  for (const n of [20, 40, 80]) {
    let r;
    try { r = await cases(k, n); } catch (e) { console.log('          at ' + n + ': the rules would not load (' + String(e.message).slice(0, 80) + ')'); break; }
    if (!fine(r)) { console.log('          at ' + n + ': ' + JSON.stringify(r)); break; }
    best = n;
  }
  console.log('          headroom (' + k + '): ' + (best ? 'at least ' + best : 'under 10') + ' spare expressions');
  ok('   room for at least 10', best >= 10, best);
}

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
