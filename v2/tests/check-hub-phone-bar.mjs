/* The hub's top bar fits a phone (Martin's 412px phone, 15 Oct 2026: the
 * initials were cut off at the right edge).
 *
 *   node tests/check-hub-phone-bar.mjs      (from v2/, the dev emulators up)
 *
 * As a master admin on two teams - the most buttons anybody gets - at 360,
 * 375 and 412px:
 *   - no sideways scroll, and every part of the top bar on screen;
 *   - Menu, Care (in words) and the initials are there;
 *   - "Home: Worship" is under the banner, and Change opens the picker,
 *     which says it only changes what Home shows first;
 *   - Latest notices and Edit are in the "you" menu instead;
 *   - the banner's title is small enough not to fill the first screen.
 * And at 1280px the button in the bar reads "Home shows: ...", with
 * nothing extra in the "you" menu.
 * Pictures: tests/shots/hub-phone-bar--{360,375,412}.png
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
const PORT = 9775, SERVE = 8991, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const ME = { email: 'hpb.master@example.invalid', member: 'ab_hpb_master', name: 'Bar Master Synthetic' };

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
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
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ['Worship Team', 'Core Team'], adminFor: ['Core Team'], masterAdmin: true, archived: false, isMinor: false, churchMember: true });
  await put('users/' + ME.uid, { uid: ME.uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin',
    teams: ['Worship Team', 'Core Team'], adminFor: ['Core Team'], masterAdmin: true, churchMember: true });

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-hpb-' + process.pid),
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
  const evl = makeEval(send, 'hpb');
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ')', true); await sleep(800);

  const openHub = async (w) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 700 ? 800 : 900, deviceScaleFactor: 1, mobile: w < 700 });
    watch.reset();
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(10000);
    await evl("(function(){var b=document.querySelector('#pickList .pick-t');if(b)b.click();return 1})()"); await sleep(1500);
  };
  const youItems = async () => {
    await evl('(function(){var b=document.getElementById("av");if(b)b.click();return 1})()'); await sleep(900);
    const t = String(await evl('(function(){var p=document.getElementById("egbc-you");return p?[].map.call(p.querySelectorAll("[role=menuitem]"),function(i){return i.innerText.split("\\n")[0].trim()}).join("|"):"(no menu)"})()'));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(300);
    return t;
  };

  for (const w of [360, 375, 412]) {
    console.log('\nat ' + w + 'px');
    await openHub(w);
    const bar = JSON.parse(String(await evl('(function(){var out=[],W=innerWidth;document.querySelectorAll("header.bar, header.bar *").forEach(function(e){var r=e.getBoundingClientRect(),cs=getComputedStyle(e);'
      + 'if(cs.display==="none"||cs.visibility==="hidden"||r.width===0)return;if(r.right>W+0.5||r.left<-0.5)out.push((e.id||e.className||e.tagName).toString().slice(0,30)+" "+Math.round(r.left)+"-"+Math.round(r.right))});'
      + 'return JSON.stringify({sideways:document.documentElement.scrollWidth>W+1,sw:document.documentElement.scrollWidth,off:out})})()')));
    ok('  no sideways scroll', !bar.sideways, JSON.stringify(bar));
    ok('  every part of the top bar is on the screen', bar.off.length === 0, bar.off.join(', '));
    const keep = JSON.parse(String(await evl('(function(){var v=function(id){var e=document.getElementById(id);if(!e)return null;var r=e.getBoundingClientRect(),cs=getComputedStyle(e);return cs.display!=="none"&&r.width>0&&r.right<=innerWidth?(e.innerText||"").trim()||"(icon)":null};'
      + 'var menu=document.querySelector("header.bar .btn.primary");return JSON.stringify({menu:!!menu&&menu.getBoundingClientRect().width>0,care:v("careBtn"),av:v("av"),team:v("teamSwitch"),latest:v("latestBtn")})})()')));
    ok('  Menu, Care in words, and the initials, all there', keep.menu && keep.care === 'Care' && !!keep.av, JSON.stringify(keep));
    ok('  the team switch and Latest have left the bar', !keep.team && !keep.latest, JSON.stringify(keep));
    const hs = String(await evl('(function(){var e=document.getElementById("homeShows");if(!e||e.hidden||getComputedStyle(e).display==="none")return "";return e.innerText.replace(/\\s+/g," ").trim()})()'));
    ok('  "Home: ..." is under the banner, with Change', /^Home: \S/.test(hs) && /Change/.test(hs), hs);
    const h1 = Number(await evl('parseFloat(getComputedStyle(document.getElementById("heroTitle")).fontSize)'));
    ok('  the banner title is small on a phone (17px or less)', h1 > 0 && h1 <= 17, h1 + 'px');
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, 'hub-phone-bar--' + w + '.png'), Buffer.from(shot.data, 'base64'));
    const you = await youItems();
    ok('  the "you" menu has Latest notices and Edit', /Latest notices/.test(you) && /Edit/i.test(you), you);
    if (w === 412) {
      await evl('(function(){var b=document.querySelector("#homeShows button");if(b)b.click();return 1})()'); await sleep(800);
      const pick = String(await evl('(function(){var p=document.getElementById("teamPicker");return p&&p.classList.contains("on")?(document.getElementById("pickNote")||{}).innerText||"":"(closed)"})()'));
      ok('  Change opens the picker, which says it only changes what Home shows', /what Home shows first/.test(pick) && /doesn.t change what you can open/.test(pick), pick);
    }
    ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  }

  console.log('\nat 1280px');
  await openHub(1280);
  const lbl = String(await evl('(document.getElementById("teamSwitch")||{}).innerText||""')).trim();
  ok('  the bar\'s button reads "Home shows: ..."', /^Home shows: \S/.test(lbl), lbl);
  ok('  and "Home: ..." under the banner is not shown', (await evl('(function(){var e=document.getElementById("homeShows");return !e||e.hidden||getComputedStyle(e).display==="none"})()')) === true);
  const you = await youItems();
  ok('  and the "you" menu has nothing extra', !/Latest notices/.test(you), you);

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
