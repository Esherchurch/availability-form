/* ===================================================================
   EGBC — rota reports (R2; ChurchSuite's Rotas > Reports; F-204, F-205)
   ===================================================================

   Read-only answers from the rotas as the planners save them
   (events/{id}: date, type, roles[], assignments{role: person | [people]},
   archived, draft). Serving records only: nothing about who came to church.

     load({ db, from, to })        -> { events, people }   (from/to: yyyy-mm-dd)
     unfilled(data, opt)           -> [{ date, service, role, team, eventId }]
     frequency(data, opt)          -> [{ key, name, services, slots, teams, last }]
     history(data, key, opt)       -> [{ date, service, role, team }]
     notOnRota(data, opt)          -> [{ key, name, teams }]
     services(data, opt)           -> how many services the others counted
     csv(tab, rows)                -> { name, text }

   opt: { teams: null (every rota team) | ['Worship Team', ...],
          practices: false (practices copy the Sunday's people, so they
          would count everyone twice), today: 'yyyy-mm-dd' (tests) }

   A ROLE MAY HOLD ONE PERSON OR A LIST (F-204): every function here reads
   both, through people(). Whose slot a role is comes from the Planner's own
   answer, EGBCAuth.roleTeam, never a copy.

   The events window's file. Used by rota-reports.html.
   =================================================================== */

