/* Templates and one-off emails (FINDINGS-comms plan F and G) in a real
 * browser, as the church office.
 *
 *   node tests/check-enews-emails.mjs        (from v2/)
 *
 * NEEDS AN EMULATOR OF ITS OWN: Firestore and Auth in firebase.comms.json.
 *
 * Asks: "New email" offers the 25 starters (and the church's own); a
 * starter becomes a one-off email in the editor; Check holds it while any
 * [part to fill in] is left; "Save as a template", then Rename / Copy /
 * Archive; who it goes to (church members, a team, people picked) is saved
 * and counted; the members' meeting starter picks the next members'
 * meeting; "What's on this month" fills its diary. Read back from the data.
 *
 * The welcome emails: written from their starters, kept apart from the
 * list, switched on only once their words are complete.
 *
 * DELIBERATE BREAKS: --break=autocopy (a welcome's finished copy not kept);
 * --break=fill (the [parts] don't hold it);
 * --break=audience (who it goes to isn't kept). Each must turn this red.
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
const PORT = 9790, SERVE = 9007, PW = 'test-only-password';
const SHOTS = path.join(V2, 'tests', 'shots');
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };
const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').slice(8);
const BREAKS = {
  fill: ['egbc-mailblocks.js', "      if (prompts.length) missing.push('fill');", ''],
  audience: ['enews.html', "b.onclick = function () { ISSUE.audience = b.getAttribute('data-aud'); DIRTY = true; save(true).then(draw); };", 'b.onclick = function () {};'],
  autocopy: ['egbc-enews-editor.js', "    if (/^auto_/.test(ISSUE_ID)) {", '    if (false) {']
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

const USERS = { office: { email: 'em.office@example.invalid', member: 'ab_em_office', teams: ['Church office'] } };
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const swap = (src, from, to, file) => { if (!src.includes(from)) throw new Error(file + ' no longer has the line this check rewrites: ' + from.slice(0, 60)); return src.split(from).join(to); };
const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(Date.now() + n * 86400000));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  try { await req(FS, 'GET', '/'); await req(AU, 'GET', '/'); } catch (e) { console.log('  FAIL  no emulator - start it first (see the header)'); process.exit(1); }
  await req(FS, 'DELETE', '/emulator/v1/projects/egbc-worship-planner/databases/(default)/documents');
  for (const u of Object.values(USERS)) {
    let up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: u.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: u.email, password: PW, returnSecureToken: true })).body || '{}');
    u.uid = up.localId;
    await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: u.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + u.member, { name: 'Em Office', email: u.email, markers: u.teams, archived: false });
    await put('users/' + u.uid, { uid: u.uid, email: u.email, name: 'Em Synthetic', memberId: u.member, status: 'active', linkedBy: 'admin', teams: u.teams, adminFor: [], masterAdmin: false, attender: true });
  }
  await put('churchSettings/details', { name: 'Synthetic Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '' });
  await put('addressBook/p_ann', { name: 'Ann Member', email: 'ann.em@example.invalid', churchMember: true, markers: ['Welcome team'], archived: false });
  await put('addressBook/p_bob', { name: 'Bob Member', email: 'bob.em@example.invalid', churchMember: true, markers: [], archived: false });
  await put('addressBook/p_kid', { name: 'Kit Young', email: 'kit.em@example.invalid', churchMember: true, under18: true, markers: ['Welcome team'], archived: false });
  await put('events/m_cmm', { date: day(9), type: 'Church Members Meeting', startTime: '19:30', videoRoom: 'CMM', archived: false });
  await put('calEvents/w1', { title: 'Synthetic quiz night', visibility: 'public', status: 'confirmed', audience: ['public'], startLocal: day(12) + 'T19:30', startUtc: Date.now() + 12 * 86400000 });
  /* This week's e-news already started, so the list doesn't draft one. */
  await put('enewsIssues/wk', { subject: 'This week', preheader: '', template: 'classic', blocks: [], status: 'draft', week: 'x', createdAt: new Date().toISOString(), createdBy: 'x', updatedAt: 'x', updatedBy: 'x' });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase(), b = path.basename(f);
    let body = fs.readFileSync(f);
    try {
      if (b === 'egbc-auth.js') body = Buffer.from(swap(body.toString('utf8'), '{ firestore: 8181, auth: 9099, storage: 9199 }', '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399 }', b), 'utf8');
      if (BREAK && b === BREAKS[BREAK][0]) body = Buffer.from(swap(body.toString('utf8').replace(/\r\n/g, '\n'), BREAKS[BREAK][1], BREAKS[BREAK][2], b), 'utf8');
    } catch (err) { console.log('  FAIL  ' + err.message); s.writeHead(500); return s.end(); }
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' }[e] || 'application/octet-stream') + (e === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-enews-em-'));
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, 'enews-emails-' + name + '.png'), Buffer.from(r.data, 'base64')); };
  const signIn = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(1500);
    await ev('firebase.auth(EGBCAuth.app).signOut().then(()=>1)');
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(USERS[who].email) + ',' + JSON.stringify(PW) + ').then(()=>1)');
  };
  const C = 'document.getElementById("cv").contentDocument';
  const list2 = async c => list(c);
  const openList = async () => { await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews.html' }); await until('!!document.getElementById("newmail")', 20000); await sleep(600); };
  const startFrom = async (name) => {
    await openList();
    await ev('document.getElementById("newmail").click(),1');
    await until('document.querySelectorAll(".sheet [data-t]").length > 5', 15000);
    await ev('[...document.querySelectorAll(".sheet [data-t]")].find(b=>b.textContent.startsWith(' + JSON.stringify(name) + ')).click(),1');
    await until('location.pathname.endsWith("/enews-edit.html") && ' + C + ' && ' + C + '.querySelectorAll("[data-b]").length > 0', 25000); await sleep(1000);
    return new URLSearchParams(await ev('location.search')).get('issue');
  };
  const issue = async id => (await list2('enewsIssues')).find(d => d._id === id) || {};

  try {
    await signIn('office'); await openList();
    await ev('document.getElementById("newmail").click(),1');
    await until('document.querySelectorAll(".sheet [data-t]").length > 5', 15000);
    const names = await ev('[...document.querySelectorAll(".sheet [data-t]")].map(b=>b.firstChild.textContent).join("|")');
    ok('New email offers the 25 starters, the church year among them', names.split('|').length === 25 && /Church members\u2019 meeting/.test(names) && /Advent & Christmas/.test(names) && /Mothering Sunday/.test(names) && /Letter from the minister/.test(names), names);
    ok('no Mailchimp names in it', !/mailchimp/i.test(await ev('document.querySelector(".sheet").innerText')));
    await shot('templates');

    /* A letter from the minister: a one-off email, held until filled in. */
    const id1 = await startFrom('Letter from the minister');
    let is = await issue(id1);
    ok('a starter becomes a one-off email, opened in the editor', is.kind === 'oneoff' && is.templateId === 'minister' && is.audience === 'subscribers' && (is.blocks || []).length === 2, [is.kind, is.templateId, is.audience]);
    await ev('document.querySelector(\'.rail [data-panel="check"]\').click(),1'); await sleep(500);
    const chk = await ev('document.getElementById("side").innerText');
    ok('Check lists each [part] still to fill in', /Fill in \u201c\[Your letter\.\]\u201d/.test(chk) && /Fill in \u201c\[Your name\]\u201d/.test(chk) && /Fill in \u201c\[name\]\u201d/.test(chk), chk.slice(0, 300));
    await ev('document.getElementById("test").click(),1'); await sleep(400);
    ok('"Send me a test" is held while any is left', /Check/.test(await ev('document.getElementById("toast").textContent')));
    /* Fill them in, on the email and the subject. */
    await ev(`(function(){var d=${C};[].forEach.call(d.querySelectorAll('[data-edit="html"]'),function(e){e.focus();e.innerHTML=e.innerHTML.replace('[Your letter.]','Thank you for this term.').replace('[Your name]','Sam');e.dispatchEvent(new Event('input',{bubbles:true}));});return 1})()`);
    await ev('var s=document.getElementById("subj");s.value="A letter from Sam";s.dispatchEvent(new Event("input")),1'); await sleep(1800);
    await ev('document.querySelector(\'.rail [data-panel="check"]\').click(),1'); await sleep(500);
    ok('filled in: Check is clear', !/Fill in/.test(await ev('document.getElementById("side").innerText')), await ev('document.getElementById("side").innerText'));
    is = await issue(id1);
    ok('Dear {{first_name}} is kept for the server to fill, person by person', /Dear \{\{first_name\}\}/.test(JSON.stringify(is.blocks)));
    /* Save as a template. */
    await ev('window.prompt=function(){return "Our letter"},document.getElementById("done").click(),1'); await sleep(300);
    await ev('document.getElementById("save-tpl").click(),1'); await sleep(1500);
    let T = await list2('emailTemplates');
    ok('Done \u2192 Save as a template keeps it for the church', T.length === 1 && T[0].name === 'Our letter' && (T[0].blocks || []).length === 2 && T[0].archived === false, T.map(t => t.name));
    /* Who it goes to, on the Send tab. */
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews.html?issue=' + id1 + '&view=send' });
    await until('document.querySelectorAll("[data-aud]").length===4', 20000); await sleep(800);
    await ev('document.querySelector(\'[data-aud="members"]\').click(),1'); await until('document.querySelector(\'[data-aud="members"]\').getAttribute("aria-selected")==="true"', 10000); await sleep(800);
    ok('Who it goes to: church members, counted (never under 18)', (await issue(id1)).audience === 'members' && /To: 2 people/.test(await ev('document.getElementById("who").textContent')), await ev('document.getElementById("who").textContent'));
    await ev('document.querySelector(\'[data-aud="team"]\').click(),1'); await until('!!document.getElementById("aud-team") && document.getElementById("aud-team").options.length>1', 10000);
    await ev('var t=document.getElementById("aud-team");t.value="Welcome team";t.dispatchEvent(new Event("change")),1'); await sleep(1500);
    ok('a team or group: chosen, kept and counted', (await issue(id1)).team === 'Welcome team' && /To: 1 person/.test(await ev('document.getElementById("who").textContent')), [(await issue(id1)).team, await ev('document.getElementById("who").textContent')]);
    await ev('document.querySelector(\'[data-aud="picked"]\').click(),1'); await until('!!document.getElementById("aud-pick")', 10000);
    await ev('document.getElementById("aud-pick").click(),1'); await sleep(500);
    await ev('document.querySelector(\'[data-p="p_bob"]\').click(),document.querySelector(".sheet [data-done]").click(),1'); await sleep(1500);
    ok('people picked: kept', JSON.stringify((await issue(id1)).picked) === '["p_bob"]', (await issue(id1)).picked);
    ok('an under-18 is never offered to pick', !(await ev('!!document.querySelector(\'[data-p="p_kid"]\')')));
    await shot('send');
    await ev('document.getElementById("when").value="2030-01-03T16:00";document.getElementById("sched").click(),1'); await sleep(2500);
    is = await issue(id1);
    ok('scheduled, with its two finished copies and who it goes to', is.status === 'scheduled' && String(is.htmlMembers || '').length > 500 && is.audience === 'picked', is.status);

    /* Our templates: Rename, Copy, Archive; and they are offered under Ours. */
    await openList();
    await ev('window.prompt=function(){return "Our letter, renamed"},document.getElementById("tpls").click(),1'); await until('document.querySelectorAll(".sheet [data-a]").length>0', 10000);
    await ev('document.querySelector(\'.sheet [data-a="ren"]\').click(),1'); await sleep(1500);
    await ev('document.querySelector(\'.sheet [data-a="copy"]\').click(),1'); await sleep(1500);
    T = await list2('emailTemplates');
    ok('Rename and Copy', T.length === 2 && T.some(t => t.name === 'Our letter, renamed') && T.some(t => /\(copy\)/.test(t.name)), T.map(t => t.name));
    await ev('[...document.querySelectorAll(\'.sheet [data-a="arch"]\')].pop().click(),1'); await sleep(1500);
    T = await list2('emailTemplates');
    ok('Archive takes one off the list (kept)', T.length === 2 && T.filter(t => t.archived === true).length === 1);
    await ev('document.querySelector(".sheet .x").click(),1'); await sleep(300);
    await ev('document.getElementById("newmail").click(),1'); await until('document.querySelectorAll(".sheet [data-t]").length > 5', 15000);
    ok('New email offers ours first, archived ones not', /^Ours/.test(await ev('document.querySelector("#tp").innerText')) && (await ev('document.querySelectorAll(".sheet [data-ours]").length')) === 1);

    /* Starters that fill themselves in. */
    const id2 = await startFrom('Church members\u2019 meeting');
    is = await issue(id2);
    const mt = (is.blocks || []).find(b => b.type === 'meeting') || {};
    ok('the members\u2019 meeting starter: for church members, the next members\u2019 meeting already picked', is.audience === 'members' && mt.eventId === 'm_cmm' && /meeting\.html\?room=CMM/.test(mt.url || ''), [is.audience, mt]);
    /* From Members' meetings (church-meeting.html), when there is one: a
       Zoom meeting, its joining details in the members-only block alone. */
    await put('churchMeetings/cm1', { title: 'Church members\u2019 meeting', date: day(16), time: '19:30', place: 'Synthetic church hall', joinKind: 'zoom', room: 'CMM', status: 'planned' });
    await put('churchMeetings/cm1/private/join', { zoomUrl: 'https://zoom.example.invalid/j/5550001', zoomId: '555 0001', passcode: 'synth1' });
    const id4 = await startFrom('Church members\u2019 meeting');
    const b4 = (await issue(id4)).blocks || [];
    const when16 = new Date(day(16) + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).replace(',', '');
    const z = b4.find(b => b.type === 'meeting') || {}, ag = b4.find(b => b.type === 'button') || {};
    ok('…from Members\u2019 meetings: its day, time and place filled in', JSON.stringify(b4).includes(when16 + ' at 19:30') && JSON.stringify(b4).includes('Synthetic church hall'), JSON.stringify(b4).slice(0, 300));
    ok('…the agenda button goes to Members\u2019 meetings, for members only', /\/church-meeting\.html\?meeting=cm1$/.test(ag.url || '') && ag.label === 'See the agenda and minutes' && ag.members === true, ag);
    ok('…a Zoom meeting: Join on Zoom, its ID and passcode, for members only', z.url === 'https://zoom.example.invalid/j/5550001' && z.zoom === true && /555 0001/.test(z.text) && /synth1/.test(z.text) && z.members === true, z);
    const MBv = await ev('(function(){var i=' + JSON.stringify({ subject: 'x', template: 'classic', blocks: b4 }) + ';return [EGBCMailBlocks.render(i,{version:"members",church:{name:"S"}}),EGBCMailBlocks.render(i,{version:"everyone",church:{name:"S"}})]})()');
    ok('…the Zoom details are in the members\u2019 copy, never everyone\u2019s', MBv[0].includes('zoom.example.invalid') && MBv[0].includes('synth1') && !MBv[1].includes('zoom.example.invalid') && !MBv[1].includes('synth1'));
    const id3 = await startFrom('What\u2019s on this month');
    const dy = ((await issue(id3)).blocks || []).find(b => b.type === 'diary') || {};
    ok('"What\u2019s on this month" fills its diary from What\u2019s On', (dy.items || []).some(x => /Synthetic quiz night/.test(x.title)), dy.items);
    /* The welcome emails (plan G: sent by themselves). */
    await openList();
    await ev('document.getElementById("welc").click(),1'); await until('document.querySelectorAll(".sheet [data-k]").length===2', 10000); await sleep(800);
    ok('Welcome emails: both, off and not yet written, and they can\u2019t be switched on yet', (await ev('[...document.querySelectorAll(".sheet [data-on]")].every(c=>c.disabled&&!c.checked)')) && /Not written yet/.test(await ev('document.querySelector(".sheet").innerText')));
    ok('the newcomer welcome says who it goes to: that address only, never under 18, never a referral', /to that address only, never to anyone under 18/.test(await ev('document.querySelector(\'.sheet [data-k="newcomer"]\').innerText')) && /never a referral/.test(await ev('document.querySelector(\'.sheet [data-k="newcomer"]\').innerText')));
    await shot('welcomes');
    await ev('document.querySelector(\'.sheet [data-k="newcomer"] [data-edit]\').click(),1');
    await until('location.pathname.endsWith("/enews-edit.html") && ' + C + ' && ' + C + '.querySelectorAll("[data-b]").length > 0', 25000); await sleep(1500);
    let au = await issue('auto_newcomer');
    ok('"Write it" starts the newcomer welcome from its starter, in the editor', au.templateId === 'newcomer' && au.kind === 'oneoff' && au.status === 'draft' && (au.blocks || []).length === 2 && au.htmlEveryone === '', [au.templateId, au.kind]);
    ok('…and its Done menu goes back to Welcome emails, never Schedule', await ev('document.getElementById("done").click(),[...document.querySelectorAll(".menu a")].map(a=>a.textContent).join("|")').then(x => /Back to the welcome emails/.test(x) && !/Schedule/.test(x)));
    await ev('document.querySelector(".menu") && document.querySelector(".menu").remove(),1');
    await ev(`(function(){var d=${C};[].forEach.call(d.querySelectorAll('[data-edit="html"]'),function(e){e.focus();e.innerHTML=e.innerHTML.replace(/\\[([^\\[\\]]{2,80})\\]/g,'Synthetic words');e.dispatchEvent(new Event('input',{bubbles:true}));});return 1})()`); await sleep(2500);
    au = await issue('auto_newcomer');
    ok('filled in: its finished copy is kept, Dear {{first_name}} left for the server, no web version link', String(au.htmlEveryone || '').length > 500 && /Dear \{\{first_name\}\}/.test(au.htmlEveryone) && !/\[[^\[\]]{2,80}\]/.test(au.htmlEveryone.replace(/<[^>]*>/g, '')) && !/enews-web\.html/.test(au.htmlEveryone), String(au.htmlEveryone || '').length);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews.html?welcomes=1' });
    await until('document.querySelectorAll(".sheet [data-k]").length===2', 20000); await sleep(800);
    ok('back on Welcome emails: the newcomer one can be switched on now, the other still can\u2019t', !(await ev('document.querySelector(\'.sheet [data-k="newcomer"] [data-on]\').disabled')) && await ev('document.querySelector(\'.sheet [data-k="subscriber"] [data-on]\').disabled'));
    await ev('var c=document.querySelector(\'.sheet [data-k="newcomer"] [data-on]\');c.checked=true;c.dispatchEvent(new Event("change")),1'); await sleep(1800);
    const W = (await list2('enewsSettings')).find(d => d._id === 'welcomes') || {};
    ok('switched on: kept for the server (newcomer on, subscriber off)', W.newcomer === true && W.subscriber === false && /On: it sends by itself/.test(await ev('document.querySelector(\'.sheet [data-k="newcomer"]\').innerText')), W);
    await ev('document.querySelector(".sheet .x").click(),1'); await sleep(1200);
    ok('the welcome emails\u2019 words are not in the list of e-news and emails', !/Lovely to meet you/.test(await ev('document.getElementById("issues").innerText')));
    ok('no errors thrown', errors.length === 0, errors);
  } catch (e) {
    ok('the run finished', false, e.message);
  }
  ws.close(); chrome.kill(); server.close();
  const fails = R.filter(v => !v).length;
  console.log('\n' + (R.length - fails) + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
