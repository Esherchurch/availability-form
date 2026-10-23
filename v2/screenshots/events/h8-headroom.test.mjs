/* HEADROOM IN THE OFFICE'S EVENT BOOKING (main's H-8, 23 Oct). Firestore
   evaluates at most 1,000 expressions for one request. The office booking a
   room for an event (the booking and the room's day, in one batch) was
   within ONE expression of that: a single spare "&& true" in signedIn()
   refused it. This runs those cases against the built rules with N spare
   expressions added to signedIn(), and says how many there is room for.
   Target: at least 10 (main's ask). Events window. Invented data only.

     EGBC_FIREBASE_CONFIG=firebase.events.json npx firebase emulators:exec --config firebase.events.json \
       --only firestore --project demo-egbc "node screenshots/events/h8-headroom.test.mjs" */
import fs from 'node:fs';
import path from 'node:path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch } from 'firebase/firestore';

const V2 = path.resolve('.');
const cfg = JSON.parse(fs.readFileSync(path.join(V2, process.env.EGBC_FIREBASE_CONFIG || 'firebase.events.json'), 'utf8'));
const BUILT = fs.readFileSync(path.join(V2, cfg.firestore.rules), 'utf8');
const SIGNED_IN = 'function signedIn() {\nreturn request.auth != null;';
if (BUILT.split(SIGNED_IN).length !== 2) throw new Error('signedIn() not found in the built rules');
const padded = (n) => BUILT.replace(SIGNED_IN, () => 'function signedIn() {\nreturn request.auth != null' + ' && true'.repeat(n) + ';');
const PORT = (cfg.emulators && cfg.emulators.firestore && cfg.emulators.firestore.port) || 8182;

const results = [];
const ok = (name, pass, why) => { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || why === undefined ? '' : '\n          ' + String(why).slice(0, 400))); };
const Z = () => Array(96).fill(0);
const sunday = Z(); for (let i = 32; i < 50; i++) sunday[i] = 1;
const week = { 1: Z(), 2: Z(), 3: Z(), 4: Z(), 5: Z(), 6: Z(), 7: sunday };
const EV = (day, extra) => ({ kind: 'event', status: 'confirmed', siteId: 'site_bk', roomId: 'room_band', groupId: '', day, startMin: 1140, endMin: 1260,
  startLocal: 'x', endLocal: 'x', setupMins: 0, packdownMins: 0, slotFrom: 76, slotTo: 84, title: 'Test harvest supper', people: 20, layout: '',
  av: { needed: false, what: '' }, refreshments: { needed: false }, resources: [], notes: '', requester: { name: 'Lena', email: 'lena@example.invalid', phone: '', org: '' },
  memberUid: '', memberName: '', createdAt: 'x', calEventId: 'cev_test', ...(extra || {}) });
const held = (sl, n) => { const a = (sl || Z()).slice(); for (let i = 76; i < 84; i++) a[i] = (a[i] || 0) + (n || 1); return a; };
const PARTS = ['room_p1', 'room_p2', 'room_p3', 'room_p4'];

