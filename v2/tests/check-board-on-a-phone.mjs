/* The pin board on a phone: small post-its, and one note filling the screen.
 *
 *   node tests/check-board-on-a-phone.mjs            (from v2/, emulators up)
 *   node tests/check-board-on-a-phone.mjs --shots    (the 375px pairs)
 *
 * APP-DESIGN-BRIEF 7f, from Martin: "you have a small version of whatever
 * the card is, but when you press on it it fills the phone screen so you
 * can read it or add to it etc. So keep post-its but you can make them
 * much smaller and as people tap they get bigger."
 *
 * Before this, stickynotes.html at 375px was a 3200x2400 canvas with one
 * note on screen and a finger to pan it with.
 *
 * WHAT IS PROVED HERE, in the brief's own order:
 *   - every note is reachable at 375px without panning sideways
 *   - two small post-its per row, newest first
 *   - a note with a video shows its thumbnail on the small one
 *   - tapping one fills the screen, and the YouTube player is in place
 *   - a comment is added, and a SECOND team member sees it
 *   - somebody off the team cannot read the comments
 *   - swiping moves to the next note
 *   - the corkboard on a computer is unchanged
 *
 * Who can comment is proved in firestore-rules.test.mjs, including that a
 * young person cannot. This is about the screens.
 *
 * Synthetic throughout: two invented worship-team people, one invented
 * person on no team, and notes that say they are synthetic.
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
const PORT = 9717, SERVE = 8933;
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';

const PEOPLE = {
  /* A leader of the board: they get Edit, Archive and Remove. */
  lead: { email: 'board.lead@example.invalid', name: 'Board Lead Synthetic',
          member: 'ab_board_lead', teams: ['Worship Team'], adminFor: ['Worship Team'] },
  /* On the team, not a leader: comments, and sees the leader's. */
  mate: { email: 'board.mate@example.invalid', name: 'Board Mate Synthetic',
          member: 'ab_board_mate', teams: ['Worship Team'], adminFor: [] },
  /* On no team at all: must not be able to read the comments. */
  outsider: { email: 'board.out@example.invalid', name: 'Outsider Synthetic',
              member: 'ab_board_out', teams: [], adminFor: [] },
};

/* Three notes, oldest first in the array. NEWEST must come out first on
   the phone, so the order here is deliberately the reverse of what the
   screen should show. */
const T_OLD = 'Synthetic oldest idea';
const T_MID = 'Synthetic middle idea with a video';
const T_NEW = 'Synthetic newest idea';
const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const COMMENT = 'Synthetic comment: we could do this in Bb';

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : '')));
};

const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const fsReq = (m, p, b) => req(8181, m, p, b, { Authorization: 'Bearer owner' });
const val = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, obj) => fsReq('PATCH', DOCS + '/' + p, { fields: fields(obj) });
const runQuery = (b) => fsReq('POST', DOCS + ':runQuery', b);

const commentsOn = async (noteId) => {
  const r = await runQuery({ structuredQuery: {
    from: [{ collectionId: 'boardComments' }],
    where: { compositeFilter: { op: 'AND', filters: [
      { fieldFilter: { field: { fieldPath: 'boardId' }, op: 'EQUAL', value: { stringValue: 'state' } } },
      { fieldFilter: { field: { fieldPath: 'noteId' }, op: 'EQUAL', value: { stringValue: noteId } } },
    ] } } } });
  let rows = [];
  try { rows = JSON.parse(r.body || '[]'); } catch { rows = []; }
  return rows.filter(x => x && x.document).map(x => x.document);
};

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

