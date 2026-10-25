/* ===================================================================
   THE SAFEGUARDING RISK REGISTER, step 3: live warnings (F-265) - the sums
   ===================================================================
   Pure: given one site's counts (gathered by sg-warnings.js), say what has
   slipped, as COUNTS, DATES AND A LINK - never a name, a child, a concern
   or a medical detail. Group and event names are the church's own words
   for its activities, not people.

   warningsFrom(d) -> { items: [{ id, kind, level, label, todo, count, date,
                         fix, act }], controls: { 'actId|kind' | '*|kind': level } }
     kind: 'ratio' | 'twoAdults' | 'checks' | 'consent' | 'signoff' | 'review' | 'hirerDocs'
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
  review: 'Look at each one and set a new review date.',
  hirerDocs: 'Ask them for their safeguarding policy, and add it to their hirer record.',
  paedFirstAid: 'Find a trained paediatric first aider to go with the group.',
  mixedLeaders: 'Find a leader so there is a man and a woman with the group, or say why not.',
  insurance: 'Check the public liability cover with the insurer, and record the amount.'
};
const WORSE = { red: 2, amber: 1 };

/* d: { today, settings: { ratioAll, ratioUnder8, dbsYears, trainingYears, dueSoonDays },
        activities: [{ id, link: { type, id } }],
        groups: [{ id, name, ratio, leaderIds }], childrenIn: { g: n }, leadersIn: { g: n },
        events: [{ id, title, day, children, leaders, needsSignoff, signedOff }],
        leaderMids: [mid], checks: { mid: leaderChecks doc }, consent: [{ groupId, consentUntil }],
        risks: [{ id, activityId, reviewDue, status }],
        hirers: [{ withChildren, documents: [{ kind, expires }], booked }] - booked: a hire in the next 30 days } */
/* the paediatric first aider (the checklist's paedFirstAid): "No: ..." is a flag - amber, red when under-8s go */
function paedLevel(answers, flags) { return /^No\b/i.test(String((answers || {}).paedFirstAid || '').trim()) ? ((flags || {}).under8 ? 'red' : 'amber') : ''; }

/* a safeguarding policy on file that has not run out (one with no expiry date counts, as on the Hirers page) */
function hirerPolicyOk(h, today) { return (h.documents || []).some((x) => x && x.kind === 'safeguarding' && (!x.expires || String(x.expires).slice(0, 10) >= today)); }

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
    /* the checklist says no trained paediatric first aider is going: amber, red when under-8s go (Martin, 23 Oct) */
    if (e.paed) add({ id: 'paed_' + e.id, kind: 'paedFirstAid', level: e.paed, count: 1, date: e.day, fix, act: '',
      label: when + ': no trained paediatric first aider with the group' + (e.paed === 'red' ? ', and children under 8 are going.' : '.') });
    /* the checklist's other flags (F-280 (b) and (d)): words only, never anyone's sex */
    (e.flags || []).forEach((f) => add({ id: f.id + '_' + e.id, kind: f.id, level: f.level, count: 1, date: e.day, fix, act: '', label: when + ': ' + f.words.charAt(0).toLowerCase() + f.words.slice(1) + '.' }));
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

  /* 5. hirers who work with children, booked in the next 30 days, with no safeguarding policy in date (counts only) */
  const hirersShort = (d.hirers || []).filter((h) => h.withChildren === true && h.booked && !hirerPolicyOk(h, today)).length;
  if (hirersShort) add({ id: 'hirers', kind: 'hirerDocs', level: 'amber', count: hirersShort, date: today, fix: 'bookings-admin.html', act: '',
    label: hirersShort + ' ' + s(hirersShort, 'hirer who works with children is', 'hirers who work with children are') + ' booked in the next 30 days with no safeguarding policy in date on file.' });

  /* 6. the register's own reviews */
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

/* ===================================================================
   STEP 4: THE DIALS (F-265 part B) - the sums
   ===================================================================
   dialsFrom(d) -> { dials: { checks, sessions, consent, assess, review,
     incidents }, sessions: [...], consentByGroup: [...] }
   Each dial: { value, of, pct, rag, parts, why }. rag is 'green' | 'amber'
   | 'red', 'none' (nothing on file yet: an empty dial at 0, said in words)
   or 'unread' (could not be read: never a zero). COUNTS ONLY: group names
   are the church's words for its activities; never a person, a child, an
   incident's words or a concern. Concerns are not counted on any dial.
   =================================================================== */
