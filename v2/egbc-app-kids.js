/* ===================================================================
   EGBC — the phone app's Kids Church space: "Today" and "Children"
   (events window; APP-DESIGN-BRIEF §6, FINDINGS-events F-120,
   the shell contract in FINDINGS-app A-050)
   ===================================================================

   THE CONTRACT (A-050). A screen is a function that returns HTML,
   registered under space_tab. The shell draws everything around it and
   re-draws a screen from scratch on every navigation, so state lives here,
   never in the page. The shell calls, once:

     EGBCAppKids.mount(EGBCApp)        (EGBCAppEvents.mountAll does it)

   which registers kids_today and kids_children with EGBCApp.screen, starts
   loading, and asks the shell to redraw (EGBCApp.refresh) when the data
   arrives or changes. The shell's row/sec/next ESCAPE text themselves
   (APP-A1 §5; F-140): this file passes them plain text, and escapes only
   what it puts in HTML of its own (pills, cards, attributes).
   Buttons that DO something (check myself in, show on screen, done) carry
   data-kact and are handled here; navigation stays the shell's data-act.

   WHO SEES WHAT is the rules' job (need to know, F-087, F-094):
   - the leads see every group, with medical details;
   - a group's leaders see their own group;
   - the rota's Session Leader, that morning, sees every child checked in
     (name, group, time) and their medical details, nothing else.
   This file only asks for what the person may have.

   Needs (loaded before it): egbc-auth.js, egbc-events.js,
   egbc-events-kids.js, egbc-events-checkin.js.
   =================================================================== */

