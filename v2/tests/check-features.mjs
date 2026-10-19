/* What does your church use? (item 14; the events window's F-230, 19 Oct 2026).
 *
 *   node tests/check-features.mjs      (from v2/, the dev emulators up)
 *
 * As an invented master admin:
 *   with nothing stored, everything is on at EGBC, add-ons included
 *     (Session planner and Building compliance in the Menu; Martin, 19 Oct
 *     2026);
 *   Church settings lists the switches, and pressing one saves it at once;
 *   switched off, the Session planner and Building compliance leave the
 *     Menu; Preaching plan switched off leaves it, and its page says so.
 * The rule (master admins only, known names only): firestore-rules.test.mjs.
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
const PORT = 9823, SERVE = 9029, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  master: { email: 'ft.master@example.invalid', member: 'ab_ft_master', name: 'Fay Synthetic', teams: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true }
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

const getDoc = async (p) => { const r = await req(8181, 'GET', DOCS + '/' + p, undefined, OWNER); return r.status === 200 ? JSON.parse(r.body) : null; };

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
  /* A plan group, so the master admin would have the Session planner if
     it were switched on; and no switches stored at all. */
  await put('planGroups/ft_group', { name: 'FT Group Synthetic', kind: 'children', leaderIds: ['ab_ft_master'], teamName: 'Kids Church', archived: false });
  const had = await getDoc('churchSettings/features');
  await del('churchSettings/features');

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-ft-' + process.pid),
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
  const evl = makeEval(send, 'ft');
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
  const menu = () => J('JSON.stringify(EGBCMenu.allPages ? (function(){var o=[];(function w(n){n.forEach(function(x){if(x.url)o.push(x.title);if(x.children)w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));return o})() : [])');
  const press = (name) => evl('(function(){var b=document.querySelector(\'[data-feature="' + name + '"]\');if(!b)return "no switch";b.click();return 1})()');
  const stored = async (name) => { const d = await getDoc('churchSettings/features'); const f = d && d.fields && d.fields[name]; return f ? f.booleanValue : undefined; };

  try {
    await signIn(PEOPLE.master); watch.reset();
    console.log('Nothing stored');
    await open('hub.html', 11000);
    let m = await menu();
    ok('  an add-on is on at EGBC: the Session planner is in the Menu', m.includes('Session planner'), JSON.stringify(m.slice(0, 12)));
    ok('  building compliance too', m.includes('Building compliance') && m.includes('The building'), JSON.stringify(m));
    ok('  everything that was there before is on: Preaching plan is', m.includes('Preaching plan'));

    console.log('\nChurch settings');
    await open('church-settings.html', 10000);
    const sw = await J('JSON.stringify([].map.call(document.querySelectorAll("[data-feature]"),function(b){return b.dataset.feature+":"+b.getAttribute("aria-checked")}))');
    ok('  lists the switches, every one on', sw.length > 10 && sw.every(x => /:true$/.test(x)), JSON.stringify(sw));
    await press('sessionPlanner'); await sleep(2500);
    ok('  pressing one saves it at once', (await stored('sessionPlanner')) === false, String(await stored('sessionPlanner')));
    await press('buildingCompliance'); await sleep(2500);
    ok('  and building compliance switches off', (await stored('buildingCompliance')) === false, String(await stored('buildingCompliance')));
    await press('preachingPlan'); await sleep(2500);
    ok('  and another', (await stored('preachingPlan')) === false, String(await stored('preachingPlan')));
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    console.log('\nThe Menu follows');
    await open('hub.html', 11000);
    m = await menu();
    ok('  the Session planner, switched off, is not', !m.includes('Session planner'), JSON.stringify(m));
    ok('  nor building compliance', !m.includes('Building compliance') && !m.includes('The building'), JSON.stringify(m));
    ok('  the Preaching plan, switched off, is not', !m.includes('Preaching plan'), JSON.stringify(m));
    await open('preaching-plan.html', 9000);
    const pp = String(await evl('document.body.innerText'));
    ok('  and its page says the church does not use it', /not used|doesn.t use|does not use/i.test(pp), pp.slice(0, 200));
  } finally {
    await del('planGroups/ft_group');
    if (had) await req(8181, 'PATCH', DOCS + '/churchSettings/features', { fields: had.fields || {} }, OWNER); else await del('churchSettings/features');
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
