/* "Add a meeting" in the e-news and the Email Compiler, in a real browser at
 * 375px (FINDINGS-comms C-35; Martin, 20 Oct: "Pick a meeting from the
 * hub's Meetings list; it fills the name, date and time and a Join button
 * (the hub meeting page link, knock-and-admit). Members-only by default.
 * The CMM template includes it.").
 *
 *   node tests/check-enews-meeting.mjs        (from v2/)
 *
 * NEEDS AN EMULATOR OF ITS OWN: Firestore and Auth in firebase.comms.json
 *   firebase emulators:start --only firestore,auth --config firebase.comms.json
 * The pages are served from here with egbc-auth.js pointed at it.
 *
 * Asks: the picker offers the Meetings list (coming meetings with a video
 * room; not archived, past or no-call ones) and marks the CMM; picking
 * fills the name, day, time and Join (the hub's meeting page, knock); the
 * Church members' meeting starter brings in the next CMM, and doesn't stop
 * the week's e-news making itself; Scheduled, the meeting is in the
 * members' copy only; the CMM can't be unticked; and the Compiler's
 * "+ Insert → A meeting" puts the same meeting in the email.
 *
 * DELIBERATE BREAKS (each must turn this check red):
 *   --break=old     the picker offers archived and past meetings
 *   --break=notice  a members' meeting notice stops this week's e-news
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync('firebase.comms.json', 'utf8'));
const FS = C1.emulators.firestore.port, AU = C1.emulators.auth.port;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9794, SERVE = 9004, PW = 'test-only-password';
const SHOTS = path.join(V2, 'tests', 'shots');
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').slice(8);
const BREAKS = {
  old: ['egbc-meeting-pick.js', ".filter(function (ev) { return ev.archived !== true && roomFor(ev); })", ".filter(function (ev) { return roomFor(ev); })", "where('date', '>=', today)", "where('date', '>=', '2000-01-01')"],
  notice: ['enews.html', "return d.data().week !== 'notice' && String(", 'return String(']
};
if (BREAK && !BREAKS[BREAK]) { console.log('Unknown break: ' + BREAK); process.exit(2); }

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
const subOf = async email => (await list('enewsSubscribers')).find(s => s.email === email);

const USERS = { office: { email: 'meet.office@example.invalid', member: 'ab_meet_office', teams: ['Church office'] } };
const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(Date.now() + n * 86400000));
const longDay = n => new Date(day(n) + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const swap = (src, from, to, file) => { if (!src.includes(from)) throw new Error(file + ' no longer has the line this check rewrites: ' + from.slice(0, 60)); return src.split(from).join(to); };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  try { await req(FS, 'GET', '/'); await req(AU, 'GET', '/'); } catch (e) { console.log('  FAIL  no emulator on ' + FS + '/' + AU + ' - start it first (see the header)'); process.exit(1); }
  await req(FS, 'DELETE', '/emulator/v1/projects/egbc-worship-planner/databases/(default)/documents');
  for (const u of Object.values(USERS)) {
    let up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: u.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: u.email, password: PW, returnSecureToken: true })).body || '{}');
    u.uid = up.localId;
    await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: u.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + u.member, { name: 'Meet Office Synthetic', email: u.email, markers: u.teams, masterAdmin: false, archived: false });
    await put('users/' + u.uid, { uid: u.uid, email: u.email, name: 'Meet Synthetic', memberId: u.member, status: 'active', linkedBy: 'admin', teams: u.teams, adminFor: [], masterAdmin: false, attender: true });
  }
  await put('churchSettings/details', { name: 'Synthetic Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '' });
  /* The Meetings list: rota events with a video room. */
  await put('events/m_cmm', { date: day(9), type: 'Church Members Meeting', description: 'Autumn', startTime: '19:30', endTime: '21:00', videoRoom: 'CMM', archived: false });
  await put('events/m_pray', { date: day(4), type: 'Prayer Meeting', startTime: '20:00', videoRoom: 'Prayer', archived: false });
  await put('events/m_old', { date: day(-3), type: 'Synthetic past meeting', startTime: '20:00', videoRoom: 'Prayer', archived: false });
  await put('events/m_arch', { date: day(6), type: 'Synthetic archived meeting', startTime: '20:00', videoRoom: 'Prayer', archived: true });
  await put('events/m_nocall', { date: day(5), type: 'Synthetic room-only meeting', startTime: '20:00', videoRoom: '', archived: false });
  /* A members' meeting notice started this week, before anything else. */
  await put('enewsIssues/n_notice', { subject: 'Synthetic notice', preheader: '', template: 'classic', blocks: [], status: 'draft', week: 'notice', createdAt: new Date().toISOString(), createdBy: 'x', updatedAt: 'x', updatedBy: 'x' });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase(), b = path.basename(f);
    let body = fs.readFileSync(f);
    try {
      if (b === 'egbc-auth.js') body = Buffer.from(swap(body.toString('utf8'), '{ firestore: 8181, auth: 9099, storage: 9199 }', '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399 }', b), 'utf8');
      if (BREAK && b === BREAKS[BREAK][0]) { let t = body.toString('utf8'); for (let k = 1; k < BREAKS[BREAK].length; k += 2) t = swap(t, BREAKS[BREAK][k], BREAKS[BREAK][k + 1], b); body = Buffer.from(t, 'utf8'); }
    } catch (err) { console.log('  FAIL  ' + err.message); s.writeHead(500); return s.end(); }
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' }[e] || 'application/octet-stream') + (e === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-enews-meet-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--no-first-run', '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(tabs.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(), errors = [], dialogs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error || {}); pend.delete(m.id); }
    /* A page's alert or confirm would stop everything: say yes, and note it. */
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text)); return r.result && r.result.value; };
  const until = async (x, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x).catch(() => false)) return true; await sleep(250); } return false; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, 'enews-meeting-375-' + name + '.png'), Buffer.from(r.data, 'base64')); };
  const signIn = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(1500);
    await ev('firebase.auth(EGBCAuth.app).signOut().then(()=>1)');
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(USERS[who].email) + ',' + JSON.stringify(PW) + ').then(()=>1)');
  };
  const pickerRows = () => ev('[...document.querySelectorAll(".egbc-meetpick [data-k]")].map(b=>b.innerText.replace(/\\s+/g," "))');
  const pickRow = (re) => ev('(function(){var b=[...document.querySelectorAll(".egbc-meetpick [data-k]")].find(function(x){return ' + re + '.test(x.innerText)});if(b)b.click();return !!b})()');
  const issues = () => list('enewsIssues');

  try {
    await signIn('office');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews.html' });
    /* The old editor is replaced (21 Oct): the week's draft opens in the
       new one (enews-edit.html), where these steps are done now. */
    const C = 'document.getElementById("cv") && document.getElementById("cv").contentDocument';
    const onEditor = async () => { await until('location.pathname.endsWith("/enews-edit.html") && ' + C + ' && ' + C + '.querySelectorAll("[data-b]").length > 0', 25000); await sleep(1200); };
    await onEditor();
    /* 1. A members' meeting notice doesn't count as this week's e-news. */
    const weekly = (await issues()).filter(i => i._id !== 'n_notice');
    ok('a members\u2019 meeting notice doesn\u2019t stop this week\u2019s e-news making itself', weekly.length === 1 && weekly[0].week !== 'notice', weekly.map(i => i.subject));

    /* 2. The editor -> Add -> Meeting: the Meetings list. */
    await ev('document.querySelector(\'[data-panel="add"]\').click(),1'); await sleep(500);
    await ev('document.querySelector(\'[data-add="meeting"]\').click(),1');
    await until('document.querySelectorAll(".egbc-meetpick [data-k]").length > 0', 15000);
    const rows = await pickerRows();
    ok('the picker offers the coming meetings with a video room, soonest first', rows.length === 2 && /Prayer Meeting/.test(rows[0]) && /Church Members Meeting/.test(rows[1]), rows);
    ok('never a past or archived meeting, or one with no call', !rows.some(r => /past|archived|room-only/.test(r)), rows);
    ok('the CMM is marked "Church members only"', /Church members only/.test(rows[1]) && !/Church members only/.test(rows[0]), rows);
    await shot('picker');
    await pickRow('/Prayer Meeting/'); await sleep(2500);
    let is = (await issues()).find(i => i._id !== 'n_notice' && i.week !== 'notice') || {};
    let mb = (is.blocks || []).find(b => b.type === 'meeting') || {};
    ok('picking fills the name, day and time, and Join to the hub\u2019s meeting page', mb.title === 'Prayer Meeting' && mb.date === day(4) && mb.startTime === '20:00' && mb.url === 'http://localhost:' + SERVE + '/meeting.html?room=Prayer&event=m_pray', mb);
    ok('members-only by default', mb.members === true);
    ok('the block says so in the editor (the gold members-only edge)', await ev('!!' + C + '.querySelector(\'[data-type="meeting"][data-mem="1"]\')'));

    /* 3. The Church members' meeting starter ("the CMM template"). */
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews.html' }); await until('!!document.getElementById("newcmm")', 20000); await sleep(800);
    await ev('document.getElementById("newcmm").click(),1');
    await onEditor(); await sleep(800);
    is = (await issues()).filter(i => i.week === 'notice' && i._id !== 'n_notice')[0] || {};
    mb = (is.blocks || []).find(b => b.type === 'meeting') || {};
    ok('the starter: a notice with the next CMM in it, members-only', mb.room === 'CMM' && mb.eventId === 'm_cmm' && mb.members === true && /meeting\.html\?room=CMM&event=m_cmm$/.test(mb.url) && /Church members/.test(is.subject), [is.subject, mb]);
    ok('and the day in the subject', is.subject.includes(longDay(9)), is.subject);
    await shot('cmm');
    /* The CMM can't be unticked. */
    await ev(C + '.querySelector(\'[data-type="meeting"]\').click(),1'); await sleep(600);
    await ev('document.querySelector(\'[data-tab="who"]\').click(),1'); await sleep(400);
    ok('the CMM\u2019s "Church members only" tick can\u2019t be taken off', await ev('document.getElementById("w-mem").checked && document.getElementById("w-mem").disabled'));
    const cmmId = new URLSearchParams(await ev('location.search')).get('issue');

    /* 4. Scheduled: the meeting is in the members' copy only. */
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews.html?issue=' + cmmId + '&view=send' }); await until('!!document.getElementById("sched")', 20000); await sleep(800);
    await ev('document.getElementById("when").value="2030-01-03T16:00";document.getElementById("sched").click(),1'); await sleep(2500);
    is = (await issues()).filter(i => i.week === 'notice' && i._id !== 'n_notice')[0] || {};
    ok('scheduled: Join is in the members\u2019 copy', is.status === 'scheduled' && String(is.htmlMembers || '').includes('meeting.html?room=CMM&amp;event=m_cmm'), is.status);
    ok('and not in everyone else\u2019s (nor the web version and shares, made from it)', String(is.htmlEveryone || '').length > 500 && !String(is.htmlEveryone).includes('meeting.html'));
    await ev('document.getElementById("unsched").click(),1'); await sleep(1500);

    /* 5. The Email Compiler: + Insert -> A meeting. */
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/EmailBuilder2.html' });
    await until('!!document.getElementById("editable-body") && !!window.EGBCMeetingPick', 20000); await sleep(1500);
    await ev('(function(){var s=[...document.querySelectorAll("select.tsel")].find(x=>[...x.options].some(o=>o.value==="meeting"));s.value="meeting";s.dispatchEvent(new Event("change"));return 1})()');
    await until('document.querySelectorAll(".egbc-meetpick [data-k]").length > 0', 15000);
    ok('the Compiler\u2019s "+ Insert" has "A meeting", with the same list', (await pickerRows()).length === 2);
    ok('it says a members-only room is for church members', /Church members only/.test(await ev('document.querySelector(".egbc-meetpick").innerText')) && /send that one to church members/.test(await ev('document.querySelector(".egbc-meetpick").innerText')));
    await pickRow('/Church Members Meeting/'); await sleep(800);
    const body = await ev('document.getElementById("editable-body").innerHTML');
    ok('the meeting goes into the email: name, day, time and Join', body.includes('Church Members Meeting') && body.includes(longDay(9)) && body.includes('7:30pm') && body.includes('meeting.html?room=CMM&amp;event=m_cmm') && />Join the meeting</.test(body));
    await shot('compiler');
    const w = await ev('document.documentElement.scrollWidth');
    ok('fits 375px (no sideways scroll)', w <= 375, w);
    ok('no errors thrown in the pages', errors.length === 0, errors);
  } catch (e) {
    ok('the run finished', false, e.message);
  }
  ws.close(); chrome.kill(); server.close();
  const fails = R.filter(v => !v).length;
  console.log('\n' + (R.length - fails) + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
