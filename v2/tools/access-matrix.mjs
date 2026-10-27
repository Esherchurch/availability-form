/* THE ACCESS MATRIX: who sees what, made from the code (FINDINGS-churchhq
 * H-16; Martin, 26 Oct 2026: "can you check that the right things are for
 * the right people across the hub?").
 *
 *   node tools/access-matrix.mjs          (from v2/, the dev emulators up)
 *
 * Made-up people, one of each kind, signed in on the emulator. For each:
 *   - the Menu they are offered (EGBCMenu.forPerson), section by section -
 *     if the hub shows them a way to open it at all;
 *   - which of the hub's Home cards draw for them;
 *   - the app's spaces and each space's tabs (EGBCApp);
 *   - for every page with a guard (its egbc-guard.js tag), whether the guard
 *     lets them in (EGBCAuth.guardVerdict - the same decision require()
 *     makes when the page is opened).
 * Writes access-matrix.json and ACCESS-MATRIX.md (the table for Martin).
 * A cell: ✓ offered and let in; – neither; ⚠ OFFERED BUT REFUSED (always a
 * bug); ◐ let in but not offered (a page reached from elsewhere, or a bug).
 * What a page decides inside itself, past its guard, is not seen here.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9827, SERVE = 8991, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* The people. short: the column heading. */
export const PEOPLE = [
  { key: 'pending', short: 'Pending', name: 'AM Pending Synthetic', teams: [], status: 'pending', noMember: true },
  { key: 'attender', short: 'Attender', name: 'AM Attender Synthetic', teams: [], attender: true, churchMember: false },
  { key: 'member', short: 'Member', name: 'AM Member Synthetic', teams: [] },
  { key: 'kids', short: 'Kids Ch', name: 'AM Kids Synthetic', teams: ['Kids Church'] },
  { key: 'kidsLead', short: 'Kids lead', name: 'AM Kids Lead Synthetic', teams: ['Kids Church'], roles: { 'Kids Church': 'leader' } },
  { key: 'worship', short: 'Worship', name: 'AM Worship Synthetic', teams: ['Worship Team'] },
  { key: 'worshipLead', short: 'Wor lead', name: 'AM Worship Lead Synthetic', teams: ['Worship Team'], roles: { 'Worship Team': 'leader' } },
  /* ADMINISTERS A TEAM (adminFor, set in Permissions) - not the same as a
     leader by role, and most of the Menu's admin gates ask for this. */
  { key: 'worshipAdmin', short: 'Wor admin', name: 'AM Worship Admin Synthetic', teams: ['Worship Team'], adminFor: ['Worship Team'] },
  { key: 'kidsAdmin', short: 'Kids admin', name: 'AM Kids Admin Synthetic', teams: ['Kids Church'], adminFor: ['Kids Church'] },
  { key: 'coreAdmin', short: 'Core admin', name: 'AM Core Admin Synthetic', teams: ['Core Team'], adminFor: ['Core Team'] },
  { key: 'av', short: 'AV', name: 'AM AV Synthetic', teams: ['AV Team'] },
  { key: 'wcore', short: 'Wor core', name: 'AM Worship Core Synthetic', teams: ['Core Team'] },
  { key: 'kycore', short: 'K&Y core', name: 'AM KY Core Synthetic', teams: ['Kids & Youth Core Team'] },
  { key: 'office', short: 'Office', name: 'AM Office Synthetic', teams: ['Church office'] },
  { key: 'elders', short: 'Elders', name: 'AM Elder Synthetic', teams: ['Elders'] },
  { key: 'finance', short: 'Finance', name: 'AM Finance Synthetic', teams: ['Finance'] },
  { key: 'pastoral', short: 'Pastoral', name: 'AM Pastoral Synthetic', teams: ['Pastoral'] },
  { key: 'sglead', short: 'SG lead', name: 'AM Safeguarding Lead Synthetic', teams: [] },
  { key: 'bookings', short: 'Bookings', name: 'AM Bookings Synthetic', teams: [] },
  { key: 'planlead', short: 'Plan grp', name: 'AM Plan Group Lead Synthetic', teams: [] },
  /* On an event's team (calEvents teamMemberIds), administering nothing. */
  { key: 'evteam', short: 'Event team', name: 'AM Event Team Synthetic', teams: [] },
  { key: 'master', short: 'Master', name: 'AM Master Synthetic', teams: [], master: true }
];

