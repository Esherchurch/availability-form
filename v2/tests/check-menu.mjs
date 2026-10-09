/* Is the Menu the one Martin approved, and does each person see their part?
 *
 *   node tests/check-menu.mjs             (from v2/, emulators running)
 *   node tests/check-menu.mjs --shots     and save a picture of each
 *
 * WHY. Martin could not find things. v2's Menu grouped pages by team, which is
 * not how anybody looks for anything, listed the same pages twice under
 * "Apps", and offered two pages that are only ever opened from inside the
 * Sunday Service Planner as if they were places to go. NEXT-BRIEF §16 has the
 * structure he approved, taken from the portal the church actually uses.
 *
 * This reads the Menu as three different people and checks three things:
 *   the names and the order are exactly the approved ones
 *   each person sees their part and not somebody else's
 *   the things that were taken out stay out
 *
 * Synthetic throughout: one invented account, whose teams are rewritten
 * between the three readings.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9627, SERVE = 8868;
const PROJECT = 'egbc-worship-planner';
const wantShots = process.argv.includes('--shots');
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

/* The approved structure, written out again here on purpose. If this file and
   egbc-menu.js were the same list, the check would only be proving that a list
   equals itself. This is NEXT-BRIEF §16, copied by hand. */
const APPROVED = [
  ['Dashboard'],
  ['Rota'],
  ['Meetings'],
  ["What's on"],
  ['Hire our rooms'],
  ['Book a room'],
  ['Maintenance'],
  ['Worship & AV', [
    ['Worship', [['Play-Through'], ['Worship Training'],
      ['Music Databases', [['Music Database'], ['Music Uploader']]]]],
    ['AV', [['How-To AV'], ['AV Troubleshoot'],
      ['Equipment', [['Inventory'], ['AV Infrastructure Mapper'], ['Monitor Setup']]],
      ['Connect ChurchShow']]]
  ]],
  ['Youth', [['Youth Service Planner']]],
  ['Kids Church', [["Children's register"], ['Sunday check-in']]],
  ['Core Team', [
    ['Planning', [['Rota Planner'], ['Sunday Service Planner'], ['Availability form']]],
    ['People and email', [['Address Book'], ['Email Compiler']]],
    ['Music', [['Music Upload']]],
    ['Events and rooms', [['Events'], ['Places'], ['Room bookings']]],
    ['Admin', [['Backup & Restore']]]
  ]],
  ['Resources', [["Idea's pin board"], ['Apps and downloads'], ['Team Resources'], ['Team Videos']]]
];

/* Taken out, and they must stay out.
   `exact` ones are compared against a heading's own words, not searched for in
   the page's text: "Apps" is inside "Apps and downloads", which is a real
   entry, and searching for the shorter one reported the longer one as a fault. */
const GONE_HEADINGS = ['Apps'];
const GONE_ANYWHERE = ['Song Library - quick view', 'Song Summary', 'Worship & AV Hub (old)',
  'Worship & AV Hub',
  'sundayplannersonglibrary', 'song-summary.html'];

/* Which of those names are gated, written out here rather than read from the
   structure, for the same reason the structure is: a check that asks the code
   what the answer should be is not a check. */
const CORE_ONLY = ['Core Team', 'Planning', 'Rota Planner', 'Sunday Service Planner',
  'Availability form', 'People and email', 'Address Book', 'Email Compiler', 'Music',
  'Music Upload', 'Events and rooms', 'Events', 'Places', 'Admin', 'Backup & Restore'];
/* WHERE THEY FIRST DIFFER, not the first 150 characters of each. The Menu is
   long enough that two lists agreeing for 150 characters tells you nothing,
   and that is exactly what the old report did: it showed the matching part
   twice and cut off before the difference. */
function firstDifference(seen, expected) {
  let i = 0;
  while (i < seen.length && i < expected.length && seen[i] === expected[i]) i++;
  const where = i === 0 ? 'at the very first name' : 'after "' + seen[i - 1] + '"';
  return 'they agree for ' + i + ' names, then differ ' + where
    + '\n          on screen: ' + (seen.slice(i, i + 5).join(' > ') || '(nothing more)')
    + '\n          approved : ' + (expected.slice(i, i + 5).join(' > ') || '(nothing more)')
    + '\n          ' + seen.length + ' names on screen, ' + expected.length + ' approved';
}

