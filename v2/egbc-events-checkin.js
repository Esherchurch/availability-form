/* ===================================================================
   EGBC — check-in and attendance, the shared part (events window)
   ===================================================================

   checkin.html, attendance.html and the confirmation email all need the
   same answers: what a person's QR code says, who is expected, who is in
   the building, who may collect a child. They live here so there is one
   answer to each.

   THREE THINGS WORTH KNOWING BEFORE CHANGING ANY OF IT

   1. A check-in's document id is worked out, never random:
        <calEventId>__<signupKey>__<attendee number>
      Two phones scanning the same child at the same moment both write to
      the same document, and the rules refuse to check someone in who is
      already in. That is what stops a double count - not the page. Walk-ins
      and leaders get a made-up signupKey (w_… / l_…) so the same shape holds.

   2. The QR code carries the first 10 characters of the sign-up key, not
      the whole key. The whole key is the manage link: a code held up at the
      door, or photographed, must not let anyone cancel the booking. Ten
      characters is still far too many to guess (about 52 bits).

   3. Nothing here decides who may see what. The rules do. Everything that
      reads a check-in needs an admin today (FINDINGS-events.md F-024).
   =================================================================== */

(function (global) {
  'use strict';

  var PREFIX = 'EGBC1';
  var KEY_PART = 10;

  /* ---- the code on the ticket ---- */

  function codeFor(calEventId, signupKey, index) {
    return PREFIX + '|' + calEventId + '|' + String(signupKey).slice(0, KEY_PART) + '|' + (index || 0);
  }

  function parseCode(text) {
    var p = String(text || '').trim().split('|');
    if (p.length !== 4 || p[0] !== PREFIX) return null;
    var i = parseInt(p[3], 10);
    if (!p[1] || p[2].length !== KEY_PART || isNaN(i) || i < 0) return null;
    return { calEventId: p[1], keyPart: p[2], index: i };
  }

  function checkinId(calEventId, signupKey, index) {
    return calEventId + '__' + signupKey + '__' + (index || 0);
  }

  /* ---- who is expected ----------------------------------------------
     One row per person, not per booking: a family of five is five rows,
     five codes and five ticks on the register. A booking with no names
     (older ones, or one place) is one row in the booker's name. */

  function answerText(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v);
  }

  /* "Nothing", "none", "n/a" and "no" are answers, not flags. Anything
     else written into a question marked as a flag is shown at the door. */
  function meaningful(v) {
    var s = answerText(v).trim();
    return !!s && !/^(no|none|nothing|n\/?a|nil|-|no thanks?)\.?$/i.test(s);
  }

  function splitNames(s) {
    return answerText(s).split(/\s*(?:,|;|\n|\band\b|&)\s*/i)
      .map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  /* Which questions count as medical for downloads (F-029, Martin's
     decision): any marked as a flag in Check-in settings, and any whose
     wording says it is about health - so an allergy question nobody
     remembered to mark is still left out unless "include medical details"
     is ticked. Leaving out too much is the safe way to be wrong. */
  var MEDICAL_WORDS = /allerg|medic|health|condition|asthma|diabet|epilep|epi-?pen|disabilit|additional need|first aid/i;
  function isMedical(q, settings) {
    if (!q) return false;
    if (((settings || {}).flagQuestionIds || []).indexOf(q.id) >= 0) return true;
    return MEDICAL_WORDS.test(q.label || '');
  }

  function questionAnswer(su, att, q) {
    if (!q) return '';
    if (q.per === 'attendee') return att ? att['q_' + q.id] : '';
    return (su.answers || {})[q.id];
  }

  function people(calEventId, signups, questions, settings) {
    settings = settings || {};
    var qs = questions || [];
    var collQ = qs.filter(function (q) { return q.id === settings.collectorsQuestionId; })[0];
    var flagQs = qs.filter(function (q) { return (settings.flagQuestionIds || []).indexOf(q.id) >= 0; });
    var rows = [];
    (signups || []).forEach(function (su) {
      if (su.status !== 'confirmed') return;
      var key = su.key || su.id;
      var atts = (su.attendees && su.attendees.length) ? su.attendees : [{ name: su.name }];
      atts.forEach(function (a, i) {
        rows.push({
          id: checkinId(calEventId, key, i),
          code: codeFor(calEventId, key, i),
          signupKey: key,
          index: i,
          name: a.name || su.name,
          bookedBy: su.name,
          email: su.email || '',
          phone: su.phone || '',
          ticketTypeId: su.ticketTypeId || '',
          walkIn: /^walk-in/i.test(su.notes || ''),
          attended: !!su.attended,
          collectors: collQ ? splitNames(questionAnswer(su, a, collQ)) : [],
          flags: flagQs.map(function (q) {
            var v = questionAnswer(su, a, q);
            return meaningful(v) ? { label: q.label, value: answerText(v) } : null;
          }).filter(Boolean),
          answer: function (q) { return answerText(questionAnswer(su, a, q)); }
        });
      });
    });
    return rows;
  }

  /* A collector is "listed" when their name matches one written on the
     booking, ignoring case, spacing and punctuation. Anyone else can still
     collect - a leader may know them - but the screen says so, a reason
     is required, and the rules insist on that reason. */
  function isListedCollector(name, collectors) {
    var n = norm(name);
    if (!n) return false;
    return (collectors || []).some(function (c) { return norm(c) === n; });
  }

  /* ---- counting ------------------------------------------------------ */

  function headcount(rows, checkins) {
    var byId = {};
    (checkins || []).forEach(function (c) { byId[c.id] = c; });
    var out = { expected: rows.length, inNow: 0, notArrived: 0, out: 0, walkIns: 0, leadersIn: 0 };
    rows.forEach(function (r) {
      var c = byId[r.id];
      if (!c) out.notArrived++;
    });
    (checkins || []).forEach(function (c) {
      if (c.kind === 'leader') { if (c.state === 'in') out.leadersIn++; return; }
      if (c.kind === 'walkin') out.walkIns++;
      if (c.state === 'in') out.inNow++;
      else if (c.state === 'out') out.out++;
    });
    return out;
  }

  /* ---- writing ------------------------------------------------------- */

  function db() { return EGBCAuth.db; }
  function me() {
    var u = (EGBCAuth.user && EGBCAuth.user()) || {};
    return { uid: u.uid || '', name: ((EGBCAuth.profile && EGBCAuth.profile()) || {}).name || '' };
  }
  function now() { return new Date().toISOString(); }
  function today() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function roomOf(ev) { return ((ev.location || {}).roomIds || [])[0] || ''; }

  /* First arrival creates the record; coming back after being checked out
     updates it. Arriving twice is refused by the rules, and the page turns
     that refusal into "already in". */
  function checkIn(ev, row, existing) {
    var who = me(), at = now();
    var ref = db().collection('checkins').doc(row.id);
    if (existing) {
      return ref.update({ state: 'in', inAt: at, inBy: who.uid, inByName: who.name, day: today(), updatedAt: at });
    }
    return ref.set({
      calEventId: ev.id, signupKey: row.signupKey, attendeeIndex: row.index,
      name: row.name, kind: row.kind || 'booked', state: 'in',
      inAt: at, inBy: who.uid, inByName: who.name,
      roomId: roomOf(ev), day: today(), updatedAt: at
    });
  }

  function checkOut(row, o) {
    var who = me(), at = now();
    o = o || {};
    return db().collection('checkins').doc(row.id).update({
      state: 'out', outAt: at, outBy: who.uid, outByName: who.name,
      collectedBy: o.collectedBy || '', collectorListed: !!o.listed,
      overrideReason: o.reason || '', updatedAt: at
    });
  }

  /* A walk-in is a real sign-up, written exactly as signUp() writes one,
     so the capacity rule counts it: when the event is full the batch is
     refused. An event with no sign-ups has no counter to keep, so there
     the walk-in is a check-in alone. A leader is never a sign-up. */
  function walkIn(ev, o) {
    var who = me(), at = now();
    var leader = o.kind === 'leader';
    var key = (leader ? 'l_' : 'w_') + EGBCEvents.key(30);
    var id = checkinId(ev.id, key, 0);
    var ck = {
      calEventId: ev.id, signupKey: key, attendeeIndex: 0, name: o.name,
      kind: leader ? 'leader' : 'walkin', state: 'in',
      inAt: at, inBy: who.uid, inByName: who.name,
      roomId: roomOf(ev), day: today(), updatedAt: at
    };
    if (leader) return db().collection('checkins').doc(id).set(ck).then(function () { return { id: id }; });

    var capRef = db().collection('capacity').doc(ev.id);
    return capRef.get().then(function (c) {
      var batch = db().batch();
      if (c.exists) {
        var personId = 'c_' + EGBCEvents.key(16);
        batch.set(db().collection('contacts').doc(personId), {
          name: o.name, email: (o.email || '').toLowerCase().trim(), phone: o.phone || '',
          source: 'signup', createdAt: at
        });
        batch.set(db().collection('signups').doc(key), {
          calEventId: ev.id, personKind: 'contacts', personId: personId,
          name: o.name, email: (o.email || '').toLowerCase().trim(), phone: o.phone || '',
          attendees: [{ name: o.name }], answers: {}, places: 1, ticketTypeId: '',
          status: 'confirmed', donation: 0, notes: 'Walk-in at the door', memberUid: '', createdAt: at
        });
        batch.update(capRef, { taken: (c.data().taken || 0) + 1 });
      }
      batch.set(db().collection('checkins').doc(id), ck);
      return batch.commit().then(function () { return { id: id, counted: c.exists }; });
    });
  }

  /* ---- downloads -----------------------------------------------------
     A download that holds a flagged (medical, allergy) column is logged
     BEFORE the file is made. If the log cannot be written, there is no
     file: an unlogged download of sensitive data is the thing to prevent. */
  function logDownload(o) {
    var who = me();
    return db().collection('downloadsLog').add({
      by: who.uid, byName: who.name, at: now(),
      calEventId: o.calEventId || '', what: o.what || '', format: o.format || '',
      columns: o.columns || [], sensitive: !!o.sensitive
    });
  }

  function csvText(head, rows) {
    return [head].concat(rows).map(function (r) {
      return r.map(function (c) {
        var s = String(c == null ? '' : c);
        /* A cell starting = + - @ is a formula to Excel. Names and answers
           come from the public form, so neutralise them. */
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
  }

  function saveFile(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  var api = {
    codeFor: codeFor, parseCode: parseCode, checkinId: checkinId,
    people: people, isListedCollector: isListedCollector, splitNames: splitNames,
    meaningful: meaningful, answerText: answerText, headcount: headcount, isMedical: isMedical,
    checkIn: checkIn, checkOut: checkOut, walkIn: walkIn, today: today,
    logDownload: logDownload, csvText: csvText, saveFile: saveFile, KEY_PART: KEY_PART
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCCheckin = api;

})(typeof window !== 'undefined' ? window : this);
