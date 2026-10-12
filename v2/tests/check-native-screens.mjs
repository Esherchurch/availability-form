/* THE SCREENS THE APP DRAWS ITSELF (APP-DESIGN-BRIEF §7d B).
 *
 *   node tests/check-native-screens.mjs            (from v2/, emulators up)
 *   node tests/check-native-screens.mjs --shots
 *
 * §7d B: "native screens for the everyday things in the mock-up, drawn
 * inside the app rather than opened as pages". This covers the two that
 * landed together:
 *
 *   THIS SUNDAY - the order of service, read-only, with songs and the
 *   YouTube buttons. What a musician opens standing up on a Sunday
 *   morning: what we are singing, in what key, with the leader's note.
 *
 *   THE PIN BOARD - the team's board, readable, with "Add an idea".
 *   stickynotes is a 3,200px cork board you drag notes around on, which
 *   is right on a desk and not a thing to do with a thumb.
 *
 * BOTH READ WHAT THE REAL PAGES WRITE, and that is the point of the
 * seeding here: a service document as the planner saves it, a board
 * document as stickynotes saves it. If either shape changes, this fails
 * rather than the app quietly showing an empty screen.
 *
 * Synthetic people, songs and notes throughout.
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
const PORT = 9681, SERVE = 8913;
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';

const ME = { email: 'native.tester@example.invalid', name: 'Native Synthetic', member: 'ab_native' };
const SONG = 'Synthetic Song Of Morning';
const YT = 'https://www.youtube.com/watch?v=synthetic-morning';

/* The coming Sunday, worked out here rather than asked of the app. */
const SUNDAY = (() => {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  const m = String(d.getMonth() + 1), day = String(d.getDate());
  return d.getFullYear() + '-' + m.padStart(2, '0') + '-' + day.padStart(2, '0');
})();

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

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });

  let up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  const uid = up.localId;
  await put('addressBook/' + ME.member, {
    name: ME.name, email: ME.email, markers: ['Worship Team'], adminFor: [],
    churchMember: false, archived: false, isMinor: false });
  await put('users/' + uid, {
    uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active',
    linkedBy: 'admin', teams: ['Worship Team'], adminFor: [], masterAdmin: false,
    attender: true, churchMember: false });

  /* A song with a YouTube link - the button §7b and §7d both say must
     not be lost. */
  await put('songs/' + SONG.toLowerCase().replace(/\s+/g, '-'), {
    title: SONG, normalized: SONG.toLowerCase(), ccli: '8888888', youtube: YT,
    files: [{ type: 'Chord Sheet', key: 'D', url: 'https://example.invalid/d.pdf' }] });

  /* The service on the rota, with this person on it. */
  await put('events/ev_native_sunday', {
    termLabel: 'Autumn 2026', teams: ['Worship Team'], roles: ['Guitar', 'Keyboard'],
    /* 07:00, EARLIER THAN ANYTHING ELSE on that date in a shared
       emulator. The screen shows the earliest service that day for
       this space's teams, and another check's fixture sits on the
       same Sunday at 08:00 - without this the screen correctly chose
       theirs and this check read it as the app being wrong. Seeding
       a time rather than deleting somebody else's fixture. */
    archived: false, draft: false, date: SUNDAY, startTime: '07:00',
    type: 'Sunday Morning Worship', description: 'Communion',
    serviceLeader: 'Leader Synthetic', speaker: 'Speaker Synthetic',
    assignments: { Guitar: { id: ME.member, name: ME.name },
                   Keyboard: { id: 'ab_native_other', name: 'Other Synthetic' } } });

  /* The order of service, in the shape the planner's spSave writes. */
  await put('services/svc_native', {
    date: SUNDAY, worshipLeader: ME.name, serviceNotes: 'Communion this week',
    introText: '', outroText: '', roleNotes: {},
    order: [
      { type: 'song', title: SONG, keys: ['D'], notes: 'Starts quietly' },
      { type: 'item', title: 'Welcome and Notices' }
    ] });

  /* NOTICES, for the bell. One church-wide (no teams), one for this
     person's team, and one for a team they are NOT on - because "a
     notice they should not see" is the half of this that matters and
     an empty list cannot prove it. */
  await put('news/nt_all', { title: 'NOTICE for everyone', body: '<p>Everyone sees this.</p>',
    teams: [], createdAt: new Date().toISOString(), pinned: false });
  await put('news/nt_mine', { title: 'NOTICE for Worship', body: '<p>Worship <b>only</b>.</p>',
    teams: ['Worship Team'], createdAt: new Date().toISOString(), pinned: false });
  await put('news/nt_theirs', { title: 'NOTICE for Kids Church', body: '<p>Not for them.</p>',
    teams: ['Kids Church'], createdAt: new Date().toISOString(), pinned: false });

  /* The board, in the shape stickynotes writes: notes with createdAt,
     one archived so "archived ones are left out" is a question. */
  await put('worshipBoardState/state', {
    pages: [{ id: 'main', title: 'General Board', desc: '' }],
    notes: [
      { id: 'n1', pageId: 'main', author: 'Older Synthetic', cat: 'idea', title: '',
        body: 'An older idea', createdAt: 1000, archived: false },
      { id: 'n2', pageId: 'main', author: 'Newer Synthetic', cat: 'idea', title: '',
        body: 'The newest idea', createdAt: 9000, archived: false },
      { id: 'n3', pageId: 'main', author: 'Gone Synthetic', cat: 'idea', title: '',
        body: 'An archived idea', createdAt: 5000, archived: true }
    ] });

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
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-native-' + process.pid),
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

  const ev = makeEval(send, "native-screens");
  const until = async (what, expr, tries = 50) => {
    let last = '';
    for (let i = 0; i < tries; i++) {
      await sleep(400);
      last = String(await ev(expr, true));
      if (last === 'yes') return true;
    }
    ok(what, false, 'gave up, last: ' + last);
    return false;
  };
  const shot = async (name) => {
    if (!wantShots) return;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'native--' + name + '.png'), Buffer.from(r.data, 'base64'));
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
  await until('signed in before the app opens',
    'firebase.auth(EGBCAuth.app).currentUser'
    + ' && firebase.auth(EGBCAuth.app).currentUser.uid === ' + JSON.stringify(uid) + ' ? "yes" : "no"');
  await until('the session carries a working token',
    'firebase.auth(EGBCAuth.app).currentUser.getIdToken().then(function(t){return t?"yes":"no"})'
    + '.catch(function(){return "no"})', 20);

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
  let drawn = '';
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    drawn = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
      + '.getAttribute("data-drawn") || ""'));
    if (drawn.indexOf(uid + ':') === 0) break;
  }
  ok('the app drew', drawn.indexOf(uid + ':') === 0, 'data-drawn: ' + (drawn || '(none)'));

  /* ---- This Sunday --------------------------------------------------- */
  console.log('\nWorship & AV \u25b8 This Sunday:');
  ok('  "This Sunday" is a tab, not a page to open',
    String(await ev('EGBCApp.tabsFor("worship").map(function(t){return t[0]}).join(",")')).indexOf('sunday') !== -1,
    String(await ev('EGBCApp.tabsFor("worship").map(function(t){return t[0]}).join(",")')));
  await ev('EGBCApp.go("worship","sunday");1');
  await until('  it finds Sunday\u2019s plan',
    '(function(){var c=document.getElementById("egbc-content");'
    + 'return (c && !/Finding Sunday/.test(c.textContent)) ? "yes" : "no"})()', 40);
  const sun = String(await ev('(document.getElementById("egbc-content")||{}).textContent'
    + '.replace(/\\s+/g," ").trim()'));
  ok('  it names the day', new RegExp(new Date(SUNDAY + 'T00:00:00')
    .toLocaleDateString('en-GB', { month: 'long' })).test(sun), sun.slice(0, 120));
  ok('  it says what this person is on', /You are on/.test(sun) && /Guitar/.test(sun), sun.slice(0, 180));
  ok('  the song is in the order, numbered, with its key and the note',
    /1\. Synthetic Song Of Morning/.test(sun) && /Key D/.test(sun) && /Starts quietly/.test(sun),
    sun.slice(0, 300));
  ok('  and the non-song item is in it too', /Welcome and Notices/.test(sun), sun.slice(0, 300));
  /* THE YOUTUBE BUTTON, named in §7b and §7d as not to be lost. */
  const listen = String(await ev('(function(){var a=document.querySelectorAll("#egbc-content a[href]");'
    + 'for(var i=0;i<a.length;i++){if(/youtube/.test(a[i].href))return a[i].href}'
    + 'return "(none)"})()'));
  ok('  with a Listen button that goes to the song on YouTube', listen === YT, listen);
  ok('  and who else is on', /Other Synthetic/.test(sun) && /Leader Synthetic/.test(sun), sun.slice(-200));
  await shot('this-sunday');
  ok('  nothing on the console', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  /* ---- the pin board ------------------------------------------------- */
  console.log('\nWorship & AV \u25b8 Team \u25b8 Pin boards:');
  errs.length = 0;
  await ev('EGBCApp.go("worship","team");1'); await sleep(700);
  const rowAct = String(await ev('(function(){var b=document.querySelector('
    + '\'#egbc-content [data-act^="sheet:board-"]\');return b?b.dataset.act:"(no row)"})()'));
  ok('  the Team tab has a Pin boards row, and it opens a sheet',
    rowAct === 'sheet:board-worship', rowAct);
  await ev('document.querySelector(\'#egbc-content [data-act^="sheet:board-"]\').click();1');
  await until('  the board opens and finds its notes',
    '(function(){var s=document.querySelector(".sheet");'
    + 'return (s && !/Finding the board/.test(s.textContent)) ? "yes" : "no"})()', 40);
  const board = String(await ev('(function(){var s=document.querySelector(".sheet");'
    + 'return s?s.textContent.replace(/\\s+/g," ").trim():"(no sheet)"})()'));
  ok('  the notes are there, newest first',
    board.indexOf('The newest idea') !== -1 && board.indexOf('An older idea') !== -1
      && board.indexOf('The newest idea') < board.indexOf('An older idea'), board.slice(0, 200));
  ok('  with who wrote each one', /Newer Synthetic/.test(board) && /Older Synthetic/.test(board),
    board.slice(0, 200));
  ok('  AN ARCHIVED NOTE IS NOT SHOWN', board.indexOf('An archived idea') === -1, board.slice(0, 240));
  ok('  and "Add an idea" is the first thing offered', /Add an idea/.test(board), board.slice(0, 120));
  /* BY NAME, NOT BY BEING FIRST. This used to take the first action
     mentioning stickynotes and expect the cork board's address. There
     are two of them now - §7f made "Add an idea" open the add form
     straight away (&add=1), and it comes first - so the check was
     reading the Add row and reporting the wrong one. Both are asserted
     now, which is also what the brief asks for: "'Add an idea' opens the
     add form in the app" and "'The whole board' opens stickynotes in app
     mode". */
  const acts = JSON.parse(String(await ev('(function(){'
    + 'var a=[].slice.call(document.querySelectorAll(".sheet [data-act]"));'
    + 'var out={};a.forEach(function(b){'
    + ' var t=(b.textContent||"").replace(/\\s+/g," ").trim();'
    + ' if(/Add an idea/.test(t)) out.add=b.dataset.act;'
    + ' if(/The whole board/.test(t)) out.whole=b.dataset.act;});'
    + 'return JSON.stringify(out)})()')));
  ok('  with the whole cork board one tap further on, and the RIGHT board',
    acts.whole === 'open:stickynotes.html?board=worship', JSON.stringify(acts));
  ok('  and "Add an idea" opens the add form on that same board',
    acts.add === 'open:stickynotes.html?board=worship&add=1', JSON.stringify(acts));
  await shot('pin-board');
  ok('  nothing on the console', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  /* ---- THE BELL, AND THE RED DOT (Martin, 12 Oct 2026) ------------
     "Behind the bell with a red dot - harder to ignore a red dot on a
     small screen." The dot counts the notices this person has not
     seen; opening the sheet marks them seen and clears it; somebody a
     notice is not for never sees it at all. */
  console.log('\nthe bell, and the red dot:');
  errs.length = 0;
  /* Nothing seen yet: the seen mark is the same localStorage key the
     hub's Latest writes, so this starts from a cleared one. */
  await ev('localStorage.removeItem("egbc-hub-news-seen");1');
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
  for (let i2 = 0; i2 < 60; i2++) {
    await sleep(500);
    const d2 = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
      + '.getAttribute("data-drawn") || ""'));
    if (d2.indexOf(uid + ':') === 0) break;
  }
  await until('  the notices have loaded',
    '(typeof EGBCAppNotices === "undefined") ? "no" : "yes"', 40);
  await sleep(1800);
  await ev('EGBCApp.draw();1'); await sleep(400);

  const bellSel = '[data-act="sheet:notices"]';
  const bell = String(await ev('(function(){var b=document.querySelector(\'' + bellSel + '\');'
    + 'if(!b) return "(no bell)";'
    + 'var r=b.getBoundingClientRect();'
    + 'var dot=b.querySelector(".badge");'
    + 'return JSON.stringify({w:Math.round(r.width),h:Math.round(r.height),'
    + ' dot: dot?dot.textContent.trim():"", label: b.getAttribute("aria-label")||""})})()'));
  ok('  the bell is in the top bar', bell !== '(no bell)', bell);
  const bq = JSON.parse(bell === '(no bell)' ? '{}' : bell);
  /* THE DOT IS WHAT IS UNSEEN, and on a shared emulator that is however
     many notices are in it - not just the three this check seeds.
     Asserting "2" read the right number, 8, as a fault. What has to be
     true is that the dot and the list agree and that there is one. */
  const unseenNow = Number(await ev('EGBCAppNotices.unseen()')) || 0;
  ok('  with a red dot, counting what has not been seen',
    bq.dot === (unseenNow > 9 ? '9+' : String(unseenNow)) && unseenNow >= 2,
    'the dot says "' + bq.dot + '", unseen() says ' + unseenNow);
  ok('  and the count in words for a screen reader', /not seen/.test(bq.label || ''), bq.label);

  /* SOMEBODY IT IS NOT FOR NEVER SEES IT. This person is on Worship
     Team only, so the Kids Church notice is not theirs - and a count
     of 3 would mean the team filter had gone. */
  await ev('document.querySelector(\'' + bellSel + '\').click();1');
  await until('  tapping the bell opens the notices',
    '(function(){var s=document.querySelector(".sheet");'
    + 'return (s && /Notices/.test(s.textContent)) ? "yes" : "no"})()', 30);
  const sheetTxt = String(await ev('(function(){var s=document.querySelector(".sheet");'
    + 'return s?s.textContent.replace(/\\s+/g," ").trim():"(none)"})()'));
  ok('  the church-wide notice is in it', /NOTICE for everyone/.test(sheetTxt), sheetTxt.slice(0, 160));
  ok('  and their own team\u2019s', /NOTICE for Worship/.test(sheetTxt), sheetTxt.slice(0, 160));
  ok('  AND A NOTICE FOR A TEAM THEY ARE NOT ON IS NOT',
    !/NOTICE for Kids Church/.test(sheetTxt), sheetTxt.slice(0, 220));
  const sheetHtml = String(await ev('(function(){var s=document.querySelector(".sheet");'
    + 'return s?s.innerHTML:""})()'));
  ok('  with the notice\u2019s own bold, not a flattened line',
    /<b>only<\/b>|<strong>only<\/strong>/i.test(sheetHtml), sheetHtml.slice(0, 200));

  /* OPENING IS READING: the dot clears. */
  await sleep(700);
  const after = String(await ev('(function(){var b=document.querySelector(\'' + bellSel + '\');'
    + 'if(!b) return "(no bell)";var d=b.querySelector(".badge");return d?d.textContent.trim():"none"})()'));
  ok('  opening them clears the dot', after === 'none', 'the dot says "' + after + '"');
  const seenMark = String(await ev('localStorage.getItem("egbc-hub-news-seen")||""'));
  ok('  and it is the hub\u2019s own seen record, so Latest agrees',
    !!seenMark && seenMark !== '0', seenMark);
  await shot('bell-notices');
  ok('  nothing on the console', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

  if (wantShots) console.log('\nscreenshots in tests/shots/');
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
