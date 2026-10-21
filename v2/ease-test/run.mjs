/* ===================================================================
   THE EASE TEST ON THIS PC (FINDINGS-comms plan D10): one command.

     cd v2
     node ease-test/run.mjs                 set it up, open Chrome, wait
     node ease-test/run.mjs --self-check    the same, headless, checked, then stops

   It starts an emulator of its own (firebase.ease.json: Firestore 8392,
   Auth 9392, functions 5393 - apart from every window's), fills it with a
   made-up church week, drafts this week's e-news as the hub does, and
   opens Chrome (a fresh profile of its own, never yours) signed in as the
   church office, on the hub's home page. A second tab, "Inbox (this PC)",
   shows every email the hub would have sent: "Send me a test" lands there.

   Nothing leaves the PC: the emulator never sends email, and nothing here
   touches the live hub. Running it again starts afresh, for the next
   tester. Ctrl+C (or closing this window) stops Chrome, the emulator and
   the little web server.

   DELIBERATE BREAKS (with --self-check): --break=fn (the page not pointed
   at this emulator's functions) and --break=draft (no draft made). Each
   must turn the self-check red.
   =================================================================== */
import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
if (!fs.existsSync(path.join(V2, 'firebase.ease.json'))) { console.log('Run this from the v2 folder: cd v2, then node ease-test/run.mjs'); process.exit(2); }
const CFG = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.ease.json'), 'utf8')).emulators;
const FS = CFG.firestore.port, AU = CFG.auth.port, FN = CFG.functions.port;
const SERVE = 5701, CDP = 9795;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROJECT = 'egbc-worship-planner';
const DOCS = '/v1/projects/' + PROJECT + '/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const TESTER = { email: 'tester@example.invalid', password: 'ease-test-only', name: 'Test Office' };
const SELF = process.argv.includes('--self-check');
const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').slice(8);
if (BREAK && !['fn', 'draft'].includes(BREAK)) { console.log('Unknown break: ' + BREAK); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = s => console.log(s);

/* ---- small helpers ------------------------------------------------------ */
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
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  return v;
}
const put = (p, data) => req(FS, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }, OWNER);
const list = async c => { const r = JSON.parse((await req(FS, 'GET', DOCS + '/' + c + '?pageSize=200', undefined, OWNER)).body || '{}'); return (r.documents || []).map(d => Object.assign({ _id: d.name.split('/').pop() }, Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromFs(v)])))); };
const up = async port => { try { await req(port, 'GET', '/'); return true; } catch (e) { return false; } };
const londonUtc = (iso) => { const guess = Date.parse(iso + ':00Z'); const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).forEach(x => { p[x.type] = x.value; }); const shown = Date.parse(p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':00Z'); return guess - (shown - guess); };
const londonDay = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(Date.now() + n * 86400000));
const evAt = (days, hh) => { const day = londonDay(days); return { startLocal: day + 'T' + hh, startUtc: londonUtc(day + 'T' + hh) }; };
const SUNDAY = (() => { const t = new Date(londonDay(0) + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + ((7 - t.getUTCDay()) % 7)); return t.toISOString().slice(0, 10); })();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* The church's pictures, drawn (no real photos, no real people). */
const PICS = [['Autumn path', 28, 70], ['Lake at dawn', 200, 55], ['Green hills', 130, 40], ['Harvest field', 45, 80], ['Candlelight', 15, 75], ['Evening sky', 260, 35]];
const art = (i, label) => { const [, h, s] = PICS[i % PICS.length];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(' + h + ',' + s + '%,80%)"/><stop offset="1" stop-color="hsl(' + (h + 20) + ',' + s + '%,52%)"/></linearGradient></defs>' +
    '<rect width="1200" height="800" fill="url(#g)"/><circle cx="' + (320 + i * 90) + '" cy="230" r="90" fill="hsl(' + (h + 30) + ',90%,90%)" opacity=".9"/>' +
    '<path d="M0 580 Q300 450 600 560 T1200 520 V800 H0Z" fill="hsl(' + (h + 60) + ',' + s + '%,32%)"/><path d="M0 670 Q330 580 690 680 T1200 650 V800 H0Z" fill="hsl(' + (h + 80) + ',' + s + '%,22%)"/>' +
    (label ? '<text x="60" y="760" font-family="Arial" font-size="44" fill="#fff" opacity=".85">' + esc(label) + '</text>' : '') + '</svg>'; };
const PIC = i => 'http://localhost:' + SERVE + '/__pics/' + i + '.svg';

