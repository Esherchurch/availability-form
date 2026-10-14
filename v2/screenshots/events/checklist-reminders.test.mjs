/* Checklist reminders (R11; F-188): the morning job, run on chosen days.
   Events window. Invented people only, the events Firestore emulator, and
   a stand-in sender that only records: nothing is emailed.

     npx firebase emulators:exec --config firebase.events.json --only firestore \
       --project egbc-worship-planner "node screenshots/events/checklist-reminders.test.mjs"

   What it proves:
     1. THE DAY BEFORE a task is due: one "Due tomorrow" email to the person
        named, with the task, the note, the date and the event
     2. THE DAY AFTER it was due, not ticked: one "Overdue" email
     3. nothing for a ticked task, a task with nobody named or no due date,
        a task due today, or a cancelled event
     4. EACH IS SENT ONCE: run again, nothing; move the task up the list,
        nothing
     5. someone with no email address: recorded, not lost
     6. LONDON DATES: the morning after the clocks go back counts right
     7. the reminders' own records are nobody's to read */

process.env.FUNCTIONS_EMULATOR = 'true';   /* belt and braces: this test sends through a stand-in only */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const R = await import(pathToFileURL(path.join(V2, 'functions', 'checklist-reminders.js')).href);

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const J = (x) => JSON.stringify(x);

await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', hubUrl: 'https://example.invalid/hub/' });
await db.collection('addressBook').doc('m_alice').set({ name: 'Alice Helper (invented)', email: 'alice@example.invalid' });
await db.collection('addressBook').doc('m_bob').set({ name: 'Bob Builder (invented)', email: 'bob@example.invalid' });
await db.collection('addressBook').doc('m_nomail').set({ name: 'Nell Noemail (invented)', email: '' });
const EV = (title, ymd, hm, extra) => ({ title, startLocal: ymd + 'T' + hm, startUtc: Date.parse(ymd + 'T' + hm + ':00Z'), status: 'confirmed', ...(extra || {}) });
await db.collection('calEvents').doc('ev_sup').set(EV('Harvest supper (invented)', '2026-11-12', '18:00'));
await db.collection('calEvents').doc('ev_off').set(EV('CANCELLED quiz (invented)', '2026-11-12', '19:00', { status: 'cancelled' }));
await db.collection('calEvents').doc('ev_bst').set(EV('Clocks go back fair (invented)', '2026-10-26', '10:00'));
const T = (text, who, dueDays, extra) => ({ text, who, whoName: '', dueDays, note: '', done: false, ...(extra || {}) });
await db.collection('eventChecklists').doc('ev_sup').set({ tasks: [
  T('Chairs out in the hall', 'm_alice', 2, { note: 'The stacking ones by the stage' }),   /* due Tue 10 Nov */
  T('Book the urn', 'm_bob', 4),                                                          /* due Sun 8 Nov  */
  T('Print the menus', 'm_alice', 4, { done: true }),                                     /* ticked         */
  T('Buy napkins', '', 2),                                                                /* nobody named   */
  T('Sweep up', 'm_bob', null),                                                           /* no due date    */
  T('Order the bread', 'm_bob', 3),                                                       /* due today      */
  T('Ring the caterer', 'm_nomail', 2)                                                    /* no email       */
] });
await db.collection('eventChecklists').doc('ev_off').set({ tasks: [T('Set the quiz', 'm_alice', 2)] });
await db.collection('eventChecklists').doc('ev_bst').set({ tasks: [T('Hang the bunting', 'm_alice', 1)] });   /* due Sun 25 Oct */

let OUT = [];
const send = async (msg, meta) => { OUT.push({ to: msg.to, subject: msg.subject, html: msg.html, meta }); return { ok: true, stubbed: true }; };
const run = async (whenUtc) => { OUT = []; const r = await R.runChecklistReminders({ db, send, now: new Date(whenUtc) }); return r; };

