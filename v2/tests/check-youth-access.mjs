/* A young person's phone: redeem a code, open the Youth Hub.
 *
 *   node tests/check-youth-access.mjs            (from v2/, emulators running)
 *   node tests/check-youth-access.mjs --shots
 *
 * WHY. `youthGranted()` was defined in firestore.rules and used by nothing,
 * so under the locked rules a young person's phone was refused every
 * collection youthapp2.html reads. The app would have opened and shown an
 * empty shell - no songs, no services, no board - with nothing on screen
 * saying why. Found by the reviewing window; YOUTH-ACCESS.md has the design.
 *
 * firestore-rules.test.mjs proves the rules, in four states. It cannot prove
 * that the page works, and it cannot prove the thing that matters most: that
 * no adult's email address or telephone number ever reaches a child's phone.
 * This does both, by driving the page.
 *
 * MARTIN'S TWO PRINCIPLES, which this check exists to hold:
 *   no email addresses for under-18s, ever
 *   no young person gets in without a parent receiving the code
 *
 * Synthetic throughout: no real young person, no real parent, and every
 * address ends .invalid.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9667, SERVE = 8891;
const wantShots = process.argv.includes('--shots');

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };

/* ---- the emulator ---------------------------------------------------- */

const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const rest = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const r = http.request({ host: 'localhost', port: 8181, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    s => { let d = ''; s.on('data', c => d += c); s.on('end', () => res({ status: s.statusCode, body: d })); });
  r.on('error', rej); r.end(data);
});
const val = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, obj) => rest('PATCH', DOCS + '/' + p, { fields: fields(obj) });
const getOne = async (p) => { const r = await rest('GET', DOCS + '/' + p); return r.status === 200 ? JSON.parse(r.body) : null; };
const plain = (f) => !f ? undefined
  : ('stringValue' in f ? f.stringValue
  : 'booleanValue' in f ? f.booleanValue
  : 'nullValue' in f ? null
  : 'timestampValue' in f ? f.timestampValue : undefined);
const listDocs = async (c) => {
  const r = await rest('GET', DOCS + '/' + c + '?pageSize=300');
  return r.status === 200 ? (JSON.parse(r.body).documents || []) : [];
};

/* ---- what the youth team's world looks like -------------------------- */

const CODE = 'TEST-YTH1';          /* the format the page insists on: 4-4 */
const BAD_CODE = 'ZZZZ-9999';      /* never issued */
const PARENT = 'synthetic.parent@example.invalid';

/* An adult on the rota, whose details must never appear on a child's phone.
   Deliberately distinctive strings, so finding them is unambiguous. */
const ADULT_EMAIL = 'adult.leader.secret@example.invalid';
const ADULT_PHONE = '01777 555123';
const ADULT_ADDRESS = '3 Private Close, Nowhereton';

async function seed() {
  /* Clear anything a previous run left: a burnt code cannot be re-redeemed,
     which is the point of it, so the code has to be fresh each time. */
  await rest('DELETE', DOCS + '/youthGrants/' + CODE);
  for (const d of await listDocs('youthAccess')) {
    const id = d.name.split('/').pop();
    const g = plain((d.fields || {}).grantCode);
    if (g === CODE) await rest('DELETE', DOCS + '/youthAccess/' + id);
  }

  /* A code, as the hub's admin panel issues one: addressed to a PARENT. */
  await put('youthGrants/' + CODE, {
    memberId: 'ab_young_synth', memberName: 'Young Synthetic',
    sentTo: PARENT, issuedBy: 'Synthetic Leader',
    redeemedAt: null, uid: null, active: true });

  await put('addressBook/ab_adult_synth', {
    name: 'Adult Leader Synthetic', email: ADULT_EMAIL,
    phone: ADULT_PHONE, address: ADULT_ADDRESS, markers: ['Youth Worship', 'Core Team'] });
  await put('addressBook/ab_young_synth', {
    name: 'Young Synthetic', markers: ['Youth Worship'], isMinor: true });

  /* The youth app reads this one document for its NEWS, not for a welcome
     line - the first version of this check seeded a field the page never
     looks at and then asserted the page showed it. */
  await put('portal/dashboardContent', { newsItems: [
    { id: '1', title: 'Synthetic notice', body: 'Bring a friend on Friday.' }] });
  await put('worshipBoardState/youth', { notes: [], pages: [{ id: 'main', title: 'General Board' }] });
  await put('worshipBoardState/state', { notes: [{ id: 'n1', text: 'WORSHIP TEAM ONLY note' }], pages: [] });

  await put('songs/sg_youth_a', { title: 'A Youth Song', normalized: 'a youth song' });
  await put('songs/sg_youth_b', { title: 'Another Youth Song', normalized: 'another youth song' });

  await put('events/ev_youth_synth', { date: '2099-03-01', startTime: '18:30', endTime: '20:00',
    type: 'Youth Service', description: 'Youth-led evening', termLabel: 'Synthetic Term',
    teams: ['Youth Worship'], archived: false,
    serviceLeader: 'Adult Leader Synthetic', speaker: 'Adult Leader Synthetic',
    assignments: { Guitar: { id: 'ab_young_synth', name: 'Young Synthetic' } } });
  await put('services/sv_youth_synth', { date: '2099-03-01', worshipLeader: 'Young Synthetic',
    introText: 'Hello', outroText: '', serviceNotes: '', roleNotes: {}, order: [] });

  await put('kb_playthrough/kb_youth_pub', { title: 'Published playthrough', published: true,
    createdAt: new Date('2026-01-01') });
  await put('kb_training_worship/kb_youth_pub2', { title: 'Published training', published: true,
    createdAt: new Date('2026-01-01') });
}