/* ---- the emulator -------------------------------------------------------- */
let emu = null;
async function startEmulator() {
  /* Stand-ins for Secret Manager: without them the functions emulator
     fetches the REAL Resend secrets (git-ignored; test values only). */
  const sl = path.join(V2, 'functions', '.secret.local');
  if (!fs.existsSync(sl)) fs.writeFileSync(sl, 'HQ_RESEND_API_KEY=re_TestOnly_emulator_' + 'e'.repeat(24) + '\nHQ_RESEND_WEBHOOK_SECRET=whsec_' + Buffer.from('ease-test-only-secret').toString('base64') + '\n');
  if (await up(FS) && await up(AU) && await up(FN)) { say('  The ease-test emulator is already running: using it.'); return; }
  /* Half of one left from a run that was cut off: cleared first. */
  freeOwnPorts(); await sleep(1500);
  say('  Starting the ease-test emulator (about a minute the first time)...');
  const log = fs.createWriteStream(path.join(os.tmpdir(), 'ease-test-emulator.log'));
  emu = spawn('npx firebase emulators:start --only firestore,auth,functions --config firebase.ease.json --project ' + PROJECT,
    { cwd: V2, shell: true, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '' }) });
  let out = '';
  emu.stdout.on('data', d => { out += d; log.write(d); }); emu.stderr.on('data', d => { out += d; log.write(d); });
  for (let i = 0; i < 120; i++) {
    if (/All emulators ready/.test(out)) return;
    if (/Error:|could not start|port taken/i.test(out) || emu.exitCode !== null) break;
    await sleep(1000);
  }
  throw new Error('the emulator did not start. Its log: ' + path.join(os.tmpdir(), 'ease-test-emulator.log'));
}
/* The emulator's Java can outlive its parent, so whatever listens on the
   ease test's own ports (no other window uses them) is stopped too. */
const OWN_PORTS = [FS, AU, FN, CFG.firestore.websocketPort, CFG.hub.port, CFG.logging.port, CFG.eventarc.port];
function freeOwnPorts() {
  let out = '';
  try { out = execSync('netstat -ano -p tcp', { encoding: 'utf8' }); } catch (e) { return; }
  const pids = new Set();
  out.split(/\r?\n/).forEach(l => { const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/.exec(l); if (m && OWN_PORTS.includes(+m[1]) && +m[2] > 0) pids.add(m[2]); });
  pids.forEach(pid => { try { execSync('taskkill /PID ' + pid + ' /T /F', { stdio: 'ignore' }); } catch (e) {} });
}
function stopEmulator() {
  if (emu) { try { execSync('taskkill /PID ' + emu.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) { try { emu.kill(); } catch (x) {} } }
  if (emu || SELF) freeOwnPorts();
  emu = null;
}

/* ---- a made-up church week ---------------------------------------------- */
async function seed() {
  await req(FS, 'DELETE', '/emulator/v1/projects/' + PROJECT + '/databases/(default)/documents');
  await req(AU, 'DELETE', '/emulator/v1/projects/' + PROJECT + '/accounts');
  const made = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: TESTER.email, password: TESTER.password, returnSecureToken: true })).body || '{}');
  if (!made.localId) throw new Error('could not make the test login');
  await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:update', { localId: made.localId, emailVerified: true, displayName: TESTER.name }, OWNER);
  await put('addressBook/ab_tester', { name: TESTER.name, email: TESTER.email, markers: ['Church office'], churchMember: true, archived: false });
  await put('users/' + made.localId, { uid: made.localId, email: TESTER.email, name: TESTER.name, memberId: 'ab_tester', status: 'active', linkedBy: 'admin', teams: ['Church office'], adminFor: [], masterAdmin: false, churchMember: true, attender: true });
  await put('churchSettings/details', { name: 'Esher Green Baptist Church', enquiryEmail: 'office@example.invalid', logoUrl: '' });
  await put('churchSettings/features', { enews: true, cardMaker: true, pictureLibrary: true });
  /* What's On: four public events in the next two weeks, two with pictures. */
  const ev = (id, o, d, hh) => put('calEvents/' + id, Object.assign({ visibility: 'public', status: 'confirmed', audience: ['public', 'members'], labels: [] }, o, evAt(d, hh)));
  await ev('e_harvest', { title: 'Harvest supper and barn dance', image: PIC(3), labels: ['Harvest'], signupOn: true, location: 'The church hall',
    description: '<p>A two-course supper, then a barn dance with a caller. All ages welcome; bring a pudding to share if you can.</p>' }, 3, '18:30');
  await ev('e_coffee', { title: 'Coffee morning', image: PIC(0), location: 'The church café',
    description: '<p>Coffee, cake and good company. Everyone welcome.</p>' }, 5, '10:00');
  await ev('e_film', { title: 'Film club', image: '', location: 'The church hall', description: '<p>This month: a family film, with popcorn.</p>' }, 8, '19:30');
  await ev('e_walk', { title: 'Saturday walk', image: '', location: 'Meet at the church', description: '' }, 10, '09:30');
  await put('events/sun', { date: SUNDAY, type: 'Morning Worship', serviceTime: '10:30', speaker: 'Our minister', publicTitle: 'Morning Worship', archived: false });
  await put('news/n1', { title: 'Car park closed on Saturday', body: '<p>Please park on the road while the car park is resurfaced.</p>', teams: [], createdAt: new Date().toISOString() });
  /* The church's pictures (the picture library). */
  for (let i = 0; i < PICS.length; i++) await put('pictureLibrary/p' + i, { name: PICS[i][0], url: PIC(i), tags: ['ease test'], createdAt: new Date(Date.now() - i * 60000).toISOString(), createdBy: made.localId });
  return made.localId;
}

