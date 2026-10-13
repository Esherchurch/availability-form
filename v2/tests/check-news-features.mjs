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
import { makeEval } from './browser-eval.mjs';

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
  const ev = makeEval(send, "news-features");

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

  /* ---- urgent: also to phones (N-4) ----------------------------------- */
  /* The server sends a notice to phones the first time it is urgent, and
     never again. So the page must set the field only when the tick is
     really pressed, show a sent notice as sent, and offer nothing when
     the church does not use notifications (HANDOVER-MAIN rule 12). */
  console.log('\nan urgent notice also goes to phones');
  ok('  an ordinary notice is saved without the field',
    !!mine && !('urgent' in (mine.fields || {})), mine ? Object.keys(mine.fields || {}).join(',') : 'nothing saved');
  await ev('closeNewsEditor();openNewsEditor();1'); await sleep(900);
  ok('  a new notice offers the tick, unticked',
    String(await ev("(function(){var r=document.getElementById('nwUrgentRow'),b=document.getElementById('nwUrgent');"
      + "return (r&&!r.hidden&&r.offsetHeight>0?'shown':'hidden')+'/'+(b&&b.checked?'ticked':'unticked')})()")) === 'shown/unticked');
  await ev("document.getElementById('nwTitle').value='NOTICE-U urgent by the check';newsEditor().setHTML('<p>Hall closed</p>');"
    + "document.getElementById('nwUrgent').checked=true;1");
  await ev('saveNews()', true); await sleep(3500);
  const all2 = JSON.parse((await rest('GET', docPath('news') + '?pageSize=300')).body || '{}').documents || [];
  const urg = all2.find(d => (((d.fields || {}).title || {}).stringValue) === 'NOTICE-U urgent by the check');
  ok('  ticked, it is saved as urgent', !!urg && ((urg.fields || {}).urgent || {}).booleanValue === true,
    urg ? JSON.stringify((urg.fields || {}).urgent || '(no field)') : 'not saved');
  const urgId = urg ? urg.name.split('/').pop() : '';
  if (urgId) {
    await ev("closeNewsEditor();openNewsEditor('" + urgId + "');1"); await sleep(900);
    const st = String(await ev("(function(){var b=document.getElementById('nwUrgent');"
      + "return (b.checked?'ticked':'unticked')+'/'+(b.disabled?'locked':'open')+'/'+document.getElementById('nwUrgentHelp').textContent})()"));
    ok('  opened again it shows as sent, and cannot be sent twice', /^ticked\/locked\/Already sent/.test(st), st);
    await ev("closeNewsEditor();deleteNews('" + urgId + "')", true); await sleep(2500);
  } else ok('  opened again it shows as sent, and cannot be sent twice', false, 'nothing saved');

  /* AN ADMIN WHO IS NOT THE OFFICE (Martin, 13 Oct 2026): not offered it,
     and the rules refuse it anyway (firestore-rules.test.mjs). */
  await ev("window.__realMaster=EGBCAuth.isMaster;window.__realInTeam=EGBCAuth.inTeam;"
    + "EGBCAuth.isMaster=function(){return false};EGBCAuth.inTeam=function(t){return t!=='Church office'&&window.__realInTeam(t)};"
    + "closeNewsEditor();openNewsEditor();1"); await sleep(900);
  ok('  an admin who is not in the Church office is not offered it',
    (await ev("document.getElementById('nwUrgentRow').hidden")) === true);
  await ev("EGBCAuth.isMaster=window.__realMaster;EGBCAuth.inTeam=window.__realInTeam;closeNewsEditor();1");

  /* The church does not use notifications: no tick, and no urgent field
     even if the box were somehow ticked. */
  await ev("window.__realChurch=window.EGBCChurch;window.EGBCChurch={uses:function(n){return n!=='notifications'}};"
    + "closeNewsEditor();openNewsEditor();1"); await sleep(900);
  ok('  a church that does not use notifications is not offered it',
    (await ev("document.getElementById('nwUrgentRow').hidden")) === true);
  await ev("document.getElementById('nwTitle').value='NOTICE-V feature off';newsEditor().setHTML('<p>x</p>');"
    + "document.getElementById('nwUrgent').checked=true;1");
  await ev('saveNews()', true); await sleep(3500);
  const all3 = JSON.parse((await rest('GET', docPath('news') + '?pageSize=300')).body || '{}').documents || [];
  const off = all3.find(d => (((d.fields || {}).title || {}).stringValue) === 'NOTICE-V feature off');
  ok('  and nothing it saves is marked urgent', !!off && !('urgent' in (off.fields || {})),
    off ? Object.keys(off.fields || {}).join(',') : 'not saved');
  if (off) { await ev("deleteNews('" + off.name.split('/').pop() + "')", true); await sleep(2500); }
  await ev("window.EGBCChurch=window.__realChurch;1");

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

  /* ---- THE NOTICES WIDGET ON THE HOME PAGE (Martin, 12 Oct 2026) ----
     "I specifically said the notices need to be seen, not hidden."

     What was here was the welcome widget: one block of words edited
     through a browser prompt() asking for raw HTML, and the news was
     only behind the Latest pop-out, which Martin could not find.

     Martin's own test, in his words: he posts "We need a Choir!" as a
     notice with bold and a list, and it appears formatted in the widget
     and in Latest; nobody sees a prompt(). */
  console.log('\nthe notices widget on the home page');

  /* A prompt() anywhere on this page fails the check from here on. The
     welcome widget's editor was the last one, and the point of the
     change is that notices are typed in the proper box. */
  await loadHub();
  await ev('window.__prompted=0;window.prompt=function(){window.__prompted++;return null};1');

  await ev("openNewsEditor();1"); await sleep(1200);
  /* MARTIN'S REAL NOTICE, not a tidy one. A title somebody typed with
     a link pasted on the end, a picture at its own 400px, and an email
     footer with addresses in it. The long title is what reaches the
     widget: the body is stripped to words for the preview, so a tidy
     one-line notice proves nothing about width at all. */
  await ev("document.getElementById('nwTitle').value='We need a Choir! Rehearsals start on Thursday - see https://www.eastgrinsteadbaptistchurch.org.uk/notices/choir-rehearsals-autumn-2026';"
    + "newsEditor().setHTML('<p>We are starting a <b>choir</b>.</p><ul><li>Thursdays at 7</li><li>No audition</li></ul><img src=\"data:image/gif;base64,R0lGODlhkAEsAIAAAP///wAAACH5BAEAAAAALAAAAACQASwAAAIFhI+py+0PADs=\" width=\"400\" style=\"width:400px\" alt=\"The choir\"><p>Sent from Val: val.somebody-with-a-long-name@eastgrinsteadbaptistchurch.org.uk or reply to notices+choir-autumn-2026-rehearsals@eastgrinsteadbaptistchurch.org.uk</p>');"
    + "document.getElementById('nwDate').value='Sunday 18 October';1");
  await ev('saveNews()', true); await sleep(3500);

  await loadHub();
  const widget = String(await ev("(function(){var c=document.getElementById('noticesCard');"
    + "return c?c.textContent.replace(/\\s+/g,' ').trim():'(no widget)'})()"));
  ok('  the notices widget is on the home page', widget !== '(no widget)' && widget.length > 0, widget.slice(0, 80));
  ok('  with the notice on it, by name', /We need a Choir!/.test(widget), widget.slice(0, 160));
  /* AND THE LIST READS AS A LIST. textContent runs blocks together, so
     the first preview said "a choir.Thursdays at 7No audition", which
     reads as a typo rather than as two things. */
  ok('  and the first line or two of what it says, with its words apart',
    /We are starting a choir\. Thursdays at 7 No audition/.test(widget), widget.slice(0, 200));
  ok('  and when it went up', /Today|Yesterday|days ago|[A-Z][a-z]{2}/.test(widget), widget.slice(0, 160));

  /* SEEN WITHOUT CLICKING ANYTHING. The whole complaint was that the
     news was behind a pop-out, so "it is in the DOM" is not the claim -
     it has to be on the screen, at both sizes, with nothing opened. */
  const seenAt = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride',
      { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
    await sleep(900);
    return String(await ev(`(function(){
      var c = document.getElementById('noticesCard');
      if (!c) return 'no widget';
      var r = c.getBoundingClientRect();
      if (r.height < 10) return 'nothing drawn';
      if (r.top > window.innerHeight) return 'below the fold at ' + Math.round(r.top);
      if (r.bottom < 0) return 'above the screen';
      var mid = document.elementFromPoint(Math.round(r.left + r.width / 2),
        Math.round(Math.min(Math.max(r.top + 20, 1), window.innerHeight - 1)));
      return (mid && c.contains(mid)) ? 'seen at ' + Math.round(r.top) : 'covered';
    })()`));
  };
  const onDesktop = await seenAt(1920, 945);
  ok('  seen on a 1920x945 screen without opening anything',
    /^seen at/.test(onDesktop), onDesktop);
  const onPhone = await seenAt(375, 812);
  ok('  and on a 375px phone', /^seen at/.test(onPhone), onPhone);

  /* AND IT MUST FIT THE PHONE (Martin, 12 Oct 2026: on his installed
     hub the notices "go off the page completely" - the card measured
     704px inside a 375px screen).

     MY OWN CHECK PASSED THAT. It asked elementFromPoint whether the
     widget was on screen, which answers "is anything on top of it"
     and says nothing at all about width: a card 300px wider than the
     phone still has its top-left corner exactly where it should be.
     So this measures width, and it uses the notice Martin actually
     posted - a long title, a pasted email and a picture - because a
     one-word test notice fits anything. */
  await ev('window.scrollTo(0,0);1');

  /* THE PHONE IS 375px WIDE AND NOTHING THE PAGE DOES CHANGES THAT.
     Measure against that number, never against window.innerWidth.
     My second version of this check did compare the document against
     innerWidth, and it could not fail: the long title widened the
     layout, the viewport shrank to fit, and innerWidth came back 487
     with the document also 487. Both grew together, so a page 112px
     wider than the phone read as a clean pass. Martin's 583px is the
     same escape on his real notices. The viewport growing at all is
     therefore itself the fault, and it is asserted first. */
  const PHONE = 375;
  const wide = JSON.parse(String(await ev(`(() => {
    const out = {
      vw: window.innerWidth,
      doc: Math.round(document.documentElement.scrollWidth),
      over: []
    };
    const card = document.getElementById('noticesCard');
    if (!card) return JSON.stringify({ ...out, missing: true });
    for (const el of [card, ...card.querySelectorAll('*')]) {
      const r = el.getBoundingClientRect();
      if (r.width <= ${PHONE} + 1 && r.right <= ${PHONE} + 1) continue;
      out.over.push((el.className || el.tagName) + ' ' + Math.round(r.width)
        + 'px, right edge ' + Math.round(r.right));
      if (out.over.length >= 4) break;
    }
    return JSON.stringify(out);
  })()`)));
  ok('  the phone is still 375px wide once the page has laid out',
    wide.vw === PHONE, 'window.innerWidth is ' + wide.vw + 'px, asked for ' + PHONE);
  ok('  the page itself does not scroll sideways at 375px',
    wide.doc <= PHONE + 1, wide.doc + 'px of page in a ' + PHONE + 'px phone');
  ok('  and nothing in the notices card is wider than the phone',
    !wide.missing && wide.over.length === 0, wide.over.join('; '));

  /* AND IT CLIPS, which is a different claim from fitting. Martin asked
     for "wrap or clip with ellipsis inside the card", and a card can fit
     the phone while the title is simply cut off mid-letter with no sign
     that there is more. Taking the whole fix out fails the three widths
     above; taking only .nx-t's rule out does not, because four other
     lines each contain this title on their own. This assertion is what
     makes .nx-t's rule carry its own weight: it has to be the thing
     doing the clipping, and the ellipsis has to be on. */
  const clip = JSON.parse(String(await ev(`(() => {
    const t = document.querySelector('#noticesCard .nx-t');
    if (!t) return JSON.stringify({ missing: true });
    const s = getComputedStyle(t);
    return JSON.stringify({
      overflowing: t.scrollWidth > t.clientWidth + 1,
      scrollWidth: Math.round(t.scrollWidth),
      clientWidth: Math.round(t.clientWidth),
      ellipsis: s.textOverflow,
      overflow: s.overflowX,
      wrap: s.whiteSpace,
      text: (t.textContent || '').trim().slice(0, 40)
    });
  })()`)));
  ok('  the long title is cut off with an ellipsis, not just hidden',
    !clip.missing && clip.overflowing && clip.ellipsis === 'ellipsis'
      && clip.overflow !== 'visible',
    clip.missing ? 'no .nx-t in the card'
      : clip.text + '... ' + clip.scrollWidth + 'px of words in '
        + clip.clientWidth + 'px, text-overflow:' + clip.ellipsis
        + ', overflow-x:' + clip.overflow + ', white-space:' + clip.wrap);

  if (wantShots) {
    await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 945, deviceScaleFactor: 1, mobile: false });
    await sleep(700);
    let r2 = await send('Page.captureScreenshot', { format: 'png' });
    if (r2.data) fs.writeFileSync(path.join(SHOTS, 'notices--hub-1920.png'), Buffer.from(r2.data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await sleep(700);
    r2 = await send('Page.captureScreenshot', { format: 'png' });
    if (r2.data) fs.writeFileSync(path.join(SHOTS, 'notices--hub-375.png'), Buffer.from(r2.data, 'base64'));
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 950, deviceScaleFactor: 1, mobile: false });
  await sleep(600);

  /* FORMATTED IN LATEST, which is where the whole notice lives. */
  await ev('openLatest();1'); await sleep(1200);
  const latest = String(await ev("(function(){var p=document.getElementById('latestPanel');"
    + "return p?p.innerHTML:''})()"));
  ok('  the whole notice is in Latest, with its bold and its list',
    /<b>choir<\/b>|<strong>choir<\/strong>/i.test(latest) && /<li>Thursdays at 7<\/li>/i.test(latest),
    latest.replace(/\s+/g, ' ').slice(0, 200));
  await ev('closeLatest();1'); await sleep(400);

  /* THE WELCOME WIDGET IS GONE, and so is the prompt. */
  ok('  the welcome widget is gone from the page',
    !(await ev("!!document.getElementById('bodyCard') || !!document.getElementById('bodyContent')")));
  ok('  and nothing on this page asks for raw HTML in a prompt',
    Number(await ev('window.__prompted || 0')) === 0,
    'prompt() was called ' + String(await ev('window.__prompted || 0')) + ' times');
  ok('  "Post a notice" is offered to somebody who can post',
    /Post a notice/.test(widget), widget.slice(0, 120));

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
