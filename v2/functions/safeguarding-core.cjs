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
      .then(function (s) { return s.exists ? whoIs(s.data()) : null; })
      .catch(function () { return null; });
  }
  /* WHO EACH LEADER IS (S3; the spoofed-name fix, 26 Oct). leaderIds[i] is
     leader i's member id; leaderInfo keeps each named leader's name, role and
     sign-in by that id, and the rules hold it to exactly those ids. So a
     member's name always comes from leaderInfo, never from leaders[i], and can
     never sit beside someone else's checks. Someone not in the address book
     ('' in leaderIds) keeps their name from leaders[i]. An older record with
     no leaderInfo is read as before. */
  function whoIs(d) {
    if (!d || !Array.isArray(d.leaders) || !Array.isArray(d.leaderIds) || d.leaderIds.length !== d.leaders.length) return d;
    var info = d.leaderInfo && typeof d.leaderInfo === 'object' ? d.leaderInfo : null;
    return Object.assign({}, d, { leaders: d.leaders.map(function (l, i) {
      var id = d.leaderIds[i] || '', x = id && info ? info[id] : null;
      return x ? Object.assign({}, l, { memberId: id, name: String(x.name || ''), role: x.role || l.role || 'leader', uid: x.uid || '' }) : Object.assign({}, l, { memberId: id });
    }) });
  }
  /* a record's member ids and leaderInfo, worked out from what it holds (an
     older record gains them as it is next saved) */
  function shapeOf(d) {
    var ls = (d && d.leaders) || [], ids = d && Array.isArray(d.leaderIds) && d.leaderIds.length === ls.length ? d.leaderIds : ls.map(function (l) { return (l && l.memberId) || ''; });
    return { leaderIds: ids, leaderInfo: (d && d.leaderInfo) || leaderInfoOf((whoIs(Object.assign({}, d, { leaderIds: ids })) || {}).leaders) };
  }
  /* save a leaders record. Rules that don't know leaderInfo yet (the hub's
     live ones until the new rules go live) refuse it, so then the same save
     without it; the new rules refuse that, so nothing is weakened. */
  function putLeaders(ref, d, update) {
    var go = function (x) { return update ? ref.update(x) : ref.set(x); };
    return go(d).catch(function (e) {
      if (!(e && e.code === 'permission-denied' && d.leaderInfo)) throw e;
      var x = Object.assign({}, d); delete x.leaderInfo; return go(x);
    });
  }
  /* what a page writes beside leaders: each named leader's details by member id (the first, if someone is listed twice) */
  function leaderInfoOf(list) {
    var info = {};
    (list || []).forEach(function (l) { if (l && l.memberId && !info[l.memberId]) info[l.memberId] = { name: String(l.name || '').slice(0, 120), role: l.role || 'leader', uid: l.uid || '' }; });
    return info;
  }

  /* The sites this person is safeguarding lead or deputy for. */
  function myLeadSites() {
    /* View as: the lead is never previewed into (as the Menu). */
    if (EGBCEvents.viewing && EGBCEvents.viewing()) return Promise.resolve([]);
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
  /* THE OTHER CHECKS (S3, F-280 (a) and 10.3), shown beside DBS and training
     but not part of "cleared" (ok above), which the rules also work out:
     - level: the DBS check is Enhanced with the children's barred list
       ('ok'), another level ('not barred list'), or not recorded ('unknown')
     - reference: a church leader's reference, lasting referenceYears (3)
     - declaration: the confidential declaration, the same */
  var DBS_LEVELS = [['enhancedBarred', 'Enhanced, with the children’s barred list'], ['enhanced', 'Enhanced, without the barred list'], ['standard', 'Standard'], ['basic', 'Basic']];
  function checkExtras(c, o, onDate) {
    o = o || {}; c = c || {};
    var on = new Date(String(onDate || new Date().toISOString()).slice(0, 10) + 'T12:00'), yrs = o.referenceYears || 3;
    var dated = function (d) { return !d ? 'missing' : addYears(d, yrs) < on ? 'out of date' : 'ok'; };
    return { level: c.dbsLevel === 'enhancedBarred' ? 'ok' : c.dbsLevel ? 'not barred list' : 'unknown', reference: dated(c.referenceDate), declaration: dated(c.declarationDate) };
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
      var leaders = (whoIs(d) || d).leaders || [], cleared = (d.clearedIds || []).slice(), bad = [];
      var nameOf = function (id) { var l = leaders.filter(function (x) { return x.memberId === id; })[0]; return l ? l.name : id; };
      /* Someone with no address book record can never be cleared. */
      leaders.forEach(function (l) { if (!l.memberId) bad.push({ memberId: '', name: l.name, why: 'not in the address book' }); });
      var todo = (d.leaderIds || []).filter(function (id, i, a) { return id && cleared.indexOf(id) < 0 && a.indexOf(id) === i; });
      var save = function (ids) {
        return putLeaders(ref, Object.assign({ clearedIds: cleared.concat(ids), lastCleared: ids, updatedAt: new Date().toISOString(), updatedBy: w.uid }, shapeOf(d)), true)
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
      return putLeaders(ref, Object.assign({ clearedIds: c.concat([memberId]), lastCleared: [memberId], updatedAt: new Date().toISOString(), updatedBy: w.uid }, shapeOf(d)), true);
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

  /* WHAT THIS CHURCH CALLS ITS SAFEGUARDING LEAD (F-280 S2b): a parish says
     "Parish safeguarding officer", others "Designated safeguarding lead".
     Safeguarding settings keeps it (register.leadTitle); the pages say
     "safeguarding lead" in their own words, and lead() / leadIn() put the
     church's title in its place as they are shown - in text only, never an
     id or an attribute. Capitalised where the sentence starts with it. */
  var DEFAULT_LEAD = 'safeguarding lead', LEAD = DEFAULT_LEAD;
  function setLeadTitle(t) { t = String(t || '').replace(/\s+/g, ' ').trim().slice(0, 60); LEAD = t || DEFAULT_LEAD; return LEAD; }
  function leadTitle() { return LEAD; }
  /* the same text twice gives the same answer, even when the title itself
     says "safeguarding lead" ("Designated safeguarding lead"): the title's
     own words are set aside first, then put back */
  function lead(s) {
    s = String(s == null ? '' : s);
    if (LEAD === DEFAULT_LEAD || !/afeguarding lead/.test(s)) return s;
    var keep = [], own = new RegExp(LEAD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    s = s.replace(own, function (m) { keep.push(m); return '\u0000' + (keep.length - 1) + '\u0000'; });
    s = s.replace(/\b([Ss])afeguarding lead\b/g, function (m, c) { return c === 'S' ? LEAD.charAt(0).toUpperCase() + LEAD.slice(1) : LEAD; });
    return s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return keep[+i]; });
  }
  /* every piece of text under el (and the placeholders) */
  function leadIn(el) {
    if (LEAD === DEFAULT_LEAD || !el || typeof document === 'undefined') return el;
    /* a part of the page that names the words themselves (the setting) says data-nolead */
    var off = function (x) { var p = x.nodeType === 3 ? x.parentNode : x; return !!(p && p.closest && p.closest('[data-nolead]')); };
    if (off(el)) return el;
    if (el.nodeType === 3) { var v = lead(el.nodeValue); if (v !== el.nodeValue) el.nodeValue = v; return el; }
    if (!el.querySelectorAll) return el;
    var w = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */), n;
    while ((n = w.nextNode())) { if (off(n)) continue; var t = lead(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; }
    [].forEach.call(el.querySelectorAll('[placeholder]'), function (x) { if (off(x)) return; var p = lead(x.placeholder); if (p !== x.placeholder) x.placeholder = p; });
    return el;
  }
  /* once per page: now, and whatever the page draws or says later */
  function leadWatch(root) {
    root = root || (typeof document !== 'undefined' && document.body);
    return leadReady().then(function () {
      if (LEAD === DEFAULT_LEAD || !root || typeof MutationObserver === 'undefined') return;
      leadIn(root);
      new MutationObserver(function (ms) { ms.forEach(function (m) {
        if (m.type === 'characterData') leadIn(m.target);
        else [].forEach.call(m.addedNodes, leadIn);
      }); }).observe(root, { childList: true, subtree: true, characterData: true });
    });
  }
  /* read once per page: the settings are open to every volunteer */
  var leadP = null;
  function leadReady() {
    if (!leadP) leadP = (global.EGBCAuth && EGBCAuth.db ? EGBCAuth.db.collection('safeguardingSettings').doc('defaults').get()
      .then(function (d) { setLeadTitle(d.exists ? ((d.data().register || {}).leadTitle) : ''); return LEAD; }, function () { leadP = null; return LEAD; }) : Promise.resolve(LEAD));
    return leadP;
  }
  /* every page that loads this file: once someone is signed in (the settings need it), watch the page */
  if (typeof document !== 'undefined' && typeof setTimeout !== 'undefined') {
    var tries = 0;
    (function wait() {
      if (global.EGBCAuth && EGBCAuth.user && EGBCAuth.user() && document.body) { leadWatch(document.body); return; }
      if (++tries < 200) setTimeout(wait, 300);
    })();
  }

  var api = {
    whoIs: whoIs, leaderInfoOf: leaderInfoOf, shapeOf: shapeOf, putLeaders: putLeaders, checkExtras: checkExtras, DBS_LEVELS: DBS_LEVELS,
    lead: lead, leadIn: leadIn, leadReady: leadReady, leadWatch: leadWatch, setLeadTitle: setLeadTitle, leadTitle: leadTitle, DEFAULT_LEAD: DEFAULT_LEAD,
    norm: norm, me: me, leadersOf: leadersOf, myLeadSites: myLeadSites,
    ageOn: ageOn, ratio: ratio, checkStatus: checkStatus, checksDue: checksDue, clearInTurn: clearInTurn, clearOne: clearOne, clearWords: clearWords,
    formsForEvent: formsForEvent, unshared: unshared, listForEvent: listForEvent, shareWithLeaders: shareWithLeaders
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCSafeguarding = api;

})(typeof window !== 'undefined' ? window : this);
