/* ===================================================================
   DATA RECORDS (UK GDPR) - the reviewing window's job 5
   ===================================================================
   Three records a church keeps to show it looks after people's data:

     infoAssets/{id}     THE INFORMATION ASSET REGISTER (the record of
                         processing): what the hub holds, why, on what
                         lawful basis, for how long, who sees it, who
                         processes it. The fields are main's (FINDINGS-events,
                         "The INFORMATION ASSET REGISTER", 19 Oct), so its
                         privacy tools read the same list.
     dataBreaches/{id}   THE BREACH LOG: what happened in general words, what
                         data and how many people, the risk, and the 72-hour
                         decision on telling the ICO; who was told, what was
                         done, what was learned. Every breach, reported or not.
     dataRequests/{id}   DATA REQUESTS (someone asking for their data, to
                         correct it, delete it ...): received, the one-month
                         deadline (extended by two months with a reason),
                         identity checked, done or refused, and why.

   A church names its data protection lead(s) (dataSettings/main.leads).
   For any church: the starter register lists what the hub itself holds;
   the church adds anything else (paper, spreadsheets).

     DR.LAWFUL, DR.SUBJECTS, DR.REQUEST_KINDS
     DR.SEED                        the hub's own starter register
     DR.missing(assets)             starter rows a started register hasn't got yet
     DR.keepWords(retention)        "2 years from the last time it is used, then reviewed"
     DR.formMonths(assets)          the register's months for form answers (or 0)
     DR.requestDue(r)               the date a request must be answered by
     DR.requestState(r, today)      { rag, words }
     DR.breachDeadline(b)           72 hours after it was discovered (ISO)
     DR.breachState(b, now)         { rag, words }
   =================================================================== */
