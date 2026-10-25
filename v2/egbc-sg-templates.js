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
    { id: 'holidayclub', label: 'A holiday club' }, { id: 'offsite', label: 'Off-site' },
    { id: 'camp', label: 'A camp or festival' }
  ];
  /* the kinds that need the lead's sign-off when under-18s go: every one of these (firestore.rules sgNeedsSignoff, the same list) */
  var SG_KINDS = EVENT_KINDS.map(function (k) { return k.id; });
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
        { id: 'off-ratio', risk: 'Too few leaders away from the building', who: 'Children', l: 3, i: 4, controls: [C('ratio'), C('twoAdults')], rl: 1, ri: 4 }] },
    /* A CAMP OR FESTIVAL (F-280 10.1): tents, cooking, nights and the site's rules, in our own words; it has the overnight questions too */
    camp: { label: 'Camp or festival', questions: [],
      risks: [
        { id: 'cmp-tentfire', risk: 'A fire in a tent', who: 'Everyone', l: 2, i: 5, controls: [C('text', 'No candles, smoking or vaping in tents'), C('text', 'Tents spaced as the site asks'), C('text', 'An extinguisher and a fire blanket by the cooking area')], rl: 1, ri: 5 },
        { id: 'cmp-cooking', risk: 'Burns or a gas leak while cooking', who: 'Everyone', l: 3, i: 4, controls: [C('text', 'Cooking only in the cooking tent or area, away from sleeping tents'), C('text', 'Fuel stored away from stoves and tents'), C('text', 'A stove briefing; cooking always supervised')], rl: 1, ri: 4 },
        { id: 'cmp-co', risk: 'Carbon monoxide from a stove or heater in a tent', who: 'Everyone', l: 2, i: 5, controls: [C('text', 'No stoves, barbecues or heaters inside any tent')], rl: 1, ri: 5 },
        { id: 'cmp-guylines', risk: 'Trips on guy lines and pegs in the dark', who: 'Everyone', l: 3, i: 2, controls: [C('text', 'Guy lines marked; torches carried after dark')], rl: 2, ri: 2 },
        { id: 'cmp-food', risk: 'Food poisoning', who: 'Everyone', l: 2, i: 4, controls: [C('text', 'Whoever caters holds a Level 2 food hygiene certificate'), C('text', 'Hand washing before meals; hot water for washing up')], rl: 1, ri: 4 },
        { id: 'cmp-leaves', risk: 'A young person leaves the site', who: 'Young people', l: 2, i: 5, controls: [C('text', 'Never off site alone; a leader told before leaving'), C('text', 'Head counts at set times')], rl: 1, ri: 5 },
        { id: 'cmp-night', risk: 'Harm at night', who: 'Young people', l: 2, i: 5, controls: [C('twoAdults'), C('text', 'A tent check at a set time'), C('text', 'Single-gender tents; adults camped centrally and known to all')], rl: 1, ri: 5 },
        { id: 'cmp-vehicles', risk: 'A vehicle moving on site', who: 'Everyone', l: 2, i: 5, controls: [C('text', 'The site’s car-free times kept; vehicles to the car park')], rl: 1, ri: 5 },
        { id: 'cmp-crowd', risk: 'Someone lost in a large crowd', who: 'Young people', l: 3, i: 4, controls: [C('checkin'), C('text', 'A meeting point everyone knows; the emergency number on every wristband')], rl: 1, ri: 4 },
        { id: 'cmp-weather', risk: 'Heat, cold or flooding', who: 'Everyone', l: 3, i: 3, controls: [C('text', 'The forecast checked daily; a plan to move or go home')], rl: 2, ri: 3 },
        { id: 'cmp-adulthealth', risk: 'An adult’s own health emergency', who: 'Leaders', l: 2, i: 4, controls: [C('text', 'Adults’ health forms, with next of kin, kept by the medical officer')], rl: 1, ri: 4 }] }
  };

  /* THE REQUIRED CHECKLIST (Martin, 23 Oct): every question must be answered,
     or marked "not applicable" with a reason, before the lead or deputy can
     sign an event off - the rules refuse it otherwise (firestore.rules
     sgChecklist(), the same ids). Our own words. A church adds its own in
     Safeguarding settings; it can never take these away. The server's copy,
     for the AI, is functions/sg-checklist.cjs (the unit test checks they
     match). */
  var CK = function (id, label, hint) { return { id: id, label: label, hint: hint || '' }; };
  var CHECKLIST = {
    core: [
      /* the public liability cover as an amount (flagged under the church's minimum, £1 million unless it sets another) and words */
      Object.assign(CK('insurance', 'Insurance: is the activity covered by the church’s insurance, and has the insurer been told where it needs to be (overseas, overnight, adventurous activities, hired transport)? How much is the public liability cover? Who checked, and when?'), { money: true }),
      CK('incharge', 'Who is in charge on the day, and who is the named deputy?', 'Roles and names of leaders are fine; never a child'),
      CK('leaders', 'Leaders: enough for the ratio, two adults at all times, and every leader’s criminal record check and training in date?', 'The hub’s own check is shown here'),
      /* Yes, No, or "not a mixed group"; a No is flagged amber. Nobody's sex is recorded, only this answer. */
      Object.assign(CK('mixedLeaders', 'Mixed groups: is there at least one male and one female leader with the group?', 'Only this answer is kept, never anyone’s sex.'), { yesNo: true, naLabel: 'Not a mixed group', placeholder: 'Which leaders (roles are fine), or why not' }),
      CK('consent', 'Consent: has a parent or guardian given consent for this event, covering the activities, photos and medical treatment, for every child before they go?'),
      /* answered Yes or No (with who and when their certificate runs out, or why not); a No is flagged amber, red when under-8s go (Martin, 23 Oct) */
      Object.assign(CK('paedFirstAid', 'Is there a trained paediatric first aider with the group? Who, and when does their certificate run out?', 'Essential where young children are present.'), { yesNo: true }),
      CK('medical', 'Medical needs and allergies: are needs known (in general terms), medicines carried by a named leader, and a trained first aider and kit going?'),
      CK('emergency', 'Emergencies: the nearest hospital, how to call for help, the emergency plan, and how parents and the church at home will be told.'),
      CK('contacts', 'Contacts: who is the 24-hour contact at home (not on the trip)? Are leaders’ phones charged and with signal?'),
      CK('headcount', 'Head counts and the lost-child plan; the meeting point, and hand-back only to people on the collection list.'),
      CK('transport', 'Transport: is the operator or driver checked (licence, insurance, seatbelts)? Is each vehicle roadworthy (an MOT, and a check before the journey)? Are drivers’ hours and rest breaks planned? A minibus only with the right licence (D1, or a permit). Private cars only with driver checks, and booster seats where needed.'),
      CK('venue', 'The venue, host or activity provider: checked, their safeguarding policy and risk assessment seen, and licences where they apply (for example adventure activity licensing in the UK)?'),
      CK('behaviour', 'Behaviour: what is expected of everyone, how problems will be handled, and the host’s behaviour policy or code of conduct if there is one?'),
      CK('accessibility', 'Accessibility: how are everyone’s access needs found out and met, and who at the venue or host needs to know?'),
      CK('visitors', 'Visitors and members of the public: who else will be there, and how is the group kept apart where it needs to be?'),
      CK('photos', 'Photos and social media: consent given, and no locations or names posted?'),
      CK('weather', 'Weather, and the plan if it has to be cancelled or cut short.'),
      CK('incidents', 'Incidents: how will any incident or concern be recorded and reported to the safeguarding lead?')
    ],
    abroad: [
      CK('travelAdvice', 'Government travel advice for the destination: checked, and checked again just before leaving?'),
      CK('passports', 'Passports, visas, and any rules for children travelling without a parent?'),
      CK('travelInsurance', 'Travel insurance for everyone, including medical treatment and repatriation?'),
      CK('health', 'Vaccinations and health advice for the destination?'),
      CK('localEmergency', 'Local emergency numbers, and the nearest embassy or consulate?'),
      CK('money', 'Money, and how the group will keep in touch (phones, roaming, wifi)?'),
      CK('localHelpers', 'Local helpers or hosts: do they need checks equivalent to ours, and have they had them?')
    ],
    overnight: [
      CK('sleeping', 'Sleeping arrangements: separate by age and gender, and adults never sharing with children (unless their own child)?'),
      CK('nightRota', 'The night supervision rota: who is awake or on call, and when?'),
      CK('fire', 'Fire safety: the exits, the alarm, and a night-time walk-through?'),
      CK('privacy', 'Privacy for changing and washing?')
    ],
    holidayclub: [
      CK('registration', 'Registration, and signing every child in and out each day?'),
      CK('staffRota', 'The staffing rota across the days, keeping the ratio every day?'),
      CK('food', 'Food hygiene and allergies?'),
      CK('toilets', 'Toilets, and how children are supervised going to them?')
    ],
    offsite: [
      CK('siteRules', 'The site’s own rules and hazards?'),
      CK('water', 'Any water nearby, and how children are kept safe from it?'),
      CK('boundaries', 'The boundaries of the area, and how children know them?')
    ],
    /* a camp has the overnight questions as well (ALSO, below) */
    camp: [
      CK('tents', 'Tents: where they go, the spacing the site asks for (between tents, from cooking tents and vehicles, from the boundary), and guy lines marked?'),
      CK('tentFire', 'Fire in tents: no candles, smoking or vaping in tents, lights watched, and an extinguisher and a fire blanket by the cooking area?'),
      CK('cooking', 'Cooking: only the fuel the site allows, a cooking tent or area away from sleeping tents, fuel stored away from stoves and tents, a stove briefing, and who supervises?'),
      CK('campFood', 'Food: does whoever caters hold a Level 2 food hygiene certificate? Hand washing and sanitiser before meals, and hot water for washing up?'),
      CK('tentCheck', 'Nights: the tent check and its time, single-gender tents, where the adults sleep (central, and known to everyone), and a leader contactable on site day and night?'),
      CK('medicalOfficer', 'A named medical officer everyone knows, and the site’s medical facilities: do the young people know where they are?', 'A role, not a name, if you prefer'),
      CK('adultForms', 'Adults’ health forms, with next of kin, for every adult going, kept by the medical officer?', 'Kept by the medical officer, never in the hub: answer only whether they are collected'),
      CK('campRules', 'The site’s rules: generators, barbecues, alcohol, smoking and vaping, wristbands, electrics (PAT-tested, not tampered with), and the site’s forms and their deadlines?'),
      CK('vehicles', 'Vehicles: when the site is car-free, and where vehicles go?'),
      CK('leavingSite', 'Leaving the site: never alone, a leader told first, never on foot where the site says so, and off site by the set time on the last day?'),
      CK('setUp', 'Set-up day: who goes, and under-18s only if essential and supervised at all times?')
    ],
    adventurous: [
      CK('instructor', 'A qualified instructor or a licensed provider for each activity?'),
      CK('lifeguard', 'Lifeguard cover for any swimming or water activity?'),
      CK('equipment', 'Equipment checked, and fitted to each child?')
    ]
  };
  var FLAGS = [
    { id: 'abroad', label: 'Overseas: the trip leaves the country' },
    { id: 'adventurous', label: 'Water, heights or other adventurous activities' },
    { id: 'under8', label: 'Children under 8 are going' }
  ];
  /* a kind that has another kind's questions as well: a camp is an overnight too */
  var ALSO = { camp: ['overnight'] };
  /* the required questions for one event: the core, its kind's (and any it includes), the ticked flags', then the church's own */
  function checklistFor(kind, flags, churchQs) {
    flags = flags || {};
    var out = [].concat(CHECKLIST.core.map(function (q) { return Object.assign({ group: 'core' }, q); }));
    if (CHECKLIST[kind] && kind !== 'core') [kind].concat(ALSO[kind] || []).forEach(function (k) { out = out.concat(CHECKLIST[k].map(function (q) { return Object.assign({ group: k }, q); })); });
    FLAGS.forEach(function (f) { if (flags[f.id] === true && CHECKLIST[f.id]) out = out.concat(CHECKLIST[f.id].map(function (q) { return Object.assign({ group: f.id }, q); })); });
    (churchQs || []).forEach(function (q) { if (q && q.id && q.q) out.push({ id: q.id, label: q.q, hint: q.hint || 'The church’s own question', group: q.group || 'church' }); });
    return out;
  }
  /* the host's checked requirements, as questions: "From <host>'s requirements" */
  function hostQuestions(a) {
    var h = a && a.host;
    if (!h || !h.confirmed) return [];
    return (h.items || []).map(function (x) { return { id: x.id, q: x.q, hint: 'From ' + (h.name || 'the host') + '’s requirements' + (x.line ? ': “' + x.line + '”' : ''), group: 'host' }; });
  }
  /* an answer is there: words, or "N/A: " with a reason (a cover amount alone is not an answer) */
  function answered(v) { v = String(v || '').trim(); return !!v && !/^(N\/A|Yes|No):\s*$/.test(v) && !/^£[\d,]*:\s*$/.test(v); }
  /* the paediatric first aider: none is a flag - amber, red when under-8s go */
  function paedFlag(answers, flags) { return /^No\b/i.test(String((answers || {}).paedFirstAid || '').trim()) ? ((flags || {}).under8 ? 'red' : 'amber') : ''; }
  /* the public liability cover from the insurance answer ("£5,000,000: ..."), or null */
  function coverOf(v) { var m = /^£([\d,]+)/.exec(String(v || '').trim()); return m ? +m[1].replace(/,/g, '') || 0 : null; }
  function pounds(n) { return n >= 1000000 && n % 100000 === 0 ? '£' + (n / 1000000) + ' million' : '£' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  /* THE ANSWERS THAT ARE FLAGS (the page, the print and the warnings; the server's
     copy is functions/sg-checklist.cjs flagsFrom, the unit test checks they agree):
     no paediatric first aider; no male and female leader for a mixed group; the
     public liability cover not given, or under the church's minimum (minCover,
     £1 million unless the church sets another). Only answered questions count. */
  var MIN_COVER = 1000000;
  function answerFlags(answers, flags, minCover) {
    answers = answers || {}; var min = Number.isInteger(minCover) && minCover > 0 ? minCover : MIN_COVER, out = [];
    var pf = paedFlag(answers, flags);
    if (pf) out.push({ id: 'paedFirstAid', level: pf, words: 'No paediatric first aider' + (pf === 'red' ? ', and under-8s are going' : '') });
    if (/^No\b/i.test(String(answers.mixedLeaders || '').trim())) out.push({ id: 'mixedLeaders', level: 'amber', words: 'No male and female leader for a mixed group' });
    var ins = String(answers.insurance || '').trim();
    if (answered(ins) && !/^N\/A:/.test(ins)) {
      var c = coverOf(ins);
      if (c === null) out.push({ id: 'insurance', level: 'amber', words: 'The public liability cover isn’t given' });
      else if (c < min) out.push({ id: 'insurance', level: 'amber', words: 'Public liability cover under ' + pounds(min) });
    }
    return out;
  }

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

  Object.keys(EVENT_TEMPLATES).forEach(function (k) { EVENT_TEMPLATES[k].questions = checklistFor(k, {}); });

  var api = { KINDS: KINDS, CONTROLS: CONTROLS, STARTERS: STARTERS, EVENT_KINDS: EVENT_KINDS, EVENT_TEMPLATES: EVENT_TEMPLATES, REVIEW_ITEMS: REVIEW_ITEMS, CHECKLIST: CHECKLIST, FLAGS: FLAGS, ALSO: ALSO, SG_KINDS: SG_KINDS, checklistFor: checklistFor, answered: answered, paedFlag: paedFlag, hostQuestions: hostQuestions,
              answerFlags: answerFlags, coverOf: coverOf, pounds: pounds, MIN_COVER: MIN_COVER,
              score: score, rating: rating, kindLabel: kindLabel, controlLabel: controlLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.EGBCSgTemplates = api;
})(typeof window !== 'undefined' ? window : this);
