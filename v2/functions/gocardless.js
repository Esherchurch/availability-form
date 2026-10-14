/* ===================================================================
   EGBC — bank payments through the church's OWN GoCardless account (F-181)
   ===================================================================

   The same rule as payments.js (Stripe): each church pastes its own
   GoCardless access token and its own webhook secret; they stay on the
   server (paymentSecrets/gocardless, denied to every page); money goes
   straight to the church; no fee is ever added (no app_fee anywhere - the
   tests read every request the stand-in GoCardless receives).

     Instant Bank Pay, for tickets      ticketPay({ method: 'bank' }) in payments.js
                                         calls bankPage() here
     Direct Debit, for regular giving   giveRegularly / givingChange / givingStop
     Their messages                     gocardlessWebhook, signature checked
     Unpaid bank bookings               paymentsTidy, every 10 minutes

   Calls go to GoCardless at one address: api.gocardless.com, or
   api-sandbox.gocardless.com for a sandbox token (they start "sandbox_").
   On the emulator only, a test may point it at a stand-in
   (paymentSecrets/config.gocardlessApi).
   =================================================================== */

import crypto from 'node:crypto';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { hubUrl } from './notify.js';

const db = () => getFirestore();
const REGION = 'europe-west2';
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
export const HOLD_MS = 31 * 60 * 1000;

export function gcMode(token) {
  if (/^sandbox_[A-Za-z0-9_-]{10,}$/.test(token)) return 'test';
  if (/^live_[A-Za-z0-9_-]{10,}$/.test(token)) return 'live';
  return '';
}
async function gcBase(token) {
  if (EMULATOR) {
    const c = await db().collection('paymentSecrets').doc('config').get();
    if (c.exists && c.data().gocardlessApi) return c.data().gocardlessApi;
  }
  return gcMode(token) === 'test' ? 'https://api-sandbox.gocardless.com' : 'https://api.gocardless.com';
}
export async function gc(token, method, path, body, idem) {
  const h = { Authorization: 'Bearer ' + token, 'GoCardless-Version': '2015-07-06', 'Content-Type': 'application/json', Accept: 'application/json' };
  if (idem) h['Idempotency-Key'] = idem;
  const r = await fetch((await gcBase(token)) + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok) { const e = new Error((j && j.error && j.error.message) || ('GoCardless said ' + r.status)); e.status = r.status; throw e; }
  return j;
}
/* GoCardless's signature: the HMAC-SHA256 (hex) of the raw body with the
   endpoint's secret, in the Webhook-Signature header. */
