/* THE ACCOUNTS EXPORT'S EVENT AND GIVING ROWS (Martin, 30 Oct 2026: one
 * accounts export for everything).
 *
 * Room bookings → Accounts already exports hire charges, VAT, payments,
 * refunds and damage deposits from the page (egbc-accounts.js rows). This
 * adds, in the same columns, the money the hub takes online:
 *   - event tickets (signupPayments: card through Stripe, bank through
 *     GoCardless), a row per order when paid and a row per refund;
 *   - regular gifts (donations, GoCardless), a row per collection, a row
 *     for a refund, and a row for a collection that failed (giftFailures).
 * The church has no one-off card gifts: its Give page shows bank details.
 *
 * Built here, not in the page, because these records are server-only or
 * the money team's, and a payer's name and email come from the sign-up.
 * Nothing more personal than the export already holds: name and email.
 *
 * Each row's id never changes, so the treasurer's software can match it.
 * "Only what is new" uses accountsExported/<row id>, written when the
 * page has downloaded the file; it is server-only, so no page's own saves
 * are touched by it. Stripe and GoCardless fees are not on the payment
 * records, so they have no rows.
 *
 *   accountsExport      { from, to, type: 'events'|'giving'|'all', onlyNew } -> { head, rows: [{ id, cells }] }
 *   accountsExportMark  { ids } -> { marked }
 * Both for master admins and the office and finance jobs, as the page.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { churchOf } from './church-scope.js';
import { readTeamJobs, teamsFor } from './team-jobs.js';

const REGION = 'europe-west2';
/* The page's columns (egbc-accounts.js HEAD), the same order. */
export const HEAD = ['Id', 'Date', 'Type', 'Invoice', 'Payer', 'Organisation', 'Email', 'Booking reference', 'Room', 'Description', 'Net (£)', 'VAT (£)', 'Gross (£)', 'Method', 'Reference', 'Source', 'Gift Aid'];
const METHOD = { 'card-online': 'Card online', 'bank-online': 'Bank online' };
const MAX_IDS = 5000;

/* YYYY-MM-DD in London, from a Timestamp, a Date, an ISO string or a day. */
export function londonDay(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = v.toDate ? v.toDate() : new Date(v);
  if (isNaN(t)) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}
const pounds = (n) => Math.round((Number(n) || 0) * 100) / 100;
const row = (id, date, type, payer, email, ref, desc, gross, method, payRef, source, giftAid) =>
  ({ id, cells: [id, date, type, '', payer || '', '', email || '', ref || '', '', desc, pounds(gross), 0, pounds(gross), method || '', payRef || '', source, giftAid] });

/**
 * The event ticket rows: a payment row per paid order, and a row per refund.
 * @param {Array<object>} pays  signupPayments, each with its id as key
 * @param {object} events  calEvents titles by id
 * @param {object} signups  { name, email } by sign-up key
 * @returns {Array<{id: string, cells: Array}>}
 */
export function eventRows(pays, events, signups) {
  const out = [];
  for (const p of pays) {
    if (!METHOD[p.method]) continue;   /* online only: money at the door is counted by whoever takes it */
    const took = p.paid === true || /refunded/.test(p.status || '');
    if (!took) continue;
    const who = signups[p.key] || {}, title = events[p.calEventId] || 'An event', ref = String(p.key).slice(0, 8).toUpperCase();
    const paidOn = londonDay(p.paidAt || p.at);
    out.push(row('ev_' + p.key + '#P', paidOn, 'Payment', who.name, who.email, ref, title + ': tickets', p.amount, METHOD[p.method], p.paymentRef || p.checkoutId, 'Event', ''));
    /* each refund as it came; a refund recorded before refunds were listed is one row */
    const refunds = Array.isArray(p.refunds) && p.refunds.length ? p.refunds : (Number(p.refunded) > 0 ? [{ at: p.paidAt || p.at, amount: p.refunded }] : []);
    refunds.forEach((r, i) => out.push(row('ev_' + p.key + '#R' + i, londonDay(r.at), 'Refund', who.name, who.email, ref, title + ': refund', -Number(r.amount || 0), METHOD[p.method], p.paymentRef || '', 'Event', '')));
  }
  return out;
}

/**
 * The regular gift rows: each collection, its refund, and each failed collection.
 * @param {Array<object>} gifts  donations with their ids as key
 * @param {Array<object>} failed  giftFailures with their ids as key
 * @param {object} givers  { email } by regular gift key
 * @returns {Array<{id: string, cells: Array}>}
 */