const ADMIN_ONLY = ['Events and rooms', 'Events', 'Places', 'Admin', 'Backup & Restore',
  /* admin: true on the Menu node. It also sits under the Worship & AV team
     heading, so it is in WORSHIP_ONLY too - both gates apply and a name has
     to be in both lists or the expectation is wrong for somebody. */
  'Connect ChurchShow'];
/* "Room bookings" is the one entry that is not gated on Core Team or on
   administering a team: a site's bookings admin is usually neither (F-067). */
const BOOKINGS_ONLY = ['Room bookings'];
/* The children's team's own section (F-089). Only somebody on Kids Church,
   the person who administers it, or a master admin. Deliberately not every
   admin: whoever looks after Worship is not the children's team. */
const KIDS_ONLY = ['Kids Church', "Children's register", 'Sunday check-in'];
/* Martin's decision (fd2ff569, 8f5519bf): Worship & AV is a team section like
   Kids Church, so somebody who is only on Kids Church does not see it - and a
   team heading that does not match hides its whole subtree, not just its own
   line. Written out by hand, as the rest of this list is. */
const WORSHIP_ONLY = ['Worship & AV', 'Worship', 'Play-Through', 'Worship Training',
  'Music Databases', 'Music Database', 'Music Uploader', 'AV', 'How-To AV',
  'AV Troubleshoot', 'Equipment', 'Inventory', 'AV Infrastructure Mapper', 'Monitor Setup',
  /* Narrower still: admin: true, so an ordinary Worship or AV member does
     not see it either. The per-person expectations below carry that. */
  'Connect ChurchShow'];

const PEOPLE = {
  'a Worship member': { teams: ['Worship Team'], adminFor: [], masterAdmin: false,
    sees: ['Worship & AV', 'Youth', 'Resources'], doesNot: ['Core Team'] },
  'somebody on Core Team': { teams: ['Core Team'], adminFor: [], masterAdmin: false,
    sees: ['Core Team', 'Planning', 'People and email'], doesNot: ['Events and rooms', 'Admin'] },
  'a master admin': { teams: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true,
    sees: ['Core Team', 'Events and rooms', 'Admin', 'Backup & Restore', 'Kids Church'], doesNot: [] },
  /* F-089. A children's leader is on no other team and administers nothing,
     and must still reach the register - which is the whole reason it is a
     team heading beside Youth rather than buried under Core Team. */
  'a Kids Church leader': { teams: ['Kids Church'], adminFor: [], masterAdmin: false,
    sees: ['Kids Church', "Children's register", 'Sunday check-in'],
    /* Worship & AV too: a team section they are not on, and the whole subtree
       goes with the heading - Play-Through and the rest, not just the name. */
    doesNot: ['Core Team', 'Planning', 'Rota Planner', 'Events and rooms', 'Admin',
              'Worship & AV', 'Play-Through', 'How-To AV', 'Monitor Setup'] },
  /* Karen: administers Kids Church without being on its rota.

     She DOES reach "Core Team" as a heading, and that is correct: Room
     bookings sits under it and is open to anyone who administers anything
     (F-067), so the headings above it open for her. She gets the heading
     without the charter link and without anything else inside it - which is
     the rule a heading opened only by its children follows, and there is an
     assertion for exactly that below. */
  'Karen, who administers Kids Church': { teams: [], adminFor: ['Kids Church'], masterAdmin: false,
    sees: ['Kids Church', "Children's register", 'Sunday check-in', 'Room bookings'],
    doesNot: ['Planning', 'Rota Planner', 'Address Book', 'Events', 'Places',
              'Admin', 'Backup & Restore', 'Worship & AV', 'Play-Through'] },
  /* The person F-067 is about: looks after one site's room bookings, is on
     Worship, is on neither Core Team nor any team's admin list. The entry
     lives under Core Team > Events and rooms, so the two headings above it
     have to open for them - and must not hand them the Core Team charter or
     anything else underneath. */
  'a bookings admin who is not Core Team': { teams: ['Worship Team'], adminFor: [], masterAdmin: false,
    bookingsAdmin: true,
    sees: ['Book a room', 'Core Team', 'Events and rooms', 'Room bookings'],
    doesNot: ['Planning', 'Rota Planner', 'Address Book', 'Events', 'Places', 'Admin',
              'Backup & Restore', 'Kids Church', "Children's register", 'Sunday check-in'] }
};

