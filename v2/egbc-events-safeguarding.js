/* ===================================================================
   EGBC — safeguarding, the shared part (events window, Chunk 3 E3)
   ===================================================================

   safeguarding.html, checkin.html and retention.html share these answers:
   who leads an event, whether there are enough of them, whether their
   checks are in date, and what a child's forms say - their collectors,
   their age and their medical flags.

   WHO MAY SEE WHAT IS DECIDED BY THE RULES, NOT HERE. The functions below
   ask for everything they could use and quietly make do with what the
   rules hand back. A leader who is not an admin gets their own event's
   forms and medical answers; an ordinary admin gets the forms and the
   fact that medical answers exist; a safeguarding lead gets their site.
   =================================================================== */

(function (global) {
  'use strict';

  function db() { return EGBCAuth.db; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function me() {
    var p = (EGBCAuth.profile && EGBCAuth.profile()) || {};
    var u = (EGBCAuth.user && EGBCAuth.user()) || {};
    return { uid: u.uid || '', memberId: p.memberId || '', name: p.name || '' };
  }

  /* ---- roles ---- */

  function leadersOf(evId) {
    return db().collection('eventLeaders').doc(evId).get()
      .then(function (s) { return s.exists ? s.data() : null; })
      .catch(function () { return null; });
  }

  /* The sites this person is safeguarding lead or deputy for. */
  function myLeadSites() {
    var m = me().memberId;
    if (!m) return Promise.resolve([]);
    return db().collection('bookingSettings').get().then(function (snap) {
      return snap.docs.filter(function (d) {
        var x = d.data();
        return x.safeguardingLead === m || x.safeguardingDeputy === m;
      }).map(function (d) { return d.id; });
    }).catch(function () { return []; });
  }

  /* ---- age and ratios ---- */

  function ageOn(dob, onDate) {
    var b = new Date(String(dob).slice(0, 10) + 'T12:00'), d = new Date(String(onDate).slice(0, 10) + 'T12:00');
    if (isNaN(b) || isNaN(d)) return null;
    var a = d.getFullYear() - b.getFullYear();
    if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
    return a;
  }

  /* o: { children, under8, leaders, ratioAll, ratioUnder8 }. A ratio of
     1:8 is ratioAll 8. Under-8s are counted inside children too: the
     under-8 ratio is a second, stricter test, not a separate group. */
  function ratio(o) {
    var needAll = o.ratioAll ? Math.ceil((o.children || 0) / o.ratioAll) : 0;
    var needU8 = o.ratioUnder8 ? Math.ceil((o.under8 || 0) / o.ratioUnder8) : 0;
    var need = Math.max(needAll, needU8);
    return { need: need, needAll: needAll, needUnder8: needU8, short: Math.max(0, need - (o.leaders || 0)),
             ok: (o.leaders || 0) >= need };
  }

  /* ---- leader checks ----
     Status and dates only. A DBS check counts as current for dbsYears
     after it was seen, training for trainingYears (settings on the event;
     EGBC's policy decides the numbers - FINDINGS-events.md F-046). */
  function addYears(d, y) { var x = new Date(String(d).slice(0, 10) + 'T12:00'); x.setFullYear(x.getFullYear() + y); return x; }
  function checkStatus(c, o, onDate) {
    o = o || {}; c = c || null;
    var on = new Date(String(onDate || new Date().toISOString()).slice(0, 10) + 'T12:00');
    var dbs = !c || !c.dbsStatus || c.dbsStatus === 'none' ? 'missing'
      : c.dbsStatus === 'applied' ? 'applied'
      : !c.dbsSeen ? 'missing'
      : addYears(c.dbsSeen, o.dbsYears || 3) < on ? 'out of date' : 'ok';
    var training = !c || !c.trainingDate ? 'missing'
      : addYears(c.trainingDate, o.trainingYears || 3) < on ? 'out of date' : 'ok';
    return { dbs: dbs, training: training, ok: dbs === 'ok' && training === 'ok' };
  }

  /* Whose DBS check or training runs out soon, or has (NEXT-BRIEF §24,
     F-142): for the safeguarding page now, and for the daily reminders the
     main window's function sends (F-143), which uses this same function.
       list:  [{ memberId, name, dbsStatus, dbsSeen, trainingDate }]
       o:     { dbsYears, trainingYears }   (Safeguarding settings; 3 if unset)
       today: 'YYYY-MM-DD';  days: how far ahead counts as soon (default 42)
     -> [{ memberId, name, what: 'dbs' | 'training', ends: 'YYYY-MM-DD',
           state: 'soon' | 'out', daysLeft }], soonest first.
     A DBS check only applied for, or none at all, is not "running out":
     it was never in date, and the page shows it as missing already. */
  function checksDue(list, o, today, days) {
    o = o || {}; days = days == null ? 42 : days;
    var t = new Date(String(today).slice(0, 10) + 'T12:00'), out = [];
    var iso = function (d) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
    (list || []).forEach(function (c) {
      if (!c) return;
      var add = function (what, from, years) {
        if (!from) return;
        var end = addYears(from, years || 3), left = Math.round((end - t) / 864e5);
        if (left > days) return;
        out.push({ memberId: c.memberId || c.id || '', name: c.name || '', what: what, ends: iso(end), state: left < 0 ? 'out' : 'soon', daysLeft: left });
      };
      if (c.dbsStatus === 'current') add('dbs', c.dbsSeen, o.dbsYears);
      add('training', c.trainingDate, o.trainingYears);
    });
    return out.sort(function (a, b) { return a.ends < b.ends ? -1 : a.ends > b.ends ? 1 : 0; });
  }

  /* "Works with under-18s" (§24, F-146): clear everyone named, in turn.
     The rules can check only two people in one save, so this saves two at
     a time; when a pair is refused it tries each on their own, so one
     person without checks never holds up the rest. Nobody is removed.
     -> { cleared: [memberId], notCleared: [{ memberId, name, why }] } */
  function clearInTurn(evId) {
    var ref = db().collection('eventLeaders').doc(evId), w = me();
    return ref.get().then(function (s) {
      var d = s.exists ? s.data() : null;
      if (!d || !d.under18) return { cleared: [], notCleared: [] };
      var leaders = d.leaders || [], cleared = (d.clearedIds || []).slice(), bad = [];
      var nameOf = function (id) { var l = leaders.filter(function (x) { return x.memberId === id; })[0]; return l ? l.name : id; };
      /* Someone with no address book record can never be cleared. */
      leaders.forEach(function (l) { if (!l.memberId) bad.push({ memberId: '', name: l.name, why: 'not in the address book' }); });
      var todo = (d.leaderIds || []).filter(function (id, i, a) { return id && cleared.indexOf(id) < 0 && a.indexOf(id) === i; });
      var save = function (ids) {
        return ref.update({ clearedIds: cleared.concat(ids), lastCleared: ids, updatedAt: new Date().toISOString(), updatedBy: w.uid })
          .then(function () { cleared = cleared.concat(ids); return true; });
      };
      var one = function (id) {
        return save([id]).catch(function (e) {
          if (e && e.code !== 'permission-denied') throw e;
          bad.push({ memberId: id, name: nameOf(id), why: 'no in-date DBS check or training' });
        });
      };
      var step = function () {
        if (!todo.length) return Promise.resolve();
        var pair = todo.splice(0, 2);
        return save(pair).catch(function (e) {
          if (e && e.code !== 'permission-denied') throw e;
          return pair.reduce(function (p, id) { return p.then(function () { return one(id); }); }, Promise.resolve());
        }).then(step);
      };
      return step().then(function () { return { cleared: cleared, notCleared: bad }; });
    });
  }
  /* One person already named, cleared now (after an exception was recorded,
     or their checks were brought up to date). */
  function clearOne(evId, memberId) {
    var ref = db().collection('eventLeaders').doc(evId), w = me();
    return ref.get().then(function (s) {
      var d = s.data() || {}, c = (d.clearedIds || []).filter(function (x) { return x !== memberId; });
      return ref.update({ clearedIds: c.concat([memberId]), lastCleared: [memberId], updatedAt: new Date().toISOString(), updatedBy: w.uid });
    });
  }
  /* The words for what clearing found, for whoever ticked the box. */
  function clearWords(r, total) {
    if (!r.notCleared.length) return 'Every leader and helper (' + total + ') is cleared.';
    return (total - r.notCleared.length) + ' of ' + total + ' are cleared. Not yet: ' +
      r.notCleared.map(function (x) { return x.name + ' (' + x.why + ')'; }).join(', ') +
      '. The safeguarding lead can record an exception with a reason, or they can be taken off this event.';
  }

  /* A list the rules can allow in more than one way. A leader may ask for
     everything for their event; a safeguarding lead may only ask for their
     own site's, and the question has to say so or the whole list is
     refused. So: ask for the event, and if that is refused, ask once per
     site this person might lead, and once per form on the event (a team's
     admins may ask about their own team's forms only, F-087). Whatever
     comes back is merged. */
  function listForEvent(col, evId, siteIds, formIds) {
    var seen = {}, out = [];
    function add(snap) { snap.docs.forEach(function (d) { if (!seen[d.id]) { seen[d.id] = 1; out.push(Object.assign({ _id: d.id }, d.data())); } }); }
    return db().collection(col).where('calEventId', '==', evId).get().then(add).catch(function () {
      return Promise.all((siteIds || []).filter(Boolean).map(function (sid) {
        return db().collection(col).where('calEventId', '==', evId).where('siteId', '==', sid).get().then(add).catch(function () {});
      }).concat((formIds || []).filter(Boolean).map(function (fid) {
        return db().collection(col).where('calEventId', '==', evId).where('formId', '==', fid).get().then(add).catch(function () {});
      }))).then(function () { if (!out.length) out.denied = true; });
    }).then(function () { return out; });
  }

  /* A flag at the door is something written down: a condition, an
     allergy, a medicine, a need. A yes or no - "may a leader give first
     aid?" - is a permission, kept private but not shown as a warning. */
  function flagType(f) { return f.type === 'text' || f.type === 'longtext'; }

  /* ---- what a child's forms say ----
     Every form done for this event, read the way the rules allow this
     person. Returned per child (by name): who may collect them, their date
     of birth, their medical flags, and whether medical answers exist that
     this person cannot see. */
  function formsForEvent(evId, siteIds) {
    var out = {}, forms = {};
    function child(name) { var k = norm(name); return (out[k] = out[k] || { name: name, collectors: [], dob: '', flags: [], medicalHeld: false, medicalVisible: false, responseIds: [] }); }
    return db().collection('eventForms').doc(evId).get().then(function (d) { return d.exists ? (d.data().forms || []).map(function (a) { return a && a.formId; }) : []; }, function () { return []; })
      .then(function (fids) { return listForEvent('formRequests', evId, siteIds, fids); }).then(function (reqs) {
      var done = reqs.filter(function (r) { return r.status === 'done' && r.responseId; });
      return Promise.all(done.map(function (r) {
        return Promise.all([
          db().collection('formResponses').doc(r.responseId).get(),
          forms[r.formId] ? Promise.resolve(null) : db().collection('forms').doc(r.formId).get()
        ]).then(function (x) {
          if (x[1] && x[1].exists) forms[r.formId] = x[1].data();
          return x[0].exists ? Object.assign({ id: x[0].id, request: r }, x[0].data()) : null;
        }).catch(function () { return null; });
      }));
    }).then(function (responses) {
      responses = responses.filter(Boolean);
      return listForEvent('sensitiveResponses', evId, siteIds)
        .then(function (s) { return s.denied ? null : s; })
        .then(function (sens) {
          var byResp = {};
          (sens || []).forEach(function (x) { byResp[x.responseId] = x; });
          responses.forEach(function (resp) {
            var form = forms[resp.formId] || { fields: [] };
            var rep = (form.fields || []).filter(function (f) { return f.type === 'repeat'; })[0];
            var rows = rep ? (resp.answers[rep.id] || []) : [{ name: resp.name }];
            var sx = byResp[resp.id];
            var top = (form.fields || []).filter(function (f) { return f.type !== 'repeat'; });
            var topCollectors = [];
            top.forEach(function (f) {
              if (/collect/i.test(f.label) && resp.answers[f.id]) topCollectors = topCollectors.concat(EGBCCheckin.splitNames(resp.answers[f.id]));
            });
            rows.forEach(function (row, i) {
              var c = child(row.name || (rep ? '' : resp.name));
              c.responseIds.push(resp.id);
              c.collectors = c.collectors.concat(topCollectors);
              (rep ? rep.fields || [] : []).forEach(function (sf) {
                if (sf.type === 'date' && /birth/i.test(sf.label) && row[sf.id]) c.dob = row[sf.id];
                if (/collect/i.test(sf.label) && row[sf.id]) c.collectors = c.collectors.concat(EGBCCheckin.splitNames(row[sf.id]));
              });
              if (resp.hasSensitive) c.medicalHeld = true;
              if (sx) {
                c.medicalVisible = true;
                var srow = rep ? ((sx.answers[rep.id] || [])[i] || {}) : {};
                (rep ? rep.fields || [] : []).forEach(function (sf) {
                  if (flagType(sf) && srow[sf.id] !== undefined && EGBCCheckin.meaningful(srow[sf.id])) c.flags.push({ label: sf.label, value: EGBCCheckin.answerText(srow[sf.id]) });
                });
                top.forEach(function (f) {
                  if (flagType(f) && sx.answers[f.id] !== undefined && EGBCCheckin.meaningful(sx.answers[f.id])) c.flags.push({ label: f.label, value: EGBCCheckin.answerText(sx.answers[f.id]) });
                });
              }
            });
          });
          Object.keys(out).forEach(function (k) {
            out[k].collectors = out[k].collectors.filter(function (n, i, a) { return a.indexOf(n) === i; });
          });
          return { children: out, responses: responses, sensitiveVisible: sens !== null };
        });
    });
  }

  /* ---- sharing reused medical answers with this event's leaders ----
     A family who said "still correct" gave their medical answers for an
     earlier event, so the record names that event. Only the site's
     safeguarding lead (or a master admin) can read it, so only they can
     put a copy where this event's leaders will find it. */
  function unshared(evId, siteId, responses) {
    var withMed = responses.filter(function (r) { return r.hasSensitive; });
    if (!withMed.length) return Promise.resolve([]);
    return listForEvent('sensitiveResponses', evId, [siteId]).then(function (s) {
      var have = {};
      s.forEach(function (d) { have[d.responseId] = 1; });
      return withMed.filter(function (r) { return !have[r.id]; });
    });
  }

  function shareWithLeaders(evId, siteId, responses) {
    var who = me();
    return Promise.all(responses.map(function (r) {
      return db().collection('sensitiveResponses').where('siteId', '==', siteId).where('responseId', '==', r.id).get().then(function (s) {
        var orig = s.docs.filter(function (d) { return !d.data().sharedFrom; })[0];
        if (!orig) return 0;
        var o = orig.data();
        return db().collection('sensitiveResponses').doc(EGBCEvents.key(32)).set({
          responseId: o.responseId, requestKey: o.requestKey, formId: o.formId, siteId: o.siteId, calEventId: evId,
          answers: o.answers, submittedAt: o.submittedAt || '', deleteAfter: o.deleteAfter || '',
          sharedFrom: orig.id, sharedBy: who.uid, sharedAt: new Date().toISOString()
        }).then(function () { return 1; });
      });
    })).then(function (n) { return n.reduce(function (a, b) { return a + b; }, 0); });
  }

  var api = {
    norm: norm, me: me, leadersOf: leadersOf, myLeadSites: myLeadSites,
    ageOn: ageOn, ratio: ratio, checkStatus: checkStatus, checksDue: checksDue, clearInTurn: clearInTurn, clearOne: clearOne, clearWords: clearWords,
    formsForEvent: formsForEvent, unshared: unshared, listForEvent: listForEvent, shareWithLeaders: shareWithLeaders
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCSafeguarding = api;

})(typeof window !== 'undefined' ? window : this);
