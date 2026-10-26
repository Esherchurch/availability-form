/* egbc.churchhq.co.uk: the Cloudflare Worker (tools/cloudflare/worker.js)
 * in front of v2, run here against a stand-in for github.io and the dev
 * emulators (26 Oct 2026; Martin: Church HQ's address live now, for the
 * worship and Kids Church rotas, without changing the original site).
 *
 *   node tests/check-worker.mjs          (from v2/, the dev emulators up)
 *   BREAK=1 node tests/check-worker.mjs  the Worker pointed at the repo's root instead
 *                                        of v2/ (what a Pages custom domain would do): must fail
 *   BREAK=root node tests/check-worker.mjs  "/" served as index.html (the availability
 *                                        form), as before: must fail
 *
 * The stand-in serves this folder at /availability-form/v2/ and, at
 * /availability-form/, a page standing for the ORIGINAL SITE, which must
 * never be reached. The real Worker code runs in a small Node server (Node
 * has fetch, Request and Response, as a Worker does).
 *   1. What it serves: v2's own files, as they are; "/" is v2's start page;
 *      the original site never; "..", encoded or not, refused; GitHub's
 *      folder redirects kept on this address; sign-in (/__/auth/) passed to
 *      the auth domain; an unknown church refused.
 *   2. In a browser at 375, through it, made-up people: signing in; the
 *      app's worship rota and Kids Church rota showing their Sundays; the
 *      calendar feed link made; each manifest's start page on this address.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';
import worker, { slugOf, v2Path } from '../tools/cloudflare/worker.js';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9815, GH = 8961, AUTHP = 8962, W = 8963, PW = 'test-only-password';
const BREAK = process.env.BREAK === '1';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const ORIGINAL = 'ORIGINAL SITE - must never be served by the Worker';
const P = { email: 'wk.person@example.invalid', member: 'ab_wk_person', name: 'WK Person Synthetic', teams: ['Worship Team', 'Kids Church'] };
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 300))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x, headers: s.headers })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : (v && typeof v === 'object') ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } } : { stringValue: String(v) };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }, OWNER);

/* The stand-in for github.io: v2 at /availability-form/v2/, the original site above it. */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
const gh = http.createServer((q, s) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  if (u === '/availability-form/' || u === '/availability-form/index.html') { s.writeHead(200, { 'content-type': 'text/html' }); return s.end('<!DOCTYPE html><title>Original</title>' + ORIGINAL); }
  if (!u.startsWith('/availability-form/v2/')) { s.writeHead(404); return s.end('not found'); }
  let f = path.join(V2, u.slice('/availability-form/v2/'.length));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
    /* GitHub Pages: a folder without its "/" is sent on, by its full address. */
    if (!u.endsWith('/')) { s.writeHead(301, { location: 'http://localhost:' + GH + u + '/' }); return s.end(); }
    f = path.join(f, 'index.html');
  }
  if (!fs.existsSync(f)) { s.writeHead(404, { 'content-type': 'text/html' }); return s.end('404'); }
  s.writeHead(200, { 'content-type': (TYPES[path.extname(f)] || 'application/octet-stream') + '; charset=utf-8', 'cache-control': 'max-age=600', 'access-control-allow-origin': '*' });
  s.end(fs.readFileSync(f));
}).listen(GH);
/* The stand-in for egbc-worship-planner.firebaseapp.com's sign-in pages. */
const auth = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => {
  /* Firebase's handler page, as it fails on Martin's phone: it writes the error into the page after it loads. */
  if (q.method === 'GET' && q.url.startsWith('/__/auth/handler')) { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return s.end('<!DOCTYPE html><html><body><div id="e"></div><script>setTimeout(function(){document.getElementById("e").textContent="Unable to process request due to missing initial state. This may happen if browser sessionStorage is inaccessible or accidentally cleared."},400)</script></body></html>'); }
  s.writeHead(200, { 'content-type': 'text/plain' }); s.end('AUTH ' + q.method + ' ' + q.url + ' ' + b); }); }).listen(AUTHP);
/* The Worker, as Cloudflare would run it. */
const ENV = { UPSTREAM: 'http://localhost:' + GH + (BREAK ? '/availability-form' : '/availability-form/v2'), AUTH: 'http://localhost:' + AUTHP, SLUG: 'egbc' };
const runWorker = (env) => http.createServer(async (q, s) => {
  /* BREAK=root: "/" served as index.html (the availability form), as before 26 Oct. */
  if (process.env.BREAK === 'root' && /^\/(\?|$)/.test(q.url)) q.url = '/index.html' + q.url.slice(1);
  const chunks = []; for await (const c of q) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await worker.fetch(new Request('http://localhost:' + q.socket.localPort + q.url, { method: q.method, headers: q.headers, body: /^(GET|HEAD)$/.test(q.method) ? undefined : body }), env);
  const h = {}; r.headers.forEach((v, k) => { if (k !== 'content-encoding' && k !== 'content-length' && k !== 'transfer-encoding') h[k] = v; });
  s.writeHead(r.status, h); s.end(Buffer.from(await r.arrayBuffer()));
});
const ws1 = runWorker(ENV).listen(W);
const ws2 = runWorker({ UPSTREAM: ENV.UPSTREAM, AUTH: ENV.AUTH }).listen(W + 1);   /* no SLUG: localhost is no church */

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-worker-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

