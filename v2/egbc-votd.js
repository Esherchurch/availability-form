/* ===================================================================
   EGBC — the hub's own Verse of the day (FINDINGS-comms plan H; Martin,
   20 Oct: "Verse of the day, automatic, ours")
   ===================================================================

   A list of 366 well-known verses, one for each day of the year, chosen
   by the hub (a list of references copies nobody's work). The words come
   from a Bible the church may use: the BSB (public domain since 30 April
   2023), the KJV, or the church's API.Bible versions with their own
   copyright line. tests/check-votd.mjs proves every one is in the BSB.

     EGBCVotd.forDate(new Date())  -> 'John 3:16'   (London's day)
     EGBCVotd.LIST                 -> the 366 references
   Works in a page (window.EGBCVotd) and in node (module.exports).
   =================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EGBCVotd = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var LIST = [
    'Lamentations 3:22-23', 'Isaiah 43:18-19', '2 Corinthians 5:17', 'Psalm 118:24', 'Proverbs 3:5-6', 'Jeremiah 29:11', 'Joshua 1:9', 'Psalm 23:1-3', 'Philippians 4:6-7', 'Matthew 11:28-29',
    'Romans 8:28', 'Isaiah 40:31', 'John 14:27', 'Psalm 46:1', 'Matthew 6:33', 'Romans 15:13', 'Psalm 37:4', 'Hebrews 11:1', 'John 8:12', '1 John 4:19',
    'Psalm 121:1-2', 'Micah 6:8', 'Galatians 5:22-23', 'Isaiah 41:10', 'Psalm 27:1', 'Matthew 5:14-16', 'John 15:5', 'Colossians 3:23', 'Romans 12:2', 'Psalm 19:14',
    'Ephesians 2:8-9', 'Zephaniah 3:17', 'Psalm 34:8', 'John 10:10', '1 Peter 5:7', 'Isaiah 26:3', 'Hebrews 12:1-2', 'Psalm 103:1-2', 'Matthew 22:37-39', 'Romans 5:8',
    'Psalm 139:13-14', 'John 13:34-35', '1 Corinthians 13:4-5', '1 Corinthians 13:13', 'Psalm 51:10', 'Ephesians 3:20-21', 'Philippians 4:13', 'Psalm 16:11', 'John 1:5', 'Isaiah 9:6',
    'Romans 8:38-39', 'Psalm 62:1-2', 'Matthew 7:7', 'James 1:5', 'Psalm 90:12', 'Proverbs 16:3', '2 Timothy 1:7', 'Psalm 145:18', 'John 3:16', '1 John 1:9',
    'Psalm 32:8', 'Isaiah 55:8-9', 'Hebrews 13:8', 'Psalm 91:1-2', 'Matthew 28:20', 'Romans 10:9', 'Psalm 40:1-2', 'Galatians 2:20', 'Psalm 4:8', 'John 11:25',
    'Isaiah 53:5', 'Psalm 130:5', 'Mark 10:45', 'Luke 9:23', 'Philippians 2:3-4', 'Psalm 25:4-5', 'Matthew 6:19-21', 'Romans 6:23', 'Psalm 86:5', 'Joel 2:13',
    'Psalm 147:3', 'Isaiah 30:15', 'Matthew 4:4', 'John 6:35', 'Psalm 42:1-2', 'Romans 3:23-24', 'Hebrews 4:15-16', 'Psalm 31:24', 'Luke 15:20', '2 Corinthians 12:9',
    'Psalm 63:1', 'Isaiah 61:1', 'Matthew 16:24', 'John 12:24', 'Philippians 3:13-14', 'Psalm 73:26', 'Romans 12:12', 'Isaiah 52:7', 'Matthew 21:9', 'John 13:14-15',
    'Luke 23:34', 'John 19:30', 'Isaiah 53:6', 'Matthew 28:6', 'John 11:25-26', '1 Corinthians 15:55-57', 'Romans 6:4', '1 Peter 1:3', 'Luke 24:32', 'John 20:29',
    'Psalm 118:22-23', 'Revelation 21:5', 'Colossians 3:1-2', 'Psalm 30:5', 'John 21:17', 'Isaiah 40:8', 'Psalm 119:105', 'James 1:22', 'Matthew 5:3-4', 'Matthew 5:9',
    'Psalm 8:3-4', 'Genesis 1:1', 'Genesis 1:31', 'Psalm 24:1', 'Job 12:7-10', 'Psalm 104:24', 'Matthew 6:26', 'Luke 12:27-28', 'Psalm 65:9-10', 'Ecclesiastes 3:1',
    'Psalm 100:1-3', 'Psalm 95:1-2', 'Colossians 3:16', 'Ephesians 5:19-20', 'Psalm 150:6', '1 Thessalonians 5:16-18', 'Psalm 9:1-2', 'Psalm 136:1', 'Hebrews 13:15', 'Psalm 96:1-3',
    'Acts 1:8', 'Acts 2:42', 'Acts 2:46-47', 'Romans 8:26', 'John 14:16-17', 'Galatians 5:25', 'Ezekiel 36:26', '2 Corinthians 3:17', 'John 16:13', 'Romans 8:14-16',
    'Matthew 28:19-20', 'Psalm 133:1', 'Ephesians 4:2-3', 'Ephesians 4:32', 'Colossians 3:12-14', '1 Peter 4:8-10', 'Romans 12:10', 'Galatians 6:2', 'Hebrews 10:24-25', 'John 17:21',
    'Proverbs 17:17', 'Ruth 1:16', 'Psalm 68:5-6', 'Deuteronomy 31:8', 'Psalm 127:1', 'Proverbs 22:6', 'Psalm 103:13', 'Isaiah 66:13', 'Matthew 19:14', 'Mark 9:37',
    'Psalm 145:4', 'Deuteronomy 6:5-7', 'Proverbs 31:25-26', 'Psalm 71:17-18', 'Isaiah 46:4', 'Psalm 92:12-14', 'Proverbs 16:31', 'Psalm 90:1-2', 'Psalm 90:17', 'Genesis 8:22',
    'Psalm 121:7-8', 'Numbers 6:24-26', 'Psalm 4:1', 'Psalm 5:3', 'Psalm 18:2', 'Psalm 23:4', 'Psalm 23:6', 'Psalm 28:7', 'Psalm 29:11', 'Psalm 33:20-22',
    'Psalm 34:18', 'Psalm 36:5', 'Psalm 37:7', 'Psalm 46:10', 'Psalm 55:22', 'Psalm 56:3-4', 'Psalm 57:10', 'Psalm 61:1-2', 'Psalm 84:10', 'Psalm 84:11',
    'Psalm 89:1', 'Psalm 94:19', 'Psalm 107:1', 'Psalm 116:1-2', 'Psalm 119:11', 'Psalm 119:114', 'Psalm 126:5-6', 'Psalm 138:8', 'Psalm 139:23-24', 'Psalm 143:8',
    'Psalm 145:8-9', 'Psalm 146:5', 'Psalm 147:11', 'Proverbs 3:9-10', 'Proverbs 4:23', 'Proverbs 11:25', 'Proverbs 15:1', 'Proverbs 18:10', 'Proverbs 19:21', 'Proverbs 27:17',
    'Psalm 1:1-3', 'Psalm 3:3', 'Psalm 20:4', 'Psalm 27:14', 'Psalm 37:23-24', 'Psalm 48:14', 'Psalm 66:20', 'Psalm 85:10', 'Psalm 97:11', 'Psalm 113:3',
    'Isaiah 12:2', 'Isaiah 25:1', 'Isaiah 30:21', 'Isaiah 32:17', 'Isaiah 35:4', 'Isaiah 40:11', 'Isaiah 40:28-29', 'Isaiah 42:3', 'Isaiah 43:1-2', 'Isaiah 49:15-16',
    'Isaiah 54:10', 'Isaiah 55:1', 'Isaiah 55:6', 'Isaiah 58:11', 'Isaiah 60:1', 'Isaiah 64:8', 'Jeremiah 17:7-8', 'Jeremiah 31:3', 'Jeremiah 33:3', 'Ezekiel 34:16',
    'Hosea 6:3', 'Habakkuk 3:17-18', 'Zechariah 4:6', 'Malachi 3:10', 'Matthew 5:6', 'Matthew 5:44', 'Matthew 6:9-10', 'Matthew 6:34', 'Matthew 9:36', 'Matthew 10:29-31',
    'Matthew 18:20', 'Matthew 25:40', 'Mark 1:15', 'Mark 4:39-40', 'Mark 9:23-24', 'Mark 11:24', 'Mark 12:30-31', 'Luke 1:37', 'Luke 1:46-47', 'Isaiah 9:2',
    'Luke 6:31', 'Luke 6:38', 'Luke 10:41-42', 'Luke 11:9', 'Luke 18:27', 'Luke 19:10', 'John 1:14', 'John 4:14', 'John 6:37', 'John 8:31-32',
    'John 8:36', 'John 10:11', 'John 10:27-28', 'John 14:1-2', 'John 14:6', 'John 15:9', 'John 15:12-13', 'John 16:33', 'John 20:21', 'Acts 4:12',
    'Acts 16:31', 'Acts 20:35', 'Romans 1:16', 'Romans 5:1', 'Romans 5:3-5', 'Romans 8:1', 'Romans 8:31', 'Romans 12:1', 'Romans 12:9', 'Romans 12:18',
    'Romans 13:8', 'Romans 14:8', 'Romans 15:7', '1 Corinthians 2:9', '1 Corinthians 10:13', '1 Corinthians 15:58', '1 Corinthians 16:13-14', '2 Corinthians 4:16-18', '2 Corinthians 5:7', '2 Corinthians 9:7',
    'Galatians 6:9', 'Ephesians 1:3', 'Ephesians 2:10', 'Ephesians 3:16-17', 'Ephesians 6:10', 'Philippians 1:6', 'Philippians 1:21', 'Philippians 4:4-5', 'Philippians 4:8', 'Philippians 4:19',
    'Colossians 1:17', 'Colossians 2:6-7', 'Colossians 3:15', 'Colossians 4:2', '1 Thessalonians 5:11', '2 Thessalonians 3:3', '1 Timothy 4:12', '2 Timothy 3:16-17', '2 Timothy 4:7', 'Titus 3:4-5',
    'Hebrews 6:19', 'Hebrews 10:23', 'Hebrews 11:6', 'Hebrews 12:28', 'Hebrews 13:5', 'James 1:2-3', 'James 1:17', 'James 4:8', '1 Peter 2:9', '1 Peter 3:15',
    '1 Peter 5:10', '2 Peter 3:9', '1 John 3:1', '1 John 3:18', '1 John 4:7-8', '1 John 4:18', '1 John 5:14', 'Jude 1:24-25', 'Revelation 3:20', 'Revelation 21:4',
    'Isaiah 7:14', 'Micah 5:2', 'Luke 1:30-31', 'Luke 1:38', 'Matthew 1:23', 'Luke 2:7', 'Luke 2:14', 'Matthew 2:10-11', 'John 1:9', 'Luke 2:10-11',
    'Luke 2:19', 'Luke 2:29-30', 'Psalm 98:4', 'Isaiah 9:7', 'Titus 2:11', 'Psalm 121:8'
  ];
  /* London's day of the year, 1..366 (29 February is day 60 in a leap year;
     in other years that verse is simply not used). */
  function dayOfYear(d) {
    var p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(d || new Date()).forEach(function (x) { p[x.type] = +x.value; });
    var leap = (p.year % 4 === 0 && p.year % 100 !== 0) || p.year % 400 === 0;
    var start = Date.UTC(p.year, 0, 1), n = Math.round((Date.UTC(p.year, p.month - 1, p.day) - start) / 86400000) + 1;
    return (!leap && n >= 60) ? n + 1 : n;
  }
  function forDate(d) { return LIST[(dayOfYear(d) - 1) % LIST.length]; }
  return { LIST: LIST, forDate: forDate, dayOfYear: dayOfYear };
});
