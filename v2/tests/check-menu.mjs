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
import { makeEval } from './browser-eval.mjs';

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

/* THE APPROVED STRUCTURE - the Menu by job, approved by Martin on 19 Oct
   2026 (design-mocks/navigation) - written out again here on purpose. If
   this file and egbc-menu.js were the same list, the check would only prove
   that a list equals itself.

   Each entry: [title, who sees it (a test on the person, c below; none =
   everybody), children]. A section or a heading with no page of its own
   has page: false. A team heading (gate) hides everything under it from
   somebody off the team. What is on screen is read in order: a section's
   label, then its pages; a heading that is also a page, inside a section,
   reads twice (its label, then the charter it opens). */
const all = () => true;
const APPROVED = [
  ['Home'], ["What's on"], ['Watch & Listen'], ['Give'], ['Gift Aid'], ['Care & support'],
  ['Care & support: what has come in', c => c.careReader], ['Prayer'], ['Notifications'],
  ['Sundays', null, [
    ['Rota', c => c.anyTeam], ['Rota planner', c => c.core], ['Sunday service plan', c => c.core],
    ['Preaching plan', c => c.anyTeam], ['Session planner', c => c.plans], ['Rota reports', c => c.rotaLead],
    ['Availability form', c => c.core]]],
  ['People and messages', null, [
    ['Address book', c => c.messages], ['Send an email', c => c.messages], ['Team emails', c => c.master],
    ['Notices', c => c.messages], ['Meetings']]],
  ['Events and rooms', null, [
    ['Events', c => (c.core && c.admin) || c.eventTeam], ['Places', c => c.runsBookings], ['Room bookings', c => c.books],
    ['Check-in', c => c.core && c.admin], ['Registers', c => c.core && c.admin], ['Headcounts', c => c.counts],
    ['Picture library', c => c.runsBookings], ['Book a room'], ['Hire our rooms'], ['Maintenance']]],
  ['Church admin', null, [
    ['Church settings', c => c.core && c.admin], ['Teams and groups', c => c.office],
    ['Payments', c => c.money], ['Safeguarding', c => c.admin], ['Safeguarding settings', c => c.admin],
    ['Due for deletion', c => c.admin], ['Small groups', c => c.admin], ['Forms', c => c.admin],
    ['Emails sent', c => c.core && c.admin && c.master], ['Manage Watch', c => c.master], ['Manage sermons', c => c.master],
    ['Backup', c => c.core && c.admin]]],
  ['My teams', null, [
    ['Worship & AV', all, [
      ['Play-Through'], ['Worship Training'], ['Music Database'], ['Music Uploader', c => c.worshipLead],
      ['How-To AV'], ['AV Troubleshoot'], ['Inventory', c => c.avLead], ['AV Infrastructure Mapper'], ['Monitor Setup'],
      ['Connect ChurchShow', c => c.admin && (c.master || c.p.adminFor.some(t => ['AV Team', 'Worship Team'].includes(t)))]],
      c => c.worship],
    ['Youth', all, [['Youth Service Planner', c => c.master || c.on('Youth Worship')]], c => c.youth],
    ['Kids Church', false, [["Children's register"], ['Sunday check-in']], c => c.kids],
    ['Core Team', c => c.core, [['Music Upload', c => c.core]]]]],
  ['Resources', null, [
    ['Pin boards', c => c.anyTeam], ['Apps and downloads'], ['Team Resources', c => c.anyTeam], ['Team Videos', c => c.anyTeam]]]
];
/* The plan group and the children's settings this check seeds. */
const PLAN_TEAM = 'Kids Church', KIDS_SETTINGS_TEAM = 'Kids Church';
const ROTA_TEAMS = ['Worship Team', 'AV Team', 'Choir', 'Kids Church', 'Youth Worship', 'Core Team'];
const YOUTH_TEAMS = ['Youth Worship', 'Lazers', 'ReNu'];
/* What the person is, written out here rather than read from egbc-auth.js,
   so the check cannot agree with the thing it is checking. */
