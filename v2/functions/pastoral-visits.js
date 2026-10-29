/* =====================================================================
   PASTORAL VISITS: the follow-up reminder (F-308; Martin, 27 Oct 2026)
   ---------------------------------------------------------------------
   pastoral-visits.html keeps the visits (pastoralVisits/{id}); only the
   church's named, trained visitors read them (pastoralSettings/main
   visitorIds) - never the office, and a master admin only when named.

   pastoralFollowUps, every day at 08:30: a visit whose follow-up date
   has come and is not marked done tells the visitors who made it, if
   they are still on the list. Once per visit and date
   (pastoralReminded/{visitId_date}, server only). The email says only
   that a follow-up is due, with the link: never who, never the note -
   an inbox is not the place for pastoral records.

   With no hub address nothing is sent, and the log says why.
   ===================================================================== */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { makeSender } from './public-mail.js';
import { hubUrl } from './notify.js';
import { eachChurch } from './church-scope.js';
import { usesPart } from './parts.js';

const REGION = 'europe-west2';
const londonDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* The work, with what it needs passed in, so a check can run it on any day. */
export async function runPastoralFollowUps({ db, send, now, hub }) {
  const visitors = ((await db.collection('pastoralSettings').doc('main').get()).data() || {}).visitorIds || [];
  if (!visitors.length) return { sent: [], skipped: 'no visitors named' };
  if (!hub) { console.error('Pastoral follow-ups: the hub has no address yet, so nothing was sent.'); return { error: 'no hub address', sent: [] }; }
  const today = londonDay(now || new Date()), sent = [];
  const due = await db.collection('pastoralVisits').where('followUp', '<=', today).limit(500).get();
  for (const d of due.docs) {
    const v = d.data() || {};
    if (!v.followUp || v.followUpDone === true) continue;
    const mark = db.collection('pastoralReminded').doc(d.id + '_' + v.followUp);
    if ((await mark.get()).exists) continue;
    const to = [];
    for (const mid of (v.by || []).filter((m) => visitors.includes(m)).slice(0, 10)) {
      const a = (await db.collection('addressBook').doc(String(mid)).get()).data();
      if (a && a.email) to.push(String(a.email).trim().toLowerCase());
    }
    const link = hub.replace(/\/+$/, '') + '/pastoral-visits.html';
    const r = to.length ? await send({
      to: [...new Set(to)],
      subject: 'A pastoral follow-up is due',
      html: '<p>A follow-up you planned after a pastoral visit is due' + (v.followUp < today ? ' (it was due on ' + esc(v.followUp) + ')' : ' today') + '.</p>'
        + '<p>The details are in the hub, for the church’s visitors only:</p>'
        + '<p><a href="' + esc(link) + '">' + esc(link) + '</a></p>'
    }, { source: 'pastoral', kind: 'pastoral-follow-up', ref: d.id }) : { ok: false, error: 'nobody to tell' };
    await mark.set({ at: new Date().toISOString(), count: to.length, ok: !!(r && r.ok), error: (r && r.error) || '' });
    sent.push({ id: d.id, to: to.length, ok: !!(r && r.ok) });
  }
  return { sent };
}

export const pastoralFollowUps = onSchedule({ region: REGION, schedule: '30 8 * * *', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  await eachChurch(getFirestore(), async (ch) => {
    /* A church that has switched Care and prayer off is sent nothing. */
    if (!(await usesPart(ch.db, 'care'))) return;
    const r = await runPastoralFollowUps({ db: ch.db, send: makeSender({ db: ch.db }), now: new Date(), hub: await hubUrl(ch.db) });
    if (r.sent.length || r.error) console.log('pastoralFollowUps', ch.id || 'top', JSON.stringify(r));
  });
});
