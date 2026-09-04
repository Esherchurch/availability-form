/* ===================================================================
   EGBC Suite - admin gate for the older knowledge-base pages
   ===================================================================

   How To AV, Troubleshoot AV, Play-Through, Worship Training and the apps
   page were all written before there were accounts. Each has a toggleAdmin()
   that simply shows the admin panel:

       function toggleAdmin(){ document.getElementById('adminPanel')... }

   No check of any kind, so anyone who could open the page could upload and
   delete. Rewriting five pages by hand would mean five chances to break
   something, so instead this wraps whatever they already have.

   Add to the page:
     <script src="egbc-kbadmin.js" data-admin-team="AV Team"></script>

   data-admin-team may be a comma separated list, or "master" for pages only
   a master admin should manage.

   Like the rest of the browser-side gating this is a lock on the cupboard,
   not on the building. The Firestore and Storage rules are what actually
   stop a write.
   =================================================================== */

(function () {
  'use strict';

  var script = document.currentScript;
  var want = (script && script.getAttribute('data-admin-team')) || 'master';
  var teams = want.split(',').map(function (t) { return t.trim(); }).filter(Boolean);

  function mayManage() {
    if (typeof EGBCAuth === 'undefined' || !EGBCAuth.profile || !EGBCAuth.profile()) return false;
    if (EGBCAuth.isMaster()) return true;
    if (teams.length === 1 && teams[0] === 'master') return false;
    return teams.some(function (t) { return EGBCAuth.isAdminOf(t); });
  }

  /* The button is hidden as well as the action being refused. A control that
     is visible and then says no is worse than one that was never offered. */
  function hideTriggers() {
    var all = document.querySelectorAll('[onclick*="toggleAdmin"], #adminBtn, .admin-btn, [data-admin-toggle]');
    for (var i = 0; i < all.length; i++) all[i].style.display = 'none';
  }

  function closePanel() {
    var p = document.getElementById('adminPanel') || document.getElementById('admin-panel');
    if (p && !p.classList.contains('hidden')) p.classList.add('hidden');
  }

  function gate() {
    var original = window.toggleAdmin;

    window.toggleAdmin = function () {
      if (!mayManage()) {
        alert('Only the people who manage this area can edit it.\n\n' +
              'If that should be you, ask a member of the Core Team.');
        return;
      }
      if (typeof original === 'function') return original.apply(this, arguments);
    };

    if (!mayManage()) { hideTriggers(); closePanel(); }
  }

  /* The page defines toggleAdmin in its own script, and the profile arrives
     later still, so wrap on load and check again when auth reports in. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', gate);
  } else {
    gate();
  }
  document.addEventListener('egbc-ready', function () {
    if (!mayManage()) { hideTriggers(); closePanel(); }
  });
})();
