/* Signing in with Google from the installed app (login.html, egbc-auth.js;
 * 26 Oct 2026, Martin's Android phone: "Unable to process request due to
 * missing initial state"). No emulator: Google and Firebase's sign-in calls
 * are stood in for, and what the page asks of them is written down.
 *
 *   node tests/check-login-app.mjs          (from v2/)
 *   BREAK=1 node tests/check-login-app.mjs  the installed app redirecting again: must fail
 *
 * An Android phone, in Chrome at 375:
 *   - as the installed app: Google Identity Services (One Tap and Google's
 *     own button, FedCM on Chrome for Android) - its ID token signs in to
 *     Firebase, with no redirect and no popup, and on to the hub;
 *   - if Google's script cannot load there, the popup; never the redirect;
 *   - in the phone's browser (not installed): the redirect, exactly as before;
 *   - landing from a lost sign-in (?signin=lost): try again, in plain words.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9823, SERVE = 8987;
const BREAK = !!process.env.BREAK;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 300))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';

const server = http.createServer((q, s) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f);
  if (/\.html$/.test(f)) {
    let t = body.toString('utf8');
    const h = /<head[^>]*>/i.exec(t); if (h) t = t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length);
    /* The break: the installed app sent down the redirect again. */
    if (BREAK && url === '/login.html') { const was = t; t = t.replace(/function isStandalone\(\)\{ return EGBCAuth\.isInstalledApp\(\); \}/, 'function isStandalone(){ return false; }').replace("if(which!=='choose'&&EGBCAuth.isInstalledApp())startInApp();", ''); if (t === was) console.log('  FAIL  the break did not apply'); }
    body = Buffer.from(t, 'utf8');
  }
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : /\.png$/.test(f) ? 'image/png' : 'text/html') + (/\.png$/.test(f) ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-loginapp-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

let exitCode = 1;
try {
  let list; for (let i = 0; i < 60; i++) { try { list = await getJSON('/json/list'); if (list.some((x) => x.type === 'page')) break; } catch {} await sleep(500); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); let blockGoogle = false; const NAVS = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) NAVS.push(m.params.frame.url);
    /* Google's script: stood in for, or (blockGoogle) unreachable. */
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url;
      if (/accounts\.google\.com\/gsi\/client/.test(u)) {
        if (blockGoogle) send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'NameNotResolved' });
        else send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
          body: Buffer.from(GIS_STUB).toString('base64') });
      } else send('Fetch.continueRequest', { requestId: m.params.requestId });
    } };
  /* A stand-in for Google Identity Services: initialize, the button, and
     One Tap, which answers at once with a made-up ID token. */
  const NOTE = 'function __note(x){window.__asked=window.__asked||[];window.__asked.push(x);try{var s=JSON.parse(sessionStorage.getItem("__asked")||"[]");s.push(x);sessionStorage.setItem("__asked",JSON.stringify(s))}catch(e){}}';
  const GIS_STUB = NOTE + ';window.google={accounts:{id:{initialize:function(o){__note("gis-init:"+(o.use_fedcm_for_prompt?"fedcm":"")+":"+o.client_id);window.__gisCb=o.callback;},'
    + 'renderButton:function(el){__note("gis-button");el.innerHTML="<div role=button>Continue with Google (Google\'s own)</div>";},'
    + 'prompt:function(){__note("gis-onetap");setTimeout(function(){window.__gisCb({credential:"made.up.idtoken"});},200);}}}};';
  const ev = async (x) => ((await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result || {}).value;
  await send('Runtime.enable'); await send('Page.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*accounts.google.com*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setUserAgentOverride', { userAgent: ANDROID, platform: 'Linux armv8l' });
  const BASE = 'http://localhost:' + SERVE + '/';
  /* The installed app, as the page sees it (iOS's flag; Chrome's display-mode cannot be set here). */
  let installed = null;
  const setInstalled = async (yes) => {
    if (installed) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: installed });
    installed = yes ? (await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Object.defineProperty(navigator,"standalone",{get:function(){return true}});' })).identifier : null;
  };
  /* Firebase's sign-in calls, stood in for. */
  const stub = () => ev('(function(){' + NOTE + ';window.__note=__note;var a=firebase.auth(EGBCAuth.app);'
    + 'a.signInWithRedirect=function(){__note("redirect");return new Promise(function(){});};'
    + 'a.signInWithPopup=function(){__note("popup");return new Promise(function(){});};'
    + 'a.signInWithCredential=function(c){__note("credential:"+(c&&c.idToken));return Promise.resolve({user:{uid:"u"}});};'
    + 'try{sessionStorage.setItem("egbc_return_to","app.html#signed-in")}catch(e){}return 1})()');
  const open = async () => { await send('Page.navigate', { url: BASE + 'login.html' }); await sleep(3000); await ev('window.__asked=[];sessionStorage.removeItem("__asked");1'); await stub(); NAVS.length = 0; };
  const asked = async () => JSON.parse(await ev('sessionStorage.getItem("__asked")||"[]"') || '[]');

  console.log('\nAs the installed app, on an Android phone');
  await setInstalled(true); await open();
  ok('the page knows it is the installed app', (await ev('EGBCAuth.isInstalledApp()')) === true);
  await ev('route("adult");1'); await sleep(1500);
  let a = await asked();
  const urlNow = NAVS.join(' ');
  ok('Google Identity Services, with FedCM, for the project\'s web client', a.some((x) => x === 'gis-init:fedcm:199442060489-l8j4f9p55qos14tva2bi1u9vd70p0l5f.apps.googleusercontent.com') && a.includes('gis-onetap') && a.includes('gis-button'), JSON.stringify(a));
  ok('  its ID token signs in to Firebase', a.includes('credential:made.up.idtoken'), JSON.stringify(a));
  ok('  with no redirect and no popup: nothing leaves the app', !a.includes('redirect') && !a.includes('popup'), JSON.stringify(a));
  ok('  and on to where the person was going (the app)', /\/app\.html/.test(String(urlNow)), urlNow);

  console.log('\nThe installed app, with Google\'s script unreachable');
  blockGoogle = true; await open();
  await ev('route("adult");1'); await sleep(1200);
  await ev('document.getElementById("googleBtn").click();1'); await sleep(1200);
  a = await asked();
  ok('our button stays, and uses the popup - never the redirect', a.includes('popup') && !a.includes('redirect'), JSON.stringify(a));
  blockGoogle = false;

  console.log('\nIn the phone\'s browser (not installed)');
  await setInstalled(false); await open();
  await ev('route("adult");document.getElementById("googleBtn").click();1'); await sleep(1200);
  a = await asked();
  ok('the redirect, exactly as before: one tab from start to finish', JSON.stringify(a) === '["redirect"]', JSON.stringify(a));

  console.log('\nLanding from a lost sign-in');
  await send('Page.navigate', { url: BASE + 'login.html?signin=lost' }); await sleep(3000);
  const text = String(await ev('document.body.innerText.replace(/\\s+/g," ")'));
  ok('it says the sign-in did not finish, with Continue with Google to try again', /did not finish/.test(text) && /Continue with Google/.test(text), text.slice(0, 200));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally { try { chrome.kill(); } catch {} server.close(); }
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
