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
    authDomain: "egbc-worship-planner.firebaseapp.com",
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
  var db = firebase.firestore(app);

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

  function callFunction(name, data) {
    return auth.currentUser.getIdToken().then(function (idToken) {
      var stop = null;
      var opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
        body: JSON.stringify({ data: data || {} })
      };
      /* AbortController is everywhere we support, but a page that cannot
         abort should still send rather than refuse to work. */
      if (typeof AbortController !== 'undefined') {
        var ac = new AbortController();
        opts.signal = ac.signal;
        stop = setTimeout(function () { ac.abort(); }, CALL_TIMEOUT_MS);
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
      if (body && body.error) throw new Error((body.error && body.error.message) || 'refused');
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
      auth.useEmulator('http://localhost:' + EMU.auth);
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

  var TEAMS = {
    'Worship Team':  { label: 'Worship',      colour: '#3d6263' },
    'AV Team':       { label: 'AV',           colour: '#4a5f7a' },
    'Choir':         { label: 'Choir',        colour: '#7a4a5f', parent: 'Worship Team' },
    'Youth Worship': { label: 'Youth',        colour: '#5f7a4a' },
    'Kids Church':   { label: 'Kids Church',  colour: '#7a5f4a' },
    'Lazers':        { label: 'Lazers',       colour: '#8a4a3d' },
    'ReNu':          { label: 'ReNu',         colour: '#3d6b5f' },
    'Core Team':     { label: 'Core Team',    colour: '#6b4a7a' }
  };

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
        return provisionProfile(user);
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

  function provisionProfile(user) {
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

     Core Team is here too. They administer Worship and AV, and several of
     them serve, so scoping them to "Core Team" - which owns no rota slots -
     showed the people who run the rota a rota with nothing in it.

     Kids Church is the one that stays separate. That is the whole point of
     scoping it - and someone on Kids Church AND Worship gets both, because
     the list is a union of everything they are on. */

  var WORSHIP_SIDE = ['Worship Team', 'AV Team', 'Youth Worship', 'Core Team'];

  function teamsVisibleTo(teams) {
    var out = teams.slice();
    var onWorshipSide = WORSHIP_SIDE.some(function (t) { return out.indexOf(t) !== -1; });
    if (onWorshipSide) {
      ['Worship Team', 'AV Team'].forEach(function (t) {
        if (out.indexOf(t) === -1) out.push(t);
      });
    }
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

    var bar = document.getElementById('egbc-viewas');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'egbc-viewas';
      document.body.appendChild(bar);
    }

    var v = viewAs();
    bar.style.cssText =
      /* z-index 40: below every page's pop-up windows (Tailwind z-50, the hub's 110),
         so it never covers their buttons. Page content gets matching space below. */
      'position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;align-items:center;' +
      'gap:10px;flex-wrap:wrap;padding:10px 16px;font-family:Inter,system-ui,sans-serif;' +
      'font-size:13px;font-weight:500;box-shadow:0 -1px 2px rgba(16,24,40,.05);' +
      (v ? 'background:#b07d2e;color:#fff' : 'background:#fff;color:#374151;border-top:1px solid #e5e7eb');

    var teams = Object.keys(TEAMS).filter(function (t) { return !TEAMS[t].parent; });
    var opts = teams.map(function (t) {
      return '<option value="' + t + '"' + (v && v.team === t ? ' selected' : '') + '>' +
             (TEAMS[t].label || t) + '</option>';
    }).join('');

    bar.innerHTML =
      '<span style="font-weight:600">' +
        (v ? 'Seeing the site as a ' + (TEAMS[v.team] ? TEAMS[v.team].label : v.team) +
             ' ' + (v.admin ? 'admin' : 'member')
           : 'View the site as') +
      '</span>' +
      '<select id="egbc-va-team" style="font-family:inherit;font-size:13px;font-weight:500;' +
        /* Own colours: in view-as mode the bar's text is white, and a select inherits it - white names on a white list. */
        'background:#fff;color:#111827;' +
        'height:32px;border-radius:8px;padding:0 10px;border:1px solid ' +
        (v ? 'rgba(255,255,255,.45)' : '#d1d5db') + '">' +
        '<option value="">Myself</option>' + opts +
      '</select>' +
      /* 'As an admin' only means something once a team is chosen. Ticking it on
         'Myself' used to reload and untick, which looked broken - so it waits. */
      '<label style="display:flex;align-items:center;gap:6px;cursor:' + (v ? 'pointer' : 'default;opacity:.55') + '"' +
        (v ? '' : ' title="Choose a team first"') + '>' +
        '<input type="checkbox" id="egbc-va-admin"' + (v && v.admin ? ' checked' : '') + (v ? '' : ' disabled') + '> as an admin' +
        (v ? '' : ' <span style="font-weight:400">(choose a team first)</span>') +
      '</label>' +
      (v ? '<button id="egbc-va-off" style="font-family:inherit;font-size:13px;font-weight:500;' +
           'height:32px;border-radius:8px;padding:0 12px;border:none;cursor:pointer;background:#fff;' +
           'color:#b07d2e;margin-left:auto">Back to myself</button>' : '');

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
    var pad = function () { document.body.style.paddingBottom = (bar.offsetHeight + 12) + 'px'; };
    pad(); window.addEventListener('resize', pad);

    document.getElementById('egbc-va-team').onchange = apply;
    document.getElementById('egbc-va-admin').onchange = apply;
    var off = document.getElementById('egbc-va-off');
    if (off) off.onclick = function () {
      try { sessionStorage.removeItem(VIEW_KEY); } catch (e) {}
      location.reload();
    };
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

          loadProfile(user).then(function (profile) {
            currentProfile = profile;

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

            /* Pages open to anyone who administers something - the address
               book, for instance, where Karen manages Kids Church and the
               Core Team manage Worship and AV. */
            if (opts.adminAny && !EGBCAuth.isAdmin()) {
              EGBCAuth._blockPage(
                'Admins only',
                'This page is for people who manage a team. If you think you should ' +
                'have access, ask a member of the Core Team.',
                profile
              );
              return;
            }

            /* A page can name more than one team, comma separated. The rota
               planner is the reason: it is one file holding every
               department's rota, so Karen has to be able to open it for Kids
               Church without being on the worship team. Being on - or
               administering - any one of the listed teams is enough. */
            var wanted = opts.team ? String(opts.team).split(',').map(function (t) {
              return t.trim();
            }).filter(Boolean) : [];

            var mayEnter = !wanted.length || EGBCAuth.isOwner() ||
              wanted.some(function (t) {
                return EGBCAuth.inTeam(t) || EGBCAuth.isAdminOf(t);
              });

            if (!mayEnter) {
              EGBCAuth._blockPage(
                'No access to this page',
                /* The label already carries the noun where it needs one -
                   "Core Team", "Kids Church" - so appending "team" produced
                   "the Core Team team". */
                'This page is for ' + labelList(wanted) +
                ', and you are not on ' + (wanted.length > 1 ? 'any of those teams.' : 'that team.'),
                profile
              );
              return;
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
                return roleAtLeast(profile.roles, t, opts.role) || EGBCAuth.isAdminOf(t);
              });

            if (!hasRank) {
              EGBCAuth._blockPage(
                'Not enough permissions',
                'This page needs ' + opts.role + ' access for ' + labelList(wanted) + '.',
                profile
              );
              return;
            }

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
      if (v) return [v.team];
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

    inTeam: function (team) {
      return EGBCAuth.effectiveTeams().indexOf(team) !== -1;
    },

    /* Can act on this area: either they administer it, or they are on it. */
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
    call: function (name, data) {
      return callFunction(name, data);
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

    /* Manages this particular area. */
    isAdminOf: function (team) {
      var v = viewAs();
      if (v) return !!v.admin && v.team === team;
      if (!currentProfile) return false;
      if (currentProfile.masterAdmin === true) return true;
      return (currentProfile.adminFor || []).indexOf(team) !== -1;
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
      if (v) return v.admin ? [v.team] : [];
      if (!currentProfile) return [];
      if (currentProfile.masterAdmin === true) return Object.keys(TEAMS);
      return (currentProfile.adminFor || []).slice();
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

      document.body.innerHTML =
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

})(window);
