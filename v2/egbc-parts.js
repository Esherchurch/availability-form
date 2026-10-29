/* ===================================================================
   THE PARTS OF THE HUB A CHURCH USES
   ===================================================================
   A church switches WHOLE PARTS on and off (Church settings, "Choose
   what your church uses"; setup's "What will you use?"): a church that
   only wants Worship and AV switches the rest off. Each part holds its
   pages and the finer switches inside it (EGBCAuth.features()). A part
   switched off goes from the Menu, the app, Home and search, its pages
   say it isn't used here, and the server stops its emails, reminders and
   scheduled jobs (functions/parts.js usesPart). Nothing is ever deleted:
   switching it back on brings it all back.

   Stored in churchSettings/features as parts: { <part>: false }. A part
   with nothing stored is on, so EGBC, which has stored none, uses them all.

     EGBCParts.PARTS          -> [{ id, label, means, features, pages }]
     EGBCParts.ALWAYS         -> the pages that are never switched off
     EGBCParts.PRESETS        -> the ready-made choices, [{ id, label, parts, features }]
     EGBCParts.on(stored, id) -> is this part on? (stored: the parts map)
     EGBCParts.partOf(page)   -> the part a page belongs to, or ''
     EGBCParts.partOfFeature(name) -> the part a finer switch is inside, or ''
     EGBCParts.matching(stored, features) -> the preset the switches match, or ''
     EGBCParts.presetSwitches(id) -> a ready-made choice as the switches to save

   A PLAIN SCRIPT (window.EGBCParts), with functions/parts.js its server
   copy, built by tools/parts-build.mjs.
   =================================================================== */
