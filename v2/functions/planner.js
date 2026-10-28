/* ===================================================================
   EGBC — the session planner's email (F-223; Martin, 16 Oct)
   ===================================================================

   "Each plan to ALL the group's leaders whether on or not (so they know
   what was done last week), plus that week's team; via the server."

     planSend   callable, a leader of the plan's group: { sessionId }
                -> { sent, to }   one email per person, built here from the
                   saved plan (the page never sends its own HTML)

   Who: every leader of the group (planGroups.leaderIds), that week's team
   (planSessions.onIds), and the group's own email list (planGroups.emails),
   each address once. Shut on the live site until switch-over, like team
   mail (payments-gate.js PAYMENTS_LIVE): until the rules are locked, a
   plan could have been written by anybody.
   =================================================================== */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { paymentsShut } from './payments-gate.js';
import { makeSender } from './public-mail.js';
import { hubUrl } from './notify.js';
import { churchOf } from './church-scope.js';

const REGION = 'europe-west2';
const db = () => getFirestore();
const EMULATOR = !!process.env.FUNCTIONS_EMULATOR;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const okMail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ''));

async function shut() {
  if (paymentsShut()) return true;
  if (!EMULATOR) return false;
  const c = await db().collection('teamMailSettings').doc('config').get();
  return !!(c.exists && c.data().shutForTest === true);
}

const SHOW = { verses: 'Bible verses', video: 'Video', youtube: 'YouTube', picture: 'Picture', song: 'Song', memory: 'Memory verse', timer: 'Timer',
  text: 'Text', quiz: 'Quiz', pptx: 'PowerPoint', link: 'Link' };
