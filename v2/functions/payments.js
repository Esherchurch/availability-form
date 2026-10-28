/* ===================================================================
   EGBC — taking money through each church's OWN accounts (F-181)
   ===================================================================

   MARTIN, 14 OCT 2026: "We are not taking the payments. We won't use our
   account." Church HQ never receives, holds or passes on money, takes no
   fee, and depends on no approval from Stripe. Each church pastes its own
   Stripe secret key (a restricted key) and its own webhook signing secret
   into the Payments page; money goes straight to the church.

   THE KEYS NEVER LEAVE THE SERVER. paymentSecrets/{provider} is denied to
   every page by the rules; only these functions (the Admin SDK) read it.
   What a page may see is paymentSettings/{provider}: the account's name,
   the last 4 of its id, live or test, who added it and when.

   NO FEE, EVER: no request here carries an application fee. The tests
   read every request the stand-in Stripe receives and check.

   The events window's file (EVENTS-WINDOW-BRIEF). Exported from index.js
   the way public-mail.js is.

     paymentsSave      callable: check a key or webhook secret with Stripe, keep it
     paymentsRemove    callable: forget them
     paymentsTeam      callable: which team is the church's money team
     ticketPay         callable, signed in or not: a payment page for a sign-up
     stripeWebhook     HTTPS: Stripe tells us what happened, signature checked

   Calls go to Stripe at one address. On the emulator only, a test may
   point it at a stand-in (paymentSecrets/config.stripeApi); the live
   functions always use https://api.stripe.com.
   =================================================================== */

import crypto from 'node:crypto';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { hubUrl } from './notify.js';
import { readTeamJobs, teamsFor } from './team-jobs.js';
import { gcSaveToken, gcSaveWebhook, gcRemove, gcReady, bankPage, checkBank, tidyBank, pollGifts } from './gocardless.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { churchDb, withChurchDb, forCaller, forAddress } from './church-context.js';
import { eachChurch, scopedDb } from './church-scope.js';
import { indexCode, churchForCode, codeHash } from './hq-codes.js';

/* The church being worked for: each callable, webhook and tidy run says
   which (church-context.js), and every helper here follows it. */
const db = () => churchDb();
const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
import { paymentsShut } from './payments-gate.js';
const SHUT_MSG = 'Online payments open when the hub goes live.';

/* The gate, plus a switch for the tests: on the emulator only,
   paymentSecrets/config.shutForTest makes the callables refuse as the live
   site does now, so the pages' "goes live" words can be tested. The live
   site never reads it (paymentsShut decides there). */
async function shut() {
  if (paymentsShut()) return true;
  if (!EMULATOR) return false;
  const c = await db().collection('paymentSecrets').doc('config').get();
  return !!(c.exists && c.data().shutForTest === true);
}
/* The hub's region. Set on each function here: index.js sets it globally,
   but after this file has already been read. */
const REGION = 'europe-west2';
const HOLD_MS = 31 * 60 * 1000;     /* Stripe's shortest Checkout expiry is 30 minutes */

/* ---------------------------------------------------------------- who */

async function userOf(uid) {
  if (!uid) return null;
  const u = await db().collection('users').doc(uid).get();
  return u.exists && u.data().status === 'active' ? u.data() : null;
}
async function moneyTeam() {
  const t = await db().collection('paymentSettings').doc('team').get();
  return (t.exists && String(t.data().team || '').trim()) || 'Finance';
}
/* A master admin, or anyone on the church's money team ("Finance" unless
   the master admin names another). */
export async function isTreasurer(uid) {
  const u = await userOf(uid);
  if (!u) return false;
  if (u.masterAdmin === true) return true;
  /* the finance job (H-9): team jobs, then the money team, then Finance - as the rules' financeTeams() */
  const { map } = await readTeamJobs(db());
  const teams = teamsFor(map, 'finance', { moneyTeam: await moneyTeam() });
  return (u.teams || []).concat(u.covers || []).some((t) => teams.includes(t)) || (u.adminFor || []).some((t) => teams.includes(t));
}