(function (global) {
  'use strict';

  var PARTS = [
    { id: 'rota', label: 'Sundays and the rota', means: 'Availability, the rota and its planner, rota reports, the preaching plan, reminders and calendar feeds',
      features: ['availability', 'rotaReports', 'preachingPlan', 'usualPeople'],
      pages: ['index.html', 'view-only-rota.html', 'planner.html', 'trainingrotaplanner.html', 'rotaplannerinstructions.html', 'rota-reports.html', 'preaching-plan.html'] },
    { id: 'worship', label: 'Worship and AV', means: 'Sunday and youth service plans, the music database and uploads, Play-Through, the mix builder, performance notes and the AV training, how-to, troubleshooting, inventory, mapper and monitor set-up',
      features: [],
      pages: ['sundayserviceplanner.html', 'youthserviceplanner.html', 'serviceplannerinstructions.html', 'training sunday planner.html', 'library.html', 'batchupload.html',
        'music-uploader.html', 'uploaderinstructions.html', 'trainingbatchimporter.html', 'trainingmusicdatabase.html', 'sundayplannersonglibrary.html', 'song-summary.html',
        'egbc-playthrough.html', 'mix-builder.html', 'mix-player.html', 'mix-analyser.html', 'performancenotes.html', 'egbc-training-worship.html', 'egbc-howto-av.html',
        'egbc-troubleshoot-av.html', 'inventory-system-2.html', 'schematic.html', 'monitorstagemap.html', 'avteamlandingpage.html', 'worshiphubapp.html',
        'egbcworship&av.html', 'worshipteamcharter.html', 'trainingportalhub.html', 'videos.html', 'coreteamapp.html', 'coreteamcharter.html', 'birthday.html'] },
    { id: 'kids', label: 'Kids and youth', means: 'The session planner, Present, the quiz, the children’s register, Sunday check-in and youth access',
      features: ['sessionPlanner', 'quiz', 'kids', 'screenPaging'],
      pages: ['session-planner.html', 'present.html', 'present-guide.html', 'quiz.html', 'kids-admin.html', 'kids-checkin.html', 'youth-access.html', 'youthapp2.html', 'youthcharter.html'] },
    { id: 'safeguarding', label: 'Safeguarding', means: 'DBS and training, the risk register and event assessments',
      features: ['safeguarding', 'safeguardingRegister'],
      pages: ['safeguarding.html', 'safeguarding-settings.html', 'safeguarding-risk.html', 'sg-print.html', 'event-ra.html'] },
    { id: 'care', label: 'Care and prayer', means: 'Care & support, its inbox, pastoral visits and prayer',
      features: ['care', 'prayer'],
      pages: ['care.html', 'care-inbox.html', 'pastoral-visits.html', 'prayer.html', 'worried.html'] },
    { id: 'events', label: 'Events and groups', means: 'Events, What’s on, check-in, registers, headcounts, forms, small groups and “I’m new here”',
      features: ['events', 'publicWhatson', 'sundaysInWhatsOn', 'forms', 'smallGroups', 'newHere'],
      pages: ['events-admin.html', 'whatson.html', 'whatson-embed.html', 'signup.html', 'my-signup.html', 'checkin.html', 'attendance.html', 'headcounts.html',
        'form.html', 'forms-admin.html', 'groups.html', 'groups-admin.html', 'newhere.html'] },
    { id: 'rooms', label: 'Rooms and hire', means: 'Booking a room, bookings, hire, places and catering',
      features: ['roomBookings'],
      pages: ['book.html', 'bookings-admin.html', 'hire.html', 'my-booking.html', 'places-admin.html', 'rooms.html', 'room.html', 'catering.html'] },
    { id: 'building', label: 'Building, health and safety', means: 'Maintenance, compliance, risk assessments, the live risk register, evacuation plans, lone working, drivers and vehicles',
      features: ['maintenance', 'buildingCompliance'],
      pages: ['maintenance.html', 'building.html', 'compliance.html', 'assessment.html', 'risk.html', 'ra-print.html', 'hs-settings.html', 'peep.html', 'lone.html', 'transport.html'] },
    { id: 'comms', label: 'Communications', means: 'Notices, the email compiler, the e-news, the card maker, Canva, the picture library and social posts',
      features: ['notices', 'enews', 'cardMaker', 'canva', 'pictureLibrary'],
      pages: ['comms.html', 'emailbuilder2.html', 'emailcompilerinstructions.html', 'enews.html', 'enews-edit.html', 'enews-signup.html', 'enews-confirm.html',
        'enews-unsubscribe.html', 'enews-web.html', 'cardmaker.html', 'canva.html', 'picture-library.html', 'socialmaker.html', 'upload.html'] },
    { id: 'giving', label: 'Giving', means: 'Give, regular giving, Gift Aid and payments',
      features: ['giftAid', 'payments'],
      pages: ['give.html', 'give-regularly.html', 'giftaid.html', 'payments.html', 'giving-details.html'] },
    { id: 'meetings', label: 'Meetings', means: 'Video meetings, members’ meetings and votes',
      features: ['meetings'],
      pages: ['meeting.html', 'meet.html', 'church-meeting.html'] },
    { id: 'watch', label: 'Watch and listen', means: 'Watch, sermons and the podcast',
      features: ['watch', 'sermons'],
      pages: ['watch.html', 'watch-admin.html', 'sermons-admin.html'] },
    { id: 'churchShow', label: 'ChurchShow', means: 'The screens in church: services, songs and lessons',
      features: ['churchShow'],
      pages: ['churchshow.html'] }
  ];

  /* Never switched off: the hub itself and what every church needs. */
  var ALWAYS = ['hub.html', 'app.html', 'login.html', 'setup.html', 'addressbook.html', 'teams-admin.html', 'church-settings.html', 'services-settings.html',
    'your-church.html', 'permissions.html', 'data-records.html', 'data-tools.html', 'retention.html', 'privacy.html', 'notifications.html', 'my-messages.html',
    'resources.html', 'hubresources.html', 'team-mail.html', 'buildings.html', 'stickynotes.html'];

  var ALL = PARTS.map(function (p) { return p.id; });
  var WORSHIP = ['rota', 'worship', 'churchShow', 'meetings', 'comms'];
  /* The ready-made choices. features: finer switches set with them (a
     Worship and AV church keeps notices but not the e-news and the rest). */
  var PRESETS = [
    { id: 'worship', label: 'Worship and AV only', means: 'Sundays and the rota, Worship and AV, ChurchShow, meetings and notices',
      parts: WORSHIP, features: { enews: false, cardMaker: false, canva: false, pictureLibrary: false } },
    { id: 'sundays', label: 'Sundays and teams', means: 'Worship and AV only, with kids and youth, safeguarding, care and prayer, and watch and listen',
      parts: WORSHIP.concat(['kids', 'safeguarding', 'care', 'watch']), features: { enews: false, cardMaker: false, canva: false, pictureLibrary: false } },
    { id: 'everything', label: 'Everything', means: 'Every part of the hub', parts: ALL, features: {} }
  ];

  function lower(page) { return String(page || '').split(/[?#]/)[0].split('/').pop().toLowerCase(); }

  /** Is this part on? @param {Object<string, boolean>} stored the parts map @param {string} id */
  function on(stored, id) { return !(stored && stored[id] === false); }

  /** The part a page belongs to, or '' for one never switched off. @param {string} page */
  function partOf(page) {
    var p = lower(page);
    for (var i = 0; i < PARTS.length; i++) if (PARTS[i].pages.indexOf(p) !== -1) return PARTS[i].id;
    return '';
  }

  /** The part a finer switch sits inside, or ''. @param {string} name a feature name */
  function partOfFeature(name) {
    for (var i = 0; i < PARTS.length; i++) if (PARTS[i].features.indexOf(name) !== -1) return PARTS[i].id;
    return '';
  }

  /**
   * The ready-made choice the switches match now, or '' ("your own mix").
   * @param {Object<string, boolean>} stored the parts map
   * @param {Object<string, boolean>} features the finer switches stored
   */
  function matching(stored, features) {
    var f = features || {};
    for (var i = 0; i < PRESETS.length; i++) {
      var P = PRESETS[i];
      var partsSame = ALL.every(function (id) { return on(stored, id) === (P.parts.indexOf(id) !== -1); });
      var featsSame = Object.keys(P.features).every(function (k) { return (f[k] !== false) === P.features[k]; })
        && (P.id !== 'everything' || Object.keys(f).every(function (k) { return f[k] !== false || !partOfFeature(k); }));
      if (partsSame && featsSame) return P.id;
    }
    return '';
  }

  /**
   * A ready-made choice as the switches to save (merged into
   * churchSettings/features): every part on or off, and the finer switches
   * inside the parts as it says (the rest on). null for no such choice.
   * @param {string} id a preset id @returns {Object|null}
   */
  function presetSwitches(id) {
    var x = PRESETS.filter(function (p) { return p.id === id; })[0];
    if (!x) return null;
    var out = { parts: {} };
    PARTS.forEach(function (p) {
      out.parts[p.id] = x.parts.indexOf(p.id) !== -1;
      p.features.forEach(function (f) { out[f] = x.features[f] !== undefined ? x.features[f] : true; });
    });
    return out;
  }

  global.EGBCParts = { PARTS: PARTS, ALWAYS: ALWAYS, PRESETS: PRESETS, on: on, partOf: partOf, partOfFeature: partOfFeature, matching: matching, presetSwitches: presetSwitches };
})(typeof window !== 'undefined' ? window : globalThis);
