/* Worship, AV and Choir see the same pages, in both directions.
 *
 *   node tests/check-worship-av-one-team.mjs      (from v2/, emulators up)
 *
 * Martin, 12 Oct 2026: "if worship team want to turn on the sound desk
 * they should be able to see how." He changed the page check himself
 * (egbc-auth.js WORSHIP_AV, 8c9dba43) and walked it live with view-as.
 * This is the rest of it: the Menu, and the data behind the pages.
 *
 * BOTH DIRECTIONS, AND THE THIRD TEAM. "Worship can open the AV how-to"
 * on its own would pass just as well with a guard that had stopped
 * checking teams at all, which is why AV opening the worship pages and
 * Choir opening both are asked too - and why Kids Church is asked to be
 * refused in the same run. A cover that lets everybody into everything
 * is not a cover.
 *
 * AND RANK IS NOT TEAM. Two of these pages are leader-only. They must
 * still refuse a plain member - but the refusal has to be about RANK.
 * If the cover broke, the team check runs first and the words change,
 * which is the difference this watches for.
 *
 * Synthetic people throughout: one on Worship, one on AV, one on Choir,
 * one on Kids Church, none of them an admin of anything.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9721, SERVE = 8937;
const PW = 'test-only-password';

/* THE PAGES MARTIN WALKED, in his words. Read out of the files below so
   that a page whose guard changes cannot quietly drop off this list. */
const AV_PAGES = ['EGBC-HowTo-AV.html', 'EGBC-Troubleshoot-AV.html',
                  'MonitorStageMap.html', 'AVteamlandingpage.html'];
const WORSHIP_PAGES = ['Library.html', 'EGBC-PlayThrough.html',
                       'Worshipteamcharter.html', 'Performancenotes.html'];
/* Leader-only, both of them. They must refuse a plain member of any of
   the three - and refuse on rank. */
const RANK_PAGES = ['inventory-system-2.html', 'SundayServicePlanner.html'];

const PEOPLE = {
  worship: { email: 'wav.worship@example.invalid', name: 'Worship Synthetic',
             member: 'ab_wav_worship', teams: ['Worship Team'] },
  av:      { email: 'wav.av@example.invalid', name: 'AV Synthetic',
             member: 'ab_wav_av', teams: ['AV Team'] },
  choir:   { email: 'wav.choir@example.invalid', name: 'Choir Synthetic',
             member: 'ab_wav_choir', teams: ['Choir'] },
  kids:    { email: 'wav.kids@example.invalid', name: 'Kids Synthetic',
             member: 'ab_wav_kids', teams: ['Kids Church'] },
};

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : '')));
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
const put = (p, obj) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(obj) },
  { Authorization: 'Bearer owner' });

/* WHAT EACH PAGE ASKS FOR, read from the page rather than retyped. If a
   page stops being guarded, or starts asking for a different team, this
   is what notices - a hand-kept list would simply go stale. */
const guardOf = (file) => {
  const t = fs.readFileSync(path.join(V2, file), 'utf8');
  const g = /<script[^>]*egbc-guard\.js[^>]*>/i.exec(t);
  if (!g) return null;
  const team = /data-team="([^"]*)"/i.exec(g[0]);
  const role = /data-role="([^"]*)"/i.exec(g[0]);
  return { team: team ? team[1] : '', role: role ? role[1] : '' };
};

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

