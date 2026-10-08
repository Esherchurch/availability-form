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
  function header(el, o) {
    o = o || {};
    el.innerHTML = '<div class="ch-in">' +
      (D.logoUrl ? '<img class="ch-logo" src="' + esc(D.logoUrl) + '" alt="">' : '') +
      '<span class="ch-name">' + esc(D.name || 'Rooms for hire') + '</span>' +
      '<span class="ch-hub"></span>' +
      (o.back ? '<a class="ch-back" href="hire.html">&larr; Back to all rooms</a>' : '') + '</div>';
    /* Martin (F-062): someone already signed in to the hub gets a way back
       to it. The public never see it - it appears only once the browser
       says a person is signed in, and this never asks anyone to sign in. */
    try {
      firebase.auth(firebase.app('egbc')).onAuthStateChanged(function (u) {
        var h = el.querySelector('.ch-hub'); if (!h) return;
        h.innerHTML = u ? '<a class="ch-back" href="hub.html" id="ch-hub">Back to the hub</a>' : '';
      });
    } catch (e) { /* no sign-in on this page: nothing to show */ }
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

  var api = {
    load: load, wrap: wrap, send: send, header: header, title: title, closeOnLeave: closeOnLeave,
    name: function () { return D.name; }, email: function () { return D.enquiryEmail; }, logo: function () { return D.logoUrl; }
  };
  global.EGBCChurch = api;
  /* Start straight away, so the name and address are there by the time a
     page sends anything. */
  if (global.EGBCAuth) load();

})(window);
