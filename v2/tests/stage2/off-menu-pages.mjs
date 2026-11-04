/* GOING-LIVE TEST, STAGE 2: THE PAGES IN NOBODY'S MENU (the reviewer, 2 Nov 2026).
 *
 *   node tools/secret-stand-ins.mjs
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth,storage,functions --project egbc-worship-planner "node tests/stage2/off-menu-pages.mjs"
 *
 * The rule: a page opened directly by someone it isn't for says plainly that
 * it isn't for them, with a way back; nobody it isn't for sees anything
 * private. For each of the 27 pages the click-everything run found opening
 * off the Menu, as each kind of person (signed out, and the audit's six), on
 * the spare emulators with the locked rules, with made-up private records
 * seeded, each with a word nobody could see by accident:
 *   another person's phone, email and address; a child's name and medical
 *   note; a safeguarding concern and incident; a care worry and a pastoral
 *   visit; a name on the rota; a song on a Sunday's plan.
 * It writes the table of who each page is for and what each kind of person
 * sees (tests/out/off-menu-pages.md), and fails if a private word shows to a
 * kind of person the page is not for, or if a refusal has no way back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { serve, browser, person, signIn, put, wipe, sleep, V2 } from './harness.mjs';
import { EGBC_UNDER18 } from '../../functions/under18-teams.js';
import { boardsOf } from '../../functions/team-boards.js';

const SERVE = 8998, BASE = 'http://localhost:' + SERVE;
const R = [], FAULTS = [], NOT_REACHED = [];
const ok = (n, v, x) => { R.push(!!v); if (!v) FAULTS.push(n); if (!v) console.log('  FAIL  ' + n + (x ? '\n          ' + String(x).slice(0, 300) : '')); };
const KINDS = ['signed out', 'everyone', 'worship', 'kids', 'core', 'areaAdmin', 'master'];
const PLAN_DATE = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);

/* Who each page is for (from its guard and its purpose), and so who may see what is private on it.
   private: the kinds of private word the page may show to those it is for. */
