/* Payments with NO webhook (F-209; Martin, 15 Oct: Stripe's webhook was
   "the thing I couldn't get them to give me" - the hub must not depend on
   it). Events window. Invented people only, events emulators only, network
   guard, and STAND-IN Stripe and GoCardless on this machine: no real
   payment service, no real money. No webhook secret is ever set here.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/payments-nowebhook.test.mjs"

   What it proves:
     1. the key alone turns card payments on; the token alone, bank
        payments; the page calls the webhook "Optional"
     2. A FULL CARD PAYMENT WITH NO WEBHOOK ENDS IN "PAID": the person
        comes back from Stripe and my place says "Paid £6.00 by card"
     3. paid but never came back: the scheduled check finds it
     4. not paid in time: the check closes it at Stripe and gives the place
        back
     5. refunded in Stripe's dashboard: my place says so when it opens;
        disputed: Who is coming finds it when it opens
     6. a bank payment with no webhook: "Paid £8.00 by bank"
     7. a regular gift with no webhook: the Direct Debit is found and the
        gift starts; each gift collected is recorded once */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createGuard } from './guard.mjs';
const GUARD = createGuard();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V2 = path.resolve(HERE, '..', '..');
const PROJECT = 'egbc-worship-planner';
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8182' && process.env.FIRESTORE_EMULATOR_HOST !== 'localhost:8182') throw new Error('Not run under the events emulators: ' + process.env.FIRESTORE_EMULATOR_HOST);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-nohook-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
/* This process runs the scheduled check itself: it must count as the
   emulator, so it asks the stand-ins, never the real services. */
process.env.FUNCTIONS_EMULATOR = 'true';
const PAYMOD = await import(pathToFileURL(path.join(V2, 'functions', 'payments.js')).href);
const GCMOD = await import(pathToFileURL(path.join(V2, 'functions', 'gocardless.js')).href);

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 600))); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 20000) { const end = Date.now() + ms; let last; while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = null; } await sleep(250); } return last; }
const J = (x) => JSON.stringify(x);
const pad = (n) => (n < 10 ? '0' : '') + n;
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());

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

/* ---------- a stand-in Stripe that remembers ---------- */
const KEY = 'rk_test_' + 'N'.repeat(24);
const S = { sessions: {}, pis: {}, n: 0, calls: [] };
const stand = http.createServer((req, res) => {
  let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
    S.calls.push(req.method + ' ' + req.url);
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url.startsWith('/pay/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<h1 id="standin">Stand-in Stripe: pay here</h1>'); return; }
    if (req.headers.authorization !== 'Bearer ' + KEY) return json(401, { error: { message: 'Invalid API Key provided' } });
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/v1/account') return json(200, { id: 'acct_1NoHookChurch99', settings: { dashboard: { display_name: 'No Hook Church (invented)' } } });
    if (u.pathname === '/v1/checkout/sessions' && req.method === 'POST') {
      const f = new URLSearchParams(body), id = 'cs_test_nh' + (++S.n);
      S.sessions[id] = { id, object: 'checkout.session', status: 'open', payment_status: 'unpaid', payment_intent: null, url: 'http://localhost:5650/pay/' + id,
        metadata: { signupKey: f.get('metadata[signupKey]'), keys: f.get('metadata[keys]') } };
      return json(200, S.sessions[id]);
    }
    let m = u.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)(\/expire)?$/);
    if (m && S.sessions[m[1]]) {
      const s = S.sessions[m[1]];
      if (m[2] && req.method === 'POST') { if (s.status === 'open') s.status = 'expired'; }
      return json(200, s);
    }
    m = u.pathname.match(/^\/v1\/payment_intents\/([^/]+)$/);
    if (m && S.pis[m[1]]) return json(200, { id: m[1], latest_charge: S.pis[m[1]] });
    json(404, { error: { message: 'not here' } });
  });
});
await new Promise(r => stand.listen(5650, '127.0.0.1', r));
const stripePays = (id) => { const s = S.sessions[id]; s.status = 'complete'; s.payment_status = 'paid'; s.payment_intent = 'pi_' + id; S.pis[s.payment_intent] = { amount_refunded: 0, disputed: false }; };

