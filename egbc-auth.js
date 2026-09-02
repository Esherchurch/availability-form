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

     "Kids Church", "Lazers" and "ReNu" are the new values.

     A team with a `parent` is still a real marker - view-only-rota.html
     filters on markers.includes('Choir') - but it gets no tab of its own in
     the hub. Its members see the parent team's pages instead.

     Core Team carries `admin: true`. Ticking it makes someone an administrator
     of the whole system - address book, linking sign-ins, the build tools. It
     does NOT hand them every content tab: those still come from their own
     markers, so a Core Team member only sees Kids Church if they are ticked
     for Kids Church.                                                        */

  var TEAMS = {
    'Worship Team':  { label: 'Worship',      colour: '#3d6263' },
    'AV Team':       { label: 'AV',           colour: '#4a5f7a' },
    'Choir':         { label: 'Choir',        colour: '#7a4a5f', parent: 'Worship Team' },
    'Youth Worship': { label: 'Youth',        colour: '#5f7a4a' },
    'Kids Church':   { label: 'Kids Church',  colour: '#7a5f4a' },
    'Lazers':        { label: 'Lazers',       colour: '#8a4a3d' },
    'ReNu':          { label: 'ReNu',         colour: '#3d6b5f' },
    'Core Team':     { label: 'Admin',        colour: '#6b4a7a', admin: true }
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
      if (!snap.exists) return provisionProfile(user);

      var d = snap.data();

      /* Still waiting to pick which person they are. */
      if (d.status === 'ambiguous') return d;

      /* Someone linked since their last visit: pick the membership up now,
         so they do not have to be told to sign out and back in. */
      if (!d.memberId) {
        return provisionProfile(user);
      }

      /* Markers are edited in the address book, so re-read them each load
         rather than letting the mirrored copy drift. */
      return db.collection('addressBook').doc(d.memberId).get().then(function (m) {
        var patch = { lastSeen: firebase.firestore.FieldValue.serverTimestamp() };
        if (m.exists) {
          var md = m.data();
          var teams = Array.isArray(md.markers) ? md.markers : [];
          patch.teams = teams;
          patch.name = (md.fullName || md.name || d.name || '').trim();
          patch.status = teams.length ? 'active' : 'pending';
        }
        return db.collection('users').doc(user.uid).update(patch)
          .catch(function () {})
          .then(function () { return Object.assign({}, d, patch); });
      }).catch(function () { return d; });
    });
  }

  /* Look a person up by their primary address book email, then by any extra
     sign-in address Core Team has linked to them. People sign in with whatever
     Google account is on their phone, which is often not the address the church
     holds, so the second lookup is what stops them getting stuck. */
  function findMembers(email) {
    return Promise.all([
      db.collection('addressBook').where('email', '==', email).get(),
      db.collection('addressBook').where('signInEmails', 'array-contains', email).get()
    ]).then(function (results) {
      var seen = {}, out = [];
      results.forEach(function (snap) {
        snap.docs.forEach(function (d) {
          if (seen[d.id]) return;
          seen[d.id] = true;
          var md = d.data();
          if (md.archived) return;
          /* Only people on a team are sign-in candidates. Young people are in
             the address book but hold no markers, so a parent's address on a
             child's record can never be mistaken for the child. */
          if (!Array.isArray(md.markers) || !md.markers.length) return;
          out.push({ id: d.id, data: md });
        });
      });
      return out;
    });
  }

  function applyMember(uid, m) {
    var teams = Array.isArray(m.data.markers) ? m.data.markers : [];
    return {
      memberId: m.id,
      name: (m.data.name || m.data.fullName || '').trim(),
      teams: teams,
      status: teams.length ? 'active' : 'pending'
    };
  }

  function provisionProfile(user) {
    var email = (user.email || '').toLowerCase().trim();

    return findMembers(email).then(function (matches) {
      var profile = {
        uid: user.uid,
        email: email,
        name: user.displayName || '',
        memberId: null,
        teams: [],
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
          return { id: m.id, name: (m.data.name || m.data.fullName || '(no name)').trim() };
        });
      } else if (matches.length === 1) {
        Object.assign(profile, applyMember(user.uid, matches[0]));
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
              var title, message;
              if (profile.status === 'ambiguous') {
                title = 'More than one person uses this address';
                message = 'That address appears against several people in the address book, ' +
                          'so we cannot tell which of you is signing in. Ask a member of the ' +
                          'Core Team to link it to the right person, then reload this page.';
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

    /* The teams that decide what a person can see. A child team (Choir)
       resolves to its parent (Worship Team). The raw markers are left
       untouched on the profile, because the rota still needs them. */
    effectiveTeams: function () {
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
      return EGBCAuth.effectiveTeams().filter(function (t) {
        return TEAMS[t] && !TEAMS[t].parent && !TEAMS[t].admin;
      });
    },

    inTeam: function (team) {
      return EGBCAuth.effectiveTeams().indexOf(team) !== -1;
    },

    /* Two states only: administrator, or a member of the team. */
    hasRole: function (team) {
      return EGBCAuth.isAdmin() || EGBCAuth.inTeam(team);
    },

    /* An administrator is anyone ticked Core Team. There is no layer above it. */
    isAdmin: function () {
      if (!currentProfile) return false;
      return (currentProfile.teams || []).some(function (t) {
        return TEAMS[t] && TEAMS[t].admin;
      });
    },

    isOwner: function () { return EGBCAuth.isAdmin(); },
    isAnyAdmin: function () { return EGBCAuth.isAdmin(); },
    isAdminOf: function () { return EGBCAuth.isAdmin(); },

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
      el.innerHTML =
        '<div class="flex items-center gap-3">' +
          (onHub ? '' : '<a href="' + HUB_PAGE + '" class="text-[10px] font-black uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity">&larr; Hub</a>') +
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