/* ------------------------------------------------------------ Stripe */

async function stripeBase() {
  if (EMULATOR) {
    const c = await db().collection('paymentSecrets').doc('config').get();
    if (c.exists && c.data().stripeApi) return c.data().stripeApi;
  }
  return 'https://api.stripe.com';
}
/* Stripe takes form-encoded bodies with nested keys: a[b][0][c]=d. */
export function formEncode(obj, prefix, out) {
  out = out || [];
  Object.keys(obj).forEach((k) => {
    const v = obj[k], key = prefix ? prefix + '[' + k + ']' : k;
    if (v === undefined || v === null) return;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(v)));
  });
  return out.join('&');
}
async function stripe(key, method, path, body) {
  const r = await fetch((await stripeBase()) + path, {
    method,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
    body: body ? formEncode(body) : undefined
  });
  let j = null; try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok) { const e = new Error((j && j.error && j.error.message) || ('Stripe said ' + r.status)); e.status = r.status; throw e; }
  return j;
}
export function stripeMode(key) {
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (/^(sk|rk)_test_/.test(key)) return 'test';
  return '';
}

/* Stripe's own signature scheme: header "t=<seconds>,v1=<hex>[,v1=…]",
   the HMAC-SHA256 of "<t>.<raw body>" with the endpoint's whsec_ secret.
   At most 5 minutes old, so an old message cannot be replayed. */
export function verifyStripe(raw, header, secret, nowSec, toleranceSec) {
  if (!raw || !header || !secret) return false;
  const parts = {}; const v1 = [];
  String(header).split(',').forEach((p) => { const i = p.indexOf('='); if (i < 0) return; const k = p.slice(0, i).trim(), v = p.slice(i + 1).trim(); if (k === 'v1') v1.push(v); else parts[k] = v; });
  const t = parseInt(parts.t, 10);
  if (!t || !v1.length) return false;
  if (Math.abs((nowSec || Math.floor(Date.now() / 1000)) - t) > (toleranceSec || 300)) return false;
  const want = crypto.createHmac('sha256', secret).update(t + '.' + raw).digest('hex');
  return v1.some((s) => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)));
}

/* --------------------------------------------------------- the price */

/* What a booking costs, worked out here from the event's own ticket types,
   never taken from the page. A whole series (F-184): every date with a
   place. Returns { pence, keys, title, method-allowed }. */
async function priceOf(key, method) {
  const s = await db().collection('signups').doc(key).get();
  if (!s.exists) throw new HttpsError('not-found', 'That booking could not be found.');
  const group = await db().collection('seriesSignups').doc(key).get();
  const keys = group.exists && Array.isArray(group.data().keys) ? group.data().keys : [key];
  let pence = 0, title = '', allowed = true, live = [];
  for (const k of keys) {
    const su = await db().collection('signups').doc(k).get();
    if (!su.exists) continue;
    const d = su.data();
    if (d.status !== 'confirmed') continue;
    const ev = await db().collection('calEvents').doc(d.calEventId).get();
    if (!title && ev.exists) title = ev.data().title || 'Event';
    const tts = (await db().collection('calEvents').doc(d.calEventId).collection('ticketTypes').get()).docs.map((x) => ({ id: x.id, ...x.data() }));
    const t = tts.find((x) => x.id === d.ticketTypeId) || tts[0];
    if (!t || !(t.payBy || ['day']).includes(method)) allowed = false;
    const price = t ? Number(t.price) || 0 : 0;
    pence += Math.round(price * 100) * Math.max(1, parseInt(d.places || 1, 10));
    live.push({ key: k, calEventId: d.calEventId, pence: Math.round(price * 100) * Math.max(1, parseInt(d.places || 1, 10)), email: d.email || '' });
  }
  return { pence, keys: live, title: title || 'Event', allowed, email: (s.data().email || '') };
}

