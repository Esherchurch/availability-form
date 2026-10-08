/* Does an email carry THIS church's name and address, or one written into
 * the code?
 *
 *   node tests/check-email-church-details.mjs      (from v2/, emulators running)
 *
 * WHY. F-067, from the events window: "egbc-email.js still falls back to
 * office@esherchurch.org as the reply address and to 'Esher Green Baptist
 * Church' as the footer when a page gives neither." This is going to be a
 * product for other churches, so a default that names one of them is wrong
 * everywhere else - and it is the kind of wrong nobody notices, because at
 * Esher it looks right.
 *
 * Both now come from churchSettings/details, the setting church-settings.html
 * edits. Nothing set means nothing said: a blank footer is honest, a guess is
 * not.
 *
 * NOTHING IS SENT. On localhost EGBCEmail puts the payload in an outbox
 * instead of calling the function, and that outbox is what this reads. No
 * real address is used anywhere: the only one here is example.invalid, a
 * domain reserved by the RFCs precisely so it can never resolve.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9633, SERVE = 8874;
const PROJECT = 'egbc-worship-planner';
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

/* An invented church. Deliberately not Esher: if the name in the footer is
   the one the code used to carry, this fails. */
const CHURCH = {
  name: 'Synthetic Road Community Church',
  enquiryEmail: 'nobody@example.invalid'
};

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 280) : '')); };

const rest = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: 'localhost', port: 8181, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej); req.end(data);
});
const docPath = c => '/v1/projects/' + PROJECT + '/databases/(default)/documents/' + c;

const makeAccount = () => new Promise((res, rej) => {
  const data = JSON.stringify({ email: ACCOUNT.email, password: ACCOUNT.pw, returnSecureToken: true });
  const req = http.request({ host: 'localhost', port: 9099, method: 'POST',
    path: '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
  req.on('error', rej); req.end(data);
});

/* A bare page that loads only what is needed to send: the SDK, sign-in, the
   church setting and the email helper. */
const HARNESS = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>' +
  '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>' +
  '<script src="egbc-auth.js"></script>' +
  '<script src="egbc-church.js"></script>' +
  '<script src="egbc-email.js"></script>' +
  '</head><body>email harness</body></html>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

(async () => {
  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__email.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(HARNESS); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('not found'); }
    const e = path.extname(f).toLowerCase();
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(fs.readFileSync(f));
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-mail-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (watch.handle(m)) return;
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await makeAccount();

  const run = async (label, setting) => {
    if (setting) {
      await rest('PATCH', docPath('churchSettings/details'), { fields: {
        name: { stringValue: setting.name }, enquiryEmail: { stringValue: setting.enquiryEmail },
        logoUrl: { stringValue: '' }
      } });
    } else {
      await rest('DELETE', docPath('churchSettings/details'));
    }
    watch.reset();
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__email.html' }); await sleep(3500);
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
      JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
    await sleep(500);
    await ev('EGBCChurch.load()', true);
    await ev('EGBCEmail.clearOutbox()');
    /* No replyTo, no footer: exactly the case F-067 is about. */
    await ev("EGBCEmail.send({to:['nobody@example.invalid'],subject:'Synthetic',html:EGBCEmail.wrap('Synthetic','<p>Invented.</p>')})", true);
    await sleep(800);
    const out = JSON.parse(String(await ev('JSON.stringify(EGBCEmail.outbox()||[])')) || '[]');
    return out[0] || null;
  };

  console.log('\nwith a church that is not this one in the setting');
  const withSetting = await run('set', CHURCH);
  ok('  nothing was sent - it went to the local outbox',
    !!withSetting && withSetting.stubbed === true, JSON.stringify(withSetting && withSetting.payload ? Object.keys(withSetting.payload) : withSetting));
  const p1 = (withSetting && withSetting.payload) || {};
  ok('  the reply address is the one in the setting',
    p1.replyTo === CHURCH.enquiryEmail, String(p1.replyTo));
  ok('  the footer is the church in the setting',
    String(p1.html || '').includes(CHURCH.name), String(p1.html || '').slice(-220));
  ok('  no address written into the code is in it',
    !/esherchurch\.org/i.test(JSON.stringify(p1)), 'office@esherchurch.org');
  ok('  no church name written into the code is in it',
    !/Esher Green Baptist/i.test(JSON.stringify(p1)), 'Esher Green Baptist Church');
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  console.log('\nwith nothing set at all');
  const noSetting = await run('unset', null);
  const p2 = (noSetting && noSetting.payload) || {};
  ok('  it still sends', !!noSetting && noSetting.stubbed === true);
  ok('  and says nothing about whose church it is',
    !/esherchurch\.org/i.test(JSON.stringify(p2)) && !/Esher Green Baptist/i.test(JSON.stringify(p2)),
    JSON.stringify(p2).slice(0, 220));
  ok('  the reply address is left off rather than guessed',
    p2.replyTo === undefined, 'replyTo=' + JSON.stringify(p2.replyTo));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* Put the setting back, so the next check does not meet an empty one. */
  await rest('PATCH', docPath('churchSettings/details'), { fields: {
    name: { stringValue: CHURCH.name }, enquiryEmail: { stringValue: CHURCH.enquiryEmail },
    logoUrl: { stringValue: '' }
  } });

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