function showLine(s) {
  const what = SHOW[s.type] || s.type;
  const detail = s.ref || s.name || s.title || s.label || s.words || (s.questions ? s.questions.length + ' questions' : '') || (s.seconds ? Math.round(s.seconds / 60) + ' min' : '');
  return what + (detail ? ': ' + String(detail).slice(0, 80) : '');
}
function day(d) {
  const [y, m, dd] = String(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/* The plan as an email: the same order as the print. */
export function planEmail({ group, s, names, link, church }) {
  const who = (ids) => (ids || []).map(i => names[i] || '').filter(Boolean).join(', ');
  const bring = [].concat(...(s.parts || []).map(p => p.bring || [])).filter(Boolean);
  const h = [];
  h.push('<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:640px">');
  h.push('<p style="color:#6b7280;margin:0">' + esc(group.name) + ' · ' + esc(day(s.date)) + '</p>');
  h.push('<h1 style="font-size:22px;margin:4px 0 8px">' + esc(s.special === 'none' ? 'No session this week' : (s.title || 'Session plan')) + '</h1>');
  if (s.special && s.special !== 'none') h.push('<p><b>' + esc(s.special) + '</b></p>');
  if (s.lessonCode || s.programme) h.push('<p>' + esc([s.programme, s.lessonCode].filter(Boolean).join(' ')) + (s.lessonLink ? ' · <a href="' + esc(s.lessonLink) + '">Open the lesson</a>' : '') + '</p>');
  if (s.passage && s.passage.ref) {
    h.push('<p><b>' + esc(s.passage.ref) + (s.passage.version ? ' (' + esc(s.passage.version) + ')' : '') + '</b></p>');
    if (s.passage.text) h.push('<p style="font-family:Georgia,serif">' + esc(String(s.passage.text).slice(0, 3000)) + '</p>');
    if (s.passage.copyright) h.push('<p style="font-size:12px;color:#6b7280">' + esc(s.passage.copyright) + '</p>');
  }
  if ((s.onIds || []).length) h.push('<p><b>On this week:</b> ' + esc(who(s.onIds)) + '</p>');
  if ((s.awayIds || []).length) h.push('<p><b>Away:</b> ' + esc(who(s.awayIds)) + '</p>');
  if (bring.length) h.push('<p><b>Things to bring:</b> ' + esc(bring.join(', ')) + '</p>');
  (s.parts || []).forEach((p, i) => {
    h.push('<h2 style="font-size:17px;margin:16px 0 4px">' + (i + 1) + '. ' + esc(p.title || p.kind || 'Part') + (p.minutes ? ' <span style="font-weight:normal;color:#6b7280">· ' + (+p.minutes) + ' min</span>' : '') + '</h2>');
    if (p.notes) h.push('<p style="white-space:pre-wrap;margin:0 0 6px">' + esc(p.notes) + '</p>');
    if ((p.show || []).length) h.push('<p style="margin:0 0 6px;color:#374151">On screen: ' + esc(p.show.map(showLine).join(' · ')) + '</p>');
    if ((p.files || []).length) h.push('<p style="margin:0 0 6px;color:#374151">Files: ' + p.files.map(f => f.url ? '<a href="' + esc(f.url) + '">' + esc(f.name || 'file') + '</a>' : esc(f.name || 'file')).join(', ') + '</p>');
    if ((p.links || []).length) h.push('<p style="margin:0 0 6px">' + p.links.map(l => '<a href="' + esc(l.url || l) + '">' + esc(l.label || l.url || l) + '</a>').join(' · ') + '</p>');
  });
  h.push('<p style="margin-top:18px"><a href="' + esc(link) + '" style="background:#3d6263;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open the plan</a></p>');
  h.push('<p style="font-size:12px;color:#6b7280">Sent from ' + esc(church || 'the church') + "'s hub to " + esc(group.name) + "'s leaders and this week's team.</p></div>");
  return h.join('');
}

export const planSend = onCall({ region: REGION }, async (req) => {
  const D = churchOf(req, db()).db;
  const uid = req.auth && req.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in.');
  if (await shut()) throw new HttpsError('failed-precondition', 'Plans are emailed once the hub goes live.');
  const sid = String((req.data || {}).sessionId || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(sid)) throw new HttpsError('invalid-argument', 'Which plan?');
  const me = (await D.collection('users').doc(uid).get()).data() || {};
  if (me.status && me.status !== 'active') throw new HttpsError('permission-denied', 'Your account is not active.');
  const s = (await D.collection('planSessions').doc(sid).get()).data();
  if (!s) throw new HttpsError('not-found', 'That plan could not be found.');
  const group = (await D.collection('planGroups').doc(String(s.groupId)).get()).data();
  if (!group) throw new HttpsError('not-found', 'That plan\'s group could not be found.');
  /* The group's leaders send it, and master admins (who edit any group's plans; Martin, 19 Oct). */
  if ((group.leaderIds || []).indexOf(String(me.memberId || '-')) < 0 && me.masterAdmin !== true) throw new HttpsError('permission-denied', 'Only the group\'s leaders send its plans.');

  const ids = Array.from(new Set([...(group.leaderIds || []), ...(s.onIds || []), ...(s.awayIds || [])])).slice(0, 200);
  const names = {}, emails = {};
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const snap = await D.collection('addressBook').where('__name__', 'in', chunk).get();
    snap.docs.forEach(d => { const x = d.data() || {}; names[d.id] = String(x.name || '').trim(); if (okMail(x.email) && !x.archived) emails[d.id] = String(x.email).toLowerCase(); });
  }
  /* Every leader (on or not), this week's team, and the group's own list - each address once. */
  const to = Array.from(new Set([...(group.leaderIds || []), ...(s.onIds || [])].map(i => emails[i]).filter(Boolean)
    .concat((group.emails || []).map(e => String(e).toLowerCase()).filter(okMail))));
  if (!to.length) throw new HttpsError('failed-precondition', 'Nobody in this group has an email address in the address book.');
  const church = ((await D.collection('churchSettings').doc('details').get()).data() || {}).name || '';
  const link = (await hubUrl(D)) + 'session-planner.html?s=' + encodeURIComponent(sid);
  const subject = group.name + ', ' + day(s.date) + ': ' + (s.special === 'none' ? 'no session' : (s.title || 'the plan'));
  const html = planEmail({ group, s, names, link, church });
  const send = makeSender({ db: D });
  let sent = 0;
  for (const addr of to) {
    const out = await send({ to: [addr], subject: subject.slice(0, 150), html, replyTo: String(me.email || '') }, { kind: 'session plan', planSessionId: sid, groupId: s.groupId, by: uid });
    if (out && out.ok) sent++;
  }
  return { sent, to: to.length };
});
