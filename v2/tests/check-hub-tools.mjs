/* Does v2's hub still offer every page the original's hub offers?
 *
 *   node tests/check-hub-tools.mjs        (from v2/, emulators running)
 *
 * WHY THIS IS A CHECK OF ITS OWN. The side-by-side comparison cannot settle
 * the hub. Both hubs list the same registry, but they draw it differently: the
 * original makes each tile an <a href>, v2 draws a row and groups the list -
 * phone apps under "Apps", help pages as a "?" on the tool they explain,
 * charters together, a section per team. Comparing controls then reports a
 * page-long list of tiles "missing from v2" that are all present and all
 * reachable, and a real loss would be buried in it.
 *
 * What actually matters is this: for the same person, with the same registry,
 * does every page the original offers still appear somewhere on v2's hub? That
 * is a comparison of titles, which is text, and it does not care what element
 * the title is drawn in.
 *
 * Both hubs are read against the SAME synthetic emulator data, both signed in
 * as the same synthetic member. Nothing leaves the machine.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';

const V2 = path.resolve('.');
const ROOT = path.resolve('..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9624, V2_PORT = 8884, ORIG_PORT = 8886;
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

const ALLOWED_HOSTS = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const LOCAL_SCHEME = /^(data|blob|about|chrome|chrome-extension|filesystem):/i;
const offMachine = u => {
  if (LOCAL_SCHEME.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED_HOSTS.includes(h.split(':')[0]);
};

const NO_SW = `<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>`;
const hookFor = (acc) => `<script>(function(){ if(!window.firebase||!firebase.initializeApp)return;
var r=firebase.initializeApp; firebase.initializeApp=function(){ var a=r.apply(this,arguments);
try{firebase.firestore(a).useEmulator('localhost',8181);}catch(e){}
try{if(firebase.storage)firebase.storage(a).useEmulator('localhost',9199);}catch(e){}
try{var au=firebase.auth(a); au.useEmulator('http://localhost:9099',{disableWarnings:true});
window.__harnessSignIn=au.signInWithEmailAndPassword(${JSON.stringify(acc.email)},${JSON.stringify(acc.pw)}).then(function(){return 'ok';}).catch(function(e){return 'failed '+e.code;});}catch(e){}
return a; };})();</script>`;
const SIGNIN_V2 = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="egbc-auth.js"></script></head><body>harness</body></html>`;

function serve(dir, port, hook) {
  return http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html' && !hook) {
      s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN_V2);
    }
    const f = path.join(dir, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(path.resolve(dir)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      s.writeHead(404); return s.end('not found');
    }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      let t = body.toString('utf8');
      const head = /<head[^>]*>/i.exec(t);
      if (head) t = t.slice(0, head.index + head[0].length) + NO_SW + t.slice(head.index + head[0].length);
      if (hook) {
        const re = /<script[^>]+src=["'][^"']*firebasejs\/[^"']*\.js["'][^>]*><\/script>/gi;
        let last = null, m; while ((m = re.exec(t))) last = m.index + m[0].length;
        if (last !== null) t = t.slice(0, last) + hookFor(ACCOUNT) + t.slice(last);
      }
      body = Buffer.from(t, 'utf8');
    }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript'
      : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(port);
}

const registry = () => new Promise((res, rej) => {
  http.get({ host: 'localhost', port: 8181, headers: { Authorization: 'Bearer owner' },
    path: '/v1/projects/egbc-worship-planner/databases/(default)/documents/hubPages?pageSize=200' },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')); };

(async () => {
  const reg = await registry();
  const wanted = (reg.documents || []).map(d => ({
    url: (d.fields.url || {}).stringValue || '',
    title: (d.fields.title || {}).stringValue || '',
    enabled: (d.fields.enabled || {}).booleanValue !== false
  })).filter(p => p.url && p.title && p.enabled);
  console.log('registry: ' + wanted.length + ' enabled pages with a title\n');

  const sV2 = serve(V2, V2_PORT, false), sOrig = serve(ROOT, ORIG_PORT, true);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-hubtools-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1100, deviceScaleFactor: 1, mobile: false });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  /* Every team the account can see, one after another, collecting the text of
     the whole page each time - which is what makes this independent of how
     either hub draws a tile. */
  const sweep = async (port, label) => {
    watch.reset();
    await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
    await send('Page.navigate', { url: 'http://localhost:' + port + '/hub.html' });
    await sleep(11000);
    await ev('window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;1');
    if (port === ORIG_PORT) {
      await ev('window.__harnessSignIn || Promise.resolve("n/a")', true);
      await send('Page.navigate', { url: 'http://localhost:' + port + '/hub.html' });
      await sleep(9000);
      await ev('window.alert=()=>{};window.confirm=()=>false;window.prompt=()=>null;1');
    }
    const where = String(await ev('location.pathname'));
    if (!/hub\.html/.test(where)) return { error: label + ' ended up at ' + where };

    let text = String(await ev('document.body.innerText || ""'));
    /* Switch team, however that hub does it, and take the text again. */
    const teams = JSON.parse(await ev(
      "JSON.stringify([...document.querySelectorAll('[onclick^=\"switchTeam\"],[onclick^=\"pickTeam\"],.team-tab,.tab')]" +
      ".map(b=>(b.textContent||'').trim()).filter(Boolean))") || '[]');
    for (let i = 0; i < teams.length && i < 8; i++) {
      await ev("(()=>{const b=[...document.querySelectorAll('[onclick^=\"switchTeam\"],[onclick^=\"pickTeam\"],.team-tab,.tab')][" + i + "];if(b)b.click();})()");
      await sleep(900);
      text += '\n' + String(await ev('document.body.innerText || ""'));
    }
    /* v2 keeps a team picker behind a button, and the phone apps behind Apps. */
    for (const label2 of ['Switch', 'Apps', 'Administration']) {
      await ev("(()=>{const b=[...document.querySelectorAll('button,a')].find(e=>new RegExp('^' + " +
        JSON.stringify(label2) + " + '$','i').test((e.textContent||'').trim()));if(b)b.click();})()");
      await sleep(900);
      text += '\n' + String(await ev('document.body.innerText || ""'));
      /* and every team in the picker, if one opened */
      const picks = JSON.parse(await ev(
        "JSON.stringify([...document.querySelectorAll('[onclick*=\"Team\"],.team-row,.switch-row')].map(b=>(b.textContent||'').trim()).filter(Boolean))") || '[]');
      for (let i = 0; i < picks.length && i < 8; i++) {
        await ev("(()=>{const b=[...document.querySelectorAll('[onclick*=\"Team\"],.team-row,.switch-row')][" + i + "];if(b)b.click();})()");
        await sleep(800);
        text += '\n' + String(await ev('document.body.innerText || ""'));
      }
    }
    return { text, teams, errors: watch.errors.slice() };
  };

  await send('Page.navigate', { url: 'http://localhost:' + V2_PORT + '/__signin.html' }); await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);

  const orig = await sweep(ORIG_PORT, 'the original hub');
  const v2 = await sweep(V2_PORT, 'v2\'s hub');
  if (orig.error || v2.error) {
    console.error(orig.error || v2.error);
    sOrig.close(); sV2.close(); chrome.kill(); process.exit(2);
  }

  const has = (text, title) => text.toLowerCase().includes(title.toLowerCase());
  const onOrig = wanted.filter(p => has(orig.text, p.title));
  /* Pages v2 is meant not to offer, and why. A page in here is a decision, not
     a loss: without this the check reports the retired dashboard page every
     run and the report trains people to ignore it.
     Keyed on the url, because titles are the thing most likely to change. */
  const RETIRED_ON_PURPOSE = {
    'egbcworship&av.html':
      'the hub does everything it did - 17a. The file stays for the phone app.'
  };
  const retired = p => RETIRED_ON_PURPOSE[String(p.url || '').toLowerCase()];
  const missingFromV2 = onOrig.filter(p => !has(v2.text, p.title) && !retired(p));
  const onPurpose = onOrig.filter(p => !has(v2.text, p.title) && retired(p));
  if (onPurpose.length) console.log('not offered, on purpose : ' +
    onPurpose.map(p => p.title + ' - ' + retired(p)).join('; '));
  const extraInV2 = wanted.filter(p => !has(orig.text, p.title) && has(v2.text, p.title));

  console.log('the original hub offers : ' + onOrig.length + ' of the ' + wanted.length + ' registered');
  console.log('v2 also offers          : ' + (onOrig.length - missingFromV2.length));
  if (extraInV2.length) console.log('and v2 offers as well   : ' + extraInV2.map(p => p.title).join(', '));
  console.log('');

  ok('v2\'s hub offers every page the original\'s hub offers',
    missingFromV2.length === 0,
    missingFromV2.length ? missingFromV2.map(p => p.title + ' (' + p.url + ')').join(', ') : 'nothing missing');
  ok('the original hub was read with something on it', onOrig.length > 0, onOrig.length + ' titles found');
  ok('the error console is empty on both hubs',
    (orig.errors || []).length === 0 && (v2.errors || []).length === 0,
    'original: ' + ((orig.errors || [])[0] || 'clean') + ' | v2: ' + ((v2.errors || [])[0] || 'clean'));

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  sOrig.close(); sV2.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
