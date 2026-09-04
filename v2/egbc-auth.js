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

  /* Local rules testing. Only ever fires when the pages are served from
     localhost, so this is inert on GitHub Pages and safe to ship.
     See EMULATOR.md. */
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    try {
      db.useEmulator('localhost', 8080);
      auth.useEmulator('http://localhost:9099');
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
         administrator has to decide. Links an admin made are left alone. */
      if (d.linkedBy !== 'admin') {
        return findMembers((user.email || '').toLowerCase().trim()).then(function (matches) {
          if (matches.length > 1) {
            var patch = {
              status: 'ambiguous',
              memberId: null,
              teams: [],
              candidates: matches.map(function (m) {
                var mk = Array.isArray(m.data.markers) ? m.data.markers : [];
                return {
                  id: m.id,
                  name: (m.data.name || m.data.fullName || '(no name)').trim(),
                  admin: m.data.masterAdmin === true || (Array.isArray(m.data.adminFor) && m.data.adminFor.length > 0)
                };
              })
            };
            return db.collection('users').doc(user.uid).update(patch)
              .catch(function () {})
              .then(function () { return Object.assign({}, d, patch); });
          }
          return refreshFromBook(user, d);
        }).catch(function () { return d; });
      }

      return refreshFromBook(user, d);
    });
  }

  /* Markers are edited in the address book, so re-read them each load rather
     than letting the mirrored copy drift. */
  function refreshFromBook(user, d) {
    return db.collection('addressBook').doc(d.memberId).get().then(function (m) {
      var patch = { lastSeen: firebase.firestore.FieldValue.serverTimestamp() };
      if (m.exists) {
        var md = m.data();
        var teams = Array.isArray(md.markers) ? md.markers : [];
        var adminFor = Array.isArray(md.adminFor) ? md.adminFor : [];
        patch.teams = teams;
        patch.adminFor = adminFor;
        patch.masterAdmin = md.masterAdmin === true;
        patch.name = (md.name || md.fullName || d.name || '').trim();
        patch.status = (teams.length || adminFor.length || md.masterAdmin === true) ? 'active' : 'pending';
      }
      return db.collection('users').doc(user.uid).update(patch)
        .catch(function () {})
        .then(function () { return Object.assign({}, d, patch); });
    }).catch(function () { return d; });
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
          /* Under 16s cannot sign in - they use an access code emailed to a
             parent. From 16 the church holds their own email and they sign in
             like anyone else. This is an explicit flag, not inferred from
             teams: an adult who runs youth work is on Youth Worship and is
             plainly not under 16. Flagging them here also means a parent's
             address on a child's record can never be mistaken for the child. */
          if (md.isMinor === true) return;
          out.push({ id: d.id, data: md });
        });
      });
      return out;
    });
  }

  function applyMember(uid, m, how) {
    var teams = Array.isArray(m.data.markers) ? m.data.markers : [];
    var adminFor = Array.isArray(m.data.adminFor) ? m.data.adminFor : [];
    return {
      memberId: m.id,
      name: (m.data.name || m.data.fullName || '').trim(),
      teams: teams,
      adminFor: adminFor,
      masterAdmin: m.data.masterAdmin === true,
      // Someone can administer an area without being a member of it - Karen
      // runs Kids Church, Marcia runs Youth - so status counts either.
      status: (teams.length || adminFor.length || m.data.masterAdmin === true) ? 'active' : 'pending',
      // 'auto' was matched on a unique email. 'admin' was chosen by a person.
      // Only 'admin' is trusted permanently - an automatic match is re-checked
      // on every load, because a second record can appear on that address later.
      linkedBy: how || 'auto'
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

     Kids Church is the one that stays separate. That is the whole point of
     scoping it - and someone on Kids Church AND Worship gets both, because
     the list is a union of everything they are on. */

  var WORSHIP_SIDE = ['Worship Team', 'AV Team', 'Youth Worship'];

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
      'position:fixed;left:0;right:0;bottom:0;z-index:9900;display:flex;align-items:center;' +
      'gap:10px;flex-wrap:wrap;padding:9px 16px;font-family:Montserrat,system-ui,sans-serif;' +
      'font-size:11px;font-weight:800;box-shadow:0 -3px 14px rgba(20,32,31,.18);' +
      (v ? 'background:#b07d2e;color:#fff' : 'background:#eef4f3;color:#3d6263;border-top:1px solid #dde7e6');

    var teams = Object.keys(TEAMS).filter(function (t) { return !TEAMS[t].parent; });
    var opts = teams.map(function (t) {
      return '<option value="' + t + '"' + (v && v.team === t ? ' selected' : '') + '>' +
             (TEAMS[t].label || t) + '</option>';
    }).join('');

    bar.innerHTML =
      '<span style="text-transform:uppercase;letter-spacing:.1em">' +
        (v ? 'Seeing the site as a ' + (TEAMS[v.team] ? TEAMS[v.team].label : v.team) +
             ' ' + (v.admin ? 'admin' : 'member')
           : 'View the site as') +
      '</span>' +
      '<select id="egbc-va-team" style="font-family:inherit;font-size:11px;font-weight:800;' +
        'border-radius:99px;padding:5px 12px;border:1px solid rgba(0,0,0,.15)">' +
        '<option value="">Myself</option>' + opts +
      '</select>' +
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer">' +
        '<input type="checkbox" id="egbc-va-admin"' + (v && v.admin ? ' checked' : '') + '> as an admin' +
      '</label>' +
      (v ? '<button id="egbc-va-off" style="font-family:inherit;font-size:11px;font-weight:800;' +
           'border-radius:99px;padding:5px 14px;border:none;cursor:pointer;background:#fff;' +
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

            if (opts.team && !EGBCAuth.inTeam(opts.team) && !EGBCAuth.isOwner()) {
              EGBCAuth._blockPage(
                'No access to this page',
                /* The label already carries the noun where it needs one -
                   "Core Team", "Kids Church" - so appending "team" produced
                   "the Core Team team". */
                'This page is for ' + (TEAMS[opts.team] ? TEAMS[opts.team].label : opts.team) +
                ', and you are not on that team.',
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
            if (opts.role && opts.team &&
                !roleAtLeast(profile.roles, opts.team, opts.role) &&
                !EGBCAuth.isOwner() && !EGBCAuth.isAdminOf(opts.team)) {
              EGBCAuth._blockPage(
                'Not enough permissions',
                'This page needs ' + opts.role + ' access for ' +
                (TEAMS[opts.team] ? TEAMS[opts.team].label : opts.team) + '.',
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
