/* Home by job (Martin approved the mock-ups, 19 Oct 2026:
 * design-mocks/navigation).
 *
 *   node tests/check-home-jobs.mjs      (from v2/, the dev emulators up)
 *
 * As five invented people - a Kids Church leader, the church office, a
 * Worship member who leads nothing, somebody on Core Team, somebody on no
 * team - on the hub at 1280 and 375:
 *   the greeting and the coming Sunday under it;
 *   the quick row: Send an email and Post a notice for whoever may (WHO MAY),
 *     "your team" for a leader and "anyone"/"everyone" for the office; Rota
 *     planner for Core Team; nothing for the member;
 *   This Sunday for whoever plans Sundays: leader, speaker, roles filled,
 *     songs with keys;
 *   on a phone, the Sundays jobs card, and Coming up for somebody on no team;
 *   the Menu's "Post a notice" (hub.html?notice=new) opens the editor for a
 *     leader and the notices for anybody else.
 * The Menu itself, and the left column being that Menu: check-menu.mjs.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9813, SERVE = 9019, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  leader: { email: 'hj.leader@example.invalid', member: 'ab_hj_leader', name: 'Lena Synthetic', teams: ['Kids Church'], adminFor: ['Kids Church'], masterAdmin: false },
  office: { email: 'hj.office@example.invalid', member: 'ab_hj_office', name: 'Olly Synthetic', teams: ['Church office'], adminFor: [], masterAdmin: false },
  member: { email: 'hj.member@example.invalid', member: 'ab_hj_member', name: 'Mo Synthetic', teams: ['Worship Team'], adminFor: [], masterAdmin: false },
  core: { email: 'hj.core@example.invalid', member: 'ab_hj_core', name: 'Cass Synthetic', teams: ['Core Team', 'Worship Team'], adminFor: [], masterAdmin: false },
  none: { email: 'hj.none@example.invalid', member: 'ab_hj_none', name: 'Pat Synthetic', teams: [], adminFor: [], masterAdmin: false }
};
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : (v && typeof v === 'object') ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';

/* Next Sunday, and an invented service on it. */
const SUN = (() => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); })();
const EV = 'hj_sunday', SV = 'hj_service', CE = 'hj_public';
/* The ORIGINAL site's portal heading, on the same document v2's banner
   picture lives in (portal/dashboardContent.hero). Synthetic stand-in. */
const OLD_HEADING = 'Welcome to the Old Portal Synthetic';

