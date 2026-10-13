/* Watch, without a browser (NEXT-BRIEF §24 item 5; F-163). An invented
   channel feed only: no real feed is fetched.

     node screenshots/events/watch-unit.test.mjs

   What it proves:
     1. the channel feed is read: id, title, date, picture, words
     2. READING IT AGAIN NEVER MAKES A SECOND COPY of a video, and the
        office's "hidden" survives every read; the feed's changes come in
     3. a YouTube link said any usual way gives its video id; anything
        else (another site, a channel, a playlist) gives none
     4. the live card's times from the church's settings: EGBC's "that
        Sunday at 4pm"; another church's own day and time; British Summer
        Time ending on the Sunday in between
     5. the card: not before show-from; "live" until show-until; then gone,
        or "Watch again" until the second time, as the church chose */
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { window: {}, Promise, Intl, Date, encodeURIComponent, String, Object, Math }; ctx.self = ctx.window; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(HERE, '..', '..', 'egbc-watch.js'), 'utf8'), ctx);
const W = ctx.window.EGBCWatch;
const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const J = (x) => JSON.stringify(x);
const plain = (x) => JSON.parse(JSON.stringify(x));

/* Shaped like YouTube's channel feed. One entry listed twice, one with no
   video id. */
const entry = (id, title, pub, words) => `<entry><id>yt:video:${id}</id><yt:videoId>${id}</yt:videoId><yt:channelId>UCinventedinventedinvent</yt:channelId>` +
  `<title>${title}</title><link rel="alternate" href="https://www.youtube.com/watch?v=${id}"/><published>${pub}</published><updated>${pub}</updated>` +
  `<media:group><media:title>${title}</media:title><media:thumbnail url="https://i.ytimg.com/vi/${id}/hqdefault.jpg" width="480" height="360"/>` +
  `<media:description>${words || 'Invented.'}</media:description></media:group></entry>`;
const FEED = (entries) => `<?xml version="1.0" encoding="UTF-8"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">` +
  `<title>Test Green Church (invented)</title>` + entries.join('') + `</feed>`;
const A = 'aaaaaaaaaa1', B = 'bbbbbbbbbb2', C = 'cccccccccc3';
const one = FEED([entry(A, 'Harvest Sunday &amp; lunch', '2026-10-04T10:30:00+00:00', 'All age (invented)'), entry(B, 'Carols', '2026-10-11T10:30:00+00:00'),
  entry(A, 'Harvest Sunday &amp; lunch', '2026-10-04T10:30:00+00:00'), '<entry><title>No id</title><published>2026-10-01T00:00:00+00:00</published></entry>']);

/* ---- 1 ---- */
const got = plain(W.parseFeed(one));
ok('1. the feed: two videos (the repeat listed once in the plan, the one with no id left out)', got.items.length === 3 && got.items.filter(i => i.videoId === A).length === 2 && got.channel.title === 'Test Green Church (invented)', J(got));
ok('   title (with & decoded), date, picture and words', got.items[0].title === 'Harvest Sunday & lunch' && got.items[0].published === '2026-10-04T10:30:00+00:00' &&
  got.items[0].thumb === 'https://i.ytimg.com/vi/' + A + '/hqdefault.jpg' && got.items[0].description === 'All age (invented)', J(got.items[0]));

/* ---- 2: a store in memory, read three times ---- */
const docs = {}; let status = null;
const store = { get: (id) => Promise.resolve(docs[id] ? plain(docs[id]) : null), create: (id, d) => { docs[id] = plain(d); return Promise.resolve(); },
  update: (id, d) => { docs[id] = Object.assign(docs[id], plain(d)); return Promise.resolve(); }, status: (s) => { status = plain(s); return Promise.resolve(); } };
