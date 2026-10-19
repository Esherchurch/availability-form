/* BUILDING COMPLIANCE, STAGE 1: the data and the schedule engine (F-230).
   Events window. Synthetic data only, events emulators only (Firestore).

     npx firebase emulators:exec --config firebase.events.json --only firestore \
       --project egbc-worship-planner "node screenshots/events/compliance-stage1.test.mjs"

   The brief's proofs, each able to fail:
     1. the hall's gas off: no gas checks; the let house's gas on: the legal
        gas safety check appears
     2. the next due date counts from the day it was DONE, not the day it was due
     3. editing the church's copy of a check leaves the global template (and
        the other buildings' copies) unchanged
     4. a check removed from a building (an answer changed) keeps its history
   And Martin's (19 Oct):
     5. a kitchen with no wet chemical extinguisher is amber; adding one, green
     6. a safety job past due turns the building red; a non-safety job does
        not; a follow-up raised on a check is ONE Maintenance job
     7. fire stopping appears only after building work is recorded
     8. one schedule function: no other file works out a due date
     9. every change is in the audit log; templates are data (versioned),
        plain words, no regulation numbers */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadEngine, loadStore, loadTemplates } from './compliance-engine.mjs';
import { seedTemplates, seedFixtures, FIXTURES } from '../../tools/seed-compliance.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const E = loadEngine(process.env.COMPLIANCE_ENGINE), S = loadStore(), T = loadTemplates();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 700))); }
const J = (x) => JSON.stringify(x);
const all = async (c, site) => (await (site ? db.collection(c).where('siteId', '==', site) : db.collection(c)).get()).docs.map(d => ({ id: d.id, ...d.data() }));
const who = { uid: 'u_test', name: 'Test Admin (invented)' };
const TODAY = '2026-10-19';
const sched = async (site) => { const b = await S.load(db, site); return E.schedule({ profile: b.profile, checks: b.checks, records: b.records, jobs: b.jobs, triggers: b.triggers, today: TODAY }); };
const tids = (site) => all('buildingChecks', site).then(cs => cs.filter(c => c.state !== 'removed').map(c => c.templateId));

