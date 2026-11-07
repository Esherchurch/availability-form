/* THE ROTA NAMES THE SLOT IT CHANGES (7 Nov 2026).
 *
 * The rules' under-18s check (safeguardingOk, 10 Oct 2026) learns which rota
 * slot a change fills from the event's lastSlot, and checks it is the one slot
 * that changed. No page ever sent it, so on a team that works with under-18s
 * no slot could be filled or emptied, by anyone, and the refusal was an
 * unhandled error (the first-view audit: Planner.html, master and area admin).
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth,functions \
 *     --project egbc-worship-planner "node tests/stage3/rota-slot-named.mjs"
 *
 * Both ways, on the Planner and on the shared rota code (egbc-core-rota.js):
 *   - a cleared person (here by the safeguarding lead's recorded exception) is
 *     put on an under-18s team's slot and taken off again;
 *   - a person who is not cleared is still refused, and the Planner says why
 *     in words, with no unhandled error;
 *   - a team that does not work with under-18s is filled as before.
 * Made-up people only.
 */
import { serve, browser, person, signIn, put, get, wipe, inChurch, sleep } from '../stage2/harness.mjs';

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const J = (x) => JSON.stringify(x);

await wipe();
inChurch(null);
const mo = await person({ key: 'rs_mo', name: 'Mo Master (synthetic)', teams: ['Worship Team'], adminFor: ['Worship Team'], master: true, book: { masterAdmin: true } });
const sam = await person({ key: 'rs_sam', name: 'Sam Singer (synthetic)', teams: ['Worship Team'] });
const cleo = await person({ key: 'rs_cleo', name: 'Cleo Cleared (synthetic)', teams: ['Youth Worship'] });
const kit = await person({ key: 'rs_kit', name: 'Kit Notcleared (synthetic)', teams: ['Youth Worship'] });
/* The church's under-18s teams, as functions/under18-teams.js keeps them. */
await put('teamFlags/under18', { teams: ['Kids Church', 'Kids & Youth Core Team', 'Lazers', 'ReNu', 'Youth Worship'], at: new Date().toISOString() });
/* Cleo is cleared by an exception the safeguarding lead recorded, with a reason. */
await put('rotaExceptions/' + cleo.member, { reason: 'Synthetic: checks are booked, the lead has seen the paperwork.', by: mo.uid, at: new Date().toISOString() });
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
await put('events/rs_worship', { date: day(9), type: 'Sunday Morning Worship', termLabel: 'Synthetic', teams: ['Worship Team'], roles: ['Keys'], assignments: {}, archived: false });
await put('events/rs_youth', { date: day(10), type: 'Youth Worship', termLabel: 'Synthetic', teams: ['Youth Worship'], roles: ['Guitar', 'Drums'], assignments: {}, archived: false });

const server = await serve(8979);
const base = 'http://localhost:8979';
const b = await browser();
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
const rotaSaid = [];
page.on('console', (m) => { if (m.text().startsWith('[rota] ')) rotaSaid.push(m.text()); });
page.on('console', (m) => { if (m.type() === 'error' && /Uncaught|PERMISSION_DENIED|evaluation error/i.test(m.text())) errs.push(m.text().slice(0, 200)); });