const PAGES = {
  'AVteamlandingpage.html': { for: 'the AV team and the worship team (Worship and AV are one team), those covering them, master admins (its installed app)', kinds: ['worship', 'core', 'areaAdmin', 'master'], private: [] },
  'birthday.html': { for: 'the core teams covering worship, and master admins (Calla Design: invitations)', kinds: ['core', 'master'], private: [] },
  'CoreTeamApp.html': { for: 'the core teams covering worship, and master admins (their installed app; the hub app has a Core space too)', kinds: ['core', 'master'], private: ['rota'] },
  'EGBCWorship&AV.html': { for: 'nobody now: it sends everyone to the hub, which does its jobs (behaviour change, 3 Nov 2026)', kinds: [], private: [] },
  'emailcompilerinstructions.html': { for: 'anyone signed in (words only; linked from Send an email)', kinds: ['everyone', 'worship', 'kids', 'core', 'areaAdmin', 'master'], private: [] },
  'event-ra.html': { for: 'an event’s organisers and leaders, the office, the trustees, the health and safety leads, anyone who administers a team, and master admins (mayAny; with no event chosen it says how to open one)', kinds: ['areaAdmin', 'master'], private: [] },
  'kids-admin.html': { for: 'the children’s team leads, the safeguarding lead and deputy, each children’s group’s leaders, and master admins (a team member who leads nothing is told to ask a lead)', kinds: ['master'], private: ['child'] },
  'kids-checkin.html': { for: 'the children’s team leads, the safeguarding lead and deputy, each children’s group’s leaders, the morning’s session leader, and master admins', kinds: ['master'], private: ['child'] },
  'mix-analyser.html': { for: 'master admins on the hub (Martin\'s own mix tools; unchanged as files in the desktop Mix Builder)', kinds: ['master'], private: [] },
  'mix-builder.html': { for: 'master admins on the hub (as above)', kinds: ['master'], private: [] },
  'mix-player.html': { for: 'master admins on the hub (as above)', kinds: ['master'], private: [] },
  'music-uploader.html': { for: 'the worship team\'s leaders (one song at a time; opened from the planners\' "Upload Song"), and the core teams covering it', kinds: ['core', 'areaAdmin', 'master'], private: [] },
  'rota-reports.html': { for: 'master admins and the admins of rota teams (the Menu and the access matrix; behaviour change, 4 Nov 2026)', kinds: ['areaAdmin', 'master'], private: ['rota'] },
  'rotaplannerinstructions.html': { for: 'anyone signed in (words only; linked from the Rota planner\'s Guide)', kinds: ['everyone', 'worship', 'kids', 'core', 'areaAdmin', 'master'], private: [] },
  'Serviceplannerinstructions.html': { for: 'anyone signed in (words only; linked from the service planners)', kinds: ['everyone', 'worship', 'kids', 'core', 'areaAdmin', 'master'], private: [] },
  'sg-print.html': { for: 'the safeguarding lead and deputy, the trustees and master admins, and an event’s organisers and leaders for its own record (with nothing chosen it prints nothing)', kinds: ['master'], private: [] },
  ['song-summary.html?date=' + PLAN_DATE]: { for: 'everyone on that Sunday\'s plan email, and any volunteer on a team (the rules: the plan\'s audience, or volunteer())', kinds: ['worship', 'kids', 'core', 'areaAdmin', 'master'], private: ['plan'] },
  'sundayplannersonglibrary.html': { for: 'the worship team (opened from the Sunday planner)', kinds: ['worship', 'core', 'areaAdmin', 'master'], private: [] },
  'training Sunday planner.html': { for: 'the worship team\'s leaders (practice copy, from Worship Training)', kinds: ['core', 'areaAdmin', 'master'], private: ['rota'] },
  'trainingbatchimporter.html': { for: 'the worship team\'s leaders (practice copy)', kinds: ['core', 'areaAdmin', 'master'], private: [] },
  'trainingmusicdatabase.html': { for: 'the worship team (practice copy)', kinds: ['worship', 'core', 'areaAdmin', 'master'], private: [] },
  'trainingportalhub.html': { for: 'the worship team (Worship Training\'s "Practice planners")', kinds: ['worship', 'core', 'areaAdmin', 'master'], private: [] },
  'trainingrotaplanner.html': { for: 'leaders of the worship, children\'s and youth teams (practice copy)', kinds: ['core', 'areaAdmin', 'master'], private: ['rota'] },
  'uploaderinstructions.html': { for: 'anyone signed in (words only; linked from the Music Uploader)', kinds: ['everyone', 'worship', 'kids', 'core', 'areaAdmin', 'master'], private: [] },
  'worshiphubapp.html': { for: 'nobody now: it sends everyone to the hub app\'s worship Rota (behaviour change)', kinds: [], private: [] },
  'youth-access.html': { for: 'a young person with a code (no account needed)', kinds: KINDS, private: [] },
  'youthapp2.html': { for: 'the youth teams and young people with a code', kinds: ['master'], private: [] }
};
const WORDS = { phone: '07700 900111', email: 'priya.private@example.invalid', address: 'Privet Lane Synthetic', child: 'Kiko PrivateChild', medical: 'PEANUT-PRIVATE',
  concern: 'CONCERN-PRIVATE', incident: 'INCIDENT-PRIVATE', worry: 'WORRY-PRIVATE', pastoral: 'PASTORAL-PRIVATE', rota: 'Rita RotaPrivate', plan: 'Hymn PrivatePlan' };
const CATEGORY = { phone: 'contact', email: 'contact', address: 'contact', child: 'child', medical: 'child', concern: 'safeguarding', incident: 'safeguarding', worry: 'care', pastoral: 'care', rota: 'rota', plan: 'plan' };

