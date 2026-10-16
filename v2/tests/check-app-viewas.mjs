/* "View as" in the phone app (Martin, 15 Oct 2026: app.html had no way to
 * check what "Everyone" or a team sees on a phone).
 *
 *   node tests/check-app-viewas.mjs      (from v2/, the dev emulators up)
 *
 * At 375px, as a master admin:
 *   - Me has "View as somebody else"; its list is Everyone (no team) first,
 *     then the teams from Teams & groups, with "As an admin of that team";
 *   - choosing Everyone writes the website's key and shape ({team, admin})
 *     and the app then shows no team's things;
 *   - the "Viewing as ..." strip is at the very top, above the app's own
 *     bar, and stays through the app's own navigation;
 *   - "Back to me" ends it; "as an admin" carries through.
 * As a member: no "View as" on Me, and a forged key does nothing.
 * Pictures: tests/shots/app-viewas--{picker,strip}-375.png
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
const PORT = 9787, SERVE = 9003, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  master: { email: 'ava.master@example.invalid', member: 'ab_ava_master', name: 'App View Master Synthetic', teams: ['Core Team', 'Worship Team'], adminFor: ['Core Team'], masterAdmin: true },
  member: { email: 'ava.member@example.invalid', member: 'ab_ava_member', name: 'App View Member Synthetic', teams: ['Worship Team'], adminFor: [], masterAdmin: false }
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
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin',
      teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, churchMember: true });
  }
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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-ava-' + process.pid),
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
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const evl = makeEval(send, 'ava');
  const J = async (x) => JSON.parse(String(await evl(x)));
  const signIn = async (p) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await evl('sessionStorage.clear();1');
    for (let i = 0; i < 3; i++) {
      await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').catch(function(){})', true); await sleep(800);
      if (String(await evl('(firebase.auth(EGBCAuth.app).currentUser||{}).email||""')) === p.email) return;
    }
  };
  const openMe = async () => { await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html#me:me' }); await sleep(9000); };
  const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(s.data, 'base64')); };
  const STRIP = 'JSON.stringify((function(){var s=document.getElementById("app-viewas"),t=document.querySelector(".top");if(!s)return{};var r=s.getBoundingClientRect(),tr=t?t.getBoundingClientRect():{top:-1};'
    + 'return{shown:getComputedStyle(s).display!=="none",top:Math.round(r.top),bottom:Math.round(r.bottom),appTop:Math.round(tr.top),text:s.innerText.replace(/\\s+/g," ").trim(),'
    + 'sideways:document.documentElement.scrollWidth>innerWidth+1,teams:EGBCAuth.effectiveTeams(),key:sessionStorage.getItem("egbc_view_as")}})())';

  try {
    console.log('A master admin, at 375px');
    await signIn(PEOPLE.master);
    watch.reset();
    await openMe();
    ok('  Me has "View as somebody else"', String(await evl('!!document.querySelector(\'[data-act="sheet:viewas"]\')')) === 'true');
    ok('  and no strip yet', (await J(STRIP)).shown === false);
    await evl('document.querySelector(\'[data-act="sheet:viewas"]\').click();1'); await sleep(800);
    const rows = await J('JSON.stringify([].map.call(document.querySelectorAll(\'[data-va="list"] [data-act^="viewas:"] b\'),function(b){return b.textContent}))');
    ok('  the list is Everyone first, then the teams', rows[0] === 'Everyone (no team)' && rows.includes('Worship') && rows.includes('Kids Church'), JSON.stringify(rows));
    ok('  with "As an admin of that team"', String(await evl('!!document.getElementById("va-admin")')) === 'true');
    await shot('app-viewas--picker-375.png');
    await evl('document.querySelector(\'[data-va="list"] [data-act^="viewas:"]\').click();1'); await sleep(9000);
    let st = await J(STRIP);
    ok('  choosing Everyone writes the website\'s key and shape', st.key === JSON.stringify({ team: '__everyone', admin: false }), st.key);
    ok('  "Viewing as a church member on no team", at the very top, above the app\'s bar',
      st.shown && st.top === 0 && st.appTop >= st.bottom && /^Viewing as a church member on no team Back to me$/.test(st.text) && !st.sideways, JSON.stringify(st));
    ok('  and the app shows no team\'s things', Array.isArray(st.teams) && st.teams.length === 0, JSON.stringify(st.teams));
    await shot('app-viewas--strip-375.png');
    /* The app's own tab bar (button.tab[data-tab]). */
    const tabs = await J('JSON.stringify([].map.call(document.querySelectorAll("button.tab[data-tab]"),function(b){return b.getAttribute("data-tab")}))');
    ok('  the app has tabs to move between', tabs.length >= 2, JSON.stringify(tabs));
    for (const t of tabs.slice(0, 3).reverse()) {
      await evl('(function(){var b=document.querySelector(\'button.tab[data-tab="' + t + '"]\');if(b)b.click();return 1})()'); await sleep(900);
    }
    st = await J(STRIP);
    ok('  it stays through the app\'s own navigation (' + tabs.slice(0, 3).join(', ') + ')', st.shown && st.top === 0, JSON.stringify(st));
    await evl('document.getElementById("app-viewas-back").click();1'); await sleep(9000);
    st = await J(STRIP);
    ok('  Back to me ends it', !st.shown && !st.key, JSON.stringify(st));

    await openMe();
    await evl('document.querySelector(\'[data-act="sheet:viewas"]\').click();1'); await sleep(800);
    await evl('(function(){document.getElementById("va-admin").checked=true;var rows=document.querySelectorAll(\'[data-va="list"] [data-act^="viewas:"]\');'
      + 'for(var i=0;i<rows.length;i++){if(rows[i].querySelector("b").textContent==="Worship"){rows[i].click();break}}return 1})()'); await sleep(9000);
    st = await J(STRIP);
    ok('  "as an admin" carries through: Viewing as a Worship admin', st.key === JSON.stringify({ team: 'Worship Team', admin: true })
      && /^Viewing as a Worship admin Back to me$/.test(st.text), JSON.stringify(st));
    await evl('document.getElementById("app-viewas-back").click();1'); await sleep(6000);
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    console.log('\nA member');
    await signIn(PEOPLE.member);
    await openMe();
    ok('  no "View as" on Me', String(await evl('!!document.querySelector(\'[data-act="sheet:viewas"]\')')) === 'false');
    await evl('sessionStorage.setItem("egbc_view_as",JSON.stringify({team:"__everyone",admin:false}));1');
    await openMe();
    st = await J(STRIP);
    ok('  and a forged key does nothing', !st.shown && (st.teams || []).includes('Worship Team'), JSON.stringify(st));
  } finally {
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
