/* Is the Menu the one Martin approved, and does each person see their part?
 *
 *   node tests/check-menu.mjs             (from v2/, emulators running)
 *   node tests/check-menu.mjs --shots     and save a picture of each
 *
 * WHY. Martin could not find things. v2's Menu grouped pages by team, which is
 * not how anybody looks for anything, listed the same pages twice under
 * "Apps", and offered two pages that are only ever opened from inside the
 * Sunday Service Planner as if they were places to go. NEXT-BRIEF §16 has the
 * structure he approved, taken from the portal the church actually uses.
 *
 * This reads the Menu as three different people and checks three things:
 *   the names and the order are exactly the approved ones
 *   each person sees their part and not somebody else's
 *   the things that were taken out stay out
 *
 * Synthetic throughout: one invented account, whose teams are rewritten
 * between the three readings.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';

const V2 = path.resolve('.');
const SHOTS = path.join(V2, 'tests', 'shots');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9627, SERVE = 8868;
const PROJECT = 'egbc-worship-planner';
const wantShots = process.argv.includes('--shots');
const ACCOUNT = {
  email: process.env.EGBC_EMU_EMAIL || 'places.tester@example.invalid',
  pw: process.env.EGBC_EMU_PW || 'test-only-password'
};

/* The approved structure, written out again here on purpose. If this file and
   egbc-menu.js were the same list, the check would only be proving that a list
   equals itself. This is NEXT-BRIEF §16, copied by hand. */
const APPROVED = [
  ['Dashboard'],
  ['Rota'],
  ['Meetings'],
  ["What's on"],
  ['Hire our rooms'],
  ['Worship & AV', [
    ['Worship', [['Play-Through'], ['Worship Training'],
      ['Music Databases', [['Music Database'], ['Music Uploader']]]]],
    ['AV', [['How-To AV'], ['AV Troubleshoot'],
      ['Equipment', [['Inventory'], ['AV Infrastructure Mapper'], ['Monitor Setup']]]]]
  ]],
  ['Youth', [['Youth Service Planner']]],
  ['Core Team', [
    ['Planning', [['Rota Planner'], ['Sunday Service Planner'], ['Availability form']]],
    ['People and email', [['Address Book'], ['Email Compiler']]],
    ['Music', [['Music Upload']]],
    ['Events and rooms', [['Events'], ['Places']]],
    ['Admin', [['Backup & Restore']]]
  ]],
  ['Resources', [["Idea's pin board"], ['Apps and downloads'], ['Team Resources'], ['Team Videos']]]
];

/* Taken out, and they must stay out.
   `exact` ones are compared against a heading's own words, not searched for in
   the page's text: "Apps" is inside "Apps and downloads", which is a real
   entry, and searching for the shorter one reported the longer one as a fault. */
const GONE_HEADINGS = ['Apps'];
const GONE_ANYWHERE = ['Song Library - quick view', 'Song Summary', 'Worship & AV Hub (old)',
  'sundayplannersonglibrary', 'song-summary.html'];

/* Which of those names are gated, written out here rather than read from the
   structure, for the same reason the structure is: a check that asks the code
   what the answer should be is not a check. */
const CORE_ONLY = ['Core Team', 'Planning', 'Rota Planner', 'Sunday Service Planner',
  'Availability form', 'People and email', 'Address Book', 'Email Compiler', 'Music',
  'Music Upload', 'Events and rooms', 'Events', 'Places', 'Admin', 'Backup & Restore'];
const ADMIN_ONLY = ['Events and rooms', 'Events', 'Places', 'Admin', 'Backup & Restore'];

const PEOPLE = {
  'a Worship member': { teams: ['Worship Team'], adminFor: [], masterAdmin: false,
    sees: ['Worship & AV', 'Youth', 'Resources'], doesNot: ['Core Team'] },
  'somebody on Core Team': { teams: ['Core Team'], adminFor: [], masterAdmin: false,
    sees: ['Core Team', 'Planning', 'People and email'], doesNot: ['Events and rooms', 'Admin'] },
  'a master admin': { teams: ['Core Team'], adminFor: ['Core Team'], masterAdmin: true,
    sees: ['Core Team', 'Events and rooms', 'Admin', 'Backup & Restore'], doesNot: [] }
};

const flat = (nodes, out = []) => {
  for (const [title, kids] of nodes) { out.push(title); if (kids) flat(kids, out); }
  return out;
};

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')); };

const rest = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: 'localhost', port: 8181, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej); req.end(data);
});
const val = (v) => Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) };

