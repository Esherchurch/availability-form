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

  /* ONE-OFF EVENTS (step 2): an under-18s trip, overnight, holiday club or
     off-site event is assessed from one of these, and the site's
     safeguarding lead or deputy signs it off before bookings open. The
     questions are answered in general words; the risks start from the
     template and are adapted. */
  var Q = function (id, label, hint) { return { id: id, label: label, hint: hint || '' }; };
  var EVENT_KINDS = [
    { id: 'trip', label: 'A trip' }, { id: 'overnight', label: 'An overnight or sleepover' },
    { id: 'holidayclub', label: 'A holiday club' }, { id: 'offsite', label: 'Off-site' }
  ];
  var EVENT_TEMPLATES = {
    trip: { label: 'Trip', questions: [
        Q('where', 'Where are you going, and what will you do there?'), Q('travel', 'How will everyone travel?', 'Coach, minibus, cars, train; who drives'),
        Q('meet', 'Where and when do you meet, and hand the children back?'), Q('headcount', 'How and when will you count heads?'),
        Q('firstaid', 'Who is the first aider, and what kit goes?', 'A role, not a name, if you prefer'), Q('lost', 'What happens if someone gets lost?'),
        Q('contact', 'How will leaders reach each other and the church on the day?')],
      risks: [
        { id: 'trp-lost', risk: 'A child is lost or separated from the group', who: 'Children', l: 3, i: 5, controls: [C('text', 'Head counts at every move'), C('text', 'Children in small groups, each with a named leader'), C('text', 'A meeting point every child knows')], rl: 1, ri: 5 },
        { id: 'trp-travel', risk: 'Harm while travelling', who: 'Everyone', l: 2, i: 4, controls: [C('checks'), C('text', 'Licensed operator or checked drivers; seatbelts')], rl: 1, ri: 4 },
        { id: 'trp-ratio', risk: 'Too few leaders for the group, away from the building', who: 'Children', l: 3, i: 4, controls: [C('ratio'), C('twoAdults')], rl: 1, ri: 4 },
        { id: 'trp-medical', risk: 'A medical need or allergy away from home', who: 'Children', l: 2, i: 4, controls: [C('consent'), C('text', 'The first aider carries the group’s needs and medicines')], rl: 1, ri: 4 },
        { id: 'trp-public', risk: 'Contact with members of the public', who: 'Children', l: 2, i: 4, controls: [C('text', 'Children never alone in public places, toilets included')], rl: 1, ri: 4 }] },
    overnight: { label: 'Overnight or sleepover', questions: [
        Q('where', 'Where will everyone sleep?', 'Rooms, and who is in which'), Q('night', 'Who is on duty through the night?'),
        Q('separate', 'How are boys and girls, and adults and children, kept apart at night?'), Q('meds', 'How are medicines kept and given?'),
        Q('home', 'What happens if a child wants to go home in the night?'), Q('fire', 'What is the fire plan for the night?')],
      risks: [
        { id: 'ovn-alone', risk: 'An adult alone with a child at night', who: 'Children', l: 2, i: 5, controls: [C('twoAdults'), C('checks'), C('text', 'Adults never sleep in children’s rooms')], rl: 1, ri: 5 },
        { id: 'ovn-ratio', risk: 'Too few awake adults overnight', who: 'Children', l: 2, i: 4, controls: [C('ratio'), C('text', 'A rota of adults awake through the night')], rl: 1, ri: 4 },
        { id: 'ovn-fire', risk: 'A fire at night', who: 'Everyone', l: 1, i: 5, controls: [C('checkin'), C('text', 'A night-time fire walk-through with everyone')], rl: 1, ri: 5 },
        { id: 'ovn-medical', risk: 'A medical need in the night', who: 'Children', l: 2, i: 4, controls: [C('consent'), C('text', 'Parents reachable all night')], rl: 1, ri: 4 }] },
    holidayclub: { label: 'Holiday club', questions: [
        Q('days', 'Which days and times?'), Q('ages', 'Which ages, and how many children?'), Q('register', 'How are children registered in and handed back?'),
        Q('food', 'What food is served, and how are allergies handled?'), Q('photos', 'Will photos be taken, and how is permission checked?')],
      risks: [
        { id: 'hcl-ratio', risk: 'Too few leaders for the children each day', who: 'Children', l: 3, i: 4, controls: [C('ratio'), C('twoAdults')], rl: 1, ri: 4 },
        { id: 'hcl-handback', risk: 'A child handed to the wrong adult', who: 'Children', l: 2, i: 5, controls: [C('checkin'), C('text', 'Only named collectors; ask for ID when unsure')], rl: 1, ri: 5 },
        { id: 'hcl-checks', risk: 'Helpers without checks, there for the week only', who: 'Children', l: 3, i: 4, controls: [C('checks'), C('text', 'Unchecked helpers never alone with children')], rl: 1, ri: 4 },
        { id: 'hcl-food', risk: 'An allergic reaction to food', who: 'Children', l: 2, i: 5, controls: [C('consent'), C('text', 'Allergies checked against every snack and meal')], rl: 1, ri: 5 }] },
    offsite: { label: 'Off-site', questions: [
        Q('venue', 'Where is it, and have you seen the venue’s own risk assessment?'), Q('toilets', 'Where are the toilets and the boundaries?'),
        Q('travel', 'How does everyone get there and back?'), Q('emergency', 'Who are the emergency contacts on the day?')],
      risks: [
        { id: 'off-venue', risk: 'Hazards at a venue we don’t know', who: 'Everyone', l: 2, i: 4, controls: [C('text', 'The venue’s own risk assessment seen'), C('text', 'A leader visits beforehand')], rl: 1, ri: 4 },
        { id: 'off-bounds', risk: 'Children leave the area unnoticed', who: 'Children', l: 2, i: 5, controls: [C('checkin'), C('text', 'Boundaries walked and explained at the start')], rl: 1, ri: 5 },
        { id: 'off-ratio', risk: 'Too few leaders away from the building', who: 'Children', l: 3, i: 4, controls: [C('ratio'), C('twoAdults')], rl: 1, ri: 4 }] }
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

  /* THE CHURCH-WIDE ANNUAL REVIEW (F-265 step 4): its items, cheapest to
     close first. who: 'lead' (any site's safeguarding lead or deputy),
     'trustee' (the trustee team) or 'either'. optional ones may be marked
     "does not apply", and then are not counted. The server's copy of the
     ids is functions/sg-warnings-core.cjs REVIEW_ITEMS (the unit test checks). */
  var REVIEW_ITEMS = [
    { id: 'leads', who: 'lead', label: 'The lead and deputy named', line: 'Both are set in Safeguarding settings. One tap to confirm them for this year.' },
    { id: 'register', who: 'lead', label: 'The register reviewed', line: 'Every standing risk looked at this year. Risks past their review date are on Warnings.' },
    { id: 'policy', who: 'lead', label: 'The safeguarding policy reviewed', line: 'Read it through and bring it up to date.' },
    { id: 'adopted', who: 'trustee', label: 'The policy adopted by the trustees', line: 'Recorded by a trustee once the trustees have agreed it.' },
    { id: 'trusteeTraining', who: 'trustee', label: 'The trustees’ safeguarding training', line: 'Recorded by a trustee when the trustees are trained for this year.' },
    { id: 'recruitment', who: 'lead', label: 'Safer recruitment followed', line: 'Spot-check that new leaders this year were recruited safely.' },
    { id: 'hirers', who: 'lead', optional: true, label: 'Hirers’ safeguarding policies checked', line: 'For hirers who work with children.' },
    { id: 'return', who: 'either', optional: true, label: 'The annual return or report made', line: 'Where the church’s own rules need one.' }
  ];

  var api = { KINDS: KINDS, CONTROLS: CONTROLS, STARTERS: STARTERS, EVENT_KINDS: EVENT_KINDS, EVENT_TEMPLATES: EVENT_TEMPLATES, REVIEW_ITEMS: REVIEW_ITEMS,
              score: score, rating: rating, kindLabel: kindLabel, controlLabel: controlLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCSgTemplates = api;
})(typeof window !== 'undefined' ? window : this);