const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : (v && typeof v === 'object') ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } } : { stringValue: String(v) };
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + enc(p), { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }, OWNER);
/* Only the fields named, leaving the rest of the document alone; a field
   named with no value is removed. */
const putOnly = (p, keys, o) => req(8181, 'PATCH', DOCS + '/' + enc(p) + '?' + keys.map((k) => 'updateMask.fieldPaths=' + k).join('&'),
  { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }, OWNER);
const getField = async (p, k) => { const r = await req(8181, 'GET', DOCS + '/' + enc(p), undefined, OWNER); if (r.status !== 200) return undefined;
  const f = (JSON.parse(r.body).fields || {})[k]; return f ? (f.stringValue !== undefined ? f.stringValue : f.arrayValue ? (f.arrayValue.values || []).map((x) => x.stringValue) : undefined) : undefined; };

/* Every page's guard, from its own tag. */
export function guards() {
  const out = {};
  for (const f of fs.readdirSync(V2).filter((x) => /\.html$/i.test(x))) {
    const t = fs.readFileSync(path.join(V2, f), 'utf8');
    const m = /<script[^>]*src="egbc-guard\.js[^"]*"([^>]*)><\/script>/i.exec(t);
    if (!m) continue;
    const a = m[1], g = (n) => { const x = new RegExp('data-' + n + '="([^"]*)"').exec(a); return x ? x[1] : null; }, has = (n) => new RegExp('data-' + n + '(\\s|=|$)').test(a);
    out[f] = { team: g('team'), role: g('role'), adminAny: g('admin') === 'any', alsoTeam: g('also-team'), alsoJob: g('also-job'), job: g('job'), anyTeam: has('any-team'), master: has('master'), leadsOrCore: has('leads') || has('book-room'), allowPending: g('allow-pending'), feature: g('feature') };
  }
  return out;
}

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';

