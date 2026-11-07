/* MARTIN'S TWO DECISIONS OF 7 NOV 2026, each with someone who should see it and someone who shouldn't,
 * at 375 and 1440.
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth,functions \
 *     --project egbc-worship-planner "node tests/stage3/portal-and-desk.mjs"
 *
 * 1. Secure Portal on the Worship & AV dashboard shows only to the people it works for, the core
 *    level (the church's own core teams, from its teams): a Core Team member sees it, and its three
 *    presses open editing; a Worship Team member does not see it.
 * 2. The Sunday check-in desk shows in the Menu, and in the app's Kids section, to each group's
 *    leaders and that morning's Session Leader as well - exactly the people kids-checkin lets in. A
 *    Kids Church member who is neither is not offered it, and the page itself agrees each way.
 * Made-up people only.
 */
import { serve, browser, person, signIn, put, wipe, inChurch, sleep } from '../stage2/harness.mjs';

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const J = (x) => JSON.stringify(x);

await wipe();
inChurch(null);
const core = await person({ key: 'pd_core', name: 'Cora Core (synthetic)', teams: ['Core Team'] });
const worship = await person({ key: 'pd_worship', name: 'Sam Singer (synthetic)', teams: ['Worship Team'] });
const sl = await person({ key: 'pd_sl', name: 'Sol Session (synthetic)', teams: ['Kids Church'] });
const gl = await person({ key: 'pd_gl', name: 'Gil Groupleader (synthetic)', teams: ['Kids Church'] });
const plain = await person({ key: 'pd_plain', name: 'Pat Helper (synthetic)', teams: ['Kids Church'] });
/* A site whose children's team is Kids Church, a group Gil leads, and today's rota with Sol as Session Leader. */
const today = new Date().toISOString().slice(0, 10);
await put('sites/pd_site', { name: 'Synthetic church hall', active: true, order: 1 });
await put('kidsSettings/pd_site', { teams: ['Kids Church'] });
await put('kidsGroups/pd_g1', { siteId: 'pd_site', name: 'Synthetic Juniors', years: ['Year 3'], day: 7, start: '10:30', end: '12:00', ratio: 5, active: true, leaderIds: [gl.member] });
await put('events/pd_today', { date: today, type: 'Kids Church', termLabel: 'Synthetic', teams: ['Kids Church'], roles: ['Session Leader'], assignments: { 'Session Leader': { id: sl.member, name: sl.name } }, archived: false });

const server = await serve(8974);
const base = 'http://localhost:8974';
const b = await browser();
const SIZES = [[375, 812], [1440, 900]];

/** The Menu's pages for whoever is signed in, once the sign-in's extra reads are in. */
const menuPages = (page) => page.evaluate(async () => {
  for (let i = 0; i < 40 && !(window.EGBCMenu && EGBCAuth.profile && EGBCAuth.profile()); i++) await new Promise((r) => setTimeout(r, 250));
  await new Promise((r) => setTimeout(r, 2500));
  const out = []; (function walk(n) { (n || []).forEach((x) => { if (x.url) out.push(String(x.url).split('?')[0]); walk(x.children); }); })(EGBCMenu.forPerson(EGBCMenu.who()));
  return out;
});

try {
  for (const [w, h] of SIZES) {
    /* ---- 1. Secure Portal ---- */
    for (const [who, should] of [[core, true], [worship, false]]) {
      const page = await b.newPage(); await page.setViewport({ width: w, height: h });
      await signIn(page, base, who, 'EGBCWorship&AV.html');
      await page.waitForFunction(() => window.EGBCGuard && document.getElementById('secret-trigger'), { timeout: 30000 }).catch(() => {});
      await sleep(4000);
      const seen = await page.evaluate(() => { const t = document.getElementById('secret-trigger'); const r = t.getBoundingClientRect(); return { shown: getComputedStyle(t).display !== 'none' && r.width > 0 && r.height > 0, h: Math.round(r.height) }; });
      ok('1. ' + w + ': Secure Portal ' + (should ? 'shows to a Core Team member' : 'is not shown to a Worship Team member'), seen.shown === should, J(seen));
      if (should) {
        for (let i = 0; i < 3; i++) { await page.click('#secret-trigger'); await sleep(150); }
        await sleep(500);
        const open = await page.evaluate(() => getComputedStyle(document.getElementById('admin-controls')).display !== 'none');
        ok('   and its three presses open editing (44px tall: ' + seen.h + ')', open && seen.h >= 44, J({ open, h: seen.h }));
      }
      await page.close();
    }

    /* ---- 2. The check-in desk ---- */
    for (const [who, label, should] of [[sl, 'today\'s Session Leader', true], [gl, 'a group\'s leader', true], [plain, 'a Kids Church member who is neither', false]]) {
      const page = await b.newPage(); await page.setViewport({ width: w, height: h });
      await signIn(page, base, who, 'hub.html');
      const menu = await menuPages(page);
      ok('2. ' + w + ': the Menu ' + (should ? 'offers' : 'does not offer') + ' the check-in desk to ' + label, menu.includes('kids-checkin.html') === should, J(menu.filter((u) => /kids/.test(u))));
      /* The app's Kids > Team screen: its tile follows the Menu (menuOffers). */
      await page.goto(base + '/app.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.EGBCApp && EGBCApp.who && EGBCApp.who(), { timeout: 30000 }).catch(() => {});
      await sleep(3000);
      await page.evaluate(() => { const x = document.createElement('button'); x.setAttribute('data-act', 'go:kids:team'); x.style.display = 'none'; document.body.appendChild(x); x.click(); x.remove(); });
      await sleep(1500);
      const tile = await page.evaluate(() => [...document.querySelectorAll('[data-act="open:kids-checkin.html"]')].some((e) => e.getBoundingClientRect().height > 0));
      ok('   and the app\'s Kids section ' + (should ? 'shows' : 'does not show') + ' its tile', tile === should, tile);
      /* The page itself agrees. */
      await page.goto(base + '/kids-checkin.html', { waitUntil: 'domcontentloaded' });
      await sleep(6000);
      const refused = await page.evaluate(() => !!document.body.getAttribute('data-egbc-blocked') || /isn.t for you|This page is for /i.test(document.body.innerText.slice(0, 600)));
      ok('   and kids-checkin ' + (should ? 'lets them in' : 'turns them away'), refused === !should, refused ? 'refused' : 'let in');
      await page.close();
    }
  }
} catch (e) {
  ok('the run finished', false, e.stack);
}
await b.close().catch(() => {});
server.close();
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
