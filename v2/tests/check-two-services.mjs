/* Two services on one date keep two plans (FINDINGS-churchhq H-11 item 0).
 *
 *   node tests/check-two-services.mjs          (from v2/, the dev emulators up)
 *   BREAK=date node tests/check-two-services.mjs  serves egbc-plan-store.js with the
 *                                                 old rule (the date's first plan): must fail
 *
 * In a browser at 375, as a made-up Worship Team leader, in each planner:
 * the shared planner (CoreTeamApp.html, egbc-core-planner.js), the Sunday
 * Service Planner and the Youth Service Planner.
 *   - A morning and an evening service of the same type on one date are
 *     listed as two, with their times.
 *   - Saving the evening's plan leaves the morning's alone; each opens its
 *     own; the evening's plan is linked to its service.
 *   - A date with ONE service and an older plan (saved before the fix, no
 *     service on it) opens that plan, exactly as before, and saving it
 *     links it to its service rather than making a second one.
 * Made-up data, put back afterwards.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9807, SERVE = 8993, PW = 'test-only-password';
const BREAK = process.env.BREAK || '';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const ME = { email: 'two.services@example.invalid', name: 'Two Services Synthetic', member: 'ab_two_services' };
const sundayIn = (days) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA'); };
const TWO = sundayIn(91), ONE = sundayIn(98);
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 300))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } } : { stringValue: String(v) };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const plansOn = async (date) => {
  const r = await req(8181, 'POST', DOCS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'services' }], where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: date } } } } }, OWNER);
  return JSON.parse(r.body || '[]').filter(x => x.document).map(x => ({ id: x.document.name.split('/').pop(), eventId: ((x.document.fields.eventId || {}).stringValue) || '', songs: JSON.stringify(x.document.fields.order || {}) }));
};
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
  let body = fs.readFileSync(f, 'utf8');
  if (/\.html$/.test(f)) { const h = /<head[^>]*>/i.exec(body); if (h) body = body.slice(0, h.index + h[0].length) + NO_SW + body.slice(h.index + h[0].length); }
  /* The break: the old rule, the date's first plan whatever the service. */
  if (BREAK === 'date' && url === '/egbc-plan-store.js') body = body.replace('function planFor(docs, eventId, dayEvents) {', 'function planFor(docs, eventId, dayEvents) { return (docs && docs[0]) || null;');
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : /\.css$/.test(f) ? 'text/css' : 'text/html') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-twoservices-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

const SVC = (id, date, time, extra) => put('events/' + id, Object.assign({ termLabel: 'Synthetic', teams: ['Worship Team', 'Youth Worship'], roles: ['Guitar'], archived: false, draft: false, date, startTime: time,
  type: 'Sunday Morning Worship', description: 'Synthetic youth service', serviceLeader: 'Leader Synthetic', speaker: 'Speaker Synthetic',
  assignments: { 'Worship Leader': { id: ME.member, name: ME.name } } }, extra || {}));
const seedPlans = async () => {
  for (const d of [...await plansOn(TWO), ...await plansOn(ONE)]) await del('services/' + d.id);
  await put('services/sv_two_am', { date: TWO, eventId: 'ev_two_am', worshipLeader: ME.name, order: [{ type: 'song', title: 'Synthetic MORNING Song', keys: ['G'], notes: '' }] });
  await put('services/sv_one_old', { date: ONE, worshipLeader: ME.name, order: [{ type: 'song', title: 'Synthetic OLDER Song', keys: ['A'], notes: '' }] });
};