const now = Date.now();
const NOTES = [
  { id: 'nph_old', pageId: 'main', cat: 'general', title: T_OLD,
    body: 'The oldest of the three, so it must come last on a phone.',
    author: 'Board Lead Synthetic', ytUrl: '', link: '', linkLabel: '', imgUrl: '',
    reactions: { love: 2 }, myReactions: {}, createdAt: now - 3 * 86400000,
    archived: false, x: 60, y: 60, rot: -2, zIndex: 11 },
  { id: 'nph_mid', pageId: 'main', cat: 'song', title: T_MID,
    body: 'This one has a video on it, so the small post-it shows a thumbnail.',
    author: 'Board Mate Synthetic', ytUrl: YT, link: '', linkLabel: '', imgUrl: '',
    reactions: {}, myReactions: {}, createdAt: now - 2 * 86400000,
    archived: false, x: 370, y: 60, rot: 1, zIndex: 12 },
  { id: 'nph_new', pageId: 'main', cat: 'event', title: T_NEW,
    body: 'The newest, so it must come first on a phone.',
    author: 'Board Lead Synthetic', ytUrl: '', link: 'https://example.invalid/plan',
    linkLabel: 'The plan', imgUrl: '',
    reactions: {}, myReactions: {}, createdAt: now - 86400000,
    archived: false, x: 680, y: 60, rot: 0, zIndex: 13 },
];

