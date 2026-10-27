/* ===================================================================
   EGBC — the church's own services and service roles (FINDINGS-churchhq
   H-11 items 3 and 4; Martin's answers, 23 Oct 2026: the recommended ones)
   ===================================================================

   A SERVICE IS ITS ROTA EVENT: its date, start time and building
   (`siteId`; none = the church's main building), its own rota and plan
   (egbc-plan-store.js). This file says what KINDS of service and meeting a
   church has, and which ROLES a service has, from one church setting,
   churchSettings/services:

     types: [{ name, service, start, end, publicTime, siteId, jobs, slots }]
       name        what the rota calls it ("10am Parish Eucharist")
       service     true for a service (the public What's on, the preaching
                   plan, the planners); false for a practice or meeting
       start, end  the usual times ("HH:MM")
       publicTime  the time What's on shows, when it differs from start
       siteId      its usual building ('' = the main building)
       jobs        the teams it needs, by team job (H-9): ['worship', 'av']
       slots       the rota places it starts with ("Organist", "Servers")
     roles: [{ id, name, slides }]
       the people a service names that are NOT rota places - EGBC's
       Service Leader and Speaker; a parish's President, Preacher,
       Intercessor. `slides`: shown on the team slides.

   EGBC NEEDS NO DOCUMENT: with nothing stored, EGBC's twelve kinds and
   two roles are the defaults, so nothing changes for EGBC. A church that
   stores its own lists replaces the defaults whole.

     EGBCServices.types(cfg)            -> the kinds, in the church's order
     EGBCServices.type(cfg, name)       -> one kind, or null
     EGBCServices.isService(cfg, name)  -> a service, not a meeting
     EGBCServices.serviceNames(cfg)     -> the services' names
     EGBCServices.roles(cfg)            -> the roles
     EGBCServices.roleValue(ev, role)   -> who it is on this service
     EGBCServices.roleField(role)       -> the field to write ('serviceLeader'
                                           for EGBC's two, else 'serviceRoles.<id>')
     EGBCServices.slideRoles(cfg, ev)   -> [[role name, who]] for the slides
     EGBCServices.newEvent(cfg, name, date, teamsForJob) -> the fields a new
                                           rota event of that kind starts with
     EGBCServices.validate(cfg)         -> [] or the problems, in words
     EGBCServices.load(db)              -> Promise of the church's cfg (cached)

   cfg: the churchSettings/services document, or null.
   teamsForJob(job): the church's teams for a job (EGBCAuth.teamsForJob).
   =================================================================== */
