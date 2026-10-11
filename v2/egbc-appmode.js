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

    var top = document.createElement('div');
    top.id = 'egbc-am-top';
    top.innerHTML = '<a class="am-back" href="' + backHref() + '" aria-label="Back to the app">'
      + ic('arrow-left') + '</a>'
      + '<div class="am-title">' + title.replace(/[&<>"]/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        }) + '</div>';
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
      if (t) document.documentElement.style.setProperty('--am-top', t.offsetHeight + 'px');
      if (b) document.documentElement.style.setProperty('--am-bottom', b.offsetHeight + 'px');
      else document.documentElement.style.setProperty('--am-bottom', '0px');
    };
    fit();
    global.addEventListener('resize', fit);
    setTimeout(fit, 300);

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
    leave: function () { ssDel(KEY); ssDel(BACK); ssDel(TABS); }
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