(function (global) {
  'use strict';

  /* The teams that own rota slots (EGBCAuth.roleTeam's answers). */
  var ROTA_TEAMS = ['Worship Team', 'AV Team', 'Kids Church'];
  /* Address book markers that count as being on a rota team. Choir sings
     on the Worship rota. */
  var MARKER_TEAM = { 'Worship Team': 'Worship Team', 'Choir': 'Worship Team', 'AV Team': 'AV Team', 'Kids Church': 'Kids Church' };

  function roleTeam(r) {
    if (global.EGBCAuth && EGBCAuth.roleTeam) return EGBCAuth.roleTeam(r);
    return 'Worship Team';
  }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function norm(s) { return String(s == null ? '' : s).trim(); }
  /* Everyone in a slot: one person, a list of people, or nobody. */
  function people(v) {
    var list = Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : []);
    return list.filter(function (p) { return p && (norm(p.id) || norm(p.name)); })
      .map(function (p) { return { key: norm(p.id) || ('name:' + norm(p.name).toLowerCase()), name: norm(p.name) || norm(p.id) }; });
  }
  function isPractice(ev) { return /practice|rehearsal/i.test(String(ev.type || '') + ' ' + String(ev.description || '')); }
  function serviceName(ev) { return norm(ev.type) || 'Service'; }
  function counted(data, opt) {
    opt = opt || {};
    return data.events.filter(function (ev) { return opt.practices || !isPractice(ev); });
  }
  function shows(role, opt) { return !opt || !opt.teams || opt.teams.indexOf(roleTeam(role)) >= 0; }
  /* The roles on a service: its list, and any slot filled that is not on it. */
  function rolesOf(ev) {
    var out = (ev.roles || []).slice();
    Object.keys(ev.assignments || {}).forEach(function (r) { if (out.indexOf(r) < 0 && people(ev.assignments[r]).length) out.push(r); });
    return out;
  }
  function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }

  function load(o) {
    var db = o.db;
    return Promise.all([
      db.collection('events').where('date', '>=', o.from).where('date', '<=', o.to).get(),
      db.collection('addressBook').get()
    ]).then(function (r) {
      var events = r[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); })
        .filter(function (ev) { return ev.archived !== true && ev.draft !== true && ev.date; }).sort(byDate);
      var ppl = r[1].docs.map(function (d) { var x = d.data(); return { key: d.id, name: norm(x.name || x.fullName), markers: x.markers || [], archived: x.archived === true }; });
      return { events: events, people: ppl };
    });
  }

  function unfilled(data, opt) {
    var out = [];
    counted(data, opt).forEach(function (ev) {
      rolesOf(ev).forEach(function (role) {
        if (!shows(role, opt)) return;
        if (!people((ev.assignments || {})[role]).length) out.push({ date: ev.date, service: serviceName(ev), role: role, team: roleTeam(role), eventId: ev.id });
      });
    });
    return out;
  }

  function slotsFor(data, opt) {
    var out = [];
    counted(data, opt).forEach(function (ev) {
      rolesOf(ev).forEach(function (role) {
        if (!shows(role, opt)) return;
        people((ev.assignments || {})[role]).forEach(function (p) { out.push({ key: p.key, name: p.name, date: ev.date, service: serviceName(ev), role: role, team: roleTeam(role), eventId: ev.id }); });
      });
    });
    return out;
  }

  function frequency(data, opt) {
    var now = (opt && opt.today) || today(), by = {};
    slotsFor(data, opt).forEach(function (s) {
      var p = by[s.key] || (by[s.key] = { key: s.key, name: s.name, ev: {}, slots: 0, teams: [], last: '' });
      p.ev[s.eventId] = 1; p.slots++;
      if (p.teams.indexOf(s.team) < 0) p.teams.push(s.team);
      if (s.date <= now && s.date > p.last) p.last = s.date;
    });
    /* The address book's name, where the slot only had an id. */
    var names = {}; (data.people || []).forEach(function (x) { names[x.key] = x.name; });
    return Object.keys(by).map(function (k) {
      var p = by[k];
      return { key: p.key, name: names[p.key] || p.name, services: Object.keys(p.ev).length, slots: p.slots, teams: p.teams.sort(), last: p.last };
    }).sort(function (a, b) { return b.services - a.services || a.name.localeCompare(b.name); });
  }

  function history(data, key, opt) {
    return slotsFor(data, opt).filter(function (s) { return s.key === key; }).sort(byDate)
      .map(function (s) { return { date: s.date, service: s.service, role: s.role, team: s.team }; });
  }

  function notOnRota(data, opt) {
    var served = {}; slotsFor(data, opt).forEach(function (s) { served[s.key] = 1; });
    var teams = (opt && opt.teams) || ROTA_TEAMS;
    return (data.people || []).filter(function (p) { return !p.archived && !served[p.key]; }).map(function (p) {
      var t = []; (p.markers || []).forEach(function (m) { var team = MARKER_TEAM[m]; if (team && teams.indexOf(team) >= 0 && t.indexOf(team) < 0) t.push(team); });
      return { key: p.key, name: p.name, teams: t.sort() };
    }).filter(function (p) { return p.teams.length; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function services(data, opt) {
    return counted(data, opt).filter(function (ev) { return rolesOf(ev).some(function (r) { return shows(r, opt); }); }).length;
  }

  function csv(tab, rows) {
    var q = function (v) { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? '"' + (/^[=+\-@]/.test(v) ? "'" : '') + v.replace(/"/g, '""') + '"' : v; };
    var spec = {
      gaps: ['Unfilled slots', ['Date', 'Service', 'Slot', 'Team'], function (r) { return [r.date, r.service, r.role, r.team]; }],
      often: ['How often people serve', ['Name', 'Services', 'Slots', 'Teams', 'Last served'], function (r) { return [r.name, r.services, r.slots, r.teams.join('; '), r.last]; }],
      person: ['Serving history', ['Date', 'Service', 'Slot', 'Team'], function (r) { return [r.date, r.service, r.role, r.team]; }],
      none: ['Not on the rota', ['Name', 'Teams'], function (r) { return [r.name, r.teams.join('; ')]; }]
    }[tab];
    return { name: spec[0], text: [spec[1].join(',')].concat(rows.map(function (r) { return spec[2](r).map(q).join(','); })).join('\r\n') };
  }

  global.EGBCRotaReports = { ROTA_TEAMS: ROTA_TEAMS, people: people, load: load, unfilled: unfilled, frequency: frequency, history: history, notOnRota: notOnRota, services: services, csv: csv };
})(typeof window !== 'undefined' ? window : this);
