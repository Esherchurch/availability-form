/* What each of the four levels actually gets, in a browser.
 *
 *   node tests/check-levels-in-browser.mjs            (from v2/, emulators running)
 *   node tests/check-levels-in-browser.mjs --shots
 *
 * WHY THIS EXISTS, and it is worth reading before changing it.
 *
 * NEXT-BRIEF §21 widened `status: 'active'` from "on a team" to "in the
 * address book". firestore-rules.test.mjs covers the rules thoroughly - 637
 * cases - and every one of them passed while the change had TWO faults that
 * stopped anybody signing in at all:
 *
 *   1. closing `addressBook` to a list broke the lookup egbc-auth.js uses to
 *      find out WHO has signed in. Every rules test wrote users/{uid} with the
 *      memberId already in hand; not one ran the query that produces it.
 *   2. active() called me().status without checking the document exists, so
 *      for a brand new account it threw "Null value error" rather than
 *      returning false - and threw for everybody, not only Attenders.
 *
 * Both were found by signing in as an Attender in a browser and reading the
 * screen. Neither could have been found any other way, because both live in
 * the gap between what the rules say and what the client does with them.
 *
 * So this signs in as each of the four levels, against rules that are loaded,
 * and asks what they see. It provisions users/{uid} THROUGH THE RULES rather
 * than writing it with the rules off, which is the whole point: that write is
 * the one that locks people out when it is wrong.
 *
 * Synthetic people throughout; every address ends .invalid.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9661, SERVE = 8887;
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };

/* ---- the emulators -------------------------------------------------- */

const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const fsReq = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const r = http.request({ host: 'localhost', port: 8181, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    s => { let d = ''; s.on('data', c => d += c); s.on('end', () => res({ status: s.statusCode, body: d })); });
  r.on('error', rej); r.end(data);
});
const authReq = (p, body, asOwner) => new Promise((res, rej) => {
  const d = JSON.stringify(body);
  const r = http.request({ host: 'localhost', port: 9099, method: 'POST', path: p,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) },
      asOwner ? { Authorization: 'Bearer owner' } : {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res(JSON.parse(x || '{}'))); });
  r.on('error', rej); r.end(d);
});

const val = (v) => {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  return { stringValue: String(v) };
};
const put = (p, obj) => fsReq('PATCH', DOCS + '/' + p,
  { fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, val(v)])) });

/* An account whose address is VERIFIED. accounts:update with the user's own
   idToken does not set that in the emulator - the project-scoped endpoint, as
   the owner, does. Without it bookIsMine refuses, rightly: an address nobody
   has proved they can receive mail at must not be able to claim a record.
   The first version of this check missed that and reported a refusal that was
   the harness rather than the code. */
