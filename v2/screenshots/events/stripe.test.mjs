/* Card payments through the church's OWN Stripe account (F-181). Events
   window. Invented people only, events emulators only, network guard, and
   a STAND-IN STRIPE on this machine: no real Stripe, no real money.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/stripe.test.mjs"

   What it proves:
     1. the treasurer pastes the church's own key: checked with Stripe first
        (a wrong key or not-a-key is refused, in words); then "Connected:
        <name>, account …1234, test"
     2. THE KEY NEVER COMES BACK: not in anything a page can read, and the
        place it is kept is refused to everyone, a master admin included
     3. only a master admin or the money team may set it up
     4. a ticket paid by card: the SERVER works out the price (2 x £6 =
        £12.00), the person pays on Stripe's page, the place is held
     5. NO FEE: no request to Stripe ever carries an application fee
     6. Stripe's message that it is paid: "Paid £12.00 by card", on "my
        place" and in Events; a forged message is refused; a repeated one
        acts once; one for another account is ignored
     7. not paid in time: the place is given back
     8. refunded in Stripe's dashboard: "Refunded £12.00"
     9. removed: nobody is offered card payment */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-stripe-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const HOOK = 'http://127.0.0.1:5102/' + PROJECT + '/europe-west2/stripeWebhook';

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

/* ---------- the pages ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(V2, p === '/' ? 'index.html' : p);
  if (!f.startsWith(V2) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(5601, 'localhost', r));
const URLB = 'http://localhost:5601/';

/* ---------- the stand-in Stripe ---------- */
const GOOD = 'rk_test_' + 'Q'.repeat(24), CALLS = [];
let sessions = 0;
const stand = http.createServer((req, res) => {
  let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
    CALLS.push({ method: req.method, url: req.url, auth: req.headers.authorization || '', body });
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/v1/account') return req.headers.authorization === 'Bearer ' + GOOD ? json(200, { id: 'acct_1TestChurch1234', settings: { dashboard: { display_name: 'Test Green Church (invented)' } } }) : json(401, { error: { message: 'Invalid API Key provided' } });
    if (req.url === '/v1/checkout/sessions' && req.method === 'POST') { sessions++; return json(200, { id: 'cs_test_' + sessions, url: 'http://localhost:5650/pay/cs_test_' + sessions }); }
    if (req.url.startsWith('/pay/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<h1 id="standin">Stand-in Stripe: pay here</h1>'); return; }
    json(404, { error: { message: 'not here' } });
  });
});
await new Promise(r => stand.listen(5650, '127.0.0.1', r));
/* What Stripe would send, signed with the church's own whsec_. */
const WHSEC = 'whsec_' + 'T'.repeat(32);
const signed = (event, secret, when) => {
  const raw = JSON.stringify(event), t = when || Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret || WHSEC).update(t + '.' + raw).digest('hex');
  return fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=' + t + ',v1=' + v1 }, body: raw }).then(async r => ({ status: r.status, text: await r.text() }));
};

