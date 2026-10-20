/* The e-news's subscribers end to end (FINDINGS-comms C-1, C-10, C-11):
 * sign-up with a confirm email, confirm, one-click unsubscribe, the
 * office adding people (from the address book, each with how they said
 * yes; under-16s and the unsubscribed skipped) and stopping it, the
 * unsubscribe page, Resend's bounce and complaint reports, and the shut
 * door until switch-over.
 *
 *   node tests/check-enews-subscribe.mjs          (from v2/)
 *
 * NEEDS EMULATORS OF ITS OWN (never another window's):
 *   firebase emulators:start --only firestore,auth --config firebase.comms.json
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8292 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9292 \
 *     firebase emulators:start --only functions --config firebase.comms-fn.json
 * with functions/.env.local holding TEST_WEBHOOK_SECRET (any whsec_ value;
 * this check reads it from there). Ports come from those two files.
 *
 * THREE LEVELS. (1) The decisions themselves (functions/enews.js and
 * hq-mail.js exports), with DELIBERATE BREAKS: each loads a copy of the
 * file with one line changed and must turn a named check red. (2) The
 * functions over HTTP, as the pages and Resend call them. (3) The sign-up
 * and unsubscribe pages in a 375px browser. Synthetic addresses only.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const V2 = path.resolve('.');
const C1 = JSON.parse(fs.readFileSync('firebase.comms.json', 'utf8')), C2 = JSON.parse(fs.readFileSync('firebase.comms-fn.json', 'utf8'));
const FS = C1.emulators.firestore.port, AU = C1.emulators.auth.port, FN = C2.emulators.functions.port;
const SECRET = (/TEST_WEBHOOK_SECRET=(\S+)/.exec(fs.existsSync('functions/.env.local') ? fs.readFileSync('functions/.env.local', 'utf8') : '') || [])[1] || '';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9788, SERVE = 8997;
const SHOTS = path.join(V2, 'tests', 'shots');
const DOCS = '/v1/projects/egbc-worship-planner/databases/(default)/documents';
const BASE = '/egbc-worship-planner/europe-west2/';
const OWNER = { Authorization: 'Bearer owner' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const R = [];
const ok = (n, v, x) => { R.push(!!v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (v || x === undefined ? '' : '\n          ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300))); };

/* ---- 1. the decisions, and the deliberate breaks ------------------------- */
async function loadCopy(file, from, to) {
  const src = fs.readFileSync(path.join(V2, 'functions', file), 'utf8');
  if (from && !src.includes(from)) throw new Error('the line to break is not in functions/' + file + ' any more - update the break');
  const tmp = path.join(V2, 'functions', '.check-' + process.pid + '-' + file);
  fs.writeFileSync(tmp, from ? src.replace(from, to) : src);
  try { return await import(pathToFileURL(tmp).href + '?' + Date.now()); } finally { fs.unlinkSync(tmp); }
}
const sign = (secret, id, ts, body) => 'v1,' + createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(id + '.' + ts + '.' + body).digest('base64');

