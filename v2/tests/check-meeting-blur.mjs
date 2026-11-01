/* A BLANK NOTES BOX NEVER WIPES A MEETING'S WORDS.
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth --project egbc-worship-planner "node tests/check-meeting-blur.mjs"
 *   BREAK=1 ...   serves egbc-auth.js without the guard: must fail
 *
 * The rota's notes box saves on blur (Planner.html, egbc-core-rota.js in the
 * Core Team app), and for a hub meeting it can be blank for a moment before
 * the meeting's own part (meetings/{id}) is read. In a browser, with the
 * locked rules, as a made-up worship leader: blank the box on a hub
 * meeting's row and leave it; its title and notes stay. Typed words still save.
 */
import { serve, browser, person, signIn, put, get, wipe, sleep } from './stage2/harness.mjs';
import { EGBC_UNDER18 } from '../functions/under18-teams.js';
import { boardsOf } from '../functions/team-boards.js';

const BREAK = !!process.env.BREAK, SERVE = 8995, BASE = 'http://localhost:' + SERVE;
const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 300))); };
const inDays = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };

await wipe();
const server = await serve(SERVE);
const b = await browser();
try {
  await put('teamFlags/under18', { teams: EGBC_UNDER18.slice().sort() });
  await put('teamFlags/boards', { boards: boardsOf([]) });
  const lead = await person({ key: 'blur_lead', name: 'Blur Lead Synthetic', teams: ['Worship Team', 'Core Team'], adminFor: ['Worship Team'] });
  const date = inDays(9);
  await put('events/hub_meet', { date, startTime: '19:30', endTime: '21:00', type: 'Core Team Meeting', teams: ['Core Team'], meeting: true, archived: false, draft: false, roles: [], assignments: {} });
  /* Its title is its kind and these notes ("Core Team Meeting · Plan the carol service"). */
  const words = { description: 'Plan the carol service', teams: ['Core Team'], date, type: 'Core Team Meeting', organiserUid: lead.uid };

  for (const P of [{ name: 'the Rota planner', url: 'Planner.html' }, { name: 'the Core Team app\'s rota', url: 'CoreTeamApp.html', open: 'rota' }]) {
    console.log('\n' + P.name + (BREAK ? ' (BREAK: no guard)' : ''));
    await put('meetings/hub_meet', words);
    const page = await b.newPage();
    const said = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') said.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => said.push('pageerror: ' + String(e.message).slice(0, 200)));
    if (BREAK) {
      await page.setRequestInterception(true);
      page.on('request', async (q) => {
        if (!/\/egbc-auth\.js/.test(q.url())) return q.continue();
        const r = await fetch(q.url()); const t = await r.text();
        q.respond({ status: 200, contentType: 'text/javascript', body: t.replace(/if \(\(field === 'description' \|\| field === 'title'\) && !String\(value == null \? '' : value\)\.trim\(\)\) return Promise\.resolve\(\);/, '') });
      });
    }
    await signIn(page, BASE, lead, P.url);
    if (P.open) { await page.waitForFunction(() => typeof openSection === 'function', { timeout: 30000 }); await sleep(1500); await page.evaluate((s) => { try { if (typeof endTour === 'function') endTour(); } catch (e) {} openSection(s); }, P.open); }
    const box = 'textarea[onblur*="hub_meet"]';
    let found = false;
    for (let i = 0; i < 60 && !found; i++) { await sleep(500); found = await page.$(box).then((e) => !!e, () => false); }
    ok('the meeting\'s row and notes box are there', found);
    if (!found) { await page.close(); continue; }
    await page.evaluate((s) => { const t = document.querySelector(s); t.focus(); t.value = ''; t.dispatchEvent(new Event('blur')); t.blur(); }, box);
    await sleep(2500);
    const m = await get('meetings/hub_meet');
    ok('blanked and left: its notes and title stay', m && m.description === words.description, JSON.stringify(m));
    await page.focus(box); await page.evaluate((s) => document.querySelector(s).select(), box); await page.keyboard.type('Carols and mince pies');
    await page.evaluate((s) => document.querySelector(s).blur(), box);
    await sleep(2500);
    if (process.env.BLUR_DEBUG) console.log('   debug', JSON.stringify(await page.evaluate((s) => [...document.querySelectorAll(s)].map((t) => [t.value, t.offsetParent !== null]), box)), JSON.stringify(await get('events/hub_meet')), JSON.stringify(await get('meetings/hub_meet')));
    ok('typed words still save', ((await get('meetings/hub_meet')) || {}).description === 'Carols and mince pies', said.join(' | '));
    await page.close();
  }
} catch (e) { ok('the run itself', false, e && e.stack || e); }
finally { await b.close(); server.close(); }
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
