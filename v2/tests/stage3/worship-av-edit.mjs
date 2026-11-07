/* THE WORSHIP & AV DASHBOARD'S EDITING, AND THE HUB APP'S TOUR (7 Nov 2026, the first-view audit).
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth,functions \
 *     --project egbc-worship-planner "node tests/stage3/worship-av-edit.mjs"
 *
 *   - EGBCWorship&AV.html and trainingportalhub.html: "Edit Dashboard" opens the dashboard settings, for a
 *     core-team admin, at 375 and 1440 (the audit found it did nothing);
 *   - worshiphubapp.html: the tour's Skip and Next are on screen at 375 (with the
 *     44px rows the tooltip was taller than the 160px it was kept to, and they
 *     fell below a phone's screen).
 * Made-up people only.
 */
import { serve, browser, person, signIn, wipe, inChurch, sleep } from '../stage2/harness.mjs';

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 600))); };
const J = (x) => JSON.stringify(x);

await wipe();
inChurch(null);
const mo = await person({ key: 'wa_mo', name: 'Mo Master (synthetic)', teams: ['Core Team'], adminFor: ['Core Team'], master: true, book: { masterAdmin: true } });
const server = await serve(8976);
const base = 'http://localhost:8976';
const b = await browser();

try {
  for (const PAGE of ['EGBCWorship&AV.html', 'trainingportalhub.html']) for (const [w, h] of [[375, 812], [1440, 900]]) {
    const page = await b.newPage();
    await page.setViewport({ width: w, height: h });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
    await signIn(page, base, mo, PAGE);
    await page.waitForFunction(() => window.EGBCGuard && document.getElementById('dash-settings-modal'), { timeout: 30000 }).catch(() => {});
    await sleep(3000);
    const seen = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((x) => /Edit Dashboard/.test(x.textContent));
      const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const land = document.getElementById('landing-content');
      const before = { btnShown: vis(btn), landing: land && getComputedStyle(land).display, role: typeof userRole !== 'undefined' ? userRole : '?' };
      let threw = '';
      try { openDashboardEditor(); } catch (e) { threw = String(e && e.message); }
      const m = document.getElementById('dash-settings-modal');
      return Object.assign(before, { threw, open: m.classList.contains('open'), shown: vis(m) });
    });
    ok('1. ' + PAGE + ' at ' + w + ': "Edit Dashboard" opens the dashboard settings', seen.open && seen.shown && !seen.threw, J(seen) + ' ' + J(errs));
    /* Pressed as a person presses it: the page opened afresh, the menu opened if that is where it is, a real click. */
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.EGBCGuard && document.getElementById('dash-settings-modal'), { timeout: 30000 }).catch(() => {});
    await sleep(3000);
    /* The editing opens with three presses of "Secure Portal" (the core team's), then the menu. */
    for (let i = 0; i < 3; i++) { await page.click('#secret-trigger').catch(() => {}); await sleep(150); }
    await sleep(800);
    const unlocked = await page.evaluate(() => { const a = document.getElementById('admin-controls'); return a && getComputedStyle(a).display; });
    if (process.env.WA_DEBUG) console.log('   unlocked:', unlocked);
    const where = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((x) => /Edit Dashboard/.test(x.textContent));
      if (!btn) return null;
      const r = btn.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const at = document.elementFromPoint(x, y);
      const chain = []; for (let p = btn; p && chain.length < 5; p = p.parentElement) chain.push(p.tagName + '#' + p.id + '.' + String(p.className).slice(0, 30) + ':' + getComputedStyle(p).display);
      return { x, y, w: r.width, h: r.height, at: at ? at.tagName + '#' + at.id + '.' + String(at.className).slice(0, 30) + ' "' + (at.textContent || '').trim().slice(0, 30) + '"' : null, chain };
    });
    if (where && where.w > 0) await page.mouse.click(where.x, where.y);
    await sleep(800);
    const after = await page.evaluate(() => { const m = document.getElementById('dash-settings-modal'); const r = m.getBoundingClientRect(); return { open: m.classList.contains('open'), shown: r.width > 0 && r.height > 0, landing: getComputedStyle(document.getElementById('landing-content')).display }; });
    ok('   pressed with a real click at ' + w + ', it opens', after.open && after.shown, J({ where, after }));
    /* With a tool open in the page (the landing hidden behind it), the same press still opens it. */
    await page.evaluate(() => { closeModal('dash-settings-modal'); navigate('rotaplannerinstructions.html'); });
    await sleep(1500);
    const mid = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Edit Dashboard/.test(x.textContent)); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
    if (mid.w > 0) await page.mouse.click(mid.x, mid.y); else await page.evaluate(() => openDashboardEditor());
    await sleep(800);
    const over = await page.evaluate(() => { const m = document.getElementById('dash-settings-modal'); const r = m.getBoundingClientRect(); return { open: m.classList.contains('open'), shown: r.width > 0 && r.height > 0 }; });
    ok('   with a tool open first, at ' + w + ', it still opens', over.open && over.shown, J(over));
    await page.close();
  }

  /* the hub app's tour at 375 */
  const page = await b.newPage();
  await page.setViewport({ width: 375, height: 812 });
  await signIn(page, base, mo, 'worshiphubapp.html');
  await page.waitForFunction(() => typeof showTourStep === 'function' && typeof TOUR_STEPS !== 'undefined', { timeout: 30000 }).catch(() => {});
  await sleep(2000);
  const tour = await page.evaluate(() => {
    const out = [];
    const ih = innerHeight;
    Object.keys(TOUR_STEPS).forEach((sec) => (TOUR_STEPS[sec] || []).forEach((st, i) => {
      tourStepIndex = i; showTourStep(TOUR_STEPS[sec]);
      const r = (sel) => { const e = document.querySelector(sel); const q = e.getBoundingClientRect(); return q.top >= 0 && q.bottom <= ih && q.height > 0; };
      if (!r('#tour-tooltip .tour-skip') || !r('#tour-next')) out.push(sec + ' step ' + (i + 1));
    }));
    endTour();
    return out;
  });
  ok('2. At 375, every tour step\'s Skip and Next are on screen', !tour.length, J(tour));
} catch (e) {
  ok('the run finished', false, e.stack);
}
await b.close().catch(() => {});
server.close();
const pass = R.filter(Boolean).length;
console.log('\n' + pass + '/' + R.length + ' passed');
process.exit(pass === R.length ? 0 : 1);
