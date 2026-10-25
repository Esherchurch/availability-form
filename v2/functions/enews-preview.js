/* ===================================================================
   EGBC — "Preview web version": a draft's public copy at an unguessable
   link, to share before it is sent (comms window; Martin, 21 Oct 2026:
   Share to WhatsApp with the newsletter link working now, before going
   live)
   ===================================================================

     enewsPreviewWeb  callable, the church office: { issueId, html }
                      -> { token, url }

   The page sends EVERYBODY ELSE'S copy of the draft (egbc-mailblocks.js
   render, version 'everyone' - never the members-only blocks). It is kept
   in enewsPreview/<token>: anyone with the link may read that one document
   (never list them: firestore.rules), nobody writes it from a page.
   enews-web.html?preview=<token> shows it, marked "Preview: not sent yet".

   - ONE LINK PER ISSUE: pressing it again updates the same document, so a
     link already shared shows the draft as it is now.
   - NEVER THE MEMBERS-ONLY BLOCKS: the server also checks - it refuses the
     copy if any members-only block's words, links or names are in it.
   - ONLY A PUBLIC ISSUE: the weekly e-news, or an email to subscribers -
     never one to church members, a team or people picked (they have no
     public web version), and never one already sent or sending.
   - WHEN IT IS SENT the preview points at the real web version
     (enews-send.js: sentIssueId), so a shared link keeps working.

     runPreview({ db, uid, data, hub })   the work, for the checks
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { featureOn } from './features.js';
import { hubUrl } from './notify.js';

const REGION = 'europe-west2';
/* The hub's web address: one church setting, churchSettings/details.hubUrl
   (main's hubUrl in notify.js, EGBC's address the default), without its
   last "/". Every e-news link and email takes it from there. */
const hubOf = async db => (await hubUrl(db)).replace(/\/+$/, '');
const PLACEHOLDER = '{{unsubscribe_url}}';
const MEMBERS_ONLY_ROOMS = ['CMM'];

/* The same rule as egbc-mailblocks.js membersOnly. */
export function membersOnly(b) {
  if (!b || typeof b !== 'object') return false;
  if (b.members === true) return true;
  if (b.type !== 'meeting') return false;
  return b.members !== false || MEMBERS_ONLY_ROOMS.indexOf(String(b.room || '')) >= 0;
}
const plain = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();

/* What a members-only block would show: its words (in pieces, so a
   restyled sentence is still found), its links and its names. */
