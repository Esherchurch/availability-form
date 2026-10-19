/* ===================================================================
   EGBC — building compliance: THE STARTER TEMPLATES, as data (F-230)
   ===================================================================

   THE FREQUENCIES ARE STARTER VALUES FOR MARTIN TO CONFIRM BEFORE LAUNCH.
   They are data, not code: the schedule engine (egbc-compliance.js) reads
   them, and the church changes its own copy of any check without touching
   these. A new VERSION here is offered to churches as "template updated";
   it never overwrites what a church has changed.

   Plain words for volunteers. No regulation numbers or legal references
   here or anywhere a user sees; any that seem needed are in FINDINGS.

     when:  [] every building; else every term must hold:
            'flag', '!flag', 'type=house', or 'a|b' (any one of them)
     every: { n, unit: 'week' | 'month' | 'year' | 'once' | 'demand' }
            'demand' waits for something to happen (trigger), e.g. building work
     kind:  'check' (default) | 'register' (the extinguisher register: the
            check is a room-by-room tick-list) | 'link' (kept elsewhere in
            the hub: shown, never copied)
   =================================================================== */
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.EGBCComplianceTemplates = make();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 1;

  var GUIDANCE = 'These checks are guidance to help you. Your trustees remain responsible for your building’s safety.';

  /* The building's profile: plain questions, each answer a flag. */
  var QUESTIONS = [
    { id: 'type', q: 'What is this building?', choices: [['church', 'A church'], ['hall', 'A hall'], ['house', 'A house (manse or vicarage)'], ['other', 'Something else']] },
    { id: 'cofe', q: 'Is it Church of England?' },
    { id: 'gas', q: 'Does it have gas appliances (boiler, cooker, fire)?' },
    { id: 'letHouse', q: 'Is it a house let to tenants?', only: 'type=house' },
    { id: 'pre2000', q: 'Was it built before 2000?' },
    { id: 'fireAlarm', q: 'Is there a fire alarm system?' },
    { id: 'emergencyLighting', q: 'Is there emergency lighting?' },
    { id: 'fireDoors', q: 'Are there fire doors?' },
    { id: 'kitchen', q: 'Is there a kitchen?' },
    { id: 'upperFloorsPublic', q: 'Are upper floors used by the public (for example an upper room)?' },
    { id: 'evacChair', q: 'Is there an evacuation chair?' },
    { id: 'refugePoints', q: 'Are there refuge points (safe places to wait for help on the stairs)?' },
    { id: 'visualAlarms', q: 'Are there visual or vibrating fire alarms (for people who cannot hear the alarm)?' },
    { id: 'lift', q: 'Is there a lift or stairlift?' },
    { id: 'lightning', q: 'Does it have lightning protection?' },
    { id: 'play', q: 'Is there play equipment?' },
    { id: 'food', q: 'Is food served regularly?' },
    { id: 'publicUse', q: 'Is it used by the public or hired out?' },
    { id: 'capacity200', q: 'Could 200 or more people be on the premises at once?', note: 'Count everyone who could be there at the busiest time - services, events and hirers - across the whole premises, not one room.' },
    { id: 'defib', q: 'Is there a defibrillator?' },
    { id: 'cctv', q: 'Is there CCTV?' },
    { id: 'intruderAlarm', q: 'Is there an intruder alarm?' },
    { id: 'hearingLoop', q: 'Is there a hearing loop?' },
    { id: 'oilHeating', q: 'Is it heated by oil?' },
    { id: 'woodBurner', q: 'Is there a wood burner or open fire?' },
    { id: 'trees', q: 'Are there trees on the site?' },
    { id: 'employees', q: 'Does the church employ anyone here?' },
    { id: 'children', q: 'Are there activities for children or young people?' },
    { id: 'loneWorking', q: 'Does anyone work here alone (for example cleaning or opening up)?' },
    { id: 'transport', q: 'Does the church use transport (minibus or volunteers’ cars) for activities?' },
    { id: 'filmOrMusic', q: 'Are there film screenings or music events that are not worship?' }
  ];

  var Y = function (n) { return { n: n, unit: 'year' }; }, M = function (n) { return { n: n, unit: 'month' }; }, W = function (n) { return { n: n, unit: 'week' }; };
  var ONCE = { unit: 'once' }, WORK = { unit: 'demand', trigger: 'buildingWork', triggerWords: 'building work' };

  var TEMPLATES = [
    /* Fire */
    { id: 'fire-ra', area: 'Fire', title: 'Review the fire risk assessment (a competent person)', every: Y(1), when: [], note: 'And after any major change to the building or how it is used.' },
    { id: 'fire-alarm-test', area: 'Fire', title: 'Test the fire alarm', every: W(1), when: ['fireAlarm'] },
    { id: 'fire-alarm-service', area: 'Fire', title: 'Fire alarm service by an engineer', every: M(6), when: ['fireAlarm'] },
    { id: 'emlight-quick', area: 'Fire', title: 'Test emergency lighting (quick test)', every: M(1), when: ['emergencyLighting'] },
    { id: 'emlight-full', area: 'Fire', title: 'Emergency lighting full test', every: Y(1), when: ['emergencyLighting'] },
    { id: 'ext-in-place', area: 'Fire', title: 'Check fire extinguishers and fire blankets are in place', every: M(1), when: [], kind: 'register', note: 'Room by room, from the register.' },
    { id: 'ext-service', area: 'Fire', title: 'Fire extinguisher service', every: Y(1), when: [], kind: 'register', note: 'Each item on the register is recorded.' },
    { id: 'fire-doors', area: 'Fire', title: 'Fire doors close properly, seals are sound, none propped open', every: M(1), when: ['fireDoors'] },
    { id: 'fire-doors-detailed', area: 'Fire', title: 'Fire doors detailed check', every: M(6), when: ['fireDoors'] },
    { id: 'escape-routes', area: 'Fire', title: 'Escape routes and exits clear, exit doors open easily', every: W(1), when: [] },
    { id: 'fire-signs', area: 'Fire', title: 'Fire exit and safety signs in place', every: M(1), when: [] },
    { id: 'fire-blanket', area: 'Fire', title: 'Kitchen fire blanket in place', every: M(1), when: ['kitchen'] },
    { id: 'fire-drill', area: 'Fire', title: 'Fire drill', every: Y(1), when: [] },
    { id: 'fire-marshals', area: 'Fire', title: 'Fire marshal training', every: Y(3), when: [] },
    { id: 'smoke-alarms', area: 'Fire', title: 'Test the smoke alarms', every: M(1), when: ['type=house'] },
    { id: 'co-alarm', area: 'Fire', title: 'Test the carbon monoxide alarm', every: M(1), when: ['type=house', 'gas|woodBurner'] },
    { id: 'evac-chair', area: 'Fire', title: 'Evacuation chair in place and inspected, and who is trained to use it', every: M(6), when: ['evacChair'] },
    { id: 'refuge-points', area: 'Fire', title: 'Refuge points signed and clear, and their call system works', every: M(1), when: ['refugePoints'] },
    { id: 'visual-alarms', area: 'Fire', title: 'Test the visual or vibrating fire alarms', every: M(1), when: ['visualAlarms'] },
    { id: 'peeps-review', area: 'Fire', title: 'Review personal evacuation plans (for people who need help to get out)', every: Y(1), when: [] },
    { id: 'geep-review', area: 'Fire', title: 'Review the building’s evacuation plan for visitors who need help', every: Y(1), when: [] },
    { id: 'fire-stopping', area: 'Fire', title: 'Check fire stopping after any building work', every: WORK, when: [], note: 'No fixed date: it appears when building work is recorded.' },
    /* Electrical */
    { id: 'eicr', area: 'Electrical', title: 'Electrical installation inspection (EICR)', every: Y(5), when: [] },
    { id: 'pat', area: 'Electrical', title: 'Portable appliance testing', every: Y(1), when: ['publicUse'], note: 'Kept as a Maintenance job too; the two are linked.' },
    /* Gas */
    { id: 'gas-service', area: 'Gas', title: 'Gas appliance service', every: Y(1), when: ['gas'] },
    { id: 'gas-safety', area: 'Gas', title: 'Gas safety check and certificate', every: Y(1), when: ['type=house', 'letHouse', 'gas'], legal: true, note: 'A legal requirement for a house let to tenants.' },
    /* Water */
    { id: 'legionella-ra', area: 'Water', title: 'Review the legionella risk assessment', every: Y(2), when: [] },
    { id: 'water-temps', area: 'Water', title: 'Check hot and cold water temperatures', every: M(1), when: [] },
    { id: 'flush-taps', area: 'Water', title: 'Flush little-used taps and showers', every: W(1), when: [] },
    /* Asbestos */
    { id: 'asbestos-survey', area: 'Asbestos', title: 'Asbestos survey on file', every: ONCE, when: ['pre2000'] },
    { id: 'asbestos-reinspect', area: 'Asbestos', title: 'Re-inspect known asbestos', every: Y(1), when: ['pre2000'] },
    /* Building and grounds */
    { id: 'lightning', area: 'Building', title: 'Lightning protection inspection', every: Y(1), when: ['lightning'] },
    { id: 'roof-gutters', area: 'Building', title: 'Roof, gutters and drains check', every: Y(1), when: [] },
    { id: 'lift', area: 'Building', title: 'Lift or stairlift thorough examination', every: M(6), when: ['lift'] },
    { id: 'play', area: 'Building', title: 'Play equipment inspection', every: Y(1), when: ['play'] },
    { id: 'walk-round', area: 'Building', title: 'Monthly walk-round of the building', every: M(1), when: [] },
    { id: 'boundaries', area: 'Building', title: 'Boundary walls, paths and steps checked', every: Y(1), when: [] },
    { id: 'trees', area: 'Building', title: 'Trees checked for safety', every: Y(1), when: ['trees'] },
    { id: 'oil', area: 'Building', title: 'Oil tank and boiler service', every: Y(1), when: ['oilHeating'] },
    { id: 'wood-burner', area: 'Building', title: 'Wood burner serviced and chimney swept', every: Y(1), when: ['woodBurner'] },
    { id: 'accessibility', area: 'Building', title: 'Accessibility check (getting in, around and out)', every: Y(1), when: [] },
    { id: 'hearing-loop', area: 'Building', title: 'Test the hearing loop', every: M(1), when: ['hearingLoop'] },
    /* Health and safety */
    { id: 'hs-ra', area: 'Health and safety', title: 'Review the health and safety risk assessment (a competent person)', every: Y(1), when: [] },
    { id: 'hs-policy', area: 'Health and safety', title: 'Review the health and safety policy', every: Y(1), when: [] },
    { id: 'chemicals', area: 'Health and safety', title: 'Cleaning chemicals listed, with their safety sheets, stored safely', every: Y(1), when: [] },
    { id: 'ladders', area: 'Health and safety', title: 'Ladders and steps checked', every: M(6), when: [] },
    { id: 'first-aid-kits', area: 'Health and safety', title: 'First aid kits stocked', every: M(1), when: [] },
    { id: 'first-aiders', area: 'Health and safety', title: 'First aiders’ training in date', every: Y(3), when: [] },
    { id: 'accident-book', area: 'Health and safety', title: 'Accident book in place and reviewed', every: Y(1), when: [] },
    { id: 'defib', area: 'Health and safety', title: 'Check the defibrillator (ready light, pads and battery in date)', every: M(1), when: ['defib'] },
    /* Food */
    { id: 'food-reg', area: 'Food', title: 'Food business registration in place', every: ONCE, when: ['food'] },
    { id: 'food-hygiene', area: 'Food', title: 'Food hygiene training in date', every: Y(3), when: ['food'] },
    { id: 'fridge-temps', area: 'Food', title: 'Fridge and freezer temperatures recorded', every: W(1), when: ['food'] },
    { id: 'allergens', area: 'Food', title: 'Allergen information up to date', every: Y(1), when: ['food'] },
    /* Admin, insurance and licences */
    { id: 'insurance', area: 'Admin', title: 'Buildings insurance renewal', every: Y(1), when: [] },
    { id: 'rebuild-value', area: 'Admin', title: 'Rebuild valuation for the insurance', every: Y(5), when: [] },
    { id: 'public-liability', area: 'Admin', title: 'Public liability insurance renewal', every: Y(1), when: [] },
    { id: 'employers-liability', area: 'Admin', title: 'Employers’ liability insurance renewal', every: Y(1), when: ['employees'] },
    { id: 'music-licence', area: 'Admin', title: 'Music licence for events that are not worship', every: Y(1), when: ['filmOrMusic'] },
    { id: 'film-licence', area: 'Admin', title: 'Film screening licence (for example a children’s film club)', every: Y(1), when: ['filmOrMusic'] },
    { id: 'event-notice', area: 'Admin', title: 'Notice given for an event with alcohol or entertainment', every: { unit: 'demand', trigger: 'licensedEvent', triggerWords: 'such event' }, when: [] },
    { id: 'cofe-architect', area: 'Admin', title: 'Five-yearly architect’s inspection', every: Y(5), when: ['cofe'] },
    /* Security */
    { id: 'intruder-alarm', area: 'Security', title: 'Intruder alarm service', every: Y(1), when: ['intruderAlarm'] },
    { id: 'cctv', area: 'Security', title: 'CCTV working, signs up, recordings looked after', every: Y(1), when: ['cctv'] },
    { id: 'key-holders', area: 'Security', title: 'List of key holders up to date', every: Y(1), when: [] },
    /* Security (Martyn's Law) - applies when 200 or more could be there at once */
    { id: 'ml-notify', area: 'Security (Martyn’s Law)', title: 'Name the responsible person and tell the regulator', every: ONCE, when: ['capacity200'], note: 'Once, and again when it changes. The register opens around spring 2027.' },
    { id: 'ml-plans', area: 'Security (Martyn’s Law)', title: 'Written plans: evacuation, keeping people safe inside, lockdown, warning people', every: Y(1), when: ['capacity200'] },
    { id: 'ml-briefing', area: 'Security (Martyn’s Law)', title: 'Stewards and duty team briefed on the plans', every: Y(1), when: ['capacity200'] },
    { id: 'ml-ra', area: 'Security (Martyn’s Law)', title: 'Simple security risk assessment', every: Y(1), when: ['capacity200'] },
    /* Safeguarding (the records themselves are LINKED: DBS, training, ratios, the register, consent) */
    { id: 'sg-policy', area: 'Safeguarding', title: 'Safeguarding policy reviewed and adopted by the trustees', every: Y(1), when: ['children'] },
    { id: 'sg-audit', area: 'Safeguarding', title: 'Safeguarding self-audit', every: Y(1), when: ['children'] },
    { id: 'sg-recruitment', area: 'Safeguarding', title: 'Safer recruitment records complete', every: Y(1), when: ['children'] },
    /* People at work and events */
    { id: 'lone-working', area: 'Health and safety', title: 'Lone working assessment reviewed', every: Y(1), when: ['loneWorking'] },
    { id: 'manual-handling', area: 'Health and safety', title: 'Manual handling: chairs, staging and AV kit moved safely (guidance and training)', every: Y(1), when: [] },
    { id: 'transport', area: 'Health and safety', title: 'Transport: drivers’ licences and insurance, child seats', every: Y(1), when: ['transport'] },
    { id: 'contractors', area: 'Building', title: 'Contractor’s insurance and method statement on file before work starts', every: { unit: 'demand', trigger: 'contractorWork', triggerWords: 'contractor work' }, when: [] },
    { id: 'event-ra', area: 'Health and safety', title: 'Event risk assessment for a large, one-off or outdoor event', every: { unit: 'demand', trigger: 'largeEvent', triggerWords: 'such event' }, when: [] },
    { id: 'winter', area: 'Building', title: 'Winter plan: grit ready, paths and steps safe in ice and snow', every: Y(1), when: [] },
    { id: 'storm', area: 'Building', title: 'Check the building and trees after a storm', every: { unit: 'demand', trigger: 'storm', triggerWords: 'storm' }, when: [] },
    /* Data protection (the information asset register and suppliers are kept beside these) */
    { id: 'ico-fee', area: 'Data', title: 'Data protection fee to the ICO renewed', every: Y(1), when: [] },
    { id: 'privacy-notice', area: 'Data', title: 'Privacy notice reviewed', every: Y(1), when: [] },
    { id: 'data-register', area: 'Data', title: 'Information asset register reviewed (what we hold, where, why, for how long)', every: Y(1), when: [] },
    { id: 'dp-training', area: 'Data', title: 'Data protection training for volunteers who handle personal data', every: Y(2), when: [] },
    { id: 'devices', area: 'Data', title: 'Devices holding personal data: passwords and encryption reviewed', every: Y(1), when: [] },
    { id: 'leavers', area: 'Data', title: 'Remove a leaver’s access to the church’s systems and data', every: { unit: 'demand', trigger: 'leaver', triggerWords: 'leaver' }, when: [], note: 'Linked to archiving the person in the address book.' },
    /* Kept elsewhere in the hub: LINKED, never copied */
    { id: 'link-safeguarding', area: 'Linked', title: 'Safeguarding: DBS checks and training', kind: 'link', href: 'safeguarding.html', when: [] },
    { id: 'link-hirers', area: 'Linked', title: 'Hirers’ documents (insurance, risk assessments)', kind: 'link', href: 'bookings-admin.html', when: ['publicUse'] },
    { id: 'link-ccli', area: 'Linked', title: 'CCLI licence (song words and streaming)', kind: 'link', href: 'church-settings.html', when: [] }
  ];
  TEMPLATES.forEach(function (t, i) { t.version = VERSION; t.order = i + 1; t.kind = t.kind || 'check'; });

  /* The extinguisher and fire blanket register: kinds of room, and a plain
     guide to which types each usually needs (Martin to confirm). 'a|b'
     means any one of them (Firestore keeps no lists inside lists). */
  var ROOM_KINDS = [['kitchen', 'Kitchen'], ['hall', 'Hall or worship space'], ['office', 'Office'], ['av', 'AV, electrical or server room'], ['store', 'Store'], ['plant', 'Plant or boiler room'], ['other', 'Other']];
  var EQUIPMENT = [['water', 'Water'], ['foam', 'Foam'], ['co2', 'CO2'], ['powder', 'Dry powder'], ['wetChemical', 'Wet chemical'], ['fireBlanket', 'Fire blanket']];
  var FIRE_GUIDE = { kitchen: ['wetChemical', 'fireBlanket'], hall: ['water|foam'], office: ['water|foam'], av: ['co2'], store: [], plant: [], other: [] };
  var FIRE_GUIDE_NOTE = 'Your fire risk assessment decides; this is a guide. Plant and boiler rooms: as your fire risk assessment says.';

  return { VERSION: VERSION, GUIDANCE: GUIDANCE, QUESTIONS: QUESTIONS, TEMPLATES: TEMPLATES, ROOM_KINDS: ROOM_KINDS, EQUIPMENT: EQUIPMENT, FIRE_GUIDE: FIRE_GUIDE, FIRE_GUIDE_NOTE: FIRE_GUIDE_NOTE };
});
