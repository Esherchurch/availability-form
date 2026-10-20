/* ===================================================================
   EGBC — building compliance: the daily run (Stage 3; F-233)
   ===================================================================

   Every morning at 7, for each building that has been set up:

     1. THE COLOUR, for the room bookings screen (complianceStatus/<site>):
        { rag, counts, safetyJobs, at } - a colour and numbers only, so the
        people who look after bookings see a warning without seeing the
        checks. It never blocks or cancels a booking.
     2. REMINDERS to each check's responsible people, by email:
          due soon   when it turns amber (its own window: weekly 2 days,
                     monthly 8, yearly 30)
          overdue    when it turns red
        Each once per due date (complianceReminders/<check>__<due>__<kind>).
     3. On the 1st of the month, A SUMMARY of everything amber or red to the
        office (Church office), the trustees (Elders) and master admins.

   Due dates and colours come from THE engine - the very file the pages use,
   copied in by tools/sync-compliance.mjs (a test fails if it differs).

   ONLY WHILE THE CHURCH USES THE ADD-ON: functions/features.js, the same
   answer as EGBCAuth.uses('buildingCompliance') on the pages (F-239). Off,
   the run does nothing at all - no colour, no email, no marker.

   The events window's file. Exported from index.js.
   =================================================================== */

import { createRequire } from 'node:module';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { makeSender } from './public-mail.js';
import { hubUrl } from './notify.js';
import { featureOn as switchOn } from './features.js';

const require = createRequire(import.meta.url);
const E = require('./compliance-engine.cjs');
const S = require('./compliance-store.cjs');

const REGION = 'europe-west2';
const londonDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const words = (ymd) => { const [y, m, d] = String(ymd).split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; };
const okMail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ''));
const GUIDANCE = 'These checks are guidance to help you. Your trustees remain responsible for your building’s safety.';

/* The one answer, page and server (functions/features.js; F-239). */
export async function featureOn(db) {
  return switchOn(db, 'buildingCompliance');
}