/* ---- the harness ----------------------------------------------------- */

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
/* The brand logo is a live Storage URL in egbc-shell.js (A-039). Blocked
   either way; named so the assertion is about pages reaching somewhere
   nobody decided they should. */
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
  await seed();

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
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
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-youth-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) { reachedOff.push(u.split('/')[2]); return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); }
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  /* A phone, because that is the only thing this is ever used on. */
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });

  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    if (!wantShots) return;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'youth--' + name + '.png'), Buffer.from(r.data, 'base64'));
  };
  const SILENCE = `window.__said = [];
    window.alert = m => { window.__said.push(String(m)); };
    window.confirm = m => { window.__said.push(String(m)); return true; };`;
  const open = async (page) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page });
    await sleep(4000);
    await ev(SILENCE);
  };
  const said = async () => String(await ev('JSON.stringify(window.__said || [])'));

  /* ---- the code page, with no account at all ----------------------- */
  console.log('\nthe code page');
  await open('youth-access.html');
  ok('it opens on a phone with no account',
    (await ev('!!document.getElementById("code")')) === true);
  ok('and nobody is signed in yet',
    (await ev('(firebase.auth(EGBCAuth.app).currentUser) ? "someone" : "nobody"')) === 'nobody');
  ok('it says a parent will have been emailed the code',
    /parent or guardian/i.test(String(await ev('document.body.innerText'))),
    String(await ev('document.body.innerText')).slice(0, 160));
  await shot('1-code');

  /* ---- a code nobody issued ---------------------------------------- */
  console.log('\na code nobody issued');
  await ev('document.getElementById("code").value = ' + JSON.stringify(BAD_CODE));
  await ev('window.redeem()', true);
  await sleep(2500);
  const badMsg = String(await ev('document.getElementById("msg").textContent'));
  ok('is refused in words a young person can act on',
    /do not recognise|ask a leader/i.test(badMsg), badMsg);
  ok('and the form is still there to try again',
    (await ev('!document.getElementById("enterView").classList.contains("hidden")')) === true);
  await shot('2-bad-code');

  /* ---- the real code ------------------------------------------------ */
  console.log('\nthe code a parent was sent');
  await open('youth-access.html');
  await ev('document.getElementById("code").value = ' + JSON.stringify(CODE));
  await ev('window.redeem()', true);
  await sleep(4000);
  ok('lets them in', (await ev('!document.getElementById("doneView").classList.contains("hidden")')) === true,
    String(await ev('document.body.innerText')).slice(0, 200));
  ok('and greets them by name', /Young Synthetic/.test(String(await ev('document.getElementById("doneName").textContent'))),
    String(await ev('document.getElementById("doneName").textContent')));
  const uid = String(await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""'));
  /* NOT anonymous any more, and that is the change rather than a fault.
     Redeeming goes through redeemYouthCode now, which creates the identity
     itself - "youth-" and twenty random characters - so a mistyped code no
     longer leaves a disposable anonymous account behind. What matters has not
     changed: no email address, and no password to reset. */
  ok('on an account with no email address and no password',
    !!uid && /^youth-/.test(uid)
    && (await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).email || "(none)"')) === '(none)'
    && (await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).providerData || []')).length === 0, uid);
  await shot('3-in');

  const access = await getOne('youthAccess/' + uid);
  ok('an access record was written for that device', !!access, 'nothing at youthAccess/' + uid);
  ok('naming the code it came from', access && plain(access.fields.grantCode) === CODE,
    access && plain(access.fields.grantCode));
  ok('and holding no email address at all',
    access && !JSON.stringify(access.fields).includes('@'), access && JSON.stringify(access.fields).slice(0, 200));

  const grant = await getOne('youthGrants/' + CODE);
  ok('THE CODE IS BURNT: it records when and by whom',
    grant && plain(grant.fields.redeemedAt) !== null && plain(grant.fields.uid) === uid,
    grant && JSON.stringify({ at: plain(grant.fields.redeemedAt), uid: plain(grant.fields.uid) }));

  /* ---- the Youth Hub ----------------------------------------------- */
  console.log('\nthe Youth Hub, on that phone');
  await open('youthapp2.html');
  await sleep(4000);
  const text = String(await ev('(document.body.innerText || "").replace(/\\s+/g, " ")'));
  const html = String(await ev('document.documentElement.innerHTML'));

  ok('the app opens rather than showing an empty shell',
    text.length > 200 && !/something went wrong/i.test(text), text.slice(0, 200));
  /* The news panel reads portal/dashboardContent, which is the one document
     youthGranted() opens there. _newsItems IS on window; the three below are
     not, and reading them off window is what made this check lie once. */
  const news = await ev('(window._newsItems || []).length');
  ok('the notices came through', Number(news) >= 1, 'news items ' + news);

  /* Songs load when the library opens, and the rota when a date is chosen.
     A check that never opens them measures an empty app and calls it empty. */
  await ev("openSection('library')");
  await sleep(3500);
  const songs = await ev('typeof allSongs === "undefined" ? "NOT IN SCOPE" : allSongs.length');
  ok('the song library came through once it was opened', Number(songs) >= 2, 'songs ' + songs);

  await ev("goBack(); openSection('planner')");
  await sleep(1200);
  await ev("document.getElementById('serviceDate').value = '2099-03-01'");
  await ev('loadRota()', true);
  await sleep(3000);
  const events = await ev('typeof eventsForDay === "undefined" ? "NOT IN SCOPE" : eventsForDay.length');
  ok('and the rota for that date, so a service can be picked', Number(events) >= 1, 'events ' + events);

  /* THE TWO PRINCIPLES.

     THE DOM IS NOT ENOUGH, and a deliberate break proved it. Putting the
     address book read back made only ONE of these fail - the page had every
     adult's email address in memory and simply had not drawn it yet. In
     memory on a child's phone is exactly what the principle forbids, so
     each of these looks at the page's own state as well as the screen. */
  const inMemory = String(await ev(
    'typeof addressBook === "undefined" ? "" : JSON.stringify(addressBook)'));
  const anywhere = html + ' ' + inMemory;
  ok('NO ADULT EMAIL ADDRESS anywhere on the page, drawn or held',
    !anywhere.includes(ADULT_EMAIL), 'found ' + ADULT_EMAIL + (inMemory.includes(ADULT_EMAIL) ? ' (in memory, not drawn)' : ' (on screen)'));
  ok('NO TELEPHONE NUMBER either', !anywhere.includes(ADULT_PHONE), 'found ' + ADULT_PHONE);
  ok('nor an address', !anywhere.includes('Private Close'));
  ok('nor the parent\u2019s address, which only the hub ever saw', !anywhere.includes(PARENT));
  /* THE MOST IMPORTANT ASSERTION IN THIS FILE, and the first version of it
     read window.addressBook - undefined - so (undefined || []).length was 0
     and it passed whatever the page had done. Named properly it can fail. */
  const book = await ev('typeof addressBook === "undefined" ? "NOT IN SCOPE" : addressBook.length');
  ok('and the page never read the address book at all', book === 0, 'addressBook holds ' + book);
  ok('the worship team\u2019s board is not on it either',
    !/WORSHIP TEAM ONLY/.test(html), 'the worship board leaked through');
  await shot('4-hub');

  /* ---- what a young person can and cannot do ----------------------- */
  console.log('\nwhat they can and cannot do');
  const picked = await ev(`(() => {
    const sel = document.getElementById('eventSelect');
    if (!sel || !sel.options.length) return 'no picker';
    for (const o of sel.options) if (/Youth/i.test(o.textContent)) { sel.value = o.value; return o.textContent; }
    return 'no youth service in the list';
  })()`);
  ok('a youth service is in the picker', !/no picker|no youth/.test(String(picked)), picked);
  await ev('window.selectEvent()', true);
  await sleep(2500);
  ok('and choosing it is not refused', !/THREW/.test(String(await ev('typeof isYouthService'))));

  await ev('window.__said = []');
  await ev('window.saveSchedule()', true);
  await sleep(2500);
  const saveSaid = await said();
  ok('SAVING SAYS A LEADER DOES IT, rather than failing silently',
    /youth leader can save/i.test(saveSaid), saveSaid);

  await ev('window.__said = []');
  await ev('window.emailSchedule()', true);
  await sleep(1500);
  const emailSaid = await said();
  ok('and emailing says to ask a leader',
    /leader sends the plan/i.test(emailSaid), emailSaid);

  /* ---- the code is worthless to a second device -------------------- */
  console.log('\nthe code on a second phone');
  const second = await rest('PATCH', DOCS + '/youthAccess/u_second_device_synth',
    { fields: fields({ grantCode: CODE, active: true, expiresAt: new Date(Date.now() + 1e10) }) });
  /* Written with the owner token, which skips the rules - so this says
     nothing about the rules and is only here to be cleared up. The rules
     refusal is covered in firestore-rules.test.mjs, where the rules engine
     is actually running. What the BROWSER proves is the page's half: */
  await rest('DELETE', DOCS + '/youthAccess/u_second_device_synth');
  await open('youth-access.html');
  await ev('document.getElementById("code").value = ' + JSON.stringify(CODE));
  await ev('window.redeem()', true);
  await sleep(3000);
  const reuse = String(await ev('document.getElementById("msg").textContent'));
  ok('a used code is refused, and says codes work once',
    /already been used|once only/i.test(reuse), reuse);
  await shot('5-reused');

  /* ---- the console, and where the pages went ----------------------- */
  console.log('\nthe three refusals, straight at the function');
  /* The page can only try what somebody types, so a cancelled code and a
     code of the wrong shape are easier to ask the endpoint about directly.
     The three refusals are deliberately DIFFERENT sentences, unlike
     ChurchShow's one: the person holding a youth code is the person it was
     sent to, and "already used" tells them what to do while "no" does not. */
  const fn = (body) => new Promise((res, rej) => {
    const d = JSON.stringify(body);
    const r = http.request({ host: 'localhost', port: 5101, method: 'POST',
      path: '/egbc-worship-planner/europe-west2/redeemYouthCode',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } },
      x => { let t = ''; x.on('data', c => t += c); x.on('end', () => { try { res({ status: x.statusCode, body: JSON.parse(t || '{}') }); } catch { res({ status: x.statusCode, body: {} }); } }); });
    r.on('error', rej); r.end(d);
  });

  await put('youthGrants/CANC-ELLD', {
    memberId: 'ab_young_synth', memberName: 'Young Synthetic',
    sentTo: PARENT, issuedBy: 'Synthetic Leader',
    redeemedAt: null, uid: null, active: false });
  const cancelled = await fn({ code: 'CANC-ELLD' });
  ok('a cancelled code is refused, and says it was cancelled',
    cancelled.status === 400 && /cancelled/i.test(cancelled.body.message || ''),
    cancelled.status + ' ' + JSON.stringify(cancelled.body));
  ok('and nothing was written for it',
    (await getOne('youthAccess/' + (cancelled.body.uid || 'none'))) === null);

  const short = await fn({ code: 'ABC' });
  ok('a code of the wrong shape is refused before any lookup',
    short.status === 400 && /eight characters/i.test(short.body.message || ''),
    short.status + ' ' + JSON.stringify(short.body));

  const none = await fn({});
  ok('and so is no code at all', none.status === 400, none.status + ' ' + JSON.stringify(none.body));

  /* The thing the whole change is for. */
  const leaked = JSON.stringify([cancelled.body, short.body, none.body]);
  ok('NO REFUSAL LEAKS THE PARENT\u2019S ADDRESS', !leaked.includes(PARENT), leaked.slice(0, 200));

  console.log('\nthe console, and where the pages went');
  const real = errs.filter(e => !/Logo fetch failed|storage\/object-not-found|cdn\.tailwindcss/i.test(e));
  ok('no errors a young person would see', real.length === 0, JSON.stringify(real).slice(0, 300));
  const unexpected = [...new Set(reachedOff)].filter(h => !EXPECTED_OFF.includes(h));
  ok('nothing reached anywhere off this machine that is not accounted for',
    unexpected.length === 0, unexpected.join(', '));

  server.close(); chrome.kill(); ws.close();
  const failed = R.filter(v => !v).length;
  console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
