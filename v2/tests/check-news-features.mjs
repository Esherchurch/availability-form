/* Does the hub's news do everything the portal's news panel does?
 *
 *   node tests/check-news-features.mjs            (from v2/, emulators running)
 *   node tests/check-news-features.mjs --shots    and save pictures
 *
 * WHY. Martin posted a notice on the original portal, not on the hub, because
 * only he sees v2 before launch - so for a while it looked as though the hub
 * had to read the portal's feed. It does not: the hub keeps its own news. But
 * the hub's news has to be able to do everything the portal's panel can, and
 * one thing was missing outright: "show until", the day a notice takes itself
 * off the page. Without it last term's notice sits there until somebody
 * remembers to delete it, and nobody does.
 *
 * NEXT-BRIEF 17a lists what to check and fill: add, edit, manage the list,
 * remove, "show until", paste from an email with the <style> strip, and a
 * failed save that says so. This checks all seven through the browser, plus
 * the date label the portal also had.
 *
 * Synthetic throughout: six invented notices in the emulator, written by one
 * invented admin. Nothing here reads the church's data.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9631, SERVE = 8872;
const PROJECT = 'egbc-worship-planner';
const wantShots = process.argv.includes('--shots');
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

const DAY = 86400000;
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const TODAY = iso(Date.now());
const YESTERDAY = iso(Date.now() - DAY);
const NEXT_MONTH = iso(Date.now() + 30 * DAY);

/* A pasted newsletter, complete with the <style> block that restyled the whole
   dashboard the one time it got through. */
const PASTED_EMAIL =
  '<meta charset="utf-8"><style>body{background:#ff00ff !important;font-family:Comic Sans MS !important}' +
  '.card{display:none !important}</style><!-- Outlook --><table><tr><td>' +
  'The bulletin for this week is attached.</td></tr></table>';

const NOTICES = {
  live_no_until: { title: 'NOTICE-A no end date', body: '<p>Still showing.</p>', until: '', date: '' },
  live_until_later: { title: 'NOTICE-B showing until next month', body: '<p>Still showing.</p>', until: NEXT_MONTH, date: '' },
  live_until_today: { title: 'NOTICE-C showing until today', body: '<p>Today is its last day.</p>', until: TODAY, date: '' },
  expired: { title: 'NOTICE-D expired yesterday', body: '<p>Should be nowhere on the page.</p>', until: YESTERDAY, date: '' },
  labelled: { title: 'NOTICE-E with a date label', body: '<p>A labelled one.</p>', until: '', date: 'Sunday 4 May' },
  pasted: { title: 'NOTICE-F pasted from an email', body: PASTED_EMAIL, until: '', date: '' }
};

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 280) : '')); };

const rest = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: 'localhost', port: 8181, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej); req.end(data);
});
const val = v => Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
const docPath = c => '/v1/projects/' + PROJECT + '/databases/(default)/documents/' + c;

/* The invented account, made if the emulator was started fresh. An "email
   already exists" back is the normal case and means it is already there. */
