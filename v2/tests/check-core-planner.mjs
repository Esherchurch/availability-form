/* CORE TEAM’S SHARED SCREENS, IN BOTH THE PLACES THAT RUN THEM.
 *
 *   node tests/check-core-planner.mjs            (from v2/, emulators up)
 *   node tests/check-core-planner.mjs --shots
 *   BREAK=rooms node tests/check-core-planner.mjs   Meetings with an empty
 *        room list while the rooms are found: must fail
 *
 * WHY. APP-DESIGN-BRIEF §7b: the phone app's Core Team ▸ Plan tab runs
 * CoreTeamApp's own service planner, "moved or shared, not rewritten". On
 * 11 Oct 2026 it was lifted out of CoreTeamApp.html into
 * egbc-core-planner.js so both pages run one copy.
 *
 * TWO THINGS CAN GO WRONG WITH THAT, and this checks both:
 *
 *   1. The installed Core Team app breaks. It is on people's phones NOW
 *      and stays there until switch-over (§7b: never retire them). So
 *      every assertion below runs against CoreTeamApp.html first, and
 *      they are assertions about the planner WORKING - the default order
 *      appears, a song can be added, the song search finds a song, the
 *      YouTube and SongSelect links are built - not about the page merely
 *      loading.
 *   2. The app's tab draws something that only looks like the planner.
 *      So the same assertions run again against app.html's Plan tab, and
 *      one more: that both pages are running the SAME file.
 *
 * A planner that loses a half-written order of service is worse than no
 * planner, so there is a check for that too: leave the tab, come back,
 * and the song you typed is still there.
 *
 * Synthetic people and synthetic songs throughout.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9652, SERVE = 8893;
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';

const ME = { email: 'core.planner@example.invalid', name: 'Planner Synthetic', member: 'ab_core_planner' };
const SONG = 'Synthetic Song Of Gladness';
const PLAYER = { member: 'ab_core_player', name: 'Player Synthetic',
                 email: 'core.player@example.invalid' };

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')));
};

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

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

/* A Sunday that is always in the future, so the rota row it hangs on is
   never swept up by anything that filters on "still to come". A fixed date
   in a test collided with today once already and cost the events window
   six failing checks (F-153). */
const SUNDAY = (() => {
  const d = new Date(); d.setDate(d.getDate() + 14);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
})();

/* The coming Sunday, or today when today is Sunday - the date the planner
   now opens on. Worked out HERE independently of the planner's own
   comingSunday(), because a check that asks the code what it did and then
   agrees with it proves nothing. Local time, like the planner's. */
const COMING = (() => {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1), day = String(d.getDate());
  return d.getFullYear() + '-' + m.padStart(2, '0') + '-' + day.padStart(2, '0');
})();

/* A PLAN LEFT BY AN EARLIER RUN is cleared first. "A half-written plan
   survives" saves one, and the next run on the same emulator opened that
   instead of the default order: 1 song, and another song's keys
   (20 Oct 2026; green only on a fresh emulator). */
async function clearPlans(dates) {
  for (const date of dates) {
    const r = JSON.parse((await req(8181, 'POST', DOCS + ':runQuery', { structuredQuery: {
      from: [{ collectionId: 'services' }],
      where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: date } } } } },
      { Authorization: 'Bearer owner' })).body || '[]');
    for (const x of r) if (x.document) await req(8181, 'DELETE', '/v1/' + x.document.name, undefined, { Authorization: 'Bearer owner' });
  }
}