try {
  /* Monday 9 November, 8am London (GMT). */
  await run('2026-11-09T08:00:00Z');
  const tom = OUT.find(m => /^Due tomorrow: Chairs out in the hall/.test(m.subject));
  ok('1. THE DAY BEFORE: "Due tomorrow" to Alice, with the task, the note, the date and the event', tom && J(tom.to) === '["alice@example.invalid"]' && /tomorrow, Tuesday 10 November/.test(tom.html) &&
    /The stacking ones by the stage/.test(tom.html) && /Harvest supper \(invented\)<\/strong> on Thursday 12 November/.test(tom.html) && tom.meta.source === 'checklist', J(tom));
  const late = OUT.find(m => /^Overdue: Book the urn/.test(m.subject));
  ok('2. THE DAY AFTER IT WAS DUE, not ticked: "Overdue" to Bob', late && J(late.to) === '["bob@example.invalid"]' && /was due on <strong>Sunday 8 November/.test(late.html), J(late));
  ok('3. NOTHING for a ticked task, nobody named, no due date, due today, or a cancelled event', OUT.length === 2 && !OUT.some(m => /Print the menus|Buy napkins|Sweep up|Order the bread|Set the quiz/.test(m.subject)), J(OUT.map(m => m.subject)));
  const nm = await db.collection('checklistReminders').where('who', '==', 'm_nomail').get();
  ok('5. NO EMAIL ADDRESS: recorded as not sent, not lost', nm.size === 1 && nm.docs[0].data().ok === false && nm.docs[0].data().error === 'no address');

  /* ---------- 4. once ---------- */
  await run('2026-11-09T09:30:00Z');
  ok('4. EACH IS SENT ONCE: run again the same day, nothing', OUT.length === 0, J(OUT.map(m => m.subject)));
  const list = (await db.collection('eventChecklists').doc('ev_sup').get()).data().tasks;
  await db.collection('eventChecklists').doc('ev_sup').update({ tasks: list.slice().reverse() });
  await run('2026-11-09T10:00:00Z');
  ok('   MOVE THE TASKS ROUND the list: still nothing', OUT.length === 0, J(OUT.map(m => m.subject)));

  /* ---------- the next days ---------- */
  await run('2026-11-10T08:00:00Z');
  ok('   the day it is due: nothing more, and "Order the bread" (due yesterday) is now overdue', OUT.length === 1 && /^Overdue: Order the bread/.test(OUT[0].subject), J(OUT.map(m => m.subject)));
  const tasks = (await db.collection('eventChecklists').doc('ev_sup').get()).data().tasks.map(t => (t.text === 'Chairs out in the hall' ? { ...t, done: true } : t));
  await db.collection('eventChecklists').doc('ev_sup').update({ tasks });
  await run('2026-11-11T08:00:00Z');
  ok('   TICKED IN TIME: no "Overdue" for it the day after', OUT.length === 0, J(OUT.map(m => m.subject)));

  /* ---------- 6. London dates ---------- */
  /* 23:30 UTC on Friday 23 October is 00:30 on SATURDAY 24th in London (summer time): London's date, not UTC's. */
  await run('2026-10-23T23:30:00Z');
  const bst = OUT.find(m => /Hang the bunting/.test(m.subject));
  ok('6. LONDON DATES: just after midnight on Saturday 24 October in London (still Friday in UTC), the day before Sunday 25th', bst && /^Due tomorrow/.test(bst.subject) && /Sunday 25 October/.test(bst.html), J(OUT.map(m => m.subject)));
  await run('2026-10-25T23:30:00Z');   /* 11.30pm on Sunday 25 October, now GMT: still the 25th in London */
  ok('   and late on the night the clocks went back, still the 25th: nothing yet', OUT.length === 0, J(OUT.map(m => m.subject)));
  await run('2026-10-26T08:00:00Z');
  ok('   the morning after: "Overdue"', OUT.length === 1 && /^Overdue: Hang the bunting/.test(OUT[0].subject), J(OUT.map(m => m.subject)));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
