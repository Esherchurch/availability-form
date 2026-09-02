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

  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  var auth = firebase.auth();
  var db = firebase.firestore();

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

     "Kids Church", "Lazers" and "ReNu" are the new values.                              */

  var TEAMS = {
    'Worship Team':  { label: 'Worship',      colour: '#3d6263' },
    'AV Team':       { label: 'AV',           colour: '#4a5f7a' },
    'Choir':         { label: 'Choir',        colour: '#7a4a5f' },
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

  function loadProfile(user) {
    return db.collection('users').doc(user.uid).get().then(function (snap) {
      if (snap.exists) {
        var d = snap.data();
        return db.collection('users').doc(user.uid)
          .update({ lastSeen: firebase.firestore.FieldValue.serverTimestamp() })
          .catch(function () {})
          .then(function () { return d; });
      }
      return provisionProfile(user);
    });
  }

  function provisionProfile(user) {
    var email = (user.email || '').toLowerCase().trim();

    return db.collection('addressBook').where('email', '==', email).limit(1).get()
      .then(function (q) {
        var profile = {
          uid: user.uid,
          email: email,
          name: user.displayName || '',
          memberId: null,
          teams: [],
          roles: {},
          status: 'pending',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          lastSeen: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!q.empty) {
          var doc = q.docs[0];
          var m = doc.data();
          profile.memberId = doc.id;
          // The address book stores the person's name in `fullName` and their
          // team membership in `markers` - the same field the rota reads.
          profile.name = (m.fullName || m.name || '').trim() || profile.name;
          profile.teams = Array.isArray(m.markers) ? m.markers : [];
          profile.roles = (m.roles && typeof m.roles === 'object') ? m.roles : {};
          profile.status = profile.teams.length ? 'active' : 'pending';
        }

        return db.collection('users').doc(user.uid).set(profile)
          .then(function () { return profile; });
      });
  }

  /* ---- Public API -------------------------------------------------- */

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
              EGBCAuth._blockPage(
                'Waiting for approval',
                'Your account is set up but has not been given access to any team yet. ' +
                'Ask your team leader to add you, then reload this page.',
                profile
              );
              return;
            }

            if (opts.team && !EGBCAuth.inTeam(opts.team) && !EGBCAuth.isOwner()) {
              EGBCAuth._blockPage(
                'No access to this page',
                'This page belongs to the ' + (TEAMS[opts.team] ? TEAMS[opts.team].label : opts.team) +
                ' team, and you are not on it.',
                profile
              );
              return;
            }

            if (opts.role && opts.team && !roleAtLeast(profile.roles, opts.team, opts.role)) {
              EGBCAuth._blockPage(
                'Not enough permissions',
                'This page needs ' + opts.role + ' access for ' +
                (TEAMS[opts.team] ? TEAMS[opts.team].label : opts.team) + '.',
                profile
              );
              return;
            }

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
          loadProfile(user).then(function (p) { currentProfile = p; resolve(p); })
            .catch(function () { resolve(null); });
        });
      });
    },

    profile: function () { return currentProfile; },
    user: function () { return currentUser; },

    inTeam: function (team) {
      return !!(currentProfile && currentProfile.teams && currentProfile.teams.indexOf(team) !== -1);
    },

    hasRole: function (team, role) {
      return currentProfile ? roleAtLeast(currentProfile.roles, team, role) : false;
    },

    isOwner: function () {
      return !!(currentProfile && currentProfile.roles && currentProfile.roles.owner);
    },

    isAdminOf: function (team) {
      return EGBCAuth.hasRole(team, 'admin');
    },

    /* True if the user administers any team at all. */
    isAnyAdmin: function () {
      if (!currentProfile) return false;
      if (currentProfile.roles && currentProfile.roles.owner) return true;
      return (currentProfile.teams || []).some(function (t) { return roleAtLeast(currentProfile.roles, t, 'admin'); });
    },

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
      el.innerHTML =
        '<div class="flex items-center gap-3">' +
          '<a href="' + HUB_PAGE + '" class="text-[10px] font-black uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity">&larr; Hub</a>' +
          '<div class="flex items-center gap-2 bg-white border border-[#d1dfdf] rounded-full pl-1.5 pr-4 py-1.5">' +
            '<div class="w-7 h-7 rounded-full bg-[#3d6263] text-white flex items-center justify-center text-[10px] font-black">' + initials + '</div>' +
            '<span class="text-[11px] font-bold">' + (currentProfile.name || currentProfile.email) + '</span>' +
          '</div>' +
          '<button onclick="EGBCAuth.signOut()" class="text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">Sign out</button>' +
        '</div>';
    },

    _blockPage: function (title, message, profile) {
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
    }
  };

  global.EGBCAuth = EGBCAuth;

})(window);
