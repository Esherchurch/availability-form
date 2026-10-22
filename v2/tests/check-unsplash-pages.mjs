/* Pictures from Unsplash on the pages (egbc-unsplash.js, in the e-news
 * editor and the card maker), in a real browser, as the church office.
 *
 *   node tests/check-unsplash-pages.mjs        (from v2/)
 *
 * NEEDS AN EMULATOR OF ITS OWN: Firestore and Auth in firebase.comms.json.
 * Unsplash itself is pretend: the search answers come from the server's
 * own photoOf (functions/unsplash.js), and images.unsplash.com is answered
 * on this machine with drawn pictures. Nothing leaves the machine.
 *
 * Asks: Search Unsplash opens the sheet; every picture shows its
 * photographer, linked with the UTM tags; choosing one puts it in the
 * block shown from images.unsplash.com, keeps its credit, and pings its
 * download_location; the email has "Photo by <name> on Unsplash" under it,
 * and loses it when the picture is changed; the card maker draws it and
 * puts the credit in the caption.
 *
 * Also writes the screenshots for Unsplash's Production application to
 * design-mocks/comms/unsplash/ (synthetic: no real people).
 *
 * The box (22 Oct): its own white background and rounded corners, above
 * the page - at the top and scrolled down, at a computer's width and a
 * phone's (the card maker's --card is a shadow, so the box was see-through).
 *
 * DELIBERATE BREAKS: --break=boxbg (the box takes the page's --card again);
 * --break=credit (no credit in the email);
 * --break=ping (the download ping not sent). Each must turn this red.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { photoOf } from '../functions/unsplash.js';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync('firebase.comms.json', 'utf8'));
const FS = C1.emulators.firestore.port, AU = C1.emulators.auth.port;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9791, SERVE = 9008, PW = 'test-only-password';
const SHOTS = path.join(V2, 'design-mocks', 'comms', 'unsplash');
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };
const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').slice(8);
const BREAKS = {
  credit: ['egbc-mailblocks.js', "    if (!c || !c.name || c.url !== src) return '';", "    return '';"],
  ping: ['egbc-enews-editor.js', '        EGBCUnsplash.used(p);\n', ''],
  boxbg: ['egbc-unsplash.js', "'.us{position:relative;z-index:1;background:#ffffff;", "'.us{position:relative;z-index:1;background:var(--card,#fff);"]
};
if (BREAK && !BREAKS[BREAK]) { console.log('Unknown break: ' + BREAK); process.exit(2); }
/* The email is made by the same egbc-mailblocks.js the page has (broken too, on a break). */
const MB = (() => { let src = fs.readFileSync(path.join(V2, 'egbc-mailblocks.js'), 'utf8').replace(/\r\n/g, '\n'); if (BREAK && BREAKS[BREAK][0] === 'egbc-mailblocks.js') src = src.split(BREAKS[BREAK][1]).join(BREAKS[BREAK][2]); const module = { exports: {} }; vm.runInNewContext(src, { module, exports: module.exports, Intl, Date }); return module.exports; })();

/* The pretend Unsplash's photos, as the real API sends them, through the
   server's own photoOf - so the page sees exactly what the server gives. */
