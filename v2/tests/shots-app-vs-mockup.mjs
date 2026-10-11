/* The real app beside the mock-up, at 375px, for each of the mock-up's
 * four people (APP-DESIGN-BRIEF §7e part 4).
 *
 *   node tests/shots-app-vs-mockup.mjs      (from v2/, emulators running)
 *
 * MARTIN APPROVES BY EYE. §7e says so in those words, and it says it
 * because three reports in a row said the app was fine while it was not:
 * "it does not fit the screen", "it is not the design we agreed". A number
 * cannot answer that. Pictures can.
 *
 * It makes four synthetic people matching the mock-up's personas, signs in
 * as each, and saves the app's Home at 375px beside the mock-up's Home for
 * the same person. Pairs land in screenshots/app-vs-mockup/.
 *
 *   martin  volunteer on Sound and Core Team   -> me, worship, office
 *   sarah   attender and parent, on no team    -> me
 *   karen   leads Kids Church                  -> me, kids
 *   jo      Welcome, Tea & Coffee, Maintenance -> me, maint
 *
 * WHERE THE REAL APP CANNOT MATCH, IT IS SAID RATHER THAN HIDDEN. The
 * mock-up gives Jo "Welcome" and "Tea & Coffee" spaces; neither is a team
 * yet (§6 lists both as ones to confirm with Martin), so Jo gets
 * Maintenance only and the pair is labelled.
 *
 * Synthetic people throughout.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const OUT = path.join(V2, 'screenshots', 'app-vs-mockup');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9701, SERVE = 8917;
const PW = 'test-only-password';
const WIDTH = 375, HEIGHT = 812;

const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, obj) => req(8181, 'PATCH',
  DOCS + '/' + p.split('/').map(encodeURIComponent).join('/'),
  { fields: fields(obj) }, { Authorization: 'Bearer owner' });

/* The mock-up's four, as near as the real teams allow. */
const PEOPLE = {
  martin: { email: 'shot.martin@example.invalid', name: 'Martin Prosser',
            teams: ['AV Team', 'Core Team'], master: true,
            note: 'volunteer on Sound and Core Team' },
  sarah:  { email: 'shot.sarah@example.invalid', name: 'Sarah Green',
            teams: [], master: false,
            note: 'attender and parent, on no team' },
  karen:  { email: 'shot.karen@example.invalid', name: 'Karen Lewis',
            teams: ['Kids Church'], adminFor: ['Kids Church'], master: false,
            note: 'leads Kids Church' },
  jo:     { email: 'shot.jo@example.invalid', name: 'Jo Ward',
            teams: ['Maintenance'], master: false,
            note: 'Maintenance (the mock-up also gives Jo Welcome and Tea & Coffee, which are not teams yet)' }
};

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  /* A notice and a rota slot, so Home has something real to draw rather
     than being empty in every picture. Synthetic, and dated so it stays
     in the future. */
  /* THE NEXT ACTUAL SUNDAY. The first version used "today + 6 days" and
     called it "Sunday Morning Worship" - which on 11 October landed on
     Saturday the 17th. Martin spotted it in the picture. The app read the
     date correctly; the seed was lying about the day. A service seeded
     for a Sunday is seeded on a Sunday. */
  const nextSunday = (() => {
    const d = new Date(); d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
    return d;
  })();
  const soon = nextSunday.getFullYear() + '-'
    + String(nextSunday.getMonth() + 1).padStart(2, '0') + '-'
    + String(nextSunday.getDate()).padStart(2, '0');
  console.log('the next Sunday is ' + soon + ' ('
    + ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(soon + 'T12:00:00').getDay()] + ')');
  const until = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await put('news/shot_n1', { title: 'Gift day next Sunday',
    body: 'For the roof appeal. Give online or on the day.', until, createdAt: '2026-10-11', teams: [] });
  await put('news/shot_n2', { title: 'New Alpha course starts 3 November',
    body: 'Bring a friend. Sign up in What\u2019s on.', until, createdAt: '2026-10-10', teams: [] });

  for (const [key, p] of Object.entries(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    p.memberId = 'ab_shot_' + key;
    await put('users/' + p.uid, {
      uid: p.uid, email: p.email, name: p.name, memberId: p.memberId,
      status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor || [],
      masterAdmin: !!p.master, attender: true, churchMember: key !== 'sarah' });
    await put('addressBook/' + p.memberId, {
      name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor || [],
      masterAdmin: !!p.master, churchMember: key !== 'sarah',
      archived: false, isMinor: false });
  }
  /* Martin on Sound, Karen leading Kids Church - the mock-up's own
     examples, so the pictures line up. */
  /* arriveTime, so the card reads "arrive 08:00" as the mock-up does.
     NOTHING IN THE REAL ROTA WRITES THIS FIELD YET - the planner has no
     arrival time at all - so on real data Home falls back to the service
     time. Seeded here to show the shape Martin asked for. */
  await put('events/shot_ev1', { date: soon, startTime: '10:30', arriveTime: '08:00',
    type: 'Sunday Morning Worship',
    teams: ['AV Team'], archived: false, lastSlot: '',
    assignments: { Sound: { id: PEOPLE.martin.memberId, name: PEOPLE.martin.name } } });
  await put('events/shot_ev2', { date: soon, startTime: '10:30', type: 'Kids Church',
    teams: ['Kids Church'], archived: false, lastSlot: '',
    assignments: { 'Session leader': { id: PEOPLE.karen.memberId, name: PEOPLE.karen.name } } });
  console.log('seeded 4 synthetic people, 2 notices and 2 rota slots\n');

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const h = /<head[^>]*>/i.exec(t);
      body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript'
      : e === '.css' ? 'text/css' : e === '.json' ? 'application/json'
      : e === '.png' ? 'image/png' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-shots-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  };

  await send('Emulation.setDeviceMetricsOverride',
    { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });

  /* ---- the mock-up, one picture per person ------------------------- */
  for (const key of Object.keys(PEOPLE)) {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/design/app-mockup.html' });
    await sleep(2500);
    /* The mock-up remembers the last person in localStorage and switches
       with its own setP(), which is also what its phone-width picker
       does. */
    await ev('(function(){try{localStorage.setItem("egbc-mock",JSON.stringify({p:"' + key + '"}))}catch(e){}})()');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/design/app-mockup.html' });
    await sleep(2200);
    await shot(key + '--1-mockup');
    console.log('  mock-up  ' + key);
  }

  /* ---- the real app, the same four --------------------------------- */
  for (const [key, p] of Object.entries(PEOPLE)) {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await send('Storage.clearDataForOrigin', { origin: 'http://localhost:' + SERVE,
      storageTypes: 'indexeddb,local_storage,cache_storage,websql,service_workers' });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await sleep(3500);
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
      + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').catch(function(){})', true);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });

    let drawn = '';
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      drawn = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}}).getAttribute("data-drawn")||""'));
      if (drawn.indexOf(p.uid + ':') === 0) break;
    }
    /* Home loads its data and asks for a redraw; wait for that too, or the
       picture is of the first pass with nothing in it. */
    await sleep(2500);
    await shot(key + '--2-app');
    const spaces = String(await ev("Array.from(document.querySelectorAll('.space')).map(b=>b.textContent.trim()).join(', ')"));
    const sections = String(await ev("Array.from(document.querySelectorAll('.sec-h h3')).map(h=>h.textContent.trim()).join(' | ')"));
    const strips = String(await ev("document.getElementById('egbc-viewas') ? 'VIEW-AS STRIP PRESENT' : 'none'"));
    const sideways = await ev('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    console.log('  app      ' + key.padEnd(7)
      + ' spaces: [' + (spaces || '(none)') + ']');
    console.log('           ' + ' '.repeat(7) + ' Home: ' + (sections || '(no sections)'));
    console.log('           ' + ' '.repeat(7) + ' website strips: ' + strips
      + '   sideways scroll: ' + sideways + 'px');
  }

  console.log('\npairs in screenshots/app-vs-mockup/  (<person>--1-mockup.png, <person>--2-app.png)');
  server.close(); chrome.kill();
})().catch(e => { console.error(e); process.exit(1); });
