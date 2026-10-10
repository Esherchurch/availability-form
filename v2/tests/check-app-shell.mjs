/* The phone app's shell: spaces, tabs, and the phone itself.
 *
 *   node tests/check-app-shell.mjs            (from v2/, emulators running)
 *   node tests/check-app-shell.mjs --shots
 *
 * WHY. APP-DESIGN-BRIEF §2 and §7 are the two things most likely to rot:
 *
 *   §2  a person sees THEIR OWN teams and no others; never more than four
 *       bottom tabs; no hidden menu
 *   §7  the tabs clear the phone's own navigation, and a tap target is at
 *       least 48px - Martin tapped Groups in the mock-up and closed the app
 *
 * Neither is visible in the source: four tabs is a count, 48px is a measured
 * height, and "their own teams" depends on who is signed in. So this signs in
 * as five different people on a phone-sized screen and measures.
 *
 * It also holds the escaping contract given to the events window (F-130): a
 * name containing a script tag and an apostrophe goes through every helper,
 * and the check fails if either comes out live.
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
const PORT = 9691, SERVE = 8907;
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };

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
/* EACH SEGMENT ENCODED. A team's document id is its NAME as the rules
   spell it - "Kids Church", "Church office" - which is what makes
   teams-as-data cheap, and which means every id has a space in it. Firestore
   is content with that; a URL is not, and the REST call threw outright. The
   compat SDK encodes for itself, so only this harness had to learn. */
const put = (p, obj) => req(8181, 'PATCH',
  DOCS + '/' + p.split('/').map(encodeURIComponent).join('/'),
  { fields: fields(obj) }, { Authorization: 'Bearer owner' });

/* Five people, chosen so that between them they prove every branch of
   "which spaces does this person see". */
/* name matches what is written to users/{uid} below, because the wait
   asks the app who it has drawn for. */
const PEOPLE = {
  attender: { email: 'app.attender@example.invalid', teams: [], adminFor: [],
              spaces: ['me'], note: 'in the address book, on no team' },
  welcome:  { email: 'app.youth@example.invalid', teams: ['Youth Worship'], adminFor: [],
              spaces: ['me', 'youth'], note: 'one team' },
  two:      { email: 'app.two@example.invalid', teams: ['Worship Team', 'Kids Church'], adminFor: [],
              spaces: ['me', 'worship', 'kids'], note: 'two teams' },
  maint:    { email: 'app.maint@example.invalid', teams: ['Maintenance'], adminFor: [],
              spaces: ['me', 'maint'], note: 'the new team' },
  /* NEXT-BRIEF §25 CHANGED WHAT THIS PERSON SEES, and that is the point of
     keeping them. Core Team and "Admin for" used to give the whole Running
     things space; they now give nothing at all, because the church
     administrator may not be on Core Team and a Worship admin should not
     get People and Send for looking after Worship. */
  office:   { email: 'app.office@example.invalid', teams: ['Core Team'], adminFor: ['Kids Church'],
              spaces: ['me', 'kids'], note: 'Core Team, which no longer runs things by itself' },
  /* ...and this is who does: somebody in the Church office group. */
  admin:    { email: 'app.churchoffice@example.invalid', teams: ['Church office'], adminFor: [],
              spaces: ['me', 'office'], note: 'in the Church office group' },
  /* ON EVERY TEAM. Nobody real is, but "does every team space offer its
     own pin board?" cannot be answered by anyone who is not: go() refuses
     a space you are not in, so a person on two teams can only ever prove
     two of them. One person who is on all of them is the only way to see
     all five in one pass. */
  everyteam:{ email: 'app.everyteam@example.invalid',
              teams: ['Worship Team', 'Kids Church', 'Youth Worship', 'Lazers', 'ReNu', 'Maintenance'],
              adminFor: [],
              spaces: ['me', 'worship', 'kids', 'youth', 'lazers', 'renu', 'maint'],
              note: 'on every team there is' },
};

/* The two groups NEXT-BRIEF §25 starts with. A group is a team with
   rota:false, so it needs no second concept anywhere - a person is put in
   one exactly as they are put on a team. */
