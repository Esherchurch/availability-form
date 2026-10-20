/* Can somebody actually give to the church?
 *
 *   node tests/check-give.mjs            (from v2/, dev emulators running)
 *   node tests/check-give.mjs --shots
 *
 * WHAT THIS IS FOR. Martin has the church's bank details ready and wants
 * them typed in ONCE, on the church details settings page, and shown in
 * two places: the Give screen on the phone app's Me tab, and the Give
 * page on the website. Each of the three details gets a Copy button,
 * because the job on a phone is getting a sort code into a banking app
 * without a typo.
 *
 * NO REAL NUMBERS ANYWHERE. The repository is public. The values here
 * are deliberate nonsense - 00-00-00 and 00000000 - and there is an
 * assertion at the end that the pages themselves carry no number that
 * looks like a sort code or an account number, so a future "just to test
 * it" cannot quietly become a commit.
 *
 * THE INTERESTING STATE IS THE EMPTY ONE. Nothing is seeded, so until
 * Val fills the setting in, the empty state is what the whole church
 * sees. A screen reading "Account number:" with a blank after it is
 * worse than one that admits the details are not up yet, so that is
 * checked as its own case.
 *
 * AND WHO MAY SET THEM. firestore.rules allows a master admin or the
 * Church office, deliberately not every admin. The settings card has to
 * agree: a Kids Church admin opens that page legitimately for the name
 * and logo, and if the card were drawn for them they would fill the
 * church's bank details in, press Save and be refused. A page that opens
 * onto data it cannot write is a fault this project keeps finding.
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
const PORT = 9703, SERVE = 8919;
const PROJECT = 'egbc-worship-planner';
const wantShots = process.argv.includes('--shots');
const PW = 'test-only-password';

/* INVENTED, AND OBVIOUSLY SO. Zeros rather than anything plausible: if
   this ever ends up on a screen somebody is looking at, it should be
   unmistakably not the church's money. */
const GIVING = {
  accountName: 'Synthetic Road Community Church',
  sortCode: '00-00-00',
  accountNumber: '00000000',
  reference: 'YOUR NAME',
  giftAid: true,
  giftAidUrl: 'https://example.invalid/gift-aid-form',
  note: 'Any questions, ask in the office.'
};

const PEOPLE = {
  office: { email: 'give.office@example.invalid', name: 'Office Synthetic',
            teams: ['Church office'], adminFor: [], masterAdmin: false },
  /* An admin who is NOT the office and NOT a master admin. The rules
     refuse them, so the card must not be drawn for them. */
  kids:   { email: 'give.kids@example.invalid', name: 'Kids Synthetic',
            teams: ['Kids Church'], adminFor: ['Kids Church'], masterAdmin: false },
  /* Who it is all for: somebody on no team at all. */
  member: { email: 'give.member@example.invalid', name: 'Member Synthetic',
            teams: [], adminFor: [], masterAdmin: false }
};

const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n
    + (x !== undefined ? '\n          ' + String(x).slice(0, 300) : ''));
};

