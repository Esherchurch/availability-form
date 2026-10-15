/* Bank payments and Direct Debit giving through the church's OWN
   GoCardless account (F-181). Events window. Invented people only, events
   emulators only, network guard, and a STAND-IN GOCARDLESS on this machine:
   no real GoCardless, no real money.

     npx firebase emulators:exec --config firebase.events.json --only auth,firestore,storage,functions \
       --project egbc-worship-planner "node screenshots/events/gocardless.test.mjs"

   What it proves:
     1. the money team pastes the church's own GoCardless token: checked with
        GoCardless first; "Connected …1234, test"; the token never comes back
     2. a ticket "on the day or by bank": both offered; Instant Bank Pay on
        GoCardless's own page, the SERVER's price (800p); paid when GoCardless
        says so; a forged message refused
     3. not paid in 30 minutes: the place goes back
     4. REGULAR GIVING: £20 a month with Gift Aid; the Direct Debit is set up
        on GoCardless's page; once the mandate is ready the gift starts
        (a subscription for £20 on the 1st); the Gift Aid declaration is kept
     5. each collected gift is recorded once, with Gift Aid, for the claim
     6. the giver changes the amount, and stops it
     7. the treasurer sees the gifts and downloads the Gift Aid gifts
     8. NO FEE, ever; nobody else reads the gifts; removed, nothing offered */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'egbc-gc-'));
const STAMP = JSON.parse(fs.readFileSync(path.join(V2, 'version.json'), 'utf8').replace(/^\uFEFF/, '')).stamp;
const fnRequire = createRequire(path.join(V2, 'functions', 'index.js'));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getFirestore } = fnRequire('firebase-admin/firestore');
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const GCMOD = await import(pathToFileURL(path.join(V2, 'functions', 'gocardless.js')).href);
const HOOK = 'http://127.0.0.1:5102/' + PROJECT + '/europe-west2/gocardlessWebhook';

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

