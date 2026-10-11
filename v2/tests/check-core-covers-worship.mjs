/* CORE TEAM OPENS EVERY WORSHIP & AV PAGE.
 *
 *   node tests/check-core-covers-worship.mjs          (from v2/, emulators up)
 *   node tests/check-core-covers-worship.mjs --shots
 *
 * WHY. Martin, 11 Oct 2026: "core team cant see worship and AV". Viewing as
 * Core Team, Library.html said "This page is for Worship, and you are not on
 * that team". On the old portal the Core Team link showed every Worship & AV
 * item plus Core's own, so that was a regression, not a rule.
 *
 * The fix is one cover list - CORE_COVERS in egbc-auth.js - read by
 * EGBCAuth.inTeam, which the guard, the Menu and the app's spaces all ask.
 * This check is what stops it coming back, and it is deliberately NOT a
 * grep: it opens every page that carries data-team and reads what the
 * person actually gets.
 *
 * THE LIST OF PAGES IS READ OFF THE PAGES THEMSELVES, not typed here. A
 * worship page added next month is walked without anybody remembering to
 * add it, which is the whole point of "so this can't come back".
 *
 * IT CHECKS BOTH DIRECTIONS. A Core Team person opens the worship pages; a
 * page that is nobody's business of theirs - Youth Worship - still turns
 * them away. A cover that covers everything is not a cover.
 *
 * Synthetic people throughout.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9647, SERVE = 8883;
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';

/* The cover, as egbc-auth.js states it. Read out of the file rather than
   retyped: if somebody changes CORE_COVERS, this check must move with it or
   say why it cannot. */
const AUTH = fs.readFileSync(path.join(V2, 'egbc-auth.js'), 'utf8');
const COVERS = (function () {
  const m = /var CORE_COVERS = \[([^\]]*)\]/.exec(AUTH);
  if (!m) {
    console.error('Could not find CORE_COVERS in egbc-auth.js - has it been renamed?');
    process.exit(1);
  }
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
})();

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')));
};

/* ---- which pages are guarded, and on what ---------------------------- */
const PAGES = fs.readdirSync(V2).filter(f => f.endsWith('.html')).map(f => {
  const t = fs.readFileSync(path.join(V2, f), 'utf8');
  const g = /<script[^>]*egbc-guard\.js[^>]*>/i.exec(t);
  if (!g) return null;
  const team = /data-team="([^"]*)"/i.exec(g[0]);
  if (!team) return null;
  const role = /data-role="([^"]*)"/i.exec(g[0]);
  return { file: f, teams: team[1].split(',').map(s => s.trim()).filter(Boolean),
           role: role ? role[1] : '' };
}).filter(Boolean);

/* Core Team's own name counts too - a page marked data-team="Core Team" is
   theirs outright, cover or no cover. */
const OPENS = ['Core Team'].concat(COVERS);
const forCore = PAGES.filter(p => p.teams.some(t => OPENS.indexOf(t) !== -1));
const notForCore = PAGES.filter(p => !p.teams.some(t => OPENS.indexOf(t) !== -1));

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

/* TWO PEOPLE, because the fault reached Martin one way and lands on the
   church the other.
     master  - a master admin who is on NO worship team, viewing as Core
               Team. isMaster() is false under view-as, so this really does
               test the cover and not his master key. This is how Martin
               found it.
     core    - somebody whose only team is Core Team, signed in as
               themselves. This is who it is actually for. */
