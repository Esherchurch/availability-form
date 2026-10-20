/* ===================================================================
   EGBC Suite — simple rich-text editor
   ===================================================================

   For anything people write that should look nice but must never need
   HTML: notices first. A toolbar of plain buttons over a writing area, and
   whatever is pasted in - an email, a web page, Word - is cleaned to the
   handful of things the editor offers, so a pasted email no longer brings
   its own tables, fonts and colours with it.

     const ed = EGBCEditor.mount(element, {
       html: '<p>Starting text</p>',
       placeholder: 'What do people need to know?',
       upload: async file => url,    // optional: enables the picture button
       palette: ['#008080', ...]     // optional (or the e-news's style rules): a colour button with only
                                     // these colours (the e-news: the
                                     // church's); coloured words are kept
                                     // only in these, everything else as now
     });
     ed.getHTML();  ed.setHTML(html);  ed.isEmpty();  ed.focus();

   Uses egbc-ui.js icons when present.
   =================================================================== */

(function () {
  'use strict';
  if (window.EGBCEditor) return;

  var KEEP = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, A: 1, UL: 1, OL: 1, LI: 1,
               H2: 1, H3: 1, BLOCKQUOTE: 1, IMG: 1 };
  var DROP = { SCRIPT: 1, STYLE: 1, META: 1, LINK: 1, TITLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1,
               FORM: 1, INPUT: 1, BUTTON: 1, SELECT: 1, TEXTAREA: 1, SVG: 1, HEAD: 1, NOSCRIPT: 1 };
  var BLOCKISH = { DIV: 1, TD: 1, TH: 1, TR: 1, SECTION: 1, ARTICLE: 1, HEADER: 1, FOOTER: 1,
                   H1: 1, H4: 1, H5: 1, H6: 1, CENTER: 1, PRE: 1, TABLE: 1, TBODY: 1, THEAD: 1 };

  /* "#abc", "#aabbcc" or "rgb(1, 2, 3)" -> "#aabbcc" ('' if none). */
  function hex(c) {
    c = String(c || '').trim().toLowerCase();
    var m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c);
    if (m) return '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    if (/^#[0-9a-f]{6}$/.test(c)) return c;
    m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(c);
    return m ? '#' + [m[1], m[2], m[3]].map(function (n) { return ('0' + Math.min(255, +n).toString(16)).slice(-2); }).join('') : '';
  }

  /* Reduce any HTML to the editor's own small vocabulary. With a palette,
     a coloured word (a span or font) keeps its colour if it is one of
     those, as <span style="color:#..">; any other colour is dropped. */
  function clean(html, palette) {
    /* palette: a list of colours, or the e-news's rules (egbc-mailblocks.js
       styleRules): { colours, highlights, fonts, sizes, lineHeights }. */
    var R = Array.isArray(palette) ? { colours: palette } : (palette || null);
    if (R) palette = R.colours || [];
    var doc = new DOMParser().parseFromString('<div id="r">' + (html || '') + '</div>', 'text/html');
    var root = doc.getElementById('r');

    (function walk(node) {
      var kids = Array.prototype.slice.call(node.childNodes);
      for (var i = 0; i < kids.length; i++) {
        var n = kids[i];
        if (n.nodeType === 8) { n.remove(); continue; }            // comments
        if (n.nodeType !== 1) continue;
        var tag = n.tagName;
        if (DROP[tag]) { n.remove(); continue; }
        walk(n);
        if (tag === 'H1') { var h = doc.createElement('h2'); h.append.apply(h, n.childNodes); n.replaceWith(h); continue; }
        if (tag === 'H4' || tag === 'H5' || tag === 'H6') { var h3 = doc.createElement('h3'); h3.append.apply(h3, n.childNodes); n.replaceWith(h3); continue; }
        if ((tag === 'SPAN' || tag === 'FONT') && R) {
          var st = n.style || {}, css = '';
          var hx = hex(st.color) || hex(n.getAttribute('color'));
          if (hx && (R.colours || []).indexOf(hx) >= 0) css += 'color:' + hx + ';';
          var bg = hex(st.backgroundColor);
          if (bg && (R.highlights || []).indexOf(bg) >= 0) css += 'background-color:' + bg + ';';
          var ff = String(st.fontFamily || n.getAttribute('face') || '').split(',')[0].replace(/["']/g, '').trim();
          var fk = (R.fonts || []).filter(function (f) { return f.toLowerCase() === ff.toLowerCase(); })[0];
          if (fk) css += 'font-family:' + fk + ';';
          var fz = /^(\d{2})px$/.exec(String(st.fontSize || ''));
          if (fz && (R.sizes || []).indexOf(+fz[1]) >= 0) css += 'font-size:' + fz[1] + 'px;';
          if ((R.letterSpacings || []).indexOf(String(st.letterSpacing || '')) >= 0) css += 'letter-spacing:' + st.letterSpacing + ';';
          if (css) { var sp = doc.createElement('span'); sp.setAttribute('style', css); sp.append.apply(sp, n.childNodes); n.replaceWith(sp); continue; }
        }
        if (!KEEP[tag]) {
          /* Unwrap, but keep paragraph breaks where a block was. */
          if (BLOCKISH[tag] && n.textContent.trim()) {
            var p = doc.createElement('p');
            p.append.apply(p, n.childNodes);
            n.replaceWith(p);
          } else {
            n.replaceWith.apply(n, n.childNodes);
          }
          continue;
        }
        /* A paragraph's line height, from the rules' list. */
        var keepLh = R && R.lineHeights && /^(P|LI|H2|H3)$/.test(tag) && R.lineHeights.indexOf(String(n.style.lineHeight || '')) >= 0 ? n.style.lineHeight : '';
        Array.prototype.slice.call(n.attributes).forEach(function (a) {
          var ok = (tag === 'A' && a.name === 'href') || (tag === 'IMG' && (a.name === 'src' || a.name === 'alt'));
          if (!ok || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
        });
        if (keepLh) n.setAttribute('style', 'line-height:' + keepLh);
        if (tag === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener'); }
        if (tag === 'IMG' && !/^(https?:|data:image\/)/i.test(n.getAttribute('src') || '')) n.remove();
      }
    })(root);

    /* A paragraph inside a paragraph, or nothing but spaces, after unwrapping. */
    root.querySelectorAll('p p').forEach(function (p) { p.replaceWith.apply(p, p.childNodes); });
    root.querySelectorAll('p,li,h2,h3').forEach(function (b) {
      if (!b.textContent.trim() && !b.querySelector('img')) b.remove();
    });
    return root.innerHTML.trim();
  }

  var CSS = [
    '.eed{border:1px solid #d1d5db;border-radius:10px;background:#fff;overflow:hidden;font-family:Inter,system-ui,sans-serif}',
    '.eed:focus-within{border-color:#3d6263;box-shadow:0 0 0 3px rgba(61,98,99,.15)}',
    '.eed-tb{display:flex;flex-wrap:wrap;gap:2px;padding:6px;border-bottom:1px solid #e5e7eb;background:#f9fafb}',
    '.eed-tb button{display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:32px;padding:0 7px;',
    'border:0;border-radius:6px;background:transparent;color:#374151;cursor:pointer;font:600 13px Inter,sans-serif}',
    '.eed-tb button:hover{background:#e5e7eb;color:#111827}',
    '.eed-tb button.on{background:#d9e8e6;color:#2a4a4b}',
    '.eed-tb .sep{width:1px;background:#e5e7eb;margin:4px 4px}',
    '.eed-ar{min-height:180px;max-height:52vh;overflow-y:auto;padding:14px 16px;outline:none;font-size:15px;line-height:1.6;color:#111827}',
    '.eed-ar:empty:before{content:attr(data-ph);color:#9ca3af}',
    '.eed-ar p{margin:0 0 10px}',
    '.eed-ar h2{font-size:19px;font-weight:700;margin:14px 0 6px}',
    '.eed-ar h3{font-size:16px;font-weight:600;margin:12px 0 4px}',
    '.eed-ar ul,.eed-ar ol{margin:0 0 10px;padding-left:22px}',
    '.eed-ar blockquote{margin:0 0 10px;padding:8px 14px;border-left:3px solid #3d6263;background:#eef5f4;border-radius:0 8px 8px 0}',
    '.eed-ar a{color:#3d6263;text-decoration:underline}',
    '.eed-ar img{max-width:100%;height:auto;border-radius:8px;margin:6px 0}',
    '.eed-pal{display:none;position:absolute;z-index:5;margin-top:4px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 4px 12px rgba(16,24,40,.12);padding:8px;gap:6px;flex-wrap:wrap;width:196px}',
    '.eed-pal.on{display:flex}.eed-pal button{width:26px;height:26px;min-width:26px;padding:0;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #d1d5db;cursor:pointer}',
    '.eed-st{font-size:12px;color:#6b7280;padding:6px 12px;border-top:1px solid #e5e7eb;background:#f9fafb;display:none}'
  ].join('');

  function icon(name, label) {
    return '<i data-lucide="' + name + '" style="width:17px;height:17px"></i>' +
           (window.EGBCUI ? '' : label);
  }

  function mount(el, opts) {
    opts = opts || {};
    if (!document.getElementById('eed-css')) {
      var s = document.createElement('style'); s.id = 'eed-css'; s.textContent = CSS; document.head.appendChild(s);
    }

    var B = [
      ['bold', 'bold', 'Bold', 'B'], ['italic', 'italic', 'Italic', 'I'], ['underline', 'underline', 'Underline', 'U'],
      opts.palette && opts.palette.length ? ['colour', 'baseline', 'Colour', 'A'] : null, '|',
      ['h2', 'heading-2', 'Heading', 'H'], ['h3', 'heading-3', 'Small heading', 'h'], ['quote', 'text-quote', 'Quote', '"'], '|',
      ['ul', 'list', 'Bullet list', '•'], ['ol', 'list-ordered', 'Numbered list', '1.'], '|',
      ['link', 'link', 'Add a link', 'Link'], ['unlink', 'unlink', 'Remove link', 'Unlink'],
      opts.upload ? ['img', 'image-plus', 'Add a picture', 'Pic'] : null, '|',
      ['clear', 'remove-formatting', 'Clear formatting', 'Tx'], ['undo', 'undo-2', 'Undo', '↶'], ['redo', 'redo-2', 'Redo', '↷']
    ].filter(Boolean);

    el.innerHTML =
      '<div class="eed">' +
        '<div class="eed-tb">' + B.map(function (b) {
          if (b === '|') return '<span class="sep"></span>';
          return '<button type="button" data-c="' + b[0] + '" title="' + b[2] + '" aria-label="' + b[2] + '">' + icon(b[1], b[3]) + '</button>';
        }).join('') + '</div>' +
        (opts.palette && opts.palette.length ? '<div class="eed-pal" role="menu" aria-label="Colour">' + opts.palette.map(function (c) {
          return '<button type="button" data-colour="' + c + '" title="' + c + '" aria-label="Colour ' + c + '" style="background:' + c + '"></button>'; }).join('') + '</div>' : '') +
        '<div class="eed-ar" contenteditable="true" data-ph="' + (opts.placeholder || 'Write here') + '"></div>' +
        '<div class="eed-st"></div>' +
        (opts.upload ? '<input type="file" accept="image/*" style="display:none">' : '') +
      '</div>';

    var area = el.querySelector('.eed-ar');
    var status = el.querySelector('.eed-st');
    var file = el.querySelector('input[type=file]');
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}

    function cmd(c, v) { area.focus(); document.execCommand(c, false, v === undefined ? null : v); sync(); }
    function block(tag) {
      var cur = (document.queryCommandValue('formatBlock') || '').toLowerCase();
      cmd('formatBlock', cur === tag ? 'p' : tag);
    }

    function sync() {
      el.querySelectorAll('.eed-tb button').forEach(function (b) {
        var c = b.dataset.c, on = false;
        try {
          if (c === 'bold' || c === 'italic' || c === 'underline') on = document.queryCommandState(c);
          else if (c === 'ul') on = document.queryCommandState('insertUnorderedList');
          else if (c === 'ol') on = document.queryCommandState('insertOrderedList');
          else if (c === 'h2' || c === 'h3' || c === 'quote') {
            var v = (document.queryCommandValue('formatBlock') || '').toLowerCase();
            on = v === (c === 'quote' ? 'blockquote' : c);
          }
        } catch (e) {}
        b.classList.toggle('on', on);
      });
    }

    function say(msg) { status.textContent = msg || ''; status.style.display = msg ? 'block' : 'none'; }

    el.querySelector('.eed-tb').addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) e.preventDefault();   // keep the selection
    });
    el.querySelector('.eed-tb').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var c = b.dataset.c;
      if (c === 'bold' || c === 'italic' || c === 'underline' || c === 'undo' || c === 'redo') cmd(c);
      else if (c === 'h2' || c === 'h3') block(c);
      else if (c === 'quote') block('blockquote');
      else if (c === 'ul') cmd('insertUnorderedList');
      else if (c === 'ol') cmd('insertOrderedList');
      else if (c === 'unlink') cmd('unlink');
      else if (c === 'clear') { cmd('removeFormat'); cmd('formatBlock', 'p'); }
      else if (c === 'link') {
        var sel = window.getSelection();
        var had = sel && sel.toString();
        var url = prompt('Link to (web address):', 'https://');
        if (!url || url === 'https://') return;
        if (!/^(https?:|mailto:|tel:)/i.test(url)) url = 'https://' + url;
        if (had) cmd('createLink', url);
        else cmd('insertHTML', '<a href="' + url.replace(/"/g, '&quot;') + '">' + url.replace(/</g, '&lt;') + '</a>&nbsp;');
      }
      else if (c === 'img' && file) file.click();
      else if (c === 'colour') { var pal = el.querySelector('.eed-pal'); if (pal) pal.classList.toggle('on'); }
    });
    var palEl = el.querySelector('.eed-pal');
    if (palEl) {
      palEl.addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep the selection
      palEl.addEventListener('click', function (e) {
        var b = e.target.closest('[data-colour]'); if (!b) return;
        try { document.execCommand('styleWithCSS', false, true); } catch (er) {}
        cmd('foreColor', b.getAttribute('data-colour'));
        palEl.classList.remove('on');
      });
    }

    if (file) file.addEventListener('change', async function () {
      var f = file.files[0]; file.value = '';
      if (!f) return;
      if (!/^image\//.test(f.type)) { say('That is not a picture.'); return; }
      try {
        say('Adding the picture…');
        var url = await opts.upload(f);
        cmd('insertHTML', '<img src="' + url.replace(/"/g, '&quot;') + '" alt=""><p><br></p>');
        say('');
      } catch (err) { say('Could not add the picture: ' + (err.message || err)); }
    });

    /* Paste: keep the words and simple formatting, lose the email's layout. */
    area.addEventListener('paste', function (e) {
      var cd = e.clipboardData; if (!cd) return;
      var html = cd.getData('text/html');
      var text = cd.getData('text/plain');
      e.preventDefault();
      if (html) {
        document.execCommand('insertHTML', false, clean(html, opts.palette));
      } else if (text) {
        var safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        var paras = safe.split(/\n{2,}/).map(function (p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
        document.execCommand('insertHTML', false, paras);
      }
      sync();
    });

    area.addEventListener('keyup', sync);
    area.addEventListener('mouseup', sync);
    area.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) e.preventDefault(); });

    var api = {
      getHTML: function () { return clean(area.innerHTML, opts.palette); },
      setHTML: function (h) { area.innerHTML = clean(h, opts.palette); say(''); },
      isEmpty: function () { return !area.textContent.trim() && !area.querySelector('img'); },
      focus: function () { area.focus(); }
    };
    api.setHTML(opts.html || '');
    if (window.EGBCUI) EGBCUI.refresh();
    return api;
  }

  window.EGBCEditor = { mount: mount, clean: clean };
})();
