/* The Canva page in a real browser, at 375px (FINDINGS-comms C-15).
 *
 *   node tests/check-canva-page.mjs        (from v2/)
 *
 * NEEDS EMULATORS OF ITS OWN: Firestore and Auth (firebase.comms.json)
 * and the functions (firebase.comms-fn.json), as check-enews-subscribe.mjs.
 * The real Canva is never reached: the page only asks the hub's
 * canvaStatus here, and "Connect Canva" is checked to be there, not
 * pressed. The Canva logic itself is check-canva.mjs.
 *
 * Asks: off until switched on; refused to a church member; when on and
 * not connected, "Connect Canva" and the drop-a-file fallback; fits 375.
 * DELIBERATE BREAK: --break=switch shows the page while switched off.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const CFG = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
const FS = CFG.emulators.firestore.port, AU = CFG.emulators.auth.port;
const FNP = JSON.parse(fs.readFileSync('firebase.comms-fn.json', 'utf8')).emulators.functions.port;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9790, SERVE = 8999, PW = 'test-only-password';
const SHOTS = path.join(V2, 'tests', 'shots');
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').slice(8);
const BREAKS = { switch: ["if (!(EGBCAuth.uses && EGBCAuth.uses('canva'))) {", 'if (false) {'] };
if (BREAK && !BREAKS[BREAK]) { console.log('Unknown break: ' + BREAK); process.exit(2); }

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
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
const put = (p, data) => req(FS, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }, OWNER);
const PEOPLE = {
  office: { email: 'canva.office@example.invalid', member: 'ab_canva_office', teams: ['Church office'] },
  member: { email: 'canva.member@example.invalid', member: 'ab_canva_member', teams: [], churchMember: true }
};
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
/* This check's emulators, and the same stand-in for EGBCAuth.uses as
   check-enews-page.mjs until the main window's F-230 is pushed. */
function serveAuth(src) {
  const out = src.replace('{ firestore: 8181, auth: 9099, storage: 9199 }', '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399 }')
    .split("(location.port === '5601' ? 5102 : 5101)").join(String(FNP));
  if (out === src) throw new Error('egbc-auth.js no longer has the emulator line this check rewrites');
  if (/\buses:\s*function/.test(src)) return out;
  return out + '\n;(function(){var F={};var A=window.EGBCAuth;if(!A)return;'
    + 'A.uses=function(n){var v=F[n];if(typeof v==="boolean")return v;return ["enews","cardMaker","canva"].indexOf(n)<0;};'
    + 'var r=A.require;A.require=function(o){return r.call(A,o).then(function(p){return A.db.collection("churchSettings").doc("features").get().then(function(s){F=(s.exists&&s.data())||{};return p;},function(){return p;});});};})();';
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  try { await req(FS, 'GET', '/'); await req(AU, 'GET', '/'); await req(FNP, 'GET', '/'); } catch { console.log('  FAIL  no emulators on ' + FS + '/' + AU + '/' + FNP); process.exit(1); }
  await req(FS, 'DELETE', '/emulator/v1/projects/egbc-worship-planner/databases/(default)/documents');
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await put('addressBook/' + p.member, { name: 'Canva Synthetic', email: p.email, markers: p.teams, churchMember: p.churchMember === true, archived: false });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: 'Canva Synthetic', memberId: p.member, status: 'active', teams: p.teams, adminFor: [], masterAdmin: false, churchMember: p.churchMember === true, attender: true });
  }
  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    try {
      if (path.basename(f) === 'egbc-auth.js') body = Buffer.from(serveAuth(body.toString('utf8')), 'utf8');
      if (BREAK && path.basename(f) === 'canva.html') {
        const t = body.toString('utf8'), [from, to] = BREAKS[BREAK];
        if (!t.includes(from)) throw new Error('break "' + BREAK + '": that line is not in canva.html any more - update the break');
        body = Buffer.from(t.replace(from, to), 'utf8');
      }
    } catch (err) { console.log('  FAIL  ' + err.message); s.writeHead(500); return s.end(); }
    if (e === '.html') { const t = body.toString('utf8'); const hh = /<head[^>]*>/i.exec(t); body = Buffer.from(hh ? t.slice(0, hh.index + hh[0].length) + NO_SW + t.slice(hh.index + hh[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[e] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-canva-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(tabs.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(), errors = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + r.exceptionDetails.text); return r.result && r.result.value; };
  const until = async (x, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x).catch(() => false)) return true; await sleep(250); } return false; };
  const text = () => ev('document.getElementById("wrap").innerText');
  const signIn = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(1500);
    await ev('firebase.auth(EGBCAuth.app).signOut().then(()=>1)');
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(()=>1)');
  };
  const open = async () => { await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/canva.html' }); await until('document.getElementById("wrap") && !/Loading/.test(document.getElementById("wrap").innerText)', 20000); await sleep(1500); };
  try {
    await signIn('office'); await open();
    const host = await ev('(function(){try{return EGBCAuth.db._delegate._settings.host}catch(e){return ""}})()');
    ok('the page talks to this check\u2019s emulator (' + host + ')', host === 'localhost:' + FS, host);
    if (host !== 'localhost:' + FS) throw new Error('not proven to be on the emulator');
    ok('off until switched on', /switched off/.test(await text()), await text());
    ok('nothing to press while off (no Connect, no drop box)', (await ev('!document.getElementById("connect") && !document.getElementById("drop")')));
    await put('churchSettings/features', { canva: true });
    await signIn('member'); await open();
    ok('a church member is told it is for the office', /for the church office/.test(await text()));
    await signIn('office'); await open();
    await until('!!document.getElementById("connect")', 15000);
    ok('when on and not connected: "Connect Canva" (the hub\u2019s canvaStatus answered)', await ev('!!document.getElementById("connect")'), await text());
    ok('the drop-a-file fallback is there', await ev('!!document.getElementById("drop") && !!document.getElementById("file")'));
    const sh = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, 'canva-375-connect.png'), Buffer.from(sh.data, 'base64'));
    ok('fits 375px (no sideways scroll)', (await ev('document.documentElement.scrollWidth')) <= 375);
    const small = await ev('[...document.querySelectorAll("#wrap button, #wrap label.drop")].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&r.height<30}).map(e=>(e.textContent||e.id).trim().slice(0,20))');
    ok('no control under 30px tall', small.length === 0, small);
    ok('no errors thrown in the page', errors.length === 0, errors);
  } catch (e) { ok('the run finished', false, e.message); }
  ws.close(); chrome.kill(); server.close();
  const fails = R.filter(v => !v).length;
  console.log('\n' + (R.length - fails) + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