async function seed() {
  await clearPlans([...new Set([SUNDAY, COMING])]);
  let up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) throw new Error('Could not make or sign in to ' + ME.email);
  const uid = up.localId;

  await put('addressBook/' + ME.member, {
    name: ME.name, email: ME.email, markers: ['Core Team'], adminFor: [],
    churchMember: false, archived: false, isMinor: false });
  await put('users/' + uid, {
    uid, email: ME.email, name: ME.name, memberId: ME.member,
    status: 'active', linkedBy: 'admin', teams: ['Core Team'], adminFor: [],
    masterAdmin: false, attender: true, churchMember: false });

  /* A song with everything the planner draws off it: a CCLI number, a
     YouTube link, and a chord sheet in one key and not another. */
  await put('songs/' + SONG.toLowerCase().replace(/\s+/g, '-'), {
    title: SONG, normalized: SONG.toLowerCase(), ccli: '9999999',
    youtube: 'https://www.youtube.com/watch?v=synthetic',
    files: [{ type: 'Chord Sheet', key: 'G', url: 'https://example.invalid/g.pdf' }],
    servingHistory: [{ day: 'Sunday', count: 3 }] });

  /* SOMEBODY THE ROTA CAN OFFER. Without this the assignment sheet
     says "Nobody on this event's teams", which is true and useless as a
     test: a deliberate break that emptied the candidate list passed,
     because an empty list and a refused list read the same. One player
     on the event's team, who plays the role and has said yes. */
  await put('addressBook/' + PLAYER.member, {
    name: PLAYER.name, email: PLAYER.email, markers: ['Worship Team'], adminFor: [],
    primaryInstruments: ['Guitar'], secondaryInstruments: [], maxFrequency: '4',
    churchMember: false, archived: false, isMinor: false });
  await put('availability/av_core_planner', {
    eventId: 'ev_core_planner', memberId: PLAYER.member, status: 'avail' });

  /* A service on the rota for that Sunday, so "Select Service" has one. */
  await put('events/ev_core_planner', {
    termLabel: 'Autumn 2026', teams: ['Worship Team'], roles: ['Guitar'],
    archived: false, draft: false, date: SUNDAY, startTime: '10:30',
    type: 'Sunday Morning Worship', description: 'Communion',
    serviceLeader: 'Leader Synthetic', speaker: 'Speaker Synthetic',
    assignments: { 'Worship Leader': { id: ME.member, name: ME.name } } });

  return uid;
}

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });
  const uid = await seed();
  console.log('seeded a Core Team person, a song and a service on ' + SUNDAY + '\n');

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
    /* BREAK=rooms: the Meetings list as it was before 25 Oct 2026, an empty
       room list while the rooms are being found. */
    if (process.env.BREAK === 'rooms' && url === '/egbc-core-meetings.js') body = Buffer.from(body.toString('utf8').replace('if (!V() || !V().ready()) {', 'if (false) {'), 'utf8');
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript'
      : e === '.css' ? 'text/css' : e === '.json' ? 'application/json'
      : e === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-planner-' + process.pid),
    '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); let errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errs.push((m.params.args || []).map(a => String(a.value || a.description || '')).join(' ').slice(0, 200));
    if (m.method === 'Runtime.exceptionThrown') {
      const d = (m.params.exceptionDetails || {});
      errs.push('uncaught: ' + String((d.exception && (d.exception.description || d.exception.value)) || d.text || '').slice(0, 200));
    }
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  await send('Emulation.setDeviceMetricsOverride',
    { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });

  const ev = makeEval(send, "core-planner");
  const until = async (what, expr, tries = 50) => {
    let last = '';
    for (let i = 0; i < tries; i++) {
      await sleep(400);
      last = String(await ev(expr, true));
      if (last === 'yes') return true;
    }
    ok(what, false, 'gave up after ' + ((tries * 400) / 1000) + 's, last: ' + last);
    return false;
  };
  const shot = async (name) => {
    if (!wantShots) return;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'core-planner--' + name + '.png'), Buffer.from(r.data, 'base64'));
  };

  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Storage.clearDataForOrigin', { origin: 'http://localhost:' + SERVE,
    storageTypes: 'indexeddb,local_storage,cache_storage,websql,service_workers' });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
  await until('the sign-in harness loaded',
    '(typeof firebase === "undefined" || typeof EGBCAuth === "undefined") ? "no" : "yes"');
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
    + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ')'
    + '.then(function(){return "ok"}).catch(function(e){return "failed " + e.code})', true);
  await until('the Core Team person is signed in',
    'firebase.auth(EGBCAuth.app).currentUser'
    + ' && firebase.auth(EGBCAuth.app).currentUser.uid === ' + JSON.stringify(uid) + ' ? "yes" : "no"');
  await until('the session carries a working token',
    'firebase.auth(EGBCAuth.app).currentUser.getIdToken().then(function(t){return t?"yes":"no"})'
    + '.catch(function(){return "no"})', 20);

  /* ---- the questions, asked the same way of both hosts --------------- */
  const planner = async (where) => {
    const out = {};
    out.mounted = String(await ev('!!document.getElementById("sp-order") ? "yes" : "no"'));
    out.blocks = Number(await ev('document.querySelectorAll("#sp-order .service-block").length')) || 0;
    out.songs = Number(await ev('document.querySelectorAll("#sp-order .song-block").length')) || 0;
    out.items = String(await ev('Array.prototype.map.call(document.querySelectorAll("#sp-order .item-block .item-title"),'
      + 'function(i){return i.value}).join("|")'));
    out.numbered = String(await ev('(document.querySelector("#sp-order .sp-song-number")||{}).textContent||""'));
    return out;
  };

  const run = async (label, open) => {
    console.log('\n' + label + ':');
    errs = [];
    await open();

    let p1 = await planner(label);
    ok('  the planner is on the screen', p1.mounted === 'yes', JSON.stringify(p1));
    if (p1.mounted !== 'yes') return;

    /* IT OPENS ON THE COMING SUNDAY (Martin, 11 Oct 2026). It opened
       blank, so the first thing anybody did was pick the date they were
       always going to pick. */
    const opened = String(await ev('(document.getElementById("spDate")||{}).value||""'));
    ok('  it opens on the coming Sunday, not a blank date', opened === COMING,
      'opened on "' + opened + '", wanted ' + COMING);
    /* AND THE SERVICE ON IT, ONLY IF THERE IS EXACTLY ONE. Two means a
       choice, and choosing for somebody is how you plan the wrong
       service without noticing. Written as the rule rather than as "it
       picked mine", because the emulator is shared and what else is on
       that Sunday is not this check's to control - the rule holds either
       way, and the branch that ran is printed. */
    await until('  the rota for that Sunday has been looked up',
      '(function(){var s=document.getElementById("spEventSelect");'
      + 'return (s && s.dataset.done !== undefined) || (s && s.options.length >= 1) ? "yes" : "no"})()', 30);
    await sleep(1200);
    const choice = JSON.parse(String(await ev(
      '(function(){var s=document.getElementById("spEventSelect");'
      + 'if(!s) return JSON.stringify({services:-1,chosen:"(no select)"});'
      + 'return JSON.stringify({ services: s.options.length - 1, chosen: s.value,'
      + ' chosenText: s.selectedIndex > 0 ? s.options[s.selectedIndex].textContent : "" })})()') || '{}'));
    if (choice.services === 1) {
      ok('  and chooses it, because there is exactly one service that day',
        choice.chosen !== '' && choice.chosenText !== '', JSON.stringify(choice));
      const team = String(await ev('document.querySelectorAll("#spTeamBody tr").length'));
      ok('    which fills in who is on', Number(team) > 0, team + ' rows');
    } else {
      ok('  and does NOT choose for them, because there are ' + choice.services
        + ' services that day', choice.chosen === '', JSON.stringify(choice));
    }
    /* THE DEFAULT ORDER, which is what a planner opens with: seven songs
       and two items, "Welcome and Notices" then "Message".

       WAIT FOR IT, rather than snapshotting and hoping. This was a race
       all along and nothing had lost it yet: the planner draws the
       default order after reading the database, and p1 was taken the
       moment the screen appeared. On 12 Oct the emailed-plan fallback
       added a read in front of that draw and the phone app lost the
       race - reported as "0 songs", which reads exactly like a planner
       that opens empty. The next assertion is what gave it away: "+
       Song" then counted 8, which is the seven defaults plus the one it
       had just added. A snapshot cannot tell "not yet" from "not at
       all", so it has to wait for the thing it is about to measure. */
    await until('  the default order of service is drawn',
      '(function(){var n=document.querySelectorAll("#sp-order .song-block").length;'
      + 'return n === 7 ? "yes" : "no"})()', 40);
    p1 = await planner(label);
    ok('  it opens with the default order of service',
      p1.songs === 7 && p1.items === 'Welcome and Notices|Message',
      p1.songs + ' songs, items: ' + p1.items);
    ok('  and the songs are numbered', /^Song 1$/.test(p1.numbered), p1.numbered);

    /* + Song really adds one - through the song library since 19 Oct 2026
       (choosing a song, check-song-pick.mjs has the rest of it): it opens,
       and adding a name from it makes the row. */
    await ev('document.querySelector(\'[onclick="spPickSong()"]\').click();1');
    await sleep(800);
    ok('  "+ Song" opens the song library', String(await ev('!!document.getElementById("sp-pick")')) === 'true');
    await ev('(function(){var q=document.getElementById("sp-pick-q");q.value="Placeholder Synthetic";q.dispatchEvent(new Event("input",{bubbles:true}));return 1})()');
    await sleep(1500);
    await ev('(function(){var b=document.querySelector("#sp-pick-list [data-new]");if(b)b.click();return 1})()');
    await sleep(800);
    const after = await planner(label);
    ok('  "+ Song" adds a song', after.songs === p1.songs + 1, after.songs + ' songs');

    /* THE SONG SEARCH, which is the planner's real work: type two
       letters and the library answers. */
    await ev('(function(){var i=document.querySelectorAll("#sp-order .song-title");'
      + 'var t=i[i.length-1];t.value=' + JSON.stringify(SONG.slice(0, 12)) + ';'
      + 't.dispatchEvent(new Event("input",{bubbles:true}));return "typed"})()');
    await until('  the song library answers the search',
      '(function(){var b=document.querySelectorAll("#sp-order .sp-suggest-box");'
      + 'for(var i=0;i<b.length;i++){if(b[i].style.display==="block"&&b[i].textContent.trim())return "yes"}'
      + 'return "no"})()', 30);
    const suggestion = String(await ev('(function(){var b=document.querySelectorAll("#sp-order .sp-suggest-box");'
      + 'for(var i=0;i<b.length;i++){if(b[i].style.display==="block")return b[i].textContent.trim()}return ""})()'));
    ok('  and finds the song by name', suggestion.indexOf(SONG) !== -1, suggestion.slice(0, 120));

    /* Choosing it must bring the YouTube and SongSelect links and the
       key information - the things §7b says must not be lost. */
    await ev('(function(){var s=document.querySelectorAll("#sp-order .sp-suggest-item");'
      + 'for(var i=0;i<s.length;i++){if(/' + SONG.split(' ')[1] + '/.test(s[i].textContent)){s[i].click();return "clicked"}}'
      + 'return "none"})()');
    await until('  choosing it loads what we know about the song',
      '(function(){var k=document.querySelectorAll("#sp-order .sp-key-info");'
      + 'for(var i=0;i<k.length;i++){if(k[i].style.display==="block")return "yes"}return "no"})()', 30);
    const links = String(await ev('(function(){var f=document.querySelectorAll("#sp-order .sp-files-box");'
      + 'var out=[];for(var i=0;i<f.length;i++){out.push(f[i].textContent.replace(/\\s+/g," ").trim())}'
      + 'return out.join(" // ")})()'));
    ok('  with the YouTube and SongSelect buttons, and the CCLI number',
      /YouTube/.test(links) && /SongSelect/.test(links) && /9999999/.test(links), links.slice(0, 160));
    const keyinfo = String(await ev('(function(){var k=document.querySelectorAll("#sp-order .sp-key-info");'
      + 'for(var i=0;i<k.length;i++){if(k[i].style.display==="block")return k[i].textContent.replace(/\\s+/g," ").trim()}'
      + 'return ""})()'));
    ok('  and which keys we have a chord sheet in', /Available:\s*G/.test(keyinfo), keyinfo.slice(0, 140));

    /* The rota behind it: pick the date and the service appears. */
    await ev('(function(){var d=document.getElementById("spDate");d.value=' + JSON.stringify(SUNDAY) + ';'
      + 'd.dispatchEvent(new Event("change",{bubbles:true}));return "set"})()');
    await until('  choosing a date finds that Sunday\'s services',
      '(function(){var s=document.getElementById("spEventSelect");'
      + 'return (s && s.options.length > 1) ? "yes" : "no"})()', 30);
    const services = String(await ev('(function(){var s=document.getElementById("spEventSelect");'
      + 'return Array.prototype.map.call(s.options,function(o){return o.textContent}).join("|")})()'));
    ok('  and offers the service by name', /Sunday Morning Worship/.test(services), services);

    await shot(label.replace(/[^a-z]+/gi, '-').toLowerCase());
    ok('  nothing on the console', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  };

  /* ---- 0. the welcome tour, which A-071 stopped firing --------------- */
  /* Martin, 11 Oct 2026: fix it, with a check that the tour starts on
     first open. The fault was a const declared 2,000 lines below the call
     that reads it, so maybeTriggerTour threw "Cannot access
     '_touredSections' before initialization" and the tour never fired on
     the FIRST screen a new Core Team member sees - the one screen it was
     written for. Every later screen was fine, which is why nothing
     noticed, and why this check is deliberately the FIRST thing done to
     a cleared browser rather than something done after a walk around. */
  console.log('the welcome tour, on a first open:');
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Storage.clearDataForOrigin', { origin: 'http://localhost:' + SERVE,
    storageTypes: 'local_storage' });
  errs = [];
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/CoreTeamApp.html' });
  await until('  the Core Team app loaded', '(typeof openSection === "undefined") ? "no" : "yes"', 60);
  /* The tour fires on a 500ms timer after the screen settles, and nothing
     is clicked here - this is what a person gets by opening the app. */
  await until('  the tour comes up by itself on the first screen',
    '(function(){var o=document.getElementById("tour-overlay");'
    + 'return (o && o.classList.contains("active")) ? "yes" : "no"})()', 30);
  const tourText = String(await ev('(function(){var o=document.getElementById("tour-overlay");'
    + 'return o ? o.textContent.replace(/\\s+/g," ").trim() : "(no overlay)"})()'));
  ok('  the tour comes up by itself, with its first step',
    /Welcome to Worship Planner/.test(tourText), tourText.slice(0, 140));
  ok('  and nothing threw on the way',
    !errs.some(e => /_touredSections|before initialization/.test(e)),
    JSON.stringify(errs.slice(0, 3)));
  await ev('(function(){try{if(typeof endTour==="function")endTour()}catch(e){}'
    + 'var o=document.getElementById("tour-overlay");if(o)o.classList.remove("active");return "ended"})()');

  /* ---- 1. the installed Core Team app, which must not break ---------- */
  await run('CoreTeamApp, the installed one', async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/CoreTeamApp.html' });
    await until('  the Core Team app loaded',
      '(typeof openSection === "undefined") ? "no" : "yes"', 60);
    await ev('(function(){try{if(typeof endTour==="function")endTour()}catch(e){}'
      + 'var o=document.getElementById("tour-overlay");if(o)o.classList.remove("active");'
      + 'openSection("service");return "opened"})()');
    await sleep(1200);
  });

  /* ---- 2. the phone app's Core Team ▸ Plan tab ----------------------- */
  await run('the phone app, Core Team \u25b8 Plan', async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
    let drawn = '';
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      drawn = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
        + '.getAttribute("data-drawn") || ""'));
      if (drawn.indexOf(uid + ':') === 0) break;
    }
    ok('  the app drew for them', drawn.indexOf(uid + ':') === 0, 'data-drawn: ' + (drawn || '(none)'));
    const went = String(await ev('(function(){ if (typeof EGBCApp === "undefined") return "no app";'
      + ' EGBCApp.go("core","plan"); return JSON.stringify(EGBCApp.state()); })()'));
    ok('  Core Team \u25b8 Plan is a place they can go', /"core"/.test(went) && /"plan"/.test(went), went);
    await sleep(1500);
  });

  /* ---- 2b. Meetings, the other screen that is now shared ------------- */
  /* §7b, Core Team ▸ Meetings: "join video calls and see upcoming online
     meetings." Same question of both hosts, same reason. */
  const meetings = async (label, open) => {
    console.log('\n' + label + ':');
    errs = [];
    await open();
    const text = String(await ev('(function(){var c=document.getElementById(' + JSON.stringify(MEET_ID[label])
      + ');return c?c.textContent.replace(/\\s+/g," ").trim():"(nothing)"})()'));
    ok('  the meetings list is drawn',
      /Upcoming online meetings/.test(text) && /All meeting rooms/.test(text), text.slice(0, 140));
    /* EVERY ROOM, by the names people know them by. A room missing from
       this list is a call nobody can join. */
    const rooms = ['Worship & AV', 'Worship Core Team', 'Prayer', 'Eldership', 'CMM',
                   'Kids Ministries', 'Interviews'];
    const missing = rooms.filter(r => text.indexOf(r) === -1);
    ok('  with all seven rooms on it', missing.length === 0, 'missing: ' + missing.join(', '));
    /* JOIN GOES TO THE EGBC PAGE, not straight to Daily: the meeting page
       fills the person's name in and knows who they are. Copy link stays
       the plain Daily address, for a guest with no account. */
    const links = JSON.parse(String(await ev(
      '(function(){var c=document.getElementById(' + JSON.stringify(MEET_ID[label]) + ');'
      + 'if(!c) return JSON.stringify({join:[],copy:[]});'
      + 'var a=c.querySelectorAll("a[href]"), b=c.querySelectorAll("button[onclick]");'
      + 'return JSON.stringify({'
      + ' join: Array.prototype.map.call(a,function(x){return x.getAttribute("href")}),'
      + ' copy: Array.prototype.map.call(b,function(x){return x.getAttribute("onclick")}) })})()') || '{}'));
    ok('  Join opens the EGBC meeting page, with the room on it',
      links.join.length >= 7 && links.join.every(h => /^meeting\.html\?room=/.test(h)),
      links.join.slice(0, 3).join(' | '));
    /* The church's own room in Church HQ's Daily account (21 Oct 2026;
       egbc.daily.co before): <churchId>-<room>. */
    ok('  and Copy link copies the plain room address',
      links.copy.length >= 7 && links.copy.every(h => /copyMeetingLink\('https:\/\/[a-z0-9-]+\.daily\.co\/egbc-/.test(h)),
      links.copy.slice(0, 2).join(' | '));
    /* NO HOST TOKEN, EVER. Anybody with one walks in as the host. The
       comment saying so travelled with the code; this is the check that
       the comment stays true. */
    ok('  and no host token is anywhere in it',
      !/[?&]t=|token=/.test(JSON.stringify(links)), JSON.stringify(links).slice(0, 160));
    await shot('meetings-' + label.replace(/[^a-z]+/gi, '-').toLowerCase());
    ok('  nothing on the console', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  };
  const MEET_ID = {
    'CoreTeamApp, Meetings': 'meetingsList',
    'the phone app, Core Team ▸ Meetings': 'core-meet-host'
  };

  await meetings('CoreTeamApp, Meetings', async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/CoreTeamApp.html' });
    await until('  the Core Team app loaded', '(typeof openSection === "undefined") ? "no" : "yes"', 60);
    await ev('(function(){try{if(typeof endTour==="function")endTour()}catch(e){}'
      + 'var o=document.getElementById("tour-overlay");if(o)o.classList.remove("active");'
      + 'openSection("meetings");return "opened"})()');
    /* The first open for a church makes its rooms (a few seconds live; on
       the emulator, 16 s and more while it fetches the Daily secret). Until
       then the list says so - never an empty list of rooms, which reads as
       "this church has none". This was the check's three old reds: it read
       the list during that wait. */
    const first = String(await ev('(function(){var c=document.getElementById("meetingsList");'
      + 'return JSON.stringify({ready:!!(window.EGBCVideo&&EGBCVideo.ready()),text:c?c.textContent:""})})()'));
    const f1 = JSON.parse(first || '{}');
    ok('  while the rooms are found, it says so (not an empty list)',
      f1.ready || /Finding the rooms/.test(f1.text || ''), (f1.text || '').replace(/\s+/g, ' ').slice(0, 140));
    await until('  its meetings list filled in, rooms and all',
      '(function(){var c=document.getElementById("meetingsList");'
      + 'return (c && /All meeting rooms/.test(c.textContent) && !/Finding the rooms/.test(c.textContent)) ? "yes" : "no"})()', 100);
  });

  await meetings('the phone app, Core Team ▸ Meetings', async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
    let drawn = '';
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      drawn = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
        + '.getAttribute("data-drawn") || ""'));
      if (drawn.indexOf(uid + ':') === 0) break;
    }
    await ev('EGBCApp.go("core","meetings");1');
    await until('  its meetings list filled in',
      '(function(){var c=document.getElementById("core-meet-host");'
      + 'return (c && /All meeting rooms/.test(c.textContent) && !/Finding the rooms/.test(c.textContent)) ? "yes" : "no"})()', 100);
  });

  /* ---- 2c. the Rota, the third shared screen ------------------------ */
  /* §7b: "the rota planner as CoreTeamApp has it on the phone (assign the
     team, + for a new service)."

     THESE ARE THE THREE THINGS MARTIN SAID HE WOULD WALK, read-only, in
     the old Core Team app: a service's assignments, the availability
     list, and the new-event form without saving. So they are the three
     this checks, in that order, in both hosts - and nothing here saves
     anything either. */
  const rota = async (label, open) => {
    console.log('\n' + label + ':');
    errs = [];
    await open();

    const toolbar = String(await ev('(function(){var c=document.getElementById("termSelect");'
      + 'if(!c) return "(no toolbar)";'
      + 'var b=c.parentElement.querySelectorAll("button");'
      + 'return Array.prototype.map.call(b,function(x){return x.textContent.trim()}).join("|")})()'));
    /* "Show past dates" since 14 Oct 2026 (Martin; the events window's
       F-171): past dates are hidden until it is pressed. */
    ok('  the toolbar is there, with its seven buttons in order',
      toolbar === 'Populate|Auto-Fill|+ Practices|+ Service|Gather Avail|Hide Assigned|Show past dates', toolbar);

    const terms = Number(await ev('document.querySelectorAll("#eventList button[onclick^=\'toggleTermCollapse\']").length'));
    ok('  the rota is drawn, by term', terms >= 1, terms + ' terms');
    const rowFor = '(function(){var b=document.querySelectorAll("#eventList [onclick^=\\"roleTap(\\"]");'
      + 'return b.length})()';
    const roles = Number(await ev(rowFor));
    ok('  with roles you can tap to assign', roles >= 1, roles + ' role slots');

    /* 1. A SERVICE'S ASSIGNMENTS. Opens the sheet and reads it; the
       sheet is closed again without choosing anybody. */
    /* ITS OWN SERVICE, not whichever is first: another check's leftover
       service on an earlier date sat first and had nobody to offer. */
    await ev('(function(){var b=document.querySelectorAll("#eventList [data-date=\\"' + SUNDAY + '\\"] [onclick^=\\"roleTap(\\"]");'
      + 'if(!b.length) b=document.querySelectorAll("#eventList [onclick^=\\"roleTap(\\"]");'
      + 'if(!b.length) return "none"; b[0].click(); return "tapped"})()');
    await until('  tapping a role opens the assignment sheet',
      '!!document.getElementById("rota-sheet") ? "yes" : "no"', 20);
    const sheet = String(await ev('(function(){var s=document.getElementById("rota-sheet");'
      + 'return s?s.textContent.replace(/\\s+/g," ").trim():"(no sheet)"})()'));
    /* A NAMED PERSON, not just the shape of a sheet. "Nobody on this
       event's teams" satisfied the first version of this and so did a
       deliberately emptied candidate list - an empty list and a refused
       one read the same. The seed puts one player on the event's team
       who plays Guitar and has said yes, so the sheet must name them
       and say why they are in it. */
    ok('  and it offers people, with why they are in the list',
      /Assign|Or replace with/.test(sheet)
        && sheet.indexOf('Player Synthetic') !== -1
        && /(plays this|available)/.test(sheet),
      sheet.slice(0, 200));
    await ev('closeSheet();1');
    ok('  and closes again without changing anything',
      !(await ev('!!document.getElementById("rota-sheet")')));

    /* 2. THE AVAILABILITY LIST - the inbox button on an event row. */
    await ev('(function(){var b=document.querySelectorAll("#eventList [onclick^=\\"toggleBucket(\\"]");'
      + 'if(!b.length) return "none"; b[0].click(); return "tapped"})()');
    await sleep(600);
    const buckets = String(await ev('(function(){var c=document.getElementById("eventList");'
      + 'return c?c.textContent.replace(/\\s+/g," "):""})()'));
    ok('  the availability list opens, in its three parts',
      /Available/.test(buckets) && /Declined/.test(buckets) && /Pending/.test(buckets),
      buckets.slice(0, 120));
    await ev('(function(){var b=document.querySelectorAll("#eventList [onclick^=\\"toggleBucket(\\"]");'
      + 'if(b.length) b[0].click(); return "shut"})()');

    /* 3. THE NEW-EVENT FORM, opened and cancelled. Every field, by the
       id the old markup used, because those ids are what the form's own
       code reads - if one were renamed in the move, Create Event would
       throw rather than do nothing, and nobody would see it until they
       pressed it. */
    await ev('EGBCCoreRota.newEvent();1');
    await until('  the "+" opens the new-event form',
      '(function(){var el=document.getElementById("cr-new-event");'
      + 'return (el && el.classList.contains("open")) ? "yes" : "no"})()', 20);
    const form = JSON.parse(String(await ev(
      '(function(){var f={};'
      + '["new-event-date","new-event-type","new-event-term","new-event-video","event-modal-btn"]'
      + '.forEach(function(id){var el=document.getElementById(id);'
      + ' f[id] = el ? (el.tagName.toLowerCase() + ":" + (el.value !== undefined ? el.value : "")) : "(missing)";});'
      + 'var t=document.getElementById("new-event-type");'
      + 'f.types = t ? t.options.length : 0;'
      + 'var v=document.getElementById("new-event-video");'
      + 'f.rooms = v ? v.options.length : 0;'
      + 'return JSON.stringify(f)})()') || '{}'));
    ok('  with all four fields, by the names the form\'s own code reads',
      form['new-event-date'] && form['new-event-date'].indexOf('(missing)') !== 0
        && form['new-event-type'] && form['new-event-type'].indexOf('(missing)') !== 0
        && form['new-event-term'] && form['new-event-term'].indexOf('(missing)') !== 0
        && form['new-event-video'] && form['new-event-video'].indexOf('(missing)') !== 0,
      JSON.stringify(form));
    ok('  the eleven event types the old form offered', form.types === 11, form.types + ' types');
    ok('  the seven rooms plus "No video call"', form.rooms === 8, form.rooms + ' options');
    ok('  it opens on Sunday Morning Worship, with its usual room',
      /Sunday Morning Worship$/.test(form['new-event-type'] || ''), form['new-event-type']);
    /* CANCELLED, NOT SAVED. This check writes nothing to the rota. */
    await ev('closeNewEventForm();1');
    await sleep(300);
    ok('  and Cancel shuts it without creating anything',
      String(await ev('(function(){var el=document.getElementById("cr-new-event");'
        + 'return (el && el.classList.contains("open")) ? "open" : "shut"})()')) === 'shut');

    await shot('rota-' + label.replace(/[^a-z]+/gi, '-').toLowerCase());
    ok('  nothing on the console', errs.length === 0, JSON.stringify(errs.slice(0, 3)));
  };

  await rota('CoreTeamApp, the Rota Planner', async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/CoreTeamApp.html' });
    await until('  the Core Team app loaded', '(typeof openSection === "undefined") ? "no" : "yes"', 60);
    await ev('(function(){try{if(typeof endTour==="function")endTour()}catch(e){}'
      + 'var o=document.getElementById("tour-overlay");if(o)o.classList.remove("active");'
      + 'openSection("rota");return "opened"})()');
    await until('  the rota drew',
      '(function(){var c=document.getElementById("eventList");'
      + 'return (c && c.children.length) ? "yes" : "no"})()', 50);
  });

  await rota('the phone app, Core Team ▸ Rota', async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
    let drawn = '';
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      drawn = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
        + '.getAttribute("data-drawn") || ""'));
      if (drawn.indexOf(uid + ':') === 0) break;
    }
    await ev('EGBCApp.go("core","rota");1');
    await until('  the rota drew',
      '(function(){var c=document.getElementById("eventList");'
      + 'return (c && c.children.length) ? "yes" : "no"})()', 50);
  });

  /* ---- 3. and it really is the same file ----------------------------- */
  console.log('\nthe same code, not two copies:');
  const srcs = String(await ev('Array.prototype.map.call(document.scripts,function(s){return s.src})'
    + '.filter(function(u){return /egbc-core-planner/.test(u)}).length'));
  ok('  the app loads egbc-core-planner.js', Number(srcs) === 1, srcs + ' tags');
  const core = fs.readFileSync(path.join(V2, 'CoreTeamApp.html'), 'utf8');
  ok('  CoreTeamApp loads it too', /egbc-core-planner\.js/.test(core));
  ok('  and CoreTeamApp no longer has its own copy of spInit',
    !/function spInit\s*\(/.test(core), 'spInit is still defined in CoreTeamApp.html');
  ok('  nor its own copy of the planner styles',
    !/\.sp-input\s*\{/.test(core), '.sp-input is still in CoreTeamApp.html');
  ok('  both load egbc-core-meetings.js',
    /egbc-core-meetings\.js/.test(core)
      && Number(await ev('Array.prototype.filter.call(document.scripts,'
        + 'function(s){return /egbc-core-meetings/.test(s.src)}).length')) === 1);
  ok('  and CoreTeamApp no longer has its own renderMeetings body',
    !/const\s+VIDEO_ROOMS\s*=\s*\[/.test(core),
    'the room table is still written out in CoreTeamApp.html');

  /* ---- 4. leaving the tab must not throw the plan away --------------- */
  console.log('\na half-written plan survives:');
  /* Back to Plan first: the section above left the app on Meetings, and
     a check that assumes which tab it is on is a check that breaks the
     next time somebody adds a section above it. */
  await ev('EGBCApp.go("core","plan");1');
  await until('  the planner is back on screen',
    '!!document.getElementById("sp-order") ? "yes" : "no"', 30);
  await ev('(function(){var t=document.querySelectorAll("#sp-order .song-title");'
    + 't[0].value="Half Written Synthetic";return "typed"})()');
  await ev('EGBCApp.go("core","team");1'); await sleep(800);
  ok('  the Team tab really is a different screen',
    String(await ev('!!document.getElementById("sp-order") ? "yes" : "no"')) === 'no');
  await ev('EGBCApp.go("core","plan");1'); await sleep(1200);
  const kept = String(await ev('(function(){var t=document.querySelector("#sp-order .song-title");'
    + 'return t ? t.value : "(gone)"})()'));
  ok('  and coming back to Plan still has what was typed',
    kept === 'Half Written Synthetic', kept);

  if (wantShots) console.log('\nscreenshots in tests/shots/');
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
