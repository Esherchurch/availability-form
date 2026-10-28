/* ===================================================================
   The e-news's subscribers: sign-up, confirm, unsubscribe, bounces
   (comms window, 19 Oct 2026; FINDINGS-comms C-10, C-11, C-20)
   ===================================================================

     enewsSignup       public  POST {email, firstName, special, website}
                       -> a pending subscriber and a confirm email
     enewsConfirm      public  POST {t}  the link in that email
     enewsUnsubscribe  public  POST, the token in ?t= or the body.
                       "List-Unsubscribe=One-Click" (the button mail apps
                       show, RFC 8058) gets an empty 200. The page sends
                       {t, action: unsubscribe|resubscribe|specialOnly|status}.
     hqMailEvents      Resend's webhook: bounced / complained / suppressed
     enewsSubscriberSave  callable, the office: add someone by hand, with
                       how they agreed (a paper form, in person...)

   NO PAGE WRITES A SUBSCRIBER. The rules let the office read them and
   nobody write them, so every change comes through here and is recorded
   in the person's history: who, when, how and what they were told
   (the ICO's list).

   SHUT UNTIL SWITCH-OVER (C-1): enewsShut() (enews-gate.js) on the live
   site, and the private-forms switch (churchSettings/launch.rulesLocked)
   everywhere - a subscriber list must not exist while the database can
   be read by anybody. While shut, sign-up saves nothing and says so.

   DOUBLE OPT-IN. Nobody is sent the e-news until they have pressed the
   link in the confirm email, so nobody can sign somebody else up. At most
   one confirm email per address per day, a hidden field robots fill in,
   and a cap of 60 new sign-ups an hour for the whole church.

   UNSUBSCRIBED PEOPLE ARE KEPT as "unsubscribed", never deleted: that
   record is what stops an import or a re-send emailing them again.
   =================================================================== */

import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { enewsShut } from './enews-gate.js';
import { makeHqSender, verifySvix } from './hq-mail.js';
import { webhookSecret, SENDING_SECRETS } from './resend-secrets.js';
import { featureOn } from './features.js';
import { isUnder18Email, isUnder18Record } from './under18.js';
import { hubUrl } from './notify.js';
import { isOffice } from './comms-office.js';
import { churchOf, scopedDb, eachChurch } from './church-scope.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { codeHash, indexCode, dropCode, dbForCode } from './hq-codes.js';
import { dbForAddress } from './church-address.js';

const REGION = 'europe-west2';
/* EACH CHURCH'S OWN LIST (multi-church batch 8): every helper takes the
   church's db (church-scope.js). A call's church is its sign-in's; a
   sign-up's is the page's own address; a link's is the codes index
   (hq-codes.js, kind 'enews'); a Resend report's is the church tag every
   send carries (hq-mail.js). Nothing of a church's: EGBC's own data. */
const root = () => getFirestore();
/* A church's links go in the codes index; EGBC's need no entry. */
const indexToken = (D, t) => indexCode(D, 'enews', codeHash(t));
const TOKEN = /^[A-Za-z0-9]{20,64}$/;
async function dbForToken(t) { return TOKEN.test(String(t || '')) ? dbForCode(root(), 'enews', codeHash(String(t))) : root(); }
/* The church a sign-up page is for: <slug>.churchhq.co.uk is that church
   (hqSlugs); EGBC's own address, github.io and a local test are EGBC's.
   An address no church has: null, refused. The events window's one rule
   for every public function (church-address.js, F-312). */
const dbForSite = req => dbForAddress(root(), req);
const EMULATOR = () => process.env.FUNCTIONS_EMULATOR === 'true';
/* The hub's web address: one church setting, churchSettings/details.hubUrl
   (main's hubUrl in notify.js, EGBC's address the default), without its
   last "/". Every e-news link and email takes it from there. */
const hubOf = async db => (await hubUrl(db)).replace(/\/+$/, '');
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;
const DAY = 86400000;
/* The words beside the tick on the sign-up page, kept with each consent so
   it is known later exactly what the person agreed to. Change the words
   on the page -> add a new version here. */
export const WORDING = {
  'signup-1': 'Yes, send me the weekly e-news. About one email a week. Every email has an unsubscribe link.'
};

