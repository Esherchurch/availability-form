/* A picture in a notice is a banner, not the whole screen (Martin, 15 Oct
 * 2026: "the Christmas choir picture fills the screen").
 *
 *   node tests/check-notice-pictures.mjs      (from v2/, the dev emulators up)
 *
 * In the app's Notices and the hub's Latest notices, at 375px and 1440px:
 *   - the picture is at most 180px tall on a phone and 220px on a computer;
 *   - it is never wider than the words around it;
 *   - tapping it shows the whole picture, and Escape closes that.
 * Pictures: tests/shots/notice-pictures--{app,hub}-{375,1440}.png
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9773, SERVE = 8989, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const ME = { email: 'np.member@example.invalid', member: 'ab_np_member', name: 'Notice Reader Synthetic' };

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => v === null ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : v instanceof Date ? { timestampValue: v.toISOString() } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  ME.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: ME.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ['Worship Team'], adminFor: [], archived: false, isMinor: false, churchMember: true });
  await put('users/' + ME.uid, { uid: ME.uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin',
    teams: ['Worship Team'], adminFor: [], masterAdmin: false, churchMember: true });
  /* A square picture 512px across: left alone it is as tall as the column is wide. */
  await put('news/np_choir', { title: 'Synthetic Christmas choir', body: '<p>Come and sing with us.</p><p><img src="icon-512.png" alt="Synthetic choir picture NP"></p><p>Thursdays at 7.</p>',
    teams: [], ackedBy: [], createdAt: new Date(), pinned: false });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript' : e === '.css' ? 'text/css' : e === '.png' ? 'image/png' : 'application/octet-stream') + (e === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-np-' + process.pid),
    '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; } watch.handle(m); };
  await send('Runtime.enable'); await send('Page.enable');
  const evl = makeEval(send, 'np');
  const width = (w) => send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 700 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 700 });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ')', true); await sleep(800);

  /* The picture's box, and the words' box it sits in. */
  const measure = (sel) => evl('(function(){var i=document.querySelector(' + JSON.stringify(sel) + ');if(!i)return JSON.stringify(null);'
    + 'var r=i.getBoundingClientRect(),p=i.closest(".notice-body,.bd").getBoundingClientRect();'
    + 'return JSON.stringify({h:Math.round(r.height),w:Math.round(r.width),pw:Math.round(p.width),loaded:i.complete&&i.naturalWidth>0})})()').then(s => JSON.parse(String(s)));
  const tapAndClose = async (sel) => {
    await evl('(function(){var i=document.querySelector(' + JSON.stringify(sel) + ');i.scrollIntoView({block:"center"});i.click();return 1})()'); await sleep(500);
    const open = JSON.parse(String(await evl('(function(){var z=document.getElementById("egbc-zoom");if(!z)return "null";var i=z.querySelector("img");'
      + 'return JSON.stringify({src:i.getAttribute("src"),contain:getComputedStyle(i).objectFit})})()')));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(300);
    return { open, closed: (await evl('!document.getElementById("egbc-zoom")')) === true };
  };

  for (const w of [375, 1440]) {
    const max = w < 700 ? 180 : 220;
    console.log('\nat ' + w + 'px');
    await width(w);
    watch.reset();
    /* The app's Notices. */
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' }); await sleep(7000);
    await evl('(function(){var b=document.querySelector("[data-act=\\"sheet:notices\\"]");if(b)b.click();return 1})()'); await sleep(1500);
    let m = await measure('.notice-body img[alt="Synthetic choir picture NP"]');
    ok('  the app\'s Notices: the picture is a banner, at most ' + max + 'px tall', !!m && m.loaded && m.h <= max && m.h >= 60, JSON.stringify(m));
    ok('    and no wider than the words', !!m && m.w <= m.pw + 1, JSON.stringify(m));
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, 'notice-pictures--app-' + w + '.png'), Buffer.from(shot.data, 'base64'));
    let t = await tapAndClose('.notice-body img[alt="Synthetic choir picture NP"]');
    ok('    tapped, the whole picture opens, uncropped', !!t.open && /icon-512\.png/.test(t.open.src) && t.open.contain === 'contain', JSON.stringify(t.open));
    ok('    and Escape closes it', t.closed);
    /* The hub's Latest notices. */
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(10000);
    await evl("(function(){var b=document.querySelector('#pickList .pick-t');if(b)b.click();return 1})()"); await sleep(800);
    await evl('(function(){try{openLatest()}catch(e){}return 1})()'); await sleep(1500);
    m = await measure('.nw .bd img[alt="Synthetic choir picture NP"]');
    ok('  the hub\'s Latest notices: a banner, at most ' + max + 'px tall', !!m && m.loaded && m.h <= max && m.h >= 60, JSON.stringify(m));
    ok('    and no wider than the words', !!m && m.w <= m.pw + 1, JSON.stringify(m));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, 'notice-pictures--hub-' + w + '.png'), Buffer.from(shot.data, 'base64'));
    t = await tapAndClose('.nw .bd img[alt="Synthetic choir picture NP"]');
    ok('    tapped, the whole picture opens', !!t.open && /icon-512\.png/.test(t.open.src), JSON.stringify(t.open));
    ok('    and Escape closes it', t.closed);
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  }
  await req(8181, 'DELETE', DOCS + '/news/np_choir', undefined, OWNER);
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
