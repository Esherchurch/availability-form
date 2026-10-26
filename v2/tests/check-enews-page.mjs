/* The E-news page in a real browser, at 375px (FINDINGS-comms step 2).
 *
 *   node tests/check-enews-page.mjs        (from v2/)
 *
 * NEEDS AN EMULATOR OF ITS OWN: Firestore and Auth on the ports in
 * firebase.comms.json (default 8292 / 9292), started with
 *   firebase emulators:start --only firestore,auth --config firebase.comms.json
 * and, for "Send me a test", the functions emulator in firebase.comms-fn.json:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8292 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9292 \n *     firebase emulators:start --only functions --config firebase.comms-fn.json
 * The pages are served from here with egbc-auth.js pointed at those ports
 * (a rewrite as the file is served; the file itself is not changed), so
 * nothing here meets another window's test data. The first check PROVES
 * the page is talking to that emulator before anything is written
 * (NEXT-BRIEF §0). Synthetic people and events only.
 *
 * Asks: off until switched on; refused to a church member; the office
 * gets an automatic draft with the right events (a not-listed event never
 * in it); "Everyone else sees" leaves the members-only parts out; the page
 * fits 375px. Pictures: tests/shots/enews-375-*.png.
 *
 * DELIBERATE BREAKS: --break=switch serves enews.html with its "is the
 * e-news switched on?" answering yes; --break=office lets anybody in;
 * --break=colour takes the church's colours off the new editor's colour button; --break=missing
 * drops the "missing a picture or write-up" note; --break=wordcount drops
 * the members-only words count from the Send page; --break=leak hands the
 * preview the members' copy (the server must refuse it). Each
 * must turn this check red (the run says which line). A break that leaves
 * it green is a check that cannot fail.
 *
 * THE SWITCH. Until egbc-auth.js has EGBCAuth.uses (the main window's
 * F-230 switches), this check supplies a stand-in that reads the same
 * churchSettings/features document, and says so. Once the real one is
 * there, the stand-in steps aside by itself.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/* London wall-clock to real time, right on both sides of the clocks changing
   (a fixed hour off was wrong for events on or after 25 Oct). */
const londonUtc = (iso) => { const guess = Date.parse(iso + ':00Z'); const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).forEach(x => { p[x.type] = x.value; }); const shown = Date.parse(p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':00Z'); return guess - (shown - guess); };
const V2 = path.resolve('.');
const CFG = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
const FS = CFG.emulators.firestore.port, AU = CFG.emulators.auth.port;
/* "Send me a test" calls the hub's function: this window's functions emulator. */
const FN = JSON.parse(fs.readFileSync('firebase.comms-fn.json', 'utf8')).emulators.functions.port;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9787, SERVE = 8996, PW = 'test-only-password';
const SHOTS = path.join(V2, 'tests', 'shots');
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };

const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsValue(x)])) } };
}
function fromFs(v) {
  if (!v) return v;
  if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue; if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  return v;
}
const put = (p, data) => req(FS, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }, OWNER);
const list = async c => { const r = JSON.parse((await req(FS, 'GET', DOCS + '/' + c + '?pageSize=100', undefined, OWNER)).body || '{}'); return (r.documents || []).map(d => Object.assign({ _id: d.name.split('/').pop() }, Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromFs(v)])))); };

/* ---- the people and the data (all made up) ----------------------------- */
const PEOPLE = {
  office: { email: 'enews.office@example.invalid', member: 'ab_enews_office', teams: ['Church office'], master: false },
  member: { email: 'enews.member@example.invalid', member: 'ab_enews_member', teams: [], master: false, churchMember: true },
  master: { email: 'enews.master@example.invalid', member: 'ab_enews_master', teams: ['Core Team'], master: true }
};
function londonDay(offset) { const d = new Date(Date.now() + offset * 86400000); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d); }
const SUNDAY = (() => { const t = new Date(londonDay(0) + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + ((7 - t.getUTCDay()) % 7)); return t.toISOString().slice(0, 10); })();
const evAt = (days, hh) => { const day = londonDay(days); return { startLocal: day + 'T' + hh, startUtc: londonUtc(day + 'T' + hh) }; };