/* ------------------------------------------------------- the callables */

export const paymentsSave = onCall({ region: REGION }, forCaller(async (req) => {
  if (await shut()) throw new HttpsError('failed-precondition', SHUT_MSG, { shut: true });
  const uid = req.auth && req.auth.uid;
  if (!(await isTreasurer(uid))) throw new HttpsError('permission-denied', 'Only a master admin or the church\'s money team can set up payments.');
  const provider = String(req.data && req.data.provider || ''), kind = String(req.data && req.data.kind || ''), value = String(req.data && req.data.value || '').trim();
  if (provider !== 'stripe' && provider !== 'gocardless') throw new HttpsError('invalid-argument', 'Not a payment provider the hub knows.');
  const u = await userOf(uid), who = { addedBy: uid, addedByName: String(u.name || '').slice(0, 120) };
  if (provider === 'gocardless') {
    if (kind === 'key') { const r = await gcSaveToken(value, who); await publish(); return { ok: true, ...r }; }
    if (kind === 'webhook') { await gcSaveWebhook(value, who); await publish(); return { ok: true }; }
    throw new HttpsError('invalid-argument', 'Save a token or a webhook secret.');
  }
  const secrets = db().collection('paymentSecrets').doc('stripe'), shown = db().collection('paymentSettings').doc('stripe');
  if (kind === 'key') {
    const mode = stripeMode(value);
    if (!mode) throw new HttpsError('invalid-argument', 'That is not a Stripe secret key. It starts rk_live_ or rk_test_ (a restricted key), or sk_live_ / sk_test_.');
    let acct;
    try { acct = await stripe(value, 'GET', '/v1/account'); }
    catch (e) { throw new HttpsError('failed-precondition', e.status === 401 ? 'Stripe did not accept that key. Check it was copied whole.' : 'Stripe could not check that key: ' + e.message); }
    const name = (acct.settings && acct.settings.dashboard && acct.settings.dashboard.display_name) || (acct.business_profile && acct.business_profile.name) || acct.email || 'Your Stripe account';
    await secrets.set({ secretKey: value, accountId: acct.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await shown.set({ connected: true, accountName: String(name).slice(0, 120), accountLast4: String(acct.id || '').slice(-4), mode, ...who, addedAt: FieldValue.serverTimestamp() }, { merge: true });
    await publish();
    return { ok: true, accountName: name, accountLast4: String(acct.id || '').slice(-4), mode };
  }
  if (kind === 'webhook') {
    if (!/^whsec_[A-Za-z0-9]{10,}$/.test(value)) throw new HttpsError('invalid-argument', 'That is not a webhook signing secret. It starts whsec_.');
    await secrets.set({ webhookSecret: value, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await shown.set({ webhookSet: true, webhookBy: who.addedByName, webhookAt: FieldValue.serverTimestamp() }, { merge: true });
    await publish();
    return { ok: true };
  }
  throw new HttpsError('invalid-argument', 'Save a key or a webhook secret.');
}));

export const paymentsRemove = onCall({ region: REGION }, forCaller(async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!(await isTreasurer(uid))) throw new HttpsError('permission-denied', 'Only a master admin or the church\'s money team can change payments.');
  const prov = String(req.data && req.data.provider);
  if (prov !== 'stripe' && prov !== 'gocardless') throw new HttpsError('invalid-argument', 'Not a payment provider the hub knows.');
  const u = await userOf(uid);
  if (prov === 'gocardless') { await gcRemove({ addedByName: String(u.name || '').slice(0, 120) }); await publish(); return { ok: true }; }
  await db().collection('paymentSecrets').doc('stripe').delete();
  await db().collection('paymentSettings').doc('stripe').set({ connected: false, webhookSet: false, accountName: '', accountLast4: '', mode: '', removedByName: String(u.name || '').slice(0, 120), removedAt: FieldValue.serverTimestamp() });
  await publish();
  return { ok: true };
}));

export const paymentsTeam = onCall({ region: REGION }, forCaller(async (req) => {
  const u = await userOf(req.auth && req.auth.uid);
  if (!u || u.masterAdmin !== true) throw new HttpsError('permission-denied', 'Only a master admin names the money team.');
  const team = String(req.data && req.data.team || '').trim().slice(0, 60);
  if (!team) throw new HttpsError('invalid-argument', 'Name a team.');
  await db().collection('paymentSettings').doc('team').set({ team, updatedAt: FieldValue.serverTimestamp() });
  /* The name only (not who is on it), where the Menu can read it: so a
     renamed money team still sees Payments in the Menu (da5cc4af). */
  await db().collection('paymentSettings').doc('public').set({ moneyTeam: team }, { merge: true });
  return { ok: true, team };
}));

/* What every page may know: whether card payments can be taken at all. */
async function publish() {
  const s = await db().collection('paymentSettings').doc('stripe').get();
  const d = s.exists ? s.data() : {};
  const g = await db().collection('paymentSettings').doc('gocardless').get(), gd = g.exists ? g.data() : {};
  /* The webhook is OPTIONAL (F-209): connected is enough. */
  await db().collection('paymentSettings').doc('public').set({ card: !!d.connected, cardMode: d.connected ? d.mode || '' : '',
    bank: await gcReady(), bankMode: gd.connected ? gd.mode || '' : '' }, { merge: true });
}

/* A payment page for a booking. Anyone holding the booking's key (the
   person who just signed up, signed in or not). */
export const ticketPay = onCall({ region: REGION }, forAddress(async (req) => {
  if (await shut()) throw new HttpsError('failed-precondition', SHUT_MSG, { shut: true });
  const key = String(req.data && req.data.key || ''), method = String(req.data && req.data.method || '');
  if (!/^[A-Za-z0-9_]{20,64}$/.test(key)) throw new HttpsError('invalid-argument', 'That booking could not be found.');
  if (method !== 'card' && method !== 'bank') throw new HttpsError('invalid-argument', 'Not a way of paying the hub knows.');
  const sec = await db().collection('paymentSecrets').doc('stripe').get();
  const pub = await db().collection('paymentSettings').doc('public').get();
  if (method === 'bank') {
    /* Instant Bank Pay, through the church's own GoCardless (gocardless.js). */
    if (!(pub.exists && pub.data().bank) || !(await gcReady())) throw new HttpsError('failed-precondition', 'This church does not take bank payments online.');
    const pb = await priceOf(key, 'bank');
    if (!pb.keys.length || pb.pence < 100) throw new HttpsError('failed-precondition', 'There is nothing to pay for this booking.');
    if (!pb.allowed) throw new HttpsError('failed-precondition', 'This ticket is not paid by bank.');
    const paidB = await db().collection('signupPayments').doc(pb.keys[0].key).get();
    if (paidB.exists && paidB.data().paid) throw new HttpsError('already-exists', 'This booking is already paid.');
    const page = await bankPage(pb, key);
    const bb = db().batch();
    pb.keys.forEach((x) => bb.set(db().collection('signupPayments').doc(x.key), {
      calEventId: x.calEventId, paid: false, amount: x.pence / 100, method: 'bank-online', status: 'awaiting',
      checkoutId: page.ref, holdUntil: Date.now() + HOLD_MS, by: '', byName: 'Online', at: FieldValue.serverTimestamp()
    }));
    await bb.commit();
    return { url: page.url };
  }
  if (!sec.exists || !sec.data().secretKey || !(pub.exists && pub.data().card)) throw new HttpsError('failed-precondition', 'This church does not take card payments online.');
  const p = await priceOf(key, 'card');
  if (!p.keys.length) throw new HttpsError('failed-precondition', 'There is nothing to pay for this booking.');
  if (!p.allowed) throw new HttpsError('failed-precondition', 'This ticket is not paid by card.');
  if (p.pence < 30) throw new HttpsError('failed-precondition', 'There is nothing to pay for this booking.');
  const already = await db().collection('signupPayments').doc(p.keys[0].key).get();
  if (already.exists && already.data().paid) throw new HttpsError('already-exists', 'This booking is already paid.');
  const hub = await hubUrl(db());
  const back = hub + 'my-signup.html?key=' + encodeURIComponent(key);
  const places = p.keys.length > 1 ? ' (' + p.keys.length + ' dates)' : '';
  /* NO application_fee_amount, and no payment_intent_data fee: the money is
     the church's, all of it, less only Stripe's own charge to the church. */
  const session = await stripe(sec.data().secretKey, 'POST', '/v1/checkout/sessions', {
    mode: 'payment',
    client_reference_id: key,
    customer_email: p.email || undefined,
    expires_at: Math.floor((Date.now() + HOLD_MS) / 1000),
    success_url: back + '&paid=card',
    cancel_url: back,
    line_items: [{ quantity: 1, price_data: { currency: 'gbp', unit_amount: p.pence, product_data: { name: (p.title + places).slice(0, 200) } } }],
    metadata: { signupKey: key, keys: p.keys.map((x) => x.key).join(',') }
  });
  /* so Stripe's message about this payment finds this church (stripeWebhook) */
  await indexCode(db(), 'stripe', codeHash(session.id));
  const batch = db().batch();
  p.keys.forEach((x) => batch.set(db().collection('signupPayments').doc(x.key), {
    calEventId: x.calEventId, paid: false, amount: x.pence / 100, method: 'card-online', status: 'awaiting',
    checkoutId: session.id, holdUntil: Date.now() + HOLD_MS, by: '', byName: 'Online', at: FieldValue.serverTimestamp()
  }));
  await batch.commit();
  return { url: session.url };
}));

/* -------------------------------------------------------- the webhook */

/* Each event acted on once: marked done only AFTER it is handled, so a
   failure is retried by Stripe rather than lost. */
function eventRef(provider, id) { return db().collection('paymentEvents').doc(provider + '_' + String(id).replace(/[^A-Za-z0-9_-]/g, '')); }
/* Give the place back for an unpaid booking whose time ran out. */
async function release(key) {
  const ref = db().collection('signups').doc(key);
  await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.data().status !== 'confirmed') return;
    const pay = await tx.get(db().collection('signupPayments').doc(key));
    if (pay.exists && pay.data().paid) return;
    const capRef = db().collection('capacity').doc(s.data().calEventId);
    const cap = await tx.get(capRef);
    tx.update(ref, { status: 'cancelled', cancelledAt: new Date().toISOString() });
    if (cap.exists) tx.update(capRef, { taken: Math.max(0, (cap.data().taken || 0) - (s.data().places || 1)), lastCancelled: key });
    tx.set(db().collection('signupPayments').doc(key), { status: 'expired', paid: false }, { merge: true });
  });
}