/* the five cases: the two at the limit, their two refusals, and a whole hall made of four parts */
async function cases(n) {
  const env = await initializeTestEnvironment({ projectId: 'demo-egbc', firestore: { rules: padded(n), host: '127.0.0.1', port: PORT } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users', 'u_lena'), { memberId: 'm_u_lena', name: 'u_lena', teams: [], adminFor: [], masterAdmin: false, status: 'active' });
    await setDoc(doc(db, 'sites', 'site_bk'), { name: 'Test Booking Site', active: true, order: 3 });
    await setDoc(doc(db, 'bookingSettings', 'site_bk'), { bookingsAdmins: ['m_u_lena'], safeguardingLead: '', safeguardingDeputy: '' });
    await setDoc(doc(db, 'rooms', 'room_band'), { siteId: 'site_bk', name: 'Test Band Room', kind: 'room', active: true, order: 1, bookableByMembers: true, bookableByHirers: true, fireMax: 30, rotaWeek: week });
    for (const p of PARTS) await setDoc(doc(db, 'rooms', p), { siteId: 'site_bk', name: 'Part ' + p, kind: 'room', active: true, order: 2, bookableByMembers: true, bookableByHirers: true, rotaWeek: week });
    await setDoc(doc(db, 'rooms', 'room_hall'), { siteId: 'site_bk', name: 'Whole hall', kind: 'room', active: true, order: 3, bookableByMembers: true, bookableByHirers: true, parts: PARTS });
  });
  const lena = env.authenticatedContext('u_lena').firestore();
  const put = (key, b, days) => { const x = writeBatch(lena); x.set(doc(lena, 'bookings', key), b); (days || []).forEach(([room, sl]) => x.set(doc(lena, 'roomDays', room + '_' + b.day), { slots: sl, lastBooking: '', roomId: room, day: b.day, siteId: 'site_bk' })); return x.commit(); };
  const out = {};
  const run = async (k, f) => { try { await f(); out[k] = 'allow'; } catch (e) { out[k] = /maximum of 1000 expressions/.test(e.message) ? 'LIMIT' : 'deny'; } };
  await run('free', () => put('bk_ev_a'.padEnd(31, '0'), EV('2027-01-06'), [['room_band', held()]]));
  await run('noHold', () => put('bk_ev_b'.padEnd(31, '0'), EV('2027-01-13')));
  await run('overNoReason', () => put('bk_ev_c'.padEnd(31, '0'), EV('2027-01-06'), [['room_band', held(held())]]));
  await run('overReason', () => put('bk_ev_e'.padEnd(31, '0'), EV('2027-01-06', { override: true, decisionNote: 'Test: agreed with the choir' }), [['room_band', held(held())]]));
  await run('hall', () => put('bk_ev_h'.padEnd(31, '0'), EV('2027-01-20', { roomId: 'room_hall' }), PARTS.map((p) => [p, held()])));
  await env.cleanup();
  return out;
}
const WANT = { free: 'allow', noHold: 'deny', overNoReason: 'deny', overReason: 'allow' };
/* a refusal that hits the limit is still a refusal; a booking that should go through must */
const fine = (o) => Object.keys(WANT).every((k) => o[k] === WANT[k] || (WANT[k] === 'deny' && o[k] === 'LIMIT'));

const r0 = await cases(0);
ok('as the rules are: the office books a free room for an event; books over something with a reason; refused without holding the time, or without a reason', fine(r0), JSON.stringify(r0));
ok('   A WHOLE HALL MADE OF FOUR PARTS, booked for an event: not stopped by the 1,000 limit', r0.hall === 'allow', JSON.stringify(r0));
const r10 = await cases(10);
ok('WITH 10 SPARE EXPRESSIONS in signedIn() (main’s target): the office’s event booking all the same - nothing hits the limit', fine(r10), JSON.stringify(r10));
ok('   and the four-part hall too', r10.hall === 'allow', JSON.stringify(r10));
/* how much room there is, to the nearest step: the ordinary room, and the four-part hall */
let best = fine(r10) ? 10 : 0, bestHall = r0.hall === 'allow' ? 0 : -1;
/* (a very long padding stops the emulator loading the rules at all: that ends the search, not the test) */
for (const n of [20, 40, 80, 160]) {
  let r;
  try { r = await cases(n); } catch (e) { console.log('          at ' + n + ': the rules would not load (' + String(e.message).slice(0, 80) + ')'); break; }
  if (r.hall === 'allow') bestHall = n;
  if (!fine(r)) { console.log('          at ' + n + ': ' + JSON.stringify(r)); break; }
  best = n;
}
if (r10.hall === 'allow' && bestHall < 10) bestHall = 10;
console.log('          headroom: ordinary room ' + (best ? 'at least ' + best : 'under 10') + '; four-part hall ' + (bestHall >= 0 ? 'at least ' + bestHall : 'over the limit') + ' spare expressions');
ok('   room for at least 10 (main’s ask)', best >= 10, best);

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
