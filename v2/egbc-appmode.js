/* ===================================================================
   EGBC — app mode: a website page, dressed as the app
   ===================================================================

   APP-DESIGN-BRIEF §7d A. Martin, 10 Oct 2026: "you gave me a mock up of
   an app that i liked, and what you gave me in that link is not an app,
   it is the mobile version of the website."

   The app opens about two dozen pages rather than rebuilding what they
   already do (§5). Every one of those taps used to land on the website:
   its top bar, its Menu, no tab bar, and no way back except the browser.
   That is the whole of why the app felt like the website.

   WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT:
     - it draws the app's slim header (back arrow and the page's name) and
       the app's tab bar, and tells egbc-shell.js and egbc-auth.js to draw
       neither the website bar, nor the Menu, nor the "view as" strip.
     - IT DOES NOT TOUCH THE PAGE. NEXT-BRIEF §15: the structure of the
       page itself does not change in app mode. Same markup, same
       controls, same main action. All this adds is chrome around it and
       the padding to clear it.

   HOW A PAGE ENDS UP IN APP MODE. The app's open: rows go to the page
   with ?app=1 on the end, and the first thing this does is remember that
   in sessionStorage - so a link INSIDE the page, which knows nothing
   about any of this, keeps you in the app rather than dropping you onto
   the website halfway through a job. It dies with the tab, which is
   right: a bookmark opened tomorrow is the website again.

   WHERE BACK GOES. Not history. The app writes where it was -
   app.html#space/tab - before it sends you here, so back returns to the
   tab you left rather than to whatever the browser happens to remember.
   The tab bar is written the same way: the app knows which tabs that
   person has, and this does not, so it is handed the list rather than
   working it out again from a second copy of the rules.

   LOAD IT IN THE HEAD, before egbc-shell.js, so there is no flash of the
   website's bar before this takes over:

     <script src="egbc-appmode.js"></script>

   =================================================================== */

