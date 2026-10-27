/* ===================================================================
   EGBC Suite — shared authentication and access control
   ===================================================================

   Include on every protected page, BEFORE your page script:

     <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
     <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
     <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
     <script src="egbc-auth.js"></script>

   Then gate the page:

     EGBCAuth.require({ team: 'kids' }).then(user => {
       // user.teams, user.roles, user.memberId, user.name
       startPage();
     });

   Or for a page anyone signed in may see:

     EGBCAuth.require().then(startPage);

   IMPORTANT: this hides things in the browser. It is convenience, not
   security. Firestore and Storage rules are what actually protect data,
   and they must check the same conditions independently.
   =================================================================== */

(function (global) {
  'use strict';

  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyCl2enA5LPKrHcxYP1K64c1ZNK744RO9R4",
    /* On Church HQ's own address (egbc.churchhq.co.uk, 26 Oct 2026) sign-in
       runs through that address: the Worker (tools/cloudflare/) passes
       /__/auth/ on to firebaseapp.com, so Google's sign-in by redirect
       keeps working in browsers that block another site's storage.
       Everywhere else - github.io, localhost - exactly as before. */
    authDomain: /\.churchhq\.co\.uk$/i.test(location.hostname) ? location.host : "egbc-worship-planner.firebaseapp.com",
    projectId: "egbc-worship-planner",
    storageBucket: "egbc-worship-planner.firebasestorage.app",
    appId: "1:199442060489:web:7eaf85a76334c753db6918"
  };

  var LOGIN_PAGE = 'login.html';
  var HUB_PAGE = 'hub.html';

  /* Our own named app, never the default one.

     Several pages build their own Firebase with the modular SDK and call
     initializeApp themselves - SundayServicePlanner.html uses 10.7.1 with a
     three-key config, this file uses 10.12.2 compat with five. Compat scripts
     in the head always run before a page's module, whatever order they sit
     in, so taking the default app name meant the page then called
     initializeApp on an app that already existed with different options.
     Firebase throws app/duplicate-app for that, the module dies on its first
     line, and the page renders with none of its data - no speaker, no rota,
     no error anyone would notice.

     Keeping to our own app leaves every page's default app exactly as it was
     before the guard existed. */
  var APP_NAME = 'egbc';

  function ownApp() {
    for (var i = 0; i < firebase.apps.length; i++) {
      if (firebase.apps[i].name === APP_NAME) return firebase.apps[i];
    }
    return firebase.initializeApp(FIREBASE_CONFIG, APP_NAME);
  }

  var app = ownApp();
  var auth = firebase.auth(app);

  /* WHICH CHURCH (FINDINGS-churchhq H-6 step 2; the setup frame). A page is
     for one church's data, churches/{cid}/..., when a church is chosen:
     ?church=<id> chooses it (and is remembered on this device), and
     ?church=egbc forgets it. With none - EGBC, and every page today - the
     data is the top level, exactly as before. The sign-in must carry the
     church (its `churches` claim, functions/hq-directory.js): checked once
     signed in, and a church that is not the person's is forgotten. Until
     the address decides it (<church>.churchhq.co.uk, H-6 (a)). */
  var CHURCH = (function () {
    var ok = function (v) { return /^[a-z0-9][a-z0-9-]{1,40}$/.test(String(v || '')) && v !== 'egbc'; };
    var asked = null;
    try { asked = new URLSearchParams(location.search).get('church'); } catch (e) {}
    try {
      if (asked === 'egbc' || asked === '') { localStorage.removeItem('egbc-church'); return ''; }
      if (ok(asked)) { localStorage.setItem('egbc-church', asked); return asked; }
      var kept = localStorage.getItem('egbc-church');
      return ok(kept) ? kept : '';
    } catch (e) { return ok(asked) ? asked : ''; }
  })();
  /* A db that stays inside the church: the same .collection(), .doc(),
     .batch() and .runTransaction() as Firestore's, as the server's scopedDb
     (functions/church-scope.js). Batches and transactions take references,
     which already carry the church. */
  function scopedDb(raw, cid) {
    var root = raw.collection('churches').doc(cid);
    return {
      churchId: cid, raw: raw, app: raw.app,
      collection: function (name) { return root.collection(name); },
      doc: function (p) { return raw.doc('churches/' + cid + '/' + String(p).replace(/^\/+/, '')); },
      batch: function () { return raw.batch(); },
      runTransaction: function (fn) { return raw.runTransaction(fn); },
      collectionGroup: function () { throw new Error('A collection group reaches every church: use the church\'s own collection.'); },
      enablePersistence: function () { return Promise.resolve(); },
      settings: function () {}
    };
  }
  var rawDb = firebase.firestore(app);
  var db = CHURCH ? scopedDb(rawDb, CHURCH) : rawDb;

  /* The hub's functions. Called over plain fetch with the ID token rather
     than through firebase-functions-compat, because that would be a fourth
     script tag on sixty-odd pages for one call. A callable's HTTP interface
     is simple enough: POST { data: {...} }, and the answer comes back as
     { result: {...} } or { error: {...} }. */
  var FUNCTIONS_REGION = 'europe-west2';
  var FUNCTIONS_BASE = 'https://' + FUNCTIONS_REGION + '-' + FIREBASE_CONFIG.projectId + '.cloudfunctions.net';

  /* A FUNCTION THAT IS NOT THERE MUST NOT HANG THE PAGE. fetch waits for
     ever by default, and "for ever" is what the events window saw: their
     emulators have no functions emulator, so the call went to a port nobody
     was listening on and addressbook.html never finished loading (F-118).
     Eight seconds is longer than a cold start and shorter than a person's
     patience. */
  var CALL_TIMEOUT_MS = 8000;

  function callFunction(name, data, timeoutMs) {
    return auth.currentUser.getIdToken().then(function (idToken) {
      var stop = null;
      var opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        /* A church's page says which church (the server checks it against
           the sign-in, functions/church-scope.js). */
        body: JSON.stringify({ data: CHURCH && !(data && data.churchId) ? Object.assign({ churchId: CHURCH }, data || {}) : (data || {}) })
      };
      /* AbortController is everywhere we support, but a page that cannot
         abort should still send rather than refuse to work. */
      if (typeof AbortController !== 'undefined') {
        var ac = new AbortController();
        opts.signal = ac.signal;
        stop = setTimeout(function () { ac.abort(); }, timeoutMs || CALL_TIMEOUT_MS);
      }
      return fetch(FUNCTIONS_BASE + '/' + name, opts).then(function (r) {
        if (stop) clearTimeout(stop);
        return r;
      }, function (e) {
        if (stop) clearTimeout(stop);
        throw e;
      });
    }).then(function (r) {
      return r.json();
    }).then(function (body) {
      if (body && body.error) {
        var e = new Error((body.error && body.error.message) || 'refused');
        /* THE REASON, NOT JUST THE WORDS. A callable's refusal carries a
           status - FAILED_PRECONDITION, PERMISSION_DENIED - and this threw
           it away, so every caller could only say "that did not work".
           Carried across in the shape the Firebase SDK uses, which is what
           hub-app.js's calendarProblem() already reads, so one function can
           read either. The message is untouched: nothing that catches this
           today behaves differently. */
        if (body.error.status) {
          e.code = String(body.error.status).toLowerCase().replace(/_/g, '-');
        }
        throw e;
      }
      return (body && body.result) || {};
    });
  }

  /* Local rules testing. Only ever fires when the pages are served from
     localhost, so this is inert on GitHub Pages and safe to ship.
     See EMULATOR.md. */
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    try {
      /* 8181, not 8080: firebase.json moved the Firestore emulator off 8080
         because the monitor bridge sits there, and this line stayed behind -
         so every page served from localhost was pointed at the wrong port and
         silently failed to reach the emulator. The test harness already reads
         the port out of firebase.json; a page cannot, so the number is here. */
      /* A page served from localhost:5601 belongs to the events window,
         which runs its own emulators (firebase.events.json) so its test data
         never meets the main window's. Every other localhost port keeps
         8181 / 9099 / 9199 exactly as before. Same rule in egbc-db.js. */
      var EMU = location.port === '5601'
        ? { firestore: 8182, auth: 9098, storage: 9198 }
        : { firestore: 8181, auth: 9099, storage: 9199 };
      db.useEmulator('localhost', EMU.firestore);
      /* disableWarnings: the Firebase SDK pins a red "Running in emulator
         mode" bar to the bottom of the page. It is the SDK's own, it only
         ever appears against the emulator, and it is never on a real
         phone - but it sits on top of the app's tab bar in every
         screenshot, which §7e says nothing may. Off here so a picture
         shows the app rather than the SDK's warning. */
      auth.useEmulator('http://localhost:' + EMU.auth, { disableWarnings: true });
      /* Storage was missing from this list, so every upload made from a
         page served on localhost went to the LIVE bucket - the knowledge
         base videos, the team shelf, banners, and now event pictures.
         Firestore and Auth were pointed at the emulator and Storage was
         not, which is the worst of both: development looks local and the
         files are not.
         Guarded, because not every page loads the storage SDK; where it is
         absent there is nothing to point anywhere. */
      if (firebase.storage) firebase.storage(app).useEmulator('localhost', EMU.storage);
      FUNCTIONS_BASE = 'http://localhost:' + (location.port === '5601' ? 5102 : 5101)
                     + '/' + FIREBASE_CONFIG.projectId + '/' + FUNCTIONS_REGION;
      console.info('EGBCAuth: using local emulators');
    } catch (e) {
      console.warn('EGBCAuth: emulator not available', e.message);
    }
  }

  var currentUser = null;
  var currentProfile = null;

  /* ---- Teams -------------------------------------------------------
     Adding a team here makes it available everywhere: the hub filter,
     the admin screen, and the page registry.                          */

  /* ---- Teams -------------------------------------------------------
     These MUST match the values already stored in addressBook.markers
     and events.teams. Planner, CoreTeamApp, EmailBuilder2, the Sunday
     Service Planner and view-only-rota all match on these exact strings.
     Changing one here without changing it there breaks the rota.

     "Kids Church", "Lazers" and "ReNu" are the new values.

     A team with a `parent` is still a real marker - view-only-rota.html
     filters on markers.includes('Choir') - but it gets no tab of its own in
     the hub. Its members see the parent team's pages instead.

     Core Team is a team like any other - it has its own charter, its own
     pages and its own tab. Administrator rights are a separate thing
     entirely, set by `adminFor` and `masterAdmin` on the address book
     record, so being on Core Team does not by itself grant them.            */

  /* `under18` — WORKS WITH UNDER-18s (NEXT-BRIEF §24, Martin, 10 Oct 2026).
     Nobody goes on a ticked team's rota slot without an in-date DBS check
     and safeguarding training, or an exception recorded with a reason.

     THE RULES CANNOT READ THIS FILE, so firestore.rules carries the same
     five names in under18Teams(). Two copies of one truth is how a gate
     quietly stops covering a team, so tests/check-under18-teams-agree.mjs
     reads both and fails if they ever differ. Add a team in one place and
     that check tells you about the other.

     CRECHE IS NOT A TEAM. Martin's list names it, but the address book
     holds it as roles inside Kids Church - "Leader (Creche)" and "Assistant
     (Creche)" - so ticking Kids Church already covers every creche worker.
     Nothing was invented to match the list. */
  var TEAMS = {
    /* board: the pin board the team shares (worshipBoardState/<board>;
       Teams & groups, "Pin board"). EGBC's grouping: Worship, AV and Choir
       share one; the others have their own. */
    'Worship Team':  { label: 'Worship',      colour: '#3d6263', board: 'state' },
    'AV Team':       { label: 'AV',           colour: '#4a5f7a', board: 'state' },
    'Choir':         { label: 'Choir',        colour: '#7a4a5f', parent: 'Worship Team', board: 'state' },
    'Youth Worship': { label: 'Youth',        colour: '#5f7a4a', under18: true, board: 'youth' },
    'Kids Church':   { label: 'Kids Church',  colour: '#7a5f4a', under18: true, board: 'kids-church' },
    'Lazers':        { label: 'Lazers',       colour: '#8a4a3d', under18: true, board: 'lazers' },
    'ReNu':          { label: 'ReNu',         colour: '#3d6b5f', under18: true, board: 'renu' },
    /* CORE TEAMS COVER CHOSEN TEAMS (FINDINGS-churchhq H-15, Martin, 26 Oct
       2026: "a kids church and youth core team and a worship core team.
       They need to be independent"). Being on one counts as being on the
       teams in its coreFor, and nothing else; its leaders and admins lead
       and administer those teams. A core team covering an under-18s team
       works with under-18s itself (Martin's answer 1). Core Team keeps its
       id; it is the WORSHIP core team. */
    'Core Team':     { label: 'Worship Core Team', colour: '#6b4a7a', coreFor: ['Worship Team', 'AV Team', 'Choir'], board: 'core-team' },
    'Kids & Youth Core Team': { label: 'Kids & Youth Core Team', colour: '#7a6b4a', under18: true,
                       coreFor: ['Kids Church', 'Lazers', 'ReNu', 'Youth Worship'] },
    /* A3, for the events window: the people who fix things. The colour is
       the one the approved app mock-up uses for the Maintenance space
       (--maint), so the hub and the app agree about it. */
    'Maintenance':   { label: 'Maintenance',  colour: '#4f5a66' }
  };

  /* ---- Teams as data (APP-A1 §4, steps 1-2) -------------------------

     The office manages teams and groups in a `teams` collection, keyed by
     the team's NAME exactly as the rules spell it. The table above stays as
     the FALLBACK, for the moment before the read lands and for a page
     opened with no connection - a page that cannot draw its own team's
     colour is worse than one drawing last week's.

     A GROUP IS A TEAM WITH rota: false (NEXT-BRIEF §25): Church office,
     Bookings, Elders, Finance. It has no rota and no space of its own; what
     it carries is `runs`, the Running things tabs its members see.

     ONE READ, CACHED. Every page loads this file, and a second read per
     page would be sixty reads a visit for a list that changes twice a year.

     WHAT THIS DOES NOT DO: it never grants anything. A team appearing here
     gives nobody access - `markers` on an address book record is still the
     only switch, and firestore.rules never reads this collection. */
  var teamsLoaded = false;
  var teamsPromise = null;

  /* "EVERYONE" (Martin, 15 Oct 2026): what a church member on no team sees.
     A Home choice for everybody, and a "View the site as" choice. Not a team:
     nobody is ever ticked into it. */
  var EVERYONE = '__everyone';
  function vaEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Teams to offer as a choice, in the church's order (teams/{id}.order,
     then the label): no sub-teams, nothing archived. */
  function teamChoices(ids) {
    return ids.filter(function (t) { return TEAMS[t] && !TEAMS[t].parent && !TEAMS[t].archived; })
      .sort(function (a, b) {
        var oa = typeof TEAMS[a].order === 'number' ? TEAMS[a].order : 999, ob = typeof TEAMS[b].order === 'number' ? TEAMS[b].order : 999;
        return oa - ob || String(TEAMS[a].label || a).localeCompare(String(TEAMS[b].label || b));
      });
  }

  function mergeTeam(id, d) {
    var base = TEAMS[id] || {};
    TEAMS[id] = {
      label:    d.label || d.name || base.label || id,
      colour:   d.colour || base.colour || '#3d6263',
      tint:     d.tint || base.tint,
      parent:   d.parent || base.parent || undefined,
      rota:     d.rota !== false,
      tabs:     Array.isArray(d.tabs) ? d.tabs : base.tabs,
      runs:     Array.isArray(d.runs) ? d.runs : (base.runs || []),
      under18:  d.under18 === true || base.under18 === true,
      order:    typeof d.order === 'number' ? d.order : base.order,
      archived: d.archived === true,
      /* H-15: the teams this one is the core team for (Teams & groups). */
      coreFor:  Array.isArray(d.coreFor) ? d.coreFor.slice() : (base.coreFor || []),
      /* Its pin board ('' = none; Teams & groups, 26 Oct 2026). */
      board:    typeof d.board === 'string' ? d.board : (base.board || '')
    };
    if (!TEAMS[id].parent) delete TEAMS[id].parent;
    if (!TEAMS[id].coreFor.length) delete TEAMS[id].coreFor;
  }

  /* The teams a set of teams covers as core teams (H-15). Only one step:
     a core team never covers another core team's teams through it. */
  function coversOf(teams) {
    var out = [];
    (teams || []).forEach(function (t) {
      ((TEAMS[t] && TEAMS[t].coreFor) || []).forEach(function (c) { if (out.indexOf(c) === -1 && (teams || []).indexOf(c) === -1) out.push(c); });
    });
    return out;
  }
  /* WHAT A PAGE'S GUARD DECIDES (data-team, data-role, data-admin,
     data-also-team, data-master, data-any-team), for an active person:
     null to let them in, or [title, message] for the "not for you" card.
     require() refuses with it, and guardVerdict() asks it without loading
     the page (the access matrix, H-16), so the two can never disagree. */
  function guardRefusal(opts, profile) {
    /* Pages open to anyone who administers something - the address
       book, for instance, where Karen manages Kids Church and the
       Core Team manage Worship and AV. */
    /* "OR anybody on this team" (opts.alsoTeam). adminAny and
       team are ANDed below, which cannot express "an admin OR
       the Church office" - what the church details page needs
       now the church's bank details live on it. Worked out
       before either refusal, because it waives both. */
    var alsoOk = !!opts.alsoTeam && String(opts.alsoTeam).split(',').some(function (t) {
      return EGBCAuth.inTeam(t.trim());
    });
    /* data-also-job: "...or anybody on a team doing this job" (team jobs,
       H-9; Comms' EmailBuilder2.html by the office job). */
    if (!alsoOk && opts.alsoJob) alsoOk = String(opts.alsoJob).split(',').some(function (j) {
      return EGBCAuth.myJobs().indexOf(j.trim()) !== -1;
    });

    /* data-master: master admins and nobody else (the reviewing
       window, 21 Oct 2026: Church settings opened for any area
       admin by its address). No team or group waives it, and View
       as counts as the person being viewed (isMaster honours it). */
    if (opts.master && !EGBCAuth.isMaster()) {
      return ['Master admins only',
        'This page holds the whole church’s settings, so only a master admin can open it.'];
    }

    /* data-job: the teams doing one of these jobs, and master admins. */
    if (opts.job && !alsoOk && !EGBCAuth.isMaster() && !String(opts.job).split(',').some(function (j) {
      return EGBCAuth.myJobs().indexOf(j.trim()) !== -1;
    })) {
      var JOB_WORDS = { office: 'the church office', trustees: 'the trustees', finance: 'the people who look after the money',
        buildings: 'the people who look after the buildings', leadership: 'the church\u2019s leaders' };
      var j0 = String(opts.job).split(',')[0].trim();
      return ['No access to this page', 'This page is for ' + (JOB_WORDS[j0] || 'the people who do this job in the church') +
        '. If you think you should have access, ask the church office.'];
    }

    if (opts.adminAny && !EGBCAuth.isAdmin() && !alsoOk) {
      return ['Admins only',
        'This page is for people who manage a team. If you think you should ' +
        'have access, ask a member of the Core Team.'];
    }

    /* ON ANY TEAM (opts.anyTeam): team things - videos, resources,
       pin boards - are for the people who serve, not for a member on
       no team (Martin, 15 Oct 2026). effectiveTeams and adminAreas
       honour "View the site as", so "Everyone" is turned away too. */
    if (opts.anyTeam && !alsoOk && !EGBCAuth.isMaster()
        && !EGBCAuth.effectiveTeams().length
        && !((EGBCAuth.adminAreas ? EGBCAuth.adminAreas() : profile.adminFor) || []).length
        /* A parent whose child is in a group reads that group's board
           (6c): familyGroups, put on their record by the server. */
        && !(!(EGBCAuth.viewingAs && EGBCAuth.viewingAs()) && (profile.familyGroups || []).length)) {
      return ['For the church’s teams',
        'This page is for people who serve on one of the church’s teams. ' +
        'If you have joined a team, ask its leader to add you.'];
    }

    /* data-leads: Book a room's people (EGBCAuth.mayBookRoom) - team
       leaders, core teams, the office and the bookings admins. */
    if (opts.leadsOrCore && !alsoOk && !EGBCAuth.mayBookRoom()) {
      return ['For team leaders and core teams',
        'This is for the people who lead a team, the core teams and the office. ' +
        'If you need it, ask your team leader.'];
    }

    /* A page can name more than one team, comma separated. The rota
       planner is the reason: it is one file holding every
       department's rota, so Karen has to be able to open it for Kids
       Church without being on the worship team. Being on - or
       administering - any one of the listed teams is enough. */
    var wanted = opts.team ? String(opts.team).split(',').map(function (t) {
      return t.trim();
    }).filter(Boolean) : [];

    var mayEnter = alsoOk || !wanted.length || EGBCAuth.isOwner() ||
      wanted.some(function (t) {
        return EGBCAuth.inTeam(t) || EGBCAuth.isAdminOf(t);
      });

    if (!mayEnter) {
      return ['No access to this page',
        /* The label already carries the noun where it needs one -
           "Core Team", "Kids Church" - so appending "team" produced
           "the Core Team team". */
        'This page is for ' + labelList(wanted) +
        ', and you are not on ' + (wanted.length > 1 ? 'any of those teams.' : 'that team.')];
    }

    /* The team check above lets a master admin through. This one did
       not, so a master admin was refused any page marked
       data-role="leader" - which is most of the build tools.

       roleAtLeast only honours roles.owner, and master admin is held
       in a separate field (masterAdmin), so it can never see it. The
       team's own admin passes too: Karen administering Kids Church
       should clear a leader gate on a Kids Church page. */
    var hasRank = !opts.role || !wanted.length || EGBCAuth.isOwner() ||
      wanted.some(function (t) {
        return roleAtLeast(profile.roles, t, opts.role) || EGBCAuth.isAdminOf(t)
          /* A core team clears its own teams' leader gates, as Core
             Team cleared Worship & AV's on the old portal (H-15). */
          || (opts.role === 'leader' && coversOf(EGBCAuth.effectiveTeams()).indexOf(t) !== -1);
      });

    if (!hasRank) {
      return ['Not enough permissions',
        'This page needs ' + opts.role + ' access for ' + labelList(wanted) + '.'];
    }
    return null;
  }

  /* ---- Google Identity Services, for the installed app ---------------- */
  /* The project's web client (Google Cloud > Credentials: "Web client (auto
     created by Google Service)"), the one Firebase's Google sign-in uses, so
     its ID tokens are the ones Firebase accepts. Its JavaScript origins must
     include every address the hub is installed from. */
  var GOOGLE_WEB_CLIENT = '199442060489-l8j4f9p55qos14tva2bi1u9vd70p0l5f.apps.googleusercontent.com';
  var gisLoading = null;
  function loadGis() {
    if (global.google && global.google.accounts && global.google.accounts.id) return Promise.resolve(global.google);
    if (gisLoading) return gisLoading;
    gisLoading = new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = function () { (global.google && global.google.accounts && global.google.accounts.id) ? ok(global.google) : no(new Error('Google sign-in did not load.')); };
      s.onerror = function () { gisLoading = null; no(new Error('Google sign-in could not be reached.')); };
      document.head.appendChild(s);
    });
    return gisLoading;
  }

  /* ---- Permissions (H-14) -------------------------------------------- */
  var PERMS = { ready: false, promise: null, perms: null, jobs: null, set: {}, exceptions: [], pastor: '' };
  function localDayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  /* Alongside this file, with its own stamp, like egbc-core-meetings.js's video loader. */
  function sibling(name, stamp) {
    if ((name === 'egbc-team-jobs.js' && global.EGBCTeamJobs) || (name === 'egbc-permissions.js' && global.EGBCPermissions)
        || (name === 'egbc-services.js' && global.EGBCServices) || (name === 'egbc-setup.js' && global.EGBCSetup)) return Promise.resolve();
    return new Promise(function (done) {
      var me = document.querySelector('script[src*="egbc-auth.js"]');
      var base = me ? me.getAttribute('src').split('egbc-auth.js')[0] : '';
      var s = document.createElement('script');
      s.src = base + name + "?v=" + stamp;
      s.onload = done; s.onerror = done;
      document.head.appendChild(s);
    });
  }
  function loadPerms() {
    if (PERMS.promise) return PERMS.promise;
    var get = function (c, d) { return db.collection(c).doc(d).get().then(function (s) { return s.exists ? s.data() : null; }, function () { return null; }); };
    var uid = currentUser && currentUser.uid;
    PERMS.promise = Promise.all([
      sibling('egbc-team-jobs.js', '202610261800').then(function () { return sibling('egbc-permissions.js', '202610272330'); }),
      get('churchSettings', 'permissions'), get('churchSettings', 'teamJobs'),
      get('paymentSettings', 'public'), get('safeguardingSettings', 'defaults'), get('prayerSettings', 'main'),
      /* The Pastor (Team emails): readable by master admins and the Pastor
         only, so for anybody else this is null - which is the answer. */
      get('teamMailSettings', 'main'),
      uid ? db.collection('permissionExceptions').where('uid', '==', uid).get().then(function (s) { return s.docs.map(function (d) { return d.data(); }); }, function () { return []; }) : Promise.resolve([])
    ]).then(function (r) {
      PERMS.perms = r[1]; PERMS.jobs = r[2];
      PERMS.set = {};
      if (r[3] && r[3].moneyTeam !== undefined) PERMS.set.moneyTeam = r[3].moneyTeam;
      if (r[4] && r[4].trusteeTeam !== undefined) PERMS.set.trusteeTeam = r[4].trusteeTeam;
      if (r[5] && r[5].prayerTeam !== undefined) PERMS.set.prayerTeam = r[5].prayerTeam;
      PERMS.pastor = (r[6] && r[6].pastor) || '';
      PERMS.exceptions = r[7] || [];
      PERMS.ready = true;
      return PERMS;
    });
    return PERMS.promise;
  }

  /* PIN BOARDS COME FROM THE TEAMS (26 Oct 2026; Martin: a pin board is
     for everyone on that team, never leaders-only, and nobody else). Each
     board is the teams that share it; a board of under-18s groups is
     moderated (a young person suggests, an adult puts it up). */
  function boards() {
    var by = {};
    Object.keys(TEAMS).forEach(function (t) {
      var b = TEAMS[t].board;
      if (!b || TEAMS[t].archived) return;
      (by[b] = by[b] || { doc: b, teams: [], title: '' }).teams.push(t);
    });
    return Object.keys(by).map(function (k) {
      var b = by[k];
      b.title = (TEAMS[b.teams[0]] || {}).label || b.teams[0];
      b.moderated = b.teams.every(function (t) { return TEAMS[t] && TEAMS[t].under18; });
      return b;
    });
  }

  /* The core teams that cover this team. */
  function coreTeamsFor(team) {
    return Object.keys(TEAMS).filter(function (t) { return (TEAMS[t].coreFor || []).indexOf(team) !== -1; });
  }

  /* WHICH SITES THIS PERSON LOOKS AFTER THE BOOKINGS FOR.

     A site's bookings admin can already decide that site's bookings - the
     rules say so - so refusing them the Bookings tab would be a tab missing
     from somebody doing the work (F-141.4, and NEXT-BRIEF §25 says to give
     it to them). bookingSettings is one small document per site and is
     readable by anyone active, so this is a cheap read; it is cached like
     the teams, and it never rejects. */
  var bookingsAdminOf = [];
  /* The buildings this person leads for health and safety or fire safety
     (raSiteRoles: hsLead, hsDeputy, fireLead; the events window's F-299). */
  var buildingLeadOf = [];
  /* Leads a Sunday group, planner group or small group (leaderIds; the
     events window's F-304: they read their activity's safeguarding risks),
     and is named a data protection lead (dataSettings/main.leads, F-307). */
  var groupLeader = false, dataLead = false;
  /* The children's register and check-in (the access matrix, proposal 3):
     a kids lead is an admin of a team a site's kids settings name (as the
     pages decide), and a group leader leads a kidsGroups group. */
  var kidsGroupLeader = false, kidsTeams = [];

  /* THE PEOPLE WHO LOOK AFTER SERMONS AND WATCH (sermonShow/access, the
     events window's; the rules' sermonAdmin()). Read once with the profile
     so the Menu can offer "Watch" to them without a read of its own.
     Unread means "not one" - the safe way round. */
  /* THE SAFEGUARDING LEAD AND DEPUTY (the rules' sgLeadOrDeputy()), so the
     Menu can offer them "Care & support: what has come in". Unread means
     "not one". */
  var careLead = false, sgLead = false;
  /* Pastoral visits (F-308): named in Who gets told for pastoral concerns
     (keeps the visitors' list), and on that list (reads the visits). */
  var pastoralLead = false, pastoralVisitor = false;
  function loadCareLead(memberId) {
    if (!memberId) { careLead = false; return Promise.resolve(false); }
    /* careRouting/status, kept by the server: the lead and deputy, readable
       by anyone signed in - the safeguarding settings are a volunteer's. */
    var lead = db.collection('careRouting').doc('status').get().then(function (d) {
      sgLead = ((d.exists && d.data().leadIds) || []).indexOf(memberId) !== -1;
      return sgLead;
    });
    /* Named in "Who gets told" for requests for care or pastoral concerns. */
    var named = db.collection('careRouting').doc('main').get().then(function (d) {
      var r = d.exists ? (d.data() || {}) : {};
      pastoralLead = ((r.pastoral || {}).memberIds || []).indexOf(memberId) !== -1;
      return ['care', 'pastoral'].some(function (k) { return ((r[k] || {}).memberIds || []).indexOf(memberId) !== -1; });
    });
    db.collection('pastoralSettings').doc('main').get().then(function (d) {
      pastoralVisitor = d.exists && (d.data().visitorIds || []).indexOf(memberId) !== -1;
    }).catch(function () {});
    return Promise.all([lead.catch(function () { return false; }), named.catch(function () { return false; })])
      .then(function (x) { careLead = !!(x[0] || x[1]); return careLead; });
  }

  /* THE MONEY TEAM'S NAME (F-200): paymentSettings/public.moneyTeam, which
     anyone may read; 'Finance' until a master admin renames it. For the
     Menu's Payments. */
  /* THE TRUSTEES' TEAM (safeguardingSettings/defaults.trusteeTeam, "Elders"
     unless set; the rules' sgTrusteeTeam()), for the Menu's Safeguarding
     risks (F-268). Read only by somebody the rules let read the settings
     (volunteer(): on a team, an admin, or a master admin); anybody else is
     not a trustee, and is not sent to be refused. */
  var trusteeTeam = 'Elders';
  function loadTrusteeTeam(profile) {
    var p = profile || {};
    if (!(p.masterAdmin === true || (p.teams || []).length || (p.adminFor || []).length)) { trusteeTeam = 'Elders'; return Promise.resolve(); }
    return db.collection('safeguardingSettings').doc('defaults').get().then(function (s) {
      trusteeTeam = String((s.exists && s.data().trusteeTeam) || 'Elders');
    }, function () { trusteeTeam = 'Elders'; });
  }

  var moneyTeam = 'Finance';
  function loadMoneyTeam() {
    return db.collection('paymentSettings').doc('public').get().then(function (s) {
      moneyTeam = String((s.exists && s.data().moneyTeam) || 'Finance');
    }, function () { moneyTeam = 'Finance'; });
  }

  /* WHAT THIS CHURCH USES (HANDOVER-MAIN rule 12; NEXT-BRIEF item 14; the
     events window's F-230). churchSettings/features holds a master admin's
     switches, { name: true|false }. A feature with no switch stored takes
     its default: on for everything built before the switches existed, OFF
     for the add-ons, so a new add-on never turns up at a church that has
     not asked for it. Read with the profile, so the Menu draws once and
     right; EGBCAuth.uses(name) answers, and EGBCChurch.uses asks it. */
  var FEATURES = [
    /* On unless the church switches it off: everything built before the
       switches existed, so nothing anybody uses today disappears. */
    { name: 'care', label: 'Care & support', on: true },
    { name: 'prayer', label: 'Prayer requests', on: true },
    { name: 'notifications', label: 'Notifications (phones and computers)', on: true },
    { name: 'watch', label: 'Watch & Listen', on: true },
    { name: 'sermons', label: 'Sermons and the podcast', on: true },
    { name: 'giftAid', label: 'Gift Aid', on: true },
    { name: 'teamMail', label: 'Team email addresses', on: true },
    { name: 'rotaReports', label: 'Rota reports', on: true },
    { name: 'preachingPlan', label: 'Preaching plan', on: true },
    { name: 'pictureLibrary', label: 'Picture library', on: true },
    { name: 'publicWhatson', label: 'Public What\u2019s on', on: true },
    { name: 'sundaysInWhatsOn', label: 'Sunday services in What\u2019s on', on: true },
    { name: 'newHere', label: '\u201cI\u2019m new here\u201d', on: true },
    { name: 'usualPeople', label: 'Usual people on the rota', on: true },
    { name: 'screenPaging', label: 'Paging parents on the screen', on: true },
    /* EVERY PART HAS A SWITCH (the reviewing window, 20 Oct 2026), so a
       church can switch off what it does not use - it goes from the Menu,
       the app and Home; nothing is deleted. On at EGBC, as everything. */
    { name: 'maintenance', label: 'Maintenance', on: true },
    { name: 'events', label: 'Events: sign-ups, check-in, registers and headcounts', on: true },
    { name: 'roomBookings', label: 'Room bookings and hire', on: true },
    { name: 'kids', label: 'Kids: the children\u2019s register, Sunday check-in and labels', on: true },
    { name: 'smallGroups', label: 'Small groups', on: true },
    { name: 'forms', label: 'Forms', on: true },
    { name: 'payments', label: 'Payments and Give', on: true },
    { name: 'safeguarding', label: 'Safeguarding: DBS and training', on: true },
    { name: 'pinBoards', label: 'Pin boards', on: true },
    { name: 'meetings', label: 'Meetings', on: true },
    { name: 'notices', label: 'Notices', on: true },
    { name: 'churchShow', label: 'ChurchShow', on: true },
    { name: 'availability', label: 'Availability form', on: true },
    /* THE ADD-ONS (addOn: true). Martin, 19 Oct 2026: at EGBC every switch
       starts ON, add-ons included; a new church's add-ons can start off
       (that is what addOn marks, for when there is more than one church).
       Building compliance too, now that the events window's gate is live
       (6f3ab9b2: nothing private is saved before switch-over). */
    { name: 'sessionPlanner', label: 'Session planner', on: true, addOn: true },
    { name: 'buildingCompliance', label: 'Building checks', on: true, addOn: true },
    /* The safeguarding risk register (F-268; the reviewing window, 22 Oct
       2026: on by default). */
    { name: 'safeguardingRegister', label: 'Safeguarding risk register', on: true, addOn: true },
    { name: 'enews', label: 'E-news', on: true, addOn: true },
    { name: 'cardMaker', label: 'Card maker', on: true, addOn: true },
    { name: 'canva', label: 'Canva', on: true, addOn: true },
    { name: 'quiz', label: 'Quiz', on: true, addOn: true }
  ];
  var featureSwitches = {};
  function loadFeatures() {
    return db.collection('churchSettings').doc('features').get().then(function (s) {
      featureSwitches = (s.exists && s.data()) || {};
    }, function () { featureSwitches = {}; });
  }
  function usesFeature(name) {
    var v = featureSwitches[name];
    if (typeof v === 'boolean') return v;
    for (var i = 0; i < FEATURES.length; i++) if (FEATURES[i].name === name) return FEATURES[i].on;
    return true;   /* a name nobody listed: as before the switches */
  }
  /* Straight away, on every page: some pages never take the profile step
     above (Care & support, forms, Give regularly, Small groups), and they
     drew the Menu with only the defaults - no Session planner where the
     church had switched it on (check-menu, 19 Oct 2026). */
  loadFeatures();

  var sermonsAdmin = false;
  function loadSermonsAdmin(memberId) {
    if (!memberId) { sermonsAdmin = false; return Promise.resolve(false); }
    return db.collection('sermonShow').doc('access').get().then(function (d) {
      var ids = d.exists ? ((d.data() || {}).memberIds || []) : [];
      sermonsAdmin = Array.isArray(ids) && ids.indexOf(memberId) !== -1;
      return sermonsAdmin;
    }).catch(function () { sermonsAdmin = false; return false; });
  }

  /* ON AN EVENT'S TEAM (F-212, events window): somebody who runs Film Club
     without administering anything still needs Events in the Menu. The same
     two questions EGBCEvents.eventsIRun() asks, one answer each is enough.
     Anybody who administers something sees Events already, so they are
     not asked. Never rejects. */
  var eventTeam = false;
  function loadEventTeam(profile, uid) {
    eventTeam = false;
    if (!profile || profile.masterAdmin || (profile.adminFor || []).length) return Promise.resolve(false);
    var c = db.collection('calEvents'), qs = [];
    if (profile.memberId) qs.push(c.where('teamMemberIds', 'array-contains', profile.memberId).limit(1).get());
    if (uid) qs.push(c.where('teamUids', 'array-contains', uid).limit(1).get());
    return Promise.all(qs.map(function (q) { return q.catch(function () { return { empty: true }; }); }))
      .then(function (r) { eventTeam = r.some(function (x) { return !x.empty; }); return eventTeam; });
  }

  /* THE SESSION PLANNER AND HEADCOUNTS, FOR THE MENU (F-226; the events
     window's pages). Plan groups this person leads or whose team they are
     on (a master admin reads them all, for View as), and the teams the
     children's settings name (Headcounts is for their admins). Read once
     with the profile; never rejects - nothing read means "not one". */
  var planGroups = [], kidsTeams = [];
  function loadPlanGroups(profile) {
    planGroups = [];
    if (!profile) return Promise.resolve([]);
    var c = db.collection('planGroups'), qs = [], teams = (profile.teams || []).concat(coversOf(profile.teams || [])).slice(0, 30);
    if (profile.masterAdmin) qs.push(c.get());
    else {
      if (profile.memberId) qs.push(c.where('leaderIds', 'array-contains', profile.memberId).get());
      if (teams.length) qs.push(c.where('teamName', 'in', teams).get());
    }
    return Promise.all(qs.map(function (q) { return q.catch(function () { return { docs: [] }; }); })).then(function (r) {
      var seen = {};
      r.forEach(function (s) { s.docs.forEach(function (d) { if (!seen[d.id]) { seen[d.id] = 1; var g = d.data() || {}; if (g.archived !== true) planGroups.push({ leaderIds: g.leaderIds || [], teamName: g.teamName || '' }); } }); });
      return planGroups;
    });
  }
  function loadKidsTeams(profile) {
    kidsTeams = [];
    if (!profile || (!profile.masterAdmin && !(profile.adminFor || []).length)) return Promise.resolve([]);
    return db.collection('kidsSettings').get().then(function (s) {
      s.docs.forEach(function (d) { ((d.data() || {}).teams || []).forEach(function (t) { if (kidsTeams.indexOf(t) === -1) kidsTeams.push(t); }); });
      return kidsTeams;
    }).catch(function () { return []; });
  }

  /* The church's service roles (H-11), for the slides and cards that name
     them: read with the profile, so a page draws them first time. */
  var SERVICES = { S: null, cfg: null };
  function loadServiceRoles() {
    return sibling('egbc-services.js', '202610300900').then(function () {
      return global.EGBCServices ? global.EGBCServices.load(db) : null;
    }).then(function (cfg) { SERVICES = { S: global.EGBCServices || null, cfg: cfg }; }, function () {});
  }

  function loadGroupLeadAndDataLead(memberId) {
    if (!memberId) return Promise.resolve();
    var one = function (c) {
      return db.collection(c).where('leaderIds', 'array-contains', memberId).limit(1).get()
        .then(function (s) { return !s.empty; }).catch(function () { return false; });
    };
    return Promise.all([one('kidsGroups'), one('planGroups'), one('smallGroups'),
      db.collection('dataSettings').doc('main').get().then(function (d) {
        return d.exists && (d.data().leads || []).indexOf(memberId) !== -1;
      }).catch(function () { return false; })
      , db.collection('kidsSettings').get().then(function (s) {
        var t = {}; s.forEach(function (d) { ((d.data() || {}).teams || []).forEach(function (x) { t[x] = 1; }); });
        return Object.keys(t);
      }).catch(function () { return []; })
    ]).then(function (r) { groupLeader = r[0] || r[1] || r[2]; dataLead = r[3]; kidsGroupLeader = r[0]; kidsTeams = r[4]; });
  }

  function loadBuildingLead(memberId) {
    if (!memberId) return Promise.resolve([]);
    return db.collection('raSiteRoles').get().then(function (snap) {
      var mine = [];
      snap.forEach(function (doc) {
        var r = doc.data() || {};
        if ([r.hsLead, r.hsDeputy, r.fireLead].indexOf(memberId) !== -1) mine.push(doc.id);
      });
      buildingLeadOf = mine;
      return mine;
    }).catch(function () { return []; });
  }

  function loadBookingsAdmin(memberId) {
    if (!memberId) return Promise.resolve([]);
    return db.collection('bookingSettings').get().then(function (snap) {
      var mine = [];
      snap.forEach(function (doc) {
        var list = (doc.data() || {}).bookingsAdmins;
        if (Array.isArray(list) && list.indexOf(memberId) !== -1) mine.push(doc.id);
      });
      bookingsAdminOf = mine;
      return mine;
    }).catch(function () { return []; });
  }

  /* Resolves once, whether the read worked or not: the fallback is a
     complete answer, so nothing waits on the network to draw. */
  function loadTeams() {
    if (teamsPromise) return teamsPromise;
    teamsPromise = db.collection('teams').get().then(function (snap) {
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        /* An archived team keeps working for anyone still ticked into it -
           archive-and-create, not rename (APP-A1 b, Martin approved) - but
           it is not offered as a new choice. */
        mergeTeam(doc.id, d);
      });
      teamsLoaded = true;
      return TEAMS;
    }).catch(function (e) {
      /* The table above is a complete answer. Say so once and carry on. */
      console.info('EGBCAuth: teams collection not read, using the built-in list', e && e.code);
      return TEAMS;
    });
    return teamsPromise;
  }

  /* ---- Roles -------------------------------------------------------
     member  — sees the team's pages
     leader  — plus planning and rota editing for that team
     admin   — plus user management for that team
     owner   — everything, including the page registry               */

  var ROLES = ['member', 'leader', 'admin', 'owner'];

  /* "Worship", or "Worship, Kids Church or Youth" - used in the refusal
     messages, which are the only place a person meets this list. */
  function labelList(teams) {
    var names = teams.map(function (t) { return (TEAMS[t] && TEAMS[t].label) || t; });
    if (names.length < 2) return names[0] || 'this team';
    return names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1];
  }

  function roleAtLeast(userRoles, team, needed) {
    if (!userRoles) return false;
    if (userRoles.owner) return true;
    var r = userRoles[team];
    if (!r) return false;
    return ROLES.indexOf(r) >= ROLES.indexOf(needed);
  }

  /* ---- Profile -----------------------------------------------------
     users/{uid} mirrors the minimum needed for access decisions, so
     Firestore rules can read it with a single get() rather than a
     query. It is created on first sign-in by matching the auth email
     to an address book record.                                       */

  /* sessionStorage can throw in a private window and comes back empty after
     one, so neither reading nor writing it may be allowed to matter: a
     failure here just means the check runs again, which is correct and only
     slower. */
  var SESSION_KEY = 'egbc_identity_checked';

  function checkedThisSession(uid) {
    try { return sessionStorage.getItem(SESSION_KEY) === uid; } catch (e) { return false; }
  }
  function markCheckedThisSession(uid) {
    try { sessionStorage.setItem(SESSION_KEY, uid); } catch (e) {}
  }

  /* Has a second address book record appeared on this person's address? An
     administrator adding a parent's email to a child's record is the case,
     and it is not something that happens between two clicks - so this runs
     AFTER the page is usable, and what it finds applies from the next page
     load. Nothing here is awaited and nothing here can fail visibly. */
  function recheckIdentityLater(user) {
    findMembers((user.email || '').toLowerCase().trim()).then(function (matches) {
      if (matches.length <= 1) return;
      var patch = {
        status: 'ambiguous',
        memberId: null,
        teams: [],
        candidates: matches.map(function (m) {
          return {
            id: m.id,
            name: (m.data.name || m.data.fullName || '(no name)').trim(),
            admin: m.data.masterAdmin === true
                   || (Array.isArray(m.data.adminFor) && m.data.adminFor.length > 0)
          };
        })
      };
      return db.collection('users').doc(user.uid).update(patch);
    }).catch(function (e) {
      /* An unreachable function, or a refused write. Either way the person
         keeps the identity they already had, which is what they had a
         moment ago, and somebody will see this on the console. */
      console.info('EGBCAuth: identity re-check did not run: ' + ((e && e.message) || e));
    });
  }

  function loadProfile(user) {
    return db.collection('users').doc(user.uid).get().then(function (snap) {
      if (!snap.exists) return provisionProfile(user);

      var d = snap.data();

      /* Still waiting for an administrator to say who this is. */
      if (d.status === 'ambiguous') return d;

      /* Someone linked since their last visit: pick the membership up now,
         so they do not have to be told to sign out and back in. */
      if (!d.memberId) {
        return provisionProfile(user, d);
      }

      /* An automatic match is a guess, and the address book changes. If a
         second record now carries this address - a parent's email added to a
         child's record, say - the guess is no longer safe and an
         administrator has to decide. Links an admin made are left alone.

         ONCE A SESSION, NOT ONCE A PAGE. This check used to be a Firestore
         query, which was cheap enough to repeat on every page load. It is a
         function call now (A-036), and leaving it here put a cold start in
         front of every page in the suite - which is what the events window
         reported as addressbook.html timing out (F-118).

         A second record appearing on somebody's address is a thing an
         administrator does, not a thing that happens between two clicks, so
         checking once per browser session is the same safety at a fraction
         of the cost. */
      /* NOT AWAITED, and that is the whole of the fix. Once a session, and
         behind the page rather than in front of it. */
      if (d.linkedBy !== 'admin' && !checkedThisSession(user.uid)) {
        markCheckedThisSession(user.uid);
        recheckIdentityLater(user);
      }

      return refreshFromBook(user, d);
    });
  }

  /* What one address book record says about access, in the shape users/{uid}
     stores it. firestore.rules checks every field of this against the record
     (mirrorsBook), so none of it can be granted by the person it describes.

     THE FOUR LEVELS, NEXT-BRIEF 21 (Martin, 9 Oct 2026):
       Pending        no record carries their verified address
       Attender       a record does - and status is 'active' for them now,
                      where before only a volunteer was active
       Church member  that record also carries the office's tick
       Team member    that record has teams in markers

     Archived and under-16 records are not Attenders. findMembers already
     skipped both when matching an address, but refreshFromBook re-read the
     record by id and never looked at either - so somebody archived kept
     whatever they had, for ever. That mattered little while 'active' meant
     "on a team"; it matters now that it means "comes to this church". */
  function membershipFrom(md) {
    var teams = Array.isArray(md.markers) ? md.markers : [];
    var adminFor = Array.isArray(md.adminFor) ? md.adminFor : [];
    var gone = md.archived === true;
    var child = md.isMinor === true;
    var attender = !gone && !child;
    return {
      teams: teams,
      adminFor: adminFor,
      masterAdmin: md.masterAdmin === true,
      attender: attender,
      churchMember: md.churchMember === true && !gone,
      /* The one-off Running things ticks (NEXT-BRIEF §25), mirrored the
         same checked way teams are - so nobody can grant themselves a tab.
         Only the four tabs that exist, so a stray value in the record
         cannot become anything. An archived person keeps none of it. */
      runs: (!gone && Array.isArray(md.runs)
              ? md.runs.filter(function (r) {
                  return ['today', 'people', 'bookings', 'send'].indexOf(r) !== -1;
                })
              : []),
      // Someone can administer an area without being a member of it - Karen
      // runs Kids Church, Marcia runs Youth - so status counts either, and
      // now being in the address book at all counts too.
      status: (attender || teams.length || adminFor.length || md.masterAdmin === true)
                ? 'active' : 'pending'
    };
  }

  /* Markers are edited in the address book, so re-read them each load rather
     than letting the mirrored copy drift. */
  function refreshFromBook(user, d) {
    return db.collection('addressBook').doc(d.memberId).get().then(function (m) {
      var patch = { lastSeen: firebase.firestore.FieldValue.serverTimestamp() };
      if (m.exists) {
        var md = m.data();
        Object.assign(patch, membershipFrom(md));
        patch.name = (md.name || md.fullName || d.name || '').trim();
      }
      return db.collection('users').doc(user.uid).update(patch)
        .catch(function () {})
        .then(function () { return Object.assign({}, d, patch); });
    }).catch(function () { return d; });
  }


  /* WHICH RECORD IS MINE. This used to be two queries on the address book,
     straight from the page: `where email ==`, then
     `where signInEmails array-contains` - because people sign in with
     whatever Google account is on their phone, which is often not the address
     the church holds, and the second lookup is what stops them getting stuck.

     IT WORKED ONLY BECAUSE THE ADDRESS BOOK WAS OPEN TO THE INTERNET. Closing
     it (PRIVACY-OPEN-COLLECTIONS.md, 9 Oct 2026) broke every FIRST sign-in,
     for everybody and not just Attenders: a brand new account has no
     users/{uid} document, so it is on no team and administers nothing, and
     both queries were refused.

     It COULD be mended in the rules - `allow list: if resource.data.email ==
     request.auth.token.email` does work, because Firestore allows a query
     whose own `where` clauses guarantee the rule and refuses one that asks
     for the whole collection. An earlier version of this comment said that
     was impossible; it was measured afterwards and it is not.

     It is a function anyway, for two reasons worth more than the clause: the
     address book is then shut to page-side queries entirely, with no clause
     for somebody to widen later, and the function applies the exclusions
     itself rather than trusting the page to. It reads the address out of the
     verified ID token rather than out of anything the page sends, so it can
     only ever answer about whoever is asking:

       - archived: somebody who has left does not get to sign in as themselves
       - isMinor: under 16s use an access code emailed to a parent, which also
         means a parent's address on a child's record is never mistaken for
         the child

     The shape it returns is the shape the old queries returned - [{id, data}] -
     so applyMember and the ambiguity check above are unchanged. */
  function findMembers(email) {
    return callFunction('whoAmI', {}).then(function (r) {
      return (r.people || []).map(function (p) {
        return { id: p.id, data: {
          name: p.name,
          markers: p.markers || [],
          adminFor: p.adminFor || [],
          masterAdmin: p.masterAdmin === true,
          churchMember: p.churchMember === true
        } };
      });
    });
  }

  function applyMember(uid, m, how) {
    return Object.assign({
      memberId: m.id,
      name: (m.data.name || m.data.fullName || '').trim(),
      // 'auto' was matched on a unique email. 'admin' was chosen by a person.
      // Only 'admin' is trusted permanently - an automatic match is re-checked
      // on every load, because a second record can appear on that address later.
      linkedBy: how || 'auto'
    }, membershipFrom(m.data));
  }

  function provisionProfile(user, existing) {
    var email = (user.email || '').toLowerCase().trim();

    /* IF whoAmI CANNOT BE REACHED, this must still answer. An unreachable
       function is indistinguishable from "nobody on file" as far as the page
       can tell, and the card for that - "we do not recognise that address" -
       is honest and tells them what to do. The alternative, which is what
       happened before this line existed, is provisionProfile rejecting and
       the page showing "Something went wrong" with a fetch error on it. */
    return findMembers(email).catch(function (e) {
      console.warn('EGBCAuth: could not ask whoAmI who this is', e && e.message);
      return [];
    }).then(function (matches) {
      var profile = {
        uid: user.uid,
        email: email,
        name: user.displayName || '',
        memberId: null,
        teams: [],
        attender: false,
        churchMember: false,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      };

      /* One address, several people - a parent's email sits on their
         children's records too. The person signing in must NOT pick which
         of them they are: on a shared family address that would let a child
         select the parent and inherit their access. An administrator links
         it instead. */
      if (matches.length > 1) {
        profile.status = 'ambiguous';
        profile.candidates = matches.map(function (m) {
          return {
            id: m.id,
            name: (m.data.name || m.data.fullName || '(no name)').trim(),
            admin: m.data.masterAdmin === true || (Array.isArray(m.data.adminFor) && m.data.adminFor.length > 0)
          };
        });
      } else if (matches.length === 1) {
        Object.assign(profile, applyMember(user.uid, matches[0], 'auto'));
      }

      /* A RECORD THAT IS ALREADY THERE KEEPS ITS createdAt (A-078). Somebody
         the church does not hold yet comes back through here on every visit,
         and so does somebody the office linked since their last one. Writing
         a fresh createdAt each time made the write an update that changes
         createdAt, which no users rule allows - so from the second visit on
         the page said "Something went wrong" instead of letting them in or
         telling them plainly. Hidden only because the live database has no
         rules yet. With createdAt kept, the first is the heartbeat and the
         second is the checked mirror update, both of which the rules allow. */
      if (existing && existing.createdAt) profile.createdAt = existing.createdAt;

      return db.collection('users').doc(user.uid).set(profile)
        .then(function () { return profile; });
    });
  }

  /* Choosing yourself from a shared address. Admin records are deliberately
     not selectable: proving you control a shared family inbox must not be
     enough to take Core Team access. Those still need an administrator. */
  function chooseIdentity(memberId) {
    var user = currentUser;
    if (!user || !currentProfile) return;

    var pick = (currentProfile.candidates || []).filter(function (c) { return c.id === memberId; })[0];
    if (!pick) return;

    /* Admin records normally need an administrator to link them. But if there
       is no administrator yet, saying "ask an administrator" is a deadlock -
       so the first one is allowed to identify themselves. */
    var allowed = pick.admin
      ? db.collection('users').where('status', '==', 'active').get().then(function (q) {
          var anyAdmin = q.docs.some(function (d) {
            var t = d.data().teams || [];
            var dd = d.data();
            return dd.masterAdmin === true || (Array.isArray(dd.adminFor) && dd.adminFor.length > 0);
          });
          if (anyAdmin) {
            alert('An administrator needs to link this one. Ask another member of the Core Team.');
            return false;
          }
          return true;
        }).catch(function () { return true; })
      : Promise.resolve(true);

    allowed.then(function (ok) {
      if (!ok) return;
      return doChoose(user, memberId);
    });
  }

  function doChoose(user, memberId) {
    return db.collection('addressBook').doc(memberId).get().then(function (d) {
      if (!d.exists) return;
      var isAdminRecord = d.data().masterAdmin === true ||
                          (Array.isArray(d.data().adminFor) && d.data().adminFor.length > 0);
      var patch = applyMember(user.uid, { id: d.id, data: d.data() }, isAdminRecord ? 'admin' : 'self');
      patch.candidates = firebase.firestore.FieldValue.delete();
      return db.collection('users').doc(user.uid).update(patch);
    }).then(function () {
      location.reload();
    }).catch(function (e) { alert('Could not continue: ' + e.message); });
  }

  /* ---- Public API -------------------------------------------------- */

  /* ---- View as ------------------------------------------------------
     A master admin cannot otherwise find out what anybody else's version of
     the site looks like - which pages are in the menu, what the hub shows,
     what is refused. Short of holding a second account and a second email
     address, this is the only way to check it.

     It overrides what the rest of the suite is told about the signed-in
     person, so every page follows without knowing this exists. It changes
     what is SHOWN, never what is permitted: the Firestore rules, once
     deployed, still see the real account, and anything edited while
     previewing is edited by the real person under their own name.

     Held in sessionStorage, so it dies with the tab. */

  var VIEW_KEY = 'egbc_view_as';

  /* ---- Who owns a rota slot -----------------------------------------
     The rota is one list of roles shared by every department, so several
     pages need to answer "whose is this?" - the planner, the read-only
     rota, and anything added later. Defined once here rather than copied
     into each, because a copy is a thing that drifts. */

  var AV_ROLES = ['Sound', 'Words', 'Cameras'];

  var KIDS_ROLES = ['Session Leader',
    'Leader (Younger)', 'Leader (Older)', 'Leader (Creche)',
    'Assistant (Younger)', 'Assistant (Older)', 'Assistant (Creche)',
    'Helper 1', 'Helper 2', 'Helper 3', 'Helper 4', 'Helper 5'];

  function roleTeam(r) {
    if (AV_ROLES.indexOf(r) !== -1) return 'AV Team';
    if (KIDS_ROLES.indexOf(r) !== -1 || /^Helper \d+$/.test(r)) return 'Kids Church';
    return 'Worship Team';
  }

  /* Which teams' slots a person sees on the rota.

     Worship and AV serve the same service and share a charter, so someone
     on one sees the other's slots. Youth Worship has no roles of its own -
     the young people play drums, keys and violin on ordinary Sunday
     mornings - so scoping them to "Youth Worship" showed them a rota with
     nothing in it while they were actually on it. They see the worship
     rota, because that is the rota they serve on.

     A CORE TEAM SEES THE TEAMS IT COVERS (H-15, 26 Oct 2026): the Worship
     Core Team, Worship, AV and Choir; the Kids & Youth Core Team, Kids
     Church, Lazers, ReNu and Youth - and only those. Its covers are added
     after the worship side is worked out, so covering Youth Worship does
     not bring the worship rota with it.

     Kids Church is the one that stays separate. That is the whole point of
     scoping it - and someone on Kids Church AND Worship gets both, because
     the list is a union of everything they are on. */

  var WORSHIP_SIDE = ['Worship Team', 'AV Team', 'Youth Worship'];
  /* WORSHIP AND AV ARE ONE TEAM FOR PAGES (Martin, 12 Oct 2026: "if worship
     team want to turn on the sound desk they should be able to see how").
     Someone on any of these counts as on all of them for page checks. Rank
     gates (data-role leader/admin) are unchanged. */
  var WORSHIP_AV = ['Worship Team', 'AV Team', 'Choir'];

  function teamsVisibleTo(teams) {
    var out = teams.slice();
    var onWorshipSide = WORSHIP_SIDE.some(function (t) { return out.indexOf(t) !== -1; });
    if (onWorshipSide) {
      ['Worship Team', 'AV Team'].forEach(function (t) {
        if (out.indexOf(t) === -1) out.push(t);
      });
    }
    coversOf(teams).forEach(function (t) { if (out.indexOf(t) === -1) out.push(t); });
    return out;
  }

  function reallyMaster() {
    return !!(currentProfile && currentProfile.masterAdmin === true);
  }

  function viewAs() {
    if (!reallyMaster()) return null;
    try {
      var raw = sessionStorage.getItem(VIEW_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  /* Sits at the bottom of every page rather than the top, where it would
     fight the navigation bar. Fixed, so it is on screen whatever the page
     does - including the "no access" screen, which is one of the things a
     master admin most needs to be able to see. */
  function mountViewAsBar() {
    if (!reallyMaster()) return;
    /* NOT BEFORE THERE IS A BODY (the audit, 25 Oct 2026: hubresources for
       a master admin at 360). A page that asks for the profile from its
       <head> can have it back first; this threw there, so the page never
       got its profile. */
    if (!document.body) { document.addEventListener('DOMContentLoaded', mountViewAsBar, { once: true }); return; }
    /* NOT INSIDE THE PHONE APP (APP-DESIGN-BRIEF §7e). This is a website
       strip, fixed to the bottom of the page, and in the app it lands on
       top of the tab bar - Martin saw it there and it is half of why the
       app "does not fit the screen". The app offers the same thing as one
       row on Me, master admin only, which is where it belongs.

       The page asks for it to be left out rather than this file knowing
       the app's name, so any other full-screen page can do the same. */
    if (document.documentElement.hasAttribute('data-egbc-no-strips')) return;
    /* And not in app mode either (§7d A): a page the app opened wears the
       app's header and tab bar, and a third strip fixed to the bottom
       would sit on top of the tab bar - which is exactly what Martin saw
       in the app itself. egbc-appmode.js sets the attribute before
       anything draws. */
    if (document.documentElement.hasAttribute('data-egbc-app-mode')) return;

    /* The choices come from the one list (Teams & groups). Pages that never
       asked for it would offer only the built-in table, so ask, and draw
       again once it is here. */
    if (!teamsLoaded) loadTeams().then(function () { if (teamsLoaded) mountViewAsBar(); });

    var bar = document.getElementById('egbc-viewas');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'egbc-viewas';
      document.body.appendChild(bar);
    }

    var v = viewAs();
    /* ONE LINE ON A PHONE (Martin, 11 Oct 2026: the strip "takes two full
       lines at the bottom of a phone screen"). Same controls, same ids,
       same behaviour - shorter words, no wrapping, and it scrolls
       sideways if it still will not fit. Master admin only, as before. */
    var narrow = (global.innerWidth || 1024) < 700;
    bar.style.cssText =
      /* z-index 40: below every page's pop-up windows (Tailwind z-50, the hub's 110),
         so it never covers their buttons. Page content gets matching space below. */
      'position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;align-items:center;' +
      (narrow
        ? 'gap:6px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding:6px 10px;'
        : 'gap:10px;flex-wrap:wrap;padding:10px 16px;') +
      /* Its own line-height and box-sizing, for the same reason the
         select has its own size: this sits on somebody else's page. */
      'font-family:Inter,system-ui,sans-serif;line-height:1.3;box-sizing:border-box;' +
      'font-size:13px;font-weight:500;box-shadow:0 -1px 2px rgba(16,24,40,.05);' +
      (v ? 'background:#b07d2e;color:#fff' : 'background:#fff;color:#374151;border-top:1px solid #e5e7eb');

    /* THE ONE LIST (Martin, 15 Oct 2026): every team and group the church
       has (the teams collection, Teams & groups), in its order, archived ones
       left out - and "Everyone", a church member on no team. */
    var opts = '<option value="' + EVERYONE + '"' + (v && v.team === EVERYONE ? ' selected' : '') + '>Everyone (no team)</option>'
      + teamChoices(Object.keys(TEAMS)).map(function (t) {
      /* Escaped: the office names teams now, on Teams & groups. */
      return '<option value="' + vaEsc(t) + '"' + (v && v.team === t ? ' selected' : '') + '>' +
             vaEsc(TEAMS[t].label || t) + '</option>';
    }).join('');

    bar.innerHTML =
      '<span style="font-weight:600;white-space:nowrap;margin:0;padding:0' + (narrow ? ';flex:none' : '') + '">' +
        (narrow
          ? (v ? 'Seeing as' : 'View as')
          : (v ? (v.team === EVERYONE ? 'Seeing the site as a church member on no team'
                 : 'Seeing the site as a ' + (TEAMS[v.team] ? TEAMS[v.team].label : v.team) +
                 ' ' + (v.admin ? 'admin' : 'member'))
               : 'View the site as')) +
      '</span>' +
      '<select id="egbc-va-team" style="font-family:inherit;font-size:13px;font-weight:500;' +
        /* Own colours: in view-as mode the bar's text is white, and a select inherits it - white names on a white list. */
        'background:#fff;color:#111827;' +
        /* AND ITS OWN SIZE. This is shared chrome sitting on somebody
           else's page, and a page that styles a bare `select` styles
           this one: maintenance.html has
           `.inp,select,textarea{min-height:48px;width:100%}`, which
           pushed the strip onto its own line and made it 61px instead
           of 45. Said here rather than hoped for. */
        /* margin:0 too: Library gives every select margin-bottom:20px. */
        'width:auto;min-width:0;max-width:52vw;min-height:0;margin:0;box-sizing:border-box;flex:none;' +
        'height:32px;border-radius:8px;padding:0 10px;border:1px solid ' +
        (v ? 'rgba(255,255,255,.45)' : '#d1d5db') + '">' +
        '<option value="">Myself</option>' + opts +
      '</select>' +
      /* 'As an admin' only means something once a team is chosen. Ticking it on
         'Myself' used to reload and untick, which looked broken - so it waits. */
      '<label style="display:flex;align-items:center;gap:6px;white-space:nowrap;' +
        /* margin:0 and padding:0 because a page that styles a bare
           `label` styles this one - Library has
           `label{display:block;margin-bottom:8px;padding-left:2px}`. */
        'margin:0;padding:0;min-height:0;font-size:13px;' +
        (narrow ? 'flex:none;' : '') + 'cursor:' + (v ? 'pointer' : 'default;opacity:.55') + '"' +
        (v ? '' : ' title="Choose a team first"') + '>' +
        '<input type="checkbox" id="egbc-va-admin" style="width:16px;height:16px;min-height:0;margin:0;flex:none"' + (v && v.admin ? ' checked' : '') + (v ? '' : ' disabled') + '>' +
        (narrow ? ' admin' : ' as an admin') +
        /* The hint is the first thing to go on a phone: the checkbox is
           already greyed out and carries the same words in its title. */
        (v || narrow ? '' : ' <span style="font-weight:400">(choose a team first)</span>') +
      '</label>' +
      (v ? '<button id="egbc-va-off" style="font-family:inherit;font-size:13px;font-weight:500;' +
           'height:32px;border-radius:8px;padding:0 12px;border:none;cursor:pointer;background:#fff;' +
           'color:#b07d2e;white-space:nowrap;' + (narrow ? 'flex:none' : 'margin-left:auto') + '">' +
           (narrow ? 'Me' : 'Back to myself') + '</button>' : '');

    function apply() {
      var team = document.getElementById('egbc-va-team').value;
      var asAdmin = document.getElementById('egbc-va-admin').checked;
      try {
        if (team) sessionStorage.setItem(VIEW_KEY, JSON.stringify({ team: team, admin: asAdmin }));
        else sessionStorage.removeItem(VIEW_KEY);
      } catch (e) {}
      location.reload();
    }

    /* Room underneath, so the last thing on the page can be scrolled clear of the strip. */
    /* And a page's own bar stuck to the bottom (a Save bar) goes up above
       the strip rather than under it (the audit, 27 Oct 2026: "Save" was
       under #egbc-viewas on Health and safety settings and Permissions).
       Pages draw late, so it looks again a few times. */
    var lift = function () {
      var h = bar.offsetHeight;
      [].forEach.call(document.body.querySelectorAll('*'), function (el) {
        if (el === bar || bar.contains(el) || el.id === 'egbc-tabbar') return;
        var cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
        var was = el.getAttribute('data-egbc-lifted');
        /* Not a pop-up's full-screen backdrop (top and bottom 0): that one covers the strip. */
        if (was === null && (cs.bottom !== '0px' || cs.top === '0px')) return;
        if (was === null) el.setAttribute('data-egbc-lifted', '1');
        el.style.bottom = h + 'px';
      });
    };
    var pad = function () { document.body.style.paddingBottom = (bar.offsetHeight + 12) + 'px'; lift(); };
    pad(); window.addEventListener('resize', pad);
    [600, 2000, 5000].forEach(function (t) { setTimeout(lift, t); });

    document.getElementById('egbc-va-team').onchange = apply;
    document.getElementById('egbc-va-admin').onchange = apply;
    var off = document.getElementById('egbc-va-off');
    if (off) off.onclick = function () {
      try { sessionStorage.removeItem(VIEW_KEY); } catch (e) {}
      location.reload();
    };
    viewAsTop(v);
  }

  /* "VIEWING AS", AT THE TOP OF EVERY PAGE (Martin, 14 Oct 2026: he thought
     permissions were broken - the strip at the bottom was easy to miss).
     While a master admin is looking at the site as somebody else, a strip
     across the very top says so in plain words, with the way back. Part of
     the page, not floating, so it covers nothing. */
  function viewAsTop(v) {
    var top = document.getElementById('egbc-viewas-top');
    if (!v) { if (top) top.remove(); return; }
    var who = v.team === EVERYONE ? 'church member on no team' : String(v.team) + (v.admin ? ' admin' : ' member');
    if (!top) {
      top = document.createElement('div');
      top.id = 'egbc-viewas-top';
      top.setAttribute('role', 'status');
      document.body.insertBefore(top, document.body.firstChild);
    }
    /* THE VERY TOP: the website bar puts itself first too, so this goes back
       above it once the page has drawn. */
    [0, 400, 1500].forEach(function (t) {
      setTimeout(function () { var x = document.getElementById('egbc-viewas-top'); if (x && document.body.firstChild !== x) document.body.insertBefore(x, document.body.firstChild); }, t);
    });
    top.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;'
      + 'padding:8px 12px;background:#b07d2e;color:#fff;font-family:Inter,system-ui,sans-serif;'
      + 'font-size:14px;font-weight:600;line-height:1.3;text-align:center;box-sizing:border-box;width:100%;position:relative;z-index:96';
    top.innerHTML = '<span>Viewing as ' + (/^[aeiou]/i.test(who) ? 'an ' : 'a ') + who.replace(/[<>&]/g, '') + '</span>'
      + '<button type="button" id="egbc-viewas-back" style="font:600 13px Inter,system-ui,sans-serif;min-height:36px;'
      + 'padding:0 14px;border-radius:8px;border:0;background:#fff;color:#7a5418;cursor:pointer">Back to me</button>';
    document.getElementById('egbc-viewas-back').onclick = function () {
      try { sessionStorage.removeItem(VIEW_KEY); } catch (e) {}
      location.reload();
    };
    /* THE VERY TOP AND THE FULL WIDTH, whatever padding the page puts round
       itself (view-only-rota.html has some): pulled out by the same amount,
       and the space given back underneath. */
    try {
      var cs = getComputedStyle(document.body), n = function (v) { return parseFloat(v) || 0; };
      var t = n(cs.paddingTop) + n(cs.marginTop), l = n(cs.paddingLeft) + n(cs.marginLeft), r = n(cs.paddingRight) + n(cs.marginRight);
      top.style.margin = '-' + t + 'px -' + r + 'px ' + t + 'px -' + l + 'px';
      top.style.width = 'calc(100% + ' + (l + r) + 'px)';
    } catch (e) {}
  }

  var EGBCAuth = {

    auth: auth,
    db: db,
    TEAMS: TEAMS,
    ROLES: ROLES,

    /* Resolves with the profile once signed in and authorised.
       Redirects to login (or shows a no-access message) otherwise. */
    require: function (opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        auth.onAuthStateChanged(function (user) {
          if (!user) {
            sessionStorage.setItem('egbc_return_to', location.pathname.split('/').pop() + location.search);
            location.href = LOGIN_PAGE;
            return;
          }

          currentUser = user;

          /* A chosen church the sign-in does not carry is forgotten, and the
             page opens again on the person's own data. */
          if (CHURCH && !global.__egbcChurchChecked) {
            global.__egbcChurchChecked = true;
            user.getIdTokenResult().then(function (t) {
              var c = (t && t.claims && t.claims.churches) || [];
              if (c.indexOf(CHURCH) === -1) {
                try { localStorage.removeItem('egbc-church'); } catch (e) {}
                var u = new URL(location.href); u.searchParams.delete('church');
                location.replace(u.toString());
              }
            });
          }

          /* The teams read goes alongside the profile read, not after it:
             both are needed before a page draws, and one after the other
             would put two round trips in front of every page. It never
             rejects - the built-in table is a complete answer - so it
             cannot stop anybody getting in. */
          Promise.all([loadProfile(user), loadTeams()]).then(function (both) {
            var profile = both[0];
            /* After the profile, because it needs the member id - and the
               Running things tabs are decided before the page draws. */
            return Promise.all([loadBookingsAdmin(profile && profile.memberId), loadBuildingLead(profile && profile.memberId), loadGroupLeadAndDataLead(profile && profile.memberId), loadSermonsAdmin(profile && profile.memberId),
                                loadCareLead(profile && profile.memberId), loadMoneyTeam(), loadTrusteeTeam(profile), loadFeatures(),
                                loadEventTeam(profile, user && user.uid), loadPlanGroups(profile), loadKidsTeams(profile), loadServiceRoles()])
              .then(function () { return both; });
          }).then(function (both) {
            var profile = both[0];
            currentProfile = profile;

            /* A PARENT WHO IS NOT IN THE ADDRESS BOOK (Martin, N-6b; FINDINGS-
               notify N-5.5). They may be called to collect their child, and
               Parents' Sunday is for them, so the app - and only a page that
               asks with data-allow-pending="parent" - lets them in, NARROWLY:
               a VERIFIED address (an unverified one could be anybody who
               typed it), no address book record at all (not 'ambiguous', and
               not "in the book but on no team"), and the page is told, so it
               draws Parents' Sunday and Notifications and nothing else. The
               rules are unchanged: they are 'pending' there as everywhere. */
            if (opts.allowPending === 'parent' && profile.status === 'pending'
                && !profile.memberId && user.emailVerified) {
              profile.parentOnly = true;
              resolve(profile);
              return;
            }

            if (profile.status !== 'active') {
              if (profile.status === 'ambiguous' && profile.candidates && profile.candidates.length) {
                EGBCAuth._choosePage(profile);
                return;
              }

              var title, message;
              if (profile.status === 'ambiguous') {
                title = 'Which of you is this?';
                message = 'That address is shared by more than one person on a team, so we ' +
                          'cannot tell who has signed in. A member of the Core Team needs to ' +
                          'link it to the right person - ask them, then reload this page.' +
                          '<br><br>If you are in the youth group, you want an access code ' +
                          'instead: <a href="youth-access.html" style="color:#5f7a4a;font-weight:800">enter a code</a>.';
              } else if (profile.memberId) {
                title = 'No teams yet';
                message = 'You are in the address book but no teams are ticked against you yet. ' +
                          'Ask a member of the Core Team to tick them, then reload this page.';
              } else {
                title = 'We do not recognise that address';
                message = 'You have signed in with an address the church does not have on file. ' +
                          'Ask a member of the Core Team to link it to your record - they can ' +
                          'see it listed already. Once they do, reload this page.';
              }
              EGBCAuth._blockPage(title, message, profile);
              return;
            }

            var no = guardRefusal(opts, profile);
            /* Book a room counts the office job (team jobs, H-9), which
               loadPerms() reads: asked for only when the answer turns on it. */
            if (no && (opts.leadsOrCore || opts.alsoJob || opts.job) && !PERMS.ready) {
              loadPerms().catch(function () {}).then(function () {
                var again = guardRefusal(opts, profile);
                if (again) { EGBCAuth._blockPage(again[0], again[1], profile); return; }
                mountViewAsBar();
                resolve(profile);
              });
              return;
            }
            if (no) { EGBCAuth._blockPage(no[0], no[1], profile); return; }

            mountViewAsBar();
            resolve(profile);
          }).catch(function (e) {
            console.error('EGBCAuth profile load failed', e);
            EGBCAuth._blockPage('Something went wrong', e.message, null);
          });
        });
      });
    },

    /* Resolves with the profile, or null if signed out. Never redirects. */
    optional: function () {
      return new Promise(function (resolve) {
        auth.onAuthStateChanged(function (user) {
          if (!user) { resolve(null); return; }
          currentUser = user;
          loadProfile(user).then(function (p) {
            currentProfile = p; mountViewAsBar(); resolve(p);
          }).catch(function () { resolve(null); });
        });
      });
    },

    profile: function () { return currentProfile; },
    user: function () { return currentUser; },

    /* The teams that decide what a person can see. A child team (Choir)
       resolves to its parent (Worship Team). The raw markers are left
       untouched on the profile, because the rota still needs them. */
    effectiveTeams: function () {
      var v = viewAs();
      if (v) return v.team === EVERYONE ? [] : [v.team];
      if (!currentProfile) return [];
      var out = [];
      (currentProfile.teams || []).forEach(function (t) {
        var cfg = TEAMS[t];
        var resolved = (cfg && cfg.parent) ? cfg.parent : t;
        if (out.indexOf(resolved) === -1) out.push(resolved);
      });
      return out;
    },

    /* Content tabs. Children fold into their parent; Core Team is not a
       content team, so it is handled separately as the Admin tab. */
    EVERYONE: EVERYONE,
    /* The Home choices (the hub's "Home shows"): every team and group this
       person is in - every one there is for a master admin - in the
       church's order. "Everyone" is added by the page, first. */
    /* "View as" choices, the website's and the app's: every team and group
       in the church's order, nothing archived. Everyone is added first by
       whoever draws the list. */
    viewAsChoices: function () { return teamChoices(Object.keys(TEAMS)); },
    homeChoices: function () {
      return reallyMaster() && !viewAs() ? teamChoices(Object.keys(TEAMS)) : teamChoices(EGBCAuth.tabTeams());
    },

    tabTeams: function () {
      var out = EGBCAuth.effectiveTeams().filter(function (t) {
        return TEAMS[t] && !TEAMS[t].parent;
      });
      /* Karen administers Kids Church without being on the rota for it, so
         the areas someone manages are reachable too. */
      EGBCAuth.adminAreas().forEach(function (t) {
        if (TEAMS[t] && !TEAMS[t].parent && out.indexOf(t) === -1) out.push(t);
      });
      return out;
    },

    /* A CORE TEAM COVERS ITS TEAMS (Martin, 11 Oct 2026: "core team cant see
       worship and AV"; H-15, 26 Oct: each core team only its own). On the
       old portal the Core Team link showed every Worship & AV item plus its
       own, so a member of a core team counts as on each team it covers. */
    inTeam: function (team) {
      var mine = EGBCAuth.effectiveTeams();
      if (mine.indexOf(team) !== -1) return true;
      if (WORSHIP_AV.indexOf(team) !== -1 &&
          mine.some(function (t) { return WORSHIP_AV.indexOf(t) !== -1; })) return true;
      return coversOf(mine).indexOf(team) !== -1;
    },
    /* The teams this person covers through their core teams (H-15). */
    covers: function () { return coversOf(EGBCAuth.effectiveTeams()); },
    /* WHO MAY DO WHAT (H-14): the Permissions screen's answer for this
       person. loadPerms() reads the ticks, the team jobs and the person's
       own exceptions once (and fetches egbc-team-jobs.js and
       egbc-permissions.js if the page did not load them); may(action) is
       false until it has. A master admin may always. */
    /* WOULD A PAGE'S GUARD LET THIS PERSON IN? (the access matrix, H-16).
       opts as the page's egbc-guard.js tag gives them; '' for yes, or the
       refusal's title. The same decision require() makes. */
    guardVerdict: function (opts) {
      var p = currentProfile;
      if (!p) return 'Signed out';
      if (p.status !== 'active') return 'Not active (' + (p.status || 'pending') + ')';
      var no = guardRefusal(opts || {}, p);
      return no ? no[0] : '';
    },
    /* GOOGLE SIGN-IN INSIDE THE INSTALLED APP (26 Oct 2026; Martin's
       Android phone). A redirect leaves the app: Google opens in a browser
       tab, comes back there, and the sign-in's state - kept in the app -
       is missing ("missing initial state"). Here Google Identity Services
       asks instead: One Tap and Google's own button, through the browser's
       FedCM sheet on Chrome for Android, which draws over the app and
       navigates nowhere. Google hands the page an ID token; Firebase signs
       in with it. Nothing changes for the browser, which keeps its redirect
       and popup. */
    isInstalledApp: function () {
      try { return (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) || global.navigator.standalone === true; }
      catch (e) { return false; }
    },
    /* opts: { button: element for Google's button, onDone(), onFail(err) }.
       Resolves once Google's sign-in is on screen; rejects if it cannot load. */
    googleInApp: function (opts) {
      opts = opts || {};
      return loadGis().then(function (google) {
        var id = google.accounts.id;
        id.initialize({
          client_id: GOOGLE_WEB_CLIENT,
          callback: function (r) {
            if (!r || !r.credential) { if (opts.onFail) opts.onFail(new Error('Google did not sign you in.')); return; }
            auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(r.credential))
              .then(function (u) { if (opts.onDone) opts.onDone(u); }, function (e) { if (opts.onFail) opts.onFail(e); });
          },
          use_fedcm_for_prompt: true, use_fedcm_for_button: true, ux_mode: 'popup',
          auto_select: false, itp_support: true, context: 'signin', cancel_on_tap_outside: false
        });
        if (opts.button) {
          id.renderButton(opts.button, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill',
            logo_alignment: 'left', width: Math.max(200, Math.min(400, opts.button.clientWidth || 320)) });
        }
        id.prompt();
        return true;
      });
    },
    loadPerms: function () { return loadPerms(); },
    /* Whether loadPerms() has read the ticks and the team jobs yet. */
    permsReady: function () { return !!PERMS.ready; },
    /* THE PREACHING PLAN (Martin, 26 Oct 2026): assembled and edited by the
       pastors and elders - a master admin, the Pastor (named in Team
       emails) and the church's overall leaders (the "leadership" job; EGBC:
       the Elders). Seen read-only by whoever may use the Rota planner, and
       nobody else. After loadPerms(); false until then. */
    preachingEditor: function () {
      if (EGBCAuth.isMaster()) return true;
      var p = currentProfile || {}, v = viewAs(), TJ = global.EGBCTeamJobs;
      if (!PERMS.ready) return false;
      if (!v && p.memberId && PERMS.pastor === p.memberId) return true;
      return !!TJ && TJ.onJob(PERMS.jobs, EGBCAuth.effectiveTeams(), 'leadership', PERMS.set);
    },
    /* Who may use the Rota planner: a leader (isLeaderOf: admin, leader by
       role, or a core team covering it) of a team the rota is for - the
       worship, children's and youth jobs' teams. After loadPerms(). */
    /* ON A TEAM WITH A ROTA: a team of theirs whose Teams & groups entry
       has a rota (a group - rota: false - has none; a team the list does
       not know counts as none). For the Availability form (the reviewer,
       27 Oct 2026: everyone on a rota team fills it in). View as answers
       for the team being viewed. */
    /* The jobs this person's teams do (churchSettings/teamJobs; H-9), for
       the Menu's `job` entries. After loadPerms(); none until then. View as
       answers for the team being viewed. */
    myJobs: function () {
      var TJ = global.EGBCTeamJobs;
      if (!PERMS.ready || !TJ) return [];
      /* With the teams their core team covers, as the rules' myTeams() has
         them (the events window's F-297: covered teams count everywhere). */
      var own = EGBCAuth.effectiveTeams(), mine = own.concat(coversOf(own));
      return TJ.JOBS.map(function (j) { return j.id; })
        .filter(function (j) { return TJ.onJob(PERMS.jobs, mine, j, PERMS.set); });
    },
    onRotaTeam: function () {
      if (EGBCAuth.isMaster()) return true;
      return EGBCAuth.effectiveTeams().some(function (t) { return !!TEAMS[t] && TEAMS[t].rota !== false; });
    },
    /* [[role name, who]] for a service's slides and cards (H-11): EGBC's
       Service Leader and Speaker unless the church has its own roles. */
    /* Is this kind a service (H-11)? With nothing stored, the page's own
       EGBC list (egbcList) answers, as it always did. */
    isServiceType: function (type, egbcList) {
      if (SERVICES.S && SERVICES.cfg) return SERVICES.S.isService(SERVICES.cfg, type);
      return (egbcList || (SERVICES.S ? SERVICES.S.serviceNames(null) : [])).indexOf(type) !== -1;
    },
    slideRoles: function (ev) {
      if (SERVICES.S) return SERVICES.S.slideRoles(SERVICES.cfg, ev);
      return [['Service Leader', (ev && ev.serviceLeader) || ''], ['Speaker', (ev && ev.speaker) || '']];
    },
    /* The church's teams for a team job (H-9), once loadPerms() has run;
       before then, EGBC's defaults. */
    teamsForJob: function (job) {
      var TJ = global.EGBCTeamJobs;
      return TJ ? TJ.teamsFor(PERMS.ready ? PERMS.jobs : null, job, PERMS.ready ? PERMS.set : {}) : [];
    },
    /* The church's services and service roles (H-11, egbc-services.js):
       resolves { S: EGBCServices, cfg }, with the team jobs loaded too. */
    services: function () {
      return Promise.all([sibling('egbc-services.js', '202610300900'), loadPerms().catch(function () {})])
        .then(function () { return global.EGBCServices.load(db); })
        .then(function (cfg) { return { S: global.EGBCServices, cfg: cfg }; });
    },
    rotaPlannerUser: function () {
      if (EGBCAuth.isMaster()) return true;
      var TJ = global.EGBCTeamJobs;
      if (!PERMS.ready || !TJ) return false;
      return ['worship', 'children', 'youth'].some(function (j) {
        return TJ.teamsFor(PERMS.jobs, j, PERMS.set).some(function (t) { return EGBCAuth.isLeaderOf(t); });
      });
    },
    may: function (id) {
      if (EGBCAuth.isMaster()) return true;
      var P = global.EGBCPermissions, p = currentProfile || {};
      if (!P || !PERMS.ready) return false;
      var cores = {};
      Object.keys(TEAMS).forEach(function (t) { if ((TEAMS[t].coreFor || []).length) cores[t] = TEAMS[t].coreFor; });
      var v = viewAs();
      return P.may({ master: false, teams: EGBCAuth.effectiveTeams(), adminFor: v ? (v.admin ? [v.team] : []) : (p.adminFor || []),
          roles: v ? {} : (p.roles || {}), memberId: v ? '' : (p.memberId || '') },
        id, { perms: PERMS.perms, jobs: PERMS.jobs, set: PERMS.set, exceptions: v ? [] : PERMS.exceptions, cores: cores,
              today: localDayIso(), TJ: global.EGBCTeamJobs });
    },
    /* Pin boards (26 Oct 2026): every board, and this person's - on one of
       its teams, administering one, or on a core team covering one. A
       master admin may open every board. None is none: no fallback. */
    boards: function () { return boards(); },
    myBoards: function () {
      return boards().filter(function (b) {
        return EGBCAuth.isMaster() || b.teams.some(function (t) { return EGBCAuth.inTeam(t) || EGBCAuth.isAdminOf(t); });
      });
    },
    /* The same for any teams (the hub's Home choice asks about one). */
    coversOfTeams: function (teams) { return coversOf(teams || []); },
    isCoreTeam: function (team) { return !!(TEAMS[team] && (TEAMS[team].coreFor || []).length); },
    /* LEADS A TEAM, OR IS ON A CORE TEAM (Martin, 26 Oct 2026: "Book a room:
       core teams and team leaders only"). A master admin; anybody who
       administers a team; a leader by role on one; anybody on a core team.
       The Menu, the app and a page's data-leads guard all ask this. View
       as answers for the person being viewed (roles are not previewed, so
       they count only when not previewing). */
    leadsOrCore: function () {
      if (EGBCAuth.isMaster()) return true;
      if (((EGBCAuth.adminAreas ? EGBCAuth.adminAreas() : (currentProfile || {}).adminFor) || []).length) return true;
      var roles = (currentProfile || {}).roles || {};
      if (!(EGBCAuth.viewingAs && EGBCAuth.viewingAs())
          && Object.keys(roles).some(function (t) { return roleAtLeast(roles, t, 'leader'); })) return true;
      return EGBCAuth.effectiveTeams().some(function (t) { return EGBCAuth.isCoreTeam(t); });
    },
    /* BOOK A ROOM (Martin, 27 Oct 2026: "also for the office and the
       bookings admins"): leadsOrCore(), or on a team doing the office job
       (after loadPerms()), or a site's bookings admin. The Menu, the app's
       What's on and rooms.html's data-leads guard all ask this. The
       bookings admins are never previewed into. */
    /* Leads a building for health and safety or fire safety (the Menu's
       Building risk assessments). Never previewed into. */
    /* Never previewed into, as isBuildingLead. */
    isGroupLeader: function () { return !(EGBCAuth.viewingAs && EGBCAuth.viewingAs()) && groupLeader; },
    /* An admin of a kids team (View as answers for the person viewed as),
       or a kids group's leader (never previewed into). */
    isKidsLead: function () {
      /* With no kids settings yet, the teams doing the children job. */
      var TJ = global.EGBCTeamJobs;
      var teams = kidsTeams.length ? kidsTeams : (PERMS.ready && TJ ? TJ.teamsFor(PERMS.jobs, 'children', PERMS.set) : []);
      return teams.some(function (t) { return EGBCAuth.isAdminOf(t); })
        || (!(EGBCAuth.viewingAs && EGBCAuth.viewingAs()) && kidsGroupLeader);
    },
    isDataLead: function () { return !(EGBCAuth.viewingAs && EGBCAuth.viewingAs()) && dataLead; },
    isBuildingLead: function () { return !(EGBCAuth.viewingAs && EGBCAuth.viewingAs()) && buildingLeadOf.length > 0; },
    mayBookRoom: function () {
      if (EGBCAuth.leadsOrCore()) return true;
      if (EGBCAuth.myJobs().indexOf('office') !== -1) return true;
      return !(EGBCAuth.viewingAs && EGBCAuth.viewingAs()) && bookingsAdminOf.length > 0;
    },
    /* Whether any of these teams (or what they cover) has a plan group. */
    planGroupFor: function (teams) {
      var all = (teams || []).concat(coversOf(teams || []));
      return planGroups.some(function (g) { return g.teamName && all.indexOf(g.teamName) !== -1; });
    },

    /* Can act on this area: either they administer it, or they are on it. */
    /* A LEADER OF THIS TEAM, as a page's data-role="leader" guard decides it
       (require() below): a master admin, the team's leader or admin, or a
       core team covering it (H-15). The Menu asks this, so it never offers
       a page that then says "Not enough permissions" (audit, 15 Oct 2026). */
    isLeaderOf: function (team) {
      if (EGBCAuth.isMaster()) return true;
      var p = currentProfile || {};
      if (!(EGBCAuth.viewingAs && EGBCAuth.viewingAs()) && roleAtLeast(p.roles, team, 'leader')) return true;
      if (EGBCAuth.isAdminOf(team)) return true;
      return coversOf(EGBCAuth.effectiveTeams()).indexOf(team) !== -1;
    },
    hasRole: function (team) {
      return EGBCAuth.isAdminOf(team) || EGBCAuth.inTeam(team);
    },

    /* Three levels.
         masterAdmin  - everything, everywhere, including making admins
         adminFor[]   - manages those areas only
         member       - their own team's pages, plus anything open to everyone  */

    /* The four levels, for a page deciding what to draw. Section 21 says
       members-only things are HIDDEN rather than shown locked, so a page asks
       these before it draws, not after somebody has pressed something. */
    /* Call one of the hub's functions, signed in. The page does not repeat
       the region or the emulator port, and does not need a fourth Firebase
       script tag to do it - see callFunction above. */
    /* opts.timeoutMs: how long to wait before giving up, for the few calls
       that take longer than the usual 8 seconds (the reviewing window, 23
       Oct 2026: the safeguarding AI draft takes about 45 seconds). Capped
       at 9 minutes, a function's own longest; without it, 8 seconds as
       before. */
    call: function (name, data, opts) {
      var t = opts && Number(opts.timeoutMs);
      return callFunction(name, data, t > 0 ? Math.min(t, 540000) : undefined);
    },
    /* The address of one of the hub's functions - the emulator's on the
       emulator, the live one otherwise - for a page that has to reach it
       some other way, e.g. a beacon as the page closes (reviewing window,
       22 Oct 2026: egbc-present.js worked this out a second time). The
       same address call() posts to. */
    functionUrl: function (name) {
      return FUNCTIONS_BASE + '/' + encodeURIComponent(String(name || ''));
    },

    /* THE CHURCHES THIS PERSON BELONGS TO (multi-church step 1): the
       server keeps them in the sign-in's claims (functions/hq-directory.js).
       fresh: true asks for a new token first, for straight after a change.
       Resolves to a list of church ids; [] when signed out or in none. */
    /* The church this page is for (H-6), or '' for EGBC's top-level data. */
    churchId: function () { return CHURCH; },
    /* A link to another page of this church's: on today's shared address
       the church goes with it; on the church's own address it is not needed. */
    churchLink: function (url) {
      if (!CHURCH) return url;
      var u = new URL(url, location.href); u.searchParams.set('church', CHURCH);
      return u.pathname.split('/').pop() + u.search + u.hash;
    },
    churches: function (fresh) {
      if (!auth || !auth.currentUser) return Promise.resolve([]);
      return auth.currentUser.getIdTokenResult(!!fresh).then(function (t) {
        var c = t && t.claims && t.claims.churches;
        return Array.isArray(c) ? c.slice() : [];
      }, function () { return []; });
    },

    /* EVERY EMAIL A PAGE SENDS (Martin, 21 Oct 2026: "v2 doesn't use Calla
       at all"): through the hub's hubSend, which asks who may send to whom
       and sends through Church HQ's Resend. msg: { source, ref?, to,
       subject, html, replyTo?, attachments? }. NEVER REJECTS - it answers
       { ok, error, sent, failed } the way the old send service did, so a
       page's own "it did not send" path still works. Up to five minutes:
       a term's rotas with their PDFs take a while. */
    sendEmail: function (msg) {
      if (!auth || !auth.currentUser) return Promise.resolve({ ok: false, error: 'Please sign in to send email.' });
      return callFunction('hubSend', msg || {}, 300000).then(function (r) {
        return { ok: !!(r && r.ok), error: (r && r.error) || '', sent: (r && r.sent) || 0, failed: (r && r.failed) || [], stubbed: !!(r && r.stubbed) };
      }, function (e) {
        return { ok: false, error: (e && e.message) || String(e), code: (e && e.code) || '' };
      });
    },

    isAttender: function () {
      return !!(currentProfile && currentProfile.attender === true);
    },

    isChurchMember: function () {
      return !!(currentProfile && currentProfile.churchMember === true);
    },

    /* What "signed in and allowed in" used to mean: on a team, or
       administering something. A page that is for volunteers asks this, not
       whether somebody is signed in. */
    isVolunteer: function () {
      if (!currentProfile) return false;
      return (currentProfile.teams || []).length > 0
             || (currentProfile.adminFor || []).length > 0
             || currentProfile.masterAdmin === true;
    },

    /* Which video rooms are for Church members only (NEXT-BRIEF 21). One
       list, read by meeting.html and hub-app.js, which each hold their own
       copy of the room names and would otherwise each need their own copy of
       this too.

       NOTE FOR THE DAY THIS GOES LIVE: the tick defaults to off, so until the
       office has ticked people, CMM is invisible to everybody. */
    MEMBERS_ONLY_ROOMS: ['CMM'],

    mayJoinRoom: function (room) {
      if (EGBCAuth.MEMBERS_ONLY_ROOMS.indexOf(room) === -1) return true;
      return EGBCAuth.isChurchMember();
    },

    /* MEETINGS (27 Oct 2026; Martin: "The only meetings a non-admin should
       see is the ones they are invited to. They can be given permission
       (e.g. a small group leader) but not by default."). One rule for every
       list and every join: Meetings (meeting.html), the hub's card, Core
       Team > Meetings and the app's (egbc-core-meetings.js).
       Invited: named on it (a role on the rota, an invitee, whoever set it
       up), or it is for one of my teams or a team my core team covers. More
       is the Permissions screen's "meetingsAll", never on by default; a
       master admin sees all. A members' meeting keeps its own rule. */
    seesAllMeetings: function () { return EGBCAuth.isMaster() || EGBCAuth.may('meetingsAll'); },
    invitedTo: function (ev) {
      if (!ev || ev.archived) return false;
      var room = global.EGBCVideo ? global.EGBCVideo.roomFor(ev) : (ev.videoRoom || '');
      if (room && !EGBCAuth.mayJoinRoom(room)) return false;
      if (EGBCAuth.seesAllMeetings()) return true;
      if (room && EGBCAuth.MEMBERS_ONLY_ROOMS.indexOf(room) !== -1) return true;
      var mine = EGBCAuth.effectiveTeams();
      mine = mine.concat(coversOf(mine));
      if ((ev.teams || []).some(function (t) { return mine.indexOf(t === 'Youth' ? 'Youth Worship' : t) !== -1; })) return true;
      if (viewAs()) return false;
      var mid = (currentProfile && currentProfile.memberId) || '';
      if (currentUser && ev.organiserUid && ev.organiserUid === currentUser.uid) return true;
      if (mid && (ev.invitees || []).indexOf(mid) !== -1) return true;
      return !!mid && Object.keys(ev.assignments || {}).some(function (k) {
        var raw = ev.assignments[k];
        return (Array.isArray(raw) ? raw : [raw]).some(function (x) { return x && x.id === mid; });
      });
    },
    /* The rooms listed for me, and the ones I may open with no meeting:
       my teams' rooms (or covered, or administered), and the members' room
       for a member. */
    roomForMe: function (room) {
      if (!room || !EGBCAuth.mayJoinRoom(room)) return false;
      if (EGBCAuth.seesAllMeetings()) return true;
      var Vd = global.EGBCVideo;
      if (EGBCAuth.MEMBERS_ONLY_ROOMS.indexOf(room) !== -1 || (Vd && Vd.members && Vd.members(room))) return true;
      var mine = EGBCAuth.effectiveTeams();
      mine = mine.concat(coversOf(mine));
      var admin = EGBCAuth.adminAreas ? EGBCAuth.adminAreas() : [];
      var teams = Vd ? Vd.teams(room).concat(Vd.hostTeams(room)) : [];
      return teams.some(function (t) { return mine.indexOf(t) !== -1 || admin.indexOf(t) !== -1; });
    },

    isMaster: function () {
      if (viewAs()) return false;
      return reallyMaster();
    },

    /* For the preview bar itself, which must survive being someone else. */
    isReallyMaster: reallyMaster,
    roleTeam: roleTeam,
    KIDS_ROLES: KIDS_ROLES,
    AV_ROLES: AV_ROLES,

    /* Every rota slot this person should see. null means all of them. */
    visibleRoleTeams: function () {
      if (EGBCAuth.isMaster()) return null;
      var mine = EGBCAuth.effectiveTeams() || [];
      var admin = EGBCAuth.adminAreas() || [];
      admin.forEach(function (t) { if (mine.indexOf(t) === -1) mine.push(t); });
      return mine.length ? teamsVisibleTo(mine) : null;
    },
    viewingAs: viewAs,

    /* ---- Running things: which tabs, and why (NEXT-BRIEF §25) --------

       Martin: "the church Admin might not be core team" and "we do need to
       be able to set groups though so we dont have to individual tick 130
       profiles."

       spacesFor() used to give the whole Running things space to anyone who
       administered anything, or was on Core Team. That is wrong BOTH ways:
       the church administrator may well not be on Core Team, and a Worship
       admin should not get People and Send because they look after Worship.

       SO ACCESS IS SET ON A GROUP, AND PEOPLE ARE PUT IN THE GROUP. A group
       is a team with rota:false carrying `runs`, the tabs its members see.
       Church office has all four; Bookings has Bookings.

       What a person sees adds up from three places, and nothing else:
         - the `runs` of every team or group they are in
         - their own one-off ticks, for the odd exception
         - Bookings, if they are a bookings admin of any site
       A master admin sees all four. CORE TEAM AND "ADMIN FOR" GIVE NOTHING
       by themselves - that is the whole point.

       ONE ANSWER FOR BOTH SCREENS. The app's Running things space and the
       computer's Menu ask this same function, so a person cannot be offered
       a thing on one and refused it on the other.

       VIEW-AS HONOURS IT: a master admin looking as somebody else sees what
       that person sees, or the feature is useless for checking this. */
    /* Looks after sermons and Watch: named in sermonShow/access, or a
       master admin. */
    isSermonsAdmin: function () { return EGBCAuth.isMaster() || sermonsAdmin; },
    /* On the team of at least one event (F-212). Not while previewing. */
    isOnEventTeam: function () { return !viewAs() && eventTeam; },

    /* Whether this church uses a part (above). features() lists them all,
       with each one's default and what is stored, for Church settings. */
    uses: function (name) { return usesFeature(name); },
    features: function () {
      return FEATURES.map(function (f) { return { name: f.name, label: f.label, byDefault: f.on, addOn: !!f.addOn, on: usesFeature(f.name) }; });
    },
    reloadFeatures: function () { return loadFeatures(); },

    /* Leads a plan group or is on its team (session-planner.html), or a
       master admin. Viewing as a team: whether that team plans with it. */
    isOnPlanGroup: function () {
      if (EGBCAuth.isMaster()) return true;
      var teams = EGBCAuth.effectiveTeams() || [];
      teams = teams.concat(coversOf(teams));   /* a core team's groups too (H-15) */
      var mid = viewAs() ? '' : ((currentProfile || {}).memberId || '');
      return planGroups.some(function (g) { return (mid && g.leaderIds.indexOf(mid) !== -1) || (g.teamName && teams.indexOf(g.teamName) !== -1); });
    },

    /* Headcounts (headcounts.html): a master admin, or an admin of a team
       the children's settings name - EGBCEvents.mayHeadcount()'s answer,
       without a read of its own, so the Menu can draw at once. */
    mayHeadcount: function () {
      if (EGBCAuth.isMaster()) return true;
      return (EGBCAuth.adminAreas() || []).some(function (t) { return kidsTeams.indexOf(t) !== -1; });
    },

    /* The money team's name (Payments in the Menu). */
    moneyTeam: function () { return moneyTeam; },

    /* The safeguarding lead or deputy (careRouting/status, kept by the
       server). For the Menu's Safeguarding; never previewed into. */
    isSafeguardingLead: function () { return !(EGBCAuth.viewingAs && EGBCAuth.viewingAs()) && sgLead; },
    /* On the trustees' team (the rules' onTeam(sgTrusteeTeam())), as seen -
       View as answers for the person being viewed as. */
    /* By the trustees job once the team jobs are read (F-297: a church that
       gives it to its PCC in team jobs), the setting's team until then. */
    isSgTrustee: function () {
      if (PERMS.ready && global.EGBCTeamJobs) return EGBCAuth.myJobs().indexOf('trustees') !== -1;
      return EGBCAuth.inTeam(trusteeTeam);
    },

    /* Reads Care & support's inbox: the Pastoral team, or the safeguarding
       lead or deputy. NOT a master admin as such - the rules do not let
       one read it, so the Menu does not offer it. View-as honoured through
       effectiveTeams; the lead is never previewed into. */
    /* Never previewed into: being named belongs to the person. */
    isPastoralVisitor: function () { return !(EGBCAuth.viewingAs && EGBCAuth.viewingAs()) && pastoralVisitor; },
    isPastoralLead: function () { return !(EGBCAuth.viewingAs && EGBCAuth.viewingAs()) && pastoralLead; },
    isCareReader: function () {
      if (EGBCAuth.viewingAs && EGBCAuth.viewingAs()) return (EGBCAuth.effectiveTeams() || []).indexOf('Pastoral') !== -1;
      return careLead || (EGBCAuth.effectiveTeams() || []).indexOf('Pastoral') !== -1;
    },

    runsTabs: function () {
      var ORDER = ['today', 'people', 'bookings', 'send'];
      var v = viewAs();

      /* A master admin sees everything. isMaster() ALREADY returns false
         while viewing as somebody else, so the `!v` here is belt and
         braces rather than the mechanism - removing it changed no test,
         which is how that was established rather than assumed. What makes
         view-as work is the `teams` line below, and breaking THAT is
         caught at once. */
      if (EGBCAuth.isMaster() && !v) return ORDER.slice();

      var p = currentProfile || {};
      var out = {};

      /* Looking as somebody else: their team is all we are told, so the
         answer is that team's runs and nothing personal. */
      var teams = v ? [v.team] : (p.teams || []);
      teams.forEach(function (t) {
        var cfg = TEAMS[t];
        if (!cfg || !cfg.runs) return;
        cfg.runs.forEach(function (r) { out[r] = true; });
      });

      if (!v) {
        /* One-off ticks on the person's own record, for the exception the
           groups do not cover. */
        (Array.isArray(p.runs) ? p.runs : []).forEach(function (r) { out[r] = true; });
        /* A site's bookings admin decides that site's bookings, so refusing
           them the Bookings tab would be a tab missing from somebody who
           can already do the work (F-141.4). */
        if (bookingsAdminOf.length) out.bookings = true;
      }

      return ORDER.filter(function (r) { return out[r]; });
    },

    /* Does this person run anything at all? The space is offered only if
       this is at least one tab, so nobody gets an empty Running things. */
    runsThings: function () { return EGBCAuth.runsTabs().length > 0; },

    /* Manages this particular area. */
    isAdminOf: function (team) {
      var v = viewAs();
      /* An admin of a core team administers the teams it covers (H-15). */
      if (v) return !!v.admin && (v.team === team || coversOf([v.team]).indexOf(team) !== -1);
      if (!currentProfile) return false;
      if (currentProfile.masterAdmin === true) return true;
      var mine = currentProfile.adminFor || [];
      return mine.indexOf(team) !== -1 || coversOf(mine).indexOf(team) !== -1;
    },

    /* Manages anything at all - used to decide whether to show admin at all. */
    isAdmin: function () {
      var v = viewAs();
      if (v) return !!v.admin;
      if (!currentProfile) return false;
      return currentProfile.masterAdmin === true || (currentProfile.adminFor || []).length > 0;
    },

    /* Every area this person administers. */
    adminAreas: function () {
      var v = viewAs();
      /* With the teams their core teams cover (H-15). */
      if (v) return v.admin ? [v.team].concat(coversOf([v.team])) : [];
      if (!currentProfile) return [];
      if (currentProfile.masterAdmin === true) return Object.keys(TEAMS);
      var mine = (currentProfile.adminFor || []).slice();
      return mine.concat(coversOf(mine));
    },

    isOwner: function () { return EGBCAuth.isMaster(); },
    isAnyAdmin: function () { return EGBCAuth.isAdmin(); },

    /* Everything that shares our sign-in must use EGBCAuth.db (declared
       above) and these, rather than firebase.firestore() / firebase.storage(),
       which reach for the default app - the one that now belongs to the page,
       not to us. */
    app: app,
    storage: function () { return firebase.storage(app); },

    chooseIdentity: chooseIdentity,

    signOut: function () {
      return auth.signOut().then(function () { location.href = LOGIN_PAGE; });
    },

    hubUrl: HUB_PAGE,
    loginUrl: LOGIN_PAGE,

    /* Small sign-out header, so every page gets the same one. */
    mountUserChip: function (containerId) {
      var el = document.getElementById(containerId);
      if (!el || !currentProfile) return;
      var initials = (currentProfile.name || currentProfile.email || '?')
        .split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
      var onHub = location.pathname.split('/').pop() === HUB_PAGE;
      /* DESIGN.md: 13px controls in sentence case, 8px corners, the initials
         in a tinted square rather than a dark circle. Inline styles, because
         the pages that mount this do not all load the same stylesheet. */
      var L = 'font:500 13px Inter,system-ui,sans-serif;color:#6b7280;text-decoration:none;'
            + 'padding:6px 8px;border-radius:8px;cursor:pointer;background:none;border:none';
      el.innerHTML =
        '<div style="display:flex;align-items:center;gap:8px">' +
          (onHub ? '' : '<a href="' + HUB_PAGE + '" style="' + L + '">Hub</a>') +
          '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e5e7eb;' +
            'border-radius:8px;padding:4px 10px 4px 4px">' +
            '<div style="width:28px;height:28px;border-radius:8px;background:#eef5f4;color:#3d6263;' +
              'display:flex;align-items:center;justify-content:center;font:600 12px Inter,system-ui,sans-serif">' + initials + '</div>' +
            '<span style="font:500 14px Inter,system-ui,sans-serif;color:#111827">' + (currentProfile.name || currentProfile.email) + '</span>' +
          '</div>' +
          '<button onclick="EGBCAuth.signOut()" style="' + L + '">Sign out</button>' +
        '</div>';
    },

    _choosePage: function (profile) {
      var pickable = profile.candidates.filter(function (c) { return !c.admin; });
      var locked   = profile.candidates.filter(function (c) { return c.admin; });

      var body = pickable.map(function (c) {
        return '<button onclick="EGBCAuth.chooseIdentity(\'' + c.id + '\')" ' +
          'style="display:block;width:100%;background:#fff;border:1px solid #dde7e6;border-radius:16px;' +
          'padding:16px 20px;margin-bottom:10px;font-family:inherit;font-size:15px;font-weight:700;' +
          'color:#14201f;cursor:pointer;text-align:left">' + c.name + '</button>';
      }).join('');

      if (locked.length) {
        body += locked.map(function (c) {
          return '<button onclick="EGBCAuth.chooseIdentity(\'' + c.id + '\')" ' +
            'style="display:block;width:100%;background:#f6efe1;border:1px solid #e8d9b8;border-radius:16px;' +
            'padding:16px 20px;margin-bottom:10px;font-family:inherit;font-size:15px;font-weight:700;' +
            'color:#8a5f1e;cursor:pointer;text-align:left">' + c.name +
            '<div style="font-size:11px;font-weight:600;margin-top:3px;opacity:.8">Core Team</div></button>';
        }).join('');
        body += '<div style="background:#fff;border:1px solid #e8d9b8;border-radius:16px;padding:14px 18px;margin-top:2px">' +
          '<div style="font-size:12px;font-weight:800;color:#8a5f1e;margin-bottom:4px">Core Team</div>' +
          '<div style="font-size:11.5px;color:#8a5f1e;line-height:1.55">' +
            (locked.length === 1 ? 'This one is' : 'These are') + ' on the Core Team. Tap to continue - ' +
            'if another administrator already exists, they will need to do the linking instead.' +
          '</div></div>';
      }

      document.body.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;' +
        'font-family:Montserrat,system-ui,sans-serif;background:#eef4f3;color:#14201f">' +
          '<div style="background:#fff;border:1px solid #dde7e6;border-radius:24px;padding:44px;max-width:440px;' +
          'box-shadow:0 18px 48px rgba(20,32,31,.12)">' +
            '<h1 style="font-size:20px;font-weight:900;margin:0 0 12px;text-align:center">Which of you is this?</h1>' +
            '<p style="font-size:14px;line-height:1.6;color:#3a4d4c;margin:0 0 24px;text-align:center">' +
              'More than one person uses ' + profile.email + '. Pick yourself to carry on.</p>' +
            body +
            '<div style="text-align:center;margin-top:18px">' +
              '<button onclick="EGBCAuth.signOut()" style="background:none;border:none;font-size:10px;font-weight:900;' +
              'text-transform:uppercase;letter-spacing:.1em;color:#6b8281;cursor:pointer;font-family:inherit">Sign out</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    },

    _blockPage: function (title, message, profile) {
      /* egbc-guard.js hides the body until the check passes, and puts a
         splash on top of it. Both are still in place when we get here, so
         writing the explanation into the body renders it invisible - which
         is a blank teal screen and no way to tell what went wrong. Clear
         them first. */
      var hide = document.getElementById('egbc-guard-style');
      if (hide && hide.parentNode) hide.parentNode.removeChild(hide);
      var splash = document.getElementById('egbc-guard-splash');
      if (splash && splash.parentNode) splash.parentNode.removeChild(splash);

      /* A door is not a page, and anything looking at this body has to be
         able to tell. The style check used to measure this screen as though
         it were the page behind it: it put 57 DESIGN.md faults on CoreTeamApp
         that belong to this card - and, far worse, it would have reported a
         clean 0 on a page it had never opened. One attribute settles it. */
      document.body.setAttribute('data-egbc-blocked', title || 'blocked');

      /* THE PAGE IS PUT AWAY, NOT DELETED (the reviewing window's audit,
         15 Oct 2026: Planner, Sunday Service Planner, Forms and others threw
         "Cannot set properties of null" underneath this card, because their
         own scripts carried on and found their elements gone). Its content
         goes into a hidden, inert box - still in the document for those
         scripts, never seen or reachable - and the card goes on top. The
         website's own bars stay, so there is still a way on. */
      var keep = { 'egbc-bar': 1, 'egbc-viewas': 1, 'egbc-viewas-top': 1, 'egbc-tabbar': 1 };
      var away = document.getElementById('egbc-blocked-page');
      if (!away) {
        away = document.createElement('div');
        away.id = 'egbc-blocked-page';
        away.hidden = true;
        away.setAttribute('inert', '');
        away.setAttribute('aria-hidden', 'true');
        Array.prototype.slice.call(document.body.childNodes).forEach(function (n) {
          if (n.nodeType === 1 && (keep[n.id] || n.tagName === 'SCRIPT' || n.tagName === 'STYLE')) return;
          away.appendChild(n);
        });
        document.body.appendChild(away);
      }
      var old = document.getElementById('egbc-blocked-card');
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var card = document.createElement('div');
      card.id = 'egbc-blocked-card';
      document.body.appendChild(card);
      card.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;' +
        'font-family:Montserrat,system-ui,sans-serif;background:#eef4f3;color:#14201f">' +
          '<div style="background:#fff;border:1px solid #dde7e6;border-radius:24px;padding:48px;max-width:460px;text-align:center;' +
          'box-shadow:0 18px 48px rgba(20,32,31,.12)">' +
            '<div style="font-size:40px;margin-bottom:16px;opacity:.3">&#128274;</div>' +
            '<h1 style="font-size:20px;font-weight:900;margin:0 0 12px">' + title + '</h1>' +
            '<p style="font-size:14px;line-height:1.6;color:#3a4d4c;margin:0 0 28px">' + message + '</p>' +
            (profile ? '<p style="font-size:11px;color:#93a8a6;margin:0 0 20px">Signed in as ' + profile.email + '</p>' : '') +
            '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
              '<a href="' + HUB_PAGE + '" style="background:#3d6263;color:#fff;padding:12px 28px;border-radius:999px;' +
              'font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;text-decoration:none">Back to hub</a>' +
              '<button onclick="EGBCAuth.signOut()" style="background:#fff;border:1px solid #dde7e6;padding:12px 24px;' +
              'border-radius:999px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;' +
              'font-family:inherit;color:#3d6263">Sign out</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      /* The bar lives in the body this just replaced. Put it back - being
         refused is one of the things most worth previewing. */
      mountViewAsBar();
    }
  };

  global.EGBCAuth = EGBCAuth;

  /* A NEW CHURCH'S SETUP (the setup frame): a page opened from setup.html
     has setup=1 in its address and shows the setup bar (egbc-setup.js) once
     the page is ready. Nothing for any other page. */
  try {
    if (new URLSearchParams(location.search).get('setup') === '1') {
      document.addEventListener('egbc-ready', function () {
        sibling('egbc-setup.js', '202610301400').then(function () { if (global.EGBCSetup) global.EGBCSetup.bar(); });
      }, { once: true });
    }
  } catch (e) {}

})(window);
