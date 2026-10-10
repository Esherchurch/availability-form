/* ===================================================================
   EGBC — the events window's screens in the phone app: how they meet
   the shell (egbc-app.js, the main window's; APP-A1 §5 and §6; F-140)
   ===================================================================

   The shell loads the events window's files after its own screens and
   calls, once:

     EGBCAppEvents.mountAll(EGBCApp);

   which mounts every one of them that is loaded:
     Kids Church   today, children          egbc-app-kids.js
     Me            whatson, listen          egbc-app-whatson.js, egbc-app-listen.js
     Maintenance   jobs, rooms              egbc-app-maint.js
     Running       bookings                 egbc-app-office.js
   A screen mounted here replaces one of the same space and tab that the
   shell registered first (its interim "open the page" rows).

   THE HELPERS THE SCREENS USE are the shell's own, in one shape:
     row(icon, title, sub, right, colour)   title, sub: TEXT (escaped by
                                            the shell); right: HTML
     sec(title, inner)                      title: TEXT; inner: HTML
     next(day, mon, title, sub, actions, colour)   all TEXT but actions
     head(title, sub), ic(name, size), esc(text)
     redraw()                               EGBCApp.refresh(this space)
   A screen's own buttons carry data-kact / data-lact / data-wact /
   data-mact / data-oact and are handled by that screen, delegated on the
   document, so they survive every render (F-131).

   WHY NOT THE SHELL'S watch(): in egbc-app.js stage 1 the shell calls a
   screen's watch() again on every draw, and a Firestore listener answers
   at once when it starts - so a screen that refreshes on new data would
   draw, re-watch, be answered, refresh, draw... for ever. Until that is
   settled (F-140), these screens start their listeners once per page and
   ask for a redraw, which never multiplies them.
   =================================================================== */

(function (global) {
  'use strict';

  var COLOURS = { me: '#3d6263', kids: '#7a5f4a', maint: '#4f5a66', office: '#111827' };

  function helpers(App, space) {
    var timer = null;
    return {
      row: function (icon, title, sub, right, colour) { return App.row(icon, title, sub, right || null, null, colour || COLOURS[space]); },
      sec: function (title, inner) { return App.sec(title, inner); },
      next: function (day, mon, title, sub, actions, colour) { return App.next(day, mon, title, sub, actions, colour || COLOURS[space]); },
      head: App.head, ic: App.ic, esc: App.esc,
      /* Many answers can land together; one redraw for them. */
      redraw: function () { clearTimeout(timer); timer = setTimeout(function () { App.refresh(space); }, 30); }
    };
  }

  /* Pills and the small grey notes, as the mock-up draws them. The shell
     does not style these yet (stage 1). Wrapped in :where() so they weigh
     nothing: the moment the shell styles .pill or .example itself, its rule
     wins and this one simply stops mattering (F-140). 12px, not the
     mock-up's 11.5px: DESIGN.md's floor. */
  function fallbackStyles() {
    if (!global.document || global.document.getElementById('egbc-app-events-css')) return;
    var st = global.document.createElement('style');
    st.id = 'egbc-app-events-css';
    st.textContent = ':where(.pill){display:inline-flex;align-items:center;font-size:12px;font-weight:600;padding:3px 8px;border-radius:999px;background:#ecfdf3;color:#15803d;white-space:nowrap}' +
      ':where(.pill.warn){background:#fdf8ee;color:#b07d2e}:where(.pill.n){background:#eef5f4;color:#3d6263}' +
      ':where(.example){font-size:12px;color:#6b7280;text-align:center;margin:0}';
    global.document.head.appendChild(st);
  }

  function mountAll(App) {
    fallbackStyles();
    ['EGBCAppKids', 'EGBCAppWhatson', 'EGBCAppListen', 'EGBCAppMaint', 'EGBCAppOffice'].forEach(function (k) {
      if (global[k] && typeof global[k].mount === 'function') global[k].mount(App);
    });
    if (App.draw) App.draw();
  }

  global.EGBCAppEvents = { helpers: helpers, mountAll: mountAll, COLOURS: COLOURS };
})(window);
