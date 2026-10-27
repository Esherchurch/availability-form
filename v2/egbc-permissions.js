/* ===================================================================
   EGBC — who may do what: the Permissions screen's rules (FINDINGS-churchhq
   H-14; main window, 26 Oct 2026; design-mocks/permissions/)
   ===================================================================

   Martin, 26 Oct 2026: "only admins and core team should be allowed to
   upload. This needs setting up on the permissions screen... split down by
   section, so it is easy to find... 'permissions' and then a tick box. But
   we also need an exceptions rule." His answers to H-14's questions:
     1. kb uploads: master admins, the core teams covering worship (EGBC's
        Worship Core Team; H-15) and the admins of AV and Worship;
     2. an exception only ADDS one action for one person;
     3. an end date is optional; the person who added it hears a week before;
     4. "leaders" are the leaders of the teams ticked for that action;
     5. only master admins change permissions;
     6. Church settings > Permissions, with a Menu entry for master admins.

   MASTER ADMINS MAY ALWAYS. Safeguarding and pastoral care are never tick
   boxes here (they stay with the named lead and deputy, and the pastoral
   team): READ_ONLY says where they are set.

   WHERE IT IS KEPT
     churchSettings/permissions   { actions: { <id>: { jobs, coresOf,
                                    adminJobs, teams, leaders } } } - the
                                    ticks; an action not stored has its
                                    defaults (EGBC's). coresOf: the core
                                    teams covering those jobs' teams (H-15)
     permissionExceptions/{id}_{memberId}  one exception: { action, memberId,
                                    uid, name, by, byName, at, until, why }
     permissionsLog/{auto}        every change: who, when, before and after

     EGBCPermissions.SECTIONS, ACTIONS, LATER, READ_ONLY
     EGBCPermissions.ruleFor(perms, id)            -> the ticks, defaults filled
     EGBCPermissions.may(person, id, o)            -> true / false
     EGBCPermissions.allowed(person, o)            -> [action ids] (the claim)
     EGBCPermissions.ending(exceptions, today, n)  -> those ending within n days
     EGBCPermissions.validate(perms)               -> [] or the problems

   person: { master, teams, adminFor, roles, memberId }. o: { perms, jobs
   (churchSettings/teamJobs), set (the job settings), cores ({ core team:
   [teams it covers] }), exceptions (list), today ('YYYY-MM-DD'), TJ
   (EGBCTeamJobs) }.

   A PLAIN SCRIPT (window.EGBCPermissions), with functions/permissions.js's
   copy built from it (tools/team-jobs-build.mjs); needs egbc-team-jobs.js.
   =================================================================== */

