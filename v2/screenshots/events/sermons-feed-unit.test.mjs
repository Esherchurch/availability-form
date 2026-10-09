/* Sermons from Val's podcast feed, without a browser (F-132, F-138;
   Martin's option 3). An invented feed only: no real feed is fetched.

     node screenshots/events/sermons-feed-unit.test.mjs

   What it proves: reading the feed again never makes a second copy of an
   episode; what the hub adds (series, passage, speaker, hidden) survives
   every read; the feed's own changes come through. */

import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { window: {}, btoa: globalThis.btoa, unescape: globalThis.unescape, encodeURIComponent, Promise }; ctx.self = ctx.window; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(HERE, '..', '..', 'egbc-sermons-feed.js'), 'utf8'), ctx);
const F = ctx.window.EGBCSermonsFeed;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }
const J = (x) => JSON.stringify(x);

/* Shaped like a Spotify for Creators feed: CDATA, guids that are not
   addresses, HH:MM:SS, an <image> block with its own title, one episode
   with no guid, one with no audio, and the same episode listed twice. */
const item = (o) => `<item><title><![CDATA[${o.title}]]></title><description><![CDATA[<p>${o.words || 'Invented notes.'}</p>]]></description>` +
  (o.guid ? `<guid isPermaLink="false">${o.guid}</guid>` : '') + `<pubDate>${o.date}</pubDate>` +
  (o.audio ? `<enclosure url="${o.audio}" length="${o.size || 1000}" type="audio/mpeg"/>` : '') + `<itunes:duration>${o.dur || '00:34:10'}</itunes:duration></item>`;
