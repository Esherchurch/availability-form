/* Does the hub's home page fit on one screen?
 *
 *   node tests/check-home-fits.mjs            (from v2/, emulators running)
 *   node tests/check-home-fits.mjs --shots    and save pictures
 *
 * WHY. Martin: "this needs to see everything in one. you have to scroll quite
 * a way down to see the team charter." At 1920x945 the page was 1831px tall
 * and the charter started at 1212px, so the thing that explains what the team
 * is for was two screens down.
 *
 * NEXT-BRIEF 17b: at 1440x900 and 1920x1080 everything on the home page is
 * visible without scrolling, and at phone width the order is My serving,
 * Meetings, Pin board, Charter. Nothing is removed - it is made smaller or
 * folded.
 *
 * This seeds a deliberately FULL page - six rota events, several meetings,
 * five pin notes, a charter with five headings, six notices - because a page
 * that only fits when there is nothing on it has not been fixed. Then it
 * measures, and prints what sticks out below the fold so the next person can
 * see which card to shrink.
 *
 * Synthetic throughout. Nothing here reads the church's data.
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
const PORT = 9632, SERVE = 8873;
const PROJECT = 'egbc-worship-planner';
const wantShots = process.argv.includes('--shots');
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

/* A browser window is not the viewport: the tab strip and the address bar come
   off the top. These are the two sizes 17b names, with the usual chrome taken
   off, which is the height a page actually gets. */
const SIZES = [
  { label: '1440x900', w: 1440, h: 900, viewport: 900 - 120 },
  { label: '1920x1080', w: 1920, h: 1080, viewport: 1080 - 120 }
];
const BANNER_MAX = 120;   /* "about 100px" */

const DAY = 86400000;
const d10 = ms => new Date(ms).toISOString().slice(0, 10);

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 320) : '')); };

const rest = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: 'localhost', port: 8181, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej); req.end(data);
});
const val = v => Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : v && typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } }
  : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? { integerValue: String(v) }
  : { stringValue: String(v) };
const docPath = c => '/v1/projects/' + PROJECT + '/databases/(default)/documents/' + c;
const put = (p, fields) => rest('PATCH', docPath(p), { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, val(v)])) });