async function decisions(E, H, quiet) {
  const out = [];
  const t = (n, v) => out.push({ n, v: !!v });
  const now = Date.parse('2026-10-19T12:00:00Z');
  t('a new address is created (pending)', E.signupDecision(null, now) === 'create');
  t('someone already subscribed is not sent another confirm', E.signupDecision({ status: 'subscribed' }, now) === 'already');
  t('no second confirm email within a day', E.signupDecision({ status: 'pending', confirmSentAt: new Date(now - 3600000).toISOString() }, now) === 'wait');
  t('a day later they can ask again', E.signupDecision({ status: 'pending', confirmSentAt: new Date(now - 90000000).toISOString() }, now) === 'create-again');
  t('an unsubscribed person who signs up again must confirm again', E.signupDecision({ status: 'unsubscribed' }, now) === 'create-again');
  t('unsubscribe turns every list off', JSON.stringify(E.unsubChange({ status: 'subscribed', lists: { weekly: true, special: true } }, 'unsubscribe').lists) === '{"weekly":false,"special":false}');
  t('special notices only', E.unsubChange({ status: 'unsubscribed' }, 'specialOnly').lists.special === true);
  t('after a spam complaint, a link cannot re-subscribe them', E.unsubChange({ status: 'complained' }, 'resubscribe') === null);
  t('after a bounce, a link cannot re-subscribe them', E.unsubChange({ status: 'bounced' }, 'resubscribe') === null);
  t('an unknown action does nothing', E.unsubChange({ status: 'subscribed' }, 'delete') === null);
  const s = 'whsec_' + Buffer.from('a-test-secret').toString('base64'), ts = String(Math.floor(now / 1000)), body = '{"type":"email.bounced"}';
  t('a correctly signed webhook is accepted', H.verifySvix(s, { 'svix-id': 'm1', 'svix-timestamp': ts, 'svix-signature': sign(s, 'm1', ts, body) }, body, now));
  t('a webhook with a changed body is refused', !H.verifySvix(s, { 'svix-id': 'm1', 'svix-timestamp': ts, 'svix-signature': sign(s, 'm1', ts, body) }, body + ' ', now));
  t('a webhook signed with another secret is refused', !H.verifySvix(s, { 'svix-id': 'm1', 'svix-timestamp': ts, 'svix-signature': sign('whsec_' + Buffer.from('other').toString('base64'), 'm1', ts, body) }, body, now));
  t('an old webhook (replayed) is refused', !H.verifySvix(s, { 'svix-id': 'm1', 'svix-timestamp': String(Number(ts) - 3600), 'svix-signature': sign(s, 'm1', String(Number(ts) - 3600), body) }, body, now));
  t('From is the church\u2019s name at mail.churchhq.co.uk, and cannot be broken', H.fromFor('Synthetic "Green" <Church>\r\nBcc: x') === '"Synthetic Green ChurchBcc: x" <news@mail.churchhq.co.uk>');
  if (!quiet) out.forEach(r => ok(r.n, r.v));
  return out;
}

/* ---- 2 and 3: the emulator ---------------------------------------------- */
/* raw: true sends body as it is, as a form (the mail app's one click);
   raw: 'json' sends a string as it is, as JSON (Resend's webhook, which is
   signed over its exact bytes). */
const req = (port, method, p, body, hdr, raw) => new Promise((res, rej) => {
  const d = body === undefined ? null : (raw ? body : JSON.stringify(body));
  const r = http.request({ host: '127.0.0.1', port, method, path: p,
    headers: Object.assign(d ? { 'Content-Type': raw === true ? 'application/x-www-form-urlencoded' : 'application/json', 'Content-Length': Buffer.byteLength(d) } : {}, hdr || {}) },
    s => { let x = ''; s.on('data', c => x += c); s.on('end', () => { let j = null; try { j = JSON.parse(x); } catch {} res({ status: s.statusCode, body: x, json: j }); }); });
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
  if ('integerValue' in v) return Number(v.integerValue); if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  return v;
}
const put = (p, data) => req(FS, 'PATCH', DOCS + '/' + p, { fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, fsValue(v)])) }, OWNER);
const list = async c => { const r = (await req(FS, 'GET', DOCS + '/' + c + '?pageSize=300', undefined, OWNER)).json || {}; return (r.documents || []).map(d => Object.assign({ _id: d.name.split('/').pop() }, Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromFs(v)])))); };
const subOf = async email => (await list('enewsSubscribers')).find(s => s.email === email);
const fn = (name, body, q, hdr, raw) => req(FN, 'POST', BASE + name + (q || ''), body, Object.assign({ Origin: 'http://localhost:' + SERVE, Referer: 'http://localhost:' + SERVE + '/enews-signup.html' }, hdr || {}), raw);
const outbox = async kind => (await list('emailOutbox')).filter(r => !kind || r.kind === kind);

