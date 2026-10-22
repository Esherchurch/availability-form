/* ===================================================================
   THE SAFEGUARDING RISK REGISTER, step 3: live warnings (F-265) - the sums
   ===================================================================
   Pure: given one site's counts (gathered by sg-warnings.js), say what has
   slipped, as COUNTS, DATES AND A LINK - never a name, a child, a concern
   or a medical detail. Group and event names are the church's own words
   for its activities, not people.

   warningsFrom(d) -> { items: [{ id, kind, level, label, todo, count, date,
                         fix, act }], controls: { 'actId|kind' | '*|kind': level } }
     kind: 'ratio' | 'twoAdults' | 'checks' | 'consent' | 'signoff' | 'review'
     level: 'red' | 'amber'
   twoAdultsMails(d) -> [{ key, subject, lines, fix }] - sessions two days on
     still short of two adults (or of the ratio): Martin, 22 Oct.
   =================================================================== */
'use strict';
const Safeguarding = require('./safeguarding-core.cjs');

const DAY = 864e5;
const dayMs = (d) => Date.parse(String(d).slice(0, 10) + 'T12:00:00Z');
const plus = (d, n) => new Date(dayMs(d) + n * DAY).toISOString().slice(0, 10);
const daysTo = (from, to) => Math.round((dayMs(to) - dayMs(from)) / DAY);
const s = (n, one, many) => n === 1 ? one : many;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function fmt(d) { const x = new Date(dayMs(d)); return DAYS[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MONTHS[x.getUTCMonth()]; }
const TODO = {
  twoAdults: 'Find a second adult before the session goes on.',
  ratio: 'Bring in another leader, or limit the places.',
  checks: 'Record the new check or training on Safeguarding.',
  consent: 'Ask the families to renew their consent form.',
  signoff: 'Finish the assessment and ask the safeguarding lead or deputy to sign it off.',
  review: 'Look at each one and set a new review date.'
};
const WORSE = { red: 2, amber: 1 };

/* d: { today, settings: { ratioAll, ratioUnder8, dbsYears, trainingYears, dueSoonDays },
        activities: [{ id, link: { type, id } }],
        groups: [{ id, name, ratio, leaderIds }], childrenIn: { g: n }, leadersIn: { g: n },
        events: [{ id, title, day, children, leaders, needsSignoff, signedOff }],
        leaderMids: [mid], checks: { mid: leaderChecks doc }, consent: [{ groupId, consentUntil }],
        risks: [{ id, activityId, reviewDue, status }] } */
function warningsFrom(d) {
  const st = d.settings || {}, today = d.today, soonDays = st.dueSoonDays || 42, items = [], controls = {};
  const actFor = (type, id) => ((d.activities || []).find((a) => a.link && a.link.type === type && a.link.id === id) || {}).id || '';
  const add = (it) => {
    it.todo = TODO[it.kind] || ''; items.push(it);
    const key = (it.act || '*') + '|' + it.kind;
    if (!controls[key] || WORSE[it.level] > WORSE[controls[key]]) controls[key] = it.level;
  };

  /* 1. Sunday groups today: children in against leaders in */
  (d.groups || []).forEach((g) => {
    const c = (d.childrenIn || {})[g.id] || 0, l = (d.leadersIn || {})[g.id] || 0, per = +g.ratio || +st.ratioAll || 5;
    if (!c) return;
    const need = Math.max(2, Math.ceil(c / per)), act = actFor('kidsGroup', g.id);
    if (l < 2) add({ id: 'two_' + g.id, kind: 'twoAdults', level: 'red', count: l, date: today, fix: 'kids-checkin.html', act,
      label: g.name + ', today: ' + c + ' ' + s(c, 'child', 'children') + ' in, ' + l + ' ' + s(l, 'leader', 'leaders') + ' in. Two adults are needed at all times.' });
    else if (l < need) add({ id: 'ratio_' + g.id, kind: 'ratio', level: 'amber', count: need - l, date: today, fix: 'kids-checkin.html', act,
      label: g.name + ', today: ' + c + ' children in, ' + l + ' leaders in; ' + need + ' needed (1 to ' + per + ').' });
  });

  /* 2. under-18s events in the next 14 days: named leaders, the ratio, two adults, sign-off */
  (d.events || []).forEach((e) => {
    const t = daysTo(today, e.day), when = e.title + ', ' + fmt(e.day), fix = 'safeguarding.html?event=' + encodeURIComponent(e.id);
    if (t < 0 || t > 14) return;
    const r = Safeguarding.ratio({ children: e.children || 0, under8: 0, leaders: e.leaders || 0, ratioAll: st.ratioAll || 5, ratioUnder8: st.ratioUnder8 || 4 });
    if ((e.leaders || 0) < 2) add({ id: 'two_' + e.id, kind: 'twoAdults', level: t <= 2 ? 'red' : 'amber', count: e.leaders || 0, date: e.day, fix, act: '',
      label: when + ': ' + (e.leaders || 0) + ' ' + s(e.leaders || 0, 'leader', 'leaders') + ' named. Two adults are needed.' });
    else if (e.children && !r.ok) add({ id: 'ratio_' + e.id, kind: 'ratio', level: t <= 2 ? 'red' : 'amber', count: r.short, date: e.day, fix, act: '',
      label: when + ': ' + e.children + ' booked, ' + e.leaders + ' leaders named; ' + r.need + ' needed (1 to ' + (st.ratioAll || 5) + ').' });
    if (e.needsSignoff && !e.signedOff) add({ id: 'sign_' + e.id, kind: 'signoff', level: t <= 7 ? 'red' : 'amber', count: 1, date: e.day, fix, act: '',
      label: when + ': waiting for safeguarding sign-off. Bookings stay closed until then.' });
  });

  /* 3. checks: leaders on under-18s groups and events (counts only) */
  const runOut = [], soon = [], until = plus(today, soonDays);
  const addY = (dt, y) => { const x = new Date(String(dt).slice(0, 10) + 'T12:00:00Z'); x.setUTCFullYear(x.getUTCFullYear() + y); return x.toISOString().slice(0, 10); };
  [...new Set(d.leaderMids || [])].forEach((mid) => {
    const c = (d.checks || {})[mid] || null, k = Safeguarding.checkStatus(c, { dbsYears: st.dbsYears || 3, trainingYears: st.trainingYears || 3 }, today);
    if (!k.ok) { runOut.push(mid); return; }
    const first = [addY(c.dbsSeen, st.dbsYears || 3), addY(c.trainingDate, st.trainingYears || 3)].sort()[0];
    if (first <= until) soon.push(mid);
  });
  if (runOut.length) add({ id: 'checks_out', kind: 'checks', level: 'red', count: runOut.length, date: today, fix: 'safeguarding.html', act: '',
    label: runOut.length + ' ' + s(runOut.length, 'leader', 'leaders') + ' on under-18s groups and events ' + s(runOut.length, 'has a check or training that is missing or has run out.', 'have a check or training that is missing or has run out.') });
  if (soon.length) add({ id: 'checks_soon', kind: 'checks', level: 'amber', count: soon.length, date: until, fix: 'safeguarding.html', act: '',
    label: soon.length + ' ' + s(soon.length, 'leader’s check or training runs', 'leaders’ checks or training run') + ' out within ' + Math.round(soonDays / 7) + ' weeks.' });
  /* and on each group whose own leaders include one */
  (d.groups || []).forEach((g) => {
    const act = actFor('kidsGroup', g.id); if (!act) return;
    if ((g.leaderIds || []).some((m) => runOut.includes(m))) { const key = act + '|checks'; controls[key] = 'red'; }
    else if ((g.leaderIds || []).some((m) => soon.includes(m)) && controls[act + '|checks'] !== 'red') controls[act + '|checks'] = 'amber';
  });

  /* 4. consent: registered children, per group */
  const byGroup = {};
  (d.consent || []).forEach((c) => {
    const b = byGroup[c.groupId] = byGroup[c.groupId] || { out: 0, soon: 0 };
    if (!c.consentUntil || c.consentUntil < today) b.out++; else if (c.consentUntil <= until) b.soon++;
  });
  (d.groups || []).forEach((g) => {
    const b = byGroup[g.id]; if (!b) return;
    const act = actFor('kidsGroup', g.id);
    if (b.out) add({ id: 'consent_' + g.id, kind: 'consent', level: 'red', count: b.out, date: today, fix: 'kids-admin.html', act,
      label: g.name + ': ' + b.out + ' ' + s(b.out, 'child has', 'children have') + ' no current consent form.' });
    if (b.soon) add({ id: 'consentsoon_' + g.id, kind: 'consent', level: 'amber', count: b.soon, date: until, fix: 'kids-admin.html', act,
      label: g.name + ': ' + b.soon + ' consent ' + s(b.soon, 'form runs', 'forms run') + ' out within ' + Math.round(soonDays / 7) + ' weeks.' });
  });

  /* 5. the register's own reviews */
  const late = (d.risks || []).filter((r) => r.status !== 'closed' && r.reviewDue && r.reviewDue < today);
  if (late.length) add({ id: 'review', kind: 'review', level: 'amber', count: late.length, date: today, fix: 'safeguarding-risk.html', act: '',
    label: late.length + ' ' + s(late.length, 'risk is', 'risks are') + ' past ' + s(late.length, 'its', 'their') + ' review date.' });

  items.sort((a, b) => WORSE[b.level] - WORSE[a.level] || String(a.date).localeCompare(String(b.date)));
  return { items, controls };
}

/* TWO DAYS BEFORE (Martin, 22 Oct): a session still short of two adults (or of
   the ratio) emails the site's lead and deputy, once. Under-18s events by
   their named leaders; Sunday groups meeting that day by their regular
   leaders (the hub does not hold who is due at a given Sunday ahead of time).
   d: { day, settings, events: [as above, that day], groups: [{ id, name, day (0-6), leaderIds }], sent: { key: true } } */
function twoAdultsMails(d) {
  const st = d.settings || {}, out = [], wd = new Date(dayMs(d.day)).getUTCDay();
  (d.events || []).forEach((e) => {
    if (e.day !== d.day) return;
    const r = Safeguarding.ratio({ children: e.children || 0, under8: 0, leaders: e.leaders || 0, ratioAll: st.ratioAll || 5, ratioUnder8: st.ratioUnder8 || 4 });
    const two = (e.leaders || 0) < 2, short = e.children && !r.ok;
    if (!two && !short) return;
    const key = 'ev_' + e.id + '_' + d.day; if ((d.sent || {})[key]) return;
    out.push({ key, subject: 'Still short of leaders: ' + e.title + ', ' + fmt(e.day),
      lines: [e.title + ' on ' + fmt(e.day) + ' has ' + (e.leaders || 0) + ' ' + s(e.leaders || 0, 'leader', 'leaders') + ' named' + (e.children ? ' for ' + e.children + ' booked' : '') + '.',
        two ? 'Two adults are needed at all times.' : r.need + ' leaders are needed at 1 to ' + (st.ratioAll || 5) + '.', 'Name more leaders on the event’s safeguarding page.'],
      fix: 'safeguarding.html?event=' + encodeURIComponent(e.id) });
  });
  (d.groups || []).forEach((g) => {
    /* a Sunday group's day is 1-7, Monday to Sunday (kids-admin.html): 7 is Sunday, JavaScript's 0 */
    if (g.day == null || (+g.day % 7) !== wd || (g.leaderIds || []).length >= 2) return;
    const key = 'kg_' + g.id + '_' + d.day; if ((d.sent || {})[key]) return;
    out.push({ key, subject: 'Still short of leaders: ' + g.name + ', ' + fmt(d.day),
      lines: [g.name + ' meets on ' + fmt(d.day) + ' with ' + (g.leaderIds || []).length + ' regular ' + s((g.leaderIds || []).length, 'leader', 'leaders') + '.', 'Two adults are needed at all times.', 'Add a second leader to the group, or make sure one is on the rota that day.'],
      fix: 'kids-admin.html' });
  });
  return out;
}

module.exports = { warningsFrom, twoAdultsMails, fmt, plus, daysTo };