async function seed() {
  await wipe();
  await put('teamFlags/under18', { teams: EGBC_UNDER18.slice().sort() });
  await put('teamFlags/boards', { boards: boardsOf([]) });
  const P = {
    everyone: await person({ key: 'om_everyone', name: 'Evie Everyone Synthetic', teams: [] }),
    worship: await person({ key: 'om_worship', name: 'Will Worship Synthetic', teams: ['Worship Team'] }),
    kids: await person({ key: 'om_kids', name: 'Kat Kids Synthetic', teams: ['Kids Church'] }),
    core: await person({ key: 'om_core', name: 'Cal Core Synthetic', teams: ['Core Team'] }),
    areaAdmin: await person({ key: 'om_area', name: 'Ada Area Synthetic', teams: ['Worship Team'], adminFor: ['Worship Team'] }),
    master: await person({ key: 'om_master', name: 'Max Master Synthetic', teams: ['Core Team'], adminFor: ['Core Team'], master: true, book: { masterAdmin: true } })
  };
  /* The private records, in their real shapes as far as the pages read them. */
  await put('addressBook/om_priya', { name: 'Priya Contact Synthetic', email: WORDS.email, phone: WORDS.phone, mobile: WORDS.phone, address: WORDS.address, markers: ['Worship Team'], churchMember: true, archived: false });
  await put('kidsChildren/om_kiko', { firstName: 'Kiko', lastName: 'PrivateChild', name: WORDS.child, group: 'Kids Church', medical: WORDS.medical, allergies: WORDS.medical, archived: false });
  await put('kidsMedical/om_kiko', { notes: WORDS.medical, childId: 'om_kiko' });
  await put('concerns/om_c1', { text: WORDS.concern, summary: WORDS.concern, status: 'open', at: new Date().toISOString() });
  await put('incidents/om_i1', { text: WORDS.incident, summary: WORDS.incident, at: new Date().toISOString() });
  await put('worries/om_w1', { text: WORDS.worry, at: new Date().toISOString() });
  await put('pastoralVisits/om_p1', { notes: WORDS.pastoral, name: 'Priya Contact Synthetic', at: new Date().toISOString() });
  await put('events/om_e1', { date: PLAN_DATE, type: 'Sunday Morning Worship', startTime: '10:30', teams: ['Worship Team', 'AV Team'], roles: ['Vocals'], archived: false, draft: false, termLabel: 'Now',
    assignments: { Vocals: { id: 'ab_rita', name: WORDS.rota } } });
  await put('services/om_plan', { date: PLAN_DATE, eventId: 'om_e1', worshipLeader: 'Leader', order: [{ type: 'song', title: WORDS.plan, keys: ['G'] }] });
  await put('songSummaries/' + PLAN_DATE, { date: PLAN_DATE, items: [{ title: WORDS.plan, key: 'G' }], audience: [P.worship.uid], audienceUnresolved: [] });
  return P;
}

