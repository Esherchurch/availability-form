/* THE CORE TEAM APP'S EMAILS AND THE HUB'S SHARED PAGES (Martin, 6 Nov 2026):
 *   - every email the hub offers goes through hubSend, never a mail link:
 *     Email Whole Team and Email This Person hand the send to the planner's
 *     spEmail (its route, its template, under-18s named); the team update goes
 *     through hubSend one copy each, under-18-only addresses left out and named;
 *   - the Core Team app's teams are the church's own: EGBC sees Worship, AV,
 *     Youth, Core, Choir and Everyone, as it always did;
 *   - "Open shared pages to everyone" works again: the rota's and the training
 *     portal's hub entries are opened to everyone, nothing else.
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth,functions \
 *     --project egbc-worship-planner "node tests/stage3/core-app-email.mjs"
 *
 * Made-up people only. Sends are caught in the page (EGBCAuth.sendEmail and
 * spEmail are watched), so nothing is posted, even to the emulator.
 */
import { serve, browser, person, signIn, put, get, wipe, inChurch, sleep } from '../stage2/harness.mjs';

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const J = (x) => JSON.stringify(x);

await wipe();
inChurch(null);
const mo = await person({ key: 'ce_mo', name: 'Mo Master (synthetic)', teams: ['Worship Team'], master: true, book: { masterAdmin: true } });
const core = await person({ key: 'ce_core', name: 'Cora Core (synthetic)', teams: ['Core Team'] });
const sing = await person({ key: 'ce_sing', name: 'Sam Singer (synthetic)', teams: ['Worship Team'] });
/* A young singer whose address only under-18s hold: never emailed, named instead. */
await put('addressBook/ab_ce_young', { name: 'Yo Young (synthetic)', email: 'ce_young@example.invalid', markers: ['Worship Team'], isMinor: true, under18: true, archived: false });
/* The hub's entries: the rota and the training portal shared, one that is not. */
await put('hubPages/hp_rota', { title: 'Rota', url: 'view-only-rota.html', team: 'Worship Team', order: 1, enabled: true, everyone: false });
await put('hubPages/hp_tp', { title: 'Training portal', url: 'trainingportalhub.html', team: 'Worship Team', order: 2, enabled: true, everyone: false });
await put('hubPages/hp_other', { title: 'Song library', url: 'Library.html', team: 'Worship Team', order: 3, enabled: true, everyone: false });

const server = await serve(8977);
const base = 'http://localhost:8977';
const b = await browser();
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));

try {
  /* ---- the Core Team app ---- */
  await signIn(page, base, mo, 'CoreTeamApp.html');
  await page.waitForFunction(() => window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile() && typeof emailTeam === 'function' && window.allMembers !== undefined, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => typeof allMembers !== 'undefined' && allMembers.length >= 3, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => {
    window.__sp = []; window.__sent = [];
    window.spEmail = (o) => { window.__sp.push(o || {}); return Promise.resolve(); };
    EGBCAuth.sendEmail = (m) => { window.__sent.push(m); return Promise.resolve({ ok: true }); };
    if (window.EGBCAuth.loadPerms) return EGBCAuth.loadPerms().catch(() => {});
  });
  await page.evaluate(() => emailTeam()); await sleep(500);
  const pick = await page.evaluate(() => [...document.querySelectorAll('#email-one-person option')].map((o) => o.textContent));
  ok('1. The email window\'s picker lists people by name, with no address shown', pick.length > 1 && !pick.some((t) => /@/.test(t)), J(pick));
  const mailLinks = await page.evaluate(() => [...document.querySelectorAll('#modal-email-team a[href^="mailto:"], #modal-mailing a[href^="mailto:"]')].length);
  ok('   and no mail link anywhere in it', mailLinks === 0, mailLinks);
  await page.evaluate(() => emailWholeTeam()); await sleep(300);
  const whole = await page.evaluate(() => window.__sp.slice(-1)[0]);
  ok('2. Email Whole Team hands the send to the planner\'s Email Team (hubSend), with the core team as well', whole && Array.isArray(whole.also) && whole.also.includes('ce_core@example.invalid'), J(whole));
  await page.evaluate(() => emailTeam()); await sleep(300);
  await page.evaluate(() => { const s = document.getElementById('email-one-person'); const i = [...s.options].findIndex((o) => /Sam Singer/.test(o.textContent)); s.selectedIndex = i; });
  await page.evaluate(() => emailOnePerson()); await sleep(300);
  const one = await page.evaluate(() => window.__sp.slice(-1)[0]);
  ok('3. Email This Person sends the same way, to the one picked', one && J(one.to) === J(['ce_sing@example.invalid']), J(one));

  await page.evaluate(() => openMailingSheet()); await sleep(1500);
  const chips = await page.evaluate(() => [...document.querySelectorAll('#team-chips .team-chip')].map((c) => c.textContent));
  ok('4. The mailing sheet\'s teams are the church\'s own: at EGBC Worship, AV, Youth, Core, Choir, Everyone, as before', J(chips) === J(['Worship', 'AV', 'Youth', 'Core', 'Choir', 'Everyone']), J(chips));
  await page.evaluate(() => { [...document.querySelectorAll('#team-chips .team-chip')].find((c) => c.textContent === 'Worship').click(); });
  await page.evaluate(() => launchEmail()); await sleep(1500);
  const sent = await page.evaluate(() => window.__sent);
  const to = sent.map((m) => (m.to || []).join(','));
  ok('5. The team update goes through the hub (source compiler), one copy to each person', sent.length >= 2 && sent.every((m) => m.source === 'compiler' && (m.to || []).length === 1), J(sent.map((m) => ({ source: m.source, to: m.to }))));
  ok('   never to an address only under-18s hold', !to.includes('ce_young@example.invalid'), J(to));
  const toast = await page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
  ok('   and they are named', /Not emailed \(under 18\): Yo Young/.test(toast), toast);
  ok('   the subject in the church\'s own words', sent[0] && /^Worship & AV Team Update$/.test(sent[0].subject), sent[0] && sent[0].subject);
  ok('   no errors on the page', !errs.length, J(errs));

  /* ---- the hub's shared pages ---- */
  errs.length = 0;
  await signIn(page, base, mo, 'hub.html');
  await page.waitForFunction(() => typeof markSharedPages === 'function' && typeof PAGES !== 'undefined' && PAGES.length >= 3, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => { window.confirm = () => true; window.alert = (m) => { window.__alert = m; }; return markSharedPages(); }); await sleep(1500);
  const rota = await get('hubPages/hp_rota'), tp = await get('hubPages/hp_tp'), other = await get('hubPages/hp_other');
  ok('6. "Open shared pages to everyone" opens the rota and the training portal to everyone', rota && rota.everyone === true && tp && tp.everyone === true, J([rota, tp]));
  ok('   and nothing else', other && other.everyone === false, J(other));
  ok('   and says how many', /2 now open to everyone/.test(await page.evaluate(() => window.__alert || '')), await page.evaluate(() => window.__alert || ''));
  const btn = await page.evaluate(() => { openAdmin(); adminTab('pages'); return [...document.querySelectorAll('button')].some((x) => /Open shared pages to everyone/.test(x.textContent)); });
  ok('   its button is on the Pages tab', btn);
  ok('   no errors on the page', !errs.length, J(errs));
} catch (e) {
  ok('the run finished', false, e.stack);
}
await b.close().catch(() => {});
server.close();
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