export function verifyGc(raw, sig, secret) {
  if (!raw || !sig || !secret) return false;
  const want = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
async function secrets() {
  const s = await db().collection('paymentSecrets').doc('gocardless').get();
  return s.exists ? s.data() : {};
}

/* ---------------------------------------------- keys (from paymentsSave) */

export async function gcSaveToken(value, who) {
  const mode = gcMode(value);
  if (!mode) throw new HttpsError('invalid-argument', 'That is not a GoCardless access token. It starts live_ (or sandbox_ while you try it out).');
  let cred;
  try { cred = await gc(value, 'GET', '/creditors'); }
  catch (e) { throw new HttpsError('failed-precondition', e.status === 401 ? 'GoCardless did not accept that token. Check it was copied whole.' : 'GoCardless could not check that token: ' + e.message); }
  const c = (cred && cred.creditors && cred.creditors[0]) || {};
  await db().collection('paymentSecrets').doc('gocardless').set({ token: value, creditorId: c.id || '', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db().collection('paymentSettings').doc('gocardless').set({ connected: true, accountName: String(c.name || 'Your GoCardless account').slice(0, 120), accountLast4: String(c.id || '').slice(-4), mode, ...who, addedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { accountName: c.name || '', accountLast4: String(c.id || '').slice(-4), mode };
}
export async function gcSaveWebhook(value, who) {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(value)) throw new HttpsError('invalid-argument', 'That does not look like a GoCardless webhook secret. Copy it from the webhook endpoint you made.');
  await db().collection('paymentSecrets').doc('gocardless').set({ webhookSecret: value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db().collection('paymentSettings').doc('gocardless').set({ webhookSet: true, webhookBy: who.addedByName, webhookAt: FieldValue.serverTimestamp() }, { merge: true });
}
export async function gcRemove(who) {
  await db().collection('paymentSecrets').doc('gocardless').delete();
  await db().collection('paymentSettings').doc('gocardless').set({ connected: false, webhookSet: false, accountName: '', accountLast4: '', mode: '', removedByName: who.addedByName, removedAt: FieldValue.serverTimestamp() });
}
export async function gcReady() {
  const s = await secrets(), shown = await db().collection('paymentSettings').doc('gocardless').get();
  return !!(s.token && s.webhookSecret && shown.exists && shown.data().connected);
}

/* ------------------------------------------- Instant Bank Pay, tickets */

/* A bank payment page for a booking whose price payments.js has already
   worked out. Returns the page's address. */
export async function bankPage(p, key) {
  const s = await secrets();
  const hub = await hubUrl(db()), back = hub + 'my-signup.html?key=' + encodeURIComponent(key);
  const br = await gc(s.token, 'POST', '/billing_requests', { billing_requests: {
    payment_request: { description: (p.title + (p.keys.length > 1 ? ' (' + p.keys.length + ' dates)' : '')).slice(0, 100), amount: p.pence, currency: 'GBP' },
    metadata: { signupKey: key, keys: p.keys.map((x) => x.key).join(',').slice(0, 500) }
  } }, 'tk_' + key + '_' + Date.now());
  const id = br.billing_requests.id;
  const flow = await gc(s.token, 'POST', '/billing_request_flows', { billing_request_flows: {
    redirect_uri: back + '&paid=bank', exit_uri: back, prefilled_customer: p.email ? { email: p.email } : undefined, links: { billing_request: id }
  } });
  return { url: flow.billing_request_flows.authorisation_url, ref: id };
}

/* ------------------------------------------ Direct Debit, regular giving */

const KEYCHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function newKey() { const b = crypto.randomBytes(28); let s = 'rg_'; for (let i = 0; i < 28; i++) s += KEYCHARS[b[i] % KEYCHARS.length]; return s; }
const INTERVALS = { monthly: { interval_unit: 'monthly', interval: 1 }, four_weekly: { interval_unit: 'weekly', interval: 4 } };

export const giveRegularly = onCall({ region: REGION }, async (req) => {
  const d = req.data || {};
  if (!(await gcReady())) throw new HttpsError('failed-precondition', 'This church does not take Direct Debits online yet.');
  const pub = await db().collection('paymentSettings').doc('public').get();
  if (pub.exists && pub.data().giving === false) throw new HttpsError('failed-precondition', 'Regular giving online is switched off.');
  const amount = Math.round(Number(d.amount) * 100);
  if (!(amount >= 100 && amount <= 1000000)) throw new HttpsError('invalid-argument', 'Give at least £1.');
  const interval = INTERVALS[d.interval] ? d.interval : '';
  if (!interval) throw new HttpsError('invalid-argument', 'Choose how often.');
  const day = parseInt(d.day, 10);
  if (interval === 'monthly' && !(day >= 1 && day <= 28)) throw new HttpsError('invalid-argument', 'Choose a day of the month, 1 to 28.');
  const name = String(d.name || '').trim().slice(0, 120), email = String(d.email || '').trim().toLowerCase().slice(0, 200);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpsError('invalid-argument', 'Give your name and email, so the church can thank you and you can change it later.');
  const giftAid = d.giftAid === true;
  if (giftAid && !(String(d.house || '').trim() && /^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$/i.test(String(d.postcode || '').trim()))) throw new HttpsError('invalid-argument', 'For Gift Aid, give your house name or number and your postcode.');
  const key = newKey(), uid = (req.auth && req.auth.uid) || '';
  let memberId = '';
  if (uid) { const u = await db().collection('users').doc(uid).get(); memberId = u.exists ? (u.data().memberId || '') : ''; }
  const s = await secrets(), hub = await hubUrl(db()), back = hub + 'give-regularly.html?key=' + key;
  const br = await gc(s.token, 'POST', '/billing_requests', { billing_requests: { mandate_request: { scheme: 'bacs' }, metadata: { regularGift: key } } }, 'rg_' + key);
  const flow = await gc(s.token, 'POST', '/billing_request_flows', { billing_request_flows: { redirect_uri: back + '&set=1', exit_uri: back, prefilled_customer: { email }, links: { billing_request: br.billing_requests.id } } });
  await db().collection('regularGifts').doc(key).set({
    name, email, memberId, uid, amount: amount / 100, interval, day: interval === 'monthly' ? day : null, giftAid,
    status: 'setting-up', billingRequest: br.billing_requests.id, mandateId: '', subscriptionId: '', createdAt: FieldValue.serverTimestamp()
  });
  if (giftAid) {
    const parts = name.split(/\s+/);
    await db().collection('giftAid').add({ memberId, firstName: parts.slice(0, -1).join(' ') || parts[0], lastName: parts.length > 1 ? parts[parts.length - 1] : '', title: '',
      house: String(d.house).trim().slice(0, 60), address: String(d.address || '').trim().slice(0, 200), postcode: String(d.postcode).trim().toUpperCase().slice(0, 10),
      source: 'regular-giving', regularGiftKey: key, email, taxpayer: true, wording: String(d.wording || '').slice(0, 1000), declaredOn: new Date().toISOString().slice(0, 10),
      declaredAt: FieldValue.serverTimestamp(), paperHeld: false, cancelled: false, cancelledOn: '', recordedBy: uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
  }
  return { url: flow.billing_request_flows.authorisation_url, key };
});

async function giftByKey(key) {
  if (!/^rg_[A-Za-z0-9]{28}$/.test(String(key || ''))) throw new HttpsError('not-found', 'That regular gift could not be found.');
  const ref = db().collection('regularGifts').doc(key), s = await ref.get();
  if (!s.exists) throw new HttpsError('not-found', 'That regular gift could not be found.');
  return { ref, d: s.data() };
}
export const givingChange = onCall({ region: REGION }, async (req) => {
  const { ref, d } = await giftByKey(req.data && req.data.key);
  const amount = Math.round(Number(req.data && req.data.amount) * 100);
  if (!(amount >= 100 && amount <= 1000000)) throw new HttpsError('invalid-argument', 'Give at least £1.');
  if (d.status !== 'active' || !d.subscriptionId) throw new HttpsError('failed-precondition', 'This gift is not running, so it cannot be changed.');
  await gc((await secrets()).token, 'PUT', '/subscriptions/' + d.subscriptionId, { subscriptions: { amount } });
  await ref.update({ amount: amount / 100, changedAt: FieldValue.serverTimestamp() });
  return { ok: true, amount: amount / 100 };
});
export const givingStop = onCall({ region: REGION }, async (req) => {
  const { ref, d } = await giftByKey(req.data && req.data.key);
  if (d.subscriptionId && d.status === 'active') await gc((await secrets()).token, 'POST', '/subscriptions/' + d.subscriptionId + '/actions/cancel', { data: {} });
  await ref.update({ status: 'stopped', stoppedAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

/* --------------------------------------------------------- the webhook */

async function release(key) {
  const ref = db().collection('signups').doc(key);
  await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.data().status !== 'confirmed') return;
    const pay = await tx.get(db().collection('signupPayments').doc(key));
    if (pay.exists && pay.data().paid) return;
    const capRef = db().collection('capacity').doc(s.data().calEventId), cap = await tx.get(capRef);
    tx.update(ref, { status: 'cancelled', cancelledAt: new Date().toISOString() });
    if (cap.exists) tx.update(capRef, { taken: Math.max(0, (cap.data().taken || 0) - (s.data().places || 1)), lastCancelled: key });
    tx.set(db().collection('signupPayments').doc(key), { status: 'expired', paid: false }, { merge: true });
  });
}
export { release as releaseBooking };

async function ticketsFor(field, value) { return (await db().collection('signupPayments').where(field, '==', value).get()).docs; }

export async function handleGc(ev) {
  const L = ev.links || {};
  if (ev.resource_type === 'billing_requests' && ev.action === 'fulfilled') {
    const tickets = await ticketsFor('checkoutId', L.billing_request);
    for (const d of tickets) await d.ref.set({ paid: true, status: 'paid', method: 'bank-online', paymentRef: L.payment_request_payment || '', paidAt: FieldValue.serverTimestamp() }, { merge: true });
    if (tickets.length) return 'paid ' + tickets.length;
    /* A Direct Debit set up: the mandate is ready, so start the gift. */
    const g = (await db().collection('regularGifts').where('billingRequest', '==', L.billing_request).get()).docs[0];
    if (g && L.mandate_request_mandate && g.data().status === 'setting-up') {
      const x = g.data(), iv = INTERVALS[x.interval];
      const sub = await gc((await secrets()).token, 'POST', '/subscriptions', { subscriptions: {
        amount: Math.round(x.amount * 100), currency: 'GBP', interval_unit: iv.interval_unit, interval: iv.interval,
        day_of_month: x.interval === 'monthly' ? x.day : undefined, name: 'Regular gift', metadata: { regularGift: g.id }, links: { mandate: L.mandate_request_mandate }
      } }, 'sub_' + g.id);
      await g.ref.update({ status: 'active', mandateId: L.mandate_request_mandate, subscriptionId: sub.subscriptions.id, startedAt: FieldValue.serverTimestamp() });
      return 'gift started';
    }
    return 'nothing waiting';
  }
  if (ev.resource_type === 'payments' && (ev.action === 'confirmed' || ev.action === 'paid_out') && L.subscription) {
    const g = (await db().collection('regularGifts').where('subscriptionId', '==', L.subscription).get()).docs[0];
    if (!g) return 'not ours';
    const ref = db().collection('donations').doc('gc_' + L.payment);
    if ((await ref.get()).exists) return 'already';
    const x = g.data(), pay = await gc((await secrets()).token, 'GET', '/payments/' + L.payment);
    const p = pay.payments || {};
    await ref.set({ source: 'regular-giving', regularGiftKey: g.id, name: x.name, memberId: x.memberId || '', amount: (Number(p.amount) || Math.round(x.amount * 100)) / 100,
      date: p.charge_date || new Date().toISOString().slice(0, 10), giftAid: !!x.giftAid, paymentRef: L.payment, at: FieldValue.serverTimestamp() });
    return 'gift recorded';
  }
  if (ev.resource_type === 'payments' && ev.action === 'failed') {
    for (const d of await ticketsFor('paymentRef', L.payment)) { await d.ref.set({ paid: false, status: 'failed' }, { merge: true }); await release(d.id); }
    if (L.subscription) { const g = (await db().collection('regularGifts').where('subscriptionId', '==', L.subscription).get()).docs[0]; if (g) await g.ref.update({ lastFailedAt: FieldValue.serverTimestamp() }); }
    return 'failed';
  }
  if (ev.resource_type === 'refunds' && (ev.action === 'created' || ev.action === 'paid')) {
    const docs = await ticketsFor('paymentRef', L.payment);
    for (const d of docs) await d.ref.set({ status: 'refunded', refunded: Number(d.data().amount) || 0 }, { merge: true });
    const don = db().collection('donations').doc('gc_' + L.payment);
    if ((await don.get()).exists) await don.update({ refunded: true });
    return 'refunded ' + docs.length;
  }
  if ((ev.resource_type === 'subscriptions' && (ev.action === 'cancelled' || ev.action === 'finished')) || (ev.resource_type === 'mandates' && (ev.action === 'cancelled' || ev.action === 'failed' || ev.action === 'expired'))) {
    const field = ev.resource_type === 'subscriptions' ? 'subscriptionId' : 'mandateId', id = L.subscription || L.mandate;
    for (const g of (await db().collection('regularGifts').where(field, '==', id).get()).docs) if (g.data().status !== 'stopped') await g.ref.update({ status: 'ended', endedAt: FieldValue.serverTimestamp(), endedWhy: ev.resource_type + ' ' + ev.action });
    return 'ended';
  }
  return 'not needed';
}

export const gocardlessWebhook = onRequest({ region: REGION }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('POST only'); return; }
  const s = await secrets();
  const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
  if (!verifyGc(raw, req.get('webhook-signature'), s.webhookSecret)) { res.status(498).send('signature'); return; }
  let body; try { body = JSON.parse(raw); } catch (e) { res.status(400).send('body'); return; }
  const out = [];
  try {
    for (const ev of (body.events || [])) {
      const done = db().collection('paymentEvents').doc('gc_' + String(ev.id).replace(/[^A-Za-z0-9_-]/g, ''));
      if ((await done.get()).exists) { out.push('already'); continue; }
      const what = await handleGc(ev);
      await done.set({ type: ev.resource_type + '.' + ev.action, what, at: FieldValue.serverTimestamp() });
      out.push(what);
    }
    res.status(200).send(out.join('; '));
  } catch (e) { console.error('gocardlessWebhook', e); res.status(500).send('error'); }
});

/* Bank payments not made in 30 minutes: give the places back (Stripe's
   pages expire by themselves and tell us; GoCardless's do not). */
export async function tidyBank(now) {
  const due = (await db().collection('signupPayments').where('status', '==', 'awaiting').get()).docs
    .filter((d) => d.data().method === 'bank-online' && (d.data().holdUntil || 0) < (now || Date.now()));
  for (const d of due) await release(d.id);
  return due.length;
}
export const paymentsTidy = onSchedule({ region: REGION, schedule: 'every 10 minutes', timeZone: 'Europe/London', retryCount: 1 }, async () => { await tidyBank(); });
