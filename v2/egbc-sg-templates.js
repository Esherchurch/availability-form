/* ===================================================================
   EGBC — the safeguarding risk register's starter lists (F-265)
   ===================================================================
   Written for Church HQ in our own plain words, for any church: no
   church's name, team names or policy wording, and nothing copied from
   any one body's documents. A starting point the safeguarding lead
   adapts, never a finished assessment.

   KINDS        the kinds of activity a register is kept for
   CONTROLS     controls the hub can watch itself (the live warnings, step 3)
                - a risk's control is one of these, or written words
   STARTERS     starter risks for each kind: { id, risk, who, l, i,
                controls: [{ kind, text }], rl, ri } (1-5 each)
   rating(l, i) 'red' | 'amber' | 'green' - score = likelihood x impact:
                15 and over red, 5 and over amber (the same bands as
                risk.html's hazards)
   =================================================================== */
(function (global) {
  'use strict';

  var KINDS = [
    { id: 'sunday', label: 'Sunday children’s group' },
    { id: 'youth', label: 'Youth group' },
    { id: 'club', label: 'Club or regular event for children' },
    { id: 'online', label: 'Online and livestream' },
    { id: 'pastoral', label: 'Pastoral visits' },
    { id: 'transport', label: 'Transport' },
    { id: 'lone', label: 'Lone working' },
    { id: 'hirers', label: 'Hirers working with children' },
    { id: 'other', label: 'Something else' }
  ];

  /* What the hub already checks: a risk with one of these turns amber by
     itself when it slips (step 3). */
  var CONTROLS = [
    { id: 'checks', label: 'Criminal record checks and training in date' },
    { id: 'ratio', label: 'Enough leaders for the children (the ratio)' },
    { id: 'twoAdults', label: 'Two adults at all times' },
    { id: 'consent', label: 'A current consent form for every child' },
    { id: 'checkin', label: 'Children checked in and out' },
    { id: 'signoff', label: 'Event assessment signed off before bookings open' },
    { id: 'hirerDocs', label: 'The hirer’s safeguarding policy on file' }
  ];

  var C = function (kind, text) { return { kind: kind, text: text || '' }; };
  var STARTERS = {
    sunday: [
      { id: 'sun-leaves', risk: 'A child leaves the group unnoticed, or goes home with someone they should not', who: 'Children', l: 2, i: 5,
        controls: [C('checkin'), C('text', 'Only the people named on the form collect a child'), C('text', 'A leader stays at the door at the end')], rl: 1, ri: 5 },
      { id: 'sun-ratio', risk: 'Too few leaders for the children in the group', who: 'Children and leaders', l: 3, i: 4,
        controls: [C('ratio'), C('twoAdults'), C('text', 'The group does not start until enough leaders are in')], rl: 2, ri: 4 },
      { id: 'sun-alone', risk: 'An adult without checks is alone with a child', who: 'Children', l: 2, i: 5,
        controls: [C('checks'), C('twoAdults'), C('text', 'Rooms with windows or doors left open')], rl: 1, ri: 5 },
      { id: 'sun-medical', risk: 'An allergy or medical need is missed', who: 'Children', l: 2, i: 4,
        controls: [C('consent'), C('text', 'Leaders see the group’s needs before the session')], rl: 1, ri: 4 },
      { id: 'sun-photos', risk: 'Photos of children are taken or shared without permission', who: 'Children and families', l: 2, i: 3,
        controls: [C('consent'), C('text', 'Photos only on church devices, only of children with permission')], rl: 1, ri: 3 }
    ],
    youth: [
      { id: 'yth-ratio', risk: 'Too few leaders for the young people', who: 'Young people and leaders', l: 3, i: 4,
        controls: [C('ratio'), C('twoAdults')], rl: 2, ri: 4 },
      { id: 'yth-checks', risk: 'A leader’s checks or training have run out', who: 'Young people', l: 2, i: 4,
        controls: [C('checks')], rl: 1, ri: 4 },
      { id: 'yth-messages', risk: 'Private messages between a leader and a young person', who: 'Young people', l: 2, i: 5,
        controls: [C('text', 'Group channels only, with two leaders in each'), C('text', 'No private messages; anything private is passed to the lead')], rl: 1, ri: 5 },
      { id: 'yth-lifts', risk: 'A leader alone in a car with a young person', who: 'Young people', l: 2, i: 4,
        controls: [C('twoAdults'), C('text', 'Lifts arranged with parents, never one to one')], rl: 1, ri: 4 },
      { id: 'yth-consent', risk: 'No current consent or contact details for a young person', who: 'Young people', l: 2, i: 3,
        controls: [C('consent')], rl: 1, ri: 3 }
    ],
    club: [
      { id: 'clb-ratio', risk: 'Too few leaders for the children booked', who: 'Children', l: 3, i: 4, controls: [C('ratio'), C('twoAdults')], rl: 2, ri: 4 },
      { id: 'clb-checkin', risk: 'Not knowing who is here if there is a fire', who: 'Everyone', l: 2, i: 5, controls: [C('checkin'), C('text', 'The register goes out with the leaders')], rl: 1, ri: 5 },
      { id: 'clb-consent', risk: 'A child comes with no consent form', who: 'Children', l: 3, i: 3, controls: [C('consent'), C('text', 'No form, no place: the parent fills one in at the door')], rl: 1, ri: 3 }
    ],
    online: [
      { id: 'onl-shown', risk: 'Children shown or named on a livestream without permission', who: 'Children and families', l: 3, i: 3,
        controls: [C('consent'), C('text', 'Cameras point away from where children sit'), C('text', 'Children are not named on air')], rl: 1, ri: 3 },
      { id: 'onl-chat', risk: 'The stream’s chat is used to contact a child', who: 'Children', l: 2, i: 4,
        controls: [C('text', 'Chat is watched by a named person, or turned off')], rl: 1, ri: 4 }
    ],
    pastoral: [
      { id: 'pas-alone', risk: 'A visitor alone with someone at risk', who: 'The person visited and the visitor', l: 2, i: 4,
        controls: [C('checks'), C('text', 'Visit in pairs, or tell someone where you are and when you will be back')], rl: 1, ri: 4 },
      { id: 'pas-passed', risk: 'A worry raised on a visit is not passed on', who: 'The person visited', l: 2, i: 5,
        controls: [C('text', 'Every worry goes to the safeguarding lead the same day, using the report-a-concern route')], rl: 1, ri: 5 }
    ],
    transport: [
      { id: 'trn-driver', risk: 'Drivers without checks', who: 'Passengers', l: 2, i: 4, controls: [C('checks')], rl: 1, ri: 4 },
      { id: 'trn-seats', risk: 'No booster seats, or the car is not insured for it', who: 'Children', l: 2, i: 4,
        controls: [C('text', 'Drivers confirm their insurance and seats before each trip')], rl: 1, ri: 4 },
      { id: 'trn-alone', risk: 'One adult alone in a car with one child', who: 'Children', l: 2, i: 4, controls: [C('twoAdults')], rl: 1, ri: 4 }
    ],
    lone: [
      { id: 'lne-where', risk: 'Nobody knows where someone working alone is', who: 'The person working alone', l: 3, i: 3,
        controls: [C('text', 'Tell someone before and after; carry a phone')], rl: 1, ri: 3 }
    ],
    hirers: [
      { id: 'hir-policy', risk: 'A group hiring the building works with children with no safeguarding policy', who: 'Children', l: 2, i: 4,
        controls: [C('hirerDocs')], rl: 1, ri: 4 },
      { id: 'hir-checks', risk: 'The hirer’s own leaders are not checked', who: 'Children', l: 2, i: 4,
        controls: [C('text', 'The hirer confirms in writing that their leaders are checked')], rl: 1, ri: 4 }
    ],
    other: []
  };

  function score(l, i) { return (+l || 0) * (+i || 0); }
  function rating(l, i) { var s = score(l, i); return s >= 15 ? 'red' : s >= 5 ? 'amber' : 'green'; }
  function kindLabel(id) { var k = KINDS.filter(function (x) { return x.id === id; })[0]; return k ? k.label : id; }
  function controlLabel(c) {
    if (!c) return '';
    if (c.kind === 'text') return c.text || '';
    var k = CONTROLS.filter(function (x) { return x.id === c.kind; })[0];
    return k ? k.label : c.kind;
  }

  var api = { KINDS: KINDS, CONTROLS: CONTROLS, STARTERS: STARTERS, score: score, rating: rating, kindLabel: kindLabel, controlLabel: controlLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCSgTemplates = api;
})(typeof window !== 'undefined' ? window : this);
