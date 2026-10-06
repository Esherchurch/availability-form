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

  window.EGBCUI = { icon: icon, pageIcon: pageIcon, refresh: refresh };
  load();
})();
