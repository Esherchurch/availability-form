/* Every v2 page loads without throwing - before and after a change.
   Events window. Synthetic admin, events emulators only.

     npm i --no-save puppeteer-core
     npx firebase emulators:exec --config firebase.events.json --only auth,firestore \
       --project egbc-worship-planner "node screenshots/events/pages-smoke.mjs <folder> <label>"

   <folder> is the v2 folder to serve on localhost:5601 (default: this v2).
   Run it on a copy of the code before the change and on the code after,
   and compare: a page that throws after but not before is a regression.

   SAFETY. Any request to the live Google services (Firestore, Auth, Storage)
   is blocked and counted. Pages that open their own Firebase app, or another
   project, are not loaded at all - see check-firebase-apps.mjs. Nothing is
   clicked: pages are opened and read, never saved. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = path.resolve(HERE, '..', '..');
const DIR = path.resolve(process.argv[2] || SELF);
const LABEL = process.argv[3] || 'run';
const PROJECT = 'egbc-worship-planner';
const cfg = JSON.parse(fs.readFileSync(path.join(SELF, 'firebase.events.json'), 'utf8'));
if (cfg.emulators.firestore.port !== 8182 || cfg.emulators.auth.port !== 9098) throw new Error('Not the events emulators.');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/* Out of scope (NEXT-BRIEF §4) or opening their own Firebase app. */
const SKIP = new Set(['mix-analyser.html', 'mix-builder.html', 'mix-player.html', 'studio.html', 'worshiphubapp.html',
  'trainingbatchimporter.html', 'trainingmusicdatabase.html', 'trainingportalhub.html', 'trainingrotaplanner.html',
  'training Sunday planner.html', 'data-tools.html']);
const pages = fs.readdirSync(DIR).filter(f => f.endsWith('.html') && !SKIP.has(f))
  .filter(f => !/initializeApp\s*\(/.test(fs.readFileSync(path.join(DIR, f), 'utf8'))).sort();

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(DIR, p === '/' ? 'index.html' : p);
  if (!f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));

const env = await initializeTestEnvironment({ projectId: PROJECT,
  firestore: { rules: fs.readFileSync(path.join(SELF, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8182 } });
await env.clearFirestore();
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const email = 'smoke.admin@example.invalid';
const uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'addressBook', 'm_smoke'), { name: 'Smoke Admin', email, markers: ['Core Team'], adminFor: [], masterAdmin: true });
  await setDoc(doc(db, 'users', uid), { memberId: 'm_smoke', linkedBy: 'admin', name: 'Smoke Admin', email,
    teams: ['Core Team'], adminFor: [], masterAdmin: true, status: 'active' });
});

const stamp = JSON.parse(fs.readFileSync(path.join(DIR, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-smoke-')), args: ['--no-first-run'] });
/* Judged on the server name: the emulators' own addresses carry the same
   words in their path (localhost:9098/identitytoolkit.googleapis.com/...). */
const LIVE = /(^|\.)(firestore|identitytoolkit|securetoken|firebasestorage|firebaseinstallations)\.googleapis\.com$|\.run\.app$/;
let blocked = [];
async function open(url) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1100, height: 900 });
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + stamp);
  await p.setRequestInterception(true);
  p.on('request', r => { if (LIVE.test(new URL(r.url()).hostname)) { blocked.push(url.split('/').pop() + ' -> ' + new URL(r.url()).hostname); r.abort(); } else r.continue(); });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e.message).split('\n')[0].slice(0, 160)));
  try { await p.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }); } catch (e) { errs.push('load: ' + e.message.split('\n')[0]); }
  await new Promise(r => setTimeout(r, 1200));
  return { p, errs };
}

/* Sign in once; the session carries to every page in this browser. */
{
  const { p } = await open('http://localhost:5601/whatson.html');
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  const host = await p.evaluate(() => EGBCAuth.db._delegate._settings.host);
  if (host !== 'localhost:8182') throw new Error('Not on the events emulator: ' + host);
  await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), email);
  await p.close();
}

const out = {};
for (const f of pages) {
  const { p, errs } = await open('http://localhost:5601/' + encodeURI(f));
  out[f] = errs;
  await p.close();
}
await browser.close();
await env.cleanup();
server.close();

const bad = Object.keys(out).filter(k => out[k].length);
fs.writeFileSync(path.join(os.tmpdir(), 'egbc-smoke-' + LABEL + '.json'), JSON.stringify(out, null, 1));
console.log(LABEL + ': ' + pages.length + ' pages loaded, ' + (pages.length - bad.length) + ' without an error, ' +
  blocked.length + ' requests to live services blocked');
const tally = {}; blocked.forEach(b => { tally[b] = (tally[b] || 0) + 1; });
Object.keys(tally).sort().forEach(k => console.log("  blocked: " + k + " x" + tally[k]));
bad.forEach(k => console.log('  ' + k + ': ' + out[k].join(' | ')));
console.log('RESULT ' + path.join(os.tmpdir(), 'egbc-smoke-' + LABEL + '.json'));
