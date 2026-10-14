/* Care & support: easy to see everywhere, never hidden, and the request
 * for pastoral care goes only where it should (Martin, 14 Oct 2026;
 * NEXT-BRIEF §24).
 *
 *   node tests/check-care.mjs      (from v2/, the dev emulators up)
 *
 * EVERYWHERE, IN WORDS:
 *   - every page with the website bar: the button is there, says "Care &
 *     support" on a computer and "Care" at 375px, is on screen, is the
 *     thing a tap at its middle lands on, and the page does not scroll
 *     sideways. As a master admin, so no page is locked away.
 *   - the hub's own header, the same at both widths;
 *   - the app's header: "Care & support" where it fits, "Care" at 375px;
 *   - the app-mode header: "Care" in words beside a short page name, and
 *     icon-only only when the page's name would not otherwise fit.
 * THE CHOICE: "If someone is in immediate danger, call 999" first; then
 *   pastoral care for me, and worried about someone; Escape closes it and
 *   focus goes back. "Ask for prayer" only once its page exists.
 * PASTORAL CARE FOR ME: the form asks nothing about anybody else, saves a
 *   request about the person themselves, and thanks them.
 * WHO READS IT (care-inbox.html): the pastoral team sees requests and
 *   pastoral concerns but never a safeguarding one; the safeguarding lead
 *   sees all three; an ordinary member sees none; the Menu offers the inbox
 *   to those two only, and Care & support to everybody.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { watchConsole } from './console-watch.mjs';
import { makeEval } from './browser-eval.mjs';

const V2 = path.resolve('.');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9763, SERVE = 8979;
const PW = 'test-only-password';
const SITE = 'site_care';

const BOOK = {
  ab_cr_pat:    { name: 'Pat Asker Synthetic', email: 'cr.pat@example.invalid', markers: ['Worship Team'] },
  ab_cr_pastor: { name: 'Priya Pastoral Synthetic', email: 'cr.pastor@example.invalid', markers: ['Pastoral'] },
  ab_cr_lead:   { name: 'Lee Lead Synthetic', email: 'cr.lead@example.invalid', markers: [] },
  ab_cr_mo:     { name: 'Mo Master Synthetic', email: 'cr.mo@example.invalid', markers: [], masterAdmin: true },
};
const ACCOUNTS = {
  pat:    { member: 'ab_cr_pat', teams: ['Worship Team'], master: false },
  pastor: { member: 'ab_cr_pastor', teams: ['Pastoral'], master: false },
  lead:   { member: 'ab_cr_lead', teams: [], master: false },
  mo:     { member: 'ab_cr_mo', teams: [], master: true },
};
Object.values(ACCOUNTS).forEach((a) => { a.email = BOOK[a.member].email; });

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 500) : '')));
};
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
const val = (v) => {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const OWNER = { Authorization: 'Bearer owner' };
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, OWNER);
const del = (p) => req(8181, 'DELETE', DOCS + '/' + p, undefined, OWNER);
const unval = (v) => v == null ? undefined : 'stringValue' in v ? v.stringValue : 'booleanValue' in v ? v.booleanValue
  : 'integerValue' in v ? +v.integerValue : 'timestampValue' in v ? v.timestampValue : null;

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
/* "Ask for prayer" is the events window's page; here it exists only when
   the check says so. */
let PRAYER = false;
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

