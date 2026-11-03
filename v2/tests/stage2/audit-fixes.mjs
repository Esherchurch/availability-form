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
 *     plan, and someone not on it is told so, with a way back;
 *   - on a phone, the Rota planner's More sheet keeps its title off
 *     Populate and Auto-Populate, and a sheet's sticky close is not pushed
 *     down by the page bar (3 Nov 2026);
 *   - Help sits above the page bar, so its close can be pressed on a
 *     phone, and Ask with nothing typed says so;
 *   - the hub's Menu sits above its top bar, so on a phone its close is
 *     not under the avatar;
 *   - the service planners' Save Schedule says "Saving…" at once, and a
 *     long event name no longer runs their page off a phone's screen;
 *   - the training copies' banner keeps Exit Training on a phone's screen,
 *     and the training planner's email preview keeps its Close in reach;
 *   - the mix builder's messages show on a phone, and again on a second press;
 *   - the first-visit tours' "Don't show this again" is 44px to tap;
 *   - the birthday invite maker's tick boxes are 44px, and its email invite
 *     keeps its close and buttons in reach.
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

  /* Whether a person's tap at the middle of el lands on it. */
  const free = (p, find) => p.evaluate((find) => { const el = eval(find); if (!el) return 'missing'; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h === el || el.contains(h) ? 'free' : 'under ' + (h ? h.tagName + '.' + h.className : 'nothing'); }, find);

  console.log('\nThe Rota planner\'s More sheet, on a phone');
  { const p = await fresh(lead, 'Planner.html', 375, 812); await sleep(7000);
    await p.evaluate(() => document.querySelector('#ppBar .pp-more').click()); await sleep(800);
    for (const w of ['Populate', 'Auto-Populate', 'Add Practices']) ok(w + ' can be pressed (the sheet\'s title is not over it)', (await free(p, '[...document.querySelectorAll("#ppSheet button")].find((b) => b.innerText.trim() === ' + JSON.stringify(w) + ')')) === 'free');
    ok('the sheet\'s title sticks to the sheet\'s top', await p.evaluate(() => Math.abs(document.querySelector('#ppSheet .pp-sh').getBoundingClientRect().top - document.getElementById('ppSheet').getBoundingClientRect().top) <= 1));
    ok('no errors', !p.__errs.length, p.__errs.join(' | ')); await p.browserContext().close(); }
  { const p = await fresh(lead, 'session-planner.html', 375, 812); await sleep(6000);
    ok('a sheet\'s sticky close keeps top 0 (session planner)', await p.evaluate(() => { const x = document.querySelector('.sheet .x'); return !x || getComputedStyle(x).top === '0px'; }));
    await p.browserContext().close(); }

  console.log('\nHelp, on a phone');
  { const p = await fresh(lead, 'view-only-rota.html', 375, 812); await sleep(6000);
    await p.evaluate(() => document.getElementById('egbc-help-btn').click()); await sleep(1200);
    ok('Help\'s close can be pressed (not under the page bar)', (await free(p, 'document.querySelector("#egbc-help .x")')) === 'free');
    const said = await p.evaluate(() => { const f = document.querySelector('#egbc-help form.ask'); if (!f) return 'no Ask box (signed out?)'; f.querySelector('textarea').value = ''; f.querySelector('button[type=submit]').click(); return f.querySelector('.answer').textContent; });
    ok('Ask with nothing typed says so', /Type your question first/.test(said), said);
    ok('no errors', !p.__errs.length, p.__errs.join(' | ')); await p.browserContext().close(); }

  console.log('\nThe hub\'s Menu, on a phone');
  { const p = await fresh(lead, 'hub.html', 375, 812); await sleep(7000);
    /* Someone on several teams is first asked "Which team today?"; they answer it before the Menu. */
    await p.evaluate(() => { if (document.getElementById('teamPicker').offsetParent !== null || getComputedStyle(document.getElementById('teamPicker')).display !== 'none') closeTeamPicker(); openTools(); }); await sleep(600);
    { const f = await free(p, 'document.querySelector("#panel .hd .x")'); ok('the Menu\'s close can be pressed (not under the avatar)', f === 'free', f); }
    await p.evaluate(() => document.querySelector('#panel .hd .x').click()); await sleep(500);
    ok('and it shuts the Menu', await p.evaluate(() => !document.getElementById('panel').classList.contains('on')));
    ok('no errors', !p.__errs.length, p.__errs.join(' | ')); await p.browserContext().close(); }

  console.log('\nThe service planners, on a phone');
  for (const pg of ['SundayServicePlanner.html', 'youthserviceplanner.html']) {
    const p = await fresh(lead, pg, 375, 812); await sleep(7000);
    const said = await p.evaluate(() => { window.alert = () => {}; const b = document.querySelector('button[onclick="saveSchedule()"]'); if (!b || b.disabled) return 'not pressable'; b.click(); return b.textContent; });
    ok(pg + ': Save Schedule says "Saving…" at once', said === 'Saving…', said);
    await sleep(1500);
    ok(pg + ': and gives the button back', await p.evaluate(() => document.querySelector('button[onclick="saveSchedule()"]').textContent === 'Save Schedule'));
    const wide = await p.evaluate(() => { const s = document.getElementById('eventSelect'); const o = document.createElement('option'); o.textContent = 'A very long event name, the kind a church gives its harvest all-age service'; s.appendChild(o); s.value = o.value; return document.documentElement.scrollWidth; });
    ok(pg + ': a long event name keeps the page on the screen', wide <= 375, wide + 'px');
    ok(pg + ': no errors', !p.__errs.length, p.__errs.join(' | ')); await p.browserContext().close(); }

  console.log('\nThe training copies, on a phone');
  for (const pg of ['trainingrotaplanner.html', 'trainingbatchimporter.html', 'trainingmusicdatabase.html', 'training Sunday planner.html']) {
    const p = await fresh(lead, pg, 375, 812); await sleep(7000);
    /* A song's row was what ran the practice Sunday planner off the screen. */
    if (/Sunday/.test(pg)) { await p.evaluate(() => { addSong(); addItem(); }); await sleep(500); }
    /* Content in a box that scrolls sideways is meant to be wider than the screen. */
    const inScroller = 'function(e){for(var a=e.parentElement;a&&a!==document.body;a=a.parentElement)if(/^(auto|scroll)$/.test(getComputedStyle(a).overflowX))return true;return false}';
    const wide = await p.evaluate((f) => { const ok = eval('(' + f + ')'); return Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('.service-block *')].filter((e) => !ok(e)).map((e) => Math.round(e.getBoundingClientRect().right))); }, inScroller);
    const widest = wide <= 375 ? '' : await p.evaluate((f) => { const ok = eval('(' + f + ')'); return [...document.querySelectorAll('body *')].filter((e) => !ok(e)).map((e) => [Math.round(e.getBoundingClientRect().right), e.tagName + (e.id ? '#' + e.id : '') + '.' + String(e.className).slice(0, 40)]).sort((a, b) => b[0] - a[0]).slice(0, 4).map((x) => x.join(' ')).join(' | '); }, inScroller);
    ok(pg + ': the page stays on the screen', wide <= 375, wide + 'px: ' + widest);
    ok(pg + ': Exit Training is big enough to tap', await p.evaluate(() => (document.getElementById('exit-btn') || document.getElementById('exit-training-btn')).getBoundingClientRect().height >= 44));
    if (pg === 'trainingrotaplanner.html') {
      /* Gather Avail opens it only once there are services to simulate; the fix is the box's own
         layout, so it is opened as Gather Avail does, with a long email in it. */
      await p.evaluate(() => { document.getElementById('ep-body').innerText = 'A long availability email.\n'.repeat(80); document.getElementById('emailPreviewModal').classList.add('show'); }); await sleep(500);
      await p.evaluate(() => { const b = document.querySelector('#emailPreviewModal .t-modal-box'); b.scrollTop = b.scrollHeight; }); await sleep(300);
      const f = await p.evaluate(() => { const el = document.querySelector('#emailPreviewModal button[onclick="closeEmailPreview()"]'); if (!document.getElementById('emailPreviewModal').classList.contains('show')) return 'not open'; const r = el.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h === el || el.contains(h) ? 'free' : 'under ' + (h ? h.tagName + '.' + h.className : 'nothing (scrolled away)'); });
      ok(pg + ': the email preview\'s Close is still there after scrolling it', f === 'free', f);
    }
    ok(pg + ': no errors', !p.__errs.length, p.__errs.join(' | ')); await p.browserContext().close(); }

  console.log('\nThe mix builder, on a phone');
  { const p = await fresh(lead, 'mix-builder.html', 375, 812); await sleep(7000);
    const seen = async (btn, box) => { await p.evaluate((btn) => { const b = document.getElementById(btn); b.scrollIntoView({ block: 'center' }); b.click(); }, btn); await sleep(400);
      return p.evaluate((box) => { const el = document.getElementById(box), r = el.getBoundingClientRect(); return el.textContent.trim() && r.bottom > 0 && r.top < innerHeight ? 'seen' : 'not seen: "' + el.textContent + '" at ' + Math.round(r.top); }, box); };
    for (const [btn, box, what] of [['normaliseBtn', 'status', 'Level the tracks'], ['renderBtn', 'renderStatus', 'Render the whole set']]) {
      const one = await seen(btn, box), two = await seen(btn, box);
      ok(what + ' with nothing loaded says so where it can be seen, each time', one === 'seen' && two === 'seen', one + ' / ' + two);
    }
    ok('no errors', !p.__errs.length, p.__errs.join(' | ')); await p.browserContext().close(); }

  console.log('\nThe first-visit tours, on a phone');
  for (const pg of ['CoreTeamApp.html', 'youthapp2.html']) {
    const p = await fresh(lead, pg, 375, 812); await sleep(7000);
    const got = await p.evaluate(() => { startTour(true); const l = document.querySelector('label[for="tour-dont-show"]'); if (!l) return 'no label'; const h = Math.round(l.getBoundingClientRect().height); l.click(); return h + 'px, ticked ' + document.getElementById('tour-dont-show').checked; });
    ok(pg + ': "Don\'t show this again" is 44px to tap, and ticks the box', /^(4[4-9]|[5-9]\d)px, ticked true$/.test(got), got);
    const skip = await p.evaluate(() => { const r = document.querySelector('.tour-skip').getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); });
    ok(pg + ': the tour\'s Skip is big enough to tap', skip >= 30, skip + 'px');
    ok(pg + ': no errors', !p.__errs.length, p.__errs.join(' | ')); await p.browserContext().close(); }

  console.log('\nThe birthday invite maker, on a phone');
  { const p = await fresh(lead, 'birthday.html', 375, 812); await sleep(7000);
    ok('"Custom colour for this part" is 44px to tap', await p.evaluate(() => document.getElementById('el-colon').closest('label').getBoundingClientRect().height >= 44));
    await p.evaluate(() => openEmail()); await sleep(800);
    const got = await p.evaluate(() => { const m = document.querySelector('#modal-back .modal'), body = m.querySelector('.modal-body'); body.scrollTop = body.scrollHeight; m.scrollTop = m.scrollHeight;
      const x = m.querySelector('.modal-head button'), r = x.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), foot = m.querySelector('.modal-foot').getBoundingClientRect();
      return (h === x || x.contains(h) ? 'close free' : 'close under ' + (h ? h.className : 'nothing')) + ', foot ' + (foot.bottom <= m.getBoundingClientRect().bottom + 1 ? 'shown' : 'clipped'); });
    ok('the email invite keeps its close and its buttons in reach after scrolling', got === 'close free, foot shown', got);
    ok('no errors', !p.__errs.length, p.__errs.join(' | ')); await p.browserContext().close(); }
} catch (e) { ok('the run itself', false, e && e.stack || e); }
finally { await b.close(); server.close(); }
console.log('\n' + R.filter(Boolean).length + ' of ' + R.length + ' checks passed');
process.exit(R.every(Boolean) ? 0 : 1);