const r1 = plain(await W.sync(store, one, new Date('2026-10-13T09:00:00Z')));
ok('2. first read: two videos made, yt_<id>', r1.created === 2 && Object.keys(docs).sort().join() === ['yt_' + A, 'yt_' + B].join() && docs['yt_' + A].source === 'feed' && docs['yt_' + A].hidden === false, J(r1));
if (docs['yt_' + B]) docs['yt_' + B].hidden = true;   /* the office hides one */
const r2 = plain(await W.sync(store, one, new Date('2026-10-13T10:00:00Z')));
ok('   READ AGAIN: NOTHING NEW, NOTHING CHANGED', r2.created === 0 && r2.updated === 0 && r2.same === 2 && Object.keys(docs).length === 2, J(r2));
const two = FEED([entry(A, 'Harvest Sunday (renamed)', '2026-10-04T10:30:00+00:00'), entry(B, 'Carols', '2026-10-11T10:30:00+00:00'), entry(C, 'New one', '2026-10-12T10:30:00+00:00')]);
const r3 = plain(await W.sync(store, two, new Date('2026-10-13T11:00:00Z')));
ok('   a new video and a renamed one come in; still no copies', r3.created === 1 && r3.updated === 1 && Object.keys(docs).length === 3 && docs['yt_' + A].title === 'Harvest Sunday (renamed)', J(r3));
ok('   THE OFFICE\'S "HIDDEN" SURVIVES EVERY READ', !!docs['yt_' + B] && docs['yt_' + B].hidden === true);
ok('   the status says how it went', status.ok === true && status.videos === 3 && status.channelTitle === 'Test Green Church (invented)', J(status));
const r4 = plain(await W.sync(store, 'not a feed', new Date('2026-10-13T12:00:00Z')));
ok('   a feed that does not read changes nothing and says so', r4.videos === 0 && Object.keys(docs).length === 3 && status.ok === false, J(status));

/* ---- 3 ---- */
const urls = {
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ': 'dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?si=abc': 'dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share': 'dQw4w9WgXcQ',
  'https://m.youtube.com/watch?feature=x&v=dQw4w9WgXcQ': 'dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ': 'dQw4w9WgXcQ',
  'https://www.youtube.com/@Esherchurch': '', 'https://www.youtube.com/playlist?list=PL123': '', 'https://example.invalid/watch?v=dQw4w9WgXcQ': '',
  'http://www.youtube.com/watch?v=dQw4w9WgXcQ': '', 'javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ': ''
};
const bad = Object.keys(urls).filter(u => W.videoIdFromUrl(u) !== urls[u]);
ok('3. a YouTube link said any usual way gives its id; another site, a channel, a playlist or plain http gives none', !bad.length, J(bad.map(u => [u, W.videoIdFromUrl(u)])));

