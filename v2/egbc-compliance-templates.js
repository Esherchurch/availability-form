/* ===================================================================
   EGBC — building compliance: THE STARTER TEMPLATES, as data (F-230)
   ===================================================================

   THE FREQUENCIES ARE THE LEGAL ONES, OR THE RECOGNISED STANDARD'S (Martin,
   19 Oct), put in automatically when a building's profile is answered -
   no confirmation step. Each check carries its basis (see below); the
   sources are in FINDINGS (F-232).
   They are data, not code: the schedule engine (egbc-compliance.js) reads
   them, and the church changes its own copy of any check without touching
   these. When a new VERSION changes a check (a law or standard changed),
   the church's copies FOLLOW IT AUTOMATICALLY - unless the church made that
   check more frequent: then it keeps its stricter one, with a note.

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

  var VERSION = 4;   // 2: frequencies from the law and the standards; basis on every check (19 Oct)
                     // 3: Martin's decisions and the review (19 Oct): roof 6 months, rebuild 3 years,
                     //    play split weekly / monthly, refuge points weekly plus a service
                     // 4: the duties of employing people, from how many the church employs
                     //    (Martin, F-281 question 11; H&S step 2): egbc-hs-core.js DUTIES

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
    { id: 'employees', q: 'Does anyone the church employs work here?', note: 'How many the church employs, and whether anyone works at a screen, is in Health and safety settings: the duties follow from it.' },
    { id: 'children', q: 'Are there activities for children or young people?' },
    { id: 'loneWorking', q: 'Does anyone work here alone (for example cleaning or opening up)?' },
    { id: 'transport', q: 'Does the church use transport (minibus or volunteers’ cars) for activities?' },
    { id: 'filmOrMusic', q: 'Are there film screenings or music events that are not worship?' }
  ];

  var Y = function (n) { return { n: n, unit: 'year' }; }, M = function (n) { return { n: n, unit: 'month' }; }, W = function (n) { return { n: n, unit: 'week' }; };
  var ONCE = { unit: 'once' }, WORK = { unit: 'demand', trigger: 'buildingWork', triggerWords: 'building work' };

  /* basis (Martin, 19 Oct): THE FREQUENCY IS THE LAW'S OR THE STANDARD'S.
       'legal'     UK law sets it. A church may check MORE often, never less.
       'standard'  the law says "maintain / review regularly"; the recognised
                   British Standard or official guidance (HSE, fire service,
                   Food Standards Agency, ICO, Charity Commission) sets it.
                   Lengthening it needs a recorded reason.
       'practice'  neither exists: good practice, kept modest.
     The source of every one is in FINDINGS (F-232), never here. */
  var TEMPLATES = [
    /* Fire */
    { id: 'fire-ra', basis: 'practice', area: 'Fire', title: 'Review the fire risk assessment (a competent person)', every: Y(1), when: [], note: 'And after any major change to the building or how it is used.' },
    { id: 'fire-alarm-test', basis: 'standard', area: 'Fire', title: 'Test the fire alarm', every: W(1), when: ['fireAlarm'] },
    { id: 'fire-alarm-service', basis: 'standard', area: 'Fire', title: 'Fire alarm service by an engineer', every: M(6), when: ['fireAlarm'] },
    { id: 'emlight-quick', basis: 'standard', area: 'Fire', title: 'Test emergency lighting (quick test)', every: M(1), when: ['emergencyLighting'] },
    { id: 'emlight-full', basis: 'standard', area: 'Fire', title: 'Emergency lighting full test', every: Y(1), when: ['emergencyLighting'] },
    { id: 'ext-in-place', basis: 'standard', area: 'Fire', title: 'Check fire extinguishers and fire blankets are in place', every: W(1), when: [], kind: 'register', note: 'Room by room, from the register: in place, pin and seal intact, gauge in the green.' },
    { id: 'ext-service', basis: 'standard', area: 'Fire', title: 'Fire extinguisher service', every: Y(1), when: [], kind: 'register', note: 'Each item on the register is recorded.' },
    { id: 'fire-doors', basis: 'standard', area: 'Fire', title: 'Fire doors close properly, seals are sound, none propped open', every: M(1), when: ['fireDoors'] },
    { id: 'fire-doors-detailed', basis: 'standard', area: 'Fire', title: 'Fire doors detailed check', every: M(6), when: ['fireDoors'] },
    { id: 'escape-routes', basis: 'standard', area: 'Fire', title: 'Escape routes and exits clear, exit doors open easily', every: W(1), when: [], note: 'Look each day the building is in use; record it here once a week.' },
    { id: 'fire-signs', basis: 'practice', area: 'Fire', title: 'Fire exit and safety signs in place', every: M(1), when: [] },
    { id: 'fire-blanket', basis: 'standard', area: 'Fire', title: 'Kitchen fire blanket in place', every: W(1), when: ['kitchen'] },
    { id: 'fire-drill', basis: 'standard', area: 'Fire', title: 'Fire drill', every: Y(1), when: [] },
    { id: 'fire-marshals', basis: 'practice', area: 'Fire', title: 'Fire marshal training', every: Y(3), when: [] },
    { id: 'smoke-alarms', basis: 'standard', area: 'Fire', title: 'Test the smoke alarms', every: M(1), when: ['type=house'] },
    { id: 'co-alarm', basis: 'standard', area: 'Fire', title: 'Test the carbon monoxide alarm', every: M(1), when: ['type=house', 'gas|woodBurner'] },
    { id: 'evac-chair', basis: 'practice', area: 'Fire', title: 'Evacuation chair in place and inspected, and who is trained to use it', every: M(6), when: ['evacChair'] },
    { id: 'refuge-points', basis: 'standard', area: 'Fire', title: 'Refuge points signed and clear, and test their call system', every: W(1), when: ['refugePoints'], note: 'With the weekly fire alarm test.' },
    { id: 'refuge-service', basis: 'standard', area: 'Fire', title: 'Refuge call system serviced by an engineer', every: M(6), when: ['refugePoints'] },
    { id: 'visual-alarms', basis: 'standard', area: 'Fire', title: 'Test the visual or vibrating fire alarms', every: W(1), when: ['visualAlarms'], note: 'With the weekly fire alarm test.' },
    { id: 'peeps-review', basis: 'practice', area: 'Fire', title: 'Review personal evacuation plans (for people who need help to get out)', every: Y(1), when: [] },
    { id: 'geep-review', basis: 'practice', area: 'Fire', title: 'Review the building’s evacuation plan for visitors who need help', every: Y(1), when: [] },
    { id: 'fire-stopping', basis: 'practice', area: 'Fire', title: 'Check fire stopping after any building work', every: WORK, when: [], note: 'No fixed date: it appears when building work is recorded.' },
    /* Electrical */
    { id: 'eicr', basis: 'standard', area: 'Electrical', title: 'Electrical installation inspection (EICR)', every: Y(5), when: ['!letHouse'] },
    { id: 'eicr-let', basis: 'legal', area: 'Electrical', title: 'Electrical installation inspection (EICR) for the tenants', every: Y(5), when: ['type=house', 'letHouse'], note: 'Give the tenants a copy.' },
    { id: 'pat', basis: 'standard', area: 'Electrical', title: 'Portable appliance testing', every: Y(1), when: ['publicUse'], note: 'Kept as a Maintenance job too; the two are linked.' },
    /* Gas */
    { id: 'gas-service', basis: 'standard', area: 'Gas', title: 'Gas appliance service', every: Y(1), when: ['gas'] },
    { id: 'gas-safety', basis: 'legal', area: 'Gas', title: 'Gas safety check and certificate', every: Y(1), when: ['type=house', 'letHouse', 'gas'], note: 'Give the tenants a copy.' },
    /* Water */
    { id: 'legionella-ra', basis: 'practice', area: 'Water', title: 'Review the legionella risk assessment', every: Y(2), when: [], note: 'And sooner after changes to the water system.' },
    { id: 'water-temps', basis: 'standard', area: 'Water', title: 'Check hot and cold water temperatures', every: M(1), when: [] },
    { id: 'flush-taps', basis: 'standard', area: 'Water', title: 'Flush little-used taps and showers', every: W(1), when: [] },
    /* Asbestos */
    { id: 'asbestos-survey', basis: 'legal', area: 'Asbestos', title: 'Asbestos survey on file', every: ONCE, when: ['pre2000'] },
    { id: 'asbestos-reinspect', basis: 'standard', area: 'Asbestos', title: 'Re-inspect known asbestos', every: Y(1), when: ['pre2000'] },
    /* Building and grounds */
    { id: 'lightning', basis: 'standard', area: 'Building', title: 'Lightning protection inspection', every: Y(1), when: ['lightning'] },
    { id: 'roof-gutters', basis: 'practice', area: 'Building', title: 'Roof, gutters and drains check', every: M(6), when: [], note: 'Spring and autumn.' },
    { id: 'lift', basis: 'legal', area: 'Building', title: 'Lift or stairlift thorough examination', every: M(6), when: ['lift'], note: 'By a competent person (often the insurer’s engineer).' },
    { id: 'play-visual', basis: 'standard', area: 'Building', title: 'Play equipment: a quick look for damage, litter and hazards', every: W(1), when: ['play'] },
    { id: 'play-routine', basis: 'standard', area: 'Building', title: 'Play equipment working check: wear, moving parts, loose fixings', every: M(1), when: ['play'] },
    { id: 'play', basis: 'standard', area: 'Building', title: 'Play equipment yearly inspection', every: Y(1), when: ['play'] },
    { id: 'walk-round', basis: 'practice', area: 'Building', title: 'Monthly walk-round of the building', every: M(1), when: [] },
    { id: 'boundaries', basis: 'practice', area: 'Building', title: 'Boundary walls, paths and steps checked', every: Y(1), when: [] },
    { id: 'trees', basis: 'practice', area: 'Building', title: 'Trees checked for safety', every: Y(1), when: ['trees'] },
    { id: 'oil', basis: 'standard', area: 'Building', title: 'Oil tank and boiler service', every: Y(1), when: ['oilHeating'] },
    { id: 'wood-burner', basis: 'standard', area: 'Building', title: 'Wood burner serviced and chimney swept', every: Y(1), when: ['woodBurner'] },
    { id: 'accessibility', basis: 'practice', area: 'Building', title: 'Accessibility check (getting in, around and out)', every: Y(1), when: [] },
    { id: 'hearing-loop', basis: 'practice', area: 'Building', title: 'Test the hearing loop', every: M(1), when: ['hearingLoop'] },
    /* Health and safety */
    { id: 'hs-ra', basis: 'practice', area: 'Health and safety', title: 'Review the health and safety risk assessment (a competent person)', every: Y(1), when: [] },
    { id: 'hs-policy', basis: 'practice', area: 'Health and safety', title: 'Review the health and safety policy', every: Y(1), when: [] },
    { id: 'chemicals', basis: 'practice', area: 'Health and safety', title: 'Cleaning chemicals listed, with their safety sheets, stored safely', every: Y(1), when: [] },
    { id: 'ladders', basis: 'practice', area: 'Health and safety', title: 'Ladders and steps checked', every: M(6), when: [] },
    { id: 'first-aid-kits', basis: 'practice', area: 'Health and safety', title: 'First aid kits stocked', every: M(1), when: [] },
    { id: 'first-aiders', basis: 'standard', area: 'Health and safety', title: 'First aiders’ training in date', every: Y(3), when: [] },
    { id: 'accident-book', basis: 'practice', area: 'Health and safety', title: 'Accident book in place and reviewed', every: Y(1), when: [] },
    { id: 'defib', basis: 'standard', area: 'Health and safety', title: 'Check the defibrillator (ready light, pads and battery in date)', every: W(1), when: ['defib'] },
    /* Food */
    { id: 'food-reg', basis: 'legal', area: 'Food', title: 'Food business registration in place', every: ONCE, when: ['food'], note: 'With the council, at least 28 days before starting. The council says whether church catering needs it.' },
    { id: 'food-hygiene', basis: 'practice', area: 'Food', title: 'Food hygiene training in date', every: Y(3), when: ['food'] },
    { id: 'fridge-temps', basis: 'standard', area: 'Food', title: 'Fridge and freezer temperatures recorded', every: W(1), when: ['food'], note: 'Check each day food is prepared; record it here once a week.' },
    { id: 'allergens', basis: 'practice', area: 'Food', title: 'Allergen information up to date', every: Y(1), when: ['food'], note: 'And whenever a recipe or supplier changes.' },
    /* Admin, insurance and licences */
    { id: 'insurance', basis: 'practice', area: 'Admin', title: 'Buildings insurance renewal', every: Y(1), when: [] },
    { id: 'rebuild-value', basis: 'practice', area: 'Admin', title: 'Rebuild valuation for the insurance', every: Y(3), when: [] },
    { id: 'public-liability', basis: 'practice', area: 'Admin', title: 'Public liability insurance renewal', every: Y(1), when: [] },
    { id: 'employers-liability', basis: 'legal', area: 'Admin', title: 'Employers’ liability insurance renewal', every: Y(1), when: ['employees'], note: 'It must be in force all the time anyone is employed, with its certificate where employees can see it (or can reach it online).' },
    { id: 'music-licence', basis: 'legal', area: 'Admin', title: 'Music licence for events that are not worship', every: Y(1), when: ['filmOrMusic'] },
    { id: 'film-licence', basis: 'legal', area: 'Admin', title: 'Film screening licence (for example a children’s film club)', every: Y(1), when: ['filmOrMusic'] },
    { id: 'event-notice', basis: 'legal', area: 'Admin', title: 'Notice given for an event with alcohol or entertainment', every: { unit: 'demand', trigger: 'licensedEvent', triggerWords: 'such event' }, when: [], note: 'At least 10 working days before the event.' },
    { id: 'cofe-architect', basis: 'legal', area: 'Admin', title: 'Five-yearly architect’s inspection', every: Y(5), when: ['cofe'] },
    /* Security */
    { id: 'intruder-alarm', basis: 'standard', area: 'Security', title: 'Intruder alarm service', every: M(6), when: ['intruderAlarm'], note: 'Twice a year if it calls a monitoring centre; once a year if it only rings a bell.' },
    { id: 'cctv', basis: 'standard', area: 'Security', title: 'CCTV working, signs up, recordings looked after', every: Y(1), when: ['cctv'] },
    { id: 'key-holders', basis: 'practice', area: 'Security', title: 'List of key holders up to date', every: Y(1), when: [] },
    /* Security (Martyn's Law) - applies when 200 or more could be there at once */
    { id: 'ml-notify', basis: 'legal', area: 'Security (Martyn’s Law)', title: 'Name the responsible person and tell the regulator', every: ONCE, when: ['capacity200'], note: 'Once, and again when it changes. The register opens around spring 2027.' },
    { id: 'ml-plans', basis: 'practice', area: 'Security (Martyn’s Law)', title: 'Written plans: evacuation, keeping people safe inside, lockdown, warning people', every: Y(1), when: ['capacity200'] },
    { id: 'ml-briefing', basis: 'practice', area: 'Security (Martyn’s Law)', title: 'Stewards and duty team briefed on the plans', every: Y(1), when: ['capacity200'] },
    { id: 'ml-ra', basis: 'practice', area: 'Security (Martyn’s Law)', title: 'Simple security risk assessment', every: Y(1), when: ['capacity200'] },
    /* Safeguarding (the records themselves are LINKED: DBS, training, ratios, the register, consent) */
    { id: 'sg-policy', basis: 'standard', area: 'Safeguarding', title: 'Safeguarding policy reviewed and adopted by the trustees', every: Y(1), when: ['children'] },
    { id: 'sg-audit', basis: 'practice', area: 'Safeguarding', title: 'Safeguarding self-audit', every: Y(1), when: ['children'] },
    { id: 'sg-recruitment', basis: 'practice', area: 'Safeguarding', title: 'Safer recruitment records complete', every: Y(1), when: ['children'] },
    /* People at work and events */
    { id: 'lone-working', basis: 'practice', area: 'Health and safety', title: 'Lone working assessment reviewed', every: Y(1), when: ['loneWorking'] },
    { id: 'manual-handling', basis: 'practice', area: 'Health and safety', title: 'Manual handling: chairs, staging and AV kit moved safely (guidance and training)', every: Y(1), when: [] },
    { id: 'transport', basis: 'practice', area: 'Health and safety', title: 'Transport: drivers’ licences and insurance, child seats', every: Y(1), when: ['transport'] },
    { id: 'contractors', basis: 'standard', area: 'Building', title: 'Contractor’s insurance and method statement on file before work starts', every: { unit: 'demand', trigger: 'contractorWork', triggerWords: 'contractor work' }, when: [] },
    { id: 'event-ra', basis: 'practice', area: 'Health and safety', title: 'Event risk assessment for a large, one-off or outdoor event', every: { unit: 'demand', trigger: 'largeEvent', triggerWords: 'such event' }, when: [] },
    { id: 'winter', basis: 'practice', area: 'Building', title: 'Winter plan: grit ready, paths and steps safe in ice and snow', every: Y(1), when: [] },
    { id: 'storm', basis: 'practice', area: 'Building', title: 'Check the building and trees after a storm', every: { unit: 'demand', trigger: 'storm', triggerWords: 'storm' }, when: [] },
    /* Data protection (the information asset register and suppliers are kept beside these) */
    { id: 'ico-fee', basis: 'legal', area: 'Data', title: 'Data protection fee to the ICO renewed', every: Y(1), when: [], note: 'Unless the church is exempt (the ICO’s self-assessment says).' },
    { id: 'privacy-notice', basis: 'practice', area: 'Data', title: 'Privacy notice reviewed', every: Y(1), when: [] },
    { id: 'data-register', basis: 'practice', area: 'Data', title: 'Information asset register reviewed (what we hold, where, why, for how long)', every: Y(1), when: [] },
    { id: 'dp-training', basis: 'practice', area: 'Data', title: 'Data protection training for volunteers who handle personal data', every: Y(2), when: [] },
    { id: 'devices', basis: 'practice', area: 'Data', title: 'Devices holding personal data: passwords and encryption reviewed', every: Y(1), when: [] },
    { id: 'leavers', basis: 'practice', area: 'Data', title: 'Remove a leaver’s access to the church’s systems and data', every: { unit: 'demand', trigger: 'leaver', triggerWords: 'leaver' }, when: [], note: 'Linked to archiving the person in the address book.' },
    /* EMPLOYING PEOPLE (version 4): from how many the church employs (Health and safety settings), on a building
       where someone employed works. employees5: five or more; staffMany: a larger staff team (a setting, 10 by
       default); dse: anyone works at a screen. The sources are in FINDINGS (F-296). */
    { id: 'hs-law-poster', basis: 'legal', area: 'Health and safety', title: 'The “Health and safety law” poster up, or its leaflet given to each employee', every: ONCE, when: ['employees'] },
    { id: 'reportable-injuries', basis: 'practice', area: 'Health and safety', title: 'Know which injuries to an employee must be reported, and to whom (the accident book says)', every: Y(1), when: ['employees'] },
    { id: 'first-aid-needs', basis: 'practice', area: 'Health and safety', title: 'First-aid needs assessment that covers the employees', every: Y(1), when: ['employees'], note: 'And when the work or the number of staff changes.' },
    { id: 'hs-policy-written', basis: 'legal', area: 'Health and safety', title: 'The health and safety policy written down (five or more employees)', every: ONCE, when: ['employees', 'employees5'], note: 'Its yearly review is the policy check.' },
    { id: 'hs-findings-written', basis: 'legal', area: 'Health and safety', title: 'The risk assessment’s significant findings written down (five or more employees)', every: ONCE, when: ['employees', 'employees5'] },
    { id: 'dse-assessment', basis: 'practice', area: 'Health and safety', title: 'Workstation (display screen) assessment for each person who works at a screen', every: Y(1), when: ['employees', 'dse'], note: 'And for anyone new, or when a workstation changes.' },
    { id: 'staff-hs-training', basis: 'practice', area: 'Health and safety', title: 'Staff health and safety training recorded', every: Y(1), when: ['employees', 'staffMany'] },
    { id: 'consult-employees', basis: 'practice', area: 'Health and safety', title: 'Employees consulted on health and safety', every: Y(1), when: ['employees', 'staffMany'] },
    { id: 'staff-lone-working', basis: 'practice', area: 'Health and safety', title: 'Lone working arrangements for staff reviewed', every: Y(1), when: ['employees', 'staffMany'] },
    /* Kept elsewhere in the hub: LINKED, never copied (their own pages keep the dates) */
    { id: 'link-safeguarding', basis: 'standard', area: 'Linked', title: 'Safeguarding: DBS checks and training', kind: 'link', href: 'safeguarding.html', when: [] },
    { id: 'link-hirers', basis: 'practice', area: 'Linked', title: 'Hirers’ documents (insurance, risk assessments)', kind: 'link', href: 'bookings-admin.html', when: ['publicUse'] },
    { id: 'link-ccli', basis: 'legal', area: 'Linked', title: 'CCLI licence (song words and streaming)', kind: 'link', href: 'church-settings.html', when: [] }
  ];
  var BASIS = { legal: 'Legal requirement', standard: 'Recommended standard', practice: 'Good practice' };
  TEMPLATES.forEach(function (t, i) { t.version = VERSION; t.order = i + 1; t.kind = t.kind || 'check'; t.legal = t.basis === 'legal'; });

  /* The extinguisher and fire blanket register: kinds of room, and a plain
     guide to which types each usually needs (Martin to confirm). 'a|b'
     means any one of them (Firestore keeps no lists inside lists). */
  var ROOM_KINDS = [['kitchen', 'Kitchen'], ['hall', 'Hall or worship space'], ['office', 'Office'], ['av', 'AV, electrical or server room'], ['store', 'Store'], ['plant', 'Plant or boiler room'], ['other', 'Other']];
  var EQUIPMENT = [['water', 'Water'], ['foam', 'Foam'], ['co2', 'CO2'], ['powder', 'Dry powder'], ['wetChemical', 'Wet chemical'], ['fireBlanket', 'Fire blanket']];
  var FIRE_GUIDE = { kitchen: ['wetChemical', 'fireBlanket'], hall: ['water|foam'], office: ['water|foam'], av: ['co2'], store: [], plant: [], other: [] };
  var FIRE_GUIDE_NOTE = 'Your fire risk assessment decides; this is a guide. Plant and boiler rooms: as your fire risk assessment says.';

  /* ---- STAGE 4: LIVE RISK MANAGEMENT (Martin, 19 Oct; F-234) ----
     Never called "Risk assessment" on its own: it is a management tool
     that SUPPLEMENTS the church's professional Health, Safety and Fire risk
     assessments. Martin's words, exactly, on every screen of it, every
     snapshot and the trustee report. */
  function riskBanner(church) {
    return 'Live risk management: how ' + (church || 'the church') + ' manages, day to day, the risks identified in its professional Health, Safety and Fire risk assessments. ' +
      'It records the checks, issues, actions and reviews that show those risks are being controlled. It supplements those assessments; it does not replace them. ' +
      "Your trustees remain responsible for your building's safety.";
  }
  /* Starter hazards. The CONTROLS ARE THE CHECKS (template ids): a hazard's
     colour is its checks' colours and the open safety jobs on them. The
     ratings are a starting point (likelihood and severity, 1 to 5 each, with
     the controls in place); the professional assessment decides. */
  var STARTER_HAZARDS = [
    { id: 'fire', area: 'Fire', hazard: 'A fire starts and people cannot get out safely', who: 'Everyone in the building', l: 2, s: 5,
      controls: ['fire-ra', 'fire-alarm-test', 'fire-alarm-service', 'emlight-quick', 'emlight-full', 'ext-in-place', 'ext-service', 'fire-doors', 'escape-routes', 'fire-signs', 'fire-drill', 'peeps-review', 'geep-review', 'refuge-points'] },
    { id: 'slips', area: 'Building', hazard: 'Slips and trips on floors, steps and paths', who: 'Everyone, especially older people', l: 3, s: 3, controls: ['walk-round', 'boundaries', 'winter'] },
    { id: 'electric', area: 'Electrical', hazard: 'Electric shock, or a fire from wiring or appliances', who: 'Everyone; volunteers using equipment', l: 2, s: 5, controls: ['eicr', 'eicr-let', 'pat'] },
    { id: 'gas', area: 'Gas', hazard: 'A gas leak or carbon monoxide', who: 'Everyone in the building', l: 1, s: 5, controls: ['gas-service', 'gas-safety', 'co-alarm'] },
    { id: 'water', area: 'Water', hazard: 'Legionella bacteria in the water system', who: 'Anyone using showers or taps', l: 2, s: 4, controls: ['legionella-ra', 'water-temps', 'flush-taps'] },
    { id: 'asbestos', area: 'Asbestos', hazard: 'Disturbing asbestos during work', who: 'Contractors, volunteers doing repairs', l: 1, s: 5, controls: ['asbestos-survey', 'asbestos-reinspect', 'contractors'] },
    { id: 'height', area: 'Health and safety', hazard: 'A fall when working at height (ladders, staging)', who: 'Volunteers and staff', l: 2, s: 4, controls: ['ladders'] },
    { id: 'food', area: 'Food', hazard: 'Food poisoning or an allergic reaction', who: 'Anyone eating food served here', l: 2, s: 4, controls: ['food-hygiene', 'fridge-temps', 'allergens', 'food-reg'] },
    { id: 'lone', area: 'Health and safety', hazard: 'Someone working alone is hurt and nobody knows', who: 'Cleaners, caretakers, people opening up', l: 2, s: 4, controls: ['lone-working'] },
    { id: 'safeguarding', area: 'Safeguarding', hazard: 'Harm to children or adults at risk', who: 'Children, young people and adults at risk', l: 1, s: 5, controls: ['sg-policy', 'sg-audit', 'sg-recruitment'] },
    { id: 'play', area: 'Building', hazard: 'An injury on play equipment', who: 'Children', l: 2, s: 3, controls: ['play-visual', 'play-routine', 'play'] },
    { id: 'security', area: 'Security', hazard: 'A security incident at a large gathering', who: 'Everyone at a large event', l: 1, s: 5, controls: ['ml-plans', 'ml-briefing', 'ml-ra'] },
    { id: 'handling', area: 'Health and safety', hazard: 'A strain from moving chairs, staging and kit', who: 'Volunteers setting up', l: 3, s: 2, controls: ['manual-handling'] },
    { id: 'firstaid', area: 'Health and safety', hazard: 'An injury or a cardiac arrest with no help to hand', who: 'Everyone', l: 2, s: 5, controls: ['first-aid-kits', 'first-aiders', 'defib'] }
  ];
  /* A rating from likelihood and severity (1 to 5 each). */
  function rating(l, s) { var n = (+l || 1) * (+s || 1); return { score: n, band: n >= 15 ? 'High' : n >= 5 ? 'Medium' : 'Low' }; }

  return { VERSION: VERSION, BASIS: BASIS, GUIDANCE: GUIDANCE, QUESTIONS: QUESTIONS, TEMPLATES: TEMPLATES, ROOM_KINDS: ROOM_KINDS, EQUIPMENT: EQUIPMENT, FIRE_GUIDE: FIRE_GUIDE, FIRE_GUIDE_NOTE: FIRE_GUIDE_NOTE,
    riskBanner: riskBanner, STARTER_HAZARDS: STARTER_HAZARDS, rating: rating };
});