(function (global) {
  'use strict';

  var SECTIONS = [
    { id: 'worship', label: 'Worship & AV' },
    { id: 'children', label: 'Children & youth' },
    { id: 'events', label: 'Events & rooms' },
    { id: 'communications', label: 'Communications' },
    { id: 'money', label: 'Money' },
    { id: 'buildings', label: 'Buildings' },
    { id: 'office', label: 'Office & admin' }
  ];

  /* Each action: its words, what it covers, and its defaults - EGBC's
     values, for every church until it changes them. */
  var ACTIONS = [
    { id: 'kbUpload', section: 'worship',
      words: 'Upload to How-To AV, Play-Through, AV Troubleshoot and Worship Training',
      why: 'Videos and pictures on those pages. Anyone signed in can watch them.',
      defaults: { jobs: [], coresOf: ['worship'], adminJobs: ['av', 'worship'], teams: [], leaders: false } },
    /* Meetings (27 Oct 2026; Martin: "The only meetings a non-admin should
       see is the ones they are invited to. They can be given permission
       (e.g. a small group leader) but not by default."). Nobody by default. */
    { id: 'meetingsAll', section: 'events',
      words: 'See and join every video meeting and meeting room',
      why: 'For example a small group leader who runs calls for groups. Without it, people see only the meetings they are invited to: named on one, or for one of their teams.',
      defaults: { jobs: [], coresOf: [], adminJobs: [], teams: [], leaders: false } }
  ];

  /* What is still decided in code: shown, honestly, as moving here later. */
  var LATER = [
    { section: 'worship', words: 'Plan the rota', where: 'Rota planner', today: 'Master admins, and the leaders of Worship, Kids Church, Youth and Core Team' },
    { section: 'worship', words: 'Upload music', where: 'Music uploader', today: 'Master admins, and the Worship Team’s leaders' },
    { section: 'worship', words: 'Plan Sunday’s service', where: 'Sunday service plan', today: 'Master admins, and the Worship Team’s leaders' }
  ];

  var READ_ONLY = [
    { id: 'safeguarding', label: 'Safeguarding', words: 'Only the named safeguarding lead and deputy, for each building.', where: 'safeguarding-settings.html', whereWords: 'Safeguarding settings' },
    { id: 'pastoral', label: 'Pastoral care', words: 'Only the pastoral team.', where: 'teams-admin.html', whereWords: 'Teams & groups' }
  ];

  var BY_ID = {};
  ACTIONS.forEach(function (a) { BY_ID[a.id] = a; });
  var MOST = 500;
  var list = function (v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === 'string' && x; }) : null; };

  function ruleFor(perms, id) {
    var a = BY_ID[id];
    if (!a) return null;
    var s = (perms && perms.actions && perms.actions[id]) || {};
    var d = a.defaults;
    return {
      jobs: list(s.jobs) || d.jobs.slice(),
      coresOf: list(s.coresOf) || (d.coresOf || []).slice(),
      adminJobs: list(s.adminJobs) || d.adminJobs.slice(),
      teams: list(s.teams) || d.teams.slice(),
      leaders: typeof s.leaders === 'boolean' ? s.leaders : d.leaders
    };
  }

  function current(x, today) { return !!x && (!x.until || String(x.until) >= String(today || '')); }

  function may(person, id, o) {
    o = o || {};
    var p = person || {};
    var r = ruleFor(o.perms, id);
    if (!r) return false;
    if (p.master === true) return true;
    var TJ = o.TJ || global.EGBCTeamJobs;
    var teams = p.teams || [], adminFor = p.adminFor || [], roles = p.roles || {};
    /* An exception: this person, this action, not ended. */
    if (p.memberId && (o.exceptions || []).some(function (x) { return x.action === id && x.memberId === p.memberId && current(x, o.today); })) return true;
    var jobTeams = function (job) { return TJ ? TJ.teamsFor(o.jobs || null, job, o.set) : []; };
    if (r.jobs.some(function (j) { return TJ && TJ.onJob(o.jobs || null, teams, j, o.set); })) return true;
    /* Core teams (H-15): what this person's core teams cover, and what the
       core teams they administer cover. */
    var cores = o.cores || {};
    var coverOf = function (list) { var out = []; (list || []).forEach(function (t) { (cores[t] || []).forEach(function (c) { if (out.indexOf(c) === -1) out.push(c); }); }); return out; };
    var covered = coverOf(teams), adminCovered = coverOf(adminFor);
    if (r.coresOf.some(function (j) { return jobTeams(j).some(function (t) { return covered.indexOf(t) !== -1; }); })) return true;
    var isAdmin = function (t) { return adminFor.indexOf(t) !== -1 || adminCovered.indexOf(t) !== -1 || roles[t] === 'admin'; };
    if (r.adminJobs.some(function (j) { return jobTeams(j).some(isAdmin); })) return true;
    if (r.teams.some(function (t) { return teams.indexOf(t) !== -1; })) return true;
    /* Leaders of the teams ticked for this action (Martin's answer 4). */
    if (r.leaders) {
      var ticked = r.teams.slice();
      r.jobs.forEach(function (j) { ticked = ticked.concat(jobTeams(j)); });
      if (ticked.some(function (t) { return roles[t] === 'leader' || isAdmin(t); })) return true;
    }
    return false;
  }

  function allowed(person, o) {
    return ACTIONS.filter(function (a) { return may(person, a.id, o); }).map(function (a) { return a.id; });
  }

  /* Exceptions with an end date within n days (and not yet ended). */
  function ending(exceptions, today, n) {
    var t = new Date(String(today) + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + (n == null ? 7 : n));
    var last = t.toISOString().slice(0, 10);
    return (exceptions || []).filter(function (x) { return x && x.until && String(x.until) >= String(today) && String(x.until) <= last; });
  }

  function validate(perms) {
    var out = [];
    if (perms == null) return out;
    var acts = perms.actions || {};
    if (typeof acts !== 'object' || Array.isArray(acts)) return ['The permissions must be a list of actions.'];
    Object.keys(acts).forEach(function (k) {
      if (!BY_ID[k]) { out.push('"' + k + '" is not an action.'); return; }
      var s = acts[k] || {};
      ['jobs', 'coresOf', 'adminJobs', 'teams'].forEach(function (f) {
        if (s[f] === undefined) return;
        if (!Array.isArray(s[f])) out.push(k + ': ' + f + ' is a list.');
        else if (s[f].length > MOST) out.push(k + ': at most ' + MOST + ' ' + f + '.');
      });
      if (s.leaders !== undefined && typeof s.leaders !== 'boolean') out.push(k + ': leaders is yes or no.');
    });
    return out;
  }

  global.EGBCPermissions = { SECTIONS: SECTIONS, ACTIONS: ACTIONS, LATER: LATER, READ_ONLY: READ_ONLY, MOST: MOST,
    ruleFor: ruleFor, may: may, allowed: allowed, ending: ending, validate: validate, current: current,
    action: function (id) { return BY_ID[id] || null; } };
})(typeof window !== 'undefined' ? window : globalThis);
