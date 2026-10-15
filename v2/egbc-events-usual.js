/* ===================================================================
   EGBC — "My usual people": who a person usually signs up (usualPeople)
   ===================================================================

   Martin, 15 Oct 2026: "remember who I usually sign up". For any church;
   the feature name is usualPeople (rule 12).

   SIGNED IN, from the person's OWN past sign-ups only (the signups list
   rule lets a person list only the ones with their own memberUid, so
   nobody else's can ever come back):
     - "Same as last time: Martin, Natasha and Daniel" from the most
       recent one: the names, the ticket (by its name), and the answers,
       which the page fills in FOR CHECKING, marked, and never sends
       unseen. A health answer (allergies, medical, dietary...) older
       than six months is not filled in at all.
     - their household's first names (the main window's myFamily, which
       gives first names only), as tick boxes
     - every name from their past sign-ups, offered as they type
     - "My usual people" to take a name off: signupUsual/{uid}.hidden,
       theirs alone (rules)
   SIGNED OUT: the last sign-up's NAMES on this device only (localStorage),
   with "Not you? Clear". Nothing is kept on the server for this.

   Nobody added is ever emailed: this only fills in the form.

   Needs (loaded before it): egbc-auth.js, egbc-events.js. Events window.
   =================================================================== */

(function (global) {
  'use strict';

  var LS = 'egbc_usual_v1';
  var SIX_MONTHS = 183 * 864e5;
  /* Questions whose answers are about someone's health. */
  var HEALTH = /allerg|medic|health|diet|food|intoleran|condition|asthma|epipen|epi-pen|needs|disab|diabet|epilep|first aid/i;

  function db() { return global.EGBCAuth.db; }
  function uid() { var u = global.EGBCAuth && EGBCAuth.user && EGBCAuth.user(); return u ? u.uid : ''; }
  function norm(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').slice(0, 120); }
  function key(s) { return norm(s).toLowerCase(); }
  function when(s) { var t = Date.parse(s && (s.createdAt || s.at) || ''); return isNaN(t) ? 0 : t; }
  /* "Martin, Natasha and Daniel" */
  function listWords(names) {
    names = names.filter(Boolean);
    return names.length < 2 ? (names[0] || '') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }
  function isHealth(label) { return HEALTH.test(String(label || '')); }
  function on() { return !(global.EGBCChurch && EGBCChurch.uses && EGBCChurch.uses('usualPeople') === false); }

  /* ---------------- this device (signed out) ---------------- */
  function deviceGet() {
    try { var x = JSON.parse(global.localStorage.getItem(LS) || 'null'); return x && Array.isArray(x.names) ? x : null; } catch (e) { return null; }
  }
  function deviceSave(names, ticketName) {
    try { global.localStorage.setItem(LS, JSON.stringify({ names: names.map(norm).filter(Boolean).slice(0, 20), ticketName: norm(ticketName), at: new Date().toISOString() })); } catch (e) {}
  }
  function deviceClear() { try { global.localStorage.removeItem(LS); } catch (e) {} }

  /* ---------------- the person's own (signed in) ---------------- */
  function hiddenRef() { return db().collection('signupUsual').doc(uid()); }
  function hiddenNames() { return hiddenRef().get().then(function (s) { return s.exists ? (s.data().hidden || []) : []; }, function () { return []; }); }
  /* Not saved on the server until the locked rules are on (F-203): until
     then anybody could read it. */
  function locked() { return global.EGBCLaunch ? EGBCLaunch.check().then(function (l) { return l; }) : Promise.resolve({ locked: false, opensOn: '' }); }
  function setHidden(list) {
    return locked().then(function (l) {
      if (!l.locked) throw new Error('You can take names off from ' + (l.opensOn || 'when the new church hub opens') + '.');
      return hiddenRef().set({ hidden: list.slice(-200), updatedAt: new Date().toISOString() });
    });
  }
  function hide(name) {
    return hiddenNames().then(function (h) { if (h.map(key).indexOf(key(name)) < 0) h.push(norm(name)); return setHidden(h); });
  }
  function unhide(name) {
    return hiddenNames().then(function (h) { return setHidden(h.filter(function (x) { return key(x) !== key(name); })); });
  }
  function mySignups() {
    return db().collection('signups').where('memberUid', '==', uid()).get().then(function (s) {
      return s.docs.map(function (d) { return Object.assign({ key: d.id }, d.data()); })
        .filter(function (x) { return x.status !== 'cancelled'; })
        .sort(function (a, b) { return when(b) - when(a); });
    });
  }
  /* Everyone they have signed up before, most recent first, without the
     ones they took off. */
  function pastNames(sus, hidden) {
    var seen = {}, out = [];
    sus.forEach(function (s) {
      (s.attendees || []).forEach(function (a) {
        var n = norm(a && a.name), k = key(n);
        if (n && !seen[k] && hidden.indexOf(k) < 0) { seen[k] = 1; out.push(n); }
      });
    });
    return out;
  }
  /* Their household's first names (the main window's myFamily). */
  function household() {
    if (!(global.EGBCAuth && EGBCAuth.call)) return Promise.resolve([]);
    return EGBCAuth.call('myFamily', {}).then(function (r) {
      return ((r && r.members) || []).map(function (m) { return norm(m.firstName); }).filter(Boolean);
    }, function () { return []; });
  }

  /* What last time looked like, in a form any event's questions can use:
     answers by question LABEL, since each event has its own questions. */
  function lastTime(s, hidden) {
    var out = { names: [], ticketName: '', booking: {}, people: {}, at: when(s), calEventId: s.calEventId || '' };
    out.names = (s.attendees || []).map(function (a) { return norm(a && a.name); })
      .filter(function (n) { return n && hidden.indexOf(key(n)) < 0; });
    if (!s.calEventId || !global.EGBCEvents || !EGBCEvents.load) return Promise.resolve(out);
    return EGBCEvents.load(s.calEventId).then(function (r) {
      if (!r) return out;
      var label = {};
      (r.questions || []).forEach(function (q) { label[q.id] = key(q.label); });
      var t = (r.ticketTypes || []).filter(function (x) { return x.id === s.ticketTypeId; })[0];
      out.ticketName = t ? norm(t.name) : '';
      Object.keys(s.answers || {}).forEach(function (id) { if (label[id] && norm(s.answers[id])) out.booking[label[id]] = norm(s.answers[id]); });
      (s.attendees || []).forEach(function (a) {
        var ans = {};
        Object.keys(a || {}).forEach(function (k) {
          var id = k.indexOf('q_') === 0 ? k.slice(2) : '';
          if (id && label[id] && norm(a[k])) ans[label[id]] = norm(a[k]);
        });
        if (Object.keys(ans).length) out.people[key(a.name)] = ans;
      });
      return out;
    }, function () { return out; });
  }

  /* Everything the sign-up form needs:
       { signedIn, last: { names, ticketName, booking, people, at } | null,
         names: [past names], household: [first names] } */
  function load() {
    if (!on()) return Promise.resolve({ signedIn: !!uid(), last: null, names: [], household: [] });
    if (!uid()) {
      var d = deviceGet();
      return Promise.resolve({ signedIn: false, device: !!d, last: d && d.names.length ? { names: d.names, ticketName: d.ticketName || '', booking: {}, people: {}, at: when(d) } : null, names: d ? d.names : [], household: [] });
    }
    return Promise.all([mySignups().catch(function () { return []; }), hiddenNames(), household()]).then(function (r) {
      var sus = r[0], hidden = r[1].map(key);
      var res = { signedIn: true, last: null, names: pastNames(sus, hidden), household: r[2].filter(function (n) { return hidden.indexOf(key(n)) < 0; }) };
      if (!sus.length) return res;
      return lastTime(sus[0], hidden).then(function (l) { res.last = l.names.length ? l : null; return res; });
    });
  }

  /* Should an answer from last time be filled in? Never a health answer
     more than six months old. */
  function mayFill(label, at, now) {
    if (!isHealth(label)) return true;
    return !!at && ((now || Date.now()) - at) <= SIX_MONTHS;
  }

  /* "My usual people": their past names, and the ones taken off. */
  function manage() {
    if (!uid()) return Promise.resolve({ names: [], hidden: [] });
    return Promise.all([mySignups().catch(function () { return []; }), hiddenNames(), locked()]).then(function (r) {
      return { names: pastNames(r[0], r[1].map(key)), hidden: r[1].map(norm), canSave: r[2].locked, opensOn: r[2].opensOn };
    });
  }

  global.EGBCUsual = {
    on: on, load: load, manage: manage, hide: hide, unhide: unhide, mayFill: mayFill, isHealth: isHealth,
    listWords: listWords, key: key, norm: norm,
    deviceGet: deviceGet, deviceSave: deviceSave, deviceClear: deviceClear,
    SIX_MONTHS: SIX_MONTHS
  };
})(typeof window !== 'undefined' ? window : this);
