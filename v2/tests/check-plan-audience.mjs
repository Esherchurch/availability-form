/* Everyone on the Sunday plan email can open the plan.
 *
 *   node tests/check-plan-audience.mjs      (from v2/, emulators up)
 *
 * MARTIN, 12 Oct 2026: "EVERYONE ON THE SUNDAY PLAN EMAIL CAN SEE THE
 * PLAN — That includes the preachers and service leader." The email's
 * summary link goes to song-summary.html, which was guarded on Worship
 * Team, so a preacher who is on no team got "No access" from their own
 * email.
 *
 * TWO HALVES, AND BOTH HAVE TO BE TRUE:
 *   the PAGE lets them reach it (no data-team any more), and
 *   the RULES let them read it (their uid is in that plan's audience).
 * Either one alone is the same fault wearing a different coat - a page
 * that opens onto a refusal, or a refusal before the page.
 *
 * firestore-rules.test.mjs proves the rule in isolation. This proves the
 * thing Martin described: a person, an email link, a screen with the
 * songs on it.
 *
 * AND THAT IT DOES NOT LEAK. Being on one Sunday is not being on the
 * rota, so the same preacher must be refused the NEXT Sunday's plan. A
 * check that only opened their own would pass just as well if the gate
 * had been removed altogether.
 *
 * Synthetic throughout: an invented preacher on no team, an invented AV
 * member, and an invented attender who was never on the email.
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
const PORT = 9727, SERVE = 8943;
const PW = 'test-only-password';

const THEIRS = '2026-11-08';     /* the Sunday they are preaching on */
const OTHER  = '2026-11-15';     /* the one they are not */
const SONG_THEIRS = 'Synthetic Song For Their Sunday';
const SONG_OTHER  = 'Synthetic Song For Another Sunday';

