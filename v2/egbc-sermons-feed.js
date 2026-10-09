/* ===================================================================
   EGBC — the sermons podcast feed (RSS), built from the hub's sermons
   (events window; F-124, F-132, the request to the main window F-133)
   ===================================================================

   ONE BUILDER, TWO USERS. The feed itself is a server function,
   podcastFeed, in codebase "hub" (Martin, A-L1), which the main window
   builds. This file is the part that turns the data into the feed. It is
   a plain function of its arguments, with no Firestore and no network, so:
   - the function copies it (or requires it) and only has to read the
     data and send what this returns;
   - sermons-admin.html uses the same file to preview the feed and to
     check it is ready before Val repoints Spotify;
   - it is tested on its own (screenshots/events/sermons-feed-unit.mjs).

   THE ONE THING THAT MUST NOT GO WRONG: Spotify knows an episode by its
   <guid>. The new feed must carry every episode of Val's show with exactly
   the guid it has now, or every one shows twice. The sermons collection
   keeps it (the rules never let it change); this file writes it as it is,
   with isPermaLink="false", and never makes one up for an imported sermon.

   Works in the browser (window.EGBCSermonsFeed) and in Node
   (module.exports), the same file.
   =================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EGBCSermonsFeed = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* ---------------- small pieces ---------------- */

  /* XML-safe text. Control characters other than tab and new line are
     not allowed in XML at all, and one in a sermon's notes would make
     every podcast app refuse the whole feed. */
  function x(s) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  /* The plain Storage address, with no token: the storage rules decide
     who reads it (anyone, once the sermon is published). A token address
     would skip the rules and keep working after a sermon is unpublished. */
  function fileUrl(bucket, path) {
    return 'https://firebasestorage.googleapis.com/v0/b/' + bucket + '/o/' + encodeURIComponent(path) + '?alt=media';
  }

  /* A sermon's date (YYYY-MM-DD) as the feed's date. One brought over
     from Val's show keeps the date and time the show already gave it, so
     nothing moves in anyone's list. */
  function pubDate(s) {
    if (s.imported && s.pubDate) return s.pubDate;
    var p = String(s.date || '').split('-');
    var d = new Date(Date.UTC(+p[0], (+p[1] || 1) - 1, +p[2] || 1, 11, 0, 0));
    return isNaN(d) ? new Date(0).toUTCString() : d.toUTCString();
  }

  function hms(sec) {
    sec = Math.max(0, Math.round(+sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* Ready to be heard: published, with its audio up and measured. */
  function listenable(s) {
    return !!(s && s.published === true && s.audioPath && s.audioSize > 0 && s.durationSec > 0 && s.guid);
  }

  /* Newest first; if two ever carried the same guid, the first one wins
     and the check below names the other. */
  function episodes(sermons) {
    var seen = {};
    return (sermons || []).filter(listenable).slice().sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date)) || String(a.title).localeCompare(String(b.title));
    }).filter(function (s) { if (seen[s.guid]) return false; seen[s.guid] = 1; return true; });
  }

  /* The words under an episode: the passage, who preached it and the
     series, then any notes. One from Val's show keeps its own words. */
  function words(s, series) {
    if (s.imported) return s.description || s.title;
    var head = [s.book ? (s.book + (s.passage ? ' ' + s.passage : '')) : '', s.speaker, series ? series.name : ''].filter(Boolean).join(' · ');
    return [head, s.description].filter(Boolean).join('\n\n') || s.title;
  }

  /* ---------------- the feed ---------------- */

  /* o: { show, series: {id: {name, artworkPath}}, sermons: [...],
          bucket, feedUrl, now: Date } */
  function buildFeed(o) {
    var show = o.show || {}, series = o.series || {}, bucket = o.bucket, list = episodes(o.sermons);
    var art = show.artworkPath ? fileUrl(bucket, show.artworkPath) : '';
    var out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">');
    out.push('<channel>');
    if (o.feedUrl) out.push('<atom:link href="' + x(o.feedUrl) + '" rel="self" type="application/rss+xml"/>');
    out.push('<title>' + x(show.title) + '</title>');
    out.push('<link>' + x(show.link || '') + '</link>');
    out.push('<language>' + x(show.language || 'en-gb') + '</language>');
    out.push('<description>' + x(show.description || show.title) + '</description>');
    out.push('<itunes:summary>' + x(show.description || show.title) + '</itunes:summary>');
    out.push('<itunes:author>' + x(show.author || show.title) + '</itunes:author>');
    out.push('<itunes:owner><itunes:name>' + x(show.ownerName || show.author || show.title) + '</itunes:name><itunes:email>' + x(show.ownerEmail || '') + '</itunes:email></itunes:owner>');
    if (art) out.push('<itunes:image href="' + x(art) + '"/>');
    if (art) out.push('<image><url>' + x(art) + '</url><title>' + x(show.title) + '</title><link>' + x(show.link || '') + '</link></image>');
    out.push('<itunes:category text="' + x(show.category || 'Religion & Spirituality') + '">' +
      (show.subcategory === '' ? '' : '<itunes:category text="' + x(show.subcategory || 'Christianity') + '"/>') + '</itunes:category>');
    out.push('<itunes:explicit>' + (show.explicit ? 'true' : 'false') + '</itunes:explicit>');
    out.push('<itunes:type>episodic</itunes:type>');
    out.push('<lastBuildDate>' + (o.now || new Date()).toUTCString() + '</lastBuildDate>');
    list.forEach(function (s) {
      var ser = s.seriesId ? series[s.seriesId] : null, w = words(s, ser);
      out.push('<item>');
      out.push('<title>' + x(s.title) + '</title>');
      out.push('<guid isPermaLink="false">' + x(s.guid) + '</guid>');
      out.push('<pubDate>' + x(pubDate(s)) + '</pubDate>');
      out.push('<description>' + x(w) + '</description>');
      out.push('<itunes:summary>' + x(w) + '</itunes:summary>');
      out.push('<enclosure url="' + x(fileUrl(bucket, s.audioPath)) + '" length="' + Math.round(s.audioSize) + '" type="' + x(s.audioType || 'audio/mpeg') + '"/>');
      out.push('<itunes:duration>' + Math.round(s.durationSec) + '</itunes:duration>');
      if (s.speaker) out.push('<itunes:author>' + x(s.speaker) + '</itunes:author>');
      if (ser && ser.artworkPath) out.push('<itunes:image href="' + x(fileUrl(bucket, ser.artworkPath)) + '"/>');
      out.push('<itunes:episodeType>full</itunes:episodeType>');
      out.push('<itunes:explicit>' + (show.explicit ? 'true' : 'false') + '</itunes:explicit>');
      out.push('</item>');
    });
    out.push('</channel>');
    out.push('</rss>');
    return out.join('\n') + '\n';
  }

  /* ---------------- ready to repoint Spotify? ---------------- */

  /* What would go wrong if Val repointed the show today. Empty lists and
     ready: true mean nothing would. */
  function checkSwitchOver(show, sermons) {
    show = show || {};
    var missingShow = [];
    if (!show.title) missingShow.push('the show\u2019s name');
    if (!show.artworkPath) missingShow.push('the artwork');
    if (!show.ownerEmail) missingShow.push('the owner email (Spotify sends its check code there)');
    if (!show.description) missingShow.push('the description');
    var live = {}, dupes = [], count = {};
    (sermons || []).forEach(function (s) { if (s && s.guid) count[s.guid] = (count[s.guid] || 0) + 1; });
    Object.keys(count).forEach(function (g) { if (count[g] > 1) dupes.push(g); });
    episodes(sermons).forEach(function (s) { live[s.guid] = 1; });
    var oldMissing = (show.oldGuids || []).filter(function (g) { return !live[g]; });
    return { ready: !missingShow.length && !oldMissing.length && !dupes.length, missingShow: missingShow, oldMissing: oldMissing, dupes: dupes,
             episodes: episodes(sermons).length };
  }

  /* ---------------- reading Val's current feed ---------------- */

  function decode(s) {
    s = String(s == null ? '' : s);
    var cd = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
    if (cd) return cd[1];
    return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); })
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function esc(n) { return n.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&'); }
  function tag(block, name) {
    var m = block.match(new RegExp('<' + esc(name) + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + esc(name) + '>', 'i'));
    return m ? decode(m[1]).trim() : '';
  }
  function attr(block, name, a) {
    var m = block.match(new RegExp('<' + esc(name) + '\\s[^>]*?\\b' + esc(a) + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
    return m ? decode(m[2] != null ? m[2] : m[3]).trim() : '';
  }
  function plain(html) {
    return decode(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/?[a-z!][^>]*>/gi, '')).replace(/\n{3,}/g, '\n\n').trim();
  }
  function seconds(d) {
    d = String(d || '').trim();
    if (/^\d+(\.\d+)?$/.test(d)) return Math.round(+d);
    var p = d.split(':').map(Number);
    if (p.some(isNaN)) return 0;
    return p.reduce(function (t, n) { return t * 60 + n; }, 0);
  }
  function ymd(pd) {
    var d = new Date(pd);
    return isNaN(d) ? '' : d.toISOString().slice(0, 10);
  }

  /* The show's details and every episode, with the guid exactly as the
     feed gives it. When an episode has no <guid>, podcast apps use its
     audio address instead, so that is what it is known by. */
  function parseOldFeed(text) {
    text = String(text || '');
    var first = text.search(/<item[\s>]/i), head = first >= 0 ? text.slice(0, first) : text;
    var cat = head.match(/<itunes:category\s+text\s*=\s*"([^"]*)"\s*>\s*<itunes:category\s+text\s*=\s*"([^"]*)"/i);
    var owner = (head.match(/<itunes:owner[\s>][\s\S]*?<\/itunes:owner>/i) || [''])[0];
    var image = (head.match(/<image>[\s\S]*?<\/image>/i) || [''])[0];
    /* The channel's own title and link, not the ones inside <image>. */
    var bare = head.replace(/<image>[\s\S]*?<\/image>/i, '');
    var show = {
      title: tag(bare, 'title'),
      description: plain(tag(bare, 'description') || tag(bare, 'itunes:summary')),
      author: tag(bare, 'itunes:author'),
      ownerName: tag(owner, 'itunes:name'),
      ownerEmail: tag(owner, 'itunes:email'),
      link: tag(bare, 'link'),
      language: tag(bare, 'language'),
      artworkUrl: attr(bare, 'itunes:image', 'href') || tag(image, 'url'),
      category: cat ? decode(cat[1]) : attr(bare, 'itunes:category', 'text'),
      subcategory: cat ? decode(cat[2]) : '',
      explicit: /^(true|yes|explicit)$/i.test(tag(bare, 'itunes:explicit'))
    };
    var items = (text.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map(function (b) {
      var audio = attr(b, 'enclosure', 'url');
      var pd = tag(b, 'pubDate');
      return {
        guid: tag(b, 'guid') || audio,
        title: tag(b, 'title') || tag(b, 'itunes:title'),
        pubDate: pd,
        date: ymd(pd),
        description: plain(tag(b, 'description') || tag(b, 'itunes:summary') || tag(b, 'content:encoded')).slice(0, 4000),
        audioUrl: audio,
        audioType: attr(b, 'enclosure', 'type'),
        audioSize: +attr(b, 'enclosure', 'length') || 0,
        durationSec: seconds(tag(b, 'itunes:duration'))
      };
    }).filter(function (i) { return i.guid; });
    return { show: show, items: items };
  }

  return { buildFeed: buildFeed, checkSwitchOver: checkSwitchOver, parseOldFeed: parseOldFeed, episodes: episodes,
           listenable: listenable, fileUrl: fileUrl, pubDate: pubDate, hms: hms, x: x };
});
