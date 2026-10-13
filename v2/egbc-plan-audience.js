/* ===================================================================
   EGBC — who the Sunday plan was sent to, written onto the plan
   ===================================================================

   Martin, 12 Oct 2026: "EVERYONE ON THE SUNDAY PLAN EMAIL CAN SEE THE
   PLAN — that includes the preachers and service leader." Today the
   email's summary link goes to song-summary.html, guarded on Worship
   Team, so a preacher who is on no team gets "No access" from an email
   that was sent to them.

   THE AUDIENCE IS WRITTEN DOWN WHEN THE PLAN IS SAVED OR SENT, as a
   list of uids on the services and songSummaries documents, and the read
   rule lets those uids in. The alternative - working out at read time
   whether this person is on that Sunday - would mean every reader
   querying the rota and the address book before they could see a page,
   and rules cannot do that anyway.

   WHO IS ON IT (the brief, in order):
     - everyone assigned on that Sunday's event, any role
     - the event's serviceLeader and speaker
     - Worship Team, AV Team, Choir and Core Team

   The teams are NOT resolved to uids: they already read these documents
   through volunteer(), and a list of every team member's uid would go
   stale the moment somebody joined. Only the named people are listed,
   because they are the ones a team membership does not cover.

   WHAT DID NOT RESOLVE IS RECORDED, which Martin asked for by name: a
   speaker typed as a name the address book does not have cannot become a
   uid, and the honest thing is to say so on the document rather than
   quietly drop them. They are the people who will ring up saying they
   cannot see the plan.

   TWO PLANNERS, TWO SDKs, ONE POLICY. SundayServicePlanner.html is
   modular and egbc-core-planner.js is compat, so the two lookups are
   passed in by the host; what counts as the audience lives here.
   =================================================================== */

(function (global) {
  'use strict';

  function clean(s) { return String(s == null ? '' : s).trim(); }

  /* A name worth looking up. "None", "TBC" and the empty string are what
     a planner leaves in a box it has not filled in, and looking them up
     would put a person called None in the audience if one existed. */
  function realName(s) {
    var n = clean(s);
    if (!n) return '';
    if (/^(none|tbc|n\/a|-|—)$/i.test(n)) return '';
    return n;
  }

  /* Everyone the plan names, out of the rota event.
     Returns { memberIds, names } - memberIds for people the rota has a
     record for, names for the ones typed in by hand. */
  function namedBy(event) {
    var e = event || {};
    var memberIds = [], names = [];

    var a = e.assignments || {};
    Object.keys(a).forEach(function (role) {
      var who = a[role];
      if (!who) return;
      /* A role can hold a record or just a name, depending on how it was
         filled in, so both are collected. */
      if (who.id) memberIds.push(clean(who.id));
      else if (realName(who.name)) names.push(realName(who.name));
      else if (typeof who === 'string' && realName(who)) names.push(realName(who));
    });

    /* THE TWO THAT STARTED THIS. serviceLeader and speaker are typed on
       the event in the Rota Planner, not rota roles, so they are never in
       assignments - which is exactly why a preacher was locked out. Each
       may be one name, or a list of them from mergeDay(). */
    [].concat(e.serviceLeader || [], e.speaker || []).forEach(function (n) {
      if (realName(n)) names.push(realName(n));
    });

    return {
      memberIds: memberIds.filter(uniq),
      names: names.filter(uniq)
    };
  }

  function uniq(v, i, arr) { return v && arr.indexOf(v) === i; }

  /* One Sunday's services, merged into the one email they share. Every
     service's assignments, AND every service's leader and speaker:
     Martin, 13 Oct 2026, "every service's leader and speaker on that day
     goes on the audience (morning and evening)". Until then only the
     first service's were kept, so an evening preacher was left out.
     Both planners and tools/backfill-plan-audience.mjs call this, so
     there is one answer to "which people does that day name". */
  function mergeDay(events) {
    var merged = { assignments: {}, serviceLeader: [], speaker: [] };
    (events || []).forEach(function (e) {
      if (!e) return;
      Object.keys(e.assignments || {}).forEach(function (r) {
        merged.assignments[r + '|' + e.date + (e.startTime || '')] = e.assignments[r];
      });
      if (e.serviceLeader) merged.serviceLeader.push(e.serviceLeader);
      if (e.speaker) merged.speaker.push(e.speaker);
    });
    return merged;
  }

  /* Build the audience.

     host.findUidsByMemberIds(ids) -> Promise of { memberId: uid }
     host.findMemberIdsByNames(names) -> Promise of { name: memberId }

     Both may leave anybody out; whatever is left out ends up in
     `unresolved`. */
  function build(event, host) {
    var named = namedBy(event);

    return Promise.resolve(host.findMemberIdsByNames(named.names || []))
      .then(function (byName) {
        byName = byName || {};
        var ids = named.memberIds.slice();
        var unresolvedNames = [];
        named.names.forEach(function (n) {
          if (byName[n]) ids.push(byName[n]);
          else unresolvedNames.push(n);
        });
        ids = ids.filter(uniq);
        return Promise.resolve(host.findUidsByMemberIds(ids)).then(function (byId) {
          byId = byId || {};
          var uids = [], noAccount = [];
          ids.forEach(function (id) {
            if (byId[id]) uids.push(byId[id]);
            else noAccount.push(id);
          });
          return {
            audience: uids.filter(uniq),
            /* TWO DIFFERENT PROBLEMS, kept apart because the answer
               differs. A name the address book does not have is a typo or
               a visitor - somebody has to add them. A member with no
               account has simply never signed in, and nothing needs
               fixing until they do. */
            unresolved: unresolvedNames,
            withoutAccount: noAccount.filter(uniq)
          };
        });
      });
  }

  global.EGBCPlanAudience = {
    build: build,
    mergeDay: mergeDay,
    namedBy: namedBy,
    realName: realName
  };
})(window);