const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
let STANDIN = false;
const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').slice(8);
const BREAKS = {
  switch: ['enews.html', "function usesEnews() { return !!(EGBCAuth.uses && EGBCAuth.uses('enews')); }", 'function usesEnews() { return true; }'],
  office: ['enews.html', 'function may() { return', 'function may() { return true; return'],
  weekly: ['enews.html', 'if (!thisWeek && !showList.autoTried) {', 'if (!showList.autoTried || true) {'],
  colour: ['egbc-enews-editor.js', "if (id === 'pop-colour') p.innerHTML = '<p class=\"m\" style=\"margin:0 0 8px\">Colour (the church’s)</p><div class=\"sw\">' + palette().map(", "if (id === 'pop-colour') p.innerHTML = '<p class=\"m\" style=\"margin:0 0 8px\">Colour (the church’s)</p><div class=\"sw\">' + [].map("],
  leak: ['enews.html', "{ issueId: ISSUE_ID, html: finalCopy('everyone') }", "{ issueId: ISSUE_ID, html: finalCopy('members') }"],
  missing: ['enews.html', 'readyNote() + missingNote() +', 'readyNote() +'],
  services: ['enews.html', 'return EGBCPlanStore.dayServices(s.docs.map(', 'return [].slice.call(s.docs.map('],
  subcap: ['enews.html', "EGBCComms.allDocs(db().collection('enewsSubscribers').orderBy('email'), 500).then(function (docs) {", "db().collection('enewsSubscribers').orderBy('email').limit(1000).get().then(function (q) { var docs = q.docs;"],
  nomore: ['egbc-comms.js', '      if (s.size >= o.size) {', '      if (false) {'],
  wordcount: ['enews.html', "      (bits ? '<span class=\"pill gold\" id=\"mem-words\">'", "      (false ? '<span class=\"pill gold\" id=\"mem-words\">'"]
};
if (BREAK && !BREAKS[BREAK]) { console.log('Unknown break: ' + BREAK); process.exit(2); }
function serveAuth(src) {
  /* Point the page at this check's emulator. */
  const to = '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399 }';
  const out = src.replace("{ firestore: 8181, auth: 9099, storage: 9199 }", to).replace("(location.port === '5601' ? 5102 : 5101)", String(FN));
  if (out === src) throw new Error('egbc-auth.js no longer has the emulator line this check rewrites');
  if (/\buses:\s*function/.test(src)) return out;
  /* The stand-in for EGBCAuth.uses (see the header): the same document. */
  STANDIN = true;
  return out + '\n;(function(){var F={};var A=window.EGBCAuth;if(!A)return;A.__standin=true;'
    + 'A.uses=function(n){var v=F[n];if(typeof v==="boolean")return v;return ["enews","cardMaker","canva"].indexOf(n)<0;};'
    + 'var r=A.require;A.require=function(o){return r.call(A,o).then(function(p){return A.db.collection("churchSettings").doc("features").get().then(function(s){F=(s.exists&&s.data())||{};return p;},function(){return p;});});};})();';
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  /* Is the emulator there at all? */
  try { await req(FS, 'GET', '/'); await req(AU, 'GET', '/'); } catch (e) { console.log('  FAIL  no emulator on ' + FS + '/' + AU + ' - start it first (see the header)'); process.exit(1); }
  await req(FS, 'DELETE', '/emulator/v1/projects/egbc-worship-planner/databases/(default)/documents');
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: 'Enews ' + Object.keys(PEOPLE).find(k => PEOPLE[k] === p) + ' Synthetic', email: p.email, markers: p.teams, masterAdmin: p.master, churchMember: p.churchMember === true, archived: false });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: 'Enews Synthetic', memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: [], masterAdmin: p.master, churchMember: p.churchMember === true, attender: true });
  }
  await put('churchSettings/details', { name: 'Synthetic Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '' });
  /* Martin, 19 Oct: at EGBC the add-ons start ON when nothing is stored
     (features.js), so "off" is stored here to prove the page obeys it. */
  await put('churchSettings/features', { enews: false });
  await put('calEvents/en_pub', Object.assign({ title: 'Synthetic harvest supper', visibility: 'public', status: 'confirmed', audience: ['public', 'members'], signupOn: true, image: '', labels: ['Harvest'] }, evAt(3, '18:30')));
  await put('calEvents/en_mem', Object.assign({ title: 'Synthetic members prayer', visibility: 'members', status: 'confirmed', audience: ['members'], image: '' }, evAt(4, '19:00')));
  await put('calEvents/en_unl', Object.assign({ title: 'Synthetic support group', visibility: 'unlisted', status: 'confirmed', audience: ['unlisted'], image: '' }, evAt(2, '20:00')));
  await put('events/en_sun', { date: SUNDAY, type: 'Morning Worship', startTime: '09:15', serviceTime: '10:00', speaker: 'Sam Synthetic', publicTitle: 'Morning Worship', archived: false, siteId: 'site_main' });
  /* C-51: a second service that Sunday, in another building, and an archived one. */
  await put('events/en_eve', { date: SUNDAY, type: 'Evening Prayer', startTime: '17:45', serviceTime: '18:00', publicTitle: 'Evening Prayer', archived: false, siteId: 'site_chapel' });
  await put('events/en_old', { date: SUNDAY, type: 'Cancelled', startTime: '12:00', serviceTime: '12:00', archived: true });
  await put('sites/site_main', { name: 'Synthetic church', active: true });
  await put('sites/site_chapel', { name: 'Synthetic chapel', active: true });
  await put('news/en_n1', { title: 'Synthetic car park notice', body: '<p>Park on the road.</p>', teams: [], createdAt: new Date().toISOString() });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    try {
      if (path.basename(f) === 'egbc-auth.js') body = Buffer.from(serveAuth(body.toString('utf8')), 'utf8');
      if (BREAK && path.basename(f) === BREAKS[BREAK][0]) {
        const t = body.toString('utf8'), [, from, to] = BREAKS[BREAK];
        if (!t.includes(from)) throw new Error('break "' + BREAK + '": that line is not in ' + BREAKS[BREAK][0] + ' any more - update the break');
        body = Buffer.from(t.replace(from, to), 'utf8');
      }
    } catch (err) { console.log('  FAIL  ' + err.message); s.writeHead(500); return s.end(); }
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[e] || 'application/octet-stream') + (e === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-enews-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--no-first-run', '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(tabs.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(), errors = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error || {}); pend.delete(m.id); }
    /* A page's confirm or alert would stop everything: say yes. */
    if (m.method === 'Page.javascriptDialogOpening') ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text)); return r.result && r.result.value; };
  const until = async (x, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x).catch(() => false)) return true; await sleep(250); } return false; };
  const text = () => ev('document.getElementById("wrap") ? document.getElementById("wrap").innerText : ""');
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, 'enews-375-' + name + '.png'), Buffer.from(r.data, 'base64')); };
  const signIn = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(1500);
    await ev('firebase.auth(EGBCAuth.app).signOut().then(()=>1)');
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(()=>1)');
  };
  const open = async (q) => { await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews.html' + (q || '') }); await until('document.getElementById("wrap") && !/Loading/.test(document.getElementById("wrap").innerText)', 20000); await sleep(600); };

  try {
    /* 1. Talking to THIS check's emulator, before any write by a page. */
    await signIn('master');
    await open();
    const host = await ev('(function(){try{return EGBCAuth.db._delegate._settings.host}catch(e){return ""}})()');
    ok('the page talks to this check\u2019s emulator (' + host + ')', host === 'localhost:' + FS, host);
    if (host !== 'localhost:' + FS) throw new Error('not proven to be on the emulator: stopping before anything writes');
    console.log('        (the switch: ' + (STANDIN ? 'stand-in for EGBCAuth.uses, until F-230 is pushed' : 'the real EGBCAuth.uses') + ')');

    /* 2. Off until switched on: even a master admin sees only the words. */
    ok('off until switched on (master admin)', /switched off/.test(await text()), await text());
    ok('nothing to press while off', (await ev('document.querySelectorAll("#wrap button").length')) === 0);

    await put('churchSettings/features', { enews: true });

    /* 3. A church member is refused, plainly. */
    await signIn('member'); await open();
    ok('a church member is told it is for the office', /for the church office/.test(await text()), await text());

    /* 4. The office: nothing made this week, so the week's draft makes
       itself the first time they open the page (rule 13), once - and it
       opens in the editor (21 Oct: the old editor replaced). */
    const C = 'document.getElementById("cv") && document.getElementById("cv").contentDocument';
    const onEditor = async () => { await until('location.pathname.endsWith("/enews-edit.html") && ' + C + ' && ' + C + '.querySelectorAll("[data-b]").length > 3', 25000); await sleep(1200); };
    await signIn('office'); await open();
    await onEditor();
    ok('this week’s draft is made by itself on first opening, and opens in the editor', await ev('location.pathname.endsWith("/enews-edit.html")') && (await ev(C + '.querySelectorAll("[data-b]").length')) > 3);
    ok('…and says so', /drafted for you/.test(await ev('document.getElementById("toast").textContent')));
    await shot('draft');
    await open(); await sleep(1500);
    ok('opening again does not make a second one', (await list('enewsIssues')).length === 1 && /New e-news/.test(await text()), (await list('enewsIssues')).length);
    await shot('list');
    await ev('[...document.querySelectorAll("#issues a")][0].click(), 1');
    await onEditor();
    ok('an issue in the list opens in the new editor (the old Build view is gone)', await ev('location.pathname.endsWith("/enews-edit.html")'));
    const issues = await list('enewsIssues');
    const dr = issues[0] || {};
    const issueId = dr._id;
    const blocks = dr.blocks || [];
    const evIds = blocks.filter(b => b.type === 'event').map(b => b.eventId);
    const at = (pred) => (((issues[0] || {}).blocks) || []).findIndex(pred);
    ok('a draft was saved', issues.length === 1 && dr.status === 'draft', issues.map(i => i.status));
    ok('the draft has the public event', evIds.includes('en_pub'), evIds);
    ok('the members event is members-only', (blocks.find(b => b.eventId === 'en_mem') || {}).members === true, blocks.find(b => b.eventId === 'en_mem'));
    ok('the NOT LISTED event is not in the draft', !evIds.includes('en_unl') && !JSON.stringify(blocks).includes('Synthetic support group'), evIds);
    ok('Sunday from the rota, with the speaker', blocks.some(b => b.type === 'sunday' && b.speaker === 'Sam Synthetic'), blocks.filter(b => b.type === 'sunday'));
    const sundays = blocks.filter(b => b.type === 'sunday');
    ok('every service that Sunday (C-51): 10am at the church, 6pm at the chapel, the archived one left out', sundays.map(b => b.time + ' ' + b.title + ', ' + b.place).join(' | ') === '10am Morning Worship, Synthetic church | 6pm Evening Prayer, Synthetic chapel', sundays.map(b => [b.time, b.title, b.place]));
    await ev('document.querySelector(\'.rail [data-panel="check"]\').click(),1'); await sleep(500);
    ok('the gold members-only count shows', /for church members only/.test(await ev('document.getElementById("side").innerText')));

    /* 5. The previews: everyone else never gets the members-only parts. */
    await ev('document.getElementById("preview").click(),1'); await sleep(1000);
    const memHtml = await ev('document.querySelector(".over iframe").srcdoc || document.querySelector(".over iframe").contentDocument.documentElement.outerHTML');
    await ev('document.querySelector(\'.over [data-w="everyone"]\').click(),1'); await sleep(1000);
    const pubHtml = await ev('document.querySelector(".over iframe").srcdoc || document.querySelector(".over iframe").contentDocument.documentElement.outerHTML');
    await shot('phone-everyone');
    ok('members see the members prayer evening', memHtml.includes('Synthetic members prayer'));
    ok('everyone else does not', !pubHtml.includes('Synthetic members prayer') && pubHtml.includes('Synthetic harvest supper'));
    ok('everyone else does not get the notices (members-only until ticked)', !pubHtml.includes('Synthetic car park notice'));
    ok('every copy ends with "unsubscribe from this list" and the church’s name', [memHtml, pubHtml].every(h => /unsubscribe from this list/.test(h) && h.includes('Synthetic Green Church')));
    ok('the preview shows "Add this week’s picture" and "Add this week’s verse"', memHtml.includes('Add this week’s picture') && memHtml.includes('Add this week’s verse'));
    await ev('document.querySelector(".over [data-x]").click(),1'); await sleep(300);

    /* 6. A new week can't go out with an empty top (Martin, 20 Oct). */
    await open('?issue=' + issueId + '&view=send'); await until('!!document.getElementById("sched")', 15000); await sleep(500);
    ok('Send says plainly: sending opens when the church goes live; until then a test only', /opens when the church goes live/.test(await text()) && /sends it to you only/.test(await text()));
    ok('Schedule and "Send me a test" are held until the picture and verse are in', await ev('document.getElementById("sched").disabled && document.getElementById("test").disabled'));
    ok('and the page says what is missing', /Add this week’s picture and this week’s verse/.test(await text()));
    ok('the Send page lists the events still missing a picture or write-up', /Events missing a picture or write-up[\s\S]*Synthetic harvest supper[\s\S]*needs a picture and a write-up/.test(await text()), (await text()).slice(0, 600));
    ok('the Send page has no old editor (no Build, Phone or Computer), and goes back to the editor', !(await ev('!!document.querySelector(".seg button[data-v=build]") || !!document.querySelector(".blk")')) && /enews-edit\.html\?issue=/.test(await ev('document.getElementById("open-ed").getAttribute("href")')));
    await shot('send-held');

    /* 7. Val picks the picture, and brings in the verse from the hub's Bible
       - in the editor. */
    await ev('document.getElementById("open-ed").click(),1'); await onEditor();
    const bi = (type) => ev('(function(){var d=' + C + ';var n=[].slice.call(d.querySelectorAll("[data-b]"));return n.findIndex(function(e){return e.getAttribute("data-type")===' + JSON.stringify(type) + '})})()');
    const tapType = async (type, pred) => { const k = at(pred || (b => b.type === type)); await ev(C + '.querySelector(\'[data-b="' + k + '"]\').click(),1'); await sleep(700); return k; };
    await tapType('header');
    await ev('var i=document.getElementById("f-img");i.value="http://localhost:' + SERVE + '/design-mocks/comms/card-photo.svg";i.dispatchEvent(new Event("input"));i.dispatchEvent(new Event("change")),1'); await sleep(1800);
    await tapType('verse');
    await until('document.getElementById("v-ver") && [...document.getElementById("v-ver").options].some(o=>o.value==="bundled|BSB|BSB")', 15000);
    ok('the verse sheet offers the hub’s free Bibles, the BSB chosen as the church’s usual', await ev('document.getElementById("v-ver").value') === 'bundled|BSB|BSB', await ev('document.getElementById("v-ver").value'));
    await ev('document.getElementById("v-ref").value="Col 3:23-24";document.getElementById("v-get").click(),1');
    await until('/Whatever you do/.test(document.getElementById("f-vt").value)', 15000);
    ok('"Col 3:23-24" brings in the verse, its reference and the version’s copyright line',
      /Whatever you do/.test(await ev('document.getElementById("f-vt").value')) && await ev('document.getElementById("v-ref").value') === 'Colossians 3:23-24' && (await ev('document.getElementById("f-copy").value')).length > 10);
    await shot('verse-sheet');
    await sleep(2500);
    const after = ((await list('enewsIssues'))[0] || {}).blocks || [];
    const vb = after.find(b => b.type === 'verse') || {};
    ok('the verse is saved with its version and copyright', /Whatever you do/.test(vb.text || '') && vb.ref === 'Colossians 3:23-24' && vb.version === 'BSB' && (vb.copyright || '').length > 10, vb);
    ok('the week’s picture is saved', /card-photo\.svg$/.test((after.find(b => b.type === 'header') || {}).imageUrl || ''), after.find(b => b.type === 'header'));
    /* Saved in the background as the verse comes in: wait for it. */
    let usual = null;
    for (let k = 0; k < 40 && !(usual && usual.bible); k++) { usual = (await list('enewsSettings')).find(d => d._id === 'main'); if (!(usual && usual.bible)) await sleep(250); }
    ok('the church’s usual version is remembered', usual && usual.bible && usual.bible.id === 'BSB', usual);

    /* Stage 1 (plan B and C): the events missing a picture or write-up;
       a word coloured teal; "Dates for the diary"; the footer's social
       links and diary button. */
    await ev('document.querySelector(\'.rail [data-panel="check"]\').click(),1'); await sleep(500);
    ok('the draft lists the events still missing a picture or write-up', /Synthetic harvest supper: needs a picture and a write-up/.test(await ev('document.getElementById("side").innerText')), (await ev('document.getElementById("side").innerText')).slice(0, 400));
    const hk = await tapType('event', b => b.eventId === 'en_pub');
    ok('a card’s words are full rich text, with the church’s colours', await ev('!!' + C + '.querySelector(\'[data-b="' + hk + '"] [data-edit="html"]\')'));
    await ev(`(function(){var d=${C};var e=d.querySelector('[data-b="${hk}"] [data-edit="html"]');e.focus();e.innerHTML='<p>Bring a dish to share.</p>';e.dispatchEvent(new Event('input',{bubbles:true}));var t=e.querySelector('p').firstChild;var r=d.createRange();r.setStart(t,8);r.setEnd(t,12);var s=d.getSelection();s.removeAllRanges();s.addRange(r);d.dispatchEvent(new Event('selectionchange'));return 1})()`); await sleep(400);
    await ev('document.querySelector(\'#tool [data-cmd="colour"]\').click(),1'); await sleep(300);
    ok('…the colour button offers the church’s colours', (await ev('document.querySelectorAll("#pop-colour [data-colour]").length')) >= 6);
    await ev('document.querySelector(\'#pop-colour [data-colour="#008080"]\') && document.querySelector(\'#pop-colour [data-colour="#008080"]\').click(),1'); await sleep(2200);
    await shot('card-colour');
    const harvest = (((await list('enewsIssues'))[0] || {}).blocks || []).find(b => b.eventId === 'en_pub') || {};
    ok('"dish" coloured teal in the editor is kept, teal, on the card', /<span style="color:#008080;?">dish<\/span>/.test(harvest.html || ''), harvest.html);
    await ev('document.querySelector(\'.rail [data-panel="add"]\').click(),1'); await sleep(400);
    await ev('document.querySelector(\'[data-add="diary"]\').click(),1'); await sleep(2500);
    const diary = (((await list('enewsIssues'))[0] || {}).blocks || []).find(b => b.type === 'diary') || {};
    ok('"Dates for the diary" brings in the coming weeks’ public events, never members’ ones', (diary.items || []).some(x => /Synthetic harvest supper/.test(x.title)) && !(diary.items || []).some(x => /members prayer|support group/i.test(x.title)), diary.items);
    await ev('document.querySelector(\'.rail [data-panel="add"]\').click(),1'); await sleep(500);
    ok('the new editor adds every block the old one did (the week’s picture and the section bar too)', await ev('["header","text","event","picture","button","verse","section","sunday","diary","meeting","notices","divider","spacer"].every(function(k){return !!document.querySelector(\'[data-add="\'+k+\'"]\')})'));
    /* The footer: social links and the diary button, set in Look and footer. */
    await open(''); await until('!!document.getElementById("look")', 15000);
    await ev('document.getElementById("look").click(),1'); await sleep(600);
    ok('Look and footer offers the social links and the diary button', await ev('!!document.getElementById("l-s-facebook") && !!document.getElementById("l-s-youtube") && document.getElementById("l-diary").checked'));
    await ev('document.getElementById("l-s-facebook").value="https://www.facebook.com/syntheticgreen";document.getElementById("l-s-instagram").value="not a link";document.querySelector(".sheet [data-done]").click(),1'); await sleep(1200);
    ok('a social link that isn’t a web address is refused, in words', !(((await list('enewsSettings')).find(d => d._id === 'main') || {}).church || {}).social, (await list('enewsSettings')));
    await ev('document.getElementById("l-s-instagram").value="";document.querySelector(".sheet [data-done]").click(),1'); await sleep(1500);
    const setc = (((await list('enewsSettings')).find(d => d._id === 'main') || {}).church) || {};
    ok('the social links are saved with the church’s look', JSON.stringify(setc.social) === JSON.stringify([{ kind: 'facebook', url: 'https://www.facebook.com/syntheticgreen' }]) && setc.diaryButton === true, setc);
    await open('?issue=' + issueId + '&view=send'); await until('!!document.getElementById("sched")', 15000); await sleep(500);

    /* 8. Schedule: the two finished copies go on the issue; "don't send
       yet" takes them off again. */
    ok('with the picture and verse in, Schedule and the test are open', await ev('!document.getElementById("sched").disabled && !document.getElementById("test").disabled'));
    await shot('send');
    await ev('document.getElementById("when").value="2030-01-03T16:00";document.getElementById("sched").click(),1');
    await sleep(2500);
    let is = (await list('enewsIssues'))[0] || {};
    ok('Schedule: scheduled, with the time', is.status === 'scheduled' && is.sendAt === '2030-01-03T16:00', [is.status, is.sendAt]);
    ok('Schedule: the members’ copy has the members prayer evening', String(is.htmlMembers || '').includes('Synthetic members prayer'));
    ok('Schedule: everybody else’s copy does not', String(is.htmlEveryone || '').length > 500 && !String(is.htmlEveryone).includes('Synthetic members prayer'));
    ok('Schedule: each person’s link is left for the sender to fill', String(is.htmlEveryone || '').includes('{{unsubscribe_url}}'));
    ok('the word coloured teal is teal in the copy that is sent (and the web version, made from it)', String(is.htmlEveryone || '').includes('<span style="color:#008080;">dish</span>'));
    ok('the footer: "Dates for the diary for the coming weeks" and the Facebook icon, in every copy', [is.htmlEveryone, is.htmlMembers].every(h => /Dates for the diary for the coming weeks/.test(String(h)) && String(h).includes('img/social/facebook.png')));
    ok('the copies that are sent never carry the placeholders', !String(is.htmlMembers).includes('Add this week'));
    ok('the page says it is scheduled', /Scheduled/.test(await text()));
    await ev('document.getElementById("unsched").click(),1'); await sleep(2000);
    is = (await list('enewsIssues'))[0] || {};
    ok('"Don’t send yet": a draft again, with no copies to send', is.status === 'draft' && !is.htmlMembers && !is.htmlEveryone, is.status);
    /* "Send me a test" works now (Martin, 20 Oct): to the signed-in office
       person only, through Church HQ's Resend (mail-route.js; never Calla's,
       21 Oct). The emulator writes it down, not sends it. */
    await ev('document.getElementById("test").click(),1');
    await until('/Sent to/i.test(document.getElementById("testmsg").textContent) || /not|could/i.test(document.getElementById("testmsg").textContent)', 30000);
    const tests = (await list('emailOutbox')).filter(r => r.kind === 'enews test');
    ok('"Send me a test": one email, to the office person only, through Church HQ’s Resend (never Calla’s), marked [Test]', tests.length === 1 && JSON.stringify(tests[0].to) === JSON.stringify([PEOPLE.office.email]) && tests[0].via === 'churchhq' && /^\[Test\] /.test(tests[0].subject) && tests[0].ok === true, tests.map(t => [t.to, t.via, t.subject, t.error]));
    ok('the page says where it went', (await ev('document.getElementById("testmsg").textContent')).includes(PEOPLE.office.email), await ev('document.getElementById("testmsg").textContent'));

    /* "Preview web version" (Martin, 22 Oct): the draft's public copy at an
       unguessable link, Share to WhatsApp and Copy link beside it; opened
       signed out, it is marked "Preview" and has no members-only part. */
    await until('!!document.getElementById("wp-make")', 10000);
    await ev('document.getElementById("wp-make").click(),1');
    await until('!!document.getElementById("wp-link") || /Not made/.test(document.getElementById("wp-out").textContent)', 25000); await sleep(500);
    const wpUrl = await ev('(document.getElementById("wp-link")||{}).value||document.getElementById("wp-out").textContent');
    const wpTok = (/preview=([A-Za-z0-9_-]+)/.exec(wpUrl) || [])[1] || '';
    ok('Preview web version: an unguessable link to the draft\u2019s public copy', /^[A-Za-z0-9_-]{24}$/.test(wpTok), wpUrl);
    await shot('web-preview');
    await ev('(document.getElementById("wp-share")||{click:function(){}}).click(),1'); await sleep(900);
    const wpShare = await ev('(document.querySelector(".egbc-share textarea")||{}).value||""');
    ok('Share to WhatsApp (the hub\u2019s own share) opens with the preview link ready', !!wpTok && wpShare.includes('enews-web.html?preview=' + wpTok), wpShare);
    await ev('(document.querySelector(".egbc-share [data-close]")||{click:function(){}}).click(),1'); await sleep(300);
    await ev('(document.getElementById("wp-copy")||{click:function(){}}).click(),1'); await sleep(400);
    ok('Copy link is beside it', /Link copied/.test(await ev('document.getElementById("toast").textContent')));
    await ev('firebase.auth(EGBCAuth.app).signOut().then(()=>1)');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews-web.html?preview=' + (wpTok || 'none') });
    await until('!!document.getElementById("pvmark") || /Not found|Couldn/.test(document.body.innerText)', 15000); await sleep(1200);
    const wpHtml = await ev('(document.getElementById("w")||{}).srcdoc||""');
    ok('the preview link opens signed out, marked \u201cPreview: not sent yet\u201d', /Preview: not sent yet/.test(await ev('document.body.innerText')) && wpHtml.length > 500);
    ok('…with the public parts and never the members-only ones', wpHtml.includes('Synthetic harvest supper') && !wpHtml.includes('Synthetic members prayer') && !wpHtml.includes('Synthetic car park notice'), wpHtml.length);
    await shot('web-preview-signed-out');
    await signIn('office');

    /* 9. A sent issue: Share to WhatsApp, with the web version's link
       (which never has the members-only parts). */
    await put('enewsIssues/en_sent', { subject: 'Synthetic sent issue', preheader: '', template: 'classic', blocks: [], status: 'sent', sendAt: '2030-01-01T10:00', sentAt: '2030-01-01T10:00:00Z', counts: { sent: 3, failed: 0, members: 1 }, createdAt: 'x', createdBy: 'x', updatedAt: 'x', updatedBy: 'x' });
    await open('?issue=en_sent'); await until('!!document.getElementById("share")', 15000);
    ok('a sent issue opens on its Send page (not the editor)', await ev('location.pathname.endsWith("/enews.html")'));
    await ev('document.getElementById("share").click(),1'); await sleep(800);
    const shareText = await ev('(document.querySelector(".egbc-share textarea")||{}).value||""');
    ok('Share to WhatsApp opens with the web version’s link', /enews-web\.html\?issue=en_sent/.test(shareText) && /Synthetic sent issue/.test(shareText), shareText);
    await shot('share');
    await ev('(document.querySelector(".egbc-share [data-close]")||{click:function(){}}).click(),1');

    /* 7b. The Send page's summary counts members-only words (reviewing window, 22 Oct). */
    await put('enewsIssues/en_words', { subject: 'Synthetic words issue', preheader: '', template: 'classic', blocks: [{ type: 'sunday', title: 'Morning Worship', html: '<p>Join us at 10:30. <span data-members="1"><a href="https://youtu.be/privateSynthetic">Watch live</a></span></p>' },
      { type: 'event', title: '', html: '<p><strong>Prayer on Zoom</strong></p><ul><li><span data-members="1">Meeting ID: 831 2345 6789</span></li><li><span data-members="1">Passcode: 314159</span></li><li><span data-members="1"> </span></li></ul>' },
      { type: 'text', title: '', html: '<p>Plain words for everyone.</p>' },
      { type: 'text', members: true, title: '', html: '<p>Members meeting. <span data-members="1">Room 2</span></p>' }], status: 'draft', createdAt: 'x', createdBy: 'x', updatedAt: 'x', updatedBy: 'x' });
    await open('?issue=en_words&view=send'); await until('!!document.getElementById("sched")', 15000); await sleep(500);
    ok('the Send page’s summary: "3 members-only bits of words, in: Sunday, Prayer on Zoom", beside "1 members-only"', /3 members-only bits of words, in: Sunday, Prayer on Zoom/.test(await text()) && /1 members-only/.test(await text()), (await text()).slice(0, 500));
    await shot('words');

    /* 7c. No hidden caps (C-52; CLAUDE.md section 3): the list shows the
       latest 30 and says so, with "Show more"; every subscriber is counted,
       past the old 1,000, and shown 200 at a time. */
    for (let i = 0; i < 34; i += 17) await Promise.all(Array.from({ length: 17 }, (_, k) => put('enewsIssues/en_old' + String(i + k).padStart(2, '0'),
      { subject: 'Synthetic old issue ' + (i + k), preheader: '', template: 'classic', blocks: [], status: 'sent', createdAt: '2020-01-01T00:00:' + String(i + k).padStart(2, '0'), createdBy: 'x', updatedAt: 'x', updatedBy: 'x' })));
    await open(''); await until('document.querySelectorAll("#issues a[data-id]").length > 0', 15000); await sleep(500);
    const firstN = await ev('document.querySelectorAll("#issues a[data-id]").length');
    ok('the list: the latest 30, "Showing the latest 30" and Show more', firstN === 30 && /Showing the latest 30/.test(await ev('document.getElementById("issues").innerText')), firstN);
    await ev('document.querySelector("#issues .cm-more button").click(),1'); await until('!document.querySelector("#issues .cm-more") || document.querySelectorAll("#issues a[data-id]").length > 30', 10000); await sleep(400);
    const allN = await ev('document.querySelectorAll("#issues a[data-id]").length');
    ok('…Show more brings the rest, the oldest among them', allN > 30 && await ev('/Synthetic old issue 0\\b/.test(document.getElementById("issues").innerText)'), allN);
    for (let i = 0; i < 1005; i += 67) await Promise.all(Array.from({ length: Math.min(67, 1005 - i) }, (_, k) => put('enewsSubscribers/s' + String(i + k).padStart(4, '0'),
      { email: 'sub' + String(i + k).padStart(4, '0') + '@example.invalid', status: 'subscribed', lists: { weekly: true }, createdAt: 'x', updatedAt: 'x' })));
    await ev('document.getElementById("subsb").click(),1'); await until('/subscribed,/.test((document.getElementById("subs")||{}).innerText||"")', 30000); await sleep(500);
    const subsTxt = await ev('document.getElementById("subs").innerText');
    ok('every subscriber counted (1,005, past the old 1,000), shown 200 at a time', /1005 subscribed/.test(subsTxt) && /Showing 200 of 1005/.test(subsTxt) && await ev('document.querySelectorAll("#subs .srow").length') === 200, subsTxt.slice(0, 200));
    await ev('document.querySelector("#subs .cm-more button").click(),1'); await sleep(500);
    ok('…Show more shows the next 200', await ev('document.querySelectorAll("#subs .srow").length') === 400 && /Showing 400 of 1005/.test(await ev('document.getElementById("subs").innerText')));

    /* 8. A phone: nothing scrolls sideways, and nothing threw. */
    const w = await ev('document.documentElement.scrollWidth');
    ok('fits 375px (no sideways scroll)', w <= 375, w);
    const small = await ev('[...document.querySelectorAll("#wrap button, #wrap a, #wrap input, #wrap select")].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&(r.height<30)}).map(e=>(e.textContent||e.id).trim().slice(0,20)+" "+Math.round(e.getBoundingClientRect().height))');
    ok('no control under 30px tall', small.length === 0, small);
    ok('no errors thrown in the page', errors.length === 0, errors);
  } catch (e) {
    ok('the run finished', false, e.message);
  }
  ws.close(); chrome.kill(); server.close();
  const fails = R.filter(v => !v).length;
  console.log('\n' + (R.length - fails) + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
