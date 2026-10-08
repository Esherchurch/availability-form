/* ===================================================================
   "Powered by Church HQ" — one line, one copy of it
   ===================================================================

   The product is Church HQ (churchhq.co.uk). EGBC is its first church, and
   MEMBERS STILL SEE "EGBC HUB": the church's own name and logo are the brand
   on every screen, and every church after this one gets the same. Church HQ
   appears once, small and quiet, in three places and nowhere else:

     1. under the sign-in box on login.html
     2. at the bottom of the Menu - the shell's, so every page, and the hub's
     3. in the footer of the public hire pages (the events window's, using
        this same snippet)

   NEVER beside the church's own logo in a header, never on an email, never on
   a PDF, nowhere else. (NEXT-BRIEF §19.)

   ONE SNIPPET, so the three places cannot drift apart. The events window uses
   this file too rather than writing its own.

   THE LINK IS ONE SWITCH. churchhq.co.uk is not live yet, so there is nothing
   to send anybody to and the credit is plain text. Put the address in LINK
   below and every one of the three places becomes a link, in a new tab, with
   no other change anywhere.
   =================================================================== */

(function (global) {
  'use strict';

  /* THE SWITCH. Empty means plain text. Set it to 'https://churchhq.co.uk'
     when the site is live and all three places become links at once. */
  var LINK = '';

  /* Relative, because every page that uses this sits in the same folder as
     the brand kit. The mark is the doorway on its own - the light version,
     which is the one for a white background (brand/church-hq/README.md). */
  var MARK = 'brand/church-hq/svg/mark-light.svg';

  /* THE WORDS MUST SURVIVE THE PICTURE. If the mark cannot be fetched - an
     old cached copy of a page, a folder that did not get deployed - a broken
     image icon beside the words looks worse than no mark at all. So the image
     takes itself out of the line and the credit still reads. */
  function markHtml() {
    return '<img src="' + MARK + '" alt="" width="16" height="16" ' +
           'style="display:block;flex:none" ' +
           'onerror="this.style.display=\'none\'">';
  }

  /* The line itself. Centred, 12px, muted - the same everywhere it appears. */
  function html(opts) {
    opts = opts || {};
    var inner = markHtml() +
      '<span>Powered by Church HQ</span>';

    var body = LINK
      ? '<a href="' + LINK + '" target="_blank" rel="noopener"' +
        ' style="display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none">' +
        inner + '</a>'
      : '<span style="display:inline-flex;align-items:center;gap:6px">' + inner + '</span>';

    return '<div class="egbc-poweredby" style="display:flex;justify-content:center;' +
      'align-items:center;padding:' + (opts.padding || '14px 12px') + ';' +
      'font:400 12px Inter,system-ui,-apple-system,sans-serif;color:#6b7280;' +
      'line-height:1.4' + (opts.style || '') + '">' + body + '</div>';
  }

  /* Put it at the end of an element, once. Called more than once - the Menu
     is redrawn on every search keystroke - so it replaces rather than piles
     up. */
  function mount(el, opts) {
    if (!el) return;
    var had = el.querySelector(':scope > .egbc-poweredby');
    if (had) had.remove();
    el.insertAdjacentHTML('beforeend', html(opts));
  }

  global.EGBCPoweredBy = { html: html, mount: mount, link: function () { return LINK; } };

})(window);