export async function handleStripe(event, accountId) {
  if (event.account && accountId && event.account !== accountId) return 'another account';
  const o = (event.data && event.data.object) || {};
  if (event.type === 'checkout.session.completed') {
    const keys = String((o.metadata && o.metadata.keys) || '').split(',').filter(Boolean);
    /* a later refund or dispute names only the payment: that finds the church too */
    if (o.payment_intent) await indexCode(db(), 'stripe', codeHash(o.payment_intent));
    for (const k of keys) {
      const ref = db().collection('signupPayments').doc(k), cur = await ref.get();
      await ref.set({ paid: true, status: 'paid', method: 'card-online', paymentRef: o.payment_intent || '', checkoutId: o.id || '', paidAt: FieldValue.serverTimestamp(),
        amount: cur.exists ? cur.data().amount : 0 }, { merge: true });
    }
    return 'paid ' + keys.length;
  }
  if (event.type === 'checkout.session.expired') {
    const keys = String((o.metadata && o.metadata.keys) || '').split(',').filter(Boolean);
    for (const k of keys) await release(k);
    return 'released ' + keys.length;
  }
  if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    const pi = o.payment_intent; if (!pi) return 'no payment';
    const hits = await db().collection('signupPayments').where('paymentRef', '==', pi).get();
    const total = hits.docs.reduce((n, d) => n + (Number(d.data().amount) || 0), 0);
    for (const d of hits.docs) {
      if (event.type === 'charge.dispute.created') { await d.ref.set({ status: 'disputed' }, { merge: true }); continue; }
      const refunded = (Number(o.amount_refunded) || 0) / 100, full = refunded >= total - 0.001;
      await d.ref.set({ status: full ? 'refunded' : 'part-refunded', refunded: full ? Number(d.data().amount) || 0 : Math.round(refunded / hits.size * 100) / 100 }, { merge: true });
    }
    return 'refund on ' + hits.size;
  }
  return 'not needed';
}