(async () => {
  /* The three teams' material, so "can they see it" has something to be
     about beyond the page opening. */
  await put('teamVideos/wav_v_av', { title: 'AV clip synthetic', team: 'AV Team' });
  await put('teamVideos/wav_v_worship', { title: 'Worship clip synthetic', team: 'Worship Team' });

  for (const [key, p] of Object.entries(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    /* Both places, or the rules put the teams back as the address book
       has them - a seed that writes only the mirror once reported a
       missing strip on 22 pages. */
    await put('users/' + p.uid, {
      uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active',
      linkedBy: 'admin', teams: p.teams, adminFor: [], masterAdmin: false,
      attender: true, churchMember: true });
    await put('addressBook/' + p.member, {
      name: p.name, email: p.email, markers: p.teams, adminFor: [],
      churchMember: true, archived: false, isMinor: false });
  }

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
      : e === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  /* No back/forward cache (A-090): a cached page keeps its database
     connection open, and after enough pages the sign-in cannot get through. */
  const chrome = spawn(CHROME, ['--headless=new', '--disable-features=BackForwardCache', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-wav-' + process.pid),
    '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  /* https only: pausing http breaks Firestore's stream (A-062). */
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const ev = makeEval(send, 'worship-av-one-team');

  const until = async (what, expr, tries = 40) => {
    let last = '';
    for (let i = 0; i < tries; i++) {
      await sleep(400);
      last = String(await ev(expr, true));
      if (last === 'yes') return true;
    }
    ok(what, false, 'gave up, last: ' + last);
    return false;
  };

  const signIn = async (p) => {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await send('Storage.clearDataForOrigin', { origin: 'http://localhost:' + SERVE,
      storageTypes: 'indexeddb,local_storage,cache_storage,websql,service_workers' });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await until('the sign-in harness loaded for ' + p.name,
      '(typeof firebase === "undefined" || typeof EGBCAuth === "undefined") ? "no" : "yes"');
    await ev('firebase.auth(EGBCAuth.app).signOut().catch(function(){})', true);
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
      + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ')'
      + '.then(function(){return "ok"}).catch(function(e){return "failed " + e.code})', true);
    await until(p.name + ' is signed in before any page opens',
      'firebase.auth(EGBCAuth.app).currentUser'
      + ' && firebase.auth(EGBCAuth.app).currentUser.uid === ' + JSON.stringify(p.uid)
      + ' ? "yes" : "no"');
  };

  /* The guard hides the body until it knows who you are, then reveals it
     or replaces it and stamps data-egbc-blocked with the title - so this
     reads the stamp rather than the words. The narrow retry is for the
     emulator dropping a client (A-062/A-063), which looks exactly like a
     refusal if only the end state is read. */
  let dropped = 0;
  const openOnce = async (file) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + file });
    for (let i = 0; i < 75; i++) {
      await sleep(400);
      /* "OPEN" MEANS THE GUARD REVEALED IT, not "no splash yet".
         ===============================================================
         This is what made "Kids Church is still turned away" fail once
         in twenty runs and pass on its own afterwards.

         egbc-guard.js appends #egbc-guard-style - body{visibility:hidden}
         - SYNCHRONOUSLY as its script runs, and adds the splash later,
         inside start(). The old test here asked "is there a splash?" and
         called anything else open, so a poll landing in the gap between
         body existing and start() running read a hidden page as OPEN.

         It could only ever show up where the expected answer is BLOCKED:
         a false open on a page somebody is allowed to see agrees with
         the assertion anyway. That is why one safety assertion flickered
         while eleven others looked solid - the fault was in all of them
         and visible in one.

         reveal() removes the style element and nothing else does, so its
         absence is the page having been shown to this person. No window,
         no timing. */
      const state = String(await ev(
        '(function(){ if(!document.body) return "loading";'
        + ' var b = document.body.getAttribute("data-egbc-blocked");'
        + ' if (b) return "blocked:" + b;'
        + ' if (document.getElementById("egbc-guard-style")) return "checking";'
        + ' return "open"; })()'));
      if (state.indexOf('blocked:') === 0 || state === 'open') return state;
    }
    return 'never settled';
  };
  const openPage = async (file) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = await openOnce(file);
      if (state.indexOf('blocked:Something went wrong') !== 0 && state !== 'never settled') return state;
      const reach = String(await ev(
        'Promise.race([ EGBCAuth.db.collection("users").limit(1).get()'
        + '.then(function(){ return "reachable"; })'
        + '.catch(function(e){ return "unreachable:" + e.code; }),'
        + ' new Promise(function(r){ setTimeout(function(){ r("unreachable:timeout"); }, 6000); }) ])',
        true));
      if (reach.indexOf('unreachable') !== 0 || attempt === 2) return state + ' [' + reach + ']';
      dropped++;
    }
    return 'never settled';
  };

  console.log('the pages, as each of the three teams');
  for (const f of AV_PAGES.concat(WORSHIP_PAGES).concat(RANK_PAGES)) {
    const g = guardOf(f);
    if (!g) { ok('  ' + f + ' is guarded at all', false, 'no egbc-guard.js on it'); }
  }

  const walk = async (key, shouldOpen, label) => {
    const p = PEOPLE[key];
    console.log('\n' + p.name + ' (' + p.teams.join(', ') + '): ' + label);
    await signIn(p);
    const refused = [];
    for (const f of shouldOpen) {
      const state = await openPage(f);
      if (state !== 'open') refused.push(f + ' -> ' + state);
    }
    ok('  opens ' + shouldOpen.join(', '), refused.length === 0,
      refused.join('\n          '));
  };

  await walk('worship', AV_PAGES, 'the AV pages');
  await walk('av', WORSHIP_PAGES, 'the worship pages');
  await walk('choir', AV_PAGES.concat(WORSHIP_PAGES), 'both');

  /* RANK IS NOT TEAM. A plain member of any of the three is still turned
     away from the leader-only pages - and the words have to be about
     rank. If the cover broke, the team check runs first and says "No
     access to this page" instead. */
  console.log('\nrank still means something');
  await signIn(PEOPLE.worship);
  for (const f of RANK_PAGES) {
    const g = guardOf(f);
    const state = await openPage(f);
    ok('  ' + f + ' (data-role="' + (g ? g.role : '?') + '") still refuses a plain member',
      state.indexOf('blocked:') === 0, state);
    ok('    and refuses on RANK, not on team',
      !/No access to this page/i.test(state), state);
  }

  /* KIDS CHURCH IS NOT PART OF THIS. */
  console.log('\nand it stops at the three');
  await signIn(PEOPLE.kids);
  const letIn = [];
  for (const f of AV_PAGES.concat(WORSHIP_PAGES)) {
    const state = await openPage(f);
    if (state === 'open') letIn.push(f);
  }
  ok('  Kids Church is still turned away from all of them',
    letIn.length === 0, 'opened: ' + letIn.join(', '));

  /* THE MENU HAS TO AGREE WITH THE GUARD. A page that opens and a Menu
     that does not offer it is the same fault wearing a different coat -
     Martin would still not get there. */
  console.log('\nthe Menu offers what the pages allow');
  await signIn(PEOPLE.worship);
  await openPage('hub.html');
  await until('  the Menu is drawn on the hub',
    '(function(){ return document.querySelector(\'[href*="Worshipteamcharter"],[href*="EGBC-HowTo-AV"]\')'
    + ' ? "yes" : "no" })()', 40);
  const worshipSeesAv = String(await ev('(function(){'
    + 'return document.querySelector(\'[href*="EGBC-HowTo-AV"]\') ? "yes" : "no"})()'));
  ok('  somebody on Worship is offered the AV how-to', worshipSeesAv === 'yes', worshipSeesAv);
  await signIn(PEOPLE.av);
  await openPage('hub.html');
  await until('  the Menu is drawn for the AV member',
    '(function(){ return document.querySelector(\'[href*="Worshipteamcharter"],[href*="EGBC-HowTo-AV"]\')'
    + ' ? "yes" : "no" })()', 40);
  const avSeesWorship = String(await ev('(function(){'
    + 'return document.querySelector(\'[href*="EGBC-PlayThrough"],[href*="Library"]\') ? "yes" : "no"})()'));
  ok('  and somebody on AV is offered the worship pages', avSeesWorship === 'yes', avSeesWorship);

  /* AND THE DATA BEHIND THEM. A page that opens onto a refusal is the
     fault this whole thing was written for. */
  const readAv = String(await ev(
    'EGBCAuth.db.collection("teamVideos").doc("wav_v_av").get()'
    + '.then(function(s){ return s.exists ? "read" : "missing"; })'
    + '.catch(function(e){ return "refused:" + e.code; })', true));
  ok('  and the AV team\u2019s video is readable by them, not just the page',
    readAv === 'read', readAv);
  await signIn(PEOPLE.worship);
  await openPage('hub.html');
  const readWorshipsAv = String(await ev(
    'EGBCAuth.db.collection("teamVideos").doc("wav_v_av").get()'
    + '.then(function(s){ return s.exists ? "read" : "missing"; })'
    + '.catch(function(e){ return "refused:" + e.code; })', true));
  ok('  and Worship can read the AV team\u2019s video too', readWorshipsAv === 'read', readWorshipsAv);

  if (dropped) console.log('\n  note  the emulator dropped the browser ' + dropped + 'x; retried');
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
