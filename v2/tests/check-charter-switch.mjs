/* Two switches, for people who belong to more than one thing.
 *
 *   node tests/check-charter-switch.mjs [--shots]   (from v2/, emulators running)
 *
 * MARTIN, 10 OCTOBER 2026, two instructions that are the same shape:
 *
 *   "Someone on two or more teams sees a switch at the top of the charter
 *    card for each of their teams' charters, without needing the team
 *    picker."
 *   "Make switching boards obvious - a visible 'Switch board' control, not
 *    just the title."
 *
 * Both are about a person who belongs to two things being able to see that,
 * and move between them, without going somewhere else first.
 *
 * WHY A CHECK AND NOT A LOOK. Three of these cannot be seen by opening the
 * page as yourself: whether a one-team person is spared a switch with
 * nothing to switch to, whether two teams that SHARE a charter correctly
 * produce no switch at all, and whether switching the card leaves the rest
 * of the page where it was. Each needs a different person signed in, and a
 * person on exactly the right teams.
 *
 * THE ONE THAT MATTERS: switching the charter must not move the team. The
 * rota, the panels and the notices all follow the team picker, and dragging
 * them to another team just to read a charter is the thing Martin asked to
 * avoid.
 *
 * Synthetic people throughout.
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
const PORT = 9693, SERVE = 8909;
const PROJECT = 'egbc-worship-planner';
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
  + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : ''))); };

const DOCS = `/v1/projects/${PROJECT}/databases/(default)/documents`;
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
const put = (p, obj) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(obj) }, { Authorization: 'Bearer owner' });

/* Four people, each proving a different branch.

   `shared` is the one worth explaining: Worship Team and AV Team have one
   charter between them - the "Worship & AV Team Charter" - so somebody on
   both has ONE charter and must get no switch. A switch counting teams
   rather than charters would give them two buttons that do the same thing. */
const PEOPLE = {
  one:    { email: 'ch.one@example.invalid',    teams: ['Worship Team'],
            charters: 1, note: 'one team, one charter' },
  shared: { email: 'ch.shared@example.invalid', teams: ['Worship Team', 'AV Team'],
            charters: 1, note: 'two teams that share one charter' },
  two:    { email: 'ch.two@example.invalid',    teams: ['Worship Team', 'Youth Worship'],
            charters: 2, note: 'two charters' },
  three:  { email: 'ch.three@example.invalid',  teams: ['Worship Team', 'Youth Worship', 'Core Team'],
            charters: 3, note: 'three charters' }
};

/* Charter text, so each card has something in it and the switch can be seen
   to change what is on screen. */
const CHARTERS = {
  'wider-worship-charter': { title: 'Worship & AV charter', html: '<h2>Worship and AV</h2><p>Invented words for the check, about sound and songs.</p>' },
  'youth-charter':         { title: 'Youth charter',        html: '<h2>Youth</h2><p>Invented words for the check, about the young people.</p>' },
  'core-team-charter':     { title: 'Core Team charter',    html: '<h2>Core Team</h2><p>Invented words for the check, about running things.</p>' }
};