try {
  await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  const t1 = await seedTemplates(db, T, true);
  ok('SEEDED: the starter templates as data (' + T.TEMPLATES.length + '), versioned', t1.made === T.TEMPLATES.length && (await all('complianceTemplates')).every(t => t.version === T.VERSION));
  const t2 = await seedTemplates(db, T, true);
  ok('   seeding again changes nothing', t2.made === 0 && t2.same === T.TEMPLATES.length);
  await seedFixtures(db, E, S, T);
  ok('   the synthetic church: a church, a hall and a let house, ON THE EXISTING PLACES (sites and rooms)', (await all('sites')).length === 3 && (await all('rooms')).length === 6 && (await all('buildingChecks', 'cmp_church')).length > 20);

  /* ---------- 1. gas ---------- */
  const hall = await tids('cmp_hall'), house = await tids('cmp_house'), church = await tids('cmp_church');
  ok('1. THE HALL HAS NO GAS: no gas checks', !hall.some(t => /^gas-/.test(t)), J(hall.filter(t => /gas/.test(t))));
  ok('   THE LET HOUSE HAS GAS: the legal gas safety check is there', house.includes('gas-safety') && (await all('buildingChecks', 'cmp_house')).find(c => c.templateId === 'gas-safety').legal === true);
  ok('   the church (not a let house) has the gas service, not the legal gas safety check', church.includes('gas-service') && !church.includes('gas-safety'));
  ok('   the church is Church of England and before 2000: the architect’s inspection and asbestos', church.includes('cofe-architect') && church.includes('asbestos-survey') && !hall.includes('cofe-architect'));
  await S.applyProfile(db, E, 'cmp_hall', { ...FIXTURES.sites[1].profile, gas: true }, T.TEMPLATES, who);
  ok('   GAS TURNED ON FOR THE HALL: the gas service appears (and not the let-house check)', (await tids('cmp_hall')).includes('gas-service') && !(await tids('cmp_hall')).includes('gas-safety'));
  await S.applyProfile(db, E, 'cmp_hall', FIXTURES.sites[1].profile, T.TEMPLATES, who);
  ok('   and off again: gone', !(await tids('cmp_hall')).some(t => /^gas-/.test(t)));

  /* ---------- 2. next due from the day done ---------- */
  const eicrId = S.checkId('cmp_church', 'eicr'), fraId = S.checkId('cmp_church', 'fire-ra');
  const fra = (await db.collection('buildingChecks').doc(fraId).get()).data(); fra.id = fraId;
  await S.recordDone(db, fra, { doneOn: '2025-09-01' }, who);
  await S.recordDone(db, fra, { doneOn: '2025-10-20', notes: 'Done late (invented)' }, who);   // due 2026-09-01 by the first; actually done 2025-10-20
  const f1 = (await sched('cmp_church')).items.find(i => i.id === fraId);
  ok('2. DONE LATE: the next one counts from the day it was DONE (20 Oct 2025 + 12 months = 20 Oct 2026), not when it was due', f1.lastDone === '2025-10-20' && f1.nextDue === '2026-10-20' && f1.rag === 'amber', J(f1));
  ok('   in 30 days or fewer: amber; the monthly walk-round, never recorded: amber ("Not recorded yet")', (await sched('cmp_church')).items.find(i => i.templateId === 'walk-round').why === 'Not recorded yet');
  const e = (await db.collection('buildingChecks').doc(eicrId).get()).data(); e.id = eicrId;
  await S.recordDone(db, e, { doneOn: '2020-03-01', certExpiry: '2026-09-30' }, who);
  const e1 = (await sched('cmp_church')).items.find(i => i.id === eicrId);
  ok('   a certificate’s own expiry wins (30 Sep 2026): overdue, red', e1.nextDue === '2026-09-30' && e1.rag === 'red', J(e1));
  ok('   month ends: 31 Jan + 1 month = 28 Feb', E.nextDue({ n: 1, unit: 'month' }, '2026-01-31') === '2026-02-28' && E.nextDue({ n: 1, unit: 'week' }, '2026-10-19') === '2026-10-26');

  /* ---------- 3. the church's copy, never the template ---------- */
  const tplBefore = (await db.collection('complianceTemplates').doc('water-temps').get()).data();
  const wt = S.checkId('cmp_hall', 'water-temps');
  await S.editCheck(db, wt, { every: { n: 2, unit: 'month' }, responsibleIds: ['m_val'] }, who);
  const tplAfter = (await db.collection('complianceTemplates').doc('water-temps').get()).data();
  const hallCopy = (await db.collection('buildingChecks').doc(wt).get()).data(), churchCopy = (await db.collection('buildingChecks').doc(S.checkId('cmp_church', 'water-temps')).get()).data();
  ok('3. THE CHURCH EDITS ITS COPY (every 2 months, Val responsible): its copy changes', hallCopy.every.n === 2 && J(hallCopy.responsibleIds) === J(['m_val']) && hallCopy.edited.includes('every'));
  ok('   THE GLOBAL TEMPLATE IS UNCHANGED', J(tplBefore) === J(tplAfter) && tplAfter.every.n === 1, J(tplAfter.every));
  ok('   and so is another building’s copy', churchCopy.every.n === 1);
  let refused = '';
  try { await S.editCheck(db, wt, { state: 'off' }, who); } catch (x) { refused = x.message; }
  ok('   switching a check off needs a reason', /Say why/.test(refused));
  await S.editCheck(db, wt, { state: 'off', offReason: 'Hall closed for a year (invented)' }, who);
  ok('   with one, it is off and says why (grey)', (await sched('cmp_hall')).items.find(i => i.id === wt).rag === 'grey');
  const custom = await S.addCustomCheck(db, 'cmp_hall', { area: 'Building', title: 'Check the car park lights (invented)', every: { n: 3, unit: 'month' } }, who);
  ok('   the church adds its own check', (await all('buildingChecks', 'cmp_hall')).some(c => c.id === custom && c.custom));
  /* a template update is offered, and applying it keeps what the church changed */
  const newer = T.TEMPLATES.map(t => t.id === 'water-temps' || t.id === 'flush-taps' ? { ...t, version: 2, title: t.title + ' (updated wording)' } : t);
  const ups = S.templateUpdates(newer, await all('buildingChecks', 'cmp_hall'));
  ok('   A TEMPLATE UPDATED: the church is told (2 of its checks), and chooses', ups.length === 2, J(ups.map(u => u.check.templateId)));
  for (const u of ups) await S.applyUpdate(db, u.check, u.template, who);
  const wt2 = (await db.collection('buildingChecks').doc(wt).get()).data();
  ok('   applied: the new wording, but the church’s own frequency kept', /updated wording/.test(wt2.title) && wt2.every.n === 2 && wt2.templateVersion === 2);

  /* ---------- 4. removing keeps history ---------- */
  const lp = S.checkId('cmp_church', 'lightning');
  const lpc = (await db.collection('buildingChecks').doc(lp).get()).data(); lpc.id = lp;
  await S.recordDone(db, lpc, { doneOn: '2026-05-01', notes: 'Fine (invented)' }, who);
  await S.applyProfile(db, E, 'cmp_church', { ...FIXTURES.sites[0].profile, lightning: false }, T.TEMPLATES, who);
  const lp2 = (await db.collection('buildingChecks').doc(lp).get()).data();
  const recs = (await all('checkRecords', 'cmp_church')).filter(r => r.checkId === lp);
  ok('4. LIGHTNING PROTECTION REMOVED: the check is marked removed, not deleted', lp2 && lp2.state === 'removed');
  ok('   ITS HISTORY IS STILL THERE (the record of 1 May)', recs.length === 1 && recs[0].doneOn === '2026-05-01');
  await S.applyProfile(db, E, 'cmp_church', FIXTURES.sites[0].profile, T.TEMPLATES, who);
  ok('   put back: the same check returns, with its history', (await db.collection('buildingChecks').doc(lp).get()).data().state === 'on' && (await sched('cmp_church')).items.find(i => i.id === lp).lastDone === '2026-05-01');

  /* ---------- 5. the extinguisher register ---------- */
  const rooms = await all('rooms', 'cmp_hall'), kinds = {};
  (await all('roomProfiles', 'cmp_hall')).forEach(r => { kinds[r.id] = r.kind; });
  const reg = async () => E.register({ rooms, roomKinds: kinds, equipment: await all('fireEquipment', 'cmp_hall'), guide: T.FIRE_GUIDE });
  await db.collection('fireEquipment').doc('fe1').set({ siteId: 'cmp_hall', roomId: 'cmp_hall_kitchen', type: 'fireBlanket', size: '', label: 'FB1', nextService: '2027-01-01' });
  await db.collection('fireEquipment').doc('fe2').set({ siteId: 'cmp_hall', roomId: 'cmp_hall_main', type: 'water', size: '6 l', label: 'W1', nextService: '2027-01-01' });
  const k1 = (await reg()).find(r => r.roomId === 'cmp_hall_kitchen');
  ok('5. A KITCHEN WITH NO WET CHEMICAL EXTINGUISHER: amber, and says what is missing', k1.rag === 'amber' && J(k1.missing) === J(['wetChemical']), J(k1));
  await db.collection('fireEquipment').doc('fe3').set({ siteId: 'cmp_hall', roomId: 'cmp_hall_kitchen', type: 'wetChemical', size: '2 l', label: 'WC1', nextService: '2027-01-01' });
  const k2 = (await reg()).find(r => r.roomId === 'cmp_hall_kitchen');
  ok('   ADDING ONE TURNS IT GREEN', k2.rag === 'green' && k2.missing.length === 0, J(k2));
  ok('   the hall: water OR foam is enough (green with water)', (await reg()).find(r => r.roomId === 'cmp_hall_main').rag === 'green');
  ok('   the guide says it is a guide', /Your fire risk assessment decides; this is a guide/.test(T.FIRE_GUIDE_NOTE));

  /* ---------- 6. safety jobs ---------- */
  await db.collection('maintJobs').doc('j_paint').set({ siteId: 'cmp_house', roomId: '', what: 'Repaint the porch (invented)', safety: false, due: '2026-09-01', status: 'todo', reportedAt: 'x' });
  const h0 = await sched('cmp_house');
  ok('6. A NON-SAFETY JOB PAST DUE DOES NOT CHANGE THE COLOUR', h0.safetyJobs.length === 0, J(h0.safetyJobs));
  await db.collection('maintJobs').doc('j_light').set({ siteId: 'cmp_house', roomId: 'cmp_house_kitchen', what: 'Emergency light not working (invented)', safety: E.suggestSafety('Emergency light not working'), due: '2026-12-01', status: 'todo', reportedAt: 'x' });
  ok('   a SAFETY job (the tick suggested from its words), open: amber', (await sched('cmp_house')).safetyJobs[0].rag === 'amber' && (await sched('cmp_house')).rag !== 'green');
  await db.collection('maintJobs').doc('j_light').update({ due: '2026-10-01' });
  ok('   A SAFETY JOB PAST DUE TURNS THE BUILDING RED', (await sched('cmp_house')).rag === 'red');
  /* a follow-up raised on a check IS a Maintenance job: one list */
  const sm = S.checkId('cmp_house', 'smoke-alarms');
  await db.collection('maintJobs').doc('j_follow').set({ siteId: 'cmp_house', roomId: '', what: 'Replace the landing smoke alarm (invented)', checkId: sm, safety: true, due: '2026-10-10', status: 'todo', reportedAt: 'x' });
  const jobsNow = await all('maintJobs', 'cmp_house');
  ok('   A FOLLOW-UP ON A CHECK IS ONE MAINTENANCE JOB (once, on the one list)', jobsNow.filter(j => j.what.startsWith('Replace the landing')).length === 1 && !(await all('followUps')).length);
  ok('   and, past due, turns its check red', (await sched('cmp_house')).items.find(i => i.id === sm).rag === 'red');

  /* ---------- 7. on demand ---------- */
  const fs1 = (await sched('cmp_church')).items.find(i => i.templateId === 'fire-stopping');
  ok('7. FIRE STOPPING: no date until building work is recorded (green, "Only when needed")', fs1.rag === 'green' && /Only when needed/.test(fs1.why), J(fs1));
  await S.recordWork(db, 'cmp_church', 'buildingWork', '2026-10-15', 'New cable run through the vestry wall (invented)', who);
  const fs2 = (await sched('cmp_church')).items.find(i => i.templateId === 'fire-stopping');
  ok('   building work recorded: it appears, due', fs2.rag === 'amber' && fs2.nextDue === '2026-11-14', J(fs2));
  const fsc = (await db.collection('buildingChecks').doc(fs2.id).get()).data(); fsc.id = fs2.id;
  await S.recordDone(db, fsc, { doneOn: '2026-10-18' }, who);
  ok('   checked after the work: done', (await sched('cmp_church')).items.find(i => i.templateId === 'fire-stopping').rag === 'green');

  /* ---------- 8. one schedule function ---------- */
  const offenders = fs.readdirSync(V2).filter(f => /\.(js|html)$/.test(f) && f !== 'egbc-compliance.js').filter(f => /buildingChecks|complianceTemplates/.test(fs.readFileSync(path.join(V2, f), 'utf8')) && /setUTCMonth|addMonths|nextDue\s*=\s*function|function nextDue/.test(fs.readFileSync(path.join(V2, f), 'utf8')));
  ok('8. ONE SCHEDULE FUNCTION: no other compliance file works out a due date', offenders.length === 0, offenders.join(', '));

  /* ---------- 9. audit and wording ---------- */
  const lg = await all('complianceLog');
  ok('9. EVERY CHANGE IS LOGGED (profiles, edits, done, work, templates)', ['profile', 'edit', 'add', 'done', 'work', 'template'].every(w => lg.some(l => l.what === w)), J([...new Set(lg.map(l => l.what))]));
  const words = JSON.stringify(T) + fs.readFileSync(path.join(V2, 'egbc-compliance.js'), 'utf8') + fs.readFileSync(path.join(V2, 'egbc-compliance-store.js'), 'utf8');
  ok('   NO REGULATION NUMBERS OR LEGAL CITATIONS in the templates or the engine', !/\b(regulation \d|reg\.\s?\d|section \d|s\.\s?\d+|BS\s?\d{3,}|\d{4}\/\d{2,}|Act \d{4}|\bSI \d)/i.test(words));
  ok('   the guidance line, word for word', T.GUIDANCE === 'These checks are guidance to help you. Your trustees remain responsible for your building’s safety.');
  ok('   the starter frequencies are data (the templates file), not code', T.TEMPLATES.every(t => t.kind === 'link' || (t.every && t.every.unit)) && !/unit: 'year'.*12/.test(fs.readFileSync(path.join(V2, 'egbc-compliance.js'), 'utf8')));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