/* transform(url, text): the checks' breaks change a file as it is served. */
export async function build({ quiet, transform } = {}) {
  const say = (s) => { if (!quiet) console.log(s); };
  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    let body = fs.readFileSync(f);
    if (/\.html$/.test(f)) { let t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); if (h) t = t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length); body = Buffer.from(t, 'utf8'); }
    if (transform && /\.(html|js)$/.test(f)) body = Buffer.from(transform(url, body.toString('utf8')), 'utf8');
    s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : /\.json$/.test(f) ? 'application/json' : /\.png$/.test(f) ? 'image/png' : 'text/html') + (/\.png$/.test(f) ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-matrix-' + process.pid), 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  const G = guards();
  let sgSite = null, sgWas;
  const result = { made: new Date().toISOString(), people: PEOPLE.map(({ key, short, name }) => ({ key, short, name })), guards: G, by: {} };
  try {
    /* The people, and the few records that make a named role. */
    /* The money team by the name the church gives it (F-200): another check
       may have renamed it, and Finance off it was offered no Payments. */
    const moneyTeam = (await getField('paymentSettings/public', 'moneyTeam')) || 'Finance';
    PEOPLE.find((p) => p.key === 'finance').teams = [moneyTeam];
    for (const p of PEOPLE) {
      p.email = 'am.' + p.key.toLowerCase() + '@example.invalid'; p.member = 'ab_am_' + p.key;
      let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
      if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
      p.uid = up.localId;
      await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
      if (!p.noMember) await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor || [], masterAdmin: !!p.master, archived: false, isMinor: false, churchMember: p.churchMember !== false, attender: !!p.attender });
      await put('users/' + p.uid, Object.assign({ uid: p.uid, email: p.email, name: p.name, status: p.status || 'active', teams: p.teams, adminFor: p.adminFor || [], masterAdmin: !!p.master,
        churchMember: p.churchMember !== false, attender: !!p.attender }, p.noMember ? {} : { memberId: p.member, linkedBy: 'admin' }, p.roles ? { roles: p.roles } : {}));
    }
    const byKey = Object.fromEntries(PEOPLE.map((p) => [p.key, p]));
    await put('teams/Church office', { name: 'Church office', label: 'Church office', rota: false, runs: ['today', 'people', 'bookings', 'send'], archived: false });
    /* THE SAFEGUARDING LEAD, AS A CHURCH MAKES ONE: the deputy on the lead
       site (the server's refreshCareStatus turns that into careRouting/status,
       which the Menu and the rules both read). Written straight into
       careRouting/status, the next bookingSettings write had the server
       rewrite it, and the lead was offered nothing (the reviewer, 27 Oct). */
    sgSite = (await getField('safeguardingSettings/defaults', 'leadSiteId')) || 'site_am';
    sgWas = await getField('bookingSettings/' + sgSite, 'safeguardingDeputy');
    if (sgSite === 'site_am') await putOnly('safeguardingSettings/defaults', ['leadSiteId'], { leadSiteId: sgSite });
    await put('bookingSettings/site_am', { bookingsAdmins: [byKey.bookings.member] });
    await putOnly('bookingSettings/' + sgSite, ['safeguardingDeputy'], { safeguardingDeputy: byKey.sglead.member });
    for (let i = 0; i < 40 && ((await getField('careRouting/status', 'leadIds')) || []).indexOf(byKey.sglead.member) === -1; i++) await sleep(500);
    if (((await getField('careRouting/status', 'leadIds')) || []).indexOf(byKey.sglead.member) === -1)
      throw new Error('the server did not make the safeguarding deputy one (careRouting/status) - are the functions emulator and its triggers up?');
    await put('calEvents/cev_am', { title: 'AM event (synthetic)', teamMemberIds: [byKey.evteam.member], audience: [], date: '2099-01-01', archived: false });
    await put('planGroups/pg_am', { name: 'AM group (synthetic)', kind: 'children', teamName: 'Kids Church', leaderIds: [byKey.planlead.member], archived: false });

    let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (list.some((x) => x.type === 'page')) break; } catch {} await sleep(500); }
    const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
    let id = 0; const pend = new Map();
    const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
    await new Promise(r => ws.onopen = r);
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
    const ev = async (x, aw) => ((await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: !!aw })).result || {}).value;
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    for (const p of PEOPLE) {
      say('  ' + p.name);
      await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2000);
      await ev('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
      await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
      await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' });
      for (let i = 0; i < 50 && String(await ev('!!(window.EGBCMenu && window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile())')) !== 'true'; i++) await sleep(400);
      await sleep(4500);
      const hub = JSON.parse(await ev('(function(){'
        + 'var opens=[].some.call(document.querySelectorAll("#egbc-nav-btn,[onclick*=openMenuHere],[onclick*=openTools]"),function(b){return b.offsetParent!==null&&!b.closest("#egbc-blocked-page")});var menu=[];if(opens)(function w(n,sec){(n||[]).forEach(function(x){var s=x.section?x.title:sec;if(x.url)menu.push({url:x.url.split("?")[0],title:x.title,section:s});if(x.children)w(x.children,s)})})(window.EGBCMenu?EGBCMenu.forPerson(EGBCMenu.who()):[],"");'
        + 'var cards=[].map.call(document.querySelectorAll("[id$=Card]"),function(el){return {id:el.id,on:el.offsetParent!==null&&el.textContent.trim().length>0}}).filter(function(c){return c.on}).map(function(c){return c.id});'
        + 'var g=' + JSON.stringify(G) + ',v={};Object.keys(g).forEach(function(f){var o=g[f];v[f]=EGBCAuth.guardVerdict?EGBCAuth.guardVerdict(o):"?";});'
        + 'return JSON.stringify({menu:menu,opens:opens,blocked:document.body.getAttribute("data-egbc-blocked")||"",cards:cards,verdict:v,status:(EGBCAuth.profile()||{}).status||"none"})})()') || '{"menu":[],"cards":[],"verdict":{}}');
      await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
      for (let i = 0; i < 40 && String(await ev('!!(window.EGBCApp && EGBCAuth.profile && EGBCAuth.profile())')) !== 'true'; i++) await sleep(400);
      await sleep(1500);
      const app = JSON.parse(await ev('(function(){try{var s=EGBCApp.spacesFor(EGBCApp.who());return JSON.stringify(s.map(function(k){return {space:k,label:(EGBCApp.SPACES[k]||{}).label,tabs:(EGBCApp.tabsFor(k)||[]).map(function(t){return t[1]})}}))}catch(e){return "[]"}})()') || '[]');
      result.by[p.key] = Object.assign(hub, { app });
    }
  } finally {
    for (const p of PEOPLE) { if (p.uid) await req(8181, 'DELETE', DOCS + '/users/' + p.uid, undefined, OWNER).catch(() => {}); if (p.member) await req(8181, 'DELETE', DOCS + '/addressBook/' + p.member, undefined, OWNER).catch(() => {}); }
    if (sgSite && sgSite !== 'site_am') await putOnly('bookingSettings/' + sgSite, ['safeguardingDeputy'], sgWas ? { safeguardingDeputy: sgWas } : {}).catch(() => {});
    if (sgSite === 'site_am') await putOnly('safeguardingSettings/defaults', ['leadSiteId'], {}).catch(() => {});
    for (const d of ['bookingSettings/site_am', 'planGroups/pg_am', 'calEvents/cev_am']) await req(8181, 'DELETE', DOCS + '/' + enc(d), undefined, OWNER).catch(() => {});
    try { chrome.kill(); } catch {}
    server.close();
  }
  return result;
}

