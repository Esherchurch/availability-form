/* THE GOING-LIVE TEST'S BROWSER HARNESS: the pages, served from v2/ and
 * pointed at the SPARE emulators (firebase.spare.json), so a run never
 * meets the dev emulators other windows use. Run inside
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore,auth,storage,functions ...
 *
 * The rules are the locked ones the spare config loads (firestore.build.rules,
 * storage.rules). On the functions emulator nothing is sent: every email is
 * an emailOutbox row.
 *
 *   serve(port)                    the pages, with the spare ports swapped in
 *   browser()                      headless Chrome (puppeteer-core)
 *   person(p)                      a sign-in, its users record and address-book entry
 *   signIn(page, p, url)           opens url signed in as p
 *   put / get / del / all          owner writes and reads (past the rules)
 *   inChurch(cid)                  put/get/del/all and person() inside
 *                                  churches/{cid} (null: EGBC's top level);
 *                                  run with firebase.churches-spare.json,
 *                                  which loads the church rules
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { DEFAULT_CORES, coversFor, sharesFor, jobsFor } from '../../functions/core-teams.js';
import { missingStandIns } from '../../tools/secret-stand-ins.mjs';

/* NO RUN WITHOUT STAND-INS FOR EVERY SECRET (2 Nov 2026): the functions
   emulator fetches any secret missing from functions/.secret.local from the
   LIVE project, so a run with one missing reads a real key. Refused here,
   before anything is seeded or opened (ENGINEERING.md, "Emulators"). */
{
  const miss = missingStandIns();
  if (miss.length) {
    console.error('REFUSED: no test stand-in in functions/.secret.local for ' + miss.join(', ') + '. '
      + 'Stop the emulators, run "node tools/secret-stand-ins.mjs" (from v2/), and start them again.');
    process.exit(2);
  }
}

export const V2 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SPARE = JSON.parse(fs.readFileSync(path.join(V2, 'firebase.spare.json'), 'utf8')).emulators;
export const PORTS = { firestore: SPARE.firestore.port, auth: SPARE.auth.port, storage: SPARE.storage.port, functions: SPARE.functions.port };
const DEV = { 8181: PORTS.firestore, 9099: PORTS.auth, 9199: PORTS.storage, 5101: PORTS.functions };
export const PROJECT = 'egbc-worship-planner';
export const PW = 'test-only-password';
const DOCS = '/v1/projects/' + PROJECT + '/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    (s) => { let x = ''; s.on('data', (c) => (x += c)); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});

/* Firestore's REST values, both ways. */
const val = (v) => v === null || v === undefined ? { nullValue: null } : typeof v === 'boolean' ? { booleanValue: v }
  : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } } : { stringValue: String(v) };
export const plain = (v) => {
  if (!v) return v;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(plain);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, plain(x)]));
  return v;
};
/* The church a run is in: '' is EGBC's top level. */
let SCOPE = '';
export const CHURCH = () => SCOPE ? SCOPE.split('/')[1] : null;
/** @param {string|null} cid */
export function inChurch(cid) { SCOPE = cid ? 'churches/' + cid + '/' : ''; }
const enc = (p) => (SCOPE + p).split('/').map(encodeURIComponent).join('/');
export const put = (p, o) => req(PORTS.firestore, 'PATCH', DOCS + '/' + enc(p), { fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) }, OWNER);
export const del = (p) => req(PORTS.firestore, 'DELETE', DOCS + '/' + enc(p), undefined, OWNER);
export async function get(p) {
  const r = await req(PORTS.firestore, 'GET', DOCS + '/' + enc(p), undefined, OWNER);
  if (r.status !== 200) return null;
  return plain({ mapValue: { fields: JSON.parse(r.body).fields || {} } });
}
/** Every record of a collection (owner), as [{ id, ...fields }]. @param {string} coll */
export async function all(coll) {
  const r = await req(PORTS.firestore, 'POST', DOCS + (SCOPE ? '/' + SCOPE.slice(0, -1) : '') + ':runQuery', { structuredQuery: { from: [{ collectionId: coll }] } }, OWNER);
  return JSON.parse(r.body || '[]').filter((x) => x.document).map((x) => Object.assign({ id: x.document.name.split('/').pop() }, plain({ mapValue: { fields: x.document.fields || {} } })));
}
/** Empties the spare Firestore and Auth (between runs). */
export async function wipe() {
  await req(PORTS.firestore, 'DELETE', '/emulator/v1/projects/' + PROJECT + '/databases/(default)/documents');
  await req(PORTS.auth, 'DELETE', '/emulator/v1/projects/' + PROJECT + '/accounts');
}

/* What every page gets first: no service worker (it would cache across
   runs), and the browser's own questions answered and written down. */
