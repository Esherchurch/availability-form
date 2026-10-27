/* ===================================================================
   THE BUILDING'S OWN HEALTH AND SAFETY, AND FIRE, RISK ASSESSMENTS
   (F-280 section 3, A and B; H&S step 3)
   ===================================================================
   Each building has two, kept beside the live risk register (Martin's
   answer 1): the health and safety assessment, in the HSE's five steps,
   and the fire risk assessment, laid out like PAS 79-1. Each is signed by
   the building's lead, then countersigned by a trustee (answer 2).

     KINDS                      hs, fire: title, who signs, its review check
     GROUPS                     who might be harmed (the HSE's step 2)
     SECTIONS[kind]             the headings, in order, each with the
                                building's checks it shows (by template id)
     questionsFor(kind, prof)   the required questions, from the building's
                                answers (Building compliance's profile).
                                The rules hold the same ids (raHsChecklist):
                                change both together
     done(kind, prof, answers)  [] or the questions still blank
     actionDue(priority, from, settings)   a target date from the priority
                                (Health and safety settings: High 1 month,
                                Medium 3, Low 6; "immediate" is today)

   EVENTS (H&S step 5; F-280 section 3C; Martin's answers 4 and 5; the
   reviewing window's away events at any age, 27 Oct):
     EVENT_KINDS, AWAY, EVENT_FLAGS
     eventQuestions(kind, flags, care)  the required questions (the rules
                                hold the same ids: raEventChecklist)
     needsReasons(ev, o)        why an event needs an assessment: marked by
                                its organiser, people from the setting (100),
                                a flag, away (off-site or overnight), a hirer
   Nothing here is any one church's.
   =================================================================== */