export const newToken = () => randomBytes(48).toString('base64url').replace(/[^a-z0-9]/gi, '').slice(0, 32);
export const normEmail = e => String(e || '').trim().toLowerCase();
const mask = e => { const [u, d] = String(e).split('@'); return (u || '').slice(0, 2) + '…@' + (d || ''); };
const now = () => new Date().toISOString();
const hist = (what, extra) => Object.assign({ at: now(), what }, extra || {});

/* Where the links in emails point: the page the person came from, if it
   is a local test of the hub, otherwise the church's hub address. */
async function baseFrom(req, D) {
  const o = String(req.get('origin') || '');
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o)) {
    const ref = String(req.get('referer') || '');
    const m = /^(http:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/[^?#]*)?)\/[^\/?#]*(?:[?#].*)?$/.exec(ref);
    return m ? m[1] : o;
  }
  const hub = await hubOf(D);
  /* Never a link without an address (the reviewing window, 26 Oct). */
  if (!hub) throw new Error('This church has no hub address, so the email can\u2019t link to it.');
  return hub;
}

async function settings(D) {
  /* The e-news switch the way every page and function reads it
     (features.js: stored true/false, else the default). */
  const [launch, details, on] = await Promise.all([D.collection('churchSettings').doc('launch').get(), D.collection('churchSettings').doc('details').get(), featureOn(D, 'enews')]);
  const L = launch.exists ? launch.data() : {};
  return {
    open: !enewsShut() && L.rulesLocked === true,
    opensOn: String(L.opensOn || ''),
    on,
    church: details.exists ? details.data() : {}
  };
}

async function findByEmail(D, email) {
  const s = await D.collection('enewsSubscribers').where('email', '==', email).limit(1).get();
  return s.empty ? null : s.docs[0];
}
async function findByToken(D, field, t) {
  if (!TOKEN.test(String(t || ''))) return null;
  const s = await D.collection('enewsSubscribers').where(field, '==', String(t)).limit(1).get();
  return s.empty ? null : s.docs[0];
}

/* The pure decision for a sign-up, so the check can ask it directly. */
export function signupDecision(existing, nowMs) {
  if (!existing) return 'create';
  const st = existing.status;
  if (st === 'subscribed') return 'already';
  if (st === 'bounced') return 'create-again';    /* a new address that works? they confirm again */
  const last = Date.parse(existing.confirmSentAt || '') || 0;
  if (st === 'pending' && nowMs - last < DAY) return 'wait';
  return 'create-again';                            /* unsubscribed, complained or stale pending: they must confirm */
}

function confirmEmail(church, link) {
  const name = String(church.name || 'the church').replace(/[<>&]/g, '');
  return '<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f6f7f7;font-family:Arial,sans-serif;color:#1e3a3a">' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table width="560" style="max-width:560px;background:#fff;border-radius:12px" cellpadding="0" cellspacing="0"><tr><td style="padding:24px">' +
    '<p style="font-size:18px;font-weight:bold;margin:0 0 12px">Please confirm your e-news sign-up</p>' +
    '<p style="margin:0 0 16px;line-height:1.5">Someone (we hope you) asked for ' + name + '’s weekly e-news to come to this address. Tap the button to say yes. If it wasn’t you, ignore this email and nothing more will be sent.</p>' +
    '<table cellpadding="0" cellspacing="0"><tr><td bgcolor="#3d6263" style="border-radius:8px"><a href="' + link + '" style="display:inline-block;padding:12px 22px;color:#fff;font-weight:bold;text-decoration:none">Yes, sign me up</a></td></tr></table>' +
    '<p style="margin:16px 0 0;font-size:12px;color:#6b7280">The link works for 7 days.</p></td></tr></table></td></tr></table></body></html>';
}

/* ---- sign-up ----------------------------------------------------------- */
/* The sites the sign-up and confirm pages are served from: Church HQ's own
   addresses (<slug>.churchhq.co.uk; the main window, 26 Oct 2026, asked in
   FINDINGS-comms), a local test, and the church's own hub address (its
   setting, hub-address.js), so no church's address is typed here.
   Answers the browser's check before a POST; true when that was all. */
const HQ_SITES = /^(https:\/\/[a-z0-9-]+\.churchhq\.co\.uk|http:\/\/(localhost|127\.0\.0\.1):\d+)$/;
async function fromOurSite(req, res, D) {
  const o = String(req.get('origin') || '');
  const ok = HQ_SITES.test(o) || (!!o && await hubOf(D || root()).then((u) => new URL(u).origin === o, () => false));
  res.set('Vary', 'Origin');
  if (ok) res.set('Access-Control-Allow-Origin', o);
  if (req.method !== 'OPTIONS') return false;
  if (ok) res.set({ 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '3600' });
  res.status(204).send('');
  return true;
}
export const enewsSignup = onRequest({ region: REGION, cors: false, invoker: 'public' }, async (req, res) => {
  const D = await dbForSite(req);
  if (await fromOurSite(req, res, D)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const b = req.body || {};
  if (!D) return res.status(404).json({ ok: false, error: 'church' });
  const S = await settings(D);
  if (!S.on) return res.json({ ok: false, off: true });
  if (!S.open) return res.json({ ok: false, shut: true, opensOn: S.opensOn });
  /* A robot fills in the hidden "website" box; a person never sees it.
     It is told yes, and nothing happens. */
  if (String(b.website || '').trim()) return res.json({ ok: true });
  const email = normEmail(b.email);
  if (!EMAIL.test(email) || email.length > 200) return res.status(400).json({ ok: false, error: 'email' });
  const first = String(b.firstName || '').replace(/[<>]/g, '').trim().slice(0, 60);
  const wording = WORDING[b.wording] ? b.wording : 'signup-1';

  const hourAgo = new Date(Date.now() - 3600000).toISOString();
  const recent = await D.collection('enewsSubscribers').where('createdAt', '>=', hourAgo).count().get().catch(() => null);
  if (recent && recent.data().count >= 60) return res.status(429).json({ ok: false, error: 'busy' });

  const doc = await findByEmail(D, email);
  const decision = signupDecision(doc && doc.data(), Date.now());
  /* The same answer whatever is decided, so the form never tells a
     stranger whether an address is on the list. */
  const answer = { ok: true, email: mask(email) };
  if (decision === 'already' || decision === 'wait') return res.json(answer);

  const confirmToken = newToken();
  const data = {
    email, firstName: first || (doc && doc.data().firstName) || '',
    status: decision === 'create' ? 'pending' : (doc.data().status === 'subscribed' ? 'subscribed' : 'pending'),
    lists: { weekly: true, special: b.special === true },
    confirmToken, confirmSentAt: now(), confirmExpires: new Date(Date.now() + 7 * DAY).toISOString(),
    asked: { at: now(), how: 'web form', wording, text: WORDING[wording] },
    updatedAt: now()
  };
  const ref = doc ? doc.ref : D.collection('enewsSubscribers').doc();
  if (!doc) Object.assign(data, { createdAt: now(), token: newToken(), history: [hist('asked to join (web form)')] });
  else data.history = (doc.data().history || []).concat([hist('asked to join again (web form)')]).slice(-50);
  await ref.set(data, { merge: true });
  await indexToken(D, confirmToken);
  if (data.token) await indexToken(D, data.token);

  const link = (await baseFrom(req, D)) + '/enews-confirm.html?t=' + confirmToken;
  await makeHqSender({ db: D })({
    to: email, subject: 'Please confirm: ' + (S.church.name || 'the church') + ' e-news',
    html: confirmEmail(S.church, link), fromName: S.church.name || '', replyTo: S.church.enquiryEmail || ''
  }, { kind: 'enews confirm', subscriberId: ref.id });
  return res.json(answer);
});

/* ---- confirm ------------------------------------------------------------ */
export const enewsConfirm = onRequest({ region: REGION, cors: false, invoker: 'public' }, async (req, res) => {
  const t = (req.body || {}).t, D = await dbForToken(t);
  if (await fromOurSite(req, res, D)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const S = await settings(D);
  if (!S.open) return res.json({ ok: false, shut: true });
  const doc = await findByToken(D, 'confirmToken', t);
  if (!doc) return res.json({ ok: false, error: 'link' });
  const d = doc.data();
  if (Date.parse(d.confirmExpires || '') < Date.now()) return res.json({ ok: false, error: 'expired' });
  await doc.ref.set({
    status: 'subscribed', confirmToken: '', confirmExpires: '',
    consent: Object.assign({}, d.asked || {}, { how: 'web form (confirmed by email)', confirmedAt: now() }),
    updatedAt: now(), history: (d.history || []).concat([hist('confirmed by email')]).slice(-50)
  }, { merge: true });
  return res.json({ ok: true, email: mask(d.email) });
});

/* ---- unsubscribe -------------------------------------------------------- */
/* The pure change, so the check can ask it. */
export function unsubChange(d, action) {
  const lists = Object.assign({ weekly: true, special: false }, d.lists || {});
  if (action === 'unsubscribe') return { status: 'unsubscribed', lists: { weekly: false, special: false }, what: 'unsubscribed' };
  if (action === 'specialOnly') return { status: 'subscribed', lists: { weekly: false, special: true }, what: 'special notices only' };
  if (action === 'resubscribe') {
    if (d.status === 'bounced' || d.status === 'complained') return null;   /* not from a link: the office decides */
    return { status: 'subscribed', lists: { weekly: true, special: lists.special }, what: 're-subscribed from the unsubscribe page' };
  }
  return null;
}
export const enewsUnsubscribe = onRequest({ region: REGION, cors: true, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('');
  const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
  const oneClick = /List-Unsubscribe=One-Click/.test(raw) || (req.body && req.body['List-Unsubscribe'] === 'One-Click');
  const b = (!oneClick && req.body && typeof req.body === 'object') ? req.body : {};
  const t = req.query.t || b.t, D = await dbForToken(t);
  const doc = await findByToken(D, 'token', t);
  if (oneClick) {
    if (doc) {
      const d = doc.data(), c = unsubChange(d, 'unsubscribe');
      await doc.ref.set({ status: c.status, lists: c.lists, updatedAt: now(), history: (d.history || []).concat([hist('unsubscribed (one click in the mail app)')]).slice(-50) }, { merge: true });
    }
    return res.status(200).send('');
  }
  if (!doc) return res.json({ ok: false, error: 'link' });
  const d = doc.data(), action = String(b.action || 'unsubscribe');
  if (action === 'status') return res.json({ ok: true, email: mask(d.email), status: d.status, lists: d.lists || {} });
  const c = unsubChange(d, action);
  if (!c) return res.json({ ok: false, error: 'action' });
  const set = { status: c.status, lists: c.lists, updatedAt: now(), history: (d.history || []).concat([hist(c.what)]).slice(-50) };
  if (action === 'resubscribe') set.consent = Object.assign({}, d.consent || {}, { renewedAt: now(), renewedHow: 'unsubscribe page' });
  await doc.ref.set(set, { merge: true });
  return res.json({ ok: true, email: mask(d.email), status: c.status, lists: c.lists });
});

/* ---- bounces and complaints, from Resend -------------------------------- */
const HOOK_STATUS = { 'email.bounced': 'bounced', 'email.complained': 'complained', 'email.suppressed': 'bounced' };
export const hqMailEvents = onRequest({ region: REGION, cors: false, invoker: 'public', secrets: SENDING_SECRETS }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('');
  /* The signing secret from Google Secret Manager (HQ_RESEND_WEBHOOK_SECRET,
     resend-secrets.js); on the emulator a test gives one in
     functions/.env.local (TEST_WEBHOOK_SECRET) instead. */
  const secret = (await webhookSecret()) || (EMULATOR() ? process.env.TEST_WEBHOOK_SECRET || '' : '');
  const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
  if (!verifySvix(secret, req.headers, raw)) return res.status(401).send('');
  const id = String(req.get('svix-id') || '');
  const seen = root().collection('hqMailEvents').doc(id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || 'none');
  let ev; try { ev = JSON.parse(raw); } catch { return res.status(400).send(''); }
  const fresh = await root().runTransaction(async tx => {
    if ((await tx.get(seen)).exists) return false;
    tx.set(seen, { type: String(ev.type || ''), at: now() });
    return true;
  });
  if (!fresh) return res.status(200).send('');
  const status = HOOK_STATUS[ev.type];
  if (!status) return res.status(200).send('');
  const data = ev.data || {};
  const tags = data.tags || {};
  const tagOf = (k) => String(Array.isArray(tags) ? ((tags.find(t => t.name === k) || {}).value || '') : (tags[k] || ''));
  const subId = tagOf('sub'), churchTag = tagOf('church');
  let D = root();
  if (churchTag) { try { D = scopedDb(root(), churchTag); } catch (e) { return res.status(200).send(''); } }
  const emails = (Array.isArray(data.to) ? data.to : [data.to]).map(normEmail).filter(Boolean);
  const targets = [];
  if (/^[A-Za-z0-9_-]{10,40}$/.test(subId)) { const d = await D.collection('enewsSubscribers').doc(subId).get(); if (d.exists) targets.push(d); }
  if (!targets.length) for (const e of emails) { const d = await findByEmail(D, e); if (d) targets.push(d); }
  for (const d of targets) {
    const x = d.data();
    if (x.status === 'complained') continue;
    await d.ref.set({ status, lists: { weekly: false, special: false }, updatedAt: now(),
      history: (x.history || []).concat([hist(status === 'complained' ? 'marked the e-news as spam (they are not sent it again)' : 'email bounced (not sent again)')]).slice(-50) }, { merge: true });
  }
  return res.status(200).send('');
});

/* ---- the office adds someone by hand ------------------------------------- */
/* How a person told the church yes, recorded with them (Martin, 20 Oct:
   "never added silently"): told the office, a paper form, by email, by
   phone, or signed up themselves. */
const HOW = { person: 'told the office', paper: 'a paper form', email: 'asked by email', phone: 'asked by phone', signedUp: 'signed up themselves' };

/* One person, added by the office. Refusals, in words, never silent:
   an under-18 (the hub never emails under-18s: under18.js), somebody who has
   unsubscribed or marked it as spam (only they can come back, from the
   sign-up page - unless the office ticks that they asked again, and never
   from the address book), and a dead address. */
async function addOne(D, person, how, uid, opts) {
  const email = normEmail(person.email);
  if (!EMAIL.test(email)) return { email, skipped: 'that email address does not look right' };
  if (await isUnder18Email(D, email)) return { email, skipped: 'under 18: the hub never emails under-18s' };
  /* Added from a person's record: never an under-18's record, even when the
     address is a parent's (under18.js). */
  if (person.memberId) { const r = await D.collection('addressBook').doc(String(person.memberId)).get(); if (r.exists && isUnder18Record(r.data())) return { email, skipped: 'under 18: the hub never emails under-18s' }; }
  const doc = await findByEmail(D, email);
  const st = doc ? doc.data().status : '';
  if (st === 'subscribed') return { email, skipped: 'already gets the e-news' };
  if (st === 'complained') return { email, skipped: 'marked the e-news as spam: only they can sign up again' };
  if (st === 'unsubscribed' && !(opts.confirmAgain === true && opts.from !== 'addressBook')) return { email, skipped: 'unsubscribed on ' + String(doc.data().updatedAt || '').slice(0, 10) + ': only they can sign up again' };
  const entry = hist('added by the office (' + HOW[how] + ')', { by: uid, from: opts.from || '' });
  const data = {
    email, firstName: String(person.firstName || '').replace(/[<>]/g, '').trim().slice(0, 60) || (doc && doc.data().firstName) || '',
    status: 'subscribed', lists: { weekly: true, special: opts.special === true },
    consent: { at: now(), how: 'office: ' + HOW[how], by: uid, note: String(opts.note || '').slice(0, 200), confirmedAt: now() },
    updatedAt: now()
  };
  if (person.memberId) data.memberId = String(person.memberId).slice(0, 80);
  const ref = doc ? doc.ref : D.collection('enewsSubscribers').doc();
  if (!doc) Object.assign(data, { createdAt: now(), token: newToken(), history: [entry] });
  else data.history = (doc.data().history || []).concat([entry]).slice(-50);
  await ref.set(data, { merge: true });
  if (data.token) await indexToken(D, data.token);
  return { email, added: true, id: ref.id };
}

/*  enewsSubscriberSave (the office), one of:
      { email, firstName, how, note, special, confirmAgain }   one person
      { people: [{ email, firstName, memberId }], how, from }  several at
                                       once (a team, from the address book)
      { email, action: 'stop' }        the office stops it for them
                                       (kept as unsubscribed, with who) */
export const enewsSubscriberSave = onCall({ region: REGION }, async (req) => {
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const D = churchOf(req, root()).db;
  const me = await D.collection('users').doc(uid).get();
  const p = me.exists ? me.data() : {};
  const office = await isOffice(D, p);
  if (!office) throw new HttpsError('permission-denied', 'For the church office.');
  const S = await settings(D);
  if (!S.on) throw new HttpsError('failed-precondition', 'The e-news is switched off.');
  if (!S.open) throw new HttpsError('failed-precondition', 'The subscriber list opens when the church goes live' + (S.opensOn ? ' (' + S.opensOn + ')' : '') + '.');
  const d = req.data || {};
  if (d.action === 'stop') {
    const doc = await findByEmail(D, normEmail(d.email));
    if (!doc) return { ok: true, stopped: false };
    const x = doc.data();
    await doc.ref.set({ status: 'unsubscribed', lists: { weekly: false, special: false }, updatedAt: now(),
      history: (x.history || []).concat([hist('stopped by the office', { by: uid })]).slice(-50) }, { merge: true });
    return { ok: true, stopped: true };
  }
  if (!HOW[d.how]) throw new HttpsError('invalid-argument', 'Say how they agreed.');
  const from = d.from === 'addressBook' ? 'addressBook' : 'office';
  if (Array.isArray(d.people)) {
    if (d.people.length > 300) throw new HttpsError('invalid-argument', 'At most 300 at once.');
    const results = [];
    for (const person of d.people) results.push(await addOne(D, person || {}, d.how, uid, { from, note: d.note }));
    return { ok: true, added: results.filter(r => r.added).length, skipped: results.filter(r => r.skipped) };
  }
  const r = await addOne(D, { email: d.email, firstName: d.firstName, memberId: d.memberId }, d.how, uid, { from, note: d.note, special: d.special, confirmAgain: d.confirmAgain });
  if (r.skipped) throw new HttpsError('failed-precondition', 'Not added: ' + r.skipped + '.');
  return { ok: true, id: r.id };
});

/* ---- sign-ups never confirmed ------------------------------------------ */
/* Someone typed an address and nobody pressed the confirm link: after 14
   days the record goes, so the list holds nobody who never agreed. Only a
   record that has only ever been asked for: anyone who once agreed, or
   left the list, keeps their record (it is what stops a re-send). */
export const PENDING_DAYS = 14;
const onlyAsked = (d) => !d.consent && (d.history || []).every((h) => /^asked to join/.test(String((h && h.what) || '')));

/**
 * Delete the church's sign-ups that were never confirmed and are older
 * than PENDING_DAYS, with their link codes.
 * @param {FirebaseFirestore.Firestore} D the church's database (scoped)
 * @param {number} [nowMs]
 * @returns {Promise<number>} how many went
 */
export async function tidyPending(D, nowMs = Date.now()) {
  const before = new Date(nowMs - PENDING_DAYS * DAY).toISOString();
  const s = await D.collection('enewsSubscribers').where('status', '==', 'pending').get();
  let n = 0;
  for (const doc of s.docs) {
    const d = doc.data();
    if (!(String(d.createdAt || '') < before) || !onlyAsked(d)) continue;
    for (const t of [d.token, d.confirmToken]) if (TOKEN.test(String(t || ''))) await dropCode(D, 'enews', codeHash(String(t))).catch(() => {});
    await doc.ref.delete();
    n++;
  }
  if (n) console.info('[enews] ' + (D.churchId || 'top level') + ': ' + n + ' unconfirmed sign-up(s) removed after ' + PENDING_DAYS + ' days');
  return n;
}
export const enewsTidyPending = onSchedule({ region: REGION, schedule: '30 3 * * *', timeZone: 'Europe/London', retryCount: 0 },
  async () => { await eachChurch(root(), (ch) => tidyPending(ch.db)); });