/* ---------- a stand-in GoCardless that remembers ---------- */
const GTOK = 'sandbox_' + 'N'.repeat(30);
const G = { brs: {}, payments: {}, n: 0 };
const gstand = http.createServer((req, res) => {
  let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url.startsWith('/flow/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<h1 id="standin">Stand-in GoCardless</h1>'); return; }
    if (req.headers.authorization !== 'Bearer ' + GTOK) return json(401, { error: { message: 'Invalid access token' } });
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/creditors') return json(200, { creditors: [{ id: 'CR000NOHOOK', name: 'No Hook Church (invented)' }] });
    if (u.pathname === '/billing_requests' && req.method === 'POST') { const id = 'BRQ' + (++G.n); G.brs[id] = { id, status: 'pending', links: {} }; return json(201, { billing_requests: G.brs[id] }); }
    if (u.pathname === '/billing_request_flows' && req.method === 'POST') { const b = JSON.parse(body); return json(201, { billing_request_flows: { authorisation_url: 'http://localhost:5651/flow/' + b.billing_request_flows.links.billing_request } }); }
    let m = u.pathname.match(/^\/billing_requests\/([^/]+)$/);
    if (m && G.brs[m[1]]) return json(200, { billing_requests: G.brs[m[1]] });
    if (u.pathname === '/subscriptions' && req.method === 'POST') return json(201, { subscriptions: { id: 'SB' + (++G.n) } });
    if (u.pathname === '/payments' && req.method === 'GET') { const sub = u.searchParams.get('subscription'); return json(200, { payments: Object.values(G.payments).filter(p => p.links && p.links.subscription === sub) }); }
    m = u.pathname.match(/^\/payments\/([^/]+)$/);
    if (m) return json(200, { payments: G.payments[m[1]] || { id: m[1], amount: 800, status: 'confirmed', amount_refunded: 0, charge_date: '2026-11-01' } });
    json(404, { error: { message: 'not here' } });
  });
});
await new Promise(r => gstand.listen(5651, '127.0.0.1', r));

