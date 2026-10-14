/* The hourly read of the church's two outside feeds (F-139, F-164).
 *
 *   sermons   the podcast feed Val publishes (Spotify for Creators), read
 *             from sermonShow/feed.url, into sermons/<id>
 *   watch     the church's YouTube channel feed, read from
 *             watchShow/settings.channelId, into videos/yt_*
 *
 * One scheduled function does both (feedSync, index.js), because both are
 * "fetch a public feed and hand its text to the events window's own sync()".
 * The work of deciding what is new, what changed and what the office has
 * hidden is theirs: functions/sermons-feed.cjs and functions/watch-core.cjs
 * are copies of egbc-sermons-feed.js and egbc-watch.js, and a check fails the
 * moment either drifts from its original.
 *
 * WHAT IT NEVER DOES (the events window's spec): delete a sermon or a video,
 * read or write watchShow/live, or write anything but sermons/*,
 * sermonShow/feedStatus, videos/yt_* and watchShow/feedStatus.
 *
 * A PART THE CHURCH DOES NOT USE IS NOT FETCHED (HANDOVER-MAIN rule 12; the
 * reviewing window, 14 Oct 2026): churchSettings/features.sermons or .watch
 * set to false skips that feed entirely - no request, no write. Missing
 * counts as on, as everything does until item 14's switches exist.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SermonsFeed = require('./sermons-feed.cjs');
const WatchCore = require('./watch-core.cjs');

const TIMEOUT_MS = 20000;
const MAX_BYTES = 10 * 1024 * 1024;
const USER_AGENT = 'ChurchHub-FeedReader/1.0 (church hub; reads its own public feed)';

/* Fetch a feed's text: 20 seconds, 10 MB, redirects followed, a plain
   User-Agent. Throws a plain-words Error on any failure. */
export async function fetchFeed(url, fetchImpl = fetch) {
  const ac = new AbortController();
  const stop = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    let r;
    try {
      r = await fetchImpl(url, { redirect: 'follow', signal: ac.signal, headers: { 'User-Agent': USER_AGENT } });
    } catch (e) {
      throw new Error(e && e.name === 'AbortError' ? 'The feed took too long to answer.' : 'The feed could not be reached.');
    }
    if (!r.ok) throw new Error('The feed answered ' + r.status + (r.status === 404 ? ' (not found)' : '') + '.');
    const len = Number(r.headers && r.headers.get ? r.headers.get('content-length') : 0);
    if (len && len > MAX_BYTES) throw new Error('The feed is larger than 10 MB.');
    const text = await r.text();
    if (text.length > MAX_BYTES) throw new Error('The feed is larger than 10 MB.');
    return text;
  } finally {
    clearTimeout(stop);
  }
}

/* The store both sync()s expect: get, create (never overwrites), update,
   status. */
function storeFor(db, coll, statusPath) {
  return {
    get: async (id) => { const s = await db.collection(coll).doc(id).get(); return s.exists ? s.data() : null; },
    create: (id, data) => db.collection(coll).doc(id).create(data),
    update: (id, data) => db.collection(coll).doc(id).update(data),
    status: (data) => db.doc(statusPath).set(data)
  };
}

async function featureOn(db, name) {
  try {
    const f = await db.collection('churchSettings').doc('features').get();
    return !(f.exists && f.data()[name] === false);
  } catch (e) { return true; }
}

/* One feed: skip if the part is off or no address is set; on a failed
   fetch write the status only and change nothing else. */
async function readOne(db, { feature, url, coll, statusPath, sync, fetchImpl, now }) {
  if (!(await featureOn(db, feature))) return { skipped: 'switched off' };
  if (!url) return { skipped: 'no address' };
  let text;
  try {
    text = await fetchFeed(url, fetchImpl);
  } catch (e) {
    await db.doc(statusPath).set({ lastReadAt: now.toISOString(), ok: false, error: e.message || String(e) });
    return { error: e.message || String(e) };
  }
  return sync(storeFor(db, coll, statusPath), text, now);
}

/* -> { sermons: result, watch: result } */
export async function runFeeds(db, { fetchImpl = fetch, now = new Date() } = {}) {
  const feedDoc = await db.collection('sermonShow').doc('feed').get();
  const sermonsUrl = feedDoc.exists ? String(feedDoc.data().url || '').trim() : '';
  const settings = await db.collection('watchShow').doc('settings').get();
  const channelId = settings.exists ? String(settings.data().channelId || '').trim() : '';

  const sermons = await readOne(db, { feature: 'sermons', url: sermonsUrl, coll: 'sermons',
    statusPath: 'sermonShow/feedStatus', sync: SermonsFeed.sync, fetchImpl, now });
  const watch = await readOne(db, { feature: 'watch', url: channelId ? WatchCore.feedUrl(channelId) : '', coll: 'videos',
    statusPath: 'watchShow/feedStatus', sync: WatchCore.sync, fetchImpl, now });
  return { sermons, watch };
}