const makeAccount = () => new Promise((res, rej) => {
  const data = JSON.stringify({ email: ACCOUNT.email, password: ACCOUNT.pw, returnSecureToken: true });
  const req = http.request({ host: 'localhost', port: 9099, method: 'POST',
    path: '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  req.on('error', rej); req.end(data);
});

const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>' +
  '<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
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

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('not found'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const head = /<head[^>]*>/i.exec(t);
      body = Buffer.from(head ? t.slice(0, head.index + head[0].length) + NO_SW + t.slice(head.index + head[0].length) : NO_SW + t, 'utf8');
    }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-news-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await makeAccount();
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
  const uid = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""');
  if (!uid) { console.error('Could not sign in as ' + ACCOUNT.email); server.close(); chrome.kill(); process.exit(2); }

  /* An invented master admin, so the Notices list and the editor are reachable. */
  await rest('PATCH', docPath('users/' + uid), { fields: {
    uid: val(uid), email: val(ACCOUNT.email), name: val('News Tester'),
    memberId: val('ab_news_tester'), linkedBy: val('admin'), status: val('active'),
    teams: val(['Core Team', 'Worship Team']), adminFor: val(['Core Team']), masterAdmin: val(true)
  } });

  /* Clear out anything a previous run left, then seed the six. */
  const before = JSON.parse((await rest('GET', docPath('news') + '?pageSize=300')).body || '{}').documents || [];
  for (const d of before) await rest('DELETE', '/v1/' + d.name.slice(d.name.indexOf('projects/')));
  const ids = {};
  for (const [key, n] of Object.entries(NOTICES)) {
    ids[key] = 'synthetic_' + key;
    await rest('PATCH', docPath('news/' + ids[key]), { fields: {
      title: val(n.title), body: val(n.body), teams: val([]),
      date: val(n.date), until: val(n.until),
      pinned: val(false), requireAck: val(false),
      postedBy: val('News Tester'), ackedBy: val([]),
      createdAt: { timestampValue: new Date(Date.now() - 3 * DAY).toISOString() }
    } });
  }
  console.log('seeded ' + Object.keys(NOTICES).length + ' invented notices (one of them expired yesterday)\n');

  const loadHub = async () => {
    watch.reset();
    await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(12000);
    await ev('window.alert=function(m){window.__alert=String(m)};window.confirm=function(){return true};1');
    await ev("(function(){var b=document.querySelector('#pickList .pick-t');if(b)b.click();})();1");
    await sleep(2500);
  };

  await loadHub();

  /* ---- "show until" on the page --------------------------------------- */
  const feed = String(await ev("(function(){var a=document.getElementById('newsTrack'),b=document.getElementById('pinned');return ((a?a.innerText:'')+' '+(b?b.innerText:'')).replace(/\\s+/g,' ').trim()})()"));
  console.log('"show until" on the page');
  ok('  a notice with no end date shows', feed.includes('NOTICE-A'), feed.slice(0, 220));
  ok('  a notice showing until next month shows', feed.includes('NOTICE-B'));
  ok('  "until today" still shows today', feed.includes('NOTICE-C'),
    'until=' + TODAY + ' must be its last day, not its first day gone');
  ok('  a notice that expired yesterday is gone', !feed.includes('NOTICE-D'),
    feed.includes('NOTICE-D') ? 'the expired notice is still on the page' : 'until=' + YESTERDAY + ' is hidden');
  ok('  a date label is shown instead of the day it was posted', feed.includes('Sunday 4 May'),
    feed.includes('Sunday 4 May') ? '' : 'NOTICE-E has date="Sunday 4 May"');

  /* ---- paste from an email -------------------------------------------- */
  console.log('\npaste from an email');
  const pasted = String(await ev("(function(){var el=[].slice.call(document.querySelectorAll('#newsTrack .nw')).filter(function(n){return /NOTICE-F/.test(n.innerText||'')})[0];return el?el.innerHTML:'(not found)'})()"));
  ok('  the pasted notice is on the page', feed.includes('NOTICE-F'));
  ok('  its <style> block never reaches the page', !/<style/i.test(pasted), pasted.slice(0, 170));
  ok('  nor its <meta> or its comments', !/<meta/i.test(pasted) && !/<!--/.test(pasted), pasted.slice(0, 170));
  const bg = String(await ev('getComputedStyle(document.body).backgroundColor'));
  ok("  the page is still the hub's own colour", bg !== 'rgb(255, 0, 255)', bg);
  ok('  and the words of the email are still there', /bulletin/i.test(pasted), pasted.slice(0, 170));

  /* ---- manage the list ------------------------------------------------ */
  console.log('\nmanage the list (Administration, Notices)');
  await ev("openAdmin();adminTab('news');1"); await sleep(1400);
  const admin = String(await ev("(function(){var el=document.getElementById('tab-news');return el?(el.innerText||'').replace(/\\s+/g,' ').trim():'(no tab)'})()"));
  ok('  every notice is listed, including the expired one',
    ['NOTICE-A', 'NOTICE-B', 'NOTICE-C', 'NOTICE-D', 'NOTICE-E', 'NOTICE-F'].every(t => admin.includes(t)),
    admin.slice(0, 260));
  ok('  a live one says when it stops showing', admin.includes('Showing until ' + NEXT_MONTH), admin.slice(0, 320));
  ok('  an expired one says so, and says it is hidden',
    admin.includes('Expired ' + YESTERDAY) && /Expired [\d-]+ \(hidden\)/.test(admin), admin.slice(0, 320));
  const rowBtns = await ev("(function(){var rows=[].slice.call(document.querySelectorAll('#tab-news > div')).filter(function(d){return /NOTICE-D/.test(d.innerText||'')});var r=rows[0];if(!r)return '';return [].slice.call(r.querySelectorAll('button')).map(function(b){return b.textContent.trim()}).join('|')})()");
  ok('  the expired one can still be edited and removed',
    /Edit/.test(String(rowBtns)) && /Remove/.test(String(rowBtns)), String(rowBtns) || '(no row found)');
  ok('  "+ New notice" is there', /New notice/.test(admin));

  /* ---- edit fills the fields back in --------------------------------- */
  console.log('\nedit an existing notice');
  await ev("closeAdmin();openNewsEditor('" + ids.live_until_later + "');1"); await sleep(1000);
  ok('  the editor has a "Show until" field', !!(await ev("!!document.getElementById('nwUntil')")));
  const untilVal = String(await ev("(document.getElementById('nwUntil')||{}).value||''"));
  ok("  it opens with the notice's own end date in it", untilVal === NEXT_MONTH, untilVal + ' (wanted ' + NEXT_MONTH + ')');

  await ev("closeNewsEditor();openNewsEditor('" + ids.labelled + "');1"); await sleep(900);
  const dateVal = String(await ev("(document.getElementById('nwDate')||{}).value||''"));
  ok('  and the date label is filled from the notice too', dateVal === 'Sunday 4 May', dateVal);

  await ev('closeNewsEditor();openNewsEditor();1'); await sleep(900);
  ok('  a new notice opens with both fields empty',
    String(await ev("((document.getElementById('nwUntil')||{}).value||'')+'/'+((document.getElementById('nwDate')||{}).value||'')")) === '/',
    await ev("((document.getElementById('nwUntil')||{}).value||'')+'/'+((document.getElementById('nwDate')||{}).value||'')"));

  /* ---- add a notice, with an end date, through the page -------------- */
  console.log('\nadd a notice through the page');
  await ev("document.getElementById('nwTitle').value='NOTICE-G added by the check';" +
    "newsEditor().setHTML('<p>Invented.</p>');" +
    "document.getElementById('nwDate').value='Sunday 11 May';" +
    "document.getElementById('nwUntil').value='" + NEXT_MONTH + "';1");
  await ev('saveNews()', true); await sleep(3500);
  const added = JSON.parse((await rest('GET', docPath('news') + '?pageSize=300')).body || '{}').documents || [];
  const mine = added.find(d => (((d.fields || {}).title || {}).stringValue) === 'NOTICE-G added by the check');
  ok('  it saved', !!mine, mine ? 'saved' : String(await ev("window.__alert||'(it said nothing)'")));
  ok('  with the end date it was given',
    !!mine && ((mine.fields || {}).until || {}).stringValue === NEXT_MONTH,
    mine ? JSON.stringify((mine.fields || {}).until || {}) : '');
  ok('  and with its date label',
    !!mine && ((mine.fields || {}).date || {}).stringValue === 'Sunday 11 May',
    mine ? JSON.stringify((mine.fields || {}).date || {}) : '');

  /* ---- move the end date into the past and it takes itself off ------- */
  console.log('\nchange an end date to the past and it takes itself off');
  const newId = mine ? mine.name.split('/').pop() : '';
  if (newId) {
    await ev("openNewsEditor('" + newId + "');1"); await sleep(1000);
    await ev("document.getElementById('nwUntil').value='" + YESTERDAY + "';1");
    await ev('saveNews()', true); await sleep(3500);
    const stored = ((JSON.parse((await rest('GET', docPath('news/' + newId))).body || '{}').fields || {}).until || {}).stringValue;
    ok('  the edit saved the earlier date', stored === YESTERDAY, String(stored));
    const after = String(await ev("(document.getElementById('newsTrack')||{}).innerText||''"));
    ok('  and it is no longer on the page', !/NOTICE-G/.test(after), /NOTICE-G/.test(after) ? 'still showing' : 'gone');
  } else {
    ok('  the edit saved the earlier date', false, 'nothing to edit');
    ok('  and it is no longer on the page', false, 'nothing to edit');
  }

  /* ---- remove --------------------------------------------------------- */
  console.log('\nremove a notice');
  if (newId) {
    await ev("deleteNews('" + newId + "')", true); await sleep(3000);
    const gone = (await rest('GET', docPath('news/' + newId))).status;
    ok('  it is gone from the database', gone === 404, 'GET returned ' + gone);
  } else ok('  it is gone from the database', false, 'nothing to remove');

  /* ---- a save that fails says so -------------------------------------- */
  console.log('\na save that fails says so');
  await ev("window.__alert='';openNewsEditor();1"); await sleep(1000);
  await ev("document.getElementById('nwTitle').value='NOTICE-H must not save';newsEditor().setHTML('<p>x</p>');1");
  /* Make the write fail the way a dropped connection or a refused rule does. */
  await ev("(function(){var real=db.collection.bind(db);db.collection=function(n){var r=real(n);if(n==='news'){r.add=function(){return Promise.reject(new Error('Pretend the network went'))};}return r};})();1");
  await ev('saveNews()', true); await sleep(1800);
  const said = String(await ev("window.__alert||''"));
  ok('  it says the post did not go', /Could not post/i.test(said), said || '(it said nothing)');
  ok('  the editor stays open so the words are not lost',
    (await ev("document.getElementById('newsModal').classList.contains('on')")) === true);
  const stillThere = (JSON.parse((await rest('GET', docPath('news') + '?pageSize=300')).body || '{}').documents || [])
    .some(d => (((d.fields || {}).title || {}).stringValue) === 'NOTICE-H must not save');
  ok('  and nothing was written', !stillThere);

  /* ---- no page errors through any of it ------------------------------- */
  console.log('\nthe console');
  ok('  nothing on the console through all of it', watch.errors.length === 0, watch.summary());

  if (wantShots) {
    await loadHub();
    let r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'news--feed.png'), Buffer.from(r.data, 'base64'));
    await ev("openAdmin();adminTab('news');1"); await sleep(1600);
    r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'news--manage-list.png'), Buffer.from(r.data, 'base64'));
    await ev("closeAdmin();openNewsEditor('" + ids.live_until_later + "');1"); await sleep(1600);
    r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'news--editor-show-until.png'), Buffer.from(r.data, 'base64'));
    console.log('\nscreenshots in tests/shots/');
  }

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
