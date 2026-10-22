/* Any team can set up its own meeting (reviewing window, 22 Oct 2026: a
 * Kids Church leader could not set up a Kids Church meeting; the lists on
 * meeting.html's "New meeting" were the rota's four types and five teams).
 *
 *   node tests/check-meeting-teams.mjs          (from v2/, the dev emulators up)
 *   BREAK=meeting node tests/check-meeting-teams.mjs  serves the old fixed lists: must fail
 *   BREAK=rota node tests/check-meeting-teams.mjs     a rota that does not keep the type: must fail
 *
 * At 375, made-up people, all put back afterwards:
 *   a Kids Church LEADER (admin of Kids Church, on no team) is offered "Kids
 *   Church Meeting" and "Kids Church", sets one up, and it is saved with
 *   that team and the Kids Church room, and listed under Upcoming;
 *   a Kids Church MEMBER is offered their own team's meeting only;
 *   somebody on a team the church made itself (Teams & groups) is offered
 *   that team's meeting;
 *   a Worship Team member still has the rota's Worship meetings and not
 *   Kids Church's;
 *   on the Core Team rota the new meeting keeps its type.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SERVE = 8989, CDP = 9803, PW = 'test-only-password';
const BREAK = process.env.BREAK || '';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWN_TEAM = 'MT Pastoral Synthetic';
const KIDS_ROOM = 'mt-kids-room';
const PEOPLE = {
  lead:    { email: 'mt.kidslead@example.invalid', member: 'ab_mt_lead', name: 'MT Kids Lead Synthetic', teams: [], adminFor: ['Kids Church'] },
  kid:     { email: 'mt.kidsmember@example.invalid', member: 'ab_mt_kid', name: 'MT Kids Member Synthetic', teams: ['Kids Church'], adminFor: [] },
  own:     { email: 'mt.pastoral@example.invalid', member: 'ab_mt_own', name: 'MT Pastoral Synthetic Person', teams: [OWN_TEAM], adminFor: [] },
  worship: { email: 'mt.worship@example.invalid', member: 'ab_mt_worship', name: 'MT Worship Synthetic', teams: ['Worship Team'], adminFor: [] },
  master:  { email: 'mt.master@example.invalid', member: 'ab_mt_master', name: 'MT Master Synthetic', teams: ['Core Team'], adminFor: [], masterAdmin: true }
};
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 500) : ''))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : typeof v === 'object' ? { mapValue: { fields: fields(v) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const plain = (v) => v.stringValue ?? v.booleanValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : v.arrayValue ? (v.arrayValue.values || []).map(plain) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)])) : null);
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';

const server = http.createServer((q, s) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
  const f = path.join(V2, url.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const e = path.extname(f).toLowerCase();
  let body = fs.readFileSync(f, 'utf8');
  if (e === '.html') { const h = /<head[^>]*>/i.exec(body); if (h) body = body.slice(0, h.index + h[0].length) + NO_SW + body.slice(h.index + h[0].length); }
  /* The breaks: no church teams on meeting.html (the old fixed lists), and
     the rota's type list without the kept type. */
  if (BREAK === 'meeting' && url === '/meeting.html') body = body.replace(/function churchTeams\(\) \{\r?\n  return /, 'function churchTeams() {\n  return [] || ');
  if (BREAK === 'rota' && url === '/egbc-core-rota.js') body = body.replace('if (ev.type && EVENT_TYPES_LIST.indexOf(ev.type) === -1) {', 'if (false) {');
  s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-mteams-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

let hadVideo = null, made = [], exitCode = 1;
try {
  /* People, a team of the church's own, and a Kids Church room. */
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: !!p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor, masterAdmin: !!p.masterAdmin, churchMember: true });
  }
  await put('teams/' + encodeURIComponent(OWN_TEAM), { name: OWN_TEAM, label: 'MT Pastoral', colour: '#555555', order: 50 });
  const before = await req(8181, 'GET', DOCS + '/churchSettings/video', undefined, OWNER);
  hadVideo = before.status === 200 ? JSON.parse(before.body) : null;
  const rooms = [{ key: KIDS_ROOM, label: 'MT Kids room', url: 'https://example.invalid/kids', teams: ['Kids Church'], hostTeams: [] },
                 { key: 'mt-own-room', label: 'MT Pastoral room', url: 'https://example.invalid/own', teams: [OWN_TEAM], hostTeams: [] }];
  await put('churchSettings/video', { churchId: 'egbc', rooms, roomsByKey: Object.fromEntries(rooms.map(r => [r.key, { teams: r.teams, hostTeams: [], members: false }])), byType: {} });

  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 300)); };
  const evl = makeEval(send, 'mteams');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.alert=function(m){(window.__alerts=window.__alerts||[]).push(String(m))};' });

  const signIn = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
  };
  const openNew = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/meeting.html?new=1' });
    let n = 0; for (let i = 0; i < 40 && !n; i++) { await sleep(400); n = Number(await evl('document.querySelectorAll("#nmType option").length')); }
    return JSON.parse(String(await evl('JSON.stringify({types:[].map.call(document.querySelectorAll("#nmType option"),function(o){return o.value}),'
      + 'teams:[].map.call(document.querySelectorAll("#nmTeams label"),function(l){return l.textContent.trim()}),'
      + 'sideways:document.documentElement.scrollWidth>innerWidth+1})')));
  };

  console.log('\nA Kids Church leader (admin of Kids Church, on no team)' + (BREAK ? ' (BREAK: ' + BREAK + ')' : ''));
  await signIn('lead');
  let f = await openNew();
  ok('  is offered "Kids Church Meeting"', f.types.includes('Kids Church Meeting'), JSON.stringify(f.types));
  ok('  and "Kids Church" under Who is it for?', f.teams.includes('Kids Church'), JSON.stringify(f.teams));
  ok('  the rota\'s own meetings are still there', ['Core Team Meeting', 'Worship and AV Team Meeting', 'Worship Team Meeting', 'AV Team Meeting'].every(t => f.types.includes(t)), JSON.stringify(f.types));
  ok('  nothing goes sideways at 375', !f.sideways);
  if (f.types.includes('Kids Church Meeting')) {
    const picked = JSON.parse(String(await evl('(function(){var s=document.getElementById("nmType");s.value="Kids Church Meeting";s.dispatchEvent(new Event("change"));'
      + 'return JSON.stringify({room:document.getElementById("nmRoom").value,ticked:[].map.call(document.querySelectorAll("#nmTeams input:checked"),function(c){return c.value})})})()')));
    ok('  picking it ticks Kids Church', JSON.stringify(picked.ticked) === '["Kids Church"]', JSON.stringify(picked));
    ok('  and picks the Kids Church room', picked.room === KIDS_ROOM, JSON.stringify(picked));
    await evl('(function(){document.getElementById("nmDesc").value="MT synthetic leaders\' catch-up";document.getElementById("nmSave").click();return 1})()');
    let saved = null;
    for (let i = 0; i < 30 && !saved; i++) {
      await sleep(400);
      const q = await req(8181, 'POST', DOCS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'events' }], where: { fieldFilter: { field: { fieldPath: 'description' }, op: 'EQUAL', value: { stringValue: "MT synthetic leaders' catch-up" } } } } }, OWNER);
      const hit = JSON.parse(q.body).find(x => x.document);
      if (hit) { saved = Object.fromEntries(Object.entries(hit.document.fields).map(([k, v]) => [k, plain(v)])); saved.id = hit.document.name.split('/').pop(); }
    }
    if (saved) made.push(saved.id);
    ok('  it is saved as a Kids Church Meeting, for Kids Church, in its room', !!saved && saved.type === 'Kids Church Meeting' && JSON.stringify(saved.teams) === '["Kids Church"]' && saved.videoRoom === KIDS_ROOM,
      JSON.stringify(saved) + ' alerts ' + await evl('JSON.stringify(window.__alerts||[])'));
    let listed = false; for (let i = 0; i < 20 && !listed; i++) { await sleep(400); listed = String(await evl('document.getElementById("lobby").textContent.indexOf("Kids Church Meeting")!==-1')) === 'true'; }
    ok('  and listed under Upcoming', listed);

    console.log('\nThe Core Team rota, as a master admin');
    await signIn('master');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/CoreTeamApp.html' }); await sleep(9000);
    await evl('(function(){openSection("rota");return 1})()');
    let type = ''; for (let i = 0; i < 30 && !type; i++) { await sleep(500); type = String(await evl('(function(){var r=document.querySelector(\'[data-ev="' + (saved && saved.id) + '"]\');if(!r)return "";var s=[].find.call(r.querySelectorAll("select"),function(x){return /\'type\'/.test(x.getAttribute("onchange")||"")});return s?s.value:"(no type list)"})()')); }
    ok('  shows the meeting with its own type, not the first in its list', type === 'Kids Church Meeting', type || '(the row was not drawn)');
  }

  console.log('\nA Kids Church member');
  await signIn('kid');
  f = await openNew();
  ok('  is offered their team\'s meeting', JSON.stringify(f.types) === '["Kids Church Meeting"]', JSON.stringify(f.types));
  ok('  and their team only', JSON.stringify(f.teams) === '["Kids Church"]', JSON.stringify(f.teams));

  console.log('\nSomebody on a team the church made itself (Teams & groups)');
  await signIn('own');
  f = await openNew();
  ok('  is offered that team\'s meeting, by its name', JSON.stringify(f.types) === '["MT Pastoral Meeting"]', JSON.stringify(f.types));
  ok('  and the team, by its name', JSON.stringify(f.teams) === '["MT Pastoral"]', JSON.stringify(f.teams));

  console.log('\nA Worship Team member');
  await signIn('worship');
  f = await openNew();
  ok('  still has the rota\'s Worship meetings', f.types.includes('Worship Team Meeting') && f.types.includes('Worship and AV Team Meeting'), JSON.stringify(f.types));
  ok('  and not Kids Church\'s', !f.types.includes('Kids Church Meeting'), JSON.stringify(f.types));

  ok('no errors thrown on the pages', errs.length === 0, errs.join(' | '));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  for (const id of made) await del('events/' + id).catch(() => {});
  await del('teams/' + encodeURIComponent(OWN_TEAM)).catch(() => {});
  if (hadVideo) await req(8181, 'PATCH', DOCS + '/churchSettings/video', { fields: hadVideo.fields || {} }, OWNER).catch(() => {});
  else await del('churchSettings/video').catch(() => {});
  for (const p of Object.values(PEOPLE)) { await del('users/' + p.uid).catch(() => {}); await del('addressBook/' + p.member).catch(() => {}); }
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
