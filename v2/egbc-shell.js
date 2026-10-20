/* ===================================================================
   EGBC Suite — shared page shell
   ===================================================================

   Add after egbc-auth.js on any page:

     <script src="egbc-shell.js" data-title="Live Rota"></script>

   It injects the same bar the hub has - logo, page name, a way back, and
   the signed-in person - and evens out the page width. Nothing else in the
   page is touched, so existing layouts keep working.

   Before this, not one of the 47 pages linked anywhere: navigation lived
   entirely in SharePoint. This is what replaces it.

   Attributes:
     data-title  — what to call the page in the bar (defaults to <title>)
     data-width  — page | wide | full   (default page)
   =================================================================== */

(function () {
  'use strict';

  var script = document.currentScript;
  var pageTitle = (script && script.getAttribute('data-title')) ||
                  (document.title || '').replace(/\s*[|\u2013-]\s*EGBC.*$/i, '').trim() ||
                  'EGBC';
  var width = (script && script.getAttribute('data-width')) || 'page';

  var LOGO = 'https://firebasestorage.googleapis.com/v0/b/egbc-worship-planner.firebasestorage.app/o/copilot_image_1775806874083.jpeg?alt=media&token=7e9040a5-1d29-47e1-8f31-6e003db53ec8';

  var WIDTHS = { page: '1120px', wide: '1400px', full: 'none' };

  function css() {
    var el = document.createElement('style');
    el.id = 'egbc-shell-css';
    el.textContent = [
      /* The suite already uses these values; naming them means a page can
         pick them up without hunting for the hex. */
      ':root{--egbc-canvas:#f6f7f7;--egbc-ink:#111827;--egbc-body:#374151;--egbc-muted:#6b7280;',
      '--egbc-faint:#9ca3af;--egbc-line:#e5e7eb;--egbc-line-2:#d1d5db;--egbc-brand:#3d6263;--egbc-brand-dark:#2a4a4b;',
      '--egbc-tint:#eef5f4;--egbc-page:' + (WIDTHS[width] || WIDTHS.page) + '}',

      /* v108: white bar, clear border and shadow. The earlier white bar was
         lost against the page (1.11:1); a mid-grey border plus a shadow gives
         it an edge, and the brand colour moves to the one button that matters.
         Inset and rounded, no horizontal margin of its own - the page's own
         gutter positions it, as before. */
      '#egbc-bar{position:sticky;top:10px;z-index:9000;display:flex;align-items:center;',
      'justify-content:space-between;gap:12px;margin:10px 0 24px;padding:8px 10px 8px 12px;',
      'border-radius:14px;background:#fff;border:1px solid var(--egbc-line-2);',
      'box-shadow:0 1px 2px rgba(16,24,40,.06),0 6px 16px rgba(16,24,40,.08);',
      'font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}',
      '@media(max-width:700px){#egbc-bar{margin:8px 0 16px;top:8px;border-radius:12px}}',

      '#egbc-bar .eb-l{display:flex;align-items:center;gap:10px;min-width:0;text-decoration:none}',
      '#egbc-bar img{width:32px;height:32px;border-radius:8px;object-fit:cover;',
      'border:1px solid var(--egbc-line);background:#fff;flex-shrink:0}',
      '#egbc-bar .eb-k{font-size:12px;font-weight:400;color:var(--egbc-muted);line-height:1.3;white-space:nowrap}',
      '#egbc-bar .eb-n{font-size:15px;font-weight:600;color:var(--egbc-ink);line-height:1.25;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',

      '#egbc-bar .eb-r{display:flex;align-items:center;gap:6px;flex-shrink:0}',
      '#egbc-bar a.eb-b,#egbc-bar button.eb-b{display:inline-flex;align-items:center;gap:7px;height:36px;',
      'font-family:inherit;font-size:13px;font-weight:500;padding:0 13px;border-radius:8px;',
      'border:1px solid var(--egbc-line-2);background:#fff;color:var(--egbc-ink);cursor:pointer;',
      'text-decoration:none;transition:background .12s,border-color .12s;white-space:nowrap}',
      '#egbc-bar a.eb-b:hover,#egbc-bar button.eb-b:hover{background:#f3f4f6}',
      '#egbc-bar a.eb-b:focus-visible,#egbc-bar button.eb-b:focus-visible{outline:2px solid var(--egbc-brand);outline-offset:2px}',
      '#egbc-bar .eb-b.eb-ghost{border-color:transparent;background:transparent;color:var(--egbc-muted)}',
      '#egbc-bar .eb-b.eb-ghost:hover{color:var(--egbc-ink);background:#f3f4f6}',
      /* The menu is the point of the bar, so it is the one solid button. */
      '#egbc-bar button.eb-nav{background:var(--egbc-brand);color:#fff;border-color:var(--egbc-brand)}',
      '#egbc-bar button.eb-nav:hover{background:var(--egbc-brand-dark);border-color:var(--egbc-brand-dark)}',
      /* CARE & SUPPORT, in words (Martin, 14 Oct 2026: easy to see on every
         page, never icon-only on a computer). "Care" on a phone. */
      '#egbc-bar .eb-b.eb-care{color:var(--egbc-brand);font-weight:600;min-height:44px}',
      '#egbc-bar .eb-care .eb-care-s{display:none}',
      '#egbc-bar .eb-av{width:32px;height:32px;border-radius:50%;background:var(--egbc-tint);color:var(--egbc-brand-dark);',
      'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;margin-left:4px;'
      + 'border:0;padding:0;font-family:inherit;cursor:pointer}',
      '#egbc-bar .eb-av:hover{box-shadow:0 0 0 3px var(--egbc-tint)}',
      '#egbc-bar .eb-av:focus-visible{outline:2px solid var(--egbc-brand);outline-offset:2px}',
      '#egbc-bar .eb-who{font-size:13px;font-weight:500;color:var(--egbc-body);white-space:nowrap}',

      /* Even out the page width without touching the page's own layout. */
      'body>.egbc-w,body>main,body>.container,body>.wrap{max-width:var(--egbc-page);margin-left:auto;margin-right:auto}',

      /* ---- the menu ---- */
      '#egbc-nav-scrim{position:fixed;inset:0;background:rgba(17,24,39,.35);z-index:9500;',
      'opacity:0;pointer-events:none;transition:opacity .18s}',
      '#egbc-nav-scrim.on{opacity:1;pointer-events:auto}',

      '#egbc-nav{position:fixed;top:0;right:0;bottom:0;width:min(380px,92vw);z-index:9600;background:#fff;',
      'border-left:1px solid var(--egbc-line);box-shadow:-12px 0 32px rgba(16,24,40,.12);',
      'transform:translateX(100%);transition:transform .22s ease;display:flex;flex-direction:column;',
      'font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:var(--egbc-ink)}',
      '#egbc-nav.on{transform:none}',

      '#egbc-nav .en-top{display:flex;align-items:center;justify-content:space-between;',
      'padding:14px 16px 14px 20px;border-bottom:1px solid var(--egbc-line)}',
      '#egbc-nav .en-h{font-size:15px;font-weight:600;color:var(--egbc-ink)}',
      '#egbc-nav .en-x{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border:0;',
      'background:transparent;border-radius:8px;color:var(--egbc-muted);cursor:pointer}',
      '#egbc-nav .en-x:hover{background:#f3f4f6;color:var(--egbc-ink)}',
      '#egbc-nav .en-qw{position:relative;margin:16px 20px 6px}',
      '#egbc-nav .en-qw svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--egbc-faint);pointer-events:none}',
      '#egbc-nav .en-q{width:100%;box-sizing:border-box;height:38px;padding:0 12px 0 36px;border:1px solid var(--egbc-line-2);border-radius:8px;',
      'font-family:inherit;font-size:14px;outline:none;background:#fff;color:var(--egbc-ink)}',
      '#egbc-nav .en-q:focus{border-color:var(--egbc-brand);box-shadow:0 0 0 3px rgba(61,98,99,.15)}',
      '#egbc-nav .en-list{flex:1;overflow-y:auto;padding:6px 12px 24px}',
      /* The Menu rows and group headings are drawn by egbc-menu.js, which
         brings its own look - one set of rules for the hub and every other
         page, so they cannot drift apart. What is left here is the panel
         around them: the header, the close button and the search box. */
      '#egbc-nav .en-e{padding:26px 16px;font-size:13px;color:var(--egbc-muted);text-align:center}',

      '@media(max-width:700px){',
      '#egbc-bar{padding:6px 8px}',
      '#egbc-bar .eb-k,#egbc-bar .eb-who,#egbc-bar .eb-lbl{display:none}',
      '#egbc-bar .eb-care .eb-care-l{display:none}#egbc-bar .eb-care .eb-care-s{display:inline}',
      '#egbc-bar a.eb-b,#egbc-bar button.eb-b{padding:0 10px}',
      /* ROOM FOR "CARE" WITHOUT CUTTING THE PAGE'S NAME (14 Oct 2026). On
         a phone the page's name is itself the link to the hub, so the
         separate Hub button and the small logo beside the name go, and
         Care & support takes their place. Nothing is lost: the name still
         goes home. */
      '#egbc-bar .eb-home,#egbc-bar .eb-l img{display:none}',
      '#egbc-bar button.eb-b.eb-care{padding:0 8px;gap:5px}',
      /* THE PAGE'S NAME GETS THE ROOM (Martin, 11 Oct 2026: the bar
         "truncates the page title to Ho…"). The buttons are already
         icons only on a phone; what was left squeezing the title was
         the gaps, the avatar - which says nothing the Menu does not -
         and one line of nowrap with an ellipsis on the end.
         So: the avatar goes, the gaps tighten, and the name wraps to a
         second line instead of being cut off. A bar one line taller is
         worth more than a title nobody can read. */
      /* The initials stay on a phone now: they open the "you" menu, and the
         sign-out icon they replaced took the same room. */
      '#egbc-bar .eb-av{width:34px;height:34px;flex:0 0 auto}',
      '#egbc-bar{gap:8px}',
      '#egbc-bar .eb-r{gap:4px}',
      /* Two lines, held by a max-height rather than -webkit-line-clamp.
         The clamp version made the bar 2,088px tall on Library - the
         page's own CSS reaches .eb-n and the clamp stopped applying, so
         the title wrapped to a hundred lines and the bar grew with it.
         A max-height cannot do that whatever the page does to display. */
      '#egbc-bar .eb-n{white-space:normal;line-height:1.2;max-height:2.4em;overflow:hidden}',
      '}'
    ].join('');
    document.head.appendChild(el);
  }

  /* Font and icons come from egbc-ui.js, so every page that has the bar
     gets them without its own script tag. Loaded from beside this file. */
  function font() {
    if (window.EGBCUI || document.querySelector('script[src*="egbc-ui.js"]')) return;
    var me = document.querySelector('script[src*="egbc-shell.js"]');
    var s = document.createElement('script');
    s.src = me ? me.getAttribute('src').replace('egbc-shell.js', 'egbc-ui.js') : 'egbc-ui.js';
    document.head.appendChild(s);
  }

  function ic(name, size) {
    return '<i data-lucide="' + name + '" style="width:' + (size || 18) + 'px;height:' + (size || 18) + 'px"></i>';
  }
  function pageIc(p) {
    return window.EGBCUI ? EGBCUI.pageIcon(p) : 'file-text';
  }

  function initials(s) {
    return (s || '?').split(/\s+/).filter(Boolean).map(function (w) { return w[0]; })
      .join('').slice(0, 2).toUpperCase();
  }

  function bar(profile) {
    if (document.getElementById('egbc-bar')) return;

    var d = document.createElement('div');
    d.id = 'egbc-bar';

    /* A link back to the hub is not navigation - it is two clicks to reach
       anything. The same list the hub shows goes on every page. */
    var right = '';
    right += '<a class="eb-b eb-home" href="hub.html" title="Back to the Team Hub">' + ic('house', 16) + '<span class="eb-lbl">Hub</span></a>';
    if (profile) right += '<button class="eb-b eb-nav" id="egbc-nav-btn">' + ic('layout-grid', 16) + '<span class="eb-lbl">Menu</span></button>';
    /* CARE & SUPPORT (NEXT-BRIEF §24, Martin 14 Oct 2026), beside the
       initials on every page, signed in or not. It is never hidden - not
       by a person's own Home choices, and by the church only if it has
       switched off the whole care and safeguarding part (feature 'care').
       Not on the pages it leads to: a button that reopens where you are
       is a dead end. */
    var herePage = String(location.pathname || '').split('/').pop().toLowerCase();
    var careOff = window.EGBCAuth && EGBCAuth.uses && !EGBCAuth.uses('care');   /* the stored switch (F-230) */
    if (!careOff && herePage !== 'care.html') {
      right += '<button type="button" class="eb-b eb-care" id="egbc-care-btn" aria-haspopup="dialog" aria-expanded="false"'
             + ' aria-label="Care and support">' + ic('hand-heart', 16)
             + '<span class="eb-care-l">Care &amp; support</span><span class="eb-care-s">Care</span></button>';
    }
    if (profile) {
      var who = String(profile.name || profile.email).replace(/</g, '&lt;');
      /* THE INITIALS OPEN THE "YOU" MENU (Martin, 13 Oct 2026): Notifications,
         My details, Add to my calendar, My availability, View as (master
         admin), Sign out - drawn by egbc-menu.js for the hub and every page. */
      right += '<button type="button" class="eb-av" id="egbc-you-btn" aria-haspopup="menu" aria-expanded="false"'
             + ' aria-label="You: ' + who + '" title="' + who + '">' + initials(profile.name || profile.email) + '</button>';
    }

    d.innerHTML =
      '<a class="eb-l" href="hub.html">' +
        '<img src="' + LOGO + '" alt="EGBC">' +
        '<div style="min-width:0">' +
          '<div class="eb-n">' + pageTitle.replace(/</g, '&lt;') + '</div>' +
          '<div class="eb-k">Esher Green Baptist Church</div>' +
        '</div>' +
      '</a>' +
      '<div class="eb-r">' + right + '</div>';

    document.body.insertBefore(d, document.body.firstChild);
    unflex(d);
    pushDownStickyHeaders(d);
    checkFresh();

    var nb = document.getElementById('egbc-nav-btn');
    if (nb) nb.addEventListener('click', openNav);
    var cb = document.getElementById('egbc-care-btn');
    if (cb) cb.addEventListener('click', function () {
      loadCare().then(function () { EGBCCare.open(cb); },
        function () { location.href = 'care.html'; });
    });
    var yb = document.getElementById('egbc-you-btn');
    if (yb) yb.addEventListener('click', function () {
      loadMenuScript().then(function () {
        if (window.EGBCMenu && EGBCMenu.toggleYou) EGBCMenu.toggleYou(yb, profile);
      });
    });
  }

  /* ---- is this page the one that was installed? ----------------------

     Every page's script tags carry a stamp put there by the installer, so
     the code refreshes the moment a new build lands. The HTML around them
     has no stamp of its own, so a browser can sit on yesterday's page while
     running today's scripts - which is how the address book kept its old
     layout after the fix had shipped, and why the build number said one
     thing while the page said another.

     So: read our own stamp, ask the site what the current one is, and if
     they disagree load the page once with the new stamp on the end. That URL
     has not been seen before, so the cached copy is not used. Once per
     stamp, so a mistake here cannot turn into a reload loop. */

  function checkFresh() {
    var me = document.querySelector('script[src*="egbc-shell.js"]');
    var mine = me && (me.getAttribute('src').split('?v=')[1] || '');
    if (!mine) return;

    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v || !v.stamp || String(v.stamp) === String(mine)) return;
        var key = 'egbc_fresh_' + v.stamp;
        try {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, '1');
        } catch (e) { return; }
        /* Keep everything else after the "?" - a sign-up's key, a meeting's
           room and host token. Dropping them broke every emailed link the
           first time it was opened in a new tab (F-025). */
        var q = new URLSearchParams(location.search);
        q.set('v', v.stamp);
        location.replace(location.pathname + '?' + q.toString() + location.hash);
      })
      .catch(function () {});
  }

  /* ---- the menu, on every page -------------------------------------- */

  var NAV = null;   /* cached page list */

  function navPanel() {
    var p = document.getElementById('egbc-nav');
    if (p) return p;

    var scrim = document.createElement('div');
    scrim.id = 'egbc-nav-scrim';
    scrim.addEventListener('click', closeNav);

    p = document.createElement('div');
    p.id = 'egbc-nav';
    p.innerHTML =
      '<div class="en-top">' +
        '<div class="en-h">Menu</div>' +
        '<button class="en-x" id="egbc-nav-x" title="Close">' + ic('x', 18) + '</button>' +
      '</div>' +
      '<div class="en-qw">' + ic('search', 16) +
        '<input class="en-q" id="egbc-nav-q" placeholder="Search pages" autocomplete="off"></div>' +
      '<div class="en-list" id="egbc-nav-list"></div>';

    document.body.appendChild(scrim);
    document.body.appendChild(p);
    document.getElementById('egbc-nav-x').addEventListener('click', closeNav);
    document.getElementById('egbc-nav-q').addEventListener('input', function (e) {
      renderNav(e.target.value.trim().toLowerCase());
    });
    return p;
  }

  /* ================= THE MENU IS egbc-menu.js, EVERYWHERE =============

     Martin, 9 Oct 2026, on the live whatson.html: the Menu differs between
     pages. It did. hub.html loaded egbc-menu.js and drew the structure he
     approved; every other page got this file, which built its own groups out
     of the registry - Apps, Everyone, AV, Core Team, Worship. Two arrangements
     of the same pages, which is the one thing Step N exists to stop, and the
     reason he could not find anything in the first place.

     So this file no longer arranges anything. It loads egbc-menu.js and calls
     EGBCMenu.paint, which is the same function the hub's panel calls. Not two
     renderers kept in step - one renderer.

     NO PAGE NEEDS A SCRIPT TAG FOR IT. This loads it, so the Menu is right on
     a page nobody remembered to update. */

  var MENU_SRC = 'egbc-menu.js';
  /* THE MENU'S OWN STAMP (the reviewing window, 15 Oct 2026: Martin could
     not see Payments until his browser happened to fetch the new Menu).
     Change it whenever egbc-menu.js changes - tests/check-stamps.mjs fails
     until you do, because MENU_FINGERPRINT must match the file. The hub
     loads the Menu itself with the same stamp. */
  var MENU_V = '202610201600';
  var MENU_FINGERPRINT = 'b4545352320a';
  var POWERED_SRC = 'egbc-poweredby.js';
  var menuLoading = null;

  /* Alongside this file, with our own version stamp on it, so a cached copy
     of one is never paired with a fresh copy of the other. */
  function sibling(name) {
    var me = document.querySelector('script[src*="egbc-shell.js"]');
    var base = me ? me.getAttribute('src').split('egbc-shell.js')[0] : '';
    var stamp = me ? (me.getAttribute('src').split('?v=')[1] || '') : '';
    return base + name + (stamp ? '?v=' + stamp : '');
  }

  /* §19's credit, on the end of the Menu. It is drawn by egbc-menu.js, which
     only needs this to be loaded first. A page where it fails to load gets a
     Menu with no credit, which is the right way round. */
  function loadPoweredBy() {
    if (window.EGBCPoweredBy) return Promise.resolve();
    return new Promise(function (res) {
      var s = document.createElement('script');
      s.src = sibling(POWERED_SRC);
      s.onload = res; s.onerror = function () { res(); };
      document.head.appendChild(s);
    });
  }

  /* The Care & support choice, the first time somebody asks for it. If
     it will not load, care.html is the same choice as a page. */
  var careLoading = null;
  function loadCare() {
    if (window.EGBCCare) return Promise.resolve();
    if (careLoading) return careLoading;
    careLoading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = sibling('egbc-care.js');
      s.onload = function () { window.EGBCCare ? res() : rej(new Error('no EGBCCare')); };
      s.onerror = function () { careLoading = null; rej(new Error('could not load ' + s.src)); };
      document.head.appendChild(s);
    });
    return careLoading;
  }

  function loadMenuScript() {
    if (window.EGBCMenu) return Promise.resolve();
    if (menuLoading) return menuLoading;
    menuLoading = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = sibling(MENU_SRC).split('?')[0] + '?v=' + MENU_V;
      s.onload = res;
      s.onerror = function () { rej(new Error('could not load ' + s.src)); };
      document.head.appendChild(s);
    });
    return menuLoading;
  }

  /* ===== WHO IS SIGNED IN, WHICHEVER WAY THE PAGE SIGNED THEM IN =====

     Most pages load egbc-auth.js, which is the compat SDK, and the Menu asks
     EGBCMenu.who() - which reads EGBCAuth.profile().

     youthserviceplanner.html does not. It is a MODULAR page: it imports
     egbc-db.js and awaits `ready`, so it signs in like any other page, on the
     same named app, and the person is just as signed in. It simply has no
     EGBCAuth for the Menu to read.

     I had this wrong the first time and wrote it up as a page with no
     sign-in at all (A-025). It is one page with a different SDK, not a page
     with a different rule, and the Menu should ask the other way round
     rather than give that person a stranger's Menu.

     Note the import specifier has NO version stamp: the page itself imports
     './egbc-db.js', and a different URL would be a second copy of the module
     with its own auth listener. Same URL, same module, same session. */

  var WHO = null;

  /* EGBCMenu.who() and nothing else. This used to be a second copy of the
     same three lines, and it had already fallen behind: EGBCMenu.who() reads
     "View the site as" so a master admin previewing as a Worship member gets
     that member's Menu, and it carries the teams a team-gated entry needs.
     The copy here did neither, so the Menu differed between the hub and
     every other page again - quietly, and only for an admin previewing. */
  function whoFromAuth() { return EGBCMenu.who(); }

  var NOBODY = { teams: [], adminFor: [], isMaster: false,
                 isCore: false, isAdmin: false, isBookingsAdmin: false };

  /* The modular side: egbc-db.js for the session, and the same users/{uid}
     document egbc-auth.js mirrors its profile from. */
  var modular = null;
  function loadModular() {
    if (modular) return modular;
    modular = import('./egbc-db.js').then(function (m) {
      return m.ready.then(function (user) { return { m: m, user: user }; });
    }).catch(function (e) {
      console.warn('egbc-shell: no modular database either', e && e.message);
      return { m: null, user: null };
    });
    return modular;
  }

  function loadWho() {
    if (WHO) return Promise.resolve(WHO);
    if (window.EGBCAuth && EGBCAuth.profile && EGBCAuth.profile()) {
      WHO = whoFromAuth();
      return Promise.resolve(WHO);
    }
    if (window.EGBCAuth) { WHO = NOBODY; return Promise.resolve(WHO); }

    return loadModular().then(function (x) {
      if (!x.m || !x.user) { WHO = NOBODY; return WHO; }
      return import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js')
        .then(function (fs) {
          return fs.getDoc(fs.doc(x.m.db, 'users', x.user.uid));
        })
        .then(function (snap) {
          var p = (snap && snap.exists && snap.exists()) ? snap.data() : {};
          /* Exactly the test egbc-auth.js makes, so the same person gets the
             same Menu whichever SDK the page happens to use. */
          /* The same fields EGBCMenu.who() produces, worked out from the
             same document egbc-auth.js mirrors its profile from. There is no
             "View the site as" on a modular page - that is an EGBCAuth
             feature - so this is simply the person as they are. */
          var teams = p.teams || [], adminFor = p.adminFor || [];
          WHO = {
            teams: teams,
            adminFor: adminFor,
            isMaster: p.masterAdmin === true,
            isCore: teams.indexOf('Core Team') !== -1 || p.masterAdmin === true,
            isAdmin: p.masterAdmin === true || adminFor.length > 0,
            isBookingsAdmin: window.EGBC_BOOKINGS_ADMIN === true
          };
          return WHO;
        })
        .catch(function (e) {
          console.warn('egbc-shell: could not read the profile', e && e.message);
          WHO = NOBODY;
          return WHO;
        });
    });
  }

  /* The registry, for one question only: has an admin switched this page off?
     It used to decide where every page SAT as well, which is what made the
     Menu different here. */
  function loadRegistry() {
    if (NAV) return Promise.resolve(NAV);
    /* The Menu must draw without it. The registry answers one question - has
       an admin switched this page off - and not knowing the answer is a
       reason to show the page, not a reason to show nothing.

       youthserviceplanner.html is the case that proved it: it loads this file
       and no egbc-auth.js at all, so EGBCAuth is not there to read with, and
       the Menu sat on "Loading..." for ever. It did that before this rewrite
       too; nothing had looked. */
    if (window.EGBCAuth && EGBCAuth.db) {
      return EGBCAuth.db.collection('hubPages').get().then(function (snap) {
        NAV = snap.docs.map(function (d) { return d.data(); });
        return NAV;
      }).catch(function (e) {
        console.error('egbc-shell: page list failed', e);
        NAV = [];
        return NAV;
      });
    }
    /* A modular page reads it modularly. Same collection, same answer. */
    return loadModular().then(function (x) {
      if (!x.m || !x.user) { NAV = []; return NAV; }
      return import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js')
        .then(function (fs) { return fs.getDocs(fs.collection(x.m.db, 'hubPages')); })
        .then(function (snap) { NAV = snap.docs.map(function (d) { return d.data(); }); return NAV; })
        .catch(function (e) { console.warn('egbc-shell: page list failed', e && e.message); NAV = []; return NAV; });
    });
  }

  function switchedOff(url) {
    var u = String(url || '').toLowerCase();
    return (NAV || []).some(function (p) {
      return String(p.url || '').toLowerCase() === u && p.enabled === false;
    });
  }

  function closeNav() {
    var s = document.getElementById('egbc-nav-scrim');
    var p = document.getElementById('egbc-nav');
    if (s) s.classList.remove('on');
    if (p) p.classList.remove('on');
  }

  /* The Menu, openable from anywhere - the hub's More tab needs it, and
     clicking the bar button from script is a trick that breaks the first time
     somebody renames the button.

     This went missing when the old registry grouping was taken out, and every
     page then had a Menu button that did nothing. check-menu.mjs caught it,
     but only through "every page that should have a Menu has one" - the
     name-for-name comparison passed, because a page with no Menu has no names
     to disagree about. Two assertions, and the quiet one was the one that
     mattered. */
  window.EGBCShell = { openMenu: function () { openNav(); } };

  function renderNav(q) {
    var list = document.getElementById('egbc-nav-list');
    if (!list) return;
    if (!window.EGBCMenu) { list.innerHTML = '<div class="en-e">Loading&hellip;</div>'; return; }
    EGBCMenu.paint(list, {
      who: WHO || (window.EGBCAuth ? EGBCMenu.who() : NOBODY),
      query: q || '',
      here: (location.pathname.split('/').pop() || '').toLowerCase(),
      switchedOff: switchedOff
    });
  }

  function openNav() {
    navPanel();
    document.getElementById('egbc-nav-scrim').classList.add('on');
    document.getElementById('egbc-nav').classList.add('on');
    renderNav('');

    /* loadWho() asks EGBCMenu.who(), so it waits for the script. */
    Promise.all([loadMenuScript().then(loadWho), loadRegistry(), loadPoweredBy()]).then(function () {
      var q = document.getElementById('egbc-nav-q');
      renderNav(q ? q.value.trim().toLowerCase() : '');
    }).catch(function (e) {
      var list = document.getElementById('egbc-nav-list');
      if (list) list.innerHTML = '<div class="en-e">Could not load the menu.<br>Use Hub instead.</div>';
      console.error('egbc-shell: menu failed', e);
    });
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNav(); });

  /* Several pages have their own sticky or fixed header pinned at top:0.
     Ours sits above them, so without this the two overlap the moment you
     scroll and the page's own header is unreadable. Move anything already
     pinned to the top down by our height instead of fighting it.

     Only elements at top:0 are touched - a sticky table heading further
     down the page is left exactly where it is. */
  /* ---- a bar cannot be a flex item in a row -------------------------
     Library's body is `display:flex; height:100vh` - two full-height
     columns side by side. The bar is inserted as the body's first
     child, so it became a THIRD column: stretched to the full height by
     align-items, and on a phone that meant a 2,088px bar and a screen
     that was nothing else (Martin, 11 Oct 2026, A-074).

     Where the body lays its children out in a row or a grid, the bar
     comes out of the flow and floats at the top instead, and the body
     is given room for it. border-box so that room comes out of the
     100vh rather than being added to it, which would make the page
     scroll by exactly the height of the bar. */
  function unflex(bar) {
    var bcs = window.getComputedStyle(document.body);
    if (!/^(flex|inline-flex|grid|inline-grid)$/.test(bcs.display)) return;
    bar.style.position = 'fixed';
    bar.style.top = '8px';
    bar.style.left = '8px';
    bar.style.right = '8px';
    bar.style.margin = '0';
    var room = function () {
      document.body.style.boxSizing = 'border-box';
      document.body.style.paddingTop = (bar.offsetHeight + 16) + 'px';
    };
    room();
    window.addEventListener('resize', room);
  }

  function pushDownStickyHeaders(bar) {
    /* The bar floats, so what matters is where its bottom edge sits, not
       just how tall it is: its own top offset counts too. */
    var bcs = window.getComputedStyle(bar);
    var h = bar.offsetHeight + (parseFloat(bcs.top) || 0) + 8;
    if (!bar.offsetHeight) return;

    /* Any page that wants to size something against the remaining screen can
       read this rather than guessing at the bar's height. */
    document.documentElement.style.setProperty('--egbc-bar', h + 'px');

    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el === bar || bar.contains(el)) continue;

      /* A FULL-SCREEN OVERLAY IS NOT A HEADER TO BE PUSHED DOWN.
         data-egbc-overlay says "I cover the screen on purpose; leave my
         position alone". The pin board's full-screen note (7f) is the
         first: it asks for inset:0 and was given top:66px and a height
         short by the same amount, so a note that should have filled the
         phone left a strip of the page showing above it.

         Deliberately NOT data-am-own, which app mode uses: stickynotes
         marks its four stacked bars with that, and those DO still need
         pushing down by this bar. One attribute for both would have
         quietly stopped that and dropped the bars behind it. */
      if (el.hasAttribute('data-egbc-overlay')) continue;

      var cs = window.getComputedStyle(el);
      if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;

      /* Pages stack these: the pin board has a header at top 0, its page
         switcher at 64, and a filter row under that. Moving only the top one
         dropped it straight onto the switcher. Shift the whole stack by the
         same amount so the gaps between them survive. */
      var top = parseFloat(cs.top);
      if (isNaN(top) || top < 0 || top > 200) continue;

      el.style.top = (top + h) + 'px';

      /* A tall sticky column - the address book's entry form is one - was
         sized against the whole screen. Pushed down by the bar, its foot now
         hangs below the fold, which is why the Save button had to be scrolled
         to. Take the same height back off it. */
      if (cs.position === 'sticky') {
        var tall = el.getBoundingClientRect().height;
        if (tall && tall + top + h > window.innerHeight) {
          el.style.maxHeight = 'calc(100vh - ' + (top + h + 24) + 'px)';
        }
      }
      /* A fixed full-height panel (a slide-over, a modal) would now hang off
         the bottom, so give back the height we took. */
      if (cs.position === 'fixed' && parseFloat(cs.bottom) === 0) {
        /* Keep its bottom edge on the bottom of the screen: the height is what
           is left below its NEW top. Taking off only the bar's height was right
           for panels that started at the very top, but a panel that started
           lower (the pin board's cork, top 152px) ended up that much taller
           than the screen - and its scroll bar hung out of reach below it. */
        el.style.height = 'calc(100% - ' + (top + h) + 'px)';
      }
    }
  }


  function start() {
    /* APP MODE (APP-DESIGN-BRIEF §7d A). When the app opened this page,
       the website's bar, its Menu and its preview strip are not drawn at
       all - egbc-appmode.js puts the app's slim header and tab bar there
       instead. The page itself is untouched either way (§15).
       It is checked FIRST, before css() and font(), so nothing of the
       website's chrome is laid out and then hidden. */
    if (window.EGBCAppMode && EGBCAppMode.on()) {
      font();
      EGBCAppMode.start({ title: pageTitle });
      return;
    }
    css();
    font();

    /* On a guarded page the bar waits for the person, so it can show who they
       are. On an open page it appears straight away with just the Hub link. */
    if (typeof EGBCAuth !== 'undefined') {
      document.addEventListener('egbc-ready', function (e) { bar(e.detail); });
      EGBCAuth.optional().then(function (p) { bar(p); }).catch(function () { bar(null); });
    } else {
      bar(null);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