const req = (port, method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const r = http.request({ host: 'localhost', port, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    s => { let d = ''; s.on('data', c => d += c); s.on('end', () => res({ status: s.statusCode, body: d })); });
  r.on('error', rej); r.end(data);
});
const docPath = c => '/v1/projects/' + PROJECT + '/databases/(default)/documents/' + c;
const val = (v) => {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  return { stringValue: String(v) };
};
const put = (c, o) => {
  const fields = {};
  for (const [k, v] of Object.entries(o)) fields[k] = val(v);
  return req(8181, 'PATCH', docPath(c), { fields });
};
const del = (c) => req(8181, 'DELETE', docPath(c));

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){'
  + 'navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
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

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });

  await put('churchSettings/giving', GIVING);

  for (const [key, p] of Object.entries(PEOPLE)) {
    let up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST',
      '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    /* BOTH PLACES, OR THE RULES CORRECT IT AWAY. The mirror carries the
       teams the page reads; the address book is where they came from, and
       a mirror that disagrees with it gets put back. A check whose seed
       only wrote the mirror reported a strip missing on 22 pages once. */
    await put('users/' + p.uid, {
      uid: p.uid, email: p.email, name: p.name, memberId: 'ab_give_' + key,
      status: 'active', linkedBy: 'admin', teams: p.teams, adminFor: p.adminFor,
      masterAdmin: p.masterAdmin, attender: true, churchMember: true });
    await put('addressBook/ab_give_' + key, {
      name: p.name, email: p.email, markers: p.teams, adminFor: p.adminFor,
      churchMember: true, archived: false, isMinor: false });
  }

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
    s.writeHead(200, { 'Content-Type': (e === '.html' ? 'text/html' : e === '.js' ? 'text/javascript'
      : e === '.css' ? 'text/css' : 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-give-' + process.pid),
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
  /* https:// ONLY. Pausing http breaks Firestore's long-lived stream and
     the page never gets its data (A-062). */
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  const ev = makeEval(send, 'give');

  const phone = () => send('Emulation.setDeviceMetricsOverride',
    { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });

  const signInAs = async (key) => {
    const p = PEOPLE[key];
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await sleep(2500);
    await ev('firebase.auth(EGBCAuth.app).signOut()', true);
    await sleep(300);
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword('
      + JSON.stringify(p.email) + ',' + JSON.stringify(PW) + ')', true);
    await sleep(700);
    const uid = String(await ev('((firebase.auth(EGBCAuth.app).currentUser)||{}).uid || ""'));
    if (uid !== p.uid) {
      console.error('Could not sign in as ' + p.email + ' (got ' + uid + ')');
      server.close(); chrome.kill(); process.exit(2);
    }
  };

  /* THE GUARD HIDES THE BODY UNTIL IT KNOWS WHO YOU ARE, so a fixed wait
     measures an invisible page. Wait for it to settle instead. */
  const openPage = async (file) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/' + file });
    for (let i = 0; i < 60; i++) {
      await sleep(400);
      const state = String(await ev(
        '(function(){ if(!document.body) return "loading";'
        + ' var b = document.body.getAttribute("data-egbc-blocked");'
        + ' if (b) return "blocked:" + b;'
        /* The STYLE element, not the splash: egbc-guard.js adds the style
         synchronously and the splash later, so asking about the splash
         reads a hidden page as open in the gap between them. reveal()
         removes the style and nothing else does. */
        + ' if (document.getElementById("egbc-guard-style")) return "checking";'
        + ' return "open"; })()'));
      if (state.indexOf('blocked:') === 0 || state === 'open') return state;
    }
    return String(await ev('JSON.stringify({ href: location.href, ready: document.readyState,'
      + ' splash: !!document.getElementById("egbc-guard-splash") })'));
  };

  const text = (sel) => ev('(function(){var e=document.querySelector(' + JSON.stringify(sel) + ');'
    + 'return e?e.textContent.replace(/\\s+/g," ").trim():"(not there)"})()');

  /* ---- the website Give page, as a member ------------------------- */
  console.log('\nthe Give page on the website');
  await signInAs('member');
  await phone();
  let state = await openPage('give.html');
  ok('  it opens for somebody signed in who is on no team', state === 'open', state);
  await sleep(1200);
  let body = String(await text('#body'));
  ok('  the account name is on it', body.includes(GIVING.accountName), body.slice(0, 200));
  ok('  the sort code is on it', body.includes(GIVING.sortCode), body.slice(0, 200));
  ok('  the account number is on it', body.includes(GIVING.accountNumber), body.slice(0, 200));
  ok('  and what to put as the reference', body.includes(GIVING.reference), body.slice(0, 200));
  ok('  Gift Aid is explained', /Gift Aid adds 25p/.test(body), body);
  const gaHref = String(await ev('(function(){var a=document.querySelector("#body a[href]");'
    + 'return a?a.getAttribute("href"):"(no link)"})()'));
  ok('  with a link to the form, the one in the setting', gaHref === GIVING.giftAidUrl, gaHref);
  ok('  and the office\u2019s own line is shown', body.includes(GIVING.note), body.slice(-160));

  /* THE COPY BUTTON HAS TO COPY THE RIGHT THING. navigator.clipboard is
     not available to a headless page, so it is replaced with something
     that records - which is also the only way to read what was put on
     it. The value is compared with the setting, not with the label. */
  const copied = String(await ev('(function(){'
    + 'window.__copied=[];'
    /* defineProperty, NOT assignment. navigator.clipboard is a getter
       on the prototype, so `navigator.clipboard = {...}` is silently
       ignored - the first version of this did that, the page fell back
       to the real (absent) clipboard, and the assertion read [] with
       four buttons happily clicked. */
    + 'Object.defineProperty(navigator,"clipboard",{configurable:true,value:{'
    + ' writeText: function (t) { window.__copied.push(t); return Promise.resolve(); } }});'
    + 'var bs=[].slice.call(document.querySelectorAll("#body [data-copy]"));'
    + 'bs.forEach(function(b){b.click()});'
    + 'return bs.length + " buttons"})()'));
  await sleep(400);
  const got = JSON.parse(String(await ev('JSON.stringify(window.__copied||[])')));
  ok('  every detail has a Copy button', /^4 buttons/.test(copied), copied);
  ok('  and each one copies exactly what the setting says',
    got.join('|') === [GIVING.accountName, GIVING.sortCode, GIVING.accountNumber, GIVING.reference].join('|'),
    JSON.stringify(got));

  /* THE PHONE, measured against 375 and not against innerWidth. The hub's
     notices taught this one: a long unbreakable string widens the layout,
     the viewport shrinks to fit, and a comparison against innerWidth can
     never fail. An account name and a Gift Aid URL are both exactly that
     kind of string. */
  const wide = JSON.parse(String(await ev('(function(){'
    + 'var out={vw:window.innerWidth,doc:Math.round(document.documentElement.scrollWidth),over:[]};'
    + 'var all=[].slice.call(document.querySelectorAll("body *"));'
    + 'for (var i=0;i<all.length;i++){var r=all[i].getBoundingClientRect();'
    + 'if(r.width<=376&&r.right<=376)continue;'
    + 'out.over.push((all[i].className||all[i].tagName)+" "+Math.round(r.width)+"px");'
    + 'if(out.over.length>=4)break;}'
    + 'return JSON.stringify(out)})()')));
  ok('  the phone is still 375px wide once it has laid out',
    wide.vw === 375, 'innerWidth ' + wide.vw);
  ok('  it does not scroll sideways on a phone',
    wide.doc <= 376, wide.doc + 'px of page in 375px');
  ok('  and nothing on it is wider than the phone',
    wide.over.length === 0, wide.over.join('; '));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  if (wantShots) {
    const s1 = await send('Page.captureScreenshot', { format: 'png' });
    if (s1.data) fs.writeFileSync(path.join(SHOTS, 'give--website-375.png'), Buffer.from(s1.data, 'base64'));
  }

  /* ---- nothing set yet ------------------------------------------- */
  console.log('\nbefore the office has typed the details in');
  await del('churchSettings/giving');
  watch.reset();
  state = await openPage('give.html');
  await sleep(1200);
  body = String(await text('#body'));
  ok('  it says the details are not up yet', /not up yet/.test(body), body.slice(0, 200));
  /* The real fault this guards: a label with nothing after it. */
  ok('  and shows no empty labels', !/Sort code|Account number|Account name/.test(body), body.slice(0, 200));
  ok('  no Copy button that would copy nothing',
    String(await ev('document.querySelectorAll("#body [data-copy]").length')) === '0');
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());
  await put('churchSettings/giving', GIVING);

  /* ---- "Give regularly by Direct Debit" (15 Oct 2026) ------------- */
  console.log('\ngiving regularly by Direct Debit');
  await put('paymentSettings/public', { bank: false });
  state = await openPage('give.html'); await sleep(1500);
  ok('  not offered while the church does not take Direct Debits',
    String(await ev('!!document.getElementById("dd-link")')) === 'false');
  await put('paymentSettings/public', { bank: true });
  state = await openPage('give.html'); await sleep(1500);
  ok('  offered once it does, and goes to give-regularly.html',
    String(await ev('(document.querySelector("#dd-link a")||{}).getAttribute ? document.querySelector("#dd-link a").getAttribute("href") : ""')) === 'give-regularly.html');
  await del('paymentSettings/public');

  /* ---- who may set them ------------------------------------------ */
  console.log('\nthe settings card, on the church details page');
  await signInAs('office');
  watch.reset();
  state = await openPage('church-settings.html');
  /* MASTER ADMINS ONLY since 21 Oct 2026 (the reviewing window: Church
     settings opened for any area admin). The office keeps the right to save
     the giving details in the rules, but this page now refuses them - said
     in the report to Martin, with a page of its own for the office offered. */
  ok('  the Church office is refused Church settings now (master admins only)', /Master admins only/.test(state), state);
  await sleep(1500);
  /* What they can SEE: the refusal, and no Giving card on the screen. */
  ok('  and no Giving card on their screen',
    String(await ev('(function(){var b=document.getElementById("g-save");return !!(b&&b.offsetParent)})()')) === 'false');
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  await signInAs('kids');
  watch.reset();
  state = await openPage('church-settings.html');
  ok('  a Kids Church admin is refused it too (master admins only, 21 Oct 2026)',
    /Master admins only/.test(state), state);
  await sleep(1500);
  /* THE ONE THAT MATTERS. The rules refuse them, so the card must not be
     drawn - otherwise they type the church's bank details in and Save is
     refused. */
  ok('  but the Giving card is NOT drawn for them',
    String(await ev('!!document.getElementById("g-save")')) === 'false');
  ok('  and no bank detail is anywhere on their page',
    !String(await ev('document.body.textContent')).includes(GIVING.accountNumber));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  /* ---- the phone app -------------------------------------------- */
  console.log('\nGive on the app\u2019s Me tab');
  await signInAs('member');
  await phone();
  watch.reset();
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/app.html' });
  let drawn = '';
  for (let i = 0; i < 50; i++) {
    await sleep(500);
    drawn = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
      + '.getAttribute("data-drawn") || ""'));
    if (drawn.indexOf(PEOPLE.member.uid + ':') === 0) break;
  }
  ok('  the app drew for them', drawn.indexOf(PEOPLE.member.uid + ':') === 0, drawn || '(never drew)');
  /* THE TAB BAR IS data-tab, NOT data-act. The first version of this
     clicked [data-act="tab:me"], which matches nothing, so the app stayed
     on Home and the check reported the Give row missing from a screen it
     had never opened. It also returned a cheerful "me" either way, which
     is why it took a dump of the page to see. Now it says which tab it
     is actually on, read back from the app's own stamp. */
  const onMe = String(await ev('(function(){'
    + 'var b=document.querySelector("[data-tab=\\"me\\"]");'
    + 'if(!b)return "(no Me tab)";b.click();return "clicked"})()'));
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    const d = String(await ev('(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
      + '.getAttribute("data-drawn") || ""'));
    if (/:me:me:/.test(d)) break;
  }
  ok('  the Me tab opens', /:me:me:/.test(String(await ev(
    '(document.getElementById("egbc-app")||{getAttribute:function(){return ""}})'
    + '.getAttribute("data-drawn") || ""'))), onMe);
  const row = String(await ev('(function(){'
    + 'var r=document.querySelector("[data-act=\\"sheet:give\\"]");'
    + 'return r?r.textContent.replace(/\\s+/g," ").trim():"(no Give row)"})()'));
  ok('  there is a Give row on it', /Give/.test(row), onMe + ': ' + row);
  await ev('document.querySelector("[data-act=\\"sheet:give\\"]").click()');
  await sleep(1400);
  const sheet = String(await text('.sheet'));
  ok('  the sheet shows the account name', sheet.includes(GIVING.accountName), sheet.slice(0, 220));
  ok('  the sort code', sheet.includes(GIVING.sortCode), sheet.slice(0, 220));
  ok('  the account number', sheet.includes(GIVING.accountNumber), sheet.slice(0, 220));
  ok('  the reference', sheet.includes(GIVING.reference), sheet.slice(0, 220));
  ok('  and Gift Aid, with the link', /Gift Aid adds 25p/.test(sheet)
    && String(await ev('(function(){var a=document.querySelector(".sheet a[href]");'
      + 'return a?a.getAttribute("href"):""})()')) === GIVING.giftAidUrl, sheet.slice(-200));
  const appCopied = JSON.parse(String(await ev('(function(){'
    + 'window.__c2=[];'
    + 'Object.defineProperty(navigator,"clipboard",{configurable:true,value:{'
    + ' writeText:function(t){window.__c2.push(t);return Promise.resolve()} }});'
    + 'var bs=[].slice.call(document.querySelectorAll(".sheet [data-act^=\\"copygive:\\"]"));'
    + 'bs.forEach(function(b){b.click()});'
    + 'return JSON.stringify({n:bs.length})})()')));
  await sleep(500);
  const appGot = JSON.parse(String(await ev('JSON.stringify(window.__c2||[])')));
  ok('  every detail on the sheet has a Copy button', appCopied.n === 4, JSON.stringify(appCopied));
  ok('  and each copies exactly what the setting says',
    appGot.join('|') === [GIVING.accountName, GIVING.sortCode, GIVING.accountNumber, GIVING.reference].join('|'),
    JSON.stringify(appGot));
  const appWide = JSON.parse(String(await ev('(function(){'
    + 'var out={vw:window.innerWidth,doc:Math.round(document.documentElement.scrollWidth),over:[]};'
    + 'var sh=document.querySelector(".sheet"); if(!sh) return JSON.stringify(out);'
    + 'var all=[sh].concat([].slice.call(sh.querySelectorAll("*")));'
    + 'for (var i=0;i<all.length;i++){var r=all[i].getBoundingClientRect();'
    + 'if(r.width<=376&&r.right<=376)continue;'
    + 'out.over.push((all[i].className||all[i].tagName)+" "+Math.round(r.width)+"px");'
    + 'if(out.over.length>=4)break;}'
    + 'return JSON.stringify(out)})()')));
  ok('  the sheet fits a 375px phone', appWide.over.length === 0 && appWide.vw === 375,
    'innerWidth ' + appWide.vw + '; ' + appWide.over.join('; '));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  if (wantShots) {
    const s2 = await send('Page.captureScreenshot', { format: 'png' });
    if (s2.data) fs.writeFileSync(path.join(SHOTS, 'give--app-375.png'), Buffer.from(s2.data, 'base64'));
  }

  /* ---- and no real numbers in the repository --------------------- */
  console.log('\nthe repository carries no bank details');
  /* Martin: "NEVER hard-code them in the repo (it's public)". The pages
     read the setting, so there is nothing for them to carry - and this
     is what notices if somebody pastes the real ones in "just to see".
     It looks for the SHAPE of a sort code or an account number, not for
     particular digits, because the real ones are not known here and
     must not be. The check's own synthetic zeros live in this file,
     which is why this file is not one of the ones read. */
  const FILES = ['give.html', 'app.html', 'church-settings.html', 'egbc-church.js'];
  const hits = [];
  for (const f of FILES) {
    const t = fs.readFileSync(path.join(V2, f), 'utf8');
    t.split(/\r?\n/).forEach((lineText, i) => {
      /* A sort code: three pairs of digits, separated or not. An account
         number: eight digits in a row. Dates, sizes and versions are
         ruled out by requiring the separators or exactly eight. */
      const sort = /\b\d{2}[- ]\d{2}[- ]\d{2}\b/.exec(lineText);
      const acct = /\b\d{8}\b/.exec(lineText);
      if (sort || acct) hits.push(f + ':' + (i + 1) + ' ' + (sort || acct)[0]);
    });
  }
  ok('  no sort code or account number is written into any of the pages',
    hits.length === 0, hits.join('; '));

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
