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
     'classic' is what the church's readers know from Mailchimp: a grey
     page, an orange "Coming up this week" bar, teal titles, a dark
     footer. 'green' is the hub's own colours (DESIGN.md). A church's
     saved colours (enewsSettings/main.colours) are laid over either. */
  var TEMPLATES = {
    classic: {
      label: 'Classic (as the e-news looks today)',
      font: 'Helvetica,Arial,sans-serif',
      page: '#dee0e2', paper: '#ffffff', text: '#202020', muted: '#555555',
      title: '#008080', link: '#17a809', bar: '#fe7e07', barText: '#fffafa',
      button: '#07a47d', buttonText: '#ffffff', radius: 19,
      verse: '#202020', verseBg: '#ffffff',
      footer: '#202020', footerText: '#cccccc', shade: '#0a191a'
    },
    green: {
      label: 'Green (the hub’s colours)',
      font: 'Arial,Helvetica,sans-serif',
      page: '#eaf2f2', paper: '#ffffff', text: '#1e3a3a', muted: '#5b6b6b',
      title: '#2a4a4b', link: '#3d6263', bar: '#3d6263', barText: '#ffffff',
      button: '#3d6263', buttonText: '#ffffff', radius: 9,
      verse: '#2a4a4b', verseBg: '#eef5f4',
      footer: '#3d6263', footerText: '#c8dede', shade: '#0a191a'
    }
  };
  var COLOUR_KEYS = ['page', 'paper', 'text', 'muted', 'title', 'link', 'bar', 'barText', 'button', 'buttonText', 'verse', 'verseBg', 'footer', 'footerText'];
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
    }
  };

  /* ---- one block ------------------------------------------------------- */
  var W = 560;   /* the inside width of the 600px column */

  function pad(inner, extra) { return '<tr><td style="padding:' + (extra || '0 20px 18px') + ';">' + inner + '</td></tr>'; }

  function button(b, t) {
    var href = safeUrl(b.url); if (!href || !b.label) return '';
    return '<table border="0" cellspacing="0" cellpadding="0" style="margin:6px 0 0;"><tr>' +
      '<td align="center" bgcolor="' + t.button + '" style="border-radius:' + t.radius + 'px;">' +
      '<a href="' + esc(href) + '" target="_blank" style="display:inline-block;padding:11px 22px;font-family:' + t.font + ';font-size:15px;font-weight:bold;color:' + t.buttonText + ';text-decoration:none;border-radius:' + t.radius + 'px;">' + esc(b.label) + '</a>' +
      '</td></tr></table>';
  }

  /* THE EVENT CARD (C-8): the words are real text on the photo, so they
     can be read with pictures switched off, and the card follows What's
     On. The photo is the cell's background; old Outlook gets the same
     picture through VML; with pictures off, a dark colour shows and the
     words stay readable. */
  function eventCard(b, t) {
    var img = safeUrl(b.imageUrl);
    var words =
      (b.kicker ? '<div style="font-size:13px;font-weight:bold;opacity:.92;margin:0 0 2px;">' + esc(b.kicker) + '</div>' : '') +
      '<div style="font-size:24px;line-height:1.15;font-weight:bold;margin:0 0 6px;">' + esc(b.title) + '</div>' +
      (b.when ? '<div style="font-size:15px;margin:0 0 4px;">' + esc(b.when) + '</div>' : '') +
      (b.text ? '<div style="font-size:14px;margin:4px 0 0;opacity:.95;">' + esc(b.text) + '</div>' : '');
    var btn = (safeUrl(b.buttonUrl) && b.buttonLabel)
      ? '<table border="0" cellspacing="0" cellpadding="0" style="margin:12px 0 0;"><tr><td bgcolor="#ffffff" style="border-radius:8px;">' +
        '<a href="' + esc(safeUrl(b.buttonUrl)) + '" target="_blank" style="display:inline-block;padding:10px 18px;font-family:' + t.font + ';font-size:15px;font-weight:bold;color:' + t.title + ';text-decoration:none;border-radius:8px;">' + esc(b.buttonLabel) + '</a></td></tr></table>'
      : '';
    var style = b.style || 'shade';
    if (style === 'side' || !img) {
      /* The Mailchimp layout: picture left, words right; stacks on a phone. */
      var left = img ? '<td width="176" valign="top" class="stack" style="padding:0 16px 0 0;"><img src="' + esc(img) + '" width="176" alt="' + esc(b.alt || b.title) + '" style="display:block;width:176px;max-width:100%;height:auto;border:0;border-radius:8px;"></td>' : '';
      return pad('<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' + left +
        '<td valign="top" class="stack" style="font-family:' + t.font + ';color:' + t.text + ';">' +
        words.replace('font-size:24px', 'font-size:19px;color:' + t.title).replace(/opacity:\.9\d?;/g, '') +
        (btn ? button({ label: b.buttonLabel, url: b.buttonUrl }, t) : '') + '</td></tr></table>');
    }
    if (style === 'below') {
      return pad('<img src="' + esc(img) + '" width="' + W + '" alt="' + esc(b.alt || b.title) + '" style="display:block;width:100%;max-width:' + W + 'px;height:auto;border:0;border-radius:10px;">' +
        '<div style="font-family:' + t.font + ';color:' + t.text + ';padding:10px 2px 0;">' +
        words.replace('font-size:24px', 'font-size:20px;color:' + t.title).replace(/opacity:\.9\d?;/g, '') +
        (btn ? button({ label: b.buttonLabel, url: b.buttonUrl }, t) : '') + '</div>');
    }
    var h = 470;
    return pad(
      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:12px;overflow:hidden;"><tr>' +
      '<td background="' + esc(img) + '" bgcolor="' + t.shade + '" valign="bottom" height="' + h + '" style="background-image:url(\'' + esc(img) + '\');background-size:cover;background-position:center;height:' + h + 'px;border-radius:12px;">' +
      '<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:' + W + 'px;height:' + h + 'px;"><v:fill type="frame" src="' + esc(img) + '" color="' + t.shade + '" /><v:textbox inset="0,0,0,0"><![endif]-->' +
      '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="200" style="font-size:0;line-height:0;">&nbsp;</td></tr>' +
      '<tr><td bgcolor="' + t.shade + '" style="background-color:rgba(10,25,26,.78);padding:16px 18px 18px;font-family:' + t.font + ';color:#ffffff;">' +
      words + btn + '</td></tr></table>' +
      '<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->' +
      '</td></tr></table>');
  }

  function block(b, t) {
    switch (b.type) {
      case 'header':
        return (safeUrl(b.imageUrl)
          ? '<tr><td style="padding:0;">' + (safeUrl(b.link) ? '<a href="' + esc(safeUrl(b.link)) + '">' : '') +
            '<img src="' + esc(safeUrl(b.imageUrl)) + '" width="600" alt="' + esc(b.alt || b.title || '') + '" style="display:block;width:100%;max-width:600px;height:auto;border:0;">' +
            (safeUrl(b.link) ? '</a>' : '') + '</td></tr>' : '') +
          (b.title ? pad('<h1 style="margin:0;font-family:' + t.font + ';font-size:26px;line-height:1.2;color:' + t.title + ';">' + esc(b.title) + '</h1>', '18px 20px 14px') : '');
      case 'section':
        return pad('<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="' + t.bar + '" style="padding:12px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:' + t.barText + ';text-align:center;">' + esc(b.label) + '</td></tr></table>', '4px 20px 18px');
      case 'text':
        return pad('<div style="font-family:' + t.font + ';font-size:15px;line-height:1.5;color:' + t.text + ';">' +
          (b.title ? '<div style="font-size:18px;font-weight:bold;color:' + t.title + ';margin:0 0 6px;">' + esc(b.title) + '</div>' : '') +
          cleanHtml(b.html, t) + '</div>');
      case 'sunday':
        return pad('<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="' + t.verseBg + '" style="padding:14px 16px;border-radius:10px;font-family:' + t.font + ';color:' + t.text + ';">' +
          '<div style="font-size:13px;font-weight:bold;color:' + t.muted + ';margin:0 0 2px;">' + esc(b.heading || 'This Sunday') + '</div>' +
          '<div style="font-size:19px;font-weight:bold;color:' + t.title + ';">' + esc(b.title) + '</div>' +
          (b.when ? '<div style="font-size:15px;margin:2px 0 0;">' + esc(b.when) + '</div>' : '') +
          (b.speaker ? '<div style="font-size:15px;margin:2px 0 0;">' + esc(b.speakerWord || 'Speaker') + ': ' + esc(b.speaker) + '</div>' : '') +
          (b.text ? '<div style="font-size:14px;margin:6px 0 0;">' + esc(b.text) + '</div>' : '') +
          '</td></tr></table>');
      case 'event':
        return eventCard(b, t);
      case 'picture':
        if (!safeUrl(b.url)) return '';
        var pic = '<img src="' + esc(safeUrl(b.url)) + '" width="' + W + '" alt="' + esc(b.alt || '') + '" style="display:block;width:100%;max-width:' + W + 'px;height:auto;border:0;border-radius:10px;">';
        return pad((safeUrl(b.link) ? '<a href="' + esc(safeUrl(b.link)) + '">' + pic + '</a>' : pic) +
          (b.caption ? '<div style="font-family:' + t.font + ';font-size:14px;color:' + t.muted + ';padding:6px 2px 0;">' + esc(b.caption) + '</div>' : ''));
      case 'button':
        return pad('<div align="center">' + button(b, t) + '</div>');
      case 'verse':
        /* Drafted empty for Val to fill; an empty one is not drawn at all. */
        if (!String(b.text || '').trim()) return '';
        return pad('<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="' + t.verseBg + '" align="center" style="padding:16px 18px;border-radius:10px;font-family:' + t.font + ';font-size:18px;line-height:1.45;font-weight:bold;color:' + t.verse + ';text-align:center;">' +
          '“' + esc(b.text) + '”' + (b.ref ? '<div style="font-size:14px;font-weight:normal;margin:6px 0 0;">' + esc(b.ref) + '</div>' : '') +
          '</td></tr></table>');
      case 'notices':
        return (b.items || []).map(function (n) {
          return pad('<div style="font-family:' + t.font + ';font-size:15px;line-height:1.5;color:' + t.text + ';">' +
            '<div style="font-size:17px;font-weight:bold;color:' + t.title + ';margin:0 0 4px;">' + esc(n.title) + '</div>' + cleanHtml(n.html, t) + '</div>');
        }).join('');
      case 'divider':
        return pad(snippet.divider(), '0 20px');
      case 'spacer':
        return pad(snippet.spacer(), '0');
      default:
        return '';
    }
  }

  /* ---- the footer: always there, never a block (C-10, C-11) ------------
     The church's name, address and charity number, the web version, and
     the unsubscribe link - in every e-news, whatever the blocks say. */
  function footer(t, church, opts) {
    var c = church || {};
    var lines = [
      c.name ? '<b>' + esc(c.name) + '</b>' : '',
      c.address ? esc(c.address) : '',
      c.charityNo ? 'Registered charity no ' + esc(c.charityNo) : '',
      [c.email ? '<a href="mailto:' + esc(c.email) + '" style="color:' + t.footerText + ';">' + esc(c.email) + '</a>' : '', c.phone ? esc(c.phone) : ''].filter(Boolean).join(' &middot; '),
      c.hours ? esc(c.hours) : ''
    ].filter(Boolean);
    var unsub = safeUrl(opts.unsubscribeUrl) || (opts.unsubscribeUrl === PLACEHOLDER ? PLACEHOLDER : '');
    var web = safeUrl(opts.webUrl);
    return '<tr><td bgcolor="' + t.footer + '" style="padding:22px 20px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:' + t.footerText + ';text-align:center;">' +
      lines.join('<br>') +
      '<div style="margin:12px 0 0;">' +
      (web ? '<a href="' + esc(web) + '" style="color:' + t.footerText + ';">View this e-news in your browser</a> &middot; ' : '') +
      '<a href="' + (unsub === PLACEHOLDER ? PLACEHOLDER : esc(unsub)) + '" style="color:' + t.footerText + ';">Unsubscribe</a>' +
      '</div></td></tr>';
  }
  /* The server puts each person's own link here when it sends (C-11). */
  var PLACEHOLDER = '{{unsubscribe_url}}';

  /* ---- the whole email ------------------------------------------------- */
  function keep(b, version) {
    if (!b || typeof b !== 'object') return false;
    if (b.hidden === true) return false;
    if (b.members === true && version !== 'members') return false;
    return true;
  }

  function render(issue, opts) {
    issue = issue || {}; opts = opts || {};
    var version = opts.version === 'members' ? 'members' : 'everyone';
    var t = theme(issue);
    var body = (issue.blocks || []).filter(function (b) { return keep(b, version); })
      .map(function (b) { return block(b, t); }).join('');
    var pre = issue.preheader ? '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;font-size:1px;line-height:1px;">' + esc(issue.preheader) + '</div>' : '';
    return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(issue.subject || '') + '</title>' +
      '<style type="text/css">img{max-width:100%!important;height:auto!important;}' +
      '@media only screen and (max-width:620px){.container{width:100%!important;}.stack{display:block!important;width:100%!important;padding:0 0 10px!important;}.stack img{width:100%!important;}}</style>' +
      '</head><body style="margin:0;padding:0;background-color:' + t.page + ';-webkit-text-size-adjust:100%;">' + pre +
      '<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + t.page + '"><tr><td align="center" style="padding:16px 8px;">' +
      '<table class="container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="' + t.paper + '" style="width:100%;max-width:600px;background:' + t.paper + ';">' +
      body + footer(t, opts.church, opts) +
      '</table></td></tr></table></body></html>';
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
    out.push({ type: 'header', title: data.title || ('Weekly news · ' + p.d + ' ' + MONTHS[p.m]), imageUrl: '', auto: true });
    var sun = data.sunday;
    if (sun && sun.title) {
      out.push({ type: 'sunday', heading: 'This Sunday', title: sun.title, when: sun.when || '', speaker: sun.speaker || '', auto: true });
    }
    out.push({ type: 'verse', text: '', ref: '' });
    var evs = (data.events || []).map(function (ev) {
      var st = startOf(ev), share = eventShare(ev);
      return { ev: ev, st: st, share: share };
    }).filter(function (x) {
      if (!x.st || !x.share) return false;
      if (x.ev.source === 'rota') return false;   /* the Sunday block covers services */
      return x.st.ms >= from && x.st.ms < to;
    }).sort(function (a, b) { return a.st.ms - b.st.ms; });
    if (evs.length) out.push({ type: 'section', label: 'Coming up', auto: true });
    evs.forEach(function (x) {
      var ev = x.ev;
      var signup = ev.signupOn === true && base ? base + '/signup.html?event=' + encodeURIComponent(ev.id || '') : '';
      out.push({
        type: 'event', auto: true, eventId: ev.id || '', members: x.share === 'members',
        title: String(ev.title || '').slice(0, 140), kicker: (ev.labels && ev.labels[0]) || '',
        when: words(x.st, ev.allDay === true), text: '',
        imageUrl: ev.image || '', alt: String(ev.title || ''),
        buttonLabel: signup ? 'Sign up' : '', buttonUrl: signup,
        style: ev.image ? 'shade' : 'side'
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
    render: render, draft: draft, theme: theme, snippet: snippet,
    eventShare: eventShare, keep: keep, safeUrl: safeUrl, cleanHtml: cleanHtml, esc: esc
  };
});