/* ---- the little web server ---------------------------------------------- */
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>Signing in...</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const INBOX = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inbox (this PC)</title>' +
  '<style>body{font-family:system-ui,Arial,sans-serif;margin:0;background:#f3f4f6;color:#1f2937}header{background:#3d6263;color:#fff;padding:14px 18px}header h1{margin:0;font-size:19px}header p{margin:4px 0 0;font-size:13px;opacity:.9}' +
  '.wrap{display:grid;grid-template-columns:320px 1fr;gap:0;height:calc(100vh - 66px)}#list{overflow:auto;border-right:1px solid #e5e7eb;background:#fff}#list button{display:block;width:100%;text-align:left;padding:12px 14px;border:0;border-bottom:1px solid #eee;background:#fff;font:inherit;cursor:pointer}' +
  '#list button[aria-pressed=true]{background:#e6efee}#list small{color:#6b7280}iframe{width:100%;height:100%;border:0;background:#fff}.none{padding:18px;color:#6b7280}</style></head><body>' +
  '<header><h1>Inbox (this PC)</h1><p>Emails the hub would have sent. Nothing really leaves this PC. New ones appear by themselves.</p></header><div class="wrap"><div id="list"><p class="none">Nothing yet. Use \u201cSend me a test\u201d in the e-news.</p></div><iframe id="mail" title="The email"></iframe></div>' +
  '<script>var seen="",pick=0;function draw(){fetch("/__outbox.json").then(function(r){return r.json()}).then(function(m){var k=JSON.stringify(m.map(function(x){return x.id}));if(k===seen)return;seen=k;var L=document.getElementById("list");' +
  'if(!m.length)return;L.innerHTML=m.map(function(x,i){return \'<button data-i="\'+i+\'" aria-pressed="\'+(i===pick)+\'"><b>\'+x.subject.replace(/</g,"&lt;")+\'</b><br><small>To \'+x.to+" \\u00b7 "+x.at+"</small></button>"}).join("");' +
  '[].forEach.call(L.querySelectorAll("button"),function(b){b.onclick=function(){pick=+b.getAttribute("data-i");[].forEach.call(L.querySelectorAll("button"),function(y){y.setAttribute("aria-pressed",String(y===b))});document.getElementById("mail").srcdoc=m[pick].html}});' +
  'pick=0;document.getElementById("mail").srcdoc=m[0].html})}draw();setInterval(draw,2000);</script></body></html>';

