/* ===================================================================
   EGBC — a members' meeting's papers, for members without a hub account
   (comms window; the mailings plan, section 3.3; the main window's note
   of 21 Oct in FINDINGS-comms)
   ===================================================================

   Many members have no hub account, so the members' meeting email gives
   each of them their own link to the papers. Members who have an account
   keep the ordinary link: the meeting's page on the hub, where they sign in.

   AT SEND (enews-send.js, through paperLinksFor and personalise here):
     - an email whose members-only "See the agenda and minutes" button
       points at church-meeting.html?meeting=<id> (the members' meeting
       starter makes it so);
     - each church member it goes to who has no hub account gets that
       address swapped for their own: meetingPapers?t=<token>;
     - the token is random and kept only as its SHA-256
       (meetingPaperLinks/<hash>: the meeting, the person, the expiry);
     - it expires 30 days after the meeting (the end of that day, London).

   meetingPapers (public, GET):
     ?t=<token>          a plain page: the meeting, and its papers
     ?t=<token>&f=<n>    paper n, from Storage (churchMeetings/<id>/papers/…)
   Refused: an unknown token (404), an expired one (410), and anyone no
   longer a church member, archived, or under 18 (403). No public file
   address exists; nothing is cached; search engines are told to keep out.

     runPapers({ db, bucket, query, now })   the work, for the checks
     paperLinksFor / personalise              for enews-send.js
     meetingPapers                            the function
   =================================================================== */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createHash, randomBytes } from 'node:crypto';
import { under18Emails } from './under18.js';
/* A church's link says which church (H-5); no entry is EGBC. */
import { codeHash, indexCode, dbForCode } from './hq-codes.js';

const REGION = 'europe-west2';
const DAYS = 30;
const sha = t => createHash('sha256').update(String(t)).digest('hex');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* The end of the meeting's day in London, plus 30 days, in ms. */
export function expiryOf(date, days = DAYS) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return 0;
  const end = Date.parse(date + 'T23:59:59Z') + days * 86400000;
  /* London is UTC or an hour ahead: the later of the two never cuts it short. */
  return end;
}

/* The meeting this email links to, from its blocks (the starter's button). */
export function meetingIdOf(issue) {
  for (const b of (issue && issue.blocks) || []) {
    const m = /\/church-meeting\.html\?meeting=([A-Za-z0-9_-]{1,80})$/.exec(String((b && b.url) || ''));
    if (b && b.type === 'button' && m) return m[1];
  }
  return '';
}

/* Before the send: the meeting, its expiry, and who has a hub account. */
export async function paperLinksFor(db, issue, now = Date.now()) {
  const mid = meetingIdOf(issue);
  if (!mid) return null;
  const m = await db.collection('churchMeetings').doc(mid).get();
  if (!m.exists) return null;
  const expires = expiryOf(m.data().date);
  if (!expires || now > expires) return null;
  const users = await db.collection('users').where('status', '==', 'active').get();
  const memberIds = new Set(), emails = new Set();
  users.docs.forEach(d => { const u = d.data(); if (u.memberId) memberIds.add(String(u.memberId)); if (u.email) emails.add(String(u.email).trim().toLowerCase()); });
  return { meetingId: mid, expires, hasAccount: p => memberIds.has(String(p.id || '').replace(/^ab_/, '')) || emails.has(String(p.email || '').toLowerCase()) };
}

/* One person's copy: a member without an account gets their own link. */
export async function personalise(db, links, person, html, o = {}) {
  if (!links || !person.member || links.hasAccount(person)) return html;
  const token = randomBytes(24).toString('base64url');
  await db.collection('meetingPaperLinks').doc(sha(token)).set({
    meetingId: links.meetingId, personId: String(person.id || '').replace(/^ab_/, ''), email: String(person.email || '').toLowerCase(),
    expires: links.expires, issueId: o.issueId || '', createdAt: new Date().toISOString()
  });
  await indexCode(db, 'papers', codeHash(token), { expires: links.expires });
  const mine = String(o.fnBase || '') + '/meetingPapers?t=' + token;
  return String(html).replace(new RegExp('https?://[^"\'\\s<>]*/church-meeting\\.html\\?meeting=' + links.meetingId + '(?=["\'\\s<>])', 'g'), mine);
}

/* A page in the church's plain style. */
function page(title, body, church) {
  return '<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' + esc(title) + '</title>' +
    '<style>body{font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;color:#1f2937;margin:0;padding:24px 16px}main{max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08)}' +
    'h1{font-size:22px;margin:0 0 6px;color:#3d6263}p{line-height:1.5}.m{color:#6b7280;font-size:14px}ul{list-style:none;padding:0;margin:16px 0 0}li{margin:0 0 10px}' +
    'a.p{display:block;padding:14px 16px;border:1px solid #d1d5db;border-radius:10px;color:#1f2937;text-decoration:none;font-weight:bold}a.p:hover{border-color:#3d6263}</style></head><body><main>' +
    (church ? '<p class="m" style="margin:0 0 8px">' + esc(church) + '</p>' : '') + '<h1>' + esc(title) + '</h1>' + body + '</main></body></html>';
}
const longDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).replace(',', '');

