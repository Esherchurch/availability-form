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
  var KEEP = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, A: 1, UL: 1, OL: 1, LI: 1, H2: 1, H3: 1, BLOCKQUOTE: 1 };
  function cleanHtml(html, t) {
    var out = String(html == null ? '' : html)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<\s*(\/?)\s*([a-z0-9]+)([^>]*)>/gi, function (m, close, tag, attrs) {
        var T = tag.toUpperCase();
        if (T === 'IMG') return '';
        if (!KEEP[T]) return '';
        if (close) return '</' + T.toLowerCase() + '>';
        if (T === 'A') {
          var h = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
          var href = safeUrl(h ? (h[2] || h[3] || h[4] || '') .replace(/&amp;/g, '&') : '');
          return href ? '<a href="' + esc(href) + '" style="color:' + t.link + ';text-decoration:underline;">' : '<a>';
        }
        if (T === 'P') return '<p style="margin:0 0 12px;">';
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
      'style="display:block;width:100%;max-width:' + w + 'px;height:auto;border:0;outline:none;text-decoration:none;' + (radius ? 'border-radius:' + radius + 'px;' : '') + '">';
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
  function itemWords(b, t) {
    var head = [b.title, b.when].filter(Boolean).join(' – ');
    var signup = safeUrl(b.buttonUrl) && b.buttonLabel ? '<p style="margin:0 0 10px;">' + link(safeUrl(b.buttonUrl), esc(b.buttonLabel), t, true) + '</p>' : '';
    return (head ? '<p style="margin:0;"><strong style="color:' + t.title + ';">' + esc(head) + '</strong></p>' : '') +
      (b.html ? cleanHtml(b.html, t) : '') + (b.text ? '<p style="margin:0 0 10px;">' + esc(b.text) + '</p>' : '') + signup;
  }

  /* THE EVENT CARD, Val's: picture left (176px) and words right on a
     computer; picture full width above the words on a phone. With no
     picture, the words alone, full width. */
  function eventCard(b, t) {
    var img = safeUrl(b.imageUrl);
    var words = itemWords(b, t);
    if (!img) return row('<div class="t" style="' + textStyle(t) + '">' + words + '</div>', '9px 18px 18px');
    return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
      '<td class="cimg" width="176" valign="top" style="width:176px;padding:0 36px 0 0;">' + image(img, b.alt || b.title, 176, 8) + '</td>' +
      '<td class="ctext t" valign="top" style="' + textStyle(t).replace('font-size:15px', 'font-size:14px') + 'padding:0;">' + words + '</td>' +
      '</tr></table>', '9px 18px 18px');
  }

  function block(b, t, o) {
    switch (b.type) {
      case 'header':
        /* Val's hero: the week's picture, full width, no margin. */
        return (safeUrl(b.imageUrl)
          ? row((safeUrl(b.link) ? '<a href="' + esc(safeUrl(b.link)) + '" target="_blank">' : '') + image(safeUrl(b.imageUrl), b.alt || b.title, 600) + (safeUrl(b.link) ? '</a>' : ''), '9px 0 0')
          : (o.preview ? row(placeholder('Add this week’s picture', 220), '9px 18px') : '')) +
          (b.title ? row('<h1 style="margin:0;font-family:' + t.font + ';font-size:22px;line-height:125%;font-weight:bold;color:' + t.title + ';text-align:center;">' + esc(b.title) + '</h1>', '18px 18px 0') : '');
      case 'verse':
        /* Val's verse: bold, centred, the reference and version after it. */
        if (!String(b.text || '').trim()) return o.preview ? row(placeholder('Add this week’s verse', 90), '18px 18px 9px') : '';
        var ref = [b.ref, b.version].filter(Boolean).join(' ');
        return row('<div class="verse" style="font-family:' + t.font + ';font-size:18px;line-height:175%;font-weight:bold;color:' + t.verse + ';text-align:center;">' +
            esc(String(b.text).trim()) + (ref ? ' (' + esc(ref) + ')' : '') + '</div>' +
            (b.copyright ? '<div style="font-family:' + t.font + ';font-size:11px;line-height:140%;color:' + t.muted + ';text-align:center;padding:6px 0 0;">' + esc(b.copyright) + '</div>' : ''),
          '18px 18px 9px');
      case 'section':
        return row('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="' + t.bar + '" ' +
          'style="padding:12px 18px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;line-height:100%;color:' + t.barText + ';text-align:center;">' + esc(b.label) + '</td></tr></table>');
      case 'sunday':
        /* Val's Sunday: the date in teal, the service in bold, a line about it. */
        var dateLine = b.date || b.when || '';
        var service = [b.time, b.title].filter(Boolean).join(' ');
        return row('<div class="t" style="' + textStyle(t) + '">' +
            (dateLine ? '<strong style="color:' + t.title + ';">' + esc(dateLine) + '</strong><br>' : '') +
            (service ? '<strong>' + esc(service) + '</strong><br>' : '') +
            (b.speaker ? esc(b.speakerWord || 'Speaker') + ': ' + esc(b.speaker) + (b.text ? '<br>' : '') : '') +
            (b.text ? esc(b.text) : '') + (b.html ? cleanHtml(b.html, t) : '') + '</div>', '18px 18px 0') + rule(t);
      case 'event':
        return eventCard(b, t);
      case 'text':
        return row('<div class="t" style="' + textStyle(t) + '">' + itemWords({ title: b.title, html: b.html }, t) + '</div>', '9px 18px 18px');
      case 'picture':
        if (!safeUrl(b.url)) return '';
        var pic = image(safeUrl(b.url), b.alt, 564, 8);
        return row((safeUrl(b.link) ? '<a href="' + esc(safeUrl(b.link)) + '" target="_blank">' + pic + '</a>' : pic) +
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
            '<div style="font-family:' + t.font + ';font-size:12px;line-height:140%;color:' + t.muted + ';text-align:center;padding:8px 0 0;">' + esc(KNOCK) + '</div>', '9px 18px 18px');
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
  function footer(t, church, opts) {
    var c = church || {};
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
      parts.join('<br><br>') + '</td></tr>';
  }
  /* The server puts each person's own link here when it sends (C-11). */
  var PLACEHOLDER = '{{unsubscribe_url}}';

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
    var body = (issue.blocks || []).filter(function (b) { return keep(b, version); })
      .map(function (b) { return block(b, t, opts); }).join('');
    var pre = issue.preheader ? '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;font-size:1px;line-height:1px;color:' + t.page + ';">' + esc(issue.preheader) + '</div>' : '';
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
        '.verse{font-size:18px !important;line-height:125% !important;}' +
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
    return { ok: missing.length === 0, missing: missing };
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
    eventShare: eventShare, keep: keep, membersOnly: membersOnly, meetingFrom: meetingFrom, meetingWhen: meetingWhen, MEMBERS_ONLY_ROOMS: MEMBERS_ONLY_ROOMS, safeUrl: safeUrl, cleanHtml: cleanHtml, esc: esc
  };
});
