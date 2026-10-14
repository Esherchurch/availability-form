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
    input.parentNode.insertBefore(wrap, input);
    input.style.display = 'none';
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
      input.style.display = '';
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
      input.style.display = '';
    });
    return { sync: sync, select: sel };
  }

  g.EGBCUKDates = { long: long, short: short, today: today, hidden: hidden, showPast: showPast, setShowPast: setShowPast,
    togglePast: togglePast, paintPast: paintPast, scrollToNext: scrollToNext, openAtNext: openAtNext, attach: attach, isService: isService };
})(window);
/* ── end egbc-uk-dates ── */

(function (global) {
  'use strict';

  /* ---- the lists, from CoreTeamApp ---------------------------------- */
  var OPTIONAL_ROLES_LIST = ['Sound', 'Words', 'Cameras', 'Violin', 'Congas', '2nd Guitar', '2nd Keys',
    'Electric Guitar', 'Oboe', 'Trumpet', 'Cahon', 'Singer 1', 'Singer 2', 'Singer 3',
    'Other', 'Other 2', 'Other 3', 'Choir'];
  var MANDATORY_SUNDAY_ROLES = ['Worship Leader', 'Keyboard', 'Guitar', 'Drums', 'Bass', 'Sound', 'Words', 'Cameras'];
  var EVENT_TYPES_LIST = ['Sunday Morning Worship', 'Sunday Team Practice', 'Evening Carol Service',
    'Midnight Service', 'Special Service', 'Worship and AV Team Meeting', 'All Team Practice',
    'Core Team Meeting', 'Worship Team Meeting', 'AV Team Meeting', 'Song Writing Workshop', 'LOUD Worship'];
  var AV_ROLES = ['Sound', 'Words', 'Cameras'];
  /* The types the new-event form offers. CoreTeamApp's form listed
     eleven of the twelve - 'Special Service' was not among them - and
     that stays as it was rather than being quietly corrected here. */
  var NEW_EVENT_TYPES = ['Sunday Morning Worship', 'Sunday Team Practice', 'Evening Carol Service',
    'Midnight Service', 'Worship and AV Team Meeting', 'All Team Practice', 'Core Team Meeting',
    'Worship Team Meeting', 'AV Team Meeting', 'Song Writing Workshop', 'LOUD Worship'];

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
  function rooms() { return global.EGBCCoreMeetings ? EGBCCoreMeetings.VIDEO_ROOMS : []; }
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

  // Real-time listeners — start when the rota is first shown
  var rotaListenersStarted = false;
  function startRotaListeners() {
    if (rotaListenersStarted) return;
    rotaListenersStarted = true;
    db().collection('addressBook').onSnapshot(function (snap) {
      allMembers = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      if (H.onMembers) H.onMembers(allMembers);
      renderPlanner();
    });
    db().collection('availability').onSnapshot(function (snap) {
      rotaAvailability = {};
      snap.forEach(function (d) {
        var data = d.data();
        if (!rotaAvailability[data.eventId]) rotaAvailability[data.eventId] = {};
        rotaAvailability[data.eventId][data.memberId] = data.status;
      });
      renderPlanner();
    });
    db().collection('events').orderBy('date').onSnapshot(function (snap) {
      cachedEvents = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      renderPlanner();
      if (H.onEvents) H.onEvents(cachedEvents);
    });
  }

  global.toggleHideAssigned = function () { hideAssigned = !hideAssigned; renderPlanner(); };
  /* Past dates are hidden unless this is on; remembered on this device. */
  global.toggleShowPast = function (btn) { EGBCUKDates.togglePast(btn); renderPlanner(); EGBCUKDates.scrollToNext(document.getElementById('eventList')); };
  global.toggleTermCollapse = function (t) { rotaCollapsedTerms.has(t) ? rotaCollapsedTerms.delete(t) : rotaCollapsedTerms.add(t); renderPlanner(); };
  global.toggleEventExpand = function (id) { rotaExpandedEvents.has(id) ? rotaExpandedEvents.delete(id) : rotaExpandedEvents.add(id); renderPlanner(); };
  global.toggleBucket = function (id) { rotaOpenBuckets.has(id) ? rotaOpenBuckets.delete(id) : rotaOpenBuckets.add(id); renderPlanner(); };

  global.updateField = async function (id, field, value) {
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
    var plays = function (m) {
      return (m.primaryInstruments || []).includes(role) ? 0
        : (m.secondaryInstruments || []).includes(role) ? 1 : 2;
    };
    return eligible.sort(function (a, b) {
      return plays(a) - plays(b) || rank(a) - rank(b) || (a.name || '').localeCompare(b.name || '');
    });
  }

  function availLabel(ev, m, role) {
    var a = (rotaAvailability[ev.id] || {})[m.id];
    var bits = [];
    if ((m.primaryInstruments || []).includes(role)) bits.push('plays this');
    else if ((m.secondaryInstruments || []).includes(role)) bits.push('can cover');
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
          : ((m.primaryInstruments || []).includes(r) ? 'They play this' : 'Empty'),
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
      + '<div class="cr-title">New Event</div>'
      + '<div style="display:flex;flex-direction:column;gap:12px;">'
      + '<div class="cr-field"><label class="cr-label">Date</label>'
      + '<input type="date" class="cr-input" id="new-event-date"></div>'
      + '<div class="cr-field"><label class="cr-label">Event Type</label>'
      + '<select class="cr-select" id="new-event-type" onchange="syncNewEventVideo()">'
      + NEW_EVENT_TYPES.map(function (t) { return '<option value="' + t + '">' + t + '</option>'; }).join('')
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
    }
    return el;
  }

  function closeNewEventForm() {
    var el = document.getElementById('cr-new-event');
    if (el) el.classList.remove('open');
  }
  global.closeNewEventForm = closeNewEventForm;
  /* The old name, because CoreTeamApp's header "+" calls it. */
  global.openNewEventModal = function () {
    var el = ensureForm();
    document.getElementById('new-event-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('new-event-type').value = 'Sunday Morning Worship';
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
    var d = NEW_EVENT_DEFAULTS[type] || {};
    var btn = document.getElementById('event-modal-btn');
    btn.disabled = true;
    try {
      await db().collection('events').add({
        date: date, termLabel: getTermLabel(date), type: type,
        description: document.getElementById('new-event-term').value.trim(),
        teams: d.teams || ['Worship Team', 'AV Team'],
        startTime: d.startTime || '19:30', endTime: d.endTime || '21:00',
        roles: d.roles || [],
        videoRoom: document.getElementById('new-event-video').value,
        archived: false
      });
      closeNewEventForm();
      toast('Event created');
    } catch (e) {
      toast('Could not create event: ' + e.message);
    } finally {
      btn.disabled = false;
    }
  };

  global.addSingleLine = async function () {
    var d = new Date().toISOString().split('T')[0];
    await db().collection('events').add({ date: d, termLabel: getTermLabel(d), type: 'Sunday Morning Worship', description: '', teams: ['Worship Team', 'AV Team'], startTime: '08:00', endTime: '11:30', roles: MANDATORY_SUNDAY_ROLES.slice(), archived: false });
  };

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
    loader(true, 'Populating ' + term + '...');
    while (curr <= end) {
      var ds = curr.toISOString().split('T')[0];
      await db().collection('events').add({ date: ds, termLabel: getTermLabel(ds), type: 'Sunday Morning Worship', description: '', teams: ['Worship Team', 'AV Team'], startTime: '08:00', endTime: '11:30', roles: MANDATORY_SUNDAY_ROLES.slice(), archived: false });
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
      return e.type === 'Sunday Morning Worship' && diff > 0 && diff <= 3;
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
    var events = cachedEvents.filter(function (e) { return !e.archived && e.type === 'Sunday Morning Worship'; })
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
            && (primary ? (m.primaryInstruments || []).includes(inst)
                        : ((m.primaryInstruments || []).includes(inst) || (m.secondaryInstruments || []).includes(inst)));
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

      MANDATORY_SUNDAY_ROLES.forEach(function (r) { tryAssign(r, r, true); });
      roles.filter(function (r) { return r.startsWith('Singer'); }).forEach(function (r) { tryAssign(r, 'Sing', true); });
      MANDATORY_SUNDAY_ROLES.forEach(function (r) { tryAssign(r, r, false); });
      roles.filter(function (r) { return r.startsWith('Singer'); }).forEach(function (r) { tryAssign(r, 'Sing', false); });

      members.filter(function (m) {
        return !assigned.has(m.id)
          && ((m.primaryInstruments || []).includes('Sing') || (m.secondaryInstruments || []).includes('Sing'));
      }).sort(function (a, b) {
        return ((a.markers || []).includes('Youth Worship') ? 1 : 0) - ((b.markers || []).includes('Youth Worship') ? 1 : 0);
      }).forEach(function (m) {
        if ((mCounts[mk][m.id] || 0) >= (parseInt(m.maxFrequency) || 2)) return;
        var i = 1; while (roles.includes('Singer ' + i)) i++;
        var nr = 'Singer ' + i; roles.push(nr); asgn[nr] = { id: m.id, name: m.name };
        assigned.add(m.id); mCounts[mk][m.id] = (mCounts[mk][m.id] || 0) + 1;
      });

      ['Guitar', 'Keyboard'].forEach(function (inst) {
        var rn = '2nd ' + inst;
        if (!roles.includes(rn) && (tryAssign(rn, inst, true) || tryAssign(rn, inst, false))) roles.push(rn);
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

    var SEND_FUNCTION_URL = 'https://sendemail-irkwdhx3xq-uc.a.run.app';
    var fmt = function (d) { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };

    var body = function (n, onlyNew) {
      var dates = (onlyNew ? n.fresh : [...n.dates]).sort();
      return '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">'
        + '<p style="font-size:13px;font-weight:600;text-transform:none;letter-spacing:3px;color:#3d6263;margin:0 0 18px">Esher Green Baptist Church</p>'
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
        + '<a href="https://esherchurch.github.io/availability-form/v2/" style="background:#3d6263;color:#fff;padding:14px 32px;border-radius:999px;font-size:13px;font-weight:600;text-transform:none;letter-spacing:2px;text-decoration:none">Fill in your availability</a>'
        + '</p>'
        + '<p style="font-size:13px;color:#6b8281;line-height:1.6">One form covers everything you are on - worship, AV, Kids Church - so you only need to do this once.</p>'
        + '</div>';
    };

    var sentPatch = Object.assign({}, already);
    var ok = 0; var failed = [];

    for (const n of toSend.concat(topUp)) {
      var onlyNew = !!n.fresh;
      try {
        var resp = await fetch(SEND_FUNCTION_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: [n.member.email],
            subject: 'Availability for ' + sel,
            html: body(n, onlyNew),
            replyTo: 'av@esherchurch.org'
          })
        });
        var r = await resp.json();
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
    setTimeout(function () { EGBCUKDates.openAtNext(container); }, 0);
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
    var isSunday = ev.type === 'Sunday Morning Worship';
    var sortedRoles = (ev.roles || []).filter(function (r) { return !AV_ROLES.includes(r); })
      .concat((ev.roles || []).filter(function (r) { return AV_ROLES.includes(r); }));
    var isExp = rotaExpandedEvents.has(ev.id) || isSunday;
    var bg = !isSunday ? '#f8fafc' : (blockIdx % 2 === 0 ? 'white' : '#f9fbfb');

    var html = '<div data-date="' + ev.date + '" style="background:' + bg + ';border:1px solid #d1dfdf;border-radius:12px;padding:10px;margin-bottom:8px;">';
    html += '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">';
    html += '<button onclick="toggleEventExpand(\'' + ev.id + '\')" style="width:26px;height:26px;border-radius:8px;background:white;border:1px solid #d1dfdf;color:#3d6263;font-weight:600;font-size:13px;cursor:pointer;flex-shrink:0;">' + (isExp ? '−' : '+') + '</button>';
    html += '<input type="date" value="' + ev.date + '" onchange="updateField(\'' + ev.id + '\',\'date\',this.value)" style="background:' + (isSunday ? '#3d6263' : '#d1dfdf') + ';color:' + (isSunday ? 'white' : '#3d6263') + ';border:none;padding:5px 8px;border-radius:8px;font-family:Inter, system-ui, sans-serif;font-weight:500;font-size:13px;">';
    html += '<select onchange="updateField(\'' + ev.id + '\',\'startTime\',this.value)" style="background:white;border:1px solid #d1dfdf;color:#3d6263;padding:4px 5px;border-radius:8px;font-size:13px;font-weight:500;font-family:Inter, system-ui, sans-serif;outline:none;">' + buildTimeOptions(ev.startTime || '08:00') + '</select>';
    html += '<span style="font-size:13px;color:#d1dfdf;">–</span>';
    html += '<select onchange="updateField(\'' + ev.id + '\',\'endTime\',this.value)" style="background:white;border:1px solid #d1dfdf;color:#3d6263;padding:4px 5px;border-radius:8px;font-size:13px;font-weight:500;font-family:Inter, system-ui, sans-serif;outline:none;">' + buildTimeOptions(ev.endTime || '11:30') + '</select>';
    html += '<select onchange="updateField(\'' + ev.id + '\',\'type\',this.value)" style="background:white;border:1px solid #d1dfdf;color:#3d6263;padding:5px 8px;border-radius:8px;font-size:13px;font-weight:500;font-family:Inter, system-ui, sans-serif;outline:none;flex:1;min-width:120px;">';
    EVENT_TYPES_LIST.forEach(function (t) { html += '<option value="' + t + '"' + (ev.type === t ? ' selected' : '') + '>' + t + '</option>'; });
    html += '</select>';
    html += '<textarea rows="1" onblur="updateField(\'' + ev.id + '\',\'description\',this.value)" placeholder="Notes..." style="flex:1;min-width:80px;background:white;border:1px solid #d1dfdf;border-radius:8px;padding:4px 8px;font-family:Inter, system-ui, sans-serif;font-size:13px;font-weight:500;color:#3d6263;outline:none;resize:none;">' + (ev.description || '') + '</textarea>';
    var vRoom = videoRoomFor(ev);
    html += '<select onchange="updateField(\'' + ev.id + '\',\'videoRoom\',this.value)" title="Video call" style="background:' + (vRoom ? '#3d6263' : 'white') + ';border:1px solid #d1dfdf;color:' + (vRoom ? 'white' : '#3d6263') + ';padding:5px 8px;border-radius:8px;font-size:13px;font-weight:500;font-family:Inter, system-ui, sans-serif;outline:none;"><option value=""' + (vRoom ? '' : ' selected') + '>No call</option>';
    rooms().forEach(function (p) { html += '<option value="' + p[0] + '"' + (vRoom === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; });
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
        var isAV = AV_ROLES.includes(r);
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
      OPTIONAL_ROLES_LIST.forEach(function (o) { html += '<option value="' + o + '">' + o + '</option>'; });
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
    OPTIONAL_ROLES_LIST: OPTIONAL_ROLES_LIST,
    EVENT_TYPES_LIST: EVENT_TYPES_LIST,
    AV_ROLES: AV_ROLES
  };
})(window);
