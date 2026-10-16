/* ===================================================================
   EGBC — the Bible, three ways (F-223, F-225; Martin, 16 Oct)
   ===================================================================

   One picker, three sources, each saved with its copyright line:
     1. FREE BIBLES ON THE HUB: ChurchShow's eleven public-domain Bibles,
        one file per book (bibles/<id>/<nn>.json, bibles/index.json), so a
        phone loads one book, not 4 MB.
     2. API.BIBLE with the church's own key: the key is kept by the server
        (privateSettings/apiBible, which no page can read); a passage comes
        through the hub function bibleFetch, with its copyright.
     3. BIBLE GATEWAY: a link only. Its text is never copied into a plan.

     EGBCBible.parse('1 Cor 13:4-7')   -> { book, ch, v1, ch2, v2 } | null
     EGBCBible.versions()              -> Promise of the free Bibles
     EGBCBible.passage(id, ref)        -> Promise of { ref, version, source,
                                          verses: [{ch, v, text}], text, copyright }
     EGBCBible.apiVersions()           -> Promise of API.Bible's list (the key's)
     EGBCBible.apiPassage(bibleId, ref, abbrev)
     EGBCBible.gatewayLink(ref, version) -> the URL
     EGBCBible.GATEWAY_VERSIONS          -> the church's usual ones
   =================================================================== */
