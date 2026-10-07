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

  /* A list the rules can allow in more than one way. A leader may ask for
     everything for their event; a safeguarding lead may only ask for their
     own site's, and the question has to say so or the whole list is
     refused. So: ask for the event, and if that is refused, ask once per
     site this person might lead. Whatever comes back is merged. */
  function listForEvent(col, evId, siteIds) {
    var seen = {}, out = [];
    function add(snap) { snap.docs.forEach(function (d) { if (!seen[d.id]) { seen[d.id] = 1; out.push(Object.assign({ _id: d.id }, d.data())); } }); }
    return db().collection(col).where('calEventId', '==', evId).get().then(add).catch(function () {
      return Promise.all((siteIds || []).filter(Boolean).map(function (sid) {
        return db().collection(col).where('calEventId', '==', evId).where('siteId', '==', sid).get().then(add).catch(function () {});
      })).then(function () { if (!out.length) out.denied = true; });
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
    return listForEvent('formRequests', evId, siteIds).then(function (reqs) {
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
    ageOn: ageOn, ratio: ratio, checkStatus: checkStatus,
    formsForEvent: formsForEvent, unshared: unshared, listForEvent: listForEvent, shareWithLeaders: shareWithLeaders
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCSafeguarding = api;

})(typeof window !== 'undefined' ? window : this);