/* the church-wide annual review's items (the page's list is
   egbc-sg-templates.js REVIEW_ITEMS; the unit test checks they match) */
const REVIEW_ITEMS = [
  { id: 'leads', who: 'lead' }, { id: 'register', who: 'lead' }, { id: 'policy', who: 'lead' },
  { id: 'adopted', who: 'trustee' }, { id: 'trusteeTraining', who: 'trustee' }, { id: 'recruitment', who: 'lead' },
  { id: 'hirers', who: 'lead', optional: true }, { id: 'return', who: 'either', optional: true }
];
/* green at or above g, amber at or above a, else red (percentages); for
   incidents, a count where lower is better: green at or below g, amber at or below a */
const DIAL_DEFAULTS = { checks: { g: 95, a: 85 }, sessions: { g: 95, a: 85 }, consent: { g: 95, a: 85 }, assess: { g: 100, a: 80 }, incidents: { g: 0, a: 2 } };
function thresholds(st) {
  const set = ((st || {}).dials) || {}, out = {};
  Object.keys(DIAL_DEFAULTS).forEach((k) => {
    const x = set[k] || {}, d = DIAL_DEFAULTS[k], num = (v, f) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : f);
    const g = num(x.g, d.g), a = num(x.a, d.a);
    /* amber can't be stricter than green */
    out[k] = k === 'incidents' ? { g, a: Math.max(a, g) } : { g, a: Math.min(a, g) };
  });
  return out;
}
const pctOf = (v, of) => (of ? Math.floor((v / of) * 100) : null);
function byPct(v, of, t) { if (!of) return 'none'; const p = (v / of) * 100; return p >= t.g ? 'green' : p >= t.a ? 'amber' : 'red'; }

/* the year's review: records [{ itemId, at (ISO), na }] this year;
   lastYear: the same for last year. Overdue a year after last year's review. */
function reviewFrom({ records, lastYear, today }) {
  const got = {}, last = {};
  (records || []).forEach((r) => { if (REVIEW_ITEMS.some((i) => i.id === r.itemId)) got[r.itemId] = r; });
  const na = REVIEW_ITEMS.filter((i) => i.optional && got[i.id] && got[i.id].na).map((i) => i.id);
  const apply = REVIEW_ITEMS.filter((i) => na.indexOf(i.id) < 0);
  const done = apply.filter((i) => got[i.id]).length, of = apply.length;
  (lastYear || []).forEach((r) => { last[r.itemId] = r; });
  const lastAt = Object.values(last).map((r) => String(r.at || '').slice(0, 10)).filter(Boolean).sort().pop() || '';
  const due = lastAt ? plus(lastAt, 365) : '';
  const status = done === of ? 'done' : (due && today > due) ? 'overdue' : done ? 'underway' : 'notstarted';
  return { done, of, na, status, due, items: REVIEW_ITEMS.map((i) => ({ id: i.id, done: !!got[i.id], na: na.indexOf(i.id) >= 0, at: got[i.id] ? String(got[i.id].at || '').slice(0, 10) : '' })),
    rag: status === 'done' ? 'green' : status === 'overdue' ? 'red' : 'amber' };
}

/* d: { today, settings: { dbsYears, trainingYears, dueSoonDays, ratioAll, dials },
        leaderMids, checks: { mid: leaderChecks }, groups: [{ id, name, ratio }],
        sessions: [{ groupId, day, children, leaders }] (the last 8 weeks, today too),
        consent: [{ groupId, consentUntil }], assess: [{ signed }], review (reviewFrom),
        incidents: [{ created: 'YYYY-MM-DD', followed: bool }], unread: { dialKey: why } } */