const FIRST = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}'
  + 'window.__asked=[];window.alert=function(m){window.__asked.push(["alert",String(m)])};'
  + 'window.confirm=function(m){window.__asked.push(["confirm",String(m)]);return window.__confirm!==false};'
  + 'window.prompt=function(m,d){window.__asked.push(["prompt",String(m)]);return window.__prompt!==undefined?window.__prompt:(d||"Synthetic")};'
  + 'window.__opened=[];window.open=function(u){window.__opened.push(String(u));return null};'
  + '})();</script>';

/* A blank page that only signs in, so no page's own redirect gets in the way. */
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>signing in</body></html>';

/** Serves v2/ with the spare emulators' ports in place of the dev ones. @param {number} port */
export function serve(port) {
  const swap = (s) => s.replace(/\b(8181|9099|9199|5101)\b/g, (m) => String(DEV[m]));
  return new Promise((res) => {
    const server = http.createServer((q, s) => {
      const url = decodeURIComponent(q.url.split('?')[0]);
      if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return s.end(SIGNIN); }
      const f = path.join(V2, url.replace(/^\//, ''));
      if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
      const ext = path.extname(f).toLowerCase();
      const text = ['.html', '.js', '.css', '.json', '.md', '.mjs', '.svg', '.txt'].includes(ext);
      let body = fs.readFileSync(f);
      if (text) {
        body = swap(body.toString('utf8'));
        if (ext === '.html') { const h = /<head[^>]*>/i.exec(body); if (h) body = body.slice(0, h.index + h[0].length) + FIRST + body.slice(h.index + h[0].length); }
      }
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.md': 'text/markdown' }[ext] || 'application/octet-stream';
      s.writeHead(200, { 'Content-Type': type + (text ? '; charset=utf-8' : ''), 'Cache-Control': 'no-store' });
      s.end(body);
    }).listen(port, () => res(server));
  });
}

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
/** @returns {Promise<import('puppeteer-core').Browser>} */
export function browser() {
  /* The live project's hosts lead nowhere, so a page whose emulator hookup
     fails cannot reach live data; it fails loudly instead. */
  const live = ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firestore.googleapis.com', 'firebasestorage.googleapis.com', '*.firebaseio.com', '*.cloudfunctions.net', '*.run.app'];
  return puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: path.join(os.tmpdir(), 'stage2-' + process.pid + '-' + Date.now()),
    args: ['--no-first-run', '--host-resolver-rules=' + live.map((h) => 'MAP ' + h + ' ~NOTFOUND').join(', ')] });
}

/**
 * A synthetic person: sign-in (email verified), users record and address-book
 * entry. p: { key, name, email?, teams, adminFor?, master?, minor?, extra? }
 * @returns {Promise<object>} p with uid and member
 */
export async function person(p) {
  const email = p.email || p.key + '@example.invalid';
  let up = JSON.parse((await req(PORTS.auth, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email, password: PW, returnSecureToken: true })).body || '{}');
  if (!up.localId) up = JSON.parse((await req(PORTS.auth, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email, password: PW, returnSecureToken: true })).body || '{}');
  const uid = up.localId, member = 'ab_' + p.key;
  /* In a church, the sign-in carries it (functions/hq-directory.js's claim). */
  await req(PORTS.auth, 'POST', '/identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:update', Object.assign({ localId: uid, emailVerified: true }, CHURCH() ? { customAttributes: JSON.stringify({ churches: [CHURCH()] }) } : {}), OWNER);
  await put('addressBook/' + member, Object.assign({ name: p.name, email, markers: p.teams || [], adminFor: p.adminFor || [], churchMember: true, archived: false, isMinor: !!p.minor }, p.book || {}));
  /* What the server keeps on the record for the rules (functions/core-teams.js). */
  const teams = p.teams || [], covers = coversFor(teams, DEFAULT_CORES), tj = { map: null, set: {} };
  await put('users/' + uid, Object.assign({ uid, email, name: p.name, memberId: member, status: 'active', linkedBy: 'admin', teams, adminFor: p.adminFor || [],
    masterAdmin: !!p.master, attender: true, churchMember: true, covers, adminCovers: coversFor(p.adminFor || [], DEFAULT_CORES),
    shares: sharesFor(teams, tj), jobs: jobsFor(teams, covers, tj) }, p.extra || {}));
  return Object.assign({}, p, { email, uid, member });
}

/** Opens url signed in as p (signing in on the first page it loads). */
export async function signIn(page, base, p, url) {
  if (url && CHURCH()) url += (url.includes('?') ? '&' : '?') + 'church=' + CHURCH();
  await page.goto(base + '/__signin.html' + (CHURCH() ? '?church=' + CHURCH() : '?church=egbc'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EGBCAuth && window.firebase && firebase.auth(EGBCAuth.app), { timeout: 30000 });
  await page.evaluate((e, pw) => firebase.auth(EGBCAuth.app).signOut().then(() => firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(e, pw)).then(() => 1), p.email, PW);
  if (url) await page.goto(base + '/' + url, { waitUntil: 'domcontentloaded' });
}
