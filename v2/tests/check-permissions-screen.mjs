/* The Permissions screen (FINDINGS-churchhq H-14; permissions.html), and
 * the kb/ upload control following it.
 *
 *   node tests/check-permissions-screen.mjs          (from v2/, the dev emulators up)
 *   BREAK=1 node tests/check-permissions-screen.mjs  the How-To page's control back on a
 *                                                    team list, ignoring the screen: must fail
 *
 * In a browser at 375, made-up people:
 *   - a master admin: by section (Worship & AV open), kb/ uploads ticked as
 *     Martin decided; unticks Worship's admins, saves, and it is kept and in
 *     the history; adds an exception for a person with no team, with an end
 *     date and a reason; searches;
 *   - that person sees the How-To page's upload control; a plain member does not;
 *   - an admin who is not a master is turned away from the screen.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP = 9819, SERVE = 8983, PW = 'test-only-password';
const BREAK = !!process.env.BREAK;
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const PEOPLE = {
  master: { email: 'pm.master@example.invalid', member: 'ab_pm_master', name: 'PM Master Synthetic', teams: [], adminFor: [], masterAdmin: true },
  sam: { email: 'pm.sam@example.invalid', member: 'ab_pm_sam', name: 'PM Sam Synthetic', teams: [], adminFor: [], masterAdmin: false },
  plain: { email: 'pm.plain@example.invalid', member: 'ab_pm_plain', name: 'PM Plain Synthetic', teams: ['AV Team'], adminFor: [], masterAdmin: false },
  admin: { email: 'pm.admin@example.invalid', member: 'ab_pm_admin', name: 'PM Admin Synthetic', teams: [], adminFor: ['Kids Church'], masterAdmin: false }
};
const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(x).slice(0, 300))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } } : { stringValue: String(v) };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }, OWNER);
const getDoc = async (p) => { const r = await req(8181, 'GET', DOCS + '/' + p, undefined, OWNER); return r.status === 200 ? JSON.parse(r.body).fields || {} : null; };
const list = (f) => f ? ((f.arrayValue || {}).values || []).map((x) => x.stringValue) : null;
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const AHEAD = (() => { const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().slice(0, 10); })();

const server = http.createServer((q, s) => {
  const url = decodeURIComponent(q.url.split('?')[0]);
  if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
  const f = path.join(V2, url.replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  let body = fs.readFileSync(f, 'utf8');
  if (/\.html$/.test(f)) { const h = /<head[^>]*>/i.exec(body); if (h) body = body.slice(0, h.index + h[0].length) + NO_SW + body.slice(h.index + h[0].length); }
  /* The break: the How-To page's control on its old team list. */
  if (BREAK && url === '/EGBC-HowTo-AV.html') { const was = body; body = body.replace(' data-action="kbUpload" data-admin-team=', ' data-admin-team='); if (body === was) console.log('  FAIL  the break did not apply'); }
  s.writeHead(200, { 'Content-Type': (/\.js$/.test(f) ? 'text/javascript' : 'text/html') + '; charset=utf-8', 'Cache-Control': 'no-store' });
  s.end(body);
}).listen(SERVE);
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-perms-' + process.pid), 'about:blank'], { stdio: 'ignore' });
const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: CDP, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));