function ctx(p) {
  const master = !!p.masterAdmin;
  const on = (t) => master || p.teams.includes(t) || p.adminFor.includes(t);
  const office = on('Church office');
  const admin = master || p.adminFor.length > 0;
  const core = master || p.teams.includes('Core Team');
  return {
    p, on, master, office, admin, core,
    anyTeam: master || p.teams.length > 0 || p.adminFor.length > 0,
    messages: master || p.teams.includes('Church office') || p.adminFor.length > 0,
    books: admin || !!p.bookingsAdmin,
    runsBookings: master || p.teams.includes('Church office') || !!p.bookingsAdmin,
    counts: master || p.adminFor.includes(KIDS_SETTINGS_TEAM),
    plans: master || !!p.planLeader || p.teams.includes(PLAN_TEAM),
    eventTeam: !!p.eventTeam,
    money: master || p.teams.includes(MONEY_TEAM),
    careReader: p.teams.includes('Pastoral'),
    rotaLead: master || p.adminFor.some(t => ROTA_TEAMS.includes(t)),
    /* Core Team is covered for Worship & AV (CORE_COVERS in egbc-auth.js). */
    worship: master || ['Worship Team', 'AV Team', 'Core Team'].some(t => p.teams.includes(t) || p.adminFor.includes(t)),
    worshipLead: master || p.adminFor.includes('Worship Team') || p.teams.includes('Core Team'),
    avLead: master || p.adminFor.includes('AV Team') || p.teams.includes('Core Team'),
    youth: master || YOUTH_TEAMS.some(t => p.teams.includes(t) || p.adminFor.includes(t)),
    kids: on('Kids Church')
  };
}
/* The names this person should see, in order. */
function expectedFor(p) {
  const c = ctx(p);
  const walk = (nodes, inside) => {
    const out = [];
    for (const [title, who, kids, gate] of nodes) {
      if (gate && !gate(c)) continue;
      const below = kids ? walk(kids, true) : [];
      const page = who !== null && who !== false;
      const self = page && (typeof who === 'function' ? who(c) : true);
      if (!self && !below.length) continue;
      if (kids && inside && self) out.push(title, title);   /* label, then its charter */
      else out.push(title);
      out.push(...below);
    }
    return out;
  };
  return walk(APPROVED, false);
}

/* Taken out, and they must stay out.
   `exact` ones are compared against a heading's own words, not searched for in
   the page's text: "Apps" is inside "Apps and downloads", which is a real
   entry, and searching for the shorter one reported the longer one as a fault. */
const GONE_HEADINGS = ['Apps'];
const GONE_ANYWHERE = ['Song Library - quick view', 'Song Summary', 'Worship & AV Hub (old)',
  'Worship & AV Hub',
  'sundayplannersonglibrary', 'song-summary.html'];

/* WHERE THEY FIRST DIFFER, not the first 150 characters of each. */
function firstDifference(seen, expected) {
  let i = 0;
  while (i < seen.length && i < expected.length && seen[i] === expected[i]) i++;
  const where = i === 0 ? 'at the very first name' : 'after "' + seen[i - 1] + '"';
  return 'they agree for ' + i + ' names, then differ ' + where
    + '\n          on screen: ' + (seen.slice(i, i + 5).join(' > ') || '(nothing more)')
    + '\n          approved : ' + (expected.slice(i, i + 5).join(' > ') || '(nothing more)')
    + '\n          ' + seen.length + ' names on screen, ' + expected.length + ' approved';
}

