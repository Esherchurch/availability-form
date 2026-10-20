/* "Gets the e-news" in the address book, in a real browser at 375px
 * (FINDINGS-comms C-30; Martin, 20 Oct: "The address book shows 'Gets the
 * e-news' on each person and the office can change it there. Unsubscribed
 * people can't be re-added from the address book.").
 *
 *   node tests/check-enews-addressbook.mjs        (from v2/)
 *
 * NEEDS EMULATORS OF ITS OWN (never another window's):
 *   firebase emulators:start --only firestore,auth --config firebase.comms.json
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8292 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9292 \
 *     firebase emulators:start --only functions --config firebase.comms-fn.json
 * addressbook.html is served from here with egbc-auth.js and egbc-db.js
 * pointed at those ports (a rewrite as the files are served).
 *
 * Asks, as the church office: each row says who gets it and who has
 * unsubscribed; the form says how a subscriber said yes, and can stop it;
 * an unsubscribed person can't be added; an under-16 is never offered;
 * adding someone needs how they said yes, and is recorded. A team admin
 * who is not the office sees none of it. Pictures: tests/shots/enews-ab-*.
 *
 * DELIBERATE BREAKS (each must turn this check red):
 *   --break=office   everybody who can open the address book gets it
 *   --break=unsub    an unsubscribed person is offered "Add to the e-news"
 *   --break=minor    an under-16 is offered it
 *   --break=silent   "Add" goes ahead without how they said yes
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync('firebase.comms.json', 'utf8')), C2 = JSON.parse(fs.readFileSync('firebase.comms-fn.json', 'utf8'));
const FS = C1.emulators.firestore.port, AU = C1.emulators.auth.port, FN = C2.emulators.functions.port;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9793, SERVE = 9003, PW = 'test-only-password';
const SHOTS = path.join(V2, 'tests', 'shots');
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };

const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').slice(8);
const BREAKS = {
  office: ["return !!office && !!(A.uses && A.uses('enews'));", 'return true;'],
  unsub: ["if (x && (x.status === 'unsubscribed' || x.status === 'complained' || x.status === 'bounced')) {", 'if (false) {'],
  minor: ['if (minor) { p.innerHTML', 'if (false) { p.innerHTML'],
  silent: ["if (!how) { alert('Choose how they said yes first. Nobody is added without it.'); return; }", "if (!how) how = 'person';"]
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

/* ---- the people (all made up) ------------------------------------------ */
const USERS = {
  office: { email: 'ab.office@example.invalid', member: 'ab_office', teams: ['Church office'], adminFor: [] },
  admin: { email: 'ab.teamadmin@example.invalid', member: 'ab_teamadmin', teams: ['Welcome team'], adminFor: ['Welcome team'] }
};
const FOLK = {
  ann: { name: 'Ann Synthetic', email: 'ann.ab@example.invalid' },
  ben: { name: 'Ben Synthetic', email: 'ben.ab@example.invalid' },
  una: { name: 'Una Synthetic', email: 'una.ab@example.invalid' },
  kit: { name: 'Kit Synthetic', email: 'kit.ab@example.invalid', isMinor: true }
};