/* ---------- invented church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = { martin: { email: 'martin.master@example.invalid', name: 'Martin Master', mid: 'm_martin', master: true, teams: ['Core Team'] } };
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: !!x.master });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: !!x.master, attender: true, status: 'active' });
}
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid', hubUrl: URLB });
await db.collection('paymentSecrets').doc('config').set({ stripeApi: 'http://127.0.0.1:5650', gocardlessApi: 'http://127.0.0.1:5651' });
const start = new Date(); start.setDate(start.getDate() + 5); start.setHours(18, 0, 0, 0);
const EV = (title, payBy, price) => ({ title, description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
  featured: false, startLocal: iso(start), startUtc: start.getTime(), endLocal: iso(new Date(start.getTime() + 3 * 3600e3)), endUtc: start.getTime() + 3 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: true, capacity: 20, allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', createdBy: 'x', updatedAt: 'x' });
for (const [id, title, payBy, price] of [['ev_card', 'Ceilidh (invented)', ['card'], 6], ['ev_bank', 'Barn dance (invented)', ['bank'], 8]]) {
  await db.collection('calEvents').doc(id).set(EV(title, payBy, price));
  await db.collection('calEvents').doc(id).collection('ticketTypes').doc('tt_' + id).set({ name: 'Adult', price, capacity: 0, order: 1, payBy });
  await db.collection('capacity').doc(id).set({ calEventId: id, taken: 0, capacity: 20 });
}

const errors = [], browsers = [];
async function browser(who, width) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', userDataDir: fs.mkdtempSync(path.join(TMP, who + '-')), args: ['--no-first-run'] });
  GUARD.watchBrowser(b); browsers.push(b);
  const pg = await b.newPage();
  await GUARD.protect(pg, who);
  await pg.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, '1'); } catch (e) {} }, 'egbc_fresh_' + STAMP);
  await pg.setViewport({ width: width || 1100, height: 900 });
  pg.on('pageerror', e => errors.push(who + ': ' + e.message));
  pg.on('dialog', d => d.accept());
  await pg.goto(URLB + 'whatson.html', { waitUntil: 'networkidle2' });
  await pg.waitForFunction(() => window.firebase && firebase.apps.some(a => a.name === 'egbc'));
  if ((await pg.evaluate(() => EGBCAuth.db._delegate._settings.host)) !== 'localhost:8182') throw new Error('Not on the events emulator');
  if (P[who]) await pg.evaluate((e) => firebase.auth(firebase.app('egbc')).signInWithEmailAndPassword(e, 'synthetic-only-123'), P[who].email);
  return pg;
}
const text = (pg, sel) => pg.$eval(sel || 'body', e => e.innerText.replace(/\s+/g, ' '));
const data = async (c, id) => { const s = await db.collection(c).doc(id).get(); return s.exists ? s.data() : null; };
let gn = 0;
async function signUpAndPay(ev, btn, who) {
  const pg = await browser('guest' + (++gn), 390);
  await pg.goto(URLB + 'signup.html?event=' + ev, { waitUntil: 'networkidle2' });
  await pg.waitForSelector('#nm');
  await pg.type('#nm', who + ' (invented)'); await pg.type('#em', who.toLowerCase() + '@example.invalid'); await pg.type('#att0', who + ' (invented)');
  await sleep(2700);
  await pg.$eval('#go', b => b.click());
  await until(() => pg.$(btn));
  await pg.$eval(btn, b => b.click());
  await until(() => pg.$('#standin'), 20000);
  let key = ''; (await db.collection('signups').where('email', '==', who.toLowerCase() + '@example.invalid').get()).docs.forEach(d => { key = d.id; });
  return { pg, key, pay: await data('signupPayments', key) };
}

try {
  /* ---------- 1. keys only ---------- */
  const M = await browser('martin');
  await M.goto(URLB + 'payments.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('#saveKey'));
  await M.$eval('#stripeKey', (e, v) => { e.value = v; }, KEY); await M.$eval('#saveKey', b => b.click());
  await until(async () => /Connected/.test(await text(M, '#stripeStatus')));
  await M.$eval('#gcKey', (e, v) => { e.value = v; }, GTOK); await M.$eval('#gcSaveKey', b => b.click());
  await until(async () => /Connected/.test(await text(M, '#gcStatus')).catch(() => false) || /Connected/.test(await text(M, '#gocardless')));
  await M.goto(URLB + 'payments.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('#hookStatus'));
  const pub = await data('paymentSettings', 'public');
  ok('1. THE KEY ALONE TURNS CARD PAYMENTS ON; THE TOKEN ALONE, BANK PAYMENTS (no webhook anywhere)', pub.card === true && pub.bank === true && !((await data('paymentSecrets', 'stripe')) || {}).webhookSecret && !((await data('paymentSecrets', 'gocardless')) || {}).webhookSecret, J(pub));
  ok('   the page: "Optional: makes payments show straight away", and the hub checks itself', (await M.$$eval('.guide li b', bs => bs.filter(b => b.textContent === 'Optional: makes payments show straight away.').length)) === 2 && /The hub checks with Stripe itself/.test(await text(M, '#hookStatus')) && /The hub checks with GoCardless itself/.test(await text(M, '#gcHookStatus')));
  await M.$$eval('details', ds => ds.forEach(d => { d.open = true; }));
  await M.screenshot({ path: path.join(HERE, 'payments-nowebhook-page.png'), fullPage: true });

  /* ---------- 2. a full card payment, no webhook ---------- */
  const a = await signUpAndPay('ev_card', '#payCard', 'Amy');
  ok('   (Amy\'s place is held, awaiting payment)', a.pay && a.pay.status === 'awaiting' && a.pay.method === 'card-online', J(a.pay));
  stripePays(a.pay.checkoutId);
  await a.pg.goto(URLB + 'my-signup.html?key=' + a.key + '&paid=card', { waitUntil: 'networkidle2' });
  const paidRow = await until(async () => { const t = await text(a.pg, '#paid').catch(() => ''); return /Paid £6\.00 by card/.test(t) ? t : null; });
  ok('2. A FULL CARD PAYMENT WITH NO WEBHOOK ENDS IN "PAID": back from Stripe, my place says "Paid £6.00 by card"', !!paidRow && (await data('signupPayments', a.key)).paid === true && (await data('signupPayments', a.key)).paymentRef === 'pi_' + a.pay.checkoutId, paidRow);
  await a.pg.screenshot({ path: path.join(HERE, 'payments-nowebhook-paid-390.png'), fullPage: true });
  ok('   and no webhook ever came: the hub asked Stripe for the session', S.calls.includes('GET /v1/checkout/sessions/' + a.pay.checkoutId) && (await db.collection('paymentEvents').get()).size === 0);

  /* ---------- 3. paid, never came back ---------- */
  const b = await signUpAndPay('ev_card', '#payCard', 'Ben');
  stripePays(b.pay.checkoutId);
  await PAYMOD.tidyCard(Date.now());
  ok('3. PAID BUT NEVER CAME BACK: the scheduled check finds it', (await data('signupPayments', b.key)).paid === true);

  /* ---------- 4. not paid in time ---------- */
  const c = await signUpAndPay('ev_card', '#payCard', 'Cal');
  await PAYMOD.tidyCard(Date.now());
  ok('   still within its time: left alone', (await data('signupPayments', c.key)).status === 'awaiting' && S.sessions[c.pay.checkoutId].status === 'open');
  const takenBefore = (await data('capacity', 'ev_card')).taken;
  await PAYMOD.tidyCard(Date.now() + 40 * 60 * 1000);
  ok('4. NOT PAID IN TIME: closed at Stripe first (nobody can pay for it now), then the place given back', S.sessions[c.pay.checkoutId].status === 'expired' && (await data('signups', c.key)).status === 'cancelled' && (await data('signupPayments', c.key)).status === 'expired' && (await data('capacity', 'ev_card')).taken === takenBefore - 1, J(await data('signupPayments', c.key)));

  /* ---------- 5. refunded; disputed ---------- */
  S.pis['pi_' + a.pay.checkoutId].amount_refunded = 600;
  await a.pg.goto(URLB + 'my-signup.html?key=' + a.key, { waitUntil: 'networkidle2' });
  const ref = await until(async () => { const t = await text(a.pg, '#refunded').catch(() => ''); return /Refunded £6\.00/.test(t) ? t : null; });
  ok('5. REFUNDED IN STRIPE\'S DASHBOARD: my place says "Refunded £6.00" when it opens', !!ref && (await data('signupPayments', a.key)).status === 'refunded', ref);
  S.pis['pi_' + b.pay.checkoutId].disputed = true;
  await M.goto(URLB + 'events-admin.html', { waitUntil: 'networkidle2' });
  await until(() => M.$('.open[data-id="ev_card"]'));
  await M.$eval('.open[data-id="ev_card"]', e => e.click());
  const dis = await until(async () => (await data('signupPayments', b.key)).status === 'disputed');
  ok('   DISPUTED: Who is coming finds it when it opens', dis === true, J(await data('signupPayments', b.key)));

  /* ---------- 6. bank, no webhook ---------- */
  const d = await signUpAndPay('ev_bank', '#payBank', 'Dot');
  ok('   (Dot\'s bank payment is waiting)', d.pay && d.pay.method === 'bank-online' && d.pay.status === 'awaiting', J(d.pay));
  G.brs[d.pay.checkoutId].status = 'fulfilled'; G.brs[d.pay.checkoutId].links = { payment_request_payment: 'PM_DOT' };
  await d.pg.goto(URLB + 'my-signup.html?key=' + d.key + '&paid=bank', { waitUntil: 'networkidle2' });
  const bankPaid = await until(async () => { const t = await text(d.pg, '#paid').catch(() => ''); return /Paid £8\.00 by bank/.test(t) ? t : null; });
  ok('6. A BANK PAYMENT WITH NO WEBHOOK: "Paid £8.00 by bank"', !!bankPaid && (await data('signupPayments', d.key)).paymentRef === 'PM_DOT', bankPaid);
  const e = await signUpAndPay('ev_bank', '#payBank', 'Eve');
  G.brs[e.pay.checkoutId].status = 'fulfilled'; G.brs[e.pay.checkoutId].links = { payment_request_payment: 'PM_EVE' };
  await GCMOD.tidyBank(Date.now() + 40 * 60 * 1000);
  ok('   paid but never came back, with the time up: asked first, so KEPT and paid, not given away', (await data('signupPayments', e.key)).paid === true && (await data('signups', e.key)).status === 'confirmed');

  /* ---------- 7. a regular gift, no webhook ---------- */
  const R = await browser('giver', 390);
  await R.goto(URLB + 'give-regularly.html', { waitUntil: 'networkidle2' });
  await until(() => R.$('#go'));
  await R.$eval('#amt', x => { x.value = '15'; }); await R.select('#often', 'monthly'); await R.select('#day', '1');
  await R.$eval('#nm', x => { x.value = 'Gil Giver (invented)'; }); await R.$eval('#em', x => { x.value = 'gil.giver@example.invalid'; });
  await R.$eval('#go', x => x.click());
  await until(() => R.$('#standin'), 20000);
  const gift = (await db.collection('regularGifts').where('email', '==', 'gil.giver@example.invalid').get()).docs[0];
  G.brs[gift.data().billingRequest].status = 'fulfilled'; G.brs[gift.data().billingRequest].links = { mandate_request_mandate: 'MD_GIL' };
  await GCMOD.pollGifts(Date.now(), true);
  const live = await data('regularGifts', gift.id);
  ok('7. A REGULAR GIFT WITH NO WEBHOOK: the Direct Debit is found and the gift starts, with its email', live.status === 'active' && live.mandateId === 'MD_GIL' && !!live.subscriptionId && (await db.collection('emailOutbox').where('kind', '==', 'regular gift set up').get()).size === 1, J(live));
  G.payments['PM_GIL1'] = { id: 'PM_GIL1', amount: 1500, status: 'confirmed', charge_date: '2026-11-01', amount_refunded: 0, links: { subscription: live.subscriptionId } };
  await GCMOD.pollGifts(Date.now(), true);
  await GCMOD.pollGifts(Date.now(), true);
  const dons = (await db.collection('donations').get()).docs.map(x => x.data());
  ok('   each gift collected is recorded ONCE (asked twice), £15 with no Gift Aid', dons.length === 1 && dons[0].amount === 15 && dons[0].regularGiftKey === gift.id, J(dons));

  ok('no page errors', errors.length === 0, errors.join(' | '));
} catch (err) {
  ok('the run finished', false, err.stack || err.message);
} finally {
  for (const b of browsers) await b.close().catch(() => {});
  server.close(); stand.close(); gstand.close();
  const leaks = GUARD.leaks();
  ok('nothing left the machine', leaks.length === 0, leaks.join(' | '));
}
const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
