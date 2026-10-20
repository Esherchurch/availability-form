/* PRESENT: THE MICROSOFT 365 ROUTE (F-252, F-253). Events window.
   The real converter code (converter/convert.mjs makeRender, microsoft.mjs)
   against a stand-in for Microsoft (sign-in, the SharePoint site, upload,
   upload session, ?format=pdf, delete) on this machine; invented decks;
   the events emulators for the deck's records and files.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/present-microsoft.test.mjs"

   What it proves:
     1. not set up: LibreOffice makes the slides, as before
     2. set up: Microsoft draws them - the converter signs in as the app
        (client credentials, no person), puts the deck in the church's
        conversion folder, asks for the PDF, and DELETES the copy after
     3. a PDF that kept a hidden slide: Present still leaves it out
     4. a big deck goes up in pieces (an upload session), byte for byte
     5. Microsoft fails, or the secret is wrong: LibreOffice does it instead,
        and the deck says why; the copy is still deleted
     6. the secret is never written anywhere a page can read
     7. CONNECT MICROSOFT 365 (one Church HQ app, F-253): a master admin presses
        Connect; Microsoft asks the church's admin to consent (the app's own
        Sites.Selected), then a one-off sign-in gives the app "write" on ONE
        site; the hub keeps which tenant and site (no secret, no token); the
        card says Connected; the next deck is drawn by Microsoft through it.
        Declined, or not an administrator: not connected, and why in words.
        Only master admins may start it.
     8. THE CLEAR-OUT: a session deck's PowerPoint file goes 30 days after the
        session; its slide pictures and video stay, and it can be shown */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { inventDeck, readZip } from '../../converter/pptx.mjs';
import { convertDeck, makeRender } from '../../converter/convert.mjs';
import { msConfig, forgetMicrosoft } from '../../converter/microsoft.mjs';
import { runPresentSweep } from '../../functions/present.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp, getApps } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
const { getStorage } = fnRequire('firebase-admin/storage');
if (!getApps().length) initializeApp({ projectId: PROJECT, storageBucket: 'egbc-worship-planner.firebasestorage.app' });
const db = getFirestore(), bucket = getStorage().bucket();

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const J = (x) => JSON.stringify(x);