(function (global) {
  'use strict';
  var RA = global.EGBCRaCore || (typeof require === 'function' ? require('./egbc-ra-core.js') : null);

  var KINDS = {
    hs: { title: 'Health and safety risk assessment', short: 'Health and safety', signers: ['hsLead', 'hsDeputy'], signerWords: 'the health and safety lead or deputy', review: 'hs-ra' },
    fire: { title: 'Fire risk assessment', short: 'Fire', signers: ['fireLead', 'hsLead'], signerWords: 'the fire safety lead (or the health and safety lead)', review: 'fire-ra' }
  };

  var GROUPS = [
    ['staff', 'People the church employs'], ['volunteers', 'Volunteers'], ['visitors', 'Visitors and members of the public'],
    ['children', 'Children and young people'], ['vulnerable', 'Older or disabled people, and anyone who may need help'],
    ['contractors', 'Contractors'], ['hirers', 'Hirers and their guests']
  ];

  /* checks: the building's checks a section shows, with their colours (template ids) */
  var SECTIONS = {
    hs: [
      { id: 'hazards', title: '1. Find the hazards', hint: 'Walk round the building, room by room. The building’s answers and the starter hazards give you a start.' },
      { id: 'who', title: '2. Who might be harmed, and how', hint: 'Tick each group, and say how. Think about people more at risk.' },
      { id: 'evaluate', title: '3. Evaluate the risks and decide on precautions', hint: 'For each hazard, how likely and how bad, before and after the controls. The hub does the sums.' },
      { id: 'record', title: '4. Record the findings and act', hint: 'Each action has a priority, a target date and an owner. An action can become a maintenance job.' },
      { id: 'review', title: '5. Review', hint: 'A date to review it by, and look again after a significant change: building work, an incident, a new activity.' }
    ],
    fire: [
      { id: 'premises', title: '1. The premises and how they are used', hint: 'Construction, floors, rooms and their fire maximums, opening hours, hirers.' },
      { id: 'responsible', title: '2. The responsible person, and who carried out this assessment' },
      { id: 'people', title: '3. The people at risk', hint: 'Including anyone who needs help to get out. The evacuation plans are counted here, never named.' },
      { id: 'fireHazards', title: '4. Fire hazards', hint: 'Ignition (electrics, heaters, cooking, candles, smoking), fuel (storage, furnishings, waste), oxygen.' },
      { id: 'protection', title: '5. Fire protection', hint: 'Detection and alarm; escape routes, emergency lighting and signs; firefighting equipment; fire doors.',
        checks: ['fire-alarm-test', 'fire-alarm-service', 'emlight-quick', 'emlight-full', 'escape-routes', 'fire-signs', 'fire-doors', 'ext-in-place', 'ext-service'] },
      { id: 'management', title: '6. Management', hint: 'Training, drills, testing and maintenance.', checks: ['fire-drill', 'fire-marshals', 'peeps-review', 'geep-review', 'refuge-points', 'candles'] },
      { id: 'actions', title: '7. The action plan', hint: 'Each action has a priority and a target date, and can become a maintenance job.' },
      { id: 'review', title: '8. The review date' }
    ]
  };

  /* THE REQUIRED QUESTIONS: answered, or "N/A: <reason>", before the lead signs */
  var Q = {
    insurance: ['Insurance', 'Buildings and public liability cover in force; employers’ liability too where anyone is employed.'],
    competent: ['Who carried it out', 'Their name and why they are competent. For a complex building, a professional should do or check it.'],
    hsHazards: ['The hazards found', 'Did you walk round every room and the outside?'],
    hsWho: ['Who might be harmed', 'Including people more at risk.'],
    hsControls: ['The precautions', 'Are the controls enough, or are more needed?'],
    hsActions: ['The actions', 'Each with a person and a date.'],
    hsReview: ['When it is reviewed', 'A date, and what makes you look again sooner.'],
    firstAid: ['First aid', 'Kits, first aiders, the defibrillator, and the accident book.'],
    electrics: ['Electrics', 'The wiring inspection, portable appliances, extension leads.'],
    workAtHeight: ['Working at height', 'Ladders, staging, changing bulbs, high windows.'],
    manualHandling: ['Moving and lifting', 'Chairs, tables, staging and kit.'],
    contractors: ['Contractors', 'How they are chosen, told about hazards (asbestos) and kept safe.'],
    accessibility: ['Access for disabled people', 'Getting in, around and out.'],
    chemicals: ['Cleaning materials and chemicals', 'Listed, stored safely, with their safety sheets.'],
    foodHygiene: ['Food hygiene', 'Training, temperatures, allergens and cleaning.'],
    gas: ['Gas', 'The annual safety check and the carbon monoxide alarms.'],
    asbestos: ['Asbestos', 'The survey, where it is, and who is told.'],
    lift: ['The lift', 'Its thorough examination and servicing.'],
    loneWorking: ['Lone working', 'Who knows where they are, and how they get help.'],
    employees: ['People the church employs', 'Their risks, training and consultation (Health and safety settings lists the duties).'],
    children: ['Children and young people', 'Rooms, equipment and supervision. Safeguarding has its own register.'],
    towerAccess: ['The tower and roof', 'Who may go up, the ladders and hatches, never alone.'],
    memorials: ['The churchyard and memorials', 'Memorials that lean or are loose, paths, trees.'],
    premises: ['The premises', 'Construction, floors, rooms and how the building is used.'],
    responsible: ['The responsible person', 'Who it is, and who acts for them.'],
    peopleAtRisk: ['People at risk', 'Including anyone who needs help to get out.'],
    ignition: ['Sources of ignition', 'Electrics, heaters, cooking, candles, smoking.'],
    fuel: ['Sources of fuel', 'Storage, furnishings, waste, decorations.'],
    detection: ['Detection and warning', 'The alarm, and how everyone is warned, including people who can’t hear it.'],
    escape: ['Means of escape', 'Routes, exits, emergency lighting and signs.'],
    firefighting: ['Firefighting equipment', 'Extinguishers and blankets: the right kind, in place, serviced.'],
    compartment: ['Fire doors and compartments', 'Fire doors closing, not wedged open.'],
    fireManagement: ['Management', 'Training, drills, testing and records.'],
    fireActions: ['The action plan', 'Each action with a priority and a date.'],
    cooking: ['Cooking', 'The kitchen: who cooks, what is left on, the fire blanket.'],
    nakedFlames: ['Candles and naked flames', 'Holders, distance from fabrics, who puts them out.'],
    heating: ['Wood burners and open fires', 'The chimney swept, the guard, ash put out safely.'],
    hirers: ['Hirers', 'How hirers know the fire plan, the exits and the maximum numbers.']
  };
  var BASE = {
    hs: ['hsHazards', 'hsWho', 'hsControls', 'hsActions', 'hsReview', 'firstAid', 'electrics', 'workAtHeight', 'manualHandling', 'contractors', 'accessibility', 'chemicals'],
    fire: ['premises', 'responsible', 'peopleAtRisk', 'ignition', 'fuel', 'detection', 'escape', 'firefighting', 'compartment', 'fireManagement', 'fireActions']
  };
  /* the building's answer that adds a question: [profile flag, question id] */
  var BY_PROFILE = {
    hs: [['kitchen', 'foodHygiene'], ['gas', 'gas'], ['pre2000', 'asbestos'], ['lift', 'lift'], ['loneWorking', 'loneWorking'], ['employees', 'employees'], ['children', 'children'], ['tower', 'towerAccess'], ['churchyard', 'memorials']],
    fire: [['kitchen', 'cooking'], ['candles', 'nakedFlames'], ['woodBurner', 'heating'], ['publicUse', 'hirers']]
  };

  function questionsFor(kind, profile) {
    var p = profile || {};
    var ids = ['insurance', 'competent'].concat(BASE[kind] || []);
    (BY_PROFILE[kind] || []).forEach(function (x) { if (p[x[0]] === true) ids.push(x[1]); });
    return ids.map(function (id) { return { id: id, label: Q[id][0], hint: Q[id][1] }; });
  }
  function answered(v) { return RA ? RA.answered(v) : !!String(v || '').trim(); }
  function done(kind, profile, answers) {
    answers = answers || {};
    return questionsFor(kind, profile).filter(function (q) { return !answered(answers[q.id]); });
  }
  var PRIORITIES = [['immediate', 'Immediate'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
  function addMonths(day, n) { var p = String(day).slice(0, 10).split('-').map(Number); var d = new Date(Date.UTC(p[0], p[1] - 1 + n, p[2])); return d.toISOString().slice(0, 10); }
  function actionDue(priority, from, targets) {
    var t = Object.assign({ high: 1, medium: 3, low: 6 }, targets || {});
    return priority === 'immediate' ? String(from).slice(0, 10) : addMonths(from, t[priority] || 6);
  }
  /* a review date's colour: red when past, amber within 6 weeks, green otherwise; grey when none */
  function reviewRag(due, today) {
    if (!due) return 'grey';
    if (due < today) return 'red';
    var p = String(today).split('-').map(Number), soon = new Date(Date.UTC(p[0], p[1] - 1, p[2] + 42)).toISOString().slice(0, 10);
    return due <= soon ? 'amber' : 'green';
  }

  /* ---- EVENTS ---- */
  var EVENT_KINDS = [
    ['general', 'A gathering or event in our building'], ['concert', 'A concert or performance'], ['fair', 'A fair, fete or sale'],
    ['wedding', 'A wedding'], ['baptism', 'A baptism or christening'], ['funeral', 'A funeral'], ['hire', 'An outside hirer’s event here'],
    ['daytrip', 'A day trip or outing'], ['residential', 'A weekend away or retreat (overnight)'], ['adventurous', 'Adventurous activities']
  ];
  var AWAY = ['daytrip', 'residential', 'adventurous'];
  var EVENT_FLAGS = [
    ['flames', 'Candles or other naked flames'], ['food', 'Food served'], ['alcohol', 'Alcohol'], ['outdoor', 'Outdoor areas, the car park or traffic'],
    ['equipment', 'Equipment brought in (sound, lighting, stalls)'], ['music', 'Music or a film that isn’t worship']
  ];
  var EQ = {
    insurance: ['Insurance', 'Public liability cover for this event (and the hirer’s own, for a hirer).'],
    numbers: ['Numbers', 'How many are expected, against the rooms’ fire maximums or the venue’s own limit.'],
    firstAid: ['First aid', 'Who the first aiders are on the day, the kit, and how to call for help.'],
    accessibility: ['Access for disabled people', 'Getting in, around and out, and anyone who needs help.'],
    weather: ['Weather, or calling it off', 'What happens in heat, cold, wind or rain, and who decides.'],
    incidents: ['Incidents', 'How an accident or a near miss is recorded, and who is told.'],
    buildingRas: ['The building’s assessments', 'Its health and safety and fire assessments are in date (shown above).'],
    fire: ['Fire', 'Exits kept clear, the stewards and their briefing, what happens when the alarm sounds.'],
    crowd: ['Crowds', 'Stewards, queues, the doors, and keeping numbers under the maximum.'],
    venue: ['The venue', 'Its name, what it provides, and who there is in charge.'],
    venueFire: ['The venue’s fire arrangements', 'Its alarm, exits, assembly point and how the group is told.'],
    venueRa: ['The venue’s own risk assessment', 'Read, and anything the group must do because of it.'],
    travel: ['Travel', 'How everyone gets there and back, vehicles checked, routes and stops.'],
    drivers: ['Drivers', 'Licences, insurance, hours and rest breaks.'],
    medical: ['Medical needs', 'How they are found out and met: general words only, never anyone’s details here.'],
    contacts: ['Emergency contacts', 'Kept by the leader, never in the hub.'],
    leaderOnCall: ['A named leader on call', 'Who the group and those at home can reach, day and night.'],
    careSupport: ['Anyone who may need care or support', 'Yes or No. General words only: no names and no medical details.'],
    careHow: ['How their care or support is given', 'General words only. The safeguarding lead or deputy can see this answer.'],
    sleeping: ['Sleeping', 'Rooms, who shares, and adults’ privacy.'],
    nightFire: ['Fire at night', 'The alarm, exits and roll call where the group sleeps.'],
    instructor: ['Instructors', 'Qualified for the activity, from a licensed provider where the law asks.'],
    activityEquipment: ['Activity equipment', 'Provided and checked by the provider, or ours checked.'],
    activityLicence: ['The provider’s licence', 'An Adventure Activities Licence where needed, or why not needed.'],
    traffic: ['Traffic and parking', 'Cars arriving and leaving, the hearse or wedding cars, people on foot.'],
    fontWater: ['The font and water', 'Water temperature, spills, and children near the font.'],
    churchyard: ['The churchyard', 'Paths, the grave, memorials that lean, and people standing outside.'],
    flames: ['Candles and naked flames', 'Holders, distance from fabrics, who puts them out (the building’s fire assessment, fire hazards).'],
    food: ['Food and allergens', 'Who prepares it, their hygiene training, the allergens listed.'],
    alcohol: ['Alcohol', 'A licence or a temporary event notice, and who serves.'],
    outdoor: ['Outdoors, the car park and traffic', 'Lighting, surfaces, cars and people kept apart.'],
    equipmentPat: ['Electrics brought in', 'Safety-tested, leads taped down, sockets not overloaded.'],
    licensing: ['Licences', 'Music or film licences for an event that isn’t worship.']
  };
  var E_BASE = ['insurance', 'numbers', 'firstAid', 'accessibility', 'weather', 'incidents'];
  var E_HERE = ['buildingRas', 'fire', 'crowd'];
  var E_AWAY = ['venue', 'venueFire', 'venueRa', 'travel', 'drivers', 'medical', 'contacts', 'leaderOnCall', 'careSupport'];
  var E_KIND = { wedding: ['traffic'], baptism: ['fontWater'], funeral: ['churchyard', 'traffic'], residential: ['sleeping', 'nightFire'], adventurous: ['instructor', 'activityEquipment', 'activityLicence'] };
  var E_FLAG = { flames: 'flames', food: 'food', alcohol: 'alcohol', outdoor: 'outdoor', equipment: 'equipmentPat', music: 'licensing' };
  function eventQuestions(kind, flags, care) {
    flags = flags || {};
    var away = AWAY.indexOf(kind) >= 0;
    var ids = E_BASE.concat(away ? E_AWAY : E_HERE).concat(E_KIND[kind] || []);
    EVENT_FLAGS.forEach(function (f) { if (flags[f[0]] === true) ids.push(E_FLAG[f[0]]); });
    if (away && care && care.support === 'yes') ids.push('careHow');
    return ids.map(function (id) { return { id: id, label: EQ[id][0], hint: EQ[id][1] }; });
  }
  function eventDone(kind, flags, care, answers) {
    answers = answers || {};
    return eventQuestions(kind, flags, care).filter(function (q) { return !answered(answers[q.id]); });
  }
  /* why an event needs an assessment (answer 4, and away events at any age): [] when it doesn't */
  var AWAY_SG = ['trip', 'overnight', 'offsite', 'camp'];
  function needsReasons(ev, o) {
    ev = ev || {}; o = o || {};
    var out = [], flags = o.flags || {}, people = +o.people || +ev.capacity || 0, at = (o.settings && o.settings.eventPeople) || 100;
    if (o.marked) out.push('its organiser marked it');
    if (people >= at) out.push(people + ' people (from ' + at + ')');
    EVENT_FLAGS.forEach(function (f) { if (flags[f[0]] === true && f[0] !== 'music') out.push(f[1].toLowerCase()); });
    if (AWAY.indexOf(o.kind) >= 0 || (ev.location || {}).kind === 'venue' || AWAY_SG.indexOf(ev.sgKind || '') >= 0) out.push('away from our buildings, or overnight');
    if (o.kind === 'hire') out.push('an outside hirer');
    return out;
  }

  var api = { KINDS: KINDS, EVENT_KINDS: EVENT_KINDS, AWAY: AWAY, EVENT_FLAGS: EVENT_FLAGS, EQ: EQ, E_BASE: E_BASE, E_HERE: E_HERE, E_AWAY: E_AWAY, E_KIND: E_KIND, E_FLAG: E_FLAG,
    eventQuestions: eventQuestions, eventDone: eventDone, needsReasons: needsReasons, GROUPS: GROUPS, SECTIONS: SECTIONS, Q: Q, BASE: BASE, BY_PROFILE: BY_PROFILE, PRIORITIES: PRIORITIES,
    questionsFor: questionsFor, done: done, actionDue: actionDue, addMonths: addMonths, reviewRag: reviewRag };
  global.EGBCHsTemplates = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