const server = await serve(SERVE);
const b = await browser();
const ROWS = {};
try {
  const P = await seed();
  for (const kind of KINDS) {
    console.log('\n' + kind);
    const errs = [];
    /* A browser context of its own, signed in: the Retry below starts one afresh. */
    const open = async () => { const c = await b.createBrowserContext(), pg = await c.newPage(); await pg.setViewport({ width: 1280, height: 900 });
      pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160))); if (kind !== 'signed out') await signIn(pg, BASE, P[kind]); return [c, pg]; };
    let [ctx, page] = await open();
    for (const [url, spec] of Object.entries(PAGES)) {
      errs.length = 0;
      /* A clean start each time: the last page's open connections to the emulator
         let go first (27 pages back to back starved the next one's sign-in check). */
      let s;
      for (let attempt = 0; attempt < 2; attempt++) {
      /* The emulator speaks HTTP/1.1, so Chrome gives it six connections, and the pages before
         this one can still hold them with Firestore listening ("the client is offline" - real
         Firestore is HTTP/2, one connection shared, so a person never meets this). The second
         try is from a new context, with connections of its own. */
      if (attempt) { await ctx.close().catch(() => {}); [ctx, page] = await open(); }
      await page.goto('about:blank').catch(() => {}); await sleep(1200);
      await page.goto(BASE + '/' + url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      /* The guard's verdict: refused, let in, or a page with no guard settled (up to 20 seconds). */
      /* A slow emulator can outlast the guard's 8 seconds ("Could not check your access"): Retry once, as a person would. */
      let retried = false;
      for (let w = 0; w < 60; w++) {
        await sleep(500);
        if (!retried && await page.evaluate(() => /Could not check your access/.test(document.body ? document.body.innerText : '')).catch(() => false)) {
          retried = true; await page.evaluate(() => { const b = document.getElementById('egbc-guard-retry'); if (b) b.click(); }).catch(() => {}); continue;
        }
        const v = await page.evaluate(() => !document.body ? '' : document.body.getAttribute('data-egbc-blocked') ? 'no' : window.EGBC_READY ? 'yes'
          : (!document.querySelector('script[src*="egbc-guard.js"]') && !/Checking access/.test(document.body.innerText)) ? 'none' : '').catch(() => '');
        if (v && w >= 4) break;
      }
      await sleep(1500);
      s = await page.evaluate(() => {
        const body = document.body;
        const text = body ? body.innerText.replace(/\s+/g, ' ') : '';
        const all = body ? (body.textContent || '').replace(/\s+/g, ' ') : '';
        const blocked = !!(body && body.getAttribute('data-egbc-blocked'));
        const back = [...document.querySelectorAll('a[href]')].some((a) => /hub\.html|login\.html|app\.html/.test(a.getAttribute('href')) && a.offsetParent !== null);
        return { where: location.pathname.split('/').pop() + location.hash, blocked, text, all, back };
      }).catch((e) => ({ where: 'error', text: String(e.message), all: '', blocked: false, back: false }));
      /* The emulator, not the page (4 Nov 2026): the guard's profile read failed ("Something went
         wrong: Failed to get document because the client is offline") or still timed out after
         Retry. Once more from a clean start before the row is called not reached. */
      if (!/Something went wrong|Could not check your access/.test(s.text)) break;
      }
      const seen = Object.entries(WORDS).filter(([, w]) => s.all.includes(w)).map(([k]) => k);
      const isFor = spec.kinds.includes(kind);
      const state = /login\.html/.test(s.where) ? 'sent to sign in' : s.blocked ? 'refused: "' + s.text.slice(0, 70) + '"' : s.where !== url.split('?')[0].replace(/ /g, '%20') && !url.startsWith(s.where) ? 'sent to ' + s.where : 'opens: "' + s.text.slice(0, 70) + '"';
      (ROWS[url] = ROWS[url] || {})[kind] = state + (seen.length ? ' [shows: ' + seen.join(', ') + ']' : '');
      /* Nothing private for anyone the page is not for; for those it is for, only its own kinds. */
      const wrong = seen.filter((k) => !isFor || !spec.private.includes(CATEGORY[k]));
      ok(url + ' as ' + kind + ': nothing private it isn\'t for', !wrong.length, 'shows ' + wrong.join(', ') + ' - ' + state);
      if (s.blocked) ok(url + ' as ' + kind + ': the refusal has a way back', s.back, s.text.slice(0, 200));
      /* Still "Could not check your access" after a Retry: the emulator was too slow for the guard's
         8 seconds. Nothing shows behind it, but whether the page says it isn't for them is not proven. */
      if (/Could not check your access|Something went wrong/.test(s.text)) { NOT_REACHED.push(url + ' as ' + kind + ': the access check ' + (/Something went wrong/.test(s.text) ? 'could not read their profile' : 'timed out') + ' on the emulator, twice (nothing private showed): ' + s.text.slice(0, 160)); continue; }
      /* Who it is for gets in (4 Nov 2026: this was not checked, so a page refusing the people it
         is for passed). */
      if (isFor && kind !== 'signed out') ok(url + ' as ' + kind + ': it opens for them', !s.blocked && !/sent to sign in/.test(state), state);
      if (!isFor && kind !== 'signed out' && !s.blocked && !/sent to/.test(state))
        ok(url + ' as ' + kind + ': a page it isn\'t for says so', /isn.t for|not for you|no access|only for|This page is for|for the people|sent to the people|Ask |need/i.test(s.text), state);
    }
    await ctx.close();
  }
} catch (e) { ok('the run itself', false, e && e.stack || e); }
finally { await b.close(); server.close(); }

/* The table, for the reviewer. */
const md = ['# The pages in nobody\'s Menu: who each is for, and what each kind of person sees', '',
  'Made by tests/stage2/off-menu-pages.mjs on the spare emulators with the locked rules, ' + new Date().toISOString().slice(0, 16) + ' UTC. "[shows: ...]" names any seeded private word on the page.', ''];
for (const [url, spec] of Object.entries(PAGES)) {
  md.push('## ' + url.split('?')[0], '', '**For:** ' + spec.for, '');
  for (const k of KINDS) md.push('- ' + k + ': ' + ((ROWS[url] || {})[k] || 'not reached'));
  md.push('');
}
fs.mkdirSync(path.join(V2, 'tests', 'out'), { recursive: true });
fs.writeFileSync(path.join(V2, 'tests', 'out', 'off-menu-pages.md'), md.join('\n'));
console.log('\n' + R.filter(Boolean).length + ' of ' + R.length + ' checks passed');
if (FAULTS.length) console.log('Failed:\n  ' + FAULTS.join('\n  '));
if (NOT_REACHED.length) console.log('Not reached:\n  ' + NOT_REACHED.join('\n  '));
process.exit(R.every(Boolean) ? 0 : 1);
