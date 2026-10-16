/* What "Everyone" - a member on no team - sees (Martin, 15 Oct 2026,
 * viewing as "Everyone (no team)": "I can't see podcasts, I can't see the
 * YouTube videos, but I can see all the youth stuff, team videos and team
 * resources").
 *
 *   node tests/check-everyone.mjs      (from v2/, the dev emulators up)
 *
 * As a master admin viewing as Everyone, and as a real member on no team:
 *   - the Menu has Watch & Listen and Apps and downloads, and no Youth,
 *     Pin boards, Team Resources, Team Videos or Manage Watch;
 *   - the youth and team pages turn them away (a Worship member still gets
 *     the team pages and not the youth ones);
 *   - the hub's phone bar has Watch;
 *   - Watch & Listen opens on Watch while there are no sermons, says so on
 *     Listen, plays the channel's videos; with a sermon it opens on Listen,
 *     and the Latest strip shows both.
 * Pictures: tests/shots/everyone--{watch,watch-sermon,hub}-375.png
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
const PORT = 9785, SERVE = 9001, PW = 'test-only-password';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const PEOPLE = {
  master: { email: 'ev.master@example.invalid', member: 'ab_ev_master', name: 'Everyone Master Synthetic', teams: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true },
  none:   { email: 'ev.none@example.invalid',   member: 'ab_ev_none',   name: 'Everyone Nobody Synthetic', teams: [], adminFor: [], masterAdmin: false },
  worship:{ email: 'ev.worship@example.invalid', member: 'ab_ev_worship', name: 'Everyone Worship Synthetic', teams: ['Worship Team'], adminFor: [], masterAdmin: false }
};
const VIDEO = 'yt_evSynthVid01', SERMON = 'ev_synthetic_sermon';

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };
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
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function tidy() { await del('videos/' + VIDEO); await del('sermons/' + SERMON); }

const MENU = 'JSON.stringify((function(){var out=[];(function w(n){n.forEach(function(x){out.push(x.title);if(x.children)w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));return out})())';
const NEVER = ['Youth', 'Youth Service Planner', 'Pin boards', 'Team Resources', 'Team Videos', 'Manage Watch', 'Manage sermons'];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin',
      teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, churchMember: true });
  }
  await tidy();
  await put('videos/' + VIDEO, { source: 'feed', videoId: 'evSynthVid01', title: 'Synthetic Channel Video', published: '2026-10-11T10:00:00Z' });

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
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-ev-' + process.pid),
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
  const evl = makeEval(send, 'ev');
  const J = async (x) => JSON.parse(String(await evl(x)));
  const signIn = async (p) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await evl('sessionStorage.clear();localStorage.removeItem("egbc_hub_team");1');
    for (let i = 0; i < 3; i++) {
      await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ').catch(function(){})', true); await sleep(800);
      if (String(await evl('(firebase.auth(EGBCAuth.app).currentUser||{}).email||""')) === p.email) return;
    }
  };
  const open = async (page, w, wait) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 700 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 700 });
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page }); await sleep(wait || 7000);
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(s.data, 'base64'));
  };
  const blocked = () => evl('document.body.hasAttribute("data-egbc-blocked")').then(String).then(x => x === 'true');

  try {
    for (const who of ['viewing as Everyone', 'a member on no team']) {
      console.log('\n' + who);
      if (who === 'viewing as Everyone') {
        await signIn(PEOPLE.master);
        await open('groups.html', 375, 3000);
        await evl('sessionStorage.setItem("egbc_view_as", JSON.stringify({ team: "__everyone", admin: false }));1');
      } else await signIn(PEOPLE.none);
      watch.reset();
      await open('hub.html', 375, 11000);
      const menu = await J(MENU);
      ok('  the Menu has Watch & Listen, and Apps and downloads', menu.includes('Watch & Listen') && menu.includes('Apps and downloads'), JSON.stringify(menu));
      ok('  and none of the youth or team things', NEVER.every(t => !menu.includes(t)), NEVER.filter(t => menu.includes(t)).join(', '));
      const tabs = await J('JSON.stringify([].map.call(document.querySelectorAll("#egbc-tabbar a"),function(a){return a.getAttribute("href")}))');
      ok('  the phone bar has Watch', tabs.includes('watch.html'), JSON.stringify(tabs));
      const fits = await J('JSON.stringify({sideways:document.documentElement.scrollWidth>innerWidth+1})');
      ok('  and still fits at 375px', !fits.sideways);
      if (who === 'a member on no team') await shot('everyone--hub-375.png');
      ok('  nothing on the hub\'s console', watch.errors.length === 0, watch.summary());
      for (const page of ['Youthcharter.html', 'youthserviceplanner.html', 'stickynotes.html', 'resources.html', 'videos.html']) {
        await open(page, 375, 6000);
        ok('  ' + page + ' turns them away', await blocked());
      }
      await open('hubresources.html', 375, 6000);
      ok('  Apps and downloads still opens', !(await blocked()));
    }

    console.log('\nA Worship member');
    await signIn(PEOPLE.worship);
    for (const page of ['stickynotes.html', 'resources.html', 'videos.html']) {
      await open(page, 1280, 6000);
      ok('  ' + page + ' opens', !(await blocked()));
    }
    await open('Youthcharter.html', 1280, 6000);
    ok('  the youth charter does not', await blocked());

    console.log('\nWatch & Listen, a member on no team (375px)');
    await signIn(PEOPLE.none);
    watch.reset();
    await open('watch.html', 375, 7000);
    let st = await J('JSON.stringify({part:(document.getElementById("part")||{}).dataset&&document.getElementById("part").dataset.part,'
      + 'video:!!document.querySelector(\'#part [data-video="evSynthVid01"]\'),latestV:!!document.querySelector(\'[data-w="latest-video"]\'),'
      + 'blocked:document.body.hasAttribute("data-egbc-blocked"),sideways:document.documentElement.scrollWidth>innerWidth+1})');
    ok('  opens on Watch while there are no sermons, with the channel\'s video', st.part === 'watch' && st.video && st.latestV && !st.blocked && !st.sideways, JSON.stringify(st));
    await evl('document.querySelector(\'#part [data-video="evSynthVid01"]\').click();1'); await sleep(800);
    ok('  a video plays in place', /youtube-nocookie\.com\/embed\/evSynthVid01/.test(String(await evl('(document.querySelector("#playBox iframe")||{}).src||""'))));
    await shot('everyone--watch-375.png');
    await evl('document.querySelector(\'#switch [data-part="listen"]\').click();1'); await sleep(400);
    ok('  Listen says sermons will appear, rather than nothing', String(await evl('!!document.querySelector(\'[data-w="no-sermons"]\')')) === 'true' && /Sermons will appear here/.test(String(await evl('document.getElementById("part").innerText'))));

    await put('sermons/' + SERMON, { published: true, title: 'Synthetic Sermon', speaker: 'Synthetic Speaker', date: '2026-10-11',
      audioUrl: 'https://example.invalid/synthetic.mp3', source: 'upload', durationSec: 1800 });
    await open('watch.html', 375, 7000);
    st = await J('JSON.stringify({part:document.getElementById("part").dataset.part,latestS:!!document.querySelector(\'[data-w="latest-sermon"]\'),'
      + 'latestV:!!document.querySelector(\'[data-w="latest-video"]\'),row:!!document.querySelector(\'#part [data-sermon="' + SERMON + '"]\')})');
    ok('  with a sermon: opens on Listen, and Latest shows the newest video and sermon', st.part === 'listen' && st.latestS && st.latestV && st.row, JSON.stringify(st));
    await evl('document.querySelector(\'#part [data-sermon="' + SERMON + '"]\').click();1'); await sleep(800);
    ok('  a sermon plays here', String(await evl('(document.querySelector("#playBox audio")||{}).src||""')) === 'https://example.invalid/synthetic.mp3');
    await shot('everyone--watch-sermon-375.png');
    ok('  nothing on the console', watch.errors.filter(e => !/synthetic\.mp3|example\.invalid/.test(String(e.text || e))).length === 0, watch.summary());
  } finally {
    await tidy();
    server.close(); chrome.kill();
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(async e => { console.error(e); try { await tidy(); } catch {} process.exit(1); });