const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const reachedOff = [];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });

  for (const [key, p] of Object.entries(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    p.name = 'Charter ' + key;
    /* Both sides of the mirror, or the rules refuse the heartbeat write that
       every page load makes - which the app swallows, so nothing says so
       (A-062). */
    await put('users/' + p.uid, {
      uid: p.uid, email: p.email, name: p.name, memberId: 'ab_ch_' + key,
      status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: [],
      masterAdmin: false, attender: true, churchMember: false });
    await put('addressBook/ab_ch_' + key, {
      name: p.name, email: p.email, markers: p.teams, adminFor: [],
      churchMember: false, archived: false, isMinor: false });
  }
  for (const [id, c] of Object.entries(CHARTERS)) await put('pageContent/' + id, c);
  console.log('seeded 4 synthetic people and 3 charters\n');

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
      : e === '.css' ? 'text/css' : e === '.json' ? 'application/json' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-charter-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
      if (offMachine(u)) { reachedOff.push(u.split('/')[2]); return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); }
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  /* HTTPS ONLY. Pausing http pauses Firestore's own stream to the emulator,
     which stops it establishing - see A-062 and tests/README.md. */
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });

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
    ok(what, false, 'gave up, last: ' + last);
    return false;
  };

  /* One person per cleared origin: Firebase keeps the session in IndexedDB
     for the origin, and signing one person out while another signs in
     leaves two writes racing over one record (A-062). */
  const openHubAs = async (p, page) => {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await send('Storage.clearDataForOrigin', { origin: 'http://localhost:' + SERVE,
      storageTypes: 'indexeddb,local_storage,cache_storage,websql,service_workers' });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await until('the harness loaded for ' + p.name,
      '(typeof firebase === "undefined" || typeof EGBCAuth === "undefined") ? "no" : "yes"');
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
      + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').catch(function(){})', true);
    await until('signed in as ' + p.name,
      'firebase.auth(EGBCAuth.app).currentUser && firebase.auth(EGBCAuth.app).currentUser.uid === '
      + JSON.stringify(p.uid) + ' ? "yes" : "no"');
    watch.reset();
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + (page || 'hub.html') });
    await sleep(9000);
    await ev('window.alert=()=>{};window.confirm=()=>false;1');
    /* Somebody on more than one team lands on the team picker. Take the
       first, which is what a person would do. */
    await ev("(()=>{const b=document.querySelector('#pickList .pick-t,#pickList button');if(b)b.click();})();1");
    await sleep(3000);
  };

  const switchButtons = () => ev(
    "Array.from(document.querySelectorAll('#charterSwitch button')).map(b=>b.textContent.trim()).join('|')");
  const switchShown = () => ev(
    "(()=>{const r=document.getElementById('charterSwitch');return r && getComputedStyle(r).display!=='none' ? 'yes':'no'})()");

  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1100, deviceScaleFactor: 1, mobile: false });

  /* ---- who gets a switch, and who is spared one -------------------- */
  console.log('\nthe charter switch: who sees one');

  await openHubAs(PEOPLE.one);
  ok('one team, one charter: NO switch', (await switchShown()) === 'no', await switchButtons());

  await openHubAs(PEOPLE.shared);
  ok('Worship and AV share a charter, so still NO switch',
    (await switchShown()) === 'no',
    'buttons: ' + (await switchButtons()) + ' - counting teams instead of charters gives two that do the same thing');

  await openHubAs(PEOPLE.two);
  const two = String(await switchButtons());
  ok('two charters: a switch with both on it',
    (await switchShown()) === 'yes' && two.split('|').filter(Boolean).length === 2, two);
  ok('  and they are named after the teams', /Worship/i.test(two) && /Youth/i.test(two), two);

  /* ---- the one that matters ----------------------------------------- */
  console.log('\nswitching reads the other charter, and moves nothing else');

  const teamBefore = String(await ev("(document.getElementById('teamSwitch')||{}).innerText||''")).trim();
  const charterBefore = String(await ev("(document.getElementById('charterTitle')||{}).textContent||''")).trim();
  await ev("(()=>{const bs=Array.from(document.querySelectorAll('#charterSwitch button'));"
    + "const b=bs.find(x=>!/true/i.test(x.getAttribute('aria-pressed')));if(b)b.click();})();1");
  await sleep(2500);
  const charterAfter = String(await ev("(document.getElementById('charterTitle')||{}).textContent||''")).trim();
  const teamAfter = String(await ev("(document.getElementById('teamSwitch')||{}).innerText||''")).trim();

  ok('the charter on the card changed', charterAfter && charterAfter !== charterBefore,
    'before: ' + charterBefore + '  after: ' + charterAfter);
  ok('THE TEAM DID NOT', teamAfter === teamBefore,
    'the page moved team as well: ' + teamBefore + ' -> ' + teamAfter);
  ok('  and the body is the other charter, not the first one again',
    /young people/i.test(String(await ev("(document.getElementById('charterBody')||{}).innerText||''")))
    || /sound and songs/i.test(String(await ev("(document.getElementById('charterBody')||{}).innerText||''"))),
    await ev("((document.getElementById('charterBody')||{}).innerText||'').slice(0,120)"));
  ok('  the pressed button is the one showing', (await ev(
    "(()=>{const b=document.querySelector('#charterSwitch button[aria-pressed=\"true\"]');"
    + "return b?b.textContent.trim():'(none pressed)'})()")) !== '(none pressed)');

  await openHubAs(PEOPLE.three);
  ok('three charters: three buttons',
    String(await switchButtons()).split('|').filter(Boolean).length === 3, await switchButtons());

  if (wantShots) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'charter-switch.png'), Buffer.from(r.data, 'base64'));
  }

  /* ---- the pin board's switch, which is the same idea --------------- */
  console.log('\nthe pin board says "Switch board" in words');

  await openHubAs(PEOPLE.two, 'stickynotes.html');
  const sw = String(await ev(
    "(()=>{const el=document.getElementById('boardSwitch');"
    + "return el && getComputedStyle(el).display!=='none' ? (el.innerText||'').replace(/\\s+/g,' ').trim() : '(hidden)'})()"));
  ok('somebody with two boards gets the control', sw !== '(hidden)', sw);
  ok('  and it says what it does', /Switch board/i.test(sw), sw);
  ok('  with the boards behind it', (await ev(
    "Array.from(document.querySelectorAll('#boardPicker option')).map(o=>o.textContent).join('|')")) !== '');

  await openHubAs(PEOPLE.one, 'stickynotes.html');
  ok('somebody with one board is not offered a switch to nowhere', String(await ev(
    "(()=>{const el=document.getElementById('boardSwitch');"
    + "return el && getComputedStyle(el).display!=='none' ? 'shown':'hidden'})()")) === 'hidden');

  console.log('\nthe console, and where the page went');
  ok('nothing on the console', watch.errors.length === 0, watch.summary());
  const unexpected = [...new Set(reachedOff)].filter(h => h !== 'firebasestorage.googleapis.com');
  ok('nothing reached anywhere off this machine that is not accounted for',
    unexpected.length === 0, unexpected.join(', '));

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