let exitCode = 1;
try {
  for (const p of ['churchSettings/permissions', 'permissionExceptions/kbUpload_ab_pm_sam']) await req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER).catch(() => {});
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: p.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + p.member, { name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, archived: false, isMinor: false, churchMember: true });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor, masterAdmin: p.masterAdmin, churchMember: true });
  }

  let tabs; for (let i = 0; i < 60; i++) { try { tabs = await getJSON('/json/list'); if (tabs.some((x) => x.type === 'page')) break; } catch {} await sleep(500); }
  const ws = new WebSocket(tabs.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(); const errs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails).slice(0, 200));
    if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }); };
  const evl = makeEval(send, 'perms');
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  const as = async (who, page) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut().then(function(){return 1})', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(function(){return 1})', true); await sleep(800);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page }); await sleep(5000);
  };
  const text = async () => String(await evl('(document.getElementById("main")||document.body).textContent.replace(/\\s+/g," ")'));
  const checked = async (f, v) => String(await evl('(function(){var i=document.querySelector(\'[data-act=kbUpload][data-f=' + f + '][data-v="' + v + '"]\');return i?String(i.checked):"none"})()'));

  console.log('\nA master admin');
  await as('master', 'permissions.html');
  let t = await text();
  ok('by section: Worship & AV open, the others closed, safeguarding and pastoral care read-only', /Worship & AV/.test(t) && /Children & youth/.test(t) && /Not set here/.test(t) && /Only the named safeguarding lead and deputy/.test(t), t.slice(0, 200));
  ok('  kb/ uploads as Martin decided: core teams covering worship, and AV and Worship admins',
    (await checked('coresOf', 'worship')) === 'true' && (await checked('adminJobs', 'av')) === 'true' && (await checked('adminJobs', 'worship')) === 'true' && (await checked('jobs', 'leadership')) === 'false');
  ok('  master admins always, and cannot be unticked', String(await evl('(function(){var l=[].find.call(document.querySelectorAll(".tick.lock"),function(x){return /Master admins/.test(x.textContent)});return l&&l.querySelector("input").disabled})()')) === 'true');
  await evl('(function(){var i=document.querySelector(\'[data-act=kbUpload][data-f=adminJobs][data-v="worship"]\');i.click();return 1})()'); await sleep(300);
  ok('  a change shows Save', String(await evl('!document.getElementById("saveBar").hidden')) === 'true');
  await evl('document.getElementById("save").click();1'); await sleep(2500);
  const pd = await getDoc('churchSettings/permissions');
  const kb = pd && pd.actions && pd.actions.mapValue.fields.kbUpload.mapValue.fields;
  ok('  unticking Worship\'s admins and saving keeps it', kb && JSON.stringify(list(kb.adminJobs)) === '["av"]', JSON.stringify(kb));
  await evl('(function(){var b=document.querySelector("[data-add=kbUpload]");b.click();var f=document.querySelector("[data-addform=kbUpload]");'
    + 'f.querySelector("[data-p=name]").value=' + JSON.stringify(PEOPLE.sam.name) + ';f.querySelector("[data-p=until]").value=' + JSON.stringify(AHEAD) + ';'
    + 'f.querySelector("[data-p=why]").value="Runs the AV desk on Sundays";document.querySelector("[data-addgo=kbUpload]").click();return 1})()'); await sleep(2500);
  const x = await getDoc('permissionExceptions/kbUpload_' + PEOPLE.sam.member);
  ok('adds one person, with an end date and a reason (an exception)', x && x.until.stringValue === AHEAD && x.uid.stringValue === PEOPLE.sam.uid && /AV desk/.test(x.why.stringValue), JSON.stringify(x));
  await evl('document.querySelector("[data-view=exceptions]").click();1'); await sleep(500);
  t = await text();
  ok('  the Exceptions view lists it: who, what, why, who added it, "ends in 5 days"', /PM Sam Synthetic/.test(t) && /Upload to How-To AV/.test(t) && /AV desk/.test(t) && /PM Master Synthetic/.test(t) && /ends in 5 days/.test(t), t.slice(0, 250));
  await evl('document.querySelector("[data-view=history]").click();1'); await sleep(500);
  t = await text();
  ok('  the History has both changes, and who made them', /Changed who may/.test(t) && /Added PM Sam Synthetic/.test(t) && /PM Master Synthetic/.test(t), t.slice(0, 250));
  await evl('document.querySelector("[data-view=sections]").click();var q=document.getElementById("q");q.value="zzz-nothing";q.dispatchEvent(new Event("input"));1'); await sleep(300);
  ok('the search finds nothing for nonsense', /Nothing matches that/.test(await text()));
  await evl('var q=document.getElementById("q");q.value="upload";q.dispatchEvent(new Event("input"));1'); await sleep(300);
  ok('  and the upload action for "upload"', /Upload to How-To AV/.test(await text()));

  console.log('\nThe How-To page\'s upload control');
  await as('sam', 'EGBC-HowTo-AV.html'); await sleep(2000);
  const shown = async () => String(await evl('(function(){var b=document.querySelector(\'[onclick*="toggleAdmin"]\');return b?String(b.style.display!=="none"&&!b.hasAttribute("data-kb-hidden")):"none"})()'));
  ok('the person given it sees it, with no team at all', (await shown()) === 'true');
  await as('plain', 'EGBC-HowTo-AV.html'); await sleep(2000);
  ok('  a plain AV member does not', (await shown()) === 'false');

  console.log('\nAn admin who is not a master');
  await as('admin', 'permissions.html');
  ok('is turned away from the screen', String(await evl('document.body.getAttribute("data-egbc-blocked")||""')).length > 0);
  ok('no errors on the pages', errs.length === 0, errs.join(' | '));
  exitCode = R.every(Boolean) ? 0 : 1;
} catch (e) { console.log('  FAIL  the run itself: ' + (e && e.stack || e)); }
finally {
  for (const p of ['churchSettings/permissions', 'permissionExceptions/kbUpload_' + PEOPLE.sam.member]) await req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER).catch(() => {});
  for (const p of Object.values(PEOPLE)) { await req(8181, 'DELETE', DOCS + '/users/' + p.uid, undefined, OWNER).catch(() => {}); await req(8181, 'DELETE', DOCS + '/addressBook/' + p.member, undefined, OWNER).catch(() => {}); }
  try { chrome.kill(); } catch {}
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(exitCode);
