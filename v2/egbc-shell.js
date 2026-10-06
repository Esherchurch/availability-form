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
      'justify-content:space-between;gap:12px;margin:10px 0 0;padding:8px 10px 8px 12px;',
      'border-radius:14px;background:#fff;border:1px solid var(--egbc-line-2);',
      'box-shadow:0 1px 2px rgba(16,24,40,.06),0 6px 16px rgba(16,24,40,.08);',
      'font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}',
      '@media(max-width:700px){#egbc-bar{margin:8px 0 0;top:8px;border-radius:12px}}',

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
      '#egbc-bar .eb-av{width:32px;height:32px;border-radius:50%;background:var(--egbc-tint);color:var(--egbc-brand-dark);',
      'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;margin-left:4px}',
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
      '#egbc-nav .en-g{display:flex;align-items:center;gap:8px;width:100%;text-align:left;cursor:pointer;',
      'font:inherit;font-size:12px;font-weight:600;color:var(--egbc-muted);background:none;border:0;',
      'border-radius:6px;padding:10px 8px 6px;margin:6px 0 0}',
      '#egbc-nav .en-g:hover{color:var(--egbc-ink)}',
      '#egbc-nav .en-g .en-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}',
      '#egbc-nav .en-g .en-cnt{margin-left:auto;font-weight:500;color:var(--egbc-faint)}',
      '#egbc-nav .en-g .en-arw{display:inline-flex;transition:transform .18s;color:var(--egbc-faint)}',
      '#egbc-nav .en-g.open .en-arw{transform:rotate(90deg)}',
      '#egbc-nav .en-b{overflow:hidden;max-height:0;transition:max-height .22s ease}',
      '#egbc-nav .en-b.open{max-height:2400px}',
      '#egbc-nav .en-i{display:flex;align-items:center;gap:12px;padding:8px;border-radius:8px;',
      'text-decoration:none;color:var(--egbc-ink);transition:background .12s}',
      '#egbc-nav .en-i:hover{background:#f3f4f6}',
      '#egbc-nav .en-i.on{background:var(--egbc-tint)}',
      '#egbc-nav .en-ic{width:34px;height:34px;border-radius:8px;border:1px solid var(--egbc-line);background:#fff;display:flex;',
      'align-items:center;justify-content:center;color:var(--egbc-brand);flex-shrink:0}',
      '#egbc-nav .en-t{font-size:14px;font-weight:500;line-height:1.3;min-width:0}',
      '#egbc-nav .en-d{display:block;font-size:12px;font-weight:400;color:var(--egbc-muted);margin-top:1px;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#egbc-nav .en-t em{font-style:normal;font-size:11px;font-weight:500;color:var(--egbc-brand);margin-left:6px}',
      '#egbc-nav .en-e{padding:26px 16px;font-size:13px;color:var(--egbc-muted);text-align:center}',

      '@media(max-width:700px){',
      '#egbc-bar{padding:6px 8px}',
      '#egbc-bar .eb-k,#egbc-bar .eb-who,#egbc-bar .eb-lbl{display:none}',
      '#egbc-bar a.eb-b,#egbc-bar button.eb-b{padding:0 10px}',
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
    if (profile) {
      var who = String(profile.name || profile.email).replace(/</g, '&lt;');
      right += '<div class="eb-av" title="' + who + '">' + initials(profile.name || profile.email) + '</div>' +
               '<button class="eb-b eb-ghost" title="Sign out" onclick="EGBCAuth.signOut()">' + ic('log-out', 16) + '</button>';
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
    pushDownStickyHeaders(d);
    checkFresh();

    var nb = document.getElementById('egbc-nav-btn');
    if (nb) nb.addEventListener('click', openNav);
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
        location.replace(location.pathname + '?v=' + v.stamp + location.hash);
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

  /* The same exclusions the hub makes. A charter is read on the landing
     page, a phone app is installed rather than browsed to, and an
     instruction page hangs off the tool it explains - so all three are noise
     in a list of places to go. */
  var NAV_SKIP = ['coreteamapp.html', 'worshiphubapp.html', 'youthapp2.html',
                  'performancenotes.html', 'worshipteamcharter.html',
                  'youthcharter.html', 'coreteamcharter.html',
                  'avteamlandingpage.html', 'egbcworship&av.html'];

  function pageTeams(p) {
    if (p.teams && p.teams.length) return p.teams;
    return p.team ? [p.team] : [];
  }

  function maySee(p) {
    if (p.enabled === false || p.heading || !p.url) return false;
    if (p.helpFor) return false;
    if (NAV_SKIP.indexOf(decodeURIComponent(p.url).toLowerCase()) !== -1) return false;
    /* Was asking about the single `team` field, so a page belonging to
       several only showed to admins of the first. */
    if (p.adminOnly && !pageTeams(p).some(function (t) { return EGBCAuth.isAdminOf(t); })) return false;
    if (p.everyone) return true;
    if (EGBCAuth.isMaster()) return true;
    var mine = EGBCAuth.effectiveTeams();
    var admin = EGBCAuth.adminAreas();
    return pageTeams(p).some(function (t) { return mine.indexOf(t) !== -1 || admin.indexOf(t) !== -1; });
  }

  /* ---- grouped the way the hub groups them ---------------------------

     This list was flat, and on a master admin's screen that is forty-odd
     pages in one column with the old ones mixed in. The hub already solved
     it: headings you can fold, a count on each, everyone's pages at the top.
     Same shape here, so the two do not feel like different products. */

  var SHARED = '__shared';

  function groupOf(p) {
    if (p.everyone) return SHARED;
    var list = pageTeams(p);
    return list.length ? list[0] : SHARED;
  }

  function groupInfo(key) {
    if (key === SHARED) return { label: 'Everyone', colour: '#6b8281' };
    var t = EGBCAuth.TEAMS && EGBCAuth.TEAMS[key];
    return { label: (t && t.label) || key, colour: (t && t.colour) || '#6b8281' };
  }

  /* Everyone first, then your own areas, then the rest alphabetically. */
  function groupOrder(keys) {
    var mine = (EGBCAuth.effectiveTeams() || []).concat(EGBCAuth.adminAreas() || []);
    return keys.sort(function (a, b) {
      if (a === SHARED) return -1;
      if (b === SHARED) return 1;
      var am = mine.indexOf(a) !== -1, bm = mine.indexOf(b) !== -1;
      if (am !== bm) return am ? -1 : 1;
      return groupInfo(a).label.localeCompare(groupInfo(b).label);
    });
  }

  window.egbcToggleGroup = function (btn) {
    btn.classList.toggle('open');
    var body = btn.nextElementSibling;
    if (body) body.classList.toggle('open');
  };

  function renderNav(q) {
    var list = document.getElementById('egbc-nav-list');
    if (!NAV) { list.innerHTML = '<div class="en-e">Loading&hellip;</div>'; return; }

    var here = (location.pathname.split('/').pop() || '').toLowerCase();
    var rows = NAV.filter(maySee).filter(function (p) {
      if (!q) return true;
      return (p.title || '').toLowerCase().indexOf(q) !== -1 ||
             (p.description || '').toLowerCase().indexOf(q) !== -1;
    });

    if (!rows.length) { list.innerHTML = '<div class="en-e">Nothing matches that.</div>'; return; }

    var item = function (p) {
      var on = decodeURIComponent(p.url).toLowerCase() === decodeURIComponent(here);
      return '<a class="en-i' + (on ? ' on' : '') + '" href="' + p.url + '">' +
               '<span class="en-ic">' + ic(pageIc(p), 18) + '</span>' +
               '<span class="en-t">' + String(p.title || '').replace(/</g, '&lt;') +
               (on ? '<em>You are here</em>' : '') +
               (p.description ? '<span class="en-d">' + String(p.description).replace(/</g, '&lt;') + '</span>' : '') +
               '</span>' +
             '</a>';
    };

    /* Searching flattens it. When you are hunting for one page, headings are
       in the way. */
    if (q) { list.innerHTML = rows.map(item).join(''); return; }

    var buckets = {};
    rows.forEach(function (p) {
      var k = groupOf(p);
      (buckets[k] = buckets[k] || []).push(p);
    });

    /* The group holding the page you are on opens itself, along with the
       shared one. Everything expanded at once is the wall this replaced. */
    var hereGroup = null;
    rows.forEach(function (p) {
      if (decodeURIComponent(p.url).toLowerCase() === decodeURIComponent(here)) hereGroup = groupOf(p);
    });

    list.innerHTML = groupOrder(Object.keys(buckets)).map(function (k, i) {
      var g = groupInfo(k);
      var open = (k === SHARED) || k === hereGroup || (i === 0);
      return '<button class="en-g' + (open ? ' open' : '') + '" onclick="egbcToggleGroup(this)">' +
               '<span class="en-arw">' + ic('chevron-right', 14) + '</span>' +
               '<span class="en-dot" style="background:' + g.colour + '"></span>' +
               '<span>' + g.label.replace(/</g, '&lt;') + '</span>' +
               '<span class="en-cnt">' + buckets[k].length + '</span>' +
             '</button>' +
             '<div class="en-b' + (open ? ' open' : '') + '">' +
               buckets[k].map(item).join('') +
             '</div>';
    }).join('');
  }

  function openNav() {
    navPanel();
    document.getElementById('egbc-nav-scrim').classList.add('on');
    document.getElementById('egbc-nav').classList.add('on');

    if (NAV) { renderNav(''); return; }
    renderNav('');

    /* Read the same registry the hub reads, so there is one list to keep
       right rather than a second copy that drifts. */
    try {
      EGBCAuth.db.collection('hubPages').get().then(function (snap) {
        NAV = snap.docs.map(function (d) { return d.data(); })
                 .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        /* Reachable before an admin registers it - same entry as
           BUILT_IN_PAGES in hub-app.js. The registered copy wins. */
        var hasMeeting = NAV.some(function (p) { return (p.url || '').toLowerCase() === 'meeting.html'; });
        if (!hasMeeting) NAV.unshift({ url: 'meeting.html', title: 'Meetings', icon: '\u{1F4F9}', team: 'Core Team', everyone: true,
          description: 'Video meetings - set one up, join a call, every meeting room' });
        renderNav(document.getElementById('egbc-nav-q').value.trim().toLowerCase());
      }).catch(function (e) {
        document.getElementById('egbc-nav-list').innerHTML =
          '<div class="en-e">Could not load the page list.<br>Use Hub instead.</div>';
        console.error('egbc-shell: page list failed', e);
      });
    } catch (e) {
      document.getElementById('egbc-nav-list').innerHTML =
        '<div class="en-e">Could not load the page list.<br>Use Hub instead.</div>';
    }
  }

  function closeNav() {
    var s = document.getElementById('egbc-nav-scrim');
    var p = document.getElementById('egbc-nav');
    if (s) s.classList.remove('on');
    if (p) p.classList.remove('on');
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeNav(); });

  /* Several pages have their own sticky or fixed header pinned at top:0.
     Ours sits above them, so without this the two overlap the moment you
     scroll and the page's own header is unreadable. Move anything already
     pinned to the top down by our height instead of fighting it.

     Only elements at top:0 are touched - a sticky table heading further
     down the page is left exactly where it is. */
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
        el.style.height = 'calc(100% - ' + h + 'px)';
      }
    }
  }

  /* ---- one look on every page (v109) --------------------------------

     The bar and the hub follow v2/DESIGN.md; the forty-odd pages under the
     bar were each styled by hand - Montserrat, capitals, wide spacing,
     weight 900, pill buttons. Until each page is restyled properly
     (RESTYLE-BRIEF.md), this brings them into line as they load:

       - Montserrat becomes Inter; other fonts (Caveat on the pin board) stay
       - capitals and wide letter-spacing go; 800/900 weights become 700
       - pill-shaped buttons and inputs get 8px corners, big cards 14px

     It works on the page's own stylesheets (including the one Tailwind
     writes at run time) and on inline styles. Anything being composed -
     a contenteditable area, such as the email builder's body - is left
     exactly as written, so what you see is what gets sent.

     A page opts out with data-theme="off" on its egbc-shell.js tag. */

  var THEME_OFF = script && script.getAttribute('data-theme') === 'off';
  var BUTTONISH = /(^|[\s.#>+~,(-])(btn|button|pill|chip|tab|tag|badge|input|select|search|field|fld|filter|toggle)/i;
  var SKIP_SEL = /contenteditable|editable|email-canvas|preview/i;

  function themeRule(r) {
    var s = r.style;
    if (!s || SKIP_SEL.test(r.selectorText || '')) return;
    if (/montserrat/i.test(s.fontFamily)) s.setProperty('font-family', 'Inter, system-ui, sans-serif', s.getPropertyPriority('font-family'));
    /* Fonts kept in a variable, e.g. --font: 'Montserrat' on the pin board. */
    for (var i = 0; i < s.length; i++) {
      var p = s[i];
      if (p.indexOf('--') === 0 && /montserrat/i.test(s.getPropertyValue(p))) {
        s.setProperty(p, s.getPropertyValue(p).replace(/['"]?Montserrat['"]?/ig, 'Inter'), s.getPropertyPriority(p));
      }
    }
    if (s.textTransform === 'uppercase') s.setProperty('text-transform', 'none', s.getPropertyPriority('text-transform'));
    if (s.letterSpacing && parseFloat(s.letterSpacing) > 0) s.setProperty('letter-spacing', 'normal', s.getPropertyPriority('letter-spacing'));
    if (s.fontWeight === '800' || s.fontWeight === '900') s.setProperty('font-weight', '700', s.getPropertyPriority('font-weight'));
    var br = parseFloat(s.borderRadius);
    if (br >= 50 && BUTTONISH.test(r.selectorText || '')) s.setProperty('border-radius', '8px', s.getPropertyPriority('border-radius'));
  }

  function themeList(rules) {
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.cssRules && !r.style) themeList(r.cssRules);       // @media, @supports
      else themeRule(r);
    }
  }

  var themed = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  function themeSheets() {
    if (THEME_OFF) return;
    for (var i = 0; i < document.styleSheets.length; i++) {
      var sh = document.styleSheets[i];
      if (themed && themed.has(sh)) continue;
      var rules = null;
      try { rules = sh.cssRules; } catch (e) { continue; }        // cross-origin (Google Fonts)
      if (!rules || (sh.ownerNode && sh.ownerNode.id === 'egbc-shell-css')) continue;
      themeList(rules);
      if (themed) themed.add(sh);
    }
  }

  function themeCss() {
    if (THEME_OFF) return '';
    var H = 'html:not(.egbc-no-theme) ';
    var NE = ':not([contenteditable] *):not([contenteditable])';
    return [
      H + 'body{font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}',
      H + 'button,' + H + 'input,' + H + 'select,' + H + 'textarea{font-family:inherit}',
      H + '[style*="ontserrat"]' + NE + '{font-family:Inter,system-ui,sans-serif!important}',
      H + '[style*="uppercase"]' + NE + ',' + H + '.uppercase' + NE + '{text-transform:none!important}',
      H + '[style*="letter-spacing"]' + NE + ',' + H + '[class*="tracking-"]' + NE + '{letter-spacing:normal!important}',
      H + '[style*="font-weight:900"]' + NE + ',' + H + '[style*="font-weight: 900"]' + NE + ',' +
      H + '[style*="font-weight:800"]' + NE + ',' + H + '[style*="font-weight: 800"]' + NE + ',' +
      H + '.font-black' + NE + ',' + H + '.font-extrabold' + NE + '{font-weight:700!important}',
      H + 'button.rounded-full,' + H + 'a.rounded-full,' + H + 'input.rounded-full,' + H + 'select.rounded-full,' +
      H + 'button[style*="border-radius:99"],' + H + 'button[style*="border-radius: 99"],' +
      H + 'a[style*="border-radius:99"],' + H + 'a[style*="border-radius: 99"],' +
      H + 'input[style*="border-radius:99"],' + H + 'select[style*="border-radius:99"]{border-radius:8px!important}',
      H + '.rounded-3xl,' + H + '[class*="rounded-[2"],' + H + '[class*="rounded-[3"],' + H + '[class*="rounded-[1.5"]{border-radius:14px!important}'
    ].join('');
  }

  function theme() {
    if (THEME_OFF) { document.documentElement.classList.add('egbc-no-theme'); return; }
    var st = document.createElement('style');
    st.id = 'egbc-theme-css';
    st.textContent = themeCss();
    document.head.appendChild(st);
    themeSheets();
    /* Tailwind's CDN writes its stylesheet after load and again as classes
       appear; pages add <style> blocks too. Theme each new sheet once. */
    var pend = false;
    new MutationObserver(function () {
      if (pend) return; pend = true;
      setTimeout(function () { pend = false; themeSheets(); }, 30);
    }).observe(document.head, { childList: true, subtree: true, characterData: true });
    window.addEventListener('load', themeSheets);
  }

  function start() {
    css();
    font();
    theme();

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
