/* KAREN SETS UP HER HOUSEHOLD FEED FROM THE APP.
 *
 *   firebase emulators:exec --only firestore,auth,functions --project egbc-worship-planner ^
 *     "node tests/check-app-calendar.mjs"
 *   ...add --shots for pictures.
 *
 * (from v2/. It needs the FUNCTIONS emulator, so it brings its own emulators
 * rather than using the dev ones - stop those first or the ports clash.)
 *
 * WHY THIS EXISTS. Martin, 11 Oct, having walked the live app: "Add to my
 * calendar has LOST what hub-app.js has: one-tap Apple / iPhone, Google and
 * Outlook buttons. Copy-and-paste only is too hard for most people. And My
 * household and The whole rota say 'not set up yet' with no way to set them
 * up." He named the test himself, and it is the one below: Karen, on her
 * phone, with Oliver in the house, going from "not set up yet" to a calendar
 * her phone will subscribe to - without touching a computer.
 *
 * check-calendar-end-to-end.mjs does the same thing through the HUB. This is
 * the app, which is a different screen, a different sheet and different code.
 * Both exist because the app losing the buttons is exactly the fault that the
 * hub's passing check could not see.
 *
 * Synthetic people throughout: Karen and Oliver here are invented, and the
 * names are Martin's example from NEXT-BRIEF 18, not his family's records.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9634, SERVE = 8871;
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';
const PROJECT = process.env.GCLOUD_PROJECT || 'egbc-worship-planner';
const REGION = 'europe-west2';
const FN_PORT = Number(process.env.FUNCTIONS_EMULATOR_PORT || 5101);
const FS_PORT = Number((process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8181').split(':')[1]);
const AUTH_PORT = Number((process.env.FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099').split(':')[1]);

const KAREN = { email: 'app.karen@example.invalid', member: 'ab_app_karen', name: 'Karen Synthetic' };
const OLIVER = { member: 'ab_app_oliver', name: 'Oliver Synthetic', email: 'app.oliver@example.invalid' };

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : '')));
};

const DOCS = '/v1/projects/' + PROJECT + '/databases/(default)/documents';
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
const put = (p, obj) => req(FS_PORT, 'PATCH',
  DOCS + '/' + p.split('/').map(encodeURIComponent).join('/'),
  { fields: fields(obj) }, { Authorization: 'Bearer owner' });
const del = (p) => req(FS_PORT, 'DELETE',
  DOCS + '/' + p.split('/').map(encodeURIComponent).join('/'), undefined,
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

async function seed() {
  let up = JSON.parse((await req(AUTH_PORT, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: KAREN.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(AUTH_PORT, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email: KAREN.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) throw new Error('Could not make or sign in to ' + KAREN.email
    + ' - is the auth emulator up?');
  const uid = up.localId;

  /* OLIVER POINTS AT KAREN, which is how the address book records a
     household, and is what makes the household feed worth having: Karen's
     reason for wanting it is to know when Oliver is on. */
  await put('addressBook/' + KAREN.member, {
    name: KAREN.name, email: KAREN.email, markers: ['Worship Team'], adminFor: [],
    churchMember: false, archived: false, isMinor: false });
  await put('addressBook/' + OLIVER.member, {
    name: OLIVER.name, email: OLIVER.email, markers: ['Worship Team'], adminFor: [],
    householdId: KAREN.member, churchMember: false, archived: false, isMinor: false });
  await put('users/' + uid, {
    uid, email: KAREN.email, name: KAREN.name, memberId: KAREN.member,
    status: 'active', linkedBy: 'admin', teams: ['Worship Team'], adminFor: [],
    masterAdmin: false, attender: true, churchMember: false });

  /* One Sunday Oliver is on and Karen is not - so "is this really the
     household feed" has an answer that "just me" could not fake. */
  await put('events/ev_app_cal_oliver', {
    termLabel: 'Autumn 2026', teams: ['Worship Team'], roles: ['Drums'],
    archived: false, draft: false, date: '2026-10-18', startTime: '08:00', endTime: '11:30',
    type: 'Sunday Morning Worship', description: '',
    assignments: { Drums: { id: OLIVER.member, name: OLIVER.name } } });

  /* START WITH NO LINKS AT ALL. A previous run leaves them behind, and
     without this "it said not set up yet, and now it does not" passes or
     fails depending on whether the emulator had been restarted. */
  const keysDoc = await req(FS_PORT, 'GET', DOCS + '/calendarKeys/' + uid, undefined,
    { Authorization: 'Bearer owner' });
  let had = {};
  try { had = (JSON.parse(keysDoc.body || '{}').fields || {}).feeds || {}; } catch (e) {}
  const keys = Object.values((had.mapValue || {}).fields || {})
    .map(v => (((v.mapValue || {}).fields || {}).key || {}).stringValue).filter(Boolean);
  for (const k of keys) await del('calendarFeeds/' + k);
  await del('calendarKeys/' + uid);

  return uid;
}

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });
  const uid = await seed();
  console.log('seeded Karen (' + uid.slice(0, 8) + '\u2026) with Oliver in the house, and no calendar links\n');

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
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-appcal-' + process.pid),
    '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errs.push((m.params.args || []).map(a => String(a.value || a.description || '')).join(' ').slice(0, 200));
    if (m.method === 'Runtime.exceptionThrown') {
      const d = (m.params.exceptionDetails || {});
      errs.push('uncaught: ' + String((d.exception && (d.exception.description || d.exception.value)) || d.text || ''));
    }
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  /* HTTPS ONLY. Pausing http pauses Firestore's own stream to the emulator
     and the page never gets a profile (A-062) - and it would pause the
     function call this check is entirely about. */
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  /* 375px, which is the width Martin walks the app at. */
  await send('Emulation.setDeviceMetricsOverride',
    { width: 375, height: 812, deviceScaleFactor: 3, mobile: true });

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
  const shot = async (name) => {
    if (!wantShots) return;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'app-calendar--' + name + '.png'), Buffer.from(r.data, 'base64'));
  };

  /* ---- Karen gets in, the way the other app checks do it --------------- */
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Storage.clearDataForOrigin', { origin: 'http://localhost:' + SERVE,
    storageTypes: 'indexeddb,local_storage,cache_storage,websql,service_workers' });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
  await until('the sign-in harness loaded',
    '(typeof firebase === "undefined" || typeof EGBCAuth === "undefined") ? "no" : "yes"');
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
    + JSON.stringify(KAREN.email) + ',' + JSON.stringify(PW) + ')'
    + '.then(function(){return "ok"}).catch(function(e){return "failed " + e.code})', true);
  /* ASSERT THE SIGN-IN TOOK before navigating. Not doing this is how a
     check once measured a page nobody was signed in to and reported the
     app's fault instead of its own. */
  await until('Karen is signed in before the app opens',
    'firebase.auth(EGBCAuth.app).currentUser'
    + ' && firebase.auth(EGBCAuth.app).currentUser.uid === ' + JSON.stringify(uid)
    + ' ? "yes" : "no"');
  await until('her session carries a working token',
    'firebase.auth(EGBCAuth.app).currentUser.getIdToken().then(function(t){return t?"yes":"no"})'
    + '.catch(function(){return "no"})', 20);

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
  let drawn = '';
  for (let i = 0; i < 50; i++) {
    await sleep(500);
    drawn = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
      + '.getAttribute("data-drawn") || ""'));
    if (drawn.indexOf(uid + ':') === 0) break;
  }
  ok('Karen gets into the app', drawn.indexOf(uid + ':') === 0,
    'data-drawn: ' + (drawn || '(none)') + '  console: ' + JSON.stringify(errs.slice(-3)));
  if (drawn.indexOf(uid + ':') !== 0) {
    console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
    server.close(); chrome.kill(); process.exit(1);
  }

  /* ---- Me, and the row that opens the sheet ---------------------------- */
  const tapped = await ev('(function(){var b=document.querySelector(\'[data-tab="me"]\');'
    + 'if(!b)return "no Me tab";b.click();return "ok"})()');
  ok('Me is a tab she can reach', tapped === 'ok', tapped);
  await sleep(600);
  const row = await ev('(function(){var b=document.querySelector(\'[data-act="sheet:calendar"]\');'
    + 'return b?b.textContent.replace(/\\s+/g," ").trim():"(nothing)"})()');
  ok('"Add to my calendar" is a row on Me', /Add to my calendar/.test(String(row)), row);

  await ev('document.querySelector(\'[data-act="sheet:calendar"]\').click();1');
  /* Wait for the sheet to have its answer, not for a number of seconds: it
     opens saying "Getting your links..." while myCalendarLinks is in the
     air. */
  await until('the sheet opens and finds out which links she has',
    '(function(){var s=document.querySelector(".sheet");'
    + 'return (s && !/Getting your links/.test(s.textContent)) ? "yes" : "no"})()');
  await shot('1-nothing-set-up');

  const sheetText = () => ev('(function(){var s=document.querySelector(".sheet");'
    + 'return s?s.textContent.replace(/\\s+/g," ").trim():"(no sheet)"})()');
  const sheetHTML = () => ev('(function(){var s=document.querySelector(".sheet");'
    + 'return s?s.innerHTML:""})()');

  const before = String(await sheetText());
  ok('it offers the three choices in plain words',
    /Just me/.test(before) && /My household/.test(before) && /The whole rota/.test(before), before.slice(0, 180));
  ok('no link exists until she asks for one',
    !/rotaFeed\?k=/.test(String(await sheetHTML())), 'nothing in the sheet is an address yet');
  /* THE FAULT MARTIN FOUND, stated as a test: a dead end with a label on
     it. Every choice she has not set up must offer to set it up. */
  const offers = await ev('(function(){return Array.prototype.map.call('
    + 'document.querySelectorAll(".sheet [data-act^=\\"makecal:\\"]"),'
    + 'function(b){return b.dataset.act}).join(",")})()');
  ok('each one she has not got offers to set itself up',
    String(offers).split(',').sort().join(',') === 'makecal:fullall,makecal:household,makecal:me',
    'buttons found: ' + offers);
  ok('and none of them says "not set up yet" with no way to set it up',
    !/not set up yet/i.test(before), before.slice(0, 180));

  /* ---- she taps "Set this one up" under My household ------------------- */
  await ev('document.querySelector(\'[data-act="makecal:household"]\').click();1');
  /* Wait on the Copy button, not on an address being somewhere in the
     sheet. Waiting on "rotaFeed?k=" made this line fail whenever the
     one-tap buttons were missing - true, but it reads as though the feed
     had not been made, and the next assertion is the one that should say
     so. The Copy button exists as soon as the link does. */
  await until('her household link is made',
    '(function(){return document.querySelector(\'.sheet [data-act="copycal:household"]\')'
    + ' ? "yes" : "no"})()');
  await shot('2-household-set-up');

  const hrefs = JSON.parse(String(await ev(
    '(function(){var out={};'
    + 'var cards=document.querySelectorAll(".sheet .card");'
    + 'for(var i=0;i<cards.length;i++){'
    + '  if(!/My household/.test(cards[i].textContent))continue;'
    + '  var as=cards[i].querySelectorAll("a[href]");'
    + '  for(var j=0;j<as.length;j++){out[as[j].textContent.replace(/\\s+/g," ").trim()]=as[j].getAttribute("href");}'
    + '}return JSON.stringify(out)})()') || '{}'));
  const labels = Object.keys(hrefs);
  /* MARTIN'S WORDS, not an approximation of them: the buttons hub-app.js
     has, by the names a person reads. */
  ok('the three one-tap buttons are there',
    labels.some(l => /Apple \/ iPhone/.test(l)) && labels.some(l => /^Google$/.test(l))
      && labels.some(l => /^Outlook$/.test(l)),
    'buttons: ' + labels.join(' | '));

  const apple = hrefs[labels.find(l => /Apple \/ iPhone/.test(l)) || ''] || '';
  const google = hrefs[labels.find(l => /^Google$/.test(l)) || ''] || '';
  const outlook = hrefs[labels.find(l => /^Outlook$/.test(l)) || ''] || '';
  ok('Apple / iPhone is a webcal:// address, which is what makes a phone subscribe',
    /^webcal:\/\/localhost:\d+\/.*rotaFeed\?k=[a-z0-9]{16,}$/.test(apple),
    apple.replace(/k=.{6}.*/, 'k=\u2026'));
  ok('Outlook is the same webcal:// address', outlook === apple && !!outlook);
  ok('Google is its own cid link, wrapping that webcal address',
    google.indexOf('https://calendar.google.com/calendar/r?cid=') === 0
      && decodeURIComponent(google.split('cid=')[1] || '') === apple,
    google.replace(/k%3D.{6}.*/, 'k%3D\u2026'));
  ok('and Copy link is still there as the last resort',
    /Copy link/.test(String(await sheetText())));

  /* ---- TAPPING ONE MUST NOT SHUT THE SHEET ----------------------------
     The backdrop carries data-act="close" and the shell finds it with
     closest() from anything inside the panel that has no action of its own
     - which is exactly what these three links are. Before the fix, the
     sheet shut under her finger as she tapped the thing she wanted. */
  await ev('(function(){var a=Array.prototype.filter.call(document.querySelectorAll(".sheet a[href]"),'
    + 'function(x){return /Apple/.test(x.textContent)})[0];'
    + 'var e=new MouseEvent("click",{bubbles:true,cancelable:true});'
    + 'a.dispatchEvent(e);return "ok"})()');
  await sleep(500);
  ok('tapping a calendar button does not shut the sheet under her finger',
    /rotaFeed\?k=/.test(String(await sheetHTML())), String(await sheetText()).slice(0, 120));

  /* ---- and the address really serves her household --------------------- */
  const key = (apple.match(/k=([a-z0-9]+)/) || [])[1] || '';
  const feed = await req(FN_PORT, 'GET', '/' + PROJECT + '/' + REGION + '/rotaFeed?k=' + key);
  ok('the address she has just made serves a calendar',
    feed.status === 200 && /BEGIN:VCALENDAR/.test(feed.body), feed.status);
  /* THE LINE KAREN READS IN HER MONTH VIEW. Her whole reason for wanting
     this feed is to know when Oliver is on. */
  const summaries = (feed.body.match(/SUMMARY:[^\r\n]+/g) || []);
  ok('  with Oliver on it, by name and role',
    summaries.includes('SUMMARY:EGBC: Oliver: Drums'), summaries.join(' | ').slice(0, 200));
  ok('  and a calendar app can tell it from the "just me" one',
    /X-WR-CALNAME:[^\r\n]*household/i.test(feed.body),
    (feed.body.match(/X-WR-CALNAME:[^\r\n]+/) || ['(none)'])[0]);

  /* ---- only the one she asked for was made ---------------------------- */
  const still = await ev('(function(){return Array.prototype.map.call('
    + 'document.querySelectorAll(".sheet [data-act^=\\"makecal:\\"]"),'
    + 'function(b){return b.dataset.act}).join(",")})()');
  ok('the other two are still hers to ask for, not made behind her back',
    String(still).split(',').sort().join(',') === 'makecal:fullall,makecal:me',
    'still offering: ' + still);

  /* ---- it survives shutting and reopening ----------------------------- */
  await ev('document.querySelector(\'.sheet [data-act="close"]\').click();1');
  await sleep(500);
  ok('Close shuts the sheet', !(await ev('!!document.querySelector(".sheet")')));
  await ev('document.querySelector(\'[data-act="sheet:calendar"]\').click();1');
  await sleep(800);
  const reopened = String(await sheetHTML());
  ok('reopening shows the link she already has, without making more',
    reopened.indexOf('data-act="copycal:household"') !== -1
      && reopened.indexOf('data-act="makecal:household"') === -1,
    'household is still set up, and is not being offered as new');

  ok('the app said nothing on its console throughout', errs.length === 0,
    JSON.stringify(errs.slice(0, 4)));

  if (wantShots) console.log('\nscreenshots in tests/shots/');
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
