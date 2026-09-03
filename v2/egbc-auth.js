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
                  admin: mk.some(function (t) { return TEAMS[t] && TEAMS[t].admin; })
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
        patch.teams = teams;
        patch.name = (md.name || md.fullName || d.name || '').trim();
        patch.status = teams.length ? 'active' : 'pending';
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
    return {
      memberId: m.id,
      name: (m.data.name || m.data.fullName || '').trim(),
      teams: teams,
      status: teams.length ? 'active' : 'pending',
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
          var mk = Array.isArray(m.data.markers) ? m.data.markers : [];
          return {
            id: m.id,
            name: (m.data.name || m.data.fullName || '(no name)').trim(),
            admin: mk.some(function (t) { return TEAMS[t] && TEAMS[t].admin; })
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
    if (!pick || pick.admin) return;

    db.collection('addressBook').doc(memberId).get().then(function (d) {
      if (!d.exists) return;
      var patch = applyMember(user.uid, { id: d.id, data: d.data() }, 'self');
      patch.candidates = firebase.firestore.FieldValue.delete();
      return db.collection('users').doc(user.uid).update(patch);
    }).then(function () {
      location.reload();
    }).catch(function (e) { alert('Could not continue: ' + e.message); });
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
        body += '<div style="background:#f6efe1;border:1px solid #e8d9b8;border-radius:16px;padding:14px 18px;margin-top:6px">' +
          '<div style="font-size:12px;font-weight:800;color:#8a5f1e;margin-bottom:4px">' +
            locked.map(function (c) { return c.name; }).join(', ') +
          '</div>' +
          '<div style="font-size:11.5px;color:#8a5f1e;line-height:1.55">' +
            (locked.length === 1 ? 'This one is' : 'These are') + ' on the Core Team, so ' +
            (locked.length === 1 ? 'it has' : 'they have') + ' to be linked by an administrator rather than chosen here.' +
          '</div></div>';
      }

      if (!pickable.length && locked.length) {
        body = '<div style="background:#f6efe1;border:1px solid #e8d9b8;border-radius:16px;padding:16px 20px">' +
          '<div style="font-size:13px;color:#8a5f1e;line-height:1.6">Every person on this address is on the Core Team, ' +
          'so an administrator has to link it. Ask another member of the Core Team.</div></div>';
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
