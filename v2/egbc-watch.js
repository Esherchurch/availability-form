/* ===================================================================
   EGBC — Watch: the church's YouTube, members-only services and the
   live link (events window; NEXT-BRIEF §24 item 5; F-163)
   ===================================================================

   "Listen" becomes "Listen & Watch" (still one tab). Three things, each
   built for any church - the channel and the defaults are SETTINGS
   (watchShow/settings), nothing here is EGBC's:

   (a) THE CHANNEL'S LATEST VIDEOS, from YouTube's public channel feed
       (youtube.com/feeds/videos.xml?channel_id=...), read every hour by a
       hub function (the main window's, F-163) that hands the text to
       sync() below - exactly as the sermon feed does. A video is known by
       its YouTube id, and its document is videos/yt_<id>: reading the feed
       again never makes a second copy. They play in place.
   (b) MEMBERS-ONLY FULL SERVICES: links the office adds (unlisted on
       YouTube; a private video cannot be shared this way). Kept where only
       signed-in people can read them (videos/mv_<id>).
   (c) THE LIVE SERVICE: one link the office pastes in, shown as "Watch
       live" from a time until a time; then, as the church chooses, it
       disappears or becomes "Watch again" until a second time. NEVER in a
       public page or feed: watchShow/live is readable signed in only.

   THIS FILE DECIDES; it touches no database and no network, so the
   function copies it, the pages use it, and it is tested on its own
   (screenshots/events/watch-unit.test.mjs).

   Works in the browser (window.EGBCWatch) and in Node (module.exports).
   =================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EGBCWatch = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* The church's choices, with a church that has set nothing getting
     these. EGBC's are the same: the live card is on the front of the app
     ON THE DAY of the service (Martin, 14 Oct: "when there is a streamed
     service scheduled it should go on the front page ... on that day"),
     from the start of the Sunday until 4pm (when the trimmed version goes
     up), and then disappears. */
  var DEFAULTS = { channelId: '', untilDay: 0, fromTime: '00:00', untilTime: '16:00', after: 'disappear', againDays: 7 };
  function settingsOf(s) {
    s = s || {};
    return {
      channelId: /^UC[A-Za-z0-9_-]{22}$/.test(s.channelId || '') ? s.channelId : '',
      untilDay: s.untilDay >= 0 && s.untilDay <= 6 ? +s.untilDay : DEFAULTS.untilDay,
      fromTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.fromTime || '') && s.fromTime < (/^([01]\d|2[0-3]):[0-5]\d$/.test(s.untilTime || '') ? s.untilTime : DEFAULTS.untilTime) ? s.fromTime : DEFAULTS.fromTime,
      untilTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.untilTime || '') ? s.untilTime : DEFAULTS.untilTime,
      after: s.after === 'again' ? 'again' : 'disappear',
      againDays: s.againDays >= 1 && s.againDays <= 31 ? +s.againDays : DEFAULTS.againDays
    };
  }
  function feedUrl(channelId) { return 'https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(channelId); }

  /* ---------------- a YouTube address -> its video id ----------------
     The usual ways a link is shared: watch?v=, youtu.be/, /live/,
     /embed/, /shorts/. Anything else is not a video link. */
  function videoIdFromUrl(url) {
    var u = String(url || '').trim(), m;
    if (!/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(u)) return '';
    m = u.match(/[?&]v=([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/) || u.match(/youtu\.be\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/) ||
        u.match(/\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
    return m ? m[1] : '';
  }
  /* Played in place, without YouTube's tracking cookies until it plays. */
  function embedUrl(id) { return 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1&playsinline=1'; }

  /* ---------------- the channel feed (Atom) ---------------- */
  function decode(s) {
    return String(s == null ? '' : s).replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); }).replace(/&amp;/g, '&').trim();
  }
  function tag(block, name) {
    var m = block.match(new RegExp('<' + name.replace(':', '\\:') + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name.replace(':', '\\:') + '>', 'i'));
    return m ? decode(m[1]) : '';
  }
  function attr(block, name, a) {
    var m = block.match(new RegExp('<' + name.replace(':', '\\:') + '\\s[^>]*?\\b' + a + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
    return m ? decode(m[2] != null ? m[2] : m[3]) : '';
  }
  function parseFeed(text) {
    text = String(text || '');
    var head = text.split(/<entry[\s>]/i)[0];
    var items = (text.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []).map(function (b) {
      var id = tag(b, 'yt:videoId');
      return {
        videoId: id,
        title: tag(b, 'title').slice(0, 300),
        published: tag(b, 'published').slice(0, 40),
        thumb: attr(b, 'media:thumbnail', 'url').slice(0, 500),
        description: tag(b, 'media:description').slice(0, 2000)
      };
    }).filter(function (i) { return /^[A-Za-z0-9_-]{11}$/.test(i.videoId) && i.published; });
    return { channel: { title: tag(head, 'title').slice(0, 200) }, items: items };
  }

  /* ---------------- one video, one document ---------------- */
  var FEED_FIELDS = ['title', 'published', 'thumb', 'description'];
  function idFor(videoId) { return 'yt_' + videoId; }
  function planOne(item, existing, nowIso) {
    var id = idFor(item.videoId), feed = {};
    FEED_FIELDS.forEach(function (k) { feed[k] = item[k] || ''; });
    if (!existing) return { id: id, op: 'create', data: Object.assign({}, feed, { source: 'feed', videoId: item.videoId, hidden: false, createdAt: nowIso, updatedAt: nowIso }) };
    var changed = {};
    FEED_FIELDS.forEach(function (k) { if (existing[k] !== feed[k]) changed[k] = feed[k]; });
    if (!Object.keys(changed).length) return { id: id, op: 'same', data: {} };
    changed.updatedAt = nowIso;   /* never `hidden`: the office's choice */
    return { id: id, op: 'update', data: changed };
  }
  function plan(items, existingById, nowIso) {
    var seen = {};
    return items.filter(function (i) { if (seen[i.videoId]) return false; seen[i.videoId] = 1; return true; })
      .map(function (i) { return planOne(i, existingById[idFor(i.videoId)] || null, nowIso); });
  }
  /* store: { get(id), create(id, data), update(id, data), status(data) },
     as for the sermon feed (watchShow/feedStatus). */
  function sync(store, text, now) {
    var nowIso = (now || new Date()).toISOString(), got;
    try { got = parseFeed(text); } catch (e) { got = { channel: {}, items: [] }; }
    if (!got.items.length) {
      return store.status({ lastReadAt: nowIso, ok: false, error: 'No videos could be read from the channel feed.', videos: 0 })
        .then(function () { return { created: 0, updated: 0, same: 0, videos: 0 }; });
    }
    var ids = got.items.map(function (i) { return idFor(i.videoId); });
    return Promise.all(ids.map(function (id) { return store.get(id); })).then(function (docs) {
      var existing = {}; ids.forEach(function (id, k) { if (docs[k]) existing[id] = docs[k]; });
      var steps = plan(got.items, existing, nowIso), out = { created: 0, updated: 0, same: 0, videos: steps.length };
      return steps.reduce(function (p, s) {
        return p.then(function () {
          if (s.op === 'create') { out.created++; return store.create(s.id, s.data); }
          if (s.op === 'update') { out.updated++; return store.update(s.id, s.data); }
          out.same++;
        });
      }, Promise.resolve()).then(function () {
        return store.status({ lastReadAt: nowIso, ok: true, error: '', videos: steps.length, created: out.created, updated: out.updated,
          channelTitle: (got.channel.title || '').slice(0, 200) });
      }).then(function () { return out; });
    });
  }

  /* ---------------- the live card ---------------- */
  /* London's wall clock, whatever the device's. */
  function londonParts(t) {
    var p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
      .formatToParts(t).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
  }
  /* The instant that is hh:mm in London on that London date. */
  function londonAt(y, m, d, hhmm) {
    var hm = hhmm.split(':'), h = +hm[0], mi = +hm[1];
    for (var off = -120; off <= 120; off += 60) {
      var t = new Date(Date.UTC(y, m - 1, d, h, mi) - off * 60000), p = londonParts(t);
      if (p.y === y && p.m === m && p.d === d && p.h === h && p.mi === mi) return t.getTime();
    }
    return Date.UTC(y, m - 1, d, h, mi);
  }
  /* The church's defaults for a link added now: shown ON THE DAY, from
     fromTime to untilTime, on the next untilDay (today, if untilTime is
     still to come), then disappear or "Watch again" for againDays more.
     Added on a Wednesday, it waits for Sunday; added on the Sunday morning,
     it shows at once. */
  function defaultTimes(settings, now) {
    var s = settingsOf(settings), t = (now || new Date()).getTime();
    for (var k = 0; k <= 7; k++) {
      var p = londonParts(new Date(t + k * 864e5));
      if (p.wd !== s.untilDay) continue;
      var until = londonAt(p.y, p.m, p.d, s.untilTime);
      if (until > t) return { showFrom: londonAt(p.y, p.m, p.d, s.fromTime), showUntil: until, after: s.after, againUntil: until + s.againDays * 864e5 };
    }
    return { showFrom: t, showUntil: t + 7 * 864e5, after: s.after, againUntil: t + (7 + s.againDays) * 864e5 };
  }
  /* What the card says now: 'live', 'again', or null (not shown). */
  function liveState(live, now) {
    if (!live || !videoIdFromUrl(live.url)) return null;
    var t = (now || new Date()).getTime(), from = +live.showFrom || 0, until = +live.showUntil || 0;
    if (!until || t < from) return null;
    if (t < until) return 'live';
    if (live.after === 'again' && t < (+live.againUntil || 0)) return 'again';
    return null;
  }

  return { DEFAULTS: DEFAULTS, settingsOf: settingsOf, feedUrl: feedUrl, videoIdFromUrl: videoIdFromUrl, embedUrl: embedUrl,
    parseFeed: parseFeed, idFor: idFor, plan: plan, sync: sync, FEED_FIELDS: FEED_FIELDS,
    londonParts: londonParts, londonAt: londonAt, defaultTimes: defaultTimes, liveState: liveState };
});
