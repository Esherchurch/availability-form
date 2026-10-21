/* Val's card maker in a real browser, at 375px (FINDINGS-comms C-17).
 *
 *   node tests/check-cardmaker.mjs           (from v2/)
 *
 * NEEDS AN EMULATOR OF ITS OWN: Firestore and Auth from
 * firebase.comms.json (see check-enews-page.mjs). Pages are served from
 * here with egbc-auth.js pointed at it; the first check proves it.
 *
 * Asks: off until switched on; refused to a church member; a not-listed
 * event is never offered; picking an event fills the words; THE WORDS ARE
 * ALL THERE IN THE FIRST FRAME for every movement (Outlook shows only the
 * first); the GIF is a real animated GIF; the picture is the right size
 * (A5 at print size); a video is made; it fits 375px.
 *
 * DELIBERATE BREAKS: --break=fade makes the words come in half way (not
 * in the first frame); --break=switch shows the page while switched off. Each
 * must turn this check red. --break=details drops the caption's 📅 day line;
 * --break=versefit stops a long verse shrinking to fit.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/* London wall-clock to real time, right on both sides of the clocks changing
   (a fixed hour off was wrong for events on or after 25 Oct). */
const londonUtc = (iso) => { const guess = Date.parse(iso + ':00Z'); const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).forEach(x => { p[x.type] = x.value; }); const shown = Date.parse(p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':00Z'); return guess - (shown - guess); };
const V2 = path.resolve('.');
const CFG = JSON.parse(fs.readFileSync(process.env.EGBC_FIREBASE_CONFIG || 'firebase.comms.json', 'utf8'));
const FS = CFG.emulators.firestore.port, AU = CFG.emulators.auth.port;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9789, SERVE = 8998, PW = 'test-only-password';
const SHOTS = path.join(V2, 'tests', 'shots');
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let DAY0 = '';
const BREAK = (process.argv.find(a => a.startsWith('--break=')) || '').slice(8);
const BREAKS = {
  fade: ["ctx.fillStyle = colour; ctx.textBaseline = 'top';", "ctx.fillStyle = colour; ctx.textBaseline = 'top'; if (t < 0.5) return;"],
  switch: ["if (!(EGBCAuth.uses && EGBCAuth.uses('cardMaker'))) {", 'if (false) {'],
  details: ["['\\uD83D\\uDCC5 ' + o.weekday", "[o.weekday"],
  versefit: ['if (lines.length * z * 1.3 <= maxH) return', 'if (true) return'],
  nofit: ['var fits = h <= boxH && widest <= maxW;', 'var fits = true;']
};
if (BREAK && !BREAKS[BREAK]) { console.log('Unknown break: ' + BREAK); process.exit(2); }

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };
const req = (port, method, p, body, hdr) => new Promise((res, rej) => {
  const d = body === undefined ? null : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: Object.assign(d ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
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
const list = async c => { const r = JSON.parse((await req(FS, 'GET', DOCS + '/' + c + '?pageSize=100', undefined, OWNER)).body || '{}'); return (r.documents || []).map(d => Object.assign({ _id: d.name.split('/').pop() }, Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromFs(v)])))); };
const put = (p, data) => req(FS, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }, OWNER);
const PEOPLE = {
  office: { email: 'cards.office@example.invalid', member: 'ab_cards_office', teams: ['Church office'] },
  member: { email: 'cards.member@example.invalid', member: 'ab_cards_member', teams: [], churchMember: true }
};
const SIGNIN = '<!DOCTYPE html><html><head><meta charset="utf-8">'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>'
  + '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>'
  + '<script src="egbc-auth.js"></script></head><body>harness</body></html>';
const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
/* Until egbc-auth.js has EGBCAuth.uses (the main window's F-230), the same
   stand-in as check-enews-page.mjs. */
