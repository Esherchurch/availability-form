/* ===================================================================
   EGBC — building compliance: where it is kept (Stage 1; F-230)
   ===================================================================

   ATTACHED TO THE EXISTING PLACES. A building is a site (sites/<id>), a
   room is a room (rooms/<id>) - never a second list. Everything here is
   keyed by them:

     complianceTemplates/<id>      the global starter templates (versioned);
                                   written only by the seeding tool / server
     buildingProfiles/<siteId>     the building's answers
     buildingChecks/<siteId>__<templateId>  (or __c_<random> for the church's
                                   own) - THE CHURCH'S COPY of a check: its
                                   frequency, who is responsible, on / off
                                   (with a reason) / removed (no longer applies;
                                   its history kept). Editing it never touches
                                   the template.
     checkRecords/<id>             each time a check was done; never deleted
     buildingWork/<id>             building work (and other events a check
                                   waits for): { siteId, kind, on }
     roomProfiles/<roomId>         a room's kind (kitchen, hall, ...)
     fireEquipment/<id>            the extinguisher and fire blanket register
     complianceLog/<id>            every change: who, when, what (append only)
   FOLLOW-UP ACTIONS ARE MAINTENANCE JOBS (maintJobs), never a second list:
   a job may carry checkId, safety (the tick) and due.

   The functions take a Firestore `db` with the usual collection / doc /
   get / set / update - the page's (compat) and the server's (admin) both
   work. Due dates are never worked out here: that is egbc-compliance.js.
   =================================================================== */
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.EGBCComplianceStore = make();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function now() { return new Date().toISOString(); }
  function rid() { return Math.random().toString(36).slice(2, 12); }
  function checkId(siteId, templateId) { return siteId + '__' + templateId; }
  function all(s) { return s.docs.map(function (d) { var x = d.data(); x.id = d.id; return x; }); }

  function log(db, siteId, what, who, detail) {
    return db.collection('complianceLog').doc().set({ siteId: siteId, what: what, by: (who && who.uid) || '', byName: (who && who.name) || '', at: now(), detail: detail || {} });
  }

  /* The church's copy of a template, for one building. */
  function copyOf(t, siteId) {
    return { siteId: siteId, templateId: t.id, templateVersion: t.version || 1, area: t.area, title: t.title, every: t.every || {}, kind: t.kind || 'check',
      basis: t.basis || (t.legal ? 'legal' : 'practice'), legal: t.basis === 'legal' || !!t.legal, baseEvery: t.every || {}, lengthenReason: '', note: t.note || '', state: 'on', offReason: '', responsibleIds: [], custom: false, edited: [], createdAt: now(), updatedAt: now() };
  }

  /* THE BUILDING'S ANSWERS: saved, then its checks follow them - a new answer
     adds the checks it needs; a changed one marks those that no longer apply
     'removed' (history kept) or brings them back. */
  function applyProfile(db, E, siteId, answers, templates, who) {
    var ref = db.collection('buildingProfiles').doc(siteId);
    return db.collection('buildingChecks').where('siteId', '==', siteId).get().then(function (s) {
      var checks = all(s), r = E.reconcile(answers, templates, checks), jobs = [];
      jobs.push(ref.set(Object.assign({}, answers, { siteId: siteId, updatedBy: (who && who.uid) || '', updatedAt: now() })));
      r.add.forEach(function (t) { jobs.push(db.collection('buildingChecks').doc(checkId(siteId, t.id)).set(copyOf(t, siteId))); });
      r.remove.forEach(function (c) { jobs.push(db.collection('buildingChecks').doc(c.id).update({ state: 'removed', updatedAt: now() })); });
      r.restore.forEach(function (c) { jobs.push(db.collection('buildingChecks').doc(c.id).update({ state: 'on', updatedAt: now() })); });
      jobs.push(log(db, siteId, 'profile', who, { added: r.add.map(function (t) { return t.id; }), removed: r.remove.map(function (c) { return c.templateId; }), restored: r.restore.map(function (c) { return c.templateId; }) }));
      return Promise.all(jobs).then(function () { return { added: r.add.length, removed: r.remove.length, restored: r.restore.length }; });
    });
  }

  /* THE CHURCH CHANGES ITS COPY: the frequency, who is responsible, switching
     it off (a reason is needed) or on. Never the template.
     A frequency is checked against the law or standard (E.allowEvery, with the
     template as it is now): a 'Legal requirement' is never made less frequent;
     a 'Recommended standard' is lengthened only with a reason, which is kept.
     The rules refuse the same. */
  function editCheck(db, id, changes, who, E) {
    var ok = {}, edited = [];
    if (changes.every) { ok.every = { n: Math.max(1, +changes.every.n || 1), unit: changes.every.unit }; if (changes.every.trigger) { ok.every.trigger = changes.every.trigger; ok.every.triggerWords = changes.every.triggerWords || ''; } edited.push('every'); }
    if (changes.responsibleIds) { ok.responsibleIds = changes.responsibleIds.slice(0, 10); edited.push('responsible'); }
    if (changes.title) { ok.title = String(changes.title).slice(0, 140); edited.push('title'); }
    if (changes.state === 'off') {
      if (!String(changes.offReason || '').trim()) return Promise.reject(new Error('Say why it is switched off.'));
      ok.state = 'off'; ok.offReason = String(changes.offReason).slice(0, 300); edited.push('off');
    }
    if (changes.state === 'on') { ok.state = 'on'; ok.offReason = ''; edited.push('on'); }
    var ref = db.collection('buildingChecks').doc(id);
    return ref.get().then(function (d) {
      if (!d.exists) throw new Error('No such check.');
      var c = d.data();
      if (ok.state === 'off' && (c.basis === 'legal' || c.legal)) throw new Error('This is a legal requirement: it cannot be switched off. If it does not apply to this building, change the answers about the building.');
      if (!ok.every || !c.templateId) return c;
      return db.collection('complianceTemplates').doc(c.templateId).get().then(function (t) { return t.exists ? t.data() : null; }, function () { return null; }).then(function (tpl) {
        var base = tpl ? tpl.every : (c.baseEvery || c.every), basis = tpl ? (tpl.basis || (tpl.legal ? 'legal' : 'practice')) : (c.basis || 'practice');
        var why = E ? E.allowEvery(basis, base, ok.every, changes.reason) : null;
        if (!E && basis !== 'practice') why = 'The frequency cannot be checked here.';
        if (why) throw new Error(why);
        ok.lengthenReason = E && E.days(ok.every) > E.days(base) ? String(changes.reason || '').slice(0, 300) : '';
        return c;
      });
    }).then(function (c) {
      ok.edited = Array.from(new Set((c.edited || []).concat(edited)));
      ok.updatedAt = now();
      return ref.update(ok).then(function () { return log(db, c.siteId, 'edit', who, { checkId: id, changes: edited, reason: ok.lengthenReason || '' }); });
    });
  }

  /* The church's own check. */
  function addCustomCheck(db, siteId, f, who) {
    var id = siteId + '__c_' + rid();
    var c = { siteId: siteId, templateId: '', templateVersion: 0, area: String(f.area || 'Other').slice(0, 60), title: String(f.title || '').slice(0, 140), every: f.every || { n: 1, unit: 'year' },
      kind: 'check', basis: 'practice', legal: false, baseEvery: f.every || { n: 1, unit: 'year' }, lengthenReason: '', note: String(f.note || '').slice(0, 300), state: 'on', offReason: '', responsibleIds: (f.responsibleIds || []).slice(0, 10), custom: true, edited: [], createdAt: now(), updatedAt: now() };
    if (!c.title) return Promise.reject(new Error('Give the check a name.'));
    return db.collection('buildingChecks').doc(id).set(c).then(function () { return log(db, siteId, 'add', who, { checkId: id }); }).then(function () { return id; });
  }

  /* DONE: the date it was actually done (the next one is worked out from it),
     who, notes, files, a certificate's own expiry, and for the register the
     items ticked. Never deleted. */
  function recordDone(db, check, r, who) {
    var rec = { checkId: check.id, siteId: check.siteId, doneOn: String(r.doneOn).slice(0, 10), doneBy: (who && who.uid) || '', doneByName: (who && who.name) || '',
      notes: String(r.notes || '').slice(0, 2000), files: (r.files || []).slice(0, 10), certExpiry: r.certExpiry ? String(r.certExpiry).slice(0, 10) : '', items: (r.items || []).slice(0, 200),
      jobId: r.jobId || '', at: now() };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.doneOn)) return Promise.reject(new Error('Give the date it was done.'));
    var ref = db.collection('checkRecords').doc();
    return ref.set(rec).then(function () { return log(db, check.siteId, 'done', who, { checkId: check.id, recordId: ref.id, doneOn: rec.doneOn }); }).then(function () { return ref.id; });
  }

  /* Building work (and anything else an on-demand check waits for). */
  function recordWork(db, siteId, kind, on, note, who) {
    var ref = db.collection('buildingWork').doc();
    return ref.set({ siteId: siteId, kind: kind || 'buildingWork', on: String(on).slice(0, 10), note: String(note || '').slice(0, 300), by: (who && who.uid) || '', at: now() })
      .then(function () { return log(db, siteId, 'work', who, { kind: kind, on: on }); });
  }

  /* Template updates: the church's copies made from an older version. They
     FOLLOW AUTOMATICALLY (Martin, 19 Oct): the engine's effective() shows the
     new guidance at once, to everyone; followTemplates() then writes it to the
     copies (on an admin's visit, or the seeding tool), logged - the church's
     stricter frequency kept, with a note. No confirmation step. */
  function templateUpdates(templates, checks) {
    var by = {}; (templates || []).forEach(function (t) { by[t.id] = t; });
    return (checks || []).filter(function (c) { var t = by[c.templateId]; return t && !c.custom && (t.version || 1) > (c.templateVersion || 1); })
      .map(function (c) { return { check: c, template: by[c.templateId] }; });
  }
  function applyUpdate(db, E, check, t, who) {
    var e = E.effective(check, t);
    var ch = { templateVersion: t.version || 1, updatedAt: now(), note: e.note || '', basis: e.basis, legal: e.basis === 'legal', baseEvery: t.every || {}, every: e.every, title: e.title, area: e.area || check.area || '' };
    if (e.every !== check.every && E.days(e.every) !== E.days(check.every)) ch.lengthenReason = '';
    return db.collection('buildingChecks').doc(check.id).update(ch).then(function () { return log(db, check.siteId, 'template', who, { checkId: check.id, version: t.version, guidance: e.guidance || '' }); });
  }
  function followTemplates(db, E, templates, checks, who) {
    var ups = templateUpdates(templates, checks);
    return ups.reduce(function (p, u) { return p.then(function () { return applyUpdate(db, E, u.check, u.template, who); }); }, Promise.resolve()).then(function () { return ups.length; });
  }

  /* Everything one building needs, read once, then THE schedule. */
  function load(db, siteId) {
    var q = function (c) { return db.collection(c).where('siteId', '==', siteId).get().then(all); };
    return Promise.all([db.collection('buildingProfiles').doc(siteId).get(), q('buildingChecks'), q('checkRecords'), q('maintJobs'), q('buildingWork'), q('fireEquipment')])
      .then(function (r) { return { profile: r[0].exists ? r[0].data() : {}, checks: r[1], records: r[2], jobs: r[3], triggers: r[4], equipment: r[5] }; });
  }

  /* MAY THESE PAGES BE USED, AND MAY THEY SAVE ANYTHING PRIVATE? (the
     reviewing window, 19 Oct; F-235)
       on      the church uses the add-on: EGBCAuth.uses('buildingCompliance'),
               the same answer as the server's (F-239). Off, the four
               pages (compliance, building, risk, peep) show nothing else.
       locked  the locked rules are on: churchSettings/launch.rulesLocked
               exactly true (egbc-launch.js, as the other private forms).
               UNTIL THEN THE LIVE DATABASE IS READABLE SIGNED OUT, so no
               private write: no evacuation plan, no uploaded report or
               certificate, no hazard, no check record. The pages say why,
               with nothing to type into or upload.
     Anything missing or unreadable: off, and not locked. */
  function gate(db, launch) {
    /* The switch: EGBCAuth's answer, the same as the server's (F-239). */
    var A = typeof EGBCAuth !== 'undefined' ? EGBCAuth : null;
    var feat = A && A.uses ? Promise.resolve(A.reloadFeatures ? A.reloadFeatures() : null).then(function () { return A.uses('buildingCompliance'); }, function () { return A.uses('buildingCompliance'); }) : Promise.resolve(false);
    var lock = launch && launch.check ? launch.check().then(function (x) { return x || {}; }, function () { return {}; }) : Promise.resolve({});
    return Promise.all([feat, lock]).then(function (r) { return { on: r[0], locked: r[1].locked === true, opensOn: r[1].opensOn || '' }; });
  }
  var OFF_WORDS = 'Building compliance is not switched on for this church.';
  function heldWords(what, opensOn) {
    return what + ' can be saved here ' + (opensOn ? 'from ' + opensOn : 'when the church switches over to the new hub') +
      '. Until then the hub’s database is not yet private, so nothing is saved here. Keep your paper record for now.';
  }

  /* CHECKS DUE FOR ME (for the app's Building home; the main window, F-241).
     The checks given to this person (their memberId in responsibleIds), as
     the schedule sees them today: overdue first, then due soon, then not
     recorded yet. Only what the rules let them read - their own checks and
     those checks' records - so it works for Val as for the office.
       dueForMe(db, E, memberId, { today, templates, all })
         -> Promise of [{ id, title, siteId, siteName, due, rag, why, basisLabel }]
     all: true includes the in-date ones too (green), last. */
  function dueForMe(db, E, memberId, o) {
    o = o || {};
    if (!memberId) return Promise.resolve([]);
    var today = o.today || new Date().toISOString().slice(0, 10);
    return db.collection('buildingChecks').where('responsibleIds', 'array-contains', memberId).get().then(function (s) {
      var checks = all(s).filter(function (c) { return c.state === 'on'; });
      var sites = Array.from(new Set(checks.map(function (c) { return c.siteId; })));
      return Promise.all([
        Promise.all(checks.map(function (c) { return db.collection('checkRecords').where('checkId', '==', c.id).get().then(all, function () { return []; }); })),
        Promise.all(sites.map(function (id) { return db.collection('sites').doc(id).get().then(function (d) { return [id, d.exists ? (d.data().name || id) : id]; }, function () { return [id, id]; }); })),
        Promise.all(checks.map(function (c) { return db.collection('maintJobs').where('checkId', '==', c.id).get().then(all, function () { return []; }); }))
      ]).then(function (r) {
        var records = [].concat.apply([], r[0]), names = {}, jobs = [].concat.apply([], r[2]), out = [];
        r[1].forEach(function (x) { names[x[0]] = x[1]; });
        sites.forEach(function (site) {
          E.schedule({ profile: {}, templates: o.templates || [], checks: checks.filter(function (c) { return c.siteId === site; }), records: records,
            jobs: jobs.filter(function (j) { return j.siteId === site; }), triggers: [], today: today }).items.forEach(function (i) {
            if (i.state !== 'on' || (!o.all && i.rag === 'green')) return;
            out.push({ id: i.id, title: i.title, siteId: site, siteName: names[site], due: i.nextDue || '', rag: i.rag, why: i.why, basisLabel: i.basisLabel || '' });
          });
        });
        var order = { red: 0, amber: 1, green: 2, grey: 3 };
        return out.sort(function (a, b) { return order[a.rag] - order[b.rag] || String(a.due || '9').localeCompare(String(b.due || '9')); });
      });
    });
  }

  return { dueForMe: dueForMe, gate: gate, OFF_WORDS: OFF_WORDS, heldWords: heldWords, checkId: checkId, copyOf: copyOf, applyProfile: applyProfile, editCheck: editCheck, addCustomCheck: addCustomCheck, recordDone: recordDone,
    recordWork: recordWork, templateUpdates: templateUpdates, applyUpdate: applyUpdate, followTemplates: followTemplates, load: load };
});