/* ---------- the stand-in for Microsoft ---------- */
const SECRET = 'invented-secret-' + Math.random().toString(36).slice(2);
const MS = { tokens: [], uploads: {}, sessions: {}, pdfAsked: [], deleted: [], failPdf: false, n: 0, sitesAsked: [], consents: [], authorizes: [], grants: [], decline: false, notAdmin: false };
const TENANT = '11111111-2222-3333-4444-555555555555', HQ = 'hq-client-invented';
const pagesIn = (pptx) => (readZip(pptx).text('ppt/presentation.xml').match(/<p:sldId\b/g) || []).length;
const fakePdf = (n) => Buffer.from('%PDF-1.4\n' + Array.from({ length: n }, (_, i) => '<< /Type /Page /N ' + (i + 1) + ' >>').join('\n') + '\n%%EOF');
const body = (req) => new Promise((r) => { const parts = []; req.on('data', (c) => parts.push(c)); req.on('end', () => r(Buffer.concat(parts))); });
const ms = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname), b = await body(req);
  const send = (code, obj, h) => { res.writeHead(code, Object.assign({ 'Content-Type': 'application/json' }, h || {})); res.end(typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : J(obj)); };
  if (req.method === 'GET' && p === '/login/organizations/v2.0/adminconsent') {
    const q = u.searchParams; MS.consents.push(Object.fromEntries(q));
    const to = new URL(q.get('redirect_uri'));
    if (MS.decline) { to.searchParams.set('error', 'access_denied'); to.searchParams.set('error_description', 'The admin declined.'); }
    else { to.searchParams.set('admin_consent', 'True'); to.searchParams.set('tenant', TENANT); }
    to.searchParams.set('state', q.get('state'));
    res.writeHead(302, { Location: to.toString() }); return res.end();
  }
  if (req.method === 'GET' && p === '/login/' + TENANT + '/oauth2/v2.0/authorize') {
    const q = u.searchParams; MS.authorizes.push(Object.fromEntries(q));
    const to = new URL(q.get('redirect_uri')); to.searchParams.set('code', 'invented-code'); to.searchParams.set('state', q.get('state'));
    res.writeHead(302, { Location: to.toString() }); return res.end();
  }
  if (req.method === 'POST' && /^\/login\/[^/]+\/oauth2\/v2\.0\/token$/.test(p)) {
    const f = new URLSearchParams(b.toString()); MS.tokens.push(Object.fromEntries(f));
    if (f.get('client_secret') !== SECRET) return send(401, { error: 'invalid_client' });
    if (f.get('grant_type') === 'authorization_code') return f.get('code') === 'invented-code' ? send(200, { access_token: 'admin-token', expires_in: 3600 }) : send(400, { error: 'invalid_grant' });
    return send(200, { access_token: 'invented-token', expires_in: 3600, token_type: 'Bearer' });
  }
  if (p.startsWith('/upload/')) {
    const id = p.slice(8), s = MS.sessions[id], m = (req.headers['content-range'] || '').match(/bytes (\d+)-(\d+)\/(\d+)/);
    if (!s || !m) return send(400, { error: 'bad range' });
    s.parts.push({ from: +m[1], to: +m[2], total: +m[3], len: b.length }); s.bytes = Buffer.concat([s.bytes, b]);
    if (+m[2] + 1 === +m[3]) { MS.uploads[id] = { name: s.name, bytes: s.bytes, session: true, folder: s.folder }; return send(201, { id }); }
    return send(202, { nextExpectedRanges: [(+m[2] + 1) + '-'] });
  }
  if (p.startsWith('/pdf/')) { const it = MS.uploads[p.slice(5)]; return send(200, fakePdf(pagesIn(it.bytes)), { 'Content-Type': 'application/pdf' }); }
  if (!p.startsWith('/graph/')) return send(404, {});
  const g = p.slice(6), who = req.headers.authorization;
  let m;
  /* the admin's one-off sign-in: the root site, and the one grant */
  if (who === 'Bearer admin-token') {
    if (req.method === 'GET' && g === '/sites/root') return send(200, { id: 'site-root', webUrl: 'https://invented.sharepoint.com', siteCollection: { hostname: 'invented.sharepoint.com' } });
    if (req.method === 'POST' && g === '/sites/site-root/permissions') { if (MS.notAdmin) return send(403, { error: 'accessDenied' }); MS.grants.push(JSON.parse(b.toString())); return send(201, { id: 'perm-1', roles: ['write'] }); }
    return send(403, { error: 'the admin token is only for the grant' });
  }
  if (who !== 'Bearer invented-token') return send(401, { error: 'unauthenticated' });
  /* the app (Sites.Selected): the granted site only */
  if ((m = g.match(/^\/sites\/site-root(\/|$)/)) && !MS.grants.some((x) => x.roles[0] === 'write' && x.grantedToIdentities[0].application.id === HQ)) return send(403, { error: 'not granted' });
  if (req.method === 'GET' && g === '/sites/site-root') return send(200, { id: 'site-root' });
  if (req.method === 'GET' && (m = g.match(/^\/sites\/([^/]+?)(?::(.*))?$/))) { MS.sitesAsked.push(g); return send(200, { id: 'site-invented', webUrl: 'https://' + m[1] + (m[2] || '') }); }
  if (req.method === 'PUT' && (m = g.match(/^\/sites\/site-[a-z]+\/drive\/root:\/(.+)\/([^/]+):\/content$/))) { const id = 'item-' + (++MS.n); MS.uploads[id] = { name: m[2], folder: m[1], bytes: b }; return send(201, { id, name: m[2] }); }
  if (req.method === 'POST' && (m = g.match(/^\/sites\/site-[a-z]+\/drive\/root:\/(.+)\/([^/]+):\/createUploadSession$/))) { const id = 'item-' + (++MS.n); MS.sessions[id] = { name: m[2], folder: m[1], parts: [], bytes: Buffer.alloc(0) }; return send(200, { uploadUrl: 'http://127.0.0.1:5613/upload/' + id }); }
  if (req.method === 'GET' && (m = g.match(/^\/sites\/site-[a-z]+\/drive\/items\/([^/]+)\/content$/)) && u.searchParams.get('format') === 'pdf') {
    MS.pdfAsked.push(m[1]);
    if (MS.failPdf) return send(500, { error: 'invented failure' });
    res.writeHead(302, { Location: 'http://127.0.0.1:5613/pdf/' + m[1] }); return res.end();
  }
  if (req.method === 'DELETE' && (m = g.match(/^\/sites\/site-[a-z]+\/drive\/items\/([^/]+)$/))) { MS.deleted.push(m[1]); delete MS.uploads[m[1]]; return send(204, ''); }
  send(404, { error: 'no such thing: ' + req.method + ' ' + g });
});
await new Promise((r) => ms.listen(5613, '127.0.0.1', r));
const CFG = (extra) => msConfig(Object.assign({ MS_TENANT_ID: 'tenant-invented', MS_CLIENT_ID: 'client-invented', MS_CLIENT_SECRET: SECRET, MS_SITE: 'esherchurch.sharepoint.com:/sites/EGBCHub',
  MS_GRAPH: 'http://127.0.0.1:5613/graph', MS_LOGIN: 'http://127.0.0.1:5613/login' }, extra || {}));

