/* ===================================================================
   EGBC — team jobs, not team names (FINDINGS-churchhq H-9; main window,
   26 Oct 2026; design-mocks/multi-church/TEAM-JOBS.md)
   ===================================================================

   THE CODE NAMES A JOB, NEVER A TEAM. Each church says which of its teams
   do each job (churchSettings/teamJobs); every word a person sees is the
   church's own team name. Martin, 23 Oct 2026: "Other churches will name
   them differently. Elders might be stewards or deacons, maintenance might
   be building managers, church office might be admin."

   DECIDED (H-9, 23 Oct 2026):
     - 15 jobs (below), communications among them;
     - several teams may do one job (a buildings team per site);
     - a job nobody does is "nobody" ([]): its pages are hidden, and master
       admins are told "Nobody does this yet: choose a team" - EXCEPT that
       pastoral care and safeguarding never fall back to anyone;
     - team ids never change; only their labels do.

   EGBC NEEDS NO DOCUMENT. With nothing stored for a job, it takes EGBC's
   team as its default, so nothing changes for EGBC. The three jobs that
   are already settings (finance: paymentSettings/public.moneyTeam;
   trustees: safeguardingSettings/defaults.trusteeTeam; prayer:
   prayerSettings/main.prayerTeam) keep their setting as the default, given
   in `settings`, until it is folded in.

     EGBCTeamJobs.JOBS                       -> the 15, in the order setup asks
     EGBCTeamJobs.teamsFor(map, job, set?)   -> [team ids] ([] = nobody)
     EGBCTeamJobs.jobsOf(map, team, set?)    -> the jobs a team does
     EGBCTeamJobs.onJob(map, myTeams, job, set?) -> true / false
     EGBCTeamJobs.label(map, job, labelOf, set?) -> "Church office", "Elders
                                                and Deacons", or ''
     EGBCTeamJobs.validate(map)              -> [] or the problems, in words

   map: the church's churchSettings/teamJobs ({ <job>: [team ids] }), or
   null. set: { moneyTeam, trusteeTeam, prayerTeam } if the caller has them.
   labelOf(teamId): the team's label (Teams and groups); the id if absent.

   A PLAIN SCRIPT (window.EGBCTeamJobs), with functions/team-jobs.js its
   server twin; tests/check-team-jobs.mjs fails if the two ever differ.
   =================================================================== */