function dialsFrom(d) {
  const st = d.settings || {}, t = thresholds(st), today = d.today, until = plus(today, st.dueSoonDays || 42), unread = d.unread || {}, dials = {};
  const names = {}; (d.groups || []).forEach((g) => { names[g.id] = g; });
  const put = (k, x) => { dials[k] = unread[k] ? { value: null, of: null, pct: null, rag: 'unread', parts: {}, why: String(unread[k]).slice(0, 160) } : x; };

  /* 1. leaders with in-date checks (a DBS check and training) */
  const parts = { ok: 0, soon: 0, out: 0 };
  [...new Set(d.leaderMids || [])].forEach((mid) => {
    const c = (d.checks || {})[mid] || null, k = Safeguarding.checkStatus(c, { dbsYears: st.dbsYears || 3, trainingYears: st.trainingYears || 3 }, today);
    if (!k.ok) { parts.out++; return; }
    const addY = (dt, y) => { const x = new Date(String(dt).slice(0, 10) + 'T12:00:00Z'); x.setUTCFullYear(x.getUTCFullYear() + y); return x.toISOString().slice(0, 10); };
    const first = [addY(c.dbsSeen, st.dbsYears || 3), addY(c.trainingDate, st.trainingYears || 3)].sort()[0];
    if (first <= until) parts.soon++; else parts.ok++;
  });
  const cOf = parts.ok + parts.soon + parts.out, cIn = parts.ok + parts.soon;
  put('checks', { value: cIn, of: cOf, pct: pctOf(cIn, cOf), rag: byPct(cIn, cOf, t.checks), parts });

  /* 2. sessions with enough leaders (and two adults), the last 8 weeks */
  const sess = (d.sessions || []).filter((x) => x.children > 0 && names[x.groupId]).map((x) => {
    const per = +names[x.groupId].ratio || +st.ratioAll || 5, need = Math.max(2, Math.ceil(x.children / per));
    return { group: String(names[x.groupId].name || 'A group').slice(0, 80), day: x.day, children: x.children, leaders: x.leaders, need, ok: x.leaders >= need };
  }).sort((a, b) => b.day.localeCompare(a.day) || a.group.localeCompare(b.group));
  const sOk = sess.filter((x) => x.ok).length;
  put('sessions', { value: sOk, of: sess.length, pct: pctOf(sOk, sess.length), rag: byPct(sOk, sess.length, t.sessions), parts: { ok: sOk, short: sess.length - sOk } });

  /* 3. children with a current consent form (registered children) */
  const cp = { ok: 0, soon: 0, out: 0 }, per = {};
  (d.consent || []).forEach((c) => {
    const k = !c.consentUntil || c.consentUntil < today ? 'out' : c.consentUntil <= until ? 'soon' : 'ok';
    cp[k]++;
    const g = per[c.groupId] = per[c.groupId] || { group: (names[c.groupId] || {}).name || 'Not in a group', ok: 0, soon: 0, out: 0 };
    g[k]++;
  });
  const kOf = cp.ok + cp.soon + cp.out, kIn = cp.ok + cp.soon;
  put('consent', { value: kIn, of: kOf, pct: pctOf(kIn, kOf), rag: byPct(kIn, kOf, t.consent), parts: cp });

  /* 4. event assessments signed off (events in the next 60 days that need one) */
  const aOf = (d.assess || []).length, aOk = (d.assess || []).filter((x) => x.signed).length;
  put('assess', { value: aOk, of: aOf, pct: pctOf(aOk, aOf), rag: byPct(aOk, aOf, t.assess), parts: { ok: aOk, waiting: aOf - aOk } });

  /* 5. the annual review (church-wide) */
  const r = d.review || { done: 0, of: 0, rag: 'amber', status: 'notstarted' };
  put('review', { value: r.done, of: r.of, pct: pctOf(r.done, r.of), rag: r.of ? r.rag : 'none', parts: { done: r.done, left: r.of - r.done }, status: r.status });

  /* 6. incident follow-ups open: this year's incidents with no follow-up after 7 days (a count, lower is better) */
  const year = today.slice(0, 4), inc = (d.incidents || []).filter((x) => String(x.created || '').slice(0, 4) === year);
  const open = inc.filter((x) => !x.followed && daysTo(x.created, today) >= 7);
  const oldest = open.length ? Math.max(...open.map((x) => daysTo(x.created, today))) : 0;
  put('incidents', { value: open.length, of: inc.length, pct: null, rag: open.length <= t.incidents.g ? 'green' : open.length <= t.incidents.a ? 'amber' : 'red', parts: { open: open.length, followed: inc.length - open.length }, oldestDays: oldest });

  return { dials, sessions: sess.slice(0, 500), consentByGroup: Object.values(per).sort((a, b) => String(a.group).localeCompare(String(b.group))).slice(0, 500) };
}

module.exports = { warningsFrom, twoAdultsMails, fmt, plus, daysTo, dialsFrom, reviewFrom, thresholds, REVIEW_ITEMS, DIAL_DEFAULTS, hirerPolicyOk, paedLevel };