const NAMES = ['Sam Synthetic', 'Alex Example', 'Robin Placeholder', 'Jo Testcase', 'Kit Sample', 'Lee Mockup', 'Pat Dummy', 'Ash Fixture'];
const HUES = [[28, 70], [200, 55], [130, 40], [45, 80], [10, 60], [260, 35], [170, 45], [330, 40]];
const RAW = NAMES.map((n, i) => ({
  id: 'syn' + i, width: 4000, height: 2667, color: '#7a8a7a', alt_description: ['autumn leaves on a path', 'a lake at dawn', 'green hills', 'a field of wheat', 'candles', 'mountains at dusk', 'a coast', 'flowers'][i],
  urls: { thumb: 'https://images.unsplash.com/photo-syn' + i + '?ixid=SYN' + i + '&w=200', small: 'https://images.unsplash.com/photo-syn' + i + '?ixid=SYN' + i + '&w=400', regular: 'https://images.unsplash.com/photo-syn' + i + '?ixid=SYN' + i + '&w=1080' },
  links: { html: 'https://unsplash.com/photos/syn' + i, download_location: 'https://api.unsplash.com/photos/syn' + i + '/download?ixid=SYN' + i },
  user: { name: n, username: 'synthetic' + i, links: { html: 'https://unsplash.com/@synthetic' + i } }
}));
const PHOTOS = RAW.map(photoOf);
/* A drawn landscape for each, in its own colours. */
const art = i => { const [h, s] = HUES[i % HUES.length];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="720" viewBox="0 0 1080 720"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(' + h + ',' + s + '%,78%)"/><stop offset="1" stop-color="hsl(' + (h + 20) + ',' + s + '%,52%)"/></linearGradient></defs>' +
    '<rect width="1080" height="720" fill="url(#g)"/><circle cx="' + (300 + i * 70) + '" cy="210" r="80" fill="hsl(' + (h + 30) + ',90%,88%)" opacity=".9"/>' +
    '<path d="M0 520 Q270 400 540 500 T1080 470 V720 H0Z" fill="hsl(' + (h + 60) + ',' + s + '%,32%)"/><path d="M0 600 Q300 520 620 610 T1080 590 V720 H0Z" fill="hsl(' + (h + 80) + ',' + s + '%,22%)"/></svg>'; };

const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => res({ status: s.statusCode, body: x })); });
  r.on('error', rej); r.end(d);
});
function fsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsValue(x)])) } };
}
function fromFs(v) {
  if (!v) return v;
  if ('stringValue' in v) return v.stringValue; if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue; if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  return v;
}
const put = (p, data) => req(FS, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }, OWNER);
const list = async c => { const r = JSON.parse((await req(FS, 'GET', DOCS + '/' + c + '?pageSize=100', undefined, OWNER)).body || '{}'); return (r.documents || []).map(d => Object.assign({ _id: d.name.split('/').pop() }, Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromFs(v)])))); };
const subOf = async email => (await list('enewsSubscribers')).find(s => s.email === email);