function serveAuth(src) {
  let out = src.replace('{ firestore: 8181, auth: 9099, storage: 9199 }', '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399 }');
  if (BREAK !== 'fn') out = out.replace("(location.port === '5601' ? 5102 : 5101)", String(FN));
  if (out === src) throw new Error('egbc-auth.js no longer has the emulator line this runs on');
  return out;
}
function startServer() {
  return new Promise(res => {
    const server = http.createServer(async (q, s) => {
      const url = decodeURIComponent(q.url.split('?')[0]);
      try {
        if (url === '/' ) { s.writeHead(302, { Location: '/hub.html' }); return s.end(); }
        if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
        if (url === '/__inbox.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return s.end(INBOX); }
        if (url === '/__outbox.json') {
          const m = (await list('emailOutbox')).sort((a, b) => String(b.at).localeCompare(String(a.at)))
            .map(x => ({ id: x._id, to: (x.to || []).join(', '), subject: String(x.subject || ''), at: String(x.at || '').replace('T', ' ').slice(0, 16), html: String(x.html || '') }));
          s.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return s.end(JSON.stringify(m));
        }
        const pic = /^\/__pics\/(\d+)\.svg$/.exec(url);
        if (pic) { s.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Access-Control-Allow-Origin': '*' }); return s.end(art(+pic[1], PICS[+pic[1] % PICS.length][0])); }
        const f = path.join(V2, url.replace(/^\//, ''));
        if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
        const e = path.extname(f).toLowerCase();
        let body = fs.readFileSync(f);
        if (path.basename(f) === 'egbc-auth.js') body = Buffer.from(serveAuth(body.toString('utf8')), 'utf8');
        if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
        s.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' }[e] || 'application/octet-stream') + (/\.(html|js|mjs|css|json|svg)$/.test(e) ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store' });
        s.end(body);
      } catch (err) { s.writeHead(500); s.end(String(err.message || err)); }
    }).listen(SERVE, () => res(server));
  });
}

/* ---- Chrome (a fresh profile of its own) --------------------------------- */
async function openChrome() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ease-test-chrome-'));
  const args = ['--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--no-default-browser-check', '--disable-features=BackForwardCache', '--window-size=1400,950'];
  if (SELF) args.unshift('--headless=new');
  const chrome = spawn(CHROME, args.concat(['about:blank']), { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(tabs.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  const errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error || {}); pend.delete(m.id); }
    if (m.method === 'Page.javascriptDialogOpening') ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  };
  await send('Runtime.enable'); await send('Page.enable');
  /* Nothing may hang the run: a page answer that doesn't come in 20s is a failure. */
  const ev = async (x) => { const r = await Promise.race([send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }), sleep(20000).then(() => ({ exceptionDetails: { text: 'no answer in 20s: ' + x.slice(0, 80) } }))]); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text)); return r.result && r.result.value; };
  const until = async (x, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x).catch(() => false)) return true; await sleep(300); } return false; };
  const go = async u => { await send('Page.navigate', { url: 'http://localhost:' + SERVE + u }); await sleep(1200); };
  return { chrome, prof, ws, send, ev, until, go, errors, getJSON };
}