async function account(email) {
  let up = await authReq('/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email, password: PW, returnSecureToken: true });
  if (!up.localId) up = await authReq('/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email, password: PW, returnSecureToken: true });
  if (!up.localId) throw new Error('could not make ' + email + ': ' + JSON.stringify(up).slice(0, 160));
  await authReq('/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update',
    { localId: up.localId, emailVerified: true }, true);
  /* No users/{uid} written here. egbc-auth.js provisions it through the rules,
     which is the thing being tested. */
  await fsReq('DELETE', DOCS + '/users/' + up.localId);
  return up.localId;
}

const PEOPLE = {
  pending:  { email: 'lv.pending@example.invalid', book: null },
  attender: { email: 'lv.attender@example.invalid', book: { markers: [] } },
  member:   { email: 'lv.member@example.invalid', book: { markers: [], churchMember: true } },
  team:     { email: 'lv.team@example.invalid', book: { markers: ['Worship Team'] } },
};

/* ---- the harness ----------------------------------------------------- */

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
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

  for (const [level, p] of Object.entries(PEOPLE)) {
    p.uid = await account(p.email);
    p.memberId = 'ab_lv_' + level;
    if (p.book) await put('addressBook/' + p.memberId,
      Object.assign({ name: 'Level ' + level, email: p.email }, p.book));
    else await fsReq('DELETE', DOCS + '/addressBook/' + p.memberId);
  }
  /* One room-bearing meeting in CMM, so the hiding has something to hide. */
  await put('events/ev_lv_cmm', { date: '2099-01-04', startTime: '19:30', endTime: '21:00',
    type: 'Church Members Meeting', description: '', videoRoom: 'CMM', teams: [], archived: false });

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
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-lv-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
      if (offMachine(u)) { reachedOff.push(u.split('/')[2]); return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); }
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });

  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  const signInAs = async (p) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await sleep(3500);
    await ev('firebase.auth(EGBCAuth.app).signOut()', true);
    await sleep(600);
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
      + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ')', true);
    return await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).email || "(nobody)"');
  };
  const open = async (page) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page });
    await sleep(7000);
    return {
      blocked: String(await ev('document.body.getAttribute("data-egbc-blocked") || ""')),
      text: String(await ev('(document.body.innerText||"").replace(/\\s+/g," ").trim()')),
    };
  };
  const shot = async (name) => {
    if (!wantShots) return;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'levels--' + name + '.png'), Buffer.from(r.data, 'base64'));
  };
  const profile = async () => String(await ev('JSON.stringify((EGBCAuth.profile()||{}))'));

  /* ---- Pending ------------------------------------------------------ */
  console.log('\nPending - signed in, not in the address book');
  ok('signs in', (await signInAs(PEOPLE.pending)) === PEOPLE.pending.email);
  let r = await open('hub.html');
  ok('is turned away, and told why', /do not recognise that address/i.test(r.blocked + ' ' + r.text), r.blocked + ' | ' + r.text.slice(0, 120));
  await shot('1-pending');

  /* ---- Attender ----------------------------------------------------- */
  console.log('\nAttender - in the address book, on no team');
  ok('signs in', (await signInAs(PEOPLE.attender)) === PEOPLE.attender.email);
  r = await open('hub.html');
  /* THE ONE THAT MATTERS. Before §21 this person saw "No teams yet" and
     nothing else; two separate faults in the first cut of §21 left them
     seeing "Something went wrong" instead. */
  ok('REACHES THE HUB, which they never could before', !r.blocked, r.blocked + ' | ' + r.text.slice(0, 160));
  const prof = await profile();
  ok('and their account was provisioned THROUGH the rules', /"memberId":"ab_lv_attender"/.test(prof), prof.slice(0, 200));
  ok('as an Attender', /"attender":true/.test(prof) && /"status":"active"/.test(prof), prof.slice(0, 200));
  ok('but not a Church member', /"churchMember":false/.test(prof), prof.slice(0, 200));
  await shot('2-attender');

  r = await open('Planner.html');
  ok('the Rota Planner still turns them away', /no access|not on any of those teams/i.test(r.blocked + ' ' + r.text),
    r.blocked + ' | ' + r.text.slice(0, 120));

  r = await open('meeting.html');
  ok('Meetings opens for them', !r.blocked, r.blocked);
  ok('and the members\u2019 room is NOT in the list - hidden, not locked',
    !/\bCMM\b/.test(r.text), r.text.slice(0, 300));
  ok('while the ordinary rooms are', /Worship & AV/.test(r.text), r.text.slice(0, 200));
  await shot('3-attender-meetings');

  r = await open('meeting.html?room=CMM');
  ok('and a pasted link to it is refused in words',
    /members. meeting|church members/i.test(r.text), r.text.slice(0, 200));
  await shot('4-attender-cmm-refused');

  /* ---- Church member ------------------------------------------------ */
  console.log('\nChurch member - the office has ticked them');
  ok('signs in', (await signInAs(PEOPLE.member)) === PEOPLE.member.email);
  r = await open('hub.html');
  ok('reaches the hub', !r.blocked, r.blocked);
  const mprof = await profile();
  ok('and the tick came off the address book, not from them',
    /"churchMember":true/.test(mprof), mprof.slice(0, 200));

  r = await open('meeting.html');
  ok('the members\u2019 room IS in their list', /\bCMM\b/.test(r.text), r.text.slice(0, 300));
  await shot('5-member-meetings');
  r = await open('meeting.html?room=CMM');
  ok('and they may open it', !/members. meeting|church members/i.test(r.text), r.text.slice(0, 200));

  /* ---- Team member -------------------------------------------------- */
  console.log('\nTeam member - Worship Team');
  ok('signs in', (await signInAs(PEOPLE.team)) === PEOPLE.team.email);
  r = await open('hub.html');
  ok('reaches the hub', !r.blocked, r.blocked);
  const tprof = await profile();
  ok('with their team mirrored from the address book', /"teams":\["Worship Team"\]/.test(tprof), tprof.slice(0, 200));
  r = await open('Planner.html');
  ok('and the Rota Planner lets them in', !/no access/i.test(r.blocked + ' ' + r.text), r.blocked + ' | ' + r.text.slice(0, 120));
  ok('a team member is not thereby a Church member', /"churchMember":false/.test(tprof), tprof.slice(0, 200));
  r = await open('meeting.html');
  ok('so the members\u2019 room is hidden from them too', !/\bCMM\b/.test(r.text), r.text.slice(0, 300));
  await shot('6-team');

  /* Every off-machine request was REFUSED by the harness, so nothing left
     here whatever this says. What is being asserted is what the pages
     ATTEMPTED, and two attempts are expected and understood:

       egbc.daily.co                  the video call itself, on meeting.html
       firebasestorage.googleapis.com the brand logo, hard-coded as a live
                                      Storage URL in egbc-shell.js:30 and so
                                      on every page. A public image with a
                                      download token, not data - but it is a
                                      live URL from a localhost page, which
                                      is the shape of fault that put five
                                      test records in the live database, so
                                      it is named here rather than ignored.

     Anything else is a page reaching somewhere nobody decided it should. */
  const EXPECTED_OFF = ['egbc.daily.co', 'firebasestorage.googleapis.com'];
  const unexpected = [...new Set(reachedOff)].filter(h => !EXPECTED_OFF.includes(h));
  ok('no page reached anywhere off this machine that is not accounted for',
    unexpected.length === 0, unexpected.join(', '));

  server.close(); chrome.kill(); ws.close();
  const failed = R.filter(v => !v).length;
  console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
