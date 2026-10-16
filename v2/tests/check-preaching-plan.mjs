/* The Preaching plan (Martin for Ryan, the Pastor, 15 Oct 2026).
 *
 *   node tests/check-preaching-plan.mjs      (from v2/, the dev emulators up)
 *
 * - A master admin names the Pastor on the page (churchSettings/preaching).
 * - The table is the services on the rota for the next three months, in UK
 *   dates, not practices; past ones only with "Show past services".
 * - The Pastor (not an admin) changes the description, the speaker - a
 *   guest nobody has heard of - the service leader and the readers with
 *   their passages, each saved as it is left, onto the rota's own fields.
 * - Somebody else on a team reads it and cannot change it.
 * - At 375px each service is a card; nothing scrolls sideways.
 * - The Menu has it for people on a team, and not for Everyone.
 * Pictures: tests/shots/preaching-plan-{1440,375}.png
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
const PORT = 9789, SERVE = 9005, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  master: { email: 'pp.master@example.invalid', member: 'ab_pp_master', name: 'Preach Master Synthetic', teams: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true },
  pastor: { email: 'pp.pastor@example.invalid', member: 'ab_pp_pastor', name: 'Preach Pastor Synthetic', teams: ['Worship Team'], adminFor: [], masterAdmin: false },
  member: { email: 'pp.member@example.invalid', member: 'ab_pp_member', name: 'Preach Member Synthetic', teams: ['Worship Team'], adminFor: [], masterAdmin: false }
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
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : (v && typeof v === 'object') ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const plain = (v) => !v ? undefined : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(plain) : 'mapValue' in v ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)])) : null;
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const get = async (p) => { const r = await req(8181, 'GET', DOCS + '/' + p, undefined, OWNER); return r.status === 200 ? Object.fromEntries(Object.entries(JSON.parse(r.body).fields || {}).map(([k, v]) => [k, plain(v)])) : null; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (p, test) => { let d = null; for (let i = 0; i < 40; i++) { d = await get(p); if (d && test(d)) return d; await sleep(250); } return d; };
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const day = (n) => { const d = new Date(Date.now() + n * 86400000), p = (x) => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const EV = { soon: 'pp_soon', past: 'pp_past', far: 'pp_far', practice: 'pp_practice' };
let hadPreaching = null;
async function tidy() {
  for (const id of Object.values(EV)) await del('events/' + id);
  if (hadPreaching) await put('churchSettings/preaching', hadPreaching); else await del('churchSettings/preaching');
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  hadPreaching = await get('churchSettings/preaching');
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin',
      teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, churchMember: true });
  }
  await del('churchSettings/preaching');
  const svc = (date, extra) => Object.assign({ date, type: 'Sunday Morning Worship', termLabel: 'Synthetic', teams: ['Worship Team'], roles: ['Keyboard'],
    archived: false, startTime: '08:00', serviceTime: '10:00' }, extra || {});
  await put('events/' + EV.soon, svc(day(10), { speaker: 'Synthetic Booked Speaker' }));
  await put('events/' + EV.past, svc(day(-10)));
  await put('events/' + EV.far, svc(day(150)));
  await put('events/' + EV.practice, svc(day(10), { type: 'Sunday Team Practice' }));

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-pp-' + process.pid),
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
  const evl = makeEval(send, 'pp');
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
  const open = async (page, w, wait) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 700 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 700 });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page }); await sleep(wait || 8000);
  };
  const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(s.data, 'base64')); };
  const ids = () => J('JSON.stringify([].map.call(document.querySelectorAll("#rows tr[data-id]"),function(t){return t.dataset.id}))');
  const row = (id) => 'document.querySelector(\'#rows tr[data-id="' + id + '"]\')';
  const typeIn = (id, sel, v) => evl('(function(){var i=' + row(id) + '.querySelector(\'' + sel + '\');i.value=' + JSON.stringify(v) + ';i.dispatchEvent(new Event("change",{bubbles:true}));return 1})()');

  try {
    console.log('A master admin names the Pastor (1440px)');
    await signIn(PEOPLE.master);
    watch.reset();
    await open('preaching-plan.html', 1440, 9000);
    ok('  the Pastor box is there for a master admin', String(await evl('!!document.querySelector(\'[data-pp="settings"]\')')) === 'true');
    await evl('(function(){var i=document.getElementById("pastorPick");i.value=' + JSON.stringify(PEOPLE.pastor.name) + ';i.dispatchEvent(new Event("change",{bubbles:true}));return 1})()');
    const pr = await waitFor('churchSettings/preaching', (d) => (d.pastorIds || []).includes(PEOPLE.pastor.member));
    ok('  picking a name saves them, at once', pr && (pr.pastorIds || []).includes(PEOPLE.pastor.member), JSON.stringify(pr));
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    console.log('\nThe Pastor (1440px)');
    await signIn(PEOPLE.pastor);
    watch.reset();
    await open('preaching-plan.html', 1440, 9000);
    let seen = await ids();
    ok('  the next three months\' services, not practices, not later', seen.includes(EV.soon) && !seen.includes(EV.practice) && !seen.includes(EV.far), JSON.stringify(seen));
    ok('  past ones hidden', !seen.includes(EV.past));
    await evl('(function(){var c=document.getElementById("showPast");c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));return 1})()'); await sleep(400);
    ok('  until "Show past services"', (await ids()).includes(EV.past));
    const date = String(await evl(row(EV.soon) + '.querySelector(".date b").textContent'));
    ok('  dates are UK dates', /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/.test(date), date);
    ok('  the speaker already on the rota is shown', String(await evl(row(EV.soon) + '.querySelector(\'[data-f="speaker"]\').value')) === 'Synthetic Booked Speaker');
    ok('  the Pastor, not an admin, can change it', String(await evl('!!' + row(EV.soon) + '.querySelector(\'[data-f="speaker"]\')')) === 'true');
    await typeIn(EV.soon, '[data-f="speaker"]', 'Guest Speaker Nobody Knows');
    await typeIn(EV.soon, '[data-f="publicTitle"]', 'Synthetic Harvest Sunday');
    await typeIn(EV.soon, '[data-f="serviceLeader"]', PEOPLE.member.name);
    let d = await waitFor('events/' + EV.soon, (x) => x.speaker === 'Guest Speaker Nobody Knows' && x.publicTitle === 'Synthetic Harvest Sunday' && x.serviceLeader === PEOPLE.member.name);
    ok('  a guest speaker, the description and the leader save to the rota\'s own fields', d && d.speaker === 'Guest Speaker Nobody Knows'
      && d.publicTitle === 'Synthetic Harvest Sunday' && d.serviceLeader === PEOPLE.member.name, JSON.stringify(d));
    await evl(row(EV.soon) + '.querySelector("[data-addreader]").click();1'); await sleep(300);
    await typeIn(EV.soon, '.reader:last-child [data-r="name"]', 'Synthetic Reader');
    await typeIn(EV.soon, '.reader:last-child [data-r="passage"]', 'John 3:1-17');
    d = await waitFor('events/' + EV.soon, (x) => JSON.stringify(x.readers) === JSON.stringify([{ name: 'Synthetic Reader', passage: 'John 3:1-17' }]));
    ok('  a reader with their passage saves', JSON.stringify(d && d.readers) === JSON.stringify([{ name: 'Synthetic Reader', passage: 'John 3:1-17' }]), JSON.stringify(d && d.readers));
    ok('  and nothing else on the service changed', d && d.date === day(10) && d.type === 'Sunday Morning Worship' && JSON.stringify(d.roles) === '["Keyboard"]');
    ok('  the name boxes suggest people from the address book', Number(await evl('document.querySelectorAll("#people option").length')) > 0);
    await shot('preaching-plan-1440.png');
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    console.log('\nAt 375px');
    await open('preaching-plan.html', 375, 9000);
    const fit = await J('JSON.stringify({sideways:document.documentElement.scrollWidth>innerWidth+1,card:getComputedStyle(document.querySelector("#rows tr")).display,'
      + 'small:[].filter.call(document.querySelectorAll("#rows input,#rows button"),function(x){var r=x.getBoundingClientRect();return r.width>0&&r.height<44}).length})');
    ok('  each service is a card, nothing scrolls sideways, 44px targets', !fit.sideways && fit.card === 'block' && fit.small === 0, JSON.stringify(fit));
    await shot('preaching-plan-375.png');

    console.log('\nSomebody else on a team');
    await signIn(PEOPLE.member);
    await open('preaching-plan.html', 1440, 9000);
    const ro = await J('JSON.stringify({inputs:document.querySelectorAll("#rows input").length,text:(' + row(EV.soon) + '||{}).innerText||"",settings:!!document.querySelector(\'[data-pp="settings"]\')})');
    ok('  reads it, cannot change it, and has no Pastor box', ro.inputs === 0 && /Guest Speaker Nobody Knows/.test(ro.text) && /John 3:1-17/.test(ro.text) && !ro.settings, JSON.stringify(ro));
    await open('hub.html', 1440, 9000);
    const menu = await J('JSON.stringify((function(){var o=[];(function w(n){n.forEach(function(x){o.push(x.title);if(x.children)w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));return o})())');
    ok('  the Menu has "Preaching plan" for them', menu.includes('Preaching plan'), JSON.stringify(menu));
    await evl('sessionStorage.setItem("egbc_view_as",JSON.stringify({team:"__everyone",admin:false}));1');
    await signIn(PEOPLE.master);
    await open('groups.html', 1440, 3000);
    await evl('sessionStorage.setItem("egbc_view_as",JSON.stringify({team:"__everyone",admin:false}));1');
    await open('hub.html', 1440, 9000);
    const menu2 = await J('JSON.stringify((function(){var o=[];(function w(n){n.forEach(function(x){o.push(x.title);if(x.children)w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));return o})())');
    ok('  and not for Everyone', !menu2.includes('Preaching plan'), JSON.stringify(menu2));
    await evl('sessionStorage.removeItem("egbc_view_as");1');
  } finally {
    await tidy();
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(async e => { console.error(e); try { await tidy(); } catch {} process.exit(1); });