const GROUPS = {
  'Church office': { runs: ['today', 'people', 'bookings', 'send'] },
  'Bookings':      { runs: ['bookings'] }
};

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const EXPECTED_OFF = ['firebasestorage.googleapis.com'];
const reachedOff = [];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });

  /* The groups go in before anybody signs in, because egbc-auth.js reads
     the teams collection while the page loads. */
  for (const [name, g] of Object.entries(GROUPS)) {
    await put('teams/' + name, {
      name, label: name, colour: '#111827', rota: false, runs: g.runs, archived: false });
  }

  for (const [key, p] of Object.entries(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    /* The wait below asks the app who it has drawn for, so it needs the
       same name that is written to users/{uid} on the next line. Setting it
       here rather than in the table above keeps the two from drifting. */
    p.name = 'App ' + key;
    /* linkedBy admin, so refreshFromBook does not go looking and overwrite. */
    await put('users/' + p.uid, {
      uid: p.uid, email: p.email, name: 'App ' + key, memberId: 'ab_app_' + key,
      status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor,
      masterAdmin: false, attender: true, churchMember: key === 'office' });
    /* THE BOOK CARRIES THE TICK, not just the mirror. The rules check the
       mirror against the book field by field (mirrorsBook), so seeding
       churchMember on one side and not the other makes every page load try
       an update the rules must refuse - which showed up in the emulator's
       own log as a rules evaluation error against users/{uid}, and read at
       first like a fault in the rules rather than in the seeding. */
    await put('addressBook/ab_app_' + key, {
      name: 'App ' + key, email: p.email, markers: p.teams, adminFor: p.adminFor,
      churchMember: key === 'office', archived: false, isMinor: false });
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
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-app-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  /* The emulator losing a browser client, in the two voices it uses. */
  const OFFLINE = /Could not reach Cloud Firestore backend|client is offline|profile load failed/i;
  const offlineNotes = [], offlineWhy = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errs.push((m.params.args || []).map(a => String(a.value || a.description || '')).join(' ').slice(0, 200));
    /* An exception nobody caught is NOT a console.error, so collecting only
       console.error made the loudest kind of failure invisible: a throw in
       the guard leaves its promise pending for ever, the splash stays up,
       and the check saw a quiet console. */
    if (m.method === 'Runtime.exceptionThrown') {
      const d = (m.params.exceptionDetails || {});
      errs.push('uncaught: ' + String((d.exception && (d.exception.description || d.exception.value)) || d.text || '')
        + ' @ ' + String((d.url || '').split('/').pop()) + ':' + (d.lineNumber + 1)).slice(0, 300);
    }
    /* Detection, not blocking: the https patterns above do the blocking, and
       this keeps "nothing reached anywhere off this machine" honest for any
       request that is not https. */
    if (m.method === 'Network.requestWillBeSent') {
      const u = (m.params.request || {}).url || '';
      if (offMachine(u) && !/^https:/i.test(u)) reachedOff.push(u.split('/')[2]);
    }
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) { reachedOff.push(u.split('/')[2]); return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); }
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  /* HTTPS ONLY, and that is the whole of a flake that cost most of a day.
     Pausing every request means pausing Firestore's own stream to the
     emulator, which is http://localhost. Held up in the debugger, the stream
     does not establish, the client gives up after ten seconds with "Could
     not reach Cloud Firestore backend", and the page that was waiting for a
     profile either sits on its splash for ever or shows "Something went
     wrong". Both faces of the flake were reported against the app; neither
     was the app. Everything off this machine is https, so pausing https is
     the whole of what the blocking is for, and Network.requestWillBeSent
     below still sees plain-http traffic if any ever appears. */
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  /* A phone, with a home indicator, because §7 is about the safe area. */
  await send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });

  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    if (!wantShots) return;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'app--' + name + '.png'), Buffer.from(r.data, 'base64'));
  };
  /* Wait for a condition, and say so rather than carrying on. Every fixed
     sleep in this file has been wrong at least once. */
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

  const openAs = async (p) => {
    /* START FROM NO SESSION AT ALL. Firebase keeps the signed-in user in
       IndexedDB for the origin, and the harness page and the app share that
       origin. Signing one person out and the next one in leaves two writes
       racing over one record, and app.html reads whichever landed: usually
       the new person, sometimes the old one - whose token signOut has just
       revoked. That is both faces of the flake this check kept showing. One
       person per cleared origin has no race in it. */
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await send('Storage.clearDataForOrigin', {
      origin: 'http://localhost:' + SERVE,
      storageTypes: 'indexeddb,local_storage,cache_storage,websql,service_workers' });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    /* The harness page pulls three scripts off gstatic. 3200ms was usually
       enough; when it was not, signOut and signIn both threw "firebase is
       not defined", the previous person stayed signed in, and the check
       measured the wrong person without a word. */
    await until('the sign-in harness loaded for ' + p.name,
      '(typeof firebase === "undefined" || typeof EGBCAuth === "undefined") ? "no" : "yes"');
    await ev('firebase.auth(EGBCAuth.app).signOut().catch(function(){})', true);
    await until('the previous person is signed out before ' + p.name + ' signs in',
      'firebase.auth(EGBCAuth.app).currentUser ? "no" : "yes"');
    await ev('window.__in = firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
      + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').then(function () { return "ok"; })'
      + '.catch(function (e) { return "failed " + e.code; })', true);
    /* ASSERT THE SIGN-IN TOOK, which every other browser check in this
       folder does and this one did not. Navigating on the strength of an
       unchecked promise is how a person who never signed in came out as
       "sees no spaces" - a fault reported against the app, in the check. */
    await until('signed in as ' + p.name + ' before opening the app',
      'firebase.auth(EGBCAuth.app).currentUser'
      + ' && firebase.auth(EGBCAuth.app).currentUser.uid === ' + JSON.stringify(p.uid)
      + ' ? "yes" : "no"');
    /* Firebase writes the session to IndexedDB, and the promise above
       resolves before that write lands. Navigate too soon and the app sees a
       user it cannot get a token for: signed in, no profile, splash up for
       ever. Waiting for a usable token is waiting for the thing the app
       needs, rather than for a number of milliseconds. */
    await until('that session carries a working token',
      'firebase.auth(EGBCAuth.app).currentUser.getIdToken().then(function (t) '
      + '{ return t ? "yes" : "no"; }).catch(function () { return "no"; })', 20);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
    /* WAIT FOR THE APP TO DRAW, not for a number of seconds. The first
       version slept 7000ms and the first person passed while the next four
       reported "no spaces at all" - the app was fine and the check was
       early. Signing out and in again on the harness page makes the second
       load slower than the first, which a fixed sleep cannot know. A-049,
       for the fourth time: wait for the condition. */
    /* WAIT UNTIL IT HAS DRAWN FOR THIS PERSON, not until a .tab exists.
       Waiting for an element is not enough: between a navigate and its
       commit the PREVIOUS page's DOM is still there, so .tab can be the
       last person's. The run went green once and then failed on two
       different people the next time, which is what an intermittent wait
       looks like. Asking the app who it thinks is signed in cannot be
       answered by a stale page. */
    /* draw() stamps #egbc-app with the uid it drew for. Waiting for
       EGBCApp.who().name was not enough either: the profile is live in the
       page before draw() has run again with it, so the stamp - which only a
       render can write - is the only honest signal. */
    /* RELOAD ONLY FOR THE ONE FAILURE THAT IS NOT THE APP'S. The Firestore
       emulator intermittently leaves a new browser client unable to open a
       stream: the SDK gives up with "Could not reach Cloud Firestore
       backend" and the first get() fails "client is offline", so the guard
       either waits for a profile that never comes or shows "Something went
       wrong". Six of eight runs failed on it, every time against a page the
       app had drawn correctly moments before.
       The reload is deliberately narrow. It happens only when the page has
       SAID it could not reach the backend; any other failure to draw fails
       the check at once, because a retry that forgives everything forgives
       the thing this check exists to catch. */
    let drawn = "", offlineReloads = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = errs.length;
      for (let i = 0; i < 40; i++) {
        await sleep(500);
        drawn = String(await ev(
          '(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
          + '.getAttribute("data-drawn") || ""'));
        if (drawn.indexOf(p.uid + ":") === 0) break;
      }
      if (drawn.indexOf(p.uid + ":") === 0) break;
      /* ASK THE PAGE WHETHER IT CAN REACH FIRESTORE AT ALL. Matching on the
         console was not enough: office's failure announces itself ("client
         is offline"), maint's is silent - the first get() neither resolves
         nor rejects, so the splash stays up with a quiet console. A read
         that will not complete in six seconds against an emulator on this
         machine is the connection, not the app. If it DOES complete, the app
         had every chance to draw and did not, and that fails here and now. */
      /* THE FINGERPRINT OF A DROPPED CONNECTION, which is not the same as an
         app that drew wrongly. The guard puts a splash over the page and
         takes it down when it has a profile. Splash still up, signed in, no
         profile, means the guard's first read never came back - the page is
         stuck on the connection and will stay stuck, because nothing in it
         retries (A-063). Anything else - splash gone, profile in hand, and
         still not drawn - is the app's own fault and fails here, which is
         what this check is for. */
      const stuck = String(await ev(
        '(!!document.getElementById("egbc-guard-splash")'
        + ' && typeof EGBCAuth !== "undefined" && !!EGBCAuth.user() && !EGBCAuth.profile())'
        + ' ? "stuck" : "drawn-wrong"'));
      if (stuck !== 'stuck') break;
      /* Evidence for the note: is it the connection, as claimed? */
      const reach = String(await ev(
        'Promise.race([ firebase.firestore(EGBCAuth.app).collection("users")'
        + '.doc(' + JSON.stringify(p.uid) + ').get().then(function () { return "reachable"; })'
        + '.catch(function (e) { return "unreachable:" + e.code; }),'
        + ' new Promise(function (r) { setTimeout(function () { r("unreachable:timeout"); }, 6000); }) ])',
        true));
      offlineWhy.push(p.name + ' stuck on the splash, probe says ' + reach
        + (OFFLINE.test(errs.slice(before).join(' ')) ? ', console agrees' : ''));
      offlineReloads++;
      offlineNotes.push(p.name);
      await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
    }
    if (offlineReloads) console.log("  note  " + p.name + " could not reach the emulator "
      + offlineReloads + "x (" + offlineWhy.join("; ") + "); reloaded");
    /* A wait that times out must say so. The run before this one went green
       because the wait never matched, fell through to its full 20 seconds
       and measured a page that had caught up by then - a pass for the wrong
       reason, which is the same bug this check exists to catch. */
    if (drawn.indexOf(p.uid + ":") !== 0) {
      /* Say WHERE it was, not just that it did not draw. The first version
         of this message said only "data-drawn: (none)", which is equally
         true of an app that failed to draw and of a page that is not the
         app at all - and it was the second. */
      const diag = await ev('JSON.stringify({ href: location.href, ready: document.readyState, '
        + 'app: !!document.getElementById("egbc-app"), splash: !!document.getElementById("egbc-guard-splash"), '
        + 'blocked: document.body ? (document.body.getAttribute("data-egbc-blocked") || "") : "(no body)", '
        + 'who: (typeof EGBCApp === "undefined") ? "(no EGBCApp)" : EGBCApp.who().name, '
        + 'firebase: typeof firebase, EGBCAuth: typeof EGBCAuth, EGBCApp: typeof EGBCApp, '
        + 'signedIn: (typeof EGBCAuth === "undefined" || !EGBCAuth.user()) ? "no" : "yes", '
        + 'scripts: Array.from(document.scripts).map(function (x) { return (x.src || "inline").split("/").pop(); }).join(" ") })');
      ok("the app drew for " + p.name + " within 20s", false,
        "data-drawn: " + (drawn || "(none)") + "  " + diag
        + "  console: " + JSON.stringify(errs.slice(-4)));
    }
    return drawn;
  };
  const spacesOnScreen = async () => String(await ev(
    'Array.from(document.querySelectorAll(".space")).map(b => b.dataset.space).join(",")'));
  const tabsOnScreen = async () => String(await ev(
    'Array.from(document.querySelectorAll(".tab")).map(b => b.dataset.tab).join(",")'));

  /* ---- §2: a person sees their own teams and no others -------------- */
  console.log('\nwhich spaces each person sees (§2)');
  for (const [key, p] of Object.entries(PEOPLE)) {
    await openAs(p);
    /* Check the page is the app before measuring anything on it. "Gets in"
       is "the guard did not block me", and an unrelated page has no blocked
       attribute either - so without this line the assertion below passed on
       the sign-in harness, which is exactly how it passed for maint. */
    const href = String(await ev("location.href"));
    ok(key + ' is actually on the app page', href.split('?')[0].split('#')[0].endsWith('/app.html'), href);
    const blocked = String(await ev('document.body.getAttribute("data-egbc-blocked") || ""'));
    ok(key + ' (' + p.note + ') gets in', blocked === '', blocked);
    if (p.spaces.length === 1) {
      /* Somebody on no team gets NO row of spaces, not an empty one. */
      ok('  and sees no row of spaces at all, being on no team',
        (await ev('document.querySelectorAll(".spaces").length')) === 0,
        await spacesOnScreen());
    } else {
      const seen = await spacesOnScreen();
      ok('  sees exactly ' + p.spaces.join(', '), seen === p.spaces.join(','), 'saw: ' + seen);
    }
    await shot('spaces-' + key);
  }

  /* ---- §2: never more than four tabs, and no empty tabs ------------- */
  console.log('\nthe tabs (§2)');
  /* The person with the most spaces and tabs, which under §25 is whoever
     is in the Church office group rather than whoever is on Core Team. */
  await openAs(PEOPLE.admin);
  const everySpace = JSON.parse(String(await ev(`JSON.stringify((() => {
    const out = {};
    for (const k of EGBCApp.spacesFor(EGBCApp.who())) out[k] = EGBCApp.tabsFor(k).map(t => t[0]);
    return out;
  })())`)));
  ok('no space has more than four tabs',
    Object.values(everySpace).every(t => t.length <= 4), JSON.stringify(everySpace));
  ok('and none has none', Object.values(everySpace).every(t => t.length >= 1), JSON.stringify(everySpace));
  ok('every tab drawn has a screen behind it', (await ev(`(() => {
    const drawn = Array.from(document.querySelectorAll('.tab')).map(b => b.dataset.tab);
    const have = EGBCApp.tabsFor(EGBCApp.state().space).map(t => t[0]);
    return drawn.length === have.length && drawn.every((t, i) => t === have[i]);
  })()`)) === true, await tabsOnScreen());
  ok('there is no hidden menu anywhere in the app',
    (await ev('document.body.innerText.indexOf("\\u2630")')) === -1);

  /* ---- every team space offers ITS OWN board -------------------------
     Kids Church had no "Pin boards" row at all - a leftover from the board
     being leaders-only - so the people the board is for had no way to it
     from the app. Every other team space had one, which is exactly the
     shape of fault a per-space check finds and a spot check does not.

     IT CHECKS THE BOARD IS THE RIGHT ONE, not merely that a row exists: a
     row pointing at another team's board is worse than none, and that is
     what the page used to do when nothing matched (check-board-queue). */
  console.log('\nevery team space offers its own pin board');
  await openAs(PEOPLE.everyteam);
  const BOARD_OF = { worship: 'worship', kids: 'kids', youth: 'youth',
                     lazers: 'lazers', renu: 'renu' };
  const boards = JSON.parse(String(await ev(`JSON.stringify((() => {
    const out = {};
    for (const k of Object.keys(${JSON.stringify(BOARD_OF)})) {
      if (!EGBCApp.has(k, 'team')) continue;
      EGBCApp.go(k, 'team');
      const html = (document.getElementById('egbc-content') || {}).innerHTML || '';
      const m = html.match(/stickynotes\\.html\\?board=([a-z-]+)/);
      out[k] = m ? m[1] : '(no row)';
    }
    return out;
  })())`)));
  /* The sweep account is on every team, so every one of these must answer.
     A space missing from the result is a space with no Team tab, which is
     itself worth failing on. */
  for (const [space, board] of Object.entries(BOARD_OF)) {
    ok('  ' + space + ' offers the ' + board + ' board',
      boards[space] === board, 'it offers: ' + (boards[space] || '(no Team tab at all)'));
  }

  /* ---- "I'm worried about someone", on every space (§24) -------------
     Martin asked for it on EVERY version of the app, and a button in the
     top bar is only on every space if every space is actually looked at.
     Counting it once on Home would pass while four spaces had none. */
  console.log('\n"Worried?" is on every space (§24)');
  const worryEverywhere = JSON.parse(String(await ev(`JSON.stringify((() => {
    const out = {};
    for (const k of EGBCApp.spacesFor(EGBCApp.who())) {
      EGBCApp.go(k);
      const b = document.querySelector('.worry');
      out[k] = !!b && (b.getAttribute('data-act') || '') === 'open:worried.html'
               && (b.innerText || '').trim().length > 0;
    }
    return out;
  })())`)));
  ok('every space this person has offers it',
    Object.values(worryEverywhere).length > 1
      && Object.values(worryEverywhere).every(Boolean), JSON.stringify(worryEverywhere));
  ok('  and it says a word, rather than being a bare heart',
    /Worried/i.test(String(await ev("(document.querySelector('.worry')||{}).innerText || ''"))),
    await ev("(document.querySelector('.worry')||{}).innerText || ''"));
  ok('  at a size a finger can land on', (await ev(
    "(() => { const b = document.querySelector('.worry');"
    + " return b ? Math.round(b.getBoundingClientRect().height) : 0; })()")) >= 44,
    await ev("(() => { const b = document.querySelector('.worry');"
      + " return b ? Math.round(b.getBoundingClientRect().height) : 0; })()"));

  /* ---- the events window's screens are really mounted (F-141) --------
     Adding fifteen script tags and a mountAll() call looks finished whether
     or not a single screen arrived: "every tab drawn has a screen behind
     it" passes just as happily when the shell's own interim rows are all
     there is. So this asks for the screens BY NAME.

     It is written as what each space must offer, not as a count, because a
     count passes when the wrong screen is mounted. */
  console.log('\nthe events window\'s screens (F-141)');
  ok('its mounting file loaded', (await ev('typeof EGBCAppEvents')) === 'object');
  const mounted = JSON.parse(String(await ev(`JSON.stringify({
    kids: ['today','children'].filter(t => EGBCApp.has('kids', t)),
    me: ['whatson','listen'].filter(t => EGBCApp.has('me', t)),
    maint: ['jobs','rooms'].filter(t => EGBCApp.has('maint', t)),
    office: ['bookings'].filter(t => EGBCApp.has('office', t))
  })`)));
  ok('  Kids Church has Today and Children',
    mounted.kids.join(',') === 'today,children', JSON.stringify(mounted.kids));
  ok("  Me has What's on and Listen",
    mounted.me.join(',') === 'whatson,listen', JSON.stringify(mounted.me));
  ok('  Maintenance has Jobs and Rooms',
    mounted.maint.join(',') === 'jobs,rooms', JSON.stringify(mounted.maint));
  ok('  Running things has Bookings',
    mounted.office.join(',') === 'bookings', JSON.stringify(mounted.office));
  /* Martin tapped Listen in the mock-up and it was not there (stage 1 took
     the row out on purpose). It comes back only when the screen does, and
     this is what says so. */
  ok('  Home offers Listen again, now there is something behind it',
    String(await ev(`(() => { EGBCApp.go('me','home');
      return (document.getElementById('egbc-content')||{}).innerHTML || ''; })()`)).includes('tab:listen'),
    'the Home screen has no Listen row');

  /* ---- a watcher is started once per screen, not once per draw -------
     F-141.2: draw() used to stop and restart the watcher every time,
     including the redraws refresh() itself causes - so a screen that
     redraws on new data looped. The events window worked around it by not
     using watch() at all, which is a workaround and not a fix. */
  console.log('\nwatch() survives a redraw (F-141.2)');
  const watchStory = JSON.parse(String(await ev(`JSON.stringify((() => {
    let started = 0, stopped = 0;
    /* START FROM SOMEWHERE ELSE. The first version registered the probe
       while the app was already showing me/home, so going there changed
       nothing and the watcher never started - which read as the fix being
       broken when it was the probe. */
    EGBCApp.go('me', 'whatson');
    EGBCApp.screen('me', 'home', () => '<p>probe</p>', () => { started++; return () => { stopped++; }; });
    EGBCApp.go('me', 'home');
    const afterOpen = started;
    EGBCApp.refresh('me', 'home');
    EGBCApp.refresh('me', 'home');
    EGBCApp.refresh('me', 'home');
    const afterRedraws = started;
    EGBCApp.go('me', 'whatson');
    return { afterOpen, afterRedraws, stoppedOnLeaving: stopped };
  })())`)));
  ok('it starts when the screen opens', watchStory.afterOpen === 1, JSON.stringify(watchStory));
  ok('THREE REDRAWS DO NOT START IT AGAIN', watchStory.afterRedraws === 1,
    'started ' + watchStory.afterRedraws + ' times - a listener that answers on start would loop here');
  ok('and leaving the screen stops it', watchStory.stoppedOnLeaving === 1, JSON.stringify(watchStory));

  /* ---- §7: the phone itself ----------------------------------------- */
  console.log('\nthe phone (§7)');
  ok('viewport-fit=cover is on the page',
    /viewport-fit=cover/.test(String(await ev(
      '(document.querySelector("meta[name=viewport]")||{}).content || ""'))),
    String(await ev('(document.querySelector("meta[name=viewport]")||{}).content || ""')));

  const tabBox = JSON.parse(String(await ev(`JSON.stringify((() => {
    const t = document.querySelector('.tab');
    const nav = document.querySelector('.tabs');
    if (!t || !nav) return { none: true };
    const r = t.getBoundingClientRect();
    const cs = getComputedStyle(nav);
    /* documentElement.clientHeight, NOT window.innerHeight. Under CDP's
       device metrics override the page lays out at the emulated height while
       innerHeight still reports the real headless window - 844 against 942 -
       so comparing the two said the bar was 98px off the bottom when it was
       exactly on it. The layout viewport is what the bar is bottom of. */
    return { tabHeight: Math.round(r.height), padBottom: cs.paddingBottom,
             navBottom: Math.round(nav.getBoundingClientRect().bottom),
             viewportH: document.documentElement.clientHeight };
  })())`)));
  ok('A TAB IS AT LEAST 48px HIGH', tabBox.tabHeight >= 48, JSON.stringify(tabBox));
  ok('and the bar pads itself below the tabs, clear of the phone\u2019s own navigation',
    parseFloat(tabBox.padBottom) >= 26, JSON.stringify(tabBox));
  ok('the tab bar sits at the bottom of the viewport, not off it',
    Math.abs(tabBox.navBottom - tabBox.viewportH) <= 1, JSON.stringify(tabBox));

  const btn = Number(await ev(`(() => {
    const b = document.querySelector('.btn');
    return b ? Math.round(b.getBoundingClientRect().height) : 0;
  })()`));
  ok('a button a finger lands on is at least 48px too', btn === 0 || btn >= 48, 'button ' + btn + 'px');

  ok('only the middle scrolls, so the tabs never leave the screen',
    (await ev('getComputedStyle(document.getElementById("egbc-content")).overflowY')) === 'auto');

  /* ---- navigation --------------------------------------------------- */
  console.log('\nmoving about');
  /* AS SOMEBODY WHO HAS KIDS CHURCH. This used to run as whoever the
     section above left signed in, which was the Core Team person - and
     §25 took Running things away from them, so the section above now opens
     as the Church office person instead, who is on no team at all. Saying
     who this runs as, rather than inheriting it, is what stops the next
     change to the section above quietly breaking this one. */
  await openAs(PEOPLE.office);
  await ev("EGBCApp.go('kids','team')");
  await sleep(1200);
  ok('switching space and tab works', String(await ev('JSON.stringify(EGBCApp.state())')).includes('"kids"'),
    String(await ev('JSON.stringify(EGBCApp.state())')));
  ok('and the Kids Church team screen offers the register',
    /register/i.test(String(await ev('document.getElementById("egbc-content").innerText'))),
    String(await ev('document.getElementById("egbc-content").innerText')).slice(0, 160));
  await ev("EGBCApp.go('worship','rota')");
  await sleep(1000);
  ok('a space this person is NOT in is refused, silently',
    !String(await ev('JSON.stringify(EGBCApp.state())')).includes('worship'),
    String(await ev('JSON.stringify(EGBCApp.state())')));
  await shot('kids-team');

  /* ---- the escaping contract (F-130) -------------------------------- */
  console.log('\nthe escaping contract given to the events window (F-130)');
  const nasty = `O'Brien <script>window.__pwned=1<\\/script><b>bold</b>`;
  const out = String(await ev(
    'document.body.insertAdjacentHTML("beforeend", \'<div id="esctest">\' + '
    + 'EGBCApp.row("music", ' + JSON.stringify(nasty) + ', ' + JSON.stringify(nasty) + ') + '
    + 'EGBCApp.sec(' + JSON.stringify(nasty) + ', "") + '
    + 'EGBCApp.next("1","Jan",' + JSON.stringify(nasty) + ',' + JSON.stringify(nasty) + ') + '
    + 'EGBCApp.head(' + JSON.stringify(nasty) + ',' + JSON.stringify(nasty) + ') + '
    + '\'</div>\'), "done"'));
  ok('the helpers took it', out === 'done', out);
  ok('NO SCRIPT RAN', (await ev('typeof window.__pwned')) === 'undefined');
  /* NOT querySelectorAll('script,b'): row() wraps every title in a <b> of
     its own, so that counted my own markup and failed on a correct result.
     What matters is that nothing from the DATA became an element - so look
     for a script tag, and for a <b> whose text is the injected word. */
  ok('no tag from the data survived as a tag', (await ev(`(() => {
    const el = document.getElementById('esctest');
    const scripts = el.querySelectorAll('script').length;
    const injected = Array.from(el.querySelectorAll('b')).filter(b => b.textContent === 'bold').length;
    return scripts === 0 && injected === 0;
  })()`)) === true, String(await ev('document.getElementById("esctest").innerHTML')).slice(0, 200));
  /* textContent, not innerText: the test div is appended outside the app's
     grid and is not laid out, and innerText of an unrendered element is ''. */
  ok('and the words are still readable, apostrophe and all',
    /O'Brien/.test(String(await ev('document.getElementById("esctest").textContent'))),
    String(await ev('document.getElementById("esctest").textContent')).slice(0, 120));
  ok('an invented action is dropped rather than put in the attribute',
    (await ev('EGBCApp.row("music","t","s",null,"javascript:alert(1)").indexOf("data-act")')) === -1);
  ok('and a made-up icon name becomes a safe one',
    (await ev('EGBCApp.ic("\\" onload=\\"x").indexOf("onload")')) === -1,
    String(await ev('EGBCApp.ic("\\" onload=\\"x")')));

  console.log('\nthe console, and where the app went');
  /* The emulator dropping a client is excluded, and SAID OUT LOUD rather
     than quietly filtered - a filter nobody can see is how an excuse
     becomes permanent. Everything else still fails the check. */
  const real = errs.filter(e => !/Logo fetch failed|storage\/object-not-found|cdn\.tailwindcss/i.test(e)
    && !OFFLINE.test(e));
  if (offlineNotes.length) console.log('  note  the Firestore emulator dropped the page '
    + offlineNotes.length + ' time(s) (' + [...new Set(offlineNotes)].join(', ')
    + '); those console messages are excluded, see A-062');
  ok('no errors on the console', real.length === 0, JSON.stringify(real).slice(0, 300));
  const unexpected = [...new Set(reachedOff)].filter(h => !EXPECTED_OFF.includes(h));
  ok('nothing reached anywhere off this machine that is not accounted for',
    unexpected.length === 0, unexpected.join(', '));

  server.close(); chrome.kill(); ws.close();
  const failed = R.filter(v => !v).length;
  console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