const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const swap = (src, from, to, file) => { if (!src.includes(from)) throw new Error(file + ' no longer has the line this check rewrites: ' + from.slice(0, 60)); return src.split(from).join(to); };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  try { await req(FS, 'GET', '/'); await req(AU, 'GET', '/'); await req(FN, 'GET', '/'); } catch (e) { console.log('  FAIL  no emulators on ' + FS + '/' + AU + '/' + FN + ' - start them first (see the header)'); process.exit(1); }
  await req(FS, 'DELETE', '/emulator/v1/projects/egbc-worship-planner/databases/(default)/documents');
  for (const u of Object.values(USERS)) {
    let up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: u.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: u.email, password: PW, returnSecureToken: true })).body || '{}');
    u.uid = up.localId;
    await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: u.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + u.member, { name: 'Ab ' + u.teams[0] + ' Synthetic', email: u.email, markers: u.teams, masterAdmin: false, archived: false });
    await put('users/' + u.uid, { uid: u.uid, email: u.email, name: 'Ab Synthetic', memberId: u.member, status: 'active', linkedBy: 'admin', teams: u.teams, adminFor: u.adminFor, masterAdmin: false, attender: true });
  }
  for (const [k, f] of Object.entries(FOLK)) await put('addressBook/ab_' + k, { name: f.name, email: f.email, markers: ['Welcome team'], isMinor: f.isMinor === true, masterAdmin: false, archived: false });
  await put('enewsSubscribers/s_ann', { email: FOLK.ann.email, firstName: 'Ann', status: 'subscribed', lists: { weekly: true, special: false }, consent: { at: '2026-10-01T09:00:00Z', how: 'office: a paper form', confirmedAt: '2026-10-01T09:00:00Z' }, token: 'synthetictokenannnnnnnnnnnnnnnn1', history: [], updatedAt: '2026-10-01T09:00:00Z' });
  await put('enewsSubscribers/s_una', { email: FOLK.una.email, firstName: 'Una', status: 'unsubscribed', lists: { weekly: false, special: false }, token: 'synthetictokenunaaaaaaaaaaaaaaa1', history: [], updatedAt: '2026-10-05T09:00:00Z' });
  await put('churchSettings/details', { name: 'Synthetic Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '' });
  await put('churchSettings/launch', { rulesLocked: true, opensOn: '' });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase(), b = path.basename(f);
    let body = fs.readFileSync(f);
    try {
      if (b === 'egbc-auth.js') body = Buffer.from(swap(swap(body.toString('utf8'), '{ firestore: 8181, auth: 9099, storage: 9199 }', '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399 }', b), "(location.port === '5601' ? 5102 : 5101)", String(FN), b), 'utf8');
      if (b === 'egbc-db.js') body = Buffer.from(swap(body.toString('utf8'), '{ firestore: 8181, auth: 9099, storage: 9199, functions: 5101 }', '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399, functions: ' + FN + ' }', b), 'utf8');
      if (BREAK && b === 'egbc-enews-ab.js') body = Buffer.from(swap(body.toString('utf8'), BREAKS[BREAK][0], BREAKS[BREAK][1], b), 'utf8');
    } catch (err) { console.log('  FAIL  ' + err.message); s.writeHead(500); return s.end(); }
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' }[e] || 'application/octet-stream') + (e === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-enews-ab-'));
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
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, 'enews-ab-375-' + name + '.png'), Buffer.from(r.data, 'base64')); };
  /* A picture of one part of the page: the panel with the form around it. */
  const shotOf = async (sel, name) => {
    const c = await ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');var r=e.getBoundingClientRect();return {x:0,y:Math.max(0,r.top+scrollY-260),w:document.documentElement.clientWidth,h:r.height+300}})()');
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: c.x, y: c.y, width: c.w, height: c.h, scale: 1 } });
    fs.writeFileSync(path.join(SHOTS, 'enews-ab-375-' + name + '.png'), Buffer.from(r.data, 'base64'));
  };
  const signIn = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(1500);
    await ev('firebase.auth(EGBCAuth.app).signOut().then(()=>1)');
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(USERS[who].email) + ',' + JSON.stringify(PW) + ').then(()=>1)');
  };
  const open = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/addressbook.html' });
    await until('document.querySelectorAll("#memberListBody tr").length >= 6', 25000);
    await ev('window.alert=function(m){window.__alerts=(window.__alerts||[]).concat([String(m)])};window.confirm=function(){return true};1');
  };
  const rowOf = (name) => 'Array.from(document.querySelectorAll("#memberListBody tr")).find(function(tr){return tr.textContent.indexOf(' + JSON.stringify(name) + ')>=0})';
  const badge = (name) => ev('(function(){var tr=' + rowOf(name) + ';var b=tr&&tr.querySelector(".enews-badge");return b?b.textContent:""})()');
  /* The row's own Edit button, as a person presses it (on a phone it opens the form too). */
  const edit = async (k) => { await ev('document.querySelector("#memberListBody [onclick*=\\"ab_' + k + '\\"]").click(),1'); await sleep(900); return ev('(document.getElementById("enewsPanel")||{}).innerText||""'); };

  try {
    /* 1. The church office. */
    await signIn('office'); await open();
    await until('!!document.querySelector(".enews-badge")', 15000);
    ok('each row: Ann "Gets the e-news"', await badge('Ann Synthetic') === 'Gets the e-news', await badge('Ann Synthetic'));
    ok('each row: Una "Unsubscribed from the e-news"', await badge('Una Synthetic') === 'Unsubscribed from the e-news', await badge('Una Synthetic'));
    ok('each row: Ben, who doesn\u2019t get it, has nothing added', await badge('Ben Synthetic') === '');
    await shot('rows');

    let p = await edit('ann');
    ok('Ann\u2019s form: gets it, how she said yes, and "Stop sending it"', /Gets the e-news/.test(p) && /a paper form/.test(p) && await ev('!!document.getElementById("enewsStop")'), p);
    p = await edit('una');
    ok('Una\u2019s form: unsubscribed, only she can come back, nothing to add her', /Unsubscribed from the e-news/.test(p) && /only come back themselves/.test(p) && await ev('!document.getElementById("enewsAdd")'), p);
    p = await edit('kit');
    ok('an under-16: never offered', /under 16/.test(p) && await ev('!document.getElementById("enewsAdd")'), p);
    p = await edit('ben');
    ok('Ben\u2019s form: "Add to the e-news", asking how he said yes', /Doesn\u2019t get the e-news/.test(p) && await ev('!!document.getElementById("enewsAdd") && !!document.getElementById("enewsHow")'), p);
    await shotOf('#enewsPanel', 'form-add');
    await ev('document.getElementById("enewsAdd").click(),1'); await sleep(2500);
    ok('"Add" without how he said yes: not added, and told why', !(await subOf(FOLK.ben.email)) && /how they said yes/.test(String(await ev('(window.__alerts||[]).join(" ")'))), await ev('window.__alerts'));
    await ev('document.getElementById("enewsHow").value="paper";document.getElementById("enewsAdd").click(),1');
    await until('/Gets the e-news/.test((document.getElementById("enewsPanel")||{}).innerText||"")', 20000);
    const ben = await subOf(FOLK.ben.email);
    ok('with "On a paper form": added, with how, who, when and from where', ben && ben.status === 'subscribed' && /a paper form/.test(ben.consent.how) && ben.consent.by === USERS.office.uid && ben.memberId === 'ab_ben' && /addressBook/.test(JSON.stringify(ben.history)), ben);
    ok('and his row now says "Gets the e-news"', await badge('Ben Synthetic') === 'Gets the e-news');
    await edit('ann');
    await ev('document.getElementById("enewsStop").click(),1');
    await until('/Unsubscribed/.test((document.getElementById("enewsPanel")||{}).innerText||"")', 20000);
    const ann = await subOf(FOLK.ann.email);
    ok('"Stop sending it": Ann kept as unsubscribed, with who stopped it', ann.status === 'unsubscribed' && (ann.history || []).some(h => /stopped by the office/.test(h.what) && h.by === USERS.office.uid), ann.status);
    ok('and her row now says "Unsubscribed from the e-news"', await badge('Ann Synthetic') === 'Unsubscribed from the e-news');
    p = await edit('ann');
    ok('once stopped, the address book can\u2019t add her back', await ev('!document.getElementById("enewsAdd")'), p);
    await shotOf('#enewsPanel', 'form-stopped');
    const w = await ev('document.documentElement.scrollWidth');
    ok('fits 375px (no sideways scroll)', w <= 375, w);
    const small = await ev('[...document.querySelectorAll("#enewsPanel button, #enewsPanel select")].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height<40}).map(e=>e.id)');
    ok('the e-news controls are at least 40px tall', small.length === 0, small);

    /* 2. A team admin who is not the office: none of it. */
    await signIn('admin'); await open(); await sleep(3000);
    ok('a team admin who is not the office sees none of it', await ev('!document.querySelector(".enews-badge") && !document.getElementById("enewsPanel")'));
    ok('no errors thrown in the page', errors.length === 0, errors);
  } catch (e) {
    ok('the run finished', false, e.message);
  }
  ws.close(); chrome.kill(); server.close();
  const fails = R.filter(v => !v).length;
  console.log('\n' + (R.length - fails) + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
