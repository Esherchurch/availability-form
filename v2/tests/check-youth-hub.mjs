/* A young person’s own rota dates and charters, in the Youth app (6b; A-066).
 *
 *   node tests/check-youth-hub.mjs      (from v2/, dev emulators up, functions included)
 *
 * Martin, 10 Oct 2026: a young person on the youth band AND the main band
 * sees their main-rota dates and both charters in the Youth app. His
 * deliberate break: a youth-only young person must NOT see the Worship & AV
 * charter. A code gives no read of the rota or the charters, so the server
 * answers (myYouthHub), for the person asking only.
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
const PORT = 9743, SERVE = 8959;
const PW = 'test-only-password';


const R = [];
const ok = (n, v, x) => {
  R.push(v);
  console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')));
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
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: fields(o) }, { Authorization: 'Bearer owner' });

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

const londonDate = (n) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
};
const D14 = londonDate(14), D21 = londonDate(21), D84 = londonDate(84);
const valT = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v instanceof Date ? { timestampValue: v.toISOString() } : val(v)]));
const putT = (p, o) => req(8181, 'PATCH', DOCS + '/' + p, { fields: valT(o) }, { Authorization: 'Bearer owner' });
const callAs = async (who) => {
  const r = await req(5101, 'POST', '/egbc-worship-planner/europe-west2/myYouthHub', { data: {} },
    who && who.idToken ? { Authorization: 'Bearer ' + who.idToken } : {});
  try { const j = JSON.parse(r.body || '{}'); return j.result !== undefined ? j.result : { error: (j.error || {}).status || 'HTTP ' + r.status }; }
  catch { return { error: 'HTTP ' + r.status }; }
};

(async () => {
  /* Young people sign in with a code; to the function that is an account
     with a live youthAccess record. Adults are an ordinary account. */
  const P = {
    ypBand:  { email: 'yh.band@example.invalid', member: 'ab_yh_band', name: 'Yasmin Band Synthetic', markers: ['Youth Worship', 'Worship Team'], minor: true, code: 'live' },
    ypYouth: { email: 'yh.youth@example.invalid', member: 'ab_yh_youth', name: 'Yusuf Youth Synthetic', markers: ['Youth Worship'], minor: true, code: 'live' },
    ypOld:   { email: 'yh.old@example.invalid', member: 'ab_yh_old', name: 'Yan Expired Synthetic', markers: ['Youth Worship', 'Worship Team'], minor: true, code: 'expired' },
    adBand:  { email: 'yh.adband@example.invalid', member: 'ab_yh_adband', name: 'Ada Bandleader Synthetic', markers: ['Youth Worship', 'Worship Team'], minor: false },
    adYouth: { email: 'yh.adyouth@example.invalid', member: 'ab_yh_adyouth', name: 'Ali Youthleader Synthetic', markers: ['Youth Worship'], minor: false },
  };
  for (const p of Object.values(P)) {
    let up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    if (!up.localId) up = JSON.parse((await req(9099, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
      { email: p.email, password: PW, returnSecureToken: true })).body || '{}');
    p.uid = up.localId; p.idToken = up.idToken;
    await put('addressBook/' + p.member, { name: p.name, markers: p.markers, adminFor: [], archived: false, isMinor: p.minor, churchMember: false });
    if (p.code) {
      await req(8181, 'DELETE', DOCS + '/users/' + p.uid, undefined, { Authorization: 'Bearer owner' });
      await putT('youthAccess/' + p.uid, { memberId: p.member, firstName: p.name.split(' ')[0], groups: ['Youth Worship'], active: true,
        expiresAt: new Date(Date.now() + (p.code === 'live' ? 30 : -1) * 864e5) });
    } else {
      await put('users/' + p.uid, { uid: p.uid, email: p.email, name: p.name, memberId: p.member, status: 'active', linkedBy: 'admin',
        teams: p.markers, adminFor: [], masterAdmin: false, attender: true, churchMember: false });
    }
  }
  const ev = (id, o) => put('events/' + id, Object.assign({ termLabel: 'Synthetic', teams: ['Worship Team'], roles: [], archived: false,
    draft: false, startTime: '10:30', type: 'Sunday Morning Worship', assignments: {} }, o));
  const by = (k) => ({ id: P[k].member, name: P[k].name });
  await ev('ev_yh_d14', { date: D14, assignments: { Drums: by('ypBand'), Guitar: { id: 'ab_yh_other', name: 'Zara Other Synthetic' }, Bass: by('adBand') } });
  await ev('ev_yh_d21_draft', { date: D21, draft: true, assignments: { Keyboard: by('ypBand') } });
  await ev('ev_yh_d84', { date: D84, assignments: { Vocals: by('ypBand') } });
  await put('pageContent/youth-charter', { title: 'Youth charter', html: '<p>Synthetic youth charter words.</p>' });
  await put('pageContent/wider-worship-charter', { title: 'Worship & AV charter', html: '<p>Synthetic worship charter words.</p>' });

  /* ---- 1. the function --------------------------------------------- */
  console.log('\nmyYouthHub, as a young person on the youth band AND the main band');
  const a = await callAs(P.ypBand);
  ok('  their main-rota date: drums, in two weeks', (a.rota || []).some((x) => x.date === D14 && (x.roles || []).includes('Drums')), JSON.stringify(a));
  ok('  and nobody else’s name, nor anybody else’s role', !/Zara|Guitar|Bass|Ada/.test(JSON.stringify(a.rota)), JSON.stringify(a.rota));
  ok('  not a draft, and not further ahead than eight weeks', !(a.rota || []).some((x) => x.date === D21 || x.date === D84), JSON.stringify(a.rota));
  ok('  BOTH charters: Youth, and Worship & AV', (a.charters || []).map((c) => c.id).sort().join(',') === 'wider-worship-charter,youth-charter', JSON.stringify(a.charters));

  console.log('\nas a young person on the youth band only');
  const b = await callAs(P.ypYouth);
  ok('  the Youth charter', (b.charters || []).some((c) => c.id === 'youth-charter'), JSON.stringify(b.charters));
  ok('  and NOT the Worship & AV charter (A-066)', !(b.charters || []).some((c) => c.id === 'wider-worship-charter') && !/worship charter words/.test(JSON.stringify(b)), JSON.stringify(b.charters));
  ok('  and no rota dates, because they have none', (b.rota || []).length === 0, JSON.stringify(b.rota));

  console.log('\nand nobody else');
  ok('  a code that has run out is refused', /PERMISSION_DENIED/.test((await callAs(P.ypOld)).error || ''));
  ok('  nobody signed in is refused', /UNAUTHENTICATED/.test((await callAs(null)).error || ''));
  const c = await callAs(P.adBand);
  ok('  an adult on both gets the same: their own slot and both charters',
    (c.rota || []).some((x) => (x.roles || []).includes('Bass')) && (c.charters || []).length === 2, JSON.stringify(c));

  /* ---- 2. the Youth app, as an adult on both and one on youth only ---- */
  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    if (url === '/__signin.html') { s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return s.end(SIGNIN); }
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('no'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8'); const h = /<head[^>]*>/i.exec(t);
      body = Buffer.from(h ? t.slice(0, h.index + h[0].length) + NO_SW + t.slice(h.index + h[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript' : e === '.css' ? 'text/css'
      : e === '.json' ? 'application/json' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-youthhub-' + process.pid), '--window-size=375,812', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  const evl = makeEval(send, 'youth-hub');
  const openMine = async (k) => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/__signin.html' });
    await sleep(2500);
    await evl('firebase.auth(EGBCAuth.app).signOut()', true); await sleep(300);
    await evl('firebase.auth(EGBCAuth.app).signInWithEmailAndPassword(' + JSON.stringify(P[k].email) + ',' + JSON.stringify(PW) + ')', true);
    await sleep(800);
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/youthapp2.html' });
    for (let i = 0; i < 60; i++) { await sleep(400); if (await evl('!!document.getElementById("tile-mine") && typeof openSection === "function"')) break; }
    await sleep(1500);
    await evl('(function(){try{if(typeof endTour==="function")endTour()}catch(e){};openSection("mine");return 1})()');
    for (let i = 0; i < 30; i++) { await sleep(400); if (!/Looking you up/.test(String(await evl('(document.getElementById("mine-body")||{}).textContent||""')))) break; }
    return String(await evl('(document.getElementById("mine-body")||{}).innerText||""'));
  };

  console.log('\nthe Youth app, as an adult on the youth band and the main band');
  watch.reset();
  let t = await openMine('adBand');
  ok('  the tile is there, and opens their own dates', /Bass/.test(t) && /Sunday Morning Worship/.test(t), t.slice(0, 300));
  ok('  with both charters to open', Number(await evl('document.querySelectorAll("#mine-body details[data-charter]").length')) === 2, t.slice(0, 300));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  console.log('\nas an adult on the youth band only');
  watch.reset();
  t = await openMine('adYouth');
  ok('  one charter: the Youth one', String(await evl('[].slice.call(document.querySelectorAll("#mine-body details[data-charter]")).map(function(d){return d.getAttribute("data-charter")}).join(",")')) === 'youth-charter', t.slice(0, 300));
  ok('  and it says plainly they are not on the main rota', /not on the main rota/.test(t), t.slice(0, 300));
  ok('  nothing on the console', watch.errors.length === 0, watch.summary());

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  server.close(); chrome.kill();
  process.exit(R.some(v => !v) ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
