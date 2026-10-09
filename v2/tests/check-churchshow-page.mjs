/* The Connect ChurchShow page, used rather than looked at.
 *
 *   node tests/check-churchshow-page.mjs            (from v2/, emulators running)
 *   node tests/check-churchshow-page.mjs --shots
 *
 * WHY THIS AS WELL AS check-churchshow-pairing.mjs. That one proves the three
 * functions by calling them over HTTP. It proves nothing about the page:
 * whether it asks the right region, reaches the functions emulator rather
 * than the live project, shows the code, and disconnects the right building.
 *
 * That gap is not hypothetical. index.html was rewired the same way, and
 * setting the functions region to europe-west1 on purpose broke every one of
 * its assertions - from a page that looked perfectly fine.
 *
 * Synthetic: one invented building, one invented AV admin.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9673, SERVE = 8895;
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';
const EMAIL = 'cspage.av@example.invalid';
const SITE = 'site_cspage';
const SITE_NAME = 'Page Test Hall';
const DEVICE_UID = 'churchshow-' + SITE;

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };

const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const fsReq = (m, p, b) => req(8181, m, p, b, { Authorization: 'Bearer owner' });
const val = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, obj) => fsReq('PATCH', DOCS + '/' + p, { fields: fields(obj) });
const getOne = async (p) => { const r = await fsReq('GET', DOCS + '/' + p); return r.status === 200 ? JSON.parse(r.body) : null; };
const listDocs = async (c) => {
  const r = await fsReq('GET', DOCS + '/' + c + '?pageSize=300');
  return r.status === 200 ? (JSON.parse(r.body).documents || []) : [];
};
const plain = (f) => !f ? undefined
  : ('stringValue' in f ? f.stringValue : 'booleanValue' in f ? f.booleanValue : undefined);

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
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

  await put('sites/' + SITE, { name: SITE_NAME, active: true });
  await fsReq('DELETE', DOCS + '/devices/' + DEVICE_UID);
  for (const d of await listDocs('deviceCodes'))
    if (plain((d.fields || {}).uid) === DEVICE_UID)
      await fsReq('DELETE', DOCS + '/deviceCodes/' + d.name.split('/').pop());

  let up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    { email: EMAIL, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST',
    '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { email: EMAIL, password: PW, returnSecureToken: true })).body || '{}');
  /* linkedBy admin, so refreshFromBook does not go looking for a record and
     overwrite what this check has just set up. */
  await put('users/' + up.localId, {
    uid: up.localId, email: EMAIL, name: 'CS Page Admin', memberId: 'ab_cspage',
    status: 'active', linkedBy: 'admin', teams: ['AV Team'], adminFor: ['AV Team'],
    masterAdmin: false, attender: true, churchMember: false,
    roles: { 'AV Team': 'owner' } });
  await put('addressBook/ab_cspage', {
    name: 'CS Page Admin', email: EMAIL, markers: ['AV Team'], adminFor: ['AV Team'] });

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
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-csp-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });

  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    if (!wantShots) return;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'churchshow--' + name + '.png'), Buffer.from(r.data, 'base64'));
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(3500);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
    + JSON.stringify(EMAIL) + ',' + JSON.stringify(PW) + ')', true);
  ok('signed in as the AV admin',
    (await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).email || "(nobody)"')) === EMAIL);

  console.log('\nthe page');
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/churchshow.html' });
  await sleep(7000);
  await ev('window.__said = []; window.alert = m => window.__said.push(String(m)); window.confirm = () => true;');
  ok('an AV admin is let in',
    (await ev('document.body.getAttribute("data-egbc-blocked") || ""')) === '',
    String(await ev('(document.body.innerText||"").slice(0,160)')));
  const opts = String(await ev(
    'Array.from(document.querySelectorAll("#site option")).map(o => o.textContent.trim()).join("|")'));
  ok('the building is in the picker', opts.includes(SITE_NAME), opts.slice(0, 160));
  ok('and nothing is connected yet',
    /No projection computer is connected/i.test(String(await ev('document.getElementById("devices").innerText'))),
    String(await ev('document.getElementById("devices").innerText')).slice(0, 160));
  await shot('1-before');

  console.log('\nmaking a code, from the page');
  await ev('document.getElementById("site").value = ' + JSON.stringify(SITE));
  await ev('window.makeCode()', true);
  await sleep(4000);
  const shown = String(await ev('document.getElementById("codeText").textContent'));
  ok('A CODE APPEARS ON SCREEN', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(shown), shown
    + ' | said: ' + String(await ev('JSON.stringify(window.__said||[])')));
  ok('with a countdown, so nobody reads out a stale one',
    /Good for another \d+m \d\d s?/.test(String(await ev('document.getElementById("codeLeft").textContent')).replace(/(\d)s$/, '$1 s')),
    String(await ev('document.getElementById("codeLeft").textContent')));
  ok('and what to do with it on the projection computer',
    /Settings/.test(String(await ev('document.getElementById("codeWrap").innerText'))),
    String(await ev('document.getElementById("codeWrap").innerText')).slice(0, 200));

  /* The code the PAGE showed must be the code the FUNCTION made - which is
     only provable by redeeming it. */
  const red = await req(5101, 'POST', '/egbc-worship-planner/europe-west2/churchShowRedeem', { code: shown });
  ok('and it is a real code: ChurchShow can redeem exactly what the page showed',
    red.status === 200, red.status + ' ' + red.body.slice(0, 200));
  await shot('2-code');

  console.log('\nwhat is connected');
  await ev('window.loadDevices()', true);
  await sleep(2500);
  const devText = String(await ev('document.getElementById("devices").innerText'));
  ok('the building is listed as connected', devText.includes(SITE_NAME) && /\bOn\b/.test(devText), devText.slice(0, 200));
  ok('with a way to disconnect it',
    (await ev('!!Array.from(document.querySelectorAll("#devices button")).find(b => /Disconnect/i.test(b.textContent))')) === true,
    devText.slice(0, 200));
  await shot('3-connected');

  console.log('\ndisconnecting, from the page');
  await ev('Array.from(document.querySelectorAll("#devices button")).find(b => /Disconnect/i.test(b.textContent)).click()');
  await sleep(4500);
  const dev = await getOne('devices/' + DEVICE_UID);
  ok('THE DEVICE IS SWITCHED OFF IN THE DATABASE, not just on screen',
    dev && plain(dev.fields.active) === false, dev && JSON.stringify(plain(dev.fields.active)));
  await ev('window.loadDevices()', true);
  await sleep(2000);
  const after = String(await ev('document.getElementById("devices").innerText'));
  ok('and the page says so', /\bOff\b/.test(after), after.slice(0, 200));
  ok('with no Disconnect button left on it',
    (await ev('!Array.from(document.querySelectorAll("#devices button")).some(b => /Disconnect/i.test(b.textContent))')) === true,
    after.slice(0, 160));
  await shot('4-off');

  console.log('\nthe console, and where the page went');
  const real = errs.filter(e => !/Logo fetch failed|storage\/object-not-found|cdn\.tailwindcss/i.test(e));
  ok('no errors on the console', real.length === 0, JSON.stringify(real).slice(0, 300));
  const unexpected = [...new Set(reachedOff)].filter(h => !EXPECTED_OFF.includes(h));
  ok('nothing reached anywhere off this machine that is not accounted for',
    unexpected.length === 0, unexpected.join(', '));

  server.close(); chrome.kill(); ws.close();
  const failed = R.filter(v => !v).length;
  console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
