/* ===================================================================
   EGBC — building compliance: THE schedule engine (Stage 1; F-230)
   ===================================================================

   ONE FUNCTION, USED EVERYWHERE. A building's answers (its profile), the
   templates, the church's own copies of the checks and what has been
   recorded go in; the list of checks, each with its next due date and its
   colour, comes out. Due dates are worked out HERE and nowhere else - the
   pages, the server's reminders (Stage 3) and the tests all call this.

   Works in a page (window.EGBCCompliance) and in node (module.exports),
   so the server can use the very same file.

     EGBCCompliance.applies(template, profile)          -> true / false
     EGBCCompliance.nextDue(every, doneOn, certExpiry)  -> 'YYYY-MM-DD' | null
     EGBCCompliance.reconcile(profile, templates, checks)
                    -> { add: [template], remove: [check], restore: [check] }
     EGBCCompliance.schedule({ profile, templates, checks, records,
                    followUps, triggers, today, amberDays })
                    -> { items: [...], rag, counts }
     EGBCCompliance.register({ rooms, roomKinds, equipment, guide })
                    -> [{ roomId, kind, has, missing, rag }]

   Plain words only, and no regulation numbers: the templates say what to
   do, never which law says so (any reference lives in FINDINGS).
   =================================================================== */
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.EGBCCompliance = make();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---- dates (UTC, days only) ---- */
  function day(s) { var p = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { var d = day(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
  function addMonths(s, n) {
    var d = day(s), dd = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(dd, last));
    return iso(d);
  }
  function between(a, b) { return Math.round((day(b) - day(a)) / 864e5); }

  /* ---- does a template apply to this building? ----
     when: [] (every building) | [term, term, ...] all of which must hold,
     where a term is 'flag', '!flag', 'type=house', or 'a|b' (any one). */
  function term(t, p) {
    if (Array.isArray(t)) return t.some(function (x) { return term(x, p); });
    t = String(t);
    if (t.indexOf('|') >= 0) return t.split('|').some(function (x) { return term(x, p); });
    if (t.charAt(0) === '!') return !term(t.slice(1), p);
    var eq = t.indexOf('=');
    if (eq > 0) return String(p[t.slice(0, eq)] || '') === t.slice(eq + 1);
    return p[t] === true;
  }
  function applies(tpl, profile) {
    var w = tpl && tpl.when;
    if (!w || !w.length) return true;
    return w.every(function (t) { return term(t, profile || {}); });
  }

  /* ---- the next due date: FROM THE DAY IT WAS DONE, not the day it was due ----
     every: { n, unit: 'week' | 'month' | 'year' | 'once' | 'demand' }
     A certificate's own expiry, where given, is the next due date instead. */
  function nextDue(every, doneOn, certExpiry) {
    if (certExpiry) return String(certExpiry).slice(0, 10);
    if (!doneOn) return null;
    var e = every || {}, n = +e.n || 1;
    if (e.unit === 'week') return addDays(doneOn, 7 * n);
    if (e.unit === 'month') return addMonths(doneOn, n);
    if (e.unit === 'year') return addMonths(doneOn, 12 * n);
    return null;   // 'once' and 'demand': not again on a clock
  }

  /* ---- the building's answers changed: which copies to add, remove, restore ----
     A removed check keeps its history: it is marked removed, never deleted. */
  function reconcile(profile, templates, checks) {
    var have = {}, out = { add: [], remove: [], restore: [] };
    (checks || []).forEach(function (c) { if (c.templateId) have[c.templateId] = c; });
    (templates || []).forEach(function (t) {
      if (t.kind === 'link' || t.retired) return;
      var c = have[t.id], yes = applies(t, profile);
      if (yes && !c) out.add.push(t);
      else if (yes && c && c.state === 'removed') out.restore.push(c);
      else if (!yes && c && c.state !== 'removed') out.remove.push(c);
    });
    return out;
  }

  /* ---- THE SCHEDULE ----
     checks:    the church's copies { id, templateId, title, area, every,
                state ('on' | 'off' | 'removed'), responsibleIds, legal, ... }
     records:   what was done { checkId, doneOn, certExpiry }
     jobs:      THE MAINTENANCE JOBS (maintJobs; Martin, 19 Oct: one list, never
                two). A follow-up action raised on a check IS a job carrying
                checkId. { id, siteId, roomId, checkId, safety, due, status
                ('todo' | 'done') }. ONLY A SAFETY JOB CHANGES A COLOUR: open
                = amber, past due = red; any other job leaves it alone.
     triggers:  on-demand events { kind ('buildingWork'), on }
     -> items, each with lastDone, nextDue, rag:
          green  in date
          amber  due within amberDays (30), or never recorded yet
          red    overdue, or an open safety job for it past its due date
          grey   switched off, removed, or not applicable */
  function schedule(o) {
    o = o || {};
    var today = o.today || iso(new Date()), amberDays = o.amberDays == null ? 30 : +o.amberDays;
    var byCheck = {};
    (o.records || []).forEach(function (r) {
      if (!r || !r.checkId || !r.doneOn) return;
      var cur = byCheck[r.checkId];
      if (!cur || String(r.doneOn) > String(cur.doneOn)) byCheck[r.checkId] = r;
    });
    var open = {}, safetyOpen = [];
    (o.jobs || []).forEach(function (j) {
      if (!j || j.status === 'done') return;
      if (j.checkId) (open[j.checkId] = open[j.checkId] || []).push(j);
      if (j.safety) safetyOpen.push(j);
    });
    var triggers = (o.triggers || []).slice().sort(function (a, b) { return String(b.on).localeCompare(String(a.on)); });
    var items = (o.checks || []).map(function (c) {
      var last = byCheck[c.id] || null, every = c.every || {}, it = {
        id: c.id, templateId: c.templateId || '', title: c.title, area: c.area || '', every: every, legal: !!c.legal,
        state: c.state || 'on', responsibleIds: c.responsibleIds || [], lastDone: last ? String(last.doneOn).slice(0, 10) : null,
        nextDue: null, rag: 'grey', why: ''
      };
      if (it.state !== 'on') { it.why = it.state === 'off' ? 'Switched off' + (c.offReason ? ': ' + c.offReason : '') : 'No longer applies'; return it; }
      if (every.unit === 'demand') {
        /* Not on a clock: due only when what it waits for happens (e.g. building work), until done after it. */
        var t = triggers.filter(function (x) { return !every.trigger || x.kind === every.trigger; })[0];
        if (!t || (it.lastDone && it.lastDone >= String(t.on).slice(0, 10))) { it.rag = 'green'; it.why = t ? 'Done since the last ' + (every.triggerWords || 'time it was needed') : 'Only when needed'; return it; }
        it.nextDue = addDays(String(t.on).slice(0, 10), amberDays);
      } else {
        it.nextDue = nextDue(every, it.lastDone, last && last.certExpiry);
        if (every.unit === 'once' && it.lastDone) { it.rag = 'green'; it.why = 'Done, and kept'; }
      }
      if (it.rag !== 'green') {
        if (!it.nextDue && !it.lastDone) { it.rag = 'amber'; it.why = 'Not recorded yet'; }
        else if (it.nextDue < today) { it.rag = 'red'; it.why = 'Overdue since ' + it.nextDue; }
        else if (between(today, it.nextDue) <= amberDays) { it.rag = 'amber'; it.why = 'Due ' + it.nextDue; }
        else { it.rag = 'green'; it.why = 'Next due ' + it.nextDue; }
      }
      var late = (open[c.id] || []).filter(function (f) { return f.safety && f.due && String(f.due) < today; });
      if (late.length) { it.rag = 'red'; it.why = late.length + ' safety job' + (late.length === 1 ? '' : 's') + ' from this check overdue'; }
      it.openActions = (open[c.id] || []).length;
      return it;
    });
    var counts = { green: 0, amber: 0, red: 0, grey: 0 };
    items.forEach(function (i) { counts[i.rag]++; });
    /* The building's safety jobs: open = amber, past due = red. */
    var jobs = safetyOpen.map(function (j) { return { id: j.id, what: j.what || '', due: j.due || '', checkId: j.checkId || '', roomId: j.roomId || '', rag: j.due && String(j.due) < today ? 'red' : 'amber' }; });
    var jr = jobs.some(function (j) { return j.rag === 'red'; }) ? 'red' : jobs.length ? 'amber' : 'green';
    var rag = counts.red || jr === 'red' ? 'red' : counts.amber || jr === 'amber' ? 'amber' : 'green';
    return { items: items, counts: counts, safetyJobs: jobs, rag: rag };
  }

  /* ---- the extinguisher and fire blanket register, room by room ----
     guide: { kitchen: ['wetChemical', 'fireBlanket'], hall: ['water|foam'], ... }
     ('a|b': any one of them). A room missing a suggested type is amber.
     "Your fire risk assessment decides; this is a guide." */
  function register(o) {
    o = o || {};
    var guide = o.guide || {}, kinds = o.roomKinds || {}, eq = o.equipment || [];
    return (o.rooms || []).map(function (r) {
      var kind = kinds[r.id] || '', has = eq.filter(function (e) { return e.roomId === r.id && !e.removed; }).map(function (e) { return e.type; });
      var missing = (guide[kind] || []).filter(function (need) {
        var any = Array.isArray(need) ? need : String(need).split('|');
        return !any.some(function (t) { return has.indexOf(t) >= 0; });
      });
      return { roomId: r.id, name: r.name || r.id, kind: kind, has: has, missing: missing, rag: !kind ? 'grey' : missing.length ? 'amber' : 'green' };
    });
  }

  /* A job's words suggest the safety tick (the person can change it). */
  var SAFETY_WORDS = /\b(fire|smoke|alarm|extinguish\w*|blanket|exit|escape|emergency light\w*|light(s|ing)?|bulb|electric\w*|socket|wir(e|es|ing)|fuse|spark\w*|shock|gas|boiler|carbon monoxide|water|leak\w*|flood\w*|taps?|legionella|trip|slip|steps?|stair\w*|handrail)\b/i;
  function suggestSafety(text) { return SAFETY_WORDS.test(String(text || '')); }

  return { applies: applies, suggestSafety: suggestSafety, nextDue: nextDue, reconcile: reconcile, schedule: schedule, register: register,
    _dates: { addDays: addDays, addMonths: addMonths, between: between } };
});