(async () => {
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin',
      teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, churchMember: true });
  }
  await put('events/' + EV, { date: SUN, type: 'Sunday Morning Worship', termLabel: 'Synthetic', teams: ['Worship Team'], roles: ['Keyboard', 'Sound'],
    assignments: { Keyboard: { id: 'ab_hj_core', name: 'Cass Synthetic' } }, serviceLeader: 'Leader Synthetic', speaker: 'Speaker Synthetic',
    archived: false, startTime: '08:00', serviceTime: '10:30' });
  const hadPortal = await req(8181, 'GET', DOCS + '/portal/dashboardContent', undefined, OWNER);
  const hadKids = await req(8181, 'GET', DOCS + '/teamContent/' + encodeURIComponent('Kids Church'), undefined, OWNER);
  await req(8181, 'PATCH', DOCS + '/portal/dashboardContent?updateMask.fieldPaths=hero', { fields: { hero: { mapValue: { fields: {
    title: { stringValue: OLD_HEADING }, subtitle: { stringValue: 'Old portal line synthetic' } } } } } }, OWNER);
  await req(8181, 'PATCH', DOCS + '/teamContent/' + encodeURIComponent('Kids Church') + '?updateMask.fieldPaths=heroTitle',
    { fields: { heroTitle: { stringValue: 'Kids Banner Synthetic' } } }, OWNER);
  await put('services/' + SV, { date: SUN, worshipLeader: 'Leader Synthetic', order: [{ type: 'song', title: 'Song Alpha Synthetic', keys: ['G'] }, { type: 'song', title: 'Song Beta Synthetic', keys: ['C'] }] });
  await put('calEvents/' + CE, { title: 'Harvest Supper Synthetic', category: 'social', status: 'confirmed', visibility: 'public', audience: ['public', 'members'],
    startUtc: Date.now() + 5 * 86400000, endUtc: Date.now() + 5 * 86400000 + 7200000, teams: [], featured: false });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript' : e === '.css' ? 'text/css' : e === '.png' ? 'image/png' : 'application/octet-stream') + (e === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-hj-' + process.pid),
    '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; } watch.handle(m); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const evl = makeEval(send, 'hj');
  const J = async (x) => JSON.parse(String(await evl(x)));
  const signIn = async (p) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await evl('sessionStorage.clear();localStorage.removeItem("egbc_hub_team");localStorage.setItem("egbc_email_user","Tester");1');
    for (let i = 0; i < 3; i++) {
      await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').catch(function(){})', true); await sleep(800);
      if (String(await evl('(firebase.auth(EGBCAuth.app).currentUser||{}).email||""')) === p.email) return;
    }
  };
  const open = async (page, wait) => { await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page }); await sleep(wait || 9000); };
  const size = (w) => send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 700 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 700 });
  const quick = () => J('JSON.stringify([].filter.call(document.querySelectorAll("#quickRow a, #quickRow button"),function(b){return b.offsetParent}).map(function(b){return b.textContent.replace(/\\s+/g," ").trim()}))');
  const text = (id) => J('JSON.stringify((document.getElementById(' + JSON.stringify(id) + ')||{}).innerText||"")');
  const shown = (id) => J('JSON.stringify(!!(document.getElementById(' + JSON.stringify(id) + ')||{}).offsetParent)');

  try {
    console.log('A Kids Church leader (1280)');
    await size(1280); await signIn(PEOPLE.leader); watch.reset();
    await open('hub.html', 11000);
    const hero = await text('heroTitle');
    ok('  their team\u2019s own banner title wins', hero === 'Kids Banner Synthetic', hero);
    const q1 = await quick();
    ok('  Send an email and Post a notice, to their own team', q1.includes('Send an emailyour team') || (q1.some(t => /^Send an email ?your team$/.test(t)) && q1.some(t => /^Post a notice ?your team$/.test(t))), JSON.stringify(q1));
    ok('  and no Rota planner, which is not theirs', !q1.some(t => /Rota planner/.test(t)), JSON.stringify(q1));
    ok('  no This Sunday card - they do not plan Sundays', !(await shown('sundayCard')));
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());
    await open('hub.html?notice=new', 11000);
    ok('  the Menu\u2019s "Post a notice" opens the editor', String(await evl('document.getElementById("newsModal").classList.contains("on")')) === 'true');

    console.log('\nThe church office (1280)');
    await signIn(PEOPLE.office); watch.reset();
    await open('hub.html', 11000);
    const q2 = await quick();
    ok('  Send an email to anyone, Post a notice to everyone', q2.some(t => /^Send an email ?anyone$/.test(t)) && q2.some(t => /^Post a notice ?everyone$/.test(t)), JSON.stringify(q2));

    console.log('\nA Worship member who leads nothing (1280)');
    await signIn(PEOPLE.member); watch.reset();
    await open('hub.html', 11000);
    const q3 = await quick();
    ok('  no quick buttons at all', q3.length === 0, JSON.stringify(q3));
    /* THE HEADING (Martin, 19 Oct 2026): "Welcome, <first name>" - never
       the old site's portal heading, which stays as it is. */
    const h3 = await text('heroTitle');
    ok('  the heading is "Welcome, Mo", not the old site\u2019s portal heading', h3 === 'Welcome, Mo', h3);
    const oldHero = await req(8181, 'GET', DOCS + '/portal/dashboardContent', undefined, OWNER);
    const oldTitle = ((((JSON.parse(oldHero.body || '{}').fields || {}).hero || {}).mapValue || {}).fields || {}).title;
    ok('  and the old site\u2019s heading is untouched', oldTitle && oldTitle.stringValue === OLD_HEADING, JSON.stringify(oldTitle));
    const sub = await text('heroSub');
    ok('  the coming Sunday under the greeting, with who is preaching', sub.includes('Morning Worship at 10:30') && sub.includes('Speaker Synthetic preaching'), sub);
    await open('hub.html?notice=new', 11000);
    ok('  "Post a notice" from the Menu shows them the notices instead', String(await evl('document.getElementById("latestPanel").classList.contains("on") && !document.getElementById("newsModal").classList.contains("on")')) === 'true');

    console.log('\nSomebody on Core Team (1280, then 375)');
    await signIn(PEOPLE.core); watch.reset();
    await open('hub.html', 11000);
    const q4 = await quick();
    ok('  Rota planner in the quick row', q4.some(t => /Rota planner/.test(t)), JSON.stringify(q4));
    const sc = await text('sundayCard');
    ok('  This Sunday: the leader and the speaker', sc.includes('Leader: Leader Synthetic') && sc.includes('Speaker: Speaker Synthetic'), sc);
    ok('  how many roles are filled', sc.includes('1 of 2 roles filled'), sc);
    ok('  and the songs, with their keys', sc.includes('Song Alpha Synthetic (G)') && sc.includes('Song Beta Synthetic (C)'), sc);
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());
    await size(375); await open('hub.html', 11000);
    const sj = await J('JSON.stringify([].map.call(document.querySelectorAll("#sundaysCard .jobs a"),function(a){return a.getAttribute("href")}))');
    ok('  on a phone, the Sundays jobs card links their jobs', sj.includes('Planner.html') && sj.includes('SundayServicePlanner.html'), JSON.stringify(sj));
    ok('  and This Sunday is left to the computer', !(await shown('sundayCard')));
    const q5 = await quick();
    ok('  the phone keeps only the jobs that fit: no Rota planner in the row', !q5.some(t => /Rota planner/.test(t)), JSON.stringify(q5));

    console.log('\nSomebody on no team (375)');
    await signIn(PEOPLE.none); watch.reset();
    await open('hub.html', 11000);
    const cc = await text('comingCard');
    ok('  Coming up, from What\u2019s on', cc.includes('Harvest Supper Synthetic'), cc);
    ok('  no quick buttons', (await quick()).length === 0);
    ok('  and no Sundays jobs', !(await shown('sundaysCard')));
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  } finally {
    for (const p of ['events/' + EV, 'services/' + SV, 'calEvents/' + CE]) await del(p);
    for (const [p, had] of [['portal/dashboardContent', hadPortal], ['teamContent/' + encodeURIComponent('Kids Church'), hadKids]]) {
      if (had.status === 200) await req(8181, 'PATCH', DOCS + '/' + p, { fields: JSON.parse(had.body).fields || {} }, OWNER); else await del(p);
    }
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