const USERS = { office: { email: 'us.office@example.invalid', member: 'ab_us_office', teams: ['Church office'] } };
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
const swap = (src, from, to, file) => { if (!src.includes(from)) throw new Error(file + ' no longer has the line this check rewrites: ' + from.slice(0, 60)); return src.split(from).join(to); };
const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(Date.now() + n * 86400000));
let EMAIL = '';

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  try { await req(FS, 'GET', '/'); await req(AU, 'GET', '/'); } catch (e) { console.log('  FAIL  no emulator - start it first (see the header)'); process.exit(1); }
  await req(FS, 'DELETE', '/emulator/v1/projects/egbc-worship-planner/databases/(default)/documents');
  for (const u of Object.values(USERS)) {
    let up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: u.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: u.email, password: PW, returnSecureToken: true })).body || '{}');
    u.uid = up.localId;
    await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/projects/egbc-worship-planner/accounts:update', { localId: u.uid, emailVerified: true }, OWNER);
    await put('addressBook/' + u.member, { name: 'Una Office', email: u.email, markers: u.teams, archived: false });
    await put('users/' + u.uid, { uid: u.uid, email: u.email, name: 'Una Synthetic', memberId: u.member, status: 'active', linkedBy: 'admin', teams: u.teams, adminFor: [], masterAdmin: false, attender: true });
  }
  await put('churchSettings/details', { name: 'Synthetic Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '' });
  await put('churchSettings/features', { cardMaker: true });
  await put('calEvents/us_ev', { title: 'Synthetic harvest supper', visibility: 'public', status: 'confirmed', audience: ['public'], startLocal: day(6) + 'T18:30', startUtc: Date.parse(day(6) + 'T18:30:00Z'), image: '', location: 'Synthetic church hall' });
  await put('enewsIssues/us1', { subject: 'Harvest news', preheader: '', template: 'classic', status: 'draft', week: 'x', createdAt: 'x', createdBy: 'x', updatedAt: 'x', updatedBy: 'x',
    blocks: [{ type: 'header', imageUrl: '', alt: '' }, { type: 'text', html: '<p>Our harvest supper is on Saturday: all welcome.</p>' }] });

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    if (url === '/__email.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(EMAIL); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase(), b = path.basename(f);
    let body = fs.readFileSync(f);
    try {
      if (b === 'egbc-auth.js') body = Buffer.from(swap(body.toString('utf8'), '{ firestore: 8181, auth: 9099, storage: 9199 }', '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399 }', b), 'utf8');
      if (BREAK && b === BREAKS[BREAK][0]) body = Buffer.from(swap(body.toString('utf8').replace(/\r\n/g, '\n'), BREAKS[BREAK][1], BREAKS[BREAK][2], b), 'utf8');
    } catch (err) { console.log('  FAIL  ' + err.message); s.writeHead(500); return s.end(); }
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' }[e] || 'application/octet-stream') + (e === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-enews-us-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--no-first-run', '--disable-features=BackForwardCache', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(tabs.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(), errors = [], dialogs = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || m.error || {}); pend.delete(m.id); }
      /* A page's alert or confirm would stop everything: say yes, and note it. */
    if (m.method === 'Page.javascriptDialogOpening') { dialogs.push(m.params.message); ws.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text)); return r.result && r.result.value; };
  const until = async (x, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x).catch(() => false)) return true; await sleep(250); } return false; };
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  /* images.unsplash.com, answered here: a drawn picture, with the CORS
     header Unsplash's own servers send (so the card maker can draw it). */
  const offAsked = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method !== 'Fetch.requestPaused') return;
    const u = m.params.request.url;
    const hit = /^https:\/\/images\.unsplash\.com\/photo-syn(\d+)/.exec(u);
    if (hit) return send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/svg+xml' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: Buffer.from(art(+hit[1])).toString('base64') });
    if (/^https:\/\/(api\.)?unsplash\.com/.test(u)) { offAsked.push(u); return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); }
    send('Fetch.continueRequest', { requestId: m.params.requestId });
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://images.unsplash.com/*' }, { urlPattern: 'https://api.unsplash.com/*' }, { urlPattern: 'https://unsplash.com/*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });
  const shot = async (name) => { if (BREAK) return; const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64')); };
  const signIn = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(1500);
    await ev('firebase.auth(EGBCAuth.app).signOut().then(()=>1)');
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(USERS[who].email) + ',' + JSON.stringify(PW) + ').then(()=>1)');
  };
  /* The server's two callables, pretend: what the page asks is written down. */
  const fakeCalls = () => ev(`(function(){window.__us=[];var o=EGBCAuth.call;var P=${JSON.stringify(PHOTOS)};
    EGBCAuth.call=function(n,d){if(n==='unsplashSearch'){__us.push([n,d]);return Promise.resolve({photos:P,total:P.length,pages:1,words:String(d.q||'').toLowerCase()});}
      if(n==='unsplashUsed'){__us.push([n,d]);return Promise.resolve({pinged:true});}return o.apply(this,arguments);};return 1})()`);
  const C = 'document.getElementById("cv").contentDocument';
  const issue = async () => (await list('enewsIssues')).find(d => d._id === 'us1') || {};

  try {
    await signIn('office');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews-edit.html?issue=us1' });
    await until(C + ' && ' + C + '.querySelectorAll("[data-b]").length > 0', 25000); await sleep(1000);
    await fakeCalls();
    await ev(C + '.querySelector(\'[data-b="0"]\').click(),1'); await until('!!document.getElementById("f-unsplash")', 8000);
    ok('the week\u2019s picture offers Search Unsplash', await ev('!!document.getElementById("f-unsplash")'));
    await ev('document.getElementById("f-unsplash").click(),1'); await until('!!document.querySelector(".us")', 5000);
    await ev('var q=document.getElementById("us-q");q.value="autumn";document.querySelector(".us form").dispatchEvent(new Event("submit",{cancelable:true})),1');
    await until('document.querySelectorAll(".us [data-i]").length===8', 8000); await sleep(1200);
    const caps = await ev('[...document.querySelectorAll(".us figcaption")].map(f=>f.textContent+"|"+[...f.querySelectorAll("a")].map(a=>a.href).join(",")).join(";;")');
    ok('every picture shows "Photo by <name> on Unsplash", linked with the UTM tags', caps.split(';;').length === 8 && caps.split(';;').every(c => /^Photo by .+ on Unsplash\|https:\/\/unsplash\.com\/@synthetic\d\?utm_source=church_hq&utm_medium=referral,https:\/\/unsplash\.com\/\?utm_source=church_hq&utm_medium=referral$/.test(c)), caps.slice(0, 300));
    ok('the search went to the server (the key never in the page)', (await ev('JSON.stringify(__us)')).includes('"unsplashSearch"') && !(await ev('document.documentElement.outerHTML')).includes('Client-ID'));
    await shot('1-search');
    await ev('document.querySelector(\'.us [data-i="0"]\').click(),1'); await sleep(2000);
    let is = await issue();
    const h = (is.blocks || [])[0] || {};
    ok('chosen: shown from images.unsplash.com, its credit kept with it', h.imageUrl === PHOTOS[0].regular && h.credit && h.credit.name === 'Sam Synthetic' && h.credit.profile === PHOTOS[0].profile && h.credit.url === PHOTOS[0].regular && h.alt === 'autumn leaves on a path', h);
    const used = JSON.parse(await ev('JSON.stringify(__us.filter(function(c){return c[0]==="unsplashUsed"}))'));
    ok('Unsplash is told it was used (its download_location)', used.length === 1 && used[0][1].downloadLocation === PHOTOS[0].downloadLocation, used);
    ok('the editor shows the credit', /Photo by Sam Synthetic on Unsplash/.test(await ev('document.getElementById("side").innerText')) && /Photo by/.test(await ev(C + '.body.innerText')));
    await shot('2-editor');
    const church = { name: 'Synthetic Green Church' };
    const html = MB.render(is, { version: 'everyone', church, unsubscribeUrl: MB.PLACEHOLDER });
    ok('the email: "Photo by <name> on Unsplash" under it, both linked with the UTM tags', /Photo by <a href="https:\/\/unsplash\.com\/@synthetic0\?utm_source=church_hq&amp;utm_medium=referral"[^>]*>Sam Synthetic<\/a> on <a href="https:\/\/unsplash\.com\/\?utm_source=church_hq&amp;utm_medium=referral"[^>]*>Unsplash<\/a>/.test(html), (html.match(/Photo by.{0,300}/) || [''])[0]);
    ok('the picture is hotlinked in the email, ixid kept', html.includes('src="' + PHOTOS[0].regular.replace(/&/g, '&amp;') + '"'));
    EMAIL = html;
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__email.html' }); await sleep(1500);
    await shot('3-email');
    const other = MB.render(Object.assign({}, is, { blocks: [Object.assign({}, h, { imageUrl: 'https://images.example.invalid/ours.jpg' })] }), { version: 'everyone', church, unsubscribeUrl: MB.PLACEHOLDER });
    ok('the picture changed to one of ours: the credit goes', !/on Unsplash/.test(other.replace(/Pictures shown from/, '')));

    /* The card maker. */
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/cardmaker.html?event=us_ev' });
    await until('!!document.getElementById("w-unsplash")', 20000); await sleep(1500);
    await fakeCalls();
    /* The box: its own background and corners, above everything. */
    const boxAt = async () => {
      await ev('document.getElementById("w-unsplash").click(),1'); await until('!!document.querySelector(".us")', 5000);
      await ev('var q=document.getElementById("us-q");q.value="harvest";document.querySelector(".us form").dispatchEvent(new Event("submit",{cancelable:true})),1');
      await until('document.querySelectorAll(".us [data-i]").length===8', 8000); await sleep(700);
      const r = await ev('(function(){var u=document.querySelector(".us"),cs=getComputedStyle(u),t=u.querySelector(\'[data-i="0"]\').getBoundingClientRect(),b=u.getBoundingClientRect();' +
        'var pts=[[t.left+t.width/2,t.top+t.height/2],[b.left+12,b.top+b.height/2],[b.right-12,b.bottom-12],[b.left+b.width/2,b.top+12]];' +
        'return {bg:cs.backgroundColor,radius:parseFloat(cs.borderTopLeftRadius),onTop:pts.every(function(q){var e=document.elementFromPoint(q[0],q[1]);return !!(e&&e.closest(".us"))}),y:scrollY}})()');
      await ev('document.querySelector(".us .us-x").click(),1'); await sleep(300);
      return r;
    };
    const boxOk = r => r && r.bg === 'rgb(255, 255, 255)' && r.radius >= 8 && r.onTop;
    let bx = await boxAt();
    ok('the Unsplash box has its own white background and rounded corners, above the page (computer, top of the page)', boxOk(bx), bx);
    await ev('window.scrollTo(0, document.documentElement.scrollHeight),1'); await sleep(400);
    bx = await boxAt();
    ok('…the same scrolled down, over the card (computer)', boxOk(bx) && bx.y > 200, bx);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true }); await sleep(600);
    await ev('window.scrollTo(0, 0),1'); await sleep(300);
    bx = await boxAt();
    ok('…on a phone, at the top', boxOk(bx), bx);
    await ev('window.scrollTo(0, document.documentElement.scrollHeight),1'); await sleep(400);
    bx = await boxAt();
    ok('…and on a phone, scrolled down', boxOk(bx) && bx.y > 200, bx);
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false }); await sleep(500);
    await ev('window.scrollTo(0, 0),1'); await sleep(300);
    await ev('document.getElementById("w-unsplash").click(),1'); await until('!!document.querySelector(".us")', 5000);
    await ev('var q=document.getElementById("us-q");q.value="harvest";document.querySelector(".us form").dispatchEvent(new Event("submit",{cancelable:true})),1');
    await until('document.querySelectorAll(".us [data-i]").length===8', 8000); await sleep(800);
    await ev('document.querySelector(\'.us [data-i="3"]\').click(),1');
    await until('!!window.EGBCCards.state.photo', 8000); await sleep(800);
    ok('the card maker draws the picture from Unsplash', (await ev('EGBCCards.state.photoUrl')) === PHOTOS[3].regular && await ev('!!EGBCCards.state.photo'));
    ok('…and its caption ends "Photo by <name> on Unsplash"', /\n\nPhoto by Jo Testcase on Unsplash$/.test(await ev('document.getElementById("s-cap").value')), await ev('document.getElementById("s-cap").value'));
    ok('…and Unsplash is told it was used', (await ev('JSON.stringify(__us)')).includes(PHOTOS[3].downloadLocation.replace(/&/g, '\\u0026').slice(0, 40)) || (await ev('JSON.stringify(__us)')).includes('syn3/download'));
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1700, deviceScaleFactor: 1, mobile: false }); await sleep(400);
    await ev('window.scrollTo(0, document.getElementById("cv").getBoundingClientRect().top + scrollY - 90),1'); await sleep(800);
    await shot('4-card-maker');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false }); await sleep(300);
    await ev('var c=document.getElementById("s-cap");c.style.height="340px";c.scrollTop=c.scrollHeight;c.scrollIntoView({block:"center"}),1'); await sleep(400);
    await shot('5-caption');
    ok('nothing went to Unsplash itself from the page', offAsked.length === 0, offAsked);
    ok('no errors thrown', errors.length === 0, errors);
  } catch (e) {
    ok('the run finished', false, e.message);
  }
  ws.close(); chrome.kill(); server.close();
  const fails = R.filter(v => !v).length;
  console.log('\n' + (R.length - fails) + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