const SIGNIN = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="egbc-auth.js"></script></head><body>sign-in harness</body></html>`;
const NO_SW = `<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>`;
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

/* The Menu as a tree of titles, read off the drawn page. */
const READ_MENU = `(() => {
  const el = document.getElementById('toolList');
  if (!el) return JSON.stringify({ error: 'no toolList' });
  const titles = [];
  /* A group heading is a <span> when it is only a heading and an <a class=
     "grp-link"> when it is also a page. Reading only the spans lost Worship &
     AV, Youth and Core Team - the three that open a charter - and reported
     them as missing from the Menu they were sitting in. */
  el.querySelectorAll('.grp > span:not(.arw):not(.dot):not(.cnt), .grp .grp-link, .grp-body .sub, .grp-body .tool .nm, .tool > .tx > .nm')
    .forEach(n => { const t = (n.textContent || '').trim(); if (t) titles.push(t); });
  /* top-level pages that are not in a group are plain .tool children of #toolList */
  const top = [...el.children].filter(c => c.classList && c.classList.contains('tool'))
    .map(a => (a.querySelector('.nm') || {}).textContent || '').map(s => s.trim()).filter(Boolean);
  return JSON.stringify({ titles, top, text: (el.innerText || '').replace(/\\s+/g, ' ').trim() });
})()`;

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });
  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('not found'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const head = /<head[^>]*>/i.exec(t);
      body = Buffer.from(head ? t.slice(0, head.index + head[0].length) + NO_SW + t.slice(head.index + head[0].length) : NO_SW + t, 'utf8');
    }
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-menu-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
  const ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); return; }
    if (watch.handle(m)) return;
    if (m.method === 'Fetch.requestPaused') {
      const u = m.params.request.url || '';
      if (offMachine(u)) return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1100, deviceScaleFactor: 1, mobile: false });
  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };

  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(4000);
  await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' +
    JSON.stringify(ACCOUNT.email) + ',' + JSON.stringify(ACCOUNT.pw) + ')', true);
  const uid = await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""');
  if (!uid) { console.error('Could not sign in as ' + ACCOUNT.email); server.close(); chrome.kill(); process.exit(2); }

  const want = flat(APPROVED);
  console.log('the approved structure has ' + want.length + ' names\n');

  for (const [label, p] of Object.entries(PEOPLE)) {
    /* Rewrite who this person is, then reload the hub. */
    await rest('PATCH', `/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}`, {
      fields: {
        uid: val(uid), email: val(ACCOUNT.email), name: val('Menu Tester'),
        memberId: val('ab_tester'), linkedBy: val('admin'), status: val('active'),
        teams: val(p.teams), adminFor: val(p.adminFor), masterAdmin: val(p.masterAdmin)
      }
    });
    watch.reset();
    await send('Page.navigate', { url: 'about:blank' }); await sleep(400);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/hub.html' }); await sleep(12000);
    await ev('window.alert=()=>{};window.confirm=()=>false;1');
    /* Somebody on several teams is asked which one first. Answer it, or the
       picture is of the question rather than of the Menu. */
    await ev("(()=>{const b=document.querySelector('#pickList .pick-t');if(b){b.click();return 'chose a team'}return 'no picker'})()");
    await sleep(1200);
    await ev("(()=>{try{openTools()}catch(e){const el=document.getElementById('panel');if(el)el.classList.add('open')}})();1");
    /* Open every group, so the whole structure can be read at once. */
    await ev("document.querySelectorAll('.grp:not(.open)').forEach(b=>b.click());1");
    await sleep(1800);

    const raw = await ev(READ_MENU);
    let menu; try { menu = JSON.parse(raw || '{}'); } catch { menu = { error: String(raw).slice(0, 80) }; }
    const seen = menu.titles || [];

    console.log('\n' + label + '  (' + p.teams.join(', ') + (p.masterAdmin ? ', master admin' : '') + ')');
    ok('  everything they should see is there',
      p.sees.every(s => seen.includes(s)),
      p.sees.filter(s => !seen.includes(s)).join(', ') || p.sees.join(', ') + ' - all there');
    ok('  and nothing they should not',
      p.doesNot.every(s => !seen.includes(s)),
      p.doesNot.filter(s => seen.includes(s)).join(', ') || (p.doesNot.length ? p.doesNot.join(', ') + ' - none of them' : 'nothing is kept from a master admin'));
    /* The approved list, cut down to what this person may see, compared with
       what is on the screen - name for name, in order. Comparing two lists
       that had both been filtered by "is it on the screen" was no test at all:
       it could only ever agree with itself. */
    const expected = want.filter(w => !(CORE_ONLY.includes(w) && !p.teams.includes('Core Team')))
                         .filter(w => !(ADMIN_ONLY.includes(w) && !p.adminFor.length && !p.masterAdmin));
    ok('  the names are the approved ones, in order',
      JSON.stringify(seen) === JSON.stringify(expected),
      JSON.stringify(seen) === JSON.stringify(expected)
        ? expected.length + ' names, in order'
        : 'on screen: ' + seen.join(' > ').slice(0, 150) + '\n          approved : ' + expected.join(' > ').slice(0, 150));
    const stillHere = GONE_HEADINGS.filter(g => seen.includes(g))
      .concat(GONE_ANYWHERE.filter(g => (menu.text || '').toLowerCase().includes(g.toLowerCase())));
    ok('  the things taken out stay out', stillHere.length === 0,
      stillHere.join(', ') || 'the Apps group, the song library quick view, Song Summary and "(old)" are all gone');
    /* One structure, not two: the sidebar's "What you look after" must hold
       the admin pages the Menu holds, in the Menu's order. It used to come
       from the registry sorted alphabetically, which is a second arrangement
       of the same pages - the thing Step N exists to stop. */
    const sidebar = String(await ev(
      "(()=>{const el=document.getElementById('sidebar');if(!el)return '';" +
      "const i=[...el.children].findIndex(c=>c.className==='sgrp');" +
      "return i===-1?'':[...el.children].slice(i+1).map(a=>(a.textContent||'').trim()).join('|')})()"));
    const wantAdmin = ADMIN_ONLY.filter(a => !['Events and rooms', 'Admin'].includes(a))
      .filter(() => p.masterAdmin || p.adminFor.length);
    ok('  the sidebar lists what they look after, in the Menu\'s order',
      p.masterAdmin || p.adminFor.length
        ? sidebar === wantAdmin.join('|')
        : sidebar === '',
      (p.masterAdmin || p.adminFor.length)
        ? 'sidebar: ' + (sidebar || '(nothing)') + '   menu order: ' + wantAdmin.join('|')
        : 'nothing to look after, and nothing listed');

    ok('  nothing on the console', watch.errors.length === 0, watch.summary());

    if (wantShots) {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      if (r.data) fs.writeFileSync(path.join(SHOTS, 'menu--' + label.replace(/[^a-z0-9]+/gi, '-') + '.png'),
        Buffer.from(r.data, 'base64'));
    }
  }

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
