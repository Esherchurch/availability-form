/* WHICH SAVED PLAN IS WHICH SERVICE'S (FINDINGS-churchhq H-11, item 0).
 *
 * A plan used to be found by its DATE alone: the first `services`
 * document with that date was read, and saved over. With a morning and an
 * evening service on one Sunday there was one plan between them, and
 * saving the second overwrote the first. Now each plan carries the id of
 * its service - the rota event - and is found by that.
 *
 * A date with ONE service, which is EGBC almost every week, behaves
 * exactly as before: an older plan saved before this (no eventId) is that
 * service's plan, and is linked to it the next time it is saved. On a date
 * with several services an older unlinked plan is not given to any of
 * them - that would be a guess - and the migration lists it for a person.
 *
 * Pure: every page keeps its own database calls (two SDKs are in use) and
 * asks this which document is the plan, and where to save. Works as a
 * script tag (window.EGBCPlanStore) and from Node (module.exports).
 */
(function (global) {
  'use strict';

  /* A day's services in order: start time, then building, then type. A
     service with no building is at the church's main building (H-11). */
  function inOrder(events) {
    return (events || []).filter(function (e) { return e && !e.archived; }).slice().sort(function (a, b) {
      return String(a.startTime || '').localeCompare(String(b.startTime || ''))
        || String(a.siteId || '').localeCompare(String(b.siteId || ''))
        || String(a.type || '').localeCompare(String(b.type || ''))
        || String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  /* How a service is named in a list: its type, and its time when the
     day has more than one (with one, exactly as before: the type alone).
     siteName: the building's name, when the church has more than one. */
  function label(ev, dayCount, siteName) {
    var t = String(ev.type || 'Service');
    if (dayCount > 1 && ev.startTime) t += ' · ' + ev.startTime;
    if (dayCount > 1 && siteName) t += ' · ' + siteName;
    return t;
  }

  /* docs: the `services` documents with this date, as [{ id, data }].
     dayEvents: that date's services. -> the plan document, or null. */
  function planFor(docs, eventId, dayEvents) {
    var list = docs || [];
    for (var i = 0; i < list.length; i++) if (list[i].data && list[i].data.eventId === eventId) return list[i];
    if (inOrder(dayEvents).length === 1) {
      for (var j = 0; j < list.length; j++) if (list[j].data && !list[j].data.eventId) return list[j];
    }
    return null;
  }

  /* Where to save: the plan's own document id, or null for a new one. The
     saved plan always carries eventId, so an older plan on a one-service
     date is linked to its service as it is saved. */
  function saveTarget(docs, eventId, dayEvents) {
    var p = planFor(docs, eventId, dayEvents);
    return p ? p.id : null;
  }

  /* The emailed plan (songSummaries): the date alone with one service that
     day, as before; the date and the service with several. */
  function summaryId(date, eventId, dayEvents) {
    return inOrder(dayEvents).length > 1 ? date + '_' + eventId : date;
  }

  /* For the migration: what each date's older, unlinked plans should do.
     -> { link: [{ planId, eventId }], ask: [{ date, planIds, services }] } */
  function migrationPlan(plansByDate, eventsByDate) {
    var link = [], ask = [];
    Object.keys(plansByDate || {}).sort().forEach(function (date) {
      var older = (plansByDate[date] || []).filter(function (p) { return !(p.data && p.data.eventId); });
      if (!older.length) return;
      var day = inOrder((eventsByDate || {})[date] || []);
      if (day.length === 1 && older.length === 1) link.push({ planId: older[0].id, eventId: day[0].id, date: date });
      else ask.push({ date: date, planIds: older.map(function (p) { return p.id; }), services: day.map(function (e) { return { id: e.id, type: e.type || '', startTime: e.startTime || '', siteId: e.siteId || '' }; }) });
    });
    return { link: link, ask: ask };
  }

  var api = { inOrder: inOrder, label: label, planFor: planFor, saveTarget: saveTarget, summaryId: summaryId, migrationPlan: migrationPlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.EGBCPlanStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