async function seed() {
  await put('worshipBoardState/state', {
    pages: [{ id: 'main', title: 'General Board', desc: '' }],
    notes: NOTES,
  });
  /* NO COMMENTS TO START WITH, on any of the three, so "a comment is
     added and a second person sees it" is about this run.

     The first version cleared only nph_new while the check comments on
     nph_mid, so every run left one behind: by the sixth the count beside
     the note read 6 and the assertion that it should read 1 is what
     noticed. Had that assertion been "more than none" it would still be
     passing and the fixture would still be filling up. */
  for (const noteId of ['nph_old', 'nph_mid', 'nph_new']) {
    for (const d of await commentsOn(noteId)) {
      await fsReq('DELETE', '/v1/' + d.name.split('/v1/').pop());
    }
  }
  for (const [, p] of Object.entries(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    /* linkedBy admin, and the address book agreeing, or refreshFromBook
       puts the teams back as the book has them. */
    await put('users/' + p.uid, {
      uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active',
      linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor, masterAdmin: false,
      attender: true, churchMember: true });
    await put('addressBook/' + p.member, {
      name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor,
      churchMember: true, archived: false, isMinor: false });
  }
}

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });
  await seed();

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const h = /<head[^>]*>/i.exec(t);
      body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript'
      : e === '.css' ? 'text/css' : e === '.json' ? 'application/json'
      : e === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-board-phone-' + process.pid),
    '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  /* https:// only: pausing http breaks Firestore's stream (A-062). */
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  const ev = makeEval(send, 'board-on-a-phone');

  const phone = () => send('Emulation.setDeviceMetricsOverride',
    { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  const desktop = () => send('Emulation.setDeviceMetricsOverride',
    { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  const signInAs = async (key) => {
    const p = PEOPLE[key];
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await sleep(2500);
    await ev('firebase.auth(EGBCAuth.app).signOut()', true);
    await sleep(300);
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
      + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ')', true);
    await sleep(800);
    const uid = String(await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""'));
    if (uid !== p.uid) {
      console.error('Could not sign in as ' + p.email + ' (got ' + uid + ')');
      server.close(); chrome.kill(); process.exit(2);
    }
  };

  const until = async (label, expr, tries = 40) => {
    let last = '';
    for (let i = 0; i < tries; i++) {
      await sleep(500);
      last = String(await ev(expr));
      if (last === 'yes') break;
    }
    ok(label, last === 'yes', last);
    return last === 'yes';
  };

  const openBoard = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/stickynotes.html' });
    return until('  the board loaded',
      '(function(){ if (document.body && document.body.getAttribute("data-egbc-blocked")) return "blocked";'
      + ' return (typeof renderNotes === "undefined") ? "no" : "yes"})()', 60);
  };

  const shot = async (name) => {
    if (!wantShots) return;
    const r = await send('Page.captureScreenshot', { format: 'png' });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'board7f--' + name + '.png'),
      Buffer.from(r.data, 'base64'));
  };

  /* ---- 1. the small post-its at 375px ---------------------------- */
  console.log('\nthe board at 375px');
  await signInAs('lead');
  await phone();
  watch.reset();
  await openBoard();
  await until('  the phone layout is the one on screen, not the corkboard',
    '(function(){var p=document.getElementById("phoneBoard");'
    + 'var c=document.querySelector(".board-outer");'
    + 'if(!p||p.hidden)return "phone board hidden";'
    + 'return getComputedStyle(c).display === "none" ? "yes" : "corkboard still shown"})()', 40);
  await until('  all three notes are on it',
    '(function(){return document.querySelectorAll("#pbGrid .pb-note").length === 3'
    + ' ? "yes" : String(document.querySelectorAll("#pbGrid .pb-note").length)})()', 40);

  /* NEWEST FIRST, by name rather than by position in the array. */
  const order = String(await ev('(function(){'
    + 'return [].slice.call(document.querySelectorAll("#pbGrid .pb-note .pb-title"))'
    + '.map(function(e){return e.textContent.trim()}).join(" || ")})()'));
  ok('  newest first', order.indexOf(T_NEW) === 0
    && order.indexOf(T_MID) > 0 && order.indexOf(T_OLD) > order.indexOf(T_MID), order);

  /* TWO PER ROW, measured off where they actually are rather than off
     the CSS: a grid-template-columns that says 1fr 1fr proves nothing
     if something else is overriding it. */
  const rows = JSON.parse(String(await ev('(function(){'
    + 'var ns=[].slice.call(document.querySelectorAll("#pbGrid .pb-note"));'
    + 'var tops={};ns.forEach(function(n){var t=Math.round(n.getBoundingClientRect().top/10)*10;'
    + 'tops[t]=(tops[t]||0)+1});'
    + 'return JSON.stringify({perRow:Object.keys(tops).map(function(k){return tops[k]}),n:ns.length})})()')));
  ok('  two small post-its per row', rows.perRow[0] === 2, JSON.stringify(rows));

  /* NO SIDEWAYS PANNING, measured against the 375 asked for and not
     against innerWidth - the hub's notices taught that one. */
  const wide = JSON.parse(String(await ev('(function(){'
    + 'var out={vw:window.innerWidth,doc:Math.round(document.documentElement.scrollWidth),over:[]};'
    + 'var all=[].slice.call(document.querySelectorAll("#phoneBoard *"));'
    + 'for(var i=0;i<all.length;i++){var r=all[i].getBoundingClientRect();'
    + 'if(r.width<=376&&r.right<=376)continue;'
    + 'out.over.push((all[i].className||all[i].tagName)+" "+Math.round(r.width)+"px");'
    + 'if(out.over.length>=4)break}'
    + 'return JSON.stringify(out)})()')));
  ok('  the phone is still 375px wide once it has laid out', wide.vw === 375, 'innerWidth ' + wide.vw);
  ok('  every note is reachable without panning sideways',
    wide.doc <= 376, wide.doc + 'px of page in 375px');
  ok('  and nothing on the board is wider than the phone',
    wide.over.length === 0, wide.over.join('; '));

  /* The video note shows a thumbnail, as the How To cards do. */
  const thumb = String(await ev('(function(){'
    + 'var n=[].slice.call(document.querySelectorAll("#pbGrid .pb-note")).filter(function(e){'
    + 'return e.textContent.indexOf(' + JSON.stringify(T_MID) + ') !== -1})[0];'
    + 'if(!n)return "(note not found)";var i=n.querySelector(".pb-thumb");'
    + 'return i?i.getAttribute("src"):"(no thumbnail)"})()'));
  ok('  a note with a video shows a thumbnail on the small post-it',
    /i\.ytimg\.com\/vi\/dQw4w9WgXcQ/.test(thumb), thumb);
  /* REACHABLE MEANS REACHABLE, not merely present in the page.
     Everything above measured widths, and a post-it hidden underneath
     the page's fixed header is exactly the right width - the 375px
     screenshot is what showed the top row tucked behind the bars with
     "Add an idea" off the screen altogether. So the first note and the
     button are now asked whether a finger would land on them. */
  const reach = JSON.parse(String(await ev('(function(){'
    + 'var out={};'
    + 'var add=document.getElementById("pbAdd");'
    + 'var n=document.querySelector("#pbGrid .pb-note");'
    + 'function hit(e){ if(!e) return "missing";'
    + ' var r=e.getBoundingClientRect();'
    + ' if(r.top<0||r.bottom>window.innerHeight) return "off screen at top "+Math.round(r.top);'
    + ' var m=document.elementFromPoint(Math.round(r.left+r.width/2), Math.round(r.top+8));'
    + ' return (m && (m===e || e.contains(m))) ? "yes"'
    + '   : "covered by " + (m ? (m.id||m.className||m.tagName) : "nothing"); }'
    + 'out.add=hit(add); out.note=hit(n);'
    + 'return JSON.stringify(out)})()')));
  ok('  "Add an idea" is on screen and tappable, not under the header',
    reach.add === 'yes', JSON.stringify(reach));
  ok('  and so is the first post-it', reach.note === 'yes', JSON.stringify(reach));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  await shot('grid-375');

  /* ---- 2. tap one: it fills the screen --------------------------- */
  console.log('\ntapping a note');
  watch.reset();
  await ev('(function(){var n=[].slice.call(document.querySelectorAll("#pbGrid .pb-note"))'
    + '.filter(function(e){return e.textContent.indexOf(' + JSON.stringify(T_MID) + ') !== -1})[0];'
    + 'if(n)n.click();return "tapped"})()');
  await until('  it fills the screen',
    '(function(){var s=document.getElementById("noteSheet");'
    + 'if(!s||s.hidden)return "not open";var r=s.getBoundingClientRect();'
    + 'return (r.width >= 374 && r.height >= 700) ? "yes" : Math.round(r.width)+"x"+Math.round(r.height)})()', 30);
  /* FILLS THE SCREEN MEANS FILLS IT. "it fills the screen" above measures
     the sheet's own box, which was already 375x812 while the shared site
     bar still sat on top of it - visible in the screenshot, invisible to
     that assertion. So this asks what is actually painted at the very
     top of the screen. */
  ok('  with nothing of the page left showing over it',
    String(await ev('(function(){var e=document.elementFromPoint(187,8);'
      + 'var s=document.getElementById("noteSheet");'
      + 'return (e && s && (e===s || s.contains(e))) ? "yes"'
      + ' : "showing through: " + (e ? (e.id || e.className || e.tagName) : "nothing")})()')) === 'yes',
    String(await ev('(function(){var e=document.elementFromPoint(187,8);'
      + 'return e ? (e.id || e.className || e.tagName) : "nothing"})()')));
  const sheet = String(await ev('(function(){var s=document.getElementById("noteSheetInner");'
    + 'return s?s.textContent.replace(/\\s+/g," ").trim():"(nothing)"})()'));
  ok('  with the whole of what it says', sheet.indexOf('thumbnail') !== -1, sheet.slice(0, 200));
  const player = String(await ev('(function(){var f=document.querySelector("#noteSheet iframe.ns-yt");'
    + 'return f?f.getAttribute("src"):"(no player)"})()'));
  ok('  and the video playing in place, not on YouTube\u2019s site',
    /youtube\.com\/embed\/dQw4w9WgXcQ/.test(player), player);
  ok('  the reactions are offered by name',
    /Love it/.test(sheet) && /Not sure/.test(sheet), sheet.slice(0, 240));
  /* A LEADER'S BUTTONS ARE VISIBLE, not behind a "...". */
  const acts = JSON.parse(String(await ev('(function(){'
    + 'var b=[].slice.call(document.querySelectorAll("#noteSheet .ns-acts button"));'
    + 'return JSON.stringify(b.map(function(x){return x.textContent.trim()}))})()')));
  ok('  Archive and Remove are visible buttons for a leader',
    acts.some(a => /Archive/.test(a)) && acts.some(a => /Remove/.test(a)), JSON.stringify(acts));
  await shot('note-375');

  /* ---- 3. a comment, and a second person sees it ----------------- */
  console.log('\ncomments');
  const before = (await commentsOn('nph_mid')).length;
  /* TYPED INTO THE BOX AND THE BUTTON PRESSED, rather than calling the
     function behind it. The first version called sendComment(), which
     stopped existing the moment the screen moved into
     egbc-board-phone.js - and a check that calls internals is testing
     the shape of the code rather than what somebody can do. */
  await ev('(function(){var b=document.querySelector("#noteSheet [data-bp-box]");'
    + 'if(!b)return "no box";b.value=' + JSON.stringify(COMMENT) + ';return "typed"})()');
  await ev('(function(){var b=document.querySelector("#noteSheet [data-bp=\\"send\\"]");'
    + 'if(!b)return "no button";b.click();return "sent"})()');
  await sleep(2500);
  const after = await commentsOn('nph_mid');
  ok('  the comment is written, as its own document',
    after.length === before + 1, after.length + ' comments on that note');
  const stored = JSON.stringify(after.map(d => d.fields || {}));
  ok('  and it is NOT inside the board document',
    !/Synthetic comment/.test(String((await fsReq('GET', DOCS + '/worshipBoardState/state')).body)),
    'the board document now contains the comment text');
  ok('  it carries the board, the note and who wrote it',
    /"state"/.test(stored) && /nph_mid/.test(stored) && /Board Lead Synthetic/.test(stored),
    stored.slice(0, 240));
  await until('  and it is on the screen',
    '(function(){var h=document.getElementById("nsComments");'
    + 'return h && h.textContent.indexOf("we could do this in Bb") !== -1 ? "yes" : "no"})()', 30);

  /* A SECOND TEAM MEMBER SEES IT - which is the brief's own proof, and
     the thing a single-person check would miss entirely. */
  await signInAs('mate');
  await phone();
  watch.reset();
  await openBoard();
  await until('  a second person on the team opens the same note',
    '(function(){var ns=[].slice.call(document.querySelectorAll("#pbGrid .pb-note"))'
    + '.filter(function(e){return e.textContent.indexOf(' + JSON.stringify(T_MID) + ') !== -1});'
    + 'if(!ns.length)return "no";ns[0].click();'
    + 'return document.getElementById("noteSheet").hidden ? "did not open" : "yes"})()', 40);
  await until('  and sees the first person\u2019s comment',
    '(function(){var h=document.getElementById("nsComments");'
    + 'return h && h.textContent.indexOf("we could do this in Bb") !== -1 ? "yes" : "no"})()', 30);
  /* WHAT THEY GET AND WHAT THEY DO NOT, as two separate questions.
     The first version of this asked for NO buttons at all and failed,
     finding "Edit" - and the code was right and the assertion wrong:
     this note is theirs, and the brief says "Edit, for the person who
     posted it (and leaders)". Archive and Remove are the leaders' ones.
     An assertion of "none" would also have passed if the whole row had
     silently failed to draw, which is the worse reason to be green. */
  const mateActs = JSON.parse(String(await ev('(function(){'
    + 'return JSON.stringify([].slice.call('
    + 'document.querySelectorAll("#noteSheet .ns-acts button")).map(function(b){'
    + 'return b.textContent.trim()}))})()')));
  ok('  is offered Edit, because this note is theirs',
    mateActs.some(a => /Edit/.test(a)), JSON.stringify(mateActs));
  ok('  but NOT Archive or Remove, not being a leader',
    !mateActs.some(a => /Archive|Remove|Put back/.test(a)), JSON.stringify(mateActs));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* ---- 4. swiping between notes ---------------------------------- */
  console.log('\nswiping');
  const titleNow = () => ev('(function(){var h=document.querySelector("#noteSheet .ns-title");'
    + 'return h?h.textContent.trim():"(none)"})()');
  const was = String(await titleNow());
  /* A real touch sequence through the debugger, not a call to stepNote:
     the point is that a FINGER moves between notes.

     y=200 IS ON THE WORDS, and that matters. The first version swiped at
     y=500, which at 375px is on the reaction buttons - and a swipe that
     starts on a control is ignored on purpose, or tapping "Love it"
     would turn into a swipe. It failed twice and told me only "nothing
     moved"; asking the page what was under the finger
     (elementFromPoint at several heights) is what said BUTTON. */
  const swipe = async (fromX, toX) => {
    /* START ON THE WORDS, found rather than guessed. A fixed y was wrong
       twice: first at y=500 (the reactions), then at y=200 once the
       sheet moved up 66px and that became a button too. The title is
       the one thing on this screen that is certainly not a control. */
    const y = Number(await ev('(function(){var t=document.querySelector("#noteSheet .ns-title");'
      + 'if(!t)return 200;var r=t.getBoundingClientRect();'
      + 'return Math.round(r.top + r.height/2)})()')) || 200;
    await send('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ x: fromX, y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ x: Math.round((fromX + toX) / 2), y: y + 5 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ x: toX, y: y + 5 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(900);
  };
  /* And the other half of that rule, which is what keeps the swipe from
     eating taps: a drag that STARTS on a control moves nothing.

     THE BUTTON IS FOUND, NOT GUESSED AT. This used to start at a fixed
     y=500 because that happened to be on the reactions. It stopped being
     on them the moment the sheet moved up 66px, and the assertion failed
     for a reason that had nothing to do with the rule it was testing. */
  const btnAt = JSON.parse(String(await ev('(function(){'
    + 'var b=document.querySelector("#noteSheet .ns-react button");'
    + 'if(!b)return JSON.stringify({found:false});'
    + 'var r=b.getBoundingClientRect();'
    + 'return JSON.stringify({found:true,x:Math.round(r.left+r.width/2),'
    + 'y:Math.round(r.top+r.height/2),label:b.textContent.trim()})})()')));
  ok('  a reaction button was found to start the drag on', btnAt.found, JSON.stringify(btnAt));
  const beforeCtrl = String(await titleNow());
  if (btnAt.found) {
    /* TOWARDS THE MIDDLE, never off the edge. Dragging 260px left from a
       button that sits near x=105 ended at a negative x, which Chrome
       read as the back gesture: it navigated the page away and the three
       assertions after this one failed reporting a missing sheet. The
       drag only has to be longer than the 60px the swipe needs. */
    const toX = Math.min(345, Math.max(30, btnAt.x + 180));
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: btnAt.x, y: btnAt.y }] });
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round((btnAt.x + toX) / 2), y: btnAt.y + 4 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: toX, y: btnAt.y + 4 }] });
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(700);
  }
  ok('  a drag that starts on a button is not a swipe',
    String(await titleNow()) === beforeCtrl,
    'started on "' + btnAt.label + '" and the note changed when it should not have');
  await swipe(330, 110);
  const afterLeft = String(await titleNow());
  ok('  swiping left moves to the next note', afterLeft !== was && afterLeft !== '(none)',
    'was "' + was + '", now "' + afterLeft + '"');
  /* NOT FROM THE LEFT EDGE. Starting a rightward drag at x=40 is the
     browser's own back gesture, and it took the whole page with it - the
     check reported "(none)" because #noteSheet no longer existed, which
     reads like the sheet breaking rather than a navigation. 90px in is
     clear of it and still 240px of travel. */
  await swipe(110, 330);
  const backAgain = String(await titleNow());
  ok('  and swiping right comes back', backAgain === was,
    'was "' + was + '", now "' + backAgain + '"');

  /* THE PHONE'S BACK BUTTON CLOSES IT, which the brief asks for beside
     the big Close. Done through history rather than by a gesture: the
     gesture is the browser's and varies, the history entry is ours. */
  ok('  the note is open before going back',
    String(await ev('!document.getElementById("noteSheet").hidden')) === 'true');
  await ev('history.back()');
  await sleep(900);
  ok('  and the phone’s back button closes the note',
    String(await ev('(function(){var s=document.getElementById("noteSheet");'
      + 'return !s ? "the page navigated away" : (s.hidden ? "closed" : "still open")})()')) === 'closed');
  ok('  leaving the board itself still on screen',
    String(await ev('(function(){return document.querySelectorAll("#pbGrid .pb-note").length === 3'
      + ' ? "yes" : "no"})()')) === 'yes');

  /* ---- 5. somebody off the team ---------------------------------- */
  console.log('\nsomebody who is not on the team');
  await signInAs('outsider');
  await phone();
  watch.reset();
  const got = String(await ev('(function(){return "pending"})()'));
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/stickynotes.html' });
  await sleep(6000);
  const refused = String(await ev('(function(){'
    + 'var t=document.body?document.body.textContent:"";'
    + 'return t.indexOf("Synthetic comment") === -1 ? "cannot see it" : "CAN SEE IT"})()'));
  ok('  cannot see the comments on a board that is not theirs',
    refused === 'cannot see it', refused + ' ' + got);
  /* And the rules refuse the read outright, not just the screen. */
  const direct = String(await ev('(function(){'
    + 'return firebase.firestore(EGBCAuth.app).collection("boardComments")'
    + '.where("boardId","==","state").where("noteId","==","nph_mid").get()'
    + '.then(function(s){return "read " + s.size})'
    + '.catch(function(e){return "refused:" + e.code})})()', true));
  ok('  and the database refuses them too, not only the page',
    /^refused/.test(direct), direct);

  /* ---- 6. the corkboard on a computer is unchanged --------------- */
  console.log('\nthe corkboard on a computer');
  await signInAs('lead');
  await desktop();
  watch.reset();
  await openBoard();
  await until('  the corkboard is what a computer gets',
    '(function(){var p=document.getElementById("phoneBoard");'
    + 'var c=document.querySelector(".board-outer");'
    + 'if(p && !p.hidden)return "phone layout on a computer";'
    + 'return getComputedStyle(c).display !== "none" ? "yes" : "corkboard hidden"})()', 40);
  await until('  with the notes in their own places, as before',
    '(function(){var n=[].slice.call(document.querySelectorAll("#boardCanvas .note"));'
    + 'if(n.length !== 3)return String(n.length)+" notes";'
    + 'var xs=n.map(function(e){return parseInt(e.style.left,10)});'
    + 'return (xs[0] !== xs[1] && xs[1] !== xs[2]) ? "yes" : "stacked: "+xs.join(",")})()', 40);
  ok('  and they can still be dragged', String(await ev(
    '(function(){var n=document.querySelector("#boardCanvas .note .note-topbar");'
    + 'return n ? "yes" : "no handle"})()')) === 'yes');

  /* COMMENTS ON THE COMPUTER TOO (Martin: "add the comments on the
     computer too"), shown when a note is opened there. The corkboard had
     no idea of opening a note - every note shows its words where it
     sits and a click is a drag - so each note gets one more button
     beside its reactions, with the number on it. */
  await until('  each note carries its comment count',
    '(function(){var b=document.querySelector("#boardCanvas .note .note-reactions '
    + 'button[onclick*=openNoteSheet]");'
    + 'return b ? "yes" : "no button"})()', 40);
  await until('  the note with the comment shows 1 against it',
    '(function(){var n=document.getElementById("note_nph_mid");if(!n)return "no note";'
    + 'var b=n.querySelector(".note-reactions button[onclick*=openNoteSheet]");'
    + 'return b && b.textContent.trim() === "1" ? "yes" : "shows \\"" '
    + '+ (b?b.textContent.trim():"(none)") + "\\""})()', 40);
  await ev('(function(){var n=document.getElementById("note_nph_mid");'
    + 'n.querySelector(".note-reactions button[onclick*=openNoteSheet]").click();return 1})()');
  await until('  opening it on a computer shows the comment',
    '(function(){var h=document.getElementById("nsComments");'
    + 'return h && h.textContent.indexOf("we could do this in Bb") !== -1 ? "yes" : "no"})()', 30);
  ok('  and it is the same note view, not a second one',
    String(await ev('(function(){return document.querySelectorAll("#noteSheet .ns-react button").length'
      + ' === 4 ? "yes" : "no"})()')) === 'yes');
  await ev('closeNoteSheet(true)');
  await sleep(400);
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  await shot('corkboard-1280');

  /* ---- the phone app's board sheet ------------------------------
     §7f: "the board sheet uses the same small-post-it grid and
     full-screen note, so the app and the phone website match."

     They match because it is the same code - egbc-board-phone.js - and
     that is what is checked here: the same classes, the same notes in
     the same order, and the same note view with its comments. A check
     that only asked "does the app show three things" would pass over
     two screens that had drifted apart. */
  console.log('\nthe same board in the phone app');
  await signInAs('lead');
  await phone();
  watch.reset();
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
  let appDrawn = '';
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    appDrawn = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
      + '.getAttribute("data-drawn") || ""'));
    if (appDrawn.indexOf(PEOPLE.lead.uid + ':') === 0) break;
  }
  ok('  the app drew for them', appDrawn.indexOf(PEOPLE.lead.uid + ':') === 0,
    appDrawn || '(never drew)');
  await ev('(function(){EGBCApp.go("worship","team");return "went"})()');
  await sleep(1200);
  await ev('(function(){var r=document.querySelector("[data-act=\\"sheet:board-worship\\"]");'
    + 'if(r)r.click();return r?"opened":"no row"})()');
  await until('  the board sheet shows the same small post-its',
    '(function(){var g=document.getElementById("pbGrid-worship");'
    + 'if(!g)return "no grid";var n=g.querySelectorAll(".pb-note").length;'
    + 'return n === 3 ? "yes" : (n + " post-its")})()', 40);
  const appOrder = String(await ev('(function(){'
    + 'return [].slice.call(document.querySelectorAll("#pbGrid-worship .pb-note .pb-title"))'
    + '.map(function(e){return e.textContent.trim()}).join(" || ")})()'));
  ok('  newest first, the same as the website',
    appOrder.indexOf(T_NEW) === 0 && appOrder.indexOf(T_OLD) > appOrder.indexOf(T_MID), appOrder);
  const appRows = JSON.parse(String(await ev('(function(){'
    + 'var ns=[].slice.call(document.querySelectorAll("#pbGrid-worship .pb-note"));'
    + 'var tops={};ns.forEach(function(n){var t=Math.round(n.getBoundingClientRect().top/10)*10;'
    + 'tops[t]=(tops[t]||0)+1});'
    + 'return JSON.stringify({perRow:Object.keys(tops).map(function(k){return tops[k]})})})()')));
  ok('  two per row here too', appRows.perRow[0] === 2, JSON.stringify(appRows));

  await ev('(function(){var ns=[].slice.call(document.querySelectorAll("#pbGrid-worship .pb-note"))'
    + '.filter(function(e){return e.textContent.indexOf(' + JSON.stringify(T_MID) + ') !== -1});'
    + 'if(ns.length)ns[0].click();return "tapped"})()');
  await until('  tapping one fills the screen in the app as well',
    '(function(){var s=document.getElementById("appNoteSheet");'
    + 'if(!s||s.hidden)return "not open";var r=s.getBoundingClientRect();'
    + 'return (r.width >= 374 && r.top <= 1) ? "yes"'
    + ' : Math.round(r.width)+"x"+Math.round(r.height)+" at "+Math.round(r.top)})()', 30);
  await until('  and the comment is on it, from the same collection',
    '(function(){var h=document.querySelector("#appNoteSheet [data-bp-comments]");'
    + 'return h && h.textContent.indexOf("we could do this in Bb") !== -1 ? "yes" : "no"})()', 30);
  const appPlayer = String(await ev('(function(){'
    + 'var f=document.querySelector("#appNoteSheet iframe.ns-yt");'
    + 'return f?f.getAttribute("src"):"(no player)"})()'));
  ok('  with the video playing in place', /youtube\.com\/embed\/dQw4w9WgXcQ/.test(appPlayer), appPlayer);
  ok('  nothing of the app is left showing over it',
    String(await ev('(function(){var e=document.elementFromPoint(187,8);'
      + 'var s=document.getElementById("appNoteSheet");'
      + 'return (e && s && (e===s || s.contains(e))) ? "yes"'
      + ' : "showing through: " + (e ? (e.id || e.className || e.tagName) : "nothing")})()')) === 'yes',
    String(await ev('(function(){var e=document.elementFromPoint(187,8);'
      + 'return e ? (e.id || e.className || e.tagName) : "nothing"})()')));

  /* THE SHELL REDRAWS, AND THE BOARD SURVIVES IT. The app rebuilds
     everything inside #egbc-app on every draw; a grid filled once would
     be empty after the next tap anywhere on the screen. */
  await ev('(function(){var b=document.querySelector("#appNoteSheet [data-bp=\\"close\\"]");'
    + 'if(b)b.click();return "closed"})()');
  await sleep(800);
  await ev('EGBCApp.draw()');
  await sleep(900);
  await until('  the post-its are still there after the app redraws',
    '(function(){var g=document.getElementById("pbGrid-worship");'
    + 'return g && g.querySelectorAll(".pb-note").length === 3 ? "yes"'
    + ' : (g ? g.querySelectorAll(".pb-note").length + " post-its" : "no grid")})()', 30);
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  await shot('app-sheet-375');

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