/* ---- 4: the times, from the church's settings ---- */
const at = (iso) => new Date(iso);
const hm = (ms) => { const p = W.londonParts(new Date(ms)); return [p.y, p.m, p.d].join('-') + ' ' + p.h + ':' + String(p.mi).padStart(2, '0') + ' ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][p.wd]; };
const egbc = W.defaultTimes({}, at('2026-10-15T12:00:00Z'));   /* a Thursday, in summer time */
ok('4. EGBC (nothing set): until that Sunday at 4pm, then it disappears', hm(egbc.showUntil) === '2026-10-18 16:00 Sun' && egbc.after === 'disappear', hm(egbc.showUntil));
const sunMorning = W.defaultTimes({}, at('2026-10-18T09:30:00Z'));   /* Sunday 10:30 BST, during the service */
ok('   added on the Sunday morning: until 4pm THAT DAY, not next week', hm(sunMorning.showUntil) === '2026-10-18 16:00 Sun', hm(sunMorning.showUntil));
/* Martin, 14 Oct: on the front of the app ON THE DAY of the service. */
ok('   ON THE DAY: added on the Thursday, it shows from the start of Sunday, not straight away', hm(egbc.showFrom) === '2026-10-18 0:00 Sun', hm(egbc.showFrom));
ok('   added on the Sunday morning, it shows at once (the day has begun)', sunMorning.showFrom <= Date.parse('2026-10-18T09:30:00Z') && hm(sunMorning.showFrom) === '2026-10-18 0:00 Sun', hm(sunMorning.showFrom));
ok('   so on the Thursday the card is not on the front of the app; on the Sunday it is', W.liveState(Object.assign({ url: 'https://youtu.be/dQw4w9WgXcQ' }, egbc), at('2026-10-15T12:00:00Z')) === null && W.liveState(Object.assign({ url: 'https://youtu.be/dQw4w9WgXcQ' }, egbc), at('2026-10-18T08:00:00Z')) === 'live');
const sunEvening = W.defaultTimes({}, at('2026-10-18T17:00:00Z'));   /* Sunday 6pm: today's 4pm has gone */
ok('   added on Sunday after 4pm: the next Sunday', hm(sunEvening.showUntil) === '2026-10-25 16:00 Sun', hm(sunEvening.showUntil));
ok('   the clocks go back on 25 Oct: still 4pm by the clock (16:00 GMT)', new Date(sunEvening.showUntil).toISOString() === '2026-10-25T16:00:00.000Z', new Date(sunEvening.showUntil).toISOString());
const other = W.defaultTimes({ untilDay: 6, fromTime: '18:00', untilTime: '20:30', after: 'again', againDays: 3 }, at('2026-10-15T12:00:00Z'));
ok('   another church: Saturday 6pm to 8.30pm, then "Watch again" for 3 days', hm(other.showFrom) === '2026-10-17 18:00 Sat' && hm(other.showUntil) === '2026-10-17 20:30 Sat' && other.after === 'again' && other.againUntil - other.showUntil === 3 * 864e5, hm(other.showUntil));
const s = plain(W.settingsOf({ channelId: 'not a channel', untilDay: 9, fromTime: '17:00', untilTime: '25:00', after: 'x', againDays: 0 }));
ok('   settings that make no sense fall back to the defaults (a start after the end too)', s.channelId === '' && s.untilDay === 0 && s.fromTime === '00:00' && s.untilTime === '16:00' && s.after === 'disappear' && s.againDays === 7, J(s));
ok('   a real channel id is kept', W.settingsOf({ channelId: 'UCf7lMnb24HfNJKGpMeYdQXQ' }).channelId === 'UCf7lMnb24HfNJKGpMeYdQXQ');

/* ---- 5: the card ---- */
const LIVE = { url: 'https://www.youtube.com/live/dQw4w9WgXcQ', showFrom: Date.parse('2026-10-18T08:00:00Z'), showUntil: Date.parse('2026-10-18T15:00:00Z'), after: 'disappear', againUntil: Date.parse('2026-10-25T15:00:00Z') };
ok('5. before show-from: no card', W.liveState(LIVE, at('2026-10-18T07:59:00Z')) === null);
ok('   from show-from to show-until: "live"', W.liveState(LIVE, at('2026-10-18T08:00:00Z')) === 'live' && W.liveState(LIVE, at('2026-10-18T14:59:00Z')) === 'live');
ok('   after show-until, the church chose "disappear": gone', W.liveState(LIVE, at('2026-10-18T15:00:00Z')) === null);
const AGAIN = Object.assign({}, LIVE, { after: 'again' });
ok('   chose "Watch again": "again" until the second time, then gone', W.liveState(AGAIN, at('2026-10-20T10:00:00Z')) === 'again' && W.liveState(AGAIN, at('2026-10-25T15:00:00Z')) === null);
ok('   no link, or a link that is not YouTube: no card', W.liveState(Object.assign({}, LIVE, { url: 'https://example.invalid/live' }), at('2026-10-18T10:00:00Z')) === null && W.liveState(null) === null);
ok('   the player is YouTube\'s no-cookie one, in place', W.embedUrl('dQw4w9WgXcQ').indexOf('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?') === 0);

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