const PEOPLE = {
  /* ON NO TEAM AT ALL. This is the person the whole thing is for: teams
     [], adminFor [], not a master admin, so volunteer() is false and the
     ONLY way in is being named on that Sunday's plan. */
  preacher: { email: 'plan.preacher@example.invalid', name: 'Pat Preacher Synthetic',
              member: 'ab_plan_preacher', teams: [], adminFor: [] },
  av:       { email: 'plan.av@example.invalid', name: 'AV Plan Synthetic',
              member: 'ab_plan_av', teams: ['AV Team'], adminFor: [] },
  /* On no team and on no plan. */
  attender: { email: 'plan.attender@example.invalid', name: 'Attender Plan Synthetic',
              member: 'ab_plan_attender', teams: [], adminFor: [] },
};

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
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) },
  { Authorization: 'Bearer owner' });

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
  for (const [, p] of Object.entries(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await put('users/' + p.uid, {
      uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active',
      linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor, masterAdmin: false,
      attender: true, churchMember: true });
    await put('addressBook/' + p.member, {
      name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor,
      churchMember: true, archived: false, isMinor: false });
  }

  /* THE TWO SUNDAYS. The preacher is on the audience of one and not the
     other, which is the only difference between them. */
  await put('songSummaries/' + THEIRS, {
    date: THEIRS, worshipLeader: 'Leader Synthetic',
    items: [{ type: 'song', idx: 1, title: SONG_THEIRS, keys: ['G'], notes: '', ccli: '' }],
    audience: [PEOPLE.preacher.uid], audienceUnresolved: [] });
  await put('songSummaries/' + OTHER, {
    date: OTHER, worshipLeader: 'Leader Synthetic',
    items: [{ type: 'song', idx: 1, title: SONG_OTHER, keys: ['D'], notes: '', ccli: '' }],
    audience: ['somebody-else-entirely'], audienceUnresolved: [] });

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
      : e === '.css' ? 'text/css' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-plan-' + process.pid),
    '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (watch.handle(m)) return;
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  const ev = makeEval(send, 'plan-audience');

  const signInAs = async (key) => {
    const p = PEOPLE[key];
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await sleep(2500);
    await ev('firebase.auth(EGBCAuth.app).signOut()', true);
    await sleep(300);
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
      + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ')', true);
    await sleep(800);
    const uid = String(await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""'));
    if (uid !== p.uid) {
      console.error('Could not sign in as ' + p.email);
      server.close(); chrome.kill(); process.exit(2);
    }
  };

  /* The guard reveals a page by removing its style element, so that is
     what "open" means - not "no splash yet". */
  const openPlan = async (date) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/song-summary.html?date=' + date });
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      const st = String(await ev(
        '(function(){ if(!document.body) return "loading";'
        + ' var b = document.body.getAttribute("data-egbc-blocked");'
        + ' if (b) return "blocked:" + b;'
        + ' if (document.getElementById("egbc-guard-style")) return "checking";'
        + ' return "open"; })()'));
      if (st.indexOf('blocked:') === 0 || st === 'open') break;
    }
    await sleep(1500);
    return String(await ev('(function(){'
      + 'var b=document.body?document.body.getAttribute("data-egbc-blocked"):"";'
      + 'var c=document.getElementById("content");'
      + 'return JSON.stringify({ blocked: b || "",'
      + ' words: c ? c.textContent.replace(/\\s+/g," ").trim().slice(0,160) : "(no content)" })})()'));
  };

  /* ---- the preacher, on no team ---------------------------------- */
  console.log('\na speaker who is on no team at all');
  await signInAs('preacher');
  watch.reset();
  let r1 = JSON.parse(await openPlan(THEIRS));
  ok('  the page lets them in at all', r1.blocked === '', JSON.stringify(r1));
  ok('  and the songs for THEIR Sunday are on it',
    r1.words.indexOf(SONG_THEIRS) !== -1, JSON.stringify(r1));

  /* THE ONE THAT MATTERS. Being on one Sunday is not being on the rota. */
  let r2 = JSON.parse(await openPlan(OTHER));
  ok('  but another Sunday\u2019s songs are NOT',
    r2.words.indexOf(SONG_OTHER) === -1, JSON.stringify(r2));
  ok('  and it says so in words, not as an error',
    /sent to the people serving/i.test(r2.words), JSON.stringify(r2));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* ---- somebody on AV, who is a volunteer ------------------------ */
  console.log('\nsomebody on the AV team, who is not named on it');
  await signInAs('av');
  watch.reset();
  const r3 = JSON.parse(await openPlan(THEIRS));
  ok('  opens it because they are on a team, not because they are named',
    r3.blocked === '' && r3.words.indexOf(SONG_THEIRS) !== -1, JSON.stringify(r3));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* ---- an attender who was never on the email -------------------- */
  console.log('\nsomebody who was not on the email');
  await signInAs('attender');
  watch.reset();
  const r4 = JSON.parse(await openPlan(THEIRS));
  ok('  cannot read the songs', r4.words.indexOf(SONG_THEIRS) === -1, JSON.stringify(r4));
  ok('  and is told plainly who it was for',
    /sent to the people serving/i.test(r4.words), JSON.stringify(r4));
  /* AND THE DATABASE REFUSES THEM, not only the page. */
  const direct = String(await ev(
    'firebase.firestore(EGBCAuth.app).collection("songSummaries").doc(' + JSON.stringify(THEIRS) + ').get()'
    + '.then(function(){ return "read"; }).catch(function(e){ return "refused:" + e.code; })', true));
  ok('  and the database refuses them too, not only the page',
    /^refused/.test(direct), direct);

  /* ---- and it finds them on Home, in the app -------------------- */
  /* Martin: "the read-only plan shows on Home for anyone in the audience".
     A preacher is on no team, so nothing else on that screen is about
     them - "You are serving" is built from the rota and never mentions
     them. Without this they have the email and nothing in the app. */
  const openApp = async (uid) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
    let drawn = '';
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      drawn = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
        + '.getAttribute("data-drawn") || ""'));
      if (drawn.indexOf(uid + ':') === 0) break;
    }
    await sleep(1800);   /* the plan arrives after the first draw */
    return drawn;
  };

  console.log('\nand the app tells them, on Home');
  await signInAs('preacher');
  watch.reset();
  const drew = await openApp(PEOPLE.preacher.uid);
  ok('  the app drew for them', drew.indexOf(PEOPLE.preacher.uid + ':') === 0, drew || '(never drew)');
  const card = String(await ev('(function(){'
    + 'var r=document.querySelector("[data-act^=\\"open:song-summary.html\\"]");'
    + 'return r?JSON.stringify({ act:r.dataset.act,'
    + ' words:r.textContent.replace(/\\s+/g," ").trim().slice(0,90) }):"(no card)"})()'));
  ok('  Home says they are on this Sunday’s plan', card !== '(no card)', card);
  ok('  and it opens the plan for the RIGHT Sunday',
    card.indexOf(THEIRS) !== -1, card);
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* AND NOT FOR SOMEBODY WHO IS NOT ON IT. A card that showed for
     everybody would be worse than no card: it would send the whole
     church to a page that refuses them. */
  await signInAs('attender');
  watch.reset();
  await openApp(PEOPLE.attender.uid);
  ok('  somebody not on any plan is shown no such card',
    String(await ev('(function(){'
      + 'return document.querySelector("[data-act^=\\"open:song-summary.html\\"]") ? "shown" : "none"})()'))
      === 'none');
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