const FEED = (items) => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title><![CDATA[Test Green Sermons (invented)]]></title><image><url>https://example.invalid/art.jpg</url><title>Not the show</title></image>
<itunes:image href="https://example.invalid/art.jpg"/>${items.join('')}</channel></rss>`;
const E1 = { title: 'Grace that scandalises', guid: 'a1b2c3d4-0001-invented', date: 'Sun, 07 Sep 2025 10:45:00 GMT', audio: 'https://example.invalid/ep1.mp3', size: 31000000 };
const E2 = { title: 'Ask & plan', guid: 'a1b2c3d4-0002-invented', date: 'Sun, 14 Sep 2025 10:45:00 GMT', audio: 'https://example.invalid/ep2.mp3', dur: '1980' };
const E3 = { title: 'No guid here', date: 'Sun, 21 Sep 2025 10:45:00 GMT', audio: 'https://example.invalid/ep3.mp3', dur: '12:05' };
const NOAUDIO = { title: 'A trailer with no audio', guid: 'no-audio-invented', date: 'Sun, 28 Sep 2025 10:45:00 GMT' };
const XML = FEED([item(E2), item(E1), item(E3), item(NOAUDIO), item(E1)]);

const got = F.parseFeed(XML);
ok('reads the show’s name (not the picture’s) and artwork', got.show.title === 'Test Green Sermons (invented)' && got.show.imageUrl === 'https://example.invalid/art.jpg', J(got.show));
ok('every episode with audio; one with none is left out', got.items.length === 4 && !got.items.some(i => /trailer/.test(i.title)), got.items.length);
ok('the guid exactly as the feed has it; with none, the audio address', got.items[0].guid === 'a1b2c3d4-0002-invented' && got.items[2].guid === 'https://example.invalid/ep3.mp3');
ok('dates, durations, words, audio', got.items[1].date === '2025-09-07' && got.items[1].durationSec === 2050 && got.items[0].durationSec === 1980 && got.items[2].durationSec === 725
  && got.items[0].title === 'Ask & plan' && got.items[1].description === 'Invented notes.' && got.items[1].audioUrl === 'https://example.invalid/ep1.mp3' && got.items[1].audioSize === 31000000);
ok('THE SAME GUID ALWAYS GIVES THE SAME DOCUMENT; different guids never share one', F.idForGuid('a1b2c3d4-0001-invented') === F.idForGuid('a1b2c3d4-0001-invented')
  && F.idForGuid('a') !== F.idForGuid('b') && F.idForGuid('x/y?z') !== F.idForGuid('x_y?z') && /^feed_[A-Za-z0-9_-]+$/.test(F.idForGuid('https://example.invalid/ep3.mp3?x=1&y=é')));

/* A pretend database, as the function's store will be. */
function memoryStore() {
  const docs = {}, log = [];
  return { docs, log, last: null,
    get: (id) => Promise.resolve(docs[id] ? { ...docs[id] } : null),
    create: (id, d) => { log.push(['create', id]); if (docs[id]) throw new Error('create over an existing ' + id); docs[id] = { ...d }; return Promise.resolve(); },
    update: (id, d) => { log.push(['update', id, Object.keys(d)]); docs[id] = { ...docs[id], ...d }; return Promise.resolve(); },
    status(d) { this.last = d; return Promise.resolve(); } };
}
const st = memoryStore();
const r1 = await F.sync(st, XML, new Date('2026-10-09T10:00:00Z'));
const count = () => Object.keys(st.docs).length;
ok('first read: three sermons (the doubled one once), shown, from the feed', r1.created === 3 && count() === 3
  && Object.values(st.docs).every(d => d.published === true && d.source === 'feed' && d.seriesId === '' && d.audioPath === ''), J(r1));
ok('   and the status says so', st.last.ok === true && st.last.episodes === 3 && st.last.showTitle === 'Test Green Sermons (invented)', J(st.last));
const r2 = await F.sync(st, XML, new Date('2026-10-09T11:00:00Z'));
ok('READ AGAIN: NO SECOND COPY OF ANYTHING, AND NOTHING WRITTEN', count() === 3 && r2.created === 0 && r2.updated === 0 && r2.same === 3, J(r2));

/* The hub adds its part; the feed changes a title and adds an episode. */
const id1 = F.idForGuid(E1.guid), id2 = F.idForGuid(E2.guid);
Object.assign(st.docs[id1], { seriesId: 'ser_luke', book: 'Luke', passage: '15:1-32', speaker: 'Jeanette (invented)' });
st.docs[id2].published = false;
const E4 = { title: 'A new one', guid: 'a1b2c3d4-0004-invented', date: 'Sun, 05 Oct 2026 10:45:00 GMT', audio: 'https://example.invalid/ep4.mp3' };
const XML2 = FEED([item(E4), item({ ...E1, title: 'Grace that scandalises (corrected)' }), item(E2), item(E3)]);
st.log.length = 0;
const r3 = await F.sync(st, XML2, new Date('2026-10-09T12:00:00Z'));
ok('a new episode comes in, once', count() === 4 && r3.created === 1 && st.docs[F.idForGuid(E4.guid)].title === 'A new one', J(r3));
ok('the feed’s corrected title comes through', st.docs[id1].title === 'Grace that scandalises (corrected)');
ok('THE HUB’S SERIES, PASSAGE AND SPEAKER ARE KEPT', st.docs[id1].seriesId === 'ser_luke' && st.docs[id1].book === 'Luke' && st.docs[id1].passage === '15:1-32' && st.docs[id1].speaker === 'Jeanette (invented)', J(st.docs[id1]));
ok('AN EPISODE THE HUB HID STAYS HIDDEN', st.docs[id2].published === false);
ok('an update writes only the feed’s own fields', st.log.filter(l => l[0] === 'update').every(l => l[2].every(k => F.FEED_FIELDS.includes(k) || ['feedSeenAt', 'updatedAt', 'updatedBy'].includes(k))), J(st.log));
const r4 = await F.sync(st, XML2, new Date('2026-10-09T13:00:00Z'));
ok('and read once more: still four', count() === 4 && r4.created === 0 && r4.updated === 0, J(r4));
const bad = memoryStore();
await F.sync(bad, '<html>Not a feed</html>');
ok('a feed that does not read changes nothing, and says so', Object.keys(bad.docs).length === 0 && bad.last.ok === false && /No episodes/.test(bad.last.error));

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
