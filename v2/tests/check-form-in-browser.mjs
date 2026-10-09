/* The availability form, filled in. Not opened and looked at - filled in.
 *
 *   node tests/check-form-in-browser.mjs            (from v2/, emulators running)
 *   node tests/check-form-in-browser.mjs --shots    and save pictures
 *
 * WHY THIS AS WELL AS check-availability-form.mjs. That one proves the three
 * functions, thoroughly, by calling them over HTTP. It proves nothing about
 * the page: whether index.html asks the right region, reaches the functions
 * emulator rather than the live project, passes the token it was given, and
 * draws what comes back. Every one of those is a place a mistake would sit
 * quietly, because the page would simply show no dates - which is what the
 * form did for anybody whose read was refused, and nobody noticed for weeks.
 *
 * So this types an address in, picks a name out of the household dropdown,
 * presses an answer, reloads, and checks the answer is still there.
 *
 * THE ONE THING IT CANNOT DO is prove the page has no Firestore left in it;
 * a page can hold a dead import and still work. check-availability-form.mjs
 * and firestore-rules.test.mjs cover the collections being shut. What this
 * adds is that the form still works once they are.
 *
 * IT ALSO COVERS THE OTHER PAGE that relied on those collections being
 * open. youthserviceplanner.html read the whole address book and every event
 * with no sign-in check at all - `await ready` resolves with null as happily
 * as with a user. Martin's decision was the shared guard, so the last section
 * here opens it signed out and proves it is turned away rather than drawing a
 * planner with an empty name list.
 *
 * Nobody is signed in for any of it, which is the whole point of the form.
 * Synthetic people throughout; every address ends .invalid.
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
const PORT = 9641, SERVE = 8879;
const wantShots = process.argv.includes('--shots');

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v ? '' : (x !== undefined ? '\n          ' + String(x).slice(0, 400) : ''))); };

const NO_SW = '<script>(function(){try{if(navigator.serviceWorker){navigator.serviceWorker.register=function(){return Promise.resolve(undefined);};}}catch(e){}})();</script>';
/* An ALLOWLIST, never a blocklist: anything not named here is refused, so a
   request to the live project cannot slip through by being spelt differently. */
const ALLOWED = ['www.gstatic.com', 'cdn.tailwindcss.com', 'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const reachedOff = [];
const offMachine = u => {
  if (/^(data|blob|about|chrome):/i.test(String(u))) return false;
  let h; try { h = new URL(u).host; } catch { return true; }
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(h)) return false;
  return !ALLOWED.includes(h.split(':')[0]);
};

/* ---- the invented people, seeded straight into the dev emulator ------- */

const FS_PORT = 8181;
const DOCS = `/v1/projects/egbc-worship-planner/databases/(default)/documents`;
const rest = (method, p, body) => new Promise((res, rej) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request({ host: 'localhost', port: FS_PORT, method, path: p,
    headers: Object.assign({ Authorization: 'Bearer owner' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) },
    r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
  req.on('error', rej); req.end(data);
});
const val = (v) => {
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
  if (v && typeof v === 'object') return { mapValue: { fields: fields(v) } };
  return { stringValue: String(v) };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));
const put = (p, obj) => rest('PATCH', DOCS + '/' + p, { fields: fields(obj) });
const getOne = async (p) => { const r = await rest('GET', DOCS + '/' + p); return r.status === 200 ? JSON.parse(r.body) : null; };
const plain = (f) => f && ('stringValue' in f ? f.stringValue : undefined);

const EMAIL = 'browserhouse@example.invalid';
const PAT = 'ab_pat_browser';     /* Worship Team */
const QUINN = 'ab_quinn_browser'; /* Kids Church, same address: a household */
const PHONE = '01999 888777';

async function seed() {
  await put('addressBook/' + PAT, { name: 'Pat Browser', email: EMAIL,
    markers: ['Worship Team'], phone: PHONE });
  await put('addressBook/' + QUINN, { name: 'Quinn Browser', email: EMAIL,
    markers: ['Kids Church'], phone: PHONE });
  const extras = { assignments: { Guitar: { id: PAT, name: 'Pat Browser' } },
                   serviceLeader: 'Rue Hidden', speaker: 'Sol Hidden' };
  await put('events/ev_br_one', { ...extras, date: '2026-12-06', startTime: '08:00',
    endTime: '11:30', type: 'Sunday Morning Worship', description: 'Carols',
    termLabel: 'Browser Term', teams: ['Worship Team'], archived: false });
  await put('events/ev_br_two', { ...extras, date: '2026-12-13', startTime: '08:00',
    endTime: '11:30', type: 'Sunday Morning Worship', description: '',
    termLabel: 'Browser Term', teams: ['Worship Team'], archived: false });
  await put('events/ev_br_kids', { ...extras, date: '2026-12-20', startTime: '09:30',
    endTime: '11:00', type: 'Kids Church', description: '',
    termLabel: 'Browser Term', teams: ['Kids Church'], archived: false });
  /* Clear anything a previous run left, so "it saved" cannot be last week. */
  for (const id of [PAT, QUINN]) for (const ev of ['ev_br_one', 'ev_br_two', 'ev_br_kids'])
    await rest('DELETE', DOCS + '/availability/' + id + '_' + ev);
  for (const d of JSON.parse((await rest('GET', DOCS + '/formRateLimit?pageSize=300')).body || '{}').documents || [])
    await rest('DELETE', '/v1/' + d.name.replace(/^.*?(projects\/)/, '$1'));
}

