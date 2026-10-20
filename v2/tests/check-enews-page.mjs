/* The E-news page in a real browser, at 375px (FINDINGS-comms step 2).
 *
 *   node tests/check-enews-page.mjs        (from v2/)
 *
 * NEEDS AN EMULATOR OF ITS OWN: Firestore and Auth on the ports in
 * firebase.comms.json (default 8292 / 9292), started with
 *   firebase emulators:start --only firestore,auth --config firebase.comms.json
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
 * e-news switched on?" answering yes; --break=office lets anybody in. Each
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
  switch: ["function usesEnews() { return !!(EGBCAuth.uses && EGBCAuth.uses('enews')); }", 'function usesEnews() { return true; }'],
  office: ['function may() { return', 'function may() { return true; return'],
  weekly: ['if (!thisWeek && !showList.autoTried) {', 'if (!showList.autoTried || true) {']
};
if (BREAK && !BREAKS[BREAK]) { console.log('Unknown break: ' + BREAK); process.exit(2); }
function serveAuth(src) {
  /* Point the page at this check's emulator. */
  const to = '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399 }';
  const out = src.replace("{ firestore: 8181, auth: 9099, storage: 9199 }", to);
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
  await put('events/en_sun', { date: SUNDAY, type: 'Morning Worship', serviceTime: '10:00', speaker: 'Sam Synthetic', publicTitle: 'Morning Worship', archived: false });
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
      if (BREAK && path.basename(f) === 'enews.html') {
        const t = body.toString('utf8'), [from, to] = BREAKS[BREAK];
        if (!t.includes(from)) throw new Error('break "' + BREAK + '": that line is not in enews.html any more - update the break');
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
       itself the first time they open the page (rule 13), once. */
    await signIn('office'); await open();
    await until('!!document.querySelector(".blk")', 15000); await sleep(1500);
    ok('this week’s draft is made by itself on first opening', (await ev('document.querySelectorAll(".blk").length')) > 3);
    await shot('draft');
    await open(); await sleep(1500);
    ok('opening again does not make a second one', (await list('enewsIssues')).length === 1 && /New e-news/.test(await text()), (await list('enewsIssues')).length);
    await shot('list');
    await ev('[...document.querySelectorAll("#issues a")][0].click(), 1');
    await until('!!document.querySelector(".blk")', 15000); await sleep(800);
    const issues = await list('enewsIssues');
    const dr = issues[0] || {};
    const blocks = dr.blocks || [];
    const evIds = blocks.filter(b => b.type === 'event').map(b => b.eventId);
    ok('a draft was saved', issues.length === 1 && dr.status === 'draft', issues.map(i => i.status));
    ok('the draft has the public event', evIds.includes('en_pub'), evIds);
    ok('the members event is members-only', (blocks.find(b => b.eventId === 'en_mem') || {}).members === true, blocks.find(b => b.eventId === 'en_mem'));
    ok('the NOT LISTED event is not in the draft', !evIds.includes('en_unl') && !JSON.stringify(blocks).includes('Synthetic support group'), evIds);
    ok('Sunday from the rota, with the speaker', blocks.some(b => b.type === 'sunday' && b.speaker === 'Sam Synthetic'), blocks.filter(b => b.type === 'sunday'));
    ok('the gold members-only count shows', /members-only/.test(await text()));

    /* 5. The previews: everyone else never gets the members-only parts. */
    await ev('[...document.querySelectorAll(".seg button")].find(b=>b.textContent==="Phone").click(), 1'); await sleep(800);
    const memHtml = await ev('document.getElementById("pv").srcdoc');
    await ev('[...document.querySelectorAll("[data-w]")].find(b=>b.dataset.w==="everyone").click(), 1'); await sleep(800);
    const pubHtml = await ev('document.getElementById("pv").srcdoc');
    await shot('phone-everyone');
    ok('members see the members prayer evening', memHtml.includes('Synthetic members prayer'));
    ok('everyone else does not', !pubHtml.includes('Synthetic members prayer') && pubHtml.includes('Synthetic harvest supper'));
    ok('everyone else does not get the notices (members-only until ticked)', !pubHtml.includes('Synthetic car park notice'));
    ok('every copy ends with Unsubscribe and the church\u2019s name', [memHtml, pubHtml].every(h => />Unsubscribe</.test(h) && h.includes('Synthetic Green Church')));

    /* 6. Val adds the verse: edit a block, and it is saved. */
    await ev('[...document.querySelectorAll(".seg button")].find(b=>b.textContent==="Build").click(), 1'); await sleep(500);
    await ev('[...document.querySelectorAll(".blk .c")].find(b=>/Bible verse/.test(b.textContent)).click(), 1'); await sleep(500);
    await shot('verse-sheet');
    await ev('document.getElementById("f-vt").value="Cast all your anxiety on him";document.getElementById("f-ref").value="1 Peter 5:7";document.querySelector("[data-done]").click(),1');
    await sleep(2500);
    const after = ((await list('enewsIssues'))[0] || {}).blocks || [];
    ok('the verse is saved', after.some(b => b.type === 'verse' && b.ref === '1 Peter 5:7'), after.filter(b => b.type === 'verse'));

    /* 7. Schedule: the two finished copies go on the issue; "don't send
       yet" takes them off again. */
    await ev('window.confirm=function(){return true},[...document.querySelectorAll(".seg button")].find(b=>b.textContent==="Send").click(), 1'); await sleep(800);
    await shot('send');
    await ev('document.getElementById("when").value="2030-01-03T16:00";document.getElementById("sched").click(),1');
    await sleep(2500);
    let is = (await list('enewsIssues'))[0] || {};
    ok('Schedule: scheduled, with the time', is.status === 'scheduled' && is.sendAt === '2030-01-03T16:00', [is.status, is.sendAt]);
    ok('Schedule: the members’ copy has the members prayer evening', String(is.htmlMembers || '').includes('Synthetic members prayer'));
    ok('Schedule: everybody else’s copy does not', String(is.htmlEveryone || '').length > 500 && !String(is.htmlEveryone).includes('Synthetic members prayer'));
    ok('Schedule: each person’s link is left for the sender to fill', String(is.htmlEveryone || '').includes('{{unsubscribe_url}}'));
    ok('the page says it is scheduled', /Scheduled/.test(await text()));
    await ev('document.getElementById("unsched").click(),1'); await sleep(2000);
    is = (await list('enewsIssues'))[0] || {};
    ok('"Don’t send yet": a draft again, with no copies to send', is.status === 'draft' && !is.htmlMembers && !is.htmlEveryone, is.status);
    await ev('[...document.querySelectorAll(".seg button")].find(b=>b.textContent==="Build").click(), 1'); await sleep(500);

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