/* ---------- invented church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] },
  tess:   { email: 'tess.treasurer@example.invalid', name: 'Tess Treasurer (invented)', mid: 'm_tess', teams: ['Finance'] },
  ann:    { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid', hubUrl: URLB });
await db.collection('paymentSecrets').doc('config').set({ stripeApi: 'http://127.0.0.1:5650' });
const start = new Date(); start.setDate(start.getDate() + 5); start.setHours(18, 0, 0, 0);
await db.collection('calEvents').doc('ev_card').set({ title: 'Ceilidh (invented)', description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
  featured: false, startLocal: iso(start), startUtc: start.getTime(), endLocal: iso(new Date(start.getTime() + 3 * 3600e3)), endUtc: start.getTime() + 3 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: true, capacity: 20, allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', createdBy: 'x', updatedAt: 'x' });
await db.collection('calEvents').doc('ev_card').collection('ticketTypes').doc('tt_card').set({ name: 'Adult', price: 6, capacity: 0, order: 1, payBy: ['card'] });
await db.collection('capacity').doc('ev_card').set({ calEventId: 'ev_card', taken: 0, capacity: 20 });

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const p = await b.newPage();
  await GUARD.protect(p, who);
  await p.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await p.setViewport({ width: width || 1100, height: 900 });
  p.on('pageerror', e => errors.push(who + ': ' + e.message));
  p.on('dialog', d => d.accept());
  await p.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await p.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await p.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return p;
}
const text = (p, sel) => p.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const data = async (c, id) => { const s = await db.collection(c).doc(id).get(); return s.exists ? s.data() : null; };
const msg = (p, id) => until(async () => { const t = await p.$eval('#' + id, e => e.textContent).catch(() => ''); return t && !/Checking|Saving/.test(t) ? t : null; });
const pasteKey = async (p, v) => { await p.$eval('#stripeKey', (e, v) => { e.value = v; }, v); await p.$eval('#saveKey', b => b.click()); };
const allDocsText = async () => { let out = ''; for (const c of ['paymentSettings', 'signupPayments', 'paymentEvents']) { (await db.collection(c).get()).docs.forEach(d => { out += J(d.data()); }); } return out; };

try {
  /* ---------- 1. the treasurer connects ---------- */
  const M = await browser('martin');
  await M.goto(URLB + 'payments.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('#saveKey'));
  ok('1. NOT CONNECTED, with the step-by-step guide', /Not connected/.test(await text(M, '#stripeStatus')) && /Make a restricted key/.test(await text(M, '#stripe')) && /stripeWebhook/.test(await text(M, '#hookUrl')));
  await pasteKey(M, 'not-a-key');
  ok('   NOT A KEY: refused, in words', /not a Stripe secret key/.test(await msg(M, 'keyMsg')));
  await M.$eval('#saveKey', b => { b.disabled = false; });
  await pasteKey(M, 'rk_test_' + 'W'.repeat(24));
  ok('   A WRONG KEY: Stripe does not accept it, and it is not kept', /did not accept that key/.test(await msg(M, 'keyMsg')) && !(await data('paymentSecrets', 'stripe')));
  await M.$eval('#saveKey', b => { b.disabled = false; });
  await pasteKey(M, GOOD);
  await until(async () => /Connected/.test(await text(M, '#stripeStatus')));
  ok('   THE CHURCH\'S OWN KEY: checked with Stripe, then "Connected: name, account …1234, test"', /Connected: Test Green Church \(invented\), account …1234, test \(no real money\)\. Added by Martin Master/.test(await text(M, '#stripeStatus')), await text(M, '#stripeStatus'));
  ok('   not yet offered to anyone: the webhook is not set', /Not finished: add the webhook/.test(await text(M, '#hookStatus')) && !((await data('paymentSettings', 'public')) || {}).card);

  /* ---------- 2. the key never comes back ---------- */
  ok('2. THE KEY IS NOWHERE A PAGE CAN READ: not in the settings, not on the page, and the box is empty again', !(await allDocsText()).includes(GOOD) && !(await M.content()).includes(GOOD) && (await M.$eval('#stripeKey', e => e.value)) === '');
  const kept = await M.evaluate(() => EGBCAuth.db.collection('paymentSecrets').doc('stripe').get().then(() => 'read', e => e.code));
  ok('   and where it IS kept is refused to everyone, even a master admin', kept === 'permission-denied', kept);
  ok('   the server has it, and only the server', (await data('paymentSecrets', 'stripe')).secretKey === GOOD);
  await M.$eval('#hookSecret', (e, v) => { e.value = v; }, WHSEC);
  await M.$eval('#saveHook', b => b.click());
  await until(async () => /webhook is set/.test(await text(M, '#hookStatus')));
  ok('   THE WEBHOOK\'S SIGNING SECRET: saved the same way; now card payment is offered', ((await data('paymentSettings', 'public')) || {}).card === true && !(await allDocsText()).includes(WHSEC));
  await M.screenshot({ path: path.join(HERE, 'stripe-payments-page.png'), fullPage: true });

  /* ---------- 3. who may ---------- */
  const T = await browser('tess');
  await T.goto(URLB + 'payments.html', { waitUntil: 'networkidle2' });
  await until(() => T.$('#stripeStatus'));
  ok('3. THE MONEY TEAM (Finance, not an admin) sees it and may set it up', /Connected/.test(await text(T, '#stripeStatus')) && !!(await T.$('#saveKey')));
  const A = await browser('ann');
  const annTry = await A.evaluate((k) => EGBCAuth.call('paymentsSave', { provider: 'stripe', kind: 'key', value: k }).then(() => 'saved', e => e.message), GOOD);
  ok('   ANYONE ELSE IS REFUSED by the server', /Only a master admin or the church's money team/.test(annTry), annTry);
  /* A renamed money team: its NAME (not who is on it) is where the Menu can read it (da5cc4af). */
  const renamed = await M.evaluate(() => EGBCAuth.call('paymentsTeam', { team: 'Treasury' }).then(r => r.team, e => e.message));
  const seen = await A.evaluate(() => EGBCAuth.db.collection('paymentSettings').doc('public').get().then(s => s.data().moneyTeam, e => e.code));
  const hidden = await A.evaluate(() => EGBCAuth.db.collection('paymentSettings').doc('team').get().then(() => 'read', e => e.code));
  ok('   THE MONEY TEAM RENAMED ("Treasury"): its name is in the public settings for the Menu; the team record itself stays private', renamed === 'Treasury' && seen === 'Treasury' && /permission/.test(hidden), renamed + ' ' + seen + ' ' + hidden);
  const annTeam = await A.evaluate(() => EGBCAuth.call('paymentsTeam', { team: 'Ann\'s team' }).then(() => 'renamed', e => e.message));
  ok('   only a master admin may rename it', /Only a master admin names the money team/.test(annTeam), annTeam);
  await M.evaluate(() => EGBCAuth.call('paymentsTeam', { team: 'Finance' }));
  await A.goto(URLB + 'payments.html', { waitUntil: 'networkidle2' });
  await sleep(1500);
  ok('   and the page says it is not for them', /master admins and the church's money team/.test(await text(A)));

  /* ---------- 4. paying for a ticket ---------- */
  const G = await browser('guest', 390);
  await G.goto(URLB + 'signup.html?event=ev_card', { waitUntil: 'networkidle2' });
  await G.waitForSelector('#nm');
  await G.type('#nm', 'Pat Payer (invented)'); await G.type('#em', 'pat.payer@example.invalid'); await G.type('#att0', 'Pat Payer (invented)');
  await G.$eval('#addAtt', b => b.click()); await G.waitForSelector('#att1'); await G.type('#att1', 'Sam Payer (invented)');
  ok('4. A CARD TICKET: "To pay: £12.00, by card online straight after you sign up"', !!(await until(async () => /£12\.00, by card online straight after/.test(await G.$eval('#due', e => e.textContent)))));
  await sleep(2700);
  await G.$eval('#go', b => b.click());
  await until(() => G.$('#payCard'));
  ok('   signed up: "Pay £12.00 by card", the place held for 30 minutes', /Pay £12\.00 by card/.test(await text(G, '#payCard')) && /held for 30 minutes/.test(await text(G, '#payBox')));
  await G.screenshot({ path: path.join(HERE, 'stripe-pay-390.png'), fullPage: true });
  const before = CALLS.length;
  await G.$eval('#payCard', b => b.click());
  await until(() => G.$('#standin'), 20000);
  ok('   ON STRIPE\'S OWN PAGE to pay', /Stand-in Stripe/.test(await text(G)));
  const sess = CALLS.slice(before).find(c => c.url === '/v1/checkout/sessions');
  const form = new URLSearchParams(sess ? sess.body : '');
  ok('   THE SERVER WORKED OUT THE PRICE: 2 x £6 = 1200p, in pounds, with the church\'s own key', sess && form.get('line_items[0][price_data][unit_amount]') === '1200' && form.get('line_items[0][price_data][currency]') === 'gbp' && sess.auth === 'Bearer ' + GOOD, sess && sess.body);
  let KEY = ''; (await db.collection('signups').where('email', '==', 'pat.payer@example.invalid').get()).docs.forEach(d => { KEY = d.id; });
  const aw = await data('signupPayments', KEY);
  ok('   and the place is held: awaiting payment, £12', aw && aw.status === 'awaiting' && aw.amount === 12 && aw.method === 'card-online' && form.get('metadata[keys]') === KEY, J(aw));

  /* ---------- 6. Stripe says it is paid ---------- */
  const forged = await signed({ id: 'evt_forged', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_intent: 'pi_1', metadata: { keys: KEY } } } }, 'whsec_' + 'X'.repeat(32));
  ok('6. A FORGED MESSAGE (wrong secret) IS REFUSED, and changes nothing', forged.status === 400 && !(await data('signupPayments', KEY)).paid, J(forged));
  const old = await signed({ id: 'evt_old', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_intent: 'pi_1', metadata: { keys: KEY } } } }, WHSEC, Math.floor(Date.now() / 1000) - 3600);
  ok('   AN OLD MESSAGE (an hour old) IS REFUSED', old.status === 400 && !(await data('signupPayments', KEY)).paid);
  const otherAcct = await signed({ id: 'evt_other', account: 'acct_someoneElse', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_intent: 'pi_1', metadata: { keys: KEY } } } });
  ok('   one for ANOTHER ACCOUNT is ignored', otherAcct.status === 200 && /another account/.test(otherAcct.text) && !(await data('signupPayments', KEY)).paid, J(otherAcct));
  const real = { id: 'evt_paid', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', payment_intent: 'pi_1', amount_total: 1200, metadata: { keys: KEY } } } };
  const r1 = await signed(real);
  const paid = await until(async () => { const d = await data('signupPayments', KEY); return d && d.paid ? d : null; });
  ok('   THE REAL ONE: paid, by card, £12', r1.status === 200 && paid && paid.status === 'paid' && paid.paymentRef === 'pi_1' && paid.amount === 12, J(paid));
  const r2 = await signed(real);
  ok('   SENT AGAIN, it acts once', r2.status === 200 && /already/.test(r2.text));
  await G.goto(URLB + 'my-signup.html?key=' + KEY + '&paid=card', { waitUntil: 'networkidle2' });
  await until(() => G.$('#paid'));
  ok('   MY PLACE: "Paid £12.00 by card"', /Paid £12\.00 by card/.test(await text(G, '#paid')));

  /* ---------- 5. no fee, ever ---------- */
  ok('5. NO FEE: no request to Stripe carried an application fee', CALLS.length > 0 && !CALLS.some(c => /application_fee|transfer_data|on_behalf_of/.test(c.body + c.url)), J(CALLS.map(c => c.url)));

  /* ---------- 7. not paid in time ---------- */
  const G2 = await browser('guest2', 390);
  await G2.goto(URLB + 'signup.html?event=ev_card', { waitUntil: 'networkidle2' });
  await G2.waitForSelector('#nm');
  await G2.type('#nm', 'Lou Late (invented)'); await G2.type('#em', 'lou.late@example.invalid'); await G2.type('#att0', 'Lou Late (invented)');
  await sleep(2700); await G2.$eval('#go', b => b.click());
  await until(() => G2.$('#payCard'));
  await G2.$eval('#payCard', b => b.click());
  await until(() => G2.$('#standin'), 20000);
  let K2 = ''; (await db.collection('signups').where('email', '==', 'lou.late@example.invalid').get()).docs.forEach(d => { K2 = d.id; });
  ok('7. A SECOND BOOKING TAKES ITS PLACE: 3 taken', (await data('capacity', 'ev_card')).taken === 3);
  await signed({ id: 'evt_exp', type: 'checkout.session.expired', data: { object: { id: 'cs_test_2', metadata: { keys: K2 } } } });
  await until(async () => (await data('signups', K2)).status === 'cancelled');
  ok('   NOT PAID IN TIME: cancelled, and the place given back (2 taken)', (await data('signups', K2)).status === 'cancelled' && (await data('capacity', 'ev_card')).taken === 2 && (await data('signupPayments', K2)).status === 'expired');

  /* ---------- 8. refunded in Stripe ---------- */
  await signed({ id: 'evt_ref', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_1', amount_refunded: 1200 } } });
  await until(async () => (await data('signupPayments', KEY)).status === 'refunded');
  ok('8. REFUNDED IN STRIPE\'S DASHBOARD: "Refunded £12.00"', (await data('signupPayments', KEY)).refunded === 12);
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('.open[data-id="ev_card"]'));
  await M.$eval('.open[data-id="ev_card"]', e => e.click());
  await until(() => M.$('[data-tab="people"]'));
  await M.$eval('[data-tab="people"]', e => e.click());
  await until(() => M.$('[data-pay="' + KEY + '"]'));
  ok('   and Events shows it', /Refunded £12\.00/.test(await M.$eval('[data-pay="' + KEY + '"]', e => e.textContent)));

  /* ---------- 9. removed ---------- */
  await M.goto(URLB + 'payments.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('#removeStripe'));
  await M.$eval('#removeStripe', b => b.click());
  await until(async () => /Not connected/.test(await text(M, '#stripeStatus')));
  ok('9. REMOVED: the key is gone from the server, and card payment is not offered', !(await data('paymentSecrets', 'stripe')) && ((await data('paymentSettings', 'public')) || {}).card === false);
  const G3 = await browser('guest3', 390);
  await G3.goto(URLB + 'signup.html?event=ev_card', { waitUntil: 'networkidle2' });
  await G3.waitForSelector('#nm'); await G3.type('#att0', 'Nell New (invented)'); await sleep(600);
  ok('   the sign-up page no longer says "by card"', !/by card/.test(await G3.$eval('#due', e => e.textContent)), await G3.$eval('#due', e => e.textContent));

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  ok('the run finished', false, e.stack || e.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close(); stand.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
