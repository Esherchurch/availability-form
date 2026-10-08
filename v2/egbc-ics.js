/* ===================================================================
   EGBC — one calendar-file writer
   ===================================================================

   An .ics is three things done right: escaping, line folding and UTC
   stamps. Getting any of them wrong produces a file that imports into
   Google Calendar and silently drops the description, which is why this
   is one file rather than a few lines copied into each page.

   There were already three hand-rolled copies in the repo when this was
   written (birthday.html, Planner.html, worshiphubapp.html). They are
   left alone for now - see FINDINGS-events.md - but nothing new should
   add a fourth. Use this.

     EGBCICS.build({ uid, title, description, location, start, end, allDay, url })
     EGBCICS.download(filename, text)
     EGBCICS.base64(text)          // for the email function's attachments

   `start` and `end` take a Date, a number of milliseconds, or an ISO
   string in local time ("2026-12-20T18:00").
   =================================================================== */

(function (global) {
  'use strict';

  function toDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(v);
    if (typeof v === 'string' && v) return new Date(v);
    return null;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* UTC stamp: 20261220T180000Z */
  function stamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
           pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  /* All-day events are dates, not times, and the end date is exclusive. */
  function dayStamp(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  /* RFC 5545: backslash, semicolon and comma are escaped, and a newline
     becomes a literal \n. Miss the comma and half a description vanishes. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  /* Strip the formatting out of a rich-text description - a calendar
     entry is plain text. */
  function plain(html) {
    if (!html) return '';
    var d = document.createElement('div');
    d.innerHTML = String(html);
    return (d.textContent || '').replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* Lines longer than 75 octets must be folded, or Outlook truncates. */
  function fold(line) {
    if (line.length <= 73) return line;
    var out = line.slice(0, 73), rest = line.slice(73);
    while (rest.length) { out += '\r\n ' + rest.slice(0, 72); rest = rest.slice(72); }
    return out;
  }

  /* The church's name, from Church details (egbc-church.js) where the page
     has it; nothing about one church is written in here. */
  function church() { return (global.EGBCChurch && global.EGBCChurch.name && global.EGBCChurch.name()) || 'Church'; }
  function prodid() { return 'PRODID:-//' + church().replace(/[^A-Za-z0-9 ]/g, '') + '//Team Hub//EN'; }

  var ICS = {

    build: function (o) {
      o = o || {};
      var start = toDate(o.start), end = toDate(o.end);
      if (!end && start) end = new Date(start.getTime() + 60 * 60 * 1000);
      var lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        prodid(),
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        'UID:' + esc(o.uid || ('egbc-' + Date.now() + '@' + (global.location ? global.location.hostname : 'localhost'))),
        'DTSTAMP:' + stamp(new Date())
      ];
      if (start) {
        lines.push(o.allDay ? 'DTSTART;VALUE=DATE:' + dayStamp(start) : 'DTSTART:' + stamp(start));
        if (end) lines.push(o.allDay
          ? 'DTEND;VALUE=DATE:' + dayStamp(new Date(end.getTime() + 24 * 3600 * 1000))
          : 'DTEND:' + stamp(end));
      }
      lines.push('SUMMARY:' + esc(o.title || 'Event'));
      if (o.location) lines.push('LOCATION:' + esc(o.location));
      if (o.description) lines.push('DESCRIPTION:' + esc(plain(o.description)));
      if (o.url) lines.push('URL:' + esc(o.url));
      if (o.status) lines.push('STATUS:' + (o.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'));
      lines.push('END:VEVENT', 'END:VCALENDAR');
      return lines.map(fold).join('\r\n');
    },

    /* A whole diary in one file. A calendar people can subscribe to and
       see change needs a URL that serves this and keeps serving it -
       that is a server, and there is none here yet (FINDINGS-events.md).
       A file they download once is what can honestly be offered. */
    buildMany: function (list, name) {
      var head = [
        'BEGIN:VCALENDAR', 'VERSION:2.0',
        prodid(),
        'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'X-WR-CALNAME:' + esc(name || church())
      ].map(fold).join('\r\n');
      var bodies = (list || []).map(function (o) {
        var one = ICS.build(o);
        return one.slice(one.indexOf('BEGIN:VEVENT'), one.lastIndexOf('END:VEVENT') + 10);
      });
      return head + '\r\n' + bodies.join('\r\n') + '\r\nEND:VCALENDAR';
    },

    download: function (filename, text) {
      var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (filename || 'event') .replace(/[^a-z0-9\-_. ]/gi, '') + '.ics';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    },

    base64: function (text) {
      return btoa(unescape(encodeURIComponent(text)));
    }
  };

  global.EGBCICS = ICS;

})(window);