function serveAuth(src) {
  const out = src.replace('{ firestore: 8181, auth: 9099, storage: 9199 }', '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399 }');
  if (out === src) throw new Error('egbc-auth.js no longer has the emulator line this check rewrites');
  if (/\buses:\s*function/.test(src)) return out;
  return out + '\n;(function(){var F={};var A=window.EGBCAuth;if(!A)return;'
    + 'A.uses=function(n){var v=F[n];if(typeof v==="boolean")return v;return ["enews","cardMaker","canva"].indexOf(n)<0;};'
    + 'var r=A.require;A.require=function(o){return r.call(A,o).then(function(p){return A.db.collection("churchSettings").doc("features").get().then(function(s){F=(s.exists&&s.data())||{};return p;},function(){return p;});});};})();';
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  try { await req(FS, 'GET', '/'); await req(AU, 'GET', '/'); } catch { console.log('  FAIL  no emulator on ' + FS + '/' + AU); process.exit(1); }
  await req(FS, 'DELETE', '/emulator/v1/projects/egbc-worship-planner/databases/(default)/documents');
  /* Martin, 19 Oct: at EGBC the add-ons start ON when nothing is stored
     (features.js), so "off" is stored here to prove the page obeys it. */
  await put('churchSettings/features', { cardMaker: false });
  for (const p of Object.values(PEOPLE)) {
    let up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId;
    await put('addressBook/' + p.member, { name: 'Cards Synthetic', email: p.email, markers: p.teams, churchMember: p.churchMember === true, archived: false });
    await put('users/' + p.uid, { uid: p.uid, email: p.email, name: 'Cards Synthetic', memberId: p.member, status: 'active', teams: p.teams, adminFor: [], masterAdmin: false, churchMember: p.churchMember === true, attender: true });
  }
  const day = n => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(Date.now() + n * 86400000));
  const at = (n, hh) => ({ startLocal: day(n) + 'T' + hh, startUtc: londonUtc(day(n) + 'T' + hh) });
  const IMG = 'http://localhost:' + SERVE + '/design-mocks/comms/card-photo.svg';
  await put('calEvents/cm_pub', Object.assign({ title: 'Synthetic harvest supper and barn dance', visibility: 'public', status: 'confirmed', audience: ['public', 'members'], signupOn: true, image: IMG, labels: ['Harvest'], location: 'Synthetic church hall' }, at(5, '18:30')));
  await put('calEvents/cm_soon', Object.assign({ title: 'Synthetic coffee morning', visibility: 'public', status: 'confirmed', audience: ['public', 'members'], image: '' }, at(7, '10:00')));
  DAY0 = day(0);
  await put('calEvents/cm_unl', Object.assign({ title: 'Synthetic quiet group', visibility: 'unlisted', status: 'confirmed', audience: ['unlisted'] }, at(3, '19:00')));

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    try {
      if (path.basename(f) === 'egbc-auth.js') body = Buffer.from(serveAuth(body.toString('utf8')), 'utf8');
      if (BREAK && path.basename(f) === 'cardmaker.html') {
        const t = body.toString('utf8'), [from, to] = BREAKS[BREAK];
        if (!t.includes(from)) throw new Error('break "' + BREAK + '": that line is not in cardmaker.html any more - update the break');
        body = Buffer.from(t.replace(from, to), 'utf8');
      }
    } catch (err) { console.log('  FAIL  ' + err.message); s.writeHead(500); return s.end(); }
    if (e === '.html') { const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t); body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : t, 'utf8'); }
    s.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[e] || 'application/octet-stream') + (e === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    s.end(body);
  }).listen(SERVE);

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-cards-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(tabs.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(), errors = [];
  const send = (m, p = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(r => ws.onopen = r);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  const ev = async (x) => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text)); return r.result && r.result.value; };
  const until = async (x, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x).catch(() => false)) return true; await sleep(250); } return false; };
  const text = () => ev('document.getElementById("wrap").innerText');
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, 'cardmaker-375-' + n + '.png'), Buffer.from(r.data, 'base64')); };
  const signIn = async (who) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' }); await sleep(1500);
    await ev('firebase.auth(EGBCAuth.app).signOut().then(()=>1)');
    await ev('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(PEOPLE[who].email) + ',' + JSON.stringify(PW) + ').then(()=>1)');
  };
  const open = async () => { await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/cardmaker.html' }); await until('document.getElementById("wrap") && !/Loading/.test(document.getElementById("wrap").innerText)', 20000); await sleep(800); };
  /* Downloads are caught as blobs, not saved. */
  const CATCH = 'window.__got=[];URL.createObjectURL=function(b){window.__got.push(b);return "blob:caught"};HTMLAnchorElement.prototype.click=function(){};1';
  const blobInfo = '(async()=>{const b=window.__got[window.__got.length-1];if(!b)return null;const a=new Uint8Array(await b.arrayBuffer());let gce=0,i=13+((a[10]&0x80)?3*(2<<(a[10]&7)):0);while(i<a.length&&a[i]!==0x3B){if(a[i]===0x21){if(a[i+1]===0xF9)gce++;i+=2;while(a[i]){i+=a[i]+1;}i++;}else if(a[i]===0x2C){const f=a[i+9];i+=10;if(f&0x80)i+=3*(2<<(f&7));i++;while(a[i]){i+=a[i]+1;}i++;}else break;}let w=0,h=0;if(/png/.test(b.type)){const bm=await createImageBitmap(b);w=bm.width;h=bm.height;}return{type:b.type,size:b.size,head:String.fromCharCode.apply(null,a.slice(0,6)),gce:gce,w:w,h:h}})()';

  try {
    await signIn('office');
    await open();
    const host = await ev('(function(){try{return EGBCAuth.db._delegate._settings.host}catch(e){return ""}})()');
    ok('the page talks to this check\u2019s emulator (' + host + ')', host === 'localhost:' + FS, host);
    if (host !== 'localhost:' + FS) throw new Error('not proven to be on the emulator');
    ok('off until switched on', /switched off/.test(await text()), await text());
    await put('churchSettings/features', { cardMaker: true });
    await signIn('member'); await open();
    ok('a church member is told it is for the office', /for the church office/.test(await text()));
    await signIn('office'); await open();
    await until('!!document.getElementById("cv")');
    const opts = await ev('[...document.querySelectorAll("#ev option")].map(o=>o.textContent).join(" | ")');
    ok('the event is offered; a not-listed one never is', /Synthetic harvest supper/.test(opts) && !/quiet group/.test(opts), opts);
    await until('!!window.EGBCCards.state.photo', 8000);
    ok('picking it fills the words and the photo', (await ev('document.getElementById("w-title").value')) === 'Synthetic harvest supper and barn dance' &&
      (await ev('document.getElementById("w-button").value')) === 'Sign up' && await ev('!!window.EGBCCards.state.photo'));
    ok('the e-news size is Val\u2019s 940\u00d7788', (await ev('document.getElementById("cv").width+"x"+document.getElementById("cv").height')) === '940x788');
    await shot('enews');
    { const u = await ev('document.getElementById("cv").toDataURL("image/png")'); fs.writeFileSync(path.join(SHOTS, 'card-preview-canvas.png'), Buffer.from(u.split(',')[1], 'base64')); }

    /* The words in the first frame, for every style and movement: frame 1
       with the words and frame 1 without them must differ a lot. */
    const firstFrame = await ev(`(function(){
      var S=EGBCCards.state, out={}, keep=JSON.parse(JSON.stringify(S.words)), mv=S.move, st=S.style;
      ['shade','panel','below'].forEach(function(style){ ['none','zoom','pan','pulse'].forEach(function(move){
        S.style=style; S.move=move;
        var a=document.createElement('canvas'); a.width=470; a.height=394; EGBCCards.draw(a,0);
        S.words={kicker:'',title:' ',when:'',button:''};
        var b=document.createElement('canvas'); b.width=470; b.height=394; EGBCCards.draw(b,0);
        S.words=JSON.parse(JSON.stringify(keep));
        var A=a.getContext('2d').getImageData(0,0,470,394).data, B=b.getContext('2d').getImageData(0,0,470,394).data, d=0;
        for(var i=0;i<A.length;i+=4){ if(Math.abs(A[i]-B[i])+Math.abs(A[i+1]-B[i+1])+Math.abs(A[i+2]-B[i+2])>90) d++; }
        out[style+'/'+move]=d;
      });});
      S.style=st; S.move=mv; return out; })()`);
    /* The first frame of each style, saved for a person to look at. */
    for (const style of ['shade', 'panel', 'below']) {
      const url = await ev('(function(){var S=EGBCCards.state,st=S.style,mv=S.move;S.style="' + style + '";S.move="zoom";var c=document.createElement("canvas");c.width=940;c.height=788;EGBCCards.draw(c,0);S.style=st;S.move=mv;return c.toDataURL("image/png")})()');
      fs.writeFileSync(path.join(SHOTS, 'card-' + style + '-940x788.png'), Buffer.from(url.split(',')[1], 'base64'));
    }
    /* Every style in every size: the words inside their space, nothing
       over the edge of the panel or off the bottom. */
    const spill = await ev("(function(){var S=EGBCCards.state,st=S.style,out=[];Object.keys(EGBCCards.SIZES).forEach(function(k){var z=EGBCCards.SIZES[k];['shade','panel','below'].forEach(function(style){S.style=style;var c=document.createElement('canvas');c.width=z.w;c.height=z.h;var L=EGBCCards.draw(c,0);if(!L||!L.fits||L.top<L.boxTop-1||L.bottom>L.boxBottom+1||L.right>L.x+L.maxW+1)out.push(k+'/'+style+' '+JSON.stringify(L&&{top:Math.round(L.top),bottom:Math.round(L.bottom),boxTop:L.boxTop,boxBottom:L.boxBottom,right:Math.round(L.right),edge:L.x+L.maxW}));});});S.style=st;return out;})()");
    ok('the words fit their space, every style in every size', spill.length === 0, spill);
    ok('times read like the e-news (6:30pm)', /6:30pm/.test(await ev('document.getElementById("w-when").value')), await ev('document.getElementById("w-when").value'));
    const weak = Object.entries(firstFrame).filter(([, d]) => d < 1500);
    ok('the words are all there in the first frame, every style and movement (Outlook shows only that)', weak.length === 0, weak);

    await ev(CATCH);
    await ev('[...document.querySelectorAll("#moves button")].find(b=>b.dataset.v==="zoom").click(),1');
    await ev('document.getElementById("o-gif").click(),1');
    await until('window.__got.length>0', 60000);
    const gif = await ev(blobInfo);
    ok('the GIF is an animated GIF (GIF89a, 14 frames)', gif && gif.type === 'image/gif' && gif.head === 'GIF89a' && gif.gce === 14, gif);
    ok('and small enough for an email (under 3 MB)', gif && gif.size < 3 * 1048576, gif && gif.size);
    await ev('[...document.querySelectorAll("#moves button")].find(b=>b.dataset.v==="none").click(),1');
    await ev('document.getElementById("o-gif").click(),1');
    await until('window.__got.length>1', 60000);
    const still = await ev(blobInfo);
    ok('"None" makes a still GIF (one frame)', still && still.gce === 1, still);

    await ev('[...document.querySelectorAll("#sizes button")].find(b=>b.dataset.v==="a5").click(),1'); await sleep(400);
    await ev('document.getElementById("o-png").click(),1');
    await until('window.__got.length>2', 20000);
    const png = await ev(blobInfo);
    ok('A5 is a print-size picture (1748\u00d72480)', png && png.type === 'image/png' && png.w === 1748 && png.h === 2480, png);
    await shot('a5');

    await ev('[...document.querySelectorAll("#sizes button")].find(b=>b.dataset.v==="insta").click(),1'); await sleep(400);
    await ev('[...document.querySelectorAll("#moves button")].find(b=>b.dataset.v==="pulse").click(),1');
    ok('Instagram offers a video, not a GIF', await ev('!!document.getElementById("o-vid") && !document.getElementById("o-gif")'));
    await ev('document.getElementById("o-vid").click(),1');
    await until('window.__got.length>3', 30000);
    const vid = await ev(blobInfo);
    ok('a short video is made (MP4 where the browser can, otherwise WebM)', vid && /^video\/(mp4|webm)$/.test(vid.type) && vid.size > 20000, vid);
    await shot('insta');


    /* Social posts, step 1 (plan H): sizes, the caption, Copy / Share /
       Download, a countdown, Today's posts, the verse and the verse of the day. */
    const sizes = await ev('[...document.querySelectorAll("#sizes button")].map(b=>b.dataset.v+":"+b.textContent).join("|")');
    ok('Instagram is the church’s portrait 1080×1350, with square, Facebook and Story too', /portrait:Instagram1080×1350/.test(sizes) && /story:Story1080×1920/.test(sizes) && /insta:Square1080×1080/.test(sizes), sizes);
    await ev('document.getElementById("ev").value="cm_pub";document.getElementById("ev").dispatchEvent(new Event("change")),1'); await sleep(500);
    await ev('var o=document.getElementById("s-open");o.value="Bring a dish!";o.dispatchEvent(new Event("input"));var t=document.getElementById("s-tags");t.value="#SyntheticHarvest #esherchurch";t.dispatchEvent(new Event("input")),1');
    const cap = await ev('document.getElementById("s-cap").value');
    ok('the caption is written the church’s way: first line, then 📅 🕝 📍 🎟 👉, then the hashtags', /^Bring a dish!\n\n📅 \w+day \d{1,2}(st|nd|rd|th) \w+\n🕝 6:30pm\n📍 Synthetic church hall\n🎟 Book your place here:\n👉 http:\/\/localhost:\d+\/signup\.html\?event=cm_pub\n\n#SyntheticHarvest #esherchurch$/.test(cap), cap);
    await ev('document.getElementById("s-keep").click(),1'); await sleep(1500);
    const sset = (await list('socialSettings')).find(d => d._id === 'main') || {};
    ok('"Keep these for this event": its hashtags are kept', JSON.stringify(sset.sets || {}).includes('#SyntheticHarvest'), sset);
    await ev('navigator.clipboard&&(navigator.clipboard.writeText=function(t){window.__clip=t;return Promise.resolve()}),window.__clip="",document.getElementById("s-copy").click(),1'); await sleep(400);
    ok('Copy caption copies it', (await ev('window.__clip')) === cap);
    const before = await ev('window.__got.length');
    await ev('navigator.canShare=function(){return false},window.__clip="",document.getElementById("s-share").click(),1');
    await until('window.__got.length>' + before, 20000);
    ok('Share: where a browser can’t share a picture, the caption is copied and the picture downloads', (await ev('window.__clip')) === cap && /Caption copied/.test(await ev('document.getElementById("toast").textContent')));
    const b2 = await ev('window.__got.length');
    await ev('document.getElementById("s-dl").click(),1');
    await until('window.__got.length>=' + (b2 + 4), 40000);
    const dims = await ev('Promise.all(window.__got.slice(' + b2 + ').map(function(g){return createImageBitmap(g).then(function(i){return i.width+"x"+i.height})})).then(function(a){return a.join(",")})');
    ok('Download the pictures: Instagram, square, Facebook and Story', dims === '1080x1350,1080x1080,1200x630,1080x1920', dims);
    /* A countdown: tomorrow's coffee morning has today's post. */
    await ev('document.getElementById("ev").value="cm_soon";document.getElementById("ev").dispatchEvent(new Event("change")),1'); await sleep(500);
    await ev('document.getElementById("cd").open=true;["cd-3","cd-2","cd-1","cd-0"].forEach(function(i){document.getElementById(i).checked=false});document.getElementById("cd-7").checked=true;document.getElementById("cd-save").click(),1');
    await sleep(2000);
    const posts = await list('socialPosts');
    ok('the countdown saves the post for a week before, "One week to go!" first', posts.length === 1 && posts[0].opening === 'One week to go!' && /^One week to go!\n\n📅/.test(posts[0].caption) && posts[0].date === DAY0, posts.map(p => [p.date, p.opening]));
    await until('/Synthetic coffee morning/.test(document.getElementById("today-list").innerText)', 10000);
    ok('it waits in Today’s posts, ready: Copy caption, Share, Download, Posted', await ev('/Synthetic coffee morning/.test(document.getElementById("today-list").innerText) && document.querySelectorAll("#today-list .post button").length>=4'));
    await shot('today');
    await ev('document.querySelector(\'#today-list [data-a="done"]\').click(),1'); await sleep(1500);
    ok('"Posted ✓" marks it posted', ((await list('socialPosts'))[0] || {}).status === 'posted');
    /* A Bible verse: today's verse, in the hub's designs, fitting every size.
       The long-verse test uses a fixed 110 words - longer than the longest
       verse in the Bible (Esther 8:9, about 90) - not today's verse tripled,
       which made it pass or fail by the date (21 Oct's would not fit). */
    await ev('[...document.querySelectorAll("#modes button")].find(b=>b.dataset.v==="verse").click(),1'); await sleep(300);
    ok('"A Bible verse": the verse’s words, not the event’s', await ev('!document.getElementById("m-verse").hidden && document.getElementById("w-card").hidden'));
    await until('document.getElementById("v-ver").options.length>1', 15000);
    await ev('document.getElementById("v-today").click(),1');
    await until('document.getElementById("v-text").value.length>10', 15000);
    const vref = await ev('document.getElementById("v-ref").value');
    ok('"Today’s verse" brings in the hub’s verse for today from the BSB', vref === await ev('EGBCVotd.forDate(new Date())') && (await ev('document.getElementById("v-text").value')).length > 10, vref);
    ok('its caption: "Verse of the day", the verse and its reference', new RegExp('^Verse of the day\\n\\n“[\\s\\S]+”\\n' + vref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' BSB').test(await ev('document.getElementById("s-cap").value')), await ev('document.getElementById("s-cap").value'));
    const vfit = await ev("(function(){var S=EGBCCards.state,v=S.vstyle,keep=S.verse.text,out=[];S.verse.text='and the people of the land gave thanks for every good gift and the people of the land gave thanks for every good gift and the people of the land gave thanks for every good gift and the people of the land gave thanks for every good gift and the people of the land gave thanks for every good gift and the people of the land gave thanks for every good gift and the people of the land gave thanks for every good gift and the people of the land gave thanks for every good gift and the people of the land gave thanks for every good gift and the';['portrait','insta','facebook','story'].forEach(function(k){var z=EGBCCards.SIZES[k];['type','photo','frame','band'].forEach(function(st){S.vstyle=st;var c=document.createElement('canvas');c.width=z.w;c.height=z.h;var L=EGBCCards.draw(c,0);if(!L||!L.fits||L.bottom>L.boxBottom+1||L.top<L.boxTop-1)out.push(k+'/'+st);});});S.vstyle=v;S.verse.text=keep;return out})()");
    ok('a long verse (110 words, more than any in the Bible) fits every design in every social size', vfit.length === 0, vfit);
    await shot('verse');
    /* Each verse design at Instagram's size, saved for a person to look at. */
    for (const st of ['type', 'photo', 'frame', 'band']) {
      const url = await ev('(function(){var S=EGBCCards.state,v=S.vstyle;S.vstyle="' + st + '";var c=document.createElement("canvas");c.width=1080;c.height=1350;EGBCCards.draw(c,0);S.vstyle=v;return c.toDataURL("image/png")})()');
      fs.writeFileSync(path.join(SHOTS, 'verse-' + st + '-1080x1350.png'), Buffer.from(url.split(',')[1], 'base64'));
    }
    /* The verse of the day each morning, and the reminder (by choice). */
    await ev('document.getElementById("vod-on").checked=true;document.getElementById("remind").checked=true;document.getElementById("vod-save").click(),1'); await sleep(1500);
    const vs = (await list('socialSettings')).find(d => d._id === 'main') || {};
    ok('Verse of the day on, and "Email me each morning" kept for me only', vs.vod && vs.vod.on === true && vs.vod.version && vs.vod.version.id === 'BSB' && JSON.stringify(vs.remind) === JSON.stringify([PEOPLE.office.uid]), vs);
    await until('/Verse of the day/.test(document.getElementById("today-list").innerText)', 15000);
    ok('the verse of the day is in Today’s posts, ready', /Verse of the day: /.test(await ev('document.getElementById("today-list").innerText')));
    const w = await ev('document.documentElement.scrollWidth');
    ok('fits 375px (no sideways scroll)', w <= 375, w);
    /* A tick box's whole line is what is tapped, so its label is measured. */
    const small = await ev('[...document.querySelectorAll("#wrap button, #wrap select, #wrap input")].filter(e=>{const t=e.type==="checkbox"&&e.closest("label")?e.closest("label"):e;const r=t.getBoundingClientRect();return r.width&&r.height&&r.height<30}).map(e=>(e.textContent||e.id).trim().slice(0,20))');
    ok('no control under 30px tall (a tick box: its line)', small.length === 0, small);
    ok('no errors thrown in the page', errors.length === 0, errors);
  } catch (e) { ok('the run finished', false, e.message); }
  ws.close(); chrome.kill(); server.close();
  const fails = R.filter(v => !v).length;
  console.log('\n' + (R.length - fails) + '/' + R.length + ' passed' + (BREAK ? '   (deliberate break: ' + BREAK + ', so this run SHOULD be red)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
