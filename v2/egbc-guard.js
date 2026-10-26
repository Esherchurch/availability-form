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
     data-admin — "any": anybody who administers something
     data-also-team — "...or anybody on this team", ORed with the above.
                  data-team and data-admin are ANDed with each other, so
                  neither can say "an admin OR the Church office", which is
                  what church-settings.html needs now the church's bank
                  details live on it.

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
  var adminAny = script ? script.getAttribute('data-admin') === 'any' : false;
  /* data-also-team — "or anybody on this team", ORed with whatever else
     the page asks for. data-admin and data-team are ANDed, which cannot
     say "an admin OR the Church office", and that is exactly what the
     church details page needs now the giving details live on it: the
     office are the people who know the church's bank details and they
     are not necessarily admins of anything. A separate attribute rather
     than changing what the other two mean, because no page uses both
     today and a page that did would have its access quietly widened. */
  var alsoTeam = script ? script.getAttribute('data-also-team') : null;
  /* data-allow-pending="parent" (FINDINGS-notify N-5.5): the app alone
     lets in a verified address the church holds no record for, as a
     parent, to Parents' Sunday and Notifications and nothing else. */
  var allowPending = script ? script.getAttribute('data-allow-pending') : null;
  /* data-any-team — on any team at all, or administering one, or a master
     admin (Martin, 15 Oct 2026: a member on no team was shown the team
     videos, resources and pin boards). Honours "View the site as". */
  var anyTeam = script ? script.hasAttribute('data-any-team') : false;
  /* data-feature — the part of the church this page is (EGBCAuth.uses; the
     reviewing window, 20 Oct 2026: every part has a switch). Switched off,
     the page says so, kindly, instead of opening from an old bookmark.
     Nothing is deleted; switching it back on brings it all back. */
  var feature = script ? script.getAttribute('data-feature') : null;
  /* data-master - master admins only (Church settings; 21 Oct 2026). */
  var masterOnly = script ? script.hasAttribute('data-master') : false;
  /* data-leads - team leaders and core teams (Book a room; 26 Oct 2026). */
  var leadsOnly = script ? script.hasAttribute('data-leads') : false;

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

  /* THE SPLASH MUST NOT SPIN FOR EVER (Martin, 12 Oct 2026: "Checking
     access" stuck on his phone, opening the rota from the app right
     after a laptop restart; it cleared on its own later).
     =================================================================

     WHY IT CAN HANG. EGBCAuth.require() waits on loadProfile(), which is
     a Firestore get() with no timeout. The SDK retries a wedged
     connection by itself and that get() can stay pending for minutes - a
     sleeping laptop, a phone changing network, the emulator dropping a
     client (A-062/A-063). While it is pending the promise neither
     resolves nor rejects, so the guard never reveals the page and never
     refuses it: the splash is all there is, and nothing on the screen
     says anything is wrong.

     SO THE GUARD STOPS WAITING SILENTLY AT 8 SECONDS. It does not give
     up - the read is still running, and if it comes back the page opens
     as it always would. It just stops pretending to be busy and says
     what has happened, with a way out.

     THE MESSAGE REPLACES THE SPINNER AND NOT THE PAGE. The body is still
     hidden; revealing it would show whatever is underneath to somebody
     whose access has not been checked, which is the one thing this file
     exists to prevent. */
  /* EGBCGuard.allowed: resolves when this person is let in (the same moment
     as 'egbc-ready'), and NEVER for somebody refused. A page that waits on
     it before its first read sends nothing the rules would refuse - which
     is what put "Uncaught Error in snapshot listener" on the console of
     every page a plain member was turned away from (the audit, 22 Oct 2026). */
  if (!window.EGBCGuard) {
    window.EGBCGuard = {
      allowed: new Promise(function (res) {
        if (window.EGBC_READY) return res();
        document.addEventListener('egbc-ready', function () { res(); }, { once: true });
      })
    };
  }

  var SETTLE_MS = 8000;
  var settled = false;

  function stillWaiting() {
    if (settled) return false;
    if (!document.body) return true;
    /* A refusal is an answer: _blockPage() stamps the body and replaces
       it, so this is not a stall. */
    return !document.body.getAttribute('data-egbc-blocked');
  }

  function sayStuck() {
    if (!stillWaiting()) return;
    var sp = document.getElementById('egbc-guard-splash');
    if (!sp) return;
    sp.innerHTML =
      '<div style="text-align:center;max-width:300px;padding:0 20px">'
      + '<div style="font-size:16px;font-weight:600;color:#2a4a4b;margin:0 0 8px">'
      + 'Could not check your access</div>'
      + '<p style="font-size:14px;line-height:1.5;color:#52706f;margin:0 0 16px">'
      + 'This is nearly always the connection. Your place is still here &mdash; '
      + 'try again in a moment.</p>'
      + '<button id="egbc-guard-retry" style="min-height:44px;padding:0 18px;'
      + 'background:#3d6263;color:#fff;border:none;border-radius:10px;'
      + 'font-family:inherit;font-size:14px;font-weight:600;cursor:pointer">'
      + 'Try again</button></div>';
    var b = document.getElementById('egbc-guard-retry');
    if (b) b.onclick = function () { location.reload(); };
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
    if (adminAny) opts.adminAny = true;
    if (alsoTeam) opts.alsoTeam = alsoTeam;
    if (allowPending) opts.allowPending = allowPending;
    if (anyTeam) opts.anyTeam = true;
    if (masterOnly) opts.master = true;
    if (leadsOnly) opts.leadsOrCore = true;

    setTimeout(sayStuck, SETTLE_MS);

    EGBCAuth.require(opts).then(function (profile) {
      settled = true;
      if (feature && EGBCAuth.uses && !EGBCAuth.uses(feature)) {
        var f = ((EGBCAuth.features && EGBCAuth.features()) || []).filter(function (x) { return x.name === feature; })[0];
        EGBCAuth._blockPage('Switched off', ((f && f.label) || 'This part') + ' is switched off for this church. Nothing has been deleted: a master admin can switch it back on in Church settings.', profile);
        return;
      }
      reveal();

      /* A sign-out chip, but only where there is no shared bar already
         offering Hub, Menu and sign-out. egbc-shell.js puts that bar on
         every page it is loaded on, and places-admin ended up with both -
         two headers, one above the other, each with its own way out. */
      if (document.getElementById('userChip') && !document.getElementById('egbc-bar')) {
        EGBCAuth.mountUserChip('userChip');
      }

      /* Remembered as well as announced: a page whose script runs after this
         can tell it has already happened. */
      window.EGBC_READY = true;
      document.dispatchEvent(new CustomEvent('egbc-ready', { detail: profile }));
    }).catch(function (e) {
      settled = true;
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
