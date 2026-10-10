/* ===================================================================
   EGBC Suite — Share to WhatsApp
   ===================================================================

   SHARE-NOTIFY-BRIEF Part 1. Martin posts to WhatsApp groups by copying
   text and a link by hand every week. This makes it one button: write once
   in the hub, press Share, WhatsApp opens with the message ready, pick the
   group, send. It uses the person's own WhatsApp - no business account, no
   approval, no cost.

     <script src="egbc-share.js"></script>

     EGBCShare.button({ title, html, link, image })   -> markup for a button
     EGBCShare.open({ title, html, link, image })     -> the preview sheet
     EGBCShare.format({ title, html, link })          -> the WhatsApp text

   ONE HELPER, NOT TWO. The brief says so in those words, because the
   notice card, the pinned notice, the read view, meetings and the events
   window all want this button and four copies of a formatter is four
   places for the bold to come out wrong.

   WHAT IT DOES NOT DO: it never sends anything. It opens the person's own
   WhatsApp with the words ready, and they choose the group and press send.
   Nothing leaves this machine until they do.
   =================================================================== */

(function (global) {
  'use strict';
  if (global.EGBCShare) return;

  var doc = global.document;

  /* How much of a long notice to send before pointing at the page. Long
     enough for a whole short notice; short enough that a WhatsApp group
     does not get three screens of scroll. */
  var MAX = 900;

  /* ---- HTML to WhatsApp ---------------------------------------------
     WhatsApp's markup is *bold*, _italic_, ~strike~ and ```mono```. Lists
     and quotes have no markup at all, so they become characters.

     DONE ON THE DOM, not with regular expressions. The notice editor's
     output is real HTML - nested lists, attributes, entities - and a
     regular expression that strips tags turns "&amp;" into "&amp;" and
     loses the structure the formatting depends on. */

  function textOf(node) {
    return (node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  /* Walk the children of an element, turning each into a line or lines. */
  function walk(node, out, depth) {
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];

      if (n.nodeType === 3) {                      /* a bare text node */
        var t = (n.nodeValue || '').replace(/\s+/g, ' ');
        if (t.trim()) out.push({ inline: t });
        continue;
      }
      if (n.nodeType !== 1) continue;

      var tag = n.tagName.toUpperCase();

      switch (tag) {
        case 'SCRIPT': case 'STYLE': case 'NOSCRIPT':
          break;

        /* A heading is bold on its own line. WhatsApp has no headings, and
           a bare line of text reads as a heading when it is bold and has a
           blank line after it. */
        case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
          out.push({ block: '*' + textOf(n) + '*' });
          break;

        case 'P': case 'DIV':
          var inner = [];
          walk(n, inner, depth);
          flushInline(inner, out);
          break;

        case 'BR':
          out.push({ block: '' });
          break;

        case 'UL': case 'OL':
          listOut(n, out, depth, tag === 'OL');
          break;

        case 'BLOCKQUOTE':
          var q = [];
          walk(n, q, depth);
          var qt = [];
          flushInline(q, qt);
          qt.forEach(function (line) {
            out.push({ block: '> ' + String(line.block === undefined ? '' : line.block) });
          });
          break;

        /* A LINK GOES ON ITS OWN LINE, which is what makes WhatsApp draw a
           preview card for it. "[words](url)" is markdown, and WhatsApp
           shows it exactly like that - as punctuation. */
        case 'A':
          var href = n.getAttribute('href') || '';
          var words = textOf(n);
          if (!href || /^(javascript|data):/i.test(href)) { out.push({ inline: words }); break; }
          if (words && words !== href) out.push({ inline: words + ' ' });
          out.push({ block: href });
          break;

        case 'B': case 'STRONG':
          out.push({ inline: wrapInline(n, '*') });
          break;
        case 'I': case 'EM':
          out.push({ inline: wrapInline(n, '_') });
          break;
        case 'S': case 'STRIKE': case 'DEL':
          out.push({ inline: wrapInline(n, '~') });
          break;
        case 'CODE': case 'PRE':
          out.push({ inline: wrapInline(n, '```') });
          break;

        case 'IMG':
          /* The picture is offered as a file, not as a URL in the words. */
          break;

        default:
          walk(n, out, depth);
      }
    }
  }

  /* *bold* with the spaces OUTSIDE the stars. WhatsApp will not render
     "* bold *", and an editor leaves spaces inside the tag all the time. */
  function wrapInline(n, mark) {
    var raw = (n.textContent || '').replace(/\s+/g, ' ');
    if (!raw.trim()) return raw;
    var lead = /^\s/.test(raw) ? ' ' : '';
    var tail = /\s$/.test(raw) ? ' ' : '';
    return lead + mark + raw.trim() + mark + tail;
  }

  function listOut(node, out, depth, numbered) {
    var items = node.children, n = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].tagName.toUpperCase() !== 'LI') continue;
      n++;
      var inner = [];
      walk(items[i], inner, depth + 1);
      var lines = [];
      flushInline(inner, lines);
      var first = lines.length ? String(lines[0].block || '') : '';
      var indent = new Array(depth + 1).join('  ');
      out.push({ block: indent + (numbered ? n + '. ' : '- ') + first });
      /* A nested list, or a second paragraph inside the item. */
      for (var j = 1; j < lines.length; j++) out.push(lines[j]);
    }
  }

  /* Gather runs of inline pieces into lines. */
  function flushInline(pieces, out) {
    var buf = '';
    for (var i = 0; i < pieces.length; i++) {
      if (pieces[i].inline !== undefined) { buf += pieces[i].inline; continue; }
      if (buf.trim()) { out.push({ block: buf.replace(/\s+/g, ' ').trim() }); buf = ''; }
      out.push(pieces[i]);
    }
    if (buf.trim()) out.push({ block: buf.replace(/\s+/g, ' ').trim() });
  }

  function htmlToWhatsApp(html) {
    if (!html) return '';
    /* A SEPARATE, INERT DOCUMENT - NOT createElement('div') (F-148).
       A div made with createElement belongs to THIS page's document, so
       `<img src=x onerror=…>` dropped into it RUNS, even though nothing is
       ever shown and the div is never attached. The events window proved
       it: their break 3 handed this helper uncleaned words and the bad
       picture fired.
       DOMParser builds a document of its own that loads nothing and runs
       nothing, which is what egbc-editor.js already does.

       THE HELPER CLEANS ITS OWN INPUT. The events window's pages clean
       before calling, and notices rely on the editor having cleaned at
       save time - but a shared helper that is only safe when every caller
       remembers is not safe, it is lucky. */
    var holder = new DOMParser().parseFromString(String(html), 'text/html').body;
    if (!holder) return '';
    var pieces = [];
    walk(holder, pieces, 0);
    var lines = [];
    flushInline(pieces, lines);
    var text = lines.map(function (l) { return l.block === undefined ? '' : l.block; }).join('\n');
    /* No more than one blank line anywhere, and none at either end. */
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ---- the whole message --------------------------------------------- */

  function format(item) {
    item = item || {};
    var out = [];
    if (item.title) out.push('*' + String(item.title).trim() + '*');
    if (item.when) out.push(String(item.when).trim());
    if (out.length) out.push('');

    var body = htmlToWhatsApp(item.html || '');
    var link = (item.link || '').trim();

    /* TRIMMED AT A LINE BREAK, not mid-word. A message cut in the middle of
       a sentence reads as a fault; one cut at a paragraph reads as a
       summary, which is what it is. */
    if (body.length > MAX) {
      var cut = body.lastIndexOf('\n', MAX);
      if (cut < MAX * 0.5) cut = body.lastIndexOf(' ', MAX);
      if (cut < 0) cut = MAX;
      body = body.slice(0, cut).trim() + '…';
      if (link) body += '\n\nRead more:';
    }
    if (body) out.push(body);
    if (link) out.push((body ? '' : '') + link);

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* ---- opening WhatsApp ----------------------------------------------
     Three ways, in order, because no one of them works everywhere:

       1. navigator.share - a phone, and any browser with the Web Share
          API. The person picks WhatsApp, then the group. A picture goes
          with it when the browser says it can.
       2. wa.me - a computer. Opens WhatsApp Desktop if it is installed,
          otherwise WhatsApp Web, with the message ready and a chat picker.
       3. Copy, which always works and needs nothing installed.

     NONE OF THESE IS CLAIMED TO WORK ON A REAL DEVICE YET. The brief asks
     for Android, iPhone, Windows with WhatsApp Desktop, and WhatsApp Web to
     be tried by hand, and that has not been done - FINDINGS-share.md says
     so plainly rather than this pretending otherwise. */

  function canShareFiles(files) {
    try { return !!(global.navigator && navigator.canShare && navigator.canShare({ files: files })); }
    catch (e) { return false; }
  }

  function viaWebShare(text, file) {
    if (!global.navigator || !navigator.share) return Promise.reject(new Error('no Web Share'));
    var payload = { text: text };
    if (file && canShareFiles([file])) payload.files = [file];
    return navigator.share(payload);
  }

  function viaWaMe(text) {
    var w = global.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
    if (!w) throw new Error('the browser blocked the new window');
    return w;
  }

  function copy(text) {
    if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    /* Older browsers, and any page served without https. */
    return new Promise(function (res, rej) {
      try {
        var ta = doc.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px';
        doc.body.appendChild(ta);
        ta.select();
        var okay = doc.execCommand && doc.execCommand('copy');
        doc.body.removeChild(ta);
        okay ? res() : rej(new Error('copy refused'));
      } catch (e) { rej(e); }
    });
  }

  /* ---- the preview ----------------------------------------------------
     THE PREVIEW IS NOT OPTIONAL. The brief asks for it, and the reason is
     that this sends to a WhatsApp group of real people: the last chance to
     see exactly what they will get, and to change it, belongs before the
     share sheet rather than after it.

     It is editable plain text, so a person can shorten it without going
     back to the editor. */

  var CSS = 'egbc-share-css';

  function styles() {
    if (doc.getElementById(CSS)) return;
    var st = doc.createElement('style');
    st.id = CSS;
    st.textContent = [
      '.egbc-share-back{position:fixed;inset:0;background:rgba(17,24,39,.45);z-index:9000;',
      '  display:flex;align-items:flex-end;justify-content:center}',
      '@media(min-width:620px){.egbc-share-back{align-items:center}}',
      '.egbc-share{background:#fff;width:100%;max-width:560px;border-radius:14px 14px 0 0;',
      '  padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));',
      '  font:400 14px Inter,system-ui,sans-serif;color:#374151;max-height:88vh;overflow:auto}',
      '@media(min-width:620px){.egbc-share{border-radius:14px}}',
      '.egbc-share h2{margin:0 0 4px;font-size:17px;font-weight:600;color:#111827}',
      '.egbc-share p.sub{margin:0 0 12px;font-size:13px;color:#6b7280}',
      '.egbc-share textarea{width:100%;min-height:180px;border:1px solid #d1d5db;border-radius:8px;',
      '  padding:10px 12px;font:400 14px/1.5 Inter,system-ui,sans-serif;color:#111827;resize:vertical}',
      '.egbc-share textarea:focus{outline:none;border-color:#3d6263;box-shadow:0 0 0 3px rgba(61,98,99,.15)}',
      '.egbc-share .pic{display:flex;align-items:center;gap:8px;margin:10px 0 0;font-size:13px}',
      '.egbc-share .row{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}',
      '.egbc-share button{min-height:44px;padding:0 14px;border-radius:8px;cursor:pointer;',
      '  font:500 13px Inter,system-ui,sans-serif;border:1px solid #d1d5db;background:#fff;color:#111827;',
      '  display:inline-flex;align-items:center;gap:6px}',
      '.egbc-share button.primary{background:#25D366;border-color:#25D366;color:#073b21}',
      '.egbc-share button.ghost{border:none;color:#6b7280}',
      '.egbc-share .said{margin:10px 0 0;font-size:13px;color:#15803d;min-height:18px}'
    ].join('');
    doc.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function open(item) {
    item = item || {};
    styles();
    var text = format(item);
    var file = item.file || null;

    var back = doc.createElement('div');
    back.className = 'egbc-share-back';
    back.innerHTML =
      '<div class="egbc-share" role="dialog" aria-modal="true" aria-label="Share on WhatsApp">'
      + '<h2>Share on WhatsApp</h2>'
      + '<p class="sub">This is exactly what will be sent. Change it here if you like, '
      + 'then pick the group in WhatsApp.</p>'
      + '<textarea aria-label="The message">' + esc(text) + '</textarea>'
      + (item.image
          ? '<label class="pic"><input type="checkbox" id="egbc-share-pic"'
            + (file ? ' checked' : '') + (file ? '' : ' disabled') + '> '
            + (file ? 'Include the picture' : 'The picture could not be loaded, so it is not included')
            + '</label>'
          : '')
      + '<div class="row">'
      + '<button class="primary" data-share="1">Share</button>'
      + '<button data-copy="1">Copy message</button>'
      + '<button class="ghost" data-close="1">Cancel</button>'
      + '</div><p class="said" role="status"></p></div>';

    var ta = back.querySelector('textarea');
    var said = back.querySelector('.said');
    var pic = back.querySelector('#egbc-share-pic');
    var shut = function () { if (back.parentNode) back.parentNode.removeChild(back); };

    back.addEventListener('click', function (e) {
      if (e.target === back || e.target.closest('[data-close]')) return shut();

      if (e.target.closest('[data-copy]')) {
        copy(ta.value).then(function () { said.textContent = 'Copied. Paste it into WhatsApp.'; },
          function () { said.textContent = 'Could not copy - select the words and copy them.'; });
        return;
      }

      if (e.target.closest('[data-share]')) {
        var withPic = pic && pic.checked ? file : null;
        viaWebShare(ta.value, withPic).then(shut, function () {
          /* No Web Share, or the person backed out of the sheet. wa.me is
             the computer's way in, and it is harmless if they changed
             their mind - it opens a chat picker, it does not send. */
          try { viaWaMe(ta.value); shut(); }
          catch (err) {
            said.textContent = 'Could not open WhatsApp. Use Copy message instead.';
          }
        });
      }
    });

    doc.body.appendChild(back);
    ta.focus();
    return back;
  }

  /* A button a page can drop in. The page owns the click, because the item
     it is sharing is the page's. */
  function button(label) {
    return '<button type="button" class="btn sm ghost" data-egbc-share="1">'
      + '<i data-lucide="share-2" style="width:15px;height:15px"></i>'
      + esc(label || 'Share on WhatsApp') + '</button>';
  }

  global.EGBCShare = {
    format: format,
    htmlToWhatsApp: htmlToWhatsApp,
    open: open,
    button: button,
    copy: copy,
    MAX: MAX
  };
})(window);