let exitCode = 1;
try {
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  const uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: uid, emailVerified: true }, OWNER);
  await put('users/' + uid, { uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin', teams: ['Worship Team', 'Core Team', 'Youth Worship'], adminFor: ['Worship Team', 'Youth Worship'], masterAdmin: false, attender: true, churchMember: true });
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ['Worship Team', 'Core Team', 'Youth Worship'], adminFor: ['Worship Team', 'Youth Worship'], churchMember: true, archived: false, isMinor: false });
  /* Two services of one type on one date (the evening listed first in the
     database, to show the order comes from the time), an archived copy
     that must not count, and a date with one service. */
  await SVC('ev_two_pm', TWO, '18:30'); await SVC('ev_two_am', TWO, '10:00');
  await SVC('ev_two_old', TWO, '10:00', { archived: true });
  await SVC('ev_one', ONE, '10:00');

  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); let errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200)); };
  const evl = makeEval(send, 'twoservices');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.alert=function(m){window.__alert=String(m)};window.confirm=function(){return true};' });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);

  const PLANNERS = [
    { name: 'the shared planner (CoreTeamApp)', page: 'CoreTeamApp.html', ready: '(typeof openSection === "undefined") ? "no" : "yes"', date: 'spDate', pick: 'spEventSelect', order: '#sp-order', title: '.song-title', save: 'spSave(true)',
      open: async () => { await evl('(function(){try{if(typeof endTour==="function")endTour()}catch(e){}var o=document.getElementById("tour-overlay");if(o)o.classList.remove("active");openSection("service");return 1})()'); await sleep(1500); } },
    { name: 'the Sunday Service Planner', page: 'SundayServicePlanner.html', ready: '(typeof loadRota === "undefined") ? "no" : "yes"', date: 'serviceDate', pick: 'eventSelect', order: '#service-order', title: '.song-title', save: 'saveSchedule(true)' },
    { name: 'the Youth Service Planner', page: 'youthserviceplanner.html', ready: '(typeof loadRota === "undefined" || document.getElementById("egbc-guard-style")) ? "no" : "yes"', date: 'serviceDate', pick: 'eventSelect', order: '#service-order', title: '.song-title', save: 'saveSchedule(true)' }
  ];
  for (const P of PLANNERS) {
    console.log('\n' + P.name + (BREAK ? ' (BREAK: the date\'s first plan)' : ''));
    await seedPlans(); errs = [];
    const open = async () => {
      await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + P.page });
      for (let i = 0; i < 60 && String(await evl(P.ready)) !== 'yes'; i++) await sleep(500);
      if (P.open) await P.open();
    };
    const choose = async (date, index) => {
      await evl('(function(){var d=document.getElementById(' + JSON.stringify(P.date) + ');d.value=' + JSON.stringify(date) + ';d.dispatchEvent(new Event("change",{bubbles:true}));return 1})()');
      let n = 0; for (let i = 0; i < 40 && n < 2; i++) { await sleep(400); n = Number(await evl('(document.getElementById(' + JSON.stringify(P.pick) + ')||{options:[]}).options.length')); }
      const labels = JSON.parse(String(await evl('JSON.stringify([].slice.call(document.getElementById(' + JSON.stringify(P.pick) + ').options,1).map(function(o){return o.textContent}))')));
      await evl('(function(){var s=document.getElementById(' + JSON.stringify(P.pick) + ');s.value=s.options[' + (index + 1) + '].value;s.dispatchEvent(new Event("change",{bubbles:true}));return 1})()');
      await sleep(2500);
      return labels;
    };
    const shown = async () => String(await evl('(function(){return [].map.call(document.querySelectorAll(' + JSON.stringify(P.order + ' ' + P.title) + '),function(i){return i.value}).join("|")})()'));
    await open();
    const labels = await choose(TWO, 1);
    ok('two services of one type on one date are listed as two, by time', labels.length === 2 && /10:00/.test(labels[0]) && /18:30/.test(labels[1]), JSON.stringify(labels));
    ok('  the evening opens with no plan of its own (not the morning\'s)', (await shown()).indexOf('MORNING') === -1, await shown());
    await evl('(function(){var t=document.querySelector(' + JSON.stringify(P.order + ' ' + P.title) + ');if(t)t.value="Synthetic EVENING Song";return ' + P.save + '})()', true); await sleep(1500);
    let plans = await plansOn(TWO);
    ok('  saving the evening leaves the morning\'s plan alone', plans.some(p => p.id === 'sv_two_am' && /MORNING/.test(p.songs) && !/EVENING/.test(p.songs)), JSON.stringify(plans));
    ok('  and makes the evening its own plan, linked to its service', plans.some(p => p.eventId === 'ev_two_pm' && /EVENING/.test(p.songs)), JSON.stringify(plans));
    await open(); await choose(TWO, 0);
    ok('  the morning still opens its own songs', (await shown()).indexOf('MORNING') !== -1 && (await shown()).indexOf('EVENING') === -1, await shown());
    await open(); await choose(TWO, 1);
    ok('  and the evening its own', (await shown()).indexOf('EVENING') !== -1 && (await shown()).indexOf('MORNING') === -1, await shown());
    await open(); const one = await choose(ONE, 0);
    ok('a date with one service: listed by its type alone, as before', JSON.stringify(one) === '["Sunday Morning Worship"]', JSON.stringify(one));
    ok('  its older plan opens, as before', (await shown()).indexOf('OLDER') !== -1, await shown());
    await evl(P.save, true); await sleep(1500);
    plans = await plansOn(ONE);
    ok('  saving it links that same plan to its service (no second plan)', plans.length === 1 && plans[0].id === 'sv_one_old' && plans[0].eventId === 'ev_one', JSON.stringify(plans));
    ok('  no errors on the page', errs.length === 0, errs.join(' | '));
  }
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  for (const d of [...await plansOn(TWO), ...await plansOn(ONE)]) await del('services/' + d.id).catch(() => {});
  for (const e of ['ev_two_am', 'ev_two_pm', 'ev_two_old', 'ev_one']) await del('events/' + e).catch(() => {});
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
