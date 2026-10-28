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
     clashes(data, opt)            -> [{ date, name, first, second, why }]
     overview(data, opt)           -> [{ date, service, time, filled, slots, people, gaps }]
     services(data, opt)           -> how many services the others counted
     csv(tab, rows)                -> { name, text }

   opt: { teams: null (every rota team) | [team ids],
          practices: false (practices copy the Sunday's people, so they
          would count everyone twice), today: 'yyyy-mm-dd' (tests) }

   A ROLE MAY HOLD ONE PERSON OR A LIST (F-204): every function here reads
   both, through people(). Whose slot a role is comes from the Planner's own
   answer, EGBCAuth.roleTeam, never a copy.

   The events window's file. Used by rota-reports.html.
   =================================================================== */

(function (global) {
  'use strict';

  /* The rota team an address book marker puts somebody on: the church's
     own team, folded into its parent when it is a sub-team (a choir sings
     on its worship team's rota), and only a team that has a rota. '' for
     anything else. */
  function markerTeam(m) {
    var T = (global.EGBCAuth && EGBCAuth.TEAMS) || {};
    if (!T[m]) return '';
    var top = T[m].parent || m;
    return T[top] && T[top].rota !== false && !T[top].parent ? top : '';
  }

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

  /* Only the teams that own a slot on these services: a rota team with no
     places of its own (a youth band that plays in the worship team's
     slots, a core team) would list all its people as never on it. */
  function notOnRota(data, opt) {
    var served = {}; slotsFor(data, opt).forEach(function (s) { served[s.key] = 1; });
    var owns = [];
    counted(data, opt).forEach(function (ev) { rolesOf(ev).forEach(function (r) { var t = roleTeam(r); if (owns.indexOf(t) < 0) owns.push(t); }); });
    var teams = owns.filter(function (t) { return !opt || !opt.teams || opt.teams.indexOf(t) >= 0; });
    return (data.people || []).filter(function (p) { return !p.archived && !served[p.key]; }).map(function (p) {
      var t = []; (p.markers || []).forEach(function (m) { var team = markerTeam(m); if (team && teams.indexOf(team) >= 0 && t.indexOf(team) < 0) t.push(team); });
      return { key: p.key, name: p.name, teams: t.sort() };
    }).filter(function (p) { return p.teams.length; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  /* CLASHES (ChurchSuite's "Clashes"; F-210): someone in two places at
     once - two slots of DIFFERENT teams at the same service (Sound and the
     Kids Church Session Leader), or two services on the same day whose
     times overlap. Two slots of the same team at one service (a worship
     leader who also sings) is often meant, so it is not counted. */
  function mins(t) { var m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; }
  function overlap(a, b) {
    var as = mins(a.startTime), ae = mins(a.endTime), bs = mins(b.startTime), be = mins(b.endTime);
    if (as === null || bs === null) return true;   /* no times given: the same day counts */
    if (ae === null) ae = as + 90;
    if (be === null) be = bs + 90;
    return as < be && bs < ae;
  }
  function clashes(data, opt) {
    var byDay = {}, out = [], seen = {}, evById = {};
    data.events.forEach(function (ev) { evById[ev.id] = ev; });
    slotsFor(data, opt).forEach(function (s) { (byDay[s.key + '|' + s.date] = byDay[s.key + '|' + s.date] || []).push(s); });
    var names = {}; (data.people || []).forEach(function (x) { names[x.key] = x.name; });
    Object.keys(byDay).forEach(function (k) {
      var list = byDay[k];
      for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
        var a = list[i], b = list[j], why = '';
        if (a.eventId === b.eventId) { if (a.team !== b.team) why = 'the same service'; }
        else if (overlap(evById[a.eventId], evById[b.eventId])) why = 'at the same time';
        if (!why) continue;
        var id = [a.key, a.eventId, a.role, b.eventId, b.role].join('|');
        if (seen[id]) continue; seen[id] = 1;
        out.push({ date: a.date, name: names[a.key] || a.name, first: a.role + ' (' + a.service + ')', second: b.role + ' (' + b.service + ')', why: why });
      }
    });
    return out.sort(function (x, y) { return byDate(x, y) || x.name.localeCompare(y.name); });
  }

  /* OVERVIEW of a date range: each service, how full its slots are, and
     what is still empty. */
  function overview(data, opt) {
    return counted(data, opt).map(function (ev) {
      var roles = rolesOf(ev).filter(function (r) { return shows(r, opt); });
      if (!roles.length) return null;
      var empty = roles.filter(function (r) { return !people((ev.assignments || {})[r]).length; });
      var who = {}; roles.forEach(function (r) { people((ev.assignments || {})[r]).forEach(function (p) { who[p.key] = 1; }); });
      return { date: ev.date, service: serviceName(ev), time: String(ev.startTime || ''), filled: roles.length - empty.length, slots: roles.length, people: Object.keys(who).length, gaps: empty.join(', ') };
    }).filter(Boolean);
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
      none: ['Not on the rota', ['Name', 'Teams'], function (r) { return [r.name, r.teams.join('; ')]; }],
      clash: ['Clashes', ['Date', 'Name', 'One slot', 'The other', 'Why'], function (r) { return [r.date, r.name, r.first, r.second, r.why]; }],
      overview: ['Overview', ['Date', 'Service', 'Time', 'Slots filled', 'Slots', 'People', 'Still empty'], function (r) { return [r.date, r.service, r.time, r.filled, r.slots, r.people, r.gaps]; }]
    }[tab];
    return { name: spec[0], text: [spec[1].join(',')].concat(rows.map(function (r) { return spec[2](r).map(q).join(','); })).join('\r\n') };
  }

  global.EGBCRotaReports = { people: people, load: load, unfilled: unfilled, frequency: frequency, history: history, notOnRota: notOnRota, clashes: clashes, overview: overview, services: services, csv: csv };
})(typeof window !== 'undefined' ? window : this);