export function giftRows(gifts, failed, givers) {
  const out = [];
  for (const d of gifts) {
    if (d.source !== 'regular-giving') continue;
    const email = (givers[d.regularGiftKey] || {}).email || '', ga = d.giftAid ? 'Yes' : 'No';
    out.push(row('gift_' + d.key + '#P', londonDay(d.date), 'Payment', d.name, email, '', 'Regular gift', d.amount, 'Direct Debit', d.paymentRef, 'Gift', ga));
    if (d.refunded) out.push(row('gift_' + d.key + '#R', londonDay(d.refundedAt || d.date), 'Refund', d.name, email, '', 'Regular gift: refund', -Number(d.amount || 0), 'Direct Debit', d.paymentRef, 'Gift', ga));
  }
  for (const f of failed) {
    const email = (givers[f.regularGiftKey] || {}).email || '';
    out.push(row('gift_' + f.key + '#F', londonDay(f.at), 'Failed collection', f.name, email, '', 'Regular gift: collection failed (' + pounds(f.amount).toFixed(2) + ' not received)', 0, 'Direct Debit', f.paymentRef, 'Gift', ''));
  }
  return out;
}

/* Master admins, and the office and finance jobs (team jobs, then the settings they fall back on). */
async function mayExport(D, uid) {
  const u = (await D.collection('users').doc(uid).get()).data();
  if (!u || u.status !== 'active') return false;
  if (u.masterAdmin === true) return true;
  const { map, set } = await readTeamJobs(D);
  const teams = teamsFor(map, 'office', set).concat(teamsFor(map, 'finance', set));
  return (u.teams || []).concat(u.covers || [], u.adminFor || []).some((t) => teams.includes(t));
}
async function caller(req) {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const D = churchOf(req, getFirestore()).db;
  if (!(await mayExport(D, req.auth.uid))) throw new HttpsError('permission-denied', 'The accounts export is for the office and the finance team.');
  return D;
}
const docs = (snap) => snap.docs.map((d) => Object.assign({ key: d.id }, d.data()));
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

export const accountsExport = onCall({ region: REGION }, async (req) => {
  const D = await caller(req), a = req.data || {};
  const from = day(a.from) || '0000-00-00', to = day(a.to) || '9999-12-31', type = ['events', 'giving'].includes(a.type) ? a.type : 'all';
  let out = [];
  if (type !== 'giving') {
    const pays = docs(await D.collection('signupPayments').where('method', 'in', Object.keys(METHOD)).get());
    const events = {}, signups = {};
    for (const id of [...new Set(pays.map((p) => p.calEventId).filter(Boolean))]) events[id] = String(((await D.collection('calEvents').doc(id).get()).data() || {}).title || '');
    for (const p of pays) { const s = (await D.collection('signups').doc(p.key).get()).data() || {}; signups[p.key] = { name: s.name || '', email: s.email || '' }; }
    out = out.concat(eventRows(pays, events, signups));
  }
  if (type !== 'events') {
    const gifts = docs(await D.collection('donations').where('source', '==', 'regular-giving').get()), failed = docs(await D.collection('giftFailures').get());
    const givers = {};
    for (const k of [...new Set(gifts.concat(failed).map((g) => g.regularGiftKey).filter(Boolean))]) givers[k] = { email: ((await D.collection('regularGifts').doc(k).get()).data() || {}).email || '' };
    out = out.concat(giftRows(gifts, failed, givers));
  }
  out = out.filter((r) => r.cells[1] >= from && r.cells[1] <= to);
  if (a.onlyNew !== false && out.length) {
    const seen = new Set();
    for (let i = 0; i < out.length; i += 300) (await D.getAll(...out.slice(i, i + 300).map((r) => D.collection('accountsExported').doc(r.id)))).forEach((s) => { if (s.exists) seen.add(s.id); });
    out = out.filter((r) => !seen.has(r.id));
  }
  return { head: HEAD, rows: out.sort((x, y) => (x.cells[1] < y.cells[1] ? -1 : x.cells[1] > y.cells[1] ? 1 : x.id < y.id ? -1 : 1)) };
});

export const accountsExportMark = onCall({ region: REGION }, async (req) => {
  const D = await caller(req);
  const ids = ((req.data || {}).ids || []).filter((x) => typeof x === 'string' && /^(ev|gift)_[\w-]+#[PRF]\d*$/.test(x)).slice(0, MAX_IDS);
  const at = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 400) {
    const b = D.batch();
    ids.slice(i, i + 400).forEach((id) => b.set(D.collection('accountsExported').doc(id), { at, by: req.auth.uid }));
    await b.commit();
  }
  return { marked: ids.length };
});
