/* Share on notices, in the app and on the website, and on What's On events
 * in the app (Martin, 21 Oct 2026: a notice in the app had no Share).
 *
 *   node tests/check-notice-share.mjs      (from v2/, the dev emulators up)
 *
 * At 375:
 * - the app's Notices sheet: each notice has Share (44px), which opens the
 *   hub's own share (egbc-share.js);
 * - MEMBERS ONLY: notices need signing in, so the message is a link that
 *   needs signing in - never the notice's words. A church-wide notice
 *   keeps its title; a team's says only whose it is;
 * - the website's Notices (hub.html) have the same Share; the shared link,
 *   followed by somebody signed in, opens that one notice;
 * - an event in the app's What's On opens, and has Share on WhatsApp.
 * Synthetic people, notices and event.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9793, SERVE = 8989, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const ME = { email: 'ns.member@example.invalid', member: 'ab_ns_member', name: 'NS Member Synthetic' };
const SECRET = 'NSBODYNEVERSHARED';
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 500) : ''))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: ME.email, password: PW, returnSecureToken: true })).body || '{}');
  ME.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: ME.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + ME.member, { name: ME.name, email: ME.email, markers: ['Worship Team'], adminFor: [], masterAdmin: false, archived: false, isMinor: false, churchMember: true });
  await put('users/' + ME.uid, { uid: ME.uid, email: ME.email, name: ME.name, memberId: ME.member, status: 'active', linkedBy: 'admin', teams: ['Worship Team'], adminFor: [], masterAdmin: false, churchMember: true });
  const now = new Date().toISOString();
  await put('news/ns_all', { title: 'Synthetic Church Notice NS', body: '<p>' + SECRET + ' one</p>', teams: [], createdAt: now, date: '', pinned: true });
  await put('news/ns_team', { title: 'Synthetic Worship Notice NS', body: '<p>' + SECRET + ' two</p>', teams: ['Worship Team'], createdAt: now, date: '' });
  await put('calEvents/ns_ev', { title: 'Synthetic NS Event', audience: ['public', 'members'], visibility: 'public', status: 'confirmed',
    startUtc: Date.now() + 9 * 86400000, endUtc: Date.now() + 9 * 86400000 + 7200000, category: 'social', description: 'A synthetic event.' });

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-ns-' + process.pid),
    '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } };
  await send('Runtime.enable'); await send('Page.enable');
  const evl = makeEval(send, 'ns');
  const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name), Buffer.from(s.data, 'base64')); };
  /* What the share sheet would send, then close it. */
  const sheetText = async () => {
    let t = ''; for (let i = 0; i < 20 && !t; i++) { await sleep(250); t = String(await evl('(document.querySelector(".egbc-share textarea")||{value:""}).value')); }
    await evl('(function(){var x=document.querySelector(".egbc-share [data-close]");if(x)x.click();return 1})()');
    return t;
  };
  const btn = (sel) => evl('(function(){var b=document.querySelector(' + JSON.stringify(sel) + ');if(!b)return "none";var r=b.getBoundingClientRect();return JSON.stringify({h:Math.round(r.height),w:Math.round(r.width),vis:r.width>0&&r.height>0})})()');

  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(ME.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);

    console.log('The app\u2019s Notices sheet (375)');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' }); await sleep(10000);
    await evl('(function(){var b=document.querySelector(\'[data-act="sheet:notices"]\');if(b)b.click();return b?1:0})()'); await sleep(1500);
    let b = await btn('[data-notice-share="ns_all"]');
    let B = b === 'none' ? null : JSON.parse(b);
    ok('  each notice has Share', !!B && B.vis, b);
    ok('  a full-size button (44px)', !!B && B.h >= 44, b);
    await shot('notice-share--app-375.png');
    await evl('document.querySelector(\'[data-notice-share="ns_all"]\').click();1');
    let t = await sheetText();
    ok('  it opens the hub\u2019s share, with a link that needs signing in', /hub\.html\?notice=ns_all/.test(t) && /Sign in/i.test(t), t);
    ok('  a church-wide notice: its title, NEVER its words', /Synthetic Church Notice NS/.test(t) && !t.includes(SECRET), t);
    await evl('document.querySelector(\'[data-notice-share="ns_team"]\').click();1');
    t = await sheetText();
    ok('  a team\u2019s notice: only whose it is - not its title, not its words', /Worship Team/.test(t) && !/Synthetic Worship Notice NS/.test(t) && !t.includes(SECRET) && /notice=ns_team/.test(t), t);

    /* The three ways out, and the phone's own share sheet. */
    await evl('document.querySelector(\'[data-notice-share="ns_all"]\').click();1'); await sleep(800);
    const ways = String(await evl('[].map.call(document.querySelectorAll(".egbc-share .row button"),function(b){return b.textContent.trim()}).join("|")'));
    ok('  the sheet offers WhatsApp, the phone\u2019s share sheet, and Copy', /WhatsApp/.test(ways) && /Share/.test(ways) && /Copy/.test(ways), ways);
    await evl('(function(){window.__shared=null;navigator.share=function(p){window.__shared=p;return Promise.resolve()};document.querySelector(".egbc-share [data-share]").click();return 1})()'); await sleep(800);
    const sharedT = String(await evl('(window.__shared&&window.__shared.text)||""'));
    ok('  "Share\u2026" hands the message to the phone\u2019s share sheet', /hub\.html\?notice=ns_all/.test(sharedT) && !sharedT.includes(SECRET), sharedT);

    console.log('\nAn event in the app\u2019s What\u2019s On');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html?again=1#mode:me' }); await sleep(10000);
    await evl('(function(){var b=document.querySelector(\'.tabs [data-tab="whatson"]\');if(b)b.click();return b?1:0})()'); await sleep(7000);
    const opened = await evl('(function(){var r=document.querySelector(\'[data-wact="event:ns_ev"]\');if(!r)return "no row";r.click();return "clicked"})()'); await sleep(2500);
    const share = await evl('(function(){var s=document.querySelector(\'[data-wact="share"]\');return s?"share":"none"})()');
    ok('  an event opens from the list', opened === 'clicked', opened);
    ok('  and has Share on WhatsApp', share === 'share', share);
    await shot('notice-share--event-375.png');

    console.log('\nThe website\u2019s Notices (hub.html, 375)');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html?app=0&notices=1' }); await sleep(10000);
    b = await btn('[data-news-share="ns_all"]:not(#rdShare)');
    B = b === 'none' ? null : JSON.parse(b);
    ok('  each notice has Share', !!B && B.vis, b);
    await evl('document.querySelector(\'[data-news-share="ns_all"]:not(#rdShare)\').click();1');
    t = await sheetText();
    ok('  the same message: link, title, never the words', /hub\.html\?notice=ns_all/.test(t) && /Synthetic Church Notice NS/.test(t) && !t.includes(SECRET), t);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html?app=0&notice=ns_team' }); await sleep(10000);
    const rd = JSON.parse(String(await evl('JSON.stringify({on:document.getElementById("readModal").classList.contains("on"),title:document.getElementById("rdTitle").textContent,share:(document.getElementById("rdShare")||{}).getAttribute?document.getElementById("rdShare").getAttribute("data-news-share"):""})')));
    ok('  the shared link, signed in, opens that one notice', rd.on && rd.title === 'Synthetic Worship Notice NS', JSON.stringify(rd));
    ok('  with Share there too', rd.share === 'ns_team', JSON.stringify(rd));
    await shot('notice-share--read-375.png');

    console.log('\nThe shared link on a phone (375): the app’s Notices, at that notice');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html?notice=ns_team' }); await sleep(12000);
    const ph = JSON.parse(String(await evl('JSON.stringify({path:location.pathname,search:location.search,'
      + 'wanted:(document.querySelector(\'[data-wanted="1"]\')||{textContent:""}).textContent.slice(0,120),'
      + 'sheet:!!document.querySelector(\'[data-notice-share="ns_all"]\')})')));
    ok('  the link opens the app, not the website', /app\.html$/.test(ph.path), JSON.stringify(ph));
    ok('  at the Notices, with that notice lit', ph.sheet && /Synthetic Worship Notice NS/.test(ph.wanted), JSON.stringify(ph));
    ok('  and the address is tidied (no ?notice= left to reopen it)', ph.search === '', JSON.stringify(ph));
    await shot('notice-share--phone-link-375.png');

    console.log('\nOn a computer (1440): WhatsApp opens WhatsApp Web / Desktop with the message ready');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html?app=0' }); await sleep(10000);
    await evl('document.querySelector(\'[data-news-share="ns_all"]:not(#rdShare)\').click();1'); await sleep(800);
    const waUrl = String(await evl('(function(){window.__opened="";window.open=function(u){window.__opened=u;return {}};var b=document.querySelector(".egbc-share [data-wa]");if(!b)return "no WhatsApp button";b.click();return window.__opened})()'));
    const said = decodeURIComponent(waUrl.replace(/^https:\/\/wa\.me\/\?text=/, ''));
    ok('  "WhatsApp" opens wa.me (WhatsApp Web or Desktop) with the message', waUrl.indexOf('https://wa.me/?text=') === 0 && /hub\.html\?notice=ns_all/.test(said), waUrl.slice(0, 200));
    ok('  and still never the notice’s words', !said.includes(SECRET), said);
    ok('  the sheet closes once WhatsApp is opened', String(await evl('!document.querySelector(".egbc-share")')) === 'true');
  } finally {
    await del('news/ns_all'); await del('news/ns_team'); await del('calEvents/ns_ev');
    ws.close(); chrome.kill(); server.close();
  }
  const pass = R.filter(Boolean).length;
  console.log('\n' + pass + '/' + R.length + ' passed');
  process.exit(pass === R.length ? 0 : 1);
})();