/* ---- the run --------------------------------------------------------------- */
let C = null, server = null, done = false;
function finish(code) {
  if (done) return; done = true;
  try { C && C.ws.close(); } catch (e) {}
  try { if (C) execSync('taskkill /PID ' + C.chrome.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) {}
  try { server && server.close(); } catch (e) {}
  stopEmulator();
  try { if (C) fs.rmSync(C.prof, { recursive: true, force: true }); } catch (e) {}
  if (!SELF) say('\n  Stopped: Chrome, the emulator and the web server. Nothing was kept.');
  process.exit(code);
}
process.on('SIGINT', () => finish(0));
process.on('SIGTERM', () => finish(0));

(async () => {
  say('\nThe ease test, on this PC' + (SELF ? ' (self-check)' : ''));
  for (const p of [SERVE, CDP]) if (await up(p)) { say('  Port ' + p + ' is already in use: is the ease test already running in another window?'); process.exit(1); }
  await startEmulator();
  say('  Filling it with a made-up church week...');
  await seed();
  server = await startServer();
  C = await openChrome();
  /* Signed in as the church office; this week's e-news drafted as the hub does it. */
  await C.go('/__signin.html');
  await C.until('!!window.firebase && !!window.EGBCAuth', 20000);
  await C.ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(TESTER.email) + ',' + JSON.stringify(TESTER.password) + ').then(()=>1)');
  if (BREAK !== 'draft') {
    await C.go('/enews.html');
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) { ok = (await list('enewsIssues')).length > 0; if (!ok) await sleep(500); }
    if (!ok) say('  WARNING: this week\u2019s draft wasn\u2019t made. The tester can press "New e-news" instead.');
  }
  const issues = await list('enewsIssues');
  const draft = issues[0] || {};

  if (SELF) {
    const R = [];
    /* --shots=<folder>: what the tester sees, for a look. */
    const SHOTS = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
    const shot = async n => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await C.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(800); const r = await C.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); };
    const ok = (n, v, x) => { R.push(!!v); say('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };
    try {
      ok('this week\u2019s e-news is drafted, from What\u2019s On, Sunday and the notices', issues.length === 1 && draft.status === 'draft' &&
        ['event', 'sunday', 'notices'].every(t => (draft.blocks || []).some(b => b.type === t)) && JSON.stringify(draft.blocks).includes('Harvest supper'), (draft.blocks || []).map(b => b.type));
      await C.go('/hub.html');
      ok('the hub opens, signed in as the church office', await C.until('!!(window.EGBCAuth && EGBCAuth.user && EGBCAuth.user() && EGBCAuth.user().email === ' + JSON.stringify(TESTER.email) + ')', 20000));
      ok('the hub offers E-news (where task 1 starts)', await C.until('!![].find.call(document.querySelectorAll("a[href]"),function(a){return /enews\\.html/.test(a.getAttribute("href"))})', 10000));
      await shot('1-hub');
      await C.go('/enews.html'); await sleep(2500); await shot('2-enews');
      await C.go('/enews-edit.html?issue=' + encodeURIComponent(draft._id));
      ok('the editor opens this week\u2019s draft', await C.until('(function(){var f=document.getElementById("cv");return f&&f.contentDocument&&f.contentDocument.querySelectorAll("[data-b]").length>3})()', 25000));
      await C.ev('document.getElementById("cv").contentDocument.querySelector(\'[data-b="0"]\').click(),1');
      ok('the church\u2019s pictures are offered for this week\u2019s picture', await C.until('document.querySelectorAll(".pics button").length===' + PICS.length, 10000));
      await sleep(1500); await shot('3-editor');
      const verse = await C.ev('EGBCBible.passage("BSB","John 3:16").then(function(p){return (p.verses||[]).map(function(v){return v.text}).join(" ")},function(e){return "refused: "+(e.message||e)})');
      ok('the Bible works on this PC, for this week’s verse', /For God so loved the world/.test(verse), verse);
      ok('a picture from the library loads', await C.ev('fetch(' + JSON.stringify(PIC(0)) + ').then(r=>r.ok)'));
      const sent = await C.ev('EGBCAuth.call("enewsTest",{issueId:' + JSON.stringify(draft._id) + ',html:"<p>Ease test self-check</p>"}).then(function(r){return JSON.stringify(r)},function(e){return "refused: "+(e.message||e)})');
      ok('"Send me a test" reaches this PC\u2019s functions', /tester@example\.invalid/.test(sent), sent);
      await sleep(1000);
      const box = JSON.parse((await req(SERVE, 'GET', '/__outbox.json')).body || '[]');
      ok('…and lands in the Inbox (this PC), never sent', box.length === 1 && box[0].to === TESTER.email && /Ease test self-check/.test(box[0].html), box.map(b => b.to + ' ' + b.subject));
      await C.go('/__inbox.html');
      await sleep(1500); await shot('4-inbox');
      ok('the Inbox page shows it', await C.until('/\\[Test\\]/.test(document.body.innerText) && document.getElementById("mail").srcdoc.length>10', 10000));
      const files = ['ease-test/task-sheet.html', 'ease-test/observer.html'];
      ok('the task sheet and the observer\u2019s form are served', (await Promise.all(files.map(f => req(SERVE, 'GET', '/' + f)))).every(r => r.status === 200));
      ok('no errors thrown', C.errors.length === 0, C.errors);
    } catch (e) { ok('the self-check finished', false, e.message); }
    const fails = R.filter(v => !v).length;
    say('\n' + (R.length - fails) + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
    return finish(fails ? 1 : 0);
  }

  /* For the tester: the hub's home page, and the Inbox in a second tab. */
  await C.send('Target.createTarget', { url: 'http://localhost:' + SERVE + '/__inbox.html', background: true });
  await C.go('/hub.html');
  await C.send('Page.bringToFront');
  try { C.ws.close(); } catch (e) {}
  C.chrome.on('exit', () => { say('\n  Chrome was closed.'); finish(0); });
  say('\n  READY. Chrome is open on the hub, signed in as the church office.');
  say('    Login (if it asks):   ' + TESTER.email + '   password: ' + TESTER.password + '   (this PC\u2019s test emulator only)');
  say('    This week\u2019s e-news:  drafted, waiting in E-news (' + (issues.length ? 'done' : 'not made - press New e-news') + ')');
  say('    Test emails:          the "Inbox (this PC)" tab - nothing leaves this PC');
  say('\n  For the tester, printed or on paper:   ' + path.join(V2, 'ease-test', 'task-sheet.html'));
  say('  For the person watching (their own browser, notes kept there):');
  say('                         http://localhost:' + SERVE + '/ease-test/observer.html');
  say('\n  When you have finished: press Ctrl+C here (or close Chrome). Everything stops; nothing is kept.');
  say('  For the next tester, run the same command again: it starts afresh.\n');
  setInterval(() => {}, 1 << 30);
})().catch(e => { say('\n  Could not set up the ease test: ' + (e.message || e)); finish(1); });