(function (global) {
  'use strict';

  var KEY = 'egbc_app_mode';
  var BACK = 'egbc_app_back';
  var TABS = 'egbc_app_tabs';

  function ss(name) { try { return sessionStorage.getItem(name); } catch (e) { return null; } }
  function ssSet(name, v) { try { sessionStorage.setItem(name, v); } catch (e) {} }
  function ssDel(name) { try { sessionStorage.removeItem(name); } catch (e) {} }

  /* ?app=1 turns it on and is remembered; ?app=0 turns it off, which is
     how "Open the full website" leaves without the flag following it. */
  var q = String(location.search || '');
  if (/[?&]app=1\b/.test(q)) ssSet(KEY, '1');
  else if (/[?&]app=0\b/.test(q)) ssDel(KEY);

  function on() { return ss(KEY) === '1'; }

  /* Set on <html> at once, before anything draws, so CSS and the other
     scripts can see it without waiting for start(). */
  if (on() && document.documentElement) {
    document.documentElement.setAttribute('data-egbc-app-mode', '1');
  }

  var CSS = [
    /* The app's own tokens, so this chrome matches app.html rather than
       approximating it. Scoped to the bars, because the page keeps its
       own colours (§15: the page does not change). */
    '#egbc-am-top,#egbc-am-tabs{--am-surface:#fff;--am-ink:#111827;--am-body:#374151;',
    '--am-muted:#6b7280;--am-line:#e3e8e6;--am-brand:#3d6263;',
    "font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;",
    '-webkit-font-smoothing:antialiased}',
    '@media (prefers-color-scheme: dark){#egbc-am-top,#egbc-am-tabs{',
    '--am-surface:#182120;--am-ink:#eef3f2;--am-body:#cdd8d6;--am-muted:#93a5a2;',
    '--am-line:#2a3634;--am-brand:#7fb3b1}}',

    '#egbc-am-top{position:fixed;top:0;left:0;right:0;z-index:9500;background:var(--am-surface);',
    'border-bottom:1px solid var(--am-line);display:flex;align-items:center;gap:10px;',
    'padding:calc(8px + env(safe-area-inset-top, 0px)) 12px 8px}',
    '#egbc-am-top a.am-back{width:44px;height:44px;border-radius:10px;border:1px solid var(--am-line);',
    'background:var(--am-surface);color:var(--am-body);display:grid;place-items:center;',
    'flex:none;text-decoration:none}',
    '#egbc-am-top .am-title{font-weight:600;color:var(--am-ink);font-size:16px;flex:1;min-width:0;',
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    /* The same size and shape as the back arrow, on the other side, so
       the two read as a pair and both clear 44px (§7). */
    '#egbc-am-top a.am-worry{min-width:44px;height:44px;border-radius:10px;padding:0 10px;gap:5px;',
    'border:1px solid var(--am-line);background:var(--am-surface);color:var(--am-brand);',
    'display:inline-flex;align-items:center;justify-content:center;flex:none;text-decoration:none;',
    'font-size:13px;font-weight:600;white-space:nowrap}',
    /* Icon-only ONLY when the page's name would not otherwise fit (fit()). */
    '#egbc-am-top.am-tight a.am-worry .am-wl{display:none}#egbc-am-top.am-tight a.am-worry{padding:0}',

    '#egbc-am-tabs{position:fixed;left:0;right:0;bottom:0;z-index:9500;background:var(--am-surface);',
    'border-top:1px solid var(--am-line);display:flex;',
    'padding:6px 4px calc(6px + env(safe-area-inset-bottom, 0px))}',
    '#egbc-am-tabs a{flex:1;min-width:0;display:grid;justify-items:center;gap:3px;padding:6px 2px;',
    'min-height:48px;text-decoration:none;color:var(--am-muted);font-size:11px;font-weight:500}',
    '#egbc-am-tabs a .am-l{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#egbc-am-tabs a.am-now{color:var(--am-brand)}',
    '#egbc-am-tabs svg,#egbc-am-tabs i{width:20px;height:20px}',

    /* The website's chrome, should any of it be drawn before this runs. */
    '[data-egbc-app-mode] #egbc-bar,[data-egbc-app-mode] #egbc-nav,',
    '[data-egbc-app-mode] #egbc-viewas-bar{display:none !important}',

    /* Room for the two bars. The page itself is not restyled - this is
       padding on the body and nothing more. */
    '[data-egbc-app-mode] body{padding-top:var(--am-top,60px) !important;',
    'padding-bottom:var(--am-bottom,64px) !important}'
  ].join('');

  function ic(name) {
    return '<i data-lucide="' + String(name || 'circle').replace(/[^a-z0-9-]/g, '') + '"></i>';
  }

  /* One source of icons, egbc-ui.js, rather than a second copy of twenty
     Lucide paths in here that could drift from the app's. Most of the
     pages the app opens do not load it, so it is fetched when missing -
     the bar is already on screen by then, with its words. */
  function icons() {
    if (global.EGBCUI && EGBCUI.icons) { EGBCUI.icons(); return; }
    if (document.querySelector('script[data-am-ui]')) return;
    var here = document.currentScript && document.currentScript.src;
    var base = here ? here.replace(/[^/]*$/, '') : '';
    var s = document.createElement('script');
    s.src = base + 'egbc-ui.js';
    s.setAttribute('data-am-ui', '1');
    s.onload = function () { if (global.EGBCUI && EGBCUI.icons) EGBCUI.icons(); };
    document.head.appendChild(s);
  }

  function backHref() {
    var b = ss(BACK);
    /* Only ever back into the app, never to an address somebody could
       have put in sessionStorage from elsewhere on this origin. */
    return (b && /^app\.html(#[a-z0-9:_-]*)?$/i.test(b)) ? b : 'app.html';
  }

  function tabBar() {
    var raw = ss(TABS), cfg = null;
    try { cfg = raw ? JSON.parse(raw) : null; } catch (e) { cfg = null; }
    var tabs = (cfg && Array.isArray(cfg.tabs)) ? cfg.tabs : null;
    var space = (cfg && cfg.space) || 'me';
    /* NO TAB BAR RATHER THAN A WRONG ONE. If the app has not said which
       tabs this person has - somebody who opened the page from a link,
       say - guessing would offer tabs they may not have, and the shell
       refuses a space you are not in, so the guess would end in a dead
       tap. */
    if (!tabs || !tabs.length) return '';
    var html = '<nav id="egbc-am-tabs">';
    tabs.forEach(function (t) {
      var key = String(t[0] || '').replace(/[^a-z0-9_-]/g, '');
      var label = String(t[1] || '');
      html += '<a href="app.html#' + space + ':' + key + '"'
        + (cfg.tab === key ? ' class="am-now"' : '') + '>'
        + ic(t[2]) + '<span class="am-l">'
        + label.replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
          })
        + '</span></a>';
    });
    return html + '</nav>';
  }

  var topH = 0, bottomH = 0;

  /* ---- A PAGE'S OWN FIXED CHROME HAS TO MOVE TOO -------------------
     Martin, 11 Oct 2026, walking stickynotes in app mode: "Add Note,
     Report, Archive and Admin sit at top 5-56px UNDER the app header;
     Switch board is at top -39px, off screen."

     Padding on the body moves the page's flow. It does nothing at all
     to an element the page has fixed to the viewport - stickynotes has
     four of them stacked at top 0, 64, 106 and 152 - so the app's
     header simply landed on top of them, and the first bar was pushed
     off the screen entirely.

     So every fixed element the PAGE owns is moved down by the header,
     and up by the tab bar, by however much each of them is anchored.
     The original value is kept on the element, so this is idempotent
     and a second pass after a redraw does not stack offsets.

     WHAT IS LEFT ALONE, and why:
       - our own header and tab bar
       - anything covering the whole viewport. That is a modal backdrop,
         and a modal is meant to cover everything, the app's chrome
         included. Shifting it would leave a 60px strip of page showing
         through the top of it.
       - anything anchored to neither top nor bottom (top and bottom
         both auto): the page is centring it, and centring still works. */
  var SHIFT = 'data-am-shift';

  /* Which box actually scrolls this element - the page, or a scrolling
     ancestor of its own. */
  function scrollerOf(el) {
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (/(auto|scroll|overlay)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return document.scrollingElement;
  }

  function shiftFixed() {
    if (!on() || !document.body) return;
    var top = document.getElementById('egbc-am-top');
    var tabs = document.getElementById('egbc-am-tabs');
    var all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el === top || el === tabs) continue;
      if ((top && top.contains(el)) || (tabs && tabs.contains(el))) continue;
      /* A page that has counted --am-top into its own layout says so,
         and is left alone - shifting it again would double it.
         stickynotes does this, because its four bars stack off each
         other's measured heights and one blind offset cannot know that. */
      if (el.hasAttribute('data-am-own')) continue;
      var cs = getComputedStyle(el);
      /* STICKY COUNTS TOO. The address book's Save row is
         position:sticky;bottom:0, so it sat behind the tab bar - the
         one control on that screen somebody actually came for.
         Sticky inside a scrolling box of its own sticks to that box,
         not the viewport, so only the ones the PAGE scrolls are moved:
         anything with a scrolling ancestor is already clear of our
         chrome, because its box is. */
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (cs.position === 'sticky' && scrollerOf(el) !== document.scrollingElement) continue;
      var r = el.getBoundingClientRect();
      if (r.width >= innerWidth - 2 && r.height >= innerHeight - 2) continue;

      var done = el.getAttribute(SHIFT);
      var was = done ? JSON.parse(done) : { top: cs.top, bottom: cs.bottom };
      if (!done) el.setAttribute(SHIFT, JSON.stringify(was));

      if (was.top && was.top !== 'auto') {
        var t = parseFloat(was.top);
        if (!isNaN(t)) el.style.top = (t + topH) + 'px';
      }
      if (was.bottom && was.bottom !== 'auto') {
        var b = parseFloat(was.bottom);
        if (!isNaN(b)) el.style.bottom = (b + bottomH) + 'px';
      }
    }
  }

  var started = false;
  function start(opts) {
    if (!on() || started) return false;
    if (!document.body) return false;
    started = true;
    opts = opts || {};

    if (!document.getElementById('egbc-am-css')) {
      var st = document.createElement('style');
      st.id = 'egbc-am-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    var title = String(opts.title || document.title || 'EGBC')
      .replace(/\s*[|–-]\s*EGBC.*$/i, '').trim() || 'EGBC';

    /* "I'M WORRIED ABOUT SOMEONE" BELONGS HERE TOO (NEXT-BRIEF §24,
       Martin 12 Oct 2026). It is in the app's own top bar on every
       space, for the reason §24 gives: somebody who notices a neighbour
       has stopped coming should not have to find the right tab first.
       In app mode the header had only back and the title, so on all 23
       pages the app opens - the charters, the rota, the pin board,
       resources - it vanished. §24 says every version of the app.
       Icon-only, because the header also has to hold the page's name on
       a 360px phone, with the aria-label carrying the words. Not on
       worried.html itself: a button that reloads the page you are on is
       a dead end with a label. */
    /* CARE & SUPPORT (Martin, 14 Oct 2026) replaces "Worried?": the same
       short choice as everywhere else (care.html), in words - "Care" -
       unless the page's name needs the room. Not on the pages the choice
       leads to. Switched off only with the church's whole care part. */
    var here = String(location.pathname || '').split('/').pop().toLowerCase();
    var careOff = global.EGBCChurch && EGBCChurch.uses && !EGBCChurch.uses('care');
    var worry = (careOff || here === 'care.html' || here === 'worried.html') ? ''
      : '<a class="am-worry" href="care.html?app=1"'
        + ' aria-label="Care and support" title="Care and support">'
        + ic('hand-heart') + '<span class="am-wl">Care</span></a>';

    var top = document.createElement('div');
    top.id = 'egbc-am-top';
    top.innerHTML = '<a class="am-back" href="' + backHref() + '" aria-label="Back to the app">'
      + ic('arrow-left') + '</a>'
      + '<div class="am-title">' + title.replace(/[&<>"]/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        }) + '</div>'
      + worry;
    document.body.insertBefore(top, document.body.firstChild);

    var bar = tabBar();
    if (bar) document.body.insertAdjacentHTML('beforeend', bar);

    /* MEASURED, NOT ASSUMED. The header is taller on a phone with a
       notch, and a title that wraps would hide the top of the page -
       which is where a page's own heading and its main button usually
       are. */
    var fit = function () {
      var t = document.getElementById('egbc-am-top');
      var b = document.getElementById('egbc-am-tabs');
      /* "Care" in words unless the page's name would be cut short by it:
         measured with the words in, and only then without. */
      if (t) {
        t.classList.remove('am-tight');
        var tt = t.querySelector('.am-title');
        if (tt && t.querySelector('.am-worry') && tt.scrollWidth > tt.clientWidth + 1) t.classList.add('am-tight');
      }
      topH = t ? t.offsetHeight : 0;
      bottomH = b ? b.offsetHeight : 0;
      document.documentElement.style.setProperty('--am-top', topH + 'px');
      document.documentElement.style.setProperty('--am-bottom', bottomH + 'px');
      /* --egbc-bar IS THE PAGE'S OWN HOOK for "how much chrome is in the
         way", and egbc-shell.js sets it to the website bar's height. The
         address book sizes its entry card with it -
         height:calc(100vh - 6rem - var(--egbc-bar)) - so that the Save
         button stays on screen. In app mode nothing was setting it, the
         card was sized for no chrome at all, and Save sat behind the tab
         bar. Using the page's own hook rather than fighting it is both
         smaller and more likely to be right on the next page that has
         one. */
      document.documentElement.style.setProperty('--egbc-bar', (topH + bottomH) + 'px');
      shiftFixed();
    };
    fit();
    global.addEventListener('resize', fit);
    setTimeout(fit, 300);
    setTimeout(fit, 1500);
    /* A page can put its chrome up later - stickynotes draws its board
       bar once it knows which board you are on. Debounced, because this
       watches every page and some of them redraw constantly. */
    try {
      var pending = null;
      new MutationObserver(function () {
        clearTimeout(pending);
        pending = setTimeout(shiftFixed, 120);
      }).observe(document.body, { childList: true, subtree: true });
    } catch (e) {}

    icons();
    return true;
  }

  global.EGBCAppMode = {
    on: on,
    start: start,
    /* The app calls these before it sends somebody to a page. */
    remember: function (back, tabs) {
      if (back) ssSet(BACK, back);
      if (tabs) ssSet(TABS, JSON.stringify(tabs));
      ssSet(KEY, '1');
    },
    leave: function () { ssDel(KEY); ssDel(BACK); ssDel(TABS); },
    /* A page that moves its own chrome about can ask for another pass. */
    refit: function () { shiftFixed(); }
  };

  /* A page that loads this and nothing else - the availability form - is
     dressed by this on its own. Pages with egbc-shell.js are dressed by
     the shell calling start() instead, so the title it was given is used
     rather than the <title>. */
  function auto() {
    if (!on()) return;
    if (document.querySelector('script[src*="egbc-shell.js"]')) return;
    start({});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', auto);
  } else {
    auto();
  }
})(window);