const makeAccount = () => new Promise((res, rej) => {
  const data = JSON.stringify({ email: ACCOUNT.email, password: ACCOUNT.pw, returnSecureToken: true });
  const req = http.request({ host: 'localhost', port: 9099, method: 'POST',
    path: '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  req.on('error', rej); req.end(data);
});

const CHARTER_HTML =
  '<h2>Our Identity and How We Carry Ourselves</h2><p>Invented words for the check. ' +
  'They are long enough to be worth folding away, which is the whole point of the card.</p>' +
  '<h2>What We Are Here To Do</h2><p>More invented words, of about the same length, so the ' +
  'folded card and the open one are plainly different heights.</p>' +
  '<h2>How We Work Together</h2><p>And again. A charter on the real site runs to several ' +
  'screens, so three paragraphs is on the modest side.</p>' +
  '<h2>What We Ask Of Each Other</h2><p>Invented. Nobody real is named anywhere in this file.</p>' +
  '<h2>If Something Is Wrong</h2><p>Invented. Nobody real is named anywhere in this file.</p>';

/* The blocks of the home page, by the id they are drawn into. Anything that
   sticks out below the fold is named in the output, so a failure says which
   card to shrink rather than only that the page is too tall. */
const BLOCKS = ['hero', 'waitingCard', 'pinned', 'servingCard', 'meetingsCard',
  'pinBoardCard', 'myEventsCard', 'charterCard', 'bodyCard', 'teamPanels'];

/* At phone width these four must come in this order (17b). */
const PHONE_ORDER = ['servingCard', 'meetingsCard', 'pinBoardCard', 'charterCard'];

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

/* Read every block's top and bottom, in page coordinates. */
const MEASURE = "(function(){var out={};" +
  "['" + BLOCKS.join("','") + "'].forEach(function(id){var el=document.getElementById(id);" +
  "if(!el){out[id]=null;return}var r=el.getBoundingClientRect();" +
  "if(!el.offsetParent&&r.height===0){out[id]=null;return}" +
  "out[id]={top:Math.round(r.top+window.scrollY),bottom:Math.round(r.bottom+window.scrollY),h:Math.round(r.height)}});" +
  "var latest=document.getElementById('newsWrapper');" +
  "if(latest&&latest.offsetParent){var lr=latest.closest('.card').getBoundingClientRect();" +
  "out.latestColumn={top:Math.round(lr.top+window.scrollY),bottom:Math.round(lr.bottom+window.scrollY),h:Math.round(lr.height)}}" +
  "out.__page={scrollHeight:document.documentElement.scrollHeight," +
  "bodyScroll:document.body.scrollHeight,viewport:window.innerHeight};" +
  "return JSON.stringify(out)})()";

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
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-home-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await makeAccount();
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 780, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
  const uid = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""');
  if (!uid) { console.error('Could not sign in as ' + ACCOUNT.email); server.close(); chrome.kill(); process.exit(2); }

  /* ---- a deliberately full page ---------------------------------------- */
  const ME = 'ab_home_tester';
  await put('addressBook/' + ME, { name: 'Home Tester', email: ACCOUNT.email, markers: ['Worship Team'] });
  await put('users/' + uid, { uid, email: ACCOUNT.email, name: 'Home Tester', memberId: ME,
    status: 'active', teams: ['Worship Team'], adminFor: [], masterAdmin: false, linkedBy: 'admin' });

  for (let i = 0; i < 6; i++) {
    await put('events/home_ev_' + i, {
      termLabel: 'Autumn 2026', teams: ['Worship Team'], roles: ['Guitar', 'Keyboard'],
      archived: false, draft: false, date: d10(Date.now() + (3 + i * 7) * DAY),
      startTime: '08:00', endTime: '11:30', type: 'Sunday Morning Worship',
      description: 'Communion', serviceLeader: 'Leader Synthetic', speaker: 'Speaker Synthetic',
      videoRoom: i === 0 ? 'synthetic-room' : '',
      assignments: { Guitar: { id: ME, name: 'Home Tester' } }
    });
  }
  for (let i = 0; i < 4; i++) {
    await put('calEvents/home_mtg_' + i, {
      title: 'Synthetic team meeting ' + (i + 1), teams: ['Worship Team'],
      date: d10(Date.now() + (2 + i * 5) * DAY), startTime: '19:30', endTime: '21:00',
      videoRoom: 'synthetic-room-' + i, kind: 'meeting'
    });
  }
  const now = Date.now();
  await rest('PATCH', docPath('worshipBoardState/state'), { fields: {
    pages: { arrayValue: { values: [] } },
    notes: { arrayValue: { values: [0, 1, 2, 3, 4].map(i => val({
      id: 'home_note_' + i, title: 'Invented note number ' + (i + 1) + ', long enough to wrap on a narrow card',
      author: 'Synthetic Person ' + (i + 1), body: '', createdAt: now - i * DAY, archived: false })) } }
  } });
  /* CHARTER_PAGE in hub-app.js: Worship Team reads 'wider-worship-charter'.
     My first run seeded two plausible-looking ids and neither was it, so the
     card was not drawn at all and the check said "no charter card drawn" -
     which was true, and was my fault, not the page's. */
  await put('pageContent/wider-worship-charter', { title: 'Worship & AV Team Charter', html: CHARTER_HTML });
  /* loadHero() reads portal/dashboardContent - the welcome words are its
     `body`. Seeding portal/hubContent left the card saying "Nothing here
     yet", which measured a card that was not as tall as the real one. */
  await put('portal/dashboardContent', { body: '<h2>Welcome</h2><p>Invented welcome words for ' +
    'the check, about as long as the real ones are on the hub today.</p>' });
  /* One PATCH per notice, with createdAt in it. My first version did a second
     PATCH to add createdAt, and a REST PATCH with no updateMask REPLACES the
     document - so every notice lost its title and the panel showed six blank
     cards. The check caught it; the lesson is that the second call was never
     adding a field, it was rewriting the row. */
  const old = JSON.parse((await rest('GET', docPath('news') + '?pageSize=300')).body || '{}').documents || [];
  for (const d of old) await rest('DELETE', '/v1/' + d.name.slice(d.name.indexOf('projects/')));
  for (let i = 0; i < 6; i++) {
    await rest('PATCH', docPath('news/home_news_' + i), { fields: {
      title: val('Invented notice number ' + (i + 1)),
      body: val('<p>Invented words, a sentence or two long.</p>'),
      teams: val([]), date: val(''), until: val(''),
      pinned: val(false), requireAck: val(false),
      postedBy: val('Home Tester'), ackedBy: val([]),
      createdAt: { timestampValue: new Date(now - i * DAY).toISOString() }
    } });
  }
  console.log('seeded a full page: 6 rota events, 4 meetings, 5 pin notes, a 5-heading charter, 6 notices\n');

  const loadHub = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    watch.reset();
    await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(13000);
    await ev('window.alert=function(){};window.confirm=function(){return false};1');
    await ev("(function(){var b=document.querySelector('#pickList .pick-t');if(b)b.click();})();1");
    await sleep(3000);
  };

  for (const s of SIZES) {
    await loadHub(s.w, s.viewport);
    const m = JSON.parse(String(await ev(MEASURE)) || '{}');
    const page = m.__page || {};
    const over = page.scrollHeight - page.viewport;

    console.log('\nat ' + s.label + '  (a browser window that tall gives the page ' + s.viewport + 'px)');
    const tall = Object.entries(m).filter(([k, v]) => v && k !== '__page' && v.bottom > page.viewport)
      .map(([k, v]) => k + ' ends at ' + v.bottom);
    ok('  the whole home page is above the fold', over <= 2,
      'page is ' + page.scrollHeight + 'px, the screen gives ' + page.viewport + 'px' +
      (over > 2 ? ' - ' + over + 'px too tall.\n          below the fold: ' + (tall.join('; ') || '(nothing named)') : ''));
    ok('  the banner is about 100px', (m.hero ? m.hero.h : 0) <= BANNER_MAX && (m.hero ? m.hero.h : 0) > 0,
      'banner is ' + (m.hero ? m.hero.h : 0) + 'px (allowed up to ' + BANNER_MAX + ')');
    ok('  the charter is on the first screen', !!m.charterCard && m.charterCard.bottom <= page.viewport,
      m.charterCard ? 'charter runs ' + m.charterCard.top + '-' + m.charterCard.bottom : 'no charter card drawn');
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    console.log('          ' + Object.entries(m).filter(([k, v]) => v && k !== '__page')
      .map(([k, v]) => k + ':' + v.top + '-' + v.bottom).join('  '));

    if (wantShots) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      if (r.data) fs.writeFileSync(path.join(SHOTS, 'home--' + s.label + '.png'), Buffer.from(r.data, 'base64'));
    }
  }

  /* ---- Latest is a pop-out, with an unread count --------------------- */
  console.log('\nLatest as a pop-out');
  await loadHub(1440, SIZES[0].viewport);
  const btn = String(await ev("(function(){var b=document.getElementById('latestBtn');return b?(b.innerText||'').replace(/\\s+/g,' ').trim():'(no button)'})()"));
  ok('  there is a Latest button in the top bar', /Latest/i.test(btn), btn);
  ok('  with a count of what has not been read', /\d/.test(btn), btn);
  ok('  the news is not taking a column of its own',
    !(await ev("(function(){var n=document.getElementById('newsWrapper');return !!(n&&n.offsetParent&&n.closest('.wrap'))})()")),
    'the Latest card has left the three-column row');
  await ev("openLatest();1"); await sleep(1200);
  const open = String(await ev("(function(){var p=document.getElementById('latestPanel');return p&&p.classList.contains('on')?(p.innerText||'').replace(/\\s+/g,' ').trim():'(did not open)'})()"));
  ok('  it opens from the right with the notices in it', /Invented notice number 1/.test(open), open.slice(0, 180));
  ok('  and the count goes once they have been seen',
    !/\d/.test(String(await ev("(function(){var b=document.getElementById('latestBtn');return b?(b.innerText||''):''})()"))),
    await ev("(function(){var b=document.getElementById('latestBtn');return b?(b.innerText||'').trim():''})()"));
  ok('  the rest of the page is dimmed behind it',
    (await ev("(function(){var s=document.getElementById('latestScrim');if(!s)return 'no scrim';var c=getComputedStyle(s);return c.opacity+'/'+c.zIndex+'/'+c.display+'/'+c.backgroundColor})()")) !== 'no scrim' &&
    String(await ev("getComputedStyle(document.getElementById('latestScrim')).opacity")) === '1',
    await ev("(function(){var s=document.getElementById('latestScrim');if(!s)return 'no scrim';var c=getComputedStyle(s);return 'opacity '+c.opacity+', z '+c.zIndex+', '+c.backgroundColor})()"));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  if (wantShots) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'home--latest-open.png'), Buffer.from(r.data, 'base64'));
  }

  /* ---- the phone ------------------------------------------------------ */
  console.log('\nat 375px (a phone)');
  await loadHub(375, 812);
  const order = JSON.parse(String(await ev(MEASURE)) || '{}');
  const seen = PHONE_ORDER.filter(k => order[k]).sort((a, b) => order[a].top - order[b].top);
  ok('  the order is My serving, Meetings, Pin board, Charter',
    JSON.stringify(seen) === JSON.stringify(PHONE_ORDER),
    'on screen: ' + seen.join(' > ') + '\n          wanted   : ' + PHONE_ORDER.join(' > '));
  ok('  everything is still there, just stacked',
    PHONE_ORDER.every(k => order[k]),
    PHONE_ORDER.filter(k => !order[k]).join(', ') || 'all four cards drawn');
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  if (wantShots) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'home--375.png'), Buffer.from(r.data, 'base64'));
    console.log('\nscreenshots in tests/shots/');
  }

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
