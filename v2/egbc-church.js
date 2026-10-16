/* ===================================================================
   EGBC — church details, from one setting (events window)
   ===================================================================

   The church's name, its enquiry email and its logo live in one document,
   churchSettings/details, set on church-settings.html by an admin. Every
   page the events window builds reads them from here and writes none of
   them into the page itself: this is meant to work for any church.

     EGBCChurch.load()      -> Promise of { name, enquiryEmail, logoUrl }
     EGBCChurch.name() / .email() / .logo()   once loaded
     EGBCChurch.wrap(title, body)   an email in the shared shell, with this
                                     church's name as the footer
     EGBCChurch.send(opts)  EGBCEmail.send, replying to the enquiry address
     EGBCChurch.header(el, { back })   the plain header for the public
                                     "Hire our rooms" pages

   When nothing has been set yet, the pages say nothing church-specific
   rather than fall back to a name: a blank is honest, a guess is not.

   Why wrap and send are here: egbc-email.js (the main window's) has the
   church's name and office address as its defaults. Passing ours every
   time means these pages never rely on them.
   =================================================================== */

(function (global) {
  'use strict';

  var D = { name: '', enquiryEmail: '', logoUrl: '' }, loading = null;

  function load() {
    if (loading) return loading;
    loading = EGBCAuth.db.collection('churchSettings').doc('details').get().then(function (s) {
      if (s.exists) {
        var d = s.data();
        D = { name: d.name || '', enquiryEmail: d.enquiryEmail || '', logoUrl: d.logoUrl || '' };
      }
      /* The tab shows the church, from the setting. */
      if (D.name && document.title.indexOf(D.name) < 0) document.title = document.title + ' — ' + D.name;
      return D;
    }).catch(function () { return D; });
    return loading;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function wrap(title, body, footer) {
    return EGBCEmail.wrap(title, body, footer || (D.name ? esc(D.name) : ' '));
  }

  function send(opts) {
    var o = Object.assign({}, opts);
    if (!o.replyTo && D.enquiryEmail) o.replyTo = D.enquiryEmail;
    return EGBCEmail.send(o);
  }

  /* The header for the public hire pages: logo and name, and a way back
     to the list of rooms. Nothing from the members' side. */
  var ICON = { back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>', hub: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>' };
  function header(el, o) {
    o = o || {};
    el.innerHTML = '<div class="ch-in">' +
      (D.logoUrl ? '<img class="ch-logo" src="' + esc(D.logoUrl) + '" alt="">' : '') +
      '<span class="ch-name">' + esc(D.name || 'Rooms for hire') + '</span>' +
      '<span class="ch-hub"></span>' +
      (o.back ? '<a class="ch-back" href="hire.html">' + ICON.back + 'Back to all rooms</a>' : '') + '</div>';
    /* SIGNED IN: the hub's own top bar and Menu, like every other page
       (Martin, 11 Oct: "the drop down menu disappears on some pages").
       egbc-shell.js is loaded only once the browser says a person is signed
       in, so the public never get the hub's bar, its "Hub" button (which
       leads to sign-in) or a Menu, and nobody is ever asked to sign in.
       The shell then draws itself for that person through
       EGBCAuth.optional(), which never redirects. This header steps back to
       just "Back to all rooms", where the page has one. */
    try {
      firebase.auth(firebase.app('egbc')).onAuthStateChanged(function (u) {
        if (u) hubShell(el);
      });
    } catch (e) { /* no sign-in on this page: the public header stays */ }
  }

  var SHELL = 'egbc-shell.js?v=202610082145';
  function hubShell(el) {
    if (document.querySelector('script[src^="egbc-shell.js"]')) return;
    var s = document.createElement('script');
    s.src = SHELL;
    s.setAttribute('data-title', (document.title || 'Rooms').split(' — ')[0]);
    document.head.appendChild(s);
    el.classList.add('ch-signedin');
    ['.ch-logo', '.ch-name', '.ch-hub'].forEach(function (k) { var x = el.querySelector(k); if (x) x.style.display = 'none'; });
    if (!el.querySelector('.ch-back')) el.style.display = 'none';
  }

  /* The public pages close their database connection as the visitor leaves.
     Left open, each page's connection lingers after the next page opens;
     going back and forth between the rooms and a room a few times filled the
     browser's few connections to the database, and the next page sat on
     "Loading…" (seen on the emulator: F-073). A page the browser keeps for
     the Back button keeps its connection too, so it is closed either way, and
     a page brought back by Back loads afresh. */
  function closeOnLeave() {
    global.addEventListener('pagehide', function () {
      try { EGBCAuth.db.terminate(); } catch (x) { /* already closed */ }
    });
    global.addEventListener('pageshow', function (e) { if (e.persisted) global.location.reload(); });
  }

  /* Each page sets its own <title> from this, so the tab shows the church. */
  function title(page) { document.title = page + (D.name ? ' — ' + D.name : ''); }

  /* ---- giving: the church's bank details ---------------------------
     ONE SETTING, churchSettings/giving, typed in once on
     church-settings.html. Everywhere that tells somebody how to pay the
     church reads it from here: the Give screen in the app, the Give page
     on the website, and (asked of the events window) the "How to pay"
     line on a room-hire invoice. Nobody retypes an account number.

     IT IS A SEPARATE DOCUMENT FROM `details`, and a separate read, for
     one reason: `details` is world-readable because the login page and
     the public hire pages draw the church's name from it, and the bank
     details are not. The rules gate `giving` on being signed in. So a
     page that is not signed in gets a refusal here, which is the
     intended answer and not an error - hence the catch returning blanks,
     and hence this not being part of load().

     WHAT CALLERS MUST DO: ask whether there is anything to show, with
     has(), rather than printing empty labels. Nothing is seeded, so
     until Martin or Val type the details in, every one of these is
     blank, and a screen saying "Account number:" with nothing after it
     is worse than a screen that says the details are not up yet. */
  var G = null, giveLoading = null;
  var BLANK = {
    accountName: '', sortCode: '', accountNumber: '', reference: '',
    giftAid: false, giftAidUrl: '', note: ''
  };

  function giving() {
    if (giveLoading) return giveLoading;
    giveLoading = EGBCAuth.db.collection('churchSettings').doc('giving').get().then(function (s) {
      var d = (s.exists && s.data()) || {};
      G = {
        accountName: d.accountName || '', sortCode: d.sortCode || '',
        accountNumber: d.accountNumber || '', reference: d.reference || '',
        giftAid: d.giftAid === true, giftAidUrl: d.giftAidUrl || '', note: d.note || ''
      };
      return G;
    }).catch(function () { G = Object.assign({}, BLANK); return G; });
    return giveLoading;
  }

  /* Is there anything worth drawing? The Gift Aid line on its own is not
     "how to pay the church", so it does not count here. */
  function givingReady() {
    var g = G || BLANK;
    return !!(g.accountName || g.sortCode || g.accountNumber);
  }

  /* WHICH PARTS THIS CHURCH USES (HANDOVER-MAIN rule 12; NEXT-BRIEF §24
     after launch, item 14). Every feature built from 13 Oct 2026 has a
     name, and its Menu entries, app tabs and Home cards ask uses(name)
     before they are drawn. The per-church switch comes after launch;
     until it exists every part is on. A page that does not load this
     file should ask `!window.EGBCChurch || EGBCChurch.uses(name)`.
     Names so far: 'notifications'; 'preachingPlan'; 'sessionPlanner'; 'sundaysInWhatsOn' (rota services in
     What's On - the server reads churchSettings/features.sundaysInWhatsOn,
     false meaning off). */
  function uses(name) { return true; }

  var api = {
    load: load, wrap: wrap, send: send, header: header, title: title, closeOnLeave: closeOnLeave, uses: uses,
    name: function () { return D.name; }, email: function () { return D.enquiryEmail; }, logo: function () { return D.logoUrl; },
    giving: giving, givingReady: givingReady,
    givingNow: function () { return G ? Object.assign({}, G) : null; }
  };
  global.EGBCChurch = api;
  /* Start straight away, so the name and address are there by the time a
     page sends anything. */
  if (global.EGBCAuth) load();

})(window);