/* ---------- the stand-in GoCardless ---------- */
const GOOD = 'sandbox_' + 'G'.repeat(30), CALLS = [];
let subs = 0;
let n = 0;
const stand = http.createServer((req, res) => {
  let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
    CALLS.push({ method: req.method, url: req.url, auth: req.headers.authorization || '', version: req.headers['gocardless-version'] || '', body });
    const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const authed = req.headers.authorization === 'Bearer ' + GOOD;
    if (req.url.startsWith('/flow/')) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<h1 id="standin">Stand-in GoCardless</h1>'); return; }
    if (!authed) return json(401, { error: { message: 'Invalid access token' } });
    if (req.url === '/creditors') return json(200, { creditors: [{ id: 'CR000TEST1234', name: 'Test Green Church (invented)' }] });
    if (req.url === '/billing_requests' && req.method === 'POST') { n++; return json(201, { billing_requests: { id: 'BRQ' + n } }); }
    if (req.url === '/billing_request_flows' && req.method === 'POST') { const b = JSON.parse(body); return json(201, { billing_request_flows: { authorisation_url: 'http://localhost:5651/flow/' + b.billing_request_flows.links.billing_request } }); }
    if (req.url === '/subscriptions' && req.method === 'POST') { subs++; return json(201, { subscriptions: { id: 'SB' + subs } }); }
    if (req.url.startsWith('/subscriptions/')) return json(200, { subscriptions: { id: 'SB1' } });
    if (req.url.startsWith('/payments/')) return json(200, { payments: { id: req.url.split('/')[2], amount: 2000, charge_date: '2026-11-01' } });
    json(404, { error: { message: 'not here' } });
  });
});
await new Promise(r => stand.listen(5651, '127.0.0.1', r));
const SECRET = 'gc_hook_secret_' + 'S'.repeat(20);
const send = (events, secret) => {
  const raw = JSON.stringify({ events });
  const sig = crypto.createHmac('sha256', secret || SECRET).update(raw).digest('hex');
  return fetch(HOOK, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Webhook-Signature': sig }, body: raw }).then(async r => ({ status: r.status, text: await r.text() }));
};

/* ---------- invented church ---------- */
await fetch(`http://127.0.0.1:8182/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9098/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
const P = {
  tess: { email: 'tess.treasurer@example.invalid', name: 'Tess Treasurer (invented)', mid: 'm_tess', teams: ['Finance'] },
  ann:  { email: 'ann.attender@example.invalid', name: 'Ann Attender', mid: 'm_ann', teams: [] }
};
for (const k of Object.keys(P)) {
  P[k].uid = (await (await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: P[k].email, password: 'synthetic-only-123', returnSecureToken: true }) })).json()).localId;
  const x = P[k];
  await db.collection('addressBook').doc(x.mid).set({ name: x.name, email: x.email, markers: x.teams, adminFor: [], masterAdmin: false });
  await db.collection('users').doc(x.uid).set({ memberId: x.mid, linkedBy: 'admin', name: x.name, email: x.email, teams: x.teams, adminFor: [], masterAdmin: false, attender: true, status: 'active' });
}
await db.collection('churchSettings').doc('details').set({ name: 'Test Green Church', enquiryEmail: 'office@example.invalid', hubUrl: URLB });
await db.collection('paymentSecrets').doc('config').set({ gocardlessApi: 'http://127.0.0.1:5651' });
const start = new Date(); start.setDate(start.getDate() + 5); start.setHours(18, 0, 0, 0);
await db.collection('calEvents').doc('ev_bank').set({ title: 'Quiz night (invented)', description: '', category: 'social', labels: [], visibility: 'public', status: 'confirmed', audience: ['public', 'members'], teams: [],
  featured: false, startLocal: iso(start), startUtc: start.getTime(), endLocal: iso(new Date(start.getTime() + 3 * 3600e3)), endUtc: start.getTime() + 3 * 3600e3, allDay: false,
  location: { kind: 'online' }, organiserName: 'Karen', overseers: [], overseerUids: [], signupOn: true, capacity: 20, allowSelfCancel: true, donationsOn: false, signupScope: 'date', image: '', createdBy: 'x', updatedAt: 'x' });
await db.collection('calEvents').doc('ev_bank').collection('ticketTypes').doc('tt_bank').set({ name: 'Team of one', price: 8, capacity: 0, order: 1, payBy: ['day', 'bank'] });
await db.collection('capacity').doc('ev_bank').set({ calEventId: 'ev_bank', taken: 0, capacity: 20 });

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

try {
  /* ---------- 1. the money team connects GoCardless ---------- */
  const T = await browser('tess');
  await T.goto(URLB + 'payments.html', { waitUntil: 'networkidle2' });
  await until(() => T.$('#gcSaveKey'));
  ok('1. GOCARDLESS: not connected, with the step-by-step guide', /Not connected/.test(await text(T, '#gcStatus')) && /Make an access token/.test(await text(T, '#gocardless')) && /gocardlessWebhook/.test(await text(T, '#gcHookUrl')));
  await T.$eval('#gcKey', e => { e.value = 'not-a-token'; }); await T.$eval('#gcSaveKey', b => b.click());
  ok('   NOT A TOKEN: refused, in words', /not a GoCardless access token/.test(await msg(T, 'gcKeyMsg')));
  await T.$eval('#gcSaveKey', b => { b.disabled = false; });
  await T.$eval('#gcKey', e => { e.value = 'sandbox_' + 'W'.repeat(30); }); await T.$eval('#gcSaveKey', b => b.click());
  ok('   A WRONG TOKEN: GoCardless does not accept it, and it is not kept', /did not accept that token/.test(await msg(T, 'gcKeyMsg')) && !(await data('paymentSecrets', 'gocardless')));
  await T.$eval('#gcSaveKey', b => { b.disabled = false; });
  await T.$eval('#gcKey', (e, v) => { e.value = v; }, GOOD); await T.$eval('#gcSaveKey', b => b.click());
  await until(async () => /Connected/.test(await text(T, '#gcStatus')));
  ok('   THE CHURCH\'S OWN TOKEN: "Connected: Test Green Church, account …1234, test"', /Connected: Test Green Church \(invented\), account …1234, test \(no real money\)/.test(await text(T, '#gcStatus')), await text(T, '#gcStatus'));
  await T.$eval('#gcHookSecret', (e, v) => { e.value = v; }, SECRET); await T.$eval('#gcSaveHook', b => b.click());
  await until(async () => /webhook is set/.test(await text(T, '#gcHookStatus')));
  const pub = await data('paymentSettings', 'public');
  const everything = J((await db.collection('paymentSettings').get()).docs.map(d => d.data())) + await T.content();
  ok('   the webhook secret saved; bank payments now offered; NEITHER COMES BACK to any page', pub.bank === true && !everything.includes(GOOD) && !everything.includes(SECRET), J(pub));
  await T.screenshot({ path: path.join(HERE, 'gocardless-payments-page.png'), fullPage: true });

  /* ---------- 2. a ticket, on the day or by bank ---------- */
  const G = await browser('guest', 390);
  await G.goto(URLB + 'signup.html?event=ev_bank', { waitUntil: 'networkidle2' });
  await G.waitForSelector('#nm');
  await G.type('#nm', 'Pat Payer (invented)'); await G.type('#em', 'pat.payer@example.invalid'); await G.type('#att0', 'Pat Payer (invented)');
  ok('2. "ON THE DAY OR BY BANK": both are offered', !!(await until(async () => /£8\.00, by bank online after you sign up, or at the door on the day/.test(await G.$eval('#due', e => e.textContent)))), await G.$eval('#due', e => e.textContent));
  await sleep(2700); await G.$eval('#go', b => b.click());
  await until(() => G.$('#payBank'));
  ok('   signed up: "Pay £8.00 by bank", and no card button', /Pay £8\.00 by bank/.test(await text(G, '#payBank')) && !(await G.$('#payCard')));
  const before = CALLS.length;
  await G.$eval('#payBank', b => b.click());
  await until(() => G.$('#standin'), 20000);
  const br = CALLS.slice(before).find(c => c.url === '/billing_requests');
  const brb = br ? JSON.parse(br.body) : {};
  ok('   INSTANT BANK PAY on GoCardless\'s page; the SERVER\'s price, 800p, in pounds, with the church\'s token', br && brb.billing_requests.payment_request.amount === 800 && brb.billing_requests.payment_request.currency === 'GBP' && br.auth === 'Bearer ' + GOOD && br.version === '2015-07-06', br && br.body);
  let KEY = ''; (await db.collection('signups').where('email', '==', 'pat.payer@example.invalid').get()).docs.forEach(d => { KEY = d.id; });
  const aw = await data('signupPayments', KEY);
  ok('   held, waiting for the bank payment', aw && aw.status === 'awaiting' && aw.method === 'bank-online' && aw.amount === 8, J(aw));
  const forged = await send([{ id: 'EVforged', resource_type: 'billing_requests', action: 'fulfilled', links: { billing_request: aw.checkoutId, payment_request_payment: 'PM1' } }], 'not_the_secret_at_all_123');
  ok('   A FORGED MESSAGE IS REFUSED, and changes nothing', forged.status === 498 && !(await data('signupPayments', KEY)).paid, J(forged));
  const r1 = await send([{ id: 'EV1', resource_type: 'billing_requests', action: 'fulfilled', links: { billing_request: aw.checkoutId, payment_request_payment: 'PM1' } }]);
  const paid = await until(async () => { const d = await data('signupPayments', KEY); return d && d.paid ? d : null; });
  ok('   GOCARDLESS SAYS IT IS PAID: "paid by bank"', r1.status === 200 && paid && paid.method === 'bank-online' && paid.paymentRef === 'PM1', J(paid));
  await G.goto(URLB + 'my-signup.html?key=' + KEY + '&paid=bank', { waitUntil: 'networkidle2' });
  await until(() => G.$('#paid'));
  ok('   MY PLACE: "Paid £8.00 by bank"', /Paid £8\.00 by bank/.test(await text(G, '#paid')));

  /* ---------- 3. not paid in 30 minutes ---------- */
  const G2 = await browser('guest2', 390);
  await G2.goto(URLB + 'signup.html?event=ev_bank', { waitUntil: 'networkidle2' });
  await G2.waitForSelector('#nm');
  await G2.type('#nm', 'Lou Late (invented)'); await G2.type('#em', 'lou.late@example.invalid'); await G2.type('#att0', 'Lou Late (invented)');
  await sleep(2700); await G2.$eval('#go', b => b.click());
  await until(() => G2.$('#payBank')); await G2.$eval('#payBank', b => b.click()); await until(() => G2.$('#standin'), 20000);
  let K2 = ''; (await db.collection('signups').where('email', '==', 'lou.late@example.invalid').get()).docs.forEach(d => { K2 = d.id; });
  ok('3. a second booking holds its place (2 taken)', (await data('capacity', 'ev_bank')).taken === 2);
  ok('   still within 30 minutes: kept', (await GCMOD.tidyBank(Date.now())) === 0 && (await data('signups', K2)).status === 'confirmed');
  await GCMOD.tidyBank(Date.now() + 40 * 60 * 1000);
  ok('   NOT PAID IN 30 MINUTES: cancelled and the place given back; the paid one is untouched', (await data('signups', K2)).status === 'cancelled' && (await data('capacity', 'ev_bank')).taken === 1 && (await data('signups', KEY)).status === 'confirmed');

  /* ---------- 4. regular giving ---------- */
  const D = await browser('giver', 390);
  await D.goto(URLB + 'give-regularly.html', { waitUntil: 'networkidle2' });
  await until(() => D.$('#go'));
  await D.$eval('#amt', e => { e.value = '20'; }); await D.select('#often', 'monthly'); await D.select('#day', '1');
  await D.$eval('#nm', e => { e.value = 'Gill Giver (invented)'; }); await D.$eval('#em', e => { e.value = 'gill.giver@example.invalid'; });
  await D.$eval('#ga', c => { c.click(); });
  await D.$eval('#house', e => { e.value = '12'; }); await D.$eval('#pc', e => { e.value = 'KT10 8NP'; });
  ok('4. REGULAR GIVING: the HMRC words shown before Gift Aid is added', /I am a UK taxpayer/.test(await text(D, '#gaWords')));
  await D.screenshot({ path: path.join(HERE, 'give-regularly-390.png'), fullPage: true });
  const b2 = CALLS.length;
  await D.$eval('#go', b => b.click());
  await until(() => D.$('#standin'), 20000);
  const mreq = CALLS.slice(b2).find(c => c.url === '/billing_requests');
  ok('   the Direct Debit is set up on GoCardless\'s page (a Bacs mandate request)', mreq && JSON.parse(mreq.body).billing_requests.mandate_request.scheme === 'bacs', mreq && mreq.body);
  const gift = (await db.collection('regularGifts').where('email', '==', 'gill.giver@example.invalid').get()).docs[0];
  ok('   the gift is waiting: £20, monthly, on the 1st, Gift Aid', gift && gift.data().status === 'setting-up' && gift.data().amount === 20 && gift.data().day === 1 && gift.data().giftAid === true, gift && J(gift.data()));
  const decl = (await db.collection('giftAid').where('regularGiftKey', '==', gift.id).get()).docs[0];
  ok('   AND THE GIFT AID DECLARATION IS KEPT, with house, postcode and HMRC\'s words', decl && decl.data().house === '12' && decl.data().postcode === 'KT10 8NP' && /UK taxpayer/.test(decl.data().wording) && decl.data().source === 'regular-giving', decl && J(decl.data()));
  const b3 = CALLS.length;
  await send([{ id: 'EV2', resource_type: 'billing_requests', action: 'fulfilled', links: { billing_request: gift.data().billingRequest, mandate_request_mandate: 'MD1' } }]);
  const live = await until(async () => { const d = await data('regularGifts', gift.id); return d && d.status === 'active' ? d : null; });
  const sub = CALLS.slice(b3).find(c => c.url === '/subscriptions');
  const sb = sub ? JSON.parse(sub.body).subscriptions : {};
  ok('   THE MANDATE IS READY, SO THE GIFT STARTS: £20 a month on the 1st, on that mandate', live && live.subscriptionId === 'SB1' && sb.amount === 2000 && sb.interval_unit === 'monthly' && sb.day_of_month === 1 && sb.links.mandate === 'MD1', sub && sub.body);
  await D.goto(URLB + 'give-regularly.html?key=' + gift.id, { waitUntil: 'networkidle2' });
  await until(() => D.$('#gift'));
  const gmail = await until(async () => (await db.collection('emailOutbox').where('kind', '==', 'regular gift set up').get()).docs.map(d => d.data())[0]);
  ok('   THE CONFIRMATION EMAIL, to the giver only: "£20.00 monthly, on the 1st of the month", Gift Aid, and the link to change it', gmail && J(gmail.to) === J(['gill.giver@example.invalid']) && /Your regular gift is set up/.test(gmail.subject) && /£20\.00 monthly, on the 1st of the month<\/b>, by Direct Debit, with Gift Aid/.test(gmail.html) && gmail.html.includes('give-regularly.html?key=' + gift.id), gmail && (gmail.subject + ' ' + gmail.html).slice(0, 400));
  ok('   the giver\'s own page: £20.00 monthly, on the 1st of the month; Gift Aid; running', /£20\.00 monthly, on the 1st of the month/.test(await text(D, '#gift')) && /Yes, thank you/.test(await text(D, '#gift')) && /Running/.test(await text(D, '#gStatus')));

  /* ---------- 5. each gift collected, once ---------- */
  await send([{ id: 'EV3', resource_type: 'payments', action: 'confirmed', links: { payment: 'PM9', subscription: 'SB1' } }]);
  const don = await until(() => data('donations', 'gc_PM9'));
  ok('5. A GIFT COLLECTED: recorded, £20, with Gift Aid, for the claim', don && don.amount === 20 && don.giftAid === true && don.date === '2026-11-01', J(don));
  await send([{ id: 'EV3b', resource_type: 'payments', action: 'paid_out', links: { payment: 'PM9', subscription: 'SB1' } }]);
  await sleep(800);
  ok('   the same payment again (paid out) is not recorded twice', (await db.collection('donations').get()).size === 1);

  /* ---------- 6. the giver changes and stops ---------- */
  const b4 = CALLS.length;
  await D.$eval('#newAmt', e => { e.value = '25'; }); await D.$eval('#change', b => b.click());
  await until(async () => (await data('regularGifts', gift.id)).amount === 25);
  const put = CALLS.slice(b4).find(c => c.method === 'PUT' && c.url === '/subscriptions/SB1');
  ok('6. CHANGED TO £25: GoCardless told, and the page says so', put && JSON.parse(put.body).subscriptions.amount === 2500 && /Changed: £25\.00/.test(await text(D, '#msg')), 'page: ' + (await text(D, '#gift').catch(e => e.message)) + ' | calls: ' + J(CALLS.slice(b4).map(c => c.method + ' ' + c.url)));

  /* ---------- 7. the treasurer ---------- */
  await T.goto(URLB + 'payments.html', { waitUntil: 'networkidle2' });
  await until(() => T.$('#givingSum'));
  ok('7. THE TREASURER: 1 running, about £25.00 a month; 1 collected, 1 with Gift Aid', /1 running, about £25\.00 a month\. 1 gifts collected, 1 with Gift Aid/.test(await text(T, '#givingSum')), await text(T, '#givingSum'));
  await T.evaluate(() => { const make = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blob = b; return make(b); }; HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; }; });
  await T.$eval('#gaCsv', b => b.click());
  const csv = await until(() => T.evaluate(async () => window.__blob ? { name: window.__dl, text: await window.__blob.text() } : null));
  const rows = csv ? csv.text.replace(/^\ufeff/, '').split('\r\n') : [];
  ok('   the Gift Aid gifts for the claim: name, house, postcode, date, amount', csv && csv.name === 'Gift Aid gifts.csv' && rows[0] === 'First name,Last name,House name or number,Postcode,Date,Amount' && rows[1] === 'Gill Giver,(invented),12,KT10 8NP,2026-11-01,20.00', J(rows));

  /* ---------- 7b. how often, changed later (Martin, 15 Oct) ---------- */
  await D.goto(URLB + 'give-regularly.html?key=' + gift.id, { waitUntil: 'networkidle2' });
  await until(() => D.$('#newOften'));
  ok('7b. THE GIVER\'S PAGE OFFERS "How often?": Monthly (chosen), with the day; or Every 4 weeks', (await D.$eval('#newOften', s => s.value)) === 'monthly' && (await D.$eval('#newDay', s => s.value)) === '1' && /Every 4 weeks/.test(await text(D, '#newOften')));
  const b6 = CALLS.length;
  await D.select('#newOften', 'four_weekly');
  ok('    the day goes away for every 4 weeks', await D.$eval('#newDayBox', e => e.style.display === 'none'));
  await D.$eval('#change', b => b.click());
  const ch = await until(async () => { const d = await data('regularGifts', gift.id); return d.interval === 'four_weekly' ? d : null; });
  const newSub = CALLS.slice(b6).find(c => c.url === '/subscriptions' && c.method === 'POST');
  const ns = newSub ? JSON.parse(newSub.body).subscriptions : {};
  ok('    CHANGED TO EVERY 4 WEEKS: a new collection on the same bank authority (weekly x4, £25, no day), and the old one cancelled', ch && ch.subscriptionId === 'SB2' && ns.interval_unit === 'weekly' && ns.interval === 4 && ns.day_of_month === undefined && ns.amount === 2500 && ns.links.mandate === 'MD1' && CALLS.slice(b6).some(c => c.url === '/subscriptions/SB1/actions/cancel'), J({ ch, ns }));
  await until(async () => /every 4 weeks/.test(await text(D, '#msg')));
  ok('    the page says so: "£25.00 every 4 weeks"', /£25\.00 every 4 weeks/.test(await text(D, '#gift')) && /Changed: £25\.00 every 4 weeks/.test(await text(D, '#msg')), await text(D, '#gift'));
  const cmail = await until(async () => (await db.collection('emailOutbox').where('kind', '==', 'regular gift changed').get()).docs.map(d => d.data()).find(m => /every 4 weeks/.test(m.html)));
  ok('    and an email: "Your regular gift has changed", £25.00 every 4 weeks', cmail && J(cmail.to) === J(['gill.giver@example.invalid']) && /has changed/.test(cmail.subject) && /£25\.00 every 4 weeks<\/b>/.test(cmail.html), cmail && cmail.html.slice(0, 300));
  await D.screenshot({ path: path.join(HERE, 'give-regularly-change-390.png'), fullPage: true });

  /* A second giver chooses Every 4 weeks from the start. */
  const D2 = await browser('giver2', 390);
  await D2.goto(URLB + 'give-regularly.html', { waitUntil: 'networkidle2' });
  await until(() => D2.$('#go'));
  ok('    THE FORM ASKS "How often?": Monthly or Every 4 weeks', /How often\?/.test(await text(D2)) && J(await D2.$$eval('#often option', os => os.map(o => o.textContent))) === J(['Monthly', 'Every 4 weeks']));
  await D2.$eval('#amt', e => { e.value = '10'; }); await D2.select('#often', 'four_weekly');
  await D2.$eval('#nm', e => { e.value = 'Fran Fourweekly (invented)'; }); await D2.$eval('#em', e => { e.value = 'fran.four@example.invalid'; });
  await D2.$eval('#go', b => b.click());
  await until(() => D2.$('#standin'), 20000);
  const g2 = (await db.collection('regularGifts').where('email', '==', 'fran.four@example.invalid').get()).docs[0];
  const b7 = CALLS.length;
  await send([{ id: 'EV9', resource_type: 'billing_requests', action: 'fulfilled', links: { billing_request: g2.data().billingRequest, mandate_request_mandate: 'MD2' } }]);
  await until(async () => (await data('regularGifts', g2.id)).status === 'active');
  const s2 = CALLS.slice(b7).find(c => c.url === '/subscriptions' && c.method === 'POST');
  const s2b = s2 ? JSON.parse(s2.body).subscriptions : {};
  const fmail = await until(async () => (await db.collection('emailOutbox').where('to', 'array-contains', 'fran.four@example.invalid').get()).docs.map(d => d.data())[0]);
  ok('    EVERY 4 WEEKS FROM THE START: GoCardless weekly x4, no day; the email says "£10.00 every 4 weeks"', s2b.interval_unit === 'weekly' && s2b.interval === 4 && s2b.day_of_month === undefined && s2b.amount === 1000 && fmail && /£10\.00 every 4 weeks<\/b>, by Direct Debit\./.test(fmail.html), J({ s2b, html: fmail && fmail.html.slice(0, 200) }));
  await D2.goto(URLB + 'give-regularly.html?key=' + g2.id, { waitUntil: 'networkidle2' });
  await until(() => D2.$('#gift'));
  ok('    and her page: "£10.00 every 4 weeks"', /£10\.00 every 4 weeks/.test(await text(D2, '#gift')));

  /* ---------- 8. no fee; nobody else; stop; remove ---------- */
  ok('8. NO FEE: no request to GoCardless carried an app fee', CALLS.length > 0 && !CALLS.some(c => /app_fee/.test(c.body + c.url)), J(CALLS.map(c => c.url)));
  const A = await browser('ann');
  const annRead = await A.evaluate(() => Promise.all([
    EGBCAuth.db.collection('regularGifts').get().then(() => 'read', e => e.code),
    EGBCAuth.db.collection('donations').get().then(() => 'read', e => e.code)]));
  ok('   NOBODY ELSE READS THE GIFTS', J(annRead) === '["permission-denied","permission-denied"]', J(annRead));
  await D.goto(URLB + 'give-regularly.html?key=' + gift.id, { waitUntil: 'networkidle2' });
  await until(() => D.$('#stop'));
  const b5 = CALLS.length;
  await D.$eval('#stop', b => b.click());
  await until(async () => (await data('regularGifts', gift.id)).status === 'stopped');
  ok('   THE GIVER STOPS IT: GoCardless told to cancel it, and it says Stopped', CALLS.slice(b5).some(c => c.url === '/subscriptions/SB2/actions/cancel') && !!(await until(async () => /Stopped/.test(await text(D, '#gStatus')))));
  await T.goto(URLB + 'payments.html', { waitUntil: 'networkidle2' });
  await until(() => T.$('#removeGc'));
  await T.$eval('#removeGc', b => b.click());
  await until(async () => /Not connected/.test(await text(T, '#gcStatus')));
  ok('   REMOVED: the token is gone from the server, and nothing is offered', !(await data('paymentSecrets', 'gocardless')) && (await data('paymentSettings', 'public')).bank === false);
  await D.goto(URLB + 'give-regularly.html', { waitUntil: 'networkidle2' });
  await sleep(1500);
  ok('   the giving page says so', /does not take Direct Debits online yet/.test(await text(D)));

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
