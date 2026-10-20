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
import { storedKeys } from './hq-mail-key.js';
import { featureOn } from './features.js';

const REGION = 'europe-west2';
const db = () => getFirestore();
const EMULATOR = () => process.env.FUNCTIONS_EMULATOR === 'true';
const HUB = 'https://esherchurch.github.io/availability-form/v2';
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
   is the hub (or a local test of it), otherwise the live hub. */
function baseFrom(req) {
  const o = String(req.get('origin') || '');
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o)) {
    const ref = String(req.get('referer') || '');
    const m = /^(http:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/[^?#]*)?)\/[^\/?#]*(?:[?#].*)?$/.exec(ref);
    return m ? m[1] : o;
  }
  return HUB;
}

async function settings() {
  /* The e-news switch the way every page and function reads it
     (features.js: stored true/false, else the default). */
  const [launch, details, on] = await Promise.all([db().collection('churchSettings').doc('launch').get(), db().collection('churchSettings').doc('details').get(), featureOn(db(), 'enews')]);
  const L = launch.exists ? launch.data() : {};
  return {
    open: !enewsShut() && L.rulesLocked === true,
    opensOn: String(L.opensOn || ''),
    on,
    church: details.exists ? details.data() : {}
  };
}

async function findByEmail(email) {
  const s = await db().collection('enewsSubscribers').where('email', '==', email).limit(1).get();
  return s.empty ? null : s.docs[0];
}
async function findByToken(field, t) {
  if (!/^[A-Za-z0-9]{20,64}$/.test(String(t || ''))) return null;
  const s = await db().collection('enewsSubscribers').where(field, '==', String(t)).limit(1).get();
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
export const enewsSignup = onRequest({ region: REGION, cors: [/^https:\/\/esherchurch\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/], invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const b = req.body || {};
  const S = await settings();
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
  const recent = await db().collection('enewsSubscribers').where('createdAt', '>=', hourAgo).count().get().catch(() => null);
  if (recent && recent.data().count >= 60) return res.status(429).json({ ok: false, error: 'busy' });

  const doc = await findByEmail(email);
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
  const ref = doc ? doc.ref : db().collection('enewsSubscribers').doc();
  if (!doc) Object.assign(data, { createdAt: now(), token: newToken(), history: [hist('asked to join (web form)')] });
  else data.history = (doc.data().history || []).concat([hist('asked to join again (web form)')]).slice(-50);
  await ref.set(data, { merge: true });

  const link = baseFrom(req) + '/enews-confirm.html?t=' + confirmToken;
  await makeHqSender({ db: db() })({
    to: email, subject: 'Please confirm: ' + (S.church.name || 'the church') + ' e-news',
    html: confirmEmail(S.church, link), fromName: S.church.name || '', replyTo: S.church.enquiryEmail || ''
  }, { kind: 'enews confirm', subscriberId: ref.id });
  return res.json(answer);
});

/* ---- confirm ------------------------------------------------------------ */
export const enewsConfirm = onRequest({ region: REGION, cors: [/^https:\/\/esherchurch\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/], invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const S = await settings();
  if (!S.open) return res.json({ ok: false, shut: true });
  const doc = await findByToken('confirmToken', (req.body || {}).t);
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
  const doc = await findByToken('token', req.query.t || b.t);
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
export const hqMailEvents = onRequest({ region: REGION, cors: false, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('');
  /* The signing secret from the key box; on the emulator a test may give
     one in functions/.env.local instead. */
  const secret = (await storedKeys(db())).hook || (EMULATOR() ? process.env.TEST_WEBHOOK_SECRET || '' : '');
  const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
  if (!verifySvix(secret, req.headers, raw)) return res.status(401).send('');
  const id = String(req.get('svix-id') || '');
  const seen = db().collection('hqMailEvents').doc(id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120) || 'none');
  let ev; try { ev = JSON.parse(raw); } catch { return res.status(400).send(''); }
  const fresh = await db().runTransaction(async tx => {
    if ((await tx.get(seen)).exists) return false;
    tx.set(seen, { type: String(ev.type || ''), at: now() });
    return true;
  });
  if (!fresh) return res.status(200).send('');
  const status = HOOK_STATUS[ev.type];
  if (!status) return res.status(200).send('');
  const data = ev.data || {};
  const tags = data.tags || {};
  const subId = String(Array.isArray(tags) ? ((tags.find(t => t.name === 'sub') || {}).value || '') : (tags.sub || ''));
  const emails = (Array.isArray(data.to) ? data.to : [data.to]).map(normEmail).filter(Boolean);
  const targets = [];
  if (/^[A-Za-z0-9_-]{10,40}$/.test(subId)) { const d = await db().collection('enewsSubscribers').doc(subId).get(); if (d.exists) targets.push(d); }
  if (!targets.length) for (const e of emails) { const d = await findByEmail(e); if (d) targets.push(d); }
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
   an under-16 (the hub never emails under-18s), somebody who has
   unsubscribed or marked it as spam (only they can come back, from the
   sign-up page - unless the office ticks that they asked again, and never
   from the address book), and a dead address. */
async function addOne(person, how, uid, opts) {
  const email = normEmail(person.email);
  if (!EMAIL.test(email)) return { email, skipped: 'that email address does not look right' };
  const minor = await db().collection('addressBook').where('isMinor', '==', true).where('email', '==', email).limit(1).get();
  if (!minor.empty) return { email, skipped: 'under 16: the hub never emails under-18s' };
  const doc = await findByEmail(email);
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
  const ref = doc ? doc.ref : db().collection('enewsSubscribers').doc();
  if (!doc) Object.assign(data, { createdAt: now(), token: newToken(), history: [entry] });
  else data.history = (doc.data().history || []).concat([entry]).slice(-50);
  await ref.set(data, { merge: true });
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
  const me = await db().collection('users').doc(uid).get();
  const p = me.exists ? me.data() : {};
  const office = p.status === 'active' && (p.masterAdmin === true || (p.teams || []).includes('Church office'));
  if (!office) throw new HttpsError('permission-denied', 'For the church office.');
  const S = await settings();
  if (!S.on) throw new HttpsError('failed-precondition', 'The e-news is switched off.');
  if (!S.open) throw new HttpsError('failed-precondition', 'The subscriber list opens at switch-over' + (S.opensOn ? ' (' + S.opensOn + ')' : '') + '.');
  const d = req.data || {};
  if (d.action === 'stop') {
    const doc = await findByEmail(normEmail(d.email));
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
    for (const person of d.people) results.push(await addOne(person || {}, d.how, uid, { from, note: d.note }));
    return { ok: true, added: results.filter(r => r.added).length, skipped: results.filter(r => r.skipped) };
  }
  const r = await addOne({ email: d.email, firstName: d.firstName, memberId: d.memberId }, d.how, uid, { from, note: d.note, special: d.special, confirmAgain: d.confirmAgain });
  if (r.skipped) throw new HttpsError('failed-precondition', 'Not added: ' + r.skipped + '.');
  return { ok: true, id: r.id };
});
