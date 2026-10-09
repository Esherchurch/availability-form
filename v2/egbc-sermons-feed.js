/* ===================================================================
   EGBC — sermons from Val's podcast feed (Spotify for Creators)
   (events window; F-124, F-132, F-138; Martin's option 3)
   ===================================================================

   MARTIN'S CHOICE (option 3): Val keeps uploading to Spotify for
   Creators, as now. The hub READS that show's public RSS feed. Nothing
   moves and Spotify is not repointed. Audio plays from the feed's own
   addresses.

   WHO READS IT: a scheduled function, sermonFeedSync, in codebase "hub"
   (the main window's; F-138). A browser cannot fetch the feed itself
   (other sites do not allow it). Every hour it fetches the address in
   sermonShow/feed and hands the text to sync() below with a small "store"
   that reads and writes the sermons collection.

   THIS FILE IS THE PART THAT DECIDES. It is a plain function of its
   arguments - no Firestore, no network - so the function copies it (or
   requires it) and the events window tests it on its own
   (screenshots/events/sermons-feed-unit.test.mjs) and against the
   emulator (sermons.test.mjs).

   THE ONE THING THAT MUST NOT GO WRONG: reading the feed again must never
   make a second copy of an episode. An episode is known by its <guid>
   (or, with none, its audio address, as podcast apps do), and its sermon
   document's id is made from that and nothing else: idForGuid(). Reading
   the same feed a hundred times leaves the same documents, written only
   where something in the feed changed.

   WHAT THE FEED OWNS AND WHAT THE HUB OWNS. The feed's fields (title,
   date, words, audio, length) are refreshed on every read. The hub's
   (series, Bible book and passage, speaker, and whether it is shown) are
   set by Val or an admin on the upload page and are NEVER touched by a
   read. A new episode arrives shown.

   Works in the browser (window.EGBCSermonsFeed) and in Node
   (module.exports), the same file.
   =================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EGBCSermonsFeed = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* The fields a read of the feed writes, and the ones it never does. */
  var FEED_FIELDS = ['title', 'description', 'date', 'pubDate', 'audioUrl', 'audioType', 'audioSize', 'durationSec', 'imageUrl'];
  var HUB_FIELDS = ['speaker', 'seriesId', 'book', 'passage', 'published'];

  /* ---------------- reading the feed ---------------- */

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
    if (!d || p.some(isNaN)) return 0;
    return p.reduce(function (t, n) { return t * 60 + n; }, 0);
  }
  function ymd(pd) {
    var d = new Date(pd);
    return isNaN(d) ? '' : d.toISOString().slice(0, 10);
  }

  /* The show and every episode, with the guid exactly as the feed gives
     it. An episode with no <guid> is known by its audio address, as
     podcast apps know it. An episode with no audio is left out. */
  function parseFeed(text) {
    text = String(text || '');
    var first = text.search(/<item[\s>]/i), head = first >= 0 ? text.slice(0, first) : text;
    var image = (head.match(/<image>[\s\S]*?<\/image>/i) || [''])[0];
    var bare = head.replace(/<image>[\s\S]*?<\/image>/i, '');
    var show = { title: tag(bare, 'title'), imageUrl: attr(bare, 'itunes:image', 'href') || tag(image, 'url'), author: tag(bare, 'itunes:author') };
    var items = (text.match(/<item[\s>][\s\S]*?<\/item>/gi) || []).map(function (b) {
      var audio = attr(b, 'enclosure', 'url'), pd = tag(b, 'pubDate');
      return {
        guid: tag(b, 'guid') || audio,
        title: (tag(b, 'title') || tag(b, 'itunes:title')).slice(0, 200),
        pubDate: pd.slice(0, 60),
        date: ymd(pd),
        description: plain(tag(b, 'description') || tag(b, 'itunes:summary') || tag(b, 'content:encoded')).slice(0, 4000),
        audioUrl: audio.slice(0, 1000),
        audioType: attr(b, 'enclosure', 'type').slice(0, 60),
        audioSize: Math.max(0, Math.round(+attr(b, 'enclosure', 'length') || 0)),
        durationSec: seconds(tag(b, 'itunes:duration')),
        imageUrl: attr(b, 'itunes:image', 'href').slice(0, 1000)
      };
    }).filter(function (i) { return i.guid && /^https?:\/\//.test(i.audioUrl) && i.date; });
    return { show: show, items: items };
  }

  /* ---------------- one episode, one document ---------------- */

  /* The sermon document's id, from the guid and nothing else: the same
     episode always lands on the same document. Base64url of the guid's
     UTF-8 bytes, so it is exact (no two guids share one) and safe as a
     Firestore id. A guid too long for an id is cut and marked; feeds do
     not have them, but it must not throw. */
  function idForGuid(guid) {
    var bytes = unescape(encodeURIComponent(String(guid)));
    var b64 = typeof btoa === 'function' ? btoa(bytes) : Buffer.from(bytes, 'binary').toString('base64');
    var id = 'feed_' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return id.length > 700 ? id.slice(0, 700) + '_long' : id;
  }

  /* What a read writes for one episode, given what is there now:
       { id, op: 'create' | 'update' | 'same', data }
     create: every field, the hub's ones empty, shown.
     update: only the feed's fields that changed - never the hub's. */
  function planOne(item, existing, nowIso) {
    var id = idForGuid(item.guid), feed = {};
    FEED_FIELDS.forEach(function (k) { feed[k] = item[k] == null ? '' : item[k]; });
    if (!existing) {
      return { id: id, op: 'create', data: Object.assign({}, feed, {
        guid: item.guid, source: 'feed', speaker: '', seriesId: '', book: '', passage: '', published: true,
        audioPath: '', feedSeenAt: nowIso, createdAt: nowIso, createdBy: 'feed', updatedAt: nowIso, updatedBy: 'feed' }) };
    }
    var changed = {};
    FEED_FIELDS.forEach(function (k) { if (existing[k] !== feed[k]) changed[k] = feed[k]; });
    if (!Object.keys(changed).length) return { id: id, op: 'same', data: {} };
    changed.feedSeenAt = nowIso; changed.updatedAt = nowIso; changed.updatedBy = 'feed';
    return { id: id, op: 'update', data: changed };
  }
  function plan(items, existingById, nowIso) {
    var seen = {};
    return items.filter(function (i) { if (seen[i.guid]) return false; seen[i.guid] = 1; return true; })
      .map(function (i) { return planOne(i, existingById[idForGuid(i.guid)] || null, nowIso); });
  }

  /* The whole read, given a store:
       store.get(id)          -> Promise of the document's data, or null
       store.create(id, data) -> Promise
       store.update(id, data) -> Promise (merges)
       store.status(data)     -> Promise (sermonShow/feedStatus)
     Resolves with { created, updated, same, episodes }. A feed that does
     not read is reported in the status and changes nothing. */
  function sync(store, text, now) {
    var nowIso = (now || new Date()).toISOString();
    var got;
    try { got = parseFeed(text); } catch (e) { got = { show: {}, items: [] }; }
    if (!got.items.length) {
      return store.status({ lastReadAt: nowIso, ok: false, error: 'No episodes could be read from the feed.', episodes: 0 })
        .then(function () { return { created: 0, updated: 0, same: 0, episodes: 0 }; });
    }
    var ids = got.items.map(function (i) { return idForGuid(i.guid); });
    return Promise.all(ids.map(function (id) { return store.get(id); })).then(function (docs) {
      var existing = {}; ids.forEach(function (id, k) { if (docs[k]) existing[id] = docs[k]; });
      var steps = plan(got.items, existing, nowIso), out = { created: 0, updated: 0, same: 0, episodes: steps.length };
      return steps.reduce(function (p, s) {
        return p.then(function () {
          if (s.op === 'create') { out.created++; return store.create(s.id, s.data); }
          if (s.op === 'update') { out.updated++; return store.update(s.id, s.data); }
          out.same++;
        });
      }, Promise.resolve()).then(function () {
        return store.status({ lastReadAt: nowIso, ok: true, error: '', episodes: steps.length, created: out.created, updated: out.updated,
          showTitle: (got.show.title || '').slice(0, 200), showImageUrl: (got.show.imageUrl || '').slice(0, 1000) });
      }).then(function () { return out; });
    });
  }

  return { parseFeed: parseFeed, idForGuid: idForGuid, plan: plan, sync: sync, FEED_FIELDS: FEED_FIELDS, HUB_FIELDS: HUB_FIELDS };
});
