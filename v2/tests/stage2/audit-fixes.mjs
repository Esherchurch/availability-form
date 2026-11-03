/* GOING-LIVE TEST, STAGE 2: THE CLICK-EVERYTHING RUN'S FIXES (2 Nov 2026).
 *
 *   node tools/secret-stand-ins.mjs
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth,storage,functions --project egbc-worship-planner "node tests/stage2/audit-fixes.mjs"
 *
 * In a browser, on the spare emulators with the locked rules, made-up people:
 *   - a page on egbc-db.js whose Firestore stops itself ("INTERNAL
 *     ASSERTION FAILED") says so at once, with Reload (the Rota planner and
 *     Performance notes, two of the eleven pages on it);
 *   - worshiphubapp.html sends everyone to the hub app's worship Rota, and
 *     EGBCWorship&AV.html to the hub;
 *   - Performance notes opened from the app sits between the app's header
 *     and tab bar, at phone and desktop size, and the Switch sheet opens
 *     over it and closes again;
 *   - the hub's notices panel makes the page behind it inert, and gives it
 *     back on close;
 *   - song-summary opens for a preacher on no team who is on that Sunday's
 *     plan, and someone not on it is told so, with a way back.
 */
import { serve, browser, person, signIn, put, wipe, sleep } from './harness.mjs';
import { EGBC_UNDER18 } from '../../functions/under18-teams.js';
import { boardsOf } from '../../functions/team-boards.js';

const SERVE = 8999, BASE = 'http://localhost:' + SERVE;
const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 400))); };
const DATE = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);

