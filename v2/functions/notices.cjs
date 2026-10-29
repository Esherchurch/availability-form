// COPIED from egbc-notices.js by tools/enews-draft-build.mjs - do not edit; change egbc-notices.js and rebuild.
/* WHICH NOTICES ARE SHOWING, and for whom: the one rule (25 Oct 2026).
 *
 * The hub's Latest, the app's bell and the e-news weekly draft (Comms,
 * C-51) all ask the same two questions of the `news` collection. The rule
 * lived inside hub-app.js; it is here so nobody copies it.
 *
 *   EGBCNotices.isCurrent(n[, todayIso])   still showing: no `until`, or
 *                                         `until` today or later
 *   EGBCNotices.isForTeams(n, teams[, master])
 *                                         a notice with no teams is for
 *                                         everybody; otherwise for those
 *                                         teams (a master admin sees all)
 *   EGBCNotices.current(list[, todayIso]) the showing ones, newest first
 *
 * Pure: works as a script tag (window.EGBCNotices) and from Node.
 */
(function (global) {
  'use strict';
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function isCurrent(n, today) {
    return !!n && !(n.until && n.until < (today || todayIso()));
  }
  function isForTeams(n, teams, master) {
    if (!n || !Array.isArray(n.teams) || !n.teams.length) return true;
    if (master) return true;
    var mine = teams || [];
    return n.teams.some(function (t) { return mine.indexOf(t) !== -1; });
  }
  /* Newest first by createdAt, as the hub's Latest orders them. */
  function millis(n) {
    var c = n && n.createdAt;
    if (!c) return 0;
    if (typeof c.toMillis === 'function') return c.toMillis();
    if (c.seconds) return c.seconds * 1000;
    return Number(c) || 0;
  }
  function current(list, today) {
    return (list || []).filter(function (n) { return isCurrent(n, today); }).sort(function (a, b) { return millis(b) - millis(a); });
  }
  var api = { todayIso: todayIso, isCurrent: isCurrent, isForTeams: isForTeams, current: current };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.EGBCNotices = api;
})(typeof window !== 'undefined' ? window : globalThis);