(function (global) {
  'use strict';
  var LAWFUL = [['consent', 'Consent'], ['contract', 'Contract'], ['legal', 'Legal obligation'], ['vital', 'Vital interests'], ['public', 'Public task'], ['legitimate', 'Legitimate interests']];
  var SUBJECTS = [['members', 'Members and attenders'], ['children', 'Children'], ['parents', 'Parents and carers'], ['visitors', 'Visitors'], ['hirers', 'Hirers'], ['donors', 'Donors'], ['volunteers', 'Volunteers and leaders'], ['subscribers', 'Newsletter subscribers']];
  var REQUEST_KINDS = [['access', 'To see their data (subject access)'], ['rectify', 'To correct it'], ['erase', 'To delete it'], ['restrict', 'To limit its use'], ['portable', 'To have it to take elsewhere'], ['object', 'To object to its use']];
  var BREACH_KINDS = [['confidentiality', 'Seen or sent by someone who shouldn’t have it'], ['integrity', 'Changed or damaged'], ['availability', 'Lost, or couldn’t be reached']];
  /* the church's own processors, as the hub uses them */
  var GOOGLE = 'Google (Firebase): where the hub is held, in the UK and EU';
  function A(name, collections, purpose, lawfulBasis, subjects, fields, access, keep, extra) {
    return Object.assign({ name: name, collections: collections, purpose: purpose, lawfulBasis: lawfulBasis, specialCategory: false, specialCondition: '',
      dataSubjects: subjects, fieldsHeld: fields, access: access, retention: keep, retentionKey: '', processors: [GOOGLE], whereHeld: 'UK/EU', owner: 'The church office', reviewedOn: '' }, extra || {});
  }
  var Y = function (n, from, then) { return { keepFor: n * 365, from: from || 'lastActivity', then: then || 'review' }; };
  /* Religious belief is special category data for any church: members' data is held under Article 9(2)(d) (a not-for-profit body with a religious aim, about its members). */
  var RELIGIOUS = { specialCategory: true, specialCondition: 'A not-for-profit body with a religious aim, about its members and regular contacts, not shared outside without consent' };
  var SEED = [
    A('Address book', ['addressBook', 'users'], 'Keeping in touch with members and attenders, rotas, and running the church', 'legitimate', ['members', 'volunteers'], ['name', 'email', 'phone', 'address', 'teams'], ['The church office', 'Team leaders (their own teams)'], Y(1, 'leftChurch', 'delete'), RELIGIOUS),
    A('Children and families (Sunday groups)', ['kidsChildren', 'kidsFamilies', 'checkins'], 'Keeping children safe: who they are, who may collect them, check-in and check-out', 'legitimate', ['children', 'parents'], ['name', 'school year', 'parents', 'phone', 'who may collect', 'photo and filming consent', 'allergy and medical flags'], ['The children’s leads and leaders'], Y(1, 'lastActivity', 'delete'),
      { specialCategory: true, specialCondition: 'Health: to protect the child (vital interests, and explicit consent on the form)' }),
    A('Forms and consent answers', ['formResponses', 'sensitiveResponses'], 'Consent for activities and trips, and what leaders must know', 'consent', ['parents', 'children', 'volunteers'], ['the form’s answers', 'medical answers (kept apart)'], ['The form’s team', 'The safeguarding lead (medical answers)'], { keepFor: 365, from: 'eventEnd', then: 'delete' },
      { specialCategory: true, specialCondition: 'Health: explicit consent', retentionKey: 'formResponses' }),
    A('Safeguarding: leader checks', ['leaderChecks'], 'Showing every leader working with children has the checks and training the policy asks for', 'legal', ['volunteers'], ['DBS level and date (never the certificate number)', 'training date', 'references'], ['The safeguarding lead and deputy'], Y(6, 'leftChurch', 'review')),
    A('Safeguarding: concerns and incidents', ['concerns', 'incidents'], 'Responding to concerns and keeping people safe', 'legal', ['children', 'members', 'visitors'], ['what happened', 'who was involved'], ['The safeguarding lead and deputy'], { keepFor: 75 * 365, from: 'created', then: 'review' },
      { specialCategory: true, specialCondition: 'Safeguarding of children and adults at risk (substantial public interest)' }),
    A('Events and sign-ups', ['calEvents', 'signups'], 'Running events: who is coming, and contacting them about it', 'contract', ['members', 'visitors', 'children'], ['name', 'email', 'phone', 'places'], ['The event’s organisers'], { keepFor: 365, from: 'eventEnd', then: 'delete' }),
    A('Room bookings and hire', ['bookings', 'charges', 'invoices'], 'Booking rooms, and hiring them out', 'contract', ['hirers', 'members'], ['name', 'email', 'phone', 'organisation', 'what they paid'], ['The church office', 'Bookings admins'], Y(6, 'created', 'delete')),
    A('Giving and Gift Aid', ['regularGifts', 'signupPayments', 'paymentEvents', 'giftAid'], 'Taking gifts and claiming Gift Aid', 'legal', ['donors'], ['name', 'address', 'amounts', 'Gift Aid declaration'], ['The treasurer', 'The church office'], Y(6, 'created', 'delete'), { processors: [GOOGLE, 'The card and bank payment providers', 'HMRC (Gift Aid claims)'] }),
    A('Newsletter subscribers', ['enewsSubscribers'], 'Sending the e-news to people who asked for it', 'consent', ['subscribers'], ['name', 'email'], ['The communications team'], { keepFor: 0, from: 'lastActivity', then: 'delete' }, { processors: [GOOGLE, 'The email sender'] }),
    A('Pastoral care and prayer requests', ['worries', 'prayers'], 'Caring for people and praying for them, as they ask', 'consent', ['members', 'visitors'], ['name', 'what they asked'], ['The named pastoral team only'], Y(2, 'lastActivity', 'review'), RELIGIOUS),
    A('Rotas', ['services', 'availability', 'rotaExceptions'], 'Planning who serves when', 'legitimate', ['volunteers'], ['name', 'availability'], ['Team leaders'], Y(1, 'lastActivity', 'delete')),
    A('Health and safety: fire roll call and evacuation plans', ['fireRollCall', 'peeps'], 'Getting everyone out safely in a fire', 'legal', ['members', 'volunteers'], ['name', 'help needed to get out'], ['The office', 'Fire safety leads'], Y(1, 'lastActivity', 'review'),
      { specialCategory: true, specialCondition: 'Health: to protect their life (vital interests), and consent' }),
    A('Working alone', ['loneVisits'], 'Making sure someone working alone in a building is safe', 'legitimate', ['volunteers', 'members'], ['name', 'phone', 'building', 'times in and out'], ['The building’s contacts', 'The office'], { keepFor: 30, from: 'created', then: 'delete' }),
    A('Drivers', ['drivers', 'driverOk'], 'Making sure people who drive for the church are licensed and insured', 'legitimate', ['volunteers'], ['licence categories and check date (never the number)', 'insurance date', 'minibus course date'], ['The people the church names'], Y(1, 'leftChurch', 'delete')),
    A('Pastoral visits', ['pastoralVisits', 'pastoralSettings'], 'Pastoral care of members and others', 'legitimate', ['members', 'visitors'], ['name', 'date and way of the visit', 'the visitors', 'a follow-up date', 'a short private note'], ['The church’s named, trained visitors only'], Y(2, 'lastActivity', 'review'),
      Object.assign({ retentionKey: 'pastoralVisits', owner: 'The pastoral lead' }, RELIGIOUS)),
    A('Photos and video', ['pictureLibrary', 'uploadItems'], 'Telling the church’s story, with permission', 'consent', ['members', 'children'], ['images'], ['The communications team'], Y(3, 'created', 'review'))
  ];

  /* a register started before a starter row was added gets it offered (matched by name) */
  function missing(assets) {
    var have = {}; (assets || []).forEach(function (a) { have[String(a.name || '').toLowerCase()] = 1; });
    return SEED.filter(function (a) { return !have[a.name.toLowerCase()]; });
  }
  function keepWords(r) {
    r = r || {}; var d = r.keepFor || 0, from = { created: 'from when it is made', lastActivity: 'from the last time it is used', eventEnd: 'after the event', leftChurch: 'after they leave the church' }[r.from] || '';
    var n = d === 0 ? 'Until they ask to stop' : d % 365 === 0 ? (d / 365) + ' year' + (d / 365 === 1 ? '' : 's') + ' ' + from : d + ' days ' + from;
    return n + (r.then ? ', then ' + ({ delete: 'deleted', anonymise: 'made anonymous', review: 'reviewed' }[r.then] || r.then) : '');
  }
  /* form answers' row: retentionKey 'formResponses', or the collection named */
  function formMonths(assets) {
    var a = (assets || []).filter(function (x) { return !x.archived && (x.retentionKey === 'formResponses' || (x.collections || []).indexOf('formResponses') >= 0); })[0];
    return a && a.retention && a.retention.keepFor ? Math.max(1, Math.round(a.retention.keepFor / 365 * 12)) : 0;
  }

  function addDays(day, n) { var p = String(day).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
  function addMonths(day, n) { var p = String(day).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1 + n, p[2])).toISOString().slice(0, 10); }
  /* one month from receipt (the ICO's "calendar month"), or three when extended for a complex request */
  function requestDue(r) { return r && r.receivedOn ? addMonths(r.receivedOn, r.extended ? 3 : 1) : ''; }
  function requestState(r, today) {
    if (!r) return { rag: 'grey', words: '' };
    if (r.status === 'done') return { rag: 'green', words: 'Answered' + (r.doneOn ? ' on ' + r.doneOn : '') };
    if (r.status === 'refused') return { rag: 'green', words: 'Refused, with the reason recorded' };
    var due = requestDue(r);
    if (due && due < today) return { rag: 'red', words: 'Overdue: it was due by ' + due };
    if (due && due <= addDays(today, 7)) return { rag: 'amber', words: 'Due by ' + due };
    return { rag: 'green', words: 'Due by ' + due };
  }
  function breachDeadline(b) { var t = Date.parse((b && b.discoveredAt) || ''); return isNaN(t) ? '' : new Date(t + 72 * 3600e3).toISOString(); }
  function breachState(b, now) {
    if (!b) return { rag: 'grey', words: '' };
    if (b.status === 'closed') return { rag: 'green', words: 'Closed' };
    if (b.icoDecision) return { rag: 'amber', words: b.icoDecision === 'reported' ? 'Reported to the ICO; still open' : 'Not reportable (reason recorded); still open' };
    var dl = breachDeadline(b), left = dl ? (Date.parse(dl) - (now || Date.now())) / 3600e3 : 0;
    if (dl && left < 0) return { rag: 'red', words: 'More than 72 hours: decide now whether to tell the ICO, and record why it was late' };
    return { rag: 'red', words: 'Decide whether to tell the ICO within 72 hours of finding it: ' + Math.max(0, Math.floor(left)) + ' hours left' };
  }

  var api = { LAWFUL: LAWFUL, SUBJECTS: SUBJECTS, REQUEST_KINDS: REQUEST_KINDS, BREACH_KINDS: BREACH_KINDS, SEED: SEED, missing: missing, keepWords: keepWords, formMonths: formMonths,
    requestDue: requestDue, requestState: requestState, breachDeadline: breachDeadline, breachState: breachState, addMonths: addMonths };
  global.EGBCDataRecords = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