await wipe();
await put('teamFlags/under18', { teams: EGBC_UNDER18.slice().sort() });
await put('teamFlags/boards', { boards: boardsOf([]) });
const lead = await person({ key: 'af_lead', name: 'Ava Lead Synthetic', teams: ['Worship Team', 'AV Team'], adminFor: ['Worship Team', 'AV Team'], master: true, book: { masterAdmin: true } });
const preacher = await person({ key: 'af_preach', name: 'Pip Preacher Synthetic', teams: [] });
const other = await person({ key: 'af_other', name: 'Ola Other Synthetic', teams: [] });
await put('songSummaries/' + DATE, { date: DATE, items: [{ title: 'Hymn For The Plan Synthetic', key: 'G' }], audience: [preacher.uid], audienceUnresolved: [] });
await put('news/af_n1', { title: 'Synthetic notice', body: '<p>Words</p>', teams: [], createdAt: new Date().toISOString(), date: '', pinned: false });
const server = await serve(SERVE);
const b = await browser();
const fresh = async (who, url, w = 1280, h = 900) => { const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: h }); p.__errs = []; p.on('pageerror', (e) => p.__errs.push(e.message)); if (who) await signIn(p, BASE, who, url); else await p.goto(BASE + '/' + url); return p; };
try {
  console.log('\nFirestore stopping itself is said out loud');
  for (const url of ['Planner.html', 'Performancenotes.html']) {
    const p = await fresh(lead, url);
    await sleep(6000);
    /* As the browser tells the page when the SDK's promise fails and nobody catches it. */
    const reject = (msg) => p.evaluate((msg) => { const pr = Promise.reject(new Error(msg)); pr.catch(() => {}); window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: pr, reason: new Error(msg) })); }, msg);
    await reject('FIRESTORE (10.7.1) INTERNAL ASSERTION FAILED: Unexpected state');
    const bar = await p.waitForSelector('#egbc-db-broke', { timeout: 5000 }).then(() => p.evaluate(() => document.getElementById('egbc-db-broke').innerText), () => '');
    ok(url + ': the banner says the page lost its link, and offers Reload', /lost its link/.test(bar) && /Reload/.test(bar), bar);
    await reject('some other rejection');
    await reject('FIRESTORE (10.7.1) INTERNAL ASSERTION FAILED: Unexpected state');
    ok(url + ': only once, and not for other errors', await p.evaluate(() => document.querySelectorAll('#egbc-db-broke').length) === 1);
    await p.browserContext().close();
  }

  console.log('\nThe old Worship Hub sends people to the hub app');
  { const p = await fresh(lead, 'worshiphubapp.html'); await sleep(6000);
    ok('worshiphubapp.html lands on the hub app\'s worship Rota', await p.evaluate(() => /app\.html$/.test(location.pathname) && location.hash === '#worship:rota' && document.querySelector('[data-tab="rota"][aria-current="page"]') !== null), await p.evaluate(() => location.href));
    ok('no errors', !p.__errs.length, p.__errs.join(' | ')); await p.browserContext().close(); }
  { const p = await fresh(lead, 'EGBCWorship%26AV.html'); await sleep(6000);
    ok('EGBCWorship&AV.html lands on the hub, with its notices', await p.evaluate(() => /hub\.html$/.test(location.pathname) && !!document.getElementById('latestBtn')), await p.evaluate(() => location.href));
    ok('no errors', !p.__errs.length, p.__errs.join(' | ')); await p.browserContext().close(); }

  console.log('\nPerformance notes, opened from the app');
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    const p = await fresh(lead, 'app.html#worship:team', w, h);
    await sleep(6000);
    await p.evaluate(() => document.querySelector('[data-act="open:Performancenotes.html"]').click());
    await sleep(6000);
    const lay = await p.evaluate(() => { const top = document.getElementById('egbc-am-top').getBoundingClientRect().bottom, tabs = document.getElementById('egbc-am-tabs').getBoundingClientRect().top, s = document.getElementById('startScreen').getBoundingClientRect(), l = document.getElementById('loadBtn'); const r = l.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { top, tabs, st: s.top, sb: s.bottom, loadFree: hit === l || l.contains(hit) }; });
    ok(w + 'px: the stage page sits between the app\'s header and tab bar, and Load Service is clear', Math.abs(lay.st - lay.top) <= 1 && Math.abs(lay.sb - lay.tabs) <= 1 && lay.loadFree, JSON.stringify(lay));
    await p.evaluate(() => document.querySelector('#egbc-am-top .am-switch').click()); await sleep(600);
    const open = await p.evaluate(() => !!document.getElementById('egbc-am-modes'));
    await p.keyboard.press('Escape'); await sleep(400);
    const shut = await p.evaluate(() => !document.getElementById('egbc-am-modes'));
    await p.evaluate(() => document.querySelector('#egbc-am-top .am-switch').click()); await sleep(600);
    await p.evaluate(() => document.querySelector('#egbc-am-modes .am-x').click()); await sleep(400);
    const shut2 = await p.evaluate(() => !document.getElementById('egbc-am-modes'));
    ok(w + 'px: Switch opens over it, and Escape and its close both shut it', open && shut && shut2, JSON.stringify({ open, shut, shut2 }));
    ok(w + 'px: no errors', !p.__errs.length, p.__errs.join(' | '));
    await p.browserContext().close();
  }

  console.log('\nThe hub\'s notices panel');
  { const p = await fresh(lead, 'hub.html?notices=1', 390, 844); await sleep(7000);
    const st = await p.evaluate(() => ({ open: document.getElementById('latestPanel').classList.contains('on'), behind: [...document.body.children].filter((e) => !['latestPanel', 'latestScrim'].includes(e.id) && e.tagName !== 'SCRIPT' && e.offsetParent !== null).map((e) => (e.id || e.className || e.tagName) + ':' + e.inert) }));
    ok('open, everything visible behind it is inert', st.open && st.behind.length > 0 && st.behind.filter((x) => !/^egbc-(help|care|nav)/.test(x)).every((x) => x.endsWith(':true')), JSON.stringify(st));
    await p.evaluate(() => closeLatest()); await sleep(300);
    ok('closed, it is all given back', await p.evaluate(() => [...document.body.children].every((e) => !e.inert)));
    await p.evaluate(() => { openLatest(); openNewsEditor(); }); await sleep(500);
    ok('a notice editor opened from the panel still works (not inert)', await p.evaluate(() => { const m = document.getElementById('newsModal'); return !m.inert && !!document.getElementById('nwTitle'); }));
    ok('no errors', !p.__errs.length, p.__errs.join(' | ')); await p.browserContext().close(); }

  console.log('\nThe Sunday song list');
  { const p = await fresh(preacher, 'song-summary.html?date=' + DATE); await sleep(7000);
    const t = await p.evaluate(() => document.body.innerText);
    ok('a preacher on no team, on that Sunday\'s plan, sees its songs', /Hymn For The Plan Synthetic/.test(t), t.slice(0, 300)); await p.browserContext().close(); }
  { const p = await fresh(other, 'song-summary.html?date=' + DATE); await sleep(7000);
    const t = await p.evaluate(() => document.body.innerText);
    ok('someone not on it is told the plan went to the people serving, with a way back, and sees no songs', /sent to the people serving/.test(t) && !/Hymn For The Plan/.test(t) && await p.evaluate(() => !!document.querySelector('a[href="hub.html"]')), t.slice(0, 300)); await p.browserContext().close(); }
} catch (e) { ok('the run itself', false, e && e.stack || e); }
finally { await b.close(); server.close(); }
console.log('\n' + R.filter(Boolean).length + ' of ' + R.length + ' checks passed');
process.exit(R.every(Boolean) ? 0 : 1);