try {
  /* ---- the Planner ---- */
  await signIn(page, base, mo, 'Planner.html');
  await page.waitForFunction(() => typeof window.assignPerson === 'function' && window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile(), { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  await page.evaluate(() => { window.__alerts = []; window.alert = (m) => window.__alerts.push(String(m)); window.confirm = () => true; });

  const r1 = await page.evaluate((m) => window.assignPerson('rs_worship', 'Keys', m.member, m.name), { member: sam.member, name: sam.name });
  let ev = await get('events/rs_worship');
  ok('1. A team that does not work with under-18s: Sam goes on Keys, as before', r1 === true && ev.assignments.Keys && ev.assignments.Keys.id === sam.member, J(ev));
  ok('   and the slot is named', ev.lastSlot === 'Keys', ev.lastSlot);

  const r2 = await page.evaluate((m) => window.assignPerson('rs_youth', 'Guitar', m.member, m.name), { member: cleo.member, name: cleo.name });
  ev = await get('events/rs_youth');
  ok('2. An under-18s team: Cleo, cleared, goes on Guitar (refused before: no slot named)', r2 === true && ev.assignments.Guitar && ev.assignments.Guitar.id === cleo.member, J([r2, ev, await page.evaluate(() => window.__alerts)]));

  const r3 = await page.evaluate(() => window.unassignPerson('rs_youth', 'Guitar'));
  ev = await get('events/rs_youth');
  ok('3. and taken off again', r3 === true && !ev.assignments.Guitar, J(ev));

  const r4 = await page.evaluate((m) => window.assignPerson('rs_youth', 'Drums', m.member, m.name), { member: kit.member, name: kit.name });
  ev = await get('events/rs_youth');
  const said = await page.evaluate(() => window.__alerts.slice(-1)[0] || '');
  ok('4. Kit, not cleared, is still refused on an under-18s team', r4 === false && !ev.assignments.Drums, J([r4, ev]));
  ok('   and the Planner says why, in words', /DBS check and safeguarding training/.test(said), said);

  /* A move is two saves; refused at the first, the second is not tried. */
  await page.evaluate((m) => window.assignPerson('rs_youth', 'Guitar', m.member, m.name), { member: cleo.member, name: cleo.name });
  await sleep(300);
  ok('5. No unhandled error on the page', !errs.length, J(errs));

  /* ---- the shared rota code (egbc-core-rota.js), as the Core Team app loads it ---- */
  errs.length = 0;
  await signIn(page, base, mo, 'CoreTeamApp.html');
  await page.waitForFunction(() => typeof window.assignPerson === 'function' && typeof window.unassignPerson === 'function' && window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile(), { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  const c1 = await page.evaluate(() => window.unassignPerson('rs_youth', 'Guitar').then(() => 'saved', (e) => 'refused: ' + (e && e.code)));
  ev = await get('events/rs_youth');
  ok('6. The shared rota code empties an under-18s slot', c1 === 'saved' && !ev.assignments.Guitar && ev.lastSlot === 'Guitar', J([c1, ev]));
  const c2 = await page.evaluate((m) => window.assignPerson('rs_youth', 'Guitar', m.member, m.name).then(() => 'saved', (e) => 'refused: ' + (e && e.code)), { member: cleo.member, name: cleo.name });
  ev = await get('events/rs_youth');
  ok('7. and fills it with a cleared person', c2 === 'saved' && ev.assignments.Guitar && ev.assignments.Guitar.id === cleo.member, J([c2, ev]));
  /* The rota code's own wrapper (A REFUSED SAVE SAYS SO) says it and gives false. */
  const c3 = await page.evaluate((m) => window.assignPerson('rs_youth', 'Drums', m.member, m.name), { member: kit.member, name: kit.name });
  ev = await get('events/rs_youth');
  ok('8. and still refuses one who is not cleared', c3 === false && !ev.assignments.Drums, J([c3, ev]));
  /* the toast, or the console when the rota is not mounted on screen (H.toast's own default) */
  const told = (await page.evaluate(() => (document.getElementById('toast') || {}).textContent || '')) + ' ' + rotaSaid.join(' | ');
  ok('   and says why: on an under-18s team, the checks', /DBS check and safeguarding training/.test(told), told);
  /* Kit picked for Cleo's place on the rota sheet (doAssign): refused, Cleo stays on. */
  await page.evaluate((m) => window.doAssign('rs_youth', 'Guitar', m.member, m.name), { member: kit.member, name: kit.name });
  await sleep(500);
  ev = await get('events/rs_youth');
  ok('9. Picking Kit for Cleo\'s place is refused, and Cleo stays on', ev.assignments.Guitar && ev.assignments.Guitar.id === cleo.member && !ev.assignments.Drums, J(ev));
  ok('   no unhandled error on the page', !errs.length, J(errs));
} catch (e) {
  ok('the run finished', false, e.stack);
}
await b.close().catch(() => {});
server.close();
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
