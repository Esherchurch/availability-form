/* ===================================================================
   EGBC Suite — shared look: font and icons
   ===================================================================

   Add to any v2 page (egbc-shell.js adds it for you):

     <script src="egbc-ui.js"></script>

   - Loads Inter, the suite's UI font.
   - Loads the Lucide line-icon set and draws any <i data-lucide="name">
     on the page, including ones added later by the page's own code.
   - EGBCUI.icon('video')        -> markup for an icon
   - EGBCUI.pageIcon(page)       -> the icon name for a hub page entry

   Why the page map: the page registry (hubPages) stores an emoji per page.
   Emoji render differently on every device and read as cartoonish, so each
   page is mapped to a line icon here by its address, with the stored emoji
   as a second guess. Nobody has to re-enter anything in Admin.
   =================================================================== */

(function () {
  'use strict';
  if (window.EGBCUI) return;

  var LUCIDE = 'https://unpkg.com/lucide@0.469.0/dist/umd/lucide.min.js';

  /* By page address (lower case). */
  var BY_URL = {
    'meeting.html': 'video',
    'view-only-rota.html': 'calendar-days',
    'planner.html': 'calendar-range',
    'trainingrotaplanner.html': 'calendar-range',
    'sundayserviceplanner.html': 'list-music',
    'training sunday planner.html': 'list-music',
    'youthserviceplanner.html': 'church',
    'emailbuilder2.html': 'mail',
    'addressbook.html': 'contact',
    'library.html': 'library',
    'sundayplannersonglibrary.html': 'library',
    'trainingmusicdatabase.html': 'library',
    'batchupload.html': 'upload',
    'music-uploader.html': 'upload',
    'trainingbatchimporter.html': 'upload',
    'song-summary.html': 'file-music',
    'egbc-playthrough.html': 'circle-play',
    'egbc-training-worship.html': 'graduation-cap',
    'trainingportalhub.html': 'graduation-cap',
    'egbc-howto-av.html': 'sliders-horizontal',
    'egbc-troubleshoot-av.html': 'wrench',
    'worshipteamcharter.html': 'book-open',
    'coreteamcharter.html': 'book-open',
    'youthcharter.html': 'book-open',
    'stickynotes.html': 'sticky-note',
    'index.html': 'clipboard-list',
    'resources.html': 'folder-open',
    'hubresources.html': 'download',
    'videos.html': 'clapperboard',
    'videoeditor.html': 'film',
    'photoeditor.html': 'image',
    'socialmaker.html': 'share-2',
    'sitemaker.html': 'globe',
    'studio.html': 'palette',
    'birthday.html': 'party-popper',
    'inventory-system-2.html': 'package',
    'schematic.html': 'cable',
    'monitorstagemap.html': 'map',
    'mix-builder.html': 'disc-3',
    'mix-player.html': 'disc-3',
    'mix-analyser.html': 'audio-waveform',
    'handover.html': 'file-check',
    'performancenotes.html': 'notebook-pen',
    'data-tools.html': 'database-backup',
    'whatson.html': 'calendar-days',
    'events-admin.html': 'calendar-plus',
    'signup.html': 'ticket',
    'my-signup.html': 'ticket',
    'places-admin.html': 'map-pin',
    'youth-access.html': 'key-round',
    'login.html': 'log-in'
  };

  /* By the emoji stored in the registry, for pages not named above. */
  var BY_EMOJI = {
    '\u{1F4C5}': 'calendar-days', '\u{1F5D3}': 'calendar', '\u{1F4C6}': 'calendar',
    '\u{1F4DC}': 'scroll-text', '\u{1F3AC}': 'clapperboard', '\u{1F4D8}': 'book-open', '\u{1F4D6}': 'book-open',
    '\u{1F3B5}': 'music', '\u{1F3B6}': 'music', '\u{1F3A4}': 'mic', '\u{1F3B9}': 'piano', '\u{1F3B8}': 'guitar',
    '\u{1F4E4}': 'upload', '\u{1F4E5}': 'download', '\u{1F6E0}': 'wrench', '\u{1F527}': 'wrench',
    '⛪': 'church', '\u{1F4CC}': 'pin', '\u{1F4CB}': 'clipboard-list', '\u{1F4C1}': 'folder', '\u{1F4C2}': 'folder-open',
    '\u{1F4BE}': 'hard-drive', '\u{1F4F9}': 'video', '\u{1F4C4}': 'file-text', '\u{1F4C3}': 'file-text',
    '\u{1F4E6}': 'package', '\u{1F4E7}': 'mail', '✉': 'mail', '\u{1F465}': 'users', '\u{1F464}': 'user',
    '\u{1F39B}': 'sliders-horizontal', '\u{1F5BC}': 'image', '\u{1F4F7}': 'camera', '\u{1F3A8}': 'palette',
    '\u{1F4CA}': 'chart-column', '\u{1F4C8}': 'chart-line', '\u{1F514}': 'bell', '\u{1F4E2}': 'megaphone',
    '\u{1F3E0}': 'house', '⚙': 'settings', '\u{1F511}': 'key-round', '\u{1F512}': 'lock',
    '\u{1F4DD}': 'notebook-pen', '\u{1F4A1}': 'lightbulb', '\u{1F310}': 'globe', '\u{1F517}': 'link',
    '\u{1F389}': 'party-popper', '\u{1F382}': 'cake', '\u{1F4FA}': 'tv', '\u{1F50A}': 'volume-2'
  };


  /* ---- the apps that can live on a phone's home screen ----------------
     One list, read by both menus: egbc-shell.js draws it on every page
     that uses the shared bar, and hub-app.js draws it in the hub's own
     Menu. The hub does not load the shell, so without one shared list the
     two would drift apart within a month.

     Worship Hub, Mix Builder and Calla Design are deliberately absent.
     They are out of scope for the one-app brief and listing them here
     would quietly bring them into it. */
  var APPS = [
    { url: 'hub.html', title: 'EGBC Hub', icon: 'house', description: 'Everything in one place' },
    { url: 'CoreTeamApp.html', title: 'Core Team', icon: 'users', description: 'Services, rota and email on a phone' },
    { url: 'Planner.html', title: 'Rota Planner', icon: 'calendar-range', description: 'Build and send the rota' },
    { url: 'SundayServicePlanner.html', title: 'Service Planner', icon: 'list-music', description: 'Plan the running order' },
    { url: 'youthapp2.html', title: 'Youth Hub', icon: 'zap', description: 'Youth, on a phone' },
    { url: 'youthserviceplanner.html', title: 'Youth Planner', icon: 'church', description: 'Plan a youth service' },
    { url: 'index.html', title: 'Availability', icon: 'calendar-check', description: 'Say which dates you can do' }
  ];

  function pageIcon(p) {
    if (!p) return 'file-text';
    var url = decodeURIComponent(String(p.url || '')).split('?')[0].split('/').pop().toLowerCase();
    if (BY_URL[url]) return BY_URL[url];
    var e = String(p.icon || '').replace(/️/g, '').trim();
    if (BY_EMOJI[e]) return BY_EMOJI[e];
    if (/^[a-z0-9-]+$/.test(e)) return e;   /* already an icon name */
    return 'file-text';
  }

  function icon(name, size, extra) {
    var s = size || 18;
    return '<i data-lucide="' + name + '" class="egbc-i' + (extra ? ' ' + extra : '') +
           '" style="width:' + s + 'px;height:' + s + 'px" aria-hidden="true"></i>';
  }

  /* ---- drawing ---------------------------------------------------- */

  var pending = false;
  function pascal(n) { return n.replace(/(^|-)([a-z0-9])/g, function (_, __, c) { return c.toUpperCase(); }); }

  function draw() {
    pending = false;
    if (!window.lucide || !document.querySelector('i[data-lucide]')) return;
    /* An unknown name would stay an empty <i>; fall back to a plain page icon. */
    var all = document.querySelectorAll('i[data-lucide]');
    for (var i = 0; i < all.length; i++) {
      var n = all[i].getAttribute('data-lucide');
      if (lucide.icons && !lucide.icons[pascal(n)]) all[i].setAttribute('data-lucide', 'file-text');
    }
    lucide.createIcons({ attrs: { 'stroke-width': 1.75 } });
  }

  function refresh() {
    if (pending) return;
    pending = true;
    setTimeout(draw, 16);   // not requestAnimationFrame: it is paused in hidden tabs
  }

  /* ---- one look on every page (v109, moved here from egbc-shell.js) --------------------------------

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

  /* data-theme="off" may sit on either tag - this file's own, or the
     egbc-shell.js tag that pulled it in. When the shell loads this script
     itself, document.currentScript is a tag it generated and carries no
     attributes, so the shell's tag has to be consulted as well. */
  var THEME_OFF = (function () {
    var mine = document.currentScript;
    if (mine && mine.getAttribute('data-theme') === 'off') return true;
    return !!document.querySelector('script[src*="egbc-shell.js"][data-theme="off"],' +
                                    'script[src*="egbc-ui.js"][data-theme="off"]');
  })();
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
    /* 600, not 700. DESIGN.md allows 700 on an h1 and nowhere else, so
       capping the old 800s and 900s at 700 left every one of them a fault -
       and this shim was producing most of what the style check found on the
       hub's admin panel. */
    if (s.fontWeight === '800' || s.fontWeight === '900') s.setProperty('font-weight', '600', s.getPropertyPriority('font-weight'));
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
      H + '.font-black' + NE + ',' + H + '.font-extrabold' + NE + '{font-weight:600!important}',
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

  function load() {
    if (!document.querySelector('link[href*="family=Inter"]')) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
      document.head.appendChild(l);
    }
    var st = document.createElement('style');
    st.textContent = 'svg.egbc-i,svg.lucide{flex-shrink:0;vertical-align:middle}';
    document.head.appendChild(st);

    /* Bring the page into line before anything is drawn, so there is no
       flash of the old look on pages that have no bar. */
    theme();

    if (!window.lucide) {
      var s = document.createElement('script');
      s.src = LUCIDE;
      s.onload = refresh;
      document.head.appendChild(s);
    }

    /* Pages build their markup with innerHTML at any time; draw whatever
       icons arrive. Child-list changes only - the news ticker moves every
       frame by style, and that must not trigger anything. */
    var start = function () {
      new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          if (list[i].addedNodes.length) { refresh(); return; }
        }
      }).observe(document.body, { childList: true, subtree: true });
      refresh();
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }

  window.EGBCUI = {
    APPS: APPS, icon: icon, pageIcon: pageIcon, refresh: refresh };
  load();
})();