/* the LibreOffice and pdftoppm steps stood in for (this PC has no pdftoppm) */
const LO = { calls: 0 };
const loPdf = async (buf) => { LO.calls++; return { pdf: fakePdf((readZip(buf).text('ppt/presentation.xml').match(/<p:sldId\b/g) || []).length - 1), prepared: ['LibreOffice stand-in'] }; };
const toPictures = async (pdf) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).map((x, i) => ({ full: Buffer.from('full ' + i), thumb: Buffer.from('thumb ' + i), w: 1920, h: 1080 }));

const DECK = inventDeck([{ title: 'One', notes: 'first' }, { title: 'Two' }, { title: 'Hidden', hidden: true }, { title: 'Three' }, { title: 'Four' }]);
async function deck(id, buf) {
  await db.collection('presentDecks').doc(id).set({ context: { type: 'session', groupId: 'pg_x', sessionId: 'ps_x' }, name: 'Invented', status: 'uploaded', source: 'upload', by: 'u_x', byName: 'x', at: 'x' });
  await bucket.file('present/' + id + '/source.pptx').save(buf, { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
const read = async (id) => (await db.collection('presentDecks').doc(id).get()).data() || {};

try {
  /* 1. not set up */
  ok('0. NOT SET UP: with no MS_ settings there is no Microsoft route', msConfig({}) === null);
  await deck('dk_ms_none', DECK);
  await convertDeck({ db, bucket, deckId: 'dk_ms_none', render: makeRender({ ms: null, loPdf, toPictures }) });
  const d1 = await read('dk_ms_none');
  ok('1. NOT SET UP: LibreOffice makes the slides, as before (4, the hidden one left out)', d1.status === 'ready' && d1.count === 4 && d1.renderer === 'libreoffice' && LO.calls === 1, J(d1));

  /* 2. set up */
  forgetMicrosoft();
  await deck('dk_ms_yes', DECK);
  await convertDeck({ db, bucket, deckId: 'dk_ms_yes', render: makeRender({ ms: CFG(), loPdf, toPictures }) });
  const d2 = await read('dk_ms_yes'), tk = MS.tokens[MS.tokens.length - 1] || {};
  ok('2. SET UP: MICROSOFT DRAWS THE SLIDES (renderer "microsoft"), LibreOffice not used', d2.status === 'ready' && d2.renderer === 'microsoft' && LO.calls === 1, J(d2));
  ok('   it signs in as the app itself: client credentials, Graph’s .default scope, no person', tk.grant_type === 'client_credentials' && tk.scope === 'https://graph.microsoft.com/.default' && tk.client_id === 'client-invented' && !tk.username && !tk.password, J(Object.assign({}, tk, { client_secret: '...' })));
  ok('   on the church’s own site', MS.sitesAsked.some((s) => s === '/sites/esherchurch.sharepoint.com:/sites/EGBCHub'), J(MS.sitesAsked));
  ok('   the deck went into the conversion folder, and the PDF was asked for', MS.n >= 1 && MS.pdfAsked.includes('item-1') && Object.values(MS.uploads).length === 0, J({ n: MS.n, asked: MS.pdfAsked }));
  ok('   AND THE COPY IS DELETED AFTER: nothing is left in SharePoint', MS.deleted.includes('item-1') && Object.keys(MS.uploads).length === 0, J(MS.deleted));
  ok('3. MICROSOFT’S PDF KEPT THE HIDDEN SLIDE (5 pages): Present still shows 4', d2.count === 4, J({ count: d2.count }));
  const s1 = await bucket.file('present/dk_ms_yes/s1.jpg').exists();
  ok('   the pictures are stored as on the other route', s1[0]);

  /* 4. a big deck goes up in pieces */
  forgetMicrosoft();
  const bigVideo = Buffer.alloc(2 * 1048576 + 12345, 7);
  const BIG = inventDeck([{ title: 'With a big video', video: bigVideo, start: 'click' }, { title: 'After' }]);
  await deck('dk_ms_big', BIG);
  const before = MS.n;
  /* keep the upload: the stand-in forgets a deleted copy, so look before it is deleted */
  let captured = null; const del = MS.deleted.length;
  const realDelete = MS.deleted.push.bind(MS.deleted);
  MS.deleted.push = (id) => { if (MS.uploads[id]) captured = MS.uploads[id]; return realDelete(id); };
  await convertDeck({ db, bucket, deckId: 'dk_ms_big', render: makeRender({ ms: CFG({ MS_SIMPLE_MAX: String(1048576), MS_CHUNK: String(655360) }), loPdf, toPictures }) });
  MS.deleted.push = realDelete;
  const d4 = await read('dk_ms_big'), sess = MS.sessions['item-' + (before + 1)];
  ok('4. A BIG DECK goes up in pieces (an upload session), each piece in order', sess && sess.parts.length >= 4 && sess.parts.every((x, i, a) => x.from === (i ? a[i - 1].to + 1 : 0) && x.len <= 655360), J(sess && sess.parts.map((x) => x.from + '-' + x.to)));
  ok('   and arrives byte for byte; Microsoft draws it; the copy is deleted', captured && Buffer.compare(captured.bytes, BIG) === 0 && d4.renderer === 'microsoft' && d4.count === 2 && MS.deleted.length > del, J({ size: captured && captured.bytes.length, want: BIG.length, renderer: d4.renderer }));

  /* 5. Microsoft fails / the secret is wrong */
  forgetMicrosoft(); MS.failPdf = true;
  await deck('dk_ms_fail', DECK);
  const delB = MS.deleted.length;
  await convertDeck({ db, bucket, deckId: 'dk_ms_fail', render: makeRender({ ms: CFG(), loPdf, toPictures }) });
  const d5 = await read('dk_ms_fail');
  ok('5. MICROSOFT FAILS: LibreOffice makes the slides instead, and the deck says why', d5.status === 'ready' && d5.renderer === 'libreoffice' && /Microsoft 365 could not draw the slides \(500\)/.test(d5.fallbackWhy || ''), J(d5));
  ok('   the copy in SharePoint is deleted all the same', MS.deleted.length > delB && Object.keys(MS.uploads).length === 0, J(MS.deleted));
  MS.failPdf = false; forgetMicrosoft();
  await deck('dk_ms_badsecret', DECK);
  await convertDeck({ db, bucket, deckId: 'dk_ms_badsecret', render: makeRender({ ms: CFG({ MS_CLIENT_SECRET: 'wrong' }), loPdf, toPictures }) });
  const d6 = await read('dk_ms_badsecret');
  ok('   A WRONG SECRET: LibreOffice again, and the deck says to check the settings', d6.status === 'ready' && d6.renderer === 'libreoffice' && /would not sign the converter in.*MS_CLIENT_SECRET/.test(d6.fallbackWhy || ''), J(d6));

  /* 6. the secret is never written where a page can read */
  const all = [];
  for (const id of ['dk_ms_none', 'dk_ms_yes', 'dk_ms_big', 'dk_ms_fail', 'dk_ms_badsecret']) all.push(J(await read(id)), J((await db.collection('presentNotes').doc(id).get()).data() || {}));
  ok('6. THE SECRET AND THE TOKEN ARE NEVER STORED with a deck', !all.some((x) => x.includes(SECRET) || x.includes('invented-token')));
  /* ---------- 7. CONNECT MICROSOFT 365 ---------- */
  const V2B = 'http://localhost:5601/';
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const pages = http.createServer((req, res) => {
    const f = path.join(V2, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => pages.listen(5601, 'localhost', r));
  await db.collection('presentSettings').doc('test').set({ msLogin: 'http://127.0.0.1:5613/login', msGraph: 'http://127.0.0.1:5613/graph', msClientId: HQ, msClientSecret: SECRET, returnBase: V2B });
  const people = {};
  for (const [k, master] of [['mia', true], ['tess', false]]) {
    const r = await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ email: k + '.ms@example.invalid', password: 'synthetic-only-123', returnSecureToken: true }) })).json();
    people[k] = r.localId;
    await db.collection('users').doc(r.localId).set({ memberId: 'm_' + k, name: k === 'mia' ? 'Mia Master (invented)' : 'Tess Team (invented)', email: k + '.ms@example.invalid', teams: ['Core Team'], adminFor: [], masterAdmin: master, status: 'active' });
  }
  const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-first-run'] });
  try {
    const pg = await browser.newPage();
    const errors = []; pg.on('pageerror', (e) => errors.push(e.message)); pg.on('dialog', (d) => d.accept());
    await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
    await pg.setViewport({ width: 900, height: 900 });
    const signIn = async (who) => {
      await pg.goto(V2B + 'whatson.html', { waitUntil: 'networkidle2' });
      await pg.waitForFunction(() => window.firebase && firebase.apps.some((a) => a.name === 'egbc'));
      await pg.evaluate(() => firebase.auth(firebase.app('egbc')).signOut()).catch(() => {});
      await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), who + '.ms@example.invalid');
      await new Promise((r) => setTimeout(r, 600));
    };
    const card = async () => {
      await pg.evaluate(() => new Promise((ok) => { const d = document.createElement('div'); d.id = 'm365'; document.body.prepend(d); const sc = document.createElement('script'); sc.src = 'egbc-microsoft-connect.js'; sc.onload = () => { EGBCMicrosoft.mount(d); ok(); }; document.head.appendChild(sc); }));
      for (let i = 0; i < 60; i++) { const t = await pg.$eval('#m365', (e) => e.innerText).catch(() => ''); if (t && !/Checking/.test(t)) return t; await new Promise((r) => setTimeout(r, 200)); }
      return '';
    };
    await signIn('tess');
    const tess = await pg.evaluate(() => EGBCAuth.call('m365Start', {}).then(() => 'started', (e) => e.message));
    ok('7. ONLY A MASTER ADMIN may start "Connect Microsoft 365"', /Only a master admin/.test(tess), tess);
    await signIn('mia');
    const before = await card();
    ok('   THE CARD: not connected, says who can do it and what the app may touch, and offers Connect', /Global administrator/.test(before) && /one SharePoint site/.test(before) && !!(await pg.$('#m365 [data-on]')), before);
    /* a return that did not start here (forged, or stale): refused */
    const CB = 'http://127.0.0.1:5102/' + PROJECT + '/europe-west2/m365Callback';
    const forged = await fetch(CB + '?state=' + 'ab'.repeat(24) + '&admin_consent=True&tenant=' + TENANT, { redirect: 'manual' });
    const forged2 = await fetch(CB + '?state=' + 'cd'.repeat(24) + '&code=invented-code', { redirect: 'manual' });
    ok('   A RETURN THAT DID NOT START HERE (a forged link) is refused; nothing is connected', /m365=failed/.test(forged.headers.get('location') || '') && /m365=failed/.test(forged2.headers.get('location') || '') && MS.grants.length === 0 && !(await db.collection('privateSettings').doc('microsoft365').get()).exists, J([forged.status, forged.headers.get('location'), forged2.headers.get('location')]));
    /* a real start, but left more than 15 minutes */
    const stale = 'ef'.repeat(24);
    await db.collection('m365Connect').doc(stale).set({ uid: people.mia, name: 'Mia', step: 'consent', at: Date.now() - 20 * 60 * 1000 });
    const staleR = await fetch(CB + '?state=' + stale + '&admin_consent=True&tenant=' + TENANT, { redirect: 'manual' });
    ok('   A START LEFT MORE THAN 15 MINUTES is refused, and has to be pressed again', /m365=failed/.test(staleR.headers.get('location') || '') && /too long/.test(decodeURIComponent(staleR.headers.get('location') || '')), staleR.headers.get('location'));
    await db.collection('m365Connect').doc(stale).delete();
    /* before Microsoft: the plain explanation, and "Not now" */
    await pg.click('#m365 [data-on]'); await pg.waitForSelector('#m365 [data-go]');
    const ex = await pg.$eval('#m365', (e) => e.innerText.replace(/\s+/g, ' '));
    ok('   BEFORE MICROSOFT, A PLAIN SCREEN: the one-off Sites.FullControl.All, used once, kept by nothing, removable after; the lasting right is one site', /Before you go to Microsoft/.test(ex) && /Sites\.FullControl\.All/.test(ex) && /one step only/.test(ex) && /nothing keeps it/.test(ex) && /remove it afterwards/.test(ex) && /one SharePoint site/.test(ex), ex);
    await pg.screenshot({ path: path.join(HERE, 'present-real-m365-before.png') });
    const startsBefore = (await db.collection('m365Connect').get()).size;
    await pg.click('#m365 [data-back]');
    await new Promise((r) => setTimeout(r, 600));
    ok('   "Not now" goes nowhere: still here, nothing started', /church-settings|whatson/.test(pg.url()) && !!(await pg.$('#m365 [data-on]')) && (await db.collection('m365Connect').get()).size === startsBefore, pg.url());
    /* declined first */
    MS.decline = true;
    await pg.click('#m365 [data-on]'); await pg.waitForSelector('#m365 [data-go]');
    await Promise.all([pg.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}), pg.click('#m365 [data-go]')]);
    await pg.waitForFunction(() => /church-settings\.html/.test(location.href), { timeout: 30000 }).catch(() => {});
    const declinedUrl = pg.url();
    ok('   DECLINED in Microsoft: back to Church settings, not connected, and why in words', /m365=failed/.test(declinedUrl) && /declined/.test(decodeURIComponent(declinedUrl)) && !(await db.collection('privateSettings').doc('microsoft365').get()).exists, declinedUrl);
    /* not an administrator */
    MS.decline = false; MS.notAdmin = true;
    await signIn('mia'); await card();
    await pg.click('#m365 [data-on]'); await pg.waitForSelector('#m365 [data-go]');
    await Promise.all([pg.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}), pg.click('#m365 [data-go]')]);
    await pg.waitForFunction(() => /church-settings\.html/.test(location.href), { timeout: 30000 }).catch(() => {});
    ok('   SIGNED IN AS SOMEONE NOT AN ADMINISTRATOR: not connected, and told who must do it', /m365=failed/.test(pg.url()) && /Global or SharePoint administrator/.test(decodeURIComponent(pg.url())), pg.url());
    /* connected */
    MS.notAdmin = false; MS.consents = []; MS.authorizes = []; MS.grants = [];
    await signIn('mia'); await card();
    await pg.click('#m365 [data-on]'); await pg.waitForSelector('#m365 [data-go]');
    await Promise.all([pg.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}), pg.click('#m365 [data-go]')]);
    await pg.waitForFunction(() => /church-settings\.html/.test(location.href), { timeout: 30000 }).catch(() => {});
    const con = MS.consents[0] || {}, az = MS.authorizes[0] || {}, gr = MS.grants[0] || {};
    ok('   CONNECT: Microsoft is asked for ADMIN CONSENT to the one Church HQ app, for its own permissions (.default)', con.client_id === HQ && con.scope === 'https://graph.microsoft.com/.default' && /m365Callback/.test(con.redirect_uri || ''), J(con));
    ok('   then ONE sign-in asks only for Sites.FullControl.All, to make the one grant', az.scope === 'https://graph.microsoft.com/Sites.FullControl.All' && az.response_type === 'code', J(az));
    ok('   THE GRANT: the app gets "write" on ONE site (the church\u2019s root site), nothing else', gr.roles && J(gr.roles) === J(['write']) && gr.grantedToIdentities[0].application.id === HQ && MS.grants.length === 1, J(MS.grants));
    const saved = (await db.collection('privateSettings').doc('microsoft365').get()).data() || {};
    ok('   SAVED for the converter: which tenant and which site - no secret, no token', saved.tenantId === TENANT && saved.siteId === 'site-root' && saved.domain === 'invented.sharepoint.com' && !J(saved).includes(SECRET) && !/admin-token|invented-token|invented-code/.test(J(saved)), J(saved));
    ok('   back to Church settings: connected', /m365=connected/.test(pg.url()), pg.url());
    await signIn('mia');
    const after = await card();
    ok('   THE CARD SAYS CONNECTED, to which, by whom', /Connected: invented\.sharepoint\.com/.test(after) && /Mia Master/.test(after) && !!(await pg.$('#m365 [data-off]')), after);
    const leftover = (await db.collection('m365Connect').get()).size;
    ok('   nothing of the sign-in is kept (the one-off state is gone)', leftover === 0, leftover);
    const pageRead = await pg.evaluate(() => EGBCAuth.db.collection('privateSettings').doc('microsoft365').get().then(() => 'read', (e) => e.code));
    ok('   no page can read the connection, not even a master admin\u2019s', pageRead === 'permission-denied', pageRead);
    await pg.screenshot({ path: path.join(HERE, 'present-real-m365-connected.png') });
    /* the next deck goes through it */
    forgetMicrosoft();
    process.env.MS_CLIENT_ID = HQ; process.env.MS_CLIENT_SECRET = SECRET; process.env.MS_GRAPH = 'http://127.0.0.1:5613/graph'; process.env.MS_LOGIN = 'http://127.0.0.1:5613/login';
    delete process.env.MS_TENANT_ID; delete process.env.MS_SITE;
    await deck('dk_ms_connected', DECK);
    const pdfBefore = MS.pdfAsked.length;
    await convertDeck({ db, bucket, deckId: 'dk_ms_connected', render: makeRender({ loPdf, toPictures }) });
    const d7 = await read('dk_ms_connected'), tk7 = MS.tokens.filter((t) => t.grant_type === 'client_credentials').pop() || {};
    ok('   THE NEXT DECK IS DRAWN BY MICROSOFT through the connection (the church\u2019s tenant, the granted site)', d7.renderer === 'microsoft' && d7.count === 4 && MS.pdfAsked.length > pdfBefore && tk7.client_id === HQ, J({ renderer: d7.renderer, why: d7.fallbackWhy }));
    ok('   no page errors', errors.length === 0, errors.join(' | '));
    /* disconnect */
    await pg.click('#m365 [data-off]');
    for (let i = 0; i < 30 && (await db.collection('privateSettings').doc('microsoft365').get()).exists; i++) await new Promise((r) => setTimeout(r, 200));
    ok('   DISCONNECT: the hub forgets it; Present draws slides itself again', !(await db.collection('privateSettings').doc('microsoft365').get()).exists);
  } finally { await browser.close(); pages.close(); }

  /* ---------- 8. THE CLEAR-OUT ---------- */
  await db.collection('planSessions').doc('ps_old').set({ groupId: 'pg_x', date: '2026-09-01', title: 'Old session', parts: [] });
  await db.collection('planSessions').doc('ps_new').set({ groupId: 'pg_x', date: '2026-10-25', title: 'New session', parts: [] });
  for (const [id, sid] of [['dk_old_sess', 'ps_old'], ['dk_new_sess', 'ps_new']]) {
    await db.collection('presentDecks').doc(id).set({ context: { type: 'session', groupId: 'pg_x', sessionId: sid }, name: 'x', status: 'ready', count: 1, media: [{ shown: 0, k: 0, src: 'm1-0.mp4' }] });
    for (const f of ['source.pptx', 's1.jpg', 't1.jpg', 'm1-0.mp4']) await bucket.file('present/' + id + '/' + f).save(Buffer.from('invented ' + f));
  }
  const swept = await runPresentSweep({ db, bucket, today: '2026-10-21' });
  const has = async (id, f) => (await bucket.file('present/' + id + '/' + f).exists())[0];
  ok('8. THE CLEAR-OUT: 30 days after the session, the PowerPoint file itself goes', !(await has('dk_old_sess', 'source.pptx')) && !!(await read('dk_old_sess')).sourceDeletedAt, J(swept));
  ok('   its slide pictures and its video stay, so it can be shown again', (await has('dk_old_sess', 's1.jpg')) && (await has('dk_old_sess', 't1.jpg')) && (await has('dk_old_sess', 'm1-0.mp4')) && (await read('dk_old_sess')).status === 'ready');
  ok('   a session less than 30 days ago keeps its file', await has('dk_new_sess', 'source.pptx'));
} catch (e) {
  ok('the run finished', false, e.stack);
} finally { ms.close(); }
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