(function (global) {
  'use strict';

  var BOOKS = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];
  /* API.Bible's book codes (USFM), in the same order. */
  var USFM = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'];
  /* Short forms people type. Anything else is matched on the start of the name. */
  var ALIAS = { gen: 'Genesis', ex: 'Exodus', exod: 'Exodus', lev: 'Leviticus', num: 'Numbers', deut: 'Deuteronomy', dt: 'Deuteronomy', josh: 'Joshua',
    judg: 'Judges', jdg: 'Judges', ps: 'Psalms', psa: 'Psalms', psalm: 'Psalms', prov: 'Proverbs', pr: 'Proverbs', eccl: 'Ecclesiastes', ecc: 'Ecclesiastes', song: 'Song of Solomon',
    songs: 'Song of Solomon', sos: 'Song of Solomon', 'song of songs': 'Song of Solomon', isa: 'Isaiah', is: 'Isaiah', jer: 'Jeremiah', lam: 'Lamentations', ezek: 'Ezekiel', eze: 'Ezekiel',
    dan: 'Daniel', hos: 'Hosea', ob: 'Obadiah', obad: 'Obadiah', jon: 'Jonah', mic: 'Micah', nah: 'Nahum', hab: 'Habakkuk', zeph: 'Zephaniah', hag: 'Haggai',
    zech: 'Zechariah', mal: 'Malachi', mt: 'Matthew', matt: 'Matthew', mk: 'Mark', mr: 'Mark', lk: 'Luke', jn: 'John', jhn: 'John', rom: 'Romans', gal: 'Galatians',
    eph: 'Ephesians', phil: 'Philippians', php: 'Philippians', col: 'Colossians', tit: 'Titus', philem: 'Philemon', phm: 'Philemon', heb: 'Hebrews', jas: 'James',
    jude: 'Jude', rev: 'Revelation', 'revelation of john': 'Revelation', cor: 'Corinthians', thess: 'Thessalonians', th: 'Thessalonians', tim: 'Timothy', pet: 'Peter', pe: 'Peter',
    sam: 'Samuel', kgs: 'Kings', ki: 'Kings', chr: 'Chronicles', ch: 'Chronicles', jo: 'John' };
  var GATEWAY_VERSIONS = ['NIVUK', 'NIV', 'NLT', 'ESVUK', 'ESV', 'NKJV', 'CSB', 'GNT', 'NRSVA', 'ICB', 'MSG', 'AMP', 'PHILLIPS'];

  function base() {
    var s = document.querySelector('script[src*="egbc-bible.js"]');
    return s ? s.getAttribute('src').replace(/egbc-bible\.js.*$/, '') : '';
  }
  function bookName(raw) {
    var s = String(raw || '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(iii|3rd|third)\s+/, '3 ').replace(/^(ii|2nd|second)\s+/, '2 ').replace(/^(i|1st|first)\s+/, '1 ').replace(/^([123])([a-z])/, '$1 $2');
    var m = s.match(/^([123]) (.+)$/), num = m ? m[1] + ' ' : '', rest = m ? m[2] : s;
    if (ALIAS[rest]) rest = ALIAS[rest].toLowerCase();
    var want = (num + rest).trim();
    var exact = BOOKS.filter(function (b) { return b.toLowerCase() === want; })[0];
    if (exact) return exact;
    var starts = BOOKS.filter(function (b) { return b.toLowerCase().indexOf(want) === 0 && (!num || b.indexOf(num) === 0); });
    return starts.length === 1 ? starts[0] : (starts.length ? starts.sort(function (a, b) { return a.length - b.length; })[0] : null);
  }
  /* "John 3:16-21", "John 3", "1 Cor 13:4-7", "I Samuel 3", "John 3:16-4:2", "Ps 23" */
  function parse(text) {
    var m = String(text || '').trim().match(/^(.+?)\s+(\d+)(?:\s*[:.]\s*(\d+))?(?:\s*[-–]\s*(\d+)(?:\s*[:.]\s*(\d+))?)?\s*$/);
    if (!m) return null;
    var book = bookName(m[1]); if (!book) return null;
    var ch = +m[2], v1 = m[3] ? +m[3] : 0, ch2 = ch, v2 = 0;
    if (m[4] && m[5]) { ch2 = +m[4]; v2 = +m[5]; }
    else if (m[4]) { if (v1) v2 = +m[4]; else { ch2 = +m[4]; } }
    if (v1 && !v2 && !m[4]) v2 = v1;
    return { book: book, ch: ch, v1: v1, ch2: ch2, v2: v2 };
  }
  function refText(p) {
    if (!p) return '';
    if (!p.v1) return p.book + ' ' + p.ch + (p.ch2 !== p.ch ? '-' + p.ch2 : '');
    return p.book + ' ' + p.ch + ':' + p.v1 + (p.ch2 !== p.ch ? '-' + p.ch2 + ':' + p.v2 : (p.v2 && p.v2 !== p.v1 ? '-' + p.v2 : ''));
  }

  var INDEX = null;
  function versions() {
    if (INDEX) return Promise.resolve(INDEX);
    return fetch(base() + 'bibles/index.json').then(function (r) { if (!r.ok) throw new Error('The Bibles could not be loaded.'); return r.json(); })
      .then(function (x) { INDEX = x; return x; });
  }
  var CACHE = {};
  function bookFile(id, file) {
    var k = id + '/' + file;
    if (!CACHE[k]) CACHE[k] = fetch(base() + 'bibles/' + id + '/' + file + '.json').then(function (r) { if (!r.ok) throw new Error('That book could not be loaded.'); return r.json(); });
    return CACHE[k];
  }
  /* A free Bible's passage. */
  function passage(id, ref) {
    var p = typeof ref === 'string' ? parse(ref) : ref;
    if (!p) return Promise.reject(new Error('That passage was not understood. Try, for example, "John 3:16-21".'));
    return versions().then(function (all) {
      var v = all.filter(function (x) { return x.id === id; })[0];
      if (!v) throw new Error('That Bible is not on the hub.');
      var bk = v.books.filter(function (b) { return b.name === p.book; })[0];
      if (!bk) throw new Error(p.book + ' is not in the ' + v.abbrev + '.');
      return bookFile(id, bk.file).then(function (chapters) {
        var out = [];
        for (var c = p.ch; c <= p.ch2; c++) {
          var verses = chapters[c - 1];
          if (!verses) { if (c === p.ch) throw new Error(p.book + ' has ' + chapters.length + ' chapters.'); break; }
          var from = (c === p.ch && p.v1) ? p.v1 : 1, to = (c === p.ch2 && p.v2) ? Math.min(p.v2, verses.length) : verses.length;
          for (var n = from; n <= to; n++) out.push({ ch: c, v: n, text: String(verses[n - 1] || '').trim() });
        }
        if (!out.length) throw new Error('No verses there.');
        return { ref: refText(p), version: v.abbrev, versionId: id, source: 'bundled', verses: out,
          text: out.map(function (x) { return x.v + ' ' + x.text; }).join(' '), copyright: v.licence };
      });
    });
  }

  /* API.Bible: through the hub's function; the key never reaches a page. */
  function call(data) { return EGBCAuth.call('bibleFetch', data).then(function (r) { return r && r.data !== undefined ? r.data : r; }); }
  function apiVersions() { return call({ action: 'versions' }).then(function (r) { return r.bibles || []; }); }
  function apiPassage(bibleId, ref, abbrev) {
    var p = typeof ref === 'string' ? parse(ref) : ref;
    if (!p) return Promise.reject(new Error('That passage was not understood. Try, for example, "John 3:16-21".'));
    var code = USFM[BOOKS.indexOf(p.book)];
    return call({ action: 'passage', bibleId: bibleId, book: code, ch: p.ch, v1: p.v1 || 1, ch2: p.ch2, v2: p.v2 || 0 }).then(function (r) {
      var verses = String(r.content || '').split(/\s*\[(\d+)\]\s*/).reduce(function (acc, part, i, arr) {
        if (i % 2 === 1) acc.push({ ch: p.ch, v: +part, text: String(arr[i + 1] || '').trim() }); return acc;
      }, []);
      return { ref: refText(p), version: abbrev || r.abbrev || bibleId, versionId: bibleId, source: 'apibible', verses: verses,
        text: verses.length ? verses.map(function (x) { return x.v + ' ' + x.text; }).join(' ') : String(r.content || '').trim(), copyright: String(r.copyright || '').trim() };
    });
  }

  /* Bible Gateway: a link, never fetched. */
  function gatewayLink(ref, version) {
    var p = typeof ref === 'string' ? parse(ref) : ref;
    return 'https://www.biblegateway.com/passage/?search=' + encodeURIComponent(p ? refText(p) : String(ref || '')) + '&version=' + encodeURIComponent(version || 'NIVUK');
  }

  global.EGBCBible = { BOOKS: BOOKS, USFM: USFM, GATEWAY_VERSIONS: GATEWAY_VERSIONS, parse: parse, refText: refText, bookName: bookName,
    versions: versions, passage: passage, apiVersions: apiVersions, apiPassage: apiPassage, gatewayLink: gatewayLink };
})(window);