const flat = (nodes, out = []) => {
  for (const [title, kids] of nodes) { out.push(title); if (kids) flat(kids, out); }
  return out;
};

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')); };

const rest = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: 'localhost', port: 8181, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej); req.end(data);
});
const val = (v) => Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };

const SIGNIN = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>`;
const NO_SW = `<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>`;
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

/* The Menu as a tree of titles, read off the drawn page. */
const READ_MENU = `(() => {
  const el = document.getElementById('toolList');
  if (!el) return JSON.stringify({ error: 'no toolList' });
  const titles = [];
  /* A group heading is a <span> when it is only a heading and an <a class=
     "grp-link"> when it is also a page. Reading only the spans lost Worship &
     AV, Youth and Core Team - the three that open a charter - and reported
     them as missing from the Menu they were sitting in. */
  el.querySelectorAll('.grp > span:not(.arw):not(.dot):not(.cnt), .grp .grp-link, .grp-body .sub, .grp-body .tool .nm, .tool > .tx > .nm')
    .forEach(n => { const t = (n.textContent || '').trim(); if (t) titles.push(t); });
  /* top-level pages that are not in a group are plain .tool children of #toolList */
  const top = [...el.children].filter(c => c.classList && c.classList.contains('tool'))
    .map(a => (a.querySelector('.nm') || {}).textContent || '').map(s => s.trim()).filter(Boolean);
  return JSON.stringify({ titles, top, text: (el.innerText || '').replace(/\\s+/g, ' ').trim() });
})()`;

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });
  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('not found'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const head = /<head[^>]*>/i.exec(t);
      body = Buffer.from(head ? t.slice(0, head.index + head[0].length) + NO_SW + t.slice(head.index + head[0].length) : NO_SW + t, 'utf8');
    }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-menu-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (watch.handle(m)) return;
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1100, deviceScaleFactor: 1, mobile: false });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
  const uid = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""');
  if (!uid) { console.error('Could not sign in as ' + ACCOUNT.email); server.close(); chrome.kill(); process.exit(2); }

  /* A stale registry row, on purpose. Taking the retired page out of REGISTRY
     is not enough: hubPages already holds a row for it in the live database,
     and a row is what draws a tile. This seeds exactly that row, so the check
     fails if only the list was tidied and the guard was forgotten. */
  await rest('PATCH', '/v1/projects/' + PROJECT + '/databases/(default)/documents/hubPages/stale_portal_row', {
    fields: { url: val('EGBCWorship&AV.html'), title: val('Worship & AV Hub'),
      team: val('Core Team'), order: { integerValue: '900' },
      description: val('a row left over from before it was retired') }
  });

  const want = flat(APPROVED);
  console.log('the approved structure has ' + want.length + ' names\n');

  for (const [label, p] of Object.entries(PEOPLE)) {
    /* Rewrite who this person is, then reload the hub. */
    /* THE ADDRESS BOOK FIRST, BECAUSE IT WINS.
       EGBCAuth.refreshFromBook() re-reads addressBook/{memberId} on every page
       load and writes teams, adminFor and masterAdmin back over users/{uid}.
       Writing only the user document worked for as long as ab_tester had no
       address book record at all - refreshFromBook leaves the profile alone
       when there is nothing to read. The moment test-account.mjs started
       making that record (a master admin, so the sweeps can open every page),
       this check began reading the Menu as a master admin three times over
       and reporting a Worship member who could see Core Team. */
    await rest('PATCH', `/v1/projects/${PROJECT}/databases/(default)/documents/addressBook/ab_tester`, {
      fields: {
        name: val('Menu Tester'), email: val(ACCOUNT.email),
        markers: val(p.teams), adminFor: val(p.adminFor), masterAdmin: val(p.masterAdmin)
      }
    });
    await rest('PATCH', `/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`, {
      fields: {
        uid: val(uid), email: val(ACCOUNT.email), name: val('Menu Tester'),
        memberId: val('ab_tester'), linkedBy: val('admin'), status: val('active'),
        teams: val(p.teams), adminFor: val(p.adminFor), masterAdmin: val(p.masterAdmin)
      }
    });
    /* Who looks after a site's room bookings is a list of member ids on the
       site's own settings, not a flag on the person - so it is seeded here
       the same way the real thing is written. */
    await rest('PATCH', '/v1/projects/' + PROJECT + '/databases/(default)/documents/bookingSettings/synthetic_site', {
      fields: { bookingsAdmins: val(p.bookingsAdmin ? ['ab_tester'] : []) }
    });

    watch.reset();
    await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(12000);
    await ev('window.alert=()=>{};window.confirm=()=>false;1');
    /* Somebody on several teams is asked which one first. Answer it, or the
       picture is of the question rather than of the Menu. */
    await ev("(()=>{const b=document.querySelector('#pickList .pick-t');if(b){b.click();return 'chose a team'}return 'no picker'})()");
    await sleep(1200);
    await ev("(()=>{try{openTools()}catch(e){const el=document.getElementById('panel');if(el)el.classList.add('open')}})();1");
    /* Open every group, so the whole structure can be read at once. */
    await ev("document.querySelectorAll('.grp:not(.open)').forEach(b=>b.click());1");
    await sleep(1800);

    const raw = await ev(READ_MENU);
    let menu; try { menu = JSON.parse(raw || '{}'); } catch { menu = { error: String(raw).slice(0, 80) }; }
    const seen = menu.titles || [];

    console.log('\n' + label + '  (' + p.teams.join(', ') + (p.masterAdmin ? ', master admin' : '') + ')');
    ok('  everything they should see is there',
      p.sees.every(s => seen.includes(s)),
      p.sees.filter(s => !seen.includes(s)).join(', ') || p.sees.join(', ') + ' - all there');
    ok('  and nothing they should not',
      p.doesNot.every(s => !seen.includes(s)),
      p.doesNot.filter(s => seen.includes(s)).join(', ') || (p.doesNot.length ? p.doesNot.join(', ') + ' - none of them' : 'nothing is kept from a master admin'));
    /* The approved list, cut down to what this person may see, compared with
       what is on the screen - name for name, in order. Comparing two lists
       that had both been filtered by "is it on the screen" was no test at all:
       it could only ever agree with itself. */
    const onCore = p.teams.includes('Core Team');
    const anAdmin = !!p.adminFor.length || !!p.masterAdmin;
    const books = anAdmin || !!p.bookingsAdmin;
    /* The Worship & AV heading's teams, which is what lets the subtree
       through at all - a Kids Church admin never reaches Connect ChurchShow. */
    const worshipAV = p.teams.some(t => ['Worship Team', 'AV Team', 'Core Team'].includes(t))
                      || p.adminFor.some(t => ['Worship Team', 'AV Team', 'Core Team'].includes(t))
                      || !!p.masterAdmin;
    /* The two headings Room bookings sits under. A bookings admin who is on
       neither Core Team nor any admin list still has to get through them -
       and must get nothing else from inside them, not even the Core Team
       charter the heading itself links to. */
    const OPENED_FOR_BOOKINGS = ['Core Team', 'Events and rooms'];
    /* On Kids Church, administers it, or a master admin (F-089). */
    const kids = p.teams.includes('Kids Church') ||
                 p.adminFor.includes('Kids Church') || !!p.masterAdmin;
    /* Worship & AV: on Worship, AV or Core Team, or a master admin. */
    const worship = p.teams.some(t => ['Worship Team', 'AV Team', 'Core Team'].includes(t)) ||
                    p.adminFor.some(t => ['Worship Team', 'AV Team', 'Core Team'].includes(t)) ||
                    !!p.masterAdmin;
    const expected = want
      .filter(w => !(BOOKINGS_ONLY.includes(w) && !books))
      .filter(w => !(KIDS_ONLY.includes(w) && !kids))
      .filter(w => !(WORSHIP_ONLY.includes(w) && !worship))
      .filter(w => !CORE_ONLY.includes(w) || onCore || (books && OPENED_FOR_BOOKINGS.includes(w)))
      .filter(w => !ADMIN_ONLY.includes(w) || anAdmin || (books && OPENED_FOR_BOOKINGS.includes(w)));
    ok('  the names are the approved ones, in order',
      JSON.stringify(seen) === JSON.stringify(expected),
      JSON.stringify(seen) === JSON.stringify(expected)
        ? expected.length + ' names, in order'
        : firstDifference(seen, expected));
    const stillHere = GONE_HEADINGS.filter(g => seen.includes(g))
      .concat(GONE_ANYWHERE.filter(g => (menu.text || '').toLowerCase().includes(g.toLowerCase())));
    /* Nothing in v2 links to the old dashboard page any more (17a). The file
       stays - the phone app still opens it - but every way of getting there
       from the hub has gone, and a leftover hubPages row must not bring one
       back. This reads every link on the page, so the Menu, the sidebar and
       "Where to?" are all covered in one go. */
    const toOldPortal = String(await ev(
      "[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')||'')" +
      ".filter(h=>/egbcworship(&|%26)av/i.test(h)).join(', ')"));
    /* A heading that only opened because of what is under it must not also
       be a way in. The bookings admin reaches Room bookings through Core
       Team > Events and rooms; the Core Team heading links to the Core Team
       charter, and they are not on Core Team. */
    const charterLink = String(await ev(
      "[...document.querySelectorAll('#toolList a[href]')].map(a=>a.getAttribute('href')||'')" +
      ".filter(h=>/coreteamcharter/i.test(h)).join(', ')"));
    ok('  a heading opened only by what is under it is not itself a link',
      p.teams.includes('Core Team') ? !!charterLink : !charterLink,
      p.teams.includes('Core Team')
        ? 'on Core Team, so the charter link is theirs: ' + (charterLink || '(MISSING)')
        : (charterLink ? 'the Core Team charter is linked and should not be: ' + charterLink
                       : 'no link to the Core Team charter'));
    ok('  nothing links to the old dashboard page', !toOldPortal,
      toOldPortal || 'no link to EGBCWorship&AV.html anywhere on the hub');
    ok('  the things taken out stay out', stillHere.length === 0,
      stillHere.join(', ') || 'the Apps group, the song library quick view, Song Summary and "(old)" are all gone');
    /* One structure, not two: the sidebar's "What you look after" must hold
       the admin pages the Menu holds, in the Menu's order. It used to come
       from the registry sorted alphabetically, which is a second arrangement
       of the same pages - the thing Step N exists to stop. */
    const sidebar = String(await ev(
      "(()=>{const el=document.getElementById('sidebar');if(!el)return '';" +
      "const i=[...el.children].findIndex(c=>c.className==='sgrp');" +
      "return i===-1?'':[...el.children].slice(i+1).map(a=>(a.textContent||'').trim()).join('|')})()"));
    /* What this person actually looks after, in the Menu's order. Not a flat
       list for "any admin": Events, Places and Backup & Restore are Core Team
       pages as well as admin ones, so Karen - who administers Kids Church and
       is on no team - looks after Room bookings and nothing else. Asserting
       the flat list said she should see three pages she cannot reach. */
    const wantAdmin = [
      /* Connect ChurchShow is admin: true and sits under Worship & AV, so
         the sidebar picks it up - it walks the pruned Menu for anything
         with admin or bookings on it (hub-app.js ~1162). It comes FIRST
         because that is where the Menu has it, and "in the Menu's order"
         is the whole point of this check. */
      ...(worshipAV && anAdmin ? ['Connect ChurchShow'] : []),
      ...(onCore && anAdmin ? ['Events', 'Places'] : []),
      ...(books ? ['Room bookings'] : []),
      ...(onCore && anAdmin ? ['Backup & Restore'] : [])
    ];
    ok("  the sidebar lists what they look after, in the Menu's order",
      sidebar === wantAdmin.join('|'),
      wantAdmin.length
        ? 'sidebar: ' + (sidebar || '(nothing)') + '   menu order: ' + wantAdmin.join('|')
        : 'nothing to look after, and nothing listed');

    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    if (wantShots) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      if (r.data) fs.writeFileSync(path.join(SHOTS, 'menu--' + label.replace(/[^a-z0-9]+/gi, '-') + '.png'),
        Buffer.from(r.data, 'base64'));
    }
  }

  /* ============== THE SAME MENU ON EVERY PAGE ========================

     Martin, 9 Oct 2026, looking at the live whatson.html: the Menu differs
     between pages. It did. egbc-menu.js was loaded by hub.html alone, and
     egbc-shell.js - which draws the Menu on all the others - built its own
     groups out of the registry: Apps, Everyone, AV, Core Team, Worship.

     Reading the Menu on the hub and calling Step N done is exactly how that
     survived. So this reads it on EVERY page that has one and compares it,
     name for name, with the hub's.                                      */

  console.log('');
  console.log('the same Menu on every page');

  /* Pages with no shell and no Menu, and why. A page that turns up with no
     Menu and is not in here fails the check - which is the point: the list
     is the decision, and a page falling out of the Menu by accident is the
     thing being guarded against. */
  const NO_MENU = {
    'hub.html': 'the Menu is its own panel, read above',
    'login.html': 'nobody is signed in yet',
    'index.html': 'the availability form, filled in by people with no account',
    'birthday.html': 'public',
    'youth-access.html': 'a young person with a code, not an account',
    'book.html': 'public hire page (events window)',
    'my-booking.html': 'public hire page (events window) - somebody with a booking reference, not an account',
    'hire.html': 'public hire page (events window)',
    'room.html': 'public hire page (events window)',
    'CoreTeamApp.html': 'phone app, installed rather than browsed to',
    'Performancenotes.html': 'phone app',
    'youthapp2.html': 'phone app',
    'worshiphubapp.html': 'phone app, and out of scope',
    'Handover.html': 'a one-off note, not part of the suite',
    'SharepointHeader.html': 'a fragment embedded elsewhere, not a page',
    'mix-builder.html': 'out of scope', 'mix-player.html': 'out of scope',
    'mix-analyser.html': 'out of scope', 'studio.html': 'out of scope',
    'photoeditor.html': 'out of scope', 'sitemaker.html': 'out of scope',
    'socialmaker.html': 'out of scope', 'Videoeditor.html': 'out of scope'
  };

  /* Read the drawn Menu, whichever panel it is in. Both carry .egbc-menu now,
     which is the point: one component. */
  const READ_ANY = `(() => {
    const el = document.querySelector('.egbc-menu');
    if (!el) return JSON.stringify({ none: true });
    const titles = [];
    el.querySelectorAll('.grp > span:not(.arw):not(.dot):not(.cnt), .grp .grp-link, .grp-body .sub, .grp-body .tool .nm, .tool > .tx > .nm')
      .forEach(n => { const t = (n.textContent || '').trim(); if (t) titles.push(t); });
    return JSON.stringify({ titles });
  })()`;

  /* Be one person for all of it - a master admin, who sees the most, so a
     page that drops a whole section is caught. */
  await rest('PATCH', `/v1/projects/${PROJECT}/databases/(default)/documents/addressBook/ab_tester`, {
    fields: { name: val('Menu Tester'), email: val(ACCOUNT.email),
      markers: val(['Core Team']), adminFor: val(['Core Team']), masterAdmin: val(true) }
  });
  await rest('PATCH', `/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`, {
    fields: { uid: val(uid), email: val(ACCOUNT.email), name: val('Menu Tester'),
      memberId: val('ab_tester'), linkedBy: val('admin'), status: val('active'),
      teams: val(['Core Team']), adminFor: val(['Core Team']), masterAdmin: val(true) }
  });

  /* The hub's Menu is the reference. Everything else has to match it. */
  await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(12000);
  await ev('window.alert=()=>{};window.confirm=()=>false;1');
  await ev("(()=>{const b=document.querySelector('#pickList .pick-t');if(b)b.click();})();1");
  await sleep(1200);
  await ev("(()=>{try{openTools()}catch(e){const el=document.getElementById('panel');if(el)el.classList.add('open')}})();1");
  await sleep(1500);
  const refRaw = await ev(READ_ANY);
  const reference = (JSON.parse(String(refRaw) || '{}').titles || []);
  ok('  the hub draws a Menu to compare against', reference.length > 10,
    reference.length + ' names');

  const pages = fs.readdirSync(V2).filter(f => /\.html$/i.test(f)).sort();
  /* Nothing is in here. youthserviceplanner.html was, on a premise that
     turned out to be wrong: it is a modular page that signs in through
     egbc-db.js, not a page with no sign-in, and the shell reads the person
     from there now. Kept as an empty list because the next page that
     cannot know who is looking should be named here with its reason,
     rather than quietly excluded. */
  const SIGNED_OUT = {};
  const differs = [], noMenu = [], broke = [], signedOut = [];

  for (const page of pages) {
    const hasShell = /egbc-shell\.js/.test(fs.readFileSync(path.join(V2, page), 'utf8'));
    if (!hasShell) {
      if (!NO_MENU[page]) noMenu.push(page + ' - has no shell and no reason given');
      continue;
    }
    watch.reset();
    await send('Page.navigate', { url: 'about:blank' }); await sleep(250);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + encodeURI(page) });
    await sleep(6500);
    await ev('window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;1');
    /* Open it the way the bar button does. */
    await ev("(()=>{try{EGBCShell.openMenu();return 1}catch(e){return String(e)}})()");
    await sleep(2600);
    const raw = await ev(READ_ANY);
    let got;
    try { got = JSON.parse(String(raw) || '{}'); } catch { got = { bad: String(raw).slice(0, 80) }; }

    if (got.none) { noMenu.push(page + ' - loads the shell but drew no Menu'); continue; }
    if (!got.titles) { broke.push(page + ' - ' + (got.bad || 'could not read it')); continue; }
    if (SIGNED_OUT[page]) {
      /* It must still be THE Menu, just the part a stranger sees: every name
         on it one of the hub's, and none of them a Core Team one. */
      const strayed = got.titles.filter(t => reference.indexOf(t) === -1);
      const core = got.titles.filter(t => ['Core Team', 'Planning', 'Rota Planner', 'Address Book'].indexOf(t) !== -1);
      if (strayed.length || core.length || !got.titles.length) {
        differs.push(page + ' (signed out): ' + (strayed.concat(core).join(', ') || 'drew nothing'));
      } else {
        signedOut.push(page + ' - ' + SIGNED_OUT[page]);
      }
      continue;
    }
    if (JSON.stringify(got.titles) !== JSON.stringify(reference)) {
      differs.push(page + ': ' + got.titles.slice(0, 6).join(' > ') +
        (got.titles.length > 6 ? ' …' : '') + '  (' + got.titles.length + ' names, hub has ' + reference.length + ')');
    }
  }

  console.log('  looked at ' + pages.length + ' pages, ' +
    (pages.length - Object.keys(NO_MENU).length) + ' of them with a Menu');
  ok('  every page draws the same Menu as the hub', differs.length === 0,
    differs.slice(0, 5).join('\n          ') || 'name for name, all of them');
  ok('  every page that should have a Menu has one', noMenu.length === 0,
    noMenu.slice(0, 5).join('\n          ') || 'none missing');
  if (signedOut.length) {
    console.log('          drawing the signed-out Menu, on purpose:');
    signedOut.forEach(s => console.log('            ' + s));
  }
  ok('  and none of them threw reading it', broke.length === 0,
    broke.slice(0, 5).join('\n          ') || 'none');

  /* Take the stale row out again. Leaving it behind made check-hub-tools.mjs
     report the retired page as missing from v2 on its next run - a true
     statement about data this check had planted. */
  await rest('DELETE', '/v1/projects/' + PROJECT + '/databases/(default)/documents/hubPages/stale_portal_row');
  await rest('DELETE', '/v1/projects/' + PROJECT + '/databases/(default)/documents/bookingSettings/synthetic_site');

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
