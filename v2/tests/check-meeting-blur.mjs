/* A BLANK NOTES BOX WIPES A MEETING'S WORDS ONLY ON PURPOSE.
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth --project egbc-worship-planner "node tests/check-meeting-blur.mjs"
 *   firebase emulators:exec --config firebase.churches-spare.json ... "node tests/check-meeting-blur.mjs st-aidans-test"
 *   BREAK=1 ...   egbc-auth.js with no guard: the unread blank must fail
 *   BREAK=2 ...   egbc-auth.js refusing every blank: clearing must fail
 *
 * The rota's notes box saves on blur (Planner.html, egbc-core-rota.js in the
 * Core Team app), and for a hub meeting it can be blank for a moment before
 * the meeting's own part (meetings/{id}) is read. In a browser, with the
 * locked rules (EGBC's, or the church rules for a church named on the
 * command line), as a made-up worship leader: a blank saved before the
 * notes were read keeps them; once read, clearing the box clears them, and
 * typed words save.
 */
import { serve, browser, person, signIn, put, get, wipe, sleep, inChurch } from './stage2/harness.mjs';
import { EGBC_UNDER18 } from '../functions/under18-teams.js';
import { boardsOf } from '../functions/team-boards.js';

const BREAK = process.env.BREAK || '', CID = process.argv[2] || null, SERVE = 8995, BASE = 'http://localhost:' + SERVE;
const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 300))); };
const inDays = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };
/* The page's guard, as egbc-auth.js has it (BREAK takes it out or makes it refuse every blank). */
const GUARD = /if \(\(field === 'description' \|\| field === 'title'\) && !String\(value == null \? '' : value\)\.trim\(\) && !MEETING_CACHE\[id\]\) return Promise\.resolve\(\);/;
const ALL_BLANKS = "if ((field === 'description' || field === 'title') && !String(value == null ? '' : value).trim()) return Promise.resolve();";

inChurch(CID);
console.log(CID ? 'In the test church ' + CID + ' (church rules)' : 'In EGBC\'s top level (locked rules)');
await wipe();
const server = await serve(SERVE);
const b = await browser();
try {
  await put('teamFlags/under18', { teams: EGBC_UNDER18.slice().sort() });
  await put('teamFlags/boards', { boards: boardsOf([]) });
  const lead = await person({ key: 'blur_lead', name: 'Blur Lead Synthetic', teams: ['Worship Team', 'Core Team'], adminFor: ['Worship Team'] });
  const date = inDays(9), old = inDays(-730);
  await put('events/hub_meet', { date, startTime: '19:30', endTime: '21:00', type: 'Core Team Meeting', teams: ['Core Team'], meeting: true, archived: false, draft: false, roles: [], assignments: {} });
  /* hub_old: its own part only, no rota row, so this page never reads its notes. */
  /* Its title is its kind and these notes ("Core Team Meeting · Plan the carol service"). */
  const words = { description: 'Plan the carol service', teams: ['Core Team'], date, type: 'Core Team Meeting', organiserUid: lead.uid };

  for (const P of [{ name: 'the Rota planner', url: 'Planner.html' }, { name: 'the Core Team app\'s rota', url: 'CoreTeamApp.html', open: 'rota' }]) {
    console.log('\n' + P.name + (BREAK === '1' ? ' (BREAK=1: no guard)' : BREAK === '2' ? ' (BREAK=2: every blank refused)' : ''));
    await put('meetings/hub_meet', words);
    await put('meetings/hub_old', Object.assign({}, words, { date: old, description: 'Last year\'s notes' }));
    const page = await b.newPage();
    const said = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') said.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => said.push('pageerror: ' + String(e.message).slice(0, 200)));
    if (BREAK) {
      await page.setRequestInterception(true);
      page.on('request', async (q) => {
        if (!/\/egbc-auth\.js/.test(q.url())) return q.continue();
        const r = await fetch(q.url()); const t = await r.text();
        if (!GUARD.test(t)) console.log('  (BREAK: the guard was not found)');
        q.respond({ status: 200, contentType: 'text/javascript', body: t.replace(GUARD, BREAK === '2' ? ALL_BLANKS : '') });
      });
    }
    await signIn(page, BASE, lead, P.url);
    if (P.open) { await page.waitForFunction(() => typeof openSection === 'function', { timeout: 30000 }); await sleep(1500); await page.evaluate((s) => { try { if (typeof endTour === 'function') endTour(); } catch (e) {} openSection(s); }, P.open); }
    const box = 'textarea[onblur*="hub_meet"]';
    let found = false;
    for (let i = 0; i < 60 && !found; i++) { await sleep(500); found = await page.$(box).then((e) => !!e, () => false); }
    ok('the meeting\'s row and notes box are there', found, said.join(' | '));
    if (!found) { await page.close(); continue; }
    /* As the box sends a blank before the read lands. */
    const unread = await page.evaluate(() => EGBCAuth.setMeetingField('hub_old', 'description', '').then(() => 'ok', (e) => String(e && e.message || e)));
    await sleep(1000);
    const o = await get('meetings/hub_old');
    ok('a blank before the notes were read keeps them', unread === 'ok' && o && o.description === 'Last year\'s notes', unread + ' ' + JSON.stringify(o));
    ok('the box shows the notes it read', await page.$eval(box, (t) => t.value).catch(() => '') === words.description);
    await page.evaluate((s) => { const t = document.querySelector(s); t.focus(); t.value = ''; t.dispatchEvent(new Event('blur')); t.blur(); }, box);
    await sleep(2500);
    const m = await get('meetings/hub_meet');
    ok('cleared after reading them, and left: the notes are cleared', m && m.description === '', JSON.stringify(m) + ' ' + said.join(' | '));
    await page.focus(box); await page.evaluate((s) => document.querySelector(s).select(), box); await page.keyboard.type('Carols and mince pies');
    await page.evaluate((s) => document.querySelector(s).blur(), box);
    await sleep(2500);
    if (process.env.BLUR_DEBUG) console.log('   debug', JSON.stringify(await page.evaluate((s) => [...document.querySelectorAll(s)].map((t) => [t.value, t.offsetParent !== null]), box)), JSON.stringify(await get('events/hub_meet')), JSON.stringify(await get('meetings/hub_meet')));
    ok('typed words save', ((await get('meetings/hub_meet')) || {}).description === 'Carols and mince pies', said.join(' | '));
    await page.close();
  }
} catch (e) { ok('the run itself', false, e && e.stack || e); }
finally { await b.close(); server.close(); }
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
