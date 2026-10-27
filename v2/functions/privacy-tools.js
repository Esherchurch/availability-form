/* =====================================================================
   PRIVACY TOOLS (UK GDPR; the reviewing window, 29 Oct 2026)
   ---------------------------------------------------------------------
   Built on the events window's information asset register (infoAssets,
   F-307): every collection a register entry names is searched for one
   person, so the tools follow the register as the church keeps it.

     privacyFind   { memberId | email }            -> what we hold, by asset
     privacyExport { memberId | email, requestId? } -> the records, for a
                   subject access request; logged in dataExports/{id}
                   (server only; the leads read it).

   WHO: master admins and the data protection leads (dataSettings/main
   leads) - the rules' dataLead().

   WHAT COUNTS AS THEIRS: their address book record and sign-in record,
   and any record in a registered collection that names them - by member
   id, sign-in id or email - in the fields the hub uses for people.

   RECORDS WITH THEIR OWN NAMED READERS - care and concerns (worries),
   pastoral visits, and safeguarding (sg...) - are COUNTED, NEVER COPIED:
   the leads see "3 held: ask the safeguarding lead", and the person who
   may read them provides them (Martin's rule: named people only).

   Collections that are the hub's own workings are never searched.
   ===================================================================== */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { churchOf } from './church-scope.js';

const REGION = 'europe-west2';
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;
const NEVER = new Set(['pastoralReminded', 'raReminded', 'dataExports', 'hqChurches', 'churchSettings', 'dataSettings']);
const WHO_READS = { worries: 'the pastoral team and the safeguarding lead', pastoralVisits: 'the church’s pastoral visitors' };
export const restricted = (c) => WHO_READS[c] || (/^sg[A-Z]/.test(c) ? 'the safeguarding lead and deputy' : '');
/* The fields that name a person, as the hub writes them. */
const BY_MEMBER = ['memberId', 'aboutMemberId', 'personId'];
const BY_MEMBER_LIST = ['memberIds', 'leaderIds', 'by', 'visitorIds', 'people'];
const BY_UID = ['uid', 'userId', 'createdBy'];
const BY_EMAIL = ['email'];

async function assertLead(db, uid) {
  const u = (await db.collection('users').doc(uid).get()).data();
  if (!u || u.status !== 'active') throw new HttpsError('permission-denied', 'Please sign in to the church.');
  if (u.masterAdmin === true) return;
  const leads = ((await db.collection('dataSettings').doc('main').get()).data() || {}).leads || [];
  if (!u.memberId || !leads.includes(u.memberId)) throw new HttpsError('permission-denied', 'Only the data protection leads and master admins use this.');
}

/* Who the person is: their member id, sign-in ids and email addresses. */
export async function personOf(db, d) {
  let memberId = String((d && d.memberId) || '').trim();
  const email = String((d && d.email) || '').trim().toLowerCase();
  if (memberId && !/^[A-Za-z0-9_-]{1,120}$/.test(memberId)) throw new HttpsError('invalid-argument', 'Which person?');
  if (!memberId && email) {
    const q = await db.collection('addressBook').where('email', '==', email).limit(2).get();
    if (q.size > 1) throw new HttpsError('failed-precondition', 'Two people in the address book share that email: choose them by name.');
    if (q.size) memberId = q.docs[0].id;
  }
  if (!memberId && !email) throw new HttpsError('invalid-argument', 'Choose a person, or type their email address.');
  const book = memberId ? await db.collection('addressBook').doc(memberId).get() : null;
  const b = book && book.exists ? book.data() : {};
  const uids = memberId ? (await db.collection('users').where('memberId', '==', memberId).limit(10).get()).docs.map((x) => x.id) : [];
  const emails = [...new Set([email, String(b.email || '').trim().toLowerCase()].filter(Boolean))];
  return { memberId, uids, emails, name: String(b.name || b.fullName || email || memberId) };
}

