/* ===================================================================
   EGBC — A NEW CHURCH'S SETUP: the steps, and the bar on each step's page
   (the setup frame; FINDINGS-churchhq "The setup frame")
   ===================================================================

   Church HQ adds the church and its first master admin
   (tools/hq-create-church.mjs). Everything else is done here, on the
   church's own screens: setup.html lists the steps below, each opens an
   ordinary page of the hub with ?setup=1, and that page shows a bar -
   which step this is, back to the list, and the next step. A step's page
   needs nothing of its own for this: egbc-auth.js loads this file when
   the address says setup=1.

   THE PAGES ARE THE CHURCH'S OWN: they read and write through EGBCAuth.db,
   which on a church's page is that church's data (?church=<id>, H-6).

   ONE ENTRY PER STEP, kept by the window that owns its page (each may
   change its own entries here, as with stamps):
     id      short, never changes
     title   what the church sees
     why     one line: what it is for
     page    the page that does it ('' while it is being built)
     owner   'main' | 'events' | 'comms'
     optional  a church may leave it
     done(db)  Promise<boolean>: whether the church has done it, from its
               own data (never a tick somebody sets)

   EGBCSetup.STEPS, EGBCSetup.status(db) -> Promise [{ step, done }],
   EGBCSetup.bar() draws the bar on a step's page.
   =================================================================== */
(function (global) {
  'use strict';

  var get = function (db, c, d) { return db.collection(c).doc(d).get().then(function (s) { return s.exists ? (s.data() || {}) : null; }, function () { return null; }); };
  var any = function (db, c, test) {
    return db.collection(c).limit(20).get().then(function (s) {
      return s.docs.some(function (d) { return !test || test(d.data() || {}, d.id); });
    }, function () { return false; });
  };

  var STEPS = [
    { id: 'church', owner: 'comms', title: 'Your church', page: '',
      why: 'Its name, logo, address and the words it uses (members, the main service day)',
      done: function (db) { return get(db, 'churchSettings', 'details').then(function (d) { return !!(d && d.name); }); } },
    { id: 'buildings', owner: 'events', title: 'Your buildings', page: '',
      why: 'Each building and its rooms, and who looks after its safety',
      done: function (db) { return any(db, 'sites', function (s) { return s.active !== false; }); } },
    { id: 'teams', owner: 'main', title: 'Your teams', page: 'teams-admin.html',
      why: 'The teams and groups people belong to, and which jobs each one does',
      done: function (db) {
        return Promise.all([any(db, 'teams', function (t) { return t.archived !== true; }), get(db, 'churchSettings', 'teamJobs')])
          .then(function (r) { return r[0] && !!r[1]; });
      } },
    { id: 'services', owner: 'main', title: 'Your services', page: 'services-settings.html',
      why: 'The kinds of service and meeting, and the roles a service names',
      done: function (db) { return get(db, 'churchSettings', 'services').then(function (d) { return !!d; }); } },
    { id: 'people', owner: 'main', title: 'Your people', page: 'addressbook.html',
      why: 'The address book: everyone the hub knows, and the teams they are on',
      done: function (db) { return db.collection('addressBook').limit(2).get().then(function (s) { return s.size > 1; }, function () { return false; }); } },
    { id: 'care', owner: 'main', title: 'Who gets told', page: 'church-settings.html',
      why: 'Who reads requests for care, pastoral concerns and prayer requests',
      done: function (db) { return get(db, 'careRouting', 'main').then(function (d) { return !!d; }); } },
    { id: 'safeguarding', owner: 'events', title: 'Safeguarding', page: 'safeguarding-settings.html',
      why: 'The safeguarding lead and deputy, how long checks last, and the ratios',
      done: function (db) { return get(db, 'safeguardingSettings', 'defaults').then(function (d) { return !!(d && d.leadSiteId); }); } },
    { id: 'data', owner: 'events', title: 'Data protection', page: 'data-records.html',
      why: 'Your data protection lead, and the record of what the church holds',
      done: function (db) { return get(db, 'dataSettings', 'main').then(function (d) { return !!(d && (d.leads || []).length); }); } },
    { id: 'pastoral', owner: 'main', title: 'Pastoral visitors', page: 'pastoral-visits.html', optional: true,
      why: 'The trained people who record pastoral visits',
      done: function (db) { return get(db, 'pastoralSettings', 'main').then(function (d) { return !!(d && (d.visitorIds || []).length); }); } }
  ];

  function status(db) {
    return Promise.all(STEPS.map(function (s) {
      return Promise.resolve(s.done(db)).then(function (d) { return { step: s, done: !!d }; }, function () { return { step: s, done: false }; });
    }));
  }

  function link(page) {
    var A = global.EGBCAuth, u = page + (page.indexOf('?') === -1 ? '?' : '&') + 'setup=1';
    return A && A.churchLink ? A.churchLink(u) : u;
  }

  /* The bar along the foot of a step's page. */
  function bar() {
    var here = location.pathname.split('/').pop().toLowerCase();
    var live = STEPS.filter(function (s) { return s.page; });
    var i = -1;
    live.forEach(function (s, n) { if (s.page.toLowerCase() === here) i = n; });
    if (document.getElementById('egbc-setup-bar')) return;
    var next = i >= 0 ? live[i + 1] : null;
    var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
    var el = document.createElement('div');
    el.id = 'egbc-setup-bar';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Setting up');
    el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:1500;background:#3d6263;color:#fff;font:500 14px Inter,system-ui,sans-serif;'
      + 'padding:10px 16px calc(10px + env(safe-area-inset-bottom));display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;box-shadow:0 -2px 8px rgba(0,0,0,.15)';
    var a = 'color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.5);border-radius:8px;padding:0 14px;min-height:40px;display:inline-flex;align-items:center';
    el.innerHTML = '<span>Setting up' + (i >= 0 ? ': step ' + (STEPS.indexOf(live[i]) + 1) + ' of ' + STEPS.length + ', ' + esc(live[i].title) : '') + '</span>'
      + '<span style="display:flex;gap:8px;flex-wrap:wrap"><a style="' + a + '" href="' + esc(link('setup.html').replace(/[?&]setup=1/, '')) + '">All the steps</a>'
      + (next ? '<a style="' + a + ';background:#fff;color:#3d6263" href="' + esc(link(next.page)) + '">Next: ' + esc(next.title) + '</a>' : '') + '</span>';
    document.body.appendChild(el);
    document.body.style.paddingBottom = (el.offsetHeight + 8) + 'px';
  }

  global.EGBCSetup = { STEPS: STEPS, status: status, link: link, bar: bar };
})(typeof window !== 'undefined' ? window : globalThis);