/* What a page's guard asks, in words. */
export function guardWords(g) {
  if (!g) return 'no guard';
  if (g.master) return 'master admins';
  if (g.leadsOrCore) return 'team leaders, core teams, the office and bookings admins';
  const teams = (g.team || '').split(',').map((s) => s.trim()).filter(Boolean);
  let w = teams.length ? (g.role === 'leader' ? 'leaders of ' : 'on ') + teams.join(', ')
    : g.job ? 'doing the ' + g.job + ' job'
    : g.anyTeam ? 'on any team' : g.adminAny ? 'an admin of any team' : 'anyone signed in';
  if (g.alsoTeam) w += ', or on ' + g.alsoTeam;
  if (g.alsoJob) w += ', or doing the ' + g.alsoJob + ' job';
  if (g.allowPending) w += ' (pending too)';
  return w;
}
const openGuard = (g) => guardWords(g) === 'anyone signed in' || guardWords(g) === 'anyone signed in (pending too)';

/* MARTIN'S DECISIONS (26 Oct 2026; FINDINGS-churchhq H-16). Each is the set
   of people who should be offered the page; the table lists every person
   the code treats differently. */
export const DECIDED = [
  { url: 'maintenance.html', what: 'Maintenance (report a repair): every member', who: (p) => p.key !== 'pending' },
  { url: 'peep.html', what: 'My evacuation plan: every member', who: (p) => p.key !== 'pending' },
  { url: 'hire.html', what: 'Hire our rooms: every member', who: (p) => p.key !== 'pending' },
  /* Martin, 27 Oct 2026: also the office and the bookings admins. */
  { url: 'rooms.html', what: 'Book a room: core teams, team leaders, the office and the bookings admins', who: (p) => ['kidsLead', 'worshipLead', 'worshipAdmin', 'kidsAdmin', 'coreAdmin', 'wcore', 'kycore', 'office', 'bookings', 'master'].includes(p.key) },
  { url: 'preaching-plan.html', from: 'Martin', what: 'Preaching plan: edited by the leadership job (EGBC: Elders) and the pastor/minister role; read-only for whoever may use the Rota planner; nobody else',
    who: (p, by) => p.key === 'elders' || p.key === 'master' || (((by[p.key] || {}).menu || []).some((m) => m.url === 'Planner.html')) },
  /* THE REVIEWER'S FINDINGS (27 Oct 2026), as settled; Martin to confirm. */
  { url: 'safeguarding.html', from: 'reviewer', what: 'Safeguarding: the lead and deputy, and master admins', who: (p) => ['sglead', 'master'].includes(p.key) },
  { url: 'safeguarding-settings.html', from: 'reviewer', what: 'Safeguarding settings: the lead and deputy, and master admins', who: (p) => ['sglead', 'master'].includes(p.key) },
  { url: 'safeguarding-risk.html', from: 'reviewer', what: 'Safeguarding risks: the lead and deputy, the trustees (EGBC: Elders), master admins, and group leaders read only (F-304)', who: (p) => ['sglead', 'elders', 'master', 'planlead'].includes(p.key) },
  { url: 'index.html', from: 'reviewer', what: 'Availability form: anyone on a team with a rota', who: (p) => ['kids', 'kidsLead', 'kidsAdmin', 'worship', 'worshipLead', 'worshipAdmin', 'av', 'wcore', 'kycore', 'coreAdmin', 'master'].includes(p.key) },
  { url: 'payments.html', from: 'reviewer', what: 'Payments: the money team (EGBC: Finance) and master admins', who: (p) => ['finance', 'master'].includes(p.key) },
  { url: 'churchshow.html', from: 'reviewer', what: 'Connect ChurchShow: admins of AV or Worship (an admin of the core team covering them too, H-15), and master admins', who: (p) => ['worshipAdmin', 'coreAdmin', 'master'].includes(p.key) },
  { url: 'checkin.html', from: 'reviewer', what: "Check-in: core team admins, the event's own team, master admins", who: (p) => ['coreAdmin', 'evteam', 'master'].includes(p.key) },
  { url: 'attendance.html', from: 'reviewer', what: "Registers: core team admins, the event's own team, master admins", who: (p) => ['coreAdmin', 'evteam', 'master'].includes(p.key) }
];