(function (global) {
  'use strict';

  var SUNDAY_SLOTS = ['Worship Leader', 'Keyboard', 'Guitar', 'Drums', 'Bass', 'Sound', 'Words', 'Cameras'];
  function svc(name) {
    return { name: name, service: true, start: '08:00', end: '11:30', publicTime: '10:00', siteId: '', jobs: ['worship', 'av'], slots: SUNDAY_SLOTS.slice() };
  }
  function meet(name, jobs, slots, start, end) {
    return { name: name, service: false, start: start || '19:30', end: end || '21:00', publicTime: '', siteId: '', jobs: jobs || ['worship', 'av'], slots: slots || [] };
  }
  /* EGBC's, as the rota has always made them. */
  var DEFAULT_TYPES = [
    svc('Sunday Morning Worship'),
    meet('Sunday Team Practice', ['worship'], ['Worship Leader', 'Keyboard', 'Guitar', 'Drums', 'Bass'], '19:30', '21:30'),
    svc('Evening Carol Service'),
    svc('Midnight Service'),
    svc('Special Service'),
    meet('Worship and AV Team Meeting', ['worship', 'av']),
    meet('All Team Practice', ['worship', 'av']),
    meet('Core Team Meeting', ['worship', 'av']),
    meet('Worship Team Meeting', ['worship']),
    meet('AV Team Meeting', ['av']),
    meet('Song Writing Workshop', ['worship', 'av']),
    svc('LOUD Worship')
  ];
  /* EGBC's Core Team Meeting is for the Core Team, which is no job: its
     teams are named here, for EGBC only, as the rota always did. */
  var EGBC_TEAMS = { 'Core Team Meeting': ['Core Team'] };
  var DEFAULT_ROLES = [
    { id: 'serviceLeader', name: 'Service Leader', slides: true },
    { id: 'speaker', name: 'Speaker', slides: true }
  ];
  /* The two roles that have always been fields on the event. */
  var OWN_FIELD = { serviceLeader: 1, speaker: 1 };
  var MOST_TYPES = 200, MOST_ROLES = 50;

  function stored(cfg, k) { return cfg && Array.isArray(cfg[k]) && cfg[k].length ? cfg[k] : null; }
  function types(cfg) { return (stored(cfg, 'types') || DEFAULT_TYPES).slice(); }
  function type(cfg, name) { return types(cfg).filter(function (t) { return t.name === name; })[0] || null; }
  function isService(cfg, name) { var t = type(cfg, name); return !!(t && t.service); }
  function serviceNames(cfg) { return types(cfg).filter(function (t) { return t.service; }).map(function (t) { return t.name; }); }
  function roles(cfg) { return (stored(cfg, 'roles') || DEFAULT_ROLES).slice(); }
  function roleField(role) { return OWN_FIELD[role.id] ? role.id : 'serviceRoles.' + role.id; }
  function roleValue(ev, role) {
    if (!ev) return '';
    return String((OWN_FIELD[role.id] ? ev[role.id] : (ev.serviceRoles || {})[role.id]) || '');
  }
  function slideRoles(cfg, ev) {
    return roles(cfg).filter(function (r) { return r.slides !== false; }).map(function (r) { return [r.name, roleValue(ev, r)]; });
  }

  function newEvent(cfg, name, date, teamsForJob) {
    var t = type(cfg, name) || meet(name);
    var teams = [];
    if (!stored(cfg, 'types') && EGBC_TEAMS[name]) teams = EGBC_TEAMS[name].slice();
    else (t.jobs || []).forEach(function (j) {
      ((teamsForJob && teamsForJob(j)) || []).forEach(function (x) { if (teams.indexOf(x) === -1) teams.push(x); });
    });
    var ev = { date: date, type: t.name, description: '', teams: teams, startTime: t.start || '19:30', endTime: t.end || '21:00',
      roles: (t.slots || []).slice(), archived: false };
    if (t.siteId) ev.siteId = t.siteId;
    if (t.service) { ev.whatsOn = true; ev.serviceTime = t.publicTime || t.start || ''; }
    return ev;
  }

  var TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  function validate(cfg) {
    var out = [];
    if (cfg == null) return out;
    var ts = cfg.types || [], rs = cfg.roles || [];
    if (!Array.isArray(ts) || !Array.isArray(rs)) return ['The services and roles must be lists.'];
    if (ts.length > MOST_TYPES) out.push('At most ' + MOST_TYPES + ' kinds of service and meeting.');
    if (rs.length > MOST_ROLES) out.push('At most ' + MOST_ROLES + ' roles.');
    var seen = {};
    ts.forEach(function (t, i) {
      var n = String((t && t.name) || '').trim();
      if (!n) out.push('Kind ' + (i + 1) + ' needs a name.');
      else if (n.length > 80) out.push('"' + n.slice(0, 20) + '…": 80 letters at most.');
      else if (seen[n.toLowerCase()]) out.push('"' + n + '" is listed twice.');
      seen[n.toLowerCase()] = 1;
      ['start', 'end', 'publicTime'].forEach(function (k) {
        if (t && t[k] && !TIME.test(t[k])) out.push((n || 'Kind ' + (i + 1)) + ': the time must be like 10:30.');
      });
      if (t && t.slots && (!Array.isArray(t.slots) || t.slots.length > 60)) out.push((n || 'Kind ' + (i + 1)) + ': at most 60 rota places.');
    });
    if (ts.length && !ts.some(function (t) { return t && t.service; })) out.push('At least one kind must be a service.');
    var ids = {};
    rs.forEach(function (r, i) {
      if (!r || !String(r.name || '').trim()) out.push('Role ' + (i + 1) + ' needs a name.');
      if (!r || !/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(String(r.id || ''))) out.push('Role ' + (i + 1) + ' has no id.');
      else if (ids[r.id]) out.push('Two roles share the id ' + r.id + '.');
      if (r) ids[r.id] = 1;
    });
    return out;
  }
  /* A new role's id, from its name ("Intercessor" -> "intercessor2" when taken). */
  function roleId(name, taken) {
    var base = String(name || '').replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).map(function (w, i) {
      w = w.toLowerCase(); return i ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    }).join('').replace(/^[^A-Za-z]+/, '').slice(0, 30) || 'role';
    var id = base, n = 2;
    while ((taken || []).indexOf(id) !== -1) id = base + n++;
    return id;
  }

  var cache = null;
  function load(db) {
    if (cache) return cache;
    cache = db.collection('churchSettings').doc('services').get()
      .then(function (s) { return s.exists ? s.data() : null; }, function () { return null; });
    return cache;
  }

  global.EGBCServices = {
    DEFAULT_TYPES: DEFAULT_TYPES, DEFAULT_ROLES: DEFAULT_ROLES, MOST_TYPES: MOST_TYPES, MOST_ROLES: MOST_ROLES,
    types: types, type: type, isService: isService, serviceNames: serviceNames, roles: roles,
    roleField: roleField, roleValue: roleValue, slideRoles: slideRoles, newEvent: newEvent,
    validate: validate, roleId: roleId, load: load, forget: function () { cache = null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
