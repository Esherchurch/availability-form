/* ===================================================================
   EGBC — the Rota Planner, on a phone
   ===================================================================

   APP-DESIGN-BRIEF §7b, Core Team ▸ Rota: "the rota planner as
   CoreTeamApp has it on the phone (assign the team, + for a new
   service)."

   MOVED, NOT COPIED, the third of the three (egbc-core-planner.js,
   egbc-core-meetings.js). This is CoreTeamApp.html's rota screen - the
   term list, the event rows, the assignment sheets, the availability
   buckets, the toolbar, term generation, auto-fill, the availability
   emails and the new-event form - lifted out so the installed Core Team
   app and the phone app run one copy.

   WHAT CHANGED IN THE MOVE. This list is the whole of it, and it is here
   because the Core Team app is on people's phones today:

     1. db, toast, loader come from the host, as in the other two.
     2. The addressBook / availability / events listeners live here now.
        The host is told when the member list changes (onMembers), so
        CoreTeamApp's own allMembers - which its Email Compiler also
        reads - stays exactly as up to date as it was.
     3. The host is told when the events change (onEvents), which is how
        CoreTeamApp still refreshes its meetings list from the same
        listener it always did.
     4. THE NEW-EVENT FORM IS DRAWN BY THIS FILE. It was markup in
        CoreTeamApp using that page's .modal-overlay / .form-* / .btn-*
        classes, and those classes belong to nine other modals on that
        page, so they could not move. The form here carries its own
        cr-* classes with THE SAME DECLARATIONS copied across, so it
        looks the same; the fields, their order, their wording and the
        defaults behind each event type are untouched.
     5. renderPlanner draws into #eventList, which this file now writes
        into the host rather than it being markup on the page. Same
        toolbar, same inline styles, same buttons in the same order.

   Nothing else about it is different. The sheets, the buckets, the drag
   and drop, the auto-fill order, the availability emails and every
   confirm() wording are as they were.

   HOW TO USE IT:

     EGBCCoreRota.mount({
       into: el, db: EGBCAuth.db, toast: fn, loader: fn,
       onMembers: fn, onEvents: fn        // both optional
     });
     EGBCCoreRota.newEvent();             // the "+" button

   =================================================================== */

/* ── egbc-uk-dates (Martin, 14 Oct 2026) ─────────────────────────────
   One copy in each rota and planner page, here and on the original site,
   because the original site's pages load nothing shared. KEEP EVERY COPY
   THE SAME: screenshots/events/rota-dates.test.mjs fails if one differs.

   EGBCUKDates.long('2026-10-11')   "Sunday 11 October 2026"
   EGBCUKDates.short('2026-10-11')  "Sun 11 Oct 2026"
   EGBCUKDates.today()              today in England, yyyy-mm-dd

   Rotas: past dates hidden unless "Show past dates" is on, remembered on
   this device; the page opens at the next date.
     hidden(date), showPast(), togglePast(btn), paintPast(btn), scrollToNext(box),
     openAtNext(box) after every redraw

   Planners: "Service date" becomes the coming services from the rota,
   with ◀ ▶ and "Pick another date". The date box stays underneath with
   its own id and value (yyyy-mm-dd), so everything that reads it, and
   everything that sets it, works as before.
     attach(input, { load, eventSelect, preferred, keepValue })

   Every date box on the page (rota rows, "new event", "Pick another
   date"): shows "Sun 18 Oct 2026", never the browser's 10/18/2026.
     ukify(input), ukifyAll(box), and it happens by itself to any added
   ─────────────────────────────────────────────────────────────────── */
(function (g) {
  if (g.EGBCUKDates) return;
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var KEY = 'egbc-rota-show-past';

  function parts(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').slice(0, 10));
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return { y: +m[1], m: +m[2] - 1, d: +m[3], w: d.getUTCDay() };
  }
  function long(ymd) { var p = parts(ymd); return p ? DAYS[p.w] + ' ' + p.d + ' ' + MONTHS[p.m] + ' ' + p.y : String(ymd == null ? '' : ymd); }
  function short(ymd) { var p = parts(ymd); return p ? DAYS[p.w].slice(0, 3) + ' ' + p.d + ' ' + MONTHS[p.m].slice(0, 3) + ' ' + p.y : String(ymd == null ? '' : ymd); }
  function today() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) {
      var d = new Date();
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
  }

  /* ---- rotas ---- */
  function showPast() { try { return g.localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function setShowPast(v) { try { if (v) g.localStorage.setItem(KEY, '1'); else g.localStorage.removeItem(KEY); } catch (e) {} }
  function hidden(ymd) { return !showPast() && String(ymd || '') < today(); }
  function paintPast(btn) {
    if (!btn) return;
    var on = showPast();
    btn.textContent = on ? 'Hide past dates' : 'Show past dates';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('data-past-toggle', on ? 'on' : 'off');
  }
  function togglePast(btn) { setShowPast(!showPast()); paintPast(btn); return showPast(); }
  /* The first row dated today or later, brought into view. */
  function scrollToNext(box) {
    var rows = (box || document).querySelectorAll('[data-date]'), t = today();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].getAttribute('data-date') >= t) {
        try { rows[i].scrollIntoView({ block: 'start' }); } catch (e) { rows[i].scrollIntoView(); }
        return rows[i];
      }
    }
    return null;
  }
  /* Called after every redraw: for the first few seconds the list is
     drawn again as the rota arrives, and each redraw would put the page
     back at the top. Stops the moment the person scrolls, taps or types. */
  var opened = 0, stopped = false;
  function stop() { stopped = true; }
  function openAtNext(box) {
    if (stopped || (opened && Date.now() - opened > 5000)) return null;
    var row = scrollToNext(box);
    if (row && !opened) {
      opened = Date.now();
      ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (t) { g.addEventListener(t, stop, { capture: true, passive: true }); });
    }
    return row;
  }

  /* ---- planners ---- */
  var BTN = 'background:#f0f6f6;color:#3d6263;border:1px solid #d1dfdf;border-radius:8px;padding:8px 12px;font:600 13px Inter,system-ui,sans-serif;cursor:pointer;flex:0 0 auto;';
  var SEL = 'flex:1 1 200px;min-width:0;max-width:100%;background:#fff;color:#111827;border:1px solid #d1dfdf;border-radius:8px;padding:8px 10px;font:500 14px Inter,system-ui,sans-serif;';
  var LINK = 'background:none;border:none;color:#3d6263;text-decoration:underline;font:500 13px Inter,system-ui,sans-serif;padding:4px 2px;cursor:pointer;flex:0 0 auto;';
  function isService(ev) { return !/practice|meeting|workshop/i.test(ev.type || ''); }
  function fire(el) { var e; try { e = new Event('change', { bubbles: true }); } catch (x) { e = document.createEvent('Event'); e.initEvent('change', true, true); } el.dispatchEvent(e); }

  /* ---- every date box: UK words on top ----
     A browser draws <input type="date"> in ITS language: on a computer set
     to US English, 10/18/2026, whatever the page says. So every date box on
     these pages shows "Sun 18 Oct 2026" instead, with the browser's own box
     lying invisibly over the words: a click or a tap still opens its
     calendar, and the value underneath is the same yyyy-mm-dd as ever. */
  var OVER = 'position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;margin:0;padding:0;border:0;cursor:pointer;font-size:16px;';
  function outer(input) { var p = input.parentNode; return p && p.getAttribute && p.getAttribute('data-uk-date') !== null ? p : input; }
  function paintDate(input) {
    var p = input.parentNode, shown = p && p.querySelector ? p.querySelector('[data-uk-shown]') : null;
    if (shown && shown.parentNode === p) shown.textContent = input.value ? short(input.value) : 'Pick a date';
    input.setAttribute('aria-label', 'Date: ' + (input.value ? long(input.value) : 'not chosen'));
  }
  function ukify(input) {
    if (!input || String(input.type).toLowerCase() !== 'date' || outer(input) !== input || !input.parentNode) return;
    var box = document.createElement('span');
    box.setAttribute('data-uk-date', '');
    box.className = input.className;
    box.style.cssText = input.style.cssText;
    box.style.position = 'relative';
    if (box.style.display !== 'none') box.style.display = 'inline-flex';
    box.style.alignItems = 'center';
    var shown = document.createElement('span');
    shown.setAttribute('data-uk-shown', '');
    shown.style.cssText = 'pointer-events:none;white-space:nowrap;';
    input.parentNode.insertBefore(box, input);
    box.appendChild(shown);
    box.appendChild(input);
    input.className = '';
    input.style.cssText = OVER;
    var paint = function () { paintDate(input); };
    input.addEventListener('input', paint);
    input.addEventListener('change', paint);
    input.addEventListener('focus', paint);
    input.addEventListener('click', function () { paint(); try { if (input.showPicker) input.showPicker(); } catch (e) {} });
    paint();
  }
  function ukifyAll(root) {
    if (!root) return;
    if (root.tagName === 'INPUT') { ukify(root); return; }
    if (!root.querySelectorAll) return;
    var l = root.querySelectorAll('input[type="date"]');
    for (var i = 0; i < l.length; i++) ukify(l[i]);
  }
  if (g.MutationObserver && g.document) {
    var watch = new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) if (ms[i].addedNodes[j].nodeType === 1) ukifyAll(ms[i].addedNodes[j]);
    });
    var begin = function () { ukifyAll(document); watch.observe(document.documentElement, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin); else begin();
  }

  function attach(input, o) {
    if (!input || input.getAttribute('data-uk-pick')) return null;
    o = o || {};
    input.setAttribute('data-uk-pick', '1');
    var wrap = document.createElement('div');
    wrap.className = 'uk-pick';
    wrap.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;width:100%;box-sizing:border-box;';
    wrap.innerHTML = '<button type="button" data-uk="prev" aria-label="The service before" style="' + BTN + '">&#9664;</button>' +
      '<select data-uk="list" aria-label="Service date" style="' + SEL + '"><option value="">Reading the rota…</option></select>' +
      '<button type="button" data-uk="next" aria-label="The next service" style="' + BTN + '">&#9654;</button>' +
      '<button type="button" data-uk="other" style="' + LINK + '">Pick another date</button>';
    var at = outer(input);
    at.parentNode.insertBefore(wrap, at);
    at.style.display = 'none';
    /* The date box, in UK words, shown only for "Pick another date". */
    var showBox = function () { var b = outer(input); b.style.display = b === input ? '' : 'inline-flex'; paintDate(input); };
    var sel = wrap.querySelector('[data-uk="list"]');

    function real() { return Array.prototype.filter.call(sel.options, function (op) { return op.value && !op.hasAttribute('data-other'); }); }
    function pickType(type) {
      if (!type || !o.eventSelect) return;
      var n = 0;
      (function look() {
        var s = document.getElementById(o.eventSelect);
        var hit = s && Array.prototype.filter.call(s.options, function (op) { return op.value !== '' && op.text.indexOf(type) === 0; })[0];
        if (hit) { if (s.value !== hit.value) { s.value = hit.value; fire(s); } return; }
        if (++n < 40) setTimeout(look, 100);
      })();
    }
    function choose(v) {
      var bits = String(v).split('|'), date = bits[0], type = bits.slice(1).join('|');
      if (input.value !== date) { input.value = date; fire(input); } else sync();
      paintDate(input);
      pickType(type);
    }
    /* The date box changed some other way: show it in the list. */
    function sync() {
      var d = input.value, other = sel.querySelector('option[data-other]');
      var hit = real().filter(function (op) { return op.value.split('|')[0] === d; })[0];
      if (hit) { if (other) other.parentNode.removeChild(other); if (sel.value.split('|')[0] !== d) sel.value = hit.value; return; }
      if (!d) return;
      if (!other) { other = document.createElement('option'); other.setAttribute('data-other', ''); sel.insertBefore(other, sel.firstChild); }
      other.value = d + '|';
      other.text = short(d) + ' (another date)';
      sel.value = other.value;
    }
    function step(k) {
      var list = real(), i = list.map(function (op) { return op.value; }).indexOf(sel.value), d = input.value, t = null;
      if (i >= 0) t = list[i + k];
      else if (k > 0) t = list.filter(function (op) { return op.value.split('|')[0] > d; })[0];
      else t = list.filter(function (op) { return op.value.split('|')[0] < d; }).pop();
      if (t) { sel.value = t.value; choose(t.value); }
    }
    input.addEventListener('change', sync);
    sel.addEventListener('change', function () { if (sel.value) choose(sel.value); });
    wrap.querySelector('[data-uk="prev"]').onclick = function () { step(-1); };
    wrap.querySelector('[data-uk="next"]').onclick = function () { step(1); };
    wrap.querySelector('[data-uk="other"]').onclick = function () {
      ukify(input);
      showBox();
      try { input.focus(); if (input.showPicker) input.showPicker(); } catch (e) {}
    };

    Promise.resolve(o.load ? o.load() : []).then(function (evs) {
      var t = today(), seen = {};
      var list = (evs || []).filter(function (ev) {
        if (!ev || !ev.date || ev.archived === true || ev.date < t || !isService(ev)) return false;
        var k = ev.date + '|' + (ev.type || '');
        if (seen[k]) return false;
        seen[k] = 1; return true;
      }).sort(function (a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.startTime || '').localeCompare(String(b.startTime || ''));
      });
      sel.innerHTML = '';
      list.forEach(function (ev) {
        var op = document.createElement('option');
        op.value = ev.date + '|' + (ev.type || '');
        op.text = short(ev.date) + (ev.type ? ' · ' + ev.type : '');
        sel.appendChild(op);
      });
      if (!list.length) { var none = document.createElement('option'); none.value = ''; none.text = 'Nothing coming on the rota'; sel.appendChild(none); }
      if (input.value || o.keepValue) { sync(); return; }
      var first = (o.preferred && list.filter(o.preferred)[0]) || list[0];
      if (first) { sel.value = first.date + '|' + (first.type || ''); choose(sel.value); }
    }).catch(function () {
      sel.innerHTML = '<option value="">Could not read the rota - pick a date</option>';
      ukify(input);
      showBox();
    });
    return { sync: sync, select: sel };
  }

  g.EGBCUKDates = { long: long, short: short, today: today, hidden: hidden, showPast: showPast, setShowPast: setShowPast,
    togglePast: togglePast, paintPast: paintPast, scrollToNext: scrollToNext, openAtNext: openAtNext, attach: attach, isService: isService,
    ukify: ukify, ukifyAll: ukifyAll };
})(window);
/* ── end egbc-uk-dates ── */