(async () => {
  /* ---- seed --------------------------------------------------------- */
  for (const [id, m] of Object.entries(BOOK)) {
    await put('addressBook/' + id, Object.assign({ adminFor: [], archived: false, isMinor: false, churchMember: true, masterAdmin: false }, m));
  }
  for (const a of Object.values(ACCOUNTS)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: a.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: a.email, password: PW, returnSecureToken: true })).body || '{}');
    a.uid = up.localId;
    await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update',
      { localId: a.uid, emailVerified: true }, OWNER);
    await put('users/' + a.uid, { uid: a.uid, email: a.email, name: BOOK[a.member].name, memberId: a.member, status: 'active',
      linkedBy: 'admin', teams: a.teams, adminFor: [], masterAdmin: a.master, attender: false, churchMember: true });
  }
  await put('teams/Pastoral', { name: 'Pastoral', label: 'Pastoral', colour: '#6b4a7a', rota: false, runs: [], archived: false });
  await put('bookingSettings/' + SITE, { safeguardingLead: 'ab_cr_lead' });
  /* The buildings themselves - the lead picker lists them - and a second
     one with NO lead, which "no safeguarding lead" points at: pointing at
     nothing would let the server find another check's building that has
     one (leadSite's fallback, 4d632933). */
  await put('sites/' + SITE, { name: 'Synthetic Care Hall' });
  await put('sites/site_care_none', { name: 'Synthetic Empty Hall' });
  await put('bookingSettings/site_care_none', { safeguardingLead: '' });
  /* The safeguarding settings are shared with other checks: only this
     check's lead site is written, and put back afterwards. */
  const sgBefore = await req(8181, 'GET', DOCS + '/safeguardingSettings/defaults', undefined, OWNER);
  /* And the server's note of it (careRouting/status), which this check's
     changes rewrite: left as found, or every master admin in the checks
     after this one is warned "No safeguarding lead set" on the hub. */
  const statusBefore = await req(8181, 'GET', DOCS + '/careRouting/status', undefined, OWNER);
  /* THE PRIVATE FORMS ARE OPEN for everything up to section 9, which closes
     them: as after switch-over (churchSettings/launch.rulesLocked). Put back
     as found at the end. */
  const launchBefore = await req(8181, 'GET', DOCS + '/churchSettings/launch', undefined, OWNER);
  await put('churchSettings/launch', { rulesLocked: true, opensOn: '' });
  await req(8181, 'PATCH', DOCS + '/safeguardingSettings/defaults?updateMask.fieldPaths=leadSiteId',
    { fields: fields({ leadSiteId: SITE }) }, OWNER);
  const at = new Date();
  await put('worries/w_cr_pastoral', { kind: 'pastoral', aboutMemberId: '', aboutName: 'Concern Subject Synthetic',
    noticed: 'Not seen for a while, synthetic.', happyToBeContacted: true, by: 'u_other', byName: 'Other Synthetic', at, dealtWith: false });
  await put('worries/w_cr_sg', { kind: 'safeguarding', aboutMemberId: '', aboutName: 'Safeguarding Subject Synthetic',
    noticed: 'A synthetic safeguarding concern.', happyToBeContacted: false, by: 'u_other', byName: 'Other Synthetic', at, dealtWith: false });

  /* ---- the browser ---------------------------------------------------- */
  const server = http.createServer((q, sres) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { sres.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return sres.end(SIGNIN); }
    /* prayer.html is the events window's page; here it exists only when the check says so. */
    if (url === '/prayer.html' && !PRAYER) { sres.writeHead(404); return sres.end('no'); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { sres.writeHead(404); return sres.end('no'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t);
      body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css'
      : e === '.json' ? 'application/json' : e === '.png' ? 'image/png' : 'application/octet-stream';
    sres.writeHead(200, { 'Content-Type': type + (type.startsWith('image') ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    sres.end(body);
  }).listen(SERVE);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let chrome = null, ws = null, round = 0, id = 0;
  const pend = new Map();
  const watch = watchConsole();
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  /* A FRESH BROWSER FOR EACH PART. One browser through a hundred and forty
     pages ends up with "the client is offline": its connections to the
     emulators run out. No back/forward cache either - a cached page keeps
     its database connection open. */
  const launch = async () => {
    if (chrome) { try { ws.close(); } catch {} chrome.kill(); await sleep(1500); }
    round++;
    chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-care-' + process.pid + '-' + round), '--window-size=1280,900', '--no-first-run',
      '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
    let list; for (let i = 0; i < 40; i++) { try { list = await getJSON('/json/list'); break; } catch { await sleep(500); } }
    if (!list) { console.error('Chrome did not start - set CHROME_PATH'); process.exit(1); }
    ws = new WebSocket(list.find(x => x.type === 'page').webSocketDebuggerUrl);
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
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  };
  await launch();
  const evl = makeEval(send, 'care');
  const width = (w) => send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 700 ? 812 : 900, deviceScaleFactor: 1, mobile: w < 700 });
  /* Signed in AS THAT PERSON, checked, three tries. The auth emulator now
     and then answers a sign-in with a network error; carried on regardless,
     the next person's checks ran as the last one and failed for nothing. */
  const signIn = async (a) => {
    for (let tries = 0; tries < 3; tries++) {
      await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
      await sleep(2500);
      await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
      await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(a.email) + ',' + JSON.stringify(PW) + ')', true);
      await sleep(800);
      if (String(await evl('((firebase.auth(EGBCAuth.app).currentUser)||{}).email||""')) === a.email) return;
      console.log('          [sign-in as ' + a.email + ' did not take - trying again]');
      await sleep(2000);
    }
    console.log('          [could not sign in as ' + a.email + ']');
  };
  const go = async (page, waitFor, extra) => {
    /* Through a blank page, as check-home-fits does, so the last page's
       database connection has closed before the next one opens. */
    await send('Page.navigate', { url: 'about:blank' }); await sleep(300);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + page });
    for (let i = 0; i < 80; i++) {
      await sleep(250);
      /* Found, and the sign-in guard has let the page show: until then the
         page is hidden and reads as empty. */
      if ((await evl('!!document.querySelector(' + JSON.stringify(waitFor) + ') && !document.getElementById("egbc-guard-style")')) === true) break;
    }
    await sleep(extra || 600);
    /* The hub asks a first-time visitor to pick a team, over everything -
       pick one, as check-home-fits does, so the page underneath is what is
       measured. */
    if (/^hub\.html/.test(page)) {
      await evl("(function(){var b=document.querySelector('#pickList .pick-t');if(b)b.click();return 1})()");
      await sleep(800);
    }
  };
  /* Present, in words, on screen, and the thing a tap at its middle hits. */
  const tappable = (sel) => evl('(function(){var b=document.querySelector(' + JSON.stringify(sel) + ');if(!b)return JSON.stringify({there:false});'
    + 'var r=b.getBoundingClientRect(),cs=getComputedStyle(b);'
    + 'var hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);'
    + 'return JSON.stringify({there:true,text:(b.innerText||"").replace(/\\s+/g," ").trim(),shown:cs.display!=="none"&&cs.visibility!=="hidden"&&r.width>0,'
    + 'onScreen:r.left>=0&&r.right<=innerWidth+0.5&&r.top>=0&&r.bottom<=innerHeight,tap:!!hit&&(hit===b||b.contains(hit)),'
    + 'hit:hit?(hit.tagName+"#"+hit.id+"."+String(hit.className).slice(0,40)):null,h:Math.round(r.height),sideways:document.documentElement.scrollWidth>innerWidth+1})})()').then(s => JSON.parse(String(s)));

  /* ---- 1. every page with the website bar, as a master admin ---------- */
  await signIn(ACCOUNTS.mo);
  const QUICK = process.env.CARE_QUICK === '1';
  const pages = QUICK ? [] : fs.readdirSync(V2)
    .filter(f => f.endsWith('.html') && /<script[^>]+src=["'][^"']*egbc-shell\.js/.test(fs.readFileSync(path.join(V2, f), 'utf8')))
    /* care.html is the choice itself; the app draws its own header, checked below. */
    .filter(f => f !== 'care.html' && f !== 'app.html').sort();
  console.log('\n"Care & support" on every page with the website bar (' + pages.length + ' pages), as a master admin');
  const bad = { desk: [], phone: [] };
  PRAYER = true;   /* the sweep sees every page as it is, prayer.html included */
  for (const w of [1280, 375]) {
    await width(w);
    for (const p of pages) {
      /* The bar, not the button: a page without the button must fail here
         quickly, not be waited on. */
      await go(p, '#egbc-bar', 300);
      const t = await tappable('#egbc-care-btn');
      /* "Care" on a phone - or the whole words, on the older pages built
         without a phone layout, where they still fit. Never icon-only. */
      const good = t.there && t.shown && t.onScreen && t.tap && t.h >= 44 && !t.sideways
        && (w < 700 ? (t.text === 'Care' || t.text === 'Care & support') : t.text === 'Care & support');
      if (!good) (w < 700 ? bad.phone : bad.desk).push(p + ' ' + JSON.stringify(t));
    }
  }
  ok('  at computer width: "Care & support", on screen, tappable, 44px tall, on all ' + pages.length, bad.desk.length === 0, bad.desk.join('\n          '));
  ok('  at 375px: in words, on screen, tappable, 44px tall, no sideways scroll, on all ' + pages.length, bad.phone.length === 0, bad.phone.join('\n          '));

  PRAYER = false;
  if (!QUICK) { await launch(); await signIn(ACCOUNTS.mo); }

  /* ---- 2. the choice ------------------------------------------------- */
  console.log('\nthe choice, opened from the bar');
  await width(1280);
  await go('groups.html', '#egbc-care-btn');
  await evl('document.getElementById("egbc-care-btn").click()'); await sleep(800);
  const dlg = JSON.parse(String(await evl('(function(){var d=document.getElementById("egbc-care-dlg");if(!d)return "null";'
    + 'var b=d.querySelector("#egbc-care-body");return JSON.stringify({role:d.getAttribute("role"),modal:d.getAttribute("aria-modal"),'
    + 'first:b.firstElementChild.className,danger:b.firstElementChild.innerText.trim(),'
    + 'opts:[].map.call(d.querySelectorAll(".egbc-care-opt"),function(a){return a.getAttribute("data-care")+"="+a.getAttribute("href")}),'
    + 'focus:document.activeElement&&document.activeElement.getAttribute("data-care")})})()')));
  ok('  a dialog', !!dlg && dlg.role === 'dialog' && dlg.modal === 'true', JSON.stringify(dlg));
  ok('  "If someone is in immediate danger, call 999." first of all', !!dlg && dlg.first === 'egbc-care-danger' && dlg.danger === 'If someone is in immediate danger, call 999.', JSON.stringify(dlg));
  ok('  then pastoral care for me, then worried about someone', !!dlg && dlg.opts.join(',') === 'care=worried.html?for=me,worried=worried.html', JSON.stringify(dlg));
  ok('  NO "Ask for prayer" while its page does not exist', !!dlg && dlg.opts.indexOf('prayer=prayer.html') === -1);
  ok('  focus is in it', !!dlg && dlg.focus === 'care');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(300);
  ok('  Escape closes it, and focus goes back to the button',
    (await evl('!document.getElementById("egbc-care-dlg") && document.activeElement && document.activeElement.id==="egbc-care-btn"')) === true);
  PRAYER = true;
  await go('groups.html', '#egbc-care-btn');
  await evl('document.getElementById("egbc-care-btn").click()'); await sleep(1200);
  ok('  "Ask for prayer" joins it, last, once its page exists',
    String(await evl('[].map.call(document.querySelectorAll(".egbc-care-opt"),function(a){return a.getAttribute("data-care")}).join(",")')) === 'care,worried,prayer');
  PRAYER = false;

  /* ---- 3. the hub's own header, and care.html ------------------------ */
  console.log('\nthe hub\'s header');
  for (const w of [1280, 375]) {
    await width(w);
    await go('hub.html', '#careBtn', 1500);
    const t = await tappable('#careBtn');
    ok('  at ' + w + 'px: "' + (w < 700 ? 'Care' : 'Care & support') + '", on screen and tappable, no sideways scroll',
      t.there && t.shown && t.onScreen && t.tap && t.text === (w < 700 ? 'Care' : 'Care & support') && !t.sideways, JSON.stringify(t));
  }
  await evl('document.getElementById("careBtn").click()'); await sleep(800);
  ok('  and it opens the same choice', (await evl('!!document.querySelector("#egbc-care-dlg .egbc-care-danger")')) === true);
  await go('care.html', '.egbc-care-opt');
  ok('care.html: the same choice as a page, 999 first',
    String(await evl('document.getElementById("care").firstElementChild.className')) === 'egbc-care-danger'
      && Number(await evl('document.querySelectorAll("#care .egbc-care-opt").length')) === 2);

  /* ---- 4. the app's header, and app mode ----------------------------- */
  console.log('\nthe app');
  await signIn(ACCOUNTS.pat);
  const appHead = async (w) => {
    await width(w);
    await go('app.html', '#egbc-app .worry', 2500);
    return tappable('#egbc-app .worry');
  };
  let t = await appHead(430);
  ok('  in the app\'s header at 430px: "Care & support"', t.there && t.shown && t.onScreen && t.tap && t.text === 'Care & support' && !t.sideways, JSON.stringify(t));
  t = await appHead(375);
  ok('  at 375px: "Care"', t.there && t.shown && t.onScreen && t.tap && t.text === 'Care' && !t.sideways, JSON.stringify(t));
  await evl('document.querySelector("#egbc-app .worry").click()'); await sleep(800);
  const sheet = JSON.parse(String(await evl('(function(){var s=document.querySelector(".sheet");if(!s)return "null";return JSON.stringify({'
    + 'first:(s.querySelector(".care-999")||{}).innerText,acts:[].map.call(s.querySelectorAll("[data-act^=open]"),function(b){return b.getAttribute("data-act")})})})()')));
  ok('  tapped, a sheet: 999 first, then the two choices', !!sheet && /immediate danger, call 999/.test(sheet.first || '')
    && sheet.acts.join(',') === 'open:worried.html?for=me,open:worried.html', JSON.stringify(sheet));

  await width(375);
  await go('groups.html?app=1', '#egbc-am-top .am-worry', 1200);
  t = await tappable('#egbc-am-top .am-worry');
  ok('  the app-mode header beside a short page name: "Care", in words', t.there && t.onScreen && t.tap && t.text === 'Care', JSON.stringify(t));
  ok('  and it goes to care.html, still in the app', /care\.html\?app=1$/.test(String(await evl('document.querySelector("#egbc-am-top .am-worry").getAttribute("href")'))));
  await go('care-inbox.html?app=1', '#egbc-am-top .am-worry', 1500);
  const tight = JSON.parse(String(await evl('(function(){var t=document.getElementById("egbc-am-top"),w=t.querySelector(".am-worry"),r=w.getBoundingClientRect();'
    + 'return JSON.stringify({title:t.querySelector(".am-title").textContent,tight:t.classList.contains("am-tight"),label:w.getAttribute("aria-label"),'
    + 'shown:r.width>=44&&r.right<=innerWidth})})()')));
  ok('  beside a long page name: icon-only, still 44px, still named for a screen reader',
    tight.tight === true && tight.shown && tight.label === 'Care and support', JSON.stringify(tight));

  /* ---- 5. "I'd like some pastoral care" ------------------------------- */
  console.log('\n"I\'d like some pastoral care", as Pat');
  await width(375);
  await go('worried.html?for=me', '#send', 1500);
  ok('  the page says what it is', String(await evl('document.getElementById("h1").textContent')) === 'I\u2019d like some pastoral care'
    || String(await evl('document.getElementById("h1").textContent')) === "I'd like some pastoral care");
  ok('  and asks nothing about anybody else', (await evl('document.getElementById("aboutOthers").hidden && document.getElementById("contactRow").hidden')) === true);
  ok('  999 is still first', /call 999/.test(String(await evl('document.querySelector(".urgent").innerText'))));
  watch.reset();
  await evl('document.getElementById("send").click()'); await sleep(2500);
  ok('  sent with nothing typed: "Somebody from the pastoral team will be in touch"',
    /pastoral team will be in touch/.test(String(await evl('document.getElementById("thanks").innerText')))
      && (await evl('!document.getElementById("thanks").classList.contains("hidden")')) === true);
  const all = JSON.parse((await req(8181, 'POST', DOCS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'worries' }],
    where: { fieldFilter: { field: { fieldPath: 'by' }, op: 'EQUAL', value: { stringValue: ACCOUNTS.pat.uid } } } } }, OWNER)).body || '[]')
    .filter((x) => x.document).map((x) => ({ id: x.document.name.split('/').pop(), f: x.document.fields }));
  const mine = all[0];
  ok('  saved as a request for care, about Pat, agreeing to be contacted', all.length === 1 && unval(mine.f.kind) === 'care'
    && unval(mine.f.aboutMemberId) === 'ab_cr_pat' && unval(mine.f.happyToBeContacted) === true, JSON.stringify(all));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* ---- 6. who reads it ------------------------------------------------- */
  const inbox = async (a) => {
    await signIn(a);
    await width(375);
    /* Past "Loading…": a list, or the page's answer that there is none. */
    await go('care-inbox.html', '#list article, #count:not(:empty), #list .empty a', 1500);
    if (/Could not check your access|client is offline/.test(String(await evl('document.body.innerText')))) {
      console.log('          [inbox: connection message - reloading once]');
      await sleep(3000);
      await go('care-inbox.html', '#list article, #count:not(:empty), #list .empty a', 1500);
    }
    const t = String(await evl('(document.getElementById("list")||{}).innerText||""'));
    if (!t) console.log('          [inbox empty] ' + String(await evl('JSON.stringify({href:location.href,who:(EGBCAuth.user()||{}).email,'
      + 'blocked:document.body&&document.body.getAttribute("data-egbc-blocked"),guard:!!document.getElementById("egbc-guard-style"),'
      + 'body:(document.body&&document.body.innerText||"").slice(0,200)})')));
    return t;
  };
  const menu = (title) => evl('(function(){var f=false;(function w(n){n.forEach(function(x){if(x.title===' + JSON.stringify(title)
    + ')f=true;if(x.children)w(x.children)})})(EGBCMenu.forPerson(EGBCMenu.who()));return f})()');
  const onHub = async () => { await width(1280); await go('hub.html', '#careBtn', 2500); };

  console.log('\nthe inbox, as Priya (Pastoral team)');
  watch.reset();
  let x = await inbox(ACCOUNTS.pastor);
  ok('  Pat\'s request for care', /Pat Asker Synthetic would like some pastoral care/.test(x), x.slice(0, 600));
  ok('  the pastoral concern', /About Concern Subject Synthetic/.test(x), x.slice(0, 600));
  ok('  NOT the safeguarding concern', !/Safeguarding Subject/.test(x), x.slice(0, 600));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  await evl('(function(){var b=[].filter.call(document.querySelectorAll("#list article"),function(a){return /Pat Asker/.test(a.innerText)})[0];'
    + 'b.querySelector("textarea").value="Rang Pat, synthetic.";b.querySelector("[data-done]").click();return 1})()');
  await sleep(1500);
  const d1 = JSON.parse((await req(8181, 'GET', DOCS + '/worries/' + mine.id, undefined, OWNER)).body || '{}').fields || {};
  ok('  she marks it dealt with, with a note', unval(d1.dealtWith) === true && unval(d1.dealtNote) === 'Rang Pat, synthetic.', JSON.stringify(d1));
  await onHub();
  ok('  the Menu offers her the inbox', (await menu('Care & support: what has come in')) === true);

  console.log('\nas Lee, the safeguarding lead');
  x = await inbox(ACCOUNTS.lead);
  ok('  the safeguarding concern too', /About Safeguarding Subject Synthetic/.test(x) && /About Concern Subject Synthetic/.test(x), x.slice(0, 600));
  await onHub();
  ok('  the Menu offers him the inbox', (await menu('Care & support: what has come in')) === true);

  console.log('\nas Pat, and as Mo (master admin)');
  x = await inbox(ACCOUNTS.pat);
  ok('  Pat reads none of it, his own request included', /named to look after care and concerns/.test(x) && !/Synthetic/.test(x), x.slice(0, 400));
  await onHub();
  ok('  the Menu offers Pat "Care & support"', (await menu('Care & support')) === true);
  ok('  but not the inbox', (await menu('Care & support: what has come in')) === false);
  await signIn(ACCOUNTS.mo);
  await onHub();
  ok('  nor Mo: a master admin is not a reader', (await menu('Care & support: what has come in')) === false);

  /* ---- 7. who gets told, on Church settings (a master admin's) ------- */
  console.log('\n"Who gets told", as Mo on Church settings');
  await put('churchSettings/details', { name: 'Synthetic Church', enquiryEmail: 'office@example.invalid' });
  await del('careRouting/main');
  await width(375);
  watch.reset();
  await go('church-settings.html', '#care-save', 2500);
  ok('  the section is there, with the three kinds and the safeguarding line',
    Number(await evl('document.querySelectorAll("#care-form fieldset.ck").length')) === 4
      && /Only the safeguarding lead and deputy: Lee Lead Synthetic/.test(String(await evl('document.getElementById("care-form").innerText'))));
  ok('  no warning while a lead is set', (await evl('!document.getElementById("care-warn")')) === true);
  ok('  nobody named yet: "these go to the safeguarding lead and deputy"',
    /Nobody named — these go to the safeguarding lead and deputy/.test(String(await evl('document.querySelector("[data-kind=care]").innerText'))));
  await evl('document.getElementById("em-care").value="office@example.invalid";document.getElementById("care-save").click();1');
  await sleep(1200);
  /* Martin, 14 Oct 2026: never a DEFAULT to the office, but a church may
     choose it on purpose (the vicar can be the lead and read that inbox). */
  ok('  THE OFFICE\'S ADDRESS, CHOSEN ON PURPOSE, SAVES WITH A REMINDER', /also the church office/.test(String(await evl('document.getElementById("toast").textContent')))
    && (await req(8181, 'GET', DOCS + '/careRouting/main', undefined, OWNER)).status === 200);
  await evl('document.getElementById("em-care").value="";document.getElementById("add-care").value="Pat Asker Synthetic";'
    + 'document.querySelector("[data-add=care]").click();1'); await sleep(400);
  await evl('document.getElementById("care-save").click();1'); await sleep(1500);
  const saved = JSON.parse((await req(8181, 'GET', DOCS + '/careRouting/main', undefined, OWNER)).body || '{}').fields || {};
  ok('  a person picked from the address book is saved for requests for care',
    JSON.stringify(saved.care || {}).indexOf('ab_cr_pat') !== -1, JSON.stringify(saved).slice(0, 300));
  /* MARTIN'S WAY (e058838b): a name picked into the box, and Save pressed
     without Add. It was lost - careRouting saved nobody for all three. */
  await evl('document.getElementById("add-pastoral").value="Priya Pastoral Synthetic";document.getElementById("care-save").click();1');
  await sleep(1500);
  const saved2 = JSON.parse((await req(8181, 'GET', DOCS + '/careRouting/main', undefined, OWNER)).body || '{}').fields || {};
  ok('  a name picked and Save pressed without Add: the name is saved',
    JSON.stringify(saved2.pastoral || {}).indexOf('ab_cr_pastor') !== -1, JSON.stringify(saved2.pastoral || {}).slice(0, 200));
  await evl('document.getElementById("add-prayer").value="Nobody Madeup Synthetic";document.getElementById("toast").textContent="";'
    + 'document.getElementById("care-save").click();1');
  await sleep(1200);
  const saved3 = JSON.parse((await req(8181, 'GET', DOCS + '/careRouting/main', undefined, OWNER)).body || '{}').fields || {};
  ok('  a made-up name left in the box: Save refuses, "not in the address book", and saves nothing',
    /not in the address book/.test(String(await evl('document.getElementById("toast").textContent')))
      && JSON.stringify(saved3.prayer || {}).indexOf('Nobody') === -1 && JSON.stringify(saved3) === JSON.stringify(saved2),
    String(await evl('document.getElementById("toast").textContent')));
  await evl('document.getElementById("add-prayer").value="";1');
  ok('  and the page fits at 375px', (await evl('document.documentElement.scrollWidth<=innerWidth+1')) === true);
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  console.log('\nnamed for requests for care, Pat now reads them, and nothing else');
  x = await inbox(ACCOUNTS.pat);
  /* Priya has marked it dealt with, so it is behind "Show the ones dealt with". */
  await evl('document.getElementById("showDone").click();1'); await sleep(300);
  x = String(await evl('document.getElementById("list").innerText'));
  ok('  his own request is there to read now he is named', /Pat Asker Synthetic would like some pastoral care/.test(x), x.slice(0, 400));
  ok('  but no concerns: he is not named for those', !/About Concern Subject|Safeguarding Subject/.test(x), x.slice(0, 400));
  await onHub();
  ok('  and the Menu offers him the inbox', (await menu('Care & support: what has come in')) === true);
  await del('careRouting/main');

  /* ---- 8. no safeguarding lead set ------------------------------------ */
  console.log('\nwith no safeguarding lead set');
  /* For real: the lead's site is taken away, and the server's
     careStatusFrom* triggers update careRouting/status, as they will live. */
  const status = async () => { const r = await req(8181, 'GET', DOCS + '/careRouting/status', undefined, OWNER);
    const f = (JSON.parse(r.body || '{}').fields || {}).leadSet; return f ? f.booleanValue : undefined; };
  const waitStatus = async (want) => { let v; for (let i = 0; i < 40; i++) { v = await status(); if (v === want) return v; await sleep(500); } return v; };
  await req(8181, 'PATCH', DOCS + '/safeguardingSettings/defaults?updateMask.fieldPaths=leadSiteId', { fields: fields({ leadSiteId: 'site_care_none' }) }, OWNER);
  ok('  the server marks it: careRouting/status says no lead', (await waitStatus(false)) === false);
  await width(375);
  await go('worried.html?for=me', '#nobody', 2000);
  const nob = String(await evl('(document.getElementById("nobody")||{}).innerText||""'));
  ok('  the form is not offered: it says so, with 999 and how to reach the church in person',
    /cannot be sent from here yet/.test(nob) && /call 999/.test(nob) && /in person/.test(nob)
      && (await evl('document.getElementById("form").classList.contains("hidden")')) === true, nob);
  ok('  and 999 is still at the top of the page', /call 999/.test(String(await evl('document.querySelector(".urgent").innerText'))));
  await go('worried.html', '#nobody', 2000);
  ok('  the same for "I\'m worried about someone"', (await evl('!!document.getElementById("nobody")')) === true);
  await signIn(ACCOUNTS.mo);
  await width(1280);
  await go('hub.html', '#careBtn', 3500);
  ok('  a master admin is warned on the hub: "No safeguarding lead set"',
    /No safeguarding lead set/.test(String(await evl('(document.getElementById("waitingCard")||{}).innerText||""'))));
  await req(8181, 'PATCH', DOCS + '/safeguardingSettings/defaults?updateMask.fieldPaths=leadSiteId', { fields: fields({ leadSiteId: SITE }) }, OWNER);
  ok('  a lead set again: careRouting/status says so', (await waitStatus(true)) === true);
  await go('hub.html', '#careBtn', 3500);
  ok('  and not once one is', !/No safeguarding lead set/.test(String(await evl('(document.getElementById("waitingCard")||{}).innerText||""'))));

  /* ---- 9. before switch-over: nothing is saved ------------------------ */
  console.log('\nbefore switch-over (churchSettings/launch not set): the private forms save nothing');
  await put('churchSettings/launch', { rulesLocked: false, opensOn: '1 November 2026' });
  await signIn(ACCOUNTS.pat);
  await width(375);
  const countMine = async () => (JSON.parse((await req(8181, 'POST', DOCS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'worries' }],
    where: { fieldFilter: { field: { fieldPath: 'by' }, op: 'EQUAL', value: { stringValue: ACCOUNTS.pat.uid } } } } }, OWNER)).body || '[]')
    .filter((x) => x.document).length);
  const beforeN = await countMine();
  for (const page of ['worried.html?for=me', 'worried.html']) {
    await go(page, '#notyet', 2000);
    const nt = String(await evl('(document.getElementById("notyet")||{}).innerText||""'));
    ok('  ' + page + ': not offered - 999, when it opens, and "speak to a church leader in person"',
      /call 999/.test(nt) && /opens on 1 November 2026/.test(nt) && /in person/.test(nt)
        && (await evl('document.getElementById("form").classList.contains("hidden")')) === true, nt);
    /* And pressing Send anyway (the button is still in the page). */
    await evl('(function(){var k=document.querySelector(".kind[data-kind=pastoral]");if(k)k.click();'
      + 'var w=document.getElementById("who");if(w)w.value="Somebody Synthetic";'
      + 'document.getElementById("noticed").value="Synthetic words that must not be saved";'
      + 'document.getElementById("send").click();return 1})()');
    await sleep(2500);
  }
  ok('  NOTHING WAS WRITTEN, even pressing Send', (await countMine()) === beforeN, (await countMine()) + ' vs ' + beforeN);
  await go('hub.html', '#careBtn', 2000);
  await evl('document.getElementById("careBtn").click();1'); await sleep(800);
  ok('  the Care & support button and its choices still show',
    Number(await evl('document.querySelectorAll("#egbc-care-dlg .egbc-care-opt").length')) >= 2);

  console.log('\nswitch-over: a master admin opens them on Church settings');
  await signIn(ACCOUNTS.mo);
  await go('church-settings.html', '#l-switch', 2000);
  await evl('window.confirm=function(){return true};document.getElementById("l-switch").click();1'); await sleep(1500);
  const lf = JSON.parse((await req(8181, 'GET', DOCS + '/churchSettings/launch', undefined, OWNER)).body || '{}').fields || {};
  ok('  the switch sets churchSettings/launch.rulesLocked', unval(lf.rulesLocked) === true, JSON.stringify(lf));
  await signIn(ACCOUNTS.pat);
  await go('worried.html?for=me', '#send', 2000);
  ok('  and the form is offered again', (await evl('!document.getElementById("notyet") && !document.getElementById("form").classList.contains("hidden")')) === true);
  await evl('document.getElementById("send").click();1'); await sleep(2500);
  ok('  and saves', (await countMine()) === beforeN + 1, (await countMine()) + ' vs ' + beforeN);

  /* ---- tidy ------------------------------------------------------------ */
  const mineNow = JSON.parse((await req(8181, 'POST', DOCS + ':runQuery', { structuredQuery: { from: [{ collectionId: 'worries' }],
    where: { fieldFilter: { field: { fieldPath: 'by' }, op: 'EQUAL', value: { stringValue: ACCOUNTS.pat.uid } } } } }, OWNER)).body || '[]')
    .filter((x) => x.document).map((x) => x.document.name.split('/').pop());
  for (const id of mineNow) await del('worries/' + id);
  if (launchBefore.status === 200) {
    await req(8181, 'PATCH', DOCS + '/churchSettings/launch', { fields: JSON.parse(launchBefore.body).fields || {} }, OWNER);
  } else {
    await del('churchSettings/launch');
  }
  for (const w of all) await del('worries/' + w.id);
  for (const p of ['worries/w_cr_pastoral', 'worries/w_cr_sg', 'bookingSettings/' + SITE]) await del(p);
  const before = JSON.parse(sgBefore.body || '{}').fields || {};
  await req(8181, 'PATCH', DOCS + '/safeguardingSettings/defaults?updateMask.fieldPaths=leadSiteId',
    { fields: before.leadSiteId ? { leadSiteId: before.leadSiteId } : {} }, OWNER);
  /* The trigger rewrites careRouting/status after that; wait for it, then
     put the note back as it was (or take it away if there was none). */
  await sleep(4000);
  if (statusBefore.status === 200) {
    await req(8181, 'PATCH', DOCS + '/careRouting/status', { fields: JSON.parse(statusBefore.body).fields || {} }, OWNER);
  } else {
    await del('careRouting/status');
  }
  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