const PEOPLE = {
  'a Worship member': { teams: ['Worship Team'], adminFor: [], masterAdmin: false,
    sees: ['Worship & AV', 'Resources', 'Pin boards', 'Team Videos', 'Sundays'], doesNot: ['Core Team', 'Youth', 'Send an email', 'Address book'] },
  /* NEXT-BRIEF §25 CHANGED THIS PERSON, and the change is the point.
     "People and email" - the Address Book and the Email Compiler - used to
     come with Core Team. Martin: the church administrator may not be on
     Core Team, and a Worship admin should not get People and Send for
     looking after Worship. So those two follow the Church office group
     now, and Core Team on its own carries neither. */
  'somebody on Core Team': { teams: ['Core Team'], adminFor: [], masterAdmin: false,
    sees: ['Core Team', 'Rota planner', 'Sunday service plan'],
    /* Not even the heading: it has no page of its own, so with both its
       children gone there is nothing to draw. */
    doesNot: ['Church admin', 'Church settings', 'Address book', 'Send an email', 'Events'] },
  /* ...and this is who does get them: the church administrator, on no rota
     team at all, in the Church office group. They reach "Core Team" as a
     heading on the way - and must not thereby be handed its charter. */
  'the church administrator': { teams: ['Church office'], adminFor: [], masterAdmin: false,
    sees: ['People and messages', 'Address book', 'Send an email', 'Notices', 'Places', 'Picture library', 'Teams and groups'],
    doesNot: ['Rota planner', 'Worship & AV', 'Core Team'] },
  'a master admin': { teams: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true,
    sees: ['Core Team', 'Events and rooms', 'Church admin', 'Backup', 'Kids Church', 'Send an email'], doesNot: [] },
  /* F-089. A children's leader is on no other team and administers nothing,
     and must still reach the register - which is the whole reason it is a
     team heading beside Youth rather than buried under Core Team. */
  'a Kids Church leader': { teams: ['Kids Church'], adminFor: [], masterAdmin: false,
    sees: ['Kids Church', "Children's register", 'Sunday check-in', 'Session planner'],
    /* Worship & AV too: a team section they are not on, and the whole subtree
       goes with the heading - Play-Through and the rest, not just the name. */
    doesNot: ['Core Team', 'Rota planner', 'Church admin', 'Send an email',
              'Worship & AV', 'Play-Through', 'How-To AV', 'Monitor Setup'] },
  /* Karen: administers Kids Church without being on its rota.

     She DOES reach "Core Team" as a heading, and that is correct: Room
     bookings sits under it and is open to anyone who administers anything
     (F-067), so the headings above it open for her. She gets the heading
     without the charter link and without anything else inside it - which is
     the rule a heading opened only by its children follows, and there is an
     assertion for exactly that below. */
  'Karen, who administers Kids Church': { teams: [], adminFor: ['Kids Church'], masterAdmin: false,
    sees: ['Kids Church', "Children's register", 'Sunday check-in', 'Room bookings', 'Headcounts',
           /* WHO MAY: a team leader emails and posts to their team. */
           'Send an email', 'Address book', 'Notices'],
    doesNot: ['Rota planner', 'Events', 'Places', 'Picture library', 'Session planner',
              'Church settings', 'Backup', 'Worship & AV', 'Play-Through'] },
  /* The person F-067 is about: looks after one site's room bookings, is on
     Worship, is on neither Core Team nor any team's admin list. The entry
     lives under Core Team > Events and rooms, so the two headings above it
     have to open for them - and must not hand them the Core Team charter or
     anything else underneath. */
  'a bookings admin who is not Core Team': { teams: ['Worship Team'], adminFor: [], masterAdmin: false,
    bookingsAdmin: true,
    sees: ['Book a room', 'Events and rooms', 'Room bookings', 'Places', 'Picture library'],
    doesNot: ['Rota planner', 'Address book', 'Events', 'Headcounts', 'Church admin',
              'Backup', 'Kids Church', "Children's register", 'Sunday check-in', 'Core Team'] },
  /* F-200: the church renamed its money team "Treasury" (this check sets
     paymentSettings/public.moneyTeam). Payments follows the NAME. */
  'the treasurer, on a renamed money team': { teams: ['Treasury'], adminFor: [], masterAdmin: false,
    sees: ['Payments', 'Church admin'], doesNot: ['Core Team', 'Emails sent', 'Send an email'] },
  /* F-212: runs Film Club, administers nothing. Events (where "Events I
     run" is) and the two headings above it, and nothing else in them. */
  "somebody on an event's team": { teams: [], adminFor: [], masterAdmin: false,
    eventTeam: true,
    sees: ['Events and rooms', 'Events'],
    doesNot: ['Rota planner', 'Address book', 'Places', 'Room bookings', 'Registers',
              'Church admin', 'Backup', 'Core Team'] },
  /* F-226: leads a plan group (the Lazers, say) and is on no team. The
     Session planner, and none of the team pages. */
  'a plan group leader on no team': { teams: [], adminFor: [], masterAdmin: false,
    planLeader: true,
    sees: ['Session planner'],
    doesNot: ['Rota', 'Preaching plan', 'Pin boards', 'Core Team', 'Kids Church', 'Headcounts'] }
};
const MONEY_TEAM = 'Treasury';