/* The work, with what it needs passed in, so a test can run it on any day. */
export async function runCompliance({ db, send, today }) {
  today = today || londonDay(new Date());
  if (!(await featureOn(db))) return { off: true, status: [], sent: [] };
  const all = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
  const templates = all(await db.collection('complianceTemplates').get());
  const profiles = all(await db.collection('buildingProfiles').get());
  const sites = {}; all(await db.collection('sites').get()).forEach((s) => { sites[s.id] = s; });
  const hub = await hubUrl(db);
  const status = [], sent = [], summary = [];
  const book = {};
  const person = async (mid) => {
    if (!(mid in book)) { const d = await db.collection('addressBook').doc(mid).get(); book[mid] = d.exists ? d.data() : null; }
    return book[mid];
  };

  for (const p of profiles) {
    const siteId = p.siteId || p.id;
    if (!sites[siteId] || sites[siteId].active === false) continue;
    const b = await S.load(db, siteId);
    const r = E.schedule({ profile: b.profile, templates, checks: b.checks, records: b.records, jobs: b.jobs, triggers: b.triggers, today });
    const row = { siteId, rag: r.rag, counts: r.counts, safetyJobs: r.safetyJobs.length, at: new Date().toISOString() };
    await db.collection('complianceStatus').doc(siteId).set(row);
    status.push(row);
    const name = sites[siteId].name || siteId;
    summary.push({ siteId, name, rag: r.rag, items: r.items.filter((i) => i.rag === 'red' || i.rag === 'amber'), jobs: r.safetyJobs });

    for (const it of r.items) {
      if (it.state !== 'on' || !it.nextDue || !(it.responsibleIds || []).length) continue;
      const kind = it.rag === 'red' && it.nextDue < today ? 'overdue' : it.rag === 'amber' ? 'soon' : '';
      if (!kind) continue;
      const mark = db.collection('complianceReminders').doc((it.id + '__' + it.nextDue + '__' + kind).replace(/\//g, '_'));
      if ((await mark.get()).exists) continue;
      const to = [];
      for (const mid of it.responsibleIds) { const x = await person(mid); if (x && !x.archived && okMail(x.email)) to.push(String(x.email).toLowerCase()); }
      const subject = (kind === 'overdue' ? 'Overdue: ' : 'Due soon: ') + it.title + ' (' + name + ')';
      const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:600px">' +
        '<p>' + (kind === 'overdue' ? 'This building check was due on <strong>' + esc(words(it.nextDue)) + '</strong> and is not recorded yet:' : 'This building check is due on <strong>' + esc(words(it.nextDue)) + '</strong>:') + '</p>' +
        '<p style="font-size:17px"><strong>' + esc(it.title) + '</strong><br>' + esc(name) + ' · ' + esc(it.basisLabel || '') + '</p>' +
        (it.note ? '<p>' + esc(it.note) + '</p>' : '') +
        '<p><a href="' + esc(hub + 'building.html') + '" style="background:#3d6263;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Record it done</a></p>' +
        '<p style="font-size:12px;color:#6b7280">' + esc(GUIDANCE) + '</p></div>';
      const out = to.length ? await send({ to, subject, html }, { source: 'compliance', kind: 'compliance ' + kind, checkId: it.id }) : { ok: false, error: 'no address' };
      await mark.set({ checkId: it.id, siteId, kind, due: it.nextDue, to: to.length, at: new Date().toISOString(), ok: !!(out && out.ok), error: (out && out.error) || '' });
      sent.push({ checkId: it.id, kind, to, ok: !!(out && out.ok) });
    }
  }

  /* The monthly summary: the office, the trustees and master admins. */
  if (today.slice(8) === '01') {
    const mark = db.collection('complianceReminders').doc('summary__' + today.slice(0, 7));
    if (!(await mark.get()).exists) {
      const users = all(await db.collection('users').where('status', '==', 'active').get())
        .filter((u) => u.masterAdmin === true || (u.teams || []).includes('Church office') || (u.teams || []).includes('Elders'));
      const to = [];
      for (const u of users) { const x = u.memberId ? await person(u.memberId) : null; if (x && !x.archived && okMail(x.email)) to.push(String(x.email).toLowerCase()); }
      const uniq = [...new Set(to)];
      const html = '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:640px">' +
        '<h1 style="font-size:20px">Building checks: ' + esc(MONTHS[+today.slice(5, 7) - 1]) + '</h1>' +
        summary.map((s) => '<h2 style="font-size:17px;margin:16px 0 4px">' + esc(s.name) + ': ' + (s.rag === 'red' ? 'something is overdue' : s.rag === 'amber' ? 'something is due soon' : 'everything in date') + '</h2>' +
          (s.items.length ? '<ul>' + s.items.map((i) => '<li>' + (i.rag === 'red' ? '<strong>Overdue</strong>' : 'Due soon') + ': ' + esc(i.title) + ' (' + esc(i.basisLabel || '') + ')' + (i.nextDue ? ', ' + esc(words(i.nextDue)) : '') + '</li>').join('') + '</ul>' : '') +
          (s.jobs.length ? '<p>Open safety jobs: ' + s.jobs.length + '</p>' : '')).join('') +
        '<p><a href="' + esc(hub + 'compliance.html') + '">Open Building compliance</a></p><p style="font-size:12px;color:#6b7280">' + esc(GUIDANCE) + '</p></div>';
      const out = uniq.length ? await send({ to: uniq, subject: 'Building checks: the monthly summary', html }, { source: 'compliance', kind: 'compliance summary' }) : { ok: false, error: 'no address' };
      await mark.set({ kind: 'summary', month: today.slice(0, 7), to: uniq.length, at: new Date().toISOString(), ok: !!(out && out.ok) });
      sent.push({ kind: 'summary', to: uniq, ok: !!(out && out.ok) });
    }
  }
  return { off: false, status, sent };
}

export const complianceDaily = onSchedule({ region: REGION, schedule: '0 7 * * *', timeZone: 'Europe/London', retryCount: 1 }, async () => {
  const db = getFirestore();
  await runCompliance({ db, send: makeSender({ db }) });
});
