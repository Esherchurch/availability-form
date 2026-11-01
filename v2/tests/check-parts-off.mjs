/* A PART SWITCHED OFF IS GONE EVERYWHERE, AND SWITCHING IT BACK BRINGS IT
 * ALL BACK (going-live test, stage 1).
 *
 *   node tests/check-parts-off.mjs     (from v2/; the dev emulators up: Firestore 8181, Auth 9099)
 *
 * As a master admin - who otherwise sees everything - with the church set to
 * "Worship and AV only" (egbc-parts.js): no page of a part switched off is in
 * the Menu (which search filters), in the app's spaces or on its Home, and
 * such a page opened by its address says it isn't used here; a page of a
 * part still on opens. Then "Everything": they are back.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
createRequire(import.meta.url)(path.join(V2, 'egbc-parts.js'));
const P = globalThis.EGBCParts;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SERVE = 8992, PW = 'test-only-password', EMAIL = 'parts.master@example.invalid';
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents', OWNER = { Authorization: 'Bearer owner' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    (s) => { let x = ''; s.on('data', (c) => (x += c)); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => typeof v === 'boolean' ? { booleanValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : (v && typeof v === 'object') ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } } : { stringValue: String(v) };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p.split('/').map(encodeURIComponent).join('/'), { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }, OWNER);

const R = [];
const ok = (name, bad) => { R.push(!bad.length); console.log((bad.length ? '  FAIL  ' : '  PASS  ') + name + (bad.length ? '\n          ' + bad.slice(0, 12).join('\n          ') : '')); };

const server = http.createServer((q, s) => {
  const f = path.join(V2, decodeURIComponent(q.url.split('?')[0]).replace(/^\//, ''));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': /\.js$/.test(f) ? 'text/javascript' : /\.json$/.test(f) ? 'application/json' : 'text/html', 'Cache-Control': 'no-store' });
  s.end(fs.readFileSync(f));
}).listen(SERVE);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: path.join(os.tmpdir(), 'parts-off-' + process.pid) });
let uid = '';
try {
  let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: EMAIL, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: EMAIL, password: PW, returnSecureToken: true })).body || '{}');
  uid = up.localId;
  await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: uid, emailVerified: true }, OWNER);
  await put('addressBook/ab_parts_master', { name: 'Parts Master Synthetic', email: EMAIL, markers: [], masterAdmin: true, archived: false });
  await put('users/' + uid, { uid, email: EMAIL, name: 'Parts Master Synthetic', status: 'active', teams: [], adminFor: [], masterAdmin: true, memberId: 'ab_parts_master', churchMember: true });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  async function signedIn(url) {
    await page.goto('http://localhost:' + SERVE + '/' + url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.EGBCAuth && firebase.auth(EGBCAuth.app), { timeout: 20000 });
    await page.evaluate((e, p) => firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(e, p), EMAIL, PW).catch(() => {});
    await page.goto('http://localhost:' + SERVE + '/' + url, { waitUntil: 'domcontentloaded' });
    await sleep(5000);
  }
  async function look(mode) {
    await signedIn('hub.html');
    const menu = await page.evaluate(() => { const out = []; (function w(n) { (n || []).forEach((x) => { if (x.url) out.push(x.url.split('?')[0]); if (x.children) w(x.children); }); })(EGBCMenu.forPerson(EGBCMenu.who())); return out; });
    await signedIn('app.html');
    const app = await page.evaluate(() => ({ spaces: EGBCApp.spacesFor(EGBCApp.who()), opens: [].map.call(document.querySelectorAll('[data-act^="open:"]'), (b) => b.getAttribute('data-act').slice(5).split('?')[0]) }));
    const direct = {};
    for (const url of ['bookings-admin.html', 'kids-admin.html', 'Planner.html']) {
      await signedIn(url);
      direct[url] = await page.evaluate(() => ({ blocked: document.body.getAttribute('data-egbc-blocked') || '', text: document.body.innerText.slice(0, 400) }));
    }
    return { mode, menu, app, direct };
  }

  console.log('\nWorship and AV only');
  const sw = P.presetSwitches('worship');
  await put('churchSettings/features', Object.assign({}, sw, { updatedBy: 'test' }));
  const off = P.PARTS.filter((p) => sw.parts[p.id] === false).map((p) => p.id);
  const a = await look('worship');
  ok('the Menu (and so search) has no page of a part switched off (' + a.menu.length + ' entries)', a.menu.filter((u) => off.includes(P.partOf(u))).map((u) => u + ' (' + P.partOf(u) + ')'));
  ok('the app has no space of a part switched off', a.app.spaces.filter((k) => ['kids', 'youth', 'lazers', 'renu', 'maint'].includes(k)));
  ok('the app\'s Home offers no page of a part switched off', a.app.opens.filter((u) => off.includes(P.partOf(u))));
  ok('a switched-off page opened by its address says it isn\'t used here', ['bookings-admin.html', 'kids-admin.html']
    .filter((u) => !/isn.t used by this church/i.test(a.direct[u].text)).map((u) => u + ': ' + a.direct[u].text.slice(0, 80).replace(/\s+/g, ' ')));
  ok('a page of a part still on opens', /isn.t used by this church/i.test(a.direct['Planner.html'].text) ? ['Planner.html says it is not used'] : []);

  console.log('\nEverything');
  await put('churchSettings/features', Object.assign({}, P.presetSwitches('everything'), { updatedBy: 'test' }));
  const b = await look('everything');
  ok('back on: room bookings and the children\'s register are in the Menu again', ['bookings-admin.html', 'kids-admin.html'].filter((u) => !b.menu.some((m) => m.toLowerCase() === u)));
  ok('back on: a page that was switched off opens', ['bookings-admin.html', 'kids-admin.html'].filter((u) => /isn.t used by this church/i.test(b.direct[u].text)));
} finally {
  await req(8181, 'DELETE', DOCS + '/churchSettings/features', undefined, OWNER).catch(() => {});
  if (uid) await req(8181, 'DELETE', DOCS + '/users/' + uid, undefined, OWNER).catch(() => {});
  await req(8181, 'DELETE', DOCS + '/addressBook/ab_parts_master', undefined, OWNER).catch(() => {});
  await browser.close();
  server.close();
}
console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
process.exit(R.every(Boolean) ? 0 : 1);
