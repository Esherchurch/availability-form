/* The sermons podcast feed, without a browser (F-132, F-133).
   An invented show only: no real feed is fetched.

     node screenshots/events/sermons-feed-unit.test.mjs

   What it proves: Val's show can be repointed without anything showing
   twice - every old episode keeps its guid exactly, the show keeps its
   name, artwork and owner email - and nothing unpublished is in the feed. */

import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ctx = { window: {} }; ctx.self = ctx.window; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.resolve(HERE, '..', '..', 'egbc-sermons-feed.js'), 'utf8'), ctx);
const F = ctx.window.EGBCSermonsFeed;

const results = [];
function ok(name, pass, why) { results.push(!!pass); console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (pass || !why ? '' : '\n          ' + String(why).slice(0, 400))); }

/* An invented feed, shaped like the one Spotify for Creators gives a show
   today: CDATA, a guid that is not an address, durations as HH:MM:SS, an
   <image> block with its own title, and an episode with no guid at all. */
const OLD = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
<title><![CDATA[Test Green Church Sermons]]></title>
<description><![CDATA[<p>Sunday talks from Test Green (invented) &amp; friends.</p>]]></description>
<link>https://example.invalid/sermons</link>
<image><url>https://example.invalid/art-3000.jpg</url><title>Image title, not the show</title><link>https://example.invalid/image-link</link></image>
<language><![CDATA[en-gb]]></language>
<itunes:author>Test Green Church</itunes:author>
<itunes:owner><itunes:name>Test Owner</itunes:name><itunes:email>owner@example.invalid</itunes:email></itunes:owner>
<itunes:image href="https://example.invalid/art-3000.jpg"/>
<itunes:category text="Religion &amp; Spirituality"><itunes:category text="Christianity"/></itunes:category>
<itunes:explicit>false</itunes:explicit>
<item>
<title><![CDATA[Grace that scandalises]]></title>
<description><![CDATA[<p>Luke 15. Invented notes.</p>]]></description>
<guid isPermaLink="false">a1b2c3d4-0000-4e5f-9999-000000000001</guid>
<pubDate>Sun, 07 Sep 2025 10:45:00 GMT</pubDate>
<enclosure url="https://example.invalid/ep1.mp3" length="31000000" type="audio/mpeg"/>
<itunes:duration>00:34:10</itunes:duration>
</item>
<item>
<title>Ask &amp; plan</title>
<description>Nehemiah &lt;2&gt;</description>
<guid isPermaLink="false"><![CDATA[a1b2c3d4-0000-4e5f-9999-000000000002]]></guid>
<pubDate>Sun, 14 Sep 2025 10:45:00 GMT</pubDate>
<enclosure url="https://example.invalid/ep2.mp3" length="29000000" type="audio/mpeg"/>
<itunes:duration>1980</itunes:duration>
</item>
<item>
<title>No guid here</title>
<pubDate>Sun, 21 Sep 2025 10:45:00 GMT</pubDate>
<enclosure url="https://example.invalid/ep3.mp3" length="1" type="audio/mpeg"/>
<itunes:duration>12:05</itunes:duration>
</item>
</channel>
</rss>`;

const old = F.parseOldFeed(OLD);
ok('reads the show’s name (not the picture’s title)', old.show.title === 'Test Green Church Sermons', old.show.title);
ok('its owner email and name', old.show.ownerEmail === 'owner@example.invalid' && old.show.ownerName === 'Test Owner', JSON.stringify(old.show));
ok('its artwork, link and category', old.show.artworkUrl === 'https://example.invalid/art-3000.jpg' && old.show.link === 'https://example.invalid/sermons'
  && old.show.category === 'Religion & Spirituality' && old.show.subcategory === 'Christianity', JSON.stringify(old.show));
ok('its description as plain words', old.show.description === 'Sunday talks from Test Green (invented) & friends.', old.show.description);
ok('every episode', old.items.length === 3, old.items.length);
ok('EVERY GUID EXACTLY AS THE SHOW HAS IT (even inside CDATA)', old.items[0].guid === 'a1b2c3d4-0000-4e5f-9999-000000000001' && old.items[1].guid === 'a1b2c3d4-0000-4e5f-9999-000000000002', JSON.stringify(old.items.map(i => i.guid)));
ok('an episode with no guid is known by its audio address, as podcast apps know it', old.items[2].guid === 'https://example.invalid/ep3.mp3', old.items[2].guid);
ok('dates, durations (HH:MM:SS, seconds, MM:SS) and titles', old.items[0].date === '2025-09-07' && old.items[0].durationSec === 2050 && old.items[1].durationSec === 1980
  && old.items[2].durationSec === 725 && old.items[1].title === 'Ask & plan' && old.items[1].description === 'Nehemiah <2>', JSON.stringify(old.items[1]));

/* The hub's data after the import, plus a new sermon, a draft, and one
   whose audio is not up yet. */
const BUCKET = 'test-bucket.example';
const show = { title: old.show.title, description: old.show.description, author: old.show.author, ownerName: old.show.ownerName, ownerEmail: old.show.ownerEmail,
  link: old.show.link, language: 'en-gb', category: old.show.category, subcategory: old.show.subcategory, explicit: false, artworkPath: 'podcast/artwork',
  oldGuids: old.items.map(i => i.guid) };
const imp = (i, id) => ({ id, title: i.title, speaker: '', date: i.date, seriesId: '', book: '', passage: '', description: i.description, audioPath: 'sermons/' + id + '/audio',
  audioType: 'audio/mpeg', audioSize: i.audioSize, durationSec: i.durationSec, published: true, guid: i.guid, imported: true, pubDate: i.pubDate });
const sermons = [
  imp(old.items[0], 'srm_o1'), imp(old.items[1], 'srm_o2'),
  { id: 'srm_new', title: 'Rebuilding <walls> & lives', speaker: 'Test Speaker', date: '2026-10-04', seriesId: 'ser_neh', book: 'Nehemiah', passage: '2:1-8',
    description: 'Invented notes.', audioPath: 'sermons/srm_new/audio', audioType: 'audio/mpeg', audioSize: 30000000, durationSec: 2040, published: true, guid: 'egbc-sermon-srm_new', imported: false },
  { id: 'srm_draft', title: 'SECRET DRAFT', speaker: 'x', date: '2026-10-11', seriesId: '', book: '', passage: '', audioPath: 'sermons/srm_draft/audio', audioSize: 1, durationSec: 1, published: false, guid: 'egbc-sermon-srm_draft' },
  { id: 'srm_noaudio', title: 'NO AUDIO YET', speaker: 'x', date: '2026-10-11', seriesId: '', book: '', passage: '', audioPath: '', audioSize: 0, durationSec: 0, published: true, guid: 'egbc-sermon-srm_noaudio' }
];
const series = { ser_neh: { name: 'Nehemiah: rebuilding', artworkPath: 'sermonSeries/ser_neh/artwork' } };
const xml = F.buildFeed({ show, series, sermons, bucket: BUCKET, feedUrl: 'https://example.invalid/podcastFeed', now: new Date(Date.UTC(2026, 9, 9)) });

const back = F.parseOldFeed(xml);
ok('THE NEW FEED CARRIES THE SAME SHOW: name, owner email, artwork, category', back.show.title === show.title && back.show.ownerEmail === 'owner@example.invalid'
  && back.show.artworkUrl === 'https://firebasestorage.googleapis.com/v0/b/test-bucket.example/o/podcast%2Fartwork?alt=media' && back.show.category === 'Religion & Spirituality'
  && back.show.subcategory === 'Christianity', JSON.stringify(back.show));
ok('THE OLD EPISODES KEEP THEIR GUIDS, so nothing shows twice', back.items.some(i => i.guid === old.items[0].guid) && back.items.some(i => i.guid === old.items[1].guid));
ok('and their dates and times as the show gave them', back.items.find(i => i.guid === old.items[0].guid).pubDate === 'Sun, 07 Sep 2025 10:45:00 GMT');
ok('guids are marked as not addresses', (xml.match(/<guid isPermaLink="false">/g) || []).length === 3);
ok('NOTHING UNPUBLISHED, AND NOTHING WITHOUT ITS AUDIO, IS IN THE FEED', !/SECRET DRAFT|srm_draft|NO AUDIO YET/.test(xml));
ok('newest first', back.items.map(i => i.guid).join() === ['egbc-sermon-srm_new', old.items[1].guid, old.items[0].guid].join(), back.items.map(i => i.guid).join());
const nw = back.items[0];
ok('a new sermon: its audio by the plain address (no token), its size, type and length', /<enclosure url="https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/test-bucket\.example\/o\/sermons%2Fsrm_new%2Faudio\?alt=media" length="30000000" type="audio\/mpeg"\/>/.test(xml)
  && nw.durationSec === 2040 && !/token=/.test(xml));
ok('its words: passage, speaker, series, then the notes', nw.description === 'Nehemiah 2:1-8 · Test Speaker · Nehemiah: rebuilding\n\nInvented notes.', nw.description);
ok('a Sunday sermon is dated that Sunday', nw.pubDate === 'Sun, 04 Oct 2026 11:00:00 GMT', nw.pubDate);
ok('anything odd in a title is made safe', nw.title === 'Rebuilding <walls> & lives' && /Rebuilding &lt;walls&gt; &amp; lives/.test(xml));
ok('the series picture on its episodes', /<itunes:image href="https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/test-bucket\.example\/o\/sermonSeries%2Fser_neh%2Fartwork\?alt=media"\/>/.test(xml));
ok('a character no XML allows does not break the feed', !/\u0001/.test(F.buildFeed({ show: { title: 'A\u0001B' }, sermons: [], bucket: BUCKET })));

/* Ready to repoint? */
const c1 = F.checkSwitchOver(show, sermons);
ok('NOT READY while an old episode is missing (the one with no guid has no audio here)', !c1.ready && c1.oldMissing.length === 1 && c1.oldMissing[0] === 'https://example.invalid/ep3.mp3', JSON.stringify(c1));
const all = sermons.concat([imp(old.items[2], 'srm_o3')]);
const c2 = F.checkSwitchOver(show, all);
ok('READY once every old episode is in, with its audio', c2.ready && c2.episodes === 4, JSON.stringify(c2));
ok('not ready without the owner email', !F.checkSwitchOver(Object.assign({}, show, { ownerEmail: '' }), all).ready);
const dup = all.concat([Object.assign({}, all[0], { id: 'srm_twice' })]);
ok('a guid used twice is named, and only one goes in the feed', F.checkSwitchOver(show, dup).dupes[0] === old.items[0].guid
  && (F.buildFeed({ show, sermons: dup, bucket: BUCKET }).match(new RegExp(old.items[0].guid, 'g')) || []).length === 1);
ok('times read as people say them', F.hms(2040) === '34:00' && F.hms(3725) === '1:02:05' && F.hms(65) === '1:05');

const passed = results.filter(Boolean).length;
console.log('\n' + passed + '/' + results.length + ' passed');
process.exit(passed === results.length ? 0 : 1);
