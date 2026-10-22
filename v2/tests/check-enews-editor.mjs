/* The e-news editor (enews-edit.html; FINDINGS-comms plan A) in a real
 * browser, as the church office, at a computer's width and at 375.
 *
 *   node tests/check-enews-editor.mjs        (from v2/)
 *
 * NEEDS AN EMULATOR OF ITS OWN: Firestore and Auth in firebase.comms.json
 *   firebase emulators:start --only firestore,auth --config firebase.comms.json
 *
 * Asks, the same steps as Mailchimp's builder in the hub's own look: the
 * email is on the canvas, every block marked; tapping a block outlines it,
 * with its handle and Move / Copy / Delete; typing on the email saves the
 * words; the toolbar's bold, the church's colour and "Make it a link" are
 * kept; a block added by tapping and by dragging lands where it should;
 * moving, copying, deleting, undo and redo; Style and Who sees it; Check
 * lists what is missing and goes to it; Look's top line; Preview leaves the
 * members-only block out of everyone else's copy; on a phone, one column
 * with the dock; Done goes back to the E-news page's Send tab; a church
 * member is refused. Every step is read back from the saved issue.
 *
 * DELIBERATE BREAKS (each must turn this check red; wordcount drops the
 * members-only words line from Check):
 *   --break=typing  words typed on the email are not kept
 *   --break=undo    undo remembers nothing
 *   --break=drop    a block dropped on the email goes to the end
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
const PORT = 9795, SERVE = 9005, PW = 'test-only-password';
const SHOTS = path.join(V2, 'tests', 'shots');
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').slice(8);
const BREAKS = {
  typing: ["if (k === 'html') b.html = EGBCEditor.clean(el.innerHTML, rules());", "if (k === 'html') {}"],
  undo: ['function remember() { HIST.push(snapshot());', 'function remember() { return; HIST.push(snapshot());'],
  drop: ["if (d.indexOf('add:') === 0) addBlock(d.slice(4), tg.at);", "if (d.indexOf('add:') === 0) addBlock(d.slice(4), ISSUE.blocks.length);"],
  memwords: ["      if (c === 'members') return membersWords();", "      if (c === 'members') return;"],
  joinguard: ["        if (left.length && !confirm(", "        if (false && !confirm("],
  wordcount: ["    if (bits) out.push({ lv: 'ok', t: bits + ' members-only bit'", "    if (false) out.push({ lv: 'ok', t: bits + ' members-only bit'"]
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

const USERS = {
  office: { email: 'ed.office@example.invalid', member: 'ab_ed_office', teams: ['Church office'] },
  member: { email: 'ed.member@example.invalid', member: 'ab_ed_member', teams: [], churchMember: true }
};
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const swap = (src, from, to, file) => { if (!src.includes(from)) throw new Error(file + ' no longer has the line this check rewrites: ' + from.slice(0, 60)); return src.split(from).join(to); };
const ISSUE = { subject: 'Synthetic e-news 22 October', preheader: 'This week', template: 'classic', status: 'draft', sendAt: '', week: '2026-W43',
  createdAt: '2026-10-20T10:00:00Z', createdBy: 'x', updatedAt: 'x', updatedBy: 'x',
  blocks: [
    { type: 'header', imageUrl: '', title: '' },
    { type: 'verse', text: '', ref: '' },
    { type: 'section', label: 'Coming up this week' },
    { type: 'text', title: '', html: '<p>Welcome to the week.</p>' },
    { type: 'event', title: '', html: '<p><strong>Synthetic supper</strong><br>Bring a dish to share.</p>', imageUrl: '' }
  ] };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  try { await req(FS, 'GET', '/'); await req(AU, 'GET', '/'); } catch (e) { console.log('  FAIL  no emulator on ' + FS + '/' + AU + ' - start it first (see the header)'); process.exit(1); }
  await req(FS, 'DELETE', '/emulator/v1/projects/egbc-worship-planner/databases/(default)/documents');
  for (const u of Object.values(USERS)) {
    let up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: u.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: u.email, password: PW, returnSecureToken: true })).body || '{}');
    u.uid = up.localId;
    await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: u.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + u.member, { name: 'Ed Synthetic', email: u.email, markers: u.teams, masterAdmin: false, churchMember: u.churchMember === true, archived: false });
    await put('users/' + u.uid, { uid: u.uid, email: u.email, name: 'Ed Synthetic', memberId: u.member, status: 'active', linkedBy: 'admin', teams: u.teams, adminFor: [], masterAdmin: false, churchMember: u.churchMember === true, attender: true });
  }
  await put('churchSettings/details', { name: 'Synthetic Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '' });
  await put('enewsIssues/ed1', ISSUE);
  /* Members-only words in blocks that go to everyone (Check counts them). */
  await put('enewsIssues/ed3', { subject: 'Words', preheader: '', template: 'classic', status: 'draft', week: 'x', createdAt: 'x', createdBy: 'x', updatedAt: 'x', updatedBy: 'x',
    blocks: [{ type: 'sunday', title: 'Morning Worship', html: '<p>Join us at 10:30. <span data-members="1"><a href="https://youtu.be/privateSynthetic">Watch live</a></span></p>' },
      { type: 'event', title: '', html: '<p><strong>Prayer on Zoom</strong></p><ul><li><span data-members="1">Meeting ID: 831 2345 6789</span></li><li><span data-members="1">Passcode: 314159</span></li><li><span data-members="1"> </span></li></ul>' },
      { type: 'text', title: '', html: '<p>Plain words for everyone.</p>' },
      { type: 'text', members: true, title: '', html: '<p>Members meeting. <span data-members="1">Room 2</span></p>' }] });
  /* A members-only Zoom card whose joining details are not marked yet. */
  await put('enewsIssues/ed2', { subject: 'Zoom card', preheader: '', template: 'classic', status: 'draft', week: 'x', createdAt: 'x', createdBy: 'x', updatedAt: 'x', updatedBy: 'x',
    blocks: [{ type: 'event', members: true, title: '', html: '<p><strong>Prayer on Zoom</strong></p><ul><li>Meeting ID: 831 2345 6789</li><li>Passcode: 314159</li><li><a href="https://esherchurch.us1.list-manage.com/track/click?u=4f1e&amp;id=9a8b">Click here to join</a></li></ul>' }] });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase(), b = path.basename(f);
    let body = fs.readFileSync(f);
    try {
      if (b === 'egbc-auth.js') body = Buffer.from(swap(body.toString('utf8'), '{ firestore: 8181, auth: 9099, storage: 9199 }', '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399 }', b), 'utf8');
      if (BREAK && b === 'egbc-enews-editor.js') body = Buffer.from(swap(body.toString('utf8'), BREAKS[BREAK][0], BREAKS[BREAK][1], b), 'utf8');
    } catch (err) { console.log('  FAIL  ' + err.message); s.writeHead(500); return s.end(); }
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' }[e] || 'application/octet-stream') + (e === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-enews-ed-'));
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, 'enews-editor-' + name + '.png'), Buffer.from(r.data, 'base64')); };
  const signIn = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(1500);
    await ev('firebase.auth(EGBCAuth.app).signOut().then(()=>1)');
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(USERS[who].email) + ',' + JSON.stringify(PW) + ').then(()=>1)');
  };
  const C = 'document.getElementById("cv").contentDocument';
  const issue = async () => (await list('enewsIssues')).find(d => d._id === 'ed1') || {};
  const types = async () => ((await issue()).blocks || []).map(b => b.type).join(',');
  const settle = () => sleep(1600);
  const openEd = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews-edit.html?issue=ed1' });
    await until(C + ' && ' + C + '.querySelectorAll("[data-b]").length >= 5', 25000); await sleep(800);
  };
  const tap = (i) => ev(C + '.querySelector(\'[data-b="' + i + '"]\').click(),1');
  const dropAt = (data, i, below) => ev(`(function(){var d=${C};var t=d.querySelector('[data-b="${i}"]');var r=t.getBoundingClientRect();var dt=new DataTransfer();dt.setData('text/plain',${JSON.stringify(data)});var y=${below ? 'r.bottom-2' : 'r.top+2'};d.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,clientX:r.left+20,clientY:y,dataTransfer:dt}));d.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,clientX:r.left+20,clientY:y,dataTransfer:dt}));return 1})()`);

  try {
    await signIn('office'); await openEd();
    /* 1. The page: the same steps, the hub's look. */
    ok('the top: \u2039 E-news, the subject, Saved, Send me a test, Done', await ev('!!document.querySelector(".top .back") && document.getElementById("subj").value==="Synthetic e-news 22 October" && /Saved/.test(document.getElementById("saved").textContent) && !!document.getElementById("test") && /Done/.test(document.getElementById("done").textContent)'));
    ok('the left rail: Add, Look, Check', (await ev('[...document.querySelectorAll(".rail [data-panel]")].map(b=>b.textContent.trim()).join()')) === 'Add,Look,Check');
    const tilesTxt = await ev('[...document.querySelectorAll("[data-add]")].map(b=>b.textContent.trim()).join("|")');
    ok('Add: the blocks, the hub\u2019s own and the layouts, in our words', ['Picture', 'Heading', 'Words', 'Button', 'Line', 'Space', 'Video', 'Social links', 'Logo', 'Footer', 'Event', 'Bible verse', 'This Sunday', 'Meeting', 'Dates for the diary', 'Notices', '2 columns', 'Picture and words', 'Words and picture', 'Two pictures'].every(w => tilesTxt.split('|').includes(w)), tilesTxt);
    ok('the email itself is on the canvas, every block marked', (await ev(C + '.querySelectorAll("[data-b]").length')) === 5 && /Coming up this week/.test(await ev(C + '.body.innerText')));
    ok('no Mailchimp names in the editor', !/mailchimp|content blocks|optimize/i.test(await ev('document.body.innerText')));
    await shot('1440-start');

    /* 2. Tap a block: outlined, its handle, its tools, its settings. */
    await tap(3); await sleep(500);
    ok('a tapped block is outlined, with its "\u2836 Words" handle and Move / Copy / Delete', await ev(C + '.querySelector(\'[data-b="3"]\').classList.contains("on") && /Words/.test(' + C + '.querySelector(".ed-chip").textContent) && ' + C + '.querySelectorAll(".ed-tools button").length===4'));
    ok('its settings on the left: Content, Style, Who sees it', /Words/.test(await ev('document.querySelector(".ptitle").textContent')) && (await ev('[...document.querySelectorAll("[data-tab]")].map(b=>b.textContent).join()')) === 'Content,Style,Who sees it');

    /* 3. Type on the email. */
    await ev(`(function(){var d=${C};var e=d.querySelector('[data-b="3"] [data-edit="html"]');e.focus();e.innerHTML='<p>Welcome, everyone, to the week.</p>';e.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
    await settle();
    ok('words typed on the email are saved', /Welcome, everyone, to the week\./.test(((await issue()).blocks || [])[3].html || ''), ((await issue()).blocks || [])[3]);
    ok('while typing, the words toolbar is across the top', await ev('document.getElementById("tool").classList.contains("on")'));

    /* 4. The toolbar: bold, the church's colour, and "Make it a link". */
    const pick = (a, b) => ev(`(function(){var d=${C};var e=d.querySelector('[data-b="3"] [data-edit="html"]');e.focus();var t=d.createTreeWalker(e.querySelector('p'),NodeFilter.SHOW_TEXT).nextNode();var r=d.createRange();r.setStart(t,${a});r.setEnd(t,${b});var s=d.getSelection();s.removeAllRanges();s.addRange(r);d.dispatchEvent(new Event('selectionchange'));return 1})()`);
    await pick(0, 7);
    await ev('document.querySelector(\'#tool [data-cmd="bold"]\').click(),1'); await settle();
    ok('Bold, from the toolbar, is kept', /<(b|strong)>Welcome<\/(b|strong)>/.test(((await issue()).blocks || [])[3].html || ''), ((await issue()).blocks || [])[3].html);
    await drawAgain();
    async function drawAgain() { await ev(`(function(){var d=${C};var e=d.querySelector('[data-b="3"] [data-edit="html"]');e.innerHTML='<p>Welcome, everyone, to the week.</p>';e.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`); await sleep(300); }
    await pick(9, 17);
    await ev('document.querySelector(\'#tool [data-cmd="colour"]\').click(),1'); await sleep(200);
    ok('Colour offers only the church\u2019s colours', (await ev('document.querySelectorAll("#pop-colour [data-colour]").length')) >= 6 && await ev('!!document.querySelector(\'#pop-colour [data-colour="#008080"]\')'));
    await ev('document.querySelector(\'#pop-colour [data-colour="#008080"]\').click(),1'); await settle();
    ok('a word coloured teal is kept, teal', /<span style="color:#008080;?">everyone<\/span>/.test(((await issue()).blocks || [])[3].html || ''), ((await issue()).blocks || [])[3].html);
    await drawAgain(); await pick(26, 30);
    ok('selecting a word offers "Make it a link"', /Make it a link/.test(await ev('(' + C + '.querySelector(".ed-link")||{}).textContent||""')));
    await ev('window.prompt=function(){return "example.invalid/week"},' + C + '.querySelector(".ed-link").click(),1'); await settle();
    ok('the word becomes a link (https:// added)', /<a href="https:\/\/example\.invalid\/week"[^>]*>week<\/a>/.test(((await issue()).blocks || [])[3].html || ''), ((await issue()).blocks || [])[3].html);
    await shot('1440-typing');
    /* Font, size, line height and highlight (Martin, 20 Oct), from our look. */
    ok('the toolbar’s font, size and line height start from the church’s look', /Helvetica \(our look\)/.test(await ev('document.getElementById("t-font").options[0].textContent')) && /15 \(our look\)/.test(await ev('document.getElementById("t-size").options[0].textContent')) && /150% \(our look\)/.test(await ev('document.getElementById("t-lh").options[0].textContent')));
    await drawAgain(); await pick(0, 7);
    await ev('document.querySelector(\'#tool [data-cmd="highlight"]\').click(),1'); await sleep(200);
    await ev('document.querySelector(\'#pop-hl [data-hl="#fff3b0"]\').click(),1'); await settle();
    await pick(0, 7);
    await ev('var s=document.getElementById("t-size");s.dispatchEvent(new Event("mousedown"));s.value="24";s.dispatchEvent(new Event("change")),1'); await settle();
    ok('a size from the list is kept on the words', /font-size:24px/.test(((await issue()).blocks || [])[3].html || ''), [((await issue()).blocks || [])[3].html, await ev(C + '.querySelector(\'[data-b="3"] [data-edit]\').innerHTML')]);
    await pick(0, 7);
    await ev('var f=document.getElementById("t-font");f.dispatchEvent(new Event("mousedown"));f.value="Georgia";f.dispatchEvent(new Event("change")),1'); await settle();
    await pick(0, 7);
    await ev('var l=document.getElementById("t-lh");l.dispatchEvent(new Event("mousedown"));l.value="175%";l.dispatchEvent(new Event("change")),1'); await settle();
    await pick(0, 7);
    await ev('var l=document.getElementById("t-ls");l.dispatchEvent(new Event("mousedown"));l.value="2px";l.dispatchEvent(new Event("change")),1'); await settle();
    const sty = ((await issue()).blocks || [])[3].html || '';
    ok('highlight, size, font, line height and letter spacing are kept, as email-safe styles', /background-color:#fff3b0/.test(sty) && /font-size:24px/.test(sty) && /font-family:Georgia/.test(sty) && /line-height:175%/.test(sty) && /letter-spacing:2px/.test(sty), sty);
    ok('letter spacing goes on the words chosen only, and keeps their size', /<span[^>]*letter-spacing:2px[^>]*>Welcome<\/span>/.test(sty.replace(/<span style="[^"]*font-size:24px[^"]*">/g, m => m)) && !/letter-spacing:2px[^>]*>[^<]*everyone/.test(sty) && /font-size:24px/.test(sty), sty);
    ok('the list starts at Normal (our look)', /Normal spacing \(our look\)/.test(await ev('document.getElementById("t-ls").options[0].textContent')));
    await shot('1440-styles');
    await pick(0, 7);
    await ev('document.querySelector(\'#tool [data-cmd="ourlook"]\').click(),1'); await settle();
    const back = ((await issue()).blocks || [])[3].html || '';
    ok('"Back to our look" takes them off the selection', !/background-color|font-size|font-family|line-height|letter-spacing/.test(back) && /Welcome/.test(back), back);
    /* "Members only" for selected words (Martin, 22 Oct): kept, marked, in
       the members' copy; out of everyone else's; pressed again, for all. */
    await drawAgain(); await pick(0, 7);
    await ev("document.querySelector('#tool [data-cmd=\"members\"]').click(),1"); await settle();
    const mw = ((await issue()).blocks || [])[3].html || '';
    ok('"Members only" on selected words: kept in the block, marked', mw.includes('<span data-members="1">Welcome</span>'), mw);
    ok('…shown in gold on the email in the editor', await ev('(function(){var s=' + C + ".querySelector('[data-b=\"3\"] span[data-members]');return !!s && getComputedStyle(s).backgroundColor !== 'rgba(0, 0, 0, 0)'})()"));
    await ev('document.getElementById("preview").click(),1'); await sleep(900);
    const mwMem = await ev('document.querySelector(".over iframe").contentDocument.body.innerText');
    await ev("document.querySelector('.over [data-w=\"everyone\"]').click(),1"); await sleep(900);
    const mwAll = await ev('document.querySelector(".over iframe").contentDocument.body.innerText');
    await ev('document.querySelector(".over [data-x]").click(),1'); await sleep(300);
    ok('…church members see the words; everyone else sees the rest of the line without them', /Welcome, everyone, to the week/.test(mwMem) && !/Welcome/.test(mwAll) && /everyone, to the week/.test(mwAll), [mwMem.slice(0, 80), mwAll.slice(0, 80)]);
    await pick(0, 7);
    await ev("document.querySelector('#tool [data-cmd=\"members\"]').click(),1"); await settle();
    ok('…pressed again on them: for everyone again', !/data-members/.test(((await issue()).blocks || [])[3].html || ''), ((await issue()).blocks || [])[3].html);

    /* 5. Add: tap a tile (after the picked block); drag one onto the email. */
    await tap(3); await sleep(400);
    await ev('document.querySelector(".pback") && document.querySelector(".pback").click(),1'); await sleep(300);
    await tap(3); await sleep(300);
    await ev('document.querySelector(\'[data-panel="add"]\').click(),1'); await sleep(300);
    await ev('document.querySelector(\'[data-add="heading"]\').click(),1'); await settle();
    ok('a tapped tile goes after the picked block', (await types()) === 'header,verse,section,text,heading,event', await types());
    await until(C + ' && ' + C + '.querySelectorAll("[data-b]").length >= 6', 10000);
    await dropAt('add:divider', 0, false); await settle();
    ok('a block dragged onto the email lands where it is dropped (above the first)', (await types()).split(',')[0] === 'divider', await types());

    /* 6. Move, copy, delete; undo and redo. */
    await until(C + ' && ' + C + '.querySelectorAll("[data-b]").length >= 7', 10000);
    await tap(0); await sleep(400);
    await ev(C + '.querySelector(\'.ed-tools [data-t="down"]\').click(),1'); await settle();
    ok('Move down moves it one place', (await types()).split(',').slice(0, 2).join() === 'header,divider', await types());
    await until(C + ' && !!' + C + '.querySelector(".ed-tools")', 10000);
    await ev(C + '.querySelector(\'.ed-tools [data-t="copy"]\').click(),1'); await settle();
    ok('Copy puts a copy after it', (await types()).split(',').slice(1, 3).join() === 'divider,divider', await types());
    await until(C + ' && !!' + C + '.querySelector(".ed-tools")', 10000);
    await ev(C + '.querySelector(\'.ed-tools [data-t="del"]\').click(),1'); await settle();
    ok('Delete takes it out', ((await types()).match(/divider/g) || []).length === 1, await types());
    await ev('document.getElementById("undo").click(),1'); await settle();
    ok('Undo brings it back', ((await types()).match(/divider/g) || []).length === 2, await types());
    await ev('document.getElementById("redo").click(),1'); await settle();
    ok('Redo takes it out again', ((await types()).match(/divider/g) || []).length === 1, await types());
    await until(C + ' && ' + C + '.querySelectorAll("[data-b]").length >= 7', 10000);
    await dropAt('move:1', 6, true); await settle();
    ok('a block dragged by its handle moves there', (await types()).split(',').pop() === 'divider', await types());

    /* 7. Style; Who sees it. */
    const ti = ((await issue()).blocks || []).findIndex(b => b.type === 'text');
    await until(C + ' && ' + C + '.querySelectorAll("[data-b]").length >= 7', 10000);
    await tap(ti); await sleep(400);
    await ev('document.querySelector(\'[data-tab="style"]\').click(),1'); await sleep(300);
    await ev('document.querySelector(\'[data-look="bg"] [data-v="#eef5f4"]\').click(),1'); await settle();
    ok('Style: a background from the church\u2019s tints, on the email', ((await issue()).blocks[ti].look || {}).bg === '#eef5f4' && await ev(C + '.querySelector(\'[data-b="' + ti + '"] [bgcolor="#eef5f4"]\')!==null'));
    await ev('document.querySelector(\'[data-tab="who"]\').click(),1'); await sleep(300);
    await ev('document.getElementById("w-mem").click(),1'); await settle();
    ok('Who sees it: church members only, marked on the email', (await issue()).blocks[ti].members === true && await ev(C + '.querySelector(\'[data-b="' + ti + '"]\').getAttribute("data-mem")==="1"'));

    /* 8. Check, Look, Preview, Send me a test held. */
    await ev('document.querySelector(\'.rail [data-panel="check"]\').click(),1'); await sleep(400);
    const chk = await ev('document.getElementById("side").innerText');
    ok('Check lists what is missing: the week\u2019s picture and the verse', /Add this week\u2019s picture/.test(chk) && /Add this week\u2019s verse/.test(chk), chk.slice(0, 300));
    await ev('document.querySelector("[data-go]").click(),1'); await sleep(500);
    ok('"Go to it" picks that block', await ev(C + '.querySelector(\'[data-b].on\') && ' + C + '.querySelector(\'[data-b].on\').getAttribute("data-type")==="header"'));
    await ev('document.querySelector(\'.rail [data-panel="look"]\').click(),1'); await sleep(400);
    await ev('var p=document.getElementById("l-pre");p.value="All the news for this week";p.dispatchEvent(new Event("input")),1'); await settle();
    ok('Look: the top line is saved', (await issue()).preheader === 'All the news for this week');
    await ev('document.getElementById("test").click(),1'); await sleep(500);
    ok('"Send me a test" is held until Check is clear, and says so', /Check/.test(await ev('document.getElementById("toast").textContent')) && /Before it can be sent/.test(await ev('document.getElementById("side").innerText')));
    await ev('document.getElementById("preview").click(),1'); await sleep(900);
    const pvMem = await ev('document.querySelector(".over iframe").contentDocument.body.innerText');
    await ev('document.querySelector(\'.over [data-w="everyone"]\').click(),1'); await sleep(900);
    const pvAll = await ev('document.querySelector(".over iframe").contentDocument.body.innerText');
    ok('Preview: church members see the members-only words; everyone else does not', /Welcome/.test(pvMem) && !/Welcome/.test(pvAll), [pvMem.slice(0, 80), pvAll.slice(0, 80)]);
    await ev('document.querySelector(".over [data-x]").click(),1');
    const w = await ev('document.documentElement.scrollWidth');
    ok('fits the screen (no sideways scroll)', w <= 1440, w);
    /* The guard (reviewing window, 22 Oct): a members-only Zoom card made for
       everyone while its joining details are unmarked asks first. */
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews-edit.html?issue=ed2' });
    await until(C + ' && ' + C + '.querySelectorAll("[data-b]").length > 0', 25000); await sleep(800);
    await ev(C + ".querySelector('[data-b=\"0\"]').click(),1"); await sleep(500);
    await ev("document.querySelector('[data-tab=\"who\"]').click(),1"); await sleep(400);
    await ev("window.__asked=[];window.confirm=function(m){window.__asked.push(m);return false},1");
    await ev("var w=document.getElementById('w-mem');w.checked=false;w.dispatchEvent(new Event('change')),1"); await sleep(1600);
    const z2 = async () => (((await list('enewsIssues')).find(d => d._id === 'ed2') || {}).blocks || [])[0] || {};
    const asked = JSON.parse(await ev('JSON.stringify(window.__asked)'));
    ok('making a Zoom card for everyone while its joining details are unmarked asks first, listing them', asked.length === 1 && /Passcode: 314159/.test(asked[0]) && /Meeting ID: 831/.test(asked[0]) && /Click here to join/.test(asked[0]) && (await z2()).members === true && await ev("document.getElementById('w-mem').checked"), asked);
    await ev("window.confirm=function(){return true};var w=document.getElementById('w-mem');w.checked=false;w.dispatchEvent(new Event('change')),1"); await sleep(1800);
    ok('…and only when told to, is it made for everyone', (await z2()).members === false, await z2());
    /* Check counts members-only words like whole blocks (reviewing window, 22 Oct). */
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews-edit.html?issue=ed3' });
    await until(C + ' && ' + C + '.querySelectorAll("[data-b]").length >= 4', 25000); await sleep(800);
    await ev('document.querySelector(\'.rail [data-panel="check"]\').click(),1'); await sleep(400);
    const chk3 = await ev('document.getElementById("side").innerText');
    ok('Check: "3 members-only bits of words, in: Sunday, Prayer on Zoom", beside the members-only block', /3 members-only bits of words, in: Sunday, Prayer on Zoom\. Everyone else won’t get them\./.test(chk3) && /1 block is for church members only/.test(chk3), chk3.slice(0, 400));
    ok('no errors thrown', errors.length === 0, errors);

    /* 9. A phone. */
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
    await openEd();
    ok('on a phone: one column, the dock (Add, Look, This block, Check), no rail', await ev('getComputedStyle(document.querySelector(".rail")).display==="none" && getComputedStyle(document.querySelector(".dock")).display==="flex"') && (await ev('[...document.querySelectorAll(".dock [data-panel]")].map(b=>b.textContent.trim()).join()')) === 'Add,Look,This block,Check');
    await tap(2); await sleep(500);
    await ev('document.querySelector(\'.dock [data-panel="block"]\').click(),1'); await sleep(500);
    ok('a tapped block, then "This block": its settings as a sheet (the email stays clear while typing)', await ev('document.getElementById("side").classList.contains("on") && /Section bar/.test(document.querySelector(".ptitle").textContent)'));
    await shot('375-block');
    const w2 = await ev('document.documentElement.scrollWidth');
    ok('375: no sideways scroll', w2 <= 375, w2);

    /* 10. Done: back to the E-news page's Send tab. */
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await openEd();
    await ev('document.getElementById("done").click(),1'); await sleep(300);
    await ev('[...document.querySelectorAll(".menu a")].find(a=>/Schedule/.test(a.textContent)).click(),1');
    await until('location.pathname.endsWith("/enews.html") && !!document.getElementById("when")', 20000);
    ok('Done \u2192 Schedule: the E-news page, on its Send tab', await ev('!!document.getElementById("when") && /opens when the church goes live/.test(document.body.innerText)'));
    ok('the E-news page offers "Open the editor"', await until('!!document.getElementById("open-ed")', 15000));

    /* 11. A church member: refused. */
    await signIn('member'); await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews-edit.html?issue=ed1' });
    await until('/for the church office/.test(document.body.innerText)', 15000);
    ok('a church member is told it is for the office', /for the church office/.test(await ev('document.body.innerText')));
  } catch (e) {
    ok('the run finished', false, e.message);
  }
  ws.close(); chrome.kill(); server.close();
  const fails = R.filter(v => !v).length;
  console.log('\n' + (R.length - fails) + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
