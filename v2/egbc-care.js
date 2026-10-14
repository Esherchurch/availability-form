/* ===================================================================
   EGBC — Care & support: the one short choice, everywhere
   ===================================================================

   NEXT-BRIEF §24, Martin 14 Oct 2026: the "Worried?" button becomes
   "Care & support". Easy to see on every page, in words; never hideable.
   It opens a short choice, and "If someone is in immediate danger, call
   999" is always first:
     1. I'd like some pastoral care     - for yourself, to the pastoral team
     2. I'm worried about someone       - worried.html, as it was
     3. Ask for prayer                  - the events window's prayer
                                          requests, once that page exists

   ONE LIST, THREE PLACES. The website's top bar and the hub open it as a
   small dialog (open()); the app draws the same choices as its own sheet
   (choices()); care.html is the same thing as a page, for the Menu and
   for anybody without the script. So the words cannot drift apart.

   NEVER HIDEABLE. Not by "Choose what's on my Home" (item 16), and not by
   "What does your church use?" (item 14) unless the church switches off
   the whole care and safeguarding part - feature 'care'.
   =================================================================== */

(function (global) {
  'use strict';

  /* The events window's prayer requests (FINDINGS-events F-166). The
     choice appears by itself the day this page is published: until then
     a link to it would be a link to nothing. */
  var PRAYER_URL = 'prayer.html';
  var prayer = null;          /* null: not asked yet; true/false: the answer */
  var asking = null;

  function on() {
    return !(global.EGBCChurch && EGBCChurch.uses && !EGBCChurch.uses('care'));
  }

  function prayerReady() {
    if (prayer !== null) return Promise.resolve(prayer);
    if (!asking) {
      asking = (global.fetch ? fetch(PRAYER_URL, { method: 'HEAD', cache: 'no-store' })
        .then(function (r) { return r.ok; }, function () { return false; }) : Promise.resolve(false))
        .then(function (ok) { prayer = !!ok; return prayer; });
    }
    return asking;
  }

  var DANGER = 'If someone is in immediate danger, call 999.';

  /* The choices, in Martin's order. url is the page; a host adds what it
     needs (the app adds app=1 through its own open:). */
  function choices() {
    var list = [
      { key: 'care', icon: 'hand-heart', url: 'worried.html?for=me',
        title: 'I’d like some pastoral care',
        sub: 'For you. It goes to the pastoral team, and stays private.' },
      { key: 'worried', icon: 'heart-handshake', url: 'worried.html',
        title: 'I’m worried about someone',
        sub: 'Tell the pastoral team, or the safeguarding lead.' }
    ];
    if (prayer === true) {
      list.push({ key: 'prayer', icon: 'church', url: PRAYER_URL,
        title: 'Ask for prayer', sub: 'A prayer request, for you or for someone else.' });
    }
    return list;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ic(name, size) {
    return '<i data-lucide="' + name + '" style="width:' + (size || 18) + 'px;height:' + (size || 18) + 'px" aria-hidden="true"></i>';
  }
  function icons() {
    if (global.EGBCUI && EGBCUI.icons) EGBCUI.icons();
    else if (global.lucide && lucide.createIcons) lucide.createIcons();
  }

  var CSS = [
    '.egbc-care-danger{display:flex;gap:10px;align-items:flex-start;background:#fdecea;border:1px solid #f5c2bd;',
    'color:#8a1c12;border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.4}',
    '.egbc-care-danger b{font-weight:600}',
    '.egbc-care-list{display:grid;gap:8px;margin-top:12px}',
    '.egbc-care-opt{display:flex;gap:12px;align-items:flex-start;min-height:56px;padding:10px 14px;border:1px solid #e5e7eb;',
    'border-radius:12px;background:#fff;color:#111827;text-decoration:none}',
    '.egbc-care-opt:hover{background:#f3f4f6}',
    '.egbc-care-opt:focus-visible{outline:2px solid var(--egbc-brand,#3d6263);outline-offset:2px}',
    '.egbc-care-opt .ci{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;flex:none;',
    'background:var(--egbc-tint,#e8f0f0);color:var(--egbc-brand,#3d6263)}',
    '.egbc-care-opt b{display:block;font-weight:600;font-size:15px}',
    '.egbc-care-opt small{display:block;color:#6b7280;font-size:13px;margin-top:2px}',
    '#egbc-care-back{position:fixed;inset:0;z-index:10000;background:rgba(17,24,39,.45);display:flex;',
    'align-items:flex-start;justify-content:center;padding:72px 16px 16px;overflow-y:auto}',
    '#egbc-care-dlg{background:#fff;border-radius:16px;max-width:440px;width:100%;padding:18px;',
    'box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:var(--egbc-font,Inter,system-ui,sans-serif)}',
    '#egbc-care-dlg h2{margin:0 0 12px;font-size:18px;font-weight:700;color:#111827;display:flex;align-items:center;gap:8px}',
    '#egbc-care-dlg .egbc-care-x{margin-left:auto;width:44px;height:44px;border-radius:10px;border:1px solid #e5e7eb;',
    'background:#fff;display:grid;place-items:center;cursor:pointer;color:#374151}'
  ].join('');
  function css() {
    if (document.getElementById('egbc-care-css')) return;
    var st = document.createElement('style');
    st.id = 'egbc-care-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* The body of the choice: the 999 line, then the options. Shared by the
     dialog and care.html. linkFor lets a host change the address. */
  function body(linkFor) {
    linkFor = linkFor || function (u) { return u; };
    return '<div class="egbc-care-danger" role="note">' + ic('phone', 18)
      + '<div><b>' + esc(DANGER) + '</b></div></div>'
      + '<div class="egbc-care-list">'
      + choices().map(function (c) {
          return '<a class="egbc-care-opt" data-care="' + esc(c.key) + '" href="' + esc(linkFor(c.url)) + '">'
            + '<span class="ci">' + ic(c.icon, 18) + '</span>'
            + '<span><b>' + esc(c.title) + '</b><small>' + esc(c.sub) + '</small></span></a>';
        }).join('')
      + '</div>';
  }

  /* Into a page (care.html). */
  function render(into, linkFor) {
    if (!into) return;
    css();
    into.innerHTML = body(linkFor);
    icons();
    prayerReady().then(function (yes) { if (yes && !into.querySelector('[data-care="prayer"]')) { into.innerHTML = body(linkFor); icons(); } });
  }

  /* THE DIALOG. A real modal: focus goes into it, Escape and the backdrop
     close it, and focus goes back to the button that opened it. */
  var opener = null;
  function close() {
    var b = document.getElementById('egbc-care-back');
    if (b) b.remove();
    document.removeEventListener('keydown', onKey, true);
    if (opener && opener.focus) { try { opener.focus(); opener.setAttribute('aria-expanded', 'false'); } catch (e) {} }
    opener = null;
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var d = document.getElementById('egbc-care-dlg');
    if (!d) return;
    var f = [].slice.call(d.querySelectorAll('a[href],button'));
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
  function open(from, linkFor) {
    if (document.getElementById('egbc-care-back')) { close(); return; }
    css();
    opener = from || null;
    if (opener) opener.setAttribute('aria-expanded', 'true');
    var back = document.createElement('div');
    back.id = 'egbc-care-back';
    back.innerHTML = '<div id="egbc-care-dlg" role="dialog" aria-modal="true" aria-labelledby="egbc-care-h">'
      + '<h2 id="egbc-care-h">' + ic('hand-heart', 20) + 'Care &amp; support'
      + '<button type="button" class="egbc-care-x" aria-label="Close">' + ic('x', 18) + '</button></h2>'
      + '<div id="egbc-care-body">' + body(linkFor) + '</div></div>';
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.querySelector('.egbc-care-x').addEventListener('click', close);
    document.body.appendChild(back);
    document.addEventListener('keydown', onKey, true);
    icons();
    var first = back.querySelector('.egbc-care-opt');
    if (first) first.focus();
    prayerReady().then(function (yes) {
      var b = document.getElementById('egbc-care-body');
      if (yes && b && !b.querySelector('[data-care="prayer"]')) {
        /* Drawn again with prayer in it: focus goes back where it was, not
           to the page behind the dialog. */
        var was = document.activeElement && b.contains(document.activeElement) ? document.activeElement.getAttribute('data-care') : null;
        b.innerHTML = body(linkFor); icons();
        var again = was && b.querySelector('[data-care="' + was + '"]');
        if (again) again.focus();
      }
    });
  }

  global.EGBCCare = { on: on, choices: choices, prayerReady: prayerReady, render: render, open: open, close: close,
    DANGER: DANGER, PRAYER_URL: PRAYER_URL };
})(window);