/* The cells: a page's row, for each person. */
export function cells(result) {
  const rows = new Map();
  const master = result.by.master || { menu: [] };
  /* Every page any person is offered, in the master admin's Menu order. */
  const order = [];
  for (const p of result.people) for (const m of (result.by[p.key] || {}).menu || []) if (!order.some((o) => o.url === m.url)) order.push(m);
  order.sort((a, b) => master.menu.findIndex((m) => m.url === a.url) - master.menu.findIndex((m) => m.url === b.url));
  for (const m of order) {
    const row = {}, g = (result.guards || {})[m.url];
    for (const p of result.people) {
      const r = result.by[p.key] || {};
      const offered = (r.menu || []).some((x) => x.url === m.url);
      const v = (r.verdict || {})[m.url];
      const letIn = v === undefined ? (r.status === 'active') : v === '';
      /* A page whose guard asks only for a sign-in decides inside itself;
         not offering it is the whole of the answer here. */
      row[p.key] = offered && letIn ? '✓' : offered ? '⚠' : letIn && v !== undefined && !openGuard(g) ? '◐' : '–';
    }
    rows.set(m.url, { title: m.title, section: m.section || '', guard: g ? guardWords(g) : 'no guard', row });
  }
  return rows;
}

/* Who the code treats differently from what Martin decided. */
export function differences(result) {
  const rows = cells(result), out = [];
  for (const d of DECIDED) {
    const r = rows.get(d.url);
    const wrong = result.people.filter((p) => {
      const want = !!d.who(p, result.by), got = !!r && r.row[p.key] === '✓';
      return want !== got;
    }).map((p) => ({ key: p.key, short: p.short, want: !!d.who(p, result.by), got: !!r && r.row[p.key] === '✓' }));
    out.push({ url: d.url, what: d.what, from: d.from || 'Martin', wrong });
  }
  return out;
}