(async () => {
  console.log('-- the decisions --');
  const E = await loadCopy('enews.js'), H = await loadCopy('hq-mail.js');
  await decisions(E, H);
  console.log('-- deliberate breaks --');
  const BREAKS = [
    ['enews.js', 'a second confirm email the same day', "if (st === 'pending' && nowMs - last < DAY) return 'wait';", '', 'no second confirm email within a day'],
    ['enews.js', 'a spam complaint undone by a link', "if (d.status === 'bounced' || d.status === 'complained') return null;", '', 'after a spam complaint'],
    ['hq-mail.js', 'old webhooks accepted', "if (!/^\\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 300) return false;", '', 'an old webhook'],
    ['hq-mail.js', 'the From name not cleaned', ".replace(/[\"<>\\r\\n\\\\]/g, '')", '', 'From is the church']
  ];
  for (const [file, what, from, to, expect] of BREAKS) {
    let red;
    try {
      const E2 = file === 'enews.js' ? await loadCopy(file, from, to) : E, H2 = file === 'hq-mail.js' ? await loadCopy(file, from, to) : H;
      red = (await decisions(E2, H2, true)).filter(r => !r.v).map(r => r.n);
    } catch (e) { red = []; console.log('          ' + e.message); }
    ok('break caught: ' + what, red.some(n => n.includes(expect)), red);
  }

  console.log('-- the functions, over HTTP --');
  try { await req(FS, 'GET', '/'); await req(FN, 'GET', '/'); } catch (e) { ok('emulators running on ' + FS + ' and ' + FN, false, 'start them first (see the header)'); return finish(); }
  if (!SECRET) { ok('TEST_WEBHOOK_SECRET in functions/.env.local', false); return finish(); }
  await req(FS, 'DELETE', '/emulator/v1/projects/egbc-worship-planner/databases/(default)/documents');
  await put('churchSettings/details', { name: 'Synthetic Green Church', enquiryEmail: 'office@example.invalid', logoUrl: '' });
  /* Martin, 19 Oct: at EGBC the add-ons start ON when nothing is stored
     (features.js), so "off" is stored here to prove the page obeys it. */
  await put('churchSettings/features', { enews: false });
  const A = 'alex.enews@example.invalid';

  let r = await fn('enewsSignup', { email: A, firstName: 'Alex' });
  ok('switched off: the sign-up says so and saves nothing', r.json && r.json.off === true && !(await subOf(A)), r.body);
  await put('churchSettings/features', { enews: true });
  await put('churchSettings/launch', { rulesLocked: false, opensOn: '1 November 2026' });
  r = await fn('enewsSignup', { email: A, firstName: 'Alex' });
  ok('before switch-over: "opens soon", and nothing saved (C-1)', r.json && r.json.shut === true && r.json.opensOn === '1 November 2026' && !(await subOf(A)), r.body);
  await put('churchSettings/launch', { rulesLocked: true, opensOn: '' });

  r = await fn('enewsSignup', { email: 'robot@example.invalid', website: 'http://spam.invalid' });
  ok('a robot (hidden box filled) is told yes and nothing is saved', r.json && r.json.ok && !(await subOf('robot@example.invalid')), r.body);
  r = await fn('enewsSignup', { email: 'not-an-email' });
  ok('a bad address is refused', r.status === 400);

  r = await fn('enewsSignup', { email: ' Alex.Enews@Example.invalid ', firstName: 'Alex', special: true, wording: 'signup-1' });
  let s = await subOf(A);
  ok('sign-up: a pending record, address tidied', r.json && r.json.ok && s && s.status === 'pending' && s.lists.special === true, s);
  ok('sign-up: what they were told is recorded with it', s && s.asked && /weekly e-news/.test(s.asked.text) && s.asked.wording === 'signup-1');
  ok('the answer never shows the full address', r.json && r.json.email && !r.json.email.includes('alex.enews@'), r.json);
  let mails = await outbox('enews confirm');
  ok('a confirm email went (stubbed), with the confirm link', mails.length === 1 && (mails[0].htmlForTest || '').includes('enews-confirm.html?t=' + s.confirmToken), mails.map(m => m.subject));
  ok('it is from the church\u2019s name at mail.churchhq.co.uk', mails[0] && mails[0].from === '"Synthetic Green Church" <news@mail.churchhq.co.uk>' && mails[0].replyTo === 'office@example.invalid', mails[0] && mails[0].from);
  await fn('enewsSignup', { email: A });
  ok('signing up again the same day sends no second email', (await outbox('enews confirm')).length === 1);

  r = await fn('enewsConfirm', { t: 'x'.repeat(32) });
  ok('a made-up confirm link does nothing', r.json && r.json.ok === false);
  r = await fn('enewsConfirm', { t: s.confirmToken });
  s = await subOf(A);
  ok('confirm: subscribed, with when and how', r.json && r.json.ok && s.status === 'subscribed' && s.consent && s.consent.confirmedAt && /confirmed by email/.test(s.consent.how), s && s.consent);
  r = await fn('enewsConfirm', { t: s.confirmToken || 'used' });
  ok('a confirm link works once', r.json && r.json.ok === false);

  r = await req(FN, 'POST', BASE + 'enewsUnsubscribe?t=' + s.token, 'List-Unsubscribe=One-Click', {}, true);
  s = await subOf(A);
  ok('one click from the mail app: an empty 200, and unsubscribed (RFC 8058)', r.status === 200 && r.body === '' && s.status === 'unsubscribed', r.status + ' ' + s.status);
  ok('the record is kept (do-not-contact), with the history', s && (s.history || []).some(h => /one click/.test(h.what)));
  r = await fn('enewsUnsubscribe', { t: s.token, action: 'resubscribe' });
  ok('the page can re-subscribe them', r.json && r.json.ok && (await subOf(A)).status === 'subscribed');

  /* The signing secret Martin pastes in the key box (privateSettings/
     churchHqMail.hook) is the one the webhook uses; the .env.local one is
     only for when the box is empty. */
  const BOXED = 'whsec_' + Buffer.from('boxed-test-only-secret').toString('base64');
  await put('privateSettings/churchHqMail', { hook: BOXED });
  const hookWith = async (secret, type, to, id) => {
    const body = JSON.stringify({ type, created_at: new Date().toISOString(), data: { to: [to], tags: { sub: '' } } });
    const ts = String(Math.floor(Date.now() / 1000));
    return req(FN, 'POST', BASE + 'hqMailEvents', body, { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sign(secret, id, ts, body) }, 'json');
  };
  const hook = (type, to, id) => hookWith(BOXED, type, to, id);
  r = await hookWith(SECRET, 'email.complained', A, 'msg_old');
  ok('with a secret in the key box, the .env.local one is refused', r.status === 401 && (await subOf(A)).status === 'subscribed', r.status);
  r = await req(FN, 'POST', BASE + 'hqMailEvents', JSON.stringify({ type: 'email.complained', data: { to: [A] } }), { 'svix-id': 'fake', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,AAAA' }, 'json');
  ok('an unsigned "complaint" is refused, and changes nothing', r.status === 401 && (await subOf(A)).status === 'subscribed', r.status);
  r = await hook('email.complained', A, 'msg_c1');
  s = await subOf(A);
  ok('a signed complaint from Resend: never sent again', r.status === 200 && s.status === 'complained' && s.lists.weekly === false, s.status);
  const before = (s.history || []).length;
  await hook('email.complained', A, 'msg_c1');
  ok('the same report twice is counted once', ((await subOf(A)).history || []).length === before);
  r = await fn('enewsUnsubscribe', { t: s.token, action: 'resubscribe' });
  ok('after a complaint, the link cannot sign them back up', r.json && r.json.ok === false && (await subOf(A)).status === 'complained', r.body);
  await fn('enewsSignup', { email: 'bea.enews@example.invalid' });
  r = await hook('email.bounced', 'bea.enews@example.invalid', 'msg_b1');
  ok('a bounce marks that address bounced', (await subOf('bea.enews@example.invalid')).status === 'bounced');

  /* ---- the office adds people (Martin, 20 Oct): from the address book
     several at once, each with how they said yes; an under-16 and anybody
     who unsubscribed are skipped, with the reason; the office can stop it. */
  const signIn = async (email, teams, master) => {
    let up = (await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', { email, password: 'synthetic-pw-1', returnSecureToken: true })).json || {};
    if (!up.localId) up = (await req(AU, 'POST', '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key', { email, password: 'synthetic-pw-1', returnSecureToken: true })).json || {};
    await put('users/' + up.localId, { uid: up.localId, email, status: 'active', teams, masterAdmin: master, adminFor: [] });
    return up.idToken;
  };
  const call = async (token, data) => { const x = await req(FN, 'POST', BASE + 'enewsSubscriberSave', { data }, { Authorization: 'Bearer ' + token }); return x.json || {}; };
  const OFF = await signIn('office.enews@example.invalid', ['Church office'], false);
  const MEM = await signIn('member.enews@example.invalid', ['Welcome team'], false);
  await put('addressBook/ab_kid', { name: 'Kit Synthetic', email: 'kit.enews@example.invalid', isMinor: true, archived: false });
  r = await call(MEM, { people: [{ email: 'dee.enews@example.invalid' }], how: 'person', from: 'addressBook' });
  ok('a church member who is not the office cannot add anyone', r.error && /office/i.test(r.error.message) && !(await subOf('dee.enews@example.invalid')), r);
  r = await call(OFF, { people: [{ email: 'dee.enews@example.invalid', firstName: 'Dee', memberId: 'ab_dee' }], from: 'addressBook' });
  ok('nobody is added without saying how they said yes', r.error && !(await subOf('dee.enews@example.invalid')), r);
  await fn('enewsSignup', { email: 'eve.enews@example.invalid' });
  await req(FS, 'PATCH', DOCS + '/enewsSubscribers/' + (await subOf('eve.enews@example.invalid'))._id + '?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt', { fields: { status: fsValue('unsubscribed'), updatedAt: fsValue('2026-10-01T09:00:00Z') } }, OWNER);
  r = await call(OFF, { people: [
    { email: 'dee.enews@example.invalid', firstName: 'Dee', memberId: 'ab_dee' },
    { email: 'fay.enews@example.invalid', firstName: 'Fay', memberId: 'ab_fay' },
    { email: 'kit.enews@example.invalid', firstName: 'Kit', memberId: 'ab_kid' },
    { email: 'eve.enews@example.invalid', firstName: 'Eve' }], how: 'person', from: 'addressBook' });
  const skipped = (r.result && r.result.skipped) || [];
  ok('from the address book: two added at once', r.result && r.result.added === 2, r);
  const dee = await subOf('dee.enews@example.invalid');
  ok('each with how they said yes, who, when, and their address book person', dee && dee.status === 'subscribed' && /told the office/.test(dee.consent.how) && dee.consent.by && dee.consent.at && dee.memberId === 'ab_dee' && /addressBook/.test(JSON.stringify(dee.history)), dee);
  ok('an under-16 is skipped, and says why', skipped.some(s => s.email === 'kit.enews@example.invalid' && /under 16/.test(s.skipped)) && !(await subOf('kit.enews@example.invalid')), skipped);
  ok('someone who unsubscribed is skipped: only they can come back', skipped.some(s => s.email === 'eve.enews@example.invalid' && /only they can sign up again/.test(s.skipped)) && (await subOf('eve.enews@example.invalid')).status === 'unsubscribed', skipped);
  r = await call(OFF, { email: 'eve.enews@example.invalid', how: 'person', from: 'addressBook', confirmAgain: true });
  ok('not even with "they asked again" from the address book', r.error && (await subOf('eve.enews@example.invalid')).status === 'unsubscribed', r);
  r = await call(OFF, { email: 'dee.enews@example.invalid', action: 'stop' });
  const deeStop = await subOf('dee.enews@example.invalid');
  ok('the office can stop it: kept as unsubscribed, with who', r.result && r.result.stopped === true && deeStop.status === 'unsubscribed' && deeStop.lists.weekly === false && deeStop.history.some(h => /stopped by the office/.test(h.what) && h.by), deeStop.status);

  /* ---- 3. the pages, at 375 --------------------------------------------- */
  console.log('-- the pages, at 375 --');
  await put('churchSettings/launch', { rulesLocked: true, opensOn: '' });
  const server = http.createServer((q, res) => {
    const url = decodeURIComponent(q.url.split('?')[0]);
    const f = path.join(V2, url.replace(/^\//, ''));
    if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    let body = fs.readFileSync(f, 'utf8');
    const b = path.basename(f);
    if (b === 'egbc-auth.js') body = body.replace('{ firestore: 8181, auth: 9099, storage: 9199 }', '{ firestore: ' + FS + ', auth: ' + AU + ', storage: 9399 }');
    if (b === 'egbc-enews-public.js') body = body.replace("(location.port === '5601' ? 5102 : 5101)", String(FN));
    const e = path.extname(f);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[e] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }).listen(SERVE);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-enews-sub-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT, '--user-data-dir=' + prof, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  const getJSON = p => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(JSON.parse(d))); }).on('error', rej));
  let tabs; for (let i = 0; i < 40; i++) { try { tabs = await getJSON('/json/list'); break; } catch { await sleep(500); } }
  const ws = new WebSocket(tabs.find(x => x.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pend = new Map(), errors = [];
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  await new Promise(res => ws.onopen = res);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result || {}); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  const ev = async x => { const q = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (q.exceptionDetails) throw new Error(q.exceptionDetails.text); return q.result && q.result.value; };
  const until = async (x, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(x).catch(() => false)) return true; await sleep(250); } return false; };
  const shot = async n => { const q = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, 'enews-375-' + n + '.png'), Buffer.from(q.data, 'base64')); };
  const fits = async () => (await ev('document.documentElement.scrollWidth')) <= 375;
  fs.mkdirSync(SHOTS, { recursive: true });
  try {
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews-signup.html' });
    await until('!!document.getElementById("go") && /Synthetic Green Church/.test(document.getElementById("ch").innerText)');
    ok('sign-up page: the church\u2019s name, fits 375', /Synthetic Green Church/.test(await ev('document.getElementById("ch").innerText')) && await fits());
    await shot('signup');
    await ev('document.getElementById("first").value="Cal";document.getElementById("email").value="cal.enews@example.invalid";document.getElementById("go").click(),1');
    await until('/check your email/.test(document.body.innerText)');
    ok('sign-up page: "check your email", and a pending record', /check your email/.test(await ev('document.body.innerText')) && (await subOf('cal.enews@example.invalid') || {}).status === 'pending');
    await shot('signup-done');
    const cal = await subOf('cal.enews@example.invalid');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews-confirm.html?t=' + cal.confirmToken });
    await until('/on the list/.test(document.body.innerText)');
    ok('confirm page: "You\u2019re on the list"', (await subOf('cal.enews@example.invalid')).status === 'subscribed');
    await send('Page.navigate', { url: 'http://localhost:' + SERVE + '/enews-unsubscribe.html?t=' + cal.token });
    await until('/unsubscribed/.test(document.body.innerText)');
    ok('unsubscribe page: one tap from the email, nothing to type', (await subOf('cal.enews@example.invalid')).status === 'unsubscribed' && await fits());
    await shot('unsubscribe');
    await ev('document.getElementById("re").click(),1');
    await until('/back on the list/.test(document.body.innerText)');
    ok('unsubscribe page: "Re-subscribe" puts them back', (await subOf('cal.enews@example.invalid')).status === 'subscribed');
    const small = await ev('[...document.querySelectorAll("button,a,input")].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&r.height<30&&e.offsetParent}).map(e=>e.textContent.trim().slice(0,20))');
    ok('no control under 30px', small.length === 0, small);
    ok('no errors thrown in the pages', errors.length === 0, errors);
  } catch (e) { ok('the browser part finished', false, e.message); }
  ws.close(); chrome.kill(); server.close();
  finish();
})().catch(e => { console.error(e); process.exit(1); });

function finish() {
  const fails = R.filter(v => !v).length;
  console.log('\n' + (R.length - fails) + '/' + R.length + ' passed');
  process.exit(fails ? 1 : 0);
}
