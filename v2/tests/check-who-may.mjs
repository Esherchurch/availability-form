/* Who may post a notice, see people and email them (Martin, 16 Oct 2026).
 *
 *   node tests/check-who-may.mjs      (from v2/, the dev emulators up, with functions)
 *
 * As real seeded people - a Kids Church leader, the church office, a Worship
 * member who leads nothing, a master admin:
 *   Notices (hub): the leader posts to their own team and is not offered
 *     Everyone; the office is; the member has no "Post a notice".
 *   Address book: the leader sees their team's people only; the office sees
 *     everyone.
 *   Email Compiler: the leader is offered their own team and no Everyone, and
 *     the hub sends to their team and refuses anybody else, logging what it
 *     sends; the office is offered Everyone and may email anyone; the member
 *     is turned away.
 * The rules behind all three: firestore-rules.test.mjs (WHO MAY). The server's
 * decision on its own: check-compiler-send.mjs.
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
const PORT = 9793, SERVE = 9009, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  leader: { email: 'wm.leader@example.invalid', member: 'ab_wm_leader', name: 'WM Kids Leader Synthetic', teams: ['Kids Church'], adminFor: ['Kids Church'], masterAdmin: false },
  office: { email: 'wm.office@example.invalid', member: 'ab_wm_office', name: 'WM Office Synthetic', teams: ['Church office'], adminFor: [], masterAdmin: false },
  member: { email: 'wm.member@example.invalid', member: 'ab_wm_member', name: 'WM Member Synthetic', teams: ['Worship Team'], adminFor: [], masterAdmin: false }
};
const OTHERS = {
  ab_wm_kidhelper: { name: 'WM Kids Helper Synthetic', email: 'wm.kidhelper@example.invalid', markers: ['Kids Church'] },
  ab_wm_worshipper: { name: 'WM Worshipper Synthetic', email: 'wm.worshipper@example.invalid', markers: ['Worship Team'] }
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
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
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
/* The news a run makes, to take away again. */
async function newsBy(title) {
  const r = await req(8181, 'POST', DOCS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'news' }], where: { fieldFilter: { field: { fieldPath: 'title' }, op: 'EQUAL', value: { stringValue: title } } } } }, OWNER);
  return JSON.parse(r.body || '[]').filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), teams: (((x.document.fields.teams || {}).arrayValue || {}).values || []).map(v => v.stringValue) }));
}
async function outboxTo(addr) {
  const r = await req(8181, 'POST', DOCS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'emailOutbox' }], where: { fieldFilter: { field: { fieldPath: 'source' }, op: 'EQUAL', value: { stringValue: 'emailCompiler' } } } } }, OWNER);
  return JSON.parse(r.body || '[]').filter(x => x.document && JSON.stringify(x.document.fields.to || {}).includes(addr)).length;
}

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
  for (const [id, o] of Object.entries(OTHERS)) await put('addressBook/' + id, Object.assign({ adminFor: [], archived: false, isMinor: false }, o));

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-wm-' + process.pid),
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
  const evl = makeEval(send, 'wm');
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
  const postBtn = () => evl('!![].find.call(document.querySelectorAll("button"),function(b){return /Post a notice/.test(b.textContent)})').then(String).then(x => x === 'true');
  const chips = () => J('JSON.stringify([].map.call(document.querySelectorAll("#nwTeams .chip"),function(c){return c.dataset.team}))');
  const callSend = (to) => evl('EGBCAuth.call("compilerSend",{to:' + JSON.stringify(to) + ',subject:"WM synthetic",html:"<p>x</p>"}).then(function(){return "sent"},function(e){return "refused: "+e.message})', true).then(String);
  const T1 = 'WM leader notice synthetic';

  try {
    console.log('A Kids Church leader');
    await signIn(PEOPLE.leader);
    watch.reset();
    await open('hub.html', 11000);
    ok('  has "Post a notice"', await postBtn());
    await evl('openNewsEditor();1'); await sleep(800);
    const c1 = await chips();
    ok('  offered their own team only, not Everyone', JSON.stringify(c1) === JSON.stringify(['Kids Church']), JSON.stringify(c1));
    await evl('(function(){document.getElementById("nwTitle").value=' + JSON.stringify(T1) + ';saveNews();return 1})()'); await sleep(2500);
    const n1 = await newsBy(T1);
    ok('  and posts to it', n1.length === 1 && JSON.stringify(n1[0].teams) === '["Kids Church"]', JSON.stringify(n1));
    await open('addressbook.html', 9000);
    const ab = await J('JSON.stringify(document.getElementById("memberListBody").innerText)');
    ok('  the address book shows their team\'s people only', /WM Kids Helper Synthetic/.test(ab) && !/WM Worshipper Synthetic/.test(ab), ab.slice(0, 200));
    await open('EmailBuilder2.html', 9000);
    const tf = await J('JSON.stringify([].map.call(document.querySelectorAll(".team-filter"),function(c){return c.value}))');
    ok('  the Email Compiler offers their own team and no Everyone', JSON.stringify(tf) === JSON.stringify(['Kids Church']), JSON.stringify(tf));
    ok('  the hub sends to their team', (await callSend(['wm.kidhelper@example.invalid'])) === 'sent');
    const refused = await callSend(['wm.worshipper@example.invalid']);
    ok('  and refuses anybody else, saying who', /refused: .*wm\.worshipper@/.test(refused), refused);
    ok('  what it sent is in the log (Emails sent)', (await outboxTo('wm.kidhelper@example.invalid')) >= 1);
    ok('  nothing on the console', watch.errors.filter(e => !/compilerSend|permission-denied|not on your team/i.test(e)).length === 0, watch.summary());

    console.log('\nThe church office');
    await signIn(PEOPLE.office);
    await open('hub.html', 11000);
    await evl('openNewsEditor();1'); await sleep(800);
    ok('  offered Everyone too', (await chips()).includes(''));
    await open('addressbook.html', 9000);
    const ab2 = await J('JSON.stringify(document.getElementById("memberListBody").innerText)');
    ok('  the address book shows everyone', /WM Kids Helper Synthetic/.test(ab2) && /WM Worshipper Synthetic/.test(ab2));
    await open('EmailBuilder2.html', 9000);
    const tf2 = await J('JSON.stringify([].map.call(document.querySelectorAll(".team-filter"),function(c){return c.value}))');
    ok('  the Email Compiler offers every team and Everyone', tf2.includes('Everyone') && tf2.includes('Worship Team') && tf2.includes('Kids Church'), JSON.stringify(tf2));
    ok('  and the hub sends to anyone', (await callSend(['wm.worshipper@example.invalid'])) === 'sent');

    console.log('\nA Worship member who leads nothing');
    await signIn(PEOPLE.member);
    await open('hub.html', 11000);
    ok('  no "Post a notice"', !(await postBtn()));
    await open('EmailBuilder2.html', 8000);
    ok('  the Email Compiler turns them away', String(await evl('document.body.hasAttribute("data-egbc-blocked")')) === 'true');
    await open('hub.html', 8000);
    const r3 = await callSend(['wm.worshipper@example.invalid']);
    ok('  and the hub refuses them even asked directly', /refused/.test(r3), r3);
  } finally {
    for (const n of await newsBy(T1)) await del('news/' + n.id);
    for (const id of Object.keys(OTHERS)) await del('addressBook/' + id);
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
