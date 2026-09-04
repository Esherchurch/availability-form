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
      ':root{--egbc-canvas:#eef4f3;--egbc-ink:#14201f;--egbc-body:#3a4d4c;--egbc-muted:#6b8281;',
      '--egbc-faint:#93a8a6;--egbc-line:#dde7e6;--egbc-brand:#3d6263;--egbc-brand-dark:#2e4c4d;',
      '--egbc-tint:#e7f0ef;--egbc-page:' + (WIDTHS[width] || WIDTHS.page) + '}',

      '#egbc-bar{position:sticky;top:0;z-index:9000;display:flex;align-items:center;justify-content:space-between;',
      'gap:12px;padding:9px 18px;background:rgba(255,255,255,.94);backdrop-filter:blur(10px);',
      'border-bottom:1px solid var(--egbc-line);font-family:Montserrat,system-ui,sans-serif}',

      '#egbc-bar .eb-l{display:flex;align-items:center;gap:11px;min-width:0}',
      '#egbc-bar img{width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--egbc-line);flex-shrink:0}',
      '#egbc-bar .eb-k{font-size:8.5px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;',
      'color:var(--egbc-faint);line-height:1.4;white-space:nowrap}',
      '#egbc-bar .eb-n{font-size:14px;font-weight:900;color:var(--egbc-ink);line-height:1.2;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',

      '#egbc-bar .eb-r{display:flex;align-items:center;gap:8px;flex-shrink:0}',
      '#egbc-bar a.eb-b,#egbc-bar button.eb-b{font-family:inherit;font-size:10px;font-weight:900;',
      'letter-spacing:.1em;text-transform:uppercase;padding:9px 16px;border-radius:99px;',
      'border:1px solid var(--egbc-line);background:#fff;color:var(--egbc-brand);cursor:pointer;',
      'text-decoration:none;transition:.15s;white-space:nowrap}',
      '#egbc-bar a.eb-b:hover,#egbc-bar button.eb-b:hover{background:var(--egbc-brand);color:#fff;border-color:var(--egbc-brand)}',
      '#egbc-bar a.eb-home{background:var(--egbc-brand);color:#fff;border-color:var(--egbc-brand)}',
      '#egbc-bar a.eb-home:hover{background:#000;border-color:#000}',
      '#egbc-bar .eb-av{width:28px;height:28px;border-radius:50%;background:var(--egbc-brand);color:#fff;',
      'display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;flex-shrink:0}',
      '#egbc-bar .eb-who{font-size:11px;font-weight:700;color:var(--egbc-body);white-space:nowrap}',

      /* Even out the page width without touching the page's own layout. */
      'body>.egbc-w,body>main,body>.container,body>.wrap{max-width:var(--egbc-page);margin-left:auto;margin-right:auto}',

      /* ---- the menu ---- */
      '#egbc-nav-scrim{position:fixed;inset:0;background:rgba(20,32,31,.42);z-index:9500;',
      'opacity:0;pointer-events:none;transition:opacity .18s}',
      '#egbc-nav-scrim.on{opacity:1;pointer-events:auto}',

      '#egbc-nav{position:fixed;top:0;right:0;bottom:0;width:min(360px,88vw);z-index:9600;background:#fff;',
      'border-left:1px solid var(--egbc-line);box-shadow:-18px 0 48px rgba(20,32,31,.16);',
      'transform:translateX(100%);transition:transform .22s ease;display:flex;flex-direction:column;',
      'font-family:Montserrat,system-ui,sans-serif}',
      '#egbc-nav.on{transform:none}',

      '#egbc-nav .en-top{display:flex;align-items:center;justify-content:space-between;',
      'padding:16px 18px 10px;border-bottom:1px solid var(--egbc-line)}',
      '#egbc-nav .en-h{font-size:14px;font-weight:900;color:var(--egbc-ink)}',
      '#egbc-nav .en-q{margin:12px 16px;padding:11px 16px;border:1px solid var(--egbc-line);border-radius:99px;',
      'font-family:inherit;font-size:13px;font-weight:600;outline:none;background:#f6faf9;color:var(--egbc-ink)}',
      '#egbc-nav .en-q:focus{border-color:var(--egbc-brand)}',
      '#egbc-nav .en-list{flex:1;overflow-y:auto;padding:0 12px 20px}',
      '#egbc-nav .en-i{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;',
      'text-decoration:none;color:var(--egbc-ink);margin-bottom:5px;border:1px solid transparent;transition:.12s}',
      '#egbc-nav .en-i:hover{background:var(--egbc-tint);border-color:var(--egbc-line)}',
      '#egbc-nav .en-i.on{background:var(--egbc-tint);border-color:var(--egbc-brand)}',
      '#egbc-nav .en-ic{width:30px;height:30px;border-radius:9px;background:#f0f6f6;display:flex;',
      'align-items:center;justify-content:center;font-size:15px;flex-shrink:0}',
      '#egbc-nav .en-t{font-size:13.5px;font-weight:800;line-height:1.3}',
      '#egbc-nav .en-t em{font-style:normal;font-size:9px;font-weight:900;letter-spacing:.09em;',
      'text-transform:uppercase;color:var(--egbc-muted);display:block;margin-top:2px}',
      '#egbc-nav .en-e{padding:26px 16px;font-size:13px;color:var(--egbc-muted);font-weight:600;text-align:center}',

      '@media(max-width:700px){',
      '#egbc-bar{padding:8px 12px}',
      '#egbc-bar .eb-k,#egbc-bar .eb-who{display:none}',
      '#egbc-bar a.eb-b,#egbc-bar button.eb-b{padding:8px 12px}',
      '}'
    ].join('');
    document.head.appendChild(el);
  }

  function font() {
    if (document.querySelector('link[href*="Montserrat"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap';
    document.head.appendChild(l);
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
    if (profile) right += '<button class="eb-b eb-nav" id="egbc-nav-btn">&#9776;&nbsp; Where to?</button>';
    right += '<a class="eb-b eb-home" href="hub.html">&larr;&nbsp; Hub</a>';
    if (profile) {
      right += '<div class="eb-av">' + initials(profile.name || profile.email) + '</div>' +
               '<span class="eb-who">' + (profile.name || profile.email) + '</span>' +
               '<button class="eb-b" style="border:none;background:none;color:var(--egbc-muted);padding:8px 4px" ' +
               'onclick="EGBCAuth.signOut()">Sign out</button>';
    }

    d.innerHTML =
      '<div class="eb-l">' +
        '<img src="' + LOGO + '" alt="EGBC">' +
        '<div style="min-width:0">' +
          '<div class="eb-k">Esher Green Baptist Church</div>' +
          '<div class="eb-n">' + pageTitle.replace(/</g, '&lt;') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="eb-r">' + right + '</div>';

    document.body.insertBefore(d, document.body.firstChild);
    pushDownStickyHeaders(d);

    var nb = document.getElementById('egbc-nav-btn');
    if (nb) nb.addEventListener('click', openNav);
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
        '<div class="en-h">Where to?</div>' +
        '<button class="eb-b" id="egbc-nav-x" style="border:none;background:none;font-size:17px;padding:4px 8px">&times;</button>' +
      '</div>' +
      '<input class="en-q" id="egbc-nav-q" placeholder="Search for a page&hellip;" autocomplete="off">' +
      '<div class="en-list" id="egbc-nav-list"></div>';

    document.body.appendChild(scrim);
    document.body.appendChild(p);
    document.getElementById('egbc-nav-x').addEventListener('click', closeNav);
    document.getElementById('egbc-nav-q').addEventListener('input', function (e) {
      renderNav(e.target.value.trim().toLowerCase());
    });
    return p;
  }

  function maySee(p) {
    if (p.enabled === false || p.heading || !p.url) return false;
    if (p.adminOnly && !EGBCAuth.isAdminOf(p.team)) return false;
    if (p.everyone) return true;
    if (EGBCAuth.isMaster()) return true;
    var list = (p.teams && p.teams.length) ? p.teams : (p.team ? [p.team] : []);
    var mine = EGBCAuth.effectiveTeams();
    var admin = EGBCAuth.adminAreas();
    return list.some(function (t) { return mine.indexOf(t) !== -1 || admin.indexOf(t) !== -1; });
  }

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

    list.innerHTML = rows.map(function (p) {
      var on = decodeURIComponent(p.url).toLowerCase() === decodeURIComponent(here);
      return '<a class="en-i' + (on ? ' on' : '') + '" href="' + p.url + '">' +
               '<span class="en-ic">' + (p.icon || '\u{1F4C4}') + '</span>' +
               '<span class="en-t">' + String(p.title || '').replace(/</g, '&lt;') +
               (on ? ' <em>you are here</em>' : '') + '</span>' +
             '</a>';
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
    var h = bar.offsetHeight;
    if (!h) return;

    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el === bar || bar.contains(el)) continue;

      var cs = window.getComputedStyle(el);
      if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
      if (parseFloat(cs.top) !== 0) continue;

      el.style.top = h + 'px';
      /* A fixed full-height panel (a slide-over, a modal) would now hang off
         the bottom, so give back the height we took. */
      if (cs.position === 'fixed' && parseFloat(cs.bottom) === 0) {
        el.style.height = 'calc(100% - ' + h + 'px)';
      }
    }
  }

  function start() {
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
