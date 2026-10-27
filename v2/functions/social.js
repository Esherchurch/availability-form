/* ===================================================================
   EGBC — the social posts' morning reminder (comms window; FINDINGS-comms
   plan H, step 1)
   ===================================================================

   Each morning at 7, London time: if the card maker is switched on and
   there is a post to make today - a countdown's post saved for today
   (socialPosts), or the verse of the day when the church has it on - the
   people who asked for a reminder (socialSettings/main.remind, each ticked
   by the person themselves) get one short email: "Today's posts are
   ready", with the card maker's link. Nobody is reminded who did not ask;
   nothing is sent when there is nothing to post.

   Through the hub's ordinary email path (public-mail.js makeSender: the
   mail route, Church HQ's Resend), so every protection applies there too -
   known addresses only, never anyone under 18 (under18.js).

     runSocialMorning({ db, send, now })   the work, for the checks
     socialMorning                          the 7am timer
   =================================================================== */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { makeSender } from './public-mail.js';
import { featureOn } from './features.js';
import { under18Emails } from './under18.js';
import { SENDING_SECRETS } from './resend-secrets.js';
import { hubUrl } from './notify.js';
import { isOfficeIn, officeTeams } from './comms-office.js';
import { eachChurch } from './church-scope.js';

const REGION = 'europe-west2';
/* The hub's web address: one church setting, churchSettings/details.hubUrl
   (main's hubUrl in notify.js, EGBC's address the default), without its
   last "/". Every e-news link and email takes it from there. */
const hubOf = async db => (await hubUrl(db)).replace(/\/+$/, '');
const londonDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function runSocialMorning({ db, send, now = new Date(), hub }) {
  if (!(await featureOn(db, 'cardMaker'))) return { off: true };
  hub = hub || await hubOf(db);
  const day = londonDay(now);
  const [setDoc, posts] = await Promise.all([
    db.collection('socialSettings').doc('main').get(),
    db.collection('socialPosts').where('date', '==', day).get()
  ]);
  const set = setDoc.exists ? setDoc.data() : {};
  const ready = posts.docs.map(d => d.data()).filter(p => p.status !== 'posted');
  const items = ready.map(p => p.title || p.opening || 'A post');
  if (set.vod && set.vod.on === true && set.vodDone !== day) items.push('Verse of the day');
  const who = Array.isArray(set.remind) ? set.remind.slice(0, 20) : [];
  if (!items.length || !who.length) return { day, items: items.length, sent: 0 };
  const minors = await under18Emails(db);
  const church = (await db.collection('churchSettings').doc('details').get()).data() || {};
  let sent = 0;
  const officeT = await officeTeams(db);
  for (const uid of who) {
    const u = await db.collection('users').doc(String(uid)).get();
    const p = u.exists ? u.data() : {};
    const office = isOfficeIn(p, officeT);
    const email = String(p.email || '').trim().toLowerCase();
    if (!office || !email || minors.has(email)) continue;
    const html = '<p>Good morning' + (p.name ? ' ' + esc(String(p.name).split(/\s+/)[0]) : '') + ',</p>' +
      '<p>Today’s ' + (items.length === 1 ? 'post is' : items.length + ' posts are') + ' ready to share:</p><ul>' + items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>' +
      /* No hub address (never expected): the words without the link. */
      (hub ? '<p><a href="' + hub + '/cardmaker.html">Open the card maker</a>' : '<p>Open the card maker') + ': each has its picture and caption, ready to copy, share or download.</p>' +
      '<p style="color:#6b7280;font-size:13px">You asked for this reminder in the card maker. Untick “Email me each morning” there to stop it.</p>';
    const r = await send({ to: [email], subject: 'Today’s posts are ready', html, replyTo: church.enquiryEmail || '' }, { source: 'social', kind: 'social reminder' });
    if (r && r.ok) sent++;
  }
  return { day, items: items.length, sent };
}

export const socialMorning = onSchedule({ region: REGION, schedule: '0 7 * * *', timeZone: 'Europe/London', retryCount: 0, secrets: SENDING_SECRETS }, async () => {
  /* Church by church (batch 8). */
  await eachChurch(getFirestore(), (ch) => runSocialMorning({ db: ch.db, send: makeSender({ db: ch.db }) }));
});
