/* ===================================================================
   EGBC — Sunday kids registration, the shared part (Chunk 6)
   ===================================================================

   kids-admin.html (stage 1) and the family check-in (stage 2) share these
   answers. Built on what is already there, as the brief asks (§6.14):

   - REGISTRATION IS THE PARENT CONSENT FORM (E2, the "parent" template):
     each child's name, date of birth, school year, medical needs, allergies,
     photo and first-aid consent; the parent's phone, emergency contacts and
     who may collect. It lasts the school year. A completed form becomes a
     family and its children here; nothing is typed twice.
   - THE MEDICAL DETAIL STAYS WHERE E2 PUT IT, in the private half of the
     answer (sensitiveResponses). A child carries only "has allergies" and
     "has medical needs" flags, and a pointer to that private half, which
     the children's team may open.
   - CHECK-IN (stage 2) IS E1's check-in, a session per group per Sunday
     (sessionId below; the writes are in egbc-events-checkin.js).

   Nothing here reads or writes the database.
   =================================================================== */

(function (global) {
  'use strict';

  var YEARS = ['Pre-school', 'Reception', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6',
               'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13'];
  var DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  /* "none", "no", "n/a" are answers, not flags (the same test as E1). */
  function meaningful(v) {
    var s = (Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v)).trim();
    return !!s && !/^(no|none|nothing|n\/?a|nil|-|no thanks?)\.?$/i.test(s);
  }
  function splitNames(s) {
    return String(s || '').split(/\s*(?:,|;|\n|\band\b|&)\s*/i).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  /* Age in whole years on a day (YYYY-MM-DD). */
  function ageOn(dob, day) {
    if (!dob) return null;
    var b = String(dob).slice(0, 10).split('-').map(Number), d = String(day).slice(0, 10).split('-').map(Number);
    var a = d[0] - b[0]; if (d[1] < b[1] || (d[1] === b[1] && d[2] < b[2])) a--;
    return a;
  }
  /* The school year a child is in on a day, from their date of birth
     (England: the year runs from 1 September; Reception is the year they
     turn 5). Used when a form leaves the school year blank, and to move
     children up each September. */
  function yearFor(dob, day) {
    if (!dob) return '';
    var b = String(dob).slice(0, 10).split('-').map(Number), d = String(day).slice(0, 10).split('-').map(Number);
    var acadStart = d[1] >= 9 ? d[0] : d[0] - 1;                 /* the September this school year began */
    var cohort = b[1] >= 9 ? b[0] + 1 : b[0];                    /* born Sep..Aug counts with the next year */
    var n = acadStart - cohort - 4;                              /* 0 = Reception */
    if (n < 0) return 'Pre-school';
    if (n === 0) return 'Reception';
    return n <= 13 ? 'Year ' + n : '';
  }

  /* Which group a child belongs in: the first active group whose school
     years include theirs. A child's own group (set by hand) wins. */
  function groupFor(child, groups) {
    if (child.groupFixed && child.groupId) return child.groupId;
    var y = child.year || '';
    var g = (groups || []).filter(function (x) { return x.active !== false && (x.years || []).indexOf(y) >= 0; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })[0];
    return g ? g.id : '';
  }

  /* A short code for a family: their QR code, and the matching code on a
     collection label. No 0/O, 1/I/L: read aloud at a door. */
  var ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function familyCode(rand) {
    var out = '', a = rand || (global.crypto && global.crypto.getRandomValues ? global.crypto.getRandomValues(new Uint8Array(6)) : null);
    for (var i = 0; i < 6; i++) out += ALPHA[(a ? a[i] : Math.floor(Math.random() * 256)) % ALPHA.length];
    return out;
  }

  /* A completed registration form, as a family and its children.
     answers: the ordinary half; sens: the private half (may be null if the
     person adding cannot read it - then the flags are unknown, not "none"). */
  function fromResponse(resp, sens, groups, today) {
    var a = resp.answers || {}, s = (sens && sens.answers) || null;
    var family = {
      parentName: String(a.parentName || resp.name || '').slice(0, 120), phone: String(a.parentPhone || '').slice(0, 40),
      email: String(resp.email || '').toLowerCase(), emergency: String(a.emergency || '').slice(0, 500),
      collectors: splitNames(a.collectors).slice(0, 20)
    };
    if (family.parentName && family.collectors.map(norm).indexOf(norm(family.parentName)) < 0) family.collectors.unshift(family.parentName);
    var kids = (a.children || []).map(function (row, i) {
      var p = (s && s.children && s.children[i]) || {};
      var c = { name: String(row.name || '').slice(0, 120), dob: row.dob || '', year: row.year || yearFor(row.dob, today), dietary: row.dietary || '',
        /* An answer may be in either half: "first aid" counts as medical (F-038), so it is private. */
        photo: yes(row.photo, p.photo), firstaid: yes(row.firstaid, p.firstaid), alone: yes(row.alone, p.alone),
        flags: s ? { allergies: meaningful(p.allergies), medical: meaningful(p.medical) || meaningful(p.medication) || meaningful(p.needs) } : null,
        medicalIndex: i };
      c.groupId = groupFor(c, groups);
      return c;
    }).filter(function (c) { return c.name; });
    return { family: family, children: kids };
  }

  function yes(a, b) { var v = a !== undefined && a !== '' ? a : b; return v === true || v === 'Yes'; }

  /* Is a child's consent in date on a day? */
  function consentOk(child, day) { return !!child.consentUntil && child.consentUntil >= String(day).slice(0, 10); }

  /* ---- Sunday check-in (stage 2) ----
     A session is one group on one day, and it is E1's check-in: its
     calEventId is "kids_<groupId>_<YYYY-MM-DD>" and each child is one
     check-in record, id "<session>__<childId>__0" (the rules insist). */
  function sessionId(groupId, day) { return 'kids_' + groupId + '_' + String(day).slice(0, 10); }
  function checkinIdFor(childId, groupId, day) { return sessionId(groupId, day) + '__' + childId + '__0'; }

  /* The collection code: four characters, the same on every one of a
     family's labels that morning and on the parent's slip. Anyone may
     collect with it; without it, only someone on the child's list. */
  function pickupCode(rand) {
    var a = rand || (global.crypto && global.crypto.getRandomValues ? global.crypto.getRandomValues(new Uint8Array(4)) : null), out = '';
    for (var i = 0; i < 4; i++) out += ALPHA[(a ? a[i] : Math.floor(Math.random() * 256)) % ALPHA.length];
    return out;
  }
  /* A typed code: capitals, no spaces or dashes. (Codes never use 0, O, 1, I or L.) */
  function cleanCode(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

  /* The family's QR code says only this: no name, nothing else. Shown on the
     parent's slip, it finds the family at the desk next week. */
  var QR_PREFIX = 'EGBCK1';
  function familyQR(code) { return QR_PREFIX + '|' + code; }
  function parseFamilyQR(text) {
    var p = String(text || '').trim().split('|');
    return p.length === 2 && p[0] === QR_PREFIX && /^[A-Z2-9]{6}$/.test(p[1]) ? p[1] : '';
  }

  function digits(s) { return String(s || '').replace(/\D/g, '').replace(/^44/, '0'); }

  /* Families at the desk: by a child's or parent's name, the parent's phone
     (any 4 or more digits of it), or the family code (typed or scanned).
     Returns [{ familyId, parentName, phone, familyCode, children: [...] }]. */
  function findFamilies(children, q) {
    var code = parseFamilyQR(q) || (/^[A-Za-z2-9]{6}$/.test(String(q || '').trim()) ? String(q).trim().toUpperCase() : '');
    var n = norm(q), d = digits(q), fams = {}, order = [];
    if (!n && !code) return [];
    (children || []).forEach(function (c) {
      if (c.status === 'left') return;
      var hit = (code && c.familyCode === code) || (n.length >= 2 && (norm(c.name).indexOf(n) >= 0 || norm(c.parentName).indexOf(n) >= 0)) ||
                (d.length >= 4 && digits(c.phone).indexOf(d) >= 0);
      if (hit && !fams[c.familyId]) { fams[c.familyId] = { familyId: c.familyId, parentName: c.parentName || '', phone: c.phone || '', familyCode: c.familyCode || '', children: [] }; order.push(c.familyId); }
    });
    (children || []).forEach(function (c) { if (fams[c.familyId] && c.status !== 'left') fams[c.familyId].children.push(c); });
    return order.map(function (id) { fams[id].children.sort(function (a, b) { return a.name.localeCompare(b.name); }); return fams[id]; });
  }

  /* Is this the person named on the child's list? (The rules check the
     very same: the name exactly as written there.) */
  function listedCollector(child, name) {
    return (child.collectors || []).filter(function (c) { return norm(c) === norm(name); })[0] || '';
  }

  /* Leaders needed for a number of children at a group's ratio. */
  function leadersNeeded(children, ratio) { return children > 0 ? Math.ceil(children / Math.max(1, ratio || 8)) : 0; }

  /* The first-time visitor's quick form, checked before anything is written. */
  function visitorProblems(v) {
    var out = [];
    if (!String(v.childName || '').trim()) out.push("the child's name");
    if (!v.year) out.push('their school year');
    if (!String(v.parentName || '').trim()) out.push("the parent's name");
    if (digits(v.phone).length < 10) out.push("the parent's phone number");
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) out.push('an email address that works (or none)');
    if (!v.consent) out.push('the parent\'s consent');
    return out;
  }

  /* ---- registers (stage 3) ----
     Terms as the register counts them: autumn September to December,
     spring January to March, summer April to August. (School terms move
     with Easter; a register only needs the right Sundays in roughly the
     right bucket, and the dates can always be chosen by hand.) */
  function termOf(day) {
    var y = +String(day).slice(0, 4), m = +String(day).slice(5, 7);
    if (m >= 9) return { name: 'Autumn ' + y, from: y + '-09-01', to: y + '-12-31' };
    if (m <= 3) return { name: 'Spring ' + y, from: y + '-01-01', to: y + '-03-31' };
    return { name: 'Summer ' + y, from: y + '-04-01', to: y + '-08-31' };
  }
  function termBefore(day) {
    var t = termOf(day), d = new Date(t.from + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return termOf(d.toISOString().slice(0, 10));
  }
  /* Every date from..to (inclusive) that falls on a group's day
     (1 Monday ... 7 Sunday, as the groups store it). */
  function sessionDates(weekday, from, to) {
    var out = [], d = new Date(String(from).slice(0, 10) + 'T12:00:00Z'), end = String(to).slice(0, 10);
    while (d.toISOString().slice(0, 10) <= end && out.length < 400) {
      if ((d.getUTCDay() || 7) === (weekday || 7)) out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }
  /* A register: rows of children, a column per date, true where the child
     was checked in that day (in or since gone home). */
  function register(children, checkins, dates) {
    var seen = {}, rows = [];
    (children || []).forEach(function (c) { seen[c.id] = { id: c.id, name: c.name, days: {} }; rows.push(seen[c.id]); });
    (checkins || []).forEach(function (k) {
      if (!seen[k.signupKey]) { seen[k.signupKey] = { id: k.signupKey, name: k.name, days: {} }; rows.push(seen[k.signupKey]); }
      seen[k.signupKey].days[k.day] = true;
    });
    rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
    rows.forEach(function (r) { r.total = dates.filter(function (d) { return r.days[d]; }).length; });
    var totals = dates.map(function (d) { return rows.filter(function (r) { return r.days[d]; }).length; });
    return { rows: rows, totals: totals };
  }
  /* The morning's date (UTC, as the rules count it). */
  function morningDay(now) { return (now || new Date()).toISOString().slice(0, 10); }

  /* "Not set up yet" (the register and Sunday check-in). Admins get the
     steps, with links; everyone else is told to ask the office.
     o: { admin, noSite, canChooseTeam } */
  function notSetUpHtml(o) {
    if (!o.admin) return '<div class="card" id="notsetup"><h2>Not set up yet</h2><p>The children\'s register is not set up yet. Please ask the church office.</p></div>';
    var step = function (done, html) { return '<li style="margin:6px 0">' + (done ? '<s>' + html + '</s> (done)' : html) + '</li>'; };
    return '<div class="card" id="notsetup"><h2>Not set up yet</h2><p>Two steps, once:</p><ol>' +
      step(!o.noSite, '<b>Places</b>: add the site where the children\'s groups meet. <a href="places-admin.html" id="ns-places">Open Places</a>') +
      step(false, '<b>Children\'s register, Settings</b>: choose the children\'s team (Kids Church, for example). ' +
        (o.canChooseTeam ? '<a href="kids-admin.html?tab=settings" id="ns-settings">Open Settings</a>' : 'A master admin or the safeguarding lead does this.')) +
      '</ol><p class="hint">Then the team\'s admins can register children, set up the groups and run Sunday check-in.</p></div>';
  }

  global.EGBCKids = {
    notSetUpHtml: notSetUpHtml,
    termOf: termOf, termBefore: termBefore, sessionDates: sessionDates, register: register, morningDay: morningDay, YEARS: YEARS, DAYS: DAYS, norm: norm, meaningful: meaningful, splitNames: splitNames, ageOn: ageOn, yearFor: yearFor,
    groupFor: groupFor, familyCode: familyCode, fromResponse: fromResponse, consentOk: consentOk,
    sessionId: sessionId, checkinIdFor: checkinIdFor, pickupCode: pickupCode, cleanCode: cleanCode, familyQR: familyQR, parseFamilyQR: parseFamilyQR,
    digits: digits, findFamilies: findFamilies, listedCollector: listedCollector, leadersNeeded: leadersNeeded, visitorProblems: visitorProblems };

})(typeof window !== 'undefined' ? window : this);
