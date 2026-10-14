/* The hourly read of the sermon podcast and the YouTube channel (F-139, F-164).
 *
 *   firebase emulators:exec --config firebase.spare.json --only firestore ^
 *     --project egbc-worship-planner "node tests/check-feeds.mjs"
 *
 * (from v2/, on the spare emulator: it writes sermons and videos.)
 *
 * functions/feeds.js hands each feed's text to the events window's own
 * sync() - the decisions are theirs, and their tests are the spec. What is
 * ours, and what this checks:
 *   - the copies of their two files are still the originals;
 *   - a run makes the documents, and a second run on the same feeds makes
 *     none;
 *   - what the office set survives a run (a sermon's series, a hidden video);
 *   - a feed that fails writes its status only and changes nothing else;
 *   - it never touches watchShow/live, and never deletes;
 *   - A PART THE CHURCH DOES NOT USE IS NOT FETCHED AT ALL: no request,
 *     no write (the reviewing window, 14 Oct 2026).
 * The feeds are synthetic text handed to a fake fetch - nothing leaves the
 * machine.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const V2 = path.resolve('.');
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8171';
const requireFn = createRequire(path.join(V2, 'functions', 'package.json'));
const { initializeApp } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'egbc-worship-planner' });
const db = getFirestore();
const { runFeeds } = await import('../functions/feeds.js');

const R = [];
const ok = (n, v, x) => { R.push(v); console.log('  ' + (v ? 'PASS  ' : 'FAIL  ') + n + (!v && x !== undefined ? '\n          ' + String(x).slice(0, 300) : '')); };

const PODCAST = 'https://anchor.example.invalid/s/synthetic/podcast/rss';
const CHANNEL = 'UCf7lMnb24HfNJKGpMeYdQXQ';
const RSS = `<?xml version="1.0"?><rss><channel><title>Synthetic Sermons</title>
<item><title>Synthetic sermon one</title><guid>syn-guid-1</guid><pubDate>Sun, 04 Oct 2026 10:30:00 GMT</pubDate>
<enclosure url="https://anchor.example.invalid/one.mp3" type="audio/mpeg" length="1000"/><itunes:duration>1800</itunes:duration></item>
<item><title>Synthetic sermon two</title><guid>syn-guid-2</guid><pubDate>Sun, 11 Oct 2026 10:30:00 GMT</pubDate>
<enclosure url="https://anchor.example.invalid/two.mp3" type="audio/mpeg" length="1000"/><itunes:duration>1900</itunes:duration></item>
</channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed><title>Synthetic Channel</title>
<entry><yt:videoId>AAAAAAAAAA1</yt:videoId><title>Synthetic video one</title><published>2026-10-04T12:00:00+00:00</published>
<media:thumbnail url="https://i.ytimg.example.invalid/1.jpg"/><media:description>One</media:description></entry>
<entry><yt:videoId>AAAAAAAAAA2</yt:videoId><title>Synthetic video two</title><published>2026-10-11T12:00:00+00:00</published>
<media:thumbnail url="https://i.ytimg.example.invalid/2.jpg"/><media:description>Two</media:description></entry>
</feed>`;

let calls = [];
let failPodcast = false;
const fakeFetch = async (url) => {
  calls.push(String(url));
  if (url === PODCAST && failPodcast) return { ok: false, status: 404, headers: new Map(), text: async () => '' };
  const body = url === PODCAST ? RSS : /youtube\.com\/feeds\/videos\.xml/.test(url) ? ATOM : '';
  return { ok: true, status: 200, headers: new Map(), text: async () => body };
};
const count = async (c) => (await db.collection(c).get()).size;
const clear = async (c) => { const s = await db.collection(c).get(); for (const d of s.docs) await d.ref.delete(); };

(async () => {
  console.log('\nthe copies of the events window’s two files are still the originals');
  const same = (a, b) => fs.readFileSync(a, 'utf8').replace(/\r\n/g, '\n') === fs.readFileSync(b, 'utf8').replace(/\r\n/g, '\n');
  ok('  functions/watch-core.cjs is egbc-watch.js', same('functions/watch-core.cjs', 'egbc-watch.js'), 'copy egbc-watch.js over functions/watch-core.cjs');
  ok('  functions/sermons-feed.cjs is egbc-sermons-feed.js', same('functions/sermons-feed.cjs', 'egbc-sermons-feed.js'), 'copy egbc-sermons-feed.js over functions/sermons-feed.cjs');

  for (const c of ['sermons', 'videos']) await clear(c);
  await db.doc('churchSettings/features').delete();
  await db.doc('sermonShow/feed').delete();
  await db.doc('watchShow/settings').delete();
  await db.doc('watchShow/live').set({ videoId: 'LIVELIVE001', title: 'Synthetic live', showUntil: 'x' });

  console.log('\nwith no addresses set');
  calls = [];
  let r = await runFeeds(db, { fetchImpl: fakeFetch });
  ok('  nothing is fetched and nothing written', calls.length === 0 && (await count('sermons')) === 0 && (await count('videos')) === 0, JSON.stringify(r));

  console.log('\nwith the podcast address and the channel set');
  await db.doc('sermonShow/feed').set({ url: PODCAST });
  await db.doc('watchShow/settings').set({ channelId: CHANNEL });
  calls = [];
  r = await runFeeds(db, { fetchImpl: fakeFetch });
  ok('  both feeds are read, once each', calls.length === 2 && calls.includes(PODCAST) && calls.some((u) => u.includes('channel_id=' + CHANNEL)), JSON.stringify(calls));
  ok('  two sermons and two videos are made', (await count('sermons')) === 2 && (await count('videos')) === 2, JSON.stringify(r));
  ok('  the videos are yt_ documents', (await db.doc('videos/yt_AAAAAAAAAA1').get()).exists);
  ok('  both statuses say it worked', (await db.doc('sermonShow/feedStatus').get()).data().ok === true
    && (await db.doc('watchShow/feedStatus').get()).data().ok === true);

  /* What the office set. */
  const sermonIds = (await db.collection('sermons').get()).docs.map((d) => d.id);
  await db.doc('sermons/' + sermonIds[0]).update({ seriesId: 'series_synthetic' });
  await db.doc('videos/yt_AAAAAAAAAA2').update({ hidden: true });
  r = await runFeeds(db, { fetchImpl: fakeFetch });
  ok('  run again: nothing new is made', (await count('sermons')) === 2 && (await count('videos')) === 2, JSON.stringify(r));
  ok('  a sermon’s series, set in the hub, survives', (await db.doc('sermons/' + sermonIds[0]).get()).data().seriesId === 'series_synthetic');
  ok('  a video the office hid stays hidden', (await db.doc('videos/yt_AAAAAAAAAA2').get()).data().hidden === true);
  ok('  the live link is never touched', JSON.stringify((await db.doc('watchShow/live').get()).data()) === JSON.stringify({ videoId: 'LIVELIVE001', title: 'Synthetic live', showUntil: 'x' }));

  console.log('\nwhen the podcast cannot be read');
  failPodcast = true;
  r = await runFeeds(db, { fetchImpl: fakeFetch });
  const st = (await db.doc('sermonShow/feedStatus').get()).data();
  ok('  its status says so, in words', st.ok === false && /404/.test(st.error), JSON.stringify(st));
  ok('  and no sermon is changed or removed', (await count('sermons')) === 2 && (await db.doc('sermons/' + sermonIds[0]).get()).data().seriesId === 'series_synthetic');
  failPodcast = false;

  console.log('\na part the church does not use is not fetched at all');
  await db.doc('churchSettings/features').set({ watch: false });
  await clear('videos');
  calls = [];
  r = await runFeeds(db, { fetchImpl: fakeFetch });
  ok('  Watch off: the channel is not asked', !calls.some((u) => /youtube/.test(u)), JSON.stringify(calls));
  ok('  and no video is written', (await count('videos')) === 0, JSON.stringify(r));
  ok('  while the sermons still are', calls.includes(PODCAST));
  await db.doc('churchSettings/features').set({ sermons: false });
  calls = [];
  r = await runFeeds(db, { fetchImpl: fakeFetch });
  ok('  Sermons off: the podcast is not asked', !calls.includes(PODCAST) && calls.some((u) => /youtube/.test(u)), JSON.stringify(calls));
  await db.doc('churchSettings/features').delete();

  console.log('\n' + R.filter(Boolean).length + '/' + R.length + ' passed');
  process.exit(R.some((v) => !v) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