let exitCode = 1;
const SUN = (() => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); })();
try {
  console.log('What the Worker serves');
  /* Martin, 26 Oct 2026: the address opens the HUB. index.html
     is the availability form's file name, and stays at /index.html. */
  const home = await req(W, 'GET', '/');
  ok('"/" opens the hub (hub.html), not the availability form', home.status === 302 && home.headers.location === 'http://localhost:' + W + '/hub.html', home.status + ' ' + (home.headers.location || home.body.slice(0, 60)));
  const homeQ = await req(W, 'GET', '/?notices=1');
  ok('  with its query passed on', homeQ.status === 302 && homeQ.headers.location === 'http://localhost:' + W + '/hub.html?notices=1', homeQ.headers.location);
  const form = await req(W, 'GET', '/index.html');
  ok('  /index.html is still the availability form, as it is', form.status === 200 && form.body === fs.readFileSync('index.html', 'utf8') && /Member Availability/.test(form.body), form.status);
  const mails = ['Planner.html', 'trainingrotaplanner.html', 'egbc-core-rota.js'].filter((f) => !/location\.pathname\.replace\(\/\[\^\/\]\*\$\/, ''\) \+ '?index\.html/.test(fs.readFileSync(f, 'utf8')));
  ok('  and the availability emails link to index.html, never the bare address', mails.length === 0, mails);
  const hub = await req(W, 'GET', '/hub.html?x=1');
  ok('  a page is v2\'s file, as it is', hub.status === 200 && hub.body === fs.readFileSync('hub.html', 'utf8') && /text\/html/.test(hub.headers['content-type']), hub.status);
  ok('  with github.io\'s caching passed on', hub.headers['cache-control'] === 'max-age=600', hub.headers['cache-control']);
  const orig = await Promise.all(['/availability-form/', '/availability-form/index.html', '/../index.html', '/v2/../../index.html'].map((p) => req(W, 'GET', p)));
  ok('the original site, never (by any path)', orig.every((r) => r.body.indexOf(ORIGINAL) === -1), orig.map((r) => r.status + ' ' + r.body.slice(0, 40)).join(' | '));
  const sneak = await Promise.all(['/%2e%2e/index.html', '/..%2findex.html', '/a/%2E%2E/%2E%2E/index.html'].map((p) => req(W, 'GET', p)));
  /* A web address folds "%2e%2e" into ".." before the Worker sees it (as
     Cloudflare's does), so those land on v2's own page; "%2f" is not
     folded, and is refused. Either way, never above v2. */
  const v2Index = fs.readFileSync('index.html', 'utf8');
  ok('  ".." in disguise stays inside v2, or is refused', sneak.every((r) => r.status === 400 || (r.status === 200 && r.body === v2Index)) && sneak[1].status === 400, sneak.map((r) => r.status).join(','));
  ok('  and the path check knows it', v2Path('/%2e%2e/x') === null && v2Path('/a/b.html') === '/a/b.html');
  const folder = await req(W, 'GET', '/design-mocks');
  ok('GitHub\'s folder redirect stays on this address', folder.status === 301 && folder.headers.location === 'http://localhost:' + W + '/design-mocks/', folder.status + ' ' + folder.headers.location);
  const signin = await req(W, 'POST', '/__/auth/handler?apiKey=k', { a: 1 });
  ok('sign-in (/__/auth/) goes to the Firebase auth domain, as asked', signin.status === 200 && /^AUTH POST \/__\/auth\/handler\?apiKey=k \{"a":1\}/.test(signin.body), signin.body.slice(0, 80));
  const none = await req(W + 1, 'GET', '/hub.html');
  ok('an address that is no church\'s: "no church here"', none.status === 404 && /no church/i.test(none.body), none.status);
  ok('  egbc.churchhq.co.uk is EGBC\'s; other hosts are no church\'s', slugOf('egbc.churchhq.co.uk') === 'egbc' && slugOf('evil.example.com') === '' && slugOf('churchhq.co.uk') === '' && slugOf('a.b.churchhq.co.uk') === '');
  ok('  pages only: nothing is written through it', (await req(W, 'POST', '/hub.html', {})).status === 405);
  const mf = await req(W, 'GET', '/manifest-app.json');
  const m = JSON.parse(mf.body.replace(/^\uFEFF/, '') || '{}');
  ok('each manifest opens on this address, not github.io', mf.status === 200 && new URL(m.start_url, 'http://localhost:' + W + '/manifest-app.json').origin === 'http://localhost:' + W
    && fs.readdirSync('.').filter((f) => /^manifest-.*\.json$/.test(f)).every((f) => !/esherchurch\.github\.io/.test(fs.readFileSync(f, 'utf8'))), m.start_url);

  console.log('\nThrough it, in a browser, a made-up member of the Worship Team and Kids Church');
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: P.email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: P.email, password: PW, returnSecureToken: true })).body || '{}');
  P.uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: P.uid, emailVerified: true }, OWNER);
  await put('addressBook/' + P.member, { name: P.name, email: P.email, markers: P.teams, adminFor: [], masterAdmin: false, archived: false, isMinor: false, churchMember: true });
  await put('users/' + P.uid, { uid: P.uid, email: P.email, name: P.name, memberId: P.member, status: 'active', linkedBy: 'admin', teams: P.teams, adminFor: [], masterAdmin: false, churchMember: true });
  await put('events/ev_wk_worship', { date: SUN, type: 'WK Sunday Worship (synthetic)', startTime: '10:00', teams: ['Worship Team'], assignments: { 'Worship Leader': { name: P.name, id: P.member } } });
  await put('events/ev_wk_kids', { date: SUN, type: 'WK Kids Church (synthetic)', startTime: '10:00', teams: ['Kids Church'], assignments: { 'Session Leader': { name: P.name, id: P.member } } });

  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (mth, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: mth, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { pend.get(x.id)(x.result || {}); pend.delete(x.id); return; }
    if (x.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(x.params.exceptionDetails).slice(0, 200)); };
  const evl = makeEval(send, 'worker');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const BASE = 'http://localhost:' + W + '/';
  /* A sign-in lost between the app and the browser (Martin's Android phone,
     26 Oct 2026): Firebase's handler page says "missing initial state"; the
     Worker's watcher sends the person to the hub's sign-in page instead. */
  await send('Page.navigate', { url: BASE + '__/auth/handler?state=lost-in-a-tab&code=x' }); await sleep(5000);
  const lost = JSON.parse(String(await evl('JSON.stringify({path:location.pathname,search:location.search,text:document.body.innerText.replace(/\\s+/g," ")})')) || '{}');
  ok('a sign-in lost on the way back lands on the hub\'s sign-in page, not Firebase\'s error', lost.path === '/login.html' && /signin=lost/.test(lost.search || ''), JSON.stringify(lost).slice(0, 200));
  ok('  which says plainly what happened, with Google to try again', /did not finish/.test(lost.text || '') && /Continue with Google/.test(lost.text || ''), (lost.text || '').slice(0, 200));
  await send('Page.navigate', { url: BASE + 'login.html' }); await sleep(3000);
  ok('the sign-in page opens through it', String(await evl('typeof EGBCAuth')) === 'object');
  await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(P.email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(1000);
  ok('  and signs in', String(await evl('(firebase.auth(EGBCAuth.app).currentUser||{}).email||""')) === P.email);
  await send('Page.navigate', { url: BASE + 'app.html' });
  for (let i = 0; i < 60; i++) { await sleep(500); if (String(await evl('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}}).getAttribute("data-drawn")||""')).indexOf(P.uid + ':') === 0) break; }
  const screenText = async (space) => {
    await evl('EGBCApp.go(' + JSON.stringify(space) + ',"rota");1');
    let t = ''; for (let i = 0; i < 40; i++) { await sleep(400); t = String(await evl('document.body.innerText.replace(/\\s+/g," ")')); if (/You are on/.test(t) && /WK /.test(t)) break; }
    return t;
  };
  let t = await screenText('worship');
  ok('the worship rota shows their Sunday', /You are on/.test(t) && /Worship Leader/.test(t) && /WK Sunday Worship/.test(t), t.slice(0, 200));
  t = await screenText('kids');
  ok('the Kids Church rota shows theirs', /You are on/.test(t) && /Session Leader/.test(t) && /WK Kids Church/.test(t), t.slice(0, 200));
  const feed = JSON.parse(String(await evl('EGBCAuth.call("myCalendarLink",{feed:"me",reset:false}).then(function(r){return JSON.stringify({key:!!(r&&r.key)})},function(e){return JSON.stringify({err:String(e&&e.message||e)})})', true)) || '{}');
  ok('the calendar feed link is made', feed.key === true, JSON.stringify(feed));
  ok('no errors on the pages', errs.length === 0, errs.join(' | '));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  for (const p of ['events/ev_wk_worship', 'events/ev_wk_kids', 'users/' + P.uid, 'addressBook/' + P.member]) await req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER).catch(() => {});
  try { chrome.kill(); } catch {}
  gh.close(); auth.close(); ws1.close(); ws2.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