const flat = (nodes, out = []) => {
  for (const [title, , kids] of nodes) { out.push(title); if (kids) flat(kids, out); }
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
  el.querySelectorAll('.sec-h, .grp > span:not(.arw):not(.dot):not(.cnt), .grp .grp-link, .sub, .grp-body .tool .nm, .tool > .tx > .nm')
    .forEach(n => { const t = (n.textContent || '').trim(); if (t) titles.push(t); });
  /* top-level pages that are not in a group are plain .tool children of #toolList */
  const top = [...el.children].filter(c => c.classList && c.classList.contains('tool'))
    .map(a => (a.querySelector('.nm') || {}).textContent || '').map(s => s.trim()).filter(Boolean);
  return JSON.stringify({ titles, top, text: (el.innerText || '').replace(/\\s+/g, ' ').trim() });
})()`;

(async () => {
  /* ---- EVERY PAGE THAT SHIPS HAS A WAY IN (HANDOVER-MAIN rule 14) -------
     Martin, 14 Oct 2026, could not find Safeguarding settings: it and eleven
     other working pages had no Menu entry. So every page in v2 is either in
     egbc-menu.js or on this list, with the reason it is reached from
     somewhere else. A new page with neither fails here, by name. */
  const REACHED_ELSEWHERE = {
    'app.html': 'the phone app itself', 'login.html': 'signing in',
    'CoreTeamApp.html': 'installed phone app', 'worshiphubapp.html': 'installed phone app',
    'youthapp2.html': 'installed phone app', 'AVteamlandingpage.html': 'installed phone app',
    'EGBCWorship&AV.html': 'installed phone app', 'Performancenotes.html': 'opened from the hub and the Worship app',
    'book.html': 'public: hiring a room', 'room.html': 'public: one room', 'my-booking.html': 'public: a hirer\'s booking link',
    'signup.html': 'public: an event\'s sign-up', 'my-signup.html': 'public: a sign-up\'s own link',
    'form.html': 'public: a form\'s own link', 'newhere.html': 'public: the welcome card and its QR',
    'whatson-embed.html': 'the church website\'s embed', 'upload.html': 'public: a guest\'s photo link',
    'youth-access.html': 'a young person with a code, not an account',
    'worried.html': 'opened from Care & support', 'groups.html': 'the "you" menu\'s My groups',
    'song-summary.html': 'opened from the service planners',
    'emailcompilerinstructions.html': 'opened from the Email Compiler',
    'rotaplannerinstructions.html': 'opened from the Rota Planner',
    'Serviceplannerinstructions.html': 'opened from the Sunday Service Planner',
    'uploaderinstructions.html': 'opened from the Music Uploader',
    'sundayplannersonglibrary.html': 'opened from the Sunday Service Planner',
    'training Sunday planner.html': 'part of Worship Training', 'trainingbatchimporter.html': 'part of Worship Training',
    'trainingmusicdatabase.html': 'part of Worship Training', 'trainingportalhub.html': 'part of Worship Training',
    'trainingrotaplanner.html': 'part of Worship Training',
    'studio.html': 'Calla Design, out of scope', 'birthday.html': 'Calla Design, out of scope',
    'photoeditor.html': 'Calla Design, out of scope', 'sitemaker.html': 'Calla Design, out of scope',
    'socialmaker.html': 'Calla Design, out of scope', 'Videoeditor.html': 'Calla Design, out of scope',
    'mix-builder.html': 'Martin\'s mix tools, out of scope', 'mix-player.html': 'Martin\'s mix tools, out of scope',
    'mix-analyser.html': 'Martin\'s mix tools, out of scope',
    'Handover.html': 'a one-off note, not part of the suite', 'SharepointHeader.html': 'a fragment, not a page',
    'give-regularly.html': 'linked from Give, when the church takes Direct Debits',
    'my-messages.html': 'the "you" menu (My messages) and the app\'s Me tab'
  };
  {
    const src = fs.readFileSync(path.join(V2, 'egbc-menu.js'), 'utf8');
    const inMenu = new Set([...src.matchAll(/url:\s*'([^']+)'/g)].map(m => m[1].toLowerCase()));
    const all = fs.readdirSync(V2).filter(f => /\.html$/i.test(f));
    const lost = all.filter(f => !inMenu.has(f.toLowerCase()) && !REACHED_ELSEWHERE[f]);
    ok('every page is in the Menu or reached from somewhere else, with the reason (rule 14)', lost.length === 0,
      'NO WAY IN: ' + lost.join(', ') + '\n          add each to egbc-menu.js, or to REACHED_ELSEWHERE here with why');
    const stale = Object.keys(REACHED_ELSEWHERE).filter(f => inMenu.has(f.toLowerCase()) || !all.includes(f));
    ok('  and nothing on that list is in the Menu now, or gone', stale.length === 0, stale.join(', '));
  }

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
  const ev = makeEval(send, "menu");

  /* MAKE THE ACCOUNT RATHER THAN HOPE FOR IT. This check signed in as an
     account another check happens to create, so on a fresh emulator - after
     a restart, or on a machine that has never run check-home-fits.mjs - it
     stopped at "Could not sign in" and measured nothing. A check that cannot
     run is not a gate. Already-exists is the normal answer and is ignored. */
  await new Promise((res) => {
    const d = JSON.stringify({ email: ACCOUNT.email, password: ACCOUNT.pw, returnSecureToken: true });
    const r = http.request({ host: 'localhost', port: 9099, method: 'POST',
      path: '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } },
      s => { s.on('data', () => {}); s.on('end', res); });
    r.on('error', res); r.end(d);
  });

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

  /* The Church office group has to exist for the church administrator to
     be in one (NEXT-BRIEF §25). A group is a team with rota:false carrying
     the Running things tabs its members get. */
  await rest('PATCH', '/v1/projects/' + PROJECT + '/databases/(default)/documents/teams/'
    + encodeURIComponent('Church office'), { fields: {
      name: val('Church office'), label: val('Church office'), colour: val('#111827'),
      rota: { booleanValue: false },
      runs: { arrayValue: { values: ['today', 'people', 'bookings', 'send'].map(val) } },
      archived: { booleanValue: false } } });

  const want = flat(APPROVED);
  console.log('the approved structure has ' + want.length + ' names\n');

  /* The money team's name, as the server writes it (F-200). */
  await rest('PATCH', `/v1/projects/${PROJECT}/databases/(default)/documents/paymentSettings/public?updateMask.fieldPaths=moneyTeam`,
    { fields: { moneyTeam: val(MONEY_TEAM) } });
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
    /* A plan group (F-226): its leaders by member id, and its team. */
    await rest('PATCH', '/v1/projects/' + PROJECT + '/databases/(default)/documents/planGroups/menu_group', {
      fields: { name: val('Menu Group Synthetic'), kind: val('children'), teamName: val(PLAN_TEAM),
        leaderIds: val(p.planLeader ? ['ab_tester'] : []), archived: val(false) }
    });
    /* The children's settings name the team whose admins count heads. */
    await rest('PATCH', '/v1/projects/' + PROJECT + '/databases/(default)/documents/kidsSettings/menu_site', {
      fields: { teams: val([KIDS_SETTINGS_TEAM]) }
    });
    /* An event's team is a list on the event (F-212), written the same way. */
    await rest('PATCH', '/v1/projects/' + PROJECT + '/databases/(default)/documents/calEvents/cev_menu_team', {
      fields: { title: val('Menu Film Club Synthetic'), audience: val(['members']), visibility: val('members'),
        status: val('confirmed'), startUtc: { timestampValue: '2027-01-15T19:00:00Z' },
        teamMemberIds: val(p.eventTeam ? ['ab_tester'] : []), teamUids: val(p.eventTeam ? [uid] : []) }
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
    const expected = expectedFor(p);
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
    /* THE LEFT COLUMN IS THE MENU (Menu by job, 19 Oct 2026): on a
       computer the hub draws the same Menu down the side, open, so the
       names there must be the approved ones too, in the same order. */
    const side = JSON.parse(String(await ev(
      "(()=>{const el=document.getElementById('sideMenu');if(!el)return '[]';const t=[];" +
      "el.querySelectorAll('.sec-h, .grp > span:not(.arw):not(.dot):not(.cnt), .grp .grp-link, .sub, .grp-body .tool .nm, .tool > .tx > .nm')" +
      ".forEach(n=>{const x=(n.textContent||'').trim();if(x)t.push(x)});return JSON.stringify(t)})()")) || '[]');
    ok('  the left column is the same Menu, in the same order',
      JSON.stringify(side) === JSON.stringify(expected),
      JSON.stringify(side) === JSON.stringify(expected) ? side.length + ' names' : firstDifference(side, expected));
    /* And no folded section there: on a computer everything is in view. */
    const folded = String(await ev("document.querySelectorAll('#sideMenu .grp.fold').length"));
    ok('  nothing folded away in it', folded === '0', folded + ' folded');

    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    if (wantShots) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      if (r.data) fs.writeFileSync(path.join(SHOTS, 'menu--' + label.replace(/[^a-z0-9]+/gi, '-') + '.png'),
        Buffer.from(r.data, 'base64'));
    }
  }
  /* Leave the emulator as found: nobody on the test event's team. */
  await rest('DELETE', '/v1/projects/' + PROJECT + '/databases/(default)/documents/calEvents/cev_menu_team');
  await rest('DELETE', '/v1/projects/' + PROJECT + '/databases/(default)/documents/planGroups/menu_group');
  await rest('DELETE', '/v1/projects/' + PROJECT + '/databases/(default)/documents/kidsSettings/menu_site');

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
    'newhere.html': 'public welcome card for visitors (events window) - no account, no Menu',
    'whatson-embed.html': 'the church website\'s embed (events window) - inside another site, no Menu',
    /* NOT AN OVERSIGHT - the point of it. APP-DESIGN-BRIEF §2 says the phone
       app has no hidden menu: four tabs along the bottom and nothing tucked
       behind a hamburger. check-app-shell.mjs asserts the absence. */
    'app.html': 'the phone app shell - four tabs and deliberately no Menu (APP-DESIGN-BRIEF §2)',
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
    el.querySelectorAll('.sec-h, .grp > span:not(.arw):not(.dot):not(.cnt), .grp .grp-link, .sub, .grp-body .tool .nm, .tool > .tx > .nm')
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
    /* A SCRIPT TAG, not a mention. This read the whole file for the name,
       so a comment on youth-access.html saying it loads the UI helper
       "rather than through egbc-shell.js" made the check believe it had a
       shell, open a Menu that was never there, and report the page as
       having lost one. A sentence about a file is not a load of it. */
    const hasShell = /<script[^>]+src=["'][^"']*egbc-shell\.js/
      .test(fs.readFileSync(path.join(V2, page), 'utf8'));
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