export async function runPapers({ db, bucket, query = {}, now = Date.now() }) {
  const church = ((await db.collection('churchSettings').doc('details').get()).data() || {}).name || '';
  const no = (status, title, words) => ({ status, type: 'text/html; charset=utf-8', body: page(title, '<p>' + words + '</p>', church) });
  const t = String(query.t || '');
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return no(404, 'This link isn\u2019t right', 'Please use the link in your email, or ask the church office.');
  const link = await db.collection('meetingPaperLinks').doc(sha(t)).get();
  if (!link.exists) return no(404, 'This link isn\u2019t right', 'Please use the link in your email, or ask the church office.');
  const L = link.data();
  if (!(now <= (+L.expires || 0))) return no(410, 'This link has expired', 'Links to a meeting\u2019s papers last 30 days after the meeting. Please ask the church office for a copy, or sign in to the hub.');
  /* Still a church member: the tick, not archived, not under 18. */
  const p = await db.collection('addressBook').doc(String(L.personId || '_')).get();
  const P = p.exists ? p.data() : {};
  const minors = await under18Emails(db);
  if (!p.exists || P.churchMember !== true || P.archived === true || P.under18 === true || P.isMinor === true || minors.has(String(P.email || L.email || '').toLowerCase()))
    return no(403, 'For church members', 'These papers are for church members. Please ask the church office.');
  const m = await db.collection('churchMeetings').doc(String(L.meetingId)).get();
  if (!m.exists) return no(404, 'This meeting isn\u2019t there any more', 'Please ask the church office.');
  const M = m.data(), papers = Array.isArray(M.papers) ? M.papers : [];
  /* A church's papers are in its own folder (H-5); EGBC's where they were. */
  const prefix = (db.churchId ? 'churches/' + db.churchId + '/' : '') + 'churchMeetings/' + m.id + '/papers/';
  if (query.f !== undefined && query.f !== '') {
    const n = parseInt(query.f, 10), pp = papers[n];
    if (!pp || !/^\d{1,3}$/.test(String(query.f)) || !String(pp.path || '').startsWith(prefix) || /\.\./.test(pp.path)) return no(404, 'That paper isn\u2019t there', 'It may have been taken down. Please go back to the list.');
    const file = bucket.file(pp.path);
    const [meta] = await file.getMetadata().catch(() => [null]);
    if (!meta) return no(404, 'That paper isn\u2019t there', 'It may have been taken down. Please go back to the list.');
    const [buf] = await file.download();
    const name = String(pp.name || 'paper').replace(/[^A-Za-z0-9 ._()-]+/g, '-').slice(0, 120);
    const type = /^(application\/pdf|image\/[a-z0-9.+-]+)$/.test(meta.contentType || '') ? meta.contentType : 'application/octet-stream';
    return { status: 200, type, body: buf, filename: name };
  }
  const when = [M.date ? longDate(M.date) : '', M.time || ''].filter(Boolean).join(', ') + (M.place ? ' \u00b7 ' + M.place : '');
  const list = papers.length
    ? '<ul>' + papers.map((pp, i) => '<li><a class="p" href="?t=' + encodeURIComponent(t) + '&amp;f=' + i + '">' + esc(pp.name || 'Paper ' + (i + 1)) + '</a></li>').join('') + '</ul>'
    : '<p>No papers yet. They will appear here when the church office adds them: this link keeps working until ' + esc(new Date(L.expires).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })) + '.</p>';
  return { status: 200, type: 'text/html; charset=utf-8', body: page(M.title || 'Church members\u2019 meeting', '<p><strong>' + esc(when) + '</strong></p>' + list +
    '<p class="m">Your own link, for you alone: please don\u2019t pass it on. It lasts 30 days after the meeting.</p>', church) };
}

export const meetingPapers = onRequest({ region: REGION, invoker: 'public', cors: false }, async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
  if (req.method !== 'GET') return res.status(405).send('');
  try {
    const root = getFirestore();
    const r = await runPapers({ db: await dbForCode(root, 'papers', codeHash(String((req.query || {}).t || ''))), bucket: getStorage().bucket(), query: req.query || {} });
    res.status(r.status).type(r.type);
    if (r.filename) res.set('Content-Disposition', 'inline; filename="' + r.filename + '"');
    return res.send(r.body);
  } catch (e) {
    return res.status(500).type('text/plain').send('Something went wrong. Please try again, or ask the church office.');
  }
});
