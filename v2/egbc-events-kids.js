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
   - CHECK-IN (stage 2) IS E1's check-in, a session per group per Sunday.

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

  global.EGBCKids = { YEARS: YEARS, DAYS: DAYS, norm: norm, meaningful: meaningful, splitNames: splitNames, ageOn: ageOn, yearFor: yearFor,
    groupFor: groupFor, familyCode: familyCode, fromResponse: fromResponse, consentOk: consentOk };

})(typeof window !== 'undefined' ? window : this);
