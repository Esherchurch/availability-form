/* A Kids Church role stored under a name v2 no longer offers must survive.
 *
 * v2 renamed those roles - Group Leader (Younger/Older) and Supporting Adult
 * became Leader, Assistant and Helper, with Creche. The loader looked for a
 * checkbox with the stored value, did not find one, and left the tick off; and
 * because saving rebuilds the list from whatever is ticked, the next save
 * deleted the role from the record without saying anything.
 *
 * Synthetic person, invented name, emulator only.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9660, SERVE = 8883;
const V2 = path.resolve('.');
const ACC = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};
const ID = 'ab_oldrole_synth';

const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const off = u => { let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false; return !ALLOWED.includes(h.split(':')[0]); };

const SIGNIN = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="egbc-auth.js"></script></head><body>harness</body></html>`;

const DOC = { fields: {
  name: { stringValue: 'Oldrole Synthetic' },
  email: { stringValue: 'oldrole.synth@example.invalid' },
  markers: { arrayValue: { values: [{ stringValue: 'Kids Church' }] } },
  kidsRolesPrimary: { arrayValue: { values: [
    { stringValue: 'Group Leader (Younger)' }, { stringValue: 'Session Leader' } ] } },
  kidsRolesSecondary: { arrayValue: { values: [{ stringValue: 'Supporting Adult' }] } }
} };

const rest = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: 'localhost', port: 8181, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => r.statusCode < 300 ? res(JSON.parse(d || '{}')) : rej(new Error(r.statusCode + ' ' + d.slice(0, 200)))); });
  req.on('error', rej); req.end(data);
});
const DOCPATH = '/v1/projects/egbc-worship-planner/databases/(default)/documents/addressBook/' + ID;

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 240) : '')); };
const roles = d => ({
  primary: ((d.fields.kidsRolesPrimary || { arrayValue: {} }).arrayValue.values || []).map(v => v.stringValue),
  secondary: ((d.fields.kidsRolesSecondary || { arrayValue: {} }).arrayValue.values || []).map(v => v.stringValue)
});

(async () => {
  await rest('PATCH', DOCPATH, DOC);
  console.log('seeded a synthetic person holding the old role names\n');

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
    const e = path.extname(f).toLowerCase();
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(fs.readFileSync(f));
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + os.tmpdir() + '/cdp-oldrole-' + Date.now(), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (off(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ACC.email) + ',' + JSON.stringify(ACC.pw) + ')', true);
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/addressbook.html' }); await sleep(9000);
  await ev('window.alert=()=>{};window.confirm=()=>true;window.prompt=()=>null;1');

  const opened = await ev('(()=>{ try { editMember(' + JSON.stringify(ID) + '); return "opened"; } catch(e){ return "THREW "+e.message; } })()');
  await sleep(1200);

  const shown = await ev("JSON.stringify({" +
    "oldBoxes:[...document.querySelectorAll('label[data-old-role] input')].map(i=>i.value+(i.checked?' (ticked)':' (not ticked)'))," +
    "labels:[...document.querySelectorAll('label[data-old-role] span')].map(s=>s.textContent)," +
    "known:[...document.querySelectorAll('.kidsprimary:checked')].map(i=>i.value)})");
  ok('the old role names are shown, ticked, and marked as old', /old name/.test(String(shown)) && /ticked/.test(String(shown)), shown);
  ok('the role that still exists is ticked too', /Session Leader/.test(String(shown)), opened + ' | ' + shown);

  await ev('saveMember()', true); await sleep(2500);
  const after = roles(await rest('GET', DOCPATH));
  ok('saving keeps the old role instead of deleting it',
    after.primary.includes('Group Leader (Younger)') && after.secondary.includes('Supporting Adult'), JSON.stringify(after));
  ok('and keeps the role that still exists', after.primary.includes('Session Leader'), JSON.stringify(after));

  await rest('DELETE', DOCPATH).catch(() => {});
  console.log('\nsynthetic person removed');
  console.log(R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill(); process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

