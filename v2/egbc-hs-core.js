/* ===================================================================
   HEALTH, SAFETY AND FIRE: the church's settings (F-280 section 8, H&S
   step 2; Martin's answers to F-280, 23 Oct)
   ===================================================================
   For any church: every number is a setting, with these defaults.
     raSettings/church      the church's own: how many it employs, whether
                            anyone works at a screen, when a staff team is
                            "larger", the insurance cover, the H&S AI caps,
                            the action target dates, when an event needs an
                            assessment
     raSiteRoles/{siteId}   each building's health and safety lead and
                            deputy, and its fire safety lead (member ids)

     DEFAULTS                       the values when nothing is set
     settingsOf(saved)              saved values over the defaults
     duties(church)                 what the law asks, from the number
                                    employed (Martin, F-281 question 11)
     flagsFor(church)               the building-profile flags the number
                                    adds (to a building where someone
                                    employed works): employees5, staffMany, dse
     coverFlags(church)             insurance cover under the minimum
     check(church), checkRoles(r)   [] or the problems, in words
   Nothing here is any one church's: no team, no name.
   =================================================================== */
(function (global) {
  'use strict';

  var DEFAULTS = {
    employees: null,          /* not answered yet: nothing is added */
    screenWork: false,
    largerTeam: 10,           /* a "larger staff team" from this many */
    publicLiability: null,    /* the cover, in pounds */
    employersLiability: null,
    minCover: 1000000,        /* public liability under this is flagged (the safeguarding register's own minimum, F-280 (d)) */
    ai: { perChurch: 20, perPerson: 5 },               /* F-280 answer 9: separate from safeguarding's, the same defaults */
    targets: { high: 1, medium: 3, low: 6 },           /* months: F-280 answer 8 */
    eventPeople: 100                                   /* F-280 answer 4 */
  };
  /* employers' liability: the law's minimum */
  var EL_MIN = 5000000;
  /* no limits beyond what a record holds (H-9): the most any one number may be */
  var MOST = 1000000000;

  function num(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0 ? v : null; }
  function settingsOf(saved) {
    var s = saved || {}, d = DEFAULTS;
    var tg = s.targets || {}, ai = s.ai || {};
    return {
      employees: num(s.employees), screenWork: s.screenWork === true,
      largerTeam: num(s.largerTeam) || d.largerTeam,
      publicLiability: num(s.publicLiability), employersLiability: num(s.employersLiability),
      minCover: num(s.minCover) || d.minCover,
      ai: { perChurch: num(ai.perChurch) === null ? d.ai.perChurch : ai.perChurch, perPerson: num(ai.perPerson) === null ? d.ai.perPerson : ai.perPerson },
      targets: { high: num(tg.high) || d.targets.high, medium: num(tg.medium) || d.targets.medium, low: num(tg.low) || d.targets.low },
      eventPeople: num(s.eventPeople) || d.eventPeople
    };
  }

  /* WHAT THE LAW ASKS, FROM THE NUMBER EMPLOYED (Martin, F-281): each with
     the checks it brings (egbc-compliance-templates.js, version 4) */
  var DUTIES = [
    { id: 'one', from: 'employees', words: 'Employers’ liability insurance in force, with its certificate where employees can see it',
      checks: ['employers-liability'] },
    { id: 'poster', from: 'employees', words: 'The “Health and safety law” poster up, or its leaflet given to each employee', checks: ['hs-law-poster'] },
    { id: 'report', from: 'employees', words: 'Knowing which injuries to an employee must be reported, and to whom', checks: ['reportable-injuries'] },
    { id: 'firstAid', from: 'employees', words: 'A first-aid needs assessment that covers the employees', checks: ['first-aid-needs'] },
    { id: 'policy', from: 'employees5', words: 'A written health and safety policy', checks: ['hs-policy-written'] },
    { id: 'findings', from: 'employees5', words: 'The risk assessment’s significant findings written down', checks: ['hs-findings-written'] },
    { id: 'dse', from: 'dse', words: 'A workstation (display screen) assessment for each person who works at a screen', checks: ['dse-assessment'] },
    { id: 'training', from: 'staffMany', words: 'Staff health and safety training recorded', checks: ['staff-hs-training'] },
    { id: 'consult', from: 'staffMany', words: 'Employees consulted on health and safety', checks: ['consult-employees'] },
    { id: 'lone', from: 'staffMany', words: 'Lone working arrangements for staff', checks: ['staff-lone-working'] }
  ];
  /* the flags the number gives (a building has them only where someone employed works: its own "employees" answer) */
  function flagsFor(saved) {
    var s = settingsOf(saved), n = s.employees;
    if (n === null || n < 1) return {};
    var f = {};
    if (n >= 5) f.employees5 = true;
    if (n >= s.largerTeam) f.staffMany = true;
    if (s.screenWork) f.dse = true;
    return f;
  }
  /* the duties that apply, in order: none until the number is given */
  function duties(saved) {
    var s = settingsOf(saved), n = s.employees;
    if (n === null || n < 1) return [];
    var f = flagsFor(saved); f.employees = true;
    return DUTIES.filter(function (d) { return f[d.from]; });
  }
  function pounds(n) { return n >= 1000000 && n % 100000 === 0 ? '£' + (n / 1000000) + ' million' : '£' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /* insurance cover under the minimum: amber, in words */
  function coverFlags(saved) {
    var s = settingsOf(saved), out = [];
    if (s.publicLiability === null) out.push({ id: 'publicLiability', words: 'The public liability cover isn’t given' });
    else if (s.publicLiability < s.minCover) out.push({ id: 'publicLiability', words: 'Public liability cover under ' + pounds(s.minCover) });
    if (s.employees !== null && s.employees >= 1) {
      if (s.employersLiability === null) out.push({ id: 'employersLiability', words: 'The employers’ liability cover isn’t given' });
      else if (s.employersLiability < EL_MIN) out.push({ id: 'employersLiability', words: 'Employers’ liability cover under ' + pounds(EL_MIN) + ', the legal minimum' });
    }
    return out;
  }
  function check(c) {
    var out = [], whole = function (v, min) { return v === undefined || v === null || (typeof v === 'number' && Math.floor(v) === v && v >= min && v <= MOST); };
    c = c || {};
    if (!whole(c.employees, 0)) out.push('How many the church employs: a whole number, 0 or more.');
    if (!whole(c.largerTeam, 1)) out.push('A larger staff team: from 1 employee or more.');
    if (!whole(c.publicLiability, 0) || !whole(c.employersLiability, 0)) out.push('Insurance cover: an amount in pounds.');
    if (!whole(c.minCover, 1)) out.push('The minimum public liability cover: an amount in pounds.');
    var ai = c.ai || {};
    if (!whole(ai.perChurch, 0) || !whole(ai.perPerson, 0) || ai.perChurch > 500 || ai.perPerson > 500) out.push('AI drafts a day: 0 to 500 each.');
    var t = c.targets || {};
    if (!whole(t.high, 1) || !whole(t.medium, 1) || !whole(t.low, 1) || t.high > 120 || t.medium > 120 || t.low > 120) out.push('Target dates: 1 to 120 months each.');
    if (!whole(c.eventPeople, 1)) out.push('An event needs an assessment from: 1 person or more.');
    return out;
  }
  function checkRoles(r) {
    r = r || {};
    return r.hsLead && r.hsLead === r.hsDeputy ? ['The health and safety lead and the deputy must be two different people.'] : [];
  }
  /* the responsible person on a fire assessment (F-280 answer 3: the trustees, with the fire safety lead acting for them) */
  function responsible(churchName, fireLeadName) {
    return 'The trustees of ' + (churchName || 'the church') + (fireLeadName ? ', with ' + fireLeadName + ', the fire safety lead, acting for them' : '');
  }
  /* "NOT LEGAL ADVICE" (F-280 section 7; Martin's answer 12: as written) */
  var NOT_ADVICE = 'The hub helps the church record its assessment. The responsible person remains responsible for it. For a complex building, or where you’re unsure, a competent person, such as a professional fire risk assessor, should carry out or check the assessment.';

  var api = { DEFAULTS: DEFAULTS, EL_MIN: EL_MIN, MOST: MOST, DUTIES: DUTIES, NOT_ADVICE: NOT_ADVICE, settingsOf: settingsOf, flagsFor: flagsFor, duties: duties, coverFlags: coverFlags, check: check, checkRoles: checkRoles, responsible: responsible, pounds: pounds };
  global.EGBCHsCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