(function (global) {
  'use strict';

  /* ---- the lists, from CoreTeamApp ---------------------------------- */
  /* "+ Role" offers the church's places: the roles of the teams doing the
     AV, worship and choir jobs (Teams & groups; EGBCAuth.roleChoices).
     Asked each time, since they follow the teams once those load. */
  function optionalRoles() { return global.EGBCAuth && EGBCAuth.roleChoices ? EGBCAuth.roleChoices(['av', 'worship', 'choir']) : []; }
  function avRoles() { return global.EGBCAuth && EGBCAuth.roleChoices ? EGBCAuth.roleChoices(['av']) : []; }
  /* The skill a place needs ("2nd Keys" needs Keyboard), and whether a
     person has it ticked - an old tick ("Sing") counts under its skill's
     name (EGBCAuth.skillName). */
  function skillOf(r) { return global.EGBCAuth && EGBCAuth.placeSkill ? EGBCAuth.placeSkill(r) : r; }
  function hasSkill(m, skill, usuallyOnly) {
    if (global.EGBCAuth && EGBCAuth.hasSkill) return EGBCAuth.hasSkill(m, skill, usuallyOnly);
    return !!skill && ((m.primaryInstruments || []).includes(skill) || (!usuallyOnly && (m.secondaryInstruments || []).includes(skill)));
  }
  var MANDATORY_SUNDAY_ROLES = ['Worship Leader', 'Keyboard', 'Guitar', 'Drums', 'Bass', 'Sound', 'Words', 'Cameras'];
  var EVENT_TYPES_LIST = ['Sunday Morning Worship', 'Sunday Team Practice', 'Evening Carol Service',
    'Midnight Service', 'Special Service', 'Worship and AV Team Meeting', 'All Team Practice',
    'Core Team Meeting', 'Worship Team Meeting', 'AV Team Meeting', 'Song Writing Workshop', 'LOUD Worship'];
  /* The types the new-event form offers. CoreTeamApp's form listed
     eleven of the twelve - 'Special Service' was not among them - and
     that stays as it was rather than being quietly corrected here. */
  var NEW_EVENT_TYPES = ['Sunday Morning Worship', 'Sunday Team Practice', 'Evening Carol Service',
    'Midnight Service', 'Worship and AV Team Meeting', 'All Team Practice', 'Core Team Meeting',
    'Worship Team Meeting', 'AV Team Meeting', 'Song Writing Workshop', 'LOUD Worship'];

  /* THE CHURCH'S OWN KINDS OF SERVICE AND MEETING (H-11, egbc-services.js:
     churchSettings/services; EGBC's twelve when nothing is stored, which are
     the lists above). Loaded once; until then the lists above stand in.
     MAIN: the church's first kind of service - EGBC's Sunday Morning
     Worship - which "Populate term" and auto-fill work on. */
  var SV = { S: null, cfg: null, sites: [], promise: null };
  function services() {
    if (SV.promise) return SV.promise;
    if (!(global.EGBCAuth && EGBCAuth.services)) return Promise.resolve(SV);
    SV.promise = Promise.all([EGBCAuth.services(),
      db().collection('sites').get().then(function (s) {
        return s.docs.map(function (d) { var x = d.data() || {}; return { id: d.id, name: String(x.name || d.id), active: x.active !== false }; })
          .filter(function (x) { return x.active; });
      }, function () { return []; })
    ]).then(function (r) { SV.S = r[0].S; SV.cfg = r[0].cfg; SV.sites = r[1]; return SV; }, function () { return SV; });
    return SV.promise;
  }
  function typeNames() { return SV.S ? SV.S.types(SV.cfg).map(function (t) { return t.name; }) : EVENT_TYPES_LIST; }
  function mainType() { return SV.S ? (SV.S.serviceNames(SV.cfg)[0] || typeNames()[0]) : 'Sunday Morning Worship'; }
  function isServiceType(t) { return SV.S ? SV.S.isService(SV.cfg, t) : SERVICE_KINDS.indexOf(t) >= 0; }
  /* A new rota event of a kind: its usual times, building, teams (by job)
     and rota places. */
  function freshEvent(type, date) {
    var ev = SV.S ? SV.S.newEvent(SV.cfg, type, date, function (j) { return EGBCAuth.teamsForJob(j); }) : null;
    if (!ev) {
      var d = NEW_EVENT_DEFAULTS[type] || {}, svc = SERVICE_KINDS.indexOf(type) >= 0;
      ev = Object.assign({ date: date, type: type, description: '', teams: d.teams || ['Worship Team', 'AV Team'],
        startTime: d.startTime || (svc ? '08:00' : '19:30'), endTime: d.endTime || (svc ? '11:30' : '21:00'),
        roles: d.roles || (svc ? MANDATORY_SUNDAY_ROLES.slice() : []), archived: false }, svc ? SUNDAY_PUBLIC : {});
    }
    if (!ev.teams.length) ev.teams = ['Worship Team', 'AV Team'].filter(function () { return !SV.cfg; });
    ev.termLabel = getTermLabel(date);
    return ev;
  }

  var NEW_EVENT_DEFAULTS = {
    'Sunday Morning Worship': { teams: ['Worship Team', 'AV Team'], startTime: '08:00', endTime: '11:30', roles: MANDATORY_SUNDAY_ROLES.slice() },
    'Sunday Team Practice': { teams: ['Worship Team'], startTime: '19:30', endTime: '21:30', roles: ['Worship Leader', 'Keyboard', 'Guitar', 'Drums', 'Bass'] },
    'Core Team Meeting': { teams: ['Core Team'] },
    'Worship and AV Team Meeting': { teams: ['Worship Team', 'AV Team'] },
    'Worship Team Meeting': { teams: ['Worship Team'] },
    'AV Team Meeting': { teams: ['AV Team'] }
  };

  /* ---- the host ------------------------------------------------------ */
  var H = {
    root: null, db: null,
    toast: function (m) { try { console.log('[rota] ' + m); } catch (e) {} },
    loader: function () {},
    onMembers: null, onEvents: null
  };
  function db() { return H.db || (global.EGBCAuth && EGBCAuth.db); }
  function escA(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function toast(m) { H.toast(m); }
  function loader(a, b) { H.loader(a, b); }
  function personName(raw) {
    if (global.EGBCCorePlanner) return EGBCCorePlanner.personName(raw);
    return Array.isArray(raw) ? raw.map(function (p) { return p.name; }).join(', ') : ((raw && raw.name) || '');
  }
  function videoRoomFor(ev) {
    return global.EGBCCoreMeetings ? EGBCCoreMeetings.videoRoomFor(ev)
      : (ev.videoRoom !== undefined ? ev.videoRoom : '');
  }
  /* The church's rooms (egbc-video.js); asking starts the load, so they are
     there by the time somebody opens a meeting to pick one. */
  function rooms() {
    if (global.EGBCCoreMeetings && EGBCCoreMeetings.rooms) EGBCCoreMeetings.rooms();
    return global.EGBCCoreMeetings ? EGBCCoreMeetings.VIDEO_ROOMS : [];
  }
  function defaultRoomFor(type) {
    return (global.EGBCCoreMeetings ? EGBCCoreMeetings.VIDEO_DEFAULT_BY_TYPE : {})[type] || '';
  }

  /* ---- state, from CoreTeamApp -------------------------------------- */
  var rotaCollapsedTerms = new Set();
  var rotaExpandedEvents = new Set();
  var rotaOpenBuckets = new Set();
  var cachedEvents = [];
  var rotaAvailability = {};
  var allMembers = [];
  var hideAssigned = false;

  function getTermLabel(dateStr) {
    var d = new Date(dateStr);
    var m = d.getMonth() + 1, y = d.getFullYear();
    return (m <= 4 ? 'Spring' : m <= 8 ? 'Summer' : 'Autumn') + ' ' + y;
  }

  /* A LISTENER THAT IS REFUSED STAYS REFUSED (the audit's red at 360, 20 Oct
     2026): Firestore drops a listener for good on its first error, and with
     no error callback the rota silently stopped updating and the console
     said "Uncaught Error in snapshot listener". A refusal can be passing -
     the person's own record being rewritten while it is asked, a sign-in
     still settling - so each listener keeps what it last drew, says so
     quietly, and asks again a few times before giving up in words. */
  var rotaListenErrors = {};
  function listen(name, query, onData) {
    query.onSnapshot(function (snap) {
      if (rotaListenErrors[name]) { delete rotaListenErrors[name]; paintListenNote(); }
      onData(snap);
    }, function (e) {
      var n = (rotaListenErrors[name] || 0) + 1;
      rotaListenErrors[name] = n;
      try { console.warn('Rota: the ' + name + ' listener was refused (' + n + '):', e && e.code); } catch (x) {}
      paintListenNote();
      if (n <= 5) setTimeout(function () { listen(name, query, onData); }, 1500 * n);
    });
  }
  function paintListenNote() {
    var list = document.getElementById('eventList');
    if (!list || !list.parentNode) return;
    var note = document.getElementById('rotaListenNote');
    var bad = Object.keys(rotaListenErrors);
    var gaveUp = bad.some(function (k) { return rotaListenErrors[k] > 5; });
    if (!bad.length) { if (note) note.remove(); return; }
    if (!note) {
      note = document.createElement('p');
      note.id = 'rotaListenNote'; note.setAttribute('role', 'status');
      note.style.cssText = 'margin:0 0 10px;padding:8px 12px;border-radius:10px;background:#fff7ed;color:#9a3412;font:500 13px/1.4 Inter,system-ui,sans-serif';
      list.parentNode.insertBefore(note, list);
    }
    note.textContent = gaveUp
      ? 'The rota could not be kept up to date. Reload the page to try again.'
      : 'Reconnecting to the rota… what is shown may be a moment out of date.';
  }

  // Real-time listeners — start when the rota is first shown
  var rotaListenersStarted = false;
  function startRotaListeners() {
    if (rotaListenersStarted) return;
    rotaListenersStarted = true;
    listen('people', db().collection('addressBook'), function (snap) {
      allMembers = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      if (H.onMembers) H.onMembers(allMembers);
      renderPlanner();
    });
    listen('availability', db().collection('availability'), function (snap) {
      rotaAvailability = {};
      snap.forEach(function (d) {
        var data = d.data();
        if (!rotaAvailability[data.eventId]) rotaAvailability[data.eventId] = {};
        rotaAvailability[data.eventId][data.memberId] = data.status;
      });
      renderPlanner();
    });
    listen('dates', db().collection('events').orderBy('date'), function (snap) {
      cachedEvents = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      renderPlanner();
      if (H.onEvents) H.onEvents(cachedEvents);
      /* A meeting's notes are on its own part, for the invited (the
         meetings split): drawn again once they are read. */
      if (global.EGBCAuth && EGBCAuth.meetingDetails && cachedEvents.some(function (e) { return e.meeting === true; })) {
        var asOf = cachedEvents;
        EGBCAuth.meetingDetails(asOf).then(function (m) { if (cachedEvents === asOf) { cachedEvents = m; renderPlanner(); } });
      }
    });
  }

  global.toggleHideAssigned = function () { hideAssigned = !hideAssigned; renderPlanner(); };
  /* Past dates are hidden unless this is on; remembered on this device. */
  global.toggleShowPast = function (btn) { EGBCUKDates.togglePast(btn); renderPlanner(); EGBCUKDates.scrollToNext(document.getElementById('eventList')); };
  global.toggleTermCollapse = function (t) { rotaCollapsedTerms.has(t) ? rotaCollapsedTerms.delete(t) : rotaCollapsedTerms.add(t); renderPlanner(); };
  global.toggleEventExpand = function (id) { rotaExpandedEvents.has(id) ? rotaExpandedEvents.delete(id) : rotaExpandedEvents.add(id); renderPlanner(); };
  global.toggleBucket = function (id) { rotaOpenBuckets.has(id) ? rotaOpenBuckets.delete(id) : rotaOpenBuckets.add(id); renderPlanner(); };

  global.updateField = async function (id, field, value) {
    /* A meeting's notes go to its own part (the meetings split). */
    var ev = cachedEvents.find(function (e) { return e.id === id; });
    if (field === 'description' && ev && ev.meeting === true) { await EGBCAuth.setMeetingField(id, 'description', value); return; }
    var updates = {}; updates[field] = value;
    if (field === 'date') updates.termLabel = getTermLabel(value);
    await db().collection('events').doc(id).update(updates);
  };

  global.toggleTeam = async function (eventId, teamName) {
    var snap = await db().collection('events').doc(eventId).get();
    if (!snap.exists) return;
    var cur = snap.data().teams || [];
    await db().collection('events').doc(eventId).update({
      teams: cur.includes(teamName) ? cur.filter(function (t) { return t !== teamName; }) : cur.concat([teamName])
    });
  };

  global.addRole = async function (eventId, roleName) {
    if (!roleName) return;
    await db().collection('events').doc(eventId).update({
      roles: firebase.firestore.FieldValue.arrayUnion(roleName)
    });
  };

  global.removeRole = async function (eventId, roleName) {
    if (!confirm('Remove role "' + roleName + '"?')) return;
    var updates = { roles: firebase.firestore.FieldValue.arrayRemove(roleName) };
    updates['assignments.' + roleName] = firebase.firestore.FieldValue.delete();
    await db().collection('events').doc(eventId).update(updates);
  };

  // ══════════════════════════════════════════════════════════════════════
  // TOUCH ROTA EDITING
  // Drag and drop does not fire on a touchscreen, so on a phone or tablet the
  // rota was read-only - assign, remove and swap were all unreachable. These
  // call exactly the same assignPerson / unassignPerson the drag handlers use.
  // ══════════════════════════════════════════════════════════════════════

  function closeSheet() {
    var el = document.getElementById('rota-sheet');
    if (el) el.remove();
  }
  global.closeSheet = closeSheet;

  function sheetShell(title, sub, body) {
    closeSheet();
    var d = document.createElement('div');
    d.id = 'rota-sheet';
    d.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(20,32,31,.45);display:flex;align-items:flex-end;justify-content:center;';
    d.onclick = function (e) { if (e.target === d) closeSheet(); };
    d.innerHTML =
      '<div style="background:#fff;width:100%;max-width:520px;border-radius:20px 20px 0 0;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 -8px 40px rgba(20,32,31,.2)">'
      + '<div style="padding:16px 20px 12px;border-bottom:1px solid #f0f6f6;flex-shrink:0">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">'
      + '<div>'
      + '<div style="font-size:15px;font-weight:600;color:#14201f">' + title + '</div>'
      + '<div style="font-size:13px;color:#6b8281;margin-top:2px">' + sub + '</div>'
      + '</div>'
      + '<button onclick="closeSheet()" style="background:#f0f6f6;border:none;width:30px;height:30px;border-radius:8px;font-size:15px;color:#3d6263;cursor:pointer;flex-shrink:0">&times;</button>'
      + '</div>'
      + '</div>'
      + '<div style="padding:12px 16px 22px;overflow-y:auto">' + body + '</div>'
      + '</div>';
    document.body.appendChild(d);
  }

  function sheetBtn(label, note, onclick, tone) {
    var c = tone === 'danger' ? '#b0392c' : tone === 'muted' ? '#6b8281' : '#14201f';
    var bg = tone === 'danger' ? '#f7e7e4' : '#f6faf9';
    return '<button onclick="' + onclick + '" style="display:block;width:100%;text-align:left;background:' + bg
      + ';border:1px solid #e4eeed;border-radius:11px;padding:11px 14px;margin-bottom:7px;font-family:Inter, system-ui, sans-serif;cursor:pointer">'
      + '<div style="font-size:13px;font-weight:600;color:' + c + '">' + label + '</div>'
      + (note ? '<div style="font-size:13px;color:#93a8a6;margin-top:2px">' + note + '</div>' : '') + '</button>';
  }

  /* Everyone eligible for this event, ordered so the people who said yes
     come first - which is the order you actually want to pick from. */
  function candidatesFor(ev, role) {
    var teams = ev.teams || [];
    var eligible = allMembers.filter(function (m) {
      return !teams.length || (m.markers || []).some(function (t) { return teams.includes(t); })
        || (teams.includes('Youth') && (m.markers || []).includes('Youth Worship'));
    });
    var rank = function (m) {
      var a = (rotaAvailability[ev.id] || {})[m.id];
      if (a === 'avail') return 0;
      if (!a) return 1;
      return 2;
    };
    var skill = skillOf(role);
    var plays = function (m) {
      return hasSkill(m, skill, true) ? 0 : hasSkill(m, skill, false) ? 1 : 2;
    };
    return eligible.sort(function (a, b) {
      return plays(a) - plays(b) || rank(a) - rank(b) || (a.name || '').localeCompare(b.name || '');
    });
  }

  function availLabel(ev, m, role) {
    var a = (rotaAvailability[ev.id] || {})[m.id];
    var bits = [];
    if (hasSkill(m, skillOf(role), true)) bits.push('plays this');
    else if (hasSkill(m, skillOf(role), false)) bits.push('can cover');
    bits.push(a === 'avail' ? 'available' : (a ? 'not available' : 'no reply'));
    var elsewhere = Object.entries(ev.assignments || {})
      .find(function (e) { return e[1] && e[1].id === m.id && e[0] !== role; });
    if (elsewhere) bits.push('already on ' + elsewhere[0]);
    return bits.join(' · ');
  }

  global.roleTap = function (eventId, role) {
    var ev = cachedEvents.find(function (e) { return e.id === eventId; });
    if (!ev) return;
    var asgn = (ev.assignments || {})[role] || null;

    var body = '';
    if (asgn) {
      body += sheetBtn('Remove ' + personName(asgn), 'Leaves this role empty',
        "doUnassign('" + eventId + "','" + role.replace(/'/g, "\\'") + "')", 'danger');
      body += '<div style="font-size:13px;font-weight:600;text-transform:none;letter-spacing:normal;color:#93a8a6;margin:14px 0 8px 2px">Or replace with</div>';
    } else {
      body += '<div style="font-size:13px;font-weight:600;text-transform:none;letter-spacing:normal;color:#93a8a6;margin:2px 0 8px 2px">Assign</div>';
    }

    var list = candidatesFor(ev, role).filter(function (m) { return !asgn || m.id !== asgn.id; });
    if (!list.length) {
      body += '<div style="font-size:12px;color:#93a8a6;padding:10px 2px">Nobody on this event’s teams.</div>';
    } else {
      list.forEach(function (m) {
        body += sheetBtn(m.name, availLabel(ev, m, role),
          "doAssign('" + eventId + "','" + role.replace(/'/g, "\\'") + "','" + m.id + "','"
          + (m.name || '').replace(/'/g, "\\'") + "')");
      });
    }
    sheetShell(role, ev.date ? new Date(ev.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '', body);
  };

  global.personTap = function (eventId, personId, personName_) {
    var ev = cachedEvents.find(function (e) { return e.id === eventId; });
    if (!ev) return;
    var current = Object.entries(ev.assignments || {}).find(function (e) { return e[1] && e[1].id === personId; });
    var body = '';

    if (current) {
      body += sheetBtn('Take off ' + current[0], 'They are on this event already',
        "doUnassign('" + eventId + "','" + current[0].replace(/'/g, "\\'") + "')", 'danger');
      body += '<div style="font-size:13px;font-weight:600;text-transform:none;letter-spacing:normal;color:#93a8a6;margin:14px 0 8px 2px">Or move to</div>';
    } else {
      body += '<div style="font-size:13px;font-weight:600;text-transform:none;letter-spacing:normal;color:#93a8a6;margin:2px 0 8px 2px">Put on</div>';
    }

    var roles = (ev.roles || []).filter(function (r) { return !current || r !== current[0]; });
    if (!roles.length) {
      body += '<div style="font-size:12px;color:#93a8a6;padding:10px 2px">No roles on this event yet.</div>';
    } else {
      var m = allMembers.find(function (x) { return x.id === personId; }) || {};
      roles.forEach(function (r) {
        var taken = (ev.assignments || {})[r];
        body += sheetBtn(r, taken ? 'Replaces ' + personName(taken)
          : (hasSkill(m, skillOf(r), true) ? 'They play this' : 'Empty'),
          "doAssign('" + eventId + "','" + r.replace(/'/g, "\\'") + "','" + personId + "','"
          + (personName_ || '').replace(/'/g, "\\'") + "')");
      });
    }

    var status = (rotaAvailability[eventId] || {})[personId];
    var now = status === 'avail' ? 'avail' : (status ? 'not-avail' : 'pending');
    body += '<div style="font-size:13px;font-weight:600;text-transform:none;letter-spacing:normal;color:#93a8a6;margin:14px 0 8px 2px">Availability</div>';
    [['avail', 'Available'], ['not-avail', 'Declined'], ['pending', 'Pending (no reply)']].forEach(function (p) {
      if (p[0] !== now) body += sheetBtn('Move to ' + p[1], '', "doSetAvailability('" + eventId + "','" + personId + "','" + p[0] + "')", 'muted');
    });

    sheetShell(personName_, ev.date ? new Date(ev.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '', body);
  };

  /* Assigning someone who is already on this event moves them rather than
     duplicating - which is the swap people expect. */
  global.doAssign = async function (eventId, role, personId, name) {
    closeSheet();
    var ev = cachedEvents.find(function (e) { return e.id === eventId; });
    var existing = ev && Object.entries(ev.assignments || {})
      .find(function (e) { return e[1] && e[1].id === personId && e[0] !== role; });
    var displaced = ev && (ev.assignments || {})[role];

    if (existing) {
      await global.unassignPerson(eventId, existing[0]);
      if (displaced && displaced.id !== personId) {
        await global.assignPerson(eventId, existing[0], displaced.id, displaced.name);
      }
    }
    await global.assignPerson(eventId, role, personId, name);
  };

  global.doSetAvailability = async function (eventId, personId, status) {
    closeSheet();
    await setAvailability(eventId, personId, status);
  };

  global.doUnassign = async function (eventId, role) {
    closeSheet();
    await global.unassignPerson(eventId, role);
  };

  global.assignPerson = async function (eventId, role, personId, personName) {
    var updates = {};
    updates['assignments.' + role] = { id: personId, name: personName };
    await db().collection('events').doc(eventId).update(updates);
  };

  global.unassignPerson = async function (eventId, role) {
    var updates = {};
    updates['assignments.' + role] = firebase.firestore.FieldValue.delete();
    await db().collection('events').doc(eventId).update(updates);
  };

  global.deleteEvent = async function (eventId) {
    if (confirm('Permanently delete this service?')) await db().collection('events').doc(eventId).delete();
  };

  global.archiveTerm = async function (termLabel) {
    if (!confirm('Archive all services in ' + termLabel + '?')) return;
    var list = cachedEvents.filter(function (e) { return e.termLabel === termLabel; });
    for (var i = 0; i < list.length; i++) {
      await db().collection('events').doc(list[i].id).update({ archived: true });
    }
  };

  global.onDragStart = function (e, personId, personName, eventId, role) {
    e.dataTransfer.setData('personId', personId);
    e.dataTransfer.setData('personName', personName);
    if (eventId && role) { e.dataTransfer.setData('sourceEventId', eventId); e.dataTransfer.setData('sourceRole', role); }
  };

  global.onDropRole = async function (e, eventId, role) {
    e.preventDefault();
    var pid = e.dataTransfer.getData('personId'), pname = e.dataTransfer.getData('personName');
    var sEv = e.dataTransfer.getData('sourceEventId'), sRole = e.dataTransfer.getData('sourceRole');
    if (sEv === eventId && sRole) await global.unassignPerson(sEv, sRole);
    await global.assignPerson(eventId, role, pid, pname);
  };

  global.onDropBucket = async function (e, eventId, targetStatus) {
    e.preventDefault();
    var pid = e.dataTransfer.getData('personId');
    var sEv = e.dataTransfer.getData('sourceEventId'), sRole = e.dataTransfer.getData('sourceRole');
    if (sEv && sRole) await global.unassignPerson(sEv, sRole);
    if (targetStatus && eventId && pid) await setAvailability(eventId, pid, targetStatus);
  };

  async function setAvailability(eventId, pid, targetStatus) {
    try {
      var snap = await db().collection('availability').where('eventId', '==', eventId).where('memberId', '==', pid).get();
      if (targetStatus === 'pending') {
        for (var i = 0; i < snap.docs.length; i++) await db().collection('availability').doc(snap.docs[i].id).delete();
      } else if (!snap.empty) {
        await db().collection('availability').doc(snap.docs[0].id).update({ status: targetStatus });
      } else {
        await db().collection('availability').add({ eventId: eventId, memberId: pid, status: targetStatus });
      }
    } catch (e) {
      console.error('availability save failed', e);
      toast('Could not save that: ' + e.message);
    }
  }

  /* ---- the "+" new-event form ----------------------------------------
     Drawn here, with cr-* classes carrying the same declarations as
     CoreTeamApp's .modal-overlay / .modal-sheet / .form-* / .btn-*, which
     could not move because nine other modals on that page use them. */
  var FORM_CSS = [
    '.cr-head{position:sticky;top:-20px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;',
    'background:var(--white,#fff);margin:0 -16px 12px;padding:6px 12px 10px 16px}',
    '.cr-x{width:44px;height:44px;flex:none;display:grid;place-items:center;border:0;border-radius:12px;background:none;color:#6b7280;cursor:pointer}',
    '.cr-overlay{display:none;position:fixed;inset:0;background:rgba(20,32,31,.45);',
    'backdrop-filter:blur(4px);z-index:9100;align-items:flex-end;justify-content:center}',
    '.cr-overlay.open{display:flex}',
    '.cr-sheet{background:var(--white,#fff);border-radius:24px 24px 0 0;width:100%;max-height:90vh;',
    'overflow-y:auto;padding:20px 16px calc(env(safe-area-inset-bottom, 0px) + 20px);',
    'animation:crSlideUp .25s ease}',
    '@keyframes crSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}',
    '.cr-handle{width:36px;height:4px;border-radius:8px;background:var(--border,#dde7e6);margin:0 auto 16px}',
    '.cr-title{font-size:18px;font-weight:600;color:var(--teal,#3d6263);margin-bottom:16px}',
    '.cr-field{display:flex;flex-direction:column;gap:6px}',
    '.cr-label{font-size:13px;font-weight:600;color:var(--muted,#6b8281)}',
    '.cr-input,.cr-select{width:100%;padding:12px 14px;border:1.5px solid var(--hairline-strong,#c9d8d6);',
    'border-radius:12px;font-family:var(--font,Inter,system-ui,sans-serif);font-size:14px;font-weight:600;',
    'color:var(--ink,#14201f);background:var(--white,#fff);outline:none;appearance:none;-webkit-appearance:none;',
    'transition:border-color .18s,box-shadow .18s}',
    '.cr-input:focus,.cr-select:focus{border-color:var(--brand,#3d6263);box-shadow:0 0 0 3px rgba(61,98,99,.28)}',
    '.cr-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 20px;',
    'border-radius:12px;font-family:var(--font,Inter,system-ui,sans-serif);font-size:13px;font-weight:500;',
    'border:none;cursor:pointer;white-space:nowrap;min-height:44px;width:100%;',
    'transition:transform .1s,background .15s}',
    /* The press-down nudge, which CoreTeamApp's .btn has. Kept because
       the point of copying the declarations across was that the form
       feels the same, and a button that does not move when pressed is
       the kind of thing you notice without being able to say why. */
    '.cr-btn:active{transform:translateY(1px)}',
    '.cr-btn-primary{background:var(--teal,#3d6263);color:#fff}',
    '.cr-btn-primary:hover{background:var(--teal-dark,#2e4c4d)}',
    '.cr-btn-secondary{background:var(--brand-tint,#e7f0ef);color:var(--teal,#3d6263);border:1px solid var(--hairline,#dde7e6)}'
  ].join('');

  function formHtml() {
    return '<div class="cr-sheet">'
      + '<div class="cr-handle"></div>'
      /* The heading and its close stay at the top while the form scrolls
         (audit, 15 Oct 2026: there was no way out but tapping the dim edge). */
      + '<div class="cr-head"><div class="cr-title" style="margin:0">New Event</div>'
      + '<button type="button" class="cr-x" onclick="closeNewEventForm()" aria-label="Close">'
      + '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
      + '<div style="display:flex;flex-direction:column;gap:12px;">'
      + '<div class="cr-field"><label class="cr-label">Date</label>'
      + '<input type="date" class="cr-input" id="new-event-date"></div>'
      + '<div class="cr-field"><label class="cr-label">Event Type</label>'
      + '<select class="cr-select" id="new-event-type" onchange="syncNewEventVideo()">'
      + (SV.S ? typeNames() : NEW_EVENT_TYPES).map(function (t) { return '<option value="' + escA(t) + '">' + escA(t) + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="cr-field"><label class="cr-label">Description / Notes (optional)</label>'
      + '<input class="cr-input" id="new-event-term" placeholder="e.g. Easter Sunday, Communion..."></div>'
      + '<div class="cr-field"><label class="cr-label">Video Call</label>'
      + '<select class="cr-select" id="new-event-video"></select></div>'
      + '<div style="display:flex;gap:8px;margin-top:4px;">'
      + '<button class="cr-btn cr-btn-secondary" onclick="closeNewEventForm()">Cancel</button>'
      + '<button class="cr-btn cr-btn-primary" id="event-modal-btn" onclick="createRotaEvent()">Create Event</button>'
      + '</div></div></div>';
  }

  function ensureForm() {
    if (!document.getElementById('egbc-core-rota-css')) {
      var s = document.createElement('style');
      s.id = 'egbc-core-rota-css';
      s.textContent = FORM_CSS;
      document.head.appendChild(s);
    }
    var el = document.getElementById('cr-new-event');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cr-new-event';
      el.className = 'cr-overlay';
      el.innerHTML = formHtml();
      el.onclick = function (e) { if (e.target === el) closeNewEventForm(); };
      document.body.appendChild(el);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.classList.contains('open')) closeNewEventForm(); });
    }
    return el;
  }

  function closeNewEventForm() {
    var el = document.getElementById('cr-new-event');
    if (el) el.classList.remove('open');
  }
  global.closeNewEventForm = closeNewEventForm;
  /* The old name, because CoreTeamApp's header "+" calls it. */
  global.openNewEventModal = async function () {
    await services();
    var old = document.getElementById('cr-new-event');
    if (old && SV.S && !old.dataset.svc) { old.remove(); }
    var el = ensureForm();
    if (SV.S) el.dataset.svc = '1';
    document.getElementById('new-event-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('new-event-type').value = mainType();
    document.getElementById('new-event-term').value = '';
    document.getElementById('new-event-video').innerHTML = '<option value="">No video call</option>'
      + rooms().map(function (p) { return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('');
    global.syncNewEventVideo();
    el.classList.add('open');
  };

  global.syncNewEventVideo = function () {
    document.getElementById('new-event-video').value =
      defaultRoomFor(document.getElementById('new-event-type').value);
  };

  global.createRotaEvent = async function () {
    var date = document.getElementById('new-event-date').value;
    if (!date) { toast('Pick a date first'); return; }
    var type = document.getElementById('new-event-type').value;
    var btn = document.getElementById('event-modal-btn');
    btn.disabled = true;
    try {
      await services();
      var fields = Object.assign(freshEvent(type, date), {
        description: document.getElementById('new-event-term').value.trim(),
        videoRoom: document.getElementById('new-event-video').value,
        /* Who set it up: they may start its call as host (functions/video.js). */
        organiserUid: (global.EGBCAuth && EGBCAuth.user && EGBCAuth.user() && EGBCAuth.user().uid) || ''
      });
      /* A meeting (a room, and not a service): its notes and organiser on
         its own part, for the invited (the meetings split). */
      if (EGBCAuth.isMeetingKind(type, fields.videoRoom)) await EGBCAuth.saveMeeting(fields);
      else await db().collection('events').add(fields);
      closeNewEventForm();
      toast('Event created');
    } catch (e) {
      toast('Could not create event: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  };

  /* + SERVICE ASKS FIRST, as the Planner's does (the reviewing window,
     19 Oct 2026; the audit's "no change" red here, 20 Oct). It used to save
     a Sunday Morning Worship dated TODAY the moment it was tapped: one
     mis-tap put a real empty service on the rota, and on a phone the new
     line landed out of sight - in a folded term, with the redraw jumping
     to the next date - so nothing seemed to happen. Now a small sheet asks
     the date (next Sunday to start with) and the kind; nothing is saved
     until "Add"; then the new line is opened, scrolled to and lit. The
     same fields as Planner.html's sheet, so a service is the same service
     whichever page added it. */
  var SERVICE_KINDS = ['Sunday Morning Worship', 'Evening Carol Service', 'Midnight Service', 'Special Service', 'LOUD Worship'];
  var SUNDAY_PUBLIC = { whatsOn: true, serviceTime: '10:00' };
  var justAdded = null;
  function nextSundayIso() {
    var d = new Date(); d.setHours(12, 0, 0, 0);
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function closeAddService() {
    var w = document.getElementById('crAddService'); if (w) w.remove();
    document.removeEventListener('keydown', addServiceKey);
  }
  function addServiceKey(e) { if (e.key === 'Escape') closeAddService(); }
  global.addSingleLine = async function () {
    closeAddService();
    await services();
    var wrap = document.createElement('div');
    wrap.id = 'crAddService'; wrap.setAttribute('data-egbc-overlay', '');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(17,24,39,.4);display:flex;align-items:flex-end;justify-content:center';
    wrap.innerHTML = '<div role="dialog" aria-modal="true" aria-labelledby="crAddT" style="background:#fff;width:100%;max-width:440px;border-radius:18px 18px 0 0;padding:16px 16px 20px;font-family:Inter,system-ui,sans-serif;box-sizing:border-box">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><b id="crAddT" style="font-size:16px;color:#111827">Add a service</b>'
      + '<button type="button" data-close="1" aria-label="Close" style="width:44px;height:44px;border:1px solid #d1d5db;border-radius:10px;background:#fff;cursor:pointer;font-size:18px;color:#3d6263">&times;</button></div>'
      + '<label for="crAddDate" style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:4px">Date</label>'
      + '<input id="crAddDate" type="date" style="width:100%;height:46px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:10px;padding:0 10px;font:500 15px Inter,system-ui,sans-serif;margin-bottom:12px">'
      + '<label for="crAddType" style="display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:4px">What kind</label>'
      + '<select id="crAddType" style="width:100%;height:46px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:10px;padding:0 10px;font:500 15px Inter,system-ui,sans-serif;margin-bottom:16px;background:#fff">'
      + typeNames().map(function (t) { return '<option' + (t === mainType() ? ' selected' : '') + '>' + escA(t) + '</option>'; }).join('') + '</select>'
      + '<div style="display:flex;gap:8px"><button type="button" data-close="1" style="flex:1;min-height:48px;border:1px solid #d1d5db;border-radius:12px;background:#fff;font:600 14px Inter,system-ui,sans-serif;cursor:pointer">Cancel</button>'
      + '<button type="button" id="crAddGo" style="flex:1;min-height:48px;border:0;border-radius:12px;background:#3d6263;color:#fff;font:600 14px Inter,system-ui,sans-serif;cursor:pointer">Add</button></div>'
      + '<p id="crAddMsg" role="status" style="margin:10px 0 0;font-size:13px;color:#b0392c;min-height:1em"></p></div>';
    document.body.appendChild(wrap);
    if (global.matchMedia && global.matchMedia('(min-width:700px)').matches) { wrap.style.alignItems = 'center'; wrap.firstChild.style.borderRadius = '18px'; }
    document.getElementById('crAddDate').value = nextSundayIso();
    wrap.addEventListener('click', function (e) { if (e.target === wrap || e.target.closest('[data-close]')) closeAddService(); });
    document.addEventListener('keydown', addServiceKey);
    document.getElementById('crAddGo').onclick = async function () {
      var d = document.getElementById('crAddDate').value, type = document.getElementById('crAddType').value;
      var msg = document.getElementById('crAddMsg');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { msg.textContent = 'Choose the date first.'; return; }
      var go = document.getElementById('crAddGo'); go.disabled = true; go.textContent = 'Adding\u2026';
      var ref = db().collection('events').doc();
      justAdded = ref.id;
      rotaCollapsedTerms.delete(getTermLabel(d));
      try {
        await ref.set(freshEvent(type, d));
        closeAddService();
        toast(type + ' added.');
      } catch (e) {
        justAdded = null;
        try { console.warn('Rota: could not add the service', e && e.code); } catch (x) {}
        msg.textContent = 'That did not save. Please try again.'; go.disabled = false; go.textContent = 'Add';
      }
    };
    setTimeout(function () { try { document.getElementById('crAddDate').focus(); } catch (e) {} }, 50);
  };
  function showJustAdded(container) {
    var row = justAdded && container.querySelector('[data-ev="' + justAdded + '"]');
    if (!row) return false;
    justAdded = null;
    row.scrollIntoView({ block: 'center' });
    row.style.boxShadow = '0 0 0 3px #f59e0b';
    setTimeout(function () { row.style.boxShadow = ''; }, 2500);
    return true;
  }

  function termBounds(term) {
    var year = new Date().getFullYear();
    return [new Date(year + '-' + (term === 'Spring' ? '01' : term === 'Summer' ? '05' : '09') + '-01'),
            new Date(year + '-' + (term === 'Spring' ? '04' : term === 'Summer' ? '08' : '12') + '-31')];
  }

  global.generateTerm = async function () {
    var term = document.getElementById('termSelect').value;
    if (!term) { toast('Select a term first'); return; }
    var b = termBounds(term), curr = b[0], end = b[1];
    while (curr.getDay() !== 0) curr.setDate(curr.getDate() + 1);
    await services();
    loader(true, 'Populating ' + term + '...');
    while (curr <= end) {
      var ds = curr.toISOString().split('T')[0];
      await db().collection('events').add(freshEvent(mainType(), ds));
      curr.setDate(curr.getDate() + 7);
    }
    loader(false); toast('Term populated');
  };

  global.addThursdayPractices = async function () {
    var term = document.getElementById('termSelect').value;
    if (!term) { toast('Select a term first'); return; }
    var b = termBounds(term), curr = b[0], end = b[1];
    while (curr.getDay() !== 4) curr.setDate(curr.getDate() + 1);
    loader(true, 'Adding practices...');
    while (curr <= end) {
      var ds = curr.toISOString().split('T')[0];
      await db().collection('events').add({ date: ds, termLabel: getTermLabel(ds), type: 'Sunday Team Practice', description: 'Thursday Rehearsal', teams: ['Worship Team'], startTime: '19:30', endTime: '21:30', roles: ['Worship Leader', 'Keyboard', 'Guitar', 'Drums', 'Bass'], archived: false });
      curr.setDate(curr.getDate() + 7);
    }
    loader(false); toast('Practices added');
  };

  global.autoFillPractice = async function (practiceId) {
    var practice = cachedEvents.find(function (e) { return e.id === practiceId; });
    if (!practice) return;
    var pd = new Date(practice.date);
    var sunday = cachedEvents.find(function (e) {
      var diff = (new Date(e.date) - pd) / (1000 * 60 * 60 * 24);
      return e.type === mainType() && diff > 0 && diff <= 3;
    });
    if (!sunday) { toast('No matching Sunday found'); return; }
    var updates = {};
    (practice.roles || []).forEach(function (r) {
      var p = (sunday.assignments || {})[r];
      if (p && (rotaAvailability[practiceId] || {})[p.id] === 'avail') updates['assignments.' + r] = { id: p.id, name: p.name };
    });
    if (Object.keys(updates).length) await db().collection('events').doc(practiceId).update(updates);
    toast('Synced');
  };

  global.autoFillAllEvents = async function () {
    if (!confirm('Automatically fill services?')) return;
    loader(true, 'Auto-filling...');
    var events = cachedEvents.filter(function (e) { return !e.archived && e.type === mainType(); })
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var mCounts = {};
    for (const ev of events) {
      var mk = new Date(ev.date).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
      if (!mCounts[mk]) mCounts[mk] = {};
      var members = allMembers.filter(function (m) {
        return (rotaAvailability[ev.id] || {})[m.id] === 'avail'
          && ((ev.teams || []).some(function (t) { return (m.markers || []).includes(t); })
              || ((ev.teams || []).includes('Youth') && (m.markers || []).includes('Youth Worship')));
      });
      var assigned = new Set(Object.values(ev.assignments || {}).map(function (a) { return a.id; }));
      var roles = (ev.roles || []).slice();
      var asgn = Object.assign({}, ev.assignments || {});

      var tryAssign = function (rn, inst, primary) {
        if (asgn[rn] && asgn[rn].id) return false;
        var cands = members.filter(function (m) {
          return !assigned.has(m.id)
            && (mCounts[mk][m.id] || 0) < (parseInt(m.maxFrequency) || 2)
            && hasSkill(m, inst, primary);
        });
        cands.sort(function (a, b) {
          return (((a.markers || []).includes('Youth Worship') ? 1 : 0) - ((b.markers || []).includes('Youth Worship') ? 1 : 0))
            || (((a.primaryInstruments || []).length) - ((b.primaryInstruments || []).length));
        });
        if (!cands.length) return false;
        var c = cands[0];
        asgn[rn] = { id: c.id, name: c.name }; assigned.add(c.id);
        mCounts[mk][c.id] = (mCounts[mk][c.id] || 0) + 1; return true;
      };

      /* Each place is filled by people with its skill (Teams & groups);
         the extra places are the worship, AV and choir teams' (roleFill):
         a numbered family (EGBC's singers) takes every available person
         with its skill, any other place one person. */
      var plan = global.EGBCAuth && EGBCAuth.roleFill ? EGBCAuth.roleFill(['worship', 'av', 'choir']) : { fill: [], grow: [] };
      var family = function (base) {
        return roles.filter(function (r) { return r === base || (r.indexOf(base + ' ') === 0 && /^\d+$/.test(r.slice(base.length + 1))); });
      };
      MANDATORY_SUNDAY_ROLES.forEach(function (r) { tryAssign(r, skillOf(r), true); });
      plan.grow.forEach(function (g) { family(g[0]).forEach(function (r) { tryAssign(r, g[1], true); }); });
      MANDATORY_SUNDAY_ROLES.forEach(function (r) { tryAssign(r, skillOf(r), false); });
      plan.grow.forEach(function (g) { family(g[0]).forEach(function (r) { tryAssign(r, g[1], false); }); });

      plan.grow.forEach(function (g) {
        members.filter(function (m) {
          return !assigned.has(m.id) && hasSkill(m, g[1], false);
        }).sort(function (a, b) {
          return ((a.markers || []).includes('Youth Worship') ? 1 : 0) - ((b.markers || []).includes('Youth Worship') ? 1 : 0);
        }).forEach(function (m) {
          if ((mCounts[mk][m.id] || 0) >= (parseInt(m.maxFrequency) || 2)) return;
          var i = 1; while (roles.includes(g[0] + ' ' + i)) i++;
          var nr = g[0] + ' ' + i; roles.push(nr); asgn[nr] = { id: m.id, name: m.name };
          assigned.add(m.id); mCounts[mk][m.id] = (mCounts[mk][m.id] || 0) + 1;
        });
      });

      plan.fill.forEach(function (f) {
        if (!roles.includes(f[0]) && (tryAssign(f[0], f[1], true) || tryAssign(f[0], f[1], false))) roles.push(f[0]);
      });
      await db().collection('events').doc(ev.id).update({ assignments: asgn, roles: roles });
    }
    loader(false); toast('Auto-fill complete');
  };

  global.gatherTermAvailability = async function () {
    var terms = [...new Set(cachedEvents.filter(function (e) { return !e.archived; }).map(function (e) { return e.termLabel; }))];
    var sel = prompt('Gather availability for which term?\n\n' + terms.join('\n'), terms[0]);
    if (!sel) return;

    var termEvents = cachedEvents.filter(function (e) { return !e.archived && e.termLabel === sel; });
    if (!termEvents.length) { alert('No events in that term.'); return; }

    /* Who is needed, and for which dates. Someone on Worship and Kids Church is
       one person needed on the union of both sets of dates - they should be
       asked once, about all of them. */
    var needed = {};
    termEvents.forEach(function (ev) {
      allMembers.forEach(function (m) {
        var onIt = (m.markers || []).some(function (r) { return (ev.teams || []).includes(r); })
          || ((ev.teams || []).includes('Youth') && (m.markers || []).includes('Youth Worship'));
        if (!onIt || !m.email) return;
        if (!needed[m.id]) needed[m.id] = { member: m, dates: new Set() };
        needed[m.id].dates.add(ev.date);
      });
    });

    /* What has already gone out. Karen sending after Martin must not ask the
       same people again - unless dates have been added since they were asked. */
    var reqRef = db().collection('availabilityRequests').doc(sel);
    var already = {};
    try {
      var snap0 = await reqRef.get();
      if (snap0.exists) already = snap0.data().sent || {};
    } catch (e) { console.warn('Could not read previous requests', e); }

    var toSend = [], topUp = [], skipped = [];
    Object.values(needed).forEach(function (n) {
      var prev = already[n.member.id];
      if (!prev) { toSend.push(n); return; }
      var asked = new Set(prev.dates || []);
      var fresh = [...n.dates].filter(function (d) { return !asked.has(d); });
      if (fresh.length) topUp.push(Object.assign({}, n, { fresh: fresh }));
      else skipped.push(n);
    });

    var total = toSend.length + topUp.length;
    if (!total) {
      alert('Everyone needed for ' + sel + ' has already been asked - ' + skipped.length + ' '
        + (skipped.length === 1 ? 'person' : 'people') + '.\n\nNobody will be emailed again.');
      return;
    }

    var lines = [
      sel, '',
      toSend.length + ' to ask for the first time',
      topUp.length ? topUp.length + ' to ask about newly added dates' : null,
      skipped.length ? skipped.length + ' already asked - will be skipped' : null,
      '', 'Send now?'
    ].filter(Boolean).join('\n');
    if (!confirm(lines)) return;

    loader(true, 'Sending…');

    var fmt = function (d) { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };

    /* The email is headed with the church's name, and replies go to its
       enquiry address (churchSettings/details); unset, neither is added. */
    var church = window.EGBCChurch ? await EGBCChurch.load().catch(function () { return {}; }) : {};
    church = church || {};

    var body = function (n, onlyNew) {
      var dates = (onlyNew ? n.fresh : [...n.dates]).sort();
      return '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">'
        + (church.name ? '<p style="font-size:13px;font-weight:600;text-transform:none;letter-spacing:3px;color:#3d6263;margin:0 0 18px">' + escA(church.name) + '</p>' : '')
        + '<p style="font-size:15px;color:#3a4d4c;line-height:1.6">Hi ' + n.member.name.split(' ')[0] + ',</p>'
        + '<p style="font-size:15px;color:#3a4d4c;line-height:1.6">' + (onlyNew
          ? 'A few more dates have been added to ' + sel + '. Could you let us know about these ones?'
          : 'Could you let us know which Sundays you are around for in ' + sel + '?') + '</p>'
        + '<div style="background:#f0f6f6;border:1px solid #dde7e6;border-radius:14px;padding:16px 20px;margin:18px 0">'
        + '<div style="font-size:13px;font-weight:600;text-transform:none;letter-spacing:2px;color:#6b8281;margin-bottom:8px">'
        + dates.length + ' date' + (dates.length === 1 ? '' : 's') + '</div>'
        + '<div style="font-size:14px;color:#14201f;line-height:1.9">' + dates.map(fmt).join(' &middot; ') + '</div>'
        + '</div>'
        + '<p style="text-align:center;margin:24px 0">'
        + '<a href="' + location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html" style="background:#3d6263;color:#fff;padding:14px 32px;border-radius:999px;font-size:13px;font-weight:600;text-transform:none;letter-spacing:2px;text-decoration:none">Fill in your availability</a>'
        + '</p>'
        + '<p style="font-size:13px;color:#6b8281;line-height:1.6">One form covers everything you are on - worship, AV, Kids Church - so you only need to do this once.</p>'
        + '</div>';
    };

    var sentPatch = Object.assign({}, already);
    var ok = 0; var failed = [];

    for (const n of toSend.concat(topUp)) {
      var onlyNew = !!n.fresh;
      try {
        var r = await EGBCAuth.sendEmail(Object.assign({ source: 'rota' }, {
            to: [n.member.email],
            subject: 'Availability for ' + sel,
            html: body(n, onlyNew),
            /* The AV team's own address (Team mail), else the enquiry email. */
            replyTo: (await EGBCAuth.teamAddress('av')) || church.enquiryEmail || undefined
          }));
        if (!r.ok) throw new Error(r.error || 'send failed');
        sentPatch[n.member.id] = {
          at: new Date().toISOString(),
          by: (typeof global.ME !== 'undefined' && global.ME && global.ME.name) || 'unknown',
          dates: [...n.dates]
        };
        ok++;
      } catch (e) {
        console.error('Availability email failed for', n.member.name, e);
        failed.push(n.member.name);
      }
    }

    try { await reqRef.set({ term: sel, sent: sentPatch }, { merge: true }); }
    catch (e) { console.warn('Could not record who was asked', e); }

    loader(false);
    toast(failed.length ? ok + ' sent, ' + failed.length + ' failed' : ok + ' sent ✓');
    if (failed.length) alert('Could not send to: ' + failed.join(', '));
  };

  function buildTimeOptions(sel) {
    var o = '';
    for (var h = 0; h < 24; h++) for (var m = 0; m < 60; m += 15) {
      var v = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      o += '<option value="' + v + '"' + (sel === v ? ' selected' : '') + '>' + v + '</option>';
    }
    return o;
  }

  function renderPlanner() {
    var container = document.getElementById('eventList');
    if (!container) return;
    container.innerHTML = '';
    /* Opens at the next date (Martin, 14 Oct 2026): after this redraw, for the first few seconds. */
    setTimeout(function () { if (!showJustAdded(container)) EGBCUKDates.openAtNext(container); }, 0);
    var grouped = {};
    cachedEvents.forEach(function (ev) {
      if (ev.archived) return;
      var t = ev.termLabel || getTermLabel(ev.date);
      if (!grouped[t]) grouped[t] = [];
      grouped[t].push(ev);
    });
    Object.keys(grouped).sort().forEach(function (term) {
      /* A term whose dates are all past is not drawn while they are hidden. */
      if (!grouped[term].some(function (ev) { return !EGBCUKDates.hidden(ev.date); })) return;
      var isCol = rotaCollapsedTerms.has(term);
      var html = '<div style="margin-bottom:20px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;background:#3d6263;color:white;padding:12px 16px;border-radius:' + (isCol ? '14px' : '14px 14px 0 0') + ';">';
      html += '<button onclick="toggleTermCollapse(\'' + term + '\')" style="background:none;border:none;color:white;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;cursor:pointer;">' + term + '</button>';
      html += '<button onclick="archiveTerm(\'' + term + '\')" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:4px 10px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;cursor:pointer;">Archive</button>';
      html += '</div>';
      if (!isCol) {
        html += '<div style="background:white;padding:10px;border:1px solid #d1dfdf;border-top:none;border-radius:0 0 14px 14px;">';
        var sorted = grouped[term].sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
        var byMonth = {};
        sorted.forEach(function (ev) {
          var mk = new Date(ev.date).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
          if (!byMonth[mk]) byMonth[mk] = []; byMonth[mk].push(ev);
        });
        Object.keys(byMonth).forEach(function (month) {
          /* The rows shown; the month's totals below still count every Sunday in it. */
          var shown = byMonth[month].filter(function (ev) { return !EGBCUKDates.hidden(ev.date); });
          if (!shown.length) return;
          html += '<div style="font-size:13px;font-weight:600;text-transform:none;letter-spacing:normal;color:#3d6263;opacity:0.5;margin:12px 0 8px;">' + month + '</div>';
          var blocks = [], cur = [];
          shown.forEach(function (ev) { cur.push(ev); if (ev.type === 'Sunday Morning Worship') { blocks.push(cur); cur = []; } });
          if (cur.length) blocks.push(cur);
          blocks.forEach(function (block, idx) { block.forEach(function (ev) { html += generateEventHtml(ev, idx); }); });
          var stats = {};
          byMonth[month].forEach(function (ev) {
            if (ev.type === 'Sunday Morning Worship' && ev.assignments) {
              Object.values(ev.assignments).forEach(function (raw) {
                var pp = Array.isArray(raw) ? raw : [raw];
                pp.forEach(function (p) { if (p && p.name) stats[p.name] = (stats[p.name] || 0) + 1; });
              });
            }
          });
          if (Object.keys(stats).length) {
            html += '<div style="margin-top:10px;background:#f0f6f6;border-radius:10px;padding:10px;border:1px solid #d1dfdf;"><div style="font-size:13px;font-weight:600;text-transform:none;color:#3d6263;text-align:center;margin-bottom:8px;">Monthly Serving Totals</div><div style="display:flex;flex-wrap:wrap;gap:5px;justify-content:center;">';
            Object.entries(stats).sort(function (a, b) { return a[0].localeCompare(b[0]); }).forEach(function (e) {
              html += '<div style="background:white;border:1px solid #d1dfdf;padding:3px 8px;border-radius:8px;font-size:13px;font-weight:600;color:#3d6263;">' + e[0] + ': <span style="font-weight:600">' + e[1] + '</span></div>';
            });
            html += '</div></div>';
          }
        });
        html += '</div>';
      }
      html += '</div>';
      container.innerHTML += html;
    });
    if (global.EGBCUI && EGBCUI.icons) EGBCUI.icons();
  }

  function generateEventHtml(ev, blockIdx) {
    var assignedIds = Object.values(ev.assignments || {}).flatMap(function (raw) {
      return Array.isArray(raw) ? raw.map(function (p) { return p.id; }) : [raw && raw.id];
    }).filter(Boolean);
    var members = allMembers.filter(function (m) {
      return (ev.teams || []).some(function (t) { return (m.markers || []).includes(t); })
        || ((ev.teams || []).includes('Youth') && (m.markers || []).includes('Youth Worship'));
    });
    var av = rotaAvailability[ev.id] || {};
    var shown = function (m) { return !hideAssigned || !assignedIds.includes(m.id); };
    var avail = members.filter(function (m) { return av[m.id] === 'avail' && shown(m); });
    var declined = members.filter(function (m) { return (av[m.id] === 'unavailable' || av[m.id] === 'not-avail') && shown(m); });
    var pending = members.filter(function (m) { return !av[m.id] && shown(m); });
    var isSunday = isServiceType(ev.type);
    var AV = avRoles();
    var sortedRoles = (ev.roles || []).filter(function (r) { return !AV.includes(r); })
      .concat((ev.roles || []).filter(function (r) { return AV.includes(r); }));
    var isExp = rotaExpandedEvents.has(ev.id) || isSunday;
    var bg = !isSunday ? '#f8fafc' : (blockIdx % 2 === 0 ? 'white' : '#f9fbfb');

    var html = '<div data-date="' + ev.date + '" data-ev="' + ev.id + '" style="background:' + bg + ';border:1px solid #d1dfdf;border-radius:12px;padding:10px;margin-bottom:8px;">';
    html += '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">';
    html += '<button onclick="toggleEventExpand(\'' + ev.id + '\')" style="width:26px;height:26px;border-radius:8px;background:white;border:1px solid #d1dfdf;color:#3d6263;font-weight:600;font-size:13px;cursor:pointer;flex-shrink:0;">' + (isExp ? '−' : '+') + '</button>';
    html += '<input type="date" value="' + ev.date + '" onchange="updateField(\'' + ev.id + '\',\'date\',this.value)" style="background:' + (isSunday ? '#3d6263' : '#d1dfdf') + ';color:' + (isSunday ? 'white' : '#3d6263') + ';border:none;padding:5px 8px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:500;font-size:13px;">';
    html += '<select onchange="updateField(\'' + ev.id + '\',\'startTime\',this.value)" style="background:white;border:1px solid #d1dfdf;color:#3d6263;padding:4px 5px;border-radius:8px;font-size:13px;font-weight:500;font-family:Inter, system-ui, sans-serif;outline:none;">' + buildTimeOptions(ev.startTime || '08:00') + '</select>';
    html += '<span style="font-size:13px;color:#d1dfdf;">–</span>';
    html += '<select onchange="updateField(\'' + ev.id + '\',\'endTime\',this.value)" style="background:white;border:1px solid #d1dfdf;color:#3d6263;padding:4px 5px;border-radius:8px;font-size:13px;font-weight:500;font-family:Inter, system-ui, sans-serif;outline:none;">' + buildTimeOptions(ev.endTime || '11:30') + '</select>';
    html += '<select onchange="updateField(\'' + ev.id + '\',\'type\',this.value)" style="background:white;border:1px solid #d1dfdf;color:#3d6263;padding:5px 8px;border-radius:8px;font-size:13px;font-weight:500;font-family:Inter, system-ui, sans-serif;outline:none;flex:1;min-width:120px;">';
    /* A type the rota does not list - a team's own meeting, set up on the
       Meetings page - is kept, first and selected, rather than overwritten
       by the first type in the list the next time the row is saved. */
    if (ev.type && typeNames().indexOf(ev.type) === -1) {
      var ownType = String(ev.type).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; });
      html += '<option value="' + ownType + '" selected>' + ownType + '</option>';
    }
    typeNames().forEach(function (t) { html += '<option value="' + escA(t) + '"' + (ev.type === t ? ' selected' : '') + '>' + escA(t) + '</option>'; });
    html += '</select>';
    /* Its building, when the church has more than one (H-11: none = the
       main building, the first listed). */
    if (SV.sites.length > 1) {
      html += '<select onchange="updateField(\'' + ev.id + '\',\'siteId\',this.value)" title="Building" aria-label="Building" style="background:white;border:1px solid #d1dfdf;color:#3d6263;padding:5px 8px;border-radius:8px;font-size:13px;font-weight:500;font-family:Inter, system-ui, sans-serif;">';
      SV.sites.forEach(function (x, i) { html += '<option value="' + (i ? escA(x.id) : '') + '"' + ((ev.siteId || '') === (i ? x.id : '') || ev.siteId === x.id ? ' selected' : '') + '>' + escA(x.name) + '</option>'; });
      html += '</select>';
    }
    html += '<textarea rows="1" onblur="updateField(\'' + ev.id + '\',\'description\',this.value)" placeholder="Notes..." style="flex:1;min-width:80px;background:white;border:1px solid #d1dfdf;border-radius:8px;padding:4px 8px;font-family:Inter, system-ui, sans-serif;font-size:13px;font-weight:500;color:#3d6263;outline:none;resize:none;">' + (ev.description || '') + '</textarea>';
    var vRoom = videoRoomFor(ev);
    html += '<select onchange="updateField(\'' + ev.id + '\',\'videoRoom\',this.value)" title="Video call" style="background:' + (vRoom ? '#3d6263' : 'white') + ';border:1px solid #d1dfdf;color:' + (vRoom ? 'white' : '#3d6263') + ';padding:5px 8px;border-radius:8px;font-size:13px;font-weight:500;font-family:Inter, system-ui, sans-serif;outline:none;"><option value=""' + (vRoom ? '' : ' selected') + '>No call</option>';
    rooms().forEach(function (p) { html += '<option value="' + p[0] + '"' + (vRoom === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; });
    /* Its own room (the one it had was taken then, functions/meeting-rooms.js). */
    if (vRoom && !rooms().some(function (p) { return p[0] === vRoom; })) html += '<option value="' + String(vRoom).replace(/"/g, '&quot;') + '" selected>Its own room</option>';
    html += '</select>';
    if (vRoom) html += '<a href="meeting.html?room=' + encodeURIComponent(vRoom) + '&event=' + encodeURIComponent(ev.id) + '" target="_blank" rel="noopener" style="background:#16a34a;color:white;padding:5px 10px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;text-decoration:none;">Join</a>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:5px;background:white;padding:4px 8px;border-radius:8px;border:1px solid #d1dfdf;">';
    ['Core Team', 'Worship Team', 'AV Team', 'Choir', 'Youth'].forEach(function (t) {
      html += '<label style="font-size:13px;font-weight:600;text-transform:none;display:flex;align-items:center;gap:3px;color:#3d6263;cursor:pointer;white-space:nowrap;"><input type="checkbox" onchange="toggleTeam(\'' + ev.id + '\',\'' + t + '\')" ' + ((ev.teams || []).includes(t) ? 'checked' : '') + ' style="width:11px;height:11px;accent-color:#3d6263;"><span>' + t + '</span></label>';
    });
    html += '</div>';
    if (!isSunday) html += '<button onclick="autoFillPractice(\'' + ev.id + '\')" style="background:#d1dfdf;color:#3d6263;border:none;padding:5px 8px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;cursor:pointer;">Sync</button>';
    html += '<button onclick="toggleBucket(\'' + ev.id + '\')" style="width:28px;height:28px;border-radius:8px;background:white;border:1px solid #d1dfdf;color:#3d6263;cursor:pointer;font-size:14px;" title="Availability"><i data-lucide="inbox" style="width:15px;height:15px"></i></button>';
    html += '<button onclick="deleteEvent(\'' + ev.id + '\')" style="background:none;border:none;color:#d1dfdf;font-size:16px;cursor:pointer;" title="Delete"><i data-lucide="trash-2" style="width:15px;height:15px"></i></button>';
    html += '</div>';

    if (isExp) {
      html += '<div style="margin-top:10px;border-top:1px solid #f0f6f6;padding-top:10px;">';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">';
      sortedRoles.forEach(function (r) {
        var asgn = (ev.assignments || {})[r] || null;
        var isAV = AV.includes(r);
        var isPend = asgn && !av[asgn.id];
        var border = isAV ? '#f59e0b' : (asgn ? '#3d6263' : '#d1dfdf');
        var nc = isPend ? '#f97316' : '#3d6263';
        var sr = r.replace(/'/g, "\\'");
        html += '<div ondragover="event.preventDefault()" ondrop="onDropRole(event,\'' + ev.id + '\',\'' + sr + '\')" style="background:white;border:2px ' + (asgn ? 'solid' : 'dashed') + ' ' + border + ';border-radius:10px;padding:8px 10px;min-width:100px;">';
        html += '<div style="font-size:12px;font-weight:500;text-transform:none;color:#6b7280;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center;"><span>' + r + '</span><button onclick="removeRole(\'' + ev.id + '\',\'' + sr + '\')" style="background:none;border:none;color:#fca5a5;font-size:13px;cursor:pointer;padding:0;" aria-label="Close"><i data-lucide="x" style="width:16px;height:16px"></i></button></div>';
        html += '<div draggable="true" ondragstart="onDragStart(event,\'' + ((asgn && asgn.id) || '') + '\',\'' + (((asgn && asgn.name) || '').replace(/'/g, "\\'")) + '\',\'' + ev.id + '\',\'' + sr + '\')" onclick="roleTap(\'' + ev.id + '\',\'' + sr + '\')" style="font-size:12px;font-weight:' + (asgn ? '600' : '400') + ';color:' + (asgn ? nc : '#d1dfdf') + ';font-style:' + (asgn ? 'normal' : 'italic') + ';cursor:pointer;padding:2px 0;">' + (asgn ? personName(asgn) : 'Tap to assign') + '</div>';
        html += '</div>';
      });
      html += '<select onchange="addRole(\'' + ev.id + '\',this.value);this.value=\'\';" style="background:white;border:2px dashed #d1dfdf;color:#3d6263;padding:6px 10px;border-radius:10px;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;cursor:pointer;align-self:center;"><option value="">+ Role</option>';
      optionalRoles().forEach(function (o) { html += '<option value="' + o + '">' + o + '</option>'; });
      html += '</select></div>';

      if (rotaOpenBuckets.has(ev.id)) {
        html += '<div style="background:#f0f6f6;border-radius:12px;border:1px solid #d1dfdf;padding:10px;">';
        var bucket = function (label, items, status, col, bg2, border2) {
          var b = '<div ondragover="event.preventDefault()" ondrop="onDropBucket(event,\'' + ev.id + '\',\'' + status + '\');event.stopPropagation();" style="margin-bottom:8px;">';
          b += '<div style="font-size:13px;font-weight:600;text-transform:none;color:' + col + ';margin-bottom:5px;">' + label + '</div>';
          b += '<div style="display:flex;flex-wrap:wrap;gap:5px;min-height:24px;">';
          items.forEach(function (m) {
            b += '<div draggable="true" ondragstart="onDragStart(event,\'' + m.id + '\',\'' + m.name.replace(/'/g, "\\'") + '\')" onclick="personTap(\'' + ev.id + '\',\'' + m.id + '\',\'' + m.name.replace(/'/g, "\\'") + '\')"'
              + ' style="padding:5px 9px;background:' + bg2 + ';color:' + col + ';border:1px solid ' + border2 + ';border-radius:7px;font-size:13px;font-weight:500;cursor:pointer;">' + m.name + '</div>';
          });
          b += '</div></div>'; return b;
        };
        html += bucket('Available', avail, 'avail', '#166534', '#f0fdf4', '#86efac');
        html += bucket('Declined', declined, 'not-avail', '#991b1b', '#fef2f2', '#fca5a5');
        html += bucket('Pending', pending, 'pending', '#64748b', '#f8fafc', '#e2e8f0');
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  /* ---- the screen ---------------------------------------------------- */
  /* The toolbar is CoreTeamApp's, inline styles and all, so it looks the
     same in both. The "+" for a new service is NOT in it: in CoreTeamApp
     that is the header button, and in the app it is the screen's own
     row - adding one here would put a button in the Core Team app that
     was never there. */
  var SCREEN_HTML = ''
    + '<div style="background:white;border-bottom:1px solid #d1dfdf;padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex-shrink:0;">'
    +   '<select id="termSelect" style="background:#f0f6f6;border:1px solid #d1dfdf;border-radius:8px;padding:8px 14px;font-family:Inter, system-ui, sans-serif;font-weight:500;font-size:12px;color:#3d6263;outline:none;flex:1;min-width:100px;">'
    +     '<option value="">Term…</option><option value="Spring">Spring</option>'
    +     '<option value="Summer">Summer</option><option value="Autumn">Autumn</option>'
    +   '</select>'
    +   '<button onclick="generateTerm()" style="background:#f0f6f6;color:#3d6263;border:1px solid #d1dfdf;padding:8px 14px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;cursor:pointer;">Populate</button>'
    +   '<button onclick="autoFillAllEvents()" style="background:#3d6263;color:white;border:none;padding:8px 14px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;cursor:pointer;">Auto-Fill</button>'
    +   '<button onclick="addThursdayPractices()" style="background:#3d6263;color:white;border:none;padding:8px 14px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;cursor:pointer;">+ Practices</button>'
    +   '<button onclick="addSingleLine()" style="background:#3d6263;color:white;border:none;padding:8px 14px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;cursor:pointer;">+ Service</button>'
    +   '<button onclick="gatherTermAvailability()" style="background:white;color:#3d6263;border:1px solid #d1dfdf;padding:8px 14px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;cursor:pointer;">Gather Avail</button>'
    +   '<button onclick="toggleHideAssigned()" style="background:white;color:#3d6263;border:1px solid #d1dfdf;padding:8px 14px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;cursor:pointer;">Hide Assigned</button>'
    +   '<button onclick="toggleShowPast(this)" data-past-toggle="off" aria-pressed="false" style="background:white;color:#3d6263;border:1px solid #d1dfdf;padding:8px 14px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:600;font-size:13px;text-transform:none;cursor:pointer;">Show past dates</button>'
    + '</div>'
    + '<div id="eventList" style="flex:1;overflow-y:auto;padding:12px 12px calc(env(safe-area-inset-bottom, 0px) + 16px);"></div>';

  var PANEL = null;

  function mount(opts) {
    opts = opts || {};
    var into = opts.into;
    if (!into) return null;
    if (opts.db) H.db = opts.db;
    if (opts.toast) H.toast = opts.toast;
    if (opts.loader) H.loader = opts.loader;
    if (opts.onMembers) H.onMembers = opts.onMembers;
    if (opts.onEvents) H.onEvents = opts.onEvents;
    H.root = into;
    /* TAP TARGETS (the audit, 26 Oct 2026): the rota's own buttons, time
       boxes and date boxes were 22-28px tall - a term's Archive, the + / -
       that opens a service, each person's name. 44px, everywhere it runs. */
    if (!document.getElementById('egbc-core-rota-tap')) {
      var tap = document.createElement('style');
      tap.id = 'egbc-core-rota-tap';
      tap.textContent = '.cr-panel button,.cr-panel select,.cr-panel input:not([type=checkbox]):not([type=radio]){min-height:44px}'
        + '.cr-panel button{min-width:44px}';
      document.head.appendChild(tap);
    }
    /* One panel, moved between hosts, the same as the planner: a tab the
       shell redraws must not lose which terms are open. */
    if (!PANEL) {
      PANEL = document.createElement('div');
      PANEL.className = 'cr-panel';
      PANEL.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';
      PANEL.innerHTML = SCREEN_HTML;
      EGBCUKDates.paintPast(PANEL.querySelector('[data-past-toggle]'));
    }
    if (PANEL.parentNode !== into) into.appendChild(PANEL);
    startRotaListeners();
    renderPlanner();
    /* The places come from the teams' roles and the team jobs: draw again
       once the jobs are in. */
    if (global.EGBCAuth && EGBCAuth.loadPerms) EGBCAuth.loadPerms().catch(function () {}).then(function () { renderPlanner(); });
    return into;
  }

  global.EGBCCoreRota = {
    mount: mount,
    newEvent: function () { global.openNewEventModal(); },
    render: renderPlanner,
    events: function () { return cachedEvents; },
    members: function () { return allMembers; },
    getTermLabel: getTermLabel,
    MANDATORY_SUNDAY_ROLES: MANDATORY_SUNDAY_ROLES,
    get OPTIONAL_ROLES_LIST() { return optionalRoles(); },
    EVENT_TYPES_LIST: EVENT_TYPES_LIST,
    get AV_ROLES() { return avRoles(); }
  };
})(window);
