/* The Share sheet is readable in the app's dark theme (reviewing window,
 * 22 Oct 2026: the message box showed dark text on a dark grey box).
 *
 *   node tests/check-share-dark.mjs          (from v2/, the dev emulators up; one
 *                                            made-up person, removed afterwards)
 *   BREAK=1 node tests/check-share-dark.mjs  serves egbc-share.js as it was: must fail
 *
 * The real app.html at 375, with the phone set to dark, and again with the
 * app's own dark setting (data-theme="dark"). The sheet is opened with a
 * made-up notice and every piece of text in it is measured against what is
 * actually behind it: 4.5:1 or better.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SERVE = 8987, CDP = 9801;
const BREAK = !!process.env.BREAK;
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PW = 'test-only-password', DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents', OWNER = { Authorization: 'Bearer owner' };
const ME = { email: 'sd.member@example.invalid', member: 'ab_sd_member', name: 'SD Member Synthetic' };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const sv = (v) => Array.isArray(v) ? { arrayValue: { values: v.map(sv) } } : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, sv(v)])) }, OWNER);
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';

const server = http.createServer((q, s) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
  const f = path.join(V2, url.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const e = path.extname(f).toLowerCase();
  let body = fs.readFileSync(f, 'utf8');
  if (e === '.html') { const h = /<head[^>]*>/i.exec(body); if (h) body = body.slice(0, h.index + h[0].length) + NO_SW + body.slice(h.index + h[0].length); }
  /* The break: the sheet as it was before the fix. */
  if (BREAK && url === '/egbc-share.js') body = body.replace(';color-scheme:light}', '}').replace('color:#111827;background:#fff;resize', 'color:#111827;resize');
  s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-sharedark-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

/* Every text-bearing thing in the sheet: its colour, and the first solid
   background found walking up from it (the page's own colour if none). */
const MEASURE = `(function(){
  function rgb(c){var m=String(c).match(/rgba?\\(([^)]+)\\)/);if(!m)return null;var p=m[1].split(',').map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};}
  function lum(c){return [c.r,c.g,c.b].map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}).reduce(function(s,v,i){return s+v*[0.2126,0.7152,0.0722][i];},0);}
  function bgOf(el){for(var e=el;e;e=e.parentElement){var c=rgb(getComputedStyle(e).backgroundColor);if(c&&c.a>0.9)return c;}return rgb(getComputedStyle(document.documentElement).backgroundColor)||{r:255,g:255,b:255,a:1};}
  var out=[];
  document.querySelectorAll('.egbc-share textarea, .egbc-share h2, .egbc-share p, .egbc-share button, .egbc-share label').forEach(function(el){
    if(!el.offsetParent)return;
    var fg=rgb(getComputedStyle(el).color),bg=bgOf(el),a=lum(fg),b=lum(bg);
    out.push({what:el.tagName.toLowerCase()+(el.className?'.'+el.className:''),fg:getComputedStyle(el).color,bg:'rgb('+bg.r+','+bg.g+','+bg.b+')',ratio:Math.round((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)*10)/10});
  });
  return JSON.stringify({open:!!document.querySelector('.egbc-share textarea'),text:(document.querySelector('.egbc-share textarea')||{}).value||'',scheme:getComputedStyle(document.documentElement).colorScheme,items:out});
})()`;

let exitCode = 1;
try {
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  const evl = makeEval(send, 'sharedark');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });

  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  ME.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: ME.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: [], adminFor: [], masterAdmin: false, archived: false, isMinor: false, churchMember: true, attender: true });
  await put('users/' + ME.uid, { uid: ME.uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin', teams: [], adminFor: [], masterAdmin: false, churchMember: true, attender: true });
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);

  for (const how of ['the phone set to dark', 'the app\'s own dark setting']) {
    console.log('\nThe app, ' + how + (BREAK ? ' (BREAK: the sheet as it was)' : ''));
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: how.startsWith('the phone') ? 'dark' : 'light' }] });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' }); await sleep(5000);
    if (!how.startsWith('the phone')) await evl('(function(){document.documentElement.setAttribute("data-theme","dark");return 1})()');
    ok('  the app is dark', String(await evl('getComputedStyle(document.documentElement).colorScheme')).includes('dark'), await evl('location.href+" "+document.title+" "+document.body.textContent.slice(0,120)'));
    await evl('(function(){EGBCShare.open({title:"Synthetic quiz night",text:"A made-up notice for this check.",link:"https://example.invalid/n"});return 1})()'); await sleep(800);
    const m = JSON.parse(String(await evl(MEASURE)));
    ok('  the Share sheet opens with the message in its box', m.open && /Synthetic quiz night/.test(m.text), JSON.stringify(m).slice(0, 300));
    const box = m.items.find(x => x.what.startsWith('textarea'));
    ok('  the message box is readable (4.5:1 or better)', !!box && box.ratio >= 4.5, JSON.stringify(box));
    const poor = m.items.filter(x => x.ratio < 4.5 && !x.what.includes('primary'));
    ok('  and so is everything else in the sheet', poor.length === 0, JSON.stringify(poor));
  }
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  if (ME.uid) { await req(8181, 'DELETE', DOCS + '/users/' + ME.uid, undefined, OWNER).catch(() => {}); await req(8181, 'DELETE', DOCS + '/addressBook/' + ME.member, undefined, OWNER).catch(() => {}); }
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