(function (global) {
  'use strict';

  /* id: what the code says. egbc: EGBC's team ids today. noFallback: never
     handed to anyone else. NO JOB COVERS ANOTHER (H-15, Martin, 26 Oct
     2026): a ministry's leadership comes from its core team (Teams & groups,
     "core team for"), not from a job. */
  var JOBS = [
    { id: 'office', means: 'The church office: sending, people, bookings, settings', egbc: ['Church office'],
      suggest: ['Church office', 'Parish office', 'Admin team', 'Administration'] },
    { id: 'communications', means: 'The e-news, social posts, the card maker, Canva and Unsplash', egbc: ['Church office'],
      suggest: ['Communications', 'Comms team', 'Church office'] },
    { id: 'trustees', means: 'The risk registers, the meetings where members vote, and compliance', egbc: ['Elders'], setting: 'trusteeTeam',
      suggest: ['Elders', 'Deacons', 'Stewards', 'PCC', 'Trustees', 'Leadership team'] },
    /* The church's overall leaders (Martin, 26 Oct 2026: "some are elders
       in some churches; they will have administration people" - those are
       the office). Covers nothing. EGBC's are the Elders. */
    { id: 'leadership', means: 'The church’s overall leaders', egbc: ['Elders'],
      suggest: ['Elders', 'Deacons', 'PCC', 'Staff team', 'Leadership team'] },
    { id: 'finance', means: 'Payments and giving', egbc: ['Finance'], setting: 'moneyTeam',
      suggest: ['Finance', 'Treasury', 'Treasurers'] },
    { id: 'buildings', means: 'Maintenance jobs and the buildings’ checks', egbc: ['Maintenance'],
      suggest: ['Maintenance', 'Buildings', 'Building managers', 'Fabric team', 'Site team'] },
    { id: 'pastoral', means: 'Care and support', egbc: ['Pastoral'], noFallback: true,
      suggest: ['Pastoral', 'Pastoral care', 'Care team'] },
    { id: 'worship', means: 'The Sunday rota and the service plan', egbc: ['Worship Team'],
      suggest: ['Worship', 'Music', 'Music team', 'Band'] },
    { id: 'av', means: 'Sound, words and cameras', egbc: ['AV Team'],
      suggest: ['AV', 'Tech', 'Media', 'Sound and vision'] },
    { id: 'choir', means: 'A part of worship with its own rota places', egbc: ['Choir'],
      suggest: ['Choir', 'Singers'] },
    { id: 'children', means: 'Children’s work overall: the register, check-in, the session planner', egbc: ['Kids Church'],
      suggest: ['Kids Church', 'Sunday School', 'Junior Church', 'Children’s church'] },
    { id: 'youth', means: 'Youth work overall: the youth app and its rota', egbc: ['Youth Worship'],
      suggest: ['Youth', 'Youth group', 'Youth worship'] },
    { id: 'catering', means: 'The caterers’ list', egbc: ['Catering'],
      suggest: ['Catering', 'Kitchen team', 'Hospitality'] },
    { id: 'welcome', means: 'Welcome and newcomers', egbc: [],
      suggest: ['Welcome', 'Welcome team', 'Hospitality', 'Sidespeople'] },
    { id: 'prayer', means: 'The prayer team', egbc: [], setting: 'prayerTeam',
      suggest: ['Prayer', 'Prayer ministry', 'Prayer team'] }
  ];
  var BY_ID = {};
  JOBS.forEach(function (j) { BY_ID[j.id] = j; });
  /* The most one list on one document safely holds (H-9: no other cap). */
  var MOST = 500;

  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  function teamsFor(map, job, set) {
    var j = BY_ID[job];
    if (!j) return [];
    if (own(map, job) && Array.isArray(map[job])) return map[job].filter(function (t) { return typeof t === 'string' && t; });
    /* Nothing stored: the setting this job already had, then EGBC's team. */
    if (j.setting && set && own(set, j.setting)) {
      var s = String(set[j.setting] || '').trim();
      return s ? [s] : [];
    }
    return j.egbc.slice();
  }

  function jobsOf(map, team, set) {
    return JOBS.filter(function (j) { return teamsFor(map, j.id, set).indexOf(team) !== -1; }).map(function (j) { return j.id; });
  }

  /* On a team that does this job. A job nobody does has nobody on it: its
     pages are hidden (H-9 question 4). */
  function onJob(map, myTeams, job, set) {
    var mine = myTeams || [];
    return teamsFor(map, job, set).some(function (t) { return mine.indexOf(t) !== -1; });
  }

  function label(map, job, labelOf, set) {
    var names = teamsFor(map, job, set).map(function (t) { return (labelOf && labelOf(t)) || t; });
    if (names.length <= 1) return names[0] || '';
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function validate(map) {
    var out = [];
    if (map == null) return out;
    if (typeof map !== 'object' || Array.isArray(map)) return ['The team jobs must be a list of jobs.'];
    Object.keys(map).forEach(function (k) {
      if (k === 'updatedAt' || k === 'updatedBy') return;
      if (!BY_ID[k]) { out.push('"' + k + '" is not a job.'); return; }
      var v = map[k];
      if (!Array.isArray(v)) { out.push(k + ': a list of teams.'); return; }
      if (v.length > MOST) out.push(k + ': at most ' + MOST + ' teams.');
      if (v.some(function (t) { return typeof t !== 'string' || !t || t.length > 120; })) out.push(k + ': each team is its id.');
      if (v.some(function (t, i) { return v.indexOf(t) !== i; })) out.push(k + ': a team is listed twice.');
    });
    return out;
  }

  global.EGBCTeamJobs = { JOBS: JOBS, MOST: MOST, teamsFor: teamsFor, jobsOf: jobsOf, onJob: onJob, label: label, validate: validate,
    job: function (id) { return BY_ID[id] || null; } };
})(typeof window !== 'undefined' ? window : globalThis);
