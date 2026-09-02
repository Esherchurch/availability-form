/* ===================================================================
   EGBC Suite — drop-in page guard
   ===================================================================

   Add these three lines to the <head> of any page that should require
   sign-in. Nothing else in the page needs to change.

     <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
     <script src="egbc-auth.js"></script>
     <script src="egbc-guard.js" data-team="worship"></script>

   Attributes:
     data-team  — team required to view the page (omit for "any signed-in user")
     data-role  — minimum role: member (default), leader, admin

   The page is hidden until the check passes, so unauthorised content is
   never briefly visible. If the check fails the user gets an explanation
   and a link back to the hub.

   This is convenience, not security. Firestore and Storage rules are what
   actually protect the data.
   =================================================================== */

(function () {
  'use strict';

  var script = document.currentScript;
  var team = script ? script.getAttribute('data-team') : null;
  var role = script ? script.getAttribute('data-role') : null;

  // Hide the page until we know the user is allowed to see it.
  var style = document.createElement('style');
  style.id = 'egbc-guard-style';
  style.textContent = 'body{visibility:hidden!important}' +
    '#egbc-guard-splash{visibility:visible!important;position:fixed;inset:0;z-index:99999;' +
    'display:flex;align-items:center;justify-content:center;background:#eef4f3;' +
    'font-family:Montserrat,system-ui,sans-serif}';
  document.documentElement.appendChild(style);

  function splash() {
    var d = document.createElement('div');
    d.id = 'egbc-guard-splash';
    d.innerHTML =
      '<div style="text-align:center">' +
        '<div style="width:40px;height:40px;margin:0 auto 16px;border:3px solid #dde7e6;' +
        'border-top-color:#3d6263;border-radius:50%;animation:egbcspin .8s linear infinite"></div>' +
        '<div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.2em;' +
        'color:#6b8281">Checking access</div>' +
      '</div>' +
      '<style>@keyframes egbcspin{to{transform:rotate(360deg)}}</style>';
    (document.body || document.documentElement).appendChild(d);
    return d;
  }

  function reveal() {
    var s = document.getElementById('egbc-guard-style');
    if (s) s.remove();
    var sp = document.getElementById('egbc-guard-splash');
    if (sp) sp.remove();
  }

  function start() {
    var sp = splash();

    if (typeof EGBCAuth === 'undefined') {
      console.error('egbc-guard: egbc-auth.js must be loaded first.');
      reveal();
      return;
    }

    var opts = {};
    if (team) opts.team = team;
    if (role) opts.role = role;

    EGBCAuth.require(opts).then(function (profile) {
      reveal();

      // Drop a sign-out chip into #userChip if the page has one.
      if (document.getElementById('userChip')) {
        EGBCAuth.mountUserChip('userChip');
      }

      document.dispatchEvent(new CustomEvent('egbc-ready', { detail: profile }));
    }).catch(function (e) {
      console.error('egbc-guard:', e);
      reveal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