const PEOPLE = {
  master: { email: 'cov.master@example.invalid', name: 'Cov Master',
            teams: ['Core Team'], masterAdmin: true, viewAs: 'Core Team' },
  core:   { email: 'cov.core@example.invalid', name: 'Cov Core',
            teams: ['Core Team'], masterAdmin: false, viewAs: '' }
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
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });

  console.log('CORE_COVERS, read out of egbc-auth.js: ' + COVERS.join(', '));
  console.log(forCore.length + ' guarded pages Core Team should open, '
    + notForCore.length + ' that are not theirs\n');
  ok('the pages were found by reading them, and there are some',
    forCore.length >= 10, forCore.length + ' found - has data-team been renamed?');

  for (const [key, p] of Object.entries(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await put('users/' + p.uid, {
      uid: p.uid, email: p.email, name: p.name, memberId: 'ab_cov_' + key,
      status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: [],
      masterAdmin: p.masterAdmin, attender: true, churchMember: false });
    await put('addressBook/ab_cov_' + key, {
      name: p.name, email: p.email, markers: p.teams, adminFor: [],
      churchMember: false, archived: false, isMinor: false });
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

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-cov-' + process.pid),
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
  /* https only - pausing http breaks Firestore's own stream to the
     emulator, and then every page below fails on the connection rather
     than on the thing being measured (A-062). */
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };
  const until = async (what, expr, tries = 40) => {
    let last = '';
    for (let i = 0; i < tries; i++) {
      await sleep(400);
      last = String(await ev(expr, true));
      if (last === 'yes') return true;
    }
    ok(what, false, 'gave up after ' + ((tries * 400) / 1000) + 's, last: ' + last);
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
    await until('the session carries a working token',
      'firebase.auth(EGBCAuth.app).currentUser.getIdToken().then(function(t){return t?"yes":"no"})'
      + '.catch(function(){return "no"})', 20);
  };

  /* sessionStorage is per origin and survives navigation inside it, so the
     view-as is set once on the harness page and every page below reads it -
     exactly as it works for Martin when he picks a team from the bar. */
  const setViewAs = async (team) => {
    await ev(team
      ? 'sessionStorage.setItem("egbc_view_as", JSON.stringify({ team: '
        + JSON.stringify(team) + ', role: "member" })); "set"'
      : 'sessionStorage.removeItem("egbc_view_as"); "cleared"');
  };

  /* What a person actually got. The guard hides the body until it knows,
     then either reveals it or replaces it and stamps data-egbc-blocked with
     the title - so this reads the stamp, not the words on the screen. */
  let dropped = 0;
  const openPage = async (file) => {
    /* THE EMULATOR DROPS A BROWSER CLIENT NOW AND AGAIN (A-062/A-063), and
       it looks like a refusal if you only read the end state: the guard's
       first read never comes back, so the splash stays up for ever
       (splash up, signed in, no profile) or the page shows "Something went
       wrong". It cost a morning here already, reported as a Core Team
       fault on three pages that are fine.
       The retry is deliberately narrow - only that fingerprint, only three
       times, and it is counted and printed. Any other failure to settle
       fails on the spot, because a retry that forgives everything forgives
       the thing this check is for. */
    for (let attempt = 0; attempt < 3; attempt++) {
      const state = await openOnce(file);
      if (state.indexOf('blocked:Something went wrong') !== 0
          && state.indexOf('never settled') !== 0) return state;
      /* ASK THE PAGE WHETHER IT CAN REACH FIRESTORE AT ALL, rather than
         matching on "no profile yet". That narrower fingerprint missed
         this one: MonitorStageMap sat on the splash with the profile
         already in hand, because the read the GUARD is waiting on never
         came back while another path had filled the profile in. The
         honest question is not which fields are set, it is whether the
         emulator is answering this client. A read that will not finish
         in six seconds against an emulator on this machine is the
         connection; one that finishes is the page's own fault, and that
         still fails here. */
      const reach = String(await ev(
        'Promise.race([ EGBCAuth.db.collection("users").limit(1).get()'
        + '.then(function(){ return "reachable"; })'
        + '.catch(function(e){ return "unreachable:" + e.code; }),'
        + ' new Promise(function(r){ setTimeout(function(){ r("unreachable:timeout"); }, 6000); }) ])',
        true));
      const stuck = reach.indexOf('unreachable') === 0 ? 'dropped' : 'its own fault';
      if (stuck !== 'dropped' || attempt === 2) return state + ' [' + reach + ']';
      dropped++;
    }
    return 'never settled';
  };

  /* 30 SECONDS, NOT 16. MonitorStageMap and schematic pull a SECOND
     Firebase SDK (10.7.1, modular) off gstatic before their own script
     runs, and under the debugger's request interception that is slower
     than it is in a browser. At 16s this check reported MonitorStageMap as
     refused to a Core Team member, which it is not: opened by hand with
     the console on, it reveals and EGBCAuth.inTeam('AV Team') is true. A
     budget that is too small does not say "too small", it says "your fix
     is broken", and that is a morning. */
  const openOnce = async (file) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + file });
    for (let i = 0; i < 75; i++) {
      await sleep(400);
      const state = String(await ev(
        '(function(){ if(!document.body) return "loading";'
        + ' var b = document.body.getAttribute("data-egbc-blocked");'
        + ' if (b) return "blocked:" + b;'
        + ' if (document.getElementById("egbc-guard-splash")) return "checking";'
        + ' return "open"; })()'));
      if (state.indexOf('blocked:') === 0 || state === 'open') return state;
    }
    /* SAY WHERE IT WAS. "never settled" is equally true of a page the
       guard refused to finish and a page that is not there at all, and
       the difference is the whole of the next hour. */
    const why = await ev('JSON.stringify({ href: location.href, ready: document.readyState,'
      + ' splash: !!document.getElementById("egbc-guard-splash"),'
      + ' signedIn: (typeof EGBCAuth === "undefined" || !EGBCAuth.user()) ? "no" : "yes",'
      + ' profile: (typeof EGBCAuth === "undefined" || !EGBCAuth.profile()) ? "no" : "yes",'
      + ' EGBCAuth: typeof EGBCAuth, firebase: typeof firebase })');
    return 'never settled ' + why;
  };

  for (const key of ['master', 'core']) {
    const p = PEOPLE[key];
    const how = p.viewAs ? 'a master admin VIEWING AS Core Team' : 'somebody whose only team is Core Team';
    console.log('\n' + how + ':');
    await signIn(p);
    await setViewAs(p.viewAs);

    if (p.viewAs) {
      /* The master key must be OFF, or every page below passes for the
         wrong reason and this check proves nothing. */
      await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
      await until('the harness is back', 'typeof EGBCAuth === "undefined" ? "no" : "yes"');
      await until('and the profile has loaded',
        'EGBCAuth.onReady ? EGBCAuth.onReady().then(function(){return "yes"}) : "yes"', 30);
      const stillMaster = await ev('EGBCAuth.isMaster() ? "yes" : "no"');
      ok('  viewing as Core Team really does put the master key away',
        stillMaster === 'no', 'isMaster() says ' + stillMaster);
    }

    /* TWO GATES, AND ONLY ONE OF THEM IS THE COVER. data-team asks "is
       this your team"; data-role asks "are you a leader or an admin of
       it". Core Team covering Worship & AV says nothing about rank, and
       three pages here are admin- or leader-only - churchshow, data-tools
       and EmailBuilder2. Demanding those open for a plain member would be
       asking this check to prove something nobody decided.
       So they are still walked, and the claim is the sharper one: the
       refusal must be about RANK, never about TEAM. If the cover broke,
       the team check runs first and they would say "No access to this
       page" instead - which is exactly what Martin saw on Library. */
    let opened = 0; const refused = [];
    const plain = forCore.filter(p2 => !p2.role);
    const ranked = forCore.filter(p2 => p2.role);
    for (const page of plain) {
      const state = await openPage(page.file);
      if (state === 'open') { opened++; continue; }
      refused.push(page.file + ' -> ' + state);
    }
    ok('  every Worship & AV page opens (' + opened + '/' + plain.length + ')',
      refused.length === 0, refused.join('\n          '));

    const wrongReason = [];
    for (const page of ranked) {
      const state = await openPage(page.file);
      /* Open is fine - this person may well have the rank. What is not
         fine is being turned away for not being on the team. */
      if (state === 'open') continue;
      if (state.indexOf('blocked:Not enough permissions') !== 0) {
        wrongReason.push(page.file + ' (' + page.teams.join('/') + ', needs ' + page.role + ') -> ' + state);
      }
    }
    ok('  and the ' + ranked.length + ' admin/leader pages turn them away on RANK, not on team',
      wrongReason.length === 0, wrongReason.join('\n          '));

    /* THE CHURCH EMAIL, BY NAME (Martin, 11 Oct 2026: "ANYONE on Core
       Team, as on the old portal"). It is in the list above now that
       data-role="leader" has gone from its guard, and it would be
       counted there silently - but it was refused to Core Team for a
       second reason that the list above cannot see, so it gets its own
       line. If somebody puts the role back, this says which page. */
    const eb = PAGES.filter(p2 => p2.file === 'EmailBuilder2.html')[0];
    ok('  EmailBuilder2 asks for Core Team and nothing more',
      !!eb && eb.teams.join(',') === 'Core Team' && !eb.role,
      eb ? ('team=' + eb.teams.join(',') + ' role=' + (eb.role || '(none)')) : 'not guarded at all');
    const ebState = await openPage('EmailBuilder2.html');
    ok('  and a Core Team member opens it', ebState === 'open', ebState);
    /* AND THE DRAFTS BEHIND THE DOOR. A page that opens onto data the
       rules refuse is the same fault one step further in, and it is the
       one that would have been left: emailDrafts was isAdmin(). Asked
       the way the page asks it, from inside the page. */
    const drafts = String(await ev(
      'EGBCAuth.db.collection("emailDrafts").limit(1).get()'
      + '.then(function(){ return "read"; })'
      + '.catch(function(e){ return "refused: " + e.code; })', true));
    ok('  and can read the drafts behind it', drafts === 'read', drafts);
    const wrote = String(await ev(
      'EGBCAuth.db.collection("emailDrafts").doc("_walk_check").set('
      + '{ subject: "walk check", updatedBy: "check-core-covers-worship", updatedAt: "now" })'
      + '.then(function(){ return EGBCAuth.db.collection("emailDrafts").doc("_walk_check").delete(); })'
      + '.then(function(){ return "wrote"; })'
      + '.catch(function(e){ return "refused: " + e.code; })', true));
    ok('  and write one, which is the whole job', wrote === 'wrote', wrote);

    /* THE OTHER DIRECTION. A cover that lets Core Team into everything is
       not a cover, it is a master key with a different name. */
    const wrongly = [];
    for (const page of notForCore) {
      const state = await openPage(page.file);
      if (state.indexOf('blocked:') !== 0) wrongly.push(page.file + ' -> ' + state);
    }
    if (notForCore.length) {
      ok('  and a page that is not theirs still turns them away ('
        + notForCore.map(p2 => p2.teams.join('/')).join(', ') + ')',
        wrongly.length === 0, wrongly.join('\n          '));
    }

    /* THE MENU AND THE APP MUST AGREE WITH THE GUARD. A page that opens
       and a Menu that does not offer it is the same fault wearing a
       different coat - Martin would still not get there. */
    await openPage('hub.html');
    /* Wait for the Menu to be drawn, not for a second and a half. The
       fixed sleep passed four times and failed the fifth, which is what a
       fixed sleep always does in the end. */
    const menuExpr = '(function(){ return (document.body && /Worship & AV/.test(document.body.innerText))'
      + ' || !!document.querySelector(\'[href*="Worshipteamcharter"]\') ? "yes" : "no" })()';
    await until('  the Menu is drawn on the hub',
      '(function(){ return document.querySelector(\'[href*="Coreteamcharter"],[href*="view-only-rota"]\')'
      + ' ? "yes" : "no" })()', 40);
    const inMenu = await ev(menuExpr);
    ok('  the Menu offers Worship & AV', String(inMenu) === 'yes', inMenu);

    const state = await openPage('app.html');
    await sleep(2500);
    const spaces = String(await ev(
      '(typeof EGBCApp === "undefined") ? "(no app)" : EGBCApp.spacesFor(EGBCApp.who()).join(",")'));
    ok('  the phone app gives them the Worship & AV space',
      spaces.split(',').indexOf('worship') !== -1, 'app said: ' + spaces + ' (' + state + ')');
    if (wantShots && key === 'master') {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      if (r.data) fs.writeFileSync(path.join(SHOTS, 'core-covers--app.png'), Buffer.from(r.data, 'base64'));
    }
  }

  if (dropped) console.log('\nnote  the emulator dropped the browser client '
    + dropped + 'x (A-062); those pages were opened again');
  if (wantShots) console.log('\nscreenshots in tests/shots/');
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