export function markdown(result) {
  const P = result.people, rows = cells(result);
  const head = (first) => '| ' + first + ' | ' + P.map((p) => p.short).join(' | ') + ' |\n|---|' + (first === 'Page | Guard' ? '---|' : '') + P.map(() => ':-:').join('|') + '|\n';
  let md = '# Who sees what: the access matrix\n\n'
    + 'Made from the code by `node tools/access-matrix.mjs` on ' + result.made.slice(0, 10) + ', signed in as made-up people on the emulator (FINDINGS-churchhq H-16). The Menu counts only where the hub gives the person a way to open it.\n\n'
    + '**✓** in their Menu, and the page lets them in · **–** not in their Menu · **⚠ in their Menu, but the page refuses them (always a bug)** · **◐ not in their Menu, but the page would let them in** (reached from somewhere else, or a gap)\n\n'
    + 'A page whose guard asks only "anyone signed in" decides inside itself who sees what; this table shows only whether it is offered.\n\n'
    + 'People: ' + P.map((p) => '**' + p.short + '** ' + p.name.replace(/^AM | Synthetic$/g, '')).join(' · ') + '\n';
  md += '\n## Where the code differs from what was decided\n\nMartin\'s decisions first; "(reviewer)" marks the reviewer\'s findings of 27 Oct, which Martin is to confirm.\n\n';
  for (const d of differences(result)) {
    md += '- ' + (d.from === 'reviewer' ? '(reviewer) ' : '') + '**' + d.what + '** (' + d.url + '): ' + (d.wrong.length ? d.wrong.map((w) => w.short + (w.want ? ' should have it' : ' should not')).join(', ') : 'matches') + '\n';
  }
  md += '- **The pastor/minister role** is the Pastor chosen in Team emails (teamMailSettings/main.pastor), one person, not a team; the table cannot show them because only master admins and the Pastor may read who it is.\n';
  let sec = null;
  for (const [url, r] of rows) {
    if (r.section !== sec) { sec = r.section; md += '\n## ' + (sec || 'Top of the Menu') + '\n\n' + head('Page | Guard'); }
    md += '| ' + r.title + ' <small>(' + url + ')</small> | ' + r.guard + ' | ' + P.map((p) => r.row[p.key]).join(' | ') + ' |\n';
  }
  md += '\n## The hub\'s Home cards\n\n' + head('Card');
  const allCards = [...new Set(P.flatMap((p) => (result.by[p.key] || {}).cards || []))].sort();
  for (const c of allCards) md += '| ' + c.replace(/Card$/, '') + ' | ' + P.map((p) => (((result.by[p.key] || {}).cards || []).includes(c) ? '✓' : '–')).join(' | ') + ' |\n';
  md += '\n## The app\'s spaces (and their tabs)\n\n';
  for (const p of P) md += '- **' + p.short + ':** ' + (((result.by[p.key] || {}).app || []).map((s) => s.label + ' (' + s.tabs.join(', ') + ')').join('; ') || 'none') + '\n';
  return md;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  /* --from-json: write the table again from the last run, without the emulator. */
  const r = process.argv.includes('--from-json') ? JSON.parse(fs.readFileSync(path.join(V2, 'access-matrix.json'), 'utf8')) : await build();
  fs.writeFileSync(path.join(V2, 'access-matrix.json'), JSON.stringify(r, null, 1));
  fs.writeFileSync(path.join(V2, 'ACCESS-MATRIX.md'), markdown(r));
  const bad = [...cells(r)].filter(([, x]) => Object.values(x.row).includes('⚠'));
  console.log('wrote access-matrix.json and ACCESS-MATRIX.md: ' + cells(r).size + ' pages, ' + r.people.length + ' people, ' + bad.length + ' with "offered but refused"');
}
