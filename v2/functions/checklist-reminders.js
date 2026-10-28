/* ===================================================================
   EGBC — checklist reminders (R11; F-188)
   ===================================================================

   Every morning at 8, each checklist task that has someone named and a
   due date (days before its event), and is not ticked, gets ONE email to
   that person:

     the day before it is due   "Due tomorrow: Chairs out (Harvest supper)"
     the day after it was due   "Overdue: Chairs out (Harvest supper)"

   Each is sent once (checklistReminders/{event}_{task}_{kind}, written by
   this job only). Ticked, or the person or due date taken off, it stops.
   Dates are London dates: the event's own day, minus the task's days.

   The events window's file. Exported from index.js.
   =================================================================== */

import crypto from 'node:crypto';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { makeSender } from './public-mail.js';
import { hubUrl } from './notify.js';
import { eachChurch } from './church-scope.js';

const REGION = 'europe-west2';
const londonDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
export function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); }
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function words(ymd) { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d)); return DAYS[t.getUTCDay()] + ' ' + d + ' ' + MONTHS[m - 1]; }
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* A task's own id: its words, who and when, so moving it up the list does
   not make it a new task and send again. */
export function taskId(t) { return crypto.createHash('sha1').update([t.text, t.who, t.dueDays].join('|')).digest('hex').slice(0, 12); }

/* The work, with what it needs passed in, so a test can run it on any day. */
export async function runChecklistReminders({ db, send, now }) {
  const today = londonDay(now || new Date()), sent = [];
  const from = (now || new Date()).getTime() - 3 * 864e5, to = (now || new Date()).getTime() + 120 * 864e5;
  /* By the EVENTS' own dates (a moved event moves its tasks), then each
     one's checklist. */
  const evs = await db.collection('calEvents').where('startUtc', '>=', from).where('startUtc', '<=', to).get();
  const hub = await hubUrl(db);
  for (const evDoc of evs.docs) {
    const doc = await db.collection('eventChecklists').doc(evDoc.id).get();
    if (!doc.exists) continue;
    const c = doc.data(), ev = evDoc.data();
    if (ev.status === 'cancelled') continue;
    const evDay = String(ev.startLocal || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(evDay)) continue;
    for (const t of (c.tasks || [])) {
      if (typeof t !== 'object' || !t.who || t.done || t.dueDays === null || t.dueDays === undefined || t.dueDays === '') continue;
      const due = addDays(evDay, -Number(t.dueDays));
      const kind = today === addDays(due, -1) ? 'tomorrow' : today === addDays(due, 1) ? 'overdue' : '';
      if (!kind) continue;
      const mark = db.collection('checklistReminders').doc(doc.id + '_' + taskId(t) + '_' + kind);
      if ((await mark.get()).exists) continue;
      const person = await db.collection('addressBook').doc(t.who).get();
      const email = person.exists ? String(person.data().email || '').trim() : '';
      const first = String((person.exists && person.data().name) || t.whoName || '').split(/\s+/)[0];
      const subject = (kind === 'tomorrow' ? 'Due tomorrow: ' : 'Overdue: ') + t.text + ' (' + (ev.title || 'event') + ')';
      const html = '<p>Dear ' + escHtml(first || 'friend') + ',</p>' +
        '<p>' + (kind === 'tomorrow' ? 'A reminder: this is due <strong>tomorrow, ' + escHtml(words(due)) + '</strong>' : 'This was due on <strong>' + escHtml(words(due)) + '</strong> and is not ticked off yet') +
        ', for <strong>' + escHtml(ev.title || 'the event') + '</strong> on ' + escHtml(words(evDay)) + ':</p>' +
        '<p style="font-size:16px"><strong>' + escHtml(t.text) + '</strong>' + (t.note ? '<br>' + escHtml(t.note) : '') + '</p>' +
        '<p>Done it? Ask an organiser to tick it off, or tick it yourself: <a href="' + escHtml(hub + 'events-admin.html') + '">Events</a>.</p>';
      const r = email ? await send({ to: [email], subject, html }, { source: 'checklist', kind: 'checklist ' + kind, ref: doc.id }) : { ok: false, error: 'no address' };
      await mark.set({ calEventId: doc.id, task: t.text, who: t.who, kind, due, at: new Date().toISOString(), ok: !!(r && r.ok), error: (r && r.error) || '' });
      sent.push({ calEventId: doc.id, task: t.text, kind, to: email, ok: !!(r && r.ok) });
    }
  }
  return sent;
}

export const checklistReminders = onSchedule({ region: REGION, schedule: '0 8 * * *', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  await eachChurch(getFirestore(), ({ db }) => runChecklistReminders({ db, send: makeSender({ db }), now: new Date() }));
});