/* Every registered collection, with the register's words for it. */
async function registered(db) {
  const assets = (await db.collection('infoAssets').get()).docs.map((x) => ({ id: x.id, ...x.data() })).filter((a) => a.archived !== true);
  const out = [{ name: 'Their own records', collections: ['addressBook', 'users'] }];
  for (const a of assets) {
    out.push({ name: String(a.name || a.id), purpose: a.purpose || '', lawfulBasis: a.lawfulBasis || '', retention: a.retention || null,
      collections: (Array.isArray(a.collections) ? a.collections : []).filter((c) => NAME.test(c) && !NEVER.has(c)).slice(0, 50) });
  }
  return out;
}

/* The documents in one collection that name the person (each query 200 at most). */
export async function docsFor(db, c, p) {
  const found = new Map();
  const add = (s) => s.docs.forEach((x) => found.set(x.id, x));
  const col = db.collection(c);
  const asks = [];
  for (const id of [p.memberId, ...p.uids].filter(Boolean)) asks.push(col.doc(id).get().then((x) => { if (x.exists) found.set(x.id, x); }));
  if (p.memberId) {
    for (const f of BY_MEMBER) asks.push(col.where(f, '==', p.memberId).limit(200).get().then(add));
    for (const f of BY_MEMBER_LIST) asks.push(col.where(f, 'array-contains', p.memberId).limit(200).get().then(add));
  }
  for (const u of p.uids) for (const f of BY_UID) asks.push(col.where(f, '==', u).limit(200).get().then(add));
  for (const e of p.emails) for (const f of BY_EMAIL) asks.push(col.where(f, '==', e).limit(200).get().then(add));
  await Promise.all(asks.map((a) => a.catch(() => null)));
  return [...found.values()];
}

const plain = (v) => {
  if (v == null) return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = plain(v[k]); return o; }
  return v;
};

export async function lookUp(db, d, withRecords) {
  const p = await personOf(db, d);
  const assets = await registered(db), seen = new Set(), out = [];
  for (const a of assets) {
    const cols = [];
    for (const c of a.collections) {
      if (seen.has(c)) continue;
      seen.add(c);
      const docs = await docsFor(db, c, p);
      if (!docs.length) continue;
      const who = restricted(c);
      const row = { collection: c, count: docs.length };
      if (who) row.askFor = who;
      else if (withRecords) row.records = docs.map((x) => ({ id: x.id, ...plain(x.data()) }));
      else row.fields = [...new Set(docs.flatMap((x) => Object.keys(x.data() || {})))].sort();
      cols.push(row);
    }
    if (cols.length) out.push({ asset: a.name, purpose: a.purpose, lawfulBasis: a.lawfulBasis, retention: a.retention, collections: cols });
  }
  return { person: { memberId: p.memberId, name: p.name, emails: p.emails, signIns: p.uids.length }, assets: out };
}

export const privacyFind = onCall({ region: REGION, timeoutSeconds: 120 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const db = churchOf(req, getFirestore()).db;
  await assertLead(db, req.auth.uid);
  return lookUp(db, req.data || {}, false);
});

export const privacyExport = onCall({ region: REGION, timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Please sign in.');
  const db = churchOf(req, getFirestore()).db;
  await assertLead(db, req.auth.uid);
  const d = req.data || {};
  const requestId = String(d.requestId || '');
  if (requestId && !(await db.collection('dataRequests').doc(requestId).get()).exists) throw new HttpsError('not-found', 'There is no such data request.');
  const r = await lookUp(db, d, true);
  const at = new Date().toISOString();
  await db.collection('dataExports').add({
    memberId: r.person.memberId, name: r.person.name, requestId, at, by: req.auth.uid,
    counts: r.assets.flatMap((a) => a.collections.map((c) => ({ collection: c.collection, count: c.count, withheld: !!c.askFor })))
  });
  return Object.assign({ madeAt: at, requestId }, r);
});
