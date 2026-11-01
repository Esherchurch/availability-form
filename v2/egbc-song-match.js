/* ===================================================================
   READING A MUSIC FILE'S NAME: its song, key and kind of sheet
   ===================================================================
   The music uploaders (batchupload.html, music-uploader.html and the
   training copy) read names like "No One Like The Lord (We Crown You)-
   chords-Em.pdf". One reading for all three, so a fix is made once.

     EGBCSongMatch.KEYS                 the keys the uploaders offer
     EGBCSongMatch.detectKey(name, keys?) -> "Em", or '' when not sure
     EGBCSongMatch.detectType(name)     -> "Chord Sheet", "Lead Sheet"... or ''
     EGBCSongMatch.songTitle(name)      -> "No One Like The Lord (We Crown You)"
     EGBCSongMatch.groupOf(name)        -> the same song's files share it
     EGBCSongMatch.getMatches(title, songs) -> the five closest [{ song, score }]
     EGBCSongMatch.autoMatch(title, matches) -> a song only when truly close

   A key is read only from the end of the name, or after "in"/"key"; never
   from a letter inside a word. No sure key is '' (the row asks for one).
   =================================================================== */
(function (global) {
  'use strict';

  var KEYS = ['C', 'Cm', 'C#', 'C#m', 'Db', 'Dbm', 'D', 'Dm', 'Eb', 'Ebm', 'E', 'Em', 'F', 'Fm', 'F#', 'F#m',
    'Gb', 'Gbm', 'G', 'Gm', 'Ab', 'Abm', 'A', 'Am', 'Bb', 'Bbm', 'B', 'Bm'];
  /* The words that say what kind of sheet a file is, not the song. */
  var KIND_WORDS = /\b(chords?|lead|lyrics?|bass|tabs?|sheets?)\b/gi;

  /* "My Lighthouse-chords-E.pdf" -> "My Lighthouse chords E": hyphens and
     underscores are spaces before anything is read. */
  function base(name) {
    return String(name || '').replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /* "c#m" -> "C#m", "ab" -> "Ab": as the list spells a key, or ''. */
  function keyOf(token, keys) {
    var t = String(token || '');
    if (!/^[a-g][#b]?m?$/i.test(t)) return '';
    var k = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    return (keys || KEYS).indexOf(k) !== -1 ? k : '';
  }

  /**
   * The key a file's name gives: its last word, or the word after "in" or
   * "key". '' when there is none it is sure of.
   * @param {string} name a file name @param {string[]} [keys] the keys offered
   * @returns {string}
   */
  function detectKey(name, keys) {
    var words = base(name).split(' ');
    var last = keyOf(words[words.length - 1], keys);
    if (last) return last;
    for (var i = 0; i < words.length - 1; i++) {
      if (/^(in|key)$/i.test(words[i])) { var k = keyOf(words[i + 1], keys); if (k) return k; }
    }
    return '';
  }

  /** The kind of sheet a name says, or ''. @param {string} name @returns {string} */
  function detectType(name) {
    var n = base(name).toLowerCase();
    if (/\bchords?\b/.test(n)) return 'Chord Sheet';
    if (/\blead\b/.test(n)) return 'Lead Sheet';
    if (/\blyrics?\b/.test(n)) return 'Lyrics';
    if (/\bbass\b|\btabs?\b/.test(n)) return 'Bass Tabs';
    return '';
  }

  /**
   * The song's title from a file name, in Title Case: the key and the kind
   * of sheet taken off, brackets and accents kept.
   * @param {string} name @returns {string}
   */
  function songTitle(name) {
    var words = base(name).split(' ');
    if (keyOf(words[words.length - 1])) words.pop();
    var t = words.join(' ')
      .replace(/\b(in|key)\s+[a-g][#b]?m?\b/gi, ' ')
      .replace(KIND_WORDS, ' ')
      .replace(/\s+/g, ' ').trim();
    return t.toLowerCase().replace(/(^|[\s(])(\p{L})/gu, function (m, before, ch) { return before + ch.toUpperCase(); });
  }

  /* A title's words for matching: lower case, no accents or punctuation. */
  function words(title, keepBrackets) {
    var t = String(title || '');
    if (!keepBrackets) t = t.replace(/\([^)]*\)/g, ' ');
    return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ')
      .split(' ').filter(Boolean);
  }

  /** The files of one song share this (lead and chords together). @param {string} name @returns {string} */
  function groupOf(name) { return words(songTitle(name), true).join(' '); }

  /**
   * The five library songs closest to a title: score is the share of the
   * song's own words found in the title; fit, the share of the title's words
   * (brackets aside) found in the song, settles a score shared.
   * @param {string} title @param {{ title: string }[]} songs
   * @returns {{ song: Object, score: number, fit: number }[]}
   */
  function getMatches(title, songs) {
    var mine = words(title, true), main = words(title);
    return (songs || []).map(function (s) {
      var theirs = words(s.title, true);
      var found = theirs.filter(function (w) { return mine.indexOf(w) !== -1; }).length;
      var fit = main.length ? main.filter(function (w) { return theirs.indexOf(w) !== -1; }).length / main.length : 0;
      return { song: s, score: theirs.length ? found / theirs.length : 0, fit: fit };
    }).filter(function (m) { return m.score > 0; })
      .sort(function (a, b) { return b.score - a.score || b.fit - a.fit; }).slice(0, 5);
  }

  /**
   * The song to choose without asking: only when every one of its words is
   * in the title, most of the title's own words are in it, and no other
   * song scores the same. Otherwise null, and the person chooses.
   * @param {string} title @param {{ song: Object, score: number }[]} matches
   * @returns {Object|null}
   */
  function autoMatch(title, matches) {
    var top = matches && matches[0];
    if (!top || top.score < 1 || top.fit < 0.75) return null;
    var next = matches[1];
    if (next && next.score === top.score && next.fit === top.fit) return null;
    return top.song;
  }

  global.EGBCSongMatch = { KEYS: KEYS, detectKey: detectKey, detectType: detectType, songTitle: songTitle,
    groupOf: groupOf, getMatches: getMatches, autoMatch: autoMatch };
})(typeof window !== 'undefined' ? window : globalThis);