export function leaks(blocks, html) {
  const text = plain(html).toLowerCase(), raw = String(html || '');
  const found = [];
  (blocks || []).forEach((b, i) => {
    if (!membersOnly(b) || b.hidden === true) return;
    /* Line by line: a single line copied out of the block is still found. */
    const lines = h => String(h || '').replace(/<\/(p|li|h2|h3|div)>|<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    const htmls = [b.html].concat((b.items || []).map(x => x && x.html), (b.cols || []).map(c => c && c.html));
    const words = [b.title, b.text, b.label, b.when, b.caption].concat((b.items || []).map(x => x && x.title), htmls.map(lines));
    const pieces = [];
    words.forEach(w => String(w || '').split(/[.!?\n]+/).forEach(s => { s = s.replace(/\s+/g, ' ').trim().toLowerCase(); if (s.length >= 12) pieces.push(s.slice(0, 80)); }));
    const inner = [];
    htmls.forEach(h => (String(h || '').match(/href\s*=\s*["'][^"']+["']/gi) || []).forEach(a => inner.push(a.replace(/^href\s*=\s*["']|["']$/gi, ''))));
    const links = [b.url, b.link, b.buttonUrl, b.imageUrl].concat(inner).filter(u => /^https?:\/\//.test(String(u || '')));
    if (pieces.some(s => text.includes(s)) || links.some(u => raw.includes(u) || raw.includes(String(u).replace(/&/g, '&amp;')))) found.push(i);
  });
  /* Members-only WORDS inside a block (<span data-members="1">: the Zoom
     ID and passcode in a card, a private link in Sunday's words). */
  (blocks || []).forEach((b, i) => {
    if (!b || b.hidden === true || found.includes(i)) return;
    const htmls = [b.html].concat((b.cols || []).map(c => c && c.html), (b.items || []).map(x => x && x.html)).map(h => String(h || ''));
    const bits = [], hrefs = [];
    htmls.forEach(h => {
      const re = /<span\b[^>]*data-members\s*=\s*["']?1[^>]*>([\s\S]*?)<\/span>/gi; let m;
      while ((m = re.exec(h))) {
        const w = plain(m[1]).toLowerCase(); if (w.length >= 6) bits.push(w.slice(0, 80));
        (m[1].match(/href\s*=\s*["']([^"']+)["']/gi) || []).forEach(a => hrefs.push(a.replace(/^href\s*=\s*["']|["']$/gi, '')));
      }
    });
    if (bits.some(w => text.includes(w)) || hrefs.some(u => /^https?:\/\//.test(u) && (raw.includes(u) || raw.includes(u.replace(/&/g, '&amp;'))))) found.push(i);
  });
  return found;
}

export async function runPreview({ db, uid, data = {}, hub }) {
  if (!uid) return { error: 'unauthenticated', message: 'Sign in first.' };
  hub = hub || await hubOf(db);
  const me = await db.collection('users').doc(String(uid)).get();
  const p = me.exists ? me.data() : {};
  if (!(p.status === 'active' && (p.masterAdmin === true || (p.teams || []).includes('Church office')))) return { error: 'permission-denied', message: 'For the church office.' };
  if (!(await featureOn(db, 'enews'))) return { error: 'failed-precondition', message: 'The e-news is switched off for this church.' };
  const id = String(data.issueId || '');
  const doc = /^[A-Za-z0-9_-]{1,80}$/.test(id) ? await db.collection('enewsIssues').doc(id).get() : null;
  if (!doc || !doc.exists) return { error: 'not-found', message: 'That e-news is not there.' };
  const x = doc.data();
  if (!['draft', 'scheduled'].includes(x.status || 'draft')) return { error: 'failed-precondition', message: 'It has been sent: share its web version instead.' };
  if (x.kind === 'oneoff' && (x.audience || 'subscribers') !== 'subscribers') return { error: 'failed-precondition', message: 'An email to church members, a team or people picked has no public web version.' };
  const html = String(data.html || '').slice(0, 900000);
  if (html.length < 200 || !/<html/i.test(html)) return { error: 'invalid-argument', message: 'Nothing to preview yet.' };
  const bad = leaks(x.blocks, html);
  if (bad.length) return { error: 'failed-precondition', message: 'That copy has members-only words in it, so it is not shared (block ' + bad.map(i => i + 1).join(', ') + ').' };
  /* One preview per issue: the same link, now showing the draft as it is. */
  const prev = await db.collection('enewsPreview').where('issueId', '==', id).limit(1).get();
  const token = prev.empty ? randomBytes(18).toString('base64url') : prev.docs[0].id;
  const url = hub + '/enews-web.html?preview=' + token;
  await db.collection('enewsPreview').doc(token).set({
    issueId: id, subject: String(x.subject || '').slice(0, 200), preview: true, sentIssueId: '',
    /* Its "View this email in your browser" is this preview until it is sent. */
    html: html.split(PLACEHOLDER).join(hub + '/enews-signup.html').split('{{first_name}}').join('friend')
      .replace(new RegExp('https?://[^"\'\\s<>]*/enews-web\\.html\\?issue=' + id + '(?=["\'\\s<>])', 'g'), url),
    updatedAt: new Date().toISOString(), updatedBy: String(uid)
  });
  return { token, url };
}

export const enewsPreviewWeb = onCall({ region: REGION }, async (req) => {
  const r = await runPreview({ db: getFirestore(), uid: req.auth && req.auth.uid, data: req.data || {} });
  if (r.error) throw new HttpsError(r.error, r.message);
  return r;
});