(async () => {
  if (wantShots) fs.mkdirSync(SHOTS, { recursive: true });
  await seed();

  const server = http.createServer((q, s) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    const f = path.join(V2, url.replace(/^\//, '') || 'index.html');
    if (!path.resolve(f).startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end('not found'); }
    const e = path.extname(f).toLowerCase();
    let body = fs.readFileSync(f);
    if (e === '.html') {
      const t = body.toString('utf8');
      const head = /<head[^>]*>/i.exec(t);
      body = Buffer.from(head ? t.slice(0, head.index + head[0].length) + NO_SW + t.slice(head.index + head[0].length) : NO_SW + t, 'utf8');
    }
    const type = e === '.html' ? 'text/html' : e === '.js' || e === '.mjs' ? 'text/javascript'
      : e === '.css' ? 'text/css' : e === '.json' ? 'application/json'
      : e === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
    s.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
    s.end(body);
  }).listen(SERVE);

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'cdp-form-' + process.pid), '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
      if (offMachine(u)) { reachedOff.push(u.split('/')[2]); return send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); }
      send('Fetch.continueRequest', { requestId: m.params.requestId });
    }
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });

  const ev = async (x, a = false) => {
    const r = (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: a })) || {};
    if (r.exceptionDetails) return 'THREW ' + String((r.exceptionDetails.exception || {}).description || '').split('\n')[0];
    return r.result && r.result.value;
  };
  const shot = async (name) => {
    if (!wantShots) return;
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (r.data) fs.writeFileSync(path.join(SHOTS, 'form--' + name + '.png'), Buffer.from(r.data, 'base64'));
  };

  /* An alert or a confirm stops a headless page dead, and the form uses both.
     Answered rather than suppressed, so what it said can be read back. */
  const SILENCE = `window.__said = [];
    window.alert = m => { window.__said.push(String(m)); };
    window.confirm = m => { window.__said.push(String(m)); return true; };`;

  const open = async () => {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/index.html' });
    await sleep(3500);
    await ev(SILENCE);
  };

  console.log('\nnobody signed in, which is the point');
  watch.reset();
  await open();
  ok('the form opens with no account at all',
    (await ev('!!document.getElementById("memberEmail")')) === true);
  ok('and nobody is signed in', (await ev('(window.EGBCAuth && EGBCAuth.user && EGBCAuth.user()) ? "someone" : "nobody"')) === 'nobody');
  await shot('1-login');

  console.log('\ntyping an address in');
  await ev('document.getElementById("memberEmail").value = ' + JSON.stringify(EMAIL));
  await ev('window.loginMember()', true);
  await sleep(2500);

  const said = await ev('JSON.stringify(window.__said || [])');
  ok('no complaint from the lookup', said === '[]', said);

  const dropdown = await ev('document.getElementById("householdBox").classList.contains("hidden") ? "hidden" : "shown"');
  ok('a household address offers the "which of you is this?" dropdown', dropdown === 'shown', dropdown);
  const opts = await ev('Array.from(document.querySelectorAll("#householdSelect option")).map(o => o.textContent.trim()).join("|")');
  ok('with both of them in it', /Pat Browser/.test(String(opts)) && /Quinn Browser/.test(String(opts)), opts);
  await shot('2-household');

  console.log('\npicking a name, and seeing the dates');
  await ev('document.getElementById("householdSelect").value = ' + JSON.stringify(PAT));
  await ev('window.confirmHouseholdMember()');
  await sleep(3000);

  /* Named, not counted. Counting broke the moment another check in the suite
     seeded an event of its own into the same emulator - and an exact count is
     the wrong assertion anyway: what matters is which of OUR dates are drawn
     and which are not. */
  const drawnIds = String(await ev(`JSON.stringify(Array.from(document.querySelectorAll('#eventList button'))
    .map(b => (b.getAttribute('onclick') || '').match(/ev_br_[a-z]+/))
    .filter(Boolean).map(m => m[0]).filter((v, i, a) => a.indexOf(v) === i))`));
  ok('Pat gets both of his Sundays', /ev_br_one/.test(drawnIds) && /ev_br_two/.test(drawnIds), drawnIds);
  ok('and not the Kids Church date, which is not his', !/ev_br_kids/.test(drawnIds), drawnIds);

  const shown = await ev('(document.getElementById("eventList").innerText || "").replace(/\\s+/g, " ")');
  ok('the term heading is drawn', /Browser Term/i.test(String(shown)), String(shown).slice(0, 160));
  ok('and the Kids Church date is NOT, because it is not his', !/Kids Church/i.test(String(shown)), String(shown).slice(0, 200));

  /* The whole reason the rules are closing. */
  ok('no service leader on the page', !/Rue Hidden/.test(String(shown)));
  ok('no speaker on the page', !/Sol Hidden/.test(String(shown)));
  const body = await ev('document.documentElement.innerHTML');
  ok('and no telephone number anywhere in the page', !String(body).includes(PHONE));
  await shot('3-dates');

  console.log('\npressing an answer');
  const pressed = await ev(`(() => {
    const b = Array.from(document.querySelectorAll('#eventList button'))
      .find(x => /avail/i.test(x.getAttribute('onclick') || '') && /ev_br_one/.test(x.getAttribute('onclick') || ''));
    if (!b) return 'no button';
    b.click();
    return b.getAttribute('onclick');
  })()`);
  ok('there is an answer button to press', !/no button/.test(String(pressed)), pressed);
  await sleep(2500);

  const saved = await getOne('availability/' + PAT + '_ev_br_one');
  ok('the answer reached the database', !!saved, 'nothing at availability/' + PAT + '_ev_br_one');
  ok('under Pat, not the other person on the address',
    saved && plain(saved.fields.memberId) === PAT, saved && plain(saved.fields.memberId));
  ok('with his name off the record, which the page no longer sends',
    saved && plain(saved.fields.memberName) === 'Pat Browser', saved && plain(saved.fields.memberName));
  ok('and the date off the event',
    saved && plain(saved.fields.dateKey) === '2026-12-06', saved && plain(saved.fields.dateKey));

  console.log('\ncoming back to it - the half that never worked before');
  await open();
  await ev('document.getElementById("memberEmail").value = ' + JSON.stringify(EMAIL));
  await ev('window.loginMember()', true);
  await sleep(2000);
  await ev('document.getElementById("householdSelect").value = ' + JSON.stringify(PAT));
  await ev('window.confirmHouseholdMember()');
  await sleep(3000);

  /* availabilityData is module-scoped, not on window - the first version of
     this read window.availabilityData, got null, and would have reported the
     same null whether the answer came back or not. So read the SCREEN: the
     chosen button is the one renderDates gives bg-green-600, and the other
     one must not have it. */
  const drawn = await ev(`(() => {
    const all = Array.from(document.querySelectorAll('#eventList button'));
    const pick = s => all.find(x => /ev_br_one/.test(x.getAttribute('onclick') || '')
                                    && x.getAttribute('onclick').includes("'" + s + "'"));
    const yes = pick('avail'), no = pick('not-avail');
    if (!yes || !no) return JSON.stringify({ missing: true });
    return JSON.stringify({ yes: yes.className.includes('bg-green-600'),
                            no: no.className.includes('bg-red-600') });
  })()`);
  let d = {}; try { d = JSON.parse(String(drawn) || '{}'); } catch {}
  ok('the answer he gave is drawn as chosen when he comes back', d.yes === true, drawn);
  ok('and the answer he did not give is not', d.no === false, drawn);
  await shot('4-remembered');

  console.log('\nthe console, and where the page went');
  const errs = watch.errors;
  /* The logo lives in the storage bucket and the emulator has no copy, so
     that one complaint is the harness and not the page. */
  const real = errs.filter(e => !/Logo fetch failed|storage\/object-not-found/i.test(String(e)));
  ok('no errors from the form itself', real.length === 0, JSON.stringify(real).slice(0, 300));
  ok('nothing reached off this machine', reachedOff.length === 0, [...new Set(reachedOff)].join(', '));

  console.log('\nthe youth planner, signed out');
  /* It is an installable offline app and had no door at all. Opened signed
     out it must now say so, not draw itself with nothing in it. */
  watch.reset();
  await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/youthserviceplanner.html' });
  await sleep(6000);
  const where = await ev('location.pathname.split("/").pop() + "|" + (document.body.innerText||"").replace(/\s+/g," ").slice(0,120)');
  const blocked = await ev('document.body.getAttribute("data-egbc-blocked") || ""');
  ok('the youth planner no longer opens to nobody',
    /login\.html/.test(String(where)) || String(blocked) !== '' || /Checking access|sign in/i.test(String(where)),
    where + '   blocked=' + blocked);
  /* And the thing it used to do anyway: build a name list out of the whole
     address book. Whatever the page shows, those two names must not be on it. */
  const leaked = await ev('(document.body.innerText || "").indexOf("Pat Browser") >= 0 || document.documentElement.innerHTML.indexOf("' + PHONE + '") >= 0');
  ok('and it shows nobody from the address book', leaked === false, String(leaked));

  server.close(); chrome.kill(); ws.close();
  const failed = R.filter(v => !v).length;
  console.log('\n' + (R.length - failed) + '/' + R.length + ' passed');
  process.exit(failed ? 1 : 0);
})();