/* ------------------------------------------- without the webhook (F-209)
   Martin, 15 Oct: Stripe's webhook was "the thing I couldn't get them to
   give me". The hub must not depend on it. So it asks Stripe itself, with
   the church's key, and then does exactly what the webhook would have done
   (handleStripe): when the person comes back from paying, every few
   minutes for unpaid held places, and for refunds when "my place" or Who
   is coming opens. With a webhook as well, it is simply quicker. */
async function stripeSecret() { const s = await db().collection('paymentSecrets').doc('stripe').get(); return s.exists ? s.data() : {}; }
export async function checkCard(x, now) {
  if (x.method !== 'card-online' || !x.checkoutId) return 'not card';
  const sec = await stripeSecret(); if (!sec.secretKey) return 'no key';
  const id = encodeURIComponent(x.checkoutId);
  if (x.status === 'awaiting') {
    const s = await stripe(sec.secretKey, 'GET', '/v1/checkout/sessions/' + id);
    if (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') return handleStripe({ type: 'checkout.session.completed', data: { object: s } }, '');
    if (s.status === 'expired') return handleStripe({ type: 'checkout.session.expired', data: { object: s } }, '');
    /* Time up and still open: close it at Stripe first, so nobody can pay
       for a place that has been given back. */
    if (s.status === 'open' && (x.holdUntil || 0) + 5 * 60 * 1000 < (now || Date.now())) {
      const e = await stripe(sec.secretKey, 'POST', '/v1/checkout/sessions/' + id + '/expire', {});
      if (e.payment_status === 'paid') return handleStripe({ type: 'checkout.session.completed', data: { object: e } }, '');
      return handleStripe({ type: 'checkout.session.expired', data: { object: e.metadata ? e : s } }, '');
    }
    return 'open';
  }
  if ((x.status === 'paid' || x.status === 'part-refunded') && x.paymentRef) {
    const pi = await stripe(sec.secretKey, 'GET', '/v1/payment_intents/' + encodeURIComponent(x.paymentRef) + '?expand[]=latest_charge');
    const ch = (pi && typeof pi.latest_charge === 'object' && pi.latest_charge) || {};
    if (ch.disputed) return handleStripe({ type: 'charge.dispute.created', data: { object: { payment_intent: x.paymentRef } } }, '');
    if (Number(ch.amount_refunded) > 0) return handleStripe({ type: 'charge.refunded', data: { object: { payment_intent: x.paymentRef, amount_refunded: ch.amount_refunded } } }, '');
    return 'paid';
  }
  return 'nothing';
}
async function checkOne(x, now) {
  if (x.method === 'card-online') return checkCard(x, now);
  if (x.method === 'bank-online') return checkBank(x);
  return 'nothing';
}
/* Every few minutes: unpaid card places, asked; time up, given back. */
export async function tidyCard(now) {
  const due = (await db().collection('signupPayments').where('status', '==', 'awaiting').get()).docs.filter((d) => d.data().method === 'card-online');
  let n = 0;
  for (const d of due) { try { const r = await checkCard(d.data(), now); if (r !== 'open') n++; } catch (e) { console.warn('[tidyCard]', d.id, e.message); } }
  return n;
}
export const paymentsTidy = onSchedule({ region: REGION, schedule: 'every 5 minutes', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  await eachChurch(getFirestore(), (ch) => withChurchDb(ch.db, async () => { await tidyCard(); await tidyBank(); await pollGifts(); }));
});

/* The person back from paying, or opening "my place": anyone holding the
   booking's key, as ticketPay. */
export const paymentCheck = onCall({ region: REGION }, forAddress(async (req) => {
  if (await shut()) throw new HttpsError('failed-precondition', SHUT_MSG, { shut: true });
  const key = String(req.data && req.data.key || '');
  if (!/^[A-Za-z0-9_]{20,64}$/.test(key)) throw new HttpsError('invalid-argument', 'That booking could not be found.');
  const ref = db().collection('signupPayments').doc(key), s = await ref.get();
  if (!s.exists) return { status: '' };
  try { await checkOne(s.data()); } catch (e) { console.warn('[paymentCheck]', e.message); }
  const now = (await ref.get()).data() || {};
  return { status: now.status || '', paid: now.paid === true };
}));

/* Who is coming: an event's online payments, asked (refunds, disputes,
   still unpaid). The event's admins only. */
export const paymentCheckEvent = onCall({ region: REGION }, forCaller(async (req) => {
  if (await shut()) throw new HttpsError('failed-precondition', SHUT_MSG, { shut: true });
  const u = await userOf(req.auth && req.auth.uid);
  if (!u || u.status !== 'active' || !(u.masterAdmin === true || (u.adminFor || []).length)) throw new HttpsError('permission-denied', 'For the event\'s admins.');
  const ev = String(req.data && req.data.calEventId || '');
  const docs = (await db().collection('signupPayments').where('calEventId', '==', ev).get()).docs
    .filter((d) => ['card-online', 'bank-online'].includes(d.data().method) && ['awaiting', 'paid', 'part-refunded'].includes(d.data().status)).slice(0, 100);
  let changed = 0;
  for (const d of docs) {
    const before = d.data().status;
    try { await checkOne(d.data()); } catch (e) { continue; }
    if (((await d.ref.get()).data() || {}).status !== before) changed++;
  }
  return { checked: docs.length, changed };
}));

export const stripeWebhook = onRequest({ region: REGION }, async (req, res) => {
  if (paymentsShut()) { res.status(503).send('Not open yet'); return; }
  if (req.method !== 'POST') { res.status(405).send('POST only'); return; }
  const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
  let event; try { event = JSON.parse(raw); } catch (e) { res.status(400).send('body'); return; }
  /* Which church: the checkout or payment it names, looked up in Church HQ's
     index (none: EGBC). Only that church's own signing secret then passes,
     so a message can't be steered to another church. */
  const o = (event.data && event.data.object) || {};
  let cid = null;
  for (const id of [o.id, o.payment_intent].filter((x) => typeof x === 'string' && x)) if (!cid) cid = await churchForCode(getFirestore(), 'stripe', codeHash(id));
  await withChurchDb(scopedDb(getFirestore(), cid), async () => {
    const sec = await db().collection('paymentSecrets').doc('stripe').get();
    const secret = sec.exists ? sec.data().webhookSecret : '';
    if (!verifyStripe(raw, req.get('stripe-signature'), secret)) { res.status(400).send('signature'); return; }
    const done = eventRef('stripe', event.id);
    if ((await done.get()).exists) { res.status(200).send('already'); return; }
    try { const what = await handleStripe(event, sec.data().accountId); await done.set({ type: event.type, what, at: FieldValue.serverTimestamp() }); res.status(200).send(what); }
    catch (e) { console.error('stripeWebhook', e); res.status(500).send('error'); }
  });
});
