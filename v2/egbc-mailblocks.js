/* ===================================================================
   EGBC — the e-news's building blocks (comms window, 19 Oct 2026)
   ===================================================================

   ONE PLACE THAT TURNS BLOCKS INTO EMAIL. The e-news page (enews.html)
   keeps an issue as a list of blocks - plain data - and this file draws
   them as email HTML: tables and inline styles, because that is all email
   programs agree on. The Email Compiler's own snippets (button, heading,
   divider, spacer, two columns) are here too, drawn the same way, so the
   two never drift (FINDINGS-comms decision 1: "a new page sharing the
   Email Compiler's blocks").

     EGBCMailBlocks.render(issue, opts)  -> the whole email, as HTML
         issue: { subject, preheader, blocks: [...], template, colours }
         opts:  { version: 'members' | 'everyone', church: {...},
                  unsubscribeUrl, webUrl }
     EGBCMailBlocks.draft(data)          -> the blocks for an automatic draft
     EGBCMailBlocks.TEMPLATES            -> the starting looks
     EGBCMailBlocks.snippet.button(...) etc. -> the Compiler's snippets

   MEMBERS ONLY IS DECIDED HERE AND NOWHERE ELSE (FINDINGS-comms C-7). A
   block marked members: true is left out of the 'everyone' version
   entirely - not hidden with CSS, not there. The web version and the
   archive are always 'everyone'. The check (tests/check-enews-blocks.mjs)
   asks this file directly, with a deliberate break.

   WHAT AN AUTOMATIC DRAFT MAY TAKE (C-9). Public events go in as normal
   blocks; members' and church members' events go in as members-only;
   team and not-listed events never go in, in any version - being listed
   can defeat the point of a group (NEXT-BRIEF §24 item 13).

   Works in the browser (window.EGBCMailBlocks) and in node (the checks,
   and later the server's Monday draft). No Firebase in here.
   =================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EGBCMailBlocks = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---- the starting looks (decision 4: both, and the colours are the
     church's to change) ------------------------------------------------
     'classic' IS VAL'S MAILCHIMP TEMPLATE, measured from her 15 Oct 2026
     e-news (Martin, 20 Oct: "it must look exactly like the Mailchimp
     version on phone and computer"): grey page #dee0e2, a #222222 top bar,
     white body, 15px Helvetica at 150% (18px at 125% on a phone), teal
     #008080 titles and dates, green #17a809 links, the orange #fe7e07 bar,
     a 2px #eaeaea rule, and a #202020 footer. 'green' is the same layout
     in the hub's colours. A church's saved colours are laid over either:
     no church is forced into Val's look, but EGBC starts there. */
  var TEMPLATES = {
    classic: {
      label: 'Classic (as the e-news looks today)',
      font: 'Helvetica,Arial,sans-serif',
      page: '#dee0e2', paper: '#ffffff', topBar: '#222222', topBarText: '#ffffff',
      text: '#202020', muted: '#555555', title: '#008080', link: '#17a809',
      bar: '#fe7e07', barText: '#fffafa', button: '#07a47d', buttonText: '#ffffff', radius: 19,
      verse: '#000000', verseBg: '#ffffff', rule: '#eaeaea',
      footer: '#202020', footerText: '#ffffff', shade: '#0a191a'
    },
    green: {
      label: 'Green (the hub’s colours)',
      font: 'Helvetica,Arial,sans-serif',
      page: '#eaf2f2', paper: '#ffffff', topBar: '#2a4a4b', topBarText: '#ffffff',
      text: '#1e3a3a', muted: '#5b6b6b', title: '#2a4a4b', link: '#3d6263',
      bar: '#3d6263', barText: '#ffffff', button: '#3d6263', buttonText: '#ffffff', radius: 9,
      verse: '#2a4a4b', verseBg: '#ffffff', rule: '#dbe6e6',
      footer: '#2a4a4b', footerText: '#ffffff', shade: '#0a191a'
    }
  };
  var COLOUR_KEYS = ['page', 'paper', 'topBar', 'topBarText', 'text', 'muted', 'title', 'link', 'bar', 'barText', 'button', 'buttonText', 'verse', 'verseBg', 'rule', 'footer', 'footerText'];
  var HEX = /^#[0-9a-f]{6}$/i;

  function theme(issue) {
    var base = TEMPLATES[(issue && issue.template) || 'classic'] || TEMPLATES.classic;
    var t = {}; Object.keys(base).forEach(function (k) { t[k] = base[k]; });
    var c = (issue && issue.colours) || {};
    COLOUR_KEYS.forEach(function (k) { if (HEX.test(String(c[k] || ''))) t[k] = String(c[k]).toLowerCase(); });
    return t;
  }

  /* ---- safety ---------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* Links: http(s) and mailto only. Anything else (javascript:, data:) is
     dropped, and the block draws without a link. */
  function safeUrl(u) {
    u = String(u == null ? '' : u).trim();
    if (/^https?:\/\/[^\s<>"]+$/i.test(u) || /^mailto:[^\s<>"]+$/i.test(u)) return u;
    return '';
  }
  /* Formatted text comes from EGBCEditor, which already keeps only simple
     tags; this keeps only those again, with safe links and no attributes
     beyond href, so a pasted script or style can never reach an inbox. */
  var KEEP = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, A: 1, UL: 1, OL: 1, LI: 1, H2: 1, H3: 1, BLOCKQUOTE: 1, SPAN: 1, FONT: 1, S: 1, STRIKE: 1, DEL: 1 };
  /* THE CHURCH'S PALETTE (reviewing window, 20 Oct: "Val colours words
     herself"): the look's own colours and a few more. A word's colour is
     kept only if it is one of these - inline, on a span - so nothing an
     editor or a paste brings in can break Outlook or dark mode. */
  var EXTRA_COLOURS = ['#000000', '#b42318', '#6b7280', '#1d4ed8', '#7c3aed'];
  function palette(t) {
    var out = [];
    [t.title, t.link, t.bar, t.text, t.button, t.topBar].concat(EXTRA_COLOURS).forEach(function (c) {
      c = String(c || '').toLowerCase(); if (HEX.test(c) && out.indexOf(c) < 0) out.push(c);
    });
    return out;
  }
  /* WORDS STYLED BY HAND (Martin, 20 Oct: "font, size, line height and
     highlight, as Mailchimp's", starting from the church's look). Only
     these are kept when sending - fonts every email program has, sizes and
     line heights from a short list, highlights in light colours - so a
     paste or an editor can never put anything else into an inbox. */
  var FONTS = { 'Helvetica': 'Helvetica,Arial,sans-serif', 'Arial': 'Arial,Helvetica,sans-serif', 'Georgia': 'Georgia,Times New Roman,serif', 'Verdana': 'Verdana,Geneva,sans-serif',
    'Trebuchet MS': 'Trebuchet MS,Arial,sans-serif', 'Times New Roman': 'Times New Roman,Times,serif', 'Courier New': 'Courier New,Courier,monospace' };
  var SIZES = [12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36];
  var LINE_HEIGHTS = ['100%', '115%', '125%', '150%', '175%', '200%'];
  /* Letter spacing (plan A): a few steps, kept on a span. */
  var LETTER_SPACINGS = ['0.5px', '1px', '1.5px', '2px', '3px'];
  var HIGHLIGHTS = ['#fff3b0', '#ffe2c6', '#dcf5d6', '#d7ebe8', '#e6e1f7', '#fde2e4'];
  function styleRules(t) { return { colours: palette(t), highlights: HIGHLIGHTS.slice(), fonts: Object.keys(FONTS), sizes: SIZES.slice(), lineHeights: LINE_HEIGHTS.slice(), letterSpacings: LETTER_SPACINGS.slice() }; }
  /* "a: b; c: d" (from a style attribute) -> { a: 'b', c: 'd' }. */
  function styleProps(attrs) {
    var m = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(' ' + attrs), out = {};
    String(m ? (m[2] != null ? m[2] : m[3]) : '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").split(';').forEach(function (d) {
      var i = d.indexOf(':'); if (i < 0) return;
      out[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim();
    });
    return out;
  }
  function fontOf(v) {
    var first = String(v || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
    var k = Object.keys(FONTS).filter(function (n) { return n.toLowerCase() === first; })[0];
    return k ? FONTS[k] : '';
  }
  function spanStyle(pr, t) {
    var out = '', c = hexOf(pr.color), h = hexOf(pr['background-color'] || pr.background), f = fontOf(pr['font-family']), z = /^(\d{2})px$/.exec(String(pr['font-size'] || '').trim());
    if (c && t && palette(t).indexOf(c) >= 0) out += 'color:' + c + ';';
    if (h && HIGHLIGHTS.indexOf(h) >= 0) out += 'background-color:' + h + ';';
    if (f) out += 'font-family:' + f + ';';
    if (z && SIZES.indexOf(+z[1]) >= 0) out += 'font-size:' + z[1] + 'px;';
    var ls = String(pr['letter-spacing'] || '').trim();
    if (LETTER_SPACINGS.indexOf(ls) >= 0) out += 'letter-spacing:' + ls + ';';
    return out;
  }
  function lineHeightOf(attrs) { var v = String(styleProps(attrs)['line-height'] || '').trim(); return LINE_HEIGHTS.indexOf(v) >= 0 ? v : ''; }
  function hexOf(c) {
    c = String(c || '').trim().toLowerCase();
    var m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c);
    if (m) return '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    if (HEX.test(c)) return c;
    m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/.exec(c);
    if (m) return '#' + [m[1], m[2], m[3]].map(function (n) { return ('0' + Math.min(255, +n).toString(16)).slice(-2); }).join('');
    return '';
  }
  function cleanHtml(html, t) {
    var out = String(html == null ? '' : html)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<\s*(\/?)\s*([a-z0-9]+)([^>]*)>/gi, function (m, close, tag, attrs) {
        var T = tag.toUpperCase();
        if (T === 'IMG') return '';
        if (!KEEP[T]) return '';
        if (close) return '</' + (T === 'FONT' ? 'span' : T === 'STRIKE' || T === 'DEL' ? 's' : T.toLowerCase()) + '>';
        if (T === 'A') {
          var h = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
          var href = safeUrl(h ? (h[2] || h[3] || h[4] || '') .replace(/&amp;/g, '&') : '');
          return href ? '<a href="' + esc(href) + '" style="color:' + t.link + ';text-decoration:underline;">' : '<a>';
        }
        /* Val's paragraphs: 10px above and below (her mcnTextContent p). */
        if (T === 'P') { var plh = lineHeightOf(attrs); return '<p style="margin:10px 0;' + (plh ? 'line-height:' + plh + ';' : '') + '">'; }
        if (T === 'LI' || T === 'H2' || T === 'H3') { var lh = lineHeightOf(attrs); return '<' + T.toLowerCase() + (lh ? ' style="line-height:' + lh + ';"' : '') + '>'; }
        if (T === 'STRIKE' || T === 'DEL') return '<s>';
        if (T === 'SPAN' || T === 'FONT') {
          /* Each property read on its own (a highlight's background-color is
             never taken for the words' colour). <font color face> too. */
          var pr = styleProps(attrs);
          var fc = /\scolor\s*=\s*["']?([^"'\s>]+)/i.exec(' ' + attrs); if (fc && !pr.color) pr.color = fc[1];
          var ff = /\sface\s*=\s*["']?([^"'>]+)/i.exec(' ' + attrs); if (ff && !pr['font-family']) pr['font-family'] = ff[1];
          var st = spanStyle(pr, t);
          /* "Members only" words inside a block (Martin, 21 Oct): kept as a
             mark; render() takes them out of everyone else's copy. */
          var mem = /\sdata-members\s*=\s*["']?1/i.test(' ' + attrs) ? ' data-members="1"' : '';
          return '<span' + mem + (st ? ' style="' + st + '"' : '') + '>';
        }
        return '<' + T.toLowerCase() + '>';
      });
    return out;
  }

  /* ---- the Email Compiler's snippets (EmailBuilder2.html insertBlock),
     the same HTML, so the Compiler can draw from here. ----------------- */
  var snippet = {
    button: function (label, url, colour, radius) {
      var href = safeUrl(url); if (!href) return '';
      var r = radius == null ? 9 : radius;
      return '<table border="0" cellspacing="0" cellpadding="0" style="margin:20px auto;"><tr>' +
        '<td align="center" bgcolor="' + (colour || '#3d6263') + '" style="border-radius:' + r + 'px;">' +
        '<a href="' + esc(href) + '" target="_blank" style="display:inline-block;padding:13px 30px;font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:' + r + 'px;">' + esc(label) + '</a>' +
        '</td></tr></table>';
    },
    heading: function (text, colour) {
      return '<p style="margin:26px 0 8px;font-family:Arial,sans-serif;font-size:12px;font-weight:600;color:' + (colour || '#3d6263') + ';">' + esc(text) + '</p>';
    },
    divider: function () {
      return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;"><tr><td style="border-top:1px solid #dbe6e6;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr></table>';
    },
    spacer: function () {
      return '<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>';
    },
    columns: function (left, right) {
      return '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:18px 0;"><tr>' +
        '<td width="50%" valign="top" style="padding:0 10px 0 0;">' + (left == null ? 'Left column…' : left) + '</td>' +
        '<td width="50%" valign="top" style="padding:0 0 0 10px;">' + (right == null ? 'Right column…' : right) + '</td>' +
        '</tr></table>';
    },
    /* A meeting (meetingFrom), as the Compiler's other snippets look. */
    meeting: function (m, colour) {
      var href = safeUrl(m && m.url); if (!href) return '';
      return '<table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:18px 0;"><tr><td style="padding:14px 16px;border:1px solid #dbe6e6;border-radius:12px;font-family:Arial,sans-serif;">' +
        '<p style="margin:0;font-size:16px;font-weight:bold;color:' + (colour || '#3d6263') + ';">' + esc(m.title || 'Meeting') + '</p>' +
        (meetingWhen(m) ? '<p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#333333;">' + esc(meetingWhen(m)) + '</p>' : '') +
        snippet.button(m.label || 'Join the meeting', href, '#15803d') +
        '<p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">' + esc(KNOCK) + '</p>' +
        '</td></tr></table>';
    }
  };

  /* ---- meetings (Martin, 20 Oct): one from the hub's Meetings list (rota
     events with a video room, egbc-core-meetings.js). Join is the hub's own
     meeting page - knock and the host lets you in - never a host link.
     Members-only unless the office unticks it; the CMM room always is
     (EGBCAuth.MEMBERS_ONLY_ROOMS). */
  var MEMBERS_ONLY_ROOMS = ['CMM'];
  var KNOCK = 'Type your name and knock; the host lets you in.';
  function clock(hhmm) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '')); if (!m) return '';
    var h = +m[1];
    return (h % 12 || 12) + (+m[2] ? ':' + m[2] : '') + (h < 12 ? 'am' : 'pm');
  }
  function meetingWhen(m) {
    var day = /^\d{4}-\d{2}-\d{2}$/.test(String(m.date || ''))
      ? new Date(m.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '';
    var time = clock(m.startTime) + (clock(m.endTime) ? '–' + clock(m.endTime) : '');
    return [day, time].filter(Boolean).join(' · ');
  }
  /* ev: an `events` document (with its id); room: its video room; base:
     where the hub is (e.g. https://esherchurch.github.io/availability-form/v2). */
  function meetingFrom(ev, room, base) {
    ev = ev || {};
    return {
      type: 'meeting', eventId: String(ev.id || ''), room: String(room || ''),
      title: [ev.type, ev.description].filter(Boolean).join(' · ').slice(0, 160) || 'Meeting',
      date: String(ev.date || ''), startTime: String(ev.startTime || ''), endTime: String(ev.endTime || ''),
      url: String(base || '').replace(/\/+$/, '') + '/meeting.html?room=' + encodeURIComponent(room || '') + (ev.id ? '&event=' + encodeURIComponent(ev.id) : ''),
      members: true
    };
  }

  /* ---- one block ---------------------------------------------------------
     THE LAYOUT IS VAL'S (FINDINGS-comms C-29). Every block is a table row
     with inline styles (Outlook reads nothing else); widths are fluid -
     100% up to 600px - and every picture has max-width:100%, height:auto,
     so nothing is ever wider than the phone (checked at 320, 375 and 414).
     On a computer an event's picture (176px) sits left of its words, as on
     her page; below 480px it goes full width above them, and the words
     grow to 18px, exactly as her template does. */
  var PAD = '9px 18px';
  function row(inner, padding, cls) {
    return '<tr><td' + (cls ? ' class="' + cls + '"' : '') + ' valign="top" style="padding:' + (padding || PAD) + ';">' + inner + '</td></tr>';
  }
  function textStyle(t) { return 'font-family:' + t.font + ';font-size:15px;line-height:150%;color:' + t.text + ';text-align:left;word-break:break-word;overflow-wrap:anywhere;'; }
  function link(href, words, t, bold) {
    return '<a href="' + esc(href) + '" target="_blank" style="color:' + t.link + ';text-decoration:underline;' + (bold ? 'font-weight:bold;' : '') + '">' + words + '</a>';
  }
  /* "Add this week's picture" - shown in the editor's preview only, never
     in an email (render opts.preview). */
  function placeholder(words, h) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" height="' + h + '" ' +
      'style="height:' + h + 'px;border:2px dashed #b9b9b9;background:#f4f4f4;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:#6b6b6b;text-align:center;">' + esc(words) + '</td></tr></table>';
  }
  function image(src, alt, w, radius) {
    return '<img class="fluid" src="' + esc(src) + '" width="' + w + '" alt="' + esc(alt || '') + '" ' +
      'style="display:block;width:100%;max-width:' + w + 'px;height:auto;border:0;outline:none;text-decoration:none;' + (radius ? 'border-radius:' + (typeof radius === 'string' ? radius : radius + 'px') + ';' : '') + '">';
  }
  /* A picture from Unsplash carries its credit (Unsplash's guidelines):
     "Photo by <name> on Unsplash", both linked, with Church HQ's UTM tags.
     Shown only while the picture is still the one credited. */
  var UNSPLASH_UTM = 'utm_source=church_hq&utm_medium=referral';
  function creditLine(c, src, t, pad) {
    if (!c || !c.name || c.url !== src) return '';
    var prof = /^https:\/\/unsplash\.com\/@[A-Za-z0-9_.-]{1,60}\?utm_source=church_hq&utm_medium=referral$/.test(String(c.profile || '')) ? c.profile : '';
    if (!prof) return '';
    var a = function (u, w) { return '<a href="' + esc(u) + '" target="_blank" style="color:' + t.muted + ';text-decoration:underline;">' + esc(w) + '</a>'; };
    return '<div style="font-family:' + t.font + ';font-size:11px;line-height:140%;color:' + t.muted + ';text-align:right;padding:' + (pad || '4px 0 0') + ';">Photo by ' + a(prof, String(c.name).slice(0, 80)) + ' on ' + a('https://unsplash.com/?' + UNSPLASH_UTM, 'Unsplash') + '</div>';
  }
  function rule(t) {
    return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:2px solid ' + t.rule + ';font-size:1px;line-height:1px;">&nbsp;</td></tr></table>', '18px');
  }
  function button(b, t) {
    var href = safeUrl(b.url); if (!href || !b.label) return '';
    return '<table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;"><tr>' +
      '<td align="center" bgcolor="' + t.button + '" style="border-radius:' + t.radius + 'px;">' +
      '<a href="' + esc(href) + '" target="_blank" style="display:inline-block;padding:14px 18px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;line-height:100%;color:' + t.buttonText + ';text-decoration:none;border-radius:' + t.radius + 'px;">' + esc(b.label) + '</a>' +
      '</td></tr></table>';
  }

  /* An item's words: the title in teal and bold (with its day and time, as
     Val writes them), then the description with its own links, then the
     sign-up link. */
  function itemWords(b, t, edit) {
    var head = [b.title, b.when].filter(Boolean).join(' – ');
    var body = b.html ? cleanHtml(b.html, t) : '';
    /* Val's card titles are the card's first bold line, in teal. */
    if (!head) body = body.replace(/^(\s*(?:<p[^>]*>)?\s*)<strong>/, '$1<strong style="color:' + t.title + ';">');
    /* In the editor, the words are typed on where they are. */
    if (edit) body = '<div data-edit="html">' + (body || '<p style="margin:10px 0;"><br></p>') + '</div>';
    var signup = safeUrl(b.buttonUrl) && b.buttonLabel ? '<p style="margin:0 0 10px;">' + link(safeUrl(b.buttonUrl), esc(b.buttonLabel), t, true) + '</p>' : '';
    return (head ? '<p style="margin:0;"><strong style="color:' + t.title + ';">' + esc(head) + '</strong></p>' : '') +
      body + (b.text ? '<p style="margin:0 0 10px;">' + esc(b.text) + '</p>' : '') + signup;
  }

  /* THE EVENT CARD, Val's: picture left (176px) and words right on a
     computer; picture full width above the words on a phone. With no
     picture, the words alone, full width. */
  function cardStyle(t) { return textStyle(t).replace('font-size:15px;line-height:150%', 'font-size:14px;line-height:125%'); }
  function eventCard(b, t, o) {
    o = o || {};
    var img = safeUrl(b.imageUrl);
    var bare = !o.edit && !String(b.html || '').replace(/<[^>]+>/g, '').trim() && !String(b.text || '').trim();
    /* A bare event (no write-up yet): a tidy, finished card - its title
       and day, and "More details" to its page on What's On. */
    var more = bare && safeUrl(b.moreUrl) ? '<p style="margin:10px 0;">' + link(safeUrl(b.moreUrl), 'More details', t, true) + '</p>' : '';
    var words = itemWords(b, t, o.edit) + more;
    if (!img) return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td class="ctext t" valign="top" style="' + cardStyle(t) + 'padding:0;">' + words + '</td></tr></table>', '9px 18px 18px');
    /* "Words and picture": the picture on the right on a computer. */
    var pic = '<td class="cimg" width="176" valign="top" style="width:176px;padding:' + (b.side === 'right' ? '0 0 0 36px' : '0 36px 0 0') + ';">' + image(img, b.alt || b.title, 176, '3%') + '</td>';
    var txt = '<td class="ctext t" valign="top" style="' + cardStyle(t) + 'padding:0;">' + words + '</td>';
    return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      (b.side === 'right' ? txt + pic : pic + txt) + '</tr></table>', '9px 18px 18px');
  }
  /* Columns (2 or 3): words in each, side by side on a computer, one
     under another on a phone. */
  function columnsBlock(b, t, o) {
    var cols = (b.cols || []).slice(0, 3); if (!cols.length) return '';
    var w = Math.floor(100 / cols.length);
    return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' + cols.map(function (c, k) {
      var img = safeUrl(c.imageUrl);
      var words = c.html ? cleanHtml(c.html, t) : '';
      if (o.edit) words = '<div data-edit="col' + k + '">' + (words || '<p style="margin:10px 0;"><br></p>') + '</div>';
      return '<td class="col t" width="' + w + '%" valign="top" style="' + cardStyle(t) + 'width:' + w + '%;padding:' + (k ? '0 0 0 9px' : '0 9px 0 0') + ';">' +
        (img ? image(img, c.alt, Math.floor(564 / cols.length) - 9, '3%') : '') + words + '</td>';
    }).join('') + '</tr></table>', '9px 18px 18px');
  }
  /* A video: its picture (YouTube's own still when none is chosen), and a
     link to watch it - email cannot play a video. */
  function youtubeId(u) { var m = /(?:youtube\.com\/(?:watch\?v=|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/.exec(String(u || '')); return m ? m[1] : ''; }
  function videoBlock(b, t) {
    var u = safeUrl(b.url); if (!u) return '';
    var still = safeUrl(b.imageUrl) || (youtubeId(u) ? 'https://img.youtube.com/vi/' + youtubeId(u) + '/hqdefault.jpg' : '');
    return row((still ? '<a href="' + esc(u) + '" target="_blank">' + image(still, b.alt || 'Watch the video', 564, 8) + '</a>' : '') +
      '<p style="margin:8px 0 0;font-family:' + t.font + ';font-size:15px;text-align:center;">' + link(u, '&#9654; ' + esc(b.label || 'Watch the video'), t, true) + '</p>');
  }
  /* A block's own look (the editor's Style tab): a background and border in
     the church's colours, rounded corners, more or less space around. */
  var TINTS = ['#ffffff', '#f3f4f6', '#eef5f4', '#fdf8ee', '#eaf2f2'];
  function styled(b, rows, t) {
    var L = b.look || {}; if (!rows || !L || (!L.bg && !L.border && !L.radius && !L.space)) return rows;
    var ok = palette(t).concat(TINTS);
    var bg = ok.indexOf(String(L.bg || '').toLowerCase()) >= 0 ? String(L.bg).toLowerCase() : '';
    var bd = L.border === 'line' ? '1px solid ' + t.rule : '';
    var rad = [0, 8, 16].indexOf(+L.radius) >= 0 ? +L.radius : 0;
    var out = L.space === 'more' ? '18px 18px' : L.space === 'less' ? '0 18px' : '9px 18px';
    return '<tr><td style="padding:' + out + ';"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"' + (bg ? ' bgcolor="' + bg + '"' : '') +
      ' style="border-collapse:separate;' + (bg ? 'background-color:' + bg + ';' : '') + (bd ? 'border:' + bd + ';' : '') + (rad ? 'border-radius:' + rad + 'px;' : '') + '">' + rows + '</table></td></tr>';
  }
  /* "Dates for the diary": the coming weeks' public events from What's On,
     a date and a title each (diaryItems makes the list). */
  function diaryBlock(b, t) {
    var items = (b.items || []).filter(function (x) { return x && x.title; });
    if (!items.length) return '';
    return row('<div class="t" style="' + textStyle(t) + '">' +
      '<p style="margin:0 0 6px;"><strong style="color:' + t.title + ';">' + esc(b.title || 'Dates for the diary') + '</strong></p>' +
      items.map(function (x) {
        var u = safeUrl(x.url);
        return '<p style="margin:0 0 4px;"><strong>' + esc(x.date || '') + '</strong>' + (x.date ? ' – ' : '') + (u ? link(u, esc(x.title), t) : esc(x.title)) + '</p>';
      }).join('') + '</div>', '9px 18px 18px');
  }

  function block(b, t, o) {
    switch (b.type) {
      case 'header':
        /* Val's hero: the week's picture, full width, no margin. */
        return (safeUrl(b.imageUrl)
          ? row((safeUrl(b.link) ? '<a href="' + esc(safeUrl(b.link)) + '" target="_blank">' : '') + image(safeUrl(b.imageUrl), b.alt || b.title, 600) + (safeUrl(b.link) ? '</a>' : '') + creditLine(b.credit, safeUrl(b.imageUrl), t, '4px 18px 0'), '9px 0 0')
          : (o.preview ? row(placeholder('Add this week’s picture', 220), '9px 18px') : '')) +
          (b.title ? row('<h1 style="margin:0;font-family:' + t.font + ';font-size:22px;line-height:125%;font-weight:bold;color:' + t.title + ';text-align:center;">' + esc(b.title) + '</h1>', '18px 18px 0') : '');
      case 'verse':
        /* Val's verse: bold, centred, the reference and version after it. */
        if (!String(b.text || '').trim()) return o.preview ? row(placeholder('Add this week’s verse', 90), '18px 18px 9px') : '';
        var ref = [b.ref, b.version].filter(Boolean).join(' ');
        /* Measured from hers (tests/check-enews-side-by-side.mjs): 18px words
           in a 24px line at 125% - 30px apart on a computer, 22.5px on a
           phone - starting 34px (computer) and 28px (phone) below the picture. */
        return row('<div class="verse" style="font-family:' + t.font + ';font-size:24px;line-height:125%;font-weight:bold;color:' + t.verse + ';text-align:center;">' +
            '<span style="font-size:18px;">' + esc(String(b.text).trim()) + (ref ? ' (' + esc(ref) + ')' : '') + '</span></div>' +
            (b.copyright ? '<div style="font-family:' + t.font + ';font-size:11px;line-height:140%;color:' + t.muted + ';text-align:center;padding:6px 0 0;">' + esc(b.copyright) + '</div>' : ''),
          '27px 18px 9px', 'vrow');
      case 'section':
        return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="' + t.bar + '" ' +
          'style="padding:12px 18px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;line-height:100%;color:' + t.barText + ';text-align:center;"' + (o.edit ? ' data-edit="label"' : '') + '>' + esc(b.label) + '</td></tr></table>');
      case 'sunday':
        /* Val's Sunday: the date in teal, the service in bold, a line about it. */
        var dateLine = b.date || b.when || '';
        var service = [b.time, b.title].filter(Boolean).join(' ');
        return row('<div class="t" style="' + textStyle(t) + '">' +
            (dateLine ? '<strong style="color:' + t.title + ';">' + esc(dateLine) + '</strong><br>' : '') +
            (service ? '<strong>' + esc(service) + '</strong><br>' : '') +
            (b.speaker ? esc(b.speakerWord || 'Speaker') + ': ' + esc(b.speaker) + (b.text ? '<br>' : '') : '') +
            (b.text ? esc(b.text) : '') + (o.edit ? '<div data-edit="html">' + (b.html ? cleanHtml(b.html, t) : '<p><br></p>') + '</div>' : (b.html ? cleanHtml(b.html, t) : '')) + '</div>', '18px 18px 0') + rule(t);
      case 'event':
        return eventCard(b, t, o);
      case 'heading':
        if (!String(b.text || '').trim() && !o.edit) return '';
        return row('<h2 style="margin:0;font-family:' + t.font + ';font-size:' + (b.size === 'small' ? '18px' : '22px') + ';line-height:125%;font-weight:bold;color:' + t.title + ';text-align:' + (b.align === 'left' ? 'left' : 'center') + ';"' + (o.edit ? ' data-edit="text"' : '') + '>' + esc(b.text || '') + '</h2>', '18px 18px 0');
      case 'columns':
        return columnsBlock(b, t, o);
      case 'pictures':
        var two = (b.urls || []).map(safeUrl).filter(Boolean).slice(0, 2);
        if (!two.length) return '';
        return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' + two.map(function (u, k) {
          return '<td class="col" width="50%" valign="top" style="width:50%;padding:' + (k ? '0 0 0 9px' : '0 9px 0 0') + ';">' + image(u, (b.alts || [])[k] || '', 273, '3%') + '</td>'; }).join('') + '</tr></table>');
      case 'video':
        return videoBlock(b, t);
      case 'social':
        var icons = socialRow((o.church || {}).social, o.assetBase);
        return icons ? row(icons.replace('margin:0 auto 27px;', 'margin:0 auto;'), '18px') : '';
      case 'logo':
        if (!safeUrl(b.url)) return '';
        return row('<table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;"><tr><td><img src="' + esc(safeUrl(b.url)) + '" width="' + Math.min(+b.width || 160, 300) + '" alt="' + esc(b.alt || '') + '" style="display:block;width:' + Math.min(+b.width || 160, 300) + 'px;max-width:100%;height:auto;border:0;"></td></tr></table>', '18px');
      case 'diary':
        return diaryBlock(b, t);
      case 'text':
        return row('<div class="t" style="' + textStyle(t) + '">' + itemWords({ title: b.title, html: b.html }, t, o.edit) + '</div>', '9px 18px 18px');
      case 'picture':
        if (!safeUrl(b.url)) return '';
        var pic = image(safeUrl(b.url), b.alt, 564, 8);
        return row((safeUrl(b.link) ? '<a href="' + esc(safeUrl(b.link)) + '" target="_blank">' + pic + '</a>' : pic) + creditLine(b.credit, safeUrl(b.url), t) +
          (b.caption ? '<div class="t" style="' + textStyle(t) + 'padding:6px 0 0;">' + esc(b.caption) + '</div>' : ''));
      case 'button':
        return row(button(b, t), '18px');
      case 'notices':
        return (b.items || []).map(function (n) {
          return row('<div class="t" style="' + textStyle(t) + '">' + itemWords({ title: n.title, html: n.html }, t) + '</div>', '9px 18px 18px');
        }).join('');
      case 'meeting':
        /* A meeting from the hub's Meetings list: its name, day and time,
           and Join (the hub's meeting page: type your name and knock). */
        if (!safeUrl(b.url)) return o.preview ? row(placeholder('Pick the meeting', 90), '9px 18px 18px') : '';
        return row('<div class="t" style="' + textStyle(t) + '">' +
            '<p style="margin:0;"><strong style="color:' + t.title + ';">' + esc(b.title || 'Meeting') + '</strong></p>' +
            (meetingWhen(b) ? '<p style="margin:0 0 12px;"><strong>' + esc(meetingWhen(b)) + '</strong></p>' : '') +
            (b.text ? '<p style="margin:0 0 12px;">' + esc(b.text) + '</p>' : '') + '</div>' +
            button({ url: b.url, label: b.label || 'Join the meeting' }, t) +
            (b.zoom ? '' : '<div style="font-family:' + t.font + ';font-size:12px;line-height:140%;color:' + t.muted + ';text-align:center;padding:8px 0 0;">' + esc(KNOCK) + '</div>'), '9px 18px 18px');
      case 'divider':
        return rule(t);
      case 'spacer':
        return row('<div style="height:24px;line-height:24px;font-size:0;">&nbsp;</div>', '0');
      default:
        return '';
    }
  }

  /* ---- the top bar and the footer: always there, never blocks ------------
     The top bar: the preheader words and "View this email in your
     browser" (Val's). The footer: copyright, the church's name, address,
     charity number and office hours, its email and phone, and - in every
     e-news, whatever the blocks say - "update your preferences" and
     "unsubscribe from this list" (both the person's own link: the page
     there offers both). */
  function topBar(t, issue, opts) {
    var web = safeUrl(opts.webUrl);
    var words = esc(issue.preheader || '');
    if (!words && !web) return '';
    return '<tr><td bgcolor="' + t.topBar + '" style="padding:9px 0;background:' + t.topBar + ';">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td class="pre col" valign="top" width="60%" style="padding:9px 18px;font-family:' + t.font + ';font-size:11px;line-height:125%;color:' + t.topBarText + ';text-align:left;">' + words + '</td>' +
      '<td class="pre col prer" valign="top" width="40%" style="padding:9px 18px;font-family:' + t.font + ';font-size:11px;line-height:125%;color:' + t.topBarText + ';text-align:left;">' +
      (web ? '<a href="' + esc(web) + '" target="_blank" style="color:' + t.topBarText + ';text-decoration:underline;">View this email in your browser</a>' : '') + '</td>' +
      '</tr></table></td></tr>';
  }
  /* Social icons (a church setting): Val's are 48px circles in each
     network's colour with a white mark, 10px apart, centred. PNG pictures
     the hub serves (img/social/), never fonts or SVG, so Outlook shows them. */
  var SOCIAL = { facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', website: 'Website', email: 'Email', x: 'X', tiktok: 'TikTok', whatsapp: 'WhatsApp', linkedin: 'LinkedIn' };
  var ASSETS = 'https://esherchurch.github.io/availability-form/v2';
  function socialRow(list, base) {
    var cells = (Array.isArray(list) ? list : []).map(function (x) {
      var k = String(x && x.kind || ''); if (!SOCIAL[k]) return '';
      var u = k === 'email' ? (/^[^\s@<>"']+@[^\s@<>"']+$/.test(String(x.url || '').replace(/^mailto:/, '')) ? 'mailto:' + String(x.url).replace(/^mailto:/, '') : '') : safeUrl(x.url);
      if (!u) return '';
      return '<td style="padding:0 5px;"><a href="' + esc(u) + '" target="_blank"><img src="' + esc(String(base || ASSETS).replace(/\/+$/, '') + '/img/social/' + k + '.png') + '" width="48" height="48" alt="' + esc(SOCIAL[k]) + '" style="display:block;width:48px;height:48px;border:0;"></a></td>';
    }).filter(Boolean).slice(0, 10);
    return cells.length ? '<table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 27px;"><tr>' + cells.join('') + '</tr></table>' : '';
  }
  function footer(t, church, opts) {
    var c = church || {};
    var diary = safeUrl(c.diaryUrl);
    var top = (diary ? '<div style="padding:0 0 27px;">' + button({ url: diary, label: c.diaryLabel || 'Dates for the diary for the coming weeks' }, t) + '</div>' : '') +
      socialRow(c.social, opts.assetBase);
    var white = 'color:' + t.footerText + ';text-decoration:underline;';
    var year = (opts.year || new Date().getFullYear());
    var unsub = safeUrl(opts.unsubscribeUrl) || (opts.unsubscribeUrl === PLACEHOLDER ? PLACEHOLDER : '');
    var u = unsub === PLACEHOLDER ? PLACEHOLDER : esc(unsub);
    var parts = [
      c.name ? '<em>Copyright © ' + year + ' ' + esc(c.name) + ', All rights reserved.</em>' : '',
      [c.name && c.address ? esc(c.name) + ', ' + esc(c.address) : esc(c.address || ''), c.charityNo ? 'Registered Charity No ' + esc(c.charityNo) : ''].filter(Boolean).join('<br>'),
      c.hours ? '<strong>' + esc(c.hours) + '</strong>' : '',
      [c.email ? '<a href="mailto:' + esc(c.email) + '" style="' + white + '">' + esc(c.email) + '</a>' : '', c.phone ? esc(c.phone) : ''].filter(Boolean).join('&nbsp;&nbsp; '),
      'Want to change how you receive these emails?<br>You can <a href="' + u + '" style="' + white + '">update your preferences</a> or <a href="' + u + '" style="' + white + '">unsubscribe from this list</a>.'
    ].filter(Boolean);
    return '<tr><td class="foot" bgcolor="' + t.footer + '" style="padding:27px 18px;background:' + t.footer + ';font-family:' + t.font + ';font-size:11px;line-height:125%;color:' + t.footerText + ';text-align:left;">' +
      top + parts.join('<br><br>') + '</td></tr>';
  }
  /* The server puts each person's own link here when it sends (C-11). */
  var PLACEHOLDER = '{{unsubscribe_url}}';

  /* MEMBERS-ONLY WORDS INSIDE A BLOCK (Martin, 21 Oct: the Zoom ID and
     passcode inside a card, the private YouTube link in Sunday's words):
     <span data-members="1">. Everyone else's copy and the web version lose
     them - the words, any link they are in, and a line left empty - and
     nothing else moves. The members' copy keeps them as they are. */
  function stripMembers(html) {
    var s = String(html || ''), out = '', i = 0, re = /<(\/?)span\b([^>]*)>/gi, m, depth = 0, cut = -1;
    while ((m = re.exec(s))) {
      if (depth === 0) {
        if (!m[1] && /data-members\s*=\s*["']?1/i.test(m[2])) { out += s.slice(i, m.index); cut = m.index; depth = 1; }
      } else if (m[1]) { depth--; if (depth === 0) { i = re.lastIndex; cut = -1; } }
      else depth++;
    }
    out += cut >= 0 ? '' : s.slice(i);
    /* A link or a line with nothing left in it goes too. */
    for (var k = 0; k < 3; k++) out = out.replace(/<a\b[^>]*>(\s|&nbsp;)*<\/a>/gi, '').replace(/<(p|li|h2|h3)\b[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi, '').replace(/<(ul|ol)\b[^>]*>\s*<\/\1>/gi, '');
    return out;
  }
  /* JOINING DETAILS LEFT FOR EVERYONE (reviewing window, 22 Oct): a block
     drawn as everyone else would get it - by render(), this very code -
     with any zoom.us link, meeting ID or passcode still in it listed. The
     editor asks before a block with them is made for everyone. */
  var JOIN_RE = /zoom\.us|meeting\s*id|pass\s*(code|word)/i;
  var JOIN_WORDS = /click\s+here\s+to\s+join|join\s+(the\s+|our\s+)?(zoom\s+)?(meeting|call|prayer)|join\s+zoom|join\s+(here|now|online|us\s+online)|^\s*join\b/i;
  function textOfHtml(s) { return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
  /* The links of a card's joining lines (whatever their address - a
     Mailchimp redirect hides it): every item of a list holding the meeting
     ID or passcode, a line with joining words, a line with a link next to
     one of those. */
  function joiningLinks(html) {
    var s = String(html || ''), L = [], re = /<(p|li|div|h2|h3)\b([^>]*)>((?:(?!<(?:p|li|div|h2|h3)\b)[\s\S])*?)<\/\1>/gi, m;
    while ((m = re.exec(s))) {
      var before = s.slice(0, m.index), ul = Math.max(before.lastIndexOf('<ul'), before.lastIndexOf('<ol')), end = Math.max(before.lastIndexOf('</ul'), before.lastIndexOf('</ol'));
      var list = m[1].toLowerCase() === 'li' && ul > end ? ul : -1;
      m[3].split(/<br\s*\/?>/i).forEach(function (seg) { if (seg.trim()) L.push({ seg: seg, list: list }); });
    }
    var mark = L.map(function (l) { return JOIN_RE.test(l.seg); });
    if (mark.indexOf(true) < 0) return [];
    var lists = {}; L.forEach(function (l, i) { if (mark[i] && l.list >= 0) lists[l.list] = 1; });
    L.forEach(function (l, i) { if ((l.list >= 0 && lists[l.list]) || JOIN_WORDS.test(textOfHtml(l.seg))) mark[i] = true; });
    for (var k = 0; k < 2; k++) L.forEach(function (l, i) { if (!mark[i] && /<a\b[^>]*href/i.test(l.seg) && (mark[i - 1] || mark[i + 1])) mark[i] = true; });
    var out = [];
    L.forEach(function (l, i) { if (mark[i]) (l.seg.match(/href\s*=\s*["'][^"']+["']/gi) || []).forEach(function (a) { out.push(a.replace(/^href\s*=\s*["']|["']$/gi, '').replace(/&amp;/g, '&')); }); });
    return out;
  }
  function exposedJoining(b) {
    if (!b || typeof b !== 'object') return [];
    var one = JSON.parse(JSON.stringify(b)); delete one.members; one.hidden = false;
    var html = render({ subject: '', blocks: [one] }, { version: 'everyone', church: {} });
    var body = (html.split(/<body[^>]*>/i)[1] || html).replace(/<style[\s\S]*?<\/style>/gi, ' ');
    var text = textOfHtml(body), out = [];
    (text.match(/[^.]{0,40}(meeting\s*id|pass\s*(code|word))[^.]{0,40}/gi) || []).forEach(function (w) { out.push(w.trim()); });
    (text.match(/\S*zoom\.us\S*/gi) || []).forEach(function (w) { out.push(w); });
    (body.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || []).forEach(function (a) { var t = textOfHtml(a); if (JOIN_WORDS.test(t) || /zoom\.us/i.test(a)) out.push('the link \u201c' + t + '\u201d'); });
    joiningLinks(b.html).forEach(function (u) { if (body.indexOf(u) >= 0 || body.indexOf(u.replace(/&/g, '&amp;')) >= 0) out.push('a joining link (' + u.slice(0, 60) + ')'); });
    return out.filter(function (x, i) { return out.indexOf(x) === i; });
  }
  /* MEMBERS-ONLY WORDS, COUNTED (reviewing window, 22 Oct): for the editor's
     Check panel and the Send page, so the sender sees what everyone else
     won't get. Each block that goes to everyone with members-only words in
     it, as render() draws it for members: how many bits (a run of marked
     words, empty ones not counted) and the block's name. A whole
     members-only block isn't listed here: it is counted as a block. */
  function bitsOf(html) {
    var s = String(html || ''), re = /<(\/?)span\b([^>]*)>/gi, m, depth = 0, from = 0, n = 0;
    while ((m = re.exec(s))) {
      if (depth === 0) { if (!m[1] && /data-members\s*=\s*["']?1/i.test(m[2])) { depth = 1; from = re.lastIndex; } }
      else if (m[1]) { depth--; if (depth === 0 && textOfHtml(s.slice(from, m.index))) n++; }
      else depth++;
    }
    return n;
  }
  function blockName(b) {
    if (b.type === 'sunday') return 'Sunday';
    var t = textOfHtml(b.title) || textOfHtml((stripMembers(b.html).match(/<(p|h2|h3|li|div)\b[^>]*>([\s\S]*?)<\/\1>/i) || [])[2] || stripMembers(b.html));
    return t ? (t.length > 40 ? t.slice(0, 38).replace(/\s+\S*$/, '') + '…' : t) : '';
  }
  function membersWords(blocks) {
    var out = [];
    (blocks || []).forEach(function (b, i) {
      if (!b || typeof b !== 'object' || !keep(b, 'everyone')) return;
      var n = bitsOf(render({ subject: '', blocks: [b] }, { version: 'members', church: {} }));
      if (n) out.push({ i: i, n: n, name: blockName(b), type: b.type });
    });
    return out;
  }
  /* ---- the whole email ---------------------------------------------------- */
  function keep(b, version) {
    if (!b || typeof b !== 'object') return false;
    if (b.hidden === true) return false;
    if (membersOnly(b) && version !== 'members') return false;
    return true;
  }
  /* Members-only: a block ticked so, and a meeting unless the office
     unticked it - never a members-only room (the CMM), whatever the tick. */
  function membersOnly(b) {
    if (b.members === true) return true;
    if (b.type !== 'meeting') return false;
    return b.members !== false || MEMBERS_ONLY_ROOMS.indexOf(String(b.room || '')) >= 0;
  }

  /* opts: { version: 'members'|'everyone', church, unsubscribeUrl, webUrl,
     preview: true in the editor (placeholders shown), year } */
  function render(issue, opts) {
    issue = issue || {}; opts = opts || {};
    var version = opts.version === 'members' ? 'members' : 'everyone';
    var t = theme(issue);
    var body = (issue.blocks || []).map(function (b, i) {
      if (!keep(b, version)) return '';
      var h = styled(b, block(b, t, opts), t);
      if (version !== 'members') h = stripMembers(h);
      if (!opts.edit) return h;
      /* The editor's canvas (enews-edit.html): every block marked with its
         place, so it can be picked, typed on and moved. Never in an email. */
      return '<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-b="' + i + '" data-type="' + esc(b.type) + '"' + (membersOnly(b) ? ' data-mem="1"' : '') + '>' +
        (h || '<tr><td style="padding:14px 18px;font-family:Arial,sans-serif;font-size:14px;color:#9ca3af;text-align:center;">(' + esc(b.type) + ': nothing in it yet)</td></tr>') + '</table></td></tr>';
    }).join('');
    var pre = issue.preheader ? '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;font-size:1px;line-height:1px;color:' + t.page + ';">' + esc(issue.preheader) + '</div>' : '';
    if (opts.preview && !opts.edit) body = body.split('{{first_name}}').join('(their first name)');
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="x-apple-disable-message-reformatting"><title>' + esc(issue.subject || '') + '</title>' +
      '<!--[if mso]><style type="text/css">body,table,td,p,a,div{font-family:Arial,sans-serif !important;}</style><![endif]-->' +
      '<style type="text/css">' +
      'body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}' +
      'table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}img{-ms-interpolation-mode:bicubic;}' +
      '.t p{margin:0 0 10px;}.t,.t a{word-break:break-word;overflow-wrap:anywhere;}' +
      '@media only screen and (max-width:480px){' +
        '.wrap{width:100% !important;max-width:100% !important;}' +
        '.t,.t p,.t li{font-size:18px !important;line-height:125% !important;}' +
        '.verse{font-size:18px !important;line-height:125% !important;}.vrow{padding-top:27px !important;}' +
        '.pre,.pre a{font-size:14px !important;line-height:115% !important;}' +
        '.col{display:block !important;width:100% !important;box-sizing:border-box;}' +
        '.prer{padding-top:0 !important;text-align:center !important;}' +
        '.foot{font-size:14px !important;line-height:115% !important;}' +
        '.cimg{display:block !important;width:100% !important;padding:0 !important;}' +
        '.cimg img{width:100% !important;max-width:100% !important;}' +
        '.ctext{display:block !important;width:100% !important;padding:9px 18px 0 18px !important;box-sizing:border-box;}' +
      '}</style></head>' +
      '<body style="margin:0;padding:0;background-color:' + t.page + ';">' + pre +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + t.page + '" style="background-color:' + t.page + ';"><tr><td align="center" valign="top" style="padding:0;">' +
      '<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->' +
      '<table role="presentation" class="wrap" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + t.paper + '" style="width:100%;max-width:600px;background-color:' + t.paper + ';">' +
      topBar(t, issue, opts) + body + footer(t, opts.church, opts) +
      '</table>' +
      '<!--[if mso]></td></tr></table><![endif]-->' +
      '</td></tr></table></body></html>';
  }

  /* READY TO SEND? (Martin, 20 Oct): a new week never goes out with an
     empty top. The week's picture and verse must be filled in - or their
     blocks deliberately removed - before Schedule or a test send. */
  function readyToSend(issue) {
    var missing = [];
    (issue && issue.blocks || []).forEach(function (b) {
      if (!b || b.hidden === true) return;
      if (b.type === 'header' && !safeUrl(b.imageUrl)) missing.push('picture');
      if (b.type === 'verse' && !String(b.text || '').trim()) missing.push('verse');
      if (b.type === 'meeting' && !safeUrl(b.url)) missing.push('meeting');
    });
    /* A template's [parts to fill in] (egbc-starters.js): an email from a
       template, or a one-off email, waits until none is left. (Not the
       weekly e-news: an event's own words may have square brackets.) */
    var prompts = [];
    if (issue && (issue.kind === 'oneoff' || issue.templateId)) {
      var seen = {};
      var look = function (v) { String(v || '').replace(/<[^>]+>/g, ' ').replace(/\[([^\[\]\n]{2,80})\]/g, function (m, w) { if (!seen[w]) { seen[w] = 1; prompts.push(w); } return m; }); };
      look(issue.subject); look(issue.preheader);
      (issue.blocks || []).forEach(function (b) {
        if (!b || b.hidden === true) return;
        look(b.title); look(b.html); look(b.text); look(b.label); look(b.when); look(b.caption);
        (b.cols || []).forEach(function (c) { look(c && c.html); });
      });
      if (prompts.length) missing.push('fill');
    }
    return { ok: missing.length === 0, missing: missing, prompts: prompts };
  }

  /* ---- the automatic draft (C-9, C-18) ---------------------------------
     From plain data the page (or later the server) has read:
       { now: Date, days: 14,
         events:  calEvents documents (with id),
         sunday:  the rota service for the coming Sunday, or null,
         notices: news documents (with id),
         base:    the hub's address, for sign-up links }
     Returns blocks. Pure, so the check can ask it directly. */
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /* An event's start, as the wall-clock time in the church's own time zone.
     startLocal is "YYYY-MM-DDTHH:MM" (the London time it was typed as) or a
     number; startUtc is milliseconds. Prefer the local words when there. */
  function startOf(ev) {
    var s = ev.startLocal;
    if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
      return { y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10), hh: +s.slice(11, 13), mm: +s.slice(14, 16), ms: Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16)) };
    }
    var n = typeof ev.startUtc === 'number' ? ev.startUtc : (typeof s === 'number' ? s : NaN);
    if (isNaN(n)) return null;
    var p = londonParts(n);
    return { y: p.y, m: p.m, d: p.d, hh: p.hh, mm: p.mm, ms: Date.UTC(p.y, p.m, p.d, p.hh, p.mm) };
  }
  function londonParts(ms) {
    try {
      var f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      var o = {}; f.formatToParts(new Date(ms)).forEach(function (x) { o[x.type] = x.value; });
      return { y: +o.year, m: +o.month - 1, d: +o.day, hh: +o.hour, mm: +o.minute };
    } catch (e) { var d = new Date(ms); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() }; }
  }
  function words(st, allDay) {
    var day = DAYS[new Date(Date.UTC(st.y, st.m, st.d)).getUTCDay()];
    var w = day + ' ' + st.d + ' ' + MONTHS[st.m];
    if (allDay) return w;
    var h = st.hh % 12 || 12, ap = st.hh < 12 ? 'am' : 'pm';
    return w + ' · ' + h + (st.mm ? ':' + (st.mm < 10 ? '0' : '') + st.mm : '') + ap;
  }

  /* Which events, and how: 'public' | 'members' | null (never). */
  function eventShare(ev) {
    if (!ev || ev.status === 'cancelled' || ev.status === 'pending') return null;
    var vis = ev.visibility || 'members';
    if (vis === 'public') return 'public';
    if (vis === 'members' || vis === 'churchMembers') return 'members';
    return null;   /* 'team', 'unlisted', and anything new: never */
  }

  /* THE EVENT INVITATION, FILLED FROM A WHAT'S ON EVENT (plan G): the
     starter's blocks (egbc-starters.js 'invite') with the event's picture,
     title, write-up, day and time, place, and its Sign up button (or Find
     out more, when it takes no sign-ups). A members' event is for church
     members. What the event lacks stays a [part to fill in]; with no
     picture the empty picture block goes. Never a team's or a not-listed
     event, nor a cancelled or unconfirmed one: null. Pure. */
  function fillInvite(blocks, ev, base) {
    var share = eventShare(ev), st = ev && startOf(ev);
    if (!share || !st) return null;
    base = String(base || '').replace(/\/+$/, '');
    var title = String(ev.title || '').trim().slice(0, 140) || '[The event]';
    var when = words(st, ev.allDay === true).replace(' \u00b7 ', ', ');
    var img = safeUrl(ev.image);
    var link = ev.signupOn === true ? { label: 'Sign up here', url: base + '/signup.html?event=' + encodeURIComponent(ev.id || '') }
      : { label: 'Find out more', url: base + '/whatson.html?event=' + encodeURIComponent(ev.id || '') };
    var out = [];
    (blocks || []).forEach(function (b0) {
      var b = JSON.parse(JSON.stringify(b0));
      if (b.type === 'header') { if (!img) return; b.imageUrl = img; b.alt = title; }
      if (b.type === 'heading' && /\[The event\]/.test(b.text || '')) b.text = title;
      if (b.type === 'text') {
        var h = String(b.html || '');
        if (String(ev.description || '').trim()) h = h.replace('<p>[What it is and who it\u2019s for.]</p>', String(ev.description).slice(0, 20000));
        h = h.replace('[Day, date and time]', esc(when));
        h = ev.location ? h.replace('[Where]', esc(String(ev.location).slice(0, 200))) : h.replace('<br>[Where]', '');
        b.html = h;
      }
      if (b.type === 'button' && !safeUrl(b.url)) { b.label = link.label; b.url = link.url; }
      if (share === 'members') b.members = true;
      out.push(b);
    });
    return { blocks: out, subject: 'You\u2019re invited: ' + title, preheader: when, audience: share === 'members' ? 'members' : 'subscribers', eventId: String(ev.id || '') };
  }

  /* The coming weeks' public events for "Dates for the diary": everyone's
     events only (never members' or not-listed ones), a date and a title. */
  function diaryItems(data) {
    data = data || {};
    var now = data.now instanceof Date ? data.now : new Date(data.now || Date.now());
    var p = londonParts(now.getTime());
    var from = Date.UTC(p.y, p.m, p.d, 0, 0), to = from + (data.weeks || 6) * 7 * 86400000;
    var base = String(data.base || '').replace(/\/+$/, '');
    return (data.events || []).map(function (ev) { return { ev: ev, st: startOf(ev) }; })
      .filter(function (x) { return x.st && eventShare(x.ev) === 'public' && x.ev.source !== 'rota' && x.st.ms >= from && x.st.ms < to; })
      .sort(function (a, b) { return a.st.ms - b.st.ms; }).slice(0, 30)
      .map(function (x) {
        var d = new Date(x.st.ms);
        return { date: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }),
          title: String(x.ev.title || '').slice(0, 140), url: base && x.ev.id ? base + '/whatson.html?event=' + encodeURIComponent(x.ev.id) : '' };
      });
  }
  /* Events in a draft that still need a picture or a write-up (the office
     adds them in What's On before sending). */
  function missing(blocks) {
    return (blocks || []).filter(function (b) { return b && b.type === 'event' && !b.hidden; }).map(function (b) {
      var need = [];
      if (!safeUrl(b.imageUrl)) need.push('picture');
      if (!String(b.html || '').replace(/<[^>]+>/g, '').trim() && !String(b.text || '').trim()) need.push('write-up');
      return need.length ? { title: b.title || '(no title)', eventId: b.eventId || '', need: need } : null;
    }).filter(Boolean);
  }
  function draft(data) {
    data = data || {};
    var now = data.now instanceof Date ? data.now : new Date(data.now || Date.now());
    var p = londonParts(now.getTime());
    var from = Date.UTC(p.y, p.m, p.d, 0, 0), to = from + (data.days || 14) * 86400000;
    var base = String(data.base || '').replace(/\/+$/, '');
    var out = [];
    /* Val's top: the week's picture (the office adds it), no title. */
    out.push({ type: 'header', title: data.title || '', imageUrl: '', auto: true });
    /* Val's order: the picture, the verse, "Coming up this week", then
       Sunday, then the events. */
    out.push({ type: 'verse', text: '', ref: '' });
    out.push({ type: 'section', label: 'Coming up this week', auto: true });
    var sun = data.sunday;
    if (sun && sun.title) {
      out.push({ type: 'sunday', heading: 'This Sunday', title: sun.title, date: sun.date || '', time: sun.time || '', when: sun.when || '', speaker: sun.speaker || '', auto: true });
    }
    var evs = (data.events || []).map(function (ev) {
      var st = startOf(ev), share = eventShare(ev);
      return { ev: ev, st: st, share: share };
    }).filter(function (x) {
      if (!x.st || !x.share) return false;
      if (x.ev.source === 'rota') return false;   /* the Sunday block covers services */
      return x.st.ms >= from && x.st.ms < to;
    }).sort(function (a, b) { return a.st.ms - b.st.ms; });
    evs.forEach(function (x) {
      var ev = x.ev;
      var signup = ev.signupOn === true && base ? base + '/signup.html?event=' + encodeURIComponent(ev.id || '') : '';
      out.push({
        type: 'event', auto: true, eventId: ev.id || '', members: x.share === 'members',
        title: String(ev.title || '').slice(0, 140), kicker: (ev.labels && ev.labels[0]) || '',
        when: words(x.st, ev.allDay === true), text: '',
        /* The event's own description, with its links (C-29: never only a
           title and a date). Cleaned when it is drawn. */
        html: String(ev.description || '').slice(0, 20000),
        imageUrl: ev.image || '', alt: String(ev.title || ''),
        moreUrl: base && ev.id ? base + '/whatson.html?event=' + encodeURIComponent(ev.id) : '',
        buttonLabel: signup ? 'Sign up here' : '', buttonUrl: signup
      });
    });
    var today = p.y + '-' + (p.m < 9 ? '0' : '') + (p.m + 1) + '-' + (p.d < 10 ? '0' : '') + p.d;
    var notices = (data.notices || []).filter(function (n) {
      if (!n || !n.title) return false;
      /* Church-wide notices only: a team's notice is for that team. */
      if ((n.teams || []).length) return false;
      if (n.until && String(n.until) < today) return false;
      return true;
    }).slice(0, 6);
    if (notices.length) {
      /* Notices are written for people signed in to the hub, so they go in
         as members-only until someone ticks them for everyone. */
      out.push({ type: 'notices', auto: true, members: true, items: notices.map(function (n) { return { id: n.id || '', title: n.title, html: n.body || '' }; }) });
    }
    return out;
  }

  return {
    TEMPLATES: TEMPLATES, COLOUR_KEYS: COLOUR_KEYS, PLACEHOLDER: PLACEHOLDER,
    render: render, draft: draft, readyToSend: readyToSend, theme: theme, snippet: snippet,
    eventShare: eventShare, fillInvite: fillInvite, keep: keep, stripMembers: stripMembers, exposedJoining: exposedJoining, membersWords: membersWords, palette: palette, styleRules: styleRules, FONTS: FONTS, SIZES: SIZES, LINE_HEIGHTS: LINE_HEIGHTS, LETTER_SPACINGS: LETTER_SPACINGS, HIGHLIGHTS: HIGHLIGHTS, youtubeId: youtubeId, TINTS: TINTS, diaryItems: diaryItems, missing: missing, SOCIAL: SOCIAL, membersOnly: membersOnly, meetingFrom: meetingFrom, meetingWhen: meetingWhen, MEMBERS_ONLY_ROOMS: MEMBERS_ONLY_ROOMS, safeUrl: safeUrl, cleanHtml: cleanHtml, esc: esc
  };
});