(function (global) {
  'use strict';

  var K = global.EGBCKids, C = global.EGBCCheckin, E = global.EGBCEvents;
  var H = null, LOADED = false, STARTED = false, UNSUB = [];
  /* The person's place this morning. */
  var S = { site: null, siteName: '', lead: false, myGroups: [], session: false, rollAll: false, rotaSL: false, morning: null, settings: {} };
  /* The morning's data. */
  var D = { groups: [], children: [], cks: {}, roll: {}, leaders: {}, pages: {}, med: {}, mine: null };
  var DAY = '';

  function db() { return EGBCAuth.db; }
  function me() { return (EGBCAuth.profile && EGBCAuth.profile()) || {}; }
  function uid() { return (EGBCAuth.user && EGBCAuth.user() || {}).uid || ''; }
  function all(s) { return s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
  function esc(s) { return H ? H.esc(s) : String(s == null ? '' : s); }
  var KIDS = '#7a5f4a', WARN = '#b07d2e';
  var redrawTimer = null;
  function redraw() { clearTimeout(redrawTimer); redrawTimer = setTimeout(function () { if (H && H.redraw) H.redraw(); }, 30); }
  function group(id) { return D.groups.filter(function (g) { return g.id === id; })[0] || null; }
  function child(id) { return D.children.filter(function (c) { return c.id === id; })[0] || null; }
  function time(x) {
    if (!x) return '';
    var d = x.toDate ? x.toDate() : new Date(x);
    return isNaN(d) ? '' : E.fmtTime(d.toISOString());
  }
  function tel(p) { return String(p || '').replace(/[^\d+]/g, ''); }
  function visibleGroups() { return S.lead || S.rollAll ? D.groups : D.groups.filter(function (g) { return S.myGroups.indexOf(g.id) >= 0; }); }
  function ckOf(c) { return c && c.groupId ? D.cks[K.checkinIdFor(c.id, c.groupId, DAY)] || null : null; }
  function inNow() {
    /* Children in the building now: from the check-ins (leads, group
       leaders), or from the roll-call copies (that morning's Session Leader). */
    var out = {};
    Object.keys(D.cks).forEach(function (k) { var ck = D.cks[k]; if (ck.state === 'in') out[ck.signupKey] = { childId: ck.signupKey, name: ck.name, groupId: ck.groupId, inAt: ck.inAt, ck: ck }; });
    Object.keys(D.roll).forEach(function (k) { var r = D.roll[k]; if (r.state === 'in' && !out[r.childId]) out[r.childId] = { childId: r.childId, name: r.name, groupId: r.groupId, inAt: r.inAt, groupName: r.groupName }; });
    return Object.keys(out).map(function (k) { return out[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function canPage() { return S.lead || S.myGroups.length > 0; }

  /* ---------------- loading ---------------- */
  function start() {
    if (STARTED) return; STARTED = true;
    var p = me(), mid = p.memberId || '-', adminFor = p.adminFor || [];
    DAY = C.today();
    Promise.all([db().collection('sites').get(), db().collection('bookingSettings').get().catch(function () { return { docs: [] }; }),
      db().collection('kidsSettings').get().catch(function () { return { docs: [] }; }),
      db().collection('kidsGroups').where('leaderIds', 'array-contains', mid).get().catch(function () { return { docs: [] }; }),
      db().collection('events').where('date', '==', K.morningDay()).get().catch(function () { return { docs: [] }; })]).then(function (r) {
      var bs = {}, ks = {}; all(r[1]).forEach(function (x) { bs[x.id] = x; }); all(r[2]).forEach(function (x) { ks[x.id] = x; });
      var mine = all(r[3]);
      var rotaSL = r[4].docs.some(function (d) { var a = (d.data().assignments || {})['Session Leader']; return a && !Array.isArray(a) && a.id === mid; });
      var sites = all(r[0]).filter(function (s) { return s.active !== false && (ks[s.id] || {}).teams && ks[s.id].teams.length; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      return Promise.all(sites.map(function (s) {
        return db().collection('kidsMornings').doc(s.id + '_' + K.morningDay()).get().then(function (m) { return m.exists ? m.data() : null; }, function () { return null; });
      })).then(function (ms) {
        /* The first site where this person has a part to play. */
        for (var i = 0; i < sites.length; i++) {
          var s = sites[i], m = ms[i], open = m && m.expiresAt && m.expiresAt.toMillis() > Date.now();
          var sg = (bs[s.id] || {}).safeguardingLead === mid || (bs[s.id] || {}).safeguardingDeputy === mid;
          var lead = !!(p.masterAdmin || sg || ((ks[s.id] || {}).teams || []).some(function (t) { return adminFor.indexOf(t) >= 0; }));
          var groupsHere = mine.filter(function (g) { return g.siteId === s.id; }).map(function (g) { return g.id; });
          var session = !!(open && (m.sessionLeaderIds || []).indexOf(mid) >= 0);
          var rollAll = !!(open && (session || (m.leaderIds || []).indexOf(mid) >= 0));
          if (lead || groupsHere.length || rollAll || rotaSL) {
            S = { site: s.id, siteName: s.name, lead: lead, myGroups: groupsHere, session: session, rollAll: rollAll, rotaSL: rotaSL, morning: m, settings: ks[s.id] || {} };
            break;
          }
        }
        if (!S.site) { LOADED = true; redraw(); return; }
        /* The rota's Session Leader, first in before any lead: they open the
           morning (Martin, F-098; the rules check the rota), as Sunday
           check-in does. */
        if (S.rotaSL && !S.session && !S.lead) return openMorning(r[4]).then(loadSite);
        return loadSite();
      });
    }).catch(function () { LOADED = true; redraw(); });
  }
  function openMorning(rotaSnap) {
    var mid = me().memberId || '-', mday = K.morningDay(), wd = new Date().getDay() || 7;
    return db().collection('kidsGroups').where('siteId', '==', S.site).get().then(function (g) {
      var meeting = all(g).filter(function (x) { return x.active !== false && (x.day || 7) === wd; });
      if (!meeting.length) return;
      var rotaId = ''; rotaSnap.docs.forEach(function (d) { var a = (d.data().assignments || {})['Session Leader']; if (!rotaId && a && !Array.isArray(a) && a.id === mid) rotaId = d.id; });
      var ids = {}; meeting.forEach(function (x) { (x.leaderIds || []).forEach(function (m) { ids[m] = 1; }); });
      var end = new Date(); end.setHours(23, 59, 0, 0);
      var d = { siteId: S.site, day: mday, rotaId: rotaId, leaderIds: Object.keys(ids).slice(0, 60), sessionLeaderIds: [mid],
        expiresAt: firebase.firestore.Timestamp.fromDate(new Date(Math.min(end.getTime(), Date.now() + 17 * 3600000))), updatedAt: new Date().toISOString(), updatedBy: uid() };
      return db().collection('kidsMornings').doc(S.site + '_' + mday).set(d).then(function () { S.morning = d; S.session = true; S.rollAll = true; });
    }).catch(function () {});
  }
  function listen(q, onDocs) {
    UNSUB.push(q.onSnapshot(function (snap) { onDocs(snap); redraw(); }, function () {}));
  }
  function loadSite() {
    var site = S.site;
    var kids = S.lead ? db().collection('kidsChildren').where('siteId', '==', site).get().then(all)
      : !S.myGroups.length ? Promise.resolve([])
      : Promise.all(S.myGroups.map(function (g) { return db().collection('kidsChildren').where('groupId', '==', g).get().then(all); })).then(function (l) { return [].concat.apply([], l); });
    return Promise.all([db().collection('kidsGroups').where('siteId', '==', site).get(), kids.catch(function () { return []; }),
      db().collection('kidsLeaderIns').doc(site + '_' + DAY + '_' + (me().memberId || '-')).get().catch(function () { return null; })]).then(function (r) {
      D.groups = all(r[0]).filter(function (g) { return g.active !== false; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      D.children = r[1].filter(function (c) { return c.status !== 'left'; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      D.mine = r[2] && r[2].exists ? r[2].data() : null;
      /* Today's check-ins, live: the site for the leads, each group for its leaders. */
      var put = function (map) { return function (snap) { snap.docChanges().forEach(function (ch) { if (ch.type === 'removed') delete map[ch.doc.id]; else map[ch.doc.id] = Object.assign({ id: ch.doc.id }, ch.doc.data()); }); }; };
      if (S.lead) listen(db().collection('checkins').where('siteId', '==', site).where('day', '==', DAY), put(D.cks));
      else S.myGroups.forEach(function (g) { listen(db().collection('checkins').where('groupId', '==', g).where('day', '==', DAY), put(D.cks)); });
      if (S.lead || S.rollAll) {
        listen(db().collection('kidsRoll').where('siteId', '==', site).where('day', '==', DAY), put(D.roll));
        listen(db().collection('kidsLeaderIns').where('siteId', '==', site).where('day', '==', DAY), put(D.leaders));
      }
      listen(db().collection('screenPages').where('siteId', '==', site).where('clearedAt', '==', null), put(D.pages));
      LOADED = true; redraw();
    });
  }
  /* A child's medical details, read when needed (the rules decide). */
  function medOf(id) {
    if (D.med[id] !== undefined) return D.med[id];
    D.med[id] = null;
    db().collection('kidsMedical').doc(id).get().then(function (s) { D.med[id] = s.exists ? s.data() : {}; redraw(); }, function () { D.med[id] = { refused: true }; redraw(); });
    return null;
  }
  function medText(m) {
    if (!m) return 'Loading…';
    if (m.refused) return 'Ask the group\'s leader';
    return [m.allergies && K.meaningful(m.allergies) ? m.allergies : '', m.medical && K.meaningful(m.medical) ? m.medical : '',
      m.medication && K.meaningful(m.medication) ? 'Medication: ' + m.medication : '', m.needs && K.meaningful(m.needs) ? m.needs : ''].filter(Boolean).join(' · ') || 'Nothing written down';
  }

  /* ---------------- actions (data-kact) ---------------- */
  function act(a, btn) {
    var p = me(), mid = p.memberId || '-';
    if (a === 'in' || a === 'out') {
      btn.disabled = true;
      var ref = db().collection('kidsLeaderIns').doc(S.site + '_' + DAY + '_' + mid), now = firebase.firestore.FieldValue.serverTimestamp();
      var d = a === 'in' ? { siteId: S.site, day: DAY, memberId: mid, name: p.name || '', groupId: S.myGroups[0] || '', state: 'in', inAt: now, outAt: null }
        : Object.assign({}, D.mine, { state: 'out', outAt: now });
      (a === 'in' && D.mine ? ref.update({ state: 'in', inAt: now }) : ref.set(d)).then(function () { return ref.get(); }).then(function (s) { D.mine = s.data(); redraw(); })
        .catch(function () { btn.disabled = false; global.alert('Could not: please try again.'); });
      return;
    }
    if (a.indexOf('screen:') === 0) {
      var c = child(a.slice(7)), ck = ckOf(c), g = group(c && c.groupId);
      if (!ck || !g) return;
      btn.disabled = true;
      db().collection('screenPages').doc(ck.id).set({ siteId: ck.siteId, code: ck.pickupCode, room: g.name.slice(0, 80), message: ck.pickupCode + ', please come to ' + g.name,
        createdBy: uid(), createdAt: firebase.firestore.FieldValue.serverTimestamp(), clearedAt: null }).catch(function () { btn.disabled = false; global.alert('Could not show it on the screen.'); });
      return;
    }
    if (a.indexOf('done:') === 0) {
      btn.disabled = true;
      db().collection('screenPages').doc(a.slice(5)).update({ clearedAt: firebase.firestore.FieldValue.serverTimestamp() }).catch(function () { btn.disabled = false; });
    }
  }
  function wire() {
    if (wire.done) return; wire.done = true;
    global.document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-kact]');
      if (b) { e.preventDefault(); act(b.getAttribute('data-kact'), b); }
    });
  }

  /* ---------------- the screens ---------------- */
  function btn(kact, label, primary, extra) {
    return '<button class="btn' + (primary ? ' primary' : '') + '" data-kact="' + esc(kact) + '"' + (extra || '') + ' style="min-height:48px">' + label + '</button>';
  }
  function head(title, sub) { return '<div><p class="hello">' + esc(title) + '</p><p class="sub">' + esc(sub) + '</p></div>'; }
  function role() {
    if (S.lead) return 'you are a lead';
    if (S.session) return 'you are session leader';
    if (S.myGroups.length) return 'you lead ' + S.myGroups.map(function (g) { return (group(g) || {}).name || ''; }).filter(Boolean).join(' and ');
    return 'you are leading this morning';
  }
  function dayText() { return E.fmtDate(DAY + 'T12:00'); }

  function today() {
    start();
    if (!LOADED) return head('Kids Church today', 'Loading…');
    if (!S.site) return head('Kids Church today', 'For the children\'s team') + '<div class="card" data-k="none"><p>This is for the children\'s team leads, each group\'s leaders and the Session Leader on the rota. If you lead a children\'s group, ask a lead to add you to it.</p></div>';
    var vis = visibleGroups().map(function (g) { return g.id; });
    var ins = inNow().filter(function (x) { return S.lead || S.rollAll || vis.indexOf(x.groupId) >= 0; });
    var expected = D.children.filter(function (c) { return vis.indexOf(c.groupId) >= 0; });
    var notYet = expected.filter(function (c) { return !ckOf(c); }).length;
    var leadersIn = Object.keys(D.leaders).map(function (k) { return D.leaders[k]; }).filter(function (l) { return l.state === 'in'; });
    var meIn = D.mine && D.mine.state === 'in';
    var out = head('Kids Church today', dayText() + ' · ' + role());
    out += '<div class="card" data-k="counts" style="padding:14px;display:grid;grid-template-columns:repeat(3,1fr);text-align:center;gap:6px">' +
      '<div><b style="font-size:22px;display:block" data-k="in">' + ins.length + '</b><small>in</small></div>' +
      '<div><b style="font-size:22px;display:block" data-k="due">' + (S.lead || S.myGroups.length ? notYet : '–') + '</b><small>not arrived</small></div>' +
      '<div><b style="font-size:22px;display:block" data-k="leaders">' + (S.lead || S.rollAll ? leadersIn.length : (meIn ? 1 : 0)) + '</b><small>leaders</small></div></div>';
    /* Leaders check themselves in. */
    out += '<div class="card" data-k="me" style="padding:14px">' + (meIn
      ? '<p style="margin:0 0 8px">You checked in at <b>' + esc(time(D.mine.inAt)) + '</b>.</p>' + btn('out', 'Check myself out')
      : '<p style="margin:0 0 8px">Leading this morning? Check yourself in, so the fire roll-call counts you.</p>' + btn('in', 'Check myself in', true)) + '</div>';
    /* Needs in the room. */
    var needs = ins.map(function (x) { return { x: x, c: child(x.childId) }; }).filter(function (o) { return !o.c || (o.c.flags && (o.c.flags.allergies || o.c.flags.medical)); });
    var needRows = needs.map(function (o) {
      var m = medOf(o.x.childId), g = group(o.x.groupId);
      /* No child record (the Session Leader): shown only when something is written down. */
      if (!o.c && m && (m.refused || medText(m) === 'Nothing written down')) return '';
      var allergy = o.c ? !!(o.c.flags && o.c.flags.allergies) : !!(m && m.allergies && K.meaningful(m.allergies));
      return H.row(allergy ? 'triangle-alert' : 'heart-pulse', o.x.name + ' · ' + ((g && g.name) || o.x.groupName || ''), medText(m),
        '<span class="pill warn">' + (allergy ? 'Allergy' : 'Medical') + '</span>', WARN);
    }).filter(Boolean);
    out += H.sec('Needs in the room', needRows.length ? '<div class="card list" data-k="needs">' + needRows.join('') + '</div>' : '<p class="sub" data-k="needs">No allergies or medical needs among the children in now.</p>');
    /* Call a parent. */
    var pages = Object.keys(D.pages).map(function (k) { return D.pages[k]; });
    var mayPage = ins.filter(function (x) { return x.ck; });
    var callRows = mayPage.map(function (x) {
      var c = child(x.childId), g = group(x.groupId), on = pages.filter(function (p) { return p.id === x.ck.id; })[0];
      return '<div class="card" data-call="' + esc(x.childId) + '" style="padding:12px;margin:6px 0"><b>' + esc(x.name) + '</b> <small>' + esc(g ? g.name : '') + '</small>' +
        (on ? '<p style="margin:6px 0" data-k="onscreen"><b>On the screen now:</b> ' + esc(on.message) + '</p><div class="actions">' + btn('done:' + on.id, 'Done: the parent is here', true) + '</div>'
            : '<div class="actions">' + btn('screen:' + x.childId, H.ic('monitor', 15) + ' Show on screen', true) +
              (c && c.phone ? '<a class="btn" style="min-height:48px;text-decoration:none;display:inline-flex;align-items:center;gap:6px" href="tel:' + esc(tel(c.phone)) + '">' + H.ic('phone', 15) + ' Ring</a>' : '') + '</div>') + '</div>';
    });
    out += H.sec('Call a parent', canPage()
      ? '<p class="sub" style="margin:0 0 6px">Shows the family\'s code on the screen in church. Never the child\'s name.</p>' + (callRows.length ? callRows.join('') : '<p class="sub">Nobody is in yet.</p>')
      : '<p class="sub">Group leaders and the leads call a parent from here.</p>');
    out += '<div class="actions" data-k="tools">' + (S.lead ? '<a class="btn" style="min-height:48px;text-decoration:none;display:inline-flex;align-items:center;gap:6px" href="kids-checkin.html?tab=desk">' + H.ic('scan-line', 15) + ' Check-in desk</a>' : '') +
      '<a class="btn" style="min-height:48px;text-decoration:none;display:inline-flex;align-items:center;gap:6px" href="kids-checkin.html?tab=roll">' + H.ic('flame', 15) + ' Fire roll-call</a></div>';
    return out;
  }

  function children() {
    start();
    if (!LOADED) return head('Children', 'Loading…');
    if (!S.site) return head('Children', 'For the children\'s team') + '<div class="card"><p>Each group\'s leaders see their own group here.</p></div>';
    var gs = visibleGroups();
    if (!S.lead && !S.myGroups.length) {
      /* That morning's Session Leader: who is in, by group, from the roll-call. */
      var ins = inNow();
      return head('Children', dayText() + ' · in now') + (ins.length ? gs.map(function (g) {
        var l = ins.filter(function (x) { return x.groupId === g.id; });
        return l.length ? H.sec(g.name, '<div class="card list">' + l.map(function (x) { return H.row('baby', x.name, 'in at ' + time(x.inAt), '<span class="pill">In</span>', KIDS); }).join('') + '</div>') : '';
      }).join('') : '<p class="sub">Nobody is in yet.</p>') + '<p class="example">Each group\'s leaders see their own children\'s details.</p>';
    }
    var out = head('Children', S.lead ? 'Every group' : gs.length === 1 ? gs[0].name + ' · your group' : 'Your groups');
    gs.forEach(function (g) {
      var kids = D.children.filter(function (c) { return c.groupId === g.id; });
      out += H.sec(g.name, kids.length ? '<div class="card list" data-kgroup="' + esc(g.id) + '">' + kids.map(function (c) {
        var ck = ckOf(c), st = K.consentState(c, DAY);
        var where = ck ? (ck.state === 'in' ? 'in at ' + time(ck.inAt) : 'went home ' + time(ck.outAt) + (ck.collectedBy ? ' with ' + ck.collectedBy : '')) : 'not arrived';
        var pill = st === 'out' ? '<span class="pill warn" data-consent="out">Consent ran out</span>' : st === 'renew' ? '<span class="pill warn" data-consent="renew">Renew</span>'
          : ck && ck.state === 'in' ? '<span class="pill">In</span>' : ck ? '<span class="pill">Home</span>' : '<span class="pill n">Due</span>';
        return '<div data-kid="' + esc(c.id) + '">' + H.row('baby', c.name, (c.year ? c.year + ' · ' : '') + where + ((c.collectors || []).length ? ' · collect: ' + c.collectors.join(', ') : ''), pill, KIDS) + '</div>';
      }).join('') + '</div>' : '<p class="sub">No children in this group yet.</p>');
    });
    return out + '<p class="example">Leaders see only their own group. Medical details stay private. "Renew": their consent runs out within a month; the registration form is sent from the Children\'s register.</p>';
  }

  global.EGBCAppKids = {
    /* The shell (egbc-app.js) calls this once: EGBCAppKids.mount(EGBCApp). */
    mount: function (App) {
      H = global.EGBCAppEvents.helpers(App, 'kids'); wire();
      App.screen('kids', 'today', today);
      App.screen('kids', 'children', children);
    },
    _state: function () { return { S: S, loaded: LOADED }; }
  };
})(window);
